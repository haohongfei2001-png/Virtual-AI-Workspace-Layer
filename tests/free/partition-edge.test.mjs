import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {nativeCheckpointKey,nativePartitionKey,nativeUnpack} from '../../src/data/native-partitions.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {digest} from '../../src/data/hash.mjs';
const scope=scopeOf('A'),now='2026-10-13T00:00:00Z',scopeKey=emptyNativeFacts(scope).scopeKey;
async function setup(){const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'edge_'+crypto.randomUUID().replaceAll('-','')});const native=new NativeRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'fixture',generation:'one'})});await base.open();return {base,native};}
function batch(revision,id){return {scopeKey,sourceRevision:revision,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id,nativeTitle:'原名 '+revision,nativeUrl:'https://fixture.test/c/'+id,availability:'available'}],membership:[{id,state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}};}
async function rows(base,keys){const db=await base.open();return new Promise((resolve,reject)=>{const result=[],tx=db.transaction('native_states','readonly');for(const [i,key] of keys.entries()){const r=tx.objectStore('native_states').get(key);r.onsuccess=()=>{result[i]=r.result;};}tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);});}
async function edit(base,operation){const db=await base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');operation(tx.objectStore('native_states'));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
test('MOCK_IDB native GC retains every current and checkpoint piece across 70 interleaved updates',async()=>{
 const h=await setup();try{
  for(let revision=1;revision<=70;revision++){const id=revision%2?'a':'b';assert.equal((await h.native.apply(scope,{operationId:'update_'+revision,expectedRevision:revision-1,batch:batch(revision,id)})).ok,true);}
  const [root,checkpoint]=await rows(h.base,[scopeKey,nativeCheckpointKey(scopeKey)]);const current=nativeUnpack(root),prior=nativeUnpack(checkpoint);assert.equal(current.changes.length,64);assert.equal(prior.revision,69);
  for(const manifest of [current,prior])for(const kind of ['projects','refs'])for(const [id,revision] of Object.entries(manifest[kind])){const [piece]=await rows(h.base,[nativePartitionKey(scopeKey,kind,id,revision)]);assert.equal(nativeUnpack(piece).revision,revision);}
  const facts=await h.native.read(scope);assert.equal(facts.refs.a.nativeTitle,'原名 69');assert.equal(facts.refs.b.nativeTitle,'原名 70');
  const [retired]=await rows(h.base,[nativePartitionKey(scopeKey,'refs','a',1)]);assert.equal(retired,undefined);
 }finally{h.base.close();}
});
test('MOCK_IDB damaged native piece is not repaired by blessing intact manifest or recovery pointer',async()=>{
 const h=await setup();try{
  assert.equal((await h.native.apply(scope,{operationId:'seed',expectedRevision:0,batch:batch(1,'a')})).ok,true);
  const [root]=await rows(h.base,[scopeKey]);await edit(h.base,s=>s.delete(nativePartitionKey(scopeKey,'refs','a',1)));
  await assert.rejects(h.native.read(scope),/corrupt-native-record/);
  assert.equal((await h.native.recover(scope,{operationId:'recover_intact',damagedHash:digest(root)})).reason,'intact-state-not-replaced');
  const damaged={...root,checksum:'corrupt'};await edit(h.base,s=>s.put(damaged));
  assert.equal((await h.native.recover(scope,{operationId:'recover_bad_piece',damagedHash:digest(damaged)})).reason,'corrupt-native-record');
  assert.deepEqual((await rows(h.base,[scopeKey]))[0],damaged);
 }finally{h.base.close();}
});
test('MOCK_IDB never-initialized native page is an empty revision-bound inventory',async()=>{
 const h=await setup();try{const page=await h.native.page(scope,{limit:20});assert.equal(page.revision,0);assert.equal(page.total,0);assert.equal(page.nextOffset,0);assert.deepEqual(page.selectedRefs,[]);assert.deepEqual(page.selectedProjects,[]);assert.deepEqual(page.facts,emptyNativeFacts(scope));}finally{h.base.close();}
});
