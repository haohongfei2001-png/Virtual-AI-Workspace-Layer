import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {B23_STORES} from '../../src/data/schema.mjs';

for(const version of [1,2])for(const store of version===1?['refs']:['refs','b23_operations'])for(const kind of ['wrong-path','array-path','unique','multi-entry']){
 test(`MOCK_IDB v${version} rejects ${store} ${kind} index without altering any old records`,async()=>{
  const factory=new MockIDBFactory(),name=`invalid_index_${version}_${store}_${kind}`;
  const db=await new Promise((resolve,reject)=>{
   const r=factory.open(name,version);r.onupgradeneeded=()=>{
    for(const n of ['refs','operations',...(version===2?B23_STORES:[])]){
     const s=r.result.createObjectStore(n,{keyPath:'key'});
     if(n==='refs'||n==='b23_operations'){
      let path=n==='refs'?'scopeKey':'payload.scopeKey',options={};
      if(n===store){if(kind==='wrong-path')path='wrongField';if(kind==='array-path')path=[path];if(kind==='unique')options.unique=true;if(kind==='multi-entry')options.multiEntry=true;}
      s.createIndex('scopeKey',path,options);
     }
     s.put({key:'preserved',scopeKey:'A',payload:{scopeKey:'A',title:'人工标题',text:'人工片段'},revision:7});
    }
   };r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });db.close();
  const before=structuredClone(factory.databasesMap.get(name).stores),base=new ScopeRepository({indexedDB:factory,databaseName:name});
  try{await assert.rejects(base.open(),/AbortError/);assert.equal(factory.databasesMap.get(name).version,version);assert.deepEqual(factory.databasesMap.get(name).stores,before);}finally{base.close();}
 });
}
