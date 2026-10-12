import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
import {emptyFreeEvidence} from '../../src/data/free-evidence.mjs';
const A=scopeOf('A');
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function setup(sourceFor=null){
 let frame={documentId:'runtime_document',documentLifecycle:'active',url:'https://vaiwl-hf.test/hf/A/c/T0'},seq=0,leaseId;
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:'runtime_extension',getFrame:async()=>frame,calibrationSourceFor:sourceFor});
 const sender={id:'runtime_extension',tab:{id:1},frameId:0,...frame};
 const send=(type,extra={})=>service.broker.handle({v:1,clientId:'runtime_client',seq:++seq,type,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 return {service,send,sender,setFrame:value=>{frame={...frame,...value};},bind:async()=>{const result=await send('BIND');if(result.ok)leaseId=result.leaseId;return result;},entry:()=>service.runtime.bindings.get(leaseId),close:()=>service.close()};
}
function sourceBatch(scope=A){const scopeKey=emptyFreeEvidence(scope).scopeKey;return {sources:[{id:'free_fixture_sends',generation:'fixture_v1',channel:'synthetic',sourceRevision:1,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z'}],events:[{id:'calibrated_event',sourceId:'free_fixture_sends',generation:'fixture_v1',sourceRevision:1,conversationId:'T0',messageId:'calibrated_message',branchId:'root',actorVerified:true,actorScopeKey:scopeKey,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:FIXTURE_NOW,observedAt:FIXTURE_NOW}],hints:[],coverage:[]};}
test('SERVICE no configured source does not run runtime full snapshot or calibration requests',async()=>{
 const h=setup();let fullReads=0;h.service.native.snapshot=async()=>{fullReads++;throw Error('runtime-full-read-not-allowed');};
 try{assert.equal((await h.bind()).ok,true);assert.equal(h.entry().runtime,null);const result=await h.send('B23_FREE_HEADER');assert.equal(result.ok,true,JSON.stringify(result));assert.equal(fullReads,0);assert.equal(h.entry().timer,null);assert.equal((await h.service.evidence.read(A)).revision,0);}finally{h.close();}
});
test('SERVICE owner source foreground writes trusted evidence after header returns without awaiting network',async()=>{
 const started=deferred(),reply=deferred();let request;
 const h=setup(()=>({channel:'synthetic',read:input=>{request=input;started.resolve();return reply.promise;}}));
 try{assert.equal((await h.bind()).ok,true);const result=await h.send('B23_FREE_HEADER');assert.equal(result.ok,true,JSON.stringify(result));await started.promise;assert.equal(request.scope.key,emptyFreeEvidence(A).scopeKey);assert.equal((await h.service.evidence.read(A)).revision,0);
  const running=h.entry().runtime.calibration.running;reply.resolve({evidenceBatch:sourceBatch()});await running;const stored=await h.service.evidence.read(A);assert.equal(stored.events.calibrated_event.actorScopeKey,emptyFreeEvidence(A).scopeKey);
 }finally{h.close();}
});
test('SERVICE synthetic send notifies the owner runtime with current conversation priority',async()=>{
 const calls=[],sendStarted=deferred();const h=setup(()=>({channel:'synthetic',read:async input=>{calls.push(input);if(input.trigger==='send')sendStarted.resolve();return {status:'unsupported',reason:'controlled-source-unavailable'};}}));
 try{await h.bind();assert.equal((await h.send('B23_FREE_HEADER')).ok,true);await h.entry().runtime.calibration.running;
 const result=await h.send('B23_SYNTHETIC_SEND',{conversationId:'T0',messageId:'controlled_send',projectId:null,nativeTitle:'从哪里开始'});assert.equal(result.ok,true,JSON.stringify(result));await sendStarted.promise;assert.ok(calls.some(c=>c.trigger==='send'&&c.objectId==='T0'));await h.entry().runtime.calibration.running;
 }finally{h.close();}
});
for(const scenario of ['rebind','tab-close','unknown-scope','changed-account-without-bind','silent-account-switch'])test('SERVICE '+scenario+' aborts late calibration before persistent write',async()=>{
 const started=deferred(),reply=deferred();let request;
 const h=setup(()=>({channel:'synthetic',read:input=>{request=input;started.resolve();return reply.promise;}}));
 try{await h.bind();assert.equal((await h.send('B23_FREE_HEADER')).ok,true);await started.promise;const oldEntry=h.entry(),running=oldEntry.runtime.calibration.running;
  if(scenario==='rebind')assert.equal((await h.bind()).ok,true);
  if(scenario==='tab-close')h.service.broker.tabClosed(1);
  if(scenario==='unknown-scope'){h.setFrame({url:'https://vaiwl-hf.test/hf/unknown/c/T0'});assert.equal((await h.send('CHECK')).reason,'unverified-scope');}
  if(scenario==='silent-account-switch')h.setFrame({url:'https://vaiwl-hf.test/hf/B/c/T0'});
  if(scenario==='changed-account-without-bind'){h.setFrame({url:'https://vaiwl-hf.test/hf/B/c/T0'});assert.equal((await h.send('CHECK')).ok,false);}
  reply.resolve({evidenceBatch:sourceBatch()});await running;
  assert.deepEqual({aborted:request.signal.aborted,evidenceRevision:(await h.service.evidence.read(A)).revision},{aborted:true,evidenceRevision:0},'old calibration must abort before any stale persistent write');
 }finally{h.close();}
});

test('SERVICE configured source header does not await duplicate full runtime snapshot or native read',async()=>{
 const started=deferred(),reply=deferred();const h=setup(()=>({channel:'synthetic',read:()=>{started.resolve();return reply.promise;}}));let snapshots=0,reads=0;
 const originalSnapshot=h.service.native.snapshot.bind(h.service.native),originalRead=h.service.native.read.bind(h.service.native);
 h.service.native.snapshot=async(...args)=>{snapshots++;return originalSnapshot(...args);};h.service.native.read=async(...args)=>{reads++;return originalRead(...args);};
 try{await h.bind();const response=await h.send('B23_FREE_HEADER');assert.equal(response.ok,true,JSON.stringify(response));await started.promise;assert.equal(snapshots,0);assert.equal(reads,0);
 const running=h.entry().runtime.calibration.running;reply.resolve({status:'unsupported'});await running;assert.equal(snapshots,0);assert.equal(reads,0);
 }finally{h.close();}
});
