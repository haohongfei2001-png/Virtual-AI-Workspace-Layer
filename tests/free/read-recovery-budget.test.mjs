import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadRecoveryBudget} from '../../src/data/read-recovery-budget.mjs';

function fixture(options={}) {
 let time=100,sequence=0,expirations=0;
 const pending=new Map(),callbacks=new Map(),delays=[];
 const budget=createReadRecoveryBudget({
  ...options,now:()=>time,
  schedule(fn,delay){const id=++sequence;pending.set(id,fn);callbacks.set(id,fn);delays.push(delay);return id;},
  cancel(id){pending.delete(id);},onExpire(){expirations++;},
 });
 return {budget,pending,delays,advance(ms){time+=ms;},fire(id){const callback=callbacks.get(id);assert(callback);pending.delete(id);callback();},get expirations(){return expirations;}};
}

test('unstarted budget has no deadline or timer',()=>{
 const f=fixture();assert.equal(f.budget.remaining(),Infinity);assert.doesNotThrow(()=>f.budget.check());assert.equal(f.pending.size,0);assert.equal(f.expirations,0);
});

test('repeated begin across read retries keeps the original deadline',()=>{
 const f=fixture();assert.equal(f.budget.begin(),true);assert.equal(f.budget.remaining(),30000);
 for(const elapsed of [6000,6000,6000,6000]){f.advance(elapsed);assert.equal(f.budget.begin(),true);}
 assert.equal(f.budget.remaining(),6000);assert.equal(f.pending.size,1);assert.deepEqual(f.delays,[30000]);
 f.advance(5999);assert.equal(f.budget.remaining(),1);assert.doesNotThrow(()=>f.budget.check());
 f.advance(1);assert.throws(()=>f.budget.check(),/^Error: read-budget-exhausted$/);assert.equal(f.expirations,1);assert.equal(f.budget.begin(),false);
});

for(const elapsed of [30000,45000])test('elapsed clock expires at '+elapsed+' even before the timer callback',()=>{
 const f=fixture();f.budget.begin();f.advance(elapsed);assert.equal(f.expirations,0);
 assert.equal(f.budget.remaining(),0);assert.equal(f.expirations,1);assert.throws(()=>f.budget.check(),/read-budget-exhausted/);
 f.fire(1);assert.equal(f.expirations,1);assert.equal(f.budget.begin(),false);assert.equal(f.budget.remaining(),0);assert.equal(f.pending.size,0);
});

test('an early timer reschedules only the original remaining time',()=>{
 const f=fixture();f.budget.begin();f.advance(12000);f.fire(1);
 assert.equal(f.expirations,0);assert.equal(f.budget.remaining(),18000);assert.deepEqual(f.delays,[30000,18000]);assert.equal(f.pending.size,1);
 f.advance(18000);f.fire(2);assert.equal(f.expirations,1);assert.equal(f.budget.remaining(),0);assert.equal(f.pending.size,0);
});

test('reset removes the old deadline and a stale callback cannot expire a new cycle',()=>{
 const f=fixture();f.budget.begin();f.advance(10000);f.budget.reset();assert.equal(f.pending.size,0);assert.equal(f.budget.remaining(),Infinity);
 f.budget.begin();f.advance(20000);f.fire(1);assert.equal(f.expirations,0);assert.equal(f.budget.remaining(),10000);assert.equal(f.pending.size,1);
 f.advance(10000);f.fire(2);assert.equal(f.expirations,1);assert.equal(f.budget.begin(),false);
});

test('complete cancels waiting and ignores its late timer',()=>{
 const f=fixture();f.budget.begin();f.advance(15000);f.budget.complete();assert.equal(f.pending.size,0);assert.equal(f.budget.remaining(),Infinity);
 f.advance(30000);f.fire(1);assert.equal(f.expirations,0);assert.doesNotThrow(()=>f.budget.check());
 assert.equal(f.budget.begin(),true);assert.equal(f.budget.remaining(),30000);
});

test('expiry is latched once until an explicit reset starts a fresh session',()=>{
 const f=fixture();f.budget.begin();f.advance(30000);f.fire(1);
 for(let i=0;i<8;i++){assert.equal(f.budget.begin(),false);assert.equal(f.budget.remaining(),0);assert.throws(()=>f.budget.check(),/read-budget-exhausted/);f.fire(1);}
 assert.equal(f.expirations,1);assert.deepEqual(f.delays,[30000]);
 f.budget.reset();assert.equal(f.budget.begin(),true);f.advance(30000);f.budget.remaining();assert.equal(f.expirations,2);
});

test('repeated checks never extend a shorter configured budget',()=>{
 const f=fixture({durationMs:100});f.budget.begin();
 for(let i=0;i<9;i++){f.advance(10);assert.doesNotThrow(()=>f.budget.check());assert.equal(f.budget.remaining(),100-(i+1)*10);}
 f.advance(10);assert.throws(()=>f.budget.check(),/read-budget-exhausted/);assert.equal(f.expirations,1);assert.deepEqual(f.delays,[100]);
});
