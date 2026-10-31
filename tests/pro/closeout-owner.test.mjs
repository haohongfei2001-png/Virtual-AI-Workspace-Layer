/** Production owner with explicit synthetic authority and strict IDB double.
 * Provider transport below is a local Response function, never a network call. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {productionFixture,NOW,REF,UNKNOWN} from './support/production-owner-fixture.mjs';
import {syntheticQualityFixture} from './support/synthetic-quality.mjs';
import {createSameDatabaseBillingStore} from '../../src/pro/integration/billing-store.mjs';
import {createProductionProService} from '../../src/pro/integration/production-owner.mjs';
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const commit=async(f,command,operationId)=>{const out=await f.request('commit',{op:'dispatch',command,expected:(await f.page()).value.versions,operationId});assert.equal(out.ok,true,JSON.stringify(out));return out;};
async function addReferences(f,titles){
 const refs=titles.map((nativeTitle,i)=>({id:'90000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),nativeTitle,nativeUrl:'https://chatgpt.com/c/90000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),availability:'available'}));
 const response=await f.native.apply(f.scope,{operationId:'additional_source',expectedRevision:(await f.native.read(f.scope)).revision,batch:{scopeKey:f.scope.key,sourceRevision:2,observedAt:new Date(NOW).toISOString(),validUntil:new Date(NOW+60000).toISOString(),projects:[],refs,membership:refs.map(r=>({id:r.id,state:'NONE',projectId:null})),inventory:{projects:'partial',conversations:'partial',cursor:null}}});
 assert.equal(response.ok,true,response.reason);await f.viewOwner.refresh({pageSize:1000});return refs;
}
const disclosure={provider:'OpenAI · synthetic transport',policyVersion:'synthetic-disclosure/1',policyUrl:'https://platform.openai.com/docs/guides/your-data',retentionText:'Synthetic disclosure only. store:false is not zero retention; no real provider call in these tests.'};
async function enableCloud(f,{automatic=false,backgroundWhileNative=false}={}){const preview=await f.request('background',{op:'model-preview',expected:(await f.page()).value.versions});assert.equal(preview.ok,true,JSON.stringify(preview));const enabled=await f.request('background',{op:'model-enable',previewId:preview.value.previewId,expected:preview.value.expected,automatic,backgroundWhileNative});assert.equal(enabled.ok,true,JSON.stringify(enabled));return preview.value;}
const configuration=()=>({schema:'vaiwl-pro-model-configuration/1',profile:{id:'synthetic_owner',providerProfileId:'openai-responses',frozenModelVersion:'synthetic_model',promptVersion:'synthetic_prompt',outputSchemaVersion:'vaiwl-pro-model-output/1',inputKinds:['metadata'],maxInputTokens:32768,maxOutputTokens:1024,maxUtf8Bytes:32768,priceCardVersion:'synthetic_price',qualityGateReference:null},priceCard:{version:'synthetic_price',currency:'USD',providerProfileId:'openai-responses',inputPerMillion:'0.01',outputPerMillion:'0.02',validFrom:'2026-10-01T00:00:00Z',validThrough:'2026-11-30T23:59:59Z',otherMaximumMicros:0},billingProfileId:'synthetic_bill',maxChargePerTaskMicros:100000});
const policy={id:'synthetic_month',billingProfileId:'synthetic_bill',appliesTo:{kind:'installation-total'},currency:'USD',scale:6,ceiling:100000,window:{from:'2026-10-01T00:00:00Z',through:'2026-11-30T23:59:59Z'},providerProfileId:'openai-responses',pricingVersion:'synthetic_price',revision:1};
const answer=payload=>new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({schemaVersion:'vaiwl-pro-model-output/1',requestNonce:payload.requestNonce,items:payload.items.map(item=>({kind:'EXISTING',conversationHandle:item.handle,topicHandle:payload.candidateTopics[0].handle,titleSuggestion:null,evidenceHandles:[item.handle],reason:'same-object-goal',explanation:'合成协议回归，无真实模型调用。'}))})}]}]}),{status:200});
async function allowSyntheticBudget(f,limits={taskMicros:100000,dayMicros:100000,monthMicros:100000}){
 const preview=await f.request('background',{op:'model-budget-preview',limits,expected:(await f.page()).value.versions});assert.equal(preview.ok,true,JSON.stringify(preview));
 const out=await f.request('background',{op:'model-budget-apply',previewId:preview.value.previewId,expected:preview.value.expected});assert.equal(out.ok,true,JSON.stringify(out));assert.deepEqual(out.value.settings.limits,limits);return out.value.settings;
}
async function finish(f){for(let i=0;i<500;i++){if(f.service.isIdle())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('synthetic job did not finish');}

test('packaged local suggestions have concrete review details and apply through the existing transaction',async t=>{
 const f=await productionFixture(t);await f.ready();await commit(f,{type:'CREATE_TOPIC',name:'Positive none'},'create_matching_topic');
 const model=await f.request('background',{op:'model-status'});assert.equal(model.ok,true);assert.equal(model.value.model.enabled,false);assert.equal(model.value.model.automaticEnabled,false);assert.deepEqual(model.value.model.page,{offset:0,total:0,count:0,limit:20,hasMore:false});
 assert.equal((await f.request('background',{op:'processing',mode:'local'})).ok,true);
 const before=await f.raw(),out=await f.request('evidence',{op:'suggest',expected:(await f.page()).value.versions});assert.equal(out.ok,true);assert.equal(out.value.state,'ready');
 const panel=await f.request('view',{op:'panel',kind:'suggestions',id:null,offset:0,limit:24});assert.equal(panel.ok,true);const row=Object.values(panel.value.display.proposals)[0];assert.match(row.proposal.details.join('\n'),/Positive none/);assert.equal(row.proposal.reviewUnavailable,null);
 assert.equal((await f.raw()).state.revision,before.state.revision);assert.equal(Object.keys((await f.raw()).state.placements).length,0);
 await commit(f,{type:'ACCEPT_PROPOSAL',proposalId:row.proposal.id,planHash:row.proposal.planHash},'accept_local');assert.equal(Object.values((await f.raw()).state.placements)[0].conversationId,REF);
});

test('successive production local batches reach later chats, preserve UNKNOWN and stop after a complete pass',async t=>{
 const f=await productionFixture(t);await f.ready();const refs=await addReferences(f,Array.from({length:22},(_,i)=>'研究任务'+i+'：验证参数与误差'));
 assert.equal((await f.request('background',{op:'processing',mode:'local'})).ok,true);
 const messages=[];for(let i=0;i<3;i++){const out=await f.request('evidence',{op:'suggest',expected:(await f.page()).value.versions});assert.equal(out.ok,true,JSON.stringify(out));messages.push(out.value.message);}
 const state=(await f.raw()).state,mentioned=new Set(Object.values(state.proposals).flatMap(r=>r.proposal.members??[r.proposal.refId]));assert(mentioned.has(refs.at(-1).id));assert(!mentioned.has(UNKNOWN));assert.match(messages.at(-1),/23\/23/);
 const count=Object.keys(state.proposals).length,next=await f.request('evidence',{op:'suggest',expected:(await f.page()).value.versions});assert.match(next.value.message,/全部核对/);assert.equal(Object.keys((await f.raw()).state.proposals).length,count);
});

test('expired entitlement preserves assets and cleanup but rejects new edits including commit-time expiry',async t=>{
 let entitlement='pro';const f=await productionFixture(t,{getEntitlement:()=>entitlement});await f.ready();await commit(f,{type:'CREATE_TOPIC',name:'Before expiry'},'entitled_create');const topicId=Object.keys((await f.raw()).state.topics)[0];await commit(f,{type:'SET_TOPIC_NAME',topicId,name:'Retained name'},'entitled_rename');
 const expected=(await f.page()).value.versions,gate=f.gateNextCommit(),pending=f.request('commit',{op:'dispatch',command:{type:'SET_TOPIC_NAME',topicId,name:'Must not persist'},expected,operationId:'late_expiry'});await gate.wait();entitlement='free';gate.release();assert.equal((await pending).ok,false);assert.equal((await f.raw()).state.topics[topicId].name,'Retained name');
 await commit(f,{type:'REMOVE_ALIAS',target:{kind:'topic-name',topicId},alias:'Before expiry'},'expired_alias_cleanup');assert.deepEqual((await f.raw()).state.topics[topicId].aliases,[]);
 assert.equal((await f.request('background',{op:'processing',mode:'local'})).ok,false);await f.mode('native');await f.mode('pro-default-none');assert.equal((await f.raw()).state.topics[topicId].name,'Retained name');
});

test('production cloud owner composes configured synthetic transport, budget and review with no automatic edit',async t=>{
 let calls=0;const provider={enabled:true,disclosure,configuration:configuration(),canUse:()=>true,authorizeDispatch:async()=>({ok:true,apiKey:'synthetic-not-a-key'}),transport:async(_url,options)=>{calls++;const payload=JSON.parse(JSON.parse(options.body).input[1].content);assert.equal(payload.items[0].approvedTitle,'Positive none');return answer(payload);}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();await commit(f,{type:'CREATE_TOPIC',name:'Positive none'},'cloud_topic');await allowSyntheticBudget(f);await enableCloud(f);
 const reply=await f.request('evidence',{op:'suggest',expected:(await f.page()).value.versions});assert.equal(reply.ok,true);assert.equal(reply.value.state,'registered');await finish(f);
 const status=(await f.request('background',{op:'model-status',offset:0,limit:20})).value.model;assert.equal(calls,1);assert.equal(status.jobs[0].state,'awaiting-review',JSON.stringify(status));assert(status.budget.settled>0);assert.equal(status.budget.uncertain,0);assert.equal(status.automaticEnabled,false);
 const raw=await f.raw();assert.equal(Object.keys(raw.state.placements).length,0);assert.equal(Object.keys(raw.state.proposals).length,1);assert(!JSON.stringify(raw).includes('synthetic-not-a-key'));
 await commit(f,{type:'SET_AI_PROCESSING',refId:REF,policy:'excluded'},'cloud_exclude');await commit(f,{type:'SET_AI_PROCESSING',refId:REF,policy:'allowed'},'cloud_restore_processing');
});

test('first cloud disclosure is a no-send, no-charge, single-use review; raw cloud messages cannot bypass it',async t=>{
 let credentials=0,calls=0;const provider={enabled:true,disclosure,configuration:configuration(),canUse:()=>true,authorizeDispatch:async()=>{credentials++;return {ok:true,apiKey:'synthetic-not-a-key'};},transport:async()=>{calls++;throw Error('preview-must-not-dispatch');}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();await commit(f,{type:'CREATE_TOPIC',name:'Positive none'},'consent_topic');await allowSyntheticBudget(f);
 const before=await f.raw();assert.equal((await f.request('background',{op:'processing',mode:'cloud'})).ok,false);
 const first=await f.request('background',{op:'model-preview',expected:(await f.page()).value.versions});assert.equal(first.ok,true,JSON.stringify(first));
 assert.equal(first.value.sample[0].title,'Positive none');assert.deepEqual(first.value.topicNames,['Positive none']);assert.equal(first.value.policyVersion,disclosure.policyVersion);assert.match(first.value.retentionText,/not zero retention/);
 assert(first.value.maximumMicros>0);assert(first.value.maximumMicros<=first.value.taskLimitMicros);assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'off');
 assert.equal(first.value.automaticAvailable,false);assert.equal((await f.request('background',{op:'model-enable',previewId:first.value.previewId,expected:first.value.expected,automatic:true})).ok,false);
 // Closing the dialog sends no enable request. The same source can be reviewed
 // again; only an explicit confirmation enables the selected current scope.
 const next=await f.request('background',{op:'model-preview',expected:first.value.expected});assert.equal(next.ok,true);
 const payload={op:'model-enable',previewId:next.value.previewId,expected:next.value.expected};assert.equal((await f.request('background',payload)).ok,true);
 assert.equal((await f.request('background',payload)).ok,false);assert.equal((await f.request('background',{op:'model-enable',previewId:first.value.previewId,expected:first.value.expected})).ok,false);
 const status=(await f.request('background',{op:'model-status'})).value.model;assert.equal(status.totalJobs,0);assert.equal(status.budget.reserved,0);assert.equal(status.budget.settled,0);assert.deepEqual(await f.raw(),before);assert.equal(credentials,0);assert.equal(calls,0);
 await f.mode('native');await f.mode('pro-default-none');assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'off');
});

test('production budget choices default to zero, require complete one-use review, and replay without another write',async t=>{
 let calls=0;const provider={enabled:true,disclosure,configuration:configuration(),canUse:()=>true,authorizeDispatch:async()=>{calls++;throw Error('budget-review-must-not-get-key');},transport:async()=>{calls++;throw Error('budget-review-must-not-send');}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();const original=(await f.request('background',{op:'model-budget'})).value.settings;
 assert.deepEqual(original.limits,{taskMicros:0,dayMicros:0,monthMicros:0});assert.equal(original.remaining.queueMicros,0);assert.equal(original.blocked,true);
 const raw=await f.raw(),limits={taskMicros:10000,dayMicros:50000,monthMicros:100000};
 for(const invalid of [{...limits,taskMicros:100001},{...limits,dayMicros:-1},{...limits,monthMicros:0.5},{...limits,dayMicros:'50000'},{...limits,providerProfileId:'forged'}])assert.equal((await f.request('background',{op:'model-budget-preview',limits:invalid,expected:(await f.page()).value.versions})).ok,false);
 const preview=(await f.request('background',{op:'model-budget-preview',limits,expected:(await f.page()).value.versions})).value;assert.deepEqual(preview.before,original.limits);assert.deepEqual(preview.after,limits);
 assert.deepEqual((await f.request('background',{op:'model-budget'})).value.settings,original); // Closing this review changes nothing.
 const apply={op:'model-budget-apply',previewId:preview.previewId,expected:preview.expected},saved=await f.request('background',apply);assert.equal(saved.ok,true,JSON.stringify(saved));assert.deepEqual(saved.value.settings.limits,limits);
 const repeated=await f.request('background',apply);assert.equal(repeated.ok,true,JSON.stringify(repeated));assert.equal(repeated.value.replayed,true);
 assert.equal((await f.request('background',{op:'model-budget'})).value.settings.revision,saved.value.settings.revision);assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'off');assert.deepEqual(await f.raw(),raw);assert.equal(calls,0);
});

test('a second budget review cannot overwrite a newer choice, and expired entitlement cannot save a reviewed increase',async t=>{
 let entitlement='pro';const provider={enabled:true,disclosure,configuration:configuration(),canUse:()=>true,authorizeDispatch:async()=>({ok:true,apiKey:'synthetic-not-a-key'}),transport:async()=>{assert.fail('settings have no transport');}},f=await productionFixture(t,{modelProvider:provider,getEntitlement:()=>entitlement});await f.ready();
 const limits={taskMicros:1000,dayMicros:2000,monthMicros:3000},first=(await f.request('background',{op:'model-budget-preview',limits,expected:(await f.page()).value.versions})).value;
 await allowSyntheticBudget(f);assert.equal((await f.request('background',{op:'model-budget-apply',previewId:first.previewId,expected:first.expected})).ok,false);
 const second=(await f.request('background',{op:'model-budget-preview',limits,expected:(await f.page()).value.versions})).value;entitlement='free';assert.equal((await f.request('background',{op:'model-budget-apply',previewId:second.previewId,expected:second.expected})).ok,false);
 assert.deepEqual((await f.request('background',{op:'model-budget'})).value.settings.limits,{taskMicros:100000,dayMicros:100000,monthMicros:100000});
});

test('zero daily allowance and an external policy change invalidate cloud confirmation before any task starts',async t=>{
 const provider={enabled:true,disclosure,configuration:configuration(),canUse:()=>true,authorizeDispatch:async()=>{assert.fail('no credential without current budget review');},transport:async()=>{assert.fail('no transport without current budget review');}},f=await productionFixture(t,{modelProvider:provider});await f.ready();
 await allowSyntheticBudget(f,{taskMicros:100000,dayMicros:0,monthMicros:100000});let preview=await f.request('background',{op:'model-preview',expected:(await f.page()).value.versions});assert.equal(preview.ok,true);assert.equal(preview.value.withinBudget,false);assert.equal((await f.request('background',{op:'model-enable',previewId:preview.value.previewId,expected:preview.value.expected})).ok,false);
 await allowSyntheticBudget(f);preview=await f.request('background',{op:'model-preview',expected:(await f.page()).value.versions});assert.equal(preview.value.withinBudget,true);
 const store=createSameDatabaseBillingStore({enabled:true,connection:()=>f.base.open(),clock:()=>new Date(NOW).toISOString(),verifyAuthority:()=>({kind:'verified-scope',key:f.scope.key,serverIdentity:'established',persistence:'same-idb'})}),before=await store.read({});assert.equal((await store.transact({},{operationId:'policy_change_after_disclosure',expectedRevision:before.revision,command:{type:'CONFIGURE_POLICIES',policies:[{...policy,ceiling:0}]}})).ok,true);
 assert.equal((await f.request('background',{op:'model-enable',previewId:preview.value.previewId,expected:preview.value.expected})).ok,false);assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'off');assert.equal((await f.request('background',{op:'model-status'})).value.model.totalJobs,0);
});

test('external budget tightening after dispatch preserves actual cost and blocks late suggestions and automatic assets',async t=>{
 let started,release,calls=0;const sent=new Promise(resolve=>started=resolve),held=new Promise(resolve=>release=resolve),quality=syntheticQualityFixture({profileId:'synthetic_owner'}),config=configuration();config.profile.qualityGateReference=quality.report.reportDigest;
 const provider={enabled:true,disclosure,configuration:config,canUse:()=>true,authorizeDispatch:async()=>({ok:true,apiKey:'synthetic-not-a-key'}),transport:async(_url,options)=>{calls++;const payload=JSON.parse(JSON.parse(options.body).input[1].content);started();await held;return answer(payload);},automation:{policy:async()=>({firstRun:false,autoRequested:true,quality}),isCurrent:()=>true}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();await commit(f,{type:'CREATE_TOPIC',name:'Positive none'},'late_budget_topic');await allowSyntheticBudget(f);await enableCloud(f,{automatic:true});
 assert.equal((await f.request('evidence',{op:'suggest',expected:(await f.page()).value.versions})).ok,true);await sent;
 const store=createSameDatabaseBillingStore({enabled:true,connection:()=>f.base.open(),clock:()=>new Date(NOW).toISOString(),verifyAuthority:()=>({kind:'verified-scope',key:f.scope.key,serverIdentity:'established',persistence:'same-idb'})}),before=await store.read({});
 const changed=await store.transact({},{operationId:'independent_payer_tightening',expectedRevision:before.revision,command:{type:'CONFIGURE_POLICIES',policies:[{...policy,ceiling:0}]}});assert.equal(changed.ok,true,changed.reason);release();await finish(f);
 const raw=await f.raw(),status=(await f.request('background',{op:'model-status'})).value.model;assert.equal(calls,1);assert.equal(Object.keys(raw.state.proposals).length,0);assert.equal(Object.keys(raw.state.placements).length,0);assert.notEqual(status.jobs[0].state,'committed');assert(status.budget.settled>0,'already dispatched actual usage stays charged');
});

for(const change of ['source','grant','provider','disclosure','configuration'])test('cloud confirmation fails closed after '+change+' changes',async t=>{
 let calls=0;const provider={enabled:true,disclosure:{...disclosure},configuration:configuration(),canUse:()=>true,authorizeDispatch:async()=>({ok:true,apiKey:'synthetic-not-a-key'}),transport:async()=>{calls++;throw Error('stale-review-must-not-dispatch');}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();await allowSyntheticBudget(f);const preview=await f.request('background',{op:'model-preview',expected:(await f.page()).value.versions});assert.equal(preview.ok,true,JSON.stringify(preview));
 if(change==='source')await addReferences(f,['后来出现的聊天：必须重新确认']);
 if(change==='grant')f.c.scopeGrantId='renewed_synthetic_scope';
 if(change==='provider')provider.enabled=false;
 if(change==='disclosure')provider.disclosure.policyVersion='changed-policy';
 if(change==='configuration')provider.configuration.maxChargePerTaskMicros=0;
 assert.equal((await f.request('background',{op:'model-enable',previewId:preview.value.previewId,expected:preview.value.expected})).ok,false);
 const status=await f.request('background',{op:'status'});assert.equal(status.ok,true);assert.equal(status.value.status.processingMode,'off');assert.equal(calls,0);
});

for(const condition of ['missing-disclosure','zero-task-cap'])test('cloud cannot enable with '+condition,async t=>{
 const config=configuration();if(condition==='zero-task-cap')config.maxChargePerTaskMicros=0;
 const provider={enabled:true,...(condition==='missing-disclosure'?{}:{disclosure}),configuration:config,canUse:()=>true,authorizeDispatch:async()=>{assert.fail('no credentials before valid consent');},transport:async()=>{assert.fail('no transport before valid consent');}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();const preview=await f.request('background',{op:'model-preview',expected:(await f.page()).value.versions});
 if(condition==='missing-disclosure'){assert.equal(preview.ok,false);assert.equal((await f.request('background',{op:'model-status'})).value.model.enabled,false);}
 else{assert.equal(preview.ok,true);assert.equal(preview.value.taskLimitMicros,0);assert.equal((await f.request('background',{op:'model-enable',previewId:preview.value.previewId,expected:preview.value.expected})).ok,false);}
 assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'off');
});

for(const {firstRun,automatic} of [{firstRun:false,automatic:true},{firstRun:true,automatic:false},{firstRun:false,automatic:false}])test('trusted automatic owner '+(firstRun?'keeps first run in review':automatic?'commits one explicitly enabled qualified change with complete undo':'keeps qualified results in review without the user automatic choice'),async t=>{
 // Fabricated quality arithmetic tests the approval boundary, not AI quality.
 const quality=syntheticQualityFixture({profileId:'synthetic_owner'}),config=configuration();config.profile.qualityGateReference=quality.report.reportDigest;
 const provider={enabled:true,disclosure,configuration:config,canUse:()=>true,authorizeDispatch:async()=>({ok:true,apiKey:'synthetic-not-a-key'}),transport:async(_url,options)=>answer(JSON.parse(JSON.parse(options.body).input[1].content)),automation:{policy:async()=>({firstRun,autoRequested:true,quality}),isCurrent:()=>true}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();await commit(f,{type:'CREATE_TOPIC',name:'Positive none'},'auto_matching_topic');await allowSyntheticBudget(f);const preview=await enableCloud(f,{automatic});assert.equal(preview.automaticAvailable,!firstRun);
 const reply=await f.request('evidence',{op:'suggest',expected:(await f.page()).value.versions});assert.equal(reply.ok,true);await finish(f);
 const status=(await f.request('background',{op:'model-status'})).value.model,raw=await f.raw(),applies=!firstRun&&automatic;assert.equal(status.automaticEnabled,applies,JSON.stringify(status));assert.equal(status.jobs[0].state,applies?'committed':'awaiting-review',JSON.stringify(status));
 const proposal=Object.values(raw.state.proposals)[0].proposal;assert.equal((await f.request('commit',{op:'dispatch',command:{type:'APPLY_LOW_RISK_PROPOSAL',proposalId:proposal.id,planHash:proposal.planHash},expected:(await f.page()).value.versions,operationId:'forged_automatic'})).ok,false);
 if(!applies){assert.equal(Object.keys(raw.state.placements).length,0);return;}
 const automaticRecord=raw.records.find(row=>row.transaction.actor==='automation')?.transaction;assert(automaticRecord);assert(automaticRecord.inverse.length>0);assert.equal(Object.values(raw.state.placements)[0].control.mode,'automatic');
 const review=await f.request('commit',{op:'preview',kind:'undo',input:{operationId:automaticRecord.operationId},expected:(await f.page()).value.versions});assert.equal(review.ok,true,JSON.stringify(review));await commit(f,{type:'UNDO_TRANSACTION',targetOperationId:automaticRecord.operationId,reviewedInverseHash:review.value.inverseHash},'undo_trusted_auto');
 const after=await f.raw();assert.equal(Object.keys(after.state.placements).length,0);assert(Object.values(after.state.constraints).some(c=>c.kind==='reject-proposal'));
});

test('explicit single-chat fine review uses only the selected metadata and never applies automatic assets or enables global cloud',async t=>{
 let calls=0;const quality=syntheticQualityFixture({profileId:'synthetic_owner'}),config=configuration();config.profile.qualityGateReference=quality.report.reportDigest;
 const provider={enabled:true,disclosure,configuration:config,canUse:()=>true,authorizeDispatch:async()=>({ok:true,apiKey:'synthetic-not-a-key'}),transport:async(_url,options)=>{calls++;const payload=JSON.parse(JSON.parse(options.body).input[1].content);assert.equal(payload.items.length,1);assert.equal(payload.items[0].approvedTitle,'Positive none');return answer(payload);},automation:{policy:async()=>({firstRun:false,autoRequested:true,quality}),isCurrent:()=>true}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();await commit(f,{type:'CREATE_TOPIC',name:'Positive none'},'fine_topic');await allowSyntheticBudget(f);
 assert.equal((await f.request('background',{op:'model-preview',refIds:[UNKNOWN],reviewOnly:true,expected:(await f.page()).value.versions})).ok,false);
 const preview=await f.request('background',{op:'model-preview',refIds:[REF],reviewOnly:true,expected:(await f.page()).value.versions});assert.equal(preview.ok,true,JSON.stringify(preview));assert.equal(preview.value.reviewOnly,true);assert.equal(preview.value.automaticAvailable,false);
 assert.equal((await f.request('background',{op:'model-enable',previewId:preview.value.previewId,expected:preview.value.expected,automatic:true})).ok,false);
 const start={op:'model-review-start',previewId:preview.value.previewId,expected:preview.value.expected};assert.equal((await f.request('background',start)).ok,true);assert.equal((await f.request('background',start)).ok,false);await finish(f);
 assert.equal(calls,1);assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'off');const raw=await f.raw();assert.equal(Object.keys(raw.state.placements).length,0);assert.equal(Object.keys(raw.state.proposals).length,1);assert.equal((await f.request('background',{op:'model-status'})).value.model.jobs[0].state,'awaiting-review');
});

for(const backgroundWhileNative of [false,true])test('new admitted references trigger finite automatic work; native-view continuation '+(backgroundWhileNative?'requires and honors explicit choice':'defaults to paused'),async t=>{
 let calls=0;const quality=syntheticQualityFixture({profileId:'synthetic_owner'}),config=configuration();config.profile.qualityGateReference=quality.report.reportDigest;
 const provider={enabled:true,disclosure,configuration:config,canUse:()=>true,authorizeDispatch:async()=>({ok:true,apiKey:'synthetic-not-a-key'}),transport:async(_url,options)=>{calls++;return answer(JSON.parse(JSON.parse(options.body).input[1].content));},automation:{policy:async()=>({firstRun:false,autoRequested:true,quality}),isCurrent:()=>true}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();await commit(f,{type:'CREATE_TOPIC',name:'Positive none'},'incremental_topic');await allowSyntheticBudget(f);await enableCloud(f,{automatic:true,backgroundWhileNative});
 await f.page();await finish(f);assert.equal(calls,0,'enabling never auto-organizes the existing collection');
 const [fresh]=await addReferences(f,['Positive none']);await f.mode('native');
 const nativePage=()=>f.request('view',{op:'page',mode:'native',selectedProjectIds:[],segment:0,offset:0,limit:8,rowLimit:5});assert.equal((await nativePage()).ok,true);await finish(f);
 if(!backgroundWhileNative){assert.equal(calls,0);assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'off');return;}
 assert.equal(calls,1);const raw=await f.raw();assert(Object.values(raw.state.placements).some(p=>p.conversationId===fresh.id));assert(!Object.values(raw.state.placements).some(p=>p.conversationId===REF));
 for(let i=0;i<3;i++){await nativePage();await finish(f);}assert.equal(calls,1,'refresh and the changed overlay cannot redispatch the same new reference');
 await f.mode('pro-default-none');assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'cloud');await f.request('background',{op:'processing',mode:'off'});assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'off');
});

test('restoring processing for a previously known excluded chat does not create a paid automatic rerun',async t=>{
 let calls=0;const quality=syntheticQualityFixture({profileId:'synthetic_owner'}),config=configuration();config.profile.qualityGateReference=quality.report.reportDigest;
 const provider={enabled:true,disclosure,configuration:config,canUse:()=>true,authorizeDispatch:async()=>({ok:true,apiKey:'synthetic-not-a-key'}),transport:async(_url,options)=>{calls++;return answer(JSON.parse(JSON.parse(options.body).input[1].content));},automation:{policy:async()=>({firstRun:false,autoRequested:true,quality}),isCurrent:()=>true}};
 const f=await productionFixture(t,{modelProvider:provider});await f.ready();await addReferences(f,['Positive none']);await commit(f,{type:'CREATE_TOPIC',name:'Positive none'},'restore_processing_topic');await commit(f,{type:'SET_AI_PROCESSING',refId:REF,policy:'excluded'},'before_enable_exclusion');await allowSyntheticBudget(f);await enableCloud(f,{automatic:true});
 await commit(f,{type:'SET_AI_PROCESSING',refId:REF,policy:'allowed'},'explicit_restore_processing');await f.page();await finish(f);assert.equal(calls,0);assert.equal((await f.request('background',{op:'model-status'})).value.model.totalJobs,0);assert.equal(Object.keys((await f.raw()).state.placements).length,0);
});

test('Browser-Local memory mode supports local temporary suggestions without opening persistent storage',async t=>{
 const f=await productionFixture(t),scope=normalizedScope({kind:'browser-local',storage:'session',spaceId:'synthetic_memory'}),source=f.viewOwner.current(),snapshot=freeNavigationSnapshot({...source.snapshot,scope:scope.key,refs:source.snapshot.refs.map(r=>({...r,scope:scope.key,nativeTitle:r.id===REF?'临时研究：验证参数':r.nativeTitle}))}),c={...f.c,scope,scopeGrantId:'memory_grant'};let opens=0;
 const service=createProductionProService({ui:{withScope:async(_r,work)=>work(c)},repository:{open(){opens++;throw Error('memory-must-not-open-idb');}},workspaceRepository:f.workspaces,readService:{},views:{resolveProView:()=>({current:{...source,snapshot},isCurrent:()=>true})},now:()=>NOW});t.after(()=>service.stop());
 const request=(action,payload)=>service.handle({v:1,type:'HOST_UI_PRO',grantId:'memory',mountId:'memory',action,payload},{id:'synthetic_extension',documentId:'memory_ui',frameId:2,tab:{id:1},url:'chrome-extension://synthetic_extension/workspace.html'});
 assert.equal((await request('background',{op:'mode',mode:'pro-default-none',selectedProjectIds:[]})).ok,true);assert.equal((await request('background',{op:'processing',mode:'local'})).ok,true);
 const page=await request('view',{op:'page',mode:'pro-default-none',selectedProjectIds:[],segment:0,offset:0,limit:8,rowLimit:5});assert.equal(page.ok,true,JSON.stringify(page));const out=await request('evidence',{op:'suggest',expected:page.value.versions});assert.equal(out.ok,true,JSON.stringify(out));assert.match(out.value.message,/临时本地预览/);
 const panel=await request('view',{op:'panel',kind:'suggestions',id:null,offset:0,limit:24});assert.equal(panel.ok,true);assert(Object.keys(panel.value.display.proposals).length>0);assert.equal(opens,0);assert.equal((await request('background',{op:'processing',mode:'cloud'})).ok,false);
 assert.equal((await request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'No memory persistence'},expected:page.value.versions,operationId:'memory_write'})).ok,false);assert.equal(opens,0);
});
