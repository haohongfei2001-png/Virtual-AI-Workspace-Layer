/** Owner cache/GC integrity contracts with MockIDB; no production or browser durability claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A} from '../b23/contracts.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {nativeCheckpointKey,nativePartitionKey,nativeRecord,validateNativeManifest} from '../../src/data/native-partitions.mjs';
import {digest} from '../../src/data/hash.mjs';
const now='2026-10-13T00:00:00Z',gate={channel:'synthetic',sourceId:'gc_source',generation:'first'},key=emptyNativeFacts(A).scopeKey,checkpoint=nativeCheckpointKey(key);
const request=(version,scope=A)=>({operationId:'write_'+version,expectedRevision:version-1,batch:{scopeKey:emptyNativeFacts(scope).scopeKey,sourceRevision:version,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id:'R',nativeTitle:'Title '+version,nativeUrl:'https://fixture.test/c/R',availability:'available'}],membership:[{id:'R',state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}});
async function setup(){const h=await harness(new MockIDBFactory(),{seed:false});return {...h,native:new NativeRepository({baseRepository:h.base,observationGate:()=>gate,clock:()=>now})};}
async function raw(h,id){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),r=tx.objectStore('native_states').get(id);tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});}
async function put(h,row){const db=await h.base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');tx.objectStore('native_states').put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function apply(h,n,scope=A){const result=await h.native.apply(scope,request(n,scope));assert.equal(result.ok,true,JSON.stringify(result));await h.native.header(scope);}
const piece=(version)=>nativePartitionKey(key,'refs','R',version);
for(const kind of ['same-checksum-body','wrong-scope-valid-digest','invalid-structure-valid-digest','malformed-checksum'])test(`GC rejects ${kind} even after old root was cached`,async()=>{
 const h=await setup();try{await apply(h,1);await apply(h,2);const row=await raw(h,checkpoint);
  if(kind==='same-checksum-body')row.payload.sources.gc_source.sourceRevision=99;
  else if(kind==='wrong-scope-valid-digest'){row.payload.scopeKey=emptyNativeFacts({...A,accountId:'other'}).scopeKey;row.checksum=digest(row.payload);}
  else if(kind==='invalid-structure-valid-digest'){row.payload.units=-1;row.checksum=digest(row.payload);}
  else row.checksum='x'.repeat(100000);
  await put(h,row);await apply(h,3);
  assert(await raw(h,piece(1)),'rejected checkpoint must not authorize GC');
  for(const n of [2,3])assert(await raw(h,piece(n)),'current and checkpoint pieces protected');
  assert.equal((await h.native.page(A,{ids:{projects:[],refs:['R']}})).facts.refs.R.nativeTitle,'Title 3');
 }finally{h.close();}
});
test('GC rejects wrong physical checkpoint key even with cached valid payload/digest',async()=>{
 const h=await setup();let restore=()=>{};try{await apply(h,1);await apply(h,2);const db=await h.base.open(),transaction=db.transaction.bind(db);let intercepted=false;
  db.transaction=(names,mode)=>{const tx=transaction(names,mode),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='native_states'&&mode==='readwrite'){const get=store.get.bind(store);store.get=id=>{const q=get(id);if(id===checkpoint){let handler;Object.defineProperty(q,'onsuccess',{get:()=>handler,set:fn=>{handler=event=>{intercepted=true;q.result={...q.result,key};fn(event);};}});}return q;};}return store;};return tx;};restore=()=>{db.transaction=transaction;};
  await apply(h,3);assert(intercepted);assert(await raw(h,piece(1)));for(const n of [2,3])assert(await raw(h,piece(n)));
 }finally{restore();h.close();}
});
test('cross-scope eviction and successive versions fall back safely while collecting only superseded pieces',async()=>{
 const h=await setup();try{await apply(h,1);await apply(h,2);
  for(const accountId of ['evict1','evict2','evict3','evict4'])await apply(h,1,{...A,accountId});
  for(let n=3;n<=8;n++){await apply(h,n);assert(await raw(h,piece(n)));assert(await raw(h,piece(n-1)));assert.equal(await raw(h,piece(n-2)),undefined);}
  assert.equal((await h.native.read(A)).refs.R.nativeTitle,'Title 8');
 }finally{h.close();}
});
test('root larger than 8Mi cache budget retains full validation and safe checkpoint GC',async()=>{
 const h=await setup();try{await apply(h,1);const row=await raw(h,key),longId='x'.repeat(96);
  row.payload.changes=Array.from({length:9},()=>({revision:1,projects:[],refs:Array(10000).fill(longId)}));row.payload.changes.push({revision:1,projects:[],refs:['R']});
  validateNativeManifest(row.payload,A);const encoded=JSON.stringify(row.payload);assert(encoded.length>8*1024*1024&&encoded.length<16*1024*1024);
  await put(h,nativeRecord(key,row.payload));await apply(h,2);await apply(h,3);
  assert.equal(await raw(h,piece(1)),undefined);assert(await raw(h,piece(2)));assert(await raw(h,piece(3)));
  const bad=await raw(h,checkpoint);bad.payload.sources.gc_source.sourceRevision=999;await put(h,bad);await apply(h,4);
  assert(await raw(h,piece(2)),'oversize tampered checkpoint must still fail full validation');assert(await raw(h,piece(3)));assert(await raw(h,piece(4)));
 }finally{h.close();}
});
