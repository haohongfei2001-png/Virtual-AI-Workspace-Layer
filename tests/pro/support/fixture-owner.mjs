/** SYNTHETIC FIXTURE OWNER ONLY. Not packaged in the extension.
 * Uses actual existing NativeRepository/ScopeRepository/Free projection plus
 * six contract ports; no browser account, body source or model network exists.
 */
import {ScopeRepository} from '../../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../../src/b1/identity.mjs';
import {NativeRepository} from '../../../src/data/native-repository.mjs';
import {checkActivityVersionFence} from '../../../src/data/activity-version-fence.mjs';
import {freeNavigationSnapshot} from '../../../src/navigation/free-view.mjs';
import {aggregateFreeActivity} from '../../../src/data/free-activity.mjs';
import {createFreeViewSession} from '../../../src/data/free-time-policy.mjs';
import {projectFreeFrame} from '../../../src/runtime/free-frame-projection.mjs';
import {projectFreeSearch} from '../../../src/runtime/free-search-projection.mjs';
import {digest,stable} from '../../../src/data/hash.mjs';
import {emptyOverlay,planTransaction,registerProposal,overlayChanges,previewUndo,validateVersions} from '../../../src/pro/domain/index.mjs';
import {createSameDatabaseStore,createMemoryOverlayStore} from '../../../src/pro/integration/same-db-store.mjs';
import {prepareMetadataEvidence} from '../../../src/pro/organize/index.mjs';
import {projectProFrame} from '../../../src/pro/projection/project.mjs';
import {validateLaunchContext} from '../../../src/pro/navigation/launch-context.mjs';
import {exportOverlayBackup,previewBackupRestore} from '../../../src/pro/migration/recovery.mjs';

export const FIXTURE_NOW='2026-10-31T12:00:00.000Z';
export const FIXTURE_SCOPE=normalizedScope({verified:true,provider:'pro_fixture',accountId:'isolated_sample',organizationId:'personal'});
export const FIXTURE_REFS=[
 ['c_alpha','Riftlet 首击可靠性排查','NONE'],
 ['c_beta','Riftlet 首击可靠性修复','NONE'],
 ['c_gamma','Riftlet 官网文案','NONE'],
 ['c_delta','求职 产品简历','NONE'],
 ['c_epsilon','继续','NONE'],
 ['c_unknown','归属还在核对的聊天','UNKNOWN'],
 ['c_project_a','项目内的原生聊天','PROJECT','p_alpha'],
 ['c_project_b','另一个同名项目的聊天','PROJECT','p_beta']
];
const copy=x=>structuredClone(x);
const freshId=prefix=>`${prefix}_${crypto.randomUUID().replaceAll('-','')}`;
function activity(id,index){const days=index===1?45:index;return {objectKey:id,evidenceRevision:0,basis:'provisional',candidateDay:20757-days,candidateTime:new Date(Date.parse(FIXTURE_NOW)-days*86400000).toISOString(),segment:index===1?1:0,reason:'fixture-local-recent-use',nextCheck:null,validUntil:null};}

export async function createFixtureOwner({indexedDB,databaseName='vaiwl_pro_fixture',fixtureOnly=false,memoryOnly=false,clock=()=>Date.parse(FIXTURE_NOW),scope=FIXTURE_SCOPE,capabilityOverrides={},initialOverlay=null}={}) {
  if(fixtureOnly!==true)throw Error('explicit-synthetic-fixture-required');
  const base=memoryOnly?null:new ScopeRepository({indexedDB,databaseName});
  const sourceScope=memoryOnly?{kind:'browser-local-session',key:scope.key,serverIdentity:'not-established',persistence:'memory'}:
    {kind:'verified-scope',key:scope.key,serverIdentity:'established',persistence:'same-idb'};
  const native=memoryOnly?null:new NativeRepository({baseRepository:base,clock:()=>FIXTURE_NOW,observationGate:()=>({channel:'synthetic',sourceId:'pro_fixture_native',generation:'one'})});
  let epoch=Math.floor(Math.random()*1e9)+1,allowed=true,entitlement='pro',currentGrant,mode='pro-default-none',selectedProjectIds=[],launchContext=null;
  let processingMode='local',consentRevision=1,sourceRevision=0,privateState=emptyOverlay(scope.key),privateRecords=[],nativeSnapshot;
  let grantMap=new WeakMap(),intentMap=new WeakMap(),ticketMap=new WeakMap();
  const navigationPlans=new Map(),navigationActions=new Map(),jobs=new Map();
  const invalidationListeners=new Set();
  const capabilities={scope:sourceScope,metadata:'available',positiveNone:'available',selectedText:'unavailable',sentUserInput:'unavailable',historicalCompleteness:'partial',reasonCodes:['synthetic-fixture-only'],...capabilityOverrides};
  let memoryRefs=FIXTURE_REFS.map(([id,title,membership,projectId])=>({id,nativeTitle:title,nativeUrl:'https://fixture.test/c/'+id,membership:membership==='UNKNOWN'?{state:'UNKNOWN',reason:'no-positive-membership',revision:1}:{state:membership,...(projectId?{projectId}:{}),evidenceId:'membership_'+id,revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['pro_fixture_native']}));
  function mint(){const g=Object.freeze({scope:copy(sourceScope),epoch,allowedInputs:['metadata'],expiresAt:new Date(clock()+12*3600000).toISOString()});grantMap.set(g,{epoch,scopeKey:scope.key,expiresAt:clock()+12*3600000});return g;}
  function verifyGrant(g){const x=grantMap.get(g);if(!allowed||!x||x.epoch!==epoch||x.scopeKey!==scope.key||x.expiresAt<=clock())throw Error('stale-semantic-grant');return sourceScope;}
  currentGrant=mint();
  function versions(state=privateState){
    const references=referencesNow();
    return {scopeKey:scope.key,authorizationEpoch:epoch,sourceGeneration:{pro_fixture_native:1},
      nativeFields:{nativeRoot:sourceRevision,evidenceRoot:0,...Object.fromEntries(references.map(r=>[r.id,r.nativeRevision]))},
      overlayRevision:state.revision,targets:Object.fromEntries([...Object.values(state.topics).map(x=>['topic_'+x.id,x.revision]),...Object.values(state.titles).map(x=>['title_'+x.conversationId,x.revision])]),
      constraintRevision:state.revision,policyVersion:'vaiwl-pro-r1-fixture-policy-1',evidenceDigest:digest(references.map(r=>({id:r.id,title:r.nativeTitle,membership:r.membership})))};
  }
  function referencesNow(){
    if(memoryOnly)return copy(memoryRefs);
    return nativeSnapshot.refs.map(r=>({id:r.id,nativeTitle:r.nativeTitle??'名称暂不可用',nativeUrl:r.nativeUrl??null,
      membership:r.membership==='UNKNOWN'?{state:'UNKNOWN',reason:'no-positive-membership',revision:sourceRevision}:
        {state:r.membership,...(r.membership==='PROJECT'?{projectId:r.projectId}:{}),evidenceId:'membership_'+r.id,revision:sourceRevision},
      available:r.available!==false,freshness:r.freshness==='current'?'current':'last-known',nativeRevision:sourceRevision,sourceIds:['pro_fixture_native']}));
  }
  function snapshot(state=privateState){const references=referencesNow();return {scope:copy(sourceScope),scopeKey:scope.key,authorized:allowed,references,versions:versions(state),capabilities:copy(capabilities),
    activities:references.map(r=>({conversationId:r.id,decisionId:'fixture_'+r.id,decisionRevision:0})),activityDecisions:Object.fromEntries(references.map((r,i)=>[r.id,activity(r.id,i)])),
    viewSession:createFreeViewSession({H:30,now:FIXTURE_NOW,timeZone:'Asia/Shanghai',policyRevision:0}),partial:true};}
  const verifyExpected=(expected,state)=>{validateVersions(expected);if(stable(expected)!==stable(versions(state)))throw Error('stale-read-set');};
  const store=memoryOnly?createMemoryOverlayStore({scopeKey:scope.key,verifyGrant,verifyExpected}):createSameDatabaseStore({connection:()=>base.open(),verifyGrant,enabled:true,
    verifyInputFence(tx,unused,expected,check,ready,fail){
      try {if(expected.authorizationEpoch!==epoch||!allowed)throw Error('stale-semantic-grant');
        checkActivityVersionFence(tx,scope,{nativeRevision:expected.nativeFields.nativeRoot,evidenceRevision:expected.nativeFields.evidenceRoot},check,ready,fail);
      }catch(e){fail(e.message);}
    }});
  async function load(){
    verifyGrant(currentGrant);
    if(!memoryOnly){nativeSnapshot=await native.snapshot(scope);sourceRevision=nativeSnapshot.revision;}
    const data=await store.read(currentGrant);privateState=data.state;privateRecords=data.records;return data;
  }
  async function seed(){
    if(memoryOnly){sourceRevision=1;return;}
    const facts=await native.read(scope);
    if(!facts.revision){
      const result=await native.apply(scope,{operationId:'fixture_seed',expectedRevision:0,batch:{scopeKey:scope.key,sourceRevision:1,observedAt:FIXTURE_NOW,validUntil:'2026-11-01T12:00:00.000Z',
        projects:['p_alpha','p_beta'].map(id=>({id,nativeName:'同名原生项目',nativeUrl:'https://fixture.test/g/'+id,availability:'available',memberCount:1})),
        refs:FIXTURE_REFS.map(([id,nativeTitle])=>({id,nativeTitle,nativeUrl:'https://fixture.test/c/'+id,availability:'available'})),
        membership:FIXTURE_REFS.map(([id,,state,projectId])=>({id,state,projectId:projectId??null})),inventory:{projects:'complete',conversations:'partial',cursor:null}}});
      if(!result.ok)throw Error(result.reason);
    }
  }
  await seed();await load();

  const opFrom=(plan,request,actor,provenance,proposalId=null)=>({operationId:request.operationId,actor,provenance,base:copy(request.expected),planHash:plan.planHash,
    resultRevision:plan.state.revision,proposalId,inverse:plan.inverse,patch:plan.patch,inverseHash:plan.inverseHash,readSet:plan.readSet??[],status:'applied'});
  async function commit(g,request,signal){
    try {
      verifyGrant(g);const req={...request,expected:copy(request.expected),command:{...request.command,command:copy(request.command.command)}};
      const {actor,command,intent,ticket}=req.command;
      if(!['human','automation'].includes(actor))throw Error('invalid-actor');
      const authority=actor==='human'?intentMap.get(intent):ticketMap.get(ticket);
      if(!authority||authority.epoch!==epoch||authority.scopeKey!==scope.key||authority.commandDigest!==digest(command)||authority.expectedDigest!==digest(req.expected)||authority.usedBy&&authority.usedBy!==req.operationId)throw Error('invalid-intent-or-ticket');
      if(entitlement!=='pro'&&!['DELETE_TOPIC','UNDO_TRANSACTION','REMOVE_AI_ARTIFACTS','APPLY_COMPENSATION_PLAN'].includes(command.type))throw Error('pro-entitlement-required');
      if(memoryOnly)throw Error('session-preview-only');
      if(actor==='automation'&&(mode==='native'||processingMode!=='local'))throw Error('automation-paused');
      const result=await store.transact(g,{operationId:req.operationId,expected:req.expected,fingerprint:{actor,command,expected:req.expected},execute(state,records){
        verifyGrant(g);verifyExpected(req.expected,state);
        if(authority.epoch!==epoch||authority.usedBy&&authority.usedBy!==req.operationId)throw Error('stale-or-consumed-intent');
        // Claim in the serialized commit boundary, before a reducer can write.
        // A failed attempt conservatively consumes the receipt for this ID.
        authority.usedBy=req.operationId;
        const operations=Object.fromEntries(records.filter(x=>x.transaction.actor!=='system').map(x=>[x.transaction.operationId,x.transaction]));
        const context={actor,operationId:req.operationId,snapshot:snapshot(state),expected:req.expected,mode,selectedProjectIds,operations,
          processingConsentCurrent:processingMode==='local',firstRun:authority.firstRun??true,qualityGate:authority.qualityGate??{}};
        const plan=planTransaction(state,command,context);
        const provenance=actor==='automation'?'quality-gated-auto':['ACCEPT_PROPOSAL','ACCEPT_PROPOSAL_BATCH'].includes(command.type)?'accepted-proposal':'explicit-user-command';
        const transaction=opFrom(plan,req,actor,provenance,command.proposalId??null);
        if(command.type==='ACCEPT_PROPOSAL_BATCH')transaction.proposalIds=command.proposals.map(p=>p.proposalId);
        return {state:plan.state,transaction,...(command.type==='UNDO_TRANSACTION'?{undoneOperationId:command.targetOperationId}:{})};
      }},signal);
      if(result.ok){authority.usedBy=req.operationId;if(command.type==='SET_AI_PROCESSING'&&command.policy==='excluded')for(const job of jobs.values())if(job.refs?.includes(command.refId))job.state='cancelled';await load();}
      return result;
    }catch(e){return {ok:false,reason:e.message};}
  }
  async function register(g,proposals,expected){
    verifyGrant(g);if(memoryOnly)throw Error('session-preview-only');
    if(!proposals.length)return;
    const id=freshId('suggestions');
    const result=await store.transact(g,{operationId:id,expected,fingerprint:{proposals,expected},execute(state){
      verifyExpected(expected,state);let next=state;
      for(const p of proposals)next=registerProposal(next,p);
      const patch=overlayChanges(state,next),plan={state:next,patch,inverse:[],inverseHash:digest({inverse:[],readSet:[]}),readSet:[],planHash:digest({proposals,expected})};
      return {state:next,transaction:opFrom(plan,{operationId:id,expected},'system','proposal-registration')};
    }});
    if(!result.ok)throw Error(result.reason);await load();
  }
  function nativeDTO(query={}){
    const refs=referencesNow().map((r,i)=>({...r,scope:scope.key,membership:r.membership.state,projectId:r.membership.projectId??null,displayTitle:r.nativeTitle,activityDecision:activity(r.id,i)}));
    const projects=['p_alpha','p_beta'].map(id=>({id,scope:scope.key,nativeName:'同名原生项目',nativeUrl:'https://fixture.test/g/'+id,members:refs.filter(r=>r.projectId===id).map(r=>r.id)}));
    const shared=aggregateFreeActivity({scope:scope.key,revision:sourceRevision,viewMode:'free',refs,projects,noProject:refs.filter(r=>r.membership==='NONE'),unknown:refs.filter(r=>r.membership==='UNKNOWN'),inventoryComplete:false,workspaceRevision:0,evidenceRevision:0,viewRevision:0,viewSession:snapshot().viewSession,preferences:{}});
    const prepared=freeNavigationSnapshot(shared);
    const keys=['role','segment','offset','limit','groupId','list','rowOffset','rowLimit','rowWindows'];
    const request={role:'workspace',...Object.fromEntries(Object.entries(query).filter(([key])=>keys.includes(key)))};
    const dto=projectFreeFrame({snapshot:prepared},request);
    if(query.search)dto.search=projectFreeSearch({snapshot:prepared},query.search);
    return dto;
  }
  const safe=fn=>async(...args)=>{try{return {ok:true,value:await fn(...args)};}catch(e){return {ok:false,reason:e.message};}};
  const ports=Object.freeze({
    sharedSnapshot:{read:safe((g,q,signal)=>{verifyGrant(g);if(signal?.aborted)throw Error('aborted');if(!Array.isArray(q.refs)||q.maxItems<1||q.maxItems>1000)throw Error('invalid-snapshot-query');const s=snapshot();return {references:s.references.filter(r=>!q.refs.length||q.refs.includes(r.id)).slice(0,q.maxItems),activities:s.activities,versions:s.versions,partial:true};})},
    evidence:{prepare:safe((g,q,signal)=>{verifyGrant(g);if(signal?.aborted)throw Error('aborted');if(q.requestedInputLevel!=='metadata-only')throw Error('content-capability-unavailable');if(q.processingConsentReference?.id!=='fixture-local-consent'||q.processingConsentReference.expectedRevision!==consentRevision||processingMode!=='local')throw Error('processing-consent-required');const s=snapshot();return prepareMetadataEvidence({scope:sourceScope,capabilities,references:s.references,versions:s.versions,overlay:privateState,consent:{mode:'local',inputKinds:['metadata'],revision:consentRevision,maxMemoryMiB:32,maxDownloadMiB:0},refIds:q.refs,maxUtf8Bytes:q.maxUtf8Bytes,mode,selectedProjectIds});})},
    commit:{commit,previewUndo:safe(async(g,id,signal)=>{verifyGrant(g);if(signal?.aborted)throw Error('aborted');await load();const op=privateRecords.find(x=>x.transaction.operationId===id)?.transaction;if(!op)throw Error('missing-operation');return previewUndo(privateState,op);})},
    view:{project:safe((g,q,signal)=>{verifyGrant(g);if(signal?.aborted)throw Error('aborted');return projectProFrame({state:privateState,snapshot:snapshot(),native:nativeDTO(q),mode:q.mode,role:q.role,session:q.session,segment:q.segment,offset:q.offset,limit:q.limit,rowLimit:q.rowLimit,launchContext:q.launchContext,selectedProjectIds});})},
    navigation:{prepare:safe((g,refId,context,signal)=>{verifyGrant(g);if(signal?.aborted)throw Error('aborted');validateLaunchContext(context,{scopeKey:scope.key,documentEpoch:epoch});if(context.referenceId!==refId||!referencesNow().some(r=>r.id===refId&&r.available))throw Error('navigation-target-unavailable');const handle=freshId('navigation');navigationPlans.set(handle,{refId,context:copy(context),epoch,consumed:false});return {existingPlanHandle:handle};}),
      dispatch:safe((handle,actionId)=>{verifyGrant(currentGrant);const prior=navigationActions.get(actionId);if(prior){if(prior.handle!==handle)throw Error('action-id-conflict');return prior.result;}const p=navigationPlans.get(handle);if(!p||p.epoch!==epoch||p.consumed)throw Error('navigation-plan-expired');p.consumed=true;const result={state:'arrived'};navigationActions.set(actionId,{handle,result});launchContext=p.context;return result;})},
    background:{enqueue:safe((g,checkpoint)=>{verifyGrant(g);if(memoryOnly)throw Error('session-durable-job-denied');if(mode==='native'||processingMode==='off')throw Error('background-paused');if(checkpoint.modelBinding)throw Error('paid-provider-disabled');if(jobs.has(checkpoint.id))throw Error('duplicate-job');jobs.set(checkpoint.id,copy(checkpoint));return checkpoint.id;}),
      async cancelScope(key,reason){if(key!==scope.key)return;for(const job of jobs.values())if(!['committed','outcome-unknown'].includes(job.state)){job.state='cancelled';job.reason=reason;}},
      reserveBudget:safe(()=>{throw Error('cloud-budget-zero');})}
  });
  const owner={ports,base,native,store,scope,capabilities,
    fixtureNativeProjection(query){verifyGrant(currentGrant);return nativeDTO(query);},
    grant(){verifyGrant(currentGrant);return currentGrant;},
    humanIntent(command,expected){verifyGrant(currentGrant);validateVersions(expected);const receipt=Object.freeze({intentId:freshId('human'),scopeKey:scope.key,generation:epoch});intentMap.set(receipt,{epoch,scopeKey:scope.key,commandDigest:digest(command),expectedDigest:digest(expected),usedBy:null});return receipt;},
    automationTicket(command,expected,{firstRun=false,qualityGate={}}={}){verifyGrant(currentGrant);const ticket=Object.freeze({scopeKey:scope.key,proposalId:command.proposalId,policyVersion:expected.policyVersion,qualityGateVersion:'synthetic-not-production'});ticketMap.set(ticket,{epoch,scopeKey:scope.key,commandDigest:digest(command),expectedDigest:digest(expected),usedBy:null,firstRun,qualityGate});return ticket;},
    consentReference:()=>({id:'fixture-local-consent',expectedRevision:consentRevision}),
    async readPrivate(){await load();return {state:copy(privateState),records:copy(privateRecords),snapshot:snapshot()};},
    async registerProposals(g,p,e){return register(g,p,e);},
    status:()=>({fixture:true,authorized:allowed,entitlement,processingMode,modelAvailability:'fixture-rules',cloudBudget:0,metadataOnly:true,persistence:sourceScope.persistence,positiveNone:capabilities.positiveNone,pausedReason:mode==='native'?'native-view':processingMode==='off'?'processing-off':null,launchContext:copy(launchContext)}),
    async setViewPolicy(next,ids=[]){verifyGrant(currentGrant);if(next==='pro-cross-project'&&(!ids.length||ids.some(id=>!['p_alpha','p_beta'].includes(id))))throw Error('explicit-project-scope-required');mode=next;selectedProjectIds=[...ids];if(next==='native')await ports.background.cancelScope(scope.key,'native-view');},
    setLaunchContext(c){launchContext=copy(c);},returnToWorkspace(c){if(c)validateLaunchContext(c,{scopeKey:scope.key,documentEpoch:epoch});return copy(c?.returnAnchor??null);},
    setEntitlement(value){entitlement=value;},
    subscribeInvalidation(fn){invalidationListeners.add(fn);return()=>invalidationListeners.delete(fn);},
    revoke(){allowed=false;epoch++;navigationPlans.clear();intentMap=new WeakMap();ticketMap=new WeakMap();void ports.background.cancelScope(scope.key,'revoked');for(const fn of invalidationListeners)fn();},
    async confirm(){allowed=true;currentGrant=mint();await load();},
    async restart(){base?.close();epoch++;allowed=true;grantMap=new WeakMap();intentMap=new WeakMap();ticketMap=new WeakMap();navigationPlans.clear();currentGrant=mint();launchContext=null;processingMode='off';consentRevision++;await load();},
    async allowLocal(){verifyGrant(currentGrant);processingMode='local';consentRevision++;},
    async pauseLocal(){verifyGrant(currentGrant);processingMode='off';consentRevision++;await ports.background.cancelScope(scope.key,'processing-off');},
    async updateNative(refId,{title,membership,projectId=null}={}){
      if(memoryOnly){const r=memoryRefs.find(r=>r.id===refId);if(title)r.nativeTitle=title;if(membership)r.membership=membership==='UNKNOWN'?{state:'UNKNOWN',reason:'fixture-update',revision:++sourceRevision}:{state:membership,...(membership==='PROJECT'?{projectId}:{}),evidenceId:'membership_'+refId,revision:++sourceRevision};r.nativeRevision=sourceRevision;return;}
      const facts=await native.read(scope),r=referencesNow().find(r=>r.id===refId);if(!r)throw Error('missing-reference');
      const result=await native.apply(scope,{operationId:freshId('native_update'),expectedRevision:facts.revision,batch:{scopeKey:scope.key,sourceRevision:facts.revision+1,observedAt:FIXTURE_NOW,validUntil:'2026-11-01T12:00:00.000Z',projects:[],refs:[{id:refId,nativeTitle:title??r.nativeTitle,nativeUrl:r.nativeUrl,availability:'available'}],membership:membership?[{id:refId,state:membership,projectId:membership==='PROJECT'?projectId:null}]:[],inventory:{projects:'partial',conversations:'partial',cursor:null}}});
      if(!result.ok)throw Error(result.reason);await load();
    },
    exportBackup:state=>exportOverlayBackup(state),
    async restoreBackup(backup,expected){const p=previewBackupRestore(privateState,backup),id=freshId('restore'),r=await store.transact(currentGrant,{operationId:id,expected,fingerprint:{backupChecksum:backup.checksum,expected},execute(state){verifyExpected(expected,state);const fresh=previewBackupRestore(state,backup);if(p.planHash!==fresh.planHash)throw Error('stale-restore');const inverse=fresh.patch.map(x=>({kind:x.kind,key:x.key,expectedAfterDigest:x.afterDigest,restoreValue:x.before}));return {state:fresh.state,transaction:opFrom({...fresh,inverse,inverseHash:digest({inverse,readSet:[]}),readSet:[]},{operationId:id,expected},'human','explicit-user-command')};}});if(!r.ok)throw Error(r.reason);processingMode='off';consentRevision++;await load();},
    stop(){base?.close();allowed=false;grantMap=new WeakMap();intentMap=new WeakMap();ticketMap=new WeakMap();},
    async raw(){return store.read(currentGrant);}
  };
  if(initialOverlay){const expected=versions(),id='fixture_initial_overlay';const patch=overlayChanges(privateState,initialOverlay);const r=await store.transact(currentGrant,{operationId:id,expected,fingerprint:{initialOverlay},execute:()=>({state:copy(initialOverlay),transaction:{operationId:id,actor:'system',provenance:'fixture-initialization',base:expected,planHash:digest(initialOverlay),resultRevision:initialOverlay.revision,proposalId:null,patch,inverse:[],inverseHash:digest({inverse:[],readSet:[]}),readSet:[],status:'applied'}})});if(!r.ok)throw Error(r.reason);await load();}
  return owner;
}
