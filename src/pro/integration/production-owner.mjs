import {createProWorkerService} from './worker-service.mjs';
import {createSameDatabaseStore} from './same-db-store.mjs';
import {createCompositeBackupRepository} from './composite-backup.mjs';
import {createProductionModelBridge} from './model-bridge.mjs';
import {productionModelDispatchFence} from './model-dispatch-fence.mjs';
import {verifyModelBudgetFence} from './model-budget.mjs';
import {publicProError} from './public-error.mjs';
import {runLocalMetadataSuggestions} from '../organize/local-runner.mjs';
import {planMetadataBatch,metadataBatchCursorKey} from '../organize/metadata-batch.mjs';
import {createIncrementalTrigger} from '../organize/incremental-trigger.mjs';
import {automaticGate} from '../organize/planner.mjs';
import {buildSeriesEditPlan} from './series-edit.mjs';
import {projectPublicPage,projectPublicPanel,projectPublicRows,projectPublicSearch,projectPublicPreview,projectPublicOperationReview,proposalReviewUnavailable,publicVersions,publicStatus,validatePublicProReply,PRO_FRAME_PROTOCOL} from './public-frame-dto.mjs';
import {emptyOverlay,planTransaction,registerProposal,overlayChanges,previewUndo,previewDelete,previewRemoveAIArtifacts,buildMergePlan,buildSplitPlan,buildSeriesPlan,buildCompensationPlan,legacyResolutionPlan,validateVersions} from '../domain/index.mjs';
import {exact,ids,id,uint} from '../domain/schema.mjs';
import {prepareMetadataEvidence} from '../evidence/metadata.mjs';
import {buildLaunchContext,nextSeriesEntry} from '../navigation/launch-context.mjs';
import {referenceInScope} from '../projection/project.mjs';
import {createFreeViewOwner} from '../../runtime/free-view-owner.mjs';
import {projectFreeFrame} from '../../runtime/free-frame-projection.mjs';
import {checkActivityVersionFence} from '../../data/activity-version-fence.mjs';
import {digest,stable} from '../../data/hash.mjs';
import {isCurrentNavigationPlan,isResolvedControlNavigationPlan} from '../../host/current-navigation-plan.mjs';
import {createURLPolicy} from '../../host/url-policy.mjs';

const clone=x=>structuredClone(x);
const modes=['native','pro-default-none','pro-cross-project'];
const result=(state,extra={})=>({kind:'pro-result',protocol:PRO_FRAME_PROTOCOL,state,...extra});
const transaction=(plan,operationId,expected,provenance='explicit-user-command')=>({operationId,actor:'human',provenance,base:clone(expected),planHash:plan.planHash,resultRevision:plan.state.revision,proposalId:null,inverse:plan.inverse,patch:plan.patch,inverseHash:plan.inverseHash,readSet:plan.readSet??[],status:'applied'});
const sourceScope=scope=>scope.kind==='browser-local'?scope.storage==='personal'?{kind:'browser-local-personal',key:scope.key,serverIdentity:'not-established',persistence:'same-idb',selectionRequired:true}:{kind:'browser-local-session',key:scope.key,serverIdentity:'not-established',persistence:'memory'}:{kind:'verified-scope',key:scope.key,serverIdentity:'established',persistence:'same-idb'};
const epochFor=grantId=>Number.parseInt(digest(grantId).slice(0,12),16);

/** Actual shared-owner composition. No synthetic owner, seed, provider, fetch,
 * database name or paid entitlement lookup is reachable from this module.
 * Every request enters the existing UI owner's current document/scope grant;
 * the ordinary Free prepared snapshot remains the only metadata source.
 */
export function createProductionProService({ui,repository,workspaceRepository,readService,views,prepareNavigation=null,currentNavigation=null,presentSurface=null,getEntitlement=()=> 'pro',modelProvider=null,now=Date.now,makeId=()=>crypto.randomUUID(),elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
  if(typeof ui?.withScope!=='function'||!repository||!workspaceRepository||!readService||!views)throw Error('pro-production-owner-required');
  const sessions=new Map(),transports=new WeakMap(),backupOwners=new Set(),notifications=new Set();
  let stopped=false,activeWork=0;
  const newId=prefix=>prefix+'_'+makeId().replaceAll('-','');
  // A development Pro build enables its manual feature set. A production
  // subscription owner can inject a synchronous, local entitlement snapshot;
  // loss of membership never adds a network prerequisite to Free or assets.
  const entitlement=c=>{
    let value;try{value=getEntitlement(c);}catch{return 'free';}
    if(value&&typeof value==='object'){try{Promise.prototype.then.call(value,()=>{},()=>{});}catch{}return 'free';}
    return ['pro','active'].includes(value)?value:'free';
  };
  const cleanupCommands=new Set(['DELETE_TOPIC','REMOVE_AI_ARTIFACTS','UNDO_TRANSACTION','APPLY_COMPENSATION_PLAN','REJECT_PROPOSAL','REMOVE_ALIAS']);
  const sessionKey=c=>JSON.stringify([c.scope.key,c.parentFrame.tabId,c.parentFrame.documentId]);
  function session(c){
    if(stopped||c.isCurrent()!==true)throw Error('pro-authority-expired');
    const key=sessionKey(c);let s=sessions.get(key);
    if(s&&s.scopeGrantId!==c.scopeGrantId){models.revoke(s.key);s.generation++;s.processing='off';s.autoRequested=false;s.backgroundWhileNative=false;s.incremental?.reset();s.previews.clear();s.previewState=null;s.batchCursor=null;s.scopeGrantId=c.scopeGrantId;s.epoch=epochFor(c.scopeGrantId);if(s.launch)s.launch={...s.launch,documentEpoch:s.epoch};}
    if(!s){
      if(sessions.size>=32)throw Error('pro-session-capacity');
      s={key,scopeKey:c.scope.key,tabId:c.parentFrame.tabId,documentId:c.parentFrame.documentId,scopeGrantId:c.scopeGrantId,epoch:epochFor(c.scopeGrantId),generation:0,mode:'native',selectedProjectIds:[],organizeMode:'pro-default-none',organizeProjectIds:[],backgroundWhileNative:false,incremental:createIncrementalTrigger({maxBatchSize:1}),segment:0,processing:'off',autoRequested:false,previews:new Map(),launch:null,uiDocuments:new Set()};sessions.set(key,s);
    }
    const t=transports.get(c);if(t)s.uiDocuments.add(t.sender.documentId);
    return s;
  }
  const authenticatedUi={withScope:(request,work)=>ui.withScope(request,c=>{transports.set(c,request);return work(c);})};
  const requestAlive=(c,guard,signal)=>!stopped&&!signal?.aborted&&guard()===true&&c.isCurrent()===true;

  async function owner(c,s,guard,signal,{independent=false,loadState=true,budgetFence=null,reviewOnly=false}={}){
    const generation=s.generation;
    const live=()=>requestAlive(c,guard,signal)&&sessions.get(s.key)===s&&s.scopeGrantId===c.scopeGrantId;
    const check=()=>{if(!live())throw Error('pro-authority-expired');};check();
    let freeOwner=null,source;
    if(!independent){try{source=views.resolveProView(c,transports.get(c)?.mountId);}catch{}}
    if(!source){
      freeOwner=createFreeViewOwner({readService,scope:c.scope,guard:live,clock:()=>new Date(now()).toISOString(),elapsedNow,schedule,cancel});
      try{const current=await freeOwner.refresh({pageSize:1000});source={current,isCurrent:()=>freeOwner.current()===current};}catch(e){freeOwner.stop();throw e;}
    }
    check();
    const prepared=source.current.snapshot,scope=sourceScope(c.scope),sourceRevision=prepared.revision;
    const evidenceRoot=Number(String(prepared.evidenceRevision).split(':').at(-1));
    if(prepared.scope!==scope.key||!Number.isSafeInteger(sourceRevision)||!Number.isSafeInteger(evidenceRoot)||evidenceRoot<0)throw Error('pro-source-revision-unavailable');
    // A source already expired at evaluation was projected as last-known or
    // UNKNOWN by Free. Any deadline that was live at that evaluation remains
    // a fence, even when it expired before this request reached the worker.
    const evaluatedAt=Date.parse(prepared.evaluatedAt);
    if(!Number.isFinite(evaluatedAt))throw Error('pro-source-evaluation-unavailable');
    const freshnessDeadlines=(prepared.calibrationDeadlines??[]).map(Date.parse).filter(x=>Number.isFinite(x)&&x>evaluatedAt);
    const sourceCurrent=()=>live()&&source.isCurrent()&&freshnessDeadlines.every(deadline=>now()<deadline);
    // Last-known names remain visible, but positive membership used for new
    // organization must still be current. UNKNOWN is never inferred as NONE.
    if(!Array.isArray(prepared.refs)||prepared.refs.length>20000)throw Error('pro-snapshot-capacity');
    const references=prepared.refs.map(r=>{
      const membershipCurrent=r.membershipFreshness==='current';
      const known=membershipCurrent&&['NONE','PROJECT'].includes(r.membership);
      const revision=prepared.manifest?.refVersions?.[r.id]??sourceRevision;
      return {id:r.id,nativeTitle:r.nativeTitle??'名称暂不可用',nativeUrl:r.nativeUrl??null,
        membership:known?{state:r.membership,...(r.membership==='PROJECT'?{projectId:r.projectId}:{}),evidenceId:'free_membership_'+digest([scope.key,sourceRevision,r.id,r.membership,r.projectId??null]),revision}:{state:'UNKNOWN',reason:membershipCurrent?'no-positive-membership':'membership-needs-revalidation',revision},
        available:r.available!==false&&typeof r.nativeUrl==='string',freshness:r.freshness==='current'&&membershipCurrent?'current':known?'last-known':'revalidation-needed',nativeRevision:revision,sourceIds:Object.keys(prepared.sourceAuthorities??{}).slice(0,32)};
    });
    const capabilities={scope,metadata:'available',positiveNone:references.some(r=>r.membership.state==='NONE')?'available':'unavailable',selectedText:'unavailable',sentUserInput:'unavailable',historicalCompleteness:'partial',reasonCodes:['shared-free-admitted-metadata','no-content-input','cloud-disabled',...(scope.persistence==='memory'?['session-preview-only']:[])]};
    let state=emptyOverlay(scope.key),records=[];
    // Whole-root CAS is stricter than per-item versions. Do not duplicate every
    // reference/topic into a model pack: that made 1,000 legitimate names exceed
    // its 32 KiB input boundary before any metadata could be considered.
    const versions=()=>({scopeKey:scope.key,authorizationEpoch:s.epoch,sourceGeneration:Object.fromEntries(Object.entries(prepared.sourceAuthorities??{}).slice(0,32).map(([key,value])=>[key,epochFor(value)])),nativeFields:{nativeRoot:sourceRevision,evidenceRoot,workspaceRoot:prepared.workspaceRevision??0},overlayRevision:state.revision,targets:{},constraintRevision:state.revision,policyVersion:'vaiwl-pro-production-r1/2',evidenceDigest:digest({references,sourceAuthorities:prepared.sourceAuthorities??{},viewSession:prepared.viewSession})});
    const snapshot=()=>({scope,scopeKey:scope.key,authorized:sourceCurrent(),references,versions:versions(),capabilities,projects:prepared.projects,activityDecisions:Object.fromEntries(prepared.refs.map(r=>[r.id,r.activityDecision])),viewSession:prepared.viewSession,partial:true});
    // This opaque object is usable only by this request closure. Copying any
    // scope/epoch/JSON value cannot reproduce it. It is never sent to a frame.
    const grant=Object.freeze({});
    const verifyGrant=g=>{if(g!==grant||!sourceCurrent()||generation!==s.generation)throw Error('pro-authority-expired');return scope;};
    const store=createSameDatabaseStore({connection:()=>repository.open(c.scope),enabled:true,verifyGrant,verifyInputFence(tx,unused,expected,checkTx,ready,fail){
      if(!sourceCurrent()||expected.authorizationEpoch!==s.epoch){fail('pro-authority-expired');return;}
      // Same transaction checks shared roots, not an asynchronously read claim.
      checkActivityVersionFence(tx,c.scope,{nativeRevision:expected.nativeFields.nativeRoot,evidenceRevision:expected.nativeFields.evidenceRoot},checkTx,()=>{
        const q=tx.objectStore('b23_states').get(c.scope.key);q.onsuccess=()=>{try{
          if(!checkTx())return;const row=q.result;
          if(row&&(row.key!==c.scope.key||row.checksum!==digest(row.payload)))throw Error('pro-shared-root-corrupt');
          if((row?.payload?.revision??0)!==expected.nativeFields.workspaceRoot)throw Error('pro-shared-root-changed');
          if(checkTx()){if(budgetFence)verifyModelBudgetFence(tx,budgetFence,checkTx,ready,fail,{now:new Date(now()).toISOString()});else ready();}
        }catch(e){fail(e.message);}};
      },fail);
    }});
    async function load(){check();if(scope.persistence==='same-idb'){const raw=await store.read(grant,signal);state=raw.state;records=raw.records;}else state=s.previewState??emptyOverlay(scope.key);check();}
    // Repair must be able to inspect a rejected overlay. It still obtains the
    // same live UI/source authority and transaction fence; skipping this read
    // never grants permission to interpret or replace damaged persisted bytes.
    try{if(loadState)await load();}catch(e){freeOwner?.stop();throw e;}
    function expected(publicValue){exact(publicValue,['scopeKey','authorizationEpoch','overlayRevision','reviewId']);const full=versions();if(stable(publicValue)!==stable(publicVersions(full)))throw Error('stale-pro-review');return full;}
    async function operation(operationId){id(operationId);return records.find(row=>row.transaction.operationId===operationId)??(scope.persistence==='same-idb'?await store.getOperation(grant,operationId,signal):null);}
    async function history(query){return scope.persistence==='same-idb'?store.readHistory(grant,{...query,visibleOnly:true},signal):{records:[],total:0,offset:0,hasMore:false};}
    async function replay(operationId,publicValue,fingerprint,{reviewInFingerprint=false}={}){
      id(operationId);exact(publicValue,['scopeKey','authorizationEpoch','overlayRevision','reviewId']);
      const prior=await operation(operationId);
      if(!prior)return null;
      const full=prior.transaction.base;
      if(!reviewInFingerprint&&stable(publicValue)!==stable(publicVersions(full)))throw Error('operation-replay-conflict');
      const originalFingerprint=fingerprint(full);
      if(prior.fingerprint!==digest(originalFingerprint))throw Error('operation-replay-conflict');
      // Retired review vectors can identify an existing receipt. They never
      // authorize new work: the store must find that same durable operation.
      const response=await store.transact(grant,{operationId,expected:full,fingerprint:originalFingerprint,execute(){throw Error('operation-replay-missing');}},signal);
      if(!response.ok||!response.replayed)throw Error(response.reason??'operation-replay-missing');
      return response;
    }
    function domainContext(operationId,full=versions(),current=state){return {actor:'human',operationId,snapshot:{...snapshot(),versions:full},expected:full,mode:s.mode,selectedProjectIds:s.selectedProjectIds,processingConsentCurrent:s.processing==='local'||s.processing==='cloud'&&models.approved(modelSession(c,s)),operations:Object.fromEntries(records.filter(r=>r.transaction.actor!=='system').map(r=>[r.transaction.operationId,r.transaction]))};}
    const modelMode=()=>s.mode==='native'&&s.backgroundWhileNative?s.organizeMode:s.mode;
    const modelProjects=()=>s.mode==='native'&&s.backgroundWhileNative?s.organizeProjectIds:s.selectedProjectIds;
    function eligibleModelReferences(){
      const excluded=new Set(Object.values(state.constraints).filter(r=>r.kind==='exclude-ai-processing').map(r=>r.refId));
      return references.filter(r=>r.available&&r.freshness==='current'&&!excluded.has(r.id)&&referenceInScope(r,modelMode(),modelProjects()));
    }
    const eligibleModelRefs=()=>eligibleModelReferences().map(r=>r.id);
    function nextBatch(processing=s.processing){
      const key=metadataBatchCursorKey({versions:versions(),mode:modelMode(),selectedProjectIds:modelProjects(),processing});
      return {...planMetadataBatch({references:eligibleModelReferences(),offset:s.batchCursor?.key===key?s.batchCursor.offset:0}),key};
    }
    function advanceBatch(batch){check();if(batch.key===metadataBatchCursorKey({versions:versions(),mode:modelMode(),selectedProjectIds:modelProjects(),processing:s.processing}))s.batchCursor={key:batch.key,offset:batch.nextOffset};}
    function preparePack(refIds=null,{preview=false}={}){
      if(!sourceCurrent()||entitlement(c)==='free'||s.processing==='off'&&!preview&&!reviewOnly||modelMode()==='native')throw Error('processing-consent-required');
      const ids=refIds??nextBatch().refIds,source=references.filter(r=>ids.includes(r.id)),bounded=source.map(r=>({...r,nativeTitle:r.nativeTitle.slice(0,400).replace(/[\uD800-\uDBFF]$/u,'')}));
      const pack=prepareMetadataEvidence({scope,capabilities,references:bounded,refIds:ids,versions:versions(),overlay:state,consent:{mode:preview?'local':reviewOnly?'cloud':s.processing,inputKinds:['metadata'],revision:s.generation},mode:modelMode(),selectedProjectIds:modelProjects()});
      if(source.some(r=>r.nativeTitle.length>400))pack.truncated=true;
      return pack;
    }
    async function registerSuggestions(proposals,full,operationId=newId('suggestions')){
      if(!proposals.length)return {ok:true,count:0};
      check();if(modelMode()==='native'||s.processing==='off'&&!reviewOnly||entitlement(c)==='free')throw Error('processing-consent-required');
      if(stable(full)!==stable(versions()))throw Error('stale-model-input');
      if(scope.persistence==='memory'){
        if(s.processing!=='local')throw Error('session-cloud-denied');
        for(const proposal of proposals)state=registerProposal(state,proposal,{currentVersions:full});
        s.previewState=state;return {ok:true,count:proposals.length};
      }
      const response=await store.transact(grant,{operationId,expected:full,fingerprint:{proposals,expected:full},execute(current){
        verifyGrant(grant);if(s.processing==='off'&&!reviewOnly||entitlement(c)==='free'||current.revision!==full.overlayRevision)throw Error('stale-model-input');
        let next=current;for(const p of proposals)next=registerProposal(next,p,{currentVersions:full});
        const patch=overlayChanges(current,next),readSet=[],inverse=[];
        return {state:next,transaction:{operationId,actor:'system',provenance:'proposal-registration',base:clone(full),planHash:digest({proposals,expected:full}),resultRevision:next.revision,proposalId:null,patch,inverse,readSet,inverseHash:digest({inverse,readSet}),status:'applied'}};
      }},signal);
      if(!response.ok)throw Error(response.reason);await load();notifications.add(scope.key);return {ok:true,count:proposals.length};
    }
    async function commit(command,full,operationId,preview=null,reviewFingerprint=null){
      check();id(operationId);validateVersions(full);if(scope.persistence!=='same-idb')throw Error('session-preview-only');
      if(s.mode==='native')throw Error('pro-mode-required');
      if(entitlement(c)==='free'&&!cleanupCommands.has(command.type))throw Error('pro-entitlement-required');
      if(command.type==='APPLY_LOW_RISK_PROPOSAL')throw Error('automation-disabled');
      const reviewedIds=command.type==='ACCEPT_PROPOSAL'?[command.proposalId]:command.type==='ACCEPT_PROPOSAL_BATCH'?(command.proposals??[]).map(p=>p.proposalId):[];
      if(reviewedIds.some(id=>state.proposals[id]&&proposalReviewUnavailable(state.proposals[id].proposal)))throw Error('pro-suggestion-needs-smaller-batch');
      if(['APPLY_SERIES_PLAN','APPLY_COMPENSATION_PLAN'].includes(command.type)&&!preview)throw Error('worker-preview-required');
      if(command.type==='UNDO_TRANSACTION'){
        const target=(await operation(command.targetOperationId))?.transaction;
        if(target?.patch.length>200&&preview?.kind!=='production-undo-review')throw Error('complete-operation-review-required');
      }
      const receipt=Object.freeze({}),receiptState={used:false,commandDigest:digest(command),expectedDigest:digest(full)};
      const historyOperationIds=command.type==='UNDO_TRANSACTION'?[command.targetOperationId]:command.type==='APPLY_COMPENSATION_PLAN'?[command.plan.sourceOperationId]:[];
      const response=await store.transact(grant,{operationId,expected:full,verifyCurrent:()=>entitlement(c)!=='free'||cleanupCommands.has(command.type),fingerprint:reviewFingerprint??{command,expected:full},...(historyOperationIds.length?{historyOperationIds}:{}),execute(current,history){
        verifyGrant(grant);if(receiptState.used||receiptState.commandDigest!==digest(command)||receiptState.expectedDigest!==digest(full))throw Error('pro-human-receipt-consumed');
        if(entitlement(c)==='free'&&!cleanupCommands.has(command.type))throw Error('pro-entitlement-required');
        // Only the serialized transaction can consume this one-use intent.
        receiptState.used=true;void receipt;
        if(current.revision!==full.overlayRevision)throw Error('overlay-revision-conflict');
        const ctx={...domainContext(operationId,full,current),operations:Object.fromEntries(history.filter(r=>r.transaction.actor!=='system').map(r=>[r.transaction.operationId,r.transaction]))};
        let working=current;
        if(preview?.proposal){working=registerProposal(current,preview.proposal);command={type:'ACCEPT_PROPOSAL',proposalId:preview.proposal.id,planHash:preview.proposal.planHash};}
        const plan=planTransaction(working,command,ctx);
        // Proposal registration and its accepted data effects share one write.
        if(working!==current)plan.patch=overlayChanges(current,plan.state);
        const op=transaction(plan,operationId,full,preview?'explicit-reviewed-structure':'explicit-user-command');
        if(command.proposalId)op.proposalId=command.proposalId;
        if(command.type==='ACCEPT_PROPOSAL_BATCH')op.proposalIds=command.proposals.map(p=>p.proposalId);
        return {state:plan.state,transaction:op,...(command.type==='UNDO_TRANSACTION'?{undoneOperationId:command.targetOperationId}:{})};
      }},signal);
      if(!response.ok)throw Error(response.reason);await load();return response;
    }
    async function applyAutomatic(input,automaticCurrent){
      const {proposal,versions:full,pack,quality,modelProfile,jobId}=input;
      check();if(scope.persistence!=='same-idb'||s.processing!=='cloud'||s.autoRequested!==true||!automaticCurrent())throw Error('automatic-policy-expired');
      const currentPack=preparePack(pack.references.map(r=>r.id));
      if(stable(currentPack)!==stable(pack)||stable(full)!==stable(versions()))throw Error('stale-model-input');
      const policy=await modelProvider.automation.policy(c,{context:{pack:currentPack,overlay:clone(state),currentVersions:versions(),mode:s.mode,processing:s.processing,foregroundBusy:false,backgroundWhileNative:s.backgroundWhileNative},profile:clone(modelProfile),signal});
      if(policy?.firstRun!==false||policy.autoRequested!==true||stable(policy.quality)!==stable(quality)||!automaticCurrent())throw Error('automatic-policy-expired');
      const operationId='auto_'+digest([jobId,proposal.id]),gateFor=current=>automaticGate(proposal,{overlay:current,pack:currentPack,quality,modelProfile,firstRun:false,autoRequested:true});
      if(!gateFor(state).eligible)throw Error('quality-gate-required');
      const response=await store.transact(grant,{operationId,expected:full,verifyCurrent:automaticCurrent,fingerprint:{proposalId:proposal.id,planHash:proposal.planHash,jobId,expected:full},execute(current){
        verifyGrant(grant);if(!automaticCurrent())throw Error('automatic-policy-expired');
        const saved=current.proposals[proposal.id];if(!saved||stable(saved.proposal)!==stable(proposal)||!gateFor(current).eligible)throw Error('automatic-proposal-changed');
        const ctx={...domainContext(operationId,full,current),mode:modelMode(),selectedProjectIds:modelProjects(),actor:'automation',firstRun:false,qualityGate:{existingTopic:true,related:true,newTopic:true,title:true}};
        const plan=planTransaction(current,{type:'APPLY_LOW_RISK_PROPOSAL',proposalId:proposal.id,planHash:proposal.planHash},ctx);
        return {state:plan.state,transaction:{...transaction(plan,operationId,full,'quality-approved-automatic'),actor:'automation',proposalId:proposal.id}};
      }},signal);
      if(!response.ok){if(response.committed)return {committed:true,operationId,reason:response.reason};throw Error(response.reason);}await load();notifications.add(scope.key);return {ok:true,operationId};
    }
    return {scope,store,grant,get state(){return state;},get records(){return records;},snapshot,versions,expected,replay,domainContext,commit,applyAutomatic,check,sourceCurrent,capabilities,preparePack,eligibleModelRefs,nextBatch,advanceBatch,registerSuggestions,operation,history,
      dispatchSnapshot(){return {versions:versions(),freshUntil:freshnessDeadlines.length?Math.min(...freshnessDeadlines):Infinity};},
      writeCurrent(){return sourceCurrent()&&generation===s.generation;},
      native(query={}){return projectFreeFrame(source.current,{role:c.role??'workspace',segment:query.segment??s.segment,offset:0,limit:1,rowLimit:5});},
      status(){
        let launchContext=s.launch;
        if(launchContext){
          const series=state.series[launchContext.seriesId],next=series&&series.topicId===launchContext.topicId?nextSeriesEntry(series,launchContext.referenceId):null;
          const target=references.find(r=>r.id===next),placed=next&&Object.values(state.placements).some(p=>p.topicId===series.topicId&&p.conversationId===next&&p.state==='included');
          const nextReferenceId=placed&&target?.available&&state.topics[series.topicId]?.lifecycle==='active'&&referenceInScope(target,s.mode,s.selectedProjectIds,capabilities)?next:null;
          launchContext={...launchContext,nextReferenceId};
        }
        return {authorized:sourceCurrent(),entitlement:entitlement(c),processingMode:entitlement(c)==='free'?'off':s.processing,modelAvailability:models.configured?'configured-provider':'local-rules',cloudBudget:0,positiveNone:capabilities.positiveNone,persistence:scope.persistence==='same-idb'?'same-idb':'memory-only',mode:s.mode,selectedProjectIds:s.selectedProjectIds,segment:s.segment,launchContext};
      },
      close(){freeOwner?.stop();}
    };
  }

  function modelSession(c,s,{reviewOnly=false}={}){const generation=s.generation,scopeGrantId=s.scopeGrantId;return {key:s.key,context:c,scope:sourceScope(c.scope),reviewOnly,live:()=>!stopped&&sessions.get(s.key)===s&&s.generation===generation&&s.scopeGrantId===scopeGrantId&&c.isCurrent()===true,canRun:()=>entitlement(c)!=='free',autoRequested:()=>!reviewOnly&&s.autoRequested===true,backgroundWhileNative:()=>s.backgroundWhileNative===true,generation};}
  const models=createProductionModelBridge({provider:modelProvider,connection:c=>repository.open(c.scope),dispatchFence:productionModelDispatchFence,now,notify,
    async context(session,{signal,phase,refIds},live){
      const s=sessions.get(session.key),o=await owner(session.context,s,live,signal,{independent:true,reviewOnly:session.reviewOnly});
      try{const pack=['status','cancel','recover'].includes(phase)?{scope:o.scope,versions:o.versions(),metadata:[],references:[]}:o.preparePack(refIds,{preview:phase==='preview'});const dispatch=o.dispatchSnapshot();session.dispatchVersions=dispatch.versions;session.dispatchCurrent=()=>session.live()&&now()<dispatch.freshUntil;return {pack,overlay:clone(o.state),currentVersions:o.versions(),mode:s.mode,processing:session.reviewOnly?'cloud':s.processing,foregroundBusy:false,backgroundWhileNative:s.backgroundWhileNative};}finally{o.close();}
    },
    async register(session,{proposals,versions,jobId,budgetFence},signal,live){
      if(!budgetFence)throw Error('model-budget-fence-required');
      const s=sessions.get(session.key),o=await owner(session.context,s,live,signal,{independent:true,budgetFence,reviewOnly:session.reviewOnly});
      try{const r=await o.registerSuggestions(proposals,versions,'suggest_'+digest(jobId));notify(session.scope.key);return r;}finally{o.close();}
    },
    async applyAutomatic(session,input,signal,live){
      if(!input.budgetFence)throw Error('model-budget-fence-required');
      const s=sessions.get(session.key),o=await owner(session.context,s,live,signal,{independent:true,budgetFence:input.budgetFence});
      try{const r=await o.applyAutomatic(input,live);notify(session.scope.key);return r;}finally{o.close();}
    },
    async getProposalReceipt(session,{jobId,proposalId},signal,live){
      const s=sessions.get(session.key),o=await owner(session.context,s,live,signal,{independent:true});
      try{
        const registration=(await o.operation('suggest_'+digest(jobId)))?.transaction;
        if(registration?.actor!=='system'||registration.provenance!=='proposal-registration')return null;
        const registeredProposalIds=registration.patch.filter(p=>p.kind==='proposal-record'&&!p.before&&p.after?.proposal).map(p=>p.after.proposal.id);
        if(registeredProposalIds.length>40||!registeredProposalIds.includes(proposalId))return null;
        for(const actualId of registeredProposalIds){
          const saved=o.state.proposals[actualId];if(!saved||!['applied','rejected'].includes(saved.state)||!saved.appliedOperationId)continue;
          const operation=(await o.operation(saved.appliedOperationId))?.transaction;
          if(!operation||!['applied','undone'].includes(operation.status)||!['human','automation'].includes(operation.actor)||operation.proposalId!==actualId&&!operation.proposalIds?.includes(actualId))continue;
          return {committed:true,operationId:operation.operationId,proposalId:actualId,registeredProposalIds};
        }
        return null;
      }finally{o.close();}
    }
  });
  function setMode(s,p,snapshot){
    if(!modes.includes(p.mode))throw Error('invalid-pro-mode');ids(p.selectedProjectIds??[],100);
    const selected=p.selectedProjectIds??[];
    if(p.mode==='pro-cross-project'&&(!selected.length||selected.some(id=>!snapshot.projects.some(p=>p.id===id))))throw Error('explicit-project-scope-required');
    const projectIds=p.mode==='pro-cross-project'?selected:[],changed=s.mode!==p.mode||stable(s.selectedProjectIds)!==stable(projectIds);
    // Explicit native-view continuation retains exactly the earlier approved
    // organization scope. Selecting another Pro scope always needs new consent.
    const continueApproved=s.backgroundWhileNative&&s.processing==='cloud'&&(p.mode==='native'||s.mode==='native'&&p.mode===s.organizeMode&&stable(projectIds)===stable(s.organizeProjectIds));
    if(changed&&!continueApproved){models.revoke(s.key);s.generation++;s.processing='off';s.autoRequested=false;s.backgroundWhileNative=false;s.incremental?.reset();s.previews.clear();s.previewState=null;s.batchCursor=null;}
    s.mode=p.mode;s.selectedProjectIds=[...projectIds];s.segment=0;
    if(p.mode!=='native'){s.organizeMode=p.mode;s.organizeProjectIds=[...projectIds];}
  }
  function prunePreviews(s){for(const [id,p]of s.previews)if(elapsedNow()>=p.until)s.previews.delete(id);}
  async function invoke({action,payload:p,context:c,guard,signal}){
    activeWork++;let o;
    try{
      const s=session(c);
      if(action==='navigation'&&p.op==='return'){
        exact(p,['op']);if(typeof presentSurface!=='function')throw Error('pro-navigation-unavailable');
        const launch=s.launch,shown=await presentSurface({parentFrame:c.parentFrame,binding:c.binding,mode:'workspace'});
        // Returning is a live UI action, not a metadata mutation. Free's own
        // four-grid entry may replace its prepared view while this awaits.
        if(!requestAlive(c,guard,signal)||sessions.get(s.key)!==s||s.scopeGrantId!==c.scopeGrantId||shown?.ok===false)throw Error('pro-navigation-unavailable');
        if(s.launch===launch)s.launch=null;notifications.add(c.scope.key);
        return {ok:true,value:result('returned',{anchor:launch?.returnAnchor??null})};
      }
      if(action==='commit'&&['recovery-preview','recovery-apply'].includes(p.op)){
        exact(p,p.op==='recovery-preview'?['op']:['op','previewId','operationId']);
        o=await owner(c,s,guard,signal,{loadState:false});
        if(o.scope.persistence!=='same-idb')return {ok:true,value:result('unavailable',{message:'当前空间尚未解锁持久资料，请先通过扩展状态页确认本地绑定。'})};
        if(p.op==='recovery-preview'){
          const full=o.versions();let plan;
          try{plan=await o.store.previewRecovery(o.grant,{expected:full},signal);}
          catch(e){
            o.check();
            if(e.message==='pro-recovery-no-history'||e.message==='pro-recovery-not-needed')return {ok:true,value:result('unavailable',{message:'当前没有需要恢复的 Pro 数据。已有资料保持原样。'})};
            if(/^pro-recovery-|^pro-(?:record|journal|root|overlay|missing|codec|inverse|readset)/u.test(e.message))return {ok:true,value:result('unavailable',{message:'现有记录无法完整证明一个安全的恢复结果。资料与原始记录已保留；本次检查没有修改数据。'})};
            throw e;
          }
          o.check();if(!o.writeCurrent())throw Error('pro-authority-expired');prunePreviews(s);if(s.previews.size>=64)throw Error('pro-preview-capacity');
          const previewId=newId('recovery'),counts=plan.counts;
          s.previews.set(previewId,{kind:'recovery',preview:plan,expected:full,until:elapsedNow()+300000});
          return {ok:true,value:projectPublicPreview({previewId,preview:{state:'ready',summary:`完整事务记录可恢复 ${counts.topics} 个主题、${counts.placements} 条关系、${counts.titles} 个整理名称和 ${counts.series} 条工作线。确认后保留被替换的原始记录，模型处理保持关闭；聊天归属与访问权限仍需当前宿主重新确认。`}})};
        }
        id(p.previewId);id(p.operationId);
        const fingerprint={kind:'overlay-recovery',previewId:p.previewId};
        let repaired=await o.store.reconcileRecovery(o.grant,{operationId:p.operationId,requestFingerprint:fingerprint},signal);
        if(!repaired){
          prunePreviews(s);const entry=s.previews.get(p.previewId);
          if(entry?.kind!=='recovery'||stable(entry.expected)!==stable(o.versions()))throw Error('stale-pro-preview');
          // One current session consumes the explicit review. Lost replies use
          // the exact durable repair receipt, never a reconstructed permission.
          s.previews.delete(p.previewId);
          repaired=await o.store.recover(o.grant,{operationId:p.operationId,expected:entry.expected,planHash:entry.preview.planHash,requestFingerprint:fingerprint},signal);
        }
        if(!repaired.ok)throw Error(repaired.reason);
        o.check();s.generation++;s.processing='off';s.autoRequested=false;s.backgroundWhileNative=false;s.incremental?.reset();s.previews.clear();s.launch=null;notifications.add(c.scope.key);
        return {ok:true,value:result('applied',{operationId:p.operationId,replayed:repaired.replayed===true,message:repaired.replayed===true?'已确认此前的恢复操作完成，本次没有再次修改资料。请重新进入 Pro 核对当前资料；模型处理保持关闭。':'Pro 数据已从完整事务记录恢复，原始记录已保留。请重新进入 Pro 核对资料；模型处理保持关闭。'})};
      }
      o=await owner(c,s,guard,signal);const snap=()=>o.snapshot();let value;
      if(action==='view'||action==='sharedSnapshot'){
        if(action==='sharedSnapshot'){exact(p,['op']);if(p.op!=='status')throw Error('invalid-pro-request');value={kind:'pro-status',protocol:PRO_FRAME_PROTOCOL,status:publicStatus(o.status())};}
        else if(p.op==='page'){
          exact(p,['op','mode','selectedProjectIds','segment','offset','limit','rowLimit'],['inventoryOffsets']);
          if(p.mode!==s.mode||stable(p.selectedProjectIds)!==stable(s.selectedProjectIds))throw Error('pro-mode-changed');uint(p.segment);s.segment=p.segment;
          value=projectPublicPage({state:o.state,snapshot:snap(),view:{mode:s.mode,native:o.native(p)},status:o.status(),query:p});
        }else if(p.op==='panel'){
          exact(p,['op','kind','id','offset','limit']);const recordWindow=p.kind==='records'?await o.history({offset:p.offset,limit:Math.min(p.limit,24)}):null;value=projectPublicPanel({state:o.state,snapshot:snap(),status:o.status(),kind:p.kind,id:p.id,offset:p.offset,limit:p.limit,records:o.records,recordWindow});
        }else if(p.op==='aliases'){
          exact(p,['op','targetKind','targetId','offset','limit']);id(p.targetId);uint(p.offset);uint(p.limit);if(!['topic','title'].includes(p.targetKind)||p.limit<1||p.limit>24)throw Error('invalid-alias-query');
          const target=p.targetKind==='topic'?o.state.topics[p.targetId]:o.state.titles[p.targetId];if(!target)throw Error('alias-target-unavailable');
          const all=target.aliases??[],offset=all.length?Math.min(p.offset,Math.floor((all.length-1)/p.limit)*p.limit):0,aliases=all.slice(offset,offset+p.limit);
          value={kind:'pro-alias-page',protocol:PRO_FRAME_PROTOCOL,versions:publicVersions(o.versions()),targetKind:p.targetKind,targetId:p.targetId,aliases,page:{offset,total:all.length,count:aliases.length,limit:p.limit,hasMore:offset+aliases.length<all.length}};
        }else if(p.op==='rows'){
          exact(p,['op','topicId','lane','offset','limit']);value=projectPublicRows({state:o.state,snapshot:snap(),status:o.status(),topicId:p.topicId,lane:p.lane,offset:p.offset,limit:p.limit});
        }else if(p.op==='search'){
          exact(p,['op','query','topicId','limit'],['offset']);value=projectPublicSearch({state:o.state,snapshot:snap(),status:o.status(),query:p.query,topicId:p.topicId,offset:p.offset??0,limit:p.limit});
        }else if(p.op==='operation-review'){
          exact(p,['op','previewId','offset','limit','expected']);id(p.previewId);uint(p.offset);
          const full=o.expected(p.expected);prunePreviews(s);const entry=s.previews.get(p.previewId);
          if(entry?.kind!=='undo-review'||!o.writeCurrent()||stable(entry.expected)!==stable(full)||p.offset>entry.reviewNext)throw Error('stale-pro-preview');
          const operation=(await o.operation(entry.operationId))?.transaction;
          value=projectPublicOperationReview({operation,state:o.state,snapshot:snap(),previewId:p.previewId,offset:p.offset,limit:p.limit});
          if(value.page.total!==entry.reviewTotal)throw Error('stale-pro-preview');
          entry.reviewNext=Math.max(entry.reviewNext,value.page.offset+value.page.count);
        }else throw Error('invalid-pro-view');
      }else if(action==='background'){
        if(p.op==='mode'){exact(p,['op','mode','selectedProjectIds']);setMode(s,p,snap());}
        else if(p.op==='processing'){exact(p,['op','mode']);if(!['off','local'].includes(p.mode)||s.mode==='native'||p.mode!=='off'&&entitlement(c)==='free')throw Error('processing-unavailable');models.revoke(s.key);s.generation++;s.processing=p.mode;s.autoRequested=false;s.backgroundWhileNative=false;s.incremental?.reset();s.previews.clear();s.previewState=null;s.batchCursor=null;}
        else if(p.op==='model-budget'){
          exact(p,['op']);const settings=await models.budgetSettings(modelSession(c,s),signal);o.check();
          value={kind:'pro-model-budget',protocol:PRO_FRAME_PROTOCOL,versions:publicVersions(o.versions()),settings};
        }else if(p.op==='model-budget-preview'){
          exact(p,['op','limits','expected']);exact(p.limits,['taskMicros','dayMicros','monthMicros']);for(const amount of Object.values(p.limits))uint(amount);
          const full=o.expected(p.expected);if(entitlement(c)==='free'||o.scope.persistence!=='same-idb'||!o.writeCurrent())throw Error('model-budget-unavailable');
          const settings=await models.budgetSettings(modelSession(c,s),signal);o.check();
          if(!o.writeCurrent()||!settings.configured||p.limits.taskMicros>settings.taskMaximumMicros)throw Error('model-budget-unavailable');
          prunePreviews(s);if(s.previews.size>=64)throw Error('pro-preview-capacity');const previewId=newId('budget_review');
          s.previews.set(previewId,{kind:'model-budget',expected:full,budgetRevision:settings.revision,limits:clone(p.limits),until:elapsedNow()+300000});
          value={kind:'pro-model-budget-preview',protocol:PRO_FRAME_PROTOCOL,previewId,expected:publicVersions(full),budgetRevision:settings.revision,currency:settings.currency,priceCardVersion:settings.priceCardVersion,taskMaximumMicros:settings.taskMaximumMicros,before:settings.limits,after:clone(p.limits)};
        }else if(p.op==='model-budget-apply'){
          exact(p,['op','previewId','expected']);id(p.previewId);const full=o.expected(p.expected);prunePreviews(s);const review=s.previews.get(p.previewId);
          if(!['model-budget','model-budget-applied'].includes(review?.kind)||stable(review.expected)!==stable(full)||o.scope.persistence!=='same-idb'||!o.writeCurrent())throw Error('model-budget-preview-expired');
          if(review.kind==='model-budget-applied'){value=result('applied',{operationId:p.previewId,replayed:true,message:'已确认此前额度设置完成，本次没有再次修改额度。'});}
          else{
          if(entitlement(c)==='free')throw Error('model-budget-unavailable');
          s.previews.delete(p.previewId);
          const settings=await models.configureBudget(modelSession(c,s),{limits:review.limits,expectedRevision:review.budgetRevision,operationId:p.previewId},signal);o.check();
          // The payer is installation-wide. A changed budget cannot leave a
          // different tab/scope holding earlier cloud consent or an in-flight
          // automatic task; settled/unknown charges remain in the ledger.
          for(const liveSession of sessions.values()){models.revoke(liveSession.key);liveSession.generation++;liveSession.processing='off';liveSession.autoRequested=false;liveSession.backgroundWhileNative=false;liveSession.incremental?.reset();liveSession.previews.clear();liveSession.previewState=null;liveSession.batchCursor=null;notifications.add(liveSession.scopeKey);}
          s.previews.set(p.previewId,{kind:'model-budget-applied',expected:full,until:elapsedNow()+300000});
          value={kind:'pro-model-budget',protocol:PRO_FRAME_PROTOCOL,versions:publicVersions(o.versions()),settings};
          }
        }
        else if(p.op==='model-preview'){
          exact(p,['op','expected'],['refIds','reviewOnly']);if(p.reviewOnly!==undefined&&typeof p.reviewOnly!=='boolean'||p.refIds!==undefined&&p.reviewOnly!==true)throw Error('explicit-model-review-required');
          const reviewOnly=p.reviewOnly===true,full=o.expected(p.expected),batch=o.nextBatch('cloud'),refIds=reviewOnly?p.refIds:batch.refIds;
          if(reviewOnly){ids(refIds,10);if(!refIds.length||refIds.some(refId=>!o.eligibleModelRefs().includes(refId)))throw Error('model-review-reference-unavailable');}
          const preview=await models.preview(modelSession(c,s,{reviewOnly}),{signal,refIds,reviewOnly});o.check();if(!o.writeCurrent()||stable(preview.versions)!==stable(full))throw Error('stale-model-input');
          prunePreviews(s);if(s.previews.size>=64)throw Error('pro-preview-capacity');const previewId=newId('model_review');
          s.previews.set(previewId,{kind:'model-consent',expected:full,reviewOnly,refIds:[...refIds],budgetFence:preview.budgetFence,automaticAvailable:!reviewOnly&&preview.automaticAvailable===true,withinTaskBudget:preview.withinBudget===true,until:elapsedNow()+300000});
          value={kind:'pro-model-preview',protocol:PRO_FRAME_PROTOCOL,previewId,expected:publicVersions(full),provider:preview.disclosure.provider,model:preview.configuration.model,inputKinds:['metadata'],sample:preview.payload.items.slice(0,3).map(item=>({title:item.approvedTitle,aliases:item.approvedAliases.slice(0,2)})),sampleTotal:preview.payload.items.length,topicNames:preview.payload.candidateTopics.slice(0,3).map(item=>item.approvedName),topicTotal:preview.payload.candidateTopics.length,currency:preview.estimate.currency,maximumMicros:preview.estimate.maximumMicros,taskLimitMicros:preview.maxChargePerTaskMicros,policyVersion:preview.disclosure.policyVersion,policyUrl:preview.disclosure.policyUrl,retentionText:preview.disclosure.retentionText,truncated:preview.truncated,automaticAvailable:!reviewOnly&&preview.automaticAvailable===true,reviewOnly,withinBudget:preview.withinBudget===true};
        }else if(p.op==='model-enable'){
          exact(p,['op','previewId','expected'],['automatic','backgroundWhileNative']);id(p.previewId);if(['automatic','backgroundWhileNative'].some(k=>p[k]!==undefined&&typeof p[k]!=='boolean'))throw Error('invalid-automatic-preference');const full=o.expected(p.expected);prunePreviews(s);const review=s.previews.get(p.previewId);
          if(review?.kind!=='model-consent'||review.reviewOnly||review.withinTaskBudget!==true||p.automatic===true&&review.automaticAvailable!==true||stable(review.expected)!==stable(full)||!models.approved(modelSession(c,s))||o.scope.persistence!=='same-idb'||!o.writeCurrent())throw Error('model-consent-preview-expired');
          await models.validateBudgetReview(modelSession(c,s),review.budgetFence,signal);o.check();if(!o.writeCurrent()||!models.approved(modelSession(c,s)))throw Error('model-consent-preview-expired');
          const initialRefs=o.eligibleModelRefs(),knownRefIds=o.snapshot().references.map(r=>r.id);if(p.automatic===true&&knownRefIds.length>20000)throw Error('pro-suggestion-needs-smaller-batch');
          models.revoke(s.key);s.generation++;s.processing='cloud';s.autoRequested=p.automatic===true;s.backgroundWhileNative=p.backgroundWhileNative===true;s.organizeMode=s.mode;s.organizeProjectIds=[...s.selectedProjectIds];s.incremental.reset();if(s.autoRequested)s.incremental.seed(initialRefs,digest(full),{knownRefIds});s.previews.clear();s.previewState=null;s.batchCursor=null;
        }else if(p.op==='model-review-start'){
          exact(p,['op','previewId','expected']);id(p.previewId);const full=o.expected(p.expected);prunePreviews(s);const review=s.previews.get(p.previewId),selected=modelSession(c,s,{reviewOnly:true});
          if(review?.kind!=='model-consent'||review.reviewOnly!==true||review.withinTaskBudget!==true||stable(review.expected)!==stable(full)||!models.approved(selected)||o.scope.persistence!=='same-idb'||!o.writeCurrent())throw Error('model-consent-preview-expired');
          await models.validateBudgetReview(selected,review.budgetFence,signal);o.check();if(!o.writeCurrent()||!models.approved(selected))throw Error('model-consent-preview-expired');
          if(models.running(s.key))value=result('unavailable',{message:'当前仍有整理任务。结束或完成后，可重新预览这条聊天的精细复核。'});
          else{s.previews.delete(p.previewId);value=result('registered',models.start(selected,{refIds:review.refIds,reviewOnly:true}));}
        }
        else if(p.op==='status')exact(p,['op']);
        else if(['model-status','model-cancel','model-recover'].includes(p.op)){
          exact(p,p.op==='model-cancel'?['op','jobId']:['op'],p.op==='model-status'?['offset','limit']:[]);if(p.op==='model-cancel')id(p.jobId);
          const session=modelSession(c,s),model=p.op==='model-status'?await models.status(session,signal,{offset:p.offset??0,limit:p.limit??20}):p.op==='model-cancel'?await models.cancel(session,p.jobId,signal):await models.recover(session,signal);
          value={kind:'pro-model-status',protocol:PRO_FRAME_PROTOCOL,model};
        }
        else throw Error('paid-or-durable-background-disabled');
        value??={kind:'pro-status',protocol:PRO_FRAME_PROTOCOL,status:publicStatus(o.status())};
      }else if(action==='evidence'){
        exact(p,['op','expected']);if(p.op!=='suggest')throw Error('content-capability-unavailable');o.expected(p.expected);
        if(!['local','cloud'].includes(s.processing)||s.mode==='native'||entitlement(c)==='free')throw Error('processing-consent-required');
        const batch=o.nextBatch(),batchMessage=` 本轮已核对 ${batch.nextOffset}/${batch.total} 条可整理聊天。${batch.hasMore?'可再次点击继续下一批。':'当前范围已核对完；来源或人工设置变化后可重新核对。'}`;
        if(!batch.refIds.length)value=result('unchanged',{message:batch.total?'当前范围已全部核对。来源或人工设置变化后可重新核对。':'当前没有已确认且获准整理的聊天。可继续人工整理。'});
        else if(s.processing==='cloud'){const running=models.running(s.key);value=result('registered',models.start(modelSession(c,s),{refIds:batch.refIds,batchMessage}));if(!running&&value.state==='registered')o.advanceBatch(batch);}
        else{
          const pack=o.preparePack(batch.refIds),planned=await runLocalMetadataSuggestions({pack,overlay:o.state,currentVersions:o.versions(),signal,firstRun:true});
          o.check();const fresh=planned.proposals.filter(proposal=>!Object.hasOwn(o.state.proposals,proposal.id));
          await o.registerSuggestions(fresh,pack.versions);o.advanceBatch(batch);
          value=result(fresh.length?'ready':'unchanged',{message:(o.scope.persistence==='memory'?'这是当前会话的临时本地预览，不会写入资产。':fresh.length?'已生成本地规则建议，请逐项核对后应用。没有读取正文或调用云模型。':'本次没有新的明确建议。可继续人工整理。')+batchMessage});
        }
      }else if(action==='commit'){
        if(p.op==='dispatch'){
          exact(p,['op','command','expected','operationId']);const command=clone(p.command),replayed=await o.replay(p.operationId,p.expected,full=>({command,expected:full}));
          const r=replayed??await o.commit(command,o.expected(p.expected),p.operationId);value=result('applied',{operationId:p.operationId,replayed:r.replayed===true});
        }else if(p.op==='preview'){
          exact(p,['op','kind','input','expected']);const full=o.expected(p.expected),ctx=o.domainContext(newId('preview'),full);let preview,review=null;
          if(!o.writeCurrent())throw Error('pro-authority-expired');
          const operation=async id=>{const r=await o.operation(id);if(!r)throw Error('missing-operation');return r.transaction;};
          switch(p.kind){
            case 'undo':{exact(p.input,['operationId']);const target=await operation(p.input.operationId);if(target.patch.length>200)throw Error('complete-operation-review-required');preview=previewUndo(o.state,target);delete preview.inverse;break;}
            case 'undo-review':{
              exact(p.input,['operationId']);const target=await operation(p.input.operationId);
              preview={...previewUndo(o.state,target),summary:`此操作共有 ${target.patch.length} 处变化。逐页核对完整列表后，再确认一次性撤销整笔操作。`};
              delete preview.inverse;
              review={operationId:target.operationId,reviewNext:0,reviewTotal:target.patch.length};break;
            }
            case 'delete':exact(p.input,['topicId']);preview=previewDelete(o.state,p.input.topicId,ctx);break;
            case 'remove-ai':exact(p.input,['refIds']);preview=previewRemoveAIArtifacts(o.state,p.input.refIds,ctx);break;
            case 'compensation':exact(p.input,['operationId','restoreKeys']);preview=buildCompensationPlan(o.state,await operation(p.input.operationId),p.input.restoreKeys,ctx);break;
            case 'merge':preview=buildMergePlan(o.state,p.input,ctx);break;
            case 'split':preview=buildSplitPlan(o.state,p.input,ctx);break;
            case 'series':{const input={seriesId:null,...p.input,expected:full};preview=buildSeriesPlan(input,{knownRefs:snap().references.map(r=>r.id),topicId:input.topicId,currentSeries:input.seriesId?o.state.series[input.seriesId]??null:null,versions:full});break;}
            case 'series-edit':preview=buildSeriesEditPlan(p.input,{state:o.state,snapshot:snap(),expected:full});break;
            case 'legacy-primary':exact(p.input,['refId','chosenPrimary']);preview=legacyResolutionPlan(o.state,p.input.refId,p.input.chosenPrimary,ctx);break;
            case 'legacy-upgrade':{
              exact(p.input,[]);
              if(o.scope.persistence!=='same-idb'||s.mode==='native')throw Error('pro-mode-required');
              if(['topics','titles','placements','constraints','series','redirects','tombstones','presentation','legacyResolutions','proposals'].some(table=>Object.keys(o.state[table]).length)){
                value=result('unavailable',{message:'当前已有 Pro 整理资料，无法在此覆盖升级。你可以先导出备份，再检查数据。'});break;
              }
              const migration=await backupRepository.previewLegacyMigration(c.scope,{guard:()=>guard()&&o.writeCurrent(),signal,ownerContext:c});
              const counts=migration.legacyCounts;
              if(!counts||!counts.topics&&!counts.placements&&!counts.titles){value=result('unavailable',{message:'当前空间没有需要升级的旧版整理资料。'});break;}
              preview={kind:'legacy-upgrade-plan',...migration,state:'ready',summary:`升级 ${counts.topics} 个主题、${counts.placements} 条关系、${counts.titles} 个整理名称；保留原 ID、顺序与人工保护。${counts.ambiguous} 条多重关系等待你明确选择主主题。原共享资料保留，模型处理保持关闭。`};break;
            }
            default:throw Error('invalid-pro-preview');
          }
          if(!value){
            if(!o.writeCurrent())throw Error('pro-authority-expired');
            prunePreviews(s);if(s.previews.size>=64)throw Error('pro-preview-capacity');const previewId=newId('review');
            s.previews.set(previewId,{preview,kind:p.kind,expected:full,until:elapsedNow()+300000,...review});
            const displayed=review?clone(preview):preview;if(review)delete displayed.inverseHash;
            value=projectPublicPreview({preview:displayed,previewId,state:o.state,snapshot:snap()});
          }
        }else if(p.op==='apply-structure'){
          exact(p,['op','previewId','expected','operationId']);id(p.previewId);
          const legacyFingerprint={kind:'legacy-upgrade',previewId:p.previewId,review:clone(p.expected)};
          const prior=await o.operation(p.operationId),legacyReplay=prior?.transaction.provenance==='explicit-legacy-migration';
          const fingerprint=full=>({kind:'reviewed-structure',previewId:p.previewId,expected:full}),replayed=await o.replay(p.operationId,p.expected,legacyReplay?()=>legacyFingerprint:fingerprint,{reviewInFingerprint:legacyReplay});
          if(replayed){value=result('applied',{operationId:p.operationId,replayed:true});}
          else{
          const full=o.expected(p.expected);prunePreviews(s);const entry=s.previews.get(p.previewId);
          if(!entry||stable(entry.expected)!==stable(full)||entry.preview.conflicts?.length)throw Error('stale-pro-preview');
          if(entry.kind==='undo-review'&&(entry.preview.state!=='ready'||entry.reviewNext!==entry.reviewTotal))throw Error('complete-operation-review-required');
          // Consume before async work. A lost reply is reconciled by operation
          // history; it never authorizes a second native/model action.
          s.previews.delete(p.previewId);const pv=entry.preview;
          if(entry.kind==='legacy-upgrade'){
            if(s.mode==='native'||!o.writeCurrent())throw Error('pro-mode-required');
            const r=await backupRepository.migrateLegacy(c.scope,{operationId:p.operationId,planHash:pv.planHash,expectedRevision:pv.expectedRevision,requestFingerprint:legacyFingerprint},{guard:()=>guard()&&o.writeCurrent(),signal,ownerContext:c});
            if(!r.ok)throw Error(r.reason);value=result('applied',{operationId:p.operationId,replayed:r.replayed===true});
          }else{
          const command=entry.kind==='undo-review'?{type:'UNDO_TRANSACTION',targetOperationId:entry.operationId,reviewedInverseHash:pv.inverseHash}:['series','series-edit'].includes(entry.kind)?{type:'APPLY_SERIES_PLAN',plan:pv}:entry.kind==='compensation'?{type:'APPLY_COMPENSATION_PLAN',plan:pv}:pv.proposal?{type:'ACCEPT_PROPOSAL',proposalId:pv.proposal.id,planHash:pv.proposal.planHash}:null;
          if(!command)throw Error('invalid-pro-structure');const r=await o.commit(command,full,p.operationId,entry.kind==='undo-review'?{kind:'production-undo-review'}:pv,fingerprint(full));value=result('applied',{operationId:p.operationId,replayed:r.replayed===true});
          }
          }
        }else throw Error('invalid-pro-commit');
      }else if(action==='navigation'){
        const t=transports.get(c);
        if(p.op==='open'){
          exact(p,['op','refId','options']);exact(p.options,[],['topicId','seriesId','origin','nativeProjectId','returnAnchor']);
          const launch=buildLaunchContext({id:newId('launch'),referenceId:p.refId,sourceMode:s.mode,...p.options},{state:o.state,snapshot:snap(),session:snap().viewSession,documentEpoch:s.epoch,selectedProjectIds:s.selectedProjectIds});
          const ref=snap().references.find(r=>r.id===p.refId);if(!prepareNavigation||!t)throw Error('pro-navigation-unavailable');
          const plans=await prepareNavigation({parentFrame:c.parentFrame,binding:c.binding,targets:[{refId:ref.id,navigationURL:ref.nativeUrl}]});o.check();
          if(!Array.isArray(plans)||plans.length!==1)throw Error('pro-navigation-unavailable');const row=plans[0],plan=row.plan,policy=createURLPolicy({origin:new URL(c.parentFrame.actualURL).origin});
          const route=policy.parse(ref.nativeUrl);
          if(row.refId!==ref.id||plan?.target?.kind!=='resolved'||plan.target.entity!=='conversation'||plan.target.nativeId!==ref.id||plan.target.navigationURL!==ref.nativeUrl||route.kind!=='conversation'||route.conversationId!==ref.id)throw Error('pro-navigation-native-entry-required');
          if(plan.mode==='href'){
            exact(plan,['mode','target','disposition','planRevision']);exact(plan.target,['kind','entity','nativeId','navigationURL','liveHandle']);uint(plan.planRevision);
            if(plan.planRevision<1||plan.target.liveHandle!==null||plan.disposition!=='new-tab-preserve-current')throw Error('pro-navigation-native-entry-required');
            // As in Free, only a new explicit user click can follow an href.
            // Preparing it does not navigate or move this workspace to reading.
            value=result('native-link',{nativeLink:{refId:ref.id,url:route.navigationURL,disposition:'new-tab-preserve-current'}});
          }else{
          if(!currentNavigation||!isCurrentNavigationPlan(plan)&&!isResolvedControlNavigationPlan(plan))throw Error('pro-navigation-native-entry-required');
          currentNavigation.register({context:c,grantId:t.grantId,mountId:t.mountId,navigation:[row]});const actionId=newId('nav'),previousLaunch=s.launch;s.launch=launch;
          const r=await currentNavigation.handle({v:1,type:plan.mode==='same-target'?'HOST_UI_DISPATCH_CURRENT':'HOST_UI_DISPATCH_NATIVE',grantId:t.grantId,mountId:t.mountId,actionId,planRevision:plan.planRevision,targetKey:row.targetKey},t.sender);
          if(r?.ok!==true||r.state==='blocked'){if(s.launch===launch)s.launch=previousLaunch;}
          if(r?.ok!==true)throw Error('pro-navigation-unavailable');value=result(r.state);
          }
        }else throw Error('invalid-pro-navigation');
      }else throw Error('invalid-pro-action');
      o.check();
      if(action==='view'&&p.op==='page'&&s.processing==='cloud'&&s.autoRequested&&entitlement(c)!=='free'&&(s.mode!=='native'||s.backgroundWhileNative)){
        // Refresh only observes Free's already admitted source. The finite RAM
        // queue never scans the host, polls, keeps a worker alive or retries a
        // paid task; all model/budget/authority gates run again after response.
        const eligible=o.eligibleModelRefs(),knownRefIds=o.snapshot().references.map(r=>r.id);
        if(knownRefIds.length>20000){models.revoke(s.key);s.autoRequested=false;s.incremental.reset();}
        else{s.incremental.observe(eligible,digest(o.versions()),{knownRefIds});const batch=s.incremental.nextBatch(),current=modelSession(c,s);
        if(batch.refIds.length&&!models.running(s.key))queueMicrotask(()=>{try{if(current.live()&&models.approved(current)&&!models.running(s.key)&&s.incremental.markStarted(batch).consumed)models.start(current,{refIds:batch.refIds,automaticTrigger:true});}catch{/* Current task/diagnostic records retain model failures. Free stays usable. */}});}
      }
      if(action==='commit'&&value.kind==='pro-result'||action==='background'&&['mode','processing','model-enable'].includes(p.op))notifications.add(c.scope.key);
      return {ok:true,value};
    }catch(e){
      const publicCode=['alias-capacity','proposal-review-capacity'].includes(e.message)?e.message:['QuotaExceededError','pro-record-too-large','billing-job-capacity'].includes(e.message)?'pro-storage-capacity':e.message==='pro-suggestion-needs-smaller-batch'?'pro-batch-capacity':null;
      if(publicCode&&o?.writeCurrent()&&guard())throw publicProError(publicCode);throw e;
    }finally{o?.close();activeWork--;}
  }

  const rpc=createProWorkerService({ui:authenticatedUi,invoke,projectReply:({action,value})=>validatePublicProReply(action,value),elapsedNow,schedule,cancel});
  // Backup requests already passed assetUi.withScope. Bind their unforgeable
  // live guard function to a short-lived request owner; never derive a grant
  // from a serialized scope or a restore bundle.
  const backupRepository=createCompositeBackupRepository({workspaceRepository,resolvePro:async(scope,options)=>{
    if(typeof options?.guard!=='function'||options.guard()!==true||options.signal?.aborted)throw Error('pro-backup-authority-required');
    const c=options.ownerContext;
    if(!c||c.scope?.key!==scope.key||typeof c.isCurrent!=='function'||c.isCurrent()!==true||!options.signal)throw Error('pro-backup-current-owner-required');
    const s=session(c),o=await owner(c,s,options.guard,options.signal,{independent:true});
    const entry={o,s};backupOwners.add(entry);
    const close=()=>{o.close();backupOwners.delete(entry);};
    options.signal.addEventListener('abort',close,{once:true});
    if(options.signal.aborted){close();throw Error('pro-backup-authority-expired');}
    return {store:o.store,grant:o.grant,versions:o.versions()};
  },onRestored:scopeKey=>{for(const s of sessions.values())if(s.scopeKey===scopeKey){models.revoke(s.key);s.generation++;s.processing='off';s.autoRequested=false;s.backgroundWhileNative=false;s.incremental?.reset();s.previews.clear();s.previewState=null;s.batchCursor=null;s.launch=null;}notify(scopeKey);}});
  function notify(scopeKey){try{const pending=ui.notifyScope?.(scopeKey);try{Promise.prototype.then.call(pending,()=>{},()=>{});}catch{}}catch{}}
  async function handle(...args){try{return await rpc.handle(...args);}finally{for(const key of notifications){notifications.delete(key);notify(key);}}}
  function revokeDocument(id){rpc.revokeDocument(id);for(const [key,s]of sessions)if(s.documentId===id){models.revoke(s.key);s.previews.clear();sessions.delete(key);}else if(s.uiDocuments?.has(id)){models.revoke(s.key);s.generation++;s.previews.clear();s.previewState=null;s.batchCursor=null;s.processing='off';s.autoRequested=false;s.backgroundWhileNative=false;s.incremental?.reset();s.uiDocuments.delete(id);}}
  function revokeMount(id){rpc.revokeMount(id);for(const s of sessions.values()){models.revoke(s.key);s.generation++;s.previews.clear();s.previewState=null;s.batchCursor=null;s.processing='off';s.autoRequested=false;s.backgroundWhileNative=false;s.incremental?.reset();}}
  function revokeTab(id,{preserveDocumentId=null}={}){rpc.revokeTab(id);for(const [key,s]of sessions)if(s.tabId===id){models.revoke(s.key);s.generation++;s.previews.clear();s.previewState=null;s.batchCursor=null;s.processing='off';s.autoRequested=false;s.backgroundWhileNative=false;s.incremental?.reset();if(s.documentId!==preserveDocumentId)sessions.delete(key);}}
  function stop(){if(stopped)return;stopped=true;models.stop();rpc.stop();for(const entry of backupOwners)entry.o.close();backupOwners.clear();sessions.clear();}
  return Object.freeze({handle,revokeDocument,revokeMount,revokeTab,stop,isIdle:()=>!stopped&&activeWork===0&&backupOwners.size===0&&rpc.isIdle()&&models.isIdle(),backupRepository});
}
