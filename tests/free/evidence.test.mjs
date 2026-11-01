import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeOf} from '../../simulator/data.mjs';
import {emptyFreeEvidence,validateFreeEvidence,applyFreeEvidence} from '../../src/data/free-evidence.mjs';
const scope=scopeOf('A'),now='2026-10-13T12:00:00Z',validUntil='2026-10-13T13:00:00Z';
const options={scope,now,channel:'synthetic'};
const witness={sourceId:'source',generation:'one',sourceRevision:1,observedAt:now};
const source={id:'source',generation:'one',sourceRevision:1,observedAt:now,validUntil,channel:'synthetic'};
const event={...witness,id:'send',conversationId:'chat',messageId:'m',branchId:'b',actorVerified:true,actorScopeKey:emptyFreeEvidence(scope).scopeKey,role:'user',kind:'new-send',sendState:'committed',sentAt:now,precision:'second'};
const hint={...witness,id:'hint',conversationId:'chat',eventKey:'local-send',hintType:'local-confirmed-send',actorVerified:true,actorScopeKey:emptyFreeEvidence(scope).scopeKey,validUntil,candidateInterval:null};
const command=(extra={})=>({type:'OBSERVE_FREE_EVIDENCE',batch:{sources:[source],events:[],hints:[],coverage:[],...extra}});
const apply=(cmd,state=emptyFreeEvidence(scope),opts=options)=>applyFreeEvidence(state,cmd,opts);
test('scope-bound evidence stores original sends and observation hints independently without text',()=>{
 const s=apply(command({events:[event],hints:[hint]}));assert.equal(s.events.send.sentAt,now);assert.equal(s.hints.hint.sentAt,undefined);assert.equal(s.revision,1);assert.equal(validateFreeEvidence(s,scope),s);
 assert.throws(()=>validateFreeEvidence(s,scopeOf('B')),/state/);
 assert.throws(()=>apply(command({events:[{...event,text:'private'}]})),/schema/);
});
test('page labels and role user cannot confer author or source trust',()=>{
 for(const change of [{actorVerified:false},{actorScopeKey:'other'},{role:'assistant'},{kind:'edit'},{sendState:'pending'}])assert.throws(()=>apply(command({events:[{...event,...change}]})),/author/);
 assert.throws(()=>apply(command(),undefined,{...options,channel:'production'}),/channel/);
 assert.throws(()=>apply(command({sources:[{...source,channel:'production'}]})),/source/);
 assert.throws(()=>apply(command({hints:[{...hint,hintType:'updated_at'}]})),/hint/);
});
test('precision never becomes exact midnight; future and unknown sends are rejected',()=>{
 const interval={...event,sentAt:null,precision:'day',sentInterval:{from:'2026-10-12T00:00:00Z',through:'2026-10-12T23:59:59Z'}};assert.equal(apply(command({events:[interval]})).events.send.sentAt,null);
 for(const change of [{sentAt:'2026-10-14T00:00:00Z'},{sentAt:null,precision:'unknown'},{precision:'day',sentInterval:interval.sentInterval}])assert.throws(()=>apply(command({events:[{...event,...change}]})));
});
test('polling same event key cannot renew observation or TTL even with newer source revision',()=>{
 let s=apply(command({hints:[hint]}));const before=s.hints.hint;
 s=apply(command({sources:[{...source,sourceRevision:2,observedAt:'2026-10-13T12:05:00Z',validUntil:'2026-10-13T14:00:00Z'}],hints:[{...hint,id:'new-hint',sourceRevision:2,observedAt:'2026-10-13T12:05:00Z',validUntil:'2026-10-13T14:00:00Z'}]}),s,{...options,now:'2026-10-13T12:05:00Z'});
 assert.deepEqual(s.hints,{hint:before});assert.equal(s.sources.source.sourceRevision,2);
 assert.throws(()=>apply(command({sources:[],hints:[{...hint,conversationId:'other'}]}),s),/event-conflict/);
});
test('revocation cannot be undone by replay or restoration of a source grant',()=>{
 const s=apply(command({events:[event],hints:[hint]}));const revoked=apply({type:'REVOKE_FREE_EVIDENCE_SOURCE',sourceId:'source'},s);
 assert.equal(revoked.events.send.sentAt,now);assert.equal(revoked.sources.source.revoked,true);assert.equal(s.sources.source.revoked,false);
 assert.throws(()=>apply(command(),revoked),/replay/);assert.throws(()=>apply(command({sources:[],events:[event]}),revoked),/inactive/);
});
test('source and evidence revision conflicts fail atomically, coverage gaps are bounded',()=>{
 const s=apply(command({events:[event]}));const before=JSON.stringify(s);
 assert.throws(()=>apply(command({events:[{...event,sentAt:'2026-10-12T00:00:00Z'}]}),s),/immutable/);assert.equal(JSON.stringify(s),before);
 const c={...witness,id:'coverage',conversationId:'chat',from:'2026-10-12T00:00:00Z',through:now,completeness:'complete',branches:'all',gaps:[]};assert.ok(apply(command({coverage:[c]})).coverage.coverage);
 assert.throws(()=>apply(command({coverage:[{...c,gaps:[{from:'2026-10-11T00:00:00Z',through:now}]}]})),/gap/);
});
