import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createWorkerPreparedDormancyProbe,observeWorkerPreparedDormancy} from './prepared-dormancy-probe.mjs';
import {framePendingWorkIsIdle} from './frame-pending-work-probe.mjs';
test('dormant formal and mutant use identical instrumented frame prerequisite before one real CHECK',async()=>{
 const source=await readFile(new URL('./context-replacement-package-browser.mjs',import.meta.url),'utf8');
 assert(source.includes("if(transportExpiry||dormantRecovery){const path='src/host/free-frame-client.mjs'"));
 const branch=source.slice(source.indexOf(' }else if(dormantRecovery){'),source.indexOf(' }else{\n // One user-triggered refresh'));
 assert(branch.includes('createWorkerPreparedDormancyProbe({framesIdle,workerIdle:'));
 assert(branch.indexOf('const framesIdle=')<branch.indexOf('const preparedProbe='));
 assert(branch.includes('framePendingWorkIsIdle'));assert(branch.includes('items[0]===sampledFrames[i]&&!items[0].isDetached()'));
 assert(!branch.includes('dormantMutant'));assert(branch.includes('assert.deepEqual(report.idlePrecondition,{prepared:true,entered:true})'));
 for(const forbidden of ['clearTimeout(','setTimeout(','flush','forceIdle'])assert(!branch.replace('Never flush them.','').includes(forbidden));
 assert(source.includes('const poll=fn=>j2Poll(fn,15000)'));
});
test('queued frame save cannot race CHECK despite worker idle; completed ordinary save permits one attempt',async()=>{
 let queued=true,workerReads=0,attempts=0;const order=[];
 const probe=createWorkerPreparedDormancyProbe({framesIdle:()=>{order.push('frames');return !queued;},workerIdle:()=>{order.push('worker');workerReads++;return true;},attempt:()=>{order.push('CHECK');attempts++;return {prepared:true,entered:true};}});
 assert.equal(await probe(),null);assert.equal(workerReads,0);assert.equal(attempts,0);
 queued=false;assert.deepEqual(await observeWorkerPreparedDormancy(fn=>fn(),probe),{prepared:true,entered:true});await probe();assert.deepEqual(order,['frames','frames','worker','CHECK']);assert.equal(attempts,1);
});
test('new work after passive sample still refuses once, never retries or turns guard denial green',async()=>{
 let attempts=0;const probe=createWorkerPreparedDormancyProbe({framesIdle:()=>true,workerIdle:()=>true,attempt:()=>{attempts++;return {prepared:true,entered:false};}});
 for(let i=0;i<3;i++)assert.deepEqual(await observeWorkerPreparedDormancy(fn=>fn(),probe),{prepared:true,entered:false});assert.equal(attempts,1);
});
test('active or incomplete actual frame state cannot become a readiness positive',()=>{
 assert.equal(framePendingWorkIsIdle(null,'workspace'),false);assert.equal(framePendingWorkIsIdle({role:'workspace',resumeTimer:true},'workspace'),false);
});
