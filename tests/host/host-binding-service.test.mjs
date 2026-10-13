/** Actual service/repository integration with MOCK_IDB and explicit browser/provider doubles. */
import test from 'node:test';import assert from 'node:assert/strict';import {MockIDBFactory} from '../b23/mock-idb.mjs';import {ScopeRepository} from '../../src/b1/scope-repository.mjs';import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';import {createURLPolicy} from '../../src/host/url-policy.mjs';
const url='https://chatgpt.com/',C='33333333-3333-4333-8333-333333333333';
async function fixture(t){let time=1000,id=0,principal='A',providerReads=0,providerFailure=false;const frames=new Map(),base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'notify-service'});t.after(()=>base.close());const profile={id:'offline',revision:1,urlPolicy:createURLPolicy()};const service=createHostBindingService({extensionId:'ext',uiURL:'chrome-extension://ext/ui.html',getFrame:async({tabId,frameId})=>frames.get(`${tabId}:${frameId}`),allowedURL:u=>new URL(u).origin==='https://chatgpt.com',repository:base,provider:{read:async()=>{providerReads++;if(providerFailure)throw Error('request-timeout');return {principalId:principal,expiresAt:new Date(100000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'test',transport:'worker-fixed-fetch'};}},profile:{id:'test',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>time,makeId:()=>`id_${++id}`});
const bind=async(tabId,actualURL=url)=>{const sender={id:'ext',tab:{id:tabId,incognito:false},frameId:0,documentId:'doc'+tabId,documentLifecycle:'active',url};frames.set(`${tabId}:0`,{documentId:sender.documentId,url:actualURL,documentLifecycle:'active',parentFrameId:-1});const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender),binding=hello.binding;assert(hello.ok);const packet={documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch};assert.equal((await service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,...packet},sender)).state,'verified');return {sender,binding,packet};};
const parent=await bind(1),ui={...parent.sender,frameId:2,documentId:'ui',url:'chrome-extension://ext/ui.html'};frames.set('1:2',{documentId:'ui',url:ui.url,documentLifecycle:'active',parentFrameId:0});const listeners=new Set(),port={name:'vaiwl-ui',sender:ui,messages:[],onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){for(const f of listeners)f();},postMessage:m=>port.messages.push(m)};assert(service.connectPort(port));assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...parent.packet,mountId:'mount',regionEpoch:1},parent.sender)).ok,true);const joined=service.handle({v:1,type:'HOST_UI_JOIN',nonce:'nonce',role:'workspace'},ui),confirmed=service.handle({v:1,type:'HOST_UI_CONFIRM',...parent.packet,mountId:'mount',regionEpoch:1,nonce:'nonce',role:'workspace'},parent.sender);const [a,b]=await Promise.all([joined,confirmed]);assert(a.ok&&b.ok);const evidence={profileId:'offline',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
const proposal=(p=parent,seq=1)=>({protocol:'vaiwl-host-observation/1',...p.packet,localSeq:seq,profileId:'offline',profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[{renderKey:'conversation:'+C,entity:'conversation',nativeTitle:'Native',titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:C,navigationURL:'https://chatgpt.com/c/'+C,liveHandle:null},evidence}],membershipClaims:[{conversationId:C,asserted:'UNKNOWN',projectId:null,reason:'missing',evidence}],coverageClaims:[],detachedHandles:[]}});return {get providerReads(){return providerReads;},failProvider:()=>{providerFailure=true;},frames,service,parent,ui,grant:a.grant,port,bind,proposal,setPrincipal:p=>principal=p,advance:ms=>time+=ms};}
test('MOCK service only accepted observations notify; duplicate and rejected carry no new data hint',async t=>{const f=await fixture(t),p=f.proposal();assert.equal((await f.service.handle(p,f.parent.sender)).state,'accepted');assert.deepEqual(f.port.messages,[{type:'VAIWL_UI_DATA_CHANGED'}]);assert.equal((await f.service.handle(p,f.parent.sender)).state,'duplicate');assert.equal((await f.service.handle({...p,verified:true},f.parent.sender)).state,'rejected');assert.equal(f.port.messages.length,1);});
test('MOCK accepted other-scope observation never notifies prior-scope frame',async t=>{const f=await fixture(t);f.setPrincipal('B');const other=await f.bind(2);assert.equal((await f.service.handle(f.proposal(other),other.sender)).state,'accepted');assert.deepEqual(f.port.messages,[]);});
test('MOCK expired document binding suppresses dirty hint even if UI grant was renewed',async t=>{const f=await fixture(t);f.advance(10000);assert.equal((await f.service.handle({v:1,type:'HOST_UI_RENEW',grantId:f.grant.id,mountId:'mount'},f.ui)).ok,true);f.advance(10000);const frame={tabId:1,frameId:0,documentId:'doc1',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false},scope=f.service.authority.scopeFor(frame);assert(scope);assert.equal(f.service.ui.notifyScope(scope.key),0);assert.deepEqual(f.port.messages,[]);assert.equal((await f.service.handle(f.proposal(),f.parent.sender)).state,'rejected');});
test('MOCK accepted SPA observation uses current verified frame scope rather than stale sender URL',async t=>{const f=await fixture(t),other=await f.bind(2,'https://chatgpt.com/c/'+C);assert.equal((await f.service.handle(f.proposal(other),other.sender)).state,'accepted');assert.deepEqual(f.port.messages,[{type:'VAIWL_UI_DATA_CHANGED'}]);});

async function spaPair(t){
 const f=await fixture(t),parent=await f.bind(2,'https://chatgpt.com/c/'+C),mountId='spa_mount';
 assert.equal(parent.sender.url,url,'Chrome sender retains original document URL');
 assert.equal((await f.service.handle({v:1,type:'HOST_UI_MOUNT',...parent.packet,mountId,regionEpoch:1},parent.sender)).ok,true);
 const children=[];
 for(const [i,role] of ['workspace','sidebar'].entries()){
  const child={...parent.sender,frameId:i+2,documentId:'spa_'+role,url:'chrome-extension://ext/ui.html'};
  f.frames.set('2:'+child.frameId,{documentId:child.documentId,url:child.url,documentLifecycle:'active',parentFrameId:0});
  const nonce='spa_nonce_'+role;
  const [joined,confirmed]=await Promise.all([
   f.service.handle({v:1,type:'HOST_UI_JOIN',nonce,role},child),
   f.service.handle({v:1,type:'HOST_UI_CONFIRM',...parent.packet,mountId,regionEpoch:1,nonce,role},parent.sender)
  ]);
  assert.equal(joined.ok,true,role+' JOIN');assert.equal(confirmed.ok,true,role+' CONFIRM');assert.deepEqual(joined.grant,confirmed.grant);
  children.push({sender:child,grant:joined.grant});
 }
 return {...f,spaParent:parent,mountId,children};
}
test('MOCK SPA actual route authorizes both UI roles and status despite original sender URL',async t=>{
 const f=await spaPair(t),reply=await f.service.handle({v:1,type:'HOST_UI_STATUS',...f.spaParent.packet,mountId:f.mountId},f.spaParent.sender);
 assert.equal(reply.ok,true);assert.deepEqual(reply.grants.map(g=>g.role).sort(),['sidebar','workspace']);
 for(const child of f.children){const proof=await f.service.ui.withScope({sender:child.sender,grantId:child.grant.id,mountId:f.mountId},context=>({url:context.parentFrame.actualURL,scope:context.scope.key}));assert.equal(proof.url,'https://chatgpt.com/c/'+C);assert.equal(typeof proof.scope,'string');}
 assert.equal((await f.service.handle({v:1,type:'HOST_UI_RELEASE',...f.spaParent.packet,mountId:f.mountId},f.spaParent.sender)).ok,true);
});
for(const change of ['document','url'])test('MOCK SPA grants reject subsequent actual '+change+' replacement',async t=>{
 const f=await spaPair(t),current=f.frames.get('2:0');
 f.frames.set('2:0',{...current,...(change==='document'?{documentId:'replacement'}:{url:'https://chatgpt.com/c/44444444-4444-4444-8444-444444444444'})});
 assert.equal((await f.service.handle({v:1,type:'HOST_UI_STATUS',...f.spaParent.packet,mountId:f.mountId},f.spaParent.sender)).ok,false);
 for(const child of f.children)await assert.rejects(f.service.ui.withScope({sender:child.sender,grantId:child.grant.id,mountId:f.mountId},()=>assert.fail('stale UI work')));
 assert.equal((await f.service.handle({v:1,type:'HOST_UI_MOUNT',...f.spaParent.packet,mountId:'late_mount',regionEpoch:2},f.spaParent.sender)).ok,false);
});

async function refreshParent(f,seq){
 const renewed=await f.service.handle({v:1,type:'HOST_DOCUMENT_RENEW',clientId:'client',seq:seq++, ...f.parent.packet},f.parent.sender);assert.equal(renewed.ok,true,JSON.stringify(renewed));
 const refreshed=await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:seq++, ...f.parent.packet},f.parent.sender);
 const status=await f.service.handle({v:1,type:'HOST_UI_RENEW',grantId:f.grant.id,mountId:'mount'},f.ui);return {refreshed,status,seq};
}
for(const failure of ['identity-change','provider-timeout'])test('MOCK near-deadline revalidation '+failure+' rejects existing UI authorization',async t=>{
 const f=await fixture(t);let seq=3,elapsed=0;
 for(const at of [10000,20000,30000,40000,49000]){f.advance(at-elapsed);elapsed=at;const result=await refreshParent(f,seq);seq=result.seq;assert.equal(result.refreshed.state,'verified');assert.equal(result.status.ok,true);}
 assert.equal(f.providerReads,1);
 if(failure==='identity-change')f.setPrincipal('new-principal');else f.failProvider();f.advance(6000);
 const result=await refreshParent(f,seq);assert.notEqual(result.refreshed.state,'verified');assert.equal(result.status.ok,false);assert.equal(f.providerReads,2);
 await assert.rejects(f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},()=>assert.fail('old UI must not read after revalidation failure')));
});
test('MOCK HOST_REFRESH rejects interleaved A/B/A actual-frame snapshot before provider authentication',async t=>{
 const f=await fixture(t),original=f.frames.get.bind(f.frames),A=original('1:0'),B={...A,documentId:'interleaved_B',url:'https://chatgpt.com/c/'+C};let reads=0;
 // First verify sees bound A, service snapshot sees B, next verify sees A again.
 f.frames.get=key=>key==='1:0'?(++reads===2?B:A):original(key);
 const before=f.providerReads,result=await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:3,...f.parent.packet},f.parent.sender);
 assert.equal(result.ok,false,JSON.stringify(result));assert.equal(f.providerReads,before,'mismatched intermediate document must never reach provider');
 const resolution=f.service.authority.peek({tabId:1,frameId:0,documentId:B.documentId,parentDocumentId:null,actualURL:B.url,documentLifecycle:'active',incognito:false});assert.notEqual(resolution.state,'verified');
});
const flushTasks=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
async function refreshDeadlineFixture(t){
 let elapsed=0,id=0,reads=0,providerReads=0,holdAt=0,release=null;const timers=new Map();
 const actual={documentId:'deadline_doc',url,documentLifecycle:'active',parentFrameId:-1},sender={id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:actual.documentId,documentLifecycle:'active',url};
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'refresh-deadline'});t.after(()=>base.close());
 const service=createHostBindingService({extensionId:'ext',repository:base,allowedURL:u=>u===url,getFrame:async()=>{reads++;if(reads===holdAt)return new Promise(r=>release=r);return {...actual};},provider:{read:async()=>{providerReads++;return {principalId:'deadline-principal',expiresAt:new Date(100000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'deadline-test',transport:'worker-fixed-fetch'};}},profile:{id:'deadline-test',singlePersonalDefault:true},now:()=>1000,elapsedNow:()=>elapsed,makeId:()=> 'deadline_'+(++id),schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:elapsed+ms});return key;},cancel:key=>timers.delete(key)});
 const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender);assert.equal(hello.ok,true);reads=0;const {documentToken,producerToken,routeEpoch}=hello.binding;
 const frame={tabId:1,frameId:0,documentId:actual.documentId,parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false};
 return {service,frame,get reads(){return reads;},get providerReads(){return providerReads;},hold:n=>{holdAt=n;},release:()=>release?.({...actual}),request:seq=>service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq,documentToken,producerToken,routeEpoch},sender),async advance(ms){elapsed+=ms;for(const [key,timer]of [...timers])if(timer.at<=elapsed&&timers.has(key)){timers.delete(key);timer.fn();}await flushTasks();}};
}
test('MOCK whole HOST_REFRESH deadline includes hanging first frame verification and prevents late provider call',async t=>{
 const f=await refreshDeadlineFixture(t);f.hold(1);const pending=f.request(2);let settled=false;pending.then(()=>settled=true);await flushTasks();assert.equal(f.reads,1);await f.advance(6000);assert.equal(settled,true,'entire RPC must settle despite a hung getFrame');const result=await pending;assert.equal(result.ok,false);assert.equal(f.providerReads,0);f.release();await flushTasks();assert.equal(f.providerReads,0);assert.notEqual(f.service.authority.peek(f.frame).state,'verified');
});
test('MOCK whole HOST_REFRESH deadline revokes its unpublished grant when final frame verification hangs',async t=>{
 const f=await refreshDeadlineFixture(t);f.hold(4);const pending=f.request(2);let settled=false;pending.then(()=>settled=true);await flushTasks();assert.equal(f.reads,4);assert.equal(f.providerReads,1);assert.equal(f.service.authority.peek(f.frame).state,'verified');await f.advance(6000);assert.equal(settled,true);assert.equal((await pending).ok,false);assert.notEqual(f.service.authority.peek(f.frame).state,'verified');f.release();await flushTasks();assert.notEqual(f.service.authority.peek(f.frame).state,'verified');assert.equal(f.providerReads,1);
});
test('MOCK timed-out old refresh cannot revoke replacement grant or revive itself on late frame reply',async t=>{
 const f=await refreshDeadlineFixture(t);f.hold(4);const old=f.request(2);await flushTasks();assert.equal(f.reads,4);const previous=f.service.authority.peek(f.frame).grant;
 f.service.authority.invalidate(f.frame.documentId);const next=await f.request(3);assert.equal(next.state,'verified',JSON.stringify(next));const replacement=f.service.authority.peek(f.frame).grant;assert.notEqual(replacement.id,previous.id);await f.advance(6000);assert.equal((await old).ok,false);assert.equal(f.service.authority.peek(f.frame).grant.id,replacement.id);f.release();await flushTasks();assert.equal(f.service.authority.peek(f.frame).grant.id,replacement.id);assert.equal(f.providerReads,2);
});
