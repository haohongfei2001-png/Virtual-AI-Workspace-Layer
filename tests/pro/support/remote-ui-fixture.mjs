// Isolated renderer/DTO regression data. This module is never packaged and
// establishes no real scope, NativeRepository or production authorization.
import {digest} from '../../../src/data/hash.mjs';
import {emptyOverlay,placementId,planTransaction} from '../../../src/pro/domain/index.mjs';
import {buildSeriesEditPlan} from '../../../src/pro/integration/series-edit.mjs';
import {projectPublicPage,projectPublicPanel,projectPublicPreview,publicVersions,publicStatus} from '../../../src/pro/integration/public-frame-dto.mjs';
import {createRemoteProController} from '../../../src/pro/ui/remote-controller.mjs';
import {createProWorkspace} from '../../../src/pro/ui/workspace.mjs';
let state=emptyOverlay('remote_ui_fixture'),persistence='same-idb';
state.revision=1;
const control={mode:'human',locked:false,revision:1,lastHumanOperation:'synthetic_seed'};
state.topics.topic={id:'topic',scopeKey:state.scopeKey,name:'分页工作',aliases:[],icon:'◇',intent:null,nameControl:control,membershipControl:control,lifecycle:'active',createdBy:'human',revision:1};
const references=Array.from({length:242},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),nativeTitle:'第 '+(i+1)+' 个窗口',nativeUrl:null,membership:{state:'NONE',evidenceId:'synthetic_'+i,revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['synthetic_source']}));
for(const ref of references)state.placements[placementId('topic',ref.id)]={conversationId:ref.id,topicId:'topic',role:'primary',activityContribution:'primary-only',state:'included',control,constraintRefs:[],evidenceIds:[],revision:1};
const entries=references.slice(0,241).map(r=>r.id);
state.series.series={id:'series',topicId:'topic',title:'长工作线',entries,edges:entries.slice(1).map((to,i)=>({kind:'continuation',from:entries[i],to})),labels:entries.map((refId,i)=>({refId,sequence:[i+1],source:'human-confirmed'})),revision:1};
const versions=()=>({scopeKey:state.scopeKey,authorizationEpoch:1,sourceGeneration:{synthetic_source:1},nativeFields:Object.fromEntries(references.map(r=>[r.id,1])),overlayRevision:state.revision,targets:{},constraintRevision:0,policyVersion:'fixture_1',evidenceDigest:digest('synthetic')});
const snapshot=()=>({authorized:true,references,versions:versions(),capabilities:{positiveNone:'available'},projects:[]});
const status=()=>({authorized:true,entitlement:'pro',persistence,mode:'pro-default-none',selectedProjectIds:[],segment:0,processingMode:'off',positiveNone:'available',modelAvailability:'unavailable',launchContext:null});
const previews=new Map(),calls=[];let maxReplyBytes=0;
const remote=createRemoteProController({request:async(action,payload)=>{
  calls.push({action,payload});const current=snapshot(),input={state,snapshot:current,status:status(),view:{mode:'pro-default-none',native:null}};let value;
  if(action==='view'&&payload.op==='page')value=projectPublicPage({...input,query:payload});
  else if(action==='view'&&payload.op==='panel')value=projectPublicPanel({...input,...payload});
  else if(action==='background'&&payload.op==='status')value={kind:'pro-status',protocol:'vaiwl-pro-public/1',status:publicStatus(status())};
  else if(action==='commit'){
    if(payload.expected.reviewId!==publicVersions(versions()).reviewId)return {ok:false};
    if(payload.op==='preview'&&payload.kind==='legacy-upgrade')value={kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'unavailable',message:'当前已有 Pro 整理资料，无法在此覆盖升级。'};
    else if(payload.op==='preview'&&payload.kind==='series-edit'){
      const plan=buildSeriesEditPlan(payload.input,{state,snapshot:current,expected:versions()}),previewId='preview_'+previews.size;previews.set(previewId,plan);value=projectPublicPreview({preview:plan,previewId});
    }else if(payload.op==='apply-structure'){
      const plan=previews.get(payload.previewId);if(!plan)return {ok:false};const ctx={actor:'human',operationId:payload.operationId,snapshot:current,expected:versions()};
      state=planTransaction(state,{type:'APPLY_SERIES_PLAN',plan},ctx).state;previews.delete(payload.previewId);value={kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied'};
    }else throw Error('unexpected-commit');
  }else if(action==='navigation'&&payload.op==='open')value={kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'native-link',nativeLink:{refId:payload.refId,url:location.origin+'/c/'+payload.refId,disposition:'new-tab-preserve-current'}};
  else throw Error('unexpected-request');
  maxReplyBytes=Math.max(maxReplyBytes,new TextEncoder().encode(JSON.stringify(value)).length);return {ok:true,value};
}});
await remote.refresh();
window.testApi={series:()=>structuredClone(state.series.series),calls:()=>structuredClone(calls),maxReplyBytes:()=>maxReplyBytes,async readOnly(){persistence='memory-only';await remote.refresh({force:true});}};
window.ui=createProWorkspace(document.getElementById('workspace'),remote);window.ready=true;
