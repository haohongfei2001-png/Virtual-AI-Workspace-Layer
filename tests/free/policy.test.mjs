import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeViewSession,freeWindowFor,freeSegmentFor,initialFreeTimePolicy,setFreeHorizon,evaluateFreeTimePolicy,validateFreeTimePolicy,coolFreeTimePolicy,relocateFreeSegment,freeProjectDensity} from '../../src/data/free-time-policy.mjs';
test('H uses local calendar through DST and consecutive windows share boundary',()=>{
 const s=createFreeViewSession({now:'2026-03-10T08:00:00Z',timeZone:'America/New_York',H:7});assert.deepEqual(freeWindowFor(0,s),{start:'2026-03-04',endExclusive:'2026-03-11'});assert.equal(freeWindowFor(1,s).endExclusive,freeWindowFor(0,s).start);
 assert.equal(freeSegmentFor('2026-03-04T04:59:00Z',s),1);assert.equal(freeSegmentFor('2026-03-04T05:00:00Z',s),0);assert.ok(Object.isFrozen(s));
});
const density={counts:{7:2,14:6,30:14,60:20,90:25},inventoryComplete:true,activityComplete:true,safeEntry:true};
test('auto requires two weekly matching observations and minimum 14 day dwell',()=>{
 let p=initialFreeTimePolicy();p=evaluateFreeTimePolicy(p,{...density,day:7});assert.equal(p.H,30);assert.equal(p.recommendation,14);
 const same=evaluateFreeTimePolicy(p,{...density,day:8});assert.equal(same,p);
 p=evaluateFreeTimePolicy(p,{...density,day:14});assert.equal(p.H,14);assert.equal(p.previousH,30);assert.equal(p.revision,1);
});
test('fixed legacy, incomplete evidence, ordinary-chat dominance, cooldown and historical viewing prevent surprise changes',()=>{
 for(const p of [initialFreeTimePolicy({legacy:true}),coolFreeTimePolicy(initialFreeTimePolicy(),30)])assert.equal(evaluateFreeTimePolicy(p,{...density,day:14}),p);
 for(const extra of [{inventoryComplete:false},{activityComplete:false},{noProjectDominant:true}]){const p=initialFreeTimePolicy();assert.equal(evaluateFreeTimePolicy(p,{...density,day:14,...extra}),p);}
 let p=evaluateFreeTimePolicy(initialFreeTimePolicy(),{...density,day:7});p=evaluateFreeTimePolicy(p,{...density,day:14,historyBrowsing:true});assert.equal(p.H,30);
 assert.equal(setFreeHorizon(p,90,14).H,90);assert.equal(setFreeHorizon(p,90,14).mode,'fixed');
});
test('same sparse/crowded distribution stays fixed, distinct actual horizon counts required',()=>{
 for(const counts of [{7:0,14:1,30:2,60:3,90:4},{7:11,14:12,30:13,60:15,90:20}])assert.equal(evaluateFreeTimePolicy(initialFreeTimePolicy(),{...density,counts,day:14}).recommendation,null);
 assert.throws(()=>evaluateFreeTimePolicy(initialFreeTimePolicy(),{...density,counts:{7:3,14:1,30:4,60:5,90:6},day:14}),/density/);
 assert.equal(validateFreeTimePolicy(initialFreeTimePolicy()).H,30);assert.throws(()=>validateFreeTimePolicy({...initialFreeTimePolicy(),H:31}),/policy/);
});
test('manual change relocates date anchor rather than reusing old index',()=>{
 const s=createFreeViewSession({now:'2026-10-13T00:00:00Z',timeZone:'UTC',H:7});assert.equal(relocateFreeSegment({candidateDay:s.T-60},s),8);
});
test('pending recommendation applies at next safe entry without waiting another weekly evaluation',()=>{
 let p=evaluateFreeTimePolicy(initialFreeTimePolicy(),{...density,day:7,safeEntry:false});p=evaluateFreeTimePolicy(p,{...density,day:14,safeEntry:false});assert.equal(p.H,30);assert.equal(p.confirmations,2);
 p=evaluateFreeTimePolicy(p,{...density,day:15});assert.equal(p.H,14);assert.equal(p.lastEvaluatedDay,14);
 assert.equal(evaluateFreeTimePolicy(p,{...density,day:15}),p,'same-day entry keeps the committed undo revision stable');
});
test('two recommendations in the same direction confirm even if optimal target changes',()=>{
 let p=evaluateFreeTimePolicy(initialFreeTimePolicy(),{...density,day:7});p=evaluateFreeTimePolicy(p,{...density,counts:{7:7,14:12,30:18,60:20,90:25},day:14});assert.equal(p.H,7);
});

test('adaptive density rejects intervals crossing any candidate H boundary',()=>{
 const session=createFreeViewSession({now:'2026-10-13T12:00:00Z',timeZone:'UTC'});
 const p={id:'native',members:[{id:'chat'}],activity:{basis:'interval',candidateDay:session.T-5,sentInterval:{from:'2026-10-03T12:00:00Z',through:'2026-10-08T12:00:00Z'}}};
 const d=freeProjectDensity({projects:[p,p],noProject:[]},session,{inventoryComplete:true,membershipComplete:true});assert.equal(d.counts[7],0);assert.equal(d.counts[14],1);assert.equal(d.activityComplete,false);
 p.activity.sentInterval.from='2026-10-07T12:00:00Z';const enough=freeProjectDensity({projects:[p],noProject:[]},session,{inventoryComplete:true,membershipComplete:true});assert.equal(enough.counts[7],1);assert.equal(enough.activityComplete,true);
});
