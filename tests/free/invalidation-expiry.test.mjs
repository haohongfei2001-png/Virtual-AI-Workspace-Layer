import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeRuntimeService} from '../../src/data/free-runtime-service.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
import {emptyFreeEvidence} from '../../src/data/free-evidence.mjs';
const A=scopeOf('A'),start='2026-10-13T12:00:00Z',t1='2026-10-13T12:01:00Z',t2='2026-10-13T12:02:00Z';
function harness(){
 let now=start,valid=true,sequence=0,calls=0,revision=0;const timers=new Map(),changes=[];
 const denied=async()=>{throw Error('unexpected-full-read');};
 const repo={read:denied,snapshot:denied,header:async()=>({revision}),apply:async()=>({ok:true,revision:++revision})};
 const registry=new FreeRuntimeService({nativeRepository:repo,evidenceRepository:repo,publication:'invalidation',clock:()=>now,onChange:x=>changes.push(x),timers:{setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)},sourceFor:()=>({channel:'synthetic',read:async()=>++calls===1?{evidenceBatch:{sources:[],events:[],coverage:[],hints:[{validUntil:t1},{validUntil:t2}]}}:{status:'unsupported'}})});
 registry.bind({bindingId:'binding',scope:A,guard:()=>true,authorityCheck:async()=>valid});
 return {registry,timers,changes,calls:()=>calls,revoke:()=>valid=false,fire:async time=>{now=time;const [id,row]=timers.entries().next().value;timers.delete(id);row.fn();for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));}};
}
test('invalidation mode preserves both incoming TTLs even when later calibration is unsupported, without a full read',async()=>{
 const h=harness();try{
  await (await h.registry.foreground('binding',{readCached:false})).calibration;assert.equal(h.calls(),1);assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,60000);
  await h.fire(t1);assert.equal(h.calls(),2);assert.equal(h.changes.filter(x=>x.reason==='expiry').length,1);assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,60000);
  await h.fire(t2);assert.equal(h.calls(),3);assert.equal(h.changes.filter(x=>x.reason==='expiry').length,2);assert.equal(h.timers.size,0);
 }finally{h.registry.stopAll();}
});
test('late asynchronous authority loss cancels expiry publication and every remaining deadline',async()=>{
 const h=harness();try{await (await h.registry.foreground('binding',{readCached:false})).calibration;h.revoke();const before=h.changes.length;await h.fire(t1);assert.equal(h.changes.length,before);assert.equal(h.calls(),1);assert.equal(h.timers.size,0);assert.equal(h.registry.bindings.size,0);}finally{h.registry.stopAll();}
});
test('cold binding recovers older persisted hint TTLs through owner pages, strips metadata and rejects page-injected deadlines',async()=>{
 const frame={documentId:'expiry_document',documentLifecycle:'active',url:'https://vaiwl-hf.test/hf/A/c/T0'},sender={id:'expiry_extension',tab:{id:1},frameId:0,...frame};let seq=0,leaseId;
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:sender.id,getFrame:async()=>frame,calibrationSourceFor:()=>({channel:'synthetic',read:async()=>({status:'unsupported'})})});
 const send=(type,extra={})=>service.broker.handle({v:1,type,clientId:'expiry_client',seq:++seq,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 const expiries=['2026-10-11T04:01:00Z','2026-10-11T04:02:00Z'];
 try{
  const source={id:'free_fixture_sends',generation:'fixture_v1',sourceRevision:1,channel:'synthetic',observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z'};
  const stored=await service.evidence.apply(A,{operationId:'before_binding',expectedRevision:0,batch:{sources:[source],events:[],coverage:[],hints:expiries.map((validUntil,i)=>({id:'cold_'+i,sourceId:source.id,generation:source.generation,sourceRevision:1,observedAt:FIXTURE_NOW,validUntil,conversationId:'T'+i,eventKey:'cold_event_'+i,hintType:'local-confirmed-send',candidateInterval:null,actorVerified:true,actorScopeKey:emptyFreeEvidence(A).scopeKey}))}});assert.equal(stored.ok,true,JSON.stringify(stored));
  leaseId=(await send('BIND')).leaseId;const h=await send('B23_FREE_HEADER');assert.equal(h.ok,true,JSON.stringify(h));assert.equal(Object.hasOwn(h.header,'calibrationDeadlines'),false);
  const entry=service.runtime.bindings.get(leaseId);assert(expiries.every(t=>!entry.deadlines.has(Date.parse(t))),'source header alone cannot know older hint deadlines');
  const page=await send('B23_FREE_PAGE',{revision:h.header.revision,offset:0,limit:500,ids:{projects:[],refs:['T0','T1']},viewSession:h.header.viewSession,now:FIXTURE_NOW});assert.equal(page.ok,true,JSON.stringify(page));assert.equal(Object.hasOwn(page.page,'calibrationDeadlines'),false);assert(expiries.every(t=>entry.deadlines.has(Date.parse(t))));
  assert.equal((await send('CHECK')).ok,true,'deadline plumbing cannot break CHECK');
  assert.equal((await send('B23_FREE_HEADER',{calibrationDeadlines:expiries})).reason,'invalid-request');
  service.broker.invalidate({tabId:1});assert.equal(service.runtime.bindings.size,0);assert.equal(entry.controller.signal.aborted,true);
 }finally{service.close();}
});

test('invalidation-only binding expires persisted display evidence even without a configured read source',async()=>{
 let now=start,next=0;const timers=new Map(),changes=[];const denied=async()=>{throw Error('no-source-must-not-read-or-write');},repo={read:denied,snapshot:denied,apply:denied};
 const registry=new FreeRuntimeService({nativeRepository:repo,evidenceRepository:repo,sourceFor:null,publication:'invalidation',clock:()=>now,onChange:change=>changes.push(change),timers:{setTimeout(fn){const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)}});
 try{registry.bind({bindingId:'cached',scope:A,guard:()=>true});registry.observeDeadlines('cached',[t1,t2]);assert.equal(timers.size,1,'no source still needs cached display TTL invalidation');
  for(const time of [t1,t2]){now=time;const [id,fn]=timers.entries().next().value;timers.delete(id);fn();for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));}
  assert.equal(changes.filter(c=>c.reason==='expiry').length,2);assert.equal(timers.size,0);
 }finally{registry.stopAll();}
});
