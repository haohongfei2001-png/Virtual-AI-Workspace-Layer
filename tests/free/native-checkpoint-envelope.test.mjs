import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A} from '../b23/contracts.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts,applyNativeObservations} from '../../src/data/native-facts.mjs';
import {nativeCheckpointKey,nativeRecoveryKey,nativePartitionKey} from '../../src/data/native-partitions.mjs';
import {digest} from '../../src/data/hash.mjs';
const now='2026-10-13T00:00:00Z',scope=emptyNativeFacts(A).scopeKey,checkpoint=nativeCheckpointKey(scope),recovery=nativeRecoveryKey(scope);
const gate={channel:'synthetic',sourceId:'checkpoint_source',generation:'first'};
function batch(revision){return {scopeKey:scope,sourceRevision:revision,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id:'checkpoint_ref',nativeTitle:'原名 '+revision,nativeUrl:'https://fixture.test/c/checkpoint_ref',availability:'available'}],membership:[{id:'checkpoint_ref',state:revision===2?'UNKNOWN':'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}};}
const request=revision=>({operationId:'write_'+revision,expectedRevision:revision-1,batch:batch(revision)});
async function setup(){const h=await harness(new MockIDBFactory());return {...h,native:new NativeRepository({baseRepository:h.base,workspaceRepository:h.repo,observationGate:()=>gate,clock:()=>now})};}
async function raw(h,key,store='native_states'){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),r=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});}
async function put(h,rows){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction([...new Set(rows.map(([s])=>s))],'readwrite');for(const [store,row] of rows)tx.objectStore(store).put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
function checkEnvelope(actual,prior){assert.deepEqual(actual,{...prior,key:checkpoint});assert.equal(actual.checksum,digest(actual.payload));}

test('first write makes no fictitious checkpoint; rename/membership update retains the exact old envelope',async()=>{
 const h=await setup();try{assert.equal((await h.native.apply(A,request(1))).ok,true);assert.equal(await raw(h,checkpoint),undefined);const before=await raw(h,scope),copy=structuredClone(before);
  assert.equal((await h.native.apply(A,request(2))).ok,true);checkEnvelope(await raw(h,checkpoint),copy);assert.deepEqual(before,copy);assert.equal((await h.native.read(A)).refs.checkpoint_ref.nativeTitle,'原名 2');assert.equal((await h.native.read(A)).membership.checkpoint_ref.state,'UNKNOWN');
 }finally{h.close();}
});
test('source revocation changes only new root while checkpoint keeps prior source authority as historical data',async()=>{
 const h=await setup();try{await h.native.apply(A,request(1));const before=await raw(h,scope);assert.equal((await h.native.invalidate(A,{operationId:'revoke',expectedRevision:1,sourceId:gate.sourceId})).ok,true);checkEnvelope(await raw(h,checkpoint),before);assert.equal((await raw(h,scope)).payload.sources[gate.sourceId].revoked,true);assert.equal((await raw(h,checkpoint)).payload.sources[gate.sourceId].revoked,false);
 }finally{h.close();}
});
test('corrupt prior payload is rejected and cannot be re-signed into a valid checkpoint or receipt',async()=>{
 const h=await setup();try{await h.native.apply(A,request(1));await h.native.apply(A,request(2));const beforeCheckpoint=await raw(h,checkpoint),beforeRecovery=await raw(h,recovery),broken=await raw(h,scope);broken.payload.sources[gate.sourceId].sourceRevision=99;await put(h,[['native_states',broken]]);
  const result=await h.native.apply(A,request(3));assert.equal(result.ok,false);assert.equal(result.reason,'corrupt-native-record');assert.deepEqual(await raw(h,scope),broken);assert.deepEqual(await raw(h,checkpoint),beforeCheckpoint);assert.deepEqual(await raw(h,recovery),beforeRecovery);assert.equal(await raw(h,JSON.stringify([scope,'write_3']),'native_operations'),undefined);
 }finally{h.close();}
});
test('legacy v1 migration preserves the complete original v1 envelope as checkpoint',async()=>{
 const h=await setup();try{const payload=applyNativeObservations(emptyNativeFacts(A),batch(1),{scope:A,...gate,now}),root={key:scope,payload,checksum:digest(payload)},marker={revision:1};assert.equal(payload.format,'vaiwl-native-facts-v1');await put(h,[['native_states',root],['native_operations',{key:scope,payload:marker,checksum:digest(marker)}]]);
  assert.equal((await h.native.apply(A,request(2))).ok,true);checkEnvelope(await raw(h,checkpoint),root);assert.equal((await raw(h,scope)).payload.format,'vaiwl-native-partitions-v1');assert.equal((await h.native.read(A)).refs.checkpoint_ref.nativeTitle,'原名 2');
 }finally{h.close();}
});
test('checkpoint put failure rolls back native roots, shared new ref and receipts, allowing a clean retry',async()=>{
 const h=await setup();try{await h.native.apply(A,request(1));const beforeRoot=await raw(h,scope),beforeRecovery=await raw(h,recovery),beforeShared=(await h.repo.read(A)).state,db=await h.base.open(),original=db.transaction.bind(db);let injected=false;
  const next=request(2);next.batch.refs[0].id='new_checkpoint_ref';next.batch.refs[0].nativeUrl='https://fixture.test/c/new_checkpoint_ref';next.batch.membership[0].id='new_checkpoint_ref';
  db.transaction=(stores,mode)=>{const tx=original(stores,mode),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='native_states'&&mode==='readwrite'){const write=store.put.bind(store);store.put=row=>{if(row.key===checkpoint&&!injected){injected=true;throw Error('checkpoint-put-failure');}return write(row);};}return store;};return tx;};
  const failed=await h.native.apply(A,next);db.transaction=original;assert.equal(injected,true);assert.equal(failed.reason,'checkpoint-put-failure');assert.deepEqual(await raw(h,scope),beforeRoot);assert.deepEqual(await raw(h,recovery),beforeRecovery);assert.equal(await raw(h,checkpoint),undefined);assert.deepEqual((await h.repo.read(A)).state,beforeShared);assert.equal(await h.base.get(A,'new_checkpoint_ref'),null);assert.equal(await raw(h,JSON.stringify([scope,'write_2']),'native_operations'),undefined);
  const retry=await h.native.apply(A,next);assert.equal(retry.ok,true,JSON.stringify(retry));assert.equal(retry.replayed,false);checkEnvelope(await raw(h,checkpoint),beforeRoot);
 }finally{h.close();}
});
test('checkpoint GC ordering retains current and previous pieces and retires only older superseded pieces',async()=>{
 const h=await setup();try{let previous;for(let revision=1;revision<=4;revision++){previous=await raw(h,scope);assert.equal((await h.native.apply(A,request(revision))).ok,true);if(previous)checkEnvelope(await raw(h,checkpoint),previous);}
  for(const version of [3,4]){const piece=await raw(h,nativePartitionKey(scope,'refs','checkpoint_ref',version));assert(piece);assert.equal(piece.checksum,digest(piece.payload));assert.equal(piece.payload.row.nativeTitle,'原名 '+version);}
  for(const version of [1,2])assert.equal(await raw(h,nativePartitionKey(scope,'refs','checkpoint_ref',version)),undefined);assert.equal((await h.native.read(A)).revision,4);
 }finally{h.close();}
});
