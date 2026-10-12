import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFreeActivity,mergeFreeObservationHints} from '../../src/data/free-activity.mjs';
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
