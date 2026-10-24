import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A,B} from '../b23/contracts.mjs';
import {persistentSeed} from '../../simulator/persistent-seed.mjs';
import {FIXTURE_NOW} from '../../simulator/data.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {syntheticNativeGate} from '../../simulator/native-seed.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {digest} from '../../src/data/hash.mjs';
const key=scope=>normalizedScope(scope).key;
async function setup(){const h=await harness(new MockIDBFactory());assert.equal((await h.command({type:'SET_TITLE',refId:'T0',title:'保留Pro人工资产'})).ok,true);assert.equal((await h.repo.migratePartitioned(A)).ok,true);await h.repo.partitioned.manifest(A);return h;}
async function readRaw(h,scope=A,store='b23_states'){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),r=tx.objectStore(store).get(key(scope));tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});}
async function writeRaw(h,row){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite');tx.objectStore('b23_states').put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
for(const variant of ['checksum','same-checksum-body','resigned-schema'])test(`warm shared manifest cache refuses ${variant} corruption`,async()=>{
 const h=await setup();try{const row=await readRaw(h);if(variant==='checksum')row.checksum='broken';else if(variant==='same-checksum-body')row.payload.units++;else{row.payload.refVersions.T0=row.payload.revision+1;row.checksum=digest(row.payload);}await writeRaw(h,row);
  await assert.rejects(h.repo.partitioned.manifest(A),variant==='resigned-schema'?/invalid-partition-version/:/corrupt-record/);await assert.rejects(h.repo.partitioned.page(A,{offset:0,ids:['T0']}));assert.deepEqual(await readRaw(h),row,'read failure must not repair or re-sign damaged data');
 }finally{h.close();}
});
test('warm cache remains scope-bound even for a valid envelope copied under a different account key',async()=>{
 const h=await setup();try{assert.equal((await h.repo.initialize(B,persistentSeed(B,'https://vaiwl-hf.test'))).ok,true);assert.equal((await h.repo.migratePartitioned(B)).ok,true);const a=await h.repo.partitioned.manifest(A),b=await h.repo.partitioned.manifest(B);assert.notEqual(a.scopeKey,b.scopeKey);
  assert.equal((await h.repo.read(A)).state.identities.T0.title,'保留Pro人工资产');assert.notEqual((await h.repo.read(B)).state.identities.T0.title,'保留Pro人工资产');
  const cross=await readRaw(h,A);cross.key=key(B);await writeRaw(h,cross);await assert.rejects(h.repo.partitioned.manifest(B),/invalid-partition-manifest/);assert.equal((await h.repo.partitioned.manifest(A)).scopeKey,key(A));
 }finally{h.close();}
});
test('mutating a returned warm manifest cannot change future reads or old Pro human assets',async()=>{
 const h=await setup();try{const before=(await h.repo.read(A)).state,manifest=await h.repo.partitioned.manifest(A),pristine=structuredClone(manifest);
  manifest.refVersions.T0=999;manifest.humanRefs.length=0;manifest.sources.fixture_v1.revoked=true;manifest.workspaces.W0.name='caller mutation';manifest.preferences.fake={id:'fake'};
  assert.deepEqual(await h.repo.partitioned.manifest(A),pristine);assert.deepEqual((await h.repo.read(A)).state,before);
  const again=await h.repo.partitioned.manifest(A);assert.notEqual(again,manifest);assert.equal(again.sources.fixture_v1.revoked,false);
 }finally{h.close();}
});
test('registering an already known native ref cannot bypass a warmed but damaged shared manifest',async()=>{
 const h=await setup();try{const beforeNative=await readRaw(h,A,'native_states'),row=await readRaw(h);row.payload.refVersions.T0++;await writeRaw(h,row);
  const native=new NativeRepository({baseRepository:h.base,workspaceRepository:h.repo,observationGate:syntheticNativeGate,clock:()=>FIXTURE_NOW});let error,result;
  try{result=await native.apply(A,{operationId:'known_ref_after_damage',expectedRevision:0,batch:{scopeKey:key(A),sourceRevision:1,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z',projects:[],refs:[{id:'T0',nativeTitle:'原生名',nativeUrl:'https://vaiwl-hf.test/hf/A/c/T0',availability:'available'}],membership:[{id:'T0',state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}});}catch(e){error=e;}
  assert.match(error?.message??result?.reason??'',/corrupt-record/);assert.notEqual(result?.ok,true);assert.deepEqual(await readRaw(h,A,'native_states'),beforeNative);assert.deepEqual(await readRaw(h),row);
 }finally{h.close();}
});
