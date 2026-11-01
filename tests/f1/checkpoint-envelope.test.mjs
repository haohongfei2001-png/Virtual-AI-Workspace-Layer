/** MockIDB transaction/structured-clone contracts; not browser durability evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A} from '../b23/contracts.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {digest} from '../../src/data/hash.mjs';
const stateKey=emptyState(A).scopeKey;
async function setup(){
 const h=await harness(new MockIDBFactory(),{seed:false}),s=emptyState(A);s.revision=1;s.channel='synthetic';
 s.sources.S={id:'S',channel:'synthetic',description:'Checkpoint test',observedAt:'2026-10-11T04:00:00Z',trustLevel:'synthetic',revoked:false};
 s.refs.R={id:'R',nativeTitle:'Native',nativeUrl:'https://vaiwl-hf.test/hf/A/c/R',projectId:null,available:true};
 s.workspaces.W={id:'W',name:'Human workspace',icon:'◇',order:0,locked:true,owner:'human',revision:1};
 s.preferences.compactRows={id:'compactRows',value:false,owner:'human',revision:1};
 assert((await h.repo.initializePartitioned(A,s)).ok);return h;
}
async function raw(h,store='b23_states'){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),q=tx.objectStore(store).get(stateKey);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}
async function records(h){return {root:await raw(h),checkpoint:await raw(h,'b23_checkpoints')};}
const assertChecksum=row=>assert.equal(row.checksum,digest(row.payload));
const request=(revision,operationId='human_pref')=>({operationId,expectedRevision:revision,command:{type:'SET_PREFERENCE',id:'compactRows',value:true}});
const mutate=(h,apply,extra={})=>h.repo.mutate(A,{operationId:'impure',expectedRevision:1,fingerprint:{fixture:'impure'},type:'SYNTHETIC_TEST',actor:'human',apply,...extra});
const alter=current=>{current.sources.S.revoked=true;current.workspaces.W.name='Changed';current.preferences.compactRows.value=true;return {...current,revision:current.revision+1};};
test('checkpoint retains exact verified bytes even when reducer mutates shared header objects',async()=>{
 const h=await setup();try{const before=await raw(h),result=await mutate(h,alter);assert(result.ok,JSON.stringify(result));
  const after=await records(h);assert.deepEqual(after.checkpoint,before);assertChecksum(after.checkpoint);assertChecksum(after.root);
  assert.equal(after.root.payload.sources.S.revoked,true);assert.equal(after.root.payload.workspaces.W.name,'Changed');assert.equal(after.root.payload.preferences.compactRows.value,true);
  assert.equal(after.checkpoint.payload.sources.S.revoked,false);assert.equal(after.checkpoint.payload.preferences.compactRows.value,false);
 }finally{h.close();}
});
for(const failure of ['throw','abort','quota'])test(`provisional checkpoint and root roll back on ${failure}`,async()=>{
 const h=await setup();try{
  assert((await h.repo.command(A,request(1))).ok);const before=await records(h),controller=new AbortController();if(failure==='quota')h.factory.failNextPut=true;
  const result=await mutate(h,current=>{const next=alter(current);if(failure==='throw')throw Error('test-reducer-failed');if(failure==='abort')controller.abort();return next;},{signal:controller.signal,expectedRevision:before.root.payload.revision});
  assert.equal(result.ok,false);assert.match(result.reason,/test-reducer-failed|stale-binding|QuotaExceededError/);assert.deepEqual(await records(h),before);
 }finally{h.close();}
});
test('stale CAS and identical receipt replay leave checkpoint and root unchanged',async()=>{
 const h=await setup();try{
  assert((await h.repo.command(A,request(1))).ok);const before=await records(h);
  const stale=await h.repo.command(A,request(1,'stale_command'));assert.equal(stale.reason,'revision-conflict');assert.deepEqual(await records(h),before);
  const replay=await h.repo.command(A,request(1));assert.equal(replay.ok,true);assert.equal(replay.replayed,true);assert.deepEqual(await records(h),before);
 }finally{h.close();}
});
async function register(h,ids){const db=await h.base.open();return new Promise((resolve,reject)=>{
 const tx=db.transaction(['b23_states','b23_checkpoints','b23_operations','refs'],'readwrite');let error;
 h.repo.registerNativeReferences(tx,A,ids.map(id=>({id,nativeTitle:'Native '+id,nativeUrl:`https://vaiwl-hf.test/hf/A/c/${id}`,projectId:null,availability:'available'})),'register_refs',()=>{},()=>{},e=>{error=e;tx.abort();});
 tx.oncomplete=resolve;tx.onabort=()=>reject(error??tx.error);
});}
test('native registration checkpoints only when it actually adds a reference',async()=>{
 const h=await setup();try{
  assert((await h.repo.command(A,request(1))).ok);const before=await records(h);
  await register(h,['R']);assert.deepEqual(await records(h),before);
  await register(h,['R','N']);const after=await records(h);assert.deepEqual(after.checkpoint,before.root);assertChecksum(after.checkpoint);assertChecksum(after.root);
  assert.equal(after.root.payload.refVersions.N,after.root.payload.revision);assert.equal(after.root.payload.workspaces.W.name,'Human workspace');
 }finally{h.close();}
});
async function corrupt(h){const db=await h.base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite'),store=tx.objectStore('b23_states'),q=store.get(stateKey);q.onsuccess=()=>store.put({...q.result,checksum:'intentionally-corrupt'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
test('corrupt old root cannot replace a valid checkpoint',async()=>{
 const h=await setup();try{assert((await h.repo.command(A,request(1))).ok);await corrupt(h);const before=await records(h);
  const result=await h.repo.command(A,request(2,'after_corruption'));assert.equal(result.ok,false);assert.equal(result.reason,'corrupt-record');assert.deepEqual(await records(h),before);
 }finally{h.close();}
});
test('recovery checkpoints the new recovered root and preserves latest human changes',async()=>{
 const h=await setup();try{
  assert((await h.repo.command(A,{operationId:'rename',expectedRevision:1,command:{type:'UPDATE_WORKSPACE',id:'W',name:'Latest human name'}})).ok);
  await corrupt(h);const plan=await h.repo.recoveryStatus(A);assert(plan.recoverable,JSON.stringify(plan));
  const result=await h.repo.recover(A,{operationId:'recover',damagedHash:plan.damagedHash});assert(result.ok,JSON.stringify(result));
  const after=await records(h);assert.deepEqual(after.checkpoint,after.root);assertChecksum(after.root);assert.equal(after.root.payload.workspaces.W.name,'Latest human name');assert.equal(after.root.payload.sources.S.revoked,true);
 }finally{h.close();}
});

import {checkpointEnvelopeCases} from './checkpoint-envelope-cases.mjs';
for(const contract of checkpointEnvelopeCases(new MockIDBFactory()))test('portable MOCK_IDB: '+contract.name,contract.run);
