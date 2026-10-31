import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {createSameDatabaseStore,proRootKey,proOperationKey} from '../../src/pro/integration/same-db-store.mjs';
import {digest} from '../../src/data/hash.mjs';
import {PRO_STORAGE_REGISTRY,proRetentionDecision,assertRegisteredProDatabase} from '../../src/pro/integration/storage-registry.mjs';
async function fixture(name){const factory=new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,databaseName:'registry_'+name,fixtureOnly:true}),controller=await createProController(owner);await controller.dispatch({type:'CREATE_TOPIC',name:'必须保留的人工作品'});return {factory,owner,controller,db:await owner.base.open()};}
async function edit(db,store,key,fn){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store),q=s.get(key);q.onsuccess=()=>{const row=fn(q.result);if(row===null)s.delete(key);else s.put(row);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function dump(db){return new Promise(resolve=>{const names=['b23_states','b23_operations','b23_checkpoints'],rows={};const tx=db.transaction(names);for(const name of names){rows[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){rows[name].push(q.result.value);q.result.continue();}};}tx.oncomplete=()=>resolve(rows);});}

test('DB4 namespace registry fences unsupported readers and protects inverse/billing rows from generic GC',async()=>{
 const f=await fixture('registry');try{assert.equal(assertRegisteredProDatabase(f.db),f.db);assert.equal(PRO_STORAGE_REGISTRY.databaseVersion,4);assert.throws(()=>assertRegisteredProDatabase({version:3}),/unregistered/);
 assert.equal(proRetentionDecision(proRootKey(f.owner.scope.key)).action,'retain');assert.equal(proRetentionDecision(proOperationKey(f.owner.scope.key,'op')).action,'retain');assert.match(proRetentionDecision(JSON.stringify(['vaiwl-pro-billing/1','installation'])).reason,/cost/);assert.equal(proRetentionDecision(f.owner.scope.key),null);
 const key=proRootKey(f.owner.scope.key);await edit(f.db,'b23_states',key,row=>{row.payload.minimumReader='vaiwl-pro-overlay/2';row.checksum=digest(row.payload);return row;});const before=await dump(f.db);await assert.rejects(()=>f.owner.store.read(f.owner.grant()),/reader-incompatible/);assert.deepEqual(await dump(f.db),before);
 }finally{f.controller.destroy();}
});

test('missing Pro root with checkpoint or retained journal is never silently reinitialized',async()=>{
 for(const keepCheckpoint of [true,false]){const f=await fixture('missing_'+keepCheckpoint);try{
 const key=proRootKey(f.owner.scope.key);await edit(f.db,'b23_states',key,()=>null);if(!keepCheckpoint)await edit(f.db,'b23_checkpoints',key,()=>null);const before=await dump(f.db);
 await assert.rejects(()=>f.owner.store.read(f.owner.grant()),/missing-root-with-history/);
 const expected=f.controller.getSnapshot().versions;const result=await f.owner.store.transact(f.owner.grant(),{operationId:'cannot_reset',expected,fingerprint:{test:true},execute(){throw Error('must-not-run');}});assert.equal(result.ok,false);assert.match(result.reason,/missing-root-with-history/);assert.deepEqual(await dump(f.db),before);
 }finally{f.controller.destroy();}}
});

test('checksummed cross-scope, broken sequence, stale base and altered inverse journal rows fail closed',async()=>{
 for(const [name,change] of [['scope',r=>{r.payload.transaction.base.scopeKey='other';}],['sequence',r=>{r.payload.sequence=2;}],['inverse',r=>{r.payload.transaction.inverse=[];}],['result',r=>{r.payload.transaction.resultRevision+=1;}],['patch',r=>{r.payload.transaction.patch[0].after.name='替换';}],['rehashed-inverse',r=>{const t=r.payload.transaction;t.inverse[0].restoreValue=t.patch[0].after;t.inverseHash=digest({inverse:t.inverse,readSet:t.readSet});}],['rehashed-incomplete-inverse',r=>{const t=r.payload.transaction;t.inverse=[];t.inverseHash=digest({inverse:t.inverse,readSet:t.readSet});}],['rehashed-read-set',r=>{const t=r.payload.transaction;t.readSet.push({kind:'credential-state',key:'hidden',expectedAfterDigest:digest(null)});t.inverseHash=digest({inverse:t.inverse,readSet:t.readSet});}]]){
 const f=await fixture(name);try{const raw=await f.owner.store.read(f.owner.grant()),op=raw.records[0].transaction.operationId,key=proOperationKey(f.owner.scope.key,op);await edit(f.db,'b23_operations',key,row=>{change(row);row.checksum=digest(row.payload);return row;});const before=await dump(f.db);await assert.rejects(()=>f.owner.store.read(f.owner.grant()),/pro-journal/);assert.deepEqual(await dump(f.db),before);
 }finally{f.controller.destroy();}}
});

test('grant scope cannot change while the existing DB connection is awaited',async()=>{
 const f=await fixture('scope_switch');try{let switched=false;const store=createSameDatabaseStore({enabled:true,connection:async()=>{switched=true;return f.db;},verifyGrant:()=>({...f.owner.capabilities.scope,key:switched?'other':f.owner.scope.key}),verifyInputFence(){throw Error('must-not-run');}});const before=await dump(f.db);await assert.rejects(()=>store.read({}),/authority-scope-changed/);assert.deepEqual(await dump(f.db),before);
 }finally{f.controller.destroy();}
});

test('async input-fence rejection is contained and cannot commit a prepared transaction',async()=>{
 const f=await fixture('async_fence');try{const store=createSameDatabaseStore({enabled:true,connection:()=>f.db,verifyGrant:()=>f.owner.capabilities.scope,verifyInputFence:async()=>{throw Error('private async failure');}});const before=await dump(f.db),expected=f.controller.getSnapshot().versions;const result=await store.transact(f.owner.grant(),{operationId:'async_fence',expected,fingerprint:{test:true},execute(){throw Error('must-not-run');}});assert.equal(result.ok,false);assert.equal(result.reason,'async-pro-input-fence-denied');await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(await dump(f.db),before);
 }finally{f.controller.destroy();}
});

test('foreign-realm rejected native Promises in reducer and input fence are contained without invoking arbitrary thenables',async()=>{
 const f=await fixture('foreign_promise');try{const before=await dump(f.db),expected=f.controller.getSnapshot().versions;
 for(const kind of ['fence','reducer']){const store=createSameDatabaseStore({enabled:true,connection:()=>f.db,verifyGrant:()=>f.owner.capabilities.scope,verifyInputFence(tx,scope,expected,check,ready){if(kind==='fence')return runInNewContext('Promise.reject(new Error("foreign-fence"))');ready();}});
 const result=await store.transact({}, {operationId:'foreign_'+kind,expected,fingerprint:{kind},execute:()=>runInNewContext('Promise.reject(new Error("foreign-reducer"))')});assert.equal(result.ok,false);assert.match(result.reason,/async-pro-(input-fence|reducer)-denied/);}
 let invoked=false;const store=createSameDatabaseStore({enabled:true,connection:()=>f.db,verifyGrant:()=>f.owner.capabilities.scope,verifyInputFence(){return {then(){invoked=true;}};}});const result=await store.transact({}, {operationId:'thenable',expected,fingerprint:{},execute(){throw Error('must-not-run');}});assert.equal(result.reason,'async-pro-input-fence-denied');assert.equal(invoked,false);
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(await dump(f.db),before);
 }finally{f.controller.destroy();}
});
