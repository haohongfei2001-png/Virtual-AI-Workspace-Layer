import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSourceIncarnation as select} from '../../src/runtime/native-source-incarnation.mjs';
const profile={id:'surface',revision:1};
function source(selection,{revoked=false}={}){return {id:selection.sourceId,generation:selection.generation,sourceRevision:8,channel:'host-dom',revoked,admission:{profileId:profile.id,profileVersion:profile.revision}};}
test('persistent source selection rotates only at actual revoked boundary and is deterministic across owners',()=>{const base=select({},profile),sources={[base.sourceId]:source(base)};assert.equal(select(sources,profile).sourceId,base.sourceId);sources[base.sourceId].revoked=true;const next=select(sources,profile);assert.notEqual(next.sourceId,base.sourceId);assert.deepEqual(select(structuredClone(sources),profile),next);sources[next.sourceId]=source(next);assert.equal(select(sources,profile).sourceId,next.sourceId);assert.equal(Object.keys(sources).length,2);});
for(const field of ['channel','generation','profileId','profileVersion','revoked'])test('source selection refuses inconsistent '+field,()=>{const base=select({},profile),row=source(base,{revoked:true});if(field.startsWith('profile'))row.admission[field]='other';else row[field]='other';assert.throws(()=>select({[base.sourceId]:row},profile),/conflict/);});
test('existing source capacity is retained; no source or witness is removed to make room',()=>{const base=select({},profile),sources=Object.fromEntries(Array.from({length:19999},(_,i)=>['unrelated_'+i,{}]));sources[base.sourceId]=source(base,{revoked:true});const before=JSON.stringify(sources);assert.throws(()=>select(sources,profile),/capacity/);assert.equal(JSON.stringify(sources),before);sources[base.sourceId].revoked=false;assert.equal(select(sources,profile).sourceId,base.sourceId);});

test('profile upgrade selects a fresh incarnation without rewriting old facts or source authority',()=>{
 const base=select({},profile),old=source(base),sources={[base.sourceId]:old},before=structuredClone(sources),upgraded={...profile,revision:2};
 const next=select(sources,upgraded);
 assert.notEqual(next.sourceId,base.sourceId);assert.equal(next.sourceRevision,1);assert.equal(next.requiresObservation,true);
 assert.deepEqual(sources,before,'selection cannot mutate, revoke or upgrade old records');
 sources[next.sourceId]={...source(next),admission:{profileId:profile.id,profileVersion:2}};
 assert.deepEqual(select(sources,upgraded),{...next,sourceRevision:9,requiresObservation:false});
 sources[next.sourceId].revoked=true;
 assert.notEqual(select(sources,upgraded).sourceId,next.sourceId,'revoked upgrade cannot be revived');
});
for(const patch of [{generation:'profile_7'},{admission:{profileId:'other',profileVersion:1}},{admission:{profileId:profile.id,profileVersion:3}},{revoked:'unknown'}])test('upgrade refuses inconsistent historical source '+JSON.stringify(patch),()=>{
 const base=select({},profile),old={...source(base),...patch};
 assert.throws(()=>select({[base.sourceId]:old},{...profile,revision:2}),/conflict/);
});
