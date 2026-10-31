import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {evidenceHarness,evidenceRequest} from './evidence-contracts.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {emptyFreeEvidence} from '../../src/data/free-evidence.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {digest} from '../../src/data/hash.mjs';
const A=scopeOf('A'),B=scopeOf('B'),key=freeEvidenceKey(emptyFreeEvidence(A).scopeKey);
async function harness(run){const h=await evidenceHarness(new MockIDBFactory());try{await run(h);}finally{h.close();}}
async function edit(h,storeName,recordKey,change){const db=await h.base.open();await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName),request=store.get(recordKey);request.onsuccess=()=>{const value=change(request.result);if(value===null)store.delete(recordKey);else store.put(value);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function seed(h){assert.equal((await h.repo.apply(A,evidenceRequest())).ok,true);return h.repo.header(A);}

test('MOCK_IDB metadata header has exact public shape for empty, legacy v1 and partitioned v2 roots',()=>harness(async h=>{
 assert.deepEqual(await h.repo.header(A),{revision:0,manifest:null,sources:{}});
 const partitioned=await seed(h);assert.deepEqual(Object.keys(partitioned).sort(),['manifest','revision','sources']);assert.equal(partitioned.revision,1);assert.equal(partitioned.manifest.refVersions.T0,1);assert.deepEqual(partitioned.sources,partitioned.manifest.sources);
 const aggregate=await h.repo.read(A),legacy={...aggregate,format:'vaiwl-free-evidence-v1'};
 await edit(h,'native_states',key,()=>({key,payload:legacy,checksum:digest(legacy)}));
 assert.deepEqual(await h.repo.header(A),{revision:1,manifest:null,sources:legacy.sources});
 const oldQuery=await h.repo.query(A,{header:true});assert.deepEqual(Object.keys(oldQuery).sort(),['evidence','manifest','nextOffset','revision','selectedRefs','total']);assert.equal(oldQuery.total,1);assert.equal(oldQuery.manifest,null);assert.deepEqual(oldQuery.selectedRefs,[]);
}));

test('MOCK_IDB metadata header never enumerates inventory after successful root verification',()=>harness(async h=>{
 await seed(h);const original=h.repo.verifiedRoot.bind(h.repo);let validated=0;
 h.repo.verifiedRoot=(row,scope)=>{const manifest=original(row,scope);validated++;return {...manifest,refVersions:new Proxy(manifest.refVersions,{ownKeys(){throw Error('unexpected-inventory-enumeration');}})};};
 const header=await h.repo.header(A);assert.equal(validated,1);assert.equal(header.revision,1);assert.equal(header.manifest.refVersions.T0,1);
 await assert.rejects(h.repo.query(A,{header:true}),/unexpected-inventory-enumeration/,'legacy internal header keeps its existing inventory semantics');
}));

test('MOCK_IDB metadata header isolates scopes and rejects rekeyed foreign root even with a valid checksum',()=>harness(async h=>{
 const original=await seed(h);assert.deepEqual(await h.repo.header(B),{revision:0,manifest:null,sources:{}});
 const otherKey=freeEvidenceKey(emptyFreeEvidence(B).scopeKey);await edit(h,'native_states',otherKey,()=>({key:otherKey,payload:original.manifest,checksum:digest(original.manifest)}));
 await assert.rejects(h.repo.header(B),/invalid-free-evidence-manifest/);assert.equal((await h.repo.header(A)).revision,1);
}));

for(const mode of ['checksum','signed-schema'])test(`MOCK_IDB warm metadata header rejects corrupt root (${mode})`,()=>harness(async h=>{
 await seed(h);await edit(h,'native_states',key,row=>{if(mode==='checksum')row.checksum='bad';else{row.payload.revision=-1;row.checksum=digest(row.payload);}return row;});
 await assert.rejects(h.repo.header(A),/corrupt|invalid/);
}));

for(const mode of ['missing','checksum','revision'])test(`MOCK_IDB metadata early return still awaits commit marker (${mode})`,()=>harness(async h=>{
 await seed(h);await edit(h,'native_operations',key,row=>{if(mode==='missing')return null;if(mode==='checksum')row.checksum='bad';else{row.payload.revision++;row.checksum=digest(row.payload);}return row;});
 await assert.rejects(h.repo.header(A),/marker|corrupt|revision-conflict/);
}));

test('MOCK_IDB missing root with surviving marker is rejected by metadata header',()=>harness(async h=>{
 await seed(h);await edit(h,'native_states',key,()=>null);await assert.rejects(h.repo.header(A),/missing-free-evidence-root/);
}));

test('MOCK_IDB metadata header keeps guard fences before root, at marker and before return',()=>harness(async h=>{
 await seed(h);
 for(const stopAt of [1,2,3,4]){let checks=0;await assert.rejects(h.repo.header(A,{guard:()=>++checks<stopAt}),/stale-binding/);assert.equal(checks,stopAt);}
 const signal=new AbortController();signal.abort();await assert.rejects(h.repo.header(A,{signal:signal.signal}),/stale-binding/);
 let controller=new AbortController();const original=h.repo.verifiedRoot.bind(h.repo);h.repo.verifiedRoot=(...args)=>{const result=original(...args);queueMicrotask(()=>controller.abort());return result;};
 await assert.rejects(h.repo.header(A,{signal:controller.signal}),/stale-binding/);
}));
