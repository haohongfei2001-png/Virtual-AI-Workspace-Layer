/** Real production owner + remote controller + public codecs, with only scope
 * authority/IndexedDB doubled. No credentials are read and no network is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {productionFixture,REF} from './support/production-owner-fixture.mjs';
import {createRemoteProController} from '../../src/pro/ui/remote-controller.mjs';

const limits={taskMicros:12345,dayMicros:500000,monthMicros:2000000};
const configuration=()=>({schema:'vaiwl-pro-model-configuration/1',profile:{id:'synthetic_budget_ui',providerProfileId:'openai-responses',frozenModelVersion:'synthetic_model',promptVersion:'synthetic_prompt',outputSchemaVersion:'vaiwl-pro-model-output/1',inputKinds:['metadata'],maxInputTokens:32768,maxOutputTokens:1024,maxUtf8Bytes:32768,priceCardVersion:'synthetic_price',qualityGateReference:null},priceCard:{version:'synthetic_price',currency:'USD',providerProfileId:'openai-responses',inputPerMillion:'0.01',outputPerMillion:'0.02',validFrom:'2026-10-01T00:00:00Z',validThrough:'2026-11-30T23:59:59Z',otherMaximumMicros:0},billingProfileId:'synthetic_bill',maxChargePerTaskMicros:100000});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function fixture(t,{syntheticReview=false}={}){
 let entitlement='pro',credentialReads=0,transportCalls=0,intercept=null;
 const modelProvider={enabled:true,configuration:configuration(),disclosure:{provider:'OpenAI synthetic budget test',policyVersion:'synthetic-disclosure/1',policyUrl:'https://platform.openai.com/docs/guides/your-data',retentionText:'Synthetic only. No provider request is sent.'},canUse:()=>true,
  authorizeDispatch:async()=>{credentialReads++;if(syntheticReview)return {ok:true,apiKey:'synthetic-not-a-key'};throw Error('unexpected-credential-read');},transport:async(_url,options)=>{transportCalls++;if(!syntheticReview)throw Error('unexpected-provider-call');const payload=JSON.parse(JSON.parse(options.body).input[1].content);assert.equal(payload.items.length,1);assert.equal(payload.items[0].approvedTitle,'Positive none');return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({schemaVersion:'vaiwl-pro-model-output/1',requestNonce:payload.requestNonce,items:[{kind:'EXISTING',conversationHandle:payload.items[0].handle,topicHandle:payload.candidateTopics[0].handle,titleSuggestion:null,evidenceHandles:[payload.items[0].handle],reason:'same-object-goal',explanation:'合成单聊天复核，没有真实模型调用。'}]})}]}]}),{status:200});}};
 const f=await productionFixture(t,{modelProvider,getEntitlement:()=>entitlement});await f.ready();const calls=[];
 const remote=createRemoteProController({request:async(action,payload)=>{calls.push({action,payload:structuredClone(payload)});return intercept?intercept(action,payload,()=>f.request(action,payload)):f.request(action,payload);}});
 t.after(()=>remote.destroy());await remote.refresh();
 return {...f,remote,calls,setEntitlement(value){entitlement=value;},intercept(fn){intercept=fn;},providerCounts:()=>({credentialReads,transportCalls}),assertNoProvider(){assert.equal(credentialReads,0);assert.equal(transportCalls,0);}};
}

test('three exact limits persist through public review and duplicate pending confirmations write once',async t=>{
 const f=await fixture(t),initial=await f.remote.getModelBudget(),assets=await f.raw();
 assert.deepEqual(initial.settings.limits,{taskMicros:0,dayMicros:0,monthMicros:0});assert.equal(initial.settings.blocked,true);
 const preview=await f.remote.previewModelBudget(limits);assert.deepEqual(preview.before,initial.settings.limits);assert.deepEqual(preview.after,limits);
 const wait=deferred(),entered=deferred();let applies=0;
 f.intercept(async(action,payload,invoke)=>{if(payload.op==='model-budget-apply'){applies++;entered.resolve();await wait.promise;}return invoke();});
 const first=f.remote.configureModelBudget(preview),second=f.remote.configureModelBudget(preview);await entered.promise;assert.equal(applies,1);wait.resolve();
 const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.deepEqual(a.settings.limits,limits);
 const saved=await f.remote.getModelBudget();assert.deepEqual(saved.settings.limits,limits);assert.equal(saved.settings.revision,initial.settings.revision+1);assert.equal(saved.settings.remaining.queueMicros,500000);
 assert.equal(f.remote.getStatus().processingMode,'off');assert.deepEqual(await f.raw(),assets);
 const sent=f.calls.find(row=>row.payload.op==='model-budget-apply').payload;assert.deepEqual(Object.keys(sent).sort(),['expected','op','previewId']);assert(!JSON.stringify(sent).includes('nativeFields'));
 f.assertNoProvider();
});

test('a lost budget reply reuses the same reviewed receipt without raising limits a second time',async t=>{
 const f=await fixture(t),preview=await f.remote.previewModelBudget(limits);let lost=true;
 f.intercept(async(action,payload,invoke)=>{const value=await invoke();if(payload.op==='model-budget-apply'&&lost){lost=false;assert.equal(value.ok,true);return {ok:false,reason:'simulated-lost-reply'};}return value;});
 await assert.rejects(f.remote.configureModelBudget(preview),/pro-request-unavailable/);
 const before=(await f.request('background',{op:'model-budget'})).value.settings;assert.deepEqual(before.limits,limits);
 const retry=await f.remote.configureModelBudget(preview);assert.equal(retry.replayed,true);
 const after=await f.remote.getModelBudget();assert.equal(after.settings.revision,before.revision);assert.deepEqual(after.settings.limits,limits);f.assertNoProvider();
});

test('budget reads and previews reject replies from another source review',async t=>{
 const f=await fixture(t);
 f.intercept(async(action,payload,invoke)=>{const result=await invoke();if(payload.op==='model-budget')result.value.versions.scopeKey='another_budget_scope';return result;});
 await assert.rejects(f.remote.getModelBudget(),/stale-pro-model-budget/);
 f.intercept(async(action,payload,invoke)=>{const result=await invoke();if(payload.op==='model-budget-preview')result.value.expected.reviewId='0'.repeat(64);return result;});
 await assert.rejects(f.remote.previewModelBudget(limits),/stale-pro-model-budget/);
 f.intercept(null);assert.deepEqual((await f.remote.getModelBudget()).settings.limits,{taskMicros:0,dayMicros:0,monthMicros:0});f.assertNoProvider();
});

test('expired membership cannot apply a reviewed increase; explicit automatic preference defaults off',async t=>{
 const f=await fixture(t),stale=await f.remote.previewModelBudget(limits);f.setEntitlement('free');
 await assert.rejects(f.remote.configureModelBudget(stale),/pro-request-unavailable/);
 assert.deepEqual((await f.remote.getModelBudget()).settings.limits,{taskMicros:0,dayMicros:0,monthMicros:0});
 f.setEntitlement('pro');const fresh=await f.remote.previewModelBudget(limits);await f.remote.configureModelBudget(fresh);
 const preview=await f.remote.previewModel();assert.equal(preview.automaticAvailable,false);const before=f.calls.length;
 await assert.rejects(f.remote.enableModel(preview,{automatic:true}),/automatic-model-unavailable/);assert.equal(f.calls.length,before);
 await f.remote.enableModel(preview);assert.equal(f.calls.findLast(row=>row.payload.op==='model-enable').payload.automatic,false);
 assert.equal(f.remote.getStatus().processingMode,'cloud');assert.equal((await f.remote.getModelStatus()).model.automaticEnabled,false);f.assertNoProvider();
});

test('single-chat review uses its own public consent and leaves normal processing local with no automatic asset write',async t=>{
 const f=await fixture(t,{syntheticReview:true});await f.remote.dispatch({type:'CREATE_TOPIC',name:'Positive none'});
 await f.remote.configureModelBudget(await f.remote.previewModelBudget(limits));await f.remote.setLocalProcessing('local');
 const preview=await f.remote.previewModel({refIds:[REF],reviewOnly:true});assert.equal(preview.reviewOnly,true);assert.equal(preview.automaticAvailable,false);assert.equal(preview.sampleTotal,1);
 await assert.rejects(f.remote.enableModel(preview),/automatic-model-unavailable/);
 const replies=await Promise.all([f.remote.startModelReview(preview),f.remote.startModelReview(preview)]);assert.deepEqual(replies[0],replies[1]);
 assert.equal(f.calls.filter(row=>row.payload.op==='model-review-start').length,1);
 for(let i=0;i<500&&!f.service.isIdle();i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.service.isIdle(),true);
 await f.remote.refresh();assert.equal(f.remote.getStatus().processingMode,'local');
 const raw=await f.raw();assert.equal(Object.keys(raw.state.placements).length,0);assert.equal(Object.keys(raw.state.proposals).length,1);assert.equal(Object.values(raw.state.proposals)[0].proposal.refId,REF);
 const model=(await f.remote.getModelStatus()).model;assert.equal(model.automaticEnabled,false);assert.equal(model.jobs[0].state,'awaiting-review');
 assert.deepEqual(f.providerCounts(),{credentialReads:1,transportCalls:1});
});
