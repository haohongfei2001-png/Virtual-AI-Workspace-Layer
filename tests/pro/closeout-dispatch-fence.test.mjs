/** Actual production dispatch-fence callback over DB4 with lawful independent
 * source fixtures. This does not call a provider or claim real Free authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {productionFixture,NOW,REF,UNKNOWN} from './support/production-owner-fixture.mjs';
import {productionModelDispatchFence} from '../../src/pro/integration/model-dispatch-fence.mjs';
import {createSameDatabaseBillingStore} from '../../src/pro/integration/billing-store.mjs';
import {proRootKey,proRecoveryHeadKey} from '../../src/pro/integration/storage-registry.mjs';
import {queueJob,budgetSummary} from '../../src/pro/jobs/index.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {emptyFreeEvidence} from '../../src/data/free-evidence.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-partitions.mjs';
import {digest} from '../../src/data/hash.mjs';

const binding={modelProfileId:'synthetic_profile',modelVersion:'synthetic_model',promptVersion:'synthetic_prompt',outputSchemaVersion:'vaiwl-pro-model-output/1',priceCardVersion:'synthetic_prices'};
const envelope=(key,payload)=>({key,payload,checksum:digest(payload)});
async function write(db,entries){return new Promise((resolve,reject)=>{const tx=db.transaction([...new Set(entries.map(([store])=>store))],'readwrite');for(const [name,row,key] of entries){const store=tx.objectStore(name);if(row===null)store.delete(key);else store.put(row);}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function fixture(t,{repaired=false}={}){
  const f=await productionFixture(t);await f.ready();const db=await f.base.open();let previousHead=null;
  if(repaired){
    assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'派发前已恢复的资料'},expected:(await f.page()).value.versions,operationId:'prepare_repaired_topic'})).ok,true);
    await write(db,[['b23_states',null,proRootKey(f.scope.key)]]);const preview=await f.request('commit',{op:'recovery-preview'});assert.equal(preview.ok,true);
    const repaired=await f.request('commit',{op:'recovery-apply',previewId:preview.value.previewId,operationId:'prepare_explicit_repair'});assert.equal(repaired.ok,true,JSON.stringify(repaired));
    previousHead=await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states'),q=tx.objectStore('b23_states').get(proRecoveryHeadKey(f.scope.key));tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
    assert.equal((await f.request('commit',{op:'dispatch',command:{type:'SET_DERIVED_TITLE',refId:REF,title:'修复后的人工编辑'},expected:(await f.page()).value.versions,operationId:'post_repair_human'})).ok,true);
  }
  const snapshot=f.viewOwner.current().snapshot,overlayRevision=(await f.raw()).state.revision;
  const scope={kind:'verified-scope',key:f.scope.key,serverIdentity:'established',persistence:'same-idb'};
  const versions={scopeKey:scope.key,authorizationEpoch:1,sourceGeneration:{synthetic:1},nativeFields:{nativeRoot:snapshot.revision,evidenceRoot:Number(String(snapshot.evidenceRevision).split(':').at(-1)),workspaceRoot:snapshot.workspaceRevision??0},overlayRevision,targets:{},constraintRevision:overlayRevision,policyVersion:'synthetic-fence-policy',evidenceDigest:digest('independent-fence-fixture')};
  let current=true,counter=0;
  const session={context:f.c,live:()=>f.c.isCurrent(),dispatchCurrent:()=>current,dispatchVersions:structuredClone(versions)};
  const authority=Object.freeze({}),store=createSameDatabaseBillingStore({enabled:true,connection:async()=>db,clock:()=>new Date(NOW).toISOString(),verifyDispatchFence:productionModelDispatchFence(session),
    verifyAuthority(candidate,intent){if(candidate!==authority||!session.live())throw Error('model-authority-invalid');if(intent.action==='DISPATCH_JOB'&&!session.dispatchCurrent())throw Error('stale-model-input');return scope;}});
  const run=async command=>{const before=await store.read(authority);return store.transact(authority,{operationId:'fence_'+(++counter),expectedRevision:before.revision,command}).catch(error=>({ok:false,reason:error.message}));};
  const must=async pending=>{const result=await pending;assert.equal(result.ok,true,result.reason);return result.value;};
  await must(run({type:'CONFIGURE_POLICIES',policies:[{id:'synthetic_period',billingProfileId:'synthetic_billing',appliesTo:{kind:'installation-total'},currency:'USD',scale:6,ceiling:10000,window:{from:'2026-10-01T00:00:00Z',through:'2026-10-31T23:59:59Z'},providerProfileId:'openai-responses',pricingVersion:'synthetic_prices',revision:1}]}));
  await must(run({type:'QUEUE_JOB',checkpoint:queueJob({id:'synthetic_job',scope,versions,inputFingerprint:digest('synthetic-task'),modelBinding:binding,processing:'cloud'})}));
  await must(run({type:'RESERVE_JOB',jobId:'synthetic_job',reservationId:'synthetic_reservation',maximum:500,billingProfileId:'synthetic_billing',providerProfileId:'openai-responses',currency:'USD',priceCardVersion:'synthetic_prices',expectedBudgetRevisions:{synthetic_period:1}}));
  return {...f,db,store,authority,versions,session,run,must,previousHead,expire(){current=false;}};
}

test('actual production fence commits a paid dispatch marker only with matching Native/Evidence/Workspace/Pro roots',async t=>{
  const f=await fixture(t),result=await f.must(f.run({type:'DISPATCH_JOB',jobId:'synthetic_job'}));
  assert.equal(result.detail.networkDispatched,false);
  const saved=await f.store.read(f.authority);assert.equal(saved.jobs.synthetic_job.checkpoint.state,'dispatched');assert.equal(budgetSummary(saved.ledger,'synthetic_billing').uncertain,500);assert.equal(f.db.version,4);
});

for(const change of ['native','evidence','workspace','human-edit','source-deadline','source-vector','corrupt-native-marker'])
test('actual production dispatch refuses '+change+' after input preparation with zero billing writes',async t=>{
  const f=await fixture(t),before=await f.store.read(f.authority);
  if(change==='native'){
    f.wall(NOW+1);
    const update=await f.native.apply(f.scope,{operationId:'source_changed',expectedRevision:f.versions.nativeFields.nativeRoot,batch:{scopeKey:f.scope.key,sourceRevision:2,observedAt:new Date(NOW+1).toISOString(),validUntil:new Date(NOW+60000).toISOString(),projects:[],refs:[REF,UNKNOWN].map(id=>({id,nativeTitle:'新的独立来源版本',nativeUrl:'https://chatgpt.com/c/'+id,availability:'available'})),membership:[{id:REF,state:'NONE',projectId:null},{id:UNKNOWN,state:'UNKNOWN',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}});assert.equal(update.ok,true,update.reason);
  }else if(change==='evidence'){
    const key=freeEvidenceKey(f.scope.key),state={...emptyFreeEvidence(f.scope),revision:1};await write(f.db,[['native_states',envelope(key,state)],['native_operations',envelope(key,{revision:1})]]);
  }else if(change==='workspace')await write(f.db,[['b23_states',envelope(f.scope.key,{...emptyState(f.scope),revision:1})]]);
  else if(change==='human-edit')assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'模型准备后的人工整理'},expected:(await f.page()).value.versions,operationId:'human_after_model'})).ok,true);
  else if(change==='source-deadline')f.expire();
  else if(change==='source-vector')f.session.dispatchVersions={...f.versions,sourceGeneration:{synthetic:2}};
  else await write(f.db,[['native_operations',{key:f.scope.key,payload:{revision:1},checksum:'0'.repeat(64)}]]);
  const result=await f.run({type:'DISPATCH_JOB',jobId:'synthetic_job'});assert.equal(result.ok,false);assert.match(result.reason,/activity-revision-conflict|shared-root-changed|stale-model-input|corrupt-native/);
  assert.deepEqual(await f.store.read(f.authority),before);assert.equal((await f.store.read(f.authority)).jobs.synthetic_job.checkpoint.state,'reserved');
});

test('deadline withdrawal at the last dispatch journal reply rolls back the marker and held-cost transition',async t=>{
  const f=await fixture(t),before=await f.store.read(f.authority),transaction=f.db.transaction.bind(f.db);let expired=false;
  f.db.transaction=(names,mode)=>{const tx=transaction(names,mode),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{
    const store=objectStore(name);if(name==='b23_operations'&&mode==='readwrite'){const put=store.put.bind(store);store.put=value=>{const q=put(value);if(value.payload?.action==='DISPATCH_JOB'){
      let handler;Object.defineProperty(q,'onsuccess',{configurable:true,get:()=>handler,set:callback=>{handler=event=>{expired=true;f.expire();callback?.(event);};}});
    }return q;};}return store;};return tx;};
  const result=await f.run({type:'DISPATCH_JOB',jobId:'synthetic_job'});f.db.transaction=transaction;
  assert.equal(expired,true);assert.equal(result.ok,false);assert.equal(result.reason,'stale-model-input');assert.deepEqual(await f.store.read(f.authority),before);
});

test('missing Pro root with retained checkpoint cannot authorize model dispatch as an empty overlay',async t=>{
  const f=await fixture(t),before=await f.store.read(f.authority),key=proRootKey(f.scope.key);
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'必须保留'},expected:(await f.page()).value.versions,operationId:'retained_pro_root'})).ok,true);
  await write(f.db,[['b23_states',null,key]]);
  const result=await f.run({type:'DISPATCH_JOB',jobId:'synthetic_job'});assert.equal(result.ok,false);assert.equal(result.reason,'pro-missing-root-with-history');assert.deepEqual(await f.store.read(f.authority),before);
});

for(const kind of ['missing','rolled-back'])test('reader3 '+kind+' recovery high-water refuses dispatch even though Pro asset revision still matches',async t=>{
  const f=await fixture(t,{repaired:true}),before=await f.store.read(f.authority),key=proRecoveryHeadKey(f.scope.key);
  if(kind==='missing')await write(f.db,[['b23_states',null,key]]);else await write(f.db,[['b23_states',f.previousHead]]);
  const result=await f.run({type:'DISPATCH_JOB',jobId:'synthetic_job'});assert.equal(result.ok,false);assert.match(result.reason,/pro-recovery-(?:head-missing|current-root-mismatch)/);assert.deepEqual(await f.store.read(f.authority),before);
});
