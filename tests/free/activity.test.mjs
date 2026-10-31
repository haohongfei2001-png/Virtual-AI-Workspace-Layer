import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFreeActivity,mergeFreeObservationHints,aggregateFreeActivity} from '../../src/data/free-activity.mjs';
import {createFreeViewSession} from '../../src/data/free-time-policy.mjs';
const now='2026-10-13T12:00:00Z',scope='synthetic-scope',session=createFreeViewSession({now,timeZone:'UTC'});
const snapshot={scope,refs:['a','b','n','u'].map(id=>({id,scope})),projects:[{id:'p',scope,members:['a','b']}],noProject:[{id:'n'}],unknown:[{id:'u'}]};
const evidence=()=>({scopeKey:scope,sources:{s:{revoked:false}},events:{},hints:{},coverage:{}});
const send=(id,time,extra={})=>({sourceId:'s',conversationId:id,messageId:'m-'+id,branchId:'main',actorVerified:true,actorScopeKey:scope,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:time,observedAt:now,...extra});
const project=e=>projectFreeActivity(snapshot,e,session,now);
test('sixty day positive anchor sinks reversibly despite unknown member and incomplete coverage',()=>{
 const e=evidence();e.events.a=send('a','2026-08-14T10:00:00Z');let result=project(e);
 assert.equal(result.projects[0].activity.basis,'provisional');assert.equal(result.projects[0].activity.segment,2);assert.equal(result.refs.length,4);
 e.events.b=send('b',now);result=project(e);assert.equal(result.projects[0].activity.segment,0);assert.equal(result.projects[0].old.length,1);
});
test('no Project rows have independent activity and unknown remains reachable',()=>{
 const e=evidence();e.events.n=send('n',now);const result=project(e);
 assert.equal(result.noProject[0].activity.segment,0);assert.equal(result.unknown[0].activity.segment,null);assert.equal(result.projects[0].activity.segment,null);
});
test('other authors, role-only user, future events and same-message contradictions never invent activity',()=>{
 for(const extra of [{actorVerified:false},{actorScopeKey:'other'},{role:'assistant'},{sentAt:'2027-01-01T00:00:00Z'}]){const e=evidence();e.events.a=send('a',now,extra);assert.equal(project(e).refs[0].activity.segment,null);}
 const e=evidence();e.events.a=send('a',now);e.events.b=send('a','2026-08-01T00:00:00Z');assert.equal(project(e).refs[0].activity.segment,null);
 e.events.c=send('a',now,{messageId:'uncontested'});assert.equal(project(e).refs[0].activity.segment,0);
});
test('confirmed local send is hint only, expiry returns to old anchor, polling cannot renew hint',()=>{
 const e=evidence();e.events.a=send('a','2026-08-14T10:00:00Z');
 const hint={id:'h',sourceId:'s',eventKey:'e',conversationId:'a',actorVerified:true,actorScopeKey:scope,hintType:'local-confirmed-send',observedAt:now,validUntil:'2026-10-13T12:10:00Z'};
 e.hints=mergeFreeObservationHints({},[hint]);const original=JSON.stringify(e);assert.equal(project(e).refs[0].activity.segment,0);assert.equal(project(e).refs[0].activity.basis,'provisional');assert.equal(JSON.stringify(e),original);
 assert.equal(projectFreeActivity(snapshot,e,session,'2026-10-13T12:11:00Z').refs[0].activity.segment,2);
 assert.deepEqual(mergeFreeObservationHints(e.hints,[{...hint,observedAt:'2026-10-13T12:09:00Z',validUntil:'2026-10-13T12:19:00Z'}]),e.hints);
});
test('generic updated_at and revoked sources cannot supply activity; scope mismatch fails closed',()=>{
 const e=evidence();e.hints.h={sourceId:'s',conversationId:'a',eventKey:'x',hintType:'updated_at',observedAt:now,validUntil:'2026-10-14T00:00:00Z'};assert.equal(project(e).refs[0].activity.segment,null);
 e.events.a=send('a',now);e.sources.s.revoked=true;assert.equal(project(e).refs[0].activity.segment,null);
 assert.throws(()=>project({...e,scopeKey:'other'}),/cross-scope/);
});
test('interval precision preserved and crossing boundary remains provisional',()=>{
 const e=evidence();e.events.a=send('a',null,{precision:'day',sentInterval:{from:'2026-09-13T23:00:00Z',through:'2026-09-14T01:00:00Z'}});
 const d=project(e).refs[0].activity;assert.equal(d.basis,'provisional');assert.equal(d.reason,'interval-crosses-window');assert.ok(d.sentInterval);assert.equal(d.sentAt,undefined);
});
test('coverage gaps cannot certify historical inactivity',()=>{
 const e=evidence();e.events.a=send('a','2026-08-14T10:00:00Z');e.coverage.a={sourceId:'s',conversationId:'a',observedAt:now,from:'2026-08-14T10:00:00Z',through:now,completeness:'complete',branches:'all',gaps:[]};
 assert.equal(project(e).refs[0].activity.basis,'exact');e.coverage.a.gaps=[{from:'2026-09-01T00:00:00Z',through:'2026-09-02T00:00:00Z'}];assert.equal(project(e).refs[0].activity.basis,'provisional');
});

test('numeric sort preserves native stable ties and does not mutate row order or reuse expired keys',()=>{
 const activityDecision={basis:'exact',candidateDay:session.T,candidateTime:now,segment:0};
 const refs=['z','a','m'].map(id=>({id,scope,activityDecision:{...activityDecision}}));
 const value={scope,refs,projects:[{id:'second',scope,members:['z']},{id:'first',scope,members:['a']}],noProject:[refs[2],refs[0],refs[1]],unknown:[]};
 const first=aggregateFreeActivity(value);assert.deepEqual(first.noProject.map(r=>r.id),['m','z','a']);assert.deepEqual(first.projects.map(p=>p.id),['second','first']);assert.deepEqual(value.refs.map(r=>r.id),['z','a','m']);
 refs[0].activityDecision={basis:'undated',candidateDay:null,candidateTime:null,segment:null};
 const changed=aggregateFreeActivity(value);assert.deepEqual(changed.noProject.map(r=>r.id),['m','a','z']);assert.deepEqual(changed.projects.map(p=>p.id),['first','second']);
});

const anchorTime='2026-08-14T10:00:00Z';
function anchored(){const e=evidence();e.sources.s={id:'s',channel:'host-evidence',codecVersion:1,profileId:'test',profileVersion:1,generation:'g1',sourceRevision:1,observedAt:anchorTime,validUntil:'2026-08-14T10:01:00Z',revoked:false};e.hints.h={id:'h',sourceId:'s',generation:'g1',sourceRevision:1,observedAt:anchorTime,revoked:false,conversationId:'a',eventKey:'event_a',messageId:'message_a',hintType:'observed-self-send',anchorVersion:1,actorVerified:true,actorScopeKey:scope,firstObservedAt:anchorTime,candidateInterval:{from:'2026-08-14T09:59:50Z',through:anchorTime},calibrationDueAt:'2026-08-14T10:00:30Z',clockBasis:'local-bounded',ackWitness:{kind:'authenticated-message-readback',profileId:'test',profileVersion:1,semanticFingerprint:'a'.repeat(64)}};return e;}
test('host observed send stays provisional and naturally sinks after sixty days despite calibration due and source TTL',()=>{
 const e=anchored(),before=JSON.stringify(e),early=createFreeViewSession({now:anchorTime,timeZone:'UTC'});const fresh=projectFreeActivity(snapshot,e,early,anchorTime).refs[0].activity;
 assert.equal(fresh.segment,0);assert.equal(fresh.basis,'provisional');const aged=project(e).refs[0].activity;assert.equal(aged.segment,2);assert.equal(aged.reason,'observed-self-send');assert.equal(aged.candidateTime,anchorTime);assert.equal(aged.nextCheck,e.hints.h.calibrationDueAt);assert.equal(aged.validUntil,null);assert.equal(aged.basis,'provisional');assert.equal(aged.sentAt,undefined);assert.equal(JSON.stringify(e),before);
});
test('observed send polling cannot refresh anchor or calibration time',()=>{const e=anchored(),original=e.hints;e.hints=mergeFreeObservationHints(e.hints,[{...e.hints.h,observedAt:now,firstObservedAt:now,candidateInterval:{from:now,through:now},calibrationDueAt:'2026-10-13T12:01:00Z'}]);assert.deepEqual(e.hints,original);assert.equal(project(e).refs[0].activity.candidateTime,anchorTime);assert.equal(project(e).refs[0].activity.segment,2);});
test('host durable hint rejects revoked, mismatched, untrusted and corrupt witnesses without widening legacy behavior',()=>{
 const changes=[e=>e.sources.s.revoked=true,e=>e.hints.h.revoked=true,e=>e.hints.h.generation='g2',e=>e.hints.h.sourceRevision=2,e=>e.sources.s.sourceRevision=NaN,e=>e.sources.s.observedAt='bad',e=>e.hints.h.actorScopeKey='other',e=>e.hints.h.actorVerified=false,e=>e.sources.s.channel='synthetic',e=>e.sources.s.codecVersion=2,e=>e.sources.s.profileId='different',e=>e.hints.h.sentAt=anchorTime,e=>e.hints.h.validUntil=now,e=>e.hints.h.ackWitness.kind='http-200',e=>e.hints.h.candidateInterval.through=now,e=>e.hints.h.firstObservedAt=now,e=>e.hints.h.calibrationDueAt=anchorTime];
 for(const change of changes){const e=anchored();change(e);assert.equal(project(e).refs[0].activity.candidateTime,null,String(change));}
});
test('due time is a calibration request, not expiration, and future observed anchors remain unusable',()=>{
 const e=anchored(),due=e.hints.h.calibrationDueAt,view=createFreeViewSession({now:due,timeZone:'UTC'});assert.equal(projectFreeActivity(snapshot,e,view,due).refs[0].activity.candidateTime,anchorTime);
 const before='2026-08-14T09:59:59Z';assert.equal(projectFreeActivity(snapshot,e,createFreeViewSession({now:before,timeZone:'UTC'}),before).refs[0].activity.candidateTime,null);
});
test('legacy local hints and exact events still expire under normal source TTL',()=>{
 for(const kind of ['hint','event']){const e=anchored();e.hints={};if(kind==='hint')e.hints.old={id:'old',sourceId:'s',eventKey:'old',hintType:'local-confirmed-send',conversationId:'a',actorVerified:true,actorScopeKey:scope,observedAt:anchorTime,validUntil:'2026-10-14T00:00:00Z'};else e.events.old=send('a',anchorTime,{observedAt:anchorTime});assert.equal(project(e).refs[0].activity.candidateTime,null);}
 const e=anchored();e.sources.s.validUntil='2026-10-14T00:00:00Z';e.sources.s.observedAt=now;e.events.latest=send('a',now);assert.equal(project(e).refs[0].activity.reason,'positive-send');assert.equal(project(e).refs[0].activity.basis,'exact');
});
test('same-message original host time supersedes a later ACK observation without changing either record',()=>{const e=anchored();e.sources.original={id:'original',channel:'host-evidence',codecVersion:2,generation:'g1',sourceRevision:1,revoked:false};e.events.original=send('a','2026-08-14T09:59:55Z',{sourceId:'original',messageId:'message_a',observedAt:'2026-08-14T10:01:00Z'});const before=JSON.stringify(e),at='2026-08-14T10:02:00Z',view=createFreeViewSession({now:at,timeZone:'UTC'});const result=projectFreeActivity(snapshot,e,view,at).refs[0].activity;assert.equal(result.basis,'exact');assert.equal(result.candidateTime,e.events.original.sentAt);assert.equal(JSON.stringify(e),before);});
for(const kind of ['other-message','other-author','revoked','future','legacy-codec'])test('original time does not suppress observation on '+kind,()=>{const e=anchored();e.sources.original={id:'original',channel:'host-evidence',codecVersion:2,revoked:false};e.events.original=send('a','2026-08-14T09:59:55Z',{sourceId:'original',messageId:'message_a'});if(kind==='conflict')e.events.conflict={...e.events.original,sentAt:'2026-08-14T09:59:56Z'};if(kind==='other-message')e.events.original.messageId='different';if(kind==='other-author')e.events.original.actorScopeKey='other';if(kind==='revoked')e.sources.original.revoked=true;if(kind==='future')e.events.original.sentAt='2027-01-01T00:00:00Z';if(kind==='legacy-codec')e.sources.original.codecVersion=1;const result=project(e).refs[0].activity;assert.equal(result.reason,'observed-self-send');assert.equal(result.candidateTime,anchorTime);});

test('conflicting valid host originals quarantine their own observation anchor without suppressing another message',()=>{const e=anchored();e.sources.original={id:'original',channel:'host-evidence',codecVersion:2,revoked:false};e.events.original=send('a','2026-08-14T09:59:55Z',{sourceId:'original',messageId:'message_a'});e.events.conflict={...e.events.original,sentAt:'2026-08-14T09:59:56Z'};let result=project(e).refs[0].activity;assert.equal(result.basis,'undated');assert.equal(result.reason,'conflicting-send-evidence');e.hints.other={...e.hints.h,id:'other',messageId:'different',eventKey:'different'};result=project(e).refs[0].activity;assert.equal(result.reason,'observed-self-send');});

test('legacy branch equal to conversation cannot impersonate a host original event key',()=>{const e=anchored();e.sources.legacy={revoked:false};e.events.legacy=send('a','2026-08-14T09:59:55Z',{sourceId:'legacy',messageId:'message_a',branchId:'a'});assert.equal(project(e).refs[0].activity.reason,'observed-self-send');});
