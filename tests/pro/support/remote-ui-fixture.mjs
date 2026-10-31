// Isolated renderer/DTO regression data. This module is never packaged and
// establishes no real scope, NativeRepository or production authorization.
import {digest} from '../../../src/data/hash.mjs';
import {emptyOverlay,placementId,planTransaction,buildSplitPlan,buildMergePlan,legacyResolutionPlan,previewUndo,registerProposal,overlayChanges} from '../../../src/pro/domain/index.mjs';
import {buildSeriesEditPlan} from '../../../src/pro/integration/series-edit.mjs';
import {projectPublicPage,projectPublicPanel,projectPublicPreview,projectPublicOperationReview,publicVersions,publicStatus} from '../../../src/pro/integration/public-frame-dto.mjs';
import {createRemoteProController} from '../../../src/pro/ui/remote-controller.mjs';
import {createProWorkspace} from '../../../src/pro/ui/workspace.mjs';
import {nextSeriesEntry} from '../../../src/pro/navigation/launch-context.mjs';
let state=emptyOverlay('remote_ui_fixture'),persistence='same-idb',launchContext=null,beforeLarge=null,mode='pro-default-none',selectedProjectIds=[],projects=[];
state.revision=1;
const control={mode:'human',locked:false,revision:1,lastHumanOperation:'synthetic_seed'};
state.topics.topic={id:'topic',scopeKey:state.scopeKey,name:'分页工作',aliases:[],icon:'◇',intent:null,nameControl:control,membershipControl:control,lifecycle:'active',createdBy:'human',revision:1};
const references=Array.from({length:242},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),nativeTitle:'第 '+(i+1)+' 个窗口',nativeUrl:null,membership:{state:'NONE',evidenceId:'synthetic_'+i,revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['synthetic_source']}));
for(const ref of references)state.placements[placementId('topic',ref.id)]={conversationId:ref.id,topicId:'topic',role:'primary',activityContribution:'primary-only',state:'included',control,constraintRefs:[],evidenceIds:[],revision:1};
const entries=references.slice(0,241).map(r=>r.id);
state.series.series={id:'series',topicId:'topic',title:'长工作线',entries,edges:entries.slice(1).map((to,i)=>({kind:'continuation',from:entries[i],to})),labels:entries.map((refId,i)=>({refId,sequence:[i+1],source:'human-confirmed'})),revision:1};
const versions=()=>({scopeKey:state.scopeKey,authorizationEpoch:1,sourceGeneration:{synthetic_source:1},nativeFields:Object.fromEntries(references.map(r=>[r.id,1])),overlayRevision:state.revision,targets:{},constraintRevision:0,policyVersion:'fixture_'+digest([mode,selectedProjectIds]).slice(0,16),evidenceDigest:digest('synthetic')});
const snapshot=()=>({authorized:true,references,versions:versions(),capabilities:{positiveNone:'available'},projects});
const status=()=>({authorized:true,entitlement:'pro',persistence,mode,selectedProjectIds,segment:0,processingMode:'off',positiveNone:'available',modelAvailability:'unavailable',launchContext:launchContext?{...launchContext,nextReferenceId:nextSeriesEntry(state.series.series,launchContext.referenceId)}:null});
const previews=new Map(),calls=[],records=[],receipts=new Map();let maxReplyBytes=0,previewSerial=0,dropStructure=false;
const context=operationId=>({actor:'human',operationId,snapshot:snapshot(),expected:versions(),operations:Object.fromEntries(records.map(r=>[r.transaction.operationId,r.transaction]))});
const record=(transaction,ctx)=>({operationId:ctx.operationId,actor:'human',base:ctx.expected,planHash:transaction.planHash,resultRevision:transaction.state.revision,proposalId:null,inverse:transaction.inverse,patch:transaction.patch,inverseHash:transaction.inverseHash,readSet:transaction.readSet??[],status:'applied'});
const assetDigest=()=>digest({topics:state.topics,placements:state.placements,series:state.series});
const remote=createRemoteProController({request:async(action,payload)=>{
  calls.push({action,payload});const current=snapshot(),input={state,snapshot:current,status:status(),view:{mode,native:null},records};let value;
  if(action==='view'&&payload.op==='page')value=projectPublicPage({...input,query:payload});
  else if(action==='view'&&payload.op==='panel')value=projectPublicPanel({...input,...payload});
  else if(action==='view'&&payload.op==='operation-review'){
    const entry=previews.get(payload.previewId);if(entry?.kind!=='undo-review'||payload.expected.reviewId!==publicVersions(versions()).reviewId||payload.offset>entry.reviewNext)return {ok:false};
    value=projectPublicOperationReview({...input,operation:entry.operation,previewId:payload.previewId,offset:payload.offset,limit:payload.limit});entry.reviewNext=Math.max(entry.reviewNext,value.page.offset+value.page.count);
  }
  else if(action==='background'&&payload.op==='status')value={kind:'pro-status',protocol:'vaiwl-pro-public/1',status:publicStatus(status())};
  else if(action==='background'&&payload.op==='mode'){mode=payload.mode;selectedProjectIds=mode==='pro-cross-project'?[...payload.selectedProjectIds]:[];value={kind:'pro-status',protocol:'vaiwl-pro-public/1',status:publicStatus(status())};}
  else if(action==='commit'){
    if(['apply-structure','dispatch'].includes(payload.op)&&receipts.has(payload.operationId))return {ok:true,value:receipts.get(payload.operationId)};
    if(payload.expected.reviewId!==publicVersions(versions()).reviewId)return {ok:false};
    if(payload.op==='preview'&&payload.kind==='legacy-upgrade')value={kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'unavailable',message:'当前已有 Pro 整理资料，无法在此覆盖升级。'};
    else if(payload.op==='preview'&&payload.kind==='legacy-primary')value=projectPublicPreview({preview:legacyResolutionPlan(state,payload.input.refId,payload.input.chosenPrimary,context('legacy_review')),previewId:'legacy_review_'+(++previewSerial)});
    else if(payload.op==='preview'&&payload.kind==='merge'){
      const plan=buildMergePlan(state,payload.input,context('merge_review_'+previewSerial)),previewId='merge_'+(++previewSerial);previews.set(previewId,{kind:'merge',plan});value=projectPublicPreview({preview:plan,previewId});
    }
    else if(payload.op==='preview'&&payload.kind==='split')value=projectPublicPreview({preview:buildSplitPlan(state,payload.input,{actor:'human',operationId:'split_preview',snapshot:current,expected:versions()}),previewId:'split_preview'});
    else if(payload.op==='preview'&&payload.kind==='undo-review'){
      const operation=records.find(r=>r.transaction.operationId===payload.input.operationId)?.transaction;if(!operation)return {ok:false};const plan=previewUndo(state,operation),previewId='review_'+(++previewSerial);
      previews.set(previewId,{kind:'undo-review',plan,operation,reviewNext:0});const {inverseHash,inverse,...publicPlan}=plan;value=projectPublicPreview({preview:publicPlan,previewId});
    }
    else if(payload.op==='preview'&&payload.kind==='series-edit'){
      const plan=buildSeriesEditPlan(payload.input,{state,snapshot:current,expected:versions()}),previewId='preview_'+(++previewSerial);previews.set(previewId,{kind:'series',plan});value=projectPublicPreview({preview:plan,previewId});
    }else if(payload.op==='apply-structure'){
      const entry=previews.get(payload.previewId);if(!entry)return {ok:false};const ctx=context(payload.operationId);
      if(entry.kind==='undo-review'&&(entry.reviewNext!==entry.operation.patch.length||entry.plan.state!=='ready'))return {ok:false};
      const prior=state,working=entry.kind==='merge'?registerProposal(state,entry.plan.proposal):state;
      const command=entry.kind==='undo-review'?{type:'UNDO_TRANSACTION',targetOperationId:entry.operation.operationId,reviewedInverseHash:entry.plan.inverseHash}:entry.kind==='merge'?{type:'ACCEPT_PROPOSAL',proposalId:entry.plan.proposal.id,planHash:entry.plan.proposal.planHash}:{type:'APPLY_SERIES_PLAN',plan:entry.plan},transaction=planTransaction(working,command,ctx);if(working!==prior)transaction.patch=overlayChanges(prior,transaction.state);
      state=transaction.state;if(entry.kind==='undo-review')entry.operation.status='undone';records.push({transaction:record(transaction,ctx)});previews.delete(payload.previewId);value={kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied'};receipts.set(payload.operationId,value);if(dropStructure){dropStructure=false;throw Error('reply-lost-after-commit');}
    }else if(payload.op==='dispatch'){
      const ctx=context(payload.operationId),transaction=planTransaction(state,payload.command,ctx);state=transaction.state;records.push({transaction:record(transaction,ctx)});value={kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied'};receipts.set(payload.operationId,value);
    }else throw Error('unexpected-commit');
  }else if(action==='navigation'&&payload.op==='open')value={kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'native-link',nativeLink:{refId:payload.refId,url:location.origin+'/c/'+payload.refId,disposition:'new-tab-preserve-current'}};
  else throw Error('unexpected-request');
  maxReplyBytes=Math.max(maxReplyBytes,new TextEncoder().encode(JSON.stringify(value)).length);return {ok:true,value};
}});
await remote.refresh();
let recoveryPreviews=0,recoveryApplies=0,recoveryCompanion=null,recoveryDrop=false;const recoveryReceipts=new Map();
window.testApi={series:()=>structuredClone(state.series.series),calls:()=>structuredClone(calls),maxReplyBytes:()=>maxReplyBytes,dropNextStructureReply(){dropStructure=true;},async readOnly(){persistence='memory-only';await remote.refresh({force:true});},
  async beginReading(){launchContext={referenceId:entries[0],topicId:'topic',seriesId:'series',nativeProjectId:null,origin:'topic'};await remote.refresh({force:true});},
  async breakNext(){state.series.series.edges=state.series.series.edges.filter(e=>!(e.kind==='continuation'&&e.from===entries[0]));await remote.refresh({force:true});},
  async endReading(){launchContext=null;await remote.refresh({force:true});},
  async createLargeSplit(){beforeLarge=assetDigest();const ctx=context('large_split'),preview=buildSplitPlan(state,{retainId:'topic',children:[{draftKey:'whole_series',name:'整体拆分的工作线',members:[...state.series.series.entries]}]},ctx);if(!preview.proposal)throw Error('fixture-split-conflict');const prior=state,working=registerProposal(state,preview.proposal),transaction=planTransaction(working,{type:'ACCEPT_PROPOSAL',proposalId:preview.proposal.id,planHash:preview.proposal.planHash},ctx);transaction.patch=overlayChanges(prior,transaction.state);state=transaction.state;const operation=record(transaction,ctx);records.push({transaction:operation});await remote.refresh({force:true});return {changes:operation.patch.length};},
  largeResult:()=>({restored:assetDigest()===beforeLarge,status:records.find(r=>r.transaction.operationId==='large_split')?.transaction.status}),
  async setupChoicePaging(){
    projects=Array.from({length:132},(_,i)=>({id:'native_project_'+(i+1),nativeName:'原生项目 '+(i+1)}));
    for(let i=1;i<=130;i++){const id='paged_topic_'+i;state.topics[id]={...structuredClone(state.topics.topic),id,name:'分页主题 '+i,aliases:[]};}
    state.topics.legacy_other={...structuredClone(state.topics.topic),id:'legacy_other',name:'历史关联',aliases:[]};
    for(let i=0;i<32;i++){
      const refId=references[i].id,preserved=['topic','legacy_other'].map((workspaceId,order)=>({id:placementId(workspaceId,refId),refId,workspaceId,order,excluded:false,locked:true,owner:'human',revision:1}));
      for(const old of preserved)state.placements[old.id]={conversationId:refId,topicId:old.workspaceId,role:'related',activityContribution:'none',state:'included',control:{...control,locked:true},constraintRefs:[],evidenceIds:[],revision:1};
      state.legacyResolutions[refId]={refId,originalPlacementIds:preserved.map(p=>p.id),preservedAssetDigest:digest(preserved),candidates:['topic','legacy_other'],status:'primary-resolution-required',chosenPrimary:null,preservedPlacements:preserved};
    }
    state.revision++;await remote.refresh({force:true});
  },
  unresolved:()=>Object.values(state.legacyResolutions).filter(r=>r.status==='primary-resolution-required').map(r=>r.refId),topicState:id=>structuredClone(state.topics[id]),
  referenceState:n=>({title:structuredClone(state.titles[references[n-1].id]),placements:structuredClone(Object.values(state.placements).filter(p=>p.conversationId===references[n-1].id))}),selectedProjects:()=>[...selectedProjectIds],
  async bumpReview(){state.revision++;await remote.refresh({force:true});},
  recoveryCounts:()=>({previews:recoveryPreviews,applies:recoveryApplies}),dropNextRecoveryReply(){recoveryDrop=true;},
  async mountRecovery(){
    window.ui.destroy();remote.destroy();const root=document.createElement('div');root.id='workspace';document.getElementById('workspace').replaceWith(root);const freeRoot=document.createElement('div');freeRoot.textContent='Free 原生入口保留';root.append(freeRoot);
    const {createProFrameCompanion}=await import('../../../src/host/pro-frame-client.mjs');
    const grant={id:'synthetic_grant',mountId:'synthetic_mount',scopeGrantId:'synthetic_scope_grant',parentDocumentId:'synthetic_parent',uiDocumentId:'synthetic_frame',expiresAt:new Date(Date.now()+60000).toISOString()};
    recoveryCompanion=createProFrameCompanion({document,runtime:{async sendMessage(message){const p=message.payload;if(message.action==='commit'&&p.op==='recovery-preview'){recoveryPreviews++;return {ok:true,value:{kind:'pro-preview',protocol:'vaiwl-pro-public/1',previewId:'synthetic_recovery_'+recoveryPreviews,proposal:false,conflicts:[],summary:'已核对 3 笔事务；原始损坏记录会保留。'}};}if(message.action==='commit'&&p.op==='recovery-apply'){if(recoveryReceipts.has(p.operationId))return recoveryReceipts.get(p.operationId);recoveryApplies++;const reply={ok:true,value:{kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied'}};recoveryReceipts.set(p.operationId,reply);if(recoveryDrop){recoveryDrop=false;throw Error('reply-lost-after-commit');}return reply;}if(message.action==='background'&&p.op==='mode')return {ok:true,value:{kind:'pro-status',protocol:'vaiwl-pro-public/1',status:publicStatus({...status(),mode:'native'})}};return {ok:false,reason:'pro-request-unavailable'};}},role:'workspace',privateRoot:root,freeRoot,getGrant:()=>grant,isCurrent:()=>true});
  },stopRecovery(){recoveryCompanion?.stop();},
};
window.ui=createProWorkspace(document.getElementById('workspace'),remote);window.ready=true;
