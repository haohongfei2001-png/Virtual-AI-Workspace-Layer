import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {emptyNativeFacts,applyNativeObservations,invalidateNativeSource,validateNativeFacts} from '../../src/data/native-facts.mjs';
import {freeProjection} from '../../src/data/free-projection.mjs';
const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'fixture',organizationId:'personal'});
const NOW='2026-10-14T00:00:00Z',EXPIRY='2026-10-14T00:01:00Z',LATER='2026-10-14T00:02:00Z';
const admission={profileId:'explicit-test-reconstruction',profileVersion:1,evidenceClass:'surface',semanticFingerprint:'a'.repeat(64),acceptedAt:NOW};
const p=id=>({id,nativeName:'Native '+id,nativeUrl:`https://chatgpt.com/g/${id}/project`,availability:'available',memberCount:id==='p'?1:0});
const r=id=>({id,nativeTitle:'Native '+id,nativeUrl:`https://chatgpt.com/c/${id}`,availability:'available'});
const batch=(patch={})=>({scopeKey:scope.key,sourceRevision:1,observedAt:NOW,validUntil:EXPIRY,projects:[p('p'),p('empty')],refs:[r('member'),r('ordinary'),r('unknown')],membership:[{id:'member',state:'PROJECT',projectId:'p'},{id:'ordinary',state:'NONE',projectId:null},{id:'unknown',state:'UNKNOWN',projectId:null}],inventory:{projects:'complete',conversations:'complete',cursor:null},...patch});
const authority=(channel='host-dom',now=NOW)=>({scope,channel,sourceId:'fixture_source',generation:'first',now,...(channel==='host-dom'?{admission}:{})});
const seed=channel=>applyNativeObservations(emptyNativeFacts(scope),batch(),authority(channel));
const view=(facts,now=NOW)=>freeProjection(facts,{scope,now});

test('host-dom TTL boundary retains native names, empty Projects and known membership without current completeness',()=>{
 const facts=seed(),bytes=JSON.stringify(facts),current=view(facts,'2026-10-14T00:00:59.999Z');
 assert.equal(current.projects[0].freshness,'current');assert.equal(current.refs[0].freshness,'current');assert.equal(current.projects[0].membershipComplete,true);
 const stale=view(facts,EXPIRY);assert.deepEqual(stale.projects.map(x=>x.id),['p','empty']);
 assert.equal(stale.projects[0].nativeName,'Native p');assert.equal(stale.projects[0].nativeUrl,facts.projects.p.nativeUrl);assert.equal(stale.projects[0].freshness,'last-known');
 assert.equal(stale.projects[0].membershipComplete,false);assert.equal(stale.projects[0].membershipWitnessCurrent,false);
 assert.equal(stale.refs[0].nativeTitle,'Native member');assert.equal(stale.refs[0].freshness,'last-known');assert.equal(stale.refs[0].membership,'PROJECT');assert.equal(stale.refs[0].membershipWitnessCurrent,false);
 assert.deepEqual(stale.projects[0].members.map(x=>x.id),['member']);assert.deepEqual(stale.noProject.map(x=>x.id),['ordinary']);assert.deepEqual(stale.unknown.map(x=>x.id),['unknown']);assert.equal(JSON.stringify(facts),bytes);
});
test('synthetic TTL behavior remains unchanged',()=>{
 const stale=view(seed('synthetic'),EXPIRY);assert.deepEqual(stale.projects,[]);assert(stale.refs.every(x=>x.nativeTitle===null&&x.membership==='UNKNOWN'));assert.deepEqual(stale.noProject,[]);
});
test('source-only partial update cannot extend old row freshness or member completeness',()=>{
 const facts=applyNativeObservations(seed(),batch({sourceRevision:2,observedAt:'2026-10-14T00:00:30Z',validUntil:LATER,projects:[p('q')],refs:[],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}}),authority('host-dom','2026-10-14T00:00:30Z'));
 const stale=view(facts,EXPIRY);assert.equal(stale.projects.find(x=>x.id==='q').freshness,'current');assert.equal(stale.projects.find(x=>x.id==='p').freshness,'last-known');assert.equal(stale.refs[0].freshness,'last-known');assert.equal(stale.refs[0].membershipWitnessCurrent,false);assert(stale.projects.every(x=>x.membershipComplete===false));
});
test('expired source cannot leave a longer-lived row current',()=>{
 const facts=seed();for(const table of ['projects','refs','membership'])for(const row of Object.values(facts[table]))row.validUntil=LATER;validateNativeFacts(facts,scope);
 const stale=view(facts,EXPIRY);assert.equal(stale.projects[0].freshness,'last-known');assert.equal(stale.refs[0].freshness,'last-known');assert.equal(stale.projects[0].membershipComplete,false);
});
test('explicit source revocation and unavailable native objects never revive as last-known',()=>{
 const revoked=invalidateNativeSource(seed(),'fixture_source',scope),hidden=view(revoked,EXPIRY);assert.deepEqual(hidden.projects,[]);assert.deepEqual(hidden.refs,[]);
 const unavailable=seed();unavailable.projects.p.availability='unavailable';unavailable.refs.member.availability='unavailable';
 const result=view(unavailable,EXPIRY);assert(!result.projects.some(x=>x.id==='p'));assert(!result.refs.some(x=>x.id==='member'));
});
test('future observations cannot acquire last-known names or relationships',()=>{
 const facts=seed();for(const table of ['sources','projects','refs','membership'])for(const row of Object.values(facts[table])){row.observedAt=EXPIRY;row.validUntil=LATER;}
 validateNativeFacts(facts,scope);const result=view(facts,NOW);assert.deepEqual(result.projects,[]);assert(result.refs.every(x=>x.nativeTitle===null&&x.membership==='UNKNOWN'));
});
test('invalid admission, cross-scope and orphan generation cannot be rescued by last-known projection',()=>{
 const invalid=seed();delete invalid.sources.fixture_source.admission;assert.throws(()=>view(invalid,EXPIRY));
 const generation=seed();generation.refs.member.generation='other';assert.throws(()=>view(generation,EXPIRY),/orphan-native-witness/);
 const other=normalizedScope({...scope,accountId:'other'});assert.throws(()=>freeProjection(seed(),{scope:other,now:EXPIRY}),/invalid-native-facts/);
});
for(const state of ['UNKNOWN','NONE','PROJECT'])test(`fresh explicit ${state} supersedes an old host membership`,()=>{
 const facts=applyNativeObservations(seed(),batch({sourceRevision:2,observedAt:EXPIRY,validUntil:LATER,projects:[p('q')],refs:[r('member')],membership:[{id:'member',state,projectId:state==='PROJECT'?'q':null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}),authority('host-dom',EXPIRY));
 const result=view(facts,EXPIRY),member=result.refs.find(x=>x.id==='member');assert.equal(member.membership,state);assert.equal(member.projectId,state==='PROJECT'?'q':null);assert.equal(member.freshness,'current');assert.equal(result.projects.find(x=>x.id==='p').members.length,0);
});

for(const stalePart of ['project','ref','membership','all'])test(`paged replica cannot recertify complete membership with last-known ${stalePart}`,async()=>{
 const {assembleFreeReplica}=await import('../../src/data/free-replica.mjs');
 const {projectFreeActivity}=await import('../../src/data/free-activity.mjs');
 const {createFreeViewSession}=await import('../../src/data/free-time-policy.mjs');
 const facts=seed();delete facts.projects.empty;for(const id of ['ordinary','unknown']){delete facts.refs[id];delete facts.membership[id];}
 facts.sources.fixture_source.validUntil=LATER;
 for(const [table,part]of [['projects','project'],['refs','ref'],['membership','membership']])for(const row of Object.values(facts[table]))if(stalePart!=='all'&&stalePart!==part)row.validUntil=LATER;
 validateNativeFacts(facts,scope);
 const projected=freeProjection(facts,{scope,now:EXPIRY});assert.equal(projected.projects[0].membershipComplete,false);assert.equal(projected.refs[0].membership,'PROJECT');
 const viewSession=createFreeViewSession({now:EXPIRY,timeZone:'UTC'}),active=projectFreeActivity(projected,{scopeKey:scope.key,events:{},hints:{},coverage:{},sources:{}},viewSession,EXPIRY);
 const header={scope:scope.key,revision:facts.revision,evidenceRevision:'0:0',workspaceRevision:0,viewRevision:0,evaluatedAt:EXPIRY,viewSession,inventoryComplete:true,manifest:{projectVersions:{p:1},refVersions:{member:1}}};
 // Separate project/ref pages exactly exercise reassembly's complete-inventory
 // fast path (no UNKNOWN row to incidentally prevent its recertification).
 const pages=[{scope:scope.key,revision:facts.revision,projects:active.projects.map(project=>({...project,members:[]})),refs:[]},{scope:scope.key,revision:facts.revision,projects:[],refs:active.refs}];
 const replica=assembleFreeReplica(null,header,pages).snapshot;
 assert.deepEqual(replica.unknown,[]);assert.equal(replica.projects[0].members.length,1);
 assert.equal(replica.projects[0].membershipComplete,false,'inventory count and matching witness revisions cannot upgrade stale member evidence');
 assert.equal(replica.projects[0].freshness,projected.projects[0].freshness);assert.equal(replica.refs[0].freshness,projected.refs[0].freshness);assert.equal(replica.refs[0].membershipWitnessCurrent,false);
});

test('future host source cannot mark old rows current through the legacy active predicate',()=>{
 const facts=seed();facts.sources.fixture_source.observedAt=EXPIRY;facts.sources.fixture_source.validUntil=LATER;
 const result=view(facts,NOW);assert.deepEqual(result.projects,[]);assert(result.refs.every(row=>row.nativeTitle===null&&row.membership==='UNKNOWN'));
});
test('positive NONE membership expiry remains explicitly last-known when the title is fresh',()=>{
 const facts=seed();facts.sources.fixture_source.validUntil=LATER;facts.refs.ordinary.validUntil=LATER;
 const row=view(facts,EXPIRY).noProject[0];assert.equal(row.nativeTitle,'Native ordinary');assert.equal(row.freshness,'current');assert.equal(row.membershipFreshness,'last-known');assert.equal(row.membershipWitnessCurrent,false);
});
