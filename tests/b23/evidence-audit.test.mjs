/** Deterministic time-proof regressions; synthetic evidence, no host time source. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { persistentSeed } from '../../simulator/persistent-seed.mjs';
import { scopeOf, FIXTURE_NOW as now } from '../../simulator/data.mjs';
import { dataProjection } from '../../src/data/evidence.mjs';
const seed=()=>persistentSeed(scopeOf('A'),'https://vaiwl-hf.test');
const group=s=>dataProjection(s,now,'Asia/Shanghai').groups.find(w=>w.id==='W4');
test('TIME_AUDIT01 reliable current positive survives another undated send in same conversation',()=>{
 const s=seed(),e=s.events.event_T400;
 s.events.recent={...e,id:'recent',messageId:'reliable_recent',sentAt:'2026-10-11T03:00:00Z'};
 s.events.undated={...e,id:'undated',messageId:'undated',sentAt:null,precision:'unknown'};
 assert.equal(group(s).segment,0);assert(group(s).current.some(r=>r.id==='T400'));
});
test('TIME_AUDIT02 complete coverage alone cannot date an existing undated send',()=>{
 const s=seed();s.events.event_T401.sentAt=null;s.events.event_T401.precision='unknown';
 assert.equal(group(s).segment,null,'coverage presence does not prove an undated event is old');
});
test('TIME_AUDIT03 contradictory timestamps on the same message cannot invent current activity',()=>{
 const s=seed(),e=s.events.event_T400;
 s.events.conflicting={...e,id:'conflicting',sentAt:'2026-10-11T03:00:00Z'};
 assert.equal(group(s).segment,null);
});
test('TIME_AUDIT04 revoked sources cannot provide even positive current evidence',()=>{
 const s=seed();s.events.event_T400.sentAt='2026-10-11T03:00:00Z';s.sources.fixture_v1.revoked=true;
 assert.equal(group(s).segment,null);
});
