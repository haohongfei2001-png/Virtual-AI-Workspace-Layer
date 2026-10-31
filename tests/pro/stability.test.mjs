import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner,FIXTURE_NOW} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {digest} from '../../src/data/hash.mjs';
import {createFreeViewSession,freeSegmentFor} from '../../src/data/free-time-policy.mjs';
import {projectProFrame,projectTopicGroups} from '../../src/pro/projection/project.mjs';
import {buildProviderPayload,validateModelOutput,createFixtureModelAdapter,planSuggestions,incrementalCacheKey} from '../../src/pro/organize/index.mjs';

test('A30 combined H/timezone/model-version/repeated-open sequence keeps stable primary, title and hard exclusion',async()=>{
 const owner=await createFixtureOwner({indexedDB:new MockIDBFactory(),fixtureOnly:true}),controller=await createProController(owner);
 try{
  await controller.dispatch({type:'CREATE_TOPIC',name:'Riftlet 首击可靠性'});const topic=Object.values(controller.getState().topics)[0].id;
  await controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId:topic,role:'primary'});
  const first=await controller.suggest({refIds:['c_beta']}),p=first.proposals.find(p=>p.kind==='existing-topic'&&p.refId==='c_beta');assert(p);await controller.applyProposal(p.id,p.planHash);
  await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'已确认的全局名称'});
  await controller.dispatch({type:'EXCLUDE_TOPIC',refId:'c_gamma',topicId:topic});
  await controller.applyStructure(controller.previewSeries({topicId:topic,title:'稳定整数版本序列',entries:['c_alpha','c_beta'],edges:[{kind:'continuation',from:'c_alpha',to:'c_beta'}],labels:[{refId:'c_alpha',sequence:[2,9],source:'human-confirmed'},{refId:'c_beta',sequence:[2,10],source:'human-confirmed'}]}));
  const saved=controller.getState(),before=digest(saved),snapshot=controller.getSnapshot(),native=controller.getView().native;
  assert.equal(snapshot.viewSession.T,createFreeViewSession({now:FIXTURE_NOW,timeZone:'Asia/Shanghai'}).T);
  const groups=[];
  for(const H of [7,14,30,60,90])for(const Z of ['Asia/Shanghai','America/Los_Angeles','UTC']){
   const session=createFreeViewSession({H,now:FIXTURE_NOW,timeZone:Z,policyRevision:1});
   const activityDecisions=Object.fromEntries(Object.entries(snapshot.activityDecisions).map(([id,d])=>[id,{...d,segment:freeSegmentFor(d.candidateTime,session)}]));
   const input={...snapshot,activityDecisions,viewSession:session};
   const projection=projectProFrame({state:saved,snapshot:input,native,session});assert.equal(projection.native,native);groups.push(projectTopicGroups(saved,input).groups.find(g=>g.topicId===topic).segment);
   assert.equal(digest(saved),before);
  }
  assert.equal(groups.length,15);
  const prepared=await owner.ports.evidence.prepare(owner.grant(),{refs:['c_beta','c_gamma'],requestedInputLevel:'metadata-only',processingConsentReference:owner.consentReference(),maxUtf8Bytes:32768});assert(prepared.ok);
  const pack=prepared.value,cacheKeys=[];
  for(const modelVersion of ['offline_protocol_v1','offline_protocol_v2']){
   const modelProfile={profileId:'synthetic_protocol',modelVersion,promptVersion:'prompt1',outputSchemaVersion:'vaiwl-pro-model-output/1'},built=buildProviderPayload(pack,saved);
   const reply=await createFixtureModelAdapter().execute(null,built.payload),validated=validateModelOutput(reply,{...built,pack,overlay:saved,currentVersions:pack.versions});
   const planned=planSuggestions({validated,pack,overlay:saved,modelProfile,firstRun:false,autoRequested:true});
   assert(planned.proposals.every(x=>x.qualityBand==='review'));assert(!planned.proposals.some(x=>x.refId==='c_beta'&&x.kind==='existing-topic'));assert(!planned.proposals.some(x=>x.refId==='c_gamma'&&x.topicId===topic));
   cacheKeys.push(incrementalCacheKey({pack,modelProfile,policyVersion:'stable_test',targetVersions:pack.versions.targets}));assert.equal(digest(controller.getState()),before);
  }
  assert.notEqual(cacheKeys[0],cacheKeys[1]);
  for(let i=0;i<3;i++){await controller.open('c_beta',{topicId:topic,origin:'topic'});await controller.returnToWorkspace();await controller.setMode('native');await controller.setMode('pro-default-none');}
  assert.equal(digest(controller.getState()),before);assert.equal((await owner.raw()).state.titles.c_beta.title,'已确认的全局名称');
 }finally{controller.destroy();}
});

test('G02 one conversation with two related-only topics remains uncollected and advances neither topic',async()=>{
 const owner=await createFixtureOwner({indexedDB:new MockIDBFactory(),fixtureOnly:true}),controller=await createProController(owner);
 try{
  for(const name of ['related A','related B'])await controller.dispatch({type:'CREATE_TOPIC',name});
  for(const id of Object.keys(controller.getState().topics))await controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId:id,role:'related'});
  await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_alpha',title:'两个上下文共用名称'});
  const projected=projectTopicGroups(controller.getState(),controller.getSnapshot());
  assert.equal(projected.primary.has('c_alpha'),false);assert.equal(projected.groups.length,2);
  assert(projected.groups.every(g=>g.segment===null&&g.activityDecision.candidateTime===null));
  assert(projected.groups.every(g=>g.rows.find(r=>r.refId==='c_alpha').displayTitle==='两个上下文共用名称'));
  assert.equal(projected.uncollected.find(r=>r.refId==='c_alpha').displayTitle,'Riftlet 首击可靠性排查');
 }finally{controller.destroy();}
});

test('G03 an actual pending suggestion cannot commit after its NONE reference moves into a Project',async()=>{
 const owner=await createFixtureOwner({indexedDB:new MockIDBFactory(),fixtureOnly:true}),controller=await createProController(owner);
 try{
  await controller.dispatch({type:'CREATE_TOPIC',name:'Riftlet 首击可靠性'});const topic=Object.keys(controller.getState().topics)[0];
  await controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId:topic,role:'primary'});
  const suggestions=await controller.suggest({refIds:['c_beta']}),p=suggestions.proposals.find(p=>p.refId==='c_beta'&&p.kind==='existing-topic');assert(p);
  const before=await owner.raw();await owner.updateNative('c_beta',{membership:'PROJECT',projectId:'p_alpha'});await controller.refresh();
  await assert.rejects(controller.applyProposal(p.id,p.planHash),/stale/);assert.deepEqual(await owner.raw(),before);
  await controller.setMode('native');assert(JSON.stringify(controller.getView().native).includes('c_beta'));assert.equal(controller.getSnapshot().references.find(r=>r.id==='c_beta').membership.state,'PROJECT');
 }finally{controller.destroy();}
});
