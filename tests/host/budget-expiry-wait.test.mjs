import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForBudgetExpiry} from './fixtures/budget-expiry-wait.mjs';

test('early wakes recheck wall time and exact boundary is not expired',async()=>{
 let wall=29999,tick=0;const requests=[];
 const result=await waitForBudgetExpiry(0,{now:()=>wall,monotonicNow:()=>tick,sleep:async ms=>{requests.push(ms);tick++;wall++;}});
 assert.deepEqual(requests,[2,1]);assert.deepEqual(result,2);assert.equal(wall,30001);
});
test('already expired budget returns without sleeping',async()=>{
 assert.deepEqual(await waitForBudgetExpiry(0,{now:()=>30001,monotonicNow:()=>10,sleep:()=>assert.fail('unexpected sleep')}),0);
});
test('wall clock rollback cannot extend monotonic deadline',async()=>{
 let wall=29999,tick=0;const waits=[];
 await assert.rejects(waitForBudgetExpiry(0,{now:()=>wall,monotonicNow:()=>tick,sleep:async ms=>{waits.push(ms);tick+=ms;wall=-100000;}}),/budget-expiry-deadline/);
 assert.equal(tick,1002);assert(waits.every(ms=>ms>0&&ms<=1000));
});
test('fresh budget reaches actual expiry with bounded sleeps',async()=>{
 let wall=0,tick=0;
 const result=await waitForBudgetExpiry(0,{now:()=>wall,monotonicNow:()=>tick,sleep:async ms=>{assert(ms<=1000);wall+=ms;tick+=ms;}});
 assert.deepEqual(result,30001);
});
test('late scheduler wake beyond deadline fails even when wall expired',async()=>{
 let wall=30000,tick=0;
 await assert.rejects(waitForBudgetExpiry(0,{now:()=>wall,monotonicNow:()=>tick,sleep:async()=>{wall+=2000;tick+=2000;}}),/budget-expiry-deadline/);
});
test('invalid and excessively future starts reject',async()=>{
 for(const startedAt of [NaN,Infinity,-Infinity,1001])await assert.rejects(waitForBudgetExpiry(startedAt,{now:()=>0,monotonicNow:()=>0}),/invalid-budget-start/);
});
test('future tolerance never extends total wait past 31001ms',async()=>{
 let tick=0;
 await assert.rejects(waitForBudgetExpiry(1000,{now:()=>0,monotonicNow:()=>tick,sleep:async ms=>{tick+=ms;}}),/budget-expiry-deadline/);
 assert.equal(tick,31001);
});
test('invalid clocks and nonadvancing injected sleeps cannot loop forever',async()=>{
 await assert.rejects(waitForBudgetExpiry(0,{now:()=>NaN}),/invalid-budget-start/);
 let tick=0;
 await assert.rejects(waitForBudgetExpiry(0,{now:()=>0,monotonicNow:()=>tick,sleep:async()=>{tick--;}}),/invalid-budget-clock/);
 await assert.rejects(waitForBudgetExpiry(0,{now:()=>0,monotonicNow:()=>0,sleep:async()=>{}}),/budget-expiry-clock-stalled/);
});
