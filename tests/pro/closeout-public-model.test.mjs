import test from 'node:test';
import assert from 'node:assert/strict';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {digest} from '../../src/data/hash.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {emptyOverlay} from '../../src/pro/domain/index.mjs';
import {prepareMetadataEvidence} from '../../src/pro/organize/index.mjs';
import {queueJob} from '../../src/pro/jobs/lifecycle.mjs';
import {createSameDatabaseBillingStore} from '../../src/pro/integration/billing-store.mjs';
import {createProductionModelBridge} from '../../src/pro/integration/model-bridge.mjs';

// This exercises the packaged owner's bridge with a real DB4 transaction
// adapter and an in-process synthetic provider. It makes no network request.
const NOW = '2026-11-01T10:00:00.000Z';
const scope = {kind:'verified-scope',key:'closeout_public_model',serverIdentity:'established',persistence:'same-idb'};
const configuration = () => ({schema:'vaiwl-pro-model-configuration/1',billingProfileId:'synthetic_billing',maxChargePerTaskMicros:100000,
  profile:{id:'synthetic_profile',providerProfileId:'openai-responses',frozenModelVersion:'synthetic_model',promptVersion:'synthetic_prompt',
    outputSchemaVersion:'vaiwl-pro-model-output/1',inputKinds:['metadata'],maxInputTokens:32768,maxOutputTokens:1024,maxUtf8Bytes:32768,
    priceCardVersion:'synthetic_prices',qualityGateReference:null},
  priceCard:{version:'synthetic_prices',currency:'USD',providerProfileId:'openai-responses',inputPerMillion:'0.01',outputPerMillion:'0.02',
    validFrom:'2026-11-01T00:00:00Z',validThrough:'2026-11-30T23:59:59Z',otherMaximumMicros:0}});
const modelBinding = {modelProfileId:'synthetic_profile',modelVersion:'synthetic_model',promptVersion:'synthetic_prompt',
  outputSchemaVersion:'vaiwl-pro-model-output/1',priceCardVersion:'synthetic_prices'};
const policy = {id:'month',billingProfileId:'synthetic_billing',appliesTo:{kind:'installation-total'},currency:'USD',scale:6,ceiling:100000,
  window:{from:'2026-11-01T00:00:00Z',through:'2026-11-30T23:59:59Z'},providerProfileId:'openai-responses',pricingVersion:'synthetic_prices',revision:1};

async function fixture(t,{enabled=true,now=NOW,transport=null,canUse=true}={}) {
  const database=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'closeout_public_'+crypto.randomUUID()}),db=await database.open();
  const overlay=emptyOverlay(scope.key),references=[{id:'c_synthetic',nativeTitle:'数值积分参数核对',nativeUrl:'https://fixture.invalid/c/synthetic',
    membership:{state:'NONE',evidenceId:'synthetic_none',revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['synthetic_source']}];
  const control={mode:'automatic',locked:false,revision:0,lastHumanOperation:null};
  overlay.topics.t_synthetic={id:'t_synthetic',scopeKey:scope.key,name:'数值积分',aliases:[],icon:'◇',intent:null,nameControl:control,membershipControl:control,lifecycle:'active',createdBy:'human',revision:0};
  const versions={scopeKey:scope.key,authorizationEpoch:1,sourceGeneration:{synthetic:1},nativeFields:{c_synthetic:1},overlayRevision:0,
    targets:{},constraintRevision:0,policyVersion:'synthetic_policy',evidenceDigest:digest(references)};
  const capabilities={scope,metadata:'available',positiveNone:'available',selectedText:'unavailable',sentUserInput:'unavailable',historicalCompleteness:'partial',reasonCodes:[]};
  const context=()=>({pack:prepareMetadataEvidence({scope,references,versions,overlay,capabilities,consent:{mode:'cloud',inputKinds:['metadata'],revision:1}}),
    overlay:structuredClone(overlay),currentVersions:structuredClone(versions),mode:'pro-default-none',processing:'cloud',foregroundBusy:false,backgroundWhileNative:false});
  const store=createSameDatabaseBillingStore({enabled:true,connection:async()=>db,verifyAuthority:()=>scope,clock:()=>NOW});
  let counter=0,calls=0,registrations=0,notified;
  const idle=new Promise(resolve=>{notified=resolve;});
  const execute=async command=>{const before=await store.read({}),result=await store.transact({}, {operationId:'synthetic_op_'+(++counter),expectedRevision:before.revision,command});assert.equal(result.ok,true,result.reason);return result;};
  await execute({type:'CONFIGURE_POLICIES',policies:[policy]});
  const bridge=createProductionModelBridge({connection:async()=>db,context:async()=>context(),now:()=>Date.parse(now),notify:notified,
    register:async()=>{registrations++;return {ok:true};},provider:{enabled,configuration:configuration(),canUse:()=>canUse,
      authorizeDispatch:async()=>({ok:true,apiKey:'synthetic-non-secret'}),transport:async(...args)=>{calls++;if(!transport)throw Error('unexpected-synthetic-call');return transport(...args);}}});
  const session={key:'synthetic_document',context:{fixtureOnly:true},scope,live:()=>true,canRun:()=>true};
  t.after(()=>{bridge.stop();database.close();});
  const seed=async(id,{reserve=0,dispatch=false}={})=>{
    await execute({type:'QUEUE_JOB',checkpoint:queueJob({id,scope,versions,inputFingerprint:digest(id),modelBinding,processing:'cloud'})});
    if(reserve)await execute({type:'RESERVE_JOB',jobId:id,reservationId:'reservation_'+id,maximum:reserve,billingProfileId:'synthetic_billing',providerProfileId:'openai-responses',currency:'USD',priceCardVersion:'synthetic_prices',expectedBudgetRevisions:{month:1}});
    if(dispatch)await execute({type:'DISPATCH_JOB',jobId:id});
  };
  return {bridge,session,store,seed,idle,get calls(){return calls;},get registrations(){return registrations;}};
}

for(const [label,options] of [['disabled provider',{enabled:false}],['expired price card',{now:'2026-12-01T00:00:00Z'}],['withdrawn purpose approval',{canUse:false}]])
test('public model '+label+' retains historical liabilities and permits safe cleanup',async t=>{
  const f=await fixture(t,options);await f.seed('unsent',{reserve:300});await f.seed('sent',{reserve:500,dispatch:true});
  const before=await f.bridge.status(f.session);assert.equal(before.configured,true);assert.equal(before.enabled,false);
  assert.equal(before.totalJobs,2);assert.equal(before.budget.reserved,300);assert.equal(before.budget.uncertain,500);
  assert.equal(f.bridge.start(f.session).state,'unavailable');
  const cancelled=await f.bridge.cancel(f.session,'unsent');assert.equal(cancelled.jobs.find(job=>job.id==='unsent').state,'cancelled');
  assert.equal(cancelled.budget.reserved,0);assert.equal(cancelled.budget.uncertain,500);
  const recovered=await f.bridge.recover(f.session);assert.equal(recovered.jobs.find(job=>job.id==='sent').state,'outcome-unknown');
  assert.equal(recovered.budget.uncertain,500);assert.equal(f.calls,0);assert.equal(f.registrations,0);
});

test('cancelling a historical job does not abort a different live owner task',async t=>{
  let entered,finish,liveSignal;const enteredPromise=new Promise(resolve=>{entered=resolve;});
  const f=await fixture(t,{transport:async(_url,options)=>{liveSignal=options.signal;const payload=JSON.parse(JSON.parse(options.body).input[1].content);entered();
    return new Promise(resolve=>{finish=()=>resolve(new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
      schemaVersion:'vaiwl-pro-model-output/1',requestNonce:payload.requestNonce,items:[{kind:'EXISTING',conversationHandle:payload.items[0].handle,
        topicHandle:payload.candidateTopics[0].handle,titleSuggestion:null,evidenceHandles:[payload.items[0].handle],reason:'same-object-goal',explanation:'合成协议验证'}]})}]}],usage:{input_tokens:100,output_tokens:20}}),{status:200}));});}});
  // The old administrator policy is not a user's spending choice. This case
  // needs one actually dispatched task; the historical-only cases above must
  // remain usable without granting new task/day/month spending permission.
  const initialBudget=await f.bridge.budgetSettings(f.session);
  assert.deepEqual(initialBudget.limits,{taskMicros:0,dayMicros:0,monthMicros:0});assert.equal(initialBudget.blocked,true);
  const selectedBudget=await f.bridge.configureBudget(f.session,{limits:{taskMicros:1000,dayMicros:1000,monthMicros:1000},expectedRevision:initialBudget.revision,operationId:'explicit_synthetic_spending_choice'});
  assert.equal(selectedBudget.blocked,false);
  await f.seed('historical_unsent');assert.equal(f.bridge.start(f.session).state,'registered');
  await Promise.race([enteredPromise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('synthetic-task-did-not-dispatch')),2000);timer.unref();})]);
  try{
    const after=await f.bridge.cancel(f.session,'historical_unsent');assert.equal(after.jobs.find(job=>job.id==='historical_unsent').state,'cancelled');
    assert.equal(liveSignal.aborted,false);assert.equal(after.jobs.filter(job=>job.state==='dispatched').length,1);assert.equal(f.calls,1);
  }finally{finish();await f.idle;}
  const completed=await f.bridge.status(f.session);assert.equal(completed.jobs.filter(job=>job.state==='awaiting-review').length,1);assert.equal(completed.budget.uncertain,0);assert.equal(f.registrations,1);
});
