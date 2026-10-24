import test from 'node:test';
import assert from 'node:assert/strict';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {nativeRecord,nativePartitionKey,nativeRecoveryKey,nativeCheckpointKey} from '../../src/data/native-partitions.mjs';
import {buildNativeVersionIndex,nativeIndexKey,nativeIndexBucket} from '../../src/data/native-version-index.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {sharedRefBucket,sharedRefDirectoryKey} from '../../src/data/shared-ref-directory.mjs';
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


async function sharedSetup(){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'shared_guard_'+crypto.randomUUID().replaceAll('-','')}),shared=new WorkspaceRepository({baseRepository:base,evidenceGate:()=> 'synthetic',clock:()=>now}),native=new NativeRepository({baseRepository:base,workspaceRepository:shared,observationGate:()=>({channel:'synthetic',sourceId:'guard_source',generation:'one'}),clock:()=>now}),h={base,shared,native};
 const seed=emptyState(scope);seed.revision=1;seed.channel='synthetic';seed.sources.fixture={id:'fixture',channel:'synthetic',description:'Synthetic only',trustLevel:'synthetic',observedAt:now,revoked:false};seed.refs.R={id:'R',nativeUrl:'https://fixture.test/c/R',nativeTitle:'R',projectId:null,available:true};seed.identities.R={id:'R',title:'R',aliases:[],owner:'bootstrap',locked:false,revision:1};
 assert((await shared.initializePartitioned(scope,seed)).ok);assert((await shared.migrateSharedDirectory(scope,{operationId:'shared_migrate',expectedRevision:1})).ok);assert((await shared.command(scope,{operationId:'shared_title',expectedRevision:2,command:{type:'SET_TITLE',refId:'R',title:'title3'}})).ok);
 assert((await native.apply(scope,request(1))).ok);assert((await native.apply(scope,request(2))).ok);return h;
}

// Real owner transactions over serial MockIDB only: not browser durability.
const modes=['native-indexed','shared-command'];
async function fixture(mode){return mode==='native-indexed'?setup(true,true):sharedSetup();}
async function obsolete(h,mode){
 if(mode==='native-indexed')return {store:'native_states',key:nativeIndexKey(scopeKey,'refs',nativeIndexBucket('R'),1),piece:nativePartitionKey(scopeKey,'refs','R',1)};
 const old=(await raw(h,scopeKey,'b23_checkpoints')).payload,bucket=sharedRefBucket('R');
 return {store:'b23_states',key:sharedRefDirectoryKey(scopeKey,old.generation,bucket,old.refDirectory[bucket].revision)};
}
function apply(h,mode,options){return mode==='native-indexed'?h.native.apply(scope,request(3),options):h.shared.command(scope,{operationId:'shared_title4',expectedRevision:3,command:{type:'SET_TITLE',refId:'R',title:'title4'}},options);}
function intercept(db,target,{defect='valid',revoke=()=>{}}={}){
 const original=db.transaction.bind(db);let hit=null,aborts=0;const deletes=[];
 db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);if(args[1]==='readwrite'){const abort=tx.abort.bind(tx);tx.abort=()=>{aborts++;return abort();};}
 tx.objectStore=name=>{const store=objectStore(name);if(args[1]==='readwrite'){
 const del=store.delete.bind(store);store.delete=key=>{deletes.push([name,key]);return del(key);};
 if(name===target.store){const get=store.get.bind(store);store.get=physical=>{const q=get(physical);if(physical===target.key){let callback;Object.defineProperty(q,'onsuccess',{get:()=>callback,set:fn=>{callback=event=>{
  hit={transactionDone:tx.done,pendingRequests:tx.tasks.length,globalNativeRevision:db.meta.stores.get('native_states').rows.get(scopeKey).payload.revision,localNativeRevision:tx.local.get('native_states').rows.get(scopeKey).payload.revision,globalSharedRevision:db.meta.stores.get('b23_states').rows.get(scopeKey).payload.revision,localSharedRevision:tx.local.get('b23_states').rows.get(scopeKey).payload.revision};
  revoke();if(defect==='missing')q.result=undefined;
  if(defect==='checksum')q.result={...q.result,checksum:'0'.repeat(64)};
  if(defect==='key')q.result={...q.result,key:'wrong-physical-key'};
  if(defect==='schema'){q.result=structuredClone(q.result);q.result.payload.revision=0;q.result.checksum=digest(q.result.payload);}
  fn(event);
 };},configurable:true});}return q;};}
 }return store;};return tx;};
 return {get hit(){return hit;},get aborts(){return aborts;},deletes,restore(){db.transaction=original;}};
}
for(const mode of modes)for(const defect of ['valid','missing','checksum','key','schema'])for(const loss of ['guard','throw','signal'])test(`${mode} obsolete ${defect}: ${loss} loss during live bucket callback aborts owner`,async t=>{
 const h=await fixture(mode),db=await h.base.open(),target=await obsolete(h,mode);let allowed=true,probe;const controller=new AbortController();
 try{
 const before=await state(h);probe=intercept(db,target,{defect,revoke(){allowed=false;if(loss==='signal')controller.abort();}});
 const result=await apply(h,mode,{guard:()=>{if(!allowed&&loss==='throw')throw Error('bucket-guard-probe');return allowed;},signal:controller.signal});probe.restore();
 const after=await state(h);t.diagnostic(JSON.stringify({mode,defect,loss,result,atRevocation:probe.hit,aborts:probe.aborts,changedStores:stores.filter(name=>JSON.stringify(before[name])!==JSON.stringify(after[name]))}));
 assert(probe.hit,'exact obsolete bucket was never read');assert.equal(probe.hit.transactionDone,false);assert.equal(probe.hit.globalNativeRevision,2);assert(probe.aborts>0);assert.deepEqual(result,{ok:false,reason:loss==='throw'?'bucket-guard-probe':'stale-binding'});assert.deepEqual(after,before,'all six stores must match their pre-transaction bytes');
 }finally{probe?.restore();h.base.close();}
});
for(const mode of modes)for(const defect of ['missing','checksum','key','schema'])test(`${mode} obsolete ${defect}: live owner keeps conservative corruption tolerance`,async()=>{
 const h=await fixture(mode),db=await h.base.open(),target=await obsolete(h,mode);let probe;
 try{
 const old=await raw(h,target.key,target.store);probe=intercept(db,target,{defect});const result=await apply(h,mode,{guard:()=>true});probe.restore();
 assert(probe.hit);assert.equal(result.ok,true);assert.equal(probe.aborts,0,'old corruption alone must not abort an authorized owner');assert(!probe.deletes.some(([store,key])=>store===target.store&&key===target.key));assert.deepEqual(await raw(h,target.key,target.store),old,'unverified old bucket must not be deleted or replaced');
 if(mode==='native-indexed'){assert(await raw(h,target.piece));const facts=await h.native.read(scope);assert.equal(facts.revision,3);assert(facts.refs.X);assert.equal(facts.membership.X.state,'NONE');assert((await h.shared.read(scope)).state.refs.X);assert(await h.base.get(scope,'X'));}else assert.equal((await h.shared.read(scope)).state.identities.R.title,'title4');
 const committed=await state(h);assert.equal((await apply(h,mode,{guard:()=>true})).replayed,true);assert.deepEqual(await state(h),committed,'ordinary replay remains byte-identical');
 }finally{probe?.restore();h.base.close();}
});
for(const mode of modes)test(`${mode} only post-commit guard loss retains committed stale outcome`,async()=>{
 const h=await fixture(mode),db=await h.base.open(),original=db.transaction.bind(db);let tx;
 try{db.transaction=(...args)=>{const result=original(...args);if(args[1]==='readwrite')tx=result;return result;};const result=await apply(h,mode,{guard:()=>!tx?.done});db.transaction=original;
 assert.deepEqual(result,{ok:false,reason:'stale-after-commit',committed:true});
 if(mode==='native-indexed'){assert.equal((await raw(h)).payload.revision,3);assert((await h.shared.read(scope)).state.refs.X);}else assert.equal((await h.shared.read(scope)).state.identities.R.title,'title4');
 }finally{db.transaction=original;h.base.close();}
});
