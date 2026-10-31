import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../src/data/hash.mjs';
import {emptyOverlay,placementId,registerProposal,sealProposal,validateOverlay,reduceProCommand,buildMergePlan} from '../../src/pro/domain/index.mjs';
import {projectPublicPage,projectPublicPanel,projectPublicSearch,projectPublicPreview,publicVersions,PRO_FRAME_BYTES} from '../../src/pro/integration/public-frame-dto.mjs';
import {createRemoteProController} from '../../src/pro/ui/remote-controller.mjs';
import {productionFixture,NOW,REF} from './support/production-owner-fixture.mjs';

function data(total=150){
  const state=emptyOverlay('closeout_public_data'),control={mode:'human',locked:true,revision:0,lastHumanOperation:'synthetic_initial'};
  for(let n=0;n<total;n++){const id='t_'+n;state.topics[id]={id,scopeKey:state.scopeKey,name:'中'.repeat(190)+n,aliases:[],icon:'◇',intent:null,nameControl:control,membershipControl:control,lifecycle:'active',createdBy:'human',revision:0};
    const primary=n===total-1;state.placements[placementId(id,'c_one')]={conversationId:'c_one',topicId:id,role:primary?'primary':'related',activityContribution:primary?'primary-only':'none',state:'included',control,constraintRefs:[],evidenceIds:[],revision:0};}
  validateOverlay(state);
  const references=[{id:'c_one',nativeTitle:'合成共享会话',nativeUrl:null,available:true,membership:{state:'NONE',evidenceId:'synthetic_positive_none',revision:1},freshness:'current',nativeRevision:1,sourceIds:['synthetic_source']}];
  const versions={scopeKey:state.scopeKey,authorizationEpoch:1,sourceGeneration:{synthetic_source:1},nativeFields:{c_one:1},overlayRevision:state.revision,targets:{},constraintRevision:0,policyVersion:'synthetic_policy',evidenceDigest:digest(references)};
  return {state,snapshot:{authorized:true,references,versions,capabilities:{positiveNone:'available'}},status:{authorized:true,entitlement:'pro',mode:'pro-default-none',persistence:'same-idb'},view:{mode:'pro-default-none',native:null}};
}

test('a reference with150 long-named relations stays searchable and every relation is editable through bounded pages',()=>{
  const input=data(),search=projectPublicSearch({...input,query:'合成'});assert.equal(search.items.length,1);assert.equal(search.items[0].contexts.length,4);
  assert(search.items[0].contexts.every(c=>c.name.startsWith('中')));assert.deepEqual(search.versions,publicVersions(input.snapshot.versions));assert(new TextEncoder().encode(JSON.stringify(search)).length<PRO_FRAME_BYTES);
  const seen=new Set();let offset=0;
  do{const panel=projectPublicPanel({...input,kind:'reference',id:'c_one',offset,limit:24});assert(Object.values(panel.display.placements).some(p=>p.topicId==='t_149'&&p.role==='primary'));
    for(const p of Object.values(panel.display.placements))seen.add(p.topicId);assert(Object.keys(panel.display.topics).length<=25);assert(new TextEncoder().encode(JSON.stringify(panel)).length<PRO_FRAME_BYTES);
    if(!panel.page.hasMore)break;assert(panel.page.count>0);offset+=panel.page.count;
  }while(offset<200);
  assert.equal(seen.size,150);
});

test('valid retained64-member proposal does not break review of other suggestions or become a blind approval',()=>{
  const input=data(1),members=Array.from({length:64},(_,i)=>'synthetic_member_'+i);
  input.snapshot.references.push(...members.map(id=>({id,nativeTitle:'合成成员 '+id,nativeUrl:null,available:true,membership:{state:'NONE',evidenceId:'e_'+id,revision:1},freshness:'current',nativeRevision:1,sourceIds:['synthetic_source']})));
  const large=sealProposal({id:'large',fingerprint:digest('large'),versions:input.snapshot.versions,evidenceIds:[],model:null,summary:'保留的大批主题建议',rationale:[],qualityBand:'review',kind:'new-topic',draftKey:'synthetic_draft',name:'合成研究',intent:{object:'合成研究',objective:'验证资料',expectedOutcome:null,evidenceIds:[]},members});
  const small=sealProposal({id:'small',fingerprint:digest('small'),versions:input.snapshot.versions,evidenceIds:[],model:null,summary:'可以逐项核对的名称',rationale:[],qualityBand:'review',kind:'derived-title',refId:'c_one',title:'共享会话整理名称'});
  input.state=registerProposal(registerProposal(input.state,large),small);const panel=projectPublicPanel({...input,kind:'suggestions'});
  assert.equal(panel.page.total,2);assert.equal(panel.display.proposals.large.proposal.reviewUnavailable,'needs-smaller-batch');assert.deepEqual(panel.display.proposals.large.proposal.details,[]);
  assert.equal(panel.display.proposals.small.proposal.reviewUnavailable,null);assert.deepEqual(panel.display.proposals.small.proposal.details,['原名：合成共享会话','整理名称：共享会话整理名称']);
});

test('merge conflict review names the exact original exclusion, chat and proposed destination',()=>{
  const input=data(2);input.state.topics.t_0.name='原排除主题';input.state.topics.t_1.name='合并目标主题';
  const context=operationId=>({actor:'human',operationId,snapshot:input.snapshot,expected:input.snapshot.versions});
  input.state=reduceProCommand(input.state,{type:'EXCLUDE_TOPIC',refId:'c_one',topicId:'t_0'},context('exclude'));
  input.snapshot.versions.overlayRevision=input.state.revision;
  const preview=buildMergePlan(input.state,{keepId:'t_1',sourceIds:['t_0']},context('merge_review'));
  const dto=projectPublicPreview({...input,preview,previewId:'synthetic_merge_review'}),conflict=dto.conflicts.find(c=>c.kind==='include-exclude');
  assert.equal(dto.proposal,false);assert(conflict.description.includes('原排除主题'));assert(conflict.description.includes('合并目标主题'));assert(conflict.description.includes('合成共享会话'));
});

test('remote search and alias replies must identify the original reviewed source and requested target',async t=>{
  const input=data(1);let fault=null;
  const remote=createRemoteProController({request:async(_action,payload)=>{
    if(payload.op==='page')return {ok:true,value:projectPublicPage(input)};
    if(payload.op==='search'){const source=structuredClone(input);if(fault==='new-source')source.snapshot.versions.authorizationEpoch++;return {ok:true,value:projectPublicSearch({...source,query:payload.query})};}
    if(payload.op==='aliases'){const versions=publicVersions(input.snapshot.versions);if(fault==='new-source')versions.overlayRevision++;
      return {ok:true,value:{kind:'pro-alias-page',protocol:'vaiwl-pro-public/1',versions,targetKind:'topic',targetId:fault==='wrong-target'?'other_topic':payload.targetId,aliases:['合成旧名称'],page:{offset:0,total:1,count:1,limit:24,hasMore:false}}};}
    throw Error('unexpected-synthetic-request');
  }});t.after(()=>remote.destroy());await remote.refresh();
  assert.equal((await remote.searchPage('合成')).items.length,1);assert.equal((await remote.getAliases('topic','t_0')).aliases.length,1);
  fault='new-source';await assert.rejects(remote.searchPage('合成'),/invalid-pro-search-response/);await assert.rejects(remote.getAliases('topic','t_0'),/invalid-pro-alias-response/);
  fault='wrong-target';await assert.rejects(remote.getAliases('topic','t_0'),/invalid-pro-alias-response/);assert.equal(remote.getSnapshot().versions.authorizationEpoch,1);
});

test('A20 safe explicit-collect fallback never infers membership from unsupported create intent, another document, or newly observed chat',async t=>{
  const plan={mode:'href',target:{kind:'resolved',entity:'conversation',nativeId:REF,navigationURL:'https://chatgpt.com/c/'+REF,liveHandle:null},disposition:'new-tab-preserve-current',planRevision:1};
  const f=await productionFixture(t,{prepareNavigation:async()=>[{refId:REF,plan,targetKey:'synthetic_target'}]});const expected=await f.ready();
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'明确收录的主题'},expected,operationId:'create_topic'})).ok,true);
  const before=await f.raw(),topicId=Object.keys(before.state.topics)[0];
  // Free has not supplied exact action-to-new-conversation correlation. An
  // invented start/cancel RPC must not arm a Pro pending membership action.
  assert.equal((await f.request('navigation',{op:'new-chat',topicId})).ok,false);assert.equal((await f.request('navigation',{op:'cancel-new-chat',topicId})).ok,false);
  f.c.parentFrame={...f.c.parentFrame,documentId:'synthetic_second_document'};f.c.binding='synthetic_second_binding';await f.ready();
  assert.equal((await f.request('navigation',{op:'open',refId:REF,options:{origin:'direct'}})).value.state,'native-link');
  const newRef='33333333-3333-4333-8333-333333333333',native=await f.native.snapshot(f.scope);
  const observed=await f.native.apply(f.scope,{operationId:'observe_independent_chat',expectedRevision:native.revision,batch:{scopeKey:f.scope.key,sourceRevision:2,observedAt:new Date(NOW).toISOString(),validUntil:new Date(NOW+60000).toISOString(),projects:[],refs:[{id:newRef,nativeTitle:'独立核对的新聊天',nativeUrl:'https://chatgpt.com/c/'+newRef,availability:'available'}],membership:[{id:newRef,state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}});assert.equal(observed.ok,true,observed.reason);await f.viewOwner.refresh();
  await f.page();const after=await f.raw();assert.deepEqual(after.state,before.state);assert.deepEqual(after.records,before.records);
  const review=(await f.page()).value.versions;assert.equal((await f.request('commit',{op:'dispatch',command:{type:'SET_PLACEMENT',refId:newRef,topicId,role:'primary'},expected:review,operationId:'explicit_collect'})).ok,true);
  const placements=Object.values((await f.raw()).state.placements);assert.equal(placements.length,1);assert.equal(placements[0].conversationId,newRef);
});
