/** Actual service/repository integration with MOCK_IDB and explicit browser/provider doubles. */
import test from 'node:test';import assert from 'node:assert/strict';import {MockIDBFactory} from '../b23/mock-idb.mjs';import {ScopeRepository} from '../../src/b1/scope-repository.mjs';import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';import {createURLPolicy} from '../../src/host/url-policy.mjs';
const url='https://chatgpt.com/',C='33333333-3333-4333-8333-333333333333';
async function fixture(t){let time=1000,id=0,principal='A',providerReads=0,providerFailure=false,providerWait=null;const timers=new Map();let timerId=0;const frames=new Map(),base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'notify-service'});t.after(()=>base.close());const profile={id:'offline',revision:1,urlPolicy:createURLPolicy()};const service=createHostBindingService({extensionId:'ext',uiURL:'chrome-extension://ext/ui.html',getFrame:async({tabId,frameId})=>frames.get(`${tabId}:${frameId}`),allowedURL:u=>new URL(u).origin==='https://chatgpt.com',repository:base,provider:{read:async()=>{providerReads++;if(providerWait)await providerWait;if(providerFailure)throw Error('request-timeout');return {principalId:principal,expiresAt:new Date(100000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'test',transport:'worker-fixed-fetch'};}},profile:{id:'test',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>time,makeId:()=>`id_${++id}`,schedule:(fn,ms)=>{const key=++timerId;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key)});t.after(()=>service.stop());
const bind=async(tabId,actualURL=url)=>{const sender={id:'ext',tab:{id:tabId,incognito:false},frameId:0,documentId:'doc'+tabId,documentLifecycle:'active',url};frames.set(`${tabId}:0`,{documentId:sender.documentId,url:actualURL,documentLifecycle:'active',parentFrameId:-1});const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender),binding=hello.binding;assert(hello.ok);const packet={documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch};assert.equal((await service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,...packet},sender)).state,'verified');return {sender,binding,packet};};
const parent=await bind(1),ui={...parent.sender,frameId:2,documentId:'ui',url:'chrome-extension://ext/ui.html'};frames.set('1:2',{documentId:'ui',url:ui.url,documentLifecycle:'active',parentFrameId:0});const listeners=new Set(),port={name:'vaiwl-ui',sender:ui,messages:[],onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){for(const f of listeners)f();},postMessage:m=>port.messages.push(m)};assert(service.connectPort(port));assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...parent.packet,mountId:'mount',regionEpoch:1},parent.sender)).ok,true);const joined=service.handle({v:1,type:'HOST_UI_JOIN',nonce:'nonce',role:'workspace'},ui),confirmed=service.handle({v:1,type:'HOST_UI_CONFIRM',...parent.packet,mountId:'mount',regionEpoch:1,nonce:'nonce',role:'workspace'},parent.sender);const [a,b]=await Promise.all([joined,confirmed]);assert(a.ok&&b.ok);const evidence={profileId:'offline',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
const proposal=(p=parent,seq=1)=>({protocol:'vaiwl-host-observation/1',...p.packet,localSeq:seq,profileId:'offline',profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[{renderKey:'conversation:'+C,entity:'conversation',nativeTitle:'Native',titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:C,navigationURL:'https://chatgpt.com/c/'+C,liveHandle:null},evidence}],membershipClaims:[{conversationId:C,asserted:'UNKNOWN',projectId:null,reason:'missing',evidence}],coverageClaims:[],detachedHandles:[]}});return {flushHints(){time+=100;for(const [key,entry]of [...timers])if(entry.at<=time){timers.delete(key);entry.fn();}},holdProvider:promise=>{providerWait=promise;},get providerReads(){return providerReads;},failProvider:()=>{providerFailure=true;},frames,service,parent,ui,grant:a.grant,port,bind,proposal,setPrincipal:p=>principal=p,advance:ms=>time+=ms};}
test('MOCK service only accepted observations notify; duplicate and rejected carry no new data hint',async t=>{const f=await fixture(t),p=f.proposal();assert.equal((await f.service.handle(p,f.parent.sender)).state,'accepted');f.flushHints();assert.deepEqual(f.port.messages,[{type:'VAIWL_UI_DATA_CHANGED'}]);assert.equal((await f.service.handle(p,f.parent.sender)).state,'duplicate');assert.equal((await f.service.handle({...p,verified:true},f.parent.sender)).state,'rejected');assert.equal(f.port.messages.length,1);});
test('MOCK accepted other-scope observation never notifies prior-scope frame',async t=>{const f=await fixture(t);f.setPrincipal('B');const other=await f.bind(2);assert.equal((await f.service.handle(f.proposal(other),other.sender)).state,'accepted');f.flushHints();assert.deepEqual(f.port.messages,[]);});
test('MOCK expired document binding suppresses dirty hint even if UI grant was renewed',async t=>{const f=await fixture(t);f.advance(10000);assert.equal((await f.service.handle({v:1,type:'HOST_UI_RENEW',grantId:f.grant.id,mountId:'mount'},f.ui)).ok,true);f.advance(10000);const frame={tabId:1,frameId:0,documentId:'doc1',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false},scope=f.service.authority.scopeFor(frame);assert(scope);assert.equal(f.service.ui.notifyScope(scope.key),0);assert.deepEqual(f.port.messages,[]);assert.equal((await f.service.handle(f.proposal(),f.parent.sender)).state,'rejected');});
test('MOCK accepted SPA observation uses current verified frame scope rather than stale sender URL',async t=>{const f=await fixture(t),other=await f.bind(2,'https://chatgpt.com/c/'+C);assert.equal((await f.service.handle(f.proposal(other),other.sender)).state,'accepted');f.flushHints();assert.deepEqual(f.port.messages,[{type:'VAIWL_UI_DATA_CHANGED'}]);});

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
 return {service,frame,get reads(){return reads;},get providerReads(){return providerReads;},hold:n=>{holdAt=n;},release:()=>release?.({...actual}),request:(seq,type='HOST_REFRESH')=>service.handle({v:1,type,clientId:'client',seq,documentToken,producerToken,routeEpoch},sender),async advance(ms){elapsed+=ms;for(const [key,timer]of [...timers])if(timer.at<=elapsed&&timers.has(key)){timers.delete(key);timer.fn();}await flushTasks();}};
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

const parentAuthorityFrame={tabId:1,frameId:0,documentId:'doc1',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false};
async function newProducerSameDocument(f,seq=3){
 const hello=await f.service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq},f.parent.sender);
 assert.equal(hello.ok,true);assert.equal(hello.binding.browserDocumentId,f.parent.binding.browserDocumentId);
 assert.notEqual(hello.binding.producerToken,f.parent.packet.producerToken);
 const {documentToken,producerToken,routeEpoch}=hello.binding;
 return {documentToken,producerToken,routeEpoch};
}
test('MOCK short same-document restore authenticates changed principal and revokes old UI',async t=>{
 const f=await fixture(t),old=f.service.authority.peek(parentAuthorityFrame).grant,scope=f.service.authority.scopeFor(parentAuthorityFrame).key;
 assert.equal(f.providerReads,1);f.advance(1);f.setPrincipal('restored-account-B');
 const packet=await newProducerSameDocument(f);
 const refreshed=await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:4,...packet},f.parent.sender);
 assert.equal(refreshed.state,'verified',JSON.stringify(refreshed));assert.equal(f.providerReads,2,'new producer must not reuse the far-from-expiry grant');
 assert.notEqual(f.service.authority.peek(parentAuthorityFrame).grant.id,old.id);
 assert.notEqual(f.service.authority.scopeFor(parentAuthorityFrame).key,scope);
 await assert.rejects(f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},()=>assert.fail('old account UI must be revoked')));
 assert.equal((await f.service.handle(f.proposal(),f.parent.sender)).state,'rejected');
 assert.equal((await f.service.handle({v:1,type:'HOST_UI_RENEW',grantId:f.grant.id,mountId:'mount'},f.ui)).ok,false);
});
test('MOCK failed new-producer authentication never falls back to old same-document scope',async t=>{
 const f=await fixture(t);assert.equal(f.service.authority.peek(parentAuthorityFrame).state,'verified');f.advance(1);f.failProvider();
 const packet=await newProducerSameDocument(f);
 const result=await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:4,...packet},f.parent.sender);
 assert.notEqual(result.state,'verified');assert.equal(f.providerReads,2);
 assert.notEqual(f.service.authority.peek(parentAuthorityFrame).state,'verified');assert.equal(f.service.authority.scopeFor(parentAuthorityFrame),null);
 await assert.rejects(f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},()=>assert.fail('old UI cannot survive failed fresh identity proof')));
});
test('MOCK ordinary same-producer refresh keeps grant and performs no extra provider read',async t=>{
 const f=await fixture(t),old=f.service.authority.peek(parentAuthorityFrame).grant;f.advance(1);
 const result=await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:3,...f.parent.packet},f.parent.sender);
 assert.equal(result.state,'verified');assert.equal(f.providerReads,1);assert.equal(f.service.authority.peek(parentAuthorityFrame).grant.id,old.id);
 assert.equal(await f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},context=>context.isCurrent()),true);
});
test('MOCK concurrent new-producer refresh cannot bypass unfinished fresh identity proof',async t=>{
 const f=await fixture(t),oldScope=f.service.authority.scopeFor(parentAuthorityFrame).key;f.setPrincipal('concurrent-account-B');
 const packet=await newProducerSameDocument(f),get=f.frames.get.bind(f.frames);let reads=0,release;
 f.frames.get=key=>key==='1:0'&&++reads===2?new Promise(resolve=>{release=()=>resolve(get(key));}):get(key);
 const first=f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:4,...packet},f.parent.sender);
 await flushTasks();assert.equal(typeof release,'function');
 try{
  const second=await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:5,...packet},f.parent.sender);
  if(second.state==='verified'){
   assert.equal(f.providerReads,2,'a seen sequence is not a completed new-producer identity proof');
   assert.notEqual(f.service.authority.scopeFor(parentAuthorityFrame).key,oldScope);
  }
 }finally{release();await first;}
});

test('MOCK concurrent same-producer fresh refreshes share one pending provider read',async t=>{
 const f=await fixture(t);let release;f.holdProvider(new Promise(resolve=>{release=resolve;}));f.setPrincipal('single-flight-B');
 const packet=await newProducerSameDocument(f);
 const first=f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:4,...packet},f.parent.sender);
 await flushTasks();assert.equal(f.providerReads,2);
 const rest=[5,6,7].map(seq=>f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq,...packet},f.parent.sender));
 await flushTasks();assert.equal(f.providerReads,2,'all requests join the first fresh authentication');
 release();const replies=await Promise.all([first,...rest]);assert(replies.every(r=>r.state==='verified'),JSON.stringify(replies));assert.equal(f.providerReads,2);
 const next=await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:8,...packet},f.parent.sender);
 assert.equal(next.state,'verified');assert.equal(f.providerReads,2,'authenticated producer now uses normal revalidation');
});

const focusPacket=(f,seq=3)=>({v:1,type:'HOST_FOCUS',clientId:'client',seq,...f.parent.packet});
test('MOCK foreground forces fresh identity while retaining same scope and paired UI',async t=>{
 const f=await fixture(t),old=f.service.authority.peek(parentAuthorityFrame).grant;
 const result=await f.service.handle(focusPacket(f),f.parent.sender);
 assert.equal(result.state,'verified');assert.equal(f.providerReads,2);
 const next=f.service.authority.peek(parentAuthorityFrame).grant;assert.equal(next.id,old.id);assert.equal(next.scopeEpoch,old.scopeEpoch);
 assert.equal(await f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},c=>c.isCurrent()),true);
 assert.equal((await f.service.handle({...focusPacket(f,4),type:'HOST_REFRESH'},f.parent.sender)).state,'verified');assert.equal(f.providerReads,2);
});
for(const failure of ['changed-principal','provider-failure'])test('MOCK foreground '+failure+' revokes old UI and never grants replacement',async t=>{
 const f=await fixture(t);if(failure==='changed-principal')f.setPrincipal('foreground-B');else f.failProvider();
 const result=await f.service.handle(focusPacket(f),f.parent.sender);assert.notEqual(result.state,'verified');assert.equal(f.providerReads,2);
 assert.equal(f.service.authority.scopeFor(parentAuthorityFrame),null);
 await assert.rejects(f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},()=>assert.fail('old scope unavailable')));
 assert.equal((await f.service.handle(f.proposal(),f.parent.sender)).state,'rejected');
 assert.notEqual((await f.service.handle(focusPacket(f,4),f.parent.sender)).state,'verified');assert.equal(f.providerReads,2);
});
test('MOCK foreground rejects unknown producer, extra reason, replay and foreign frame without fetch',async t=>{
 const f=await fixture(t);
 assert.equal((await f.service.handle({...focusPacket(f),reason:'auth-change'},f.parent.sender)).ok,false);
 assert.equal((await f.service.handle(focusPacket(f,2),f.parent.sender)).ok,false);
 assert.equal((await f.service.handle(focusPacket(f),{...f.parent.sender,documentId:'other'})).ok,false);
 const packet=await newProducerSameDocument(f);
 assert.equal((await f.service.handle({...focusPacket(f,4),...packet},f.parent.sender)).ok,false);assert.equal(f.providerReads,1);
});
test('MOCK concurrent foreground requests share one forced provider read',async t=>{
 const f=await fixture(t);let release;f.holdProvider(new Promise(r=>release=r));
 const jobs=[3,4,5].map(seq=>f.service.handle(focusPacket(f,seq),f.parent.sender));await flushTasks();assert.equal(f.providerReads,2);
 release();assert((await Promise.all(jobs)).every(r=>r.state==='verified'));assert.equal(f.providerReads,2);
});

test('MOCK focus final frame timeout rejects late result and does not revive grant',async t=>{
 const f=await refreshDeadlineFixture(t);assert.equal((await f.request(2)).state,'verified');f.hold(f.reads+4);
 const pending=f.request(3,'HOST_FOCUS');await flushTasks();assert.equal(f.providerReads,2);await f.advance(6000);assert.equal((await pending).ok,false);assert.notEqual(f.service.authority.peek(f.frame).state,'verified');f.release();await flushTasks();assert.notEqual(f.service.authority.peek(f.frame).state,'verified');
});

test('MOCK failed foreground permanently denies same-producer ordinary renewal but allows new HELLO',async t=>{
 const f=await fixture(t);f.setPrincipal('B');assert.notEqual((await f.service.handle(focusPacket(f),f.parent.sender)).state,'verified');
 for(const type of ['HOST_REFRESH','HOST_FOCUS'])assert.notEqual((await f.service.handle({...focusPacket(f,4),type},f.parent.sender)).state,'verified');
 assert.equal(f.providerReads,2);assert.equal(f.service.authority.scopeFor(parentAuthorityFrame),null);
 const packet=await newProducerSameDocument(f);assert.equal((await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:5,...packet},f.parent.sender)).state,'verified');assert.equal(f.providerReads,3);
});
test('MOCK renewal waiting on actual frame cannot grant changed account after focus failure',async t=>{
 const f=await fixture(t),get=f.frames.get.bind(f.frames);let calls=0,release;
 f.frames.get=key=>key==='1:0'&&++calls===2?new Promise(r=>release=()=>r(get(key))):get(key);
 const renewal=f.service.handle({...focusPacket(f,3),type:'HOST_REFRESH'},f.parent.sender);await flushTasks();assert.equal(typeof release,'function');
 f.setPrincipal('B');assert.notEqual((await f.service.handle(focusPacket(f,4),f.parent.sender)).state,'verified');
 release();assert.notEqual((await renewal).state,'verified');assert.equal(f.providerReads,2);assert.equal(f.service.authority.scopeFor(parentAuthorityFrame),null);
});

test('MOCK failed producers are pruned after replacement HELLO without exhausting capacity',async t=>{
 const f=await fixture(t);for(let i=0;i<130;i++){const packet=await newProducerSameDocument(f,10+i);assert.equal((await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:4,...packet},f.parent.sender)).state,'verified');f.setPrincipal('rotated_'+i);assert.notEqual((await f.service.handle({v:1,type:'HOST_FOCUS',clientId:'client',seq:5,...packet},f.parent.sender)).state,'verified');}
 const packet=await newProducerSameDocument(f,200);assert.equal((await f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:4,...packet},f.parent.sender)).state,'verified');
});
test('MOCK denied producer survives ordinary sequence TTL while document remains renewed',async t=>{
 const f=await fixture(t);f.setPrincipal('B');assert.notEqual((await f.service.handle(focusPacket(f),f.parent.sender)).state,'verified');
 f.advance(15000);assert.equal((await f.service.handle({v:1,type:'HOST_DOCUMENT_RENEW',clientId:'client',seq:4,...f.parent.packet},f.parent.sender)).ok,true);
 f.advance(6000);await f.bind(2);const reads=f.providerReads;
 assert.notEqual((await f.service.handle({...focusPacket(f,5),type:'HOST_REFRESH'},f.parent.sender)).state,'verified');assert.equal(f.providerReads,reads);
});

const idleReleaseMessage=f=>({v:1,type:'HOST_UI_IDLE_RELEASE',...f.parent.packet,mountId:'mount'});
const assertPairedUiCurrent=async f=>assert.equal(await f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},context=>context.isCurrent()),true);
test('MOCK atomic idle release retires only an authenticated idle mount',async t=>{
 const f=await fixture(t);assert.equal(f.service.isIdle(),true);const reply=await f.service.handle(idleReleaseMessage(f),f.parent.sender);assert.equal(reply.ok,true,JSON.stringify(reply));
 await assert.rejects(f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},()=>assert.fail('idle-released grant cannot read')));
});
test('MOCK atomic idle release rejects forged sender binding and schema without revoking UI',async t=>{
 const f=await fixture(t),message=idleReleaseMessage(f);
 for(const [packet,sender]of [[message,{...f.parent.sender,id:'foreign'}],[message,f.ui],[message,{...f.parent.sender,documentId:'other'}],[message,{...f.parent.sender,tab:{id:9,incognito:false}}],[{...message,producerToken:'forged'},f.parent.sender],[{...message,mountId:'other'},f.parent.sender],[{...message,idle:true},f.parent.sender]]){
  assert.equal((await f.service.handle(packet,sender)).ok,false);await assertPairedUiCurrent(f);
 }
 assert.equal((await f.service.handle(message,f.parent.sender)).ok,true);
});
for(const otherTab of [false,true])for(const late of [false,true])test('MOCK atomic idle release waits for '+(otherTab?'other-tab':'same-tab')+' request'+(late?' raw work after deadline':'')+' then succeeds',async t=>{
 const f=await fixture(t),parent=otherTab?await f.bind(2):f.parent,mountId=otherTab?'other_mount':'mount';
 if(otherTab)assert.equal((await f.service.handle({v:1,type:'HOST_UI_MOUNT',...parent.packet,mountId,regionEpoch:1},parent.sender)).ok,true);
 const original=f.frames.get.bind(f.frames);let release,held=false;
 f.frames.get=key=>{if(key===parent.sender.tab.id+':0'&&!held){held=true;return new Promise(resolve=>release=()=>resolve(original(key)));}return original(key);};
 const pending=f.service.handle({v:1,type:'HOST_UI_STATUS',...parent.packet,mountId},parent.sender);t.after(async()=>{release?.();await pending;});await flushTasks();assert.equal(typeof release,'function');
 assert.equal((await f.service.handle(idleReleaseMessage(f),f.parent.sender)).ok,false,'parallel request must block the atomic release');await assertPairedUiCurrent(f);
 if(late){f.advance(5900);f.flushHints();await flushTasks();assert.equal((await pending).ok,false);assert.equal((await f.service.handle(idleReleaseMessage(f),f.parent.sender)).ok,false,'public deadline cannot erase underlying browser work');await assertPairedUiCurrent(f);}
 release();await pending;await flushTasks();assert.equal((await f.service.handle(idleReleaseMessage(f),f.parent.sender)).ok,true,'settled work permits a new atomic release request');
});
test('MOCK ordinary UI RELEASE still revokes immediately while other request is pending',async t=>{
 const f=await fixture(t),original=f.frames.get.bind(f.frames);let release,held=false;
 f.frames.get=key=>{if(key==='1:0'&&!held){held=true;return new Promise(resolve=>release=()=>resolve(original(key)));}return original(key);};
 const pending=f.service.handle({v:1,type:'HOST_UI_STATUS',...f.parent.packet,mountId:'mount'},f.parent.sender);t.after(async()=>{release?.();await pending;});await flushTasks();assert.equal(typeof release,'function');
 assert.equal((await f.service.handle({...idleReleaseMessage(f),type:'HOST_UI_RELEASE'},f.parent.sender)).ok,true);release();assert.equal((await pending).ok,false);
});
test('MOCK atomic idle release cannot mistake timed-out native repository work for a quiet owner',async t=>{
 const f=await fixture(t),native=f.service.nativeRepository,apply=native.apply.bind(native);let release,entered=false;
 const barrier=new Promise(resolve=>release=resolve);native.apply=async(...args)=>{entered=true;await barrier;return apply(...args);};
 const pending=f.service.handle(f.proposal(),f.parent.sender);t.after(async()=>{release();await pending;});
 for(let i=0;i<50&&!entered;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,true);
 assert.equal((await f.service.handle(idleReleaseMessage(f),f.parent.sender)).ok,false);await assertPairedUiCurrent(f);
 f.advance(5900);f.flushHints();await flushTasks();assert.equal((await pending).state,'rejected');assert.equal(f.service.observations.isIdle(),false);
 assert.equal((await f.service.handle(idleReleaseMessage(f),f.parent.sender)).ok,false,'owner guard must retain underlying work after request count falls');await assertPairedUiCurrent(f);
 release();for(let i=0;i<50&&!f.service.observations.isIdle();i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.service.observations.isIdle(),true);
 assert.equal((await f.service.handle(idleReleaseMessage(f),f.parent.sender)).ok,true);
});
test('MOCK authenticated other-tab binding cannot idle-release this mount',async t=>{
 const f=await fixture(t),other=await f.bind(2);assert.equal((await f.service.handle({v:1,type:'HOST_UI_IDLE_RELEASE',...other.packet,mountId:'mount'},other.sender)).ok,false);await assertPairedUiCurrent(f);assert.equal((await f.service.handle(idleReleaseMessage(f),f.parent.sender)).ok,true);
});
