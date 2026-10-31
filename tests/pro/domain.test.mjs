import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,stable} from '../../src/data/hash.mjs';
import {emptyOverlay,validateOverlay,reduceProCommand,planTransaction,registerProposal,sealProposal,semanticActionDigest,placementId,previewUndo,applyUndo,previewDelete,previewRemoveAIArtifacts,buildCompensationPlan,legacyResolutionPlan,replayPatch,topicIdForOperation} from '../../src/pro/domain/index.mjs';

const reference=(id,state='NONE')=>({id,nativeTitle:id==='c1'?'数值积分初稿':id,nativeUrl:null,membership:state==='UNKNOWN'?{state,reason:'unconfirmed',revision:1}:state==='PROJECT'?{state,projectId:'p1',evidenceId:'e_'+id,revision:1}:{state,evidenceId:'e_'+id,revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['src1']});
const references=[reference('c1'),reference('c2'),reference('c3'),reference('unknown','UNKNOWN'),reference('project','PROJECT')];
function versions(s){return {scopeKey:s.scopeKey,authorizationEpoch:1,sourceGeneration:{src1:1},nativeFields:Object.fromEntries(references.map(r=>[r.id,r.nativeRevision])),overlayRevision:s.revision,targets:{},constraintRevision:s.revision,policyVersion:'pro-policy-1',evidenceDigest:digest('evidence')};}
function ctx(s,operationId='op1',extra={}){const expected=versions(s);return {actor:'human',operationId,snapshot:{references,versions:expected},expected,...extra};}
function run(s,c,extra={}){return reduceProCommand(s,c,ctx(s,'op'+(s.revision+1),extra));}
function topic(s,name,id){return run(s,{type:'CREATE_TOPIC',name},{allocations:{topicId:id}});}
function setup(){let s=topic(emptyOverlay('scope1'),'研究','t1');return topic(s,'求职','t2');}
function proposal(s,fields={kind:'existing-topic',refId:'c1',topicId:'t1',role:'primary'},extra={}){return sealProposal({id:'pr1',fingerprint:digest(fields),versions:versions(s),evidenceIds:['e_c1'],model:null,summary:'标题建议',rationale:['获准标题'],qualityBand:'review',...fields,...extra});}
function operation(s,c,extra={}){const context=ctx(s,'op'+(s.revision+1),extra),plan=planTransaction(s,c,context);return {...plan,operationId:context.operationId,actor:context.actor,base:context.expected,resultRevision:plan.state.revision,proposalId:c.proposalId??null,status:'applied'};}

test('A01: human cannot convert UNKNOWN or an unselected PROJECT into NONE',()=>{
  const s=setup(),before=stable(s);
  for(const refId of ['unknown','project'])assert.throws(()=>run(s,{type:'SET_PLACEMENT',refId,topicId:'t1',role:'primary'}),/membership|scope/);
  assert.equal(stable(s),before);
  const cross=run(s,{type:'SET_PLACEMENT',refId:'project',topicId:'t1',role:'primary'},{mode:'pro-cross-project',selectedProjectIds:['p1']});
  assert.equal(cross.placements[placementId('t1','project')].role,'primary');
  assert.equal(references.find(r=>r.id==='project').membership.state,'PROJECT');
});
test('A10: one primary, many related, one global title; no domain-created activity',()=>{
  let s=run(setup(),{type:'SET_PLACEMENT',refId:'c1',topicId:'t1',role:'primary'});
  assert.throws(()=>run(s,{type:'SET_PLACEMENT',refId:'c1',topicId:'t2',role:'primary'}),/primary-already/);
  s=run(s,{type:'SET_PLACEMENT',refId:'c1',topicId:'t2',role:'related'});
  s=run(s,{type:'SET_DERIVED_TITLE',refId:'c1',title:'积分误差核对'});
  assert.equal(Object.keys(s.titles).length,1);assert.equal(s.placements[placementId('t2','c1')].activityContribution,'none');
  assert.equal(Object.values(s.placements).filter(p=>p.role==='primary').length,1);assert.ok(!('activity' in s));
});
test('A07: unlocking manual title is not release to automation',()=>{
  let s=run(setup(),{type:'SET_DERIVED_TITLE',refId:'c1',title:'我的标题'});
  s=run(s,{type:'SET_LOCK',target:{kind:'title',refId:'c1'},locked:false});
  assert.deepEqual([s.titles.c1.control.mode,s.titles.c1.control.locked],['human',false]);
  let p=proposal(s,{kind:'derived-title',refId:'c1',title:'建议标题'});s=registerProposal(s,p);
  assert.throws(()=>run(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash}),/human-title-protected/);
  s=run(s,{type:'RELEASE_TO_AUTO',target:{kind:'title',refId:'c1'}});p=proposal(s,{kind:'derived-title',refId:'c1',title:'建议标题'},{id:'pr2'});s=registerProposal(s,p);
  s=run(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash});assert.equal(s.titles.c1.title,'建议标题');
});
test('locking an automatic title takes human control; unlock cannot give it back',()=>{
  let s=setup(),p=proposal(s,{kind:'derived-title',refId:'c1',title:'建议标题'});s=registerProposal(s,p);s=run(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash});
  assert.equal(s.titles.c1.control.mode,'automatic');s=run(s,{type:'SET_LOCK',target:{kind:'title',refId:'c1'},locked:true});s=run(s,{type:'SET_LOCK',target:{kind:'title',refId:'c1'},locked:false});assert.equal(s.titles.c1.control.mode,'human');
});
test('locking an untouched native name protects a following-native preference without copying text',()=>{let s=run(setup(),{type:'SET_LOCK',target:{kind:'title',refId:'c1'},locked:true});assert.equal(s.titles.c1.title,null);assert.equal(s.titles.c1.displayPreference,'native');assert.equal(s.titles.c1.control.mode,'human');s=run(s,{type:'RELEASE_TO_AUTO',target:{kind:'title',refId:'c1'}});const p=proposal(s,{kind:'derived-title',refId:'c1',title:'首次整理名称'});s=registerProposal(s,p);s=run(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash});assert.equal(s.titles.c1.title,'首次整理名称');});
test('A06: stale proposal cannot overwrite later manual title',()=>{
  let s=setup(),p=proposal(s,{kind:'derived-title',refId:'c1',title:'旧建议'});s=registerProposal(s,p);s=run(s,{type:'SET_DERIVED_TITLE',refId:'c1',title:'新的人工标题'});const before=stable(s);
  assert.throws(()=>run(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash}),/stale-proposal/);assert.equal(stable(s),before);
});
test('A08: correction preserves precise hard exclusion across new model and evidence',()=>{
  let s=run(setup(),{type:'SET_PLACEMENT',refId:'c1',topicId:'t1',role:'primary'});s=run(s,{type:'MOVE_PRIMARY',refId:'c1',from:'t1',to:'t2'});
  assert.ok(Object.values(s.constraints).some(c=>c.kind==='exclude-topic'&&c.refId==='c1'&&c.topicId==='t1'));
  assert.equal(s.placements[placementId('t1','c1')],undefined);
  const p=proposal(s,{kind:'existing-topic',refId:'c1',topicId:'t1',role:'related'},{model:{profileId:'fixture',modelVersion:'new',promptVersion:'2',outputSchemaVersion:'vaiwl-pro-model-output/1'}});s=registerProposal(s,p);
  assert.throws(()=>run(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash}),/hard-topic-exclusion/);
  assert.throws(()=>run(s,{type:'SET_PLACEMENT',refId:'c1',topicId:'t1',role:'related'}),/hard-topic-exclusion/);
  s=run(s,{type:'REMOVE_TOPIC_EXCLUSION',refId:'c1',topicId:'t1'});s=run(s,{type:'SET_PLACEMENT',refId:'c1',topicId:'t1',role:'related'});assert.equal(s.placements[placementId('t1','c1')].role,'related');
});
test('removing related writes a negative constraint without touching the primary',()=>{
  let s=run(setup(),{type:'SET_PLACEMENT',refId:'c1',topicId:'t1',role:'primary'});s=run(s,{type:'SET_PLACEMENT',refId:'c1',topicId:'t2',role:'related'});s=run(s,{type:'REMOVE_RELATED',refId:'c1',topicId:'t2'});assert.ok(s.placements[placementId('t1','c1')]);assert.ok(Object.values(s.constraints).some(c=>c.kind==='exclude-topic'&&c.topicId==='t2'));assert.throws(()=>run(s,{type:'REMOVE_RELATED',refId:'c1',topicId:'t1'}),/not-related/);
});
test('A09: processing exclusion blocks model acceptance but preserves accepted assets',()=>{
  let s=run(setup(),{type:'SET_DERIVED_TITLE',refId:'c1',title:'保留资产'});s=run(s,{type:'SET_AI_PROCESSING',refId:'c1',policy:'excluded'});
  const p=proposal(s);s=registerProposal(s,p);assert.throws(()=>run(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash}),/ai-processing-excluded/);assert.equal(s.titles.c1.title,'保留资产');
  assert.throws(()=>run(s,{type:'SET_AI_PROCESSING',refId:'c1',policy:'allowed'}),/current-processing-consent/);
  s=run(s,{type:'SET_AI_PROCESSING',refId:'c1',policy:'allowed'},{processingConsentCurrent:true});assert.ok(!Object.values(s.constraints).some(c=>c.kind==='exclude-ai-processing'));
});
test('ordinary inverse cannot relax processing consent',()=>{const s=setup(),op=operation(s,{type:'SET_AI_PROCESSING',refId:'c1',policy:'excluded'});const p=previewUndo(op.state,op);assert.equal(p.state,'conflict');assert.ok(p.conflicts.some(c=>c.reason==='processing-consent-not-undoable'));assert.throws(()=>applyUndo(op.state,op,ctx(op.state)),/undo-conflict/);});
test('A12: FIRST RUN and NEW_TOPIC gates independent from existing-topic gate',()=>{
  let s=setup();const p=proposal(s,{kind:'new-topic',draftKey:'d1',name:'积分工作',intent:{object:'积分',objective:'核对',expectedOutcome:null,evidenceIds:['e_c1']},members:['c1']},{qualityBand:'eligible-auto'});s=registerProposal(s,p);
  const command={type:'APPLY_LOW_RISK_PROPOSAL',proposalId:p.id,planHash:p.planHash};assert.throws(()=>run(s,command,{actor:'automation',qualityGate:{newTopic:true}}),/first-run-preview/);assert.throws(()=>run(s,command,{actor:'automation',firstRun:false,qualityGate:{existingTopic:true}}),/quality-gate/);
  s=run(s,command,{actor:'automation',firstRun:false,qualityGate:{newTopic:true}});assert.equal(Object.values(s.topics).filter(t=>t.createdBy==='automation').length,1);
});
test('automation cannot issue human commands or bypass strict schema',()=>{const s=setup();assert.throws(()=>run(s,{type:'CREATE_TOPIC',name:'injected'},{actor:'automation'}),/automation-command/);assert.throws(()=>run(s,{type:'CREATE_TOPIC',name:'ok',scope:'other'}),/invalid-schema/);});
test('alias capacity has an explicit reversible management path without dropping the current name or human control',()=>{
  for(const kind of ['topic-name','title']){
    let state=setup();if(kind==='title')state=run(state,{type:'SET_DERIVED_TITLE',refId:'c1',title:'初名'});
    for(let i=0;i<100;i++)state=run(state,kind==='title'?{type:'SET_DERIVED_TITLE',refId:'c1',title:'名称 '+i}:{type:'SET_TOPIC_NAME',topicId:'t1',name:'名称 '+i});
    const command=kind==='title'?{type:'SET_DERIVED_TITLE',refId:'c1',title:'新的名称'}:{type:'SET_TOPIC_NAME',topicId:'t1',name:'新的名称'};
    assert.throws(()=>run(state,command),/alias-capacity/);const row=kind==='title'?state.titles.c1:state.topics.t1,alias=row.aliases[0],target=kind==='title'?{kind,refId:'c1'}:{kind,topicId:'t1'};
    const removal=operation(state,{type:'REMOVE_ALIAS',target,alias});const afterRow=kind==='title'?removal.state.titles.c1:removal.state.topics.t1;
    assert.equal(afterRow.aliases.length,99);assert.equal(afterRow.title??afterRow.name,row.title??row.name);assert.deepEqual(afterRow.control??afterRow.nameControl,row.control??row.nameControl);
    assert.deepEqual(applyUndo(removal.state,removal,ctx(removal.state)).titles,state.titles);const restored=applyUndo(removal.state,removal,ctx(removal.state));assert.deepEqual(restored.topics,state.topics);
    const renamed=run(removal.state,command);assert.equal((kind==='title'?renamed.titles.c1.title:renamed.topics.t1.name),'新的名称');
    assert.throws(()=>run(state,{type:'REMOVE_ALIAS',target,alias:'不存在'}),/alias-not-found/);assert.throws(()=>run(state,{type:'REMOVE_ALIAS',target,alias},{actor:'automation'}),/automation-command/);
  }
});
test('A13: delete keeps native refs and suppresses previously created AI topic',()=>{
  let s=setup(),p=proposal(s,{kind:'new-topic',draftKey:'d1',name:'积分工作',intent:{object:'积分',objective:'核对',expectedOutcome:null,evidenceIds:['e_c1']},members:['c1']});s=registerProposal(s,p);const opId='accept-ai';s=reduceProCommand(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash},ctx(s,opId));const tid=topicIdForOperation(opId),preview=previewDelete(s,tid,ctx(s));s=run(s,{type:'DELETE_TOPIC',topicId:tid,reviewedPlanHash:preview.planHash});
  assert.equal(s.topics[tid].lifecycle,'trashed');assert.ok(!Object.values(s.placements).some(x=>x.topicId===tid));assert.equal(references[0].id,'c1');
  const p2=proposal(s,{kind:'new-topic',draftKey:'d2',name:'积分工作再命名',intent:p.intent,members:['c1']},{id:'pr2'});s=registerProposal(s,p2);assert.throws(()=>run(s,{type:'ACCEPT_PROPOSAL',proposalId:p2.id,planHash:p2.planHash}),/deleted-topic-suppressed/);
});
test('A18: correction inverse is whole-operation atomic; unrelated new assets survive',()=>{
  let s=run(setup(),{type:'SET_PLACEMENT',refId:'c1',topicId:'t1',role:'primary'});const move=operation(s,{type:'MOVE_PRIMARY',refId:'c1',from:'t1',to:'t2'});s=topic(move.state,'新资产','t3');
  s=applyUndo(s,move,ctx(s));assert.equal(s.placements[placementId('t1','c1')].role,'primary');assert.ok(!s.placements[placementId('t2','c1')]);assert.equal(s.topics.t3.name,'新资产');
});
test('inverse conflict writes nothing, compensation is separately sealed at current versions',()=>{
  let s=run(setup(),{type:'SET_PLACEMENT',refId:'c1',topicId:'t1',role:'primary'});const move=operation(s,{type:'MOVE_PRIMARY',refId:'c1',from:'t1',to:'t2'});s=run(move.state,{type:'SET_LOCK',target:{kind:'placement',topicId:'t2',refId:'c1'},locked:false});const before=stable(s);assert.equal(previewUndo(s,move).state,'conflict');assert.throws(()=>applyUndo(s,move,ctx(s)),/undo-conflict/);assert.equal(stable(s),before);
  const keys=move.inverse.map(i=>({kind:i.kind,key:i.key})),context=ctx(s,'compensate',{operations:{[move.operationId]:move}}),plan=buildCompensationPlan(s,move,keys,context);s=reduceProCommand(s,{type:'APPLY_COMPENSATION_PLAN',plan},context);assert.equal(s.placements[placementId('t1','c1')].role,'primary');assert.equal(move.status,'applied');
});
test('AI undo writes semantic rejection atomically and keeps proposal applied',()=>{
  let s=setup(),p=proposal(s);s=registerProposal(s,p);const op=operation(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash});s=applyUndo(op.state,op,ctx(op.state));assert.equal(s.proposals[p.id].state,'applied');assert.ok(Object.values(s.constraints).some(c=>c.kind==='reject-proposal'&&c.proposalFingerprint===p.fingerprint));assert.ok(!s.placements[placementId('t1','c1')]);
  const again=sealProposal({...p,id:'pr-new-model',versions:versions(s),model:{profileId:'new',modelVersion:'new',promptVersion:'new',outputSchemaVersion:'vaiwl-pro-model-output/1'}});assert.throws(()=>registerProposal(s,again),/proposal-rejected/);
});
test('rejecting or undoing a grouped new theme preserves each member rejection after the live row is retired',()=>{
  for(const method of ['reject','undo']){
    let state=setup();const p=proposal(state,{kind:'new-topic',draftKey:'same_seed',name:'数值积分',intent:{object:'积分',objective:'核对参数',expectedOutcome:null,evidenceIds:['e_c1','e_c2']},members:['c1','c2']});state=registerProposal(state,p);
    if(method==='reject')state=run(state,{type:'REJECT_PROPOSAL',proposalId:p.id});
    else {const op=operation(state,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash});state=op.state;delete state.proposals[p.id];state=applyUndo(state,op,ctx(state));}
    const rejected=Object.values(state.constraints).filter(row=>row.kind==='reject-proposal');assert.equal(rejected.length,3);
    assert(rejected.some(row=>row.proposalFingerprint===p.fingerprint&&row.targetDigest===semanticActionDigest(p)));
    for(const refId of p.members){const fingerprint=digest([p.fingerprint,refId,'member-rejection']),row=rejected.find(row=>row.proposalFingerprint===fingerprint);assert(row);assert.equal(row.targetDigest,semanticActionDigest({...p,members:[refId]}));assert.equal(row.evidenceDigest,p.versions.evidenceDigest);}
    assert.equal(Object.keys(state.placements).length,0);assert.equal(Object.keys(state.topics).length,2);
  }
});
test('bounded live proposal retention keeps current reviews and complete historical undo rejection memory',()=>{
  let state=setup(),accepted=proposal(state);state=registerProposal(state,accepted);const applied=operation(state,{type:'ACCEPT_PROPOSAL',proposalId:accepted.id,planHash:accepted.planHash});state=applied.state;
  const receiptBefore=digest(applied.patch),current=versions(state);
  for(let i=0;i<250;i++){const p=proposal(state,{kind:'unknown',reason:'insufficient-evidence'},{id:'terminal_'+i,qualityBand:'insufficient'});state.proposals[p.id]={proposal:p,state:'rejected',missingEvidence:[],appliedOperationId:null};}
  const stillCurrent=proposal(state,{kind:'derived-title',refId:'c2',title:'still reviewable'},{id:'current_review'});state.proposals[stillCurrent.id]={proposal:stillCurrent,state:'awaiting-review',missingEvidence:[],appliedOperationId:null};
  const staleOverlay=sealProposal({...stillCurrent,id:'stale_overlay',versions:{...current,overlayRevision:0}}),staleSource=sealProposal({...stillCurrent,id:'stale_source',versions:{...current,sourceGeneration:{src1:0}}});
  for(const p of [staleOverlay,staleSource])state.proposals[p.id]={proposal:p,state:'awaiting-review',missingEvidence:[],appliedOperationId:null};
  const incoming=proposal(state,{kind:'derived-title',refId:'c3',title:'new current review'},{id:'incoming_review'}),next=registerProposal(state,incoming,{currentVersions:current});
  assert.equal(Object.keys(next.proposals).length,202);assert(next.proposals.current_review);assert(next.proposals.incoming_review);assert.equal(next.proposals.stale_overlay,undefined);assert.equal(next.proposals.stale_source,undefined);assert.equal(next.proposals[accepted.id],undefined);
  assert.equal(previewUndo(next,applied).state,'ready');const undone=applyUndo(next,applied,ctx(next));
  assert(Object.values(undone.constraints).some(c=>c.kind==='reject-proposal'&&c.proposalFingerprint===accepted.fingerprint));assert.equal(digest(applied.patch),receiptBefore);
  const again=sealProposal({...accepted,id:'later_model_retry',versions:versions(undone)});assert.throws(()=>registerProposal(undone,again),/proposal-rejected/);
  assert.throws(()=>registerProposal(state,incoming,{currentVersions:{...current,overlayRevision:current.overlayRevision+1}}),/stale-proposal-registration/);
});
test('current review queue capacity refuses more work without automatically deleting any actionable proposal',()=>{
  const state=setup();for(let i=0;i<2000;i++){const p=proposal(state,{kind:'unknown',reason:'insufficient-evidence'},{id:'review_'+i,qualityBand:'insufficient'});state.proposals[p.id]={proposal:p,state:'awaiting-review',missingEvidence:[],appliedOperationId:null};}
  const before=digest(state),incoming=proposal(state,{kind:'unknown',reason:'insufficient-evidence'},{id:'over_capacity',qualityBand:'insufficient'});
  assert.throws(()=>registerProposal(state,incoming,{currentVersions:versions(state)}),/proposal-review-capacity/);assert.equal(digest(state),before);assert.equal(Object.keys(state.proposals).length,2000);
});
test('A29: native preference stores no frozen copy and retained derived title can be recovered',()=>{
  let s=run(setup(),{type:'RESTORE_NATIVE_TITLE',refId:'c1'});assert.equal(s.titles.c1.title,null);assert.equal(s.titles.c1.displayPreference,'native');assert.throws(()=>run(s,{type:'SET_TITLE_DISPLAY',refId:'c1',displayPreference:'derived'}),/missing-derived-title/);
  s=run(s,{type:'SET_DERIVED_TITLE',refId:'c1',title:'我的派生名'});s=run(s,{type:'RESTORE_NATIVE_TITLE',refId:'c1'});assert.equal(s.titles.c1.title,'我的派生名');assert.equal(s.titles.c1.displayPreference,'native');s=run(s,{type:'SET_TITLE_DISPLAY',refId:'c1',displayPreference:'derived'});assert.equal(s.titles.c1.title,'我的派生名');
});
test('REMOVE_AI_ARTIFACTS preview removes only automatic assets; preserves manual edit',()=>{
  let s=setup(),p=proposal(s,{kind:'derived-title',refId:'c1',title:'自动建议'});s=registerProposal(s,p);s=run(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash});s=run(s,{type:'SET_DERIVED_TITLE',refId:'c2',title:'人工名'});const preview=previewRemoveAIArtifacts(s,['c1','c2'],ctx(s));s=run(s,{type:'REMOVE_AI_ARTIFACTS',refIds:['c1','c2'],reviewedPlanHash:preview.planHash});assert.equal(s.titles.c1,undefined);assert.equal(s.titles.c2.title,'人工名');
});
test('A33: multiple preserved legacy placements require explicit choice; null is deliberate',()=>{
  let s=run(setup(),{type:'SET_PLACEMENT',refId:'c1',topicId:'t1',role:'primary'});s=run(s,{type:'SET_PLACEMENT',refId:'c1',topicId:'t2',role:'related'});for(const p of Object.values(s.placements)){p.role='primary';p.activityContribution='primary-only';p.state='revalidation-needed';}const original=Object.values(s.placements).map(p=>({id:placementId(p.topicId,p.conversationId),refId:p.conversationId,workspaceId:p.topicId,order:0,excluded:false,locked:true,owner:'human',revision:p.revision}));s.legacyResolutions.c1={refId:'c1',originalPlacementIds:Object.keys(s.placements),preservedAssetDigest:digest(original),candidates:['t1','t2'],status:'primary-resolution-required',chosenPrimary:null,preservedPlacements:original};validateOverlay(s);
  assert.throws(()=>run(s,{type:'SET_PLACEMENT',refId:'c1',topicId:'t1',role:'primary'}),/legacy-primary/);const plan=legacyResolutionPlan(s,'c1',null,ctx(s));s=run(s,{type:'RESOLVE_LEGACY_PRIMARY',refId:'c1',chosenPrimary:null,preservedAssetDigest:s.legacyResolutions.c1.preservedAssetDigest,planHash:plan.planHash});assert.ok(Object.values(s.placements).every(p=>p.role==='related'&&p.control.locked));
});
test('A35: machine patch then manual patch replay in committed order; no command/model replay',()=>{
  let s=setup(),p=proposal(s);s=registerProposal(s,p);const base=structuredClone(s),ai=operation(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash});const human=operation(ai.state,{type:'SET_DERIVED_TITLE',refId:'c1',title:'人工编辑'});const recovered=replayPatch(replayPatch(base,ai),human);assert.deepEqual(recovered,human.state);assert.throws(()=>replayPatch(base,human),/recovery-patch|sequence/);
});
test('strict validation rejects unknown fields, invalid arrays, getters and unsafe keys',()=>{
  const s=setup();assert.throws(()=>validateOverlay({...s,grant:{ok:true}}),/invalid-schema/);const getter=structuredClone(s);Object.defineProperty(getter,'scopeKey',{get(){throw Error('should-not-run');},enumerable:true});assert.throws(()=>validateOverlay(getter),/unsafe-property/);
  const bad=JSON.parse(JSON.stringify(s));bad.topics=JSON.parse('{"__proto__":{}}');assert.throws(()=>validateOverlay(bad),/unsafe-property/);const alias=structuredClone(s);alias.topics.t1.aliases=new Array(2);assert.throws(()=>validateOverlay(alias),/invalid-array/);
});
test('scope and live version vector mismatches are rejected before mutation',()=>{
  const s=setup(),context=ctx(s);context.snapshot.versions={...context.snapshot.versions,authorizationEpoch:2};assert.throws(()=>reduceProCommand(s,{type:'CREATE_TOPIC',name:'x'},context),/stale-read-set/);const other=ctx(s);other.expected={...other.expected,scopeKey:'other'};assert.throws(()=>reduceProCommand(s,{type:'CREATE_TOPIC',name:'x'},other),/scope-mismatch/);
});

test('first preview batch applies multiple immutable proposals in one journal/inverse',()=>{
  let s=setup();const initialRevision=s.revision,p1=proposal(s),p2=proposal(s,{kind:'derived-title',refId:'c1',title:'积分误差核对'},{id:'pr2'}),p3=proposal(s,{kind:'existing-topic',refId:'c2',topicId:'t2',role:'primary'},{id:'pr3'});for(const p of [p1,p2,p3])s=registerProposal(s,p);const command={type:'ACCEPT_PROPOSAL_BATCH',proposals:[p1,p2,p3].map(p=>({proposalId:p.id,planHash:p.planHash}))};const op=operation(s,command);op.proposalIds=[p1.id,p2.id,p3.id];assert.equal(op.state.revision,initialRevision+1);assert.equal(op.state.titles.c1.title,'积分误差核对');assert.equal(Object.keys(op.state.placements).length,2);for(const p of [p1,p2,p3])assert.equal(op.state.proposals[p.id].appliedOperationId,op.operationId);
  s=applyUndo(op.state,op,ctx(op.state));assert.equal(Object.keys(s.placements).length,0);assert.equal(Object.keys(s.titles).length,0);assert.equal(Object.values(s.constraints).filter(c=>c.kind==='reject-proposal').length,3);
});
test('conflicting batch primary rejects all without retagging or partial title',()=>{
  let s=setup();const p1=proposal(s),p2=proposal(s,{kind:'existing-topic',refId:'c1',topicId:'t2',role:'primary'},{id:'pr2'}),p3=proposal(s,{kind:'derived-title',refId:'c2',title:'应当完全回滚'},{id:'pr3'});for(const p of [p1,p2,p3])s=registerProposal(s,p);const before=stable(s);assert.throws(()=>run(s,{type:'ACCEPT_PROPOSAL_BATCH',proposals:[p3,p1,p2].map(p=>({proposalId:p.id,planHash:p.planHash}))}),/conflicting-batch-primary/);assert.equal(stable(s),before);
});
test('batch late domain error rolls back previous valid suggestion',()=>{
  let s=run(setup(),{type:'EXCLUDE_TOPIC',refId:'c2',topicId:'t2'});const p1=proposal(s),p2=proposal(s,{kind:'existing-topic',refId:'c2',topicId:'t2',role:'primary'},{id:'pr2'});for(const p of [p1,p2])s=registerProposal(s,p);const before=stable(s);assert.throws(()=>run(s,{type:'ACCEPT_PROPOSAL_BATCH',proposals:[p1,p2].map(p=>({proposalId:p.id,planHash:p.planHash}))}),/hard-topic-exclusion/);assert.equal(stable(s),before);
});
test('batch cannot assign the same pair both primary and related in either order',()=>{for(const reverse of [false,true]){let s=setup();const p1=proposal(s),p2=proposal(s,{kind:'existing-topic',refId:'c1',topicId:'t1',role:'related'},{id:'pr2'});for(const p of [p1,p2])s=registerProposal(s,p);const ordered=reverse?[p2,p1]:[p1,p2],before=stable(s);assert.throws(()=>run(s,{type:'ACCEPT_PROPOSAL_BATCH',proposals:ordered.map(p=>({proposalId:p.id,planHash:p.planHash}))}),/conflicting-batch-relation/);assert.equal(stable(s),before);}});
test('batch multiple new themes allocate distinct stable IDs',()=>{
  let s=setup();const p1=proposal(s,{kind:'new-topic',draftKey:'one',name:'积分',intent:{object:'积分',objective:'核对',expectedOutcome:null,evidenceIds:['e_c1']},members:['c1']}),p2=proposal(s,{kind:'new-topic',draftKey:'two',name:'求职',intent:{object:'岗位',objective:'投递',expectedOutcome:null,evidenceIds:['e_c2']},members:['c2']},{id:'pr2'});for(const p of [p1,p2])s=registerProposal(s,p);s=run(s,{type:'ACCEPT_PROPOSAL_BATCH',proposals:[p1,p2].map(p=>({proposalId:p.id,planHash:p.planHash}))});const ids=Object.values(s.placements).map(p=>p.topicId);assert.equal(new Set(ids).size,2);assert.equal(Object.keys(s.topics).length,4);
});
test('inverse cannot be forged by recomputing a hash around an unrelated restore',()=>{
  const s=setup(),op=operation(s,{type:'SET_DERIVED_TITLE',refId:'c1',title:'edited'});op.inverse[0].restoreValue={...op.state.titles.c1,title:'forged'};op.inverseHash=digest({inverse:op.inverse,readSet:op.readSet});assert.throws(()=>previewUndo(op.state,op),/inverse-patch-mismatch/);
});
