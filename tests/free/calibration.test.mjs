import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeCalibration} from '../../src/data/free-calibration.mjs';
test('deduplicates targets, prioritizes new sends and applies bounded reads',async()=>{
 const calls=[],applied=[];const c=new FreeCalibration({request:async r=>{calls.push(r.objectId);return r.objectId;},apply:v=>applied.push(v)});c.setScope('A');c.enqueue('old');c.enqueue('new','send');c.enqueue('old');const r=await c.run();assert.deepEqual(calls,['new','old']);assert.deepEqual(applied,calls);assert.equal(r.requests,2);
});
test('at most two retries, failures degrade without blocking independent objects',async()=>{
 const calls=[],applied=[];const c=new FreeCalibration({request:async r=>{calls.push(r.objectId);if(r.objectId==='bad')throw Error('offline');return r.objectId;},apply:v=>applied.push(v)});c.setScope('A');c.enqueue('bad','send');c.enqueue('ok');const r=await c.run();assert.deepEqual(calls,['bad','bad','bad','ok']);assert.deepEqual(applied,['ok']);assert.equal(r.outcomes[0].status,'degraded');assert.equal(r.outcomes[0].nextTrigger,'foreground-or-source-revision');
});
test('scope switch aborts active request and rejects late old response',async()=>{
 let resolve;const applied=[];const c=new FreeCalibration({request:()=>new Promise(r=>{resolve=r;}),apply:v=>applied.push(v)});c.setScope('A');c.enqueue('a');const pending=c.run();await Promise.resolve();c.setScope('B');resolve('old');assert.equal((await pending).status,'cancelled');assert.deepEqual(applied,[]);assert.equal(c.queue.size,0);
});
test('request timeout ends spinner even if source ignores AbortSignal',async()=>{
 const c=new FreeCalibration({request:()=>new Promise(()=>{}),apply:()=>assert.fail('late apply'),requestTimeoutMs:5,maxRetries:0});c.setScope('A');c.enqueue('a');const r=await c.run();assert.equal(r.outcomes[0].status,'degraded');assert.equal(r.requests,1);
});
test('request budget preserves deferred queue and concurrent run calls share a cycle',async()=>{
 const c=new FreeCalibration({request:async()=>1,apply:()=>{},maxRequests:1});c.setScope('A');c.enqueue('a');c.enqueue('b');const first=c.run();assert.equal(c.run(),first);const result=await first;assert.equal(result.status,'budget-exhausted');assert.equal(result.pending,1);assert.equal((await c.run()).status,'complete');
});
test('hanging apply is bounded; apply receives invalidated guard and signal',async()=>{
 let context;const c=new FreeCalibration({request:async()=>1,apply:(_v,ctx)=>{context=ctx;return new Promise(()=>{});},requestTimeoutMs:5,maxRetries:0});c.setScope('A');c.enqueue('a');const r=await c.run();assert.equal(r.outcomes[0].status,'degraded');assert.equal(context.isCurrent(),false);assert.equal(context.signal.aborted,true);
});
test('cancel and requeue in same scope allows new run without waiting for ignored network abort',async()=>{
 const applied=[];let first=true;const c=new FreeCalibration({request:async({objectId})=>{if(first){first=false;return new Promise(()=>{});}return objectId;},apply:v=>applied.push(v)});c.setScope('A');c.enqueue('old');const old=c.run();await Promise.resolve();c.cancel();c.enqueue('new');const fresh=c.run();assert.equal((await old).status,'cancelled');assert.equal((await fresh).status,'complete');assert.deepEqual(applied,['new']);
});
