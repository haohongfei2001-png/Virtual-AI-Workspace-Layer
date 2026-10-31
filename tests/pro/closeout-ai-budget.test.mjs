/** Synthetic DB4/account doubles only; no provider request or real money. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {digest} from '../../src/data/hash.mjs';
import {queueJob} from '../../src/pro/jobs/lifecycle.mjs';
import {budgetPeriods,userBudgetKey} from '../../src/pro/jobs/budget.mjs';
import {createModelBudgetOwner,verifyModelBudgetFence} from '../../src/pro/integration/model-budget.mjs';
import {createSameDatabaseBillingStore,billingRootKey,billingOperationKey} from '../../src/pro/integration/billing-store.mjs';

const NOW='2026-10-31T12:00:00.000Z',scope=key=>({kind:'verified-scope',key,serverIdentity:'established',persistence:'same-idb'});
const config=()=>({schema:'vaiwl-pro-model-configuration/1',profile:{id:'budget_model',providerProfileId:'openai-responses',frozenModelVersion:'synthetic_model',promptVersion:'synthetic_prompt',outputSchemaVersion:'vaiwl-pro-model-output/1',inputKinds:['metadata'],maxInputTokens:32768,maxOutputTokens:1024,maxUtf8Bytes:32768,priceCardVersion:'synthetic_price',qualityGateReference:null},priceCard:{version:'synthetic_price',currency:'USD',providerProfileId:'openai-responses',inputPerMillion:'0.01',outputPerMillion:'0.02',validFrom:'2026-10-01T00:00:00Z',validThrough:'2026-12-31T23:59:59Z',otherMaximumMicros:0},billingProfileId:'shared_payment',maxChargePerTaskMicros:1000});
const limits={taskMicros:500,dayMicros:800,monthMicros:2000};
const versions=key=>({scopeKey:key,authorizationEpoch:1,sourceGeneration:{synthetic:1},nativeFields:{root:1},overlayRevision:0,targets:{},constraintRevision:0,policyVersion:'synthetic',evidenceDigest:digest('synthetic')});
const binding={modelProfileId:'budget_model',modelVersion:'synthetic_model',promptVersion:'synthetic_prompt',outputSchemaVersion:'vaiwl-pro-model-output/1',priceCardVersion:'synthetic_price'};
async function fixture(t){
 const factory=new MockIDBFactory(),base=new ScopeRepository({indexedDB:factory,databaseName:'budget_settings_'+crypto.randomUUID()}),db=await base.open();let now=NOW,serial=0;
 const a=Object.freeze({}),b=Object.freeze({}),grants=new Map([[a,scope('scope_a')],[b,scope('scope_b')]]);
 const store=createSameDatabaseBillingStore({enabled:true,connection:()=>db,clock:()=>now,verifyAuthority:token=>{if(!grants.has(token))throw Error('no-authority');return grants.get(token);}});
 const owner=createModelBudgetOwner({configuration:config(),billingStore:store,clock:()=>now});
 const execute=async(command,token=a)=>{const before=await store.read(token);const out=await store.transact(token,{operationId:'operation_'+(++serial),expectedRevision:before.revision,command});assert.equal(out.ok,true,JSON.stringify(out));return out;};
 const save=async(value=limits,extra={})=>owner.configure(a,{limits:value,expectedRevision:(await store.read(a)).revision,...extra});
 const queue=async(id,token=a)=>execute({type:'QUEUE_JOB',checkpoint:queueJob({id,scope:grants.get(token),versions:versions(grants.get(token).key),inputFingerprint:digest(id),modelBinding:binding,processing:'cloud'})},token);
 const reserve=async(id,maximum,token=a)=>{const before=await store.read(token);return execute({type:'RESERVE_JOB',jobId:id,reservationId:'reservation_'+id,maximum,billingProfileId:'shared_payment',providerProfileId:'openai-responses',currency:'USD',priceCardVersion:'synthetic_price',expectedBudgetRevisions:Object.fromEntries(Object.values(before.ledger.policies).map(p=>[p.id,p.revision]))},token);};
 const raw=async(key=billingRootKey)=>new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states','b23_operations'],'readonly'),q=tx.objectStore(key===billingRootKey?'b23_states':'b23_operations').get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
 const fence=async expected=>new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states'],'readonly');let passed=false,failure;verifyModelBudgetFence(tx,expected,()=>true,()=>{passed=true;},reason=>{failure=reason;tx.abort();},{now});tx.oncomplete=()=>resolve(passed);tx.onabort=()=>reject(Error(failure));});
 t.after(()=>base.close());return {factory,db,base,a,b,store,owner,execute,save,queue,reserve,raw,fence,wall:value=>now=value,now:()=>now};
}

test('user money choices default to zero and create only the existing DB4 installation record',async t=>{
 const f=await fixture(t),initial=await f.owner.settings(f.a);
 assert.equal(initial.configured,true);assert.deepEqual(initial.limits,{taskMicros:0,dayMicros:0,monthMicros:0});assert.deepEqual(initial.remaining,{dayMicros:0,monthMicros:0,queueMicros:0});assert.equal(initial.blocked,true);assert.equal(await f.raw(),undefined);
 const saved=await f.save();assert.deepEqual(saved.limits,limits);assert.equal(saved.taskMaximumMicros,1000);assert.equal(saved.remaining.queueMicros,800);assert.equal(saved.blocked,false);
 const root=await f.raw();assert.equal(root.payload.format,'vaiwl-pro-billing-root/3');assert.equal(root.payload.minimumReader,'vaiwl-pro-billing-storage/3');assert.equal(Object.keys(root.payload.ledger.policies).length,2);assert.deepEqual(root.payload.userBudgets[userBudgetKey('shared_payment')].limits,limits);assert.equal(f.factory.databasesMap.size,1);assert.equal(f.db.version,4);
});

test('only exact safe money choices are accepted; a frame cannot select provider, window or increase the trusted task maximum',async t=>{
 const f=await fixture(t);
 for(const bad of [{...limits,taskMicros:1001},{...limits,dayMicros:-1},{...limits,monthMicros:0.1},{...limits,dayMicros:Number.MAX_SAFE_INTEGER+1},{...limits,provider:'injected'},{...limits,window:{from:NOW}}])await assert.rejects(f.owner.configure(f.a,{limits:bad,expectedRevision:0}));
 assert.equal((await f.store.read(f.a)).revision,0);assert.equal(await f.raw(),undefined);
});

test('one-use budget operation replay preserves the exact receipt and conflicting reuse cannot overwrite choices',async t=>{
 const f=await fixture(t),request={limits,expectedRevision:0,operationId:'same_budget_review'};
 await f.owner.configure(f.a,request);const before=await f.store.read(f.a),receipt=await f.raw(billingOperationKey(request.operationId));
 await f.owner.configure(f.a,request);assert.deepEqual(await f.store.read(f.a),before);assert.deepEqual(await f.raw(billingOperationKey(request.operationId)),receipt);
 await assert.rejects(f.owner.configure(f.a,{...request,limits:{...limits,dayMicros:900}}),/replay-conflict/);assert.deepEqual((await f.owner.settings(f.a)).limits,limits);
});

test('all scopes share the same selected limits and reservation usage, including scope switch and reopening',async t=>{
 const f=await fixture(t);await f.save();await f.queue('first');await f.reserve('first',500);
 const second=await f.owner.settings(f.b);assert.deepEqual(second.limits,limits);assert.deepEqual(second.usage,{dayMicros:500,monthMicros:500});assert.equal(second.remaining.queueMicros,300);
 const reopened=createModelBudgetOwner({configuration:config(),billingStore:f.store,clock:f.now});assert.deepEqual(await reopened.settings(f.b),second);
 await f.queue('second',f.b);await f.reserve('second',300,f.b);assert.equal((await reopened.settings(f.a)).remaining.queueMicros,0);assert.equal((await reopened.settings(f.a)).blocked,true);
});

test('task-only tightening releases unsent work but never refunds settled or sent-uncertain charges',async t=>{
 const f=await fixture(t);await f.save();await f.queue('sent');await f.reserve('sent',200);await f.execute({type:'DISPATCH_JOB',jobId:'sent'});
 await f.queue('unsent');await f.reserve('unsent',200);const fence=(await f.owner.prepare(f.a,{scope:scope('scope_a')})).fence;
 await f.save({...limits,taskMicros:0});const saved=await f.store.read(f.a);
 assert.equal(saved.jobs.unsent.checkpoint.state,'cancelled');assert.equal(saved.ledger.reservations.reservation_unsent.reservation.status,'released');assert.equal(saved.jobs.sent.checkpoint.state,'dispatched');assert.equal(saved.ledger.reservations.reservation_sent.reservation.status,'sent-uncertain');assert.equal((await f.owner.settings(f.b)).usage.dayMicros,200);
 await assert.rejects(f.owner.assertCurrent(f.a,fence),/model-budget-changed/);await assert.rejects(f.fence(fence),/model-budget-changed/);
});

test('UTC day/month rollover retains unknown liabilities and derives new policy windows from prior user choices',async t=>{
 const f=await fixture(t);await f.save();await f.queue('unknown');await f.reserve('unknown',300);await f.execute({type:'DISPATCH_JOB',jobId:'unknown'});await f.execute({type:'CANCEL_JOB',jobId:'unknown',reason:'synthetic-no-reply'});
 const prior=(await f.owner.prepare(f.a,{scope:scope('scope_a')})).fence;f.wall('2026-11-01T00:00:00.000Z');
 const refreshed=await f.owner.prepare(f.b,{scope:scope('scope_b')});assert.equal(refreshed.settings.usage.dayMicros,300);assert.equal(refreshed.settings.usage.monthMicros,300);assert.equal(refreshed.settings.remaining.queueMicros,500);assert.deepEqual(refreshed.settings.periods,budgetPeriods(f.now()));
 assert.equal(Object.keys((await f.store.read(f.a)).ledger.policies).length,4);await assert.rejects(f.fence(prior),/model-budget-changed/);
});

test('current settled costs remain counted after a user raises or lowers daily/monthly choices',async t=>{
 const f=await fixture(t);await f.save();await f.queue('done');await f.reserve('done',200);await f.execute({type:'DISPATCH_JOB',jobId:'done'});await f.execute({type:'COMPLETE_JOB',jobId:'done',resultDigest:digest('synthetic'),actualCharge:180,reportedExactChargeDecimal:null});
 const raised=await f.save({...limits,dayMicros:1000,monthMicros:3000});assert.deepEqual(raised.usage,{dayMicros:180,monthMicros:180});assert.equal(raised.remaining.queueMicros,820);
 const lowered=await f.save({...limits,dayMicros:100});assert.equal(lowered.remaining.queueMicros,0);assert.equal(lowered.nearLimit,true);assert.equal(lowered.blocked,true);assert.equal((await f.store.read(f.a)).ledger.reservations.reservation_done.reservation.actualCharge,180);
});

test('external trusted policy change invalidates the exact transaction fence without requiring a UI callback',async t=>{
 const f=await fixture(t);await f.save();const fence=(await f.owner.prepare(f.a,{scope:scope('scope_a')})).fence;assert.equal(await f.fence(fence),true);
 const before=await f.store.read(f.a),policy=Object.values(before.ledger.policies)[0];await f.execute({type:'CONFIGURE_POLICIES',policies:[{...policy,ceiling:0,revision:policy.revision+1}]});
 await assert.rejects(f.owner.assertCurrent(f.a,fence),/model-budget-changed/);await assert.rejects(f.fence(fence),/model-budget-changed/);
});

test('queue availability includes stricter installation and current-scope ceilings without charging another scope sublimit',async t=>{
 const f=await fixture(t);await f.save();const policy={id:'extra_global',billingProfileId:'shared_payment',appliesTo:{kind:'installation-total'},currency:'USD',scale:6,ceiling:400,window:{from:'2026-10-01T00:00:00.000Z',through:'2026-10-31T23:59:59.999Z'},providerProfileId:'openai-responses',pricingVersion:'synthetic_price',revision:1};
 await f.execute({type:'CONFIGURE_POLICIES',policies:[policy,{...policy,id:'extra_a',ceiling:50,appliesTo:{kind:'scope-sublimit',scopeKey:'scope_a'}},{...policy,id:'extra_b',ceiling:0,appliesTo:{kind:'scope-sublimit',scopeKey:'scope_b'}}]});
 const a=createModelBudgetOwner({configuration:config(),billingStore:f.store,scopeKey:'scope_a',clock:f.now}),b=createModelBudgetOwner({configuration:config(),billingStore:f.store,scopeKey:'scope_b',clock:f.now});
 assert.equal((await a.settings(f.a)).remaining.queueMicros,50);assert.equal((await a.settings(f.a)).blocked,false);assert.equal((await b.settings(f.b)).remaining.queueMicros,0);assert.equal((await b.settings(f.b)).blocked,true);
 await f.execute({type:'CONFIGURE_POLICIES',policies:[{...policy,pricingVersion:'other_price',revision:2}]});assert.equal((await a.settings(f.a)).remaining.queueMicros,0);assert.equal((await a.settings(f.a)).blocked,true);
});

test('raising trusted underlying policies cannot bypass the user-selected day or single-task limit inside reservation transaction',async t=>{
 const f=await fixture(t);await f.save();const saved=await f.store.read(f.a);await f.execute({type:'CONFIGURE_POLICIES',policies:Object.values(saved.ledger.policies).map(p=>({...p,ceiling:10000,revision:p.revision+1}))});
 await f.queue('held');await f.reserve('held',500);await f.queue('exceeds_day');const before=await f.store.read(f.a);
 const command={type:'RESERVE_JOB',jobId:'exceeds_day',reservationId:'day_overflow',maximum:400,billingProfileId:'shared_payment',providerProfileId:'openai-responses',currency:'USD',priceCardVersion:'synthetic_price',expectedBudgetRevisions:Object.fromEntries(Object.values(before.ledger.policies).map(p=>[p.id,p.revision]))};
 const rejected=await f.store.transact(f.a,{operationId:'reject_day',expectedRevision:before.revision,command});assert.equal(rejected.ok,false);assert.equal(rejected.reason,'budget-exceeded');assert.deepEqual(await f.store.read(f.a),before);
 const task=await f.store.transact(f.a,{operationId:'reject_task',expectedRevision:before.revision,command:{...command,maximum:501}});assert.equal(task.ok,false);assert.equal(task.reason,'task-budget-exceeded');
});

test('budget identity cannot reinterpret an existing payment profile in another currency/provider',async t=>{
 const f=await fixture(t);await f.save();const next=config();next.priceCard.currency='CNY';
 const different=createModelBudgetOwner({configuration:next,billingStore:f.store,clock:f.now});assert.equal((await different.settings(f.a)).blocked,true);
 await assert.rejects(different.configure(f.a,{limits,expectedRevision:(await f.store.read(f.a)).revision}),/billing-profile-currency-mismatch/);assert.equal((await f.owner.settings(f.a)).currency,'USD');
});

test('root/3 survives real journal rollover and earlier budget receipts remain replayable and byte-exact',async t=>{
 const f=await fixture(t),request={limits,expectedRevision:0,operationId:'first_user_budget'};await f.owner.configure(f.a,request);const original=await f.raw(billingOperationKey(request.operationId));
 for(let i=0;i<513;i++)await f.save(limits,{operationId:'roll_user_'+i});
 const before=await f.store.read(f.a),root=await f.raw();assert.equal(root.payload.format,'vaiwl-pro-billing-root/3');assert.equal(root.payload.minimumReader,'vaiwl-pro-billing-storage/3');assert(root.payload.history);assert.deepEqual(root.payload.userBudgets[userBudgetKey('shared_payment')].limits,limits);
 await f.owner.configure(f.a,request);assert.deepEqual(await f.store.read(f.a),before);assert.deepEqual(await f.raw(billingOperationKey(request.operationId)),original);
});
