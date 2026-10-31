import {buildMergePlan,buildSplitPlan,buildSeriesPlan,buildCompensationPlan,previewDelete,previewRemoveAIArtifacts,legacyResolutionPlan,emptyOverlay} from '../domain/index.mjs';
import {runLocalSuggestions} from '../organize/index.mjs';
import {buildLaunchContext} from '../navigation/launch-context.mjs';

/** UI facade over the six ports. Authority remains in owner closures; no grant,
 * receipt, credential or provider handle map is returned to the UI.
 * A real host supplies the same facade over its bounded worker/frame RPC.
 */
export async function createProController(owner,{mountNativeView=null}={}) {
  const ports=owner.ports,listeners=new Set();
  let cached=null,view=null,stopped=false,reading=null;
  let mode='pro-default-none',selectedProjectIds=[],segment=0,rowLimit=5;
  const notify=()=>{for(const f of listeners)f();};
  const operationId=()=>`pro_${crypto.randomUUID().replaceAll('-','')}`;
  const success=r=>{if(!r?.ok)throw Object.assign(Error(r?.reason??'pro-operation-failed'),{result:r});return r.value;};
  async function refresh(){
    if(stopped)return;
    try {
      cached=await owner.readPrivate();
      const result=await ports.view.project(owner.grant(),{mode,role:'workspace',session:cached.snapshot.viewSession,segment,offset:0,limit:24,rowLimit,launchContext:reading},new AbortController().signal);
      view=success(result);
    }catch(e){
      if(cached)cached={...cached,state:emptyOverlay(cached.state.scopeKey),records:[],snapshot:{...cached.snapshot,authorized:false,references:[]}};
      view=null;reading=null;notify();throw e;
    }
    notify();return view;
  }
  const context=()=>({actor:'human',operationId:operationId(),snapshot:cached.snapshot,expected:cached.snapshot.versions,mode,selectedProjectIds});
  async function dispatch(command,{expected=cached.snapshot.versions,operationId:id=operationId()}={}) {
    const receipt=owner.humanIntent(command,expected);
    const r=await ports.commit.commit(owner.grant(),{operationId:id,expected,command:{actor:'human',intent:receipt,command}},new AbortController().signal);
    const value=success(r);await refresh();return value;
  }
  const controller={
    getState:()=>structuredClone(cached.state), getSnapshot:()=>structuredClone(cached.snapshot), getView:()=>view,
    getOperations:()=>structuredClone(cached.records.filter(r=>r.transaction.actor!=='system').map(r=>r.transaction)),
    getStatus:()=>({...owner.status(),mode,selectedProjectIds:[...selectedProjectIds],launchContext:reading,segment,rowLimit}),
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},refresh,dispatch,
    async previewUndo(id){return success(await ports.commit.previewUndo(owner.grant(),id,new AbortController().signal));},
    async undo(id,inverseHash){return dispatch({type:'UNDO_TRANSACTION',targetOperationId:id,reviewedInverseHash:inverseHash});},
    previewCompensation(id,{restoreKeys=[]}={}){const op=cached.records.find(r=>r.transaction.operationId===id)?.transaction;if(!op)throw Error('missing-operation');return buildCompensationPlan(cached.state,op,restoreKeys,context());},
    async suggest({refIds}={}){
      if(mode==='native')throw Error('organizing-paused-native-view');
      const grant=owner.grant(),snapshot=cached.snapshot;
      const pack=success(await ports.evidence.prepare(grant,{refs:refIds??snapshot.references.map(r=>r.id).slice(0,10),requestedInputLevel:'metadata-only',processingConsentReference:owner.consentReference(),maxUtf8Bytes:32768},new AbortController().signal));
      const result=await runLocalSuggestions({pack,overlay:cached.state,firstRun:true,currentVersions:pack.versions});
      await owner.registerProposals(grant,result.proposals,pack.versions);
      await refresh();return result;
    },
    async applyProposal(id,planHash){return dispatch({type:'ACCEPT_PROPOSAL',proposalId:id,planHash});},
    async applyProposalBatch(proposals){return dispatch({type:'ACCEPT_PROPOSAL_BATCH',proposals:proposals.map(p=>({proposalId:p.proposalId??p.id,planHash:p.planHash}))});},
    previewDelete(topicId){return previewDelete(cached.state,topicId,context());},
    previewRemoveAI(refIds){return previewRemoveAIArtifacts(cached.state,refIds,context());},
    previewMerge(input){return buildMergePlan(cached.state,input,context());},
    previewSplit(input){return buildSplitPlan(cached.state,input,context());},
    previewSeries(input){
      const value={seriesId:null,...input,expected:cached.snapshot.versions};
      return buildSeriesPlan(value,{knownRefs:cached.snapshot.references.map(r=>r.id),topicId:value.topicId,currentSeries:value.seriesId?cached.state.series[value.seriesId]??null:null,versions:cached.snapshot.versions});
    },
    previewLegacyPrimary(refId,chosenPrimary){return legacyResolutionPlan(cached.state,refId,chosenPrimary,context());},
    async applyStructure(result){
      if(result?.kind==='manual-series-plan')return dispatch({type:'APPLY_SERIES_PLAN',plan:result},{expected:result.expected});
      const proposal=result?.proposal??result;
      if(!proposal||result?.conflicts?.length)throw Error('structure-conflict');
      await owner.registerProposals(owner.grant(),[proposal],proposal.versions);
      await refresh();return controller.applyProposal(proposal.id,proposal.planHash);
    },
    async setMode(next,{selectedProjectIds:ids=[]}={}){
      if(!['native','pro-default-none','pro-cross-project'].includes(next))throw Error('invalid-mode');
      await owner.setViewPolicy(next,ids);mode=next;selectedProjectIds=[...ids];segment=0;
      await refresh();return view;
    },
    async setSegment(value){if(!Number.isSafeInteger(value)||value<0)throw Error('invalid-segment');segment=value;await refresh();},
    async setLocalProcessing(value){if(value==='local')await owner.allowLocal();else if(value==='off')await owner.pauseLocal();else throw Error('unsupported-processing-mode');await refresh();},
    async showMore(){rowLimit=Math.min(197,rowLimit+12);await refresh();},
    async open(refId,{topicId=null,seriesId=null,origin=topicId?'topic':'direct',nativeProjectId=null,returnAnchor=null}={}) {
      const c=buildLaunchContext({id:operationId(),referenceId:refId,sourceMode:mode,topicId,seriesId,nativeProjectId,origin,
        returnAnchor:returnAnchor??{cardId:topicId??nativeProjectId,refId,segment,scrollOffset:0,openOldItems:[],sidebarChoices:[]}},
        {state:cached.state,snapshot:cached.snapshot,session:cached.snapshot.viewSession,documentEpoch:cached.snapshot.versions.authorizationEpoch,selectedProjectIds});
      const prepared=success(await ports.navigation.prepare(owner.grant(),refId,c,new AbortController().signal));
      const dispatched=success(await ports.navigation.dispatch(prepared.existingPlanHandle,operationId()));
      if(dispatched.state==='arrived'){reading=c;owner.setLaunchContext?.(c);await refresh();}return dispatched;
    },
    async returnToWorkspace(){const anchor=owner.returnToWorkspace?.(reading);reading=null;await refresh();return {anchor};},
    async restart(){reading=null;await owner.restart();await refresh();return controller.getState();},
    exportBackup(){return owner.exportBackup(cached.state);},
    async restoreBackup(backup){await owner.restoreBackup(backup,cached.snapshot.versions);await refresh();},
    mountNativeView:mountNativeView?((container,options)=>mountNativeView(container,controller,options)):undefined,
    destroy(){stopped=true;unsubscribeStatus?.();listeners.clear();owner.stop?.();}
  };
  const unsubscribeStatus=owner.subscribeInvalidation?.(()=>{if(cached)cached={...cached,state:emptyOverlay(cached.state.scopeKey),records:[],snapshot:{...cached.snapshot,authorized:false,references:[]}};view=null;reading=null;notify();});
  await refresh();return Object.freeze(controller);
}
