import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A} from '../b23/contracts.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {nativeRecord,nativeRecoveryKey} from '../../src/data/native-partitions.mjs';
import {NATIVE_INDEX_FORMAT} from '../../src/data/native-version-index.mjs';
import {freeRecoveryStatus} from '../../src/data/free-recovery-status.mjs';
import {digest} from '../../src/data/hash.mjs';

const key=emptyNativeFacts(A).scopeKey,shadowKey=nativeRecoveryKey(key),now='2026-10-13T00:00:00Z';
function request(revision,ids){return {operationId:'write_'+revision,expectedRevision:revision-1,batch:{scopeKey:key,sourceRevision:revision,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:ids.map(id=>({id,nativeTitle:'Native '+id,nativeUrl:'https://fixture.test/c/'+id,availability:'available'})),membership:ids.map(id=>({id,state:'NONE',projectId:null})),inventory:{projects:'partial',conversations:'partial',cursor:null}}};}
async function setup(t,indexed=true){
 const h=await harness(new MockIDBFactory());t.after(()=>h.close());
 const native=new NativeRepository({baseRepository:h.base,workspaceRepository:h.repo,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'fixture',generation:'one'})}),db=await h.base.open();
 const raw=k=>new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').get(k);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
 const put=(...rows)=>new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');for(const row of rows)tx.objectStore('native_states').put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const snapshot=()=>new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),all={};for(const name of names){all[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){all[name].push(q.result.value);q.result.continue();}};}tx.oncomplete=()=>resolve(all);tx.onabort=()=>reject(tx.error);});
 assert.equal((await native.apply(A,request(1,['R']))).ok,true);
 const old=await raw(key);
 if(indexed)assert.equal((await native.migrateVersionIndex(A,{operationId:'migrate',expectedRevision:1})).ok,true);
 const revision=indexed?3:2;assert.equal((await native.apply(A,request(revision,['N']))).ok,true);
 const shared=(await h.repo.read(A)).state;
 assert.equal((await h.repo.command(A,{operationId:'keep-human',expectedRevision:shared.revision,command:{type:'CREATE_WORKSPACE',id:'manual',name:'Preserve human asset'}})).ok,true);
 const root=await raw(key),damaged={...root,checksum:'0'.repeat(64)};await put(damaged);
 return {...h,native,db,raw,put,snapshot,old,root,damaged};
}

for(const mode of ['status','recover'])test(`native ${mode} refuses a same-revision legacy shadow that loses a newer chat`,async t=>{
 const h=await setup(t);
 // An injected valid-but-mismatched shadow, not a claim that an atomic write
 // naturally creates this corruption. This is also the existing evidence guard.
 await h.put(nativeRecord(shadowKey,{...h.old.payload,revision:h.root.payload.revision}));
 const before=await h.snapshot();
 const result=mode==='status'?await freeRecoveryStatus(h.native,A,'native'):await h.native.recover(A,{operationId:'repair',damagedHash:digest(h.damaged)});
 if(mode==='status'){assert.equal(result.corrupt,true);assert.equal(result.recoverable,false);assert.equal(result.recoveryReason,'native-index-recovery-format-conflict');}
 else assert.deepEqual(result,{ok:false,reason:'native-index-recovery-format-conflict'});
 assert.deepEqual(await h.snapshot(),before,'no root, operation receipt, shared reference or Pro changes');
 assert.equal((await h.raw(key)).payload.format,NATIVE_INDEX_FORMAT);
 assert((await h.repo.read(A)).state.workspaces.manual);
});

for(const indexed of [false,true])test(`native ${indexed?'indexed':'legacy partition'} intact atomic shadow still repairs and revokes old sources`,async t=>{
 const h=await setup(t,indexed),before=await h.snapshot(),shared=(await h.repo.read(A)).state;
 const status=await freeRecoveryStatus(h.native,A,'native');assert.equal(status.recoverable,true,JSON.stringify(status));assert.deepEqual(await h.snapshot(),before,'status is read only');
 const result=await h.native.recover(A,{operationId:'repair',damagedHash:digest(h.damaged)});assert.equal(result.ok,true,JSON.stringify(result));
 const facts=await h.native.read(A);assert.deepEqual(Object.keys(facts.refs).sort(),['N','R']);assert.equal(facts.sources.fixture.revoked,true);assert.equal(facts.revision,h.root.payload.revision+1);assert.equal((await h.raw(key)).payload.format,h.root.payload.format);assert.deepEqual((await h.repo.read(A)).state,shared);
 const after=await h.snapshot();assert.equal((await h.native.recover(A,{operationId:'repair',damagedHash:digest(h.damaged)})).replayed,true);assert.deepEqual(await h.snapshot(),after);
});
