import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerPreparedDormancyProbe,observeWorkerPreparedDormancy} from './prepared-dormancy-probe.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const drain=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
test('worker busy is only an observation and cannot start close',async()=>{
 let idle=false,reads=0,attempts=0;const result={prepared:true,entered:true};
 const probe=createWorkerPreparedDormancyProbe({workerIdle:async()=>{reads++;return idle;},attempt:async()=>{attempts++;return result;}});
 assert.equal(await probe(),null);assert.equal(attempts,0);idle=true;assert.deepEqual(await probe(),result);assert.equal(attempts,1);assert.equal(reads,2);
});
for(const result of [false,{prepared:true,entered:false},{prepared:true,entered:true}])test('first non-null attempt is terminal: '+JSON.stringify(result),async()=>{
 let reads=0,attempts=0;const probe=createWorkerPreparedDormancyProbe({workerIdle:async()=>{reads++;return true;},attempt:async()=>{attempts++;return result;}});
 assert.deepEqual(await probe(),result);assert.deepEqual(await probe(),result);assert.equal(reads,1);assert.equal(attempts,1);
});
test('attempt exception remains terminal and never starts a second close',async()=>{
 const error=Error('close failed');let reads=0,attempts=0;const probe=createWorkerPreparedDormancyProbe({workerIdle:async()=>{reads++;return true;},attempt:()=>{attempts++;throw error;}});
 await assert.rejects(probe(),e=>e===error);await assert.rejects(probe(),e=>e===error);assert.equal(reads,1);assert.equal(attempts,1);
});
test('worker read failure rejects instead of becoming a polling null',async()=>{
 const error=Error('worker unavailable');let attempts=0;const probe=createWorkerPreparedDormancyProbe({workerIdle:async()=>{throw error;},attempt:async()=>{attempts++;return true;}});
 await assert.rejects(probe(),e=>e===error);assert.equal(attempts,0);
});
test('local not-prepared null permits observation of a later readiness state',async()=>{
 let reads=0,attempts=0;const result={prepared:true,entered:true};const probe=createWorkerPreparedDormancyProbe({workerIdle:async()=>{reads++;return true;},attempt:async()=>++attempts===1?null:result});
 assert.equal(await probe(),null);assert.deepEqual(await probe(),result);assert.deepEqual(await probe(),result);assert.equal(reads,2);assert.equal(attempts,2);
});
test('concurrent callers share worker observation and the one in-flight close',async()=>{
 const idle=deferred(),close=deferred();let reads=0,attempts=0;const probe=createWorkerPreparedDormancyProbe({workerIdle:()=>{reads++;return idle.promise;},attempt:()=>{attempts++;return close.promise;}});
 const a=probe(),b=probe();await drain();assert.equal(reads,1);assert.equal(attempts,0);idle.resolve(true);await drain();assert.equal(attempts,1);
 const c=probe();await drain();assert.equal(reads,1);assert.equal(attempts,1);close.resolve(false);assert.deepEqual(await Promise.all([a,b,c]),[false,false,false]);assert.equal(await probe(),false);assert.equal(attempts,1);
});
test('concurrent busy observation releases only its own singleflight for next observation',async()=>{
 const idle=deferred();let reads=0,attempts=0;const probe=createWorkerPreparedDormancyProbe({workerIdle:()=>++reads===1?idle.promise:true,attempt:async()=>{attempts++;return false;}});
 const a=probe(),b=probe();idle.resolve(false);assert.deepEqual(await Promise.all([a,b]),[null,null]);assert.equal(attempts,0);assert.equal(await probe(),false);assert.equal(reads,2);assert.equal(attempts,1);
});

// Exercise the real generic observer: it normally swallows thrown callbacks.
// A deterministic clock catches an extra polling iteration, without timing a
// machine or waiting through a real failure window.
const {j2Poll}=await import('./j2-runner-bounds.mjs');
for(const stage of ['worker','attempt'])test('real j2Poll preserves terminal '+stage+' error without another observation',async()=>{
 const error=Error(stage+' failed');let observations=0,reads=0,attempts=0,clock=0;
 const probe=createWorkerPreparedDormancyProbe({workerIdle:()=>{reads++;if(stage==='worker')throw error;return true;},attempt:()=>{attempts++;throw error;}});
 const poll=fn=>j2Poll(()=>{observations++;return fn();},15000,{interval:0,now:()=>clock++===0?0:clock===2?1:clock===3?2:15001});
 await assert.rejects(observeWorkerPreparedDormancy(poll,probe),e=>e===error);
 assert.equal(observations,1);assert.equal(reads,1);assert.equal(attempts,stage==='worker'?0:1);assert.equal(clock,3,'no timeout or next polling iteration reached');
});
test('real j2Poll continues null readiness observations then preserves false as terminal',async()=>{
 let reads=0,attempts=0,observations=0;
 const probe=createWorkerPreparedDormancyProbe({workerIdle:()=>++reads>1,attempt:()=>++attempts===1?null:false});
 const result=await observeWorkerPreparedDormancy(fn=>j2Poll(()=>{observations++;return fn();},15000,{interval:0}),probe);
 assert.equal(result,false);assert.equal(observations,3);assert.equal(reads,3);assert.equal(attempts,2);
 assert.equal(await probe(),false);assert.equal(attempts,2);
});
