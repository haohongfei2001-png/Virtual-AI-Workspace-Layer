import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {B23_STORES,NATIVE_STORES,DATABASE_VERSION} from '../../src/data/schema.mjs';
const stores=['refs','operations',...B23_STORES,...NATIVE_STORES];
async function fixture(fault,version=DATABASE_VERSION){
 const factory=new MockIDBFactory(),name='current_schema';
 const db=await new Promise((resolve,reject)=>{
  const q=factory.open(name,version);q.onupgradeneeded=()=>{
   for(const name of stores){
    if(fault===name+':missing')continue;
    const store=q.result.createObjectStore(name,{keyPath:fault===name+':key'?'otherKey':'key',autoIncrement:fault===name+':auto'});
    if(name==='refs'||name==='b23_operations'){
     const path=name==='refs'?'scopeKey':'payload.scopeKey';
     if(fault!==name+':index-missing')store.createIndex('scopeKey',fault===name+':index-path'?'wrong':fault===name+':index-array'?[path]:path,{unique:fault===name+':index-unique',multiEntry:fault===name+':index-multi'});
    }
    store.put({key:'sentinel',otherKey:'sentinel',scopeKey:'A',payload:{scopeKey:'A',human:'保留'},revision:2});
   }
   q.result.createObjectStore('future_extra',{keyPath:'key'}).put({key:'keep',human:'保留额外表'});
  };q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });db.close();return {factory,name};
}
for(const version of [3,4])for(const fault of [...stores.flatMap(name=>[name+':missing',name+':key',name+':auto']),...['refs','b23_operations'].flatMap(name=>['index-missing','index-path','index-array','index-unique','index-multi'].map(x=>name+':'+x))])test('existing v'+version+' rejects '+fault+' without modifying version, rows or cached connection',async()=>{
 assert.equal(DATABASE_VERSION,4,'codec write isolation requires database version 4');
 const {factory,name}=await fixture(fault,version),before=structuredClone(factory.databasesMap.get(name).stores),base=new ScopeRepository({indexedDB:factory,databaseName:name});
 try{await assert.rejects(base.open(),version===3?/AbortError/:/invalid-schema/);assert.equal(base.connection,null);assert.equal(factory.databasesMap.get(name).handles.size,0);assert.equal(factory.databasesMap.get(name).version,version);assert.deepEqual(factory.databasesMap.get(name).stores,before);}finally{base.close();}
});
for(const version of [3,4])test('valid existing v'+version+' opens v4 retaining every row and extra store with one checked connection',async()=>{
 assert.equal(DATABASE_VERSION,4);
 const {factory,name}=await fixture('valid',version),base=new ScopeRepository({indexedDB:factory,databaseName:name}),before=structuredClone(factory.databasesMap.get(name).stores);
 const rowBytes=all=>JSON.stringify([...all].map(([name,store])=>[name,[...store.rows]]));
 try{const [a,b]=await Promise.all([base.open(),base.open()]);assert.equal(a.version,4);assert.equal(a,b);assert.equal(await base.open(),a);assert(a.objectStoreNames.contains('future_extra'));assert.deepEqual(factory.databasesMap.get(name).stores,before);assert.equal(rowBytes(factory.databasesMap.get(name).stores),rowBytes(before));assert.equal(factory.databasesMap.size,1,'upgrade must keep the original database');}finally{base.close();}
});
test('close during an opening prevents late connection publication and permits explicit retry',async()=>{
 const {factory,name}=await fixture('valid'),base=new ScopeRepository({indexedDB:factory,databaseName:name});
 const pending=base.open();base.close();await assert.rejects(pending,/idb-open-cancelled/);assert.equal(base.connection,null);assert.equal(factory.databasesMap.get(name).handles.size,0);
 const db=await base.open();assert.equal(db.version,DATABASE_VERSION);base.close();
});
test('versionchange during the metadata transaction cannot cache a closing connection',async()=>{
 const {factory,name}=await fixture('valid'),base=new ScopeRepository({indexedDB:factory,databaseName:name}),start=factory.start.bind(factory);let injected=false;
 factory.start=meta=>{const tx=meta.queue[0];if(tx&&!injected){injected=true;tx.db.onversionchange?.();}return start(meta);};
 await assert.rejects(base.open(),/invalid-schema/);assert.equal(base.connection,null);assert.equal(factory.databasesMap.get(name).handles.size,0);
 factory.start=start;await base.open();base.close();
});
