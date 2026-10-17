import test from 'node:test';
import assert from 'node:assert/strict';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {nativeRecord,nativePartitionKey,nativeRecoveryKey,nativeCheckpointKey} from '../../src/data/native-partitions.mjs';
import {buildNativeVersionIndex,nativeIndexKey,nativeIndexBucket} from '../../src/data/native-version-index.mjs';
import {digest} from '../../src/data/hash.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
const scope={verified:true,provider:'hf_synthetic_only',accountId:'A',organizationId:'fixture_org'},scopeKey=emptyNativeFacts(scope).scopeKey;
const now='2026-10-13T00:00:00Z';
const stores=['native_states','native_operations','b23_states','b23_operations','b23_checkpoints','refs'];
const piece=n=>nativePartitionKey(scopeKey,'refs','R',n);
function request(n,extra=[]){const ids=[...(n===3?['R','X']:['R']),...extra];return {operationId:'guard_'+n,expectedRevision:n-1,batch:{scopeKey,sourceRevision:n,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:ids.map(id=>({id,nativeTitle:id+' revision '+n,nativeUrl:'https://fixture.test/c/'+id,availability:'available'})),membership:ids.map(id=>({id,state:'NONE',projectId:null})),inventory:{projects:'partial',conversations:'partial',cursor:null}}};}
async function raw(h,key=scopeKey,name='native_states'){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(name),q=tx.objectStore(name).get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}
async function put(h,...rows){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');for(const row of rows)tx.objectStore('native_states').put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function state(h){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(stores),out={};for(const name of stores){out[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){out[name].push(q.result.value);q.result.continue();}};}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});}
async function setup(indexed,missing,extra=[]){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'guard_'+crypto.randomUUID().replaceAll('-','')}),shared=new WorkspaceRepository({baseRepository:base,evidenceGate:()=> 'synthetic',clock:()=>now}),native=new NativeRepository({baseRepository:base,workspaceRepository:shared,observationGate:()=>({channel:'synthetic',sourceId:'guard_source',generation:'one'}),clock:()=>now}),h={base,shared,native};
 assert.equal((await native.apply(scope,request(1,extra))).ok,true);
 if(indexed){const old=(await raw(h)).payload,built=buildNativeVersionIndex(old,scope);await put(h,...built.records,nativeRecord(scopeKey,built.root),nativeRecord(nativeRecoveryKey(scopeKey),built.root));}
 assert.equal((await native.apply(scope,request(2,extra))).ok,true);const root=await raw(h);root.payload.changes=missing?[]:[{revision:2,projects:[],refs:[]},{revision:2,projects:[],refs:['R']}];await put(h,nativeRecord(scopeKey,root.payload));return h;
}


for(const secondDefect of ['valid','missing','corrupt'])test(`independent multi-bucket: tolerated first corruption cannot silence later ${secondDefect} guard loss`,async t=>{
 const h=await setup(true,true,['S']),db=await h.base.open(),original=db.transaction.bind(db);let allowed=true,aborts=0;const hits=[];
 try{
 const old=(await raw(h,nativeCheckpointKey(scopeKey))).payload;
 const oldKeys=new Set(Object.entries(old.refs).map(([bucket,pointer])=>nativeIndexKey(scopeKey,'refs',bucket,pointer.revision)));
 assert.equal(oldKeys.size,2);const before=await state(h);
 db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);if(args[1]==='readwrite'){const abort=tx.abort.bind(tx);tx.abort=()=>{aborts++;return abort();};}
 tx.objectStore=name=>{const store=objectStore(name);if(name==='native_states'&&args[1]==='readwrite'){const get=store.get.bind(store);store.get=physical=>{const q=get(physical);if(oldKeys.has(physical)){let callback;Object.defineProperty(q,'onsuccess',{get:()=>callback,set:fn=>{callback=event=>{hits.push({key:physical,done:tx.done,pending:tx.tasks.length,allowed});if(hits.length===1)q.result={...q.result,checksum:'0'.repeat(64)};else{allowed=false;if(secondDefect==='missing')q.result=undefined;if(secondDefect==='corrupt')q.result={...q.result,checksum:'0'.repeat(64)};}fn(event);};},configurable:true});}return q;};}return store;};return tx;};
 const result=await h.native.apply(scope,request(3),{guard:()=>allowed});db.transaction=original;const after=await state(h);
 t.diagnostic(JSON.stringify({secondDefect,result,hits,aborts,changedStores:stores.filter(name=>JSON.stringify(before[name])!==JSON.stringify(after[name]))}));
 assert.equal(hits.length,2);assert(hits.every(h=>!h.done));assert.equal(result.ok,false);assert.notEqual(result.committed,true);assert(aborts>0);assert.deepEqual(after,before);
 }finally{db.transaction=original;h.base.close();}
});
