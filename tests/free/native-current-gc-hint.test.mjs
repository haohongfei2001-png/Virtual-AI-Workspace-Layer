/** Native GC work lists are not replay receipts or the shared replica delta log. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A} from '../b23/contracts.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {nativeRecord,nativeCheckpointKey,nativePartitionKey} from '../../src/data/native-partitions.mjs';
const now='2026-10-13T00:00:00Z',scopeKey=emptyNativeFacts(A).scopeKey;
const gate={channel:'synthetic',sourceId:'hints',generation:'one'};
const command=(n)=>({operationId:'hint_'+n,expectedRevision:n-1,batch:{scopeKey,sourceRevision:n,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[{id:'P',nativeName:'Project '+n,nativeUrl:'https://fixture.test/project/P',availability:'available'}],refs:[{id:'R',nativeTitle:'Title '+n,nativeUrl:'https://fixture.test/c/R',availability:'available'},...(n===1?[{id:'U',nativeTitle:'Untouched',nativeUrl:'https://fixture.test/c/U',availability:'available'}]:[])],membership:[{id:'R',state:'PROJECT',projectId:'P'},...(n===1?[{id:'U',state:'NONE',projectId:null}]:[])],inventory:{projects:'partial',conversations:'partial',cursor:null}}});
async function setup(indexed){const h=await harness(new MockIDBFactory(),{seed:false});h.native=new NativeRepository({baseRepository:h.base,observationGate:()=>gate,clock:()=>now});assert.equal((await h.native.apply(A,command(1))).ok,true);if(indexed)assert.equal((await h.native.migrateVersionIndex(A,{operationId:'hint_migrate',expectedRevision:1})).ok,true);return h;}
async function raw(h,key=scopeKey){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}
async function put(h,row){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');tx.objectStore('native_states').put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function state(h){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations']),out={};for(const store of ['native_states','native_operations']){out[store]=[];const q=tx.objectStore(store).openCursor();q.onsuccess=()=>{const c=q.result;if(c){out[store].push(c.value);c.continue();}};}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});}
for(const indexed of [false,true]){
 const format=indexed?'indexed':'partitioned';
 test(format+' accepts old 64-row roots, preserves exact checkpoint and all receipts, writes only current complete GC hint',async()=>{const h=await setup(indexed);try{
  const old=await raw(h),revision=old.payload.revision;
  old.payload.changes=[...Array.from({length:63},()=>({revision:1,projects:[],refs:[]})),{revision,projects:['P'],refs:['R','U']}];
  const legacy=nativeRecord(scopeKey,old.payload);await put(h,legacy);
  assert.deepEqual((await h.native.header(A)).manifest.changes,legacy.payload.changes,'old history remains readable and is not normalized away');
  const before=await state(h),request=command(revision+1),result=await h.native.apply(A,request);assert.equal(result.ok,true,JSON.stringify(result));
  const current=await raw(h),checkpoint=await raw(h,nativeCheckpointKey(scopeKey));
  assert.deepEqual(checkpoint,{...legacy,key:nativeCheckpointKey(scopeKey)},'retained checkpoint must be exact old bytes/checksum');
  assert.deepEqual(current.payload.changes,[{revision:revision+1,projects:['P'],refs:['R']}]);
  const after=await state(h);for(const receipt of before.native_operations.filter(row=>row.key!==scopeKey))assert(after.native_operations.some(row=>JSON.stringify(row)===JSON.stringify(receipt)),'historical operation receipt retained');
  const facts=await h.native.read(A);assert.equal(facts.refs.R.nativeTitle,'Title '+(revision+1));assert.equal(facts.refs.U.nativeTitle,'Untouched');assert.equal(facts.membership.R.projectId,'P');
  assert.equal((await h.native.apply(A,request)).replayed,true);assert.deepEqual(await state(h),after);
  assert.equal((await h.native.apply(A,command(revision+2))).ok,true);
  assert.equal(await raw(h,nativePartitionKey(scopeKey,'refs','R',1)),undefined);
  assert(await raw(h,nativePartitionKey(scopeKey,'refs','U',1)),'untouched retained version survives GC');
 }finally{h.close();}});
 test(format+' validates stale hint bytes rather than discarding them before verification',async()=>{const h=await setup(indexed);try{
  const old=await raw(h);old.payload.changes.unshift({revision:1,projects:[],refs:['tampered']});await put(h,old);
  const before=await state(h),result=await h.native.apply(A,command(old.payload.revision+1));assert.equal(result.ok,false);assert.deepEqual(await state(h),before);
 }finally{h.close();}});
 test(format+' membership-only writes and source revocation retain precise current work lists',async()=>{const h=await setup(indexed);try{
  const old=await raw(h),revision=old.payload.revision,request=command(revision+1);request.batch.projects=[];request.batch.refs=[];request.batch.membership=[{id:'R',state:'NONE',projectId:null}];
  assert.equal((await h.native.apply(A,request)).ok,true);assert.deepEqual((await raw(h)).payload.changes,[{revision:revision+1,projects:[],refs:['R']}]);
  assert.equal((await h.native.read(A)).membership.R.state,'NONE');
  assert.equal((await h.native.invalidate(A,{operationId:'invalidate_hints',expectedRevision:revision+1,sourceId:'hints'})).ok,true);
  const root=await raw(h);assert.deepEqual(root.payload.changes,[{revision:revision+2,projects:[],refs:[]}]);assert.equal(root.payload.sources.hints.revoked,true);
  const facts=await h.native.read(A);assert.deepEqual(Object.keys(facts.refs).sort(),['R','U']);assert.equal(facts.membership.R.state,'NONE');
 }finally{h.close();}});
}
