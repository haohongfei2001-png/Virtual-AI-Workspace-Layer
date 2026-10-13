import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A,B} from '../b23/contracts.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {continuationSemanticFingerprint} from '../../src/data/native-observation-continuation.mjs';
import {digest} from '../../src/data/hash.mjs';
const NOW='2026-10-13T12:00:00Z';
// Explicit MOCK_IDB owner admissions; no browser ACK or live account certification.
async function setup(t){
 const h=await harness(new MockIDBFactory()),gates=new WeakMap();t.after(()=>h.close());
 const native=new NativeRepository({baseRepository:h.base,workspaceRepository:h.repo,clock:()=>NOW,hostObservationGate:(scope,request)=>scope.key===h.base.scopeOrThrow(A).key?gates.get(request):undefined});
 function make(operationId='native_ack',expectedRevision=0){
  const scopeKey=h.base.scopeOrThrow(A).key,sourceId='host_ack',generation='generation_one';
  const request={operationId,expectedRevision,batch:{scopeKey,sourceRevision:expectedRevision+1,observedAt:NOW,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id:'continuation_ref',nativeTitle:'Native title',nativeUrl:'https://vaiwl-hf.test/hf/A/c/continuation_ref',availability:'available'}],membership:[{id:'continuation_ref',state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}};
  const batch={sources:[{id:sourceId,generation,sourceRevision:1,observedAt:NOW,validUntil:'2026-10-14T00:00:00Z',channel:'host-evidence',codecVersion:1,profileId:'profile_one',profileVersion:1}],events:[],coverage:[],hints:[{id:'anchor_one',sourceId,generation,sourceRevision:1,observedAt:NOW,conversationId:'continuation_ref',eventKey:'ref_message',hintType:'observed-self-send',anchorVersion:1,messageId:'message_one',firstObservedAt:NOW,candidateInterval:{from:'2026-10-13T11:59:59Z',through:NOW},clockBasis:'local-bounded',calibrationDueAt:'2026-10-13T12:01:00Z',actorVerified:true,actorScopeKey:scopeKey,ackWitness:{kind:'authenticated-message-readback',profileId:'profile_one',profileVersion:1,semanticFingerprint:digest(['continuation_ref','message_one'])}}]};
  const admission={profileId:'profile_one',profileVersion:1,evidenceClass:'surface',semanticFingerprint:digest(request.batch),acceptedAt:NOW};
  const gate={channel:'host-dom',sourceId,generation,guard:()=>true,admission,continuation:{evidenceOperationId:'evidence_ack',expectedEvidenceRevision:0,batch},continuationAdmission:{...admission,evidenceClass:'observed-self-send',semanticFingerprint:continuationSemanticFingerprint(batch)}};
  gates.set(request,gate);return {request,gate};
 }
 return {...h,native,make,gates};
}
async function empty(h){assert.equal((await h.native.read(A)).revision,0);assert.deepEqual(await h.native.listContinuations(A),[]);assert.equal((await h.repo.read(A)).state.refs.continuation_ref,undefined);}
test('MOCK_IDB native, shared anchor and pending evidence commit together; replay remains single and scoped',async t=>{
 const h=await setup(t),before=(await h.repo.read(A)).state,{request,gate}=h.make();
 assert.equal((await h.native.apply(A,request)).ok,true);const rows=await h.native.listContinuations(A);assert.equal(rows.length,1);assert.equal(rows[0].operationId,request.operationId);assert.equal(rows[0].nativeRevision,1);assert.equal(rows[0].admission.acceptedAt,NOW);assert.deepEqual(rows[0].evidence,{operationId:'evidence_ack',expectedRevision:0,batch:gate.continuation.batch});assert.equal((await h.native.read(A)).refs.continuation_ref.nativeTitle,'Native title');
 const after=(await h.repo.read(A)).state;assert(after.refs.continuation_ref);for(const key of ['workspaces','identities','placements','preferences'])assert.deepEqual(after[key],before[key]);assert.equal(h.factory.databasesMap.size,1);
 assert.equal((await h.native.apply(A,request)).replayed,true);assert.deepEqual(await h.native.listContinuations(A),rows);assert.deepEqual(await h.native.listContinuations(B),[]);
 gate.continuation.batch.hints[0].calibrationDueAt='2026-10-13T12:02:00Z';assert.equal((await h.native.apply(A,request)).reason,'operation-replay-conflict');assert.deepEqual(await h.native.listContinuations(A),rows);
 request.batch.refs[0].nativeTitle='Different payload';assert.equal((await h.native.apply(A,request)).reason,'operation-replay-conflict');assert.deepEqual(await h.native.listContinuations(A),rows);
});
test('MOCK_IDB CAS and shared writer failure leave no native or continuation receipt',async t=>{
 const h=await setup(t),bad=h.make('cas',1);assert.equal((await h.native.apply(A,bad.request)).reason,'revision-conflict');await empty(h);
 const register=h.repo.registerNativeReferences.bind(h.repo);h.repo.registerNativeReferences=(tx,scope,refs,operation,check,done,fail)=>fail(Error('injected-shared-failure'));
 const {request}=h.make();assert.equal((await h.native.apply(A,request)).reason,'injected-shared-failure');await empty(h);h.repo.registerNativeReferences=register;assert.equal((await h.native.apply(A,request)).ok,true);
});
test('MOCK_IDB guard loss after enqueued writes aborts shared, native and directory atomically',async t=>{
 const h=await setup(t),db=await h.base.open(),transaction=db.transaction.bind(db),{request,gate}=h.make();let allowed=true,puts=0;gate.guard=()=>allowed;
 db.transaction=(...args)=>{const tx=transaction(...args),objectStore=tx.objectStore.bind(tx);if(args[1]==='readwrite')tx.objectStore=name=>{const store=objectStore(name),put=store.put.bind(store);store.put=value=>{const result=put(value);puts++;allowed=false;return result;};return store;};return tx;};
 const result=await h.native.apply(A,request);db.transaction=transaction;assert(puts>0);assert.equal(result.ok,false);await empty(h);allowed=true;assert.equal((await h.native.apply(A,request)).ok,true);
});
test('MOCK_IDB serialized continuation and absent exact-object authority cannot authorize',async t=>{
 const h=await setup(t),{request,gate}=h.make();await assert.rejects(h.native.apply(A,structuredClone(request)),/untrusted/);request.continuation=gate.continuation;await assert.rejects(h.native.apply(A,request),/untrusted-native-continuation/);delete request.continuation;await assert.rejects(h.native.apply(B,request),/untrusted/);await empty(h);
});
test('MOCK_IDB continuation source, generation, profile and admission commitment mismatches reject before persistence',async t=>{
 const mutations=[g=>g.continuation.batch.sources[0].id='other',g=>g.continuation.batch.sources[0].generation='other',g=>g.continuation.batch.sources[0].profileId='other',g=>g.continuationAdmission.profileVersion=2,g=>g.continuationAdmission.semanticFingerprint='f'.repeat(64),g=>g.continuationAdmission.acceptedAt='2026-10-13T12:00:01Z'];
 for(const change of mutations){const h=await setup(t),{request,gate}=h.make();change(gate);await assert.rejects(h.native.apply(A,request),/continuation/);await empty(h);}
});
test('MOCK_IDB native and owner continuation are captured before db.open; identical original replay succeeds',async t=>{
 const h=await setup(t),{request,gate}=h.make(),originalRequest=structuredClone(request),originalGate={...gate,admission:structuredClone(gate.admission),continuation:structuredClone(gate.continuation),continuationAdmission:structuredClone(gate.continuationAdmission)},open=h.base.open.bind(h.base);let entered=false,release;const held=new Promise(resolve=>release=resolve);
 h.base.open=async()=>{entered=true;await held;return open();};const pending=h.native.apply(A,request);for(let i=0;i<40&&!entered;i++)await Promise.resolve();assert(entered);
 request.batch.refs[0].nativeTitle='Mutated';gate.continuation.batch.sources[0].id='forged';gate.continuation.batch.hints[0].ackWitness.semanticFingerprint='f'.repeat(64);gate.continuation.batch.hints[0].candidateInterval.from='2026-10-13T11:59:40Z';gate.continuationAdmission.acceptedAt='2026-10-13T11:59:00Z';release();const result=await pending;h.base.open=open;assert.equal(result.ok,true,JSON.stringify(result));assert.equal((await h.native.read(A)).refs.continuation_ref.nativeTitle,'Native title');assert.deepEqual((await h.native.listContinuations(A))[0].evidence.batch,originalGate.continuation.batch);
 h.gates.set(originalRequest,originalGate);assert.equal((await h.native.apply(A,originalRequest)).replayed,true);assert.equal((await h.native.listContinuations(A)).length,1);
});

test('MOCK_IDB quota failure cannot leave pending continuation or consume operation identity',async t=>{const h=await setup(t),{request}=h.make();h.factory.failNextPut=true;assert.equal((await h.native.apply(A,request)).ok,false);await empty(h);assert.equal((await h.native.apply(A,request)).ok,true);assert.equal((await h.native.listContinuations(A)).length,1);});
async function damage(h,edit){const db=await h.base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('native_operations','readwrite'),store=tx.objectStore('native_operations');edit(store);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
function rewrite(store,key,transform){const q=store.get(key);q.onsuccess=()=>{assert(q.result);const row=structuredClone(q.result);transform(row.payload);row.checksum=digest(row.payload);store.put(row);};}
test('MOCK_IDB deleting either directory half fails closed rather than returning empty pending work',async t=>{
 for(const half of ['directory','marker']){const h=await setup(t),{request}=h.make();assert.equal((await h.native.apply(A,request)).ok,true);const key=JSON.stringify([h.base.scopeOrThrow(A).key,'native-continuations',half]);await damage(h,s=>s.delete(key));await assert.rejects(h.native.listContinuations(A),/missing-native-continuation-directory/);assert.equal((await h.native.read(A)).revision,1);}
});
test('MOCK_IDB pending receipt tampering and signed directory size mismatch cannot hide damaged work',async t=>{
 for(const mode of ['receipt','size']){const h=await setup(t),{request}=h.make();assert.equal((await h.native.apply(A,request)).ok,true);const scope=h.base.scopeOrThrow(A).key;
  await damage(h,store=>{if(mode==='receipt')rewrite(store,JSON.stringify([scope,request.operationId]),payload=>{payload.continuation.evidence.batch.hints[0].calibrationDueAt='2026-10-13T12:03:00Z';});else{const dirKey=JSON.stringify([scope,'native-continuations','directory']),markerKey=JSON.stringify([scope,'native-continuations','marker']);const q=store.get(dirKey);q.onsuccess=()=>{const row=structuredClone(q.result);row.payload.entries[request.operationId]++;row.checksum=digest(row.payload);store.put(row);rewrite(store,markerKey,marker=>{marker.directoryDigest=digest(row.payload);});rewrite(store,scope,marker=>{marker.continuations.directoryDigest=digest(row.payload);});};}});
  await assert.rejects(h.native.listContinuations(A),/invalid-native-continuation-digest|native-continuation-directory-conflict/);assert.equal((await h.native.read(A)).revision,1);
 }
});

test('MOCK_IDB root witness detects simultaneous queue directory and marker loss on read and append',async t=>{
 const h=await setup(t),first=h.make();assert.equal((await h.native.apply(A,first.request)).ok,true);const scope=h.base.scopeOrThrow(A).key;
 await damage(h,store=>{for(const suffix of ['directory','marker'])store.delete(JSON.stringify([scope,'native-continuations',suffix]));});
 await assert.rejects(h.native.listContinuations(A),/missing-native-continuation-directory/);
 const next=h.make('after_loss',1);assert.equal((await h.native.apply(A,next.request)).reason,'missing-native-continuation-directory');assert.equal((await h.native.read(A)).revision,1);
});
test('MOCK_IDB ordinary native writes, source revocation and index migration retain root continuation witness',async t=>{
 const h=await setup(t),first=h.make();assert.equal((await h.native.apply(A,first.request)).ok,true);const pending=await h.native.listContinuations(A);
 const next=h.make('ordinary_native',1);delete next.gate.continuation;delete next.gate.continuationAdmission;assert.equal((await h.native.apply(A,next.request)).ok,true);assert.deepEqual(await h.native.listContinuations(A),pending);
 assert.equal((await h.native.invalidate(A,{operationId:'revoke_source',expectedRevision:2,sourceId:'host_ack'})).ok,true);assert.deepEqual(await h.native.listContinuations(A),pending);
 const migration=await h.native.migrateVersionIndex(A,{operationId:'index_migration',expectedRevision:3});assert.equal(migration.ok,true,JSON.stringify(migration));assert.deepEqual(await h.native.listContinuations(A),pending);assert.equal((await h.native.read(A)).sources.host_ack.revoked,true);
});
