import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {digest} from '../../src/data/hash.mjs';
import {lifecycleChange,lifecycleFingerprint,LIFECYCLE_TARGET,createLoopbackLifecycleService} from './fixtures/lifecycle-result-service.mjs';
const scopeKey=JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-team'])]);
const deleted='result_'+'a'.repeat(32),restored='result_'+'b'.repeat(32);
const context={scopeKey,target:{id:LIFECYCLE_TARGET,kind:'refs',operationId:'restore',state:'existence-confirmed'},expectedVersion:2,fenceId:lifecycleFingerprint(deleted),fenceVersion:2,profileId:'fixture',profileVersion:1};
const result={contextId:'account-host-team',principalId:'user-host-fixture',targetId:LIFECYCLE_TARGET,kind:'refs',operationId:'restore',resultId:restored,state:'restored',version:2,coversDeleteResultId:deleted};
test('server restoration must independently name the deletion it covers',()=>{
 assert(lifecycleChange(result,context));assert.equal(lifecycleChange({...result,coversDeleteResultId:'result_'+'c'.repeat(32)},context),null);
 assert.equal(lifecycleChange(result,{...context,fenceId:lifecycleFingerprint('result_'+'d'.repeat(32)),fenceVersion:4,expectedVersion:4}),null,'R1 first delivery cannot release D2');
});
for(const [name,value]of Object.entries({cancelled:{...result,state:'cancelled'},unknown:{ok:true},wrongTarget:{...result,targetId:'other'},wrongPrincipal:{...result,principalId:'other'},wrongContext:{...result,contextId:'other'},wrongOperation:{...result,operationId:'delete'},extra:{...result,confirmed:true}}))test('fixture result rejects '+name,()=>assert.equal(lifecycleChange(value,context),null));
test('fixture request cannot transfer into a renewed same-document authority generation',async()=>{
 const events=Object.fromEntries(['onBeforeRequest','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>[k,{listeners:[],addListener(fn){this.listeners.push(fn);},removeListener(fn){this.listeners=this.listeners.filter(f=>f!==fn);}}]));
 const priorChrome=globalThis.chrome,priorFetch=globalThis.fetch;let calls=0;globalThis.chrome={webRequest:events};globalThis.fetch=async()=>{calls++;throw Error('must-not-read');};
 const origin='http://127.0.0.1:12345',url=origin+'/',sender={id:'ext',tab:{id:1},frameId:0,documentId:'doc',documentLifecycle:'active',url},frame={tabId:1,frameId:0,documentId:'doc',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false};
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'lifecycle-fixture-'+crypto.randomUUID()});let n=0,service;
 try{
  service=createLoopbackLifecycleService({extensionId:'ext',identityOrigin:origin,repository:base,getFrame:async()=>({documentId:'doc',url,documentLifecycle:'active'}),allowedURL:u=>u===url,
   provider:{read:async()=>({principalId:'user-host-fixture',expiresAt:new Date(Date.now()+60000).toISOString(),contexts:[{id:'account-host-team',kind:'personal'}],providerProfile:'session',transport:'worker-fixed-fetch'})},profile:{id:'test',singlePersonalDefault:true},
   surfaceProfiles:new Map([['fixture',{id:'fixture',revision:1,urlPolicy:createURLPolicy({origin,profile:{conversationId:s=>s,projectId:({container})=>container}})}]]),makeId:()=>`id_${++n}`});
  const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender),binding=hello.binding;
  const refresh=seq=>service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq,documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch},sender);
  assert.equal((await refresh(2)).state,'verified');
  const request={requestId:'r1',method:'POST',frameId:0,tabId:1,documentId:'doc',documentLifecycle:'active',initiator:origin,url:origin+'/native/lifecycle/action/delete'};
  events.onBeforeRequest.listeners[0](request);assert.equal(globalThis.__lifecycleFixtureSnapshot().pending,1);
  const before=service.authority.peek(frame).grant;service.authority.invalidate('doc');assert.equal((await refresh(3)).state,'verified');assert.notEqual(service.authority.peek(frame).grant,before);
  await events.onCompleted.listeners[0]({...request,statusCode:200});assert.equal(calls,0);assert.equal(globalThis.__lifecycleFixtureSnapshot().rows[0].reason,'retired-before-result');
  const scope=service.authority.scopeFor(frame);assert.equal(await service.nativeRepository.version(scope),0);
  for(const completion of [{statusCode:409},{statusCode:200,fromCache:true},{statusCode:200,tabId:2}]){
   const failed={...request,requestId:'rejected_'+JSON.stringify(completion)};events.onBeforeRequest.listeners[0](failed);await events.onCompleted.listeners[0]({...failed,...completion});assert.equal(calls,0);assert.equal(await service.nativeRepository.version(scope),0);
  }
  // The real repository returns its own operationId; it must not overwrite
  // the independent native request key used to correlate browser evidence.
  globalThis.fetch=async()=>Response.json({...result,operationId:'delete',resultId:deleted,state:'deleted',coversDeleteResultId:null,version:1});
  const current={...request,requestId:'r2'};events.onBeforeRequest.listeners[0](current);await events.onCompleted.listeners[0]({...current,statusCode:200});
  const row=globalThis.__lifecycleFixtureSnapshot().rows.at(-1);assert.equal(row.ok,true);assert.equal(row.operationId,'delete');assert(row.consumerOperationId.startsWith('lifecycle_'));assert.equal((await service.nativeRepository.read(scope)).refLifecycle[LIFECYCLE_TARGET].state,'deletion-confirmed');
 }finally{service?.stop();base.close();globalThis.chrome=priorChrome;globalThis.fetch=priorFetch;}
});

test('restart oracle needs actual stopped/running and a fresh realm, not a new DevTools target',async()=>{
 const {assertLifecycleWorkerRestart}=await import('./native-lifecycle-package-journey.mjs');
 const proof={before:{instanceId:'old',rows:[{operationId:'delete',ok:true}]},after:{instanceId:'new',rows:[],pending:0,active:false},events:[{versionId:'1',runningStatus:'running',targetId:'same'},{versionId:'1',runningStatus:'stopped',targetId:'same'},{versionId:'1',runningStatus:'running',targetId:'same'}],stopIndex:1,versionId:'1',dropped:0};
 assert.equal(assertLifecycleWorkerRestart(proof).freshRealm,true);
 for(const invalid of [{...proof,stopIndex:2},{...proof,events:proof.events.slice(0,2)},{...proof,versionId:'other'},{...proof,dropped:1},{...proof,after:{...proof.after,instanceId:'old'}},{...proof,after:{...proof.after,rows:proof.before.rows}},{...proof,after:{...proof.after,pending:1}}])assert.throws(()=>assertLifecycleWorkerRestart(invalid));
});

test('lifecycle projection oracle rejects premature hiding even when raw facts survive',async()=>{
 const {assertLifecycleProjectionVisible}=await import('./native-lifecycle-package-journey.mjs');
 const visible={openSurfaces:2,frameVisible:true,targetCount:1,targetVisible:true};
 assert.deepEqual(assertLifecycleProjectionVisible(visible),visible);
 for(const [name,change]of Object.entries({removed:{targetCount:0,targetVisible:false},duplicate:{targetCount:2},hiddenRow:{targetVisible:false},hiddenFrame:{frameVisible:false},closedSurface:{openSurfaces:1}})){
  assert.throws(()=>assertLifecycleProjectionVisible({...visible,...change}),{name:'AssertionError'},name+' must fail instead of making later removal vacuous');
 }
});
