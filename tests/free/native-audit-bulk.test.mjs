import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {A} from '../b23/contracts.mjs';
import {nativeRecord,nativePartitionKey} from '../../src/data/native-partitions.mjs';
const scope=normalizedScope(A),now='2026-10-13T00:00:00Z',id=i=>'R'+String(i).padStart(4,'0');
async function fixture(count=600){
 const factory=new MockIDBFactory(),base=new ScopeRepository({indexedDB:factory,databaseName:'bulk_'+crypto.randomUUID()}),native=new NativeRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'fixture',generation:'one'})});
 const refs=Array.from({length:count},(_,i)=>({id:id(i),nativeTitle:'Chat '+i,nativeUrl:'https://fixture.test/c/'+id(i),availability:'available'}));
 assert.equal((await native.apply(scope,{operationId:'seed',expectedRevision:0,batch:{scopeKey:scope.key,sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs,membership:refs.map(r=>({id:r.id,state:'NONE',projectId:null})),inventory:{projects:'complete',conversations:'complete',cursor:null}}})).ok,true);
 const db=await base.open(),rows=factory.databasesMap.get(base.name).stores.get('native_states').rows;
 const dump=()=>structuredClone([...factory.databasesMap.get(base.name).stores].map(([name,s])=>[name,[...s.rows]]));
 return {base,native,db,rows,dump};
}
/** Local mock capability extension: binary string bounds only, request callbacks
 * and transaction rollback remain the existing MockIDB implementation. */
function bulk(h,{onPage=()=>{}}={}){
 const previous=globalThis.IDBKeyRange,transaction=h.db.transaction.bind(h.db),calls=[],valueCalls=[],fallback=[];
 globalThis.IDBKeyRange={bound:(lower,upper,lowerOpen=false,upperOpen=false)=>({lower,upper,lowerOpen,upperOpen})};
 h.db.transaction=(...args)=>{const tx=transaction(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='native_states'){
  const get=store.get.bind(store);store.get=key=>{if(String(key).includes('native-piece')&&String(key).includes('"refs"'))fallback.push(key);return get(key);};
  const selected=(range,count)=>[...store.data.rows.keys()].filter(key=>(range.lowerOpen?key>range.lower:key>=range.lower)&&(range.upperOpen?key<range.upper:key<=range.upper)).sort().slice(0,count);
  store.getAllKeys=(range,count)=>{const call={range:structuredClone(range),count,returned:0};calls.push(call);return store.tx.enqueue(()=>{const keys=selected(range,count);call.returned=keys.length;onPage(call,calls.length);return keys;});};
  store.getAll=(range,count)=>{const call={range:structuredClone(range),count,returned:0,keys:[]};valueCalls.push(call);return store.tx.enqueue(()=>{const keys=selected(range,count);call.returned=keys.length;call.keys=keys;return keys.map(key=>structuredClone(store.data.rows.get(key)));});};
 }return store;};return tx;};
 return {calls,valueCalls,fallback,restore(){h.db.transaction=transaction;if(previous===undefined)delete globalThis.IDBKeyRange;else globalThis.IDBKeyRange=previous;}};
}
async function migrate(h,options={}){return h.native.migrateVersionIndex(scope,{operationId:'index',expectedRevision:1},options);}
test('600 refs cross the 512-row bulk page and preserve all actual facts',async()=>{
 const h=await fixture();let b;try{const original=await h.native.read(scope);b=bulk(h);const r=await migrate(h);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(b.calls.length,2);assert.deepEqual(b.calls.map(c=>c.returned),[512,88]);assert.equal(b.calls[1].range.lowerOpen,true);assert.equal(b.fallback.length,0);b.restore();assert.deepEqual(await h.native.read(scope),{...original,revision:2});}finally{b?.restore();h.base.close();}
});
test('retained revisions exhaust bounded 2*N scan then exact gets fill remaining coverage',async()=>{
 const h=await fixture();let b;try{const original=await h.native.read(scope);for(let i=0;i<600;i++){const row=h.rows.get(nativePartitionKey(scope.key,'refs',id(i),1));for(const revision of [0,2,3]){const key=nativePartitionKey(scope.key,'refs',id(i),revision);h.rows.set(key,nativeRecord(key,{...structuredClone(row.payload),revision}));}}
 b=bulk(h);const r=await migrate(h);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(b.calls.reduce((n,c)=>n+c.returned,0),1200);assert.ok(b.calls.every(c=>c.count<=512));assert.ok(b.fallback.length>250,'remaining exact references must use old loader');assert.ok(b.valueCalls.flatMap(c=>c.keys).every(key=>JSON.parse(key).at(-1)===1),'retained payloads must never bulk-load');b.restore();assert.deepEqual(await h.native.read(scope),{...original,revision:2});}finally{b?.restore();h.base.close();}
});
for(const defect of ['missing','checksum','last-page-checksum'])test('bulk '+defect+' refuses migration and leaves every store unchanged',async()=>{
 const h=await fixture();let b;try{const key=nativePartitionKey(scope.key,'refs',id(defect==='checksum'?40:599),1);if(defect==='missing')h.rows.delete(key);else h.rows.get(key).checksum='bad';const before=h.dump();b=bulk(h);const r=await migrate(h);assert.equal(r.ok,false);assert.ok(b.calls.length>=2,'must read the second bulk page');if(defect==='missing')assert.ok(b.fallback.includes(key),'missing requested key requires exact read');b.restore();assert.deepEqual(h.dump(),before);}finally{b?.restore();h.base.close();}
});
test('guard loss during second bulk request aborts all queued migration writes',async()=>{
 const h=await fixture();let b;try{const before=h.dump();let allowed=true;b=bulk(h,{onPage:(_call,n)=>{if(n===2)allowed=false;}});const r=await migrate(h,{guard:()=>allowed});assert.equal(b.calls.length,2);assert.equal(r.ok,false);assert.equal(r.reason,'stale-binding');b.restore();assert.deepEqual(h.dump(),before);}finally{b?.restore();h.base.close();}
});

for(const count of [1,512])test('keys-first exact boundary '+count+' preserves facts with one bounded page',async()=>{
 const h=await fixture(count);let b;try{const original=await h.native.read(scope);b=bulk(h);const r=await migrate(h);assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(b.calls.map(c=>c.returned),[count]);assert.equal(b.fallback.length,0);assert.equal(b.valueCalls.reduce((n,c)=>n+c.returned,0),count);b.restore();assert.deepEqual(await h.native.read(scope),{...original,revision:2});}finally{b?.restore();h.base.close();}
});
