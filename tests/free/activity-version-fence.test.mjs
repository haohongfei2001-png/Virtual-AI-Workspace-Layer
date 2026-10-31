import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A,B} from '../b23/contracts.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {FreeEvidenceRepository,freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {initialFreeTimePolicy} from '../../src/data/free-time-policy.mjs';
import {evidenceRequest} from './evidence-contracts.mjs';
import {digest} from '../../src/data/hash.mjs';
const now='2026-10-13T12:00:00Z',key=emptyNativeFacts(A).scopeKey;
const versions=(n=0,e=0)=>({nativeRevision:n,evidenceRevision:e});
const request=(revision=0,operationId='policy')=>({operationId,expectedRevision:revision,command:{type:'SET_PREFERENCE',id:'freeTimePolicy',value:initialFreeTimePolicy()}});
const nativeRequest=()=>({operationId:'native',expectedRevision:0,batch:{scopeKey:key,sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id:'T0',nativeTitle:'Original',nativeUrl:'https://vaiwl-hf.test/hf/A/c/T0',availability:'available'}],membership:[{id:'T0',state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}});
async function setup(t){const h=await harness(new MockIDBFactory(),{seed:false});await h.base.open();t.after(()=>h.close());h.native=new NativeRepository({baseRepository:h.base,observationGate:()=>({channel:'synthetic',sourceId:'native_fixture',generation:'one'}),clock:()=>now});h.evidence=new FreeEvidenceRepository({baseRepository:h.base,observationGate:()=>({channel:'synthetic',sourceId:'evidence_fixture',generation:'first'}),clock:()=>now});h.stores=h.factory.databasesMap.get(h.name).stores;h.dump=()=>structuredClone([...h.stores].map(([n,s])=>[n,[...s.rows]]));h.seed=async()=>{assert.equal((await h.native.apply(A,nativeRequest())).ok,true);assert.equal((await h.evidence.apply(A,evidenceRequest())).ok,true);};return h;}
const command=(h,r=request(),v=versions(),extra={})=>h.repo.command(A,r,{expectedActivityVersions:v,...extra});
test('MOCK_IDB fresh absent activity roots admit only the human time-policy command at zero',async t=>{const h=await setup(t);assert.equal((await command(h)).ok,true);assert.deepEqual((await h.repo.read(A)).state.preferences.freeTimePolicy.value,initialFreeTimePolicy());assert.equal((await h.repo.read(B)).state.revision,0);for(const [r,extra] of [[{...request(1,'bad'),command:{type:'CREATE_WORKSPACE',id:'x',name:'x'}},{}],[request(1,'candidate'),{actor:'candidate'}]])await assert.rejects(command(h,r,versions(),extra),/invalid-activity-fenced-command/);});
for(const changed of ['native','evidence'])test('MOCK_IDB '+changed+' revision advance rejects without any store write',async t=>{const h=await setup(t);if(changed==='native')assert.equal((await h.native.apply(A,nativeRequest())).ok,true);else assert.equal((await h.evidence.apply(A,evidenceRequest())).ok,true);const before=h.dump();assert.equal((await command(h)).reason,'activity-revision-conflict');assert.deepEqual(h.dump(),before);});
for(const format of ['legacy','partitioned','indexed-directory'])test('MOCK_IDB fence accepts matching '+format+' activity roots and shared policy storage',async t=>{
 const h=await setup(t);await h.seed();let n=1,e=1,w=0;
 if(format==='legacy'){for(const [k,payload] of [[key,await h.native.read(A)],[freeEvidenceKey(key),await h.evidence.read(A)]])h.stores.get('native_states').rows.set(k,{key:k,payload,checksum:digest(payload)});}
 else {assert.equal((await command(h,request(),versions(n,e))).ok,true);assert.equal((await h.repo.migratePartitioned(A)).ok,true);w=(await h.repo.read(A)).state.revision;}
 if(format==='indexed-directory'){assert.equal((await h.native.migrateVersionIndex(A,{operationId:'index',expectedRevision:n})).ok,true);n++;const er=await h.evidence.migrateRefDirectory(A,{operationId:'directory',expectedRevision:e});assert.equal(er.ok,true,JSON.stringify(er));e++;assert.equal((await h.repo.migrateSharedDirectory(A,{operationId:'shared-directory',expectedRevision:w})).ok,true);w++;}
 const before=await h.repo.read(A);const result=await command(h,request(w,'final'),versions(n,e));assert.equal(result.ok,true,JSON.stringify(result));const after=await h.repo.read(A);assert.deepEqual(after.state.workspaces,before.state.workspaces);assert.equal(after.state.revision,w+1);
});
for(const kind of ['native','evidence'])for(const damage of ['root-checksum','marker-checksum','root-missing','marker-missing','scope','root-key','marker-revision'])test(`MOCK_IDB ${kind} ${damage} refuses policy without overwriting damaged records`,async t=>{
 const h=await setup(t);await h.seed();const k=kind==='native'?key:freeEvidenceKey(key),roots=h.stores.get('native_states').rows,markers=h.stores.get('native_operations').rows;
 if(damage==='root-missing')roots.delete(k);else if(damage==='marker-missing')markers.delete(k);else{const table=damage.startsWith('marker')?markers:roots,row=structuredClone(table.get(k));if(damage.endsWith('checksum'))row.checksum='damaged';else{if(damage==='scope')row.payload.scopeKey=emptyNativeFacts(B).scopeKey;else if(damage==='root-key')row.key='other';else row.payload.revision++;row.checksum=digest(row.payload);}table.set(k,row);}
 const before=h.dump(),result=await command(h,request(),versions(1,1));assert.equal(result.ok,false,JSON.stringify(result));assert.deepEqual(h.dump(),before);
});
test('MOCK_IDB receipt replay precedes changed activity roots but different captured versions conflict',async t=>{const h=await setup(t),r=request();const first=await command(h,r);assert.equal(first.ok,true);await h.seed();const before=h.dump(),replay=await command(h,r);assert.equal(replay.replayed,true);assert.equal(replay.revision,first.revision);assert.equal((await command(h,r,versions(1,1))).reason,'operation-replay-conflict');assert.deepEqual(h.dump(),before);});
test('MOCK_IDB awaiting connection freezes caller policy and version precondition for application and receipt',async t=>{
 const h=await setup(t),original=h.base.open.bind(h.base);let release;h.base.open=()=>new Promise(r=>release=()=>r(original()));const r=request(),v=versions(),originalRequest=structuredClone(r),job=command(h,r,v);r.command.value.H=7;r.command.id='workingSet';v.nativeRevision=99;release();assert.equal((await job).ok,true);h.base.open=original;assert.equal((await h.repo.read(A)).state.preferences.freeTimePolicy.value.H,30);assert.equal((await command(h,originalRequest)).replayed,true);
});
for(const failure of ['quota','guard'])test('MOCK_IDB activity-fenced '+failure+' rolls back roots receipts and checkpoints',async t=>{const h=await setup(t);await h.seed();const before=h.dump();let checks=0;if(failure==='quota')h.factory.failNextPut=true;const result=await command(h,request(),versions(1,1),{guard:()=>failure!=='guard'||++checks<5});assert.equal(result.ok,false);assert.deepEqual(h.dump(),before);});
test('MOCK_IDB a successful time-policy fence preserves existing human workspace and preferences',async t=>{const h=await setup(t);assert.equal((await h.repo.command(A,{operationId:'manual',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'manual',name:'Human project'}})).ok,true);assert.equal((await h.repo.command(A,{operationId:'sidebar',expectedRevision:1,command:{type:'SET_PREFERENCE',id:'sidebarVisible',value:false}})).ok,true);const before=(await h.repo.read(A)).state;assert.equal((await command(h,request(2))).ok,true);const after=(await h.repo.read(A)).state;assert.deepEqual(after.workspaces,before.workspaces);assert.deepEqual(after.preferences.sidebarVisible,before.preferences.sidebarVisible);assert.deepEqual(after.identities,before.identities);assert.deepEqual(after.placements,before.placements);});
for(const value of [{nativeRevision:-1,evidenceRevision:0},{nativeRevision:0,evidenceRevision:0,scope:'other'},{nativeRevision:0},{nativeRevision:0,evidenceRevision:1.5}])test('MOCK_IDB malformed activity-version precondition fails before writing '+JSON.stringify(value),async t=>{const h=await setup(t),before=h.dump();await assert.rejects(command(h,request(),value),/invalid-activity-version-precondition/);assert.deepEqual(h.dump(),before);});

test('MOCK_IDB activity version accessors are rejected without invoking caller code',async t=>{
 const h=await setup(t),before=h.dump();let reads=0;
 const value={get nativeRevision(){reads++;return reads<3?0:-1;},evidenceRevision:0};
 await assert.rejects(command(h,request(),value),/invalid-activity-version-precondition/);
 assert.equal(reads,0);assert.deepEqual(h.dump(),before);
});
