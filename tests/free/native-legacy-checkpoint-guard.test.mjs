import test from 'node:test';
import assert from 'node:assert/strict';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {nativeRecord,nativePartitionKey,nativeRecoveryKey,nativeCheckpointKey} from '../../src/data/native-partitions.mjs';
import {buildNativeVersionIndex} from '../../src/data/native-version-index.mjs';
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
for(const indexed of [false,true])for(const missing of [false,true])test(`${indexed?'indexed':'partitioned'} ${missing?'existing missing-hint':'ambiguous current-hint'} guard loss at live checkpoint callback must abort native and shared publication`,async t=>{
 const h=await setup(indexed,missing),db=await h.base.open(),original=db.transaction.bind(db);let allowed=true,hit=null,abortCalls=0;
 try{
  const before=await state(h),beforeRoot=await raw(h),beforeCheckpoint=await raw(h,nativeCheckpointKey(scopeKey));
  db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);if(args[1]==='readwrite'){const abort=tx.abort.bind(tx);tx.abort=()=>{abortCalls++;return abort();};}
   tx.objectStore=name=>{const store=objectStore(name);if(name==='native_states'&&args[1]==='readwrite'){const get=store.get.bind(store);store.get=key=>{const q=get(key);if(key===nativeCheckpointKey(scopeKey)){let callback;Object.defineProperty(q,'onsuccess',{get:()=>callback,set:fn=>{callback=event=>{
    // Revoke BEFORE production onsuccess enters, while the owner's transaction
    // can still abort; this is not the supported post-commit notification gap.
    hit={transactionDone:tx.done,mode:tx.mode,pendingRequests:tx.tasks.length,globalNativeRevision:db.meta.stores.get('native_states').rows.get(scopeKey).payload.revision,localNativeRevision:tx.local.get('native_states').rows.get(scopeKey).payload.revision,globalSharedHasX:!!db.meta.stores.get('b23_states').rows.get(scopeKey)?.payload.refs.X,localSharedHasX:!!tx.local.get('b23_states').rows.get(scopeKey)?.payload.refs.X};allowed=false;fn(event);
   };},configurable:true});}return q;};}return store;};return tx;};
  const result=await h.native.apply(scope,request(3),{guard:()=>allowed});db.transaction=original;
  const after=await state(h),afterRoot=await raw(h),afterCheckpoint=await raw(h,nativeCheckpointKey(scopeKey)),receipt=await raw(h,JSON.stringify([scopeKey,'guard_3']),'native_operations'),facts=await h.native.read(scope),shared=(await h.shared.read(scope)).state;
  const proof={indexed,missing,result,atRevocation:hit,abortCalls,roots:{beforeRevision:beforeRoot.payload.revision,afterRevision:afterRoot.payload.revision,beforeDigest:digest(beforeRoot),afterDigest:digest(afterRoot),checkpointBeforeRevision:beforeCheckpoint.payload.revision,checkpointAfterRevision:afterCheckpoint.payload.revision},receiptPersisted:!!receipt,sharedHasX:!!shared.refs.X,anchorHasX:!!await h.base.get(scope,'X'),liveFacts:{revision:facts.revision,R:facts.refs.R.nativeTitle,X:facts.refs.X?.nativeTitle??null},oldPieceRetained:!!await raw(h,piece(1)),changedStores:stores.filter(name=>JSON.stringify(before[name])!==JSON.stringify(after[name]))};
  t.diagnostic(JSON.stringify(proof));assert(hit);assert.equal(hit.transactionDone,false);assert.equal(hit.globalNativeRevision,2);assert.equal(hit.globalSharedHasX,false);assert.equal(hit.localSharedHasX,true,'shared publication must be staged, not yet committed at revocation');assert.equal(result.ok,false);assert.notEqual(result.committed,true,'owner committed after guard loss inside still-abortable checkpoint callback');assert(abortCalls>0);assert.deepEqual(after,before,'all six transaction stores must roll back');
 }finally{db.transaction=original;h.base.close();}
});
for(const indexed of [false,true])test(`${indexed?'indexed':'partitioned'} genuinely post-commit guard loss retains stale-after-commit semantics`,async()=>{
 const h=await setup(indexed,true),db=await h.base.open(),original=db.transaction.bind(db);let ownerTransaction=null;
 try{
  db.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite')ownerTransaction=tx;return tx;};
  const result=await h.native.apply(scope,request(3),{guard:()=>!ownerTransaction?.done});db.transaction=original;
  assert.deepEqual(result,{ok:false,reason:'stale-after-commit',committed:true});assert.equal((await raw(h)).payload.revision,3);assert.equal((await raw(h,nativeCheckpointKey(scopeKey))).payload.revision,2);assert(await raw(h,JSON.stringify([scopeKey,'guard_3']),'native_operations'));assert((await h.shared.read(scope)).state.refs.X);assert(await h.base.get(scope,'X'));
 }finally{db.transaction=original;h.base.close();}
});

for(const defect of ['missing','corrupt','throwing-guard'])test(`partitioned ${defect} checkpoint cannot swallow pre-commit authority loss`,async()=>{
 const h=await setup(false,true),db=await h.base.open(),original=db.transaction.bind(db);let allowed=true,hit=false,aborts=0;
 try{
  if(defect==='corrupt'){const row=await raw(h,nativeCheckpointKey(scopeKey));row.checksum='0'.repeat(64);await put(h,row);}
  const before=await state(h);
  db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);if(args[1]==='readwrite'){const abort=tx.abort.bind(tx);tx.abort=()=>{aborts++;return abort();};}
   tx.objectStore=name=>{const store=objectStore(name);if(name==='native_states'&&args[1]==='readwrite'){const get=store.get.bind(store);store.get=key=>{const q=get(key);if(key===nativeCheckpointKey(scopeKey)){let callback;Object.defineProperty(q,'onsuccess',{get:()=>callback,set:fn=>{callback=event=>{assert.equal(tx.done,false);hit=true;allowed=false;if(defect==='missing')q.result=undefined;fn(event);};}});}return q;};}return store;};return tx;};
  const result=await h.native.apply(scope,request(3),{guard:()=>{if(!allowed&&defect==='throwing-guard')throw Error('guard-probe');return allowed;}});db.transaction=original;
  assert(hit);assert(aborts>0);assert.deepEqual(result,{ok:false,reason:defect==='throwing-guard'?'guard-probe':'stale-binding'});assert.deepEqual(await state(h),before);
 }finally{db.transaction=original;h.base.close();}
});
for(const mode of ['guard-between-deletes','delete-error'])test(`partitioned ${mode} rolls back the complete joint owner transaction`,async()=>{
 const h=await setup(false,true,['S']),db=await h.base.open(),original=db.transaction.bind(db);let allowed=true,aborts=0;const deletes=[];
 try{
  const before=await state(h),retirable=new Set(['R','S'].map(id=>nativePartitionKey(scopeKey,'refs',id,1)));
  db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);if(args[1]==='readwrite'){const abort=tx.abort.bind(tx);tx.abort=()=>{aborts++;return abort();};}
   tx.objectStore=name=>{const store=objectStore(name);if(name==='native_states'&&args[1]==='readwrite'){const del=store.delete.bind(store);store.delete=key=>{if(retirable.has(key)){assert.equal(tx.done,false);deletes.push(key);if(mode==='delete-error')throw Error('delete-probe');const result=del(key);allowed=false;return result;}return del(key);};}return store;};return tx;};
  const result=await h.native.apply(scope,request(3,['S']),{guard:()=>allowed});db.transaction=original;
  assert.equal(deletes.length,1,'fresh authority check must run before the second deletion');assert(aborts>0);assert.deepEqual(result,{ok:false,reason:mode==='delete-error'?'delete-probe':'stale-binding'});assert.deepEqual(await state(h),before,'already queued first delete and all six stores must roll back');
 }finally{db.transaction=original;h.base.close();}
});
