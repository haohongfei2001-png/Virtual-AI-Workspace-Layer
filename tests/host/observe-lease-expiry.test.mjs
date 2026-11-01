import test from 'node:test';
import assert from 'node:assert/strict';
import {observeLeaseExpiry} from './observe-lease-expiry.mjs';
test('early timer wakes and equality do not prove expiry; actual later clock does',async()=>{
 let time=1000,tick=0;const sleeps=[],wakes=[1999,2000,2001],trace=[];
 await observeLeaseExpiry(2000,{wall:()=>time,elapsed:()=>tick,trace,sleep:async ms=>{sleeps.push(ms);const next=wakes.shift();tick+=next-time;time=next;}});
 assert.deepEqual(sleeps,[1001,2,1]);assert.deepEqual(trace.map(v=>v.wall),[1000,1999,2000,2001]);
});
test('already expired requires no timer',async()=>{
 const trace=await observeLeaseExpiry(999,{wall:()=>1000,elapsed:()=>0,sleep:()=>assert.fail('no wait')});assert.equal(trace.length,1);
});
for(const mode of ['rollback','monotonic-rollback','deadline','late-expired'])test(mode+' cannot produce successful expiry evidence',async()=>{
 let time=1000,tick=0;await assert.rejects(observeLeaseExpiry(2000,{wall:()=>time,elapsed:()=>tick,sleep:async()=>{time=mode==='rollback'?999:mode==='late-expired'?22000:1000;tick=mode==='monotonic-rollback'?-1:20002;}}),/lease-expiry-(clock-invalid|observation-deadline)/);
});
test('stalled clocks and early wake loop has a finite observation limit',async()=>{
 const trace=[];await assert.rejects(observeLeaseExpiry(2000,{wall:()=>1000,elapsed:()=>0,sleep:async()=>{},trace}),/observation-limit/);assert.equal(trace.length,64);
});
test('lease beyond original maximum is rejected without sleeping',async()=>{
 await assert.rejects(observeLeaseExpiry(22001,{wall:()=>1000,elapsed:()=>0,sleep:()=>assert.fail('no wait')}),/invalid-lease/);
});
