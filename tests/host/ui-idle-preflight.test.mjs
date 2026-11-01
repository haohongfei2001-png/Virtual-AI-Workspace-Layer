/** Actual service/repository integration with MOCK_IDB and explicit browser/provider doubles. */
import test from 'node:test';import assert from 'node:assert/strict';import {MockIDBFactory} from '../b23/mock-idb.mjs';import {ScopeRepository} from '../../src/b1/scope-repository.mjs';import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
const url='https://chatgpt.com/',C='33333333-3333-4333-8333-333333333333';
export async function fixture(t,createService=createHostBindingService){let time=1000,id=0,principal='A',providerReads=0,providerFailure=false,providerWait=null;const timers=new Map();let timerId=0;const frames=new Map(),base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'notify-service'});t.after(()=>base.close());const profile={id:'offline',revision:1,urlPolicy:createURLPolicy()};const service=createService({extensionId:'ext',uiURL:'chrome-extension://ext/ui.html',getFrame:async({tabId,frameId})=>frames.get(`${tabId}:${frameId}`),allowedURL:u=>new URL(u).origin==='https://chatgpt.com',repository:base,provider:{read:async()=>{providerReads++;if(providerWait)await providerWait;if(providerFailure)throw Error('request-timeout');return {principalId:principal,expiresAt:new Date(100000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'test',transport:'worker-fixed-fetch'};}},profile:{id:'test',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>time,makeId:()=>`id_${++id}`,schedule:(fn,ms)=>{const key=++timerId;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key)});t.after(()=>service.stop());
const bind=async(tabId,actualURL=url)=>{const sender={id:'ext',tab:{id:tabId,incognito:false},frameId:0,documentId:'doc'+tabId,documentLifecycle:'active',url};frames.set(`${tabId}:0`,{documentId:sender.documentId,url:actualURL,documentLifecycle:'active',parentFrameId:-1});const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender),binding=hello.binding;assert(hello.ok);const packet={documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch};assert.equal((await service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,...packet},sender)).state,'verified');return {sender,binding,packet};};
const parent=await bind(1),ui={...parent.sender,frameId:2,documentId:'ui',url:'chrome-extension://ext/ui.html'};frames.set('1:2',{documentId:'ui',url:ui.url,documentLifecycle:'active',parentFrameId:0});const listeners=new Set(),port={name:'vaiwl-ui',sender:ui,messages:[],onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){for(const f of listeners)f();},postMessage:m=>port.messages.push(m)};assert(service.connectPort(port));assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...parent.packet,mountId:'mount',regionEpoch:1},parent.sender)).ok,true);const joined=service.handle({v:1,type:'HOST_UI_JOIN',nonce:'nonce',role:'workspace'},ui),confirmed=service.handle({v:1,type:'HOST_UI_CONFIRM',...parent.packet,mountId:'mount',regionEpoch:1,nonce:'nonce',role:'workspace'},parent.sender);const [a,b]=await Promise.all([joined,confirmed]);assert(a.ok&&b.ok);const evidence={profileId:'offline',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
const proposal=(p=parent,seq=1)=>({protocol:'vaiwl-host-observation/1',...p.packet,localSeq:seq,profileId:'offline',profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[{renderKey:'conversation:'+C,entity:'conversation',nativeTitle:'Native',titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:C,navigationURL:'https://chatgpt.com/c/'+C,liveHandle:null},evidence}],membershipClaims:[{conversationId:C,asserted:'UNKNOWN',projectId:null,reason:'missing',evidence}],coverageClaims:[],detachedHandles:[]}});return {flushHints(){time+=100;for(const [key,entry]of [...timers])if(entry.at<=time){timers.delete(key);entry.fn();}},holdProvider:promise=>{providerWait=promise;},get providerReads(){return providerReads;},failProvider:()=>{providerFailure=true;},frames,service,parent,ui,grant:a.grant,port,bind,proposal,setPrincipal:p=>principal=p,advance:ms=>time+=ms};}

// L integration only: actual service/UI owner with explicit browser/provider
// doubles and MockIDB. Preflight is not an authorization lease for later release.
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const packet=(f,type='HOST_UI_IDLE_CHECK')=>({v:1,type,...f.parent.packet,mountId:'mount'});
const current=async f=>assert.equal(await f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},context=>context.isCurrent()),true);
test('idle preflight is read-only and leaves the original UI grant and port usable',async t=>{
 const f=await fixture(t);let disconnects=0;const disconnect=f.port.disconnect;f.port.disconnect=()=>{disconnects++;disconnect();};
 for(let i=0;i<2;i++){assert.equal((await f.service.handle(packet(f),f.parent.sender)).ok,true);await current(f);assert.equal(disconnects,0);}
 assert.equal(f.service.isIdle(),true);assert.equal((await f.service.handle(packet(f,'HOST_UI_IDLE_RELEASE'),f.parent.sender)).ok,true);assert.equal(disconnects,1);
 await assert.rejects(f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},()=>assert.fail('released grant')));
});
test('successful preflight does not bypass work that begins before actual idle release',async t=>{
 const f=await fixture(t);assert.equal((await f.service.handle(packet(f),f.parent.sender)).ok,true);
 let settle,entered=false;const held=f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},async context=>{entered=true;await new Promise(resolve=>settle=resolve);return context.isCurrent();});
 await drain();assert(entered);
 try{assert.equal((await f.service.handle(packet(f),f.parent.sender)).ok,false);assert.equal((await f.service.handle(packet(f,'HOST_UI_IDLE_RELEASE'),f.parent.sender)).ok,false);}finally{settle();}
 assert.equal(await held,true);await current(f);
 assert.equal((await f.service.handle(packet(f),f.parent.sender)).ok,true);await current(f);
 assert.equal((await f.service.handle(packet(f,'HOST_UI_IDLE_RELEASE'),f.parent.sender)).ok,true);
});
test('forged idle checks never revoke or disturb the valid mounted UI',async t=>{
 const f=await fixture(t),message=packet(f);
 for(const [m,sender]of [[message,f.ui],[message,{...f.parent.sender,id:'foreign'}],[message,{...f.parent.sender,documentId:'other'}],[{...message,producerToken:'foreign'},f.parent.sender],[{...message,mountId:'other'},f.parent.sender],[{...message,idle:true},f.parent.sender]]){
  assert.equal((await f.service.handle(m,sender)).ok,false);await current(f);
 }
 assert.equal((await f.service.handle(message,f.parent.sender)).ok,true);await current(f);
});
for(const outcome of ['resolve','reject'])test('real binding refuses idle release until snippet selection cleanup '+outcome,async t=>{
 let settle;const held=new Promise((resolve,reject)=>settle=outcome==='resolve'?()=>resolve({ok:true}):()=>reject(Error('cleanup-failed'))),anchor={refId:C,messageId:'fixture_message',branchId:'fixture_branch',text:'explicit synthetic selection',bodyHash:'d'.repeat(64)};
 const f=await fixture(t,args=>createHostBindingService({...args,workspaceRepository:new WorkspaceRepository({baseRepository:args.repository}),freeEvidenceRepository:new FreeEvidenceRepository({baseRepository:args.repository}),selectionBridge:async({phase})=>phase==='release'?held:phase==='capture'?{selectionId:'fixture_selection',anchor}:{ok:true,anchor}}));
 t.after(()=>settle());assert.equal((await f.service.handle(f.proposal(),f.parent.sender)).state,'accepted');
 const view=async()=>{let value;for(let i=0;i<30;i++){value=await f.service.handle({v:1,type:'HOST_UI_VIEW',grantId:f.grant.id,mountId:'mount',query:{}},f.ui);if(value.state!=='preparing')break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(value.state,'ready',JSON.stringify(value));return value.page;};
 const page=await view();f.flushHints();await drain();assert.equal(f.service.isIdle(),true);
 const saved=await f.service.handle({v:1,type:'HOST_UI_SNIPPET',grantId:f.grant.id,mountId:'mount',operationId:'save_before_idle',expectedRevision:page.workspaceRevision,action:'save',id:C},f.ui);assert.equal(saved.ok,true,JSON.stringify(saved));
 await view();f.flushHints();await drain();assert.equal(f.service.isIdle(),false);
 for(const type of ['HOST_UI_IDLE_CHECK','HOST_UI_IDLE_RELEASE'])assert.equal((await f.service.handle(packet(f,type),f.parent.sender)).ok,false);
 await current(f);settle();await drain();f.flushHints();await drain();assert.equal(f.service.isIdle(),true);
 assert.equal((await f.service.handle(packet(f),f.parent.sender)).ok,true);assert.equal((await f.service.handle(packet(f,'HOST_UI_IDLE_RELEASE'),f.parent.sender)).ok,true);
});
