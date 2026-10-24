import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareHostAutoTimePolicy,hostAutoTimePolicyFresh} from '../../src/runtime/host-auto-time-policy.mjs';
import {initialFreeTimePolicy,createFreeViewSession} from '../../src/data/free-time-policy.mjs';
const NOW='2026-10-14T12:00:00.000Z',ZONE='Asia/Shanghai';
const opts={now:NOW,timeZone:ZONE};
function fixture(){
 const session=createFreeViewSession({...opts,H:30}),day=session.T;
 const policy={...initialFreeTimePolicy({day:day-21}),lastEvaluatedDay:day-7,recommendation:14,confirmations:1};
 const ages=[1,2,8,9,10,11,18,19,20,21,22,23,24,25];
 const refs=ages.map((age,i)=>{const time=new Date(Date.parse(NOW)-age*86400000).toISOString();return {id:`c${i}`,scope:'scope-A',membership:'PROJECT',projectId:`p${i}`,activityDecision:{basis:'exact',candidateDay:day-age,candidateTime:time,sentInterval:{from:time,through:time},nextCheck:null,validUntil:null}};});
 const projects=refs.map((r,i)=>({id:`p${i}`,scope:'scope-A',members:[r],memberCount:1,membershipComplete:true,activityDecision:{...r.activityDecision}}));
 return {scope:'scope-A',inventoryComplete:true,revision:12,workspaceRevision:7,evidenceRevision:'7:8',evaluatedAt:NOW,viewSession:session,preferences:{freeTimePolicy:{value:policy}},refs,projects,noProject:[],unknown:[],manifest:{projectVersions:Object.fromEntries(projects.map(p=>[p.id,1])),refVersions:Object.fromEntries(refs.map(r=>[r.id,1]))},activityFreshness:{evaluatedAt:NOW,deadlines:['2026-10-14T12:00:04.000Z']}};
}
const prepare=s=>prepareHostAutoTimePolicy(s,opts);
test('complete native inventory yields existing algorithm H14 and atomic versions without mutating input',()=>{
 const s=fixture(),before=structuredClone(s),p=prepare(s);assert.ok(p);assert.equal(p.policy.H,14);assert.equal(p.policy.revision,1);assert.equal(p.previousPolicy.H,30);assert.deepEqual(p.expectedActivityVersions,{nativeRevision:12,evidenceRevision:8});assert.equal(p.expectedRevision,7);assert.equal(p.viewSession.H,14);assert.deepEqual(s,before);assert.ok(Object.isFrozen(p.policy));assert.ok(Object.isFrozen(p.expectedActivityVersions));
 s.preferences.freeTimePolicy.value.H=90;assert.equal(p.previousPolicy.H,30);
});
test('only explicit saved valid auto policy may evaluate',()=>{
 for(const change of [s=>delete s.preferences.freeTimePolicy,s=>s.preferences.freeTimePolicy.value.mode='fixed',s=>s.preferences.freeTimePolicy.value.H=31,s=>s.preferences.freeTimePolicy.value.extra=true]){const s=fixture();change(s);assert.equal(prepare(s),null);}
});
test('weekly recommendation persistence is a policy change even when H is unchanged; no-op returns null',()=>{
 const s=fixture();s.preferences.freeTimePolicy.value.recommendation=null;s.preferences.freeTimePolicy.value.confirmations=0;const p=prepare(s);assert.equal(p.policy.H,30);assert.equal(p.policy.recommendation,14);assert.equal(p.policy.confirmations,1);
 s.preferences.freeTimePolicy.value=p.policy;assert.equal(prepare(s),null);
});
test('complete flags never substitute for inventory and actual membership correspondence',()=>{
 const changes=[s=>s.inventoryComplete=false,s=>s.projects.pop(),s=>s.refs.pop(),s=>s.projects.push(s.projects[0]),s=>s.refs[0].scope='scope-B',s=>s.projects[0].membershipComplete=false,s=>s.projects[0].memberCount=2,s=>s.projects[0].members=[],s=>s.projects[1].members=[s.refs[0]],s=>s.refs[0].projectId='missing',s=>s.refs[0].membership='UNKNOWN',s=>s.unknown.push(s.refs[0]),s=>s.omittedRefs=['c0'],s=>s.omittedProjects=['p0'],s=>s.manifest.refVersions.c0=-1];
 for(const change of changes){const s=fixture();change(s);assert.equal(prepare(s),null,change.toString());}
});
test('NONE stays separate and ordinary chat dominance suppresses adaptation',()=>{
 const s=fixture();for(let i=0;i<15;i++){const r={id:`n${i}`,scope:s.scope,membership:'NONE',projectId:null};s.refs.push(r);s.noProject.push(r);s.manifest.refVersions[r.id]=1;}assert.equal(prepare(s),null);
 s.noProject[0].membership='UNKNOWN';assert.equal(prepare(s),null);
});
test('undated/provisional project or interval crossing another horizon cannot certify density',()=>{
 for(const basis of ['provisional','undated']){const s=fixture();s.projects[0].activityDecision.basis=basis;assert.equal(prepare(s),null);}
 const s=fixture(),d=s.projects[2].activityDecision;d.basis='interval';d.sentInterval.from='2026-10-05T12:00:00Z';d.sentInterval.through='2026-10-08T12:00:00Z';d.candidateDay=s.viewSession.T-6;assert.equal(prepare(s),null);
});
test('composite revision is canonical safe integer, workspace must agree',()=>{
 for(const value of ['07:8','7:08','7:8x','7:8:9','6:8','7:-1','7:9007199254740992','7:1e2',7]){const s=fixture();s.evidenceRevision=value;assert.equal(prepare(s),null);}
 for(const key of ['revision','workspaceRevision']){const s=fixture();s[key]=NaN;assert.equal(prepare(s),null);}
});
test('only complete full-page freshness proof permits preparation',()=>{
 for(const change of [s=>delete s.activityFreshness,s=>s.activityFreshness=null,s=>s.activityFreshness.deadlines=null,s=>s.activityFreshness.evaluatedAt='2026-10-14T11:59:59Z',s=>s.activityFreshness.deadlines=['bad'],s=>s.activityFreshness.deadlines=['2026-10-14T12:00:00.001Z']]){
  const s=fixture();change(s);assert.equal(prepareHostAutoTimePolicy(s,{...opts,now:'2026-10-14T12:00:00.002Z'}),null);
 }
 const s=fixture();s.activityFreshness.deadlines.push('2026-10-14T11:59:00Z');assert.ok(prepare(s),'already expired data was excluded at evaluation');
});
test('freshness rejects rollback, exact expiry, six-second budget and forged proposal',()=>{
 const p=prepare(fixture());assert.equal(hostAutoTimePolicyFresh(p,opts),true);assert.equal(hostAutoTimePolicyFresh(p,{now:'2026-10-14T12:00:03.999Z'}),true);
 for(const now of ['2026-10-14T11:59:59Z','2026-10-14T12:00:04Z','invalid'])assert.equal(hostAutoTimePolicyFresh(p,{now}),false);
 assert.equal(hostAutoTimePolicyFresh({...p},opts),false);
 const s=fixture();s.activityFreshness.deadlines=[];const bounded=prepare(s);assert.equal(hostAutoTimePolicyFresh(bounded,{now:'2026-10-14T12:00:06Z'}),false);
 assert.equal(prepareHostAutoTimePolicy(s,{...opts,now:'2026-10-14T12:00:06Z'}),null);
});
test('explicit safe entry can advance frozen history date but not timezone or policy revision',()=>{
 const s=fixture();s.viewSession={...s.viewSession,T:s.viewSession.T-1};assert.ok(prepare(s));
 assert.equal(prepareHostAutoTimePolicy(s,{...opts,timeZone:'UTC'}),null);
 s.viewSession.policyRevision=99;assert.equal(prepare(s),null);
});
test('local midnight ends proposal even before TTL, and crossing evaluation day refuses stale data',()=>{
 const now='2026-10-14T15:59:59.000Z',s=fixture();s.evaluatedAt=now;s.activityFreshness={evaluatedAt:now,deadlines:['2026-10-14T16:10:00Z']};
 const p=prepareHostAutoTimePolicy(s,{now,timeZone:ZONE});assert.ok(p);assert.equal(hostAutoTimePolicyFresh(p,{now:'2026-10-14T16:00:00Z'}),false);assert.equal(prepareHostAutoTimePolicy(s,{now:'2026-10-14T16:00:00Z',timeZone:ZONE}),null);
});
test('snapshot evaluated in future, future policy day, bad timezone and expired visible decision fail closed',()=>{
 for(const change of [s=>s.evaluatedAt='2026-10-14T12:00:01Z',s=>s.preferences.freeTimePolicy.value.lastChangedDay=s.viewSession.T+1,s=>s.preferences.freeTimePolicy.value.lastEvaluatedDay=s.viewSession.T+1,s=>s.refs[0].activityDecision.validUntil=NOW]){const s=fixture();change(s);assert.equal(prepare(s),null);}
 assert.equal(prepareHostAutoTimePolicy(fixture(),{...opts,timeZone:'not/a-zone'}),null);
});
