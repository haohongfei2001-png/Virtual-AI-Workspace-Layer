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

async function sharedMultiSetup(){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'shared_guard_'+crypto.randomUUID().replaceAll('-','')}),shared=new WorkspaceRepository({baseRepository:base,evidenceGate:()=> 'synthetic',clock:()=>now}),native=new NativeRepository({baseRepository:base,workspaceRepository:shared,observationGate:()=>({channel:'synthetic',sourceId:'guard_source',generation:'one'}),clock:()=>now}),h={base,shared,native};
 const seed=emptyState(scope);seed.revision=1;seed.channel='synthetic';seed.sources.fixture={id:'fixture',channel:'synthetic',description:'Synthetic only',trustLevel:'synthetic',observedAt:now,revoked:false};for(const id of ['R','S']){seed.refs[id]={id,nativeUrl:'https://fixture.test/c/'+id,nativeTitle:id,projectId:null,available:true};seed.identities[id]={id,title:id,aliases:[],owner:'bootstrap',locked:false,revision:1};}
 assert((await shared.initializePartitioned(scope,seed)).ok);assert((await shared.migrateSharedDirectory(scope,{operationId:'shared_migrate',expectedRevision:1})).ok);assert((await shared.ingest(scope,{operationId:'shared_events',expectedRevision:2,batch:{schema:'vaiwl-internal-evidence-v1',refs:[],sources:[],events:['R','S'].map(id=>({id:'event_'+id,sourceId:'fixture',conversationId:id,messageId:'message_'+id,branchId:'root',role:'user',kind:'new-send',sendState:'committed',sentAt:now,precision:'second',observedAt:now})),coverage:[]}})).ok);
 assert((await native.apply(scope,request(1))).ok);assert((await native.apply(scope,request(2))).ok);return h;
}


// The first rejected old bucket abandons its reader, but later requests were
// already queued in the same still-abortable owner transaction.
for(const mode of ['native-indexed','shared-command'])for(const secondDefect of ['valid','missing','checksum'])for(const loss of ['guard','throw','signal','live'])test(`${mode} abandoned old reader: first corrupt then ${secondDefect}/${loss}`,async t=>{
 const h=mode==='native-indexed'?await setup(true,true,['S']):await sharedMultiSetup(),db=await h.base.open(),original=db.transaction.bind(db),storeName=mode==='native-indexed'?'native_states':'b23_states';let allowed=true,aborts=0;const hits=[],deletes=[],controller=new AbortController();
 try{
 const old=(await raw(h,mode==='native-indexed'?nativeCheckpointKey(scopeKey):scopeKey,mode==='native-indexed'?'native_states':'b23_checkpoints')).payload;
 const oldKeys=new Set(mode==='native-indexed'?Object.entries(old.refs).map(([bucket,pointer])=>nativeIndexKey(scopeKey,'refs',bucket,pointer.revision)):Object.entries(old.refDirectory).map(([bucket,pointer])=>sharedRefDirectoryKey(scopeKey,old.generation,bucket,pointer.revision)));
 assert.equal(oldKeys.size,2);const before=await state(h);
 db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);if(args[1]==='readwrite'){const abort=tx.abort.bind(tx);tx.abort=()=>{aborts++;return abort();};}
 tx.objectStore=name=>{const store=objectStore(name);if(name===storeName&&args[1]==='readwrite'){const get=store.get.bind(store),del=store.delete.bind(store);store.delete=key=>{deletes.push(key);return del(key);};store.get=physical=>{const q=get(physical);if(oldKeys.has(physical)){let callback;Object.defineProperty(q,'onsuccess',{get:()=>callback,set:fn=>{callback=event=>{
 hits.push({key:physical,done:tx.done,pending:tx.tasks.length,allowed});
 if(hits.length===1)q.result={...q.result,checksum:'0'.repeat(64)};
 else{if(loss!=='live')allowed=false;if(loss==='signal')controller.abort();if(secondDefect==='missing')q.result=undefined;if(secondDefect==='checksum')q.result={...q.result,checksum:'0'.repeat(64)};}
 fn(event);
 };},configurable:true});}return q;};}return store;};return tx;};
 const options={guard:()=>{if(!allowed&&loss==='throw')throw Error('later-bucket-guard');return allowed;},signal:controller.signal};
 const result=mode==='native-indexed'?await h.native.apply(scope,request(3),options):await h.shared.command(scope,{operationId:'multi_title',expectedRevision:3,command:{type:'SET_TITLE',refId:'R',title:'multi4'}},options);db.transaction=original;const after=await state(h);
 t.diagnostic(JSON.stringify({mode,secondDefect,loss,result,hits,aborts,changedStores:stores.filter(name=>JSON.stringify(before[name])!==JSON.stringify(after[name]))}));
 assert.equal(hits.length,2);assert(hits.every(h=>!h.done));assert.equal(hits[0].allowed,true);
 if(loss==='live'){assert.equal(result.ok,true);assert.equal(aborts,0);assert(!deletes.some(key=>oldKeys.has(key)));for(const key of oldKeys)assert(await raw(h,key,storeName));if(mode==='native-indexed')assert((await h.native.read(scope)).refs.X);else assert.equal((await h.shared.read(scope)).state.identities.R.title,'multi4');}
 else{assert.deepEqual(result,{ok:false,reason:loss==='throw'?'later-bucket-guard':'stale-binding'});assert(aborts>0);assert.deepEqual(after,before,'abandoned reader cannot hide loss of the transaction owner');}
 }finally{db.transaction=original;h.base.close();}
});
