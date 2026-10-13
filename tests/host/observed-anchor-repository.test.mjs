import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository,freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {digest} from '../../src/data/hash.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {persistentSeed,syntheticEvidenceGate} from '../../simulator/persistent-seed.mjs';
import {evidenceRequest} from '../free/evidence-contracts.mjs';
const A=scopeOf('A'),B=scopeOf('B'),NOW='2026-10-13T12:00:00Z';
// MOCK_IDB and explicit test-only owner admissions, not a production ACK issuer.
async function fixture(t){let clock=NOW;const factory=new MockIDBFactory(),base=new ScopeRepository({indexedDB:factory,databaseName:'anchor_'+crypto.randomUUID()}),admissions=new WeakMap();await base.open();t.after(()=>base.close());
 const gate=(scope,request)=>admissions.get(request),repo=new FreeEvidenceRepository({baseRepository:base,hostObservationGate:gate,clock:()=>clock});
 const admit=(request,guard=()=>true,patch={})=>{admissions.set(request,{scopeKey:base.scopeOrThrow(A).key,channel:'host-evidence',sourceId:'host_ack',generation:'generation_1',profileId:'ack_profile',profileVersion:1,guard,...patch});return request;};
 return {base,factory,repo,admit,setTime:value=>{clock=value;}};}
function request(operationId='anchor_one',expectedRevision=0){const scopeKey=JSON.stringify(['chatgpt','fixture-A','personal']);
 const witness={sourceId:'host_ack',generation:'generation_1',sourceRevision:1,observedAt:NOW};
 return {operationId,expectedRevision,batch:{sources:[{id:'host_ack',generation:'generation_1',sourceRevision:1,observedAt:NOW,validUntil:'2026-10-14T00:00:00Z',channel:'host-evidence',codecVersion:1,profileId:'ack_profile',profileVersion:1}],events:[],coverage:[],hints:[{...witness,id:'anchor_m',conversationId:'T0',eventKey:'T0_m',hintType:'observed-self-send',anchorVersion:1,messageId:'m',firstObservedAt:NOW,candidateInterval:{from:'2026-10-13T11:59:59Z',through:NOW},clockBasis:'local-bounded',calibrationDueAt:'2026-10-13T12:01:00Z',actorVerified:true,actorScopeKey:scopeKey,ackWitness:{kind:'authenticated-message-readback',profileId:'ack_profile',profileVersion:1,semanticFingerprint:digest({conversation:'T0',message:'m'})}}]}};}
function admitted(h,operationId,revision){const r=request(operationId,revision);r.batch.hints[0].actorScopeKey=h.base.scopeOrThrow(A).key;return h.admit(r);}
test('MOCK_IDB production anchor requires object identity gate; serialized claims cannot authorize',async t=>{
 const h=await fixture(t),r=admitted(h);const ungated=new FreeEvidenceRepository({baseRepository:h.base,clock:()=>NOW});await assert.rejects(ungated.apply(A,r),/untrusted/);await assert.rejects(h.repo.apply(A,structuredClone(r)),/untrusted/);await assert.rejects(h.repo.apply(A,{...structuredClone(r),authority:{channel:'host-evidence'}}),/untrusted/);assert.equal((await h.repo.read(A)).revision,0);assert.equal((await h.repo.apply(A,r)).ok,true);const stored=await h.repo.read(A);assert.equal(stored.hints.anchor_m.hintType,'observed-self-send');assert.equal(stored.hints.anchor_m.sentAt,undefined);await assert.rejects(h.repo.apply(B,r),/untrusted/);assert.equal((await h.repo.read(B)).revision,0);
});
test('MOCK_IDB repeated message preserves first observation interval and calibration due',async t=>{
 const h=await fixture(t),first=admitted(h);assert.equal((await h.repo.apply(A,first)).ok,true);const before=(await h.repo.read(A)).hints.anchor_m;assert.equal((await h.repo.apply(A,first)).replayed,true);
 const later='2026-10-13T12:00:10Z';h.setTime(later);const next=admitted(h,'repeat_new_receipt',1);Object.assign(next.batch.sources[0],{sourceRevision:2,observedAt:later});Object.assign(next.batch.hints[0],{sourceRevision:2,observedAt:later,firstObservedAt:later,candidateInterval:{from:'2026-10-13T12:00:09Z',through:later},calibrationDueAt:'2026-10-13T12:10:00Z'});assert.equal((await h.repo.apply(A,next)).ok,true);assert.deepEqual((await h.repo.read(A)).hints.anchor_m,before);
 const conflict=admitted(h,'conflicting_ack',2);conflict.batch.sources[0]=structuredClone(next.batch.sources[0]);conflict.batch.hints[0]=structuredClone(next.batch.hints[0]);conflict.batch.hints[0].ackWitness.semanticFingerprint='f'.repeat(64);const result=await h.repo.apply(A,conflict);assert.equal(result.ok,false);assert.equal(result.reason,'immutable-free-anchor-conflict');assert.equal((await h.repo.read(A)).revision,2);
});
test('MOCK_IDB revoked source cannot accept new or repeated anchor admission',async t=>{
 const h=await fixture(t);assert.equal((await h.repo.apply(A,admitted(h))).ok,true);assert.equal((await h.repo.invalidate(A,{operationId:'revoke',expectedRevision:1,sourceId:'host_ack'})).ok,true);const result=await h.repo.apply(A,admitted(h,'revoked_replay',2));assert.equal(result.ok,false);assert.match(result.reason,/revoked/);assert.equal((await h.repo.read(A)).sources.host_ack.revoked,true);
});
test('MOCK_IDB damaged-root repair revokes sources and cannot restore replay authority',async t=>{
 const h=await fixture(t);assert.equal((await h.repo.apply(A,admitted(h))).ok,true);const db=await h.base.open(),key=freeEvidenceKey(h.base.scopeOrThrow(A).key);let damaged;
 await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),q=store.get(key);q.onsuccess=()=>{damaged={...q.result,checksum:'damaged'};store.put(damaged);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const repaired=await h.repo.recover(A,{operationId:'manual_repair',damagedHash:digest(damaged)});assert.equal(repaired.ok,true,JSON.stringify(repaired));const state=await h.repo.read(A);assert.equal(state.sources.host_ack.revoked,true);const result=await h.repo.apply(A,admitted(h,'post_repair',state.revision));assert.equal(result.ok,false);assert.match(result.reason,/revoked/);
});
test('MOCK_IDB guard revoked after writes queued rolls back root pieces and receipt together',async t=>{
 const h=await fixture(t),db=await h.base.open(),transaction=db.transaction.bind(db);let allowed=true,puts=0;
 db.transaction=(...args)=>{const tx=transaction(...args),objectStore=tx.objectStore.bind(tx);if(args[1]==='readwrite')tx.objectStore=name=>{const store=objectStore(name),put=store.put.bind(store);store.put=value=>{const result=put(value);puts++;allowed=false;return result;};return store;};return tx;};
 const r=admitted(h);h.admit(r,()=>allowed);const result=await h.repo.apply(A,r);db.transaction=transaction;assert(puts>0);assert.equal(result.ok,false);assert.equal(result.reason,'stale-binding');assert.equal((await h.repo.read(A)).revision,0);allowed=true;assert.equal((await h.repo.apply(A,r)).ok,true,'aborted operation receipt must not survive');
});
test('MOCK_IDB new host anchor preserves Pro assets and existing synthetic evidence API',async t=>{
 const h=await fixture(t),legacy=new WorkspaceRepository({baseRepository:h.base,evidenceGate:syntheticEvidenceGate});assert.equal((await legacy.initialize(A,persistentSeed(A,'https://vaiwl-hf.test'))).ok,true);const before=(await legacy.read(A)).state;
 assert.equal((await h.repo.apply(A,admitted(h))).ok,true);assert.deepEqual((await legacy.read(A)).state,before);
 const synthetic=new FreeEvidenceRepository({baseRepository:h.base,observationGate:()=>({channel:'synthetic',sourceId:'evidence_fixture',generation:'first'}),clock:()=>NOW});const r=evidenceRequest('legacy_synthetic',1);assert.equal((await synthetic.apply(A,r)).ok,true);assert.equal((await synthetic.read(A)).events.send.sentAt,NOW);assert.deepEqual((await legacy.read(A)).state,before);
});

test('MOCK_IDB same message cannot acquire a second anchor by changing event key or revoked source',async t=>{
 for(const changeSource of [false,true]){const h=await fixture(t);assert.equal((await h.repo.apply(A,admitted(h))).ok,true);const before=(await h.repo.read(A)).hints.anchor_m;let revision=1;
  if(changeSource){assert.equal((await h.repo.invalidate(A,{operationId:'revoke_identity_test',expectedRevision:1,sourceId:'host_ack'})).ok,true);revision=2;}
  const next=admitted(h,'new_message_identity',revision);next.batch.hints[0].id='anchor_other';next.batch.hints[0].eventKey='different_event';
  if(changeSource){next.batch.sources[0].id='host_ack_other';next.batch.hints[0].sourceId='host_ack_other';h.admit(next,()=>true,{sourceId:'host_ack_other'});}
  const result=await h.repo.apply(A,next);assert.equal(result.ok,false);assert.equal(result.reason,'duplicate-free-anchor-message');const stored=await h.repo.read(A);assert.equal(stored.revision,revision);assert.deepEqual(stored.hints.anchor_m,before);assert.equal(Object.keys(stored.hints).length,1);assert.equal(stored.sources.host_ack_other,undefined);
 }
});
test('MOCK_IDB omitted existing source cannot bypass admission ACK profile or version',async t=>{
 const h=await fixture(t);assert.equal((await h.repo.apply(A,admitted(h))).ok,true);const before=await h.repo.read(A);
 for(const patch of [{profileId:'wrong_profile'},{profileVersion:2}]){const next=admitted(h,'wrong_ack_'+Object.keys(patch)[0],1);next.batch.sources=[];Object.assign(next.batch.hints[0].ackWitness,patch);await assert.rejects(h.repo.apply(A,next),/free-evidence-source-gate-mismatch/);assert.deepEqual(await h.repo.read(A),before);}
});
test('MOCK_IDB mutation while db.open waits cannot alter admitted batch or replay fingerprint',async t=>{
 const h=await fixture(t),r=admitted(h),originalRequest=structuredClone(r),originalOpen=h.base.open.bind(h.base);let entered=false,release;
 const held=new Promise(resolve=>release=resolve);h.base.open=async()=>{entered=true;await held;return originalOpen();};const pending=h.repo.apply(A,r);
 for(let i=0;i<40&&!entered;i++)await Promise.resolve();assert.equal(entered,true);
 r.batch.sources[0].id='forged_source';r.batch.sources[0].profileId='forged_profile';r.batch.hints[0].sourceId='forged_source';r.batch.hints[0].ackWitness.semanticFingerprint='f'.repeat(64);r.batch.hints[0].candidateInterval={from:'2026-10-13T11:59:50Z',through:'2026-10-13T11:59:51Z'};r.batch.hints[0].calibrationDueAt='2026-10-13T12:30:00Z';
 release();const result=await pending;h.base.open=originalOpen;assert.equal(result.ok,true,JSON.stringify(result));const state=await h.repo.read(A);assert.deepEqual(state.hints.anchor_m,{...originalRequest.batch.hints[0],revoked:false});assert.equal(state.sources.forged_source,undefined);assert.deepEqual(state.sources.host_ack,{...originalRequest.batch.sources[0],revoked:false});
 h.admit(originalRequest);const replay=await h.repo.apply(A,originalRequest);assert.equal(replay.ok,true,JSON.stringify(replay));assert.equal(replay.replayed,true);assert.equal((await h.repo.read(A)).revision,1);
});
