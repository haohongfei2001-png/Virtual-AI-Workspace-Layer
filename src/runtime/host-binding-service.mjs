import {createHostNativeActivityOwner} from './host-native-activity-owner.mjs';
import {validateNativeActivityProfile} from './native-activity-profile.mjs';
import {createNoReceiptContextRecovery} from './context-recovery/no-receipt-recovery.mjs';
import {createIsolatedSessionOwner} from './isolated-session-owner.mjs';
import {createHostEntryCalibration} from './host-entry-calibration.mjs';
import {createHostIngestionPassOwner} from './host-ingestion-pass-owner.mjs';
import {createHostOldSendTerminal} from './host-old-send-terminal.mjs';
import {createOldSendTerminalReadback} from './old-send-terminal-readback.mjs';
import {createHostActivitySourceAdmission} from './host-activity-source-admission.mjs';
import {createHostHistoricalSendOwner} from './host-historical-send-owner.mjs';
import {validateHistoricalSendProfile} from './historical-send-profile.mjs';
import {createHostFirstSend} from './host-first-send.mjs';
import {createFirstSendReadback} from './first-send-readback.mjs';
import {createHostCurrentNavigation} from './host-current-navigation.mjs';
import {createHostSendAckOwner} from './host-send-ack-owner.mjs';
import {validateSendAckProfile} from './send-ack-admission.mjs';
import {createHostCandidateService} from './host-candidate-service.mjs';
import {createHostSnippetService} from './host-snippet-service.mjs';
import {createHostBackupService} from './host-backup-service.mjs';
import {BACKUP_TYPES} from '../host/backup-transfer.mjs';
import {createHostSendCandidates} from './host-send-candidates.mjs';
import {createCurrentMetadataReader} from './current-metadata-reader.mjs';
import {createHostRecoveryService} from './host-recovery-service.mjs';
import {createHostContinuationOwner} from './host-continuation-owner.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {createFreeReadService} from './free-read-service.mjs';
import {createHostViewService} from './host-view-service.mjs';
import {createHostUiOwner} from './host-ui-owner.mjs';
import {createHostObservationOwner} from './host-observation-owner.mjs';
import {NativeRepository} from '../data/native-repository.mjs';
import {createDocumentBindingBroker} from '../b1/document-binding-broker.mjs';
import {createHostDocumentHandshake} from '../b1/host-document-handshake.mjs';
import {createScopeAuthority} from './scope-authority.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Zero-seed identity composition. Existing repository/broker owners remain unchanged. */
export function createHostBindingService({extensionId,getFrame,getContexts=null,allowedURL,provider,profile,contextObserver=null,isolatedIdentityDispatch=null,identityOrigin=null,repository,surfaceProfiles=null,currentMetadataReadEnabled=false,sendCandidatesEnabled=false,sendAckProfile=null,historicalSendProfile=null,nativeActivityProfile=null,firstSendOrigin=null,oldSendTerminalOrigin=null,readBudget=null,uiURL=null,uiURLs=null,workspaceRepository=null,freeEvidenceRepository=null,prepareNavigation=null,navigationURLPolicy=null,candidateBridge=null,dispatchCurrent=null,presentSurface=null,selectionBridge=null,freeRuntime=null,now=Date.now,makeId=()=>crypto.randomUUID(),elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const activity={requests:0,background:0};
 async function track(kind,work){activity[kind]++;try{return await work();}finally{activity[kind]--;}}
 const handshake=createHostDocumentHandshake({extensionId,getFrame,allowedURL,now,makeId,elapsedNow,schedule,cancel});
 const identityOwner=isolatedIdentityDispatch?createIsolatedSessionOwner({extensionId,handshake,getFrame,dispatch:isolatedIdentityDispatch,origin:identityOrigin,now,makeId,elapsedNow,schedule,cancel}):null;
 const readIdentity=identityOwner?async(frame,attempt)=>{
  try{return await provider.read({signal:attempt.signal});}
  catch(error){
   if(error?.message!=='session-transport-failed'||!serviceActive||!attempt.isCurrent()||attempt.signal.aborted)throw error;
   const binding=handshake.captureDeparture({tabId:frame.tabId,documentId:frame.documentId});
   const producer=binding&&sequences.get(binding.producerToken);
   // Authentication shares the outer RPC budget, including browser checks that
   // ran before ScopeAuthority started. No fallback receives a fresh deadline.
   const parents=[...refreshAttempts].filter(p=>p.active&&!p.abort.signal.aborted&&p.producer===producer&&p.frame?.documentId===frame.documentId&&p.frame?.tabId===frame.tabId&&p.frame?.actualURL===frame.actualURL);
   const remainingMs=parents.length?Math.min(attempt.remainingMs(),...parents.map(p=>6000-(elapsedNow()-p.started))):0;
   if(!binding||binding.url!==frame.actualURL||!producer||producer.denied||!handshake.isBound(producer.binding,producer.sender)||!Number.isFinite(remainingMs)||remainingMs<=0)throw Error('isolated-session-unavailable');
   return identityOwner.read({frame,binding,sender:producer.sender,authorityEpoch:attempt.authorityEpoch,signal:attempt.signal,isCurrent:()=>serviceActive&&attempt.isCurrent()&&sequences.get(binding.producerToken)===producer&&!producer.denied&&handshake.isBound(producer.binding,producer.sender),remainingMs});
  }
 }:null;
 const authority=createScopeAuthority({provider,profile,readIdentity,contextObserver,allowedURL,now,makeId,elapsedNow,schedule,cancel});
 const contextRecovery=profile.browserRequestContext===true&&contextObserver?createNoReceiptContextRecovery({profile,contextObserver,authority,now,elapsedNow,schedule,cancel}):null;
 const asFrame=(doc,sender)=>({tabId:doc.tabId,frameId:0,documentId:doc.documentId,parentDocumentId:null,actualURL:doc.url,documentLifecycle:'active',incognito:sender.tab?.incognito===true});

 const ingestionPasses=surfaceProfiles?createHostIngestionPassOwner({handshake,authority,getFrame,profiles:surfaceProfiles,now,elapsedNow,schedule,cancel}):null;
 let recovery=null,backup=null;
 const ui=uiURL||uiURLs?createHostUiOwner({extensionId,uiURL,uiURLs,getFrame,getContexts,handshake,authority,onRevokeMount:id=>views?.revokeMount(id),onRevokeDocument:id=>{recovery?.revokeDocument(id);backup?.revokeDocument(id);},now,makeId,elapsedNow,schedule,cancel}):null;
 const nativeActivityAttempts=new Set();
 const activityProfile=nativeActivityProfile===null?null:validateNativeActivityProfile(nativeActivityProfile);
 if(activityProfile&&(!freeEvidenceRepository||typeof provider.withNativeActivity!=='function'||surfaceProfiles?.has(activityProfile.id)))throw Error('invalid-native-activity-composition');
 const nativeActivity=activityProfile?createHostNativeActivityOwner({evidenceRepository:()=>freeEvidenceRepository,profileFor:id=>id===activityProfile.id?activityProfile:null,now,elapsedNow,schedule,cancel}):null;
 const historyProfile=historicalSendProfile===null?null:validateHistoricalSendProfile(historicalSendProfile);
 if(historyProfile&&(!currentMetadataReadEnabled||!sendCandidatesEnabled||!freeEvidenceRepository||surfaceProfiles?.has(historyProfile.id)))throw Error('invalid-historical-composition');
 const ackProfile=sendAckProfile===null?null:validateSendAckProfile(sendAckProfile);
 if(ackProfile&&(!currentMetadataReadEnabled||!sendCandidatesEnabled||!workspaceRepository||!freeEvidenceRepository||!(surfaceProfiles instanceof Map)||!surfaceProfiles.size||surfaceProfiles.has(ackProfile.id)))throw Error('invalid-send-ack-composition');
 const continuationProfileFor=id=>id===historyProfile?.id?historyProfile:id===ackProfile?.id?ackProfile:surfaceProfiles?.get(id);
 let sendCandidates=null,ackOwner=null,recoveryProfileCursor=0;
 const observations=surfaceProfiles?createHostObservationOwner({handshake,authority,getFrame,profiles:surfaceProfiles,foregroundReadPending:scopeKey=>views?.isForegroundReadPending(scopeKey)===true,onAccepted:(scope,publication)=>{views?.nativePublished(scope.key);if(publication.background===true)ui?.notifyBackground(scope.key);else ui?.notifyScope(scope.key);},onSendGap:proof=>track('background',()=>sendCandidates?.gap(proof)??false),onSendIntent:(proof,intent)=>track('background',async()=>{const result=await sendCandidates?.intent(proof,intent);if(result?.stage==='intent')await oldSendTerminal?.intentAccepted(proof,intent.intentId);return result;}),ackAdmission:(scope,request)=>ackOwner?.gate(scope,request),onNativeDelta:proof=>track('background',async()=>{await oldSendTerminal?.observe(proof);if(firstSend)await firstSend.observe(proof);if(sendCandidatesEnabled)await sendCandidates?.observe(proof);}),now,makeId,elapsedNow,schedule,cancel}):null;
 const historyOwner=historyProfile?createHostHistoricalSendOwner({evidenceRepository:()=>freeEvidenceRepository,profileFor:continuationProfileFor,now}):null;
 const currentMetadata=observations?createCurrentMetadataReader({observations,provider,enabled:currentMetadataReadEnabled,now,onHistorical:historyOwner?async input=>{await historyOwner.consume(input);input.guard();ui?.notifyScope(input.context.scope.key);}:null}):null;

 const entryCalibration=ui&&historyOwner&&currentMetadata?createHostEntryCalibration({ui,observations,reader:currentMetadata,elapsedNow,schedule,cancel}):null;
 const nativeRepository=observations?new NativeRepository({baseRepository:repository,workspaceRepository,hostObservationGate:observations.gate,lifecycleGate:observations.lifecycleGate,prepareInitialHostIndex:true,clock:()=>new Date(now()).toISOString()}):null;
 const continuations=nativeRepository&&typeof freeEvidenceRepository?.applyContinuation==='function'?createHostContinuationOwner({nativeRepository,evidenceRepository:freeEvidenceRepository,profileFor:continuationProfileFor}):null;
 if(ackProfile&&nativeRepository&&continuations)ackOwner=createHostSendAckOwner({evidenceRepository:()=>freeEvidenceRepository,profileFor:continuationProfileFor,commitNative:input=>observations.commitAcknowledged(input),drain:input=>continuations.drain(input),now});
 sendCandidates=currentMetadata?createHostSendCandidates({observations,reader:currentMetadata,enabled:sendCandidatesEnabled,now,schedule,cancel,onAcknowledged:ackOwner?async input=>{
  await ackOwner.consume(input);input.guard();ui?.notifyScope(input.context.scope.key);
 }:null}):null;
 const oldSendTerminal=oldSendTerminalOrigin&&sendCandidates?createHostOldSendTerminal({origin:oldSendTerminalOrigin,handshake,observations,sendCandidates,readBudget,readOperation:createOldSendTerminalReadback({origin:oldSendTerminalOrigin,elapsedNow}),now,elapsedNow,schedule,cancel}):null;
 const firstSend=firstSendOrigin&&ackOwner?createHostFirstSend({origin:firstSendOrigin,readBudget,handshake,authority,getFrame,observations,reader:currentMetadata,readOperation:createFirstSendReadback({origin:firstSendOrigin,elapsedNow}),onAcknowledged:async input=>{await ackOwner.consume(input);input.guard();ui?.notifyScope(input.context.scope.key);},now,elapsedNow}):null;
 const readService=workspaceRepository&&freeEvidenceRepository&&nativeRepository?createFreeReadService({admitActivitySource:createHostActivitySourceAdmission({sendAckProfile:ackProfile,historicalSendProfile:historyProfile,nativeActivityProfile:activityProfile}),initializeTimePolicy:true,repository,workspaces:workspaceRepository,native:nativeRepository,evidence:freeEvidenceRepository,clock:()=>new Date(now()).toISOString()}):null;
 const currentNavigation=ui&&observations&&dispatchCurrent?createHostCurrentNavigation({ui,observations,bridge:dispatchCurrent,urlPolicy:navigationURLPolicy,elapsedNow,schedule,cancel}):null;
 const views=ui&&readService?createHostViewService({ui,readService,workspaceRepository,nativeWritePending:scopeKey=>observations?.isNativeWritePending(scopeKey)===true,prepareNavigation,registerCurrentNavigation:currentNavigation?input=>currentNavigation.register(input):null,nativeCandidatesEnabled:!!candidateBridge,presentSurface,clock:()=>new Date(now()).toISOString(),elapsedNow,schedule,cancel}):null;
 const candidates=ui&&candidateBridge?createHostCandidateService({ui,bridge:candidateBridge,elapsedNow,schedule,cancel,makeId}):null;
 const snippets=ui&&views&&selectionBridge?createHostSnippetService({ui,workspaceRepository,resolveView:views.resolveSnippetView,selectionBridge,onChanged:scopeKey=>{views.refreshScope(scopeKey);ui.notifyScope?.(scopeKey);},elapsedNow,schedule,cancel,makeId}):null;
 recovery=ui&&readService?createHostRecoveryService({ui,readService,workspaceRepository,onRecovered:scopeKey=>{views?.refreshScope(scopeKey);ui.notifyScope?.(scopeKey);},elapsedNow,schedule,cancel}):null;
 backup=ui&&['exportBackup','previewRestore','restoreBackup'].every(name=>typeof workspaceRepository?.[name]==='function')?createHostBackupService({ui,workspaceRepository,onRestored:scopeKey=>{views?.refreshScope(scopeKey);ui.notifyScope?.(scopeKey);},elapsedNow,schedule,cancel,makeId}):null;
 const commands={};if(readService)for(const name of ['snapshot','command','undo','history','saveView','exportBackup','previewRestore','restoreBackup','recoveryStatus','recover'])if(typeof workspaceRepository[name]==='function')commands[name]=workspaceRepository[name].bind(workspaceRepository);
 const broker=createDocumentBindingBroker({extensionId,getFrame,allowedURL,repository,workspaceRepository:readService?{...readService,...commands}:workspaceRepository,freeRuntime,now,makeId,hostHandshake:handshake,resolveScope:({currentFrame,sender})=>authority.scopeFor(asFrame(currentFrame,sender))});
 // Claims last only through concurrent service delivery, not the grant lifetime.
 // A failed subscriber cannot revoke a sibling's completed or pending delivery.
 const resolutionClaims=new WeakMap();
 function claimResolution(attempt,resolution){
  if(resolution?.state!=='verified')return;
  let claim=resolutionClaims.get(resolution.grant);
  if(!claim){claim={grant:resolution.grant,users:new Set(),delivered:false};resolutionClaims.set(claim.grant,claim);}
  claim.users.add(attempt);attempt.resolutionClaim=claim;
 }
 function releaseResolution(attempt){
  const claim=attempt.resolutionClaim;if(!claim)return;
  claim.users.delete(attempt);
  if(claim.users.size)return;
  resolutionClaims.delete(claim.grant);
  if(!claim.delivered&&attempt.frame&&authority.peek(attempt.frame).grant===claim.grant)authority.invalidate(attempt.frame.documentId);
 }
 const sequences=new Map(),refreshAttempts=new Set();let serviceActive=true;
 async function handleWork(message,sender){
  if(message?.type==='HOST_OLD_SEND_OPERATION')return {ok:oldSendTerminal?await oldSendTerminal.intent(message,sender):false};
  if(message?.type==='HOST_FIRST_SEND_INTENT')return firstSend?firstSend.intent(message,sender):{ok:false};
  if(!serviceActive)return {ok:false,reason:'host-service-stopped'};
  if(message?.type==='HOST_IDENTITY_RESULT')return identityOwner?identityOwner.handle(message,sender):{ok:false};
  if(message?.type==='HOST_INGESTION_PASS')return ingestionPasses?ingestionPasses.handle(message,sender):{ok:false};
  if(message?.type==='HOST_NATIVE_AUTHORIZE'){
   if((!candidates&&!currentNavigation)||!exactHostRecord(message,['v','type','documentToken','producerToken','routeEpoch','command'])||message.v!==1||!await handshake.verify(message,sender))return {ok:false};
   const actual=await getFrame({tabId:sender.tab.id,frameId:0});
   if(!handshake.matchesFrame(message,sender,actual)||!await handshake.verify(message,sender))return {ok:false};
   const frame=asFrame({tabId:sender.tab.id,documentId:actual.documentId,url:actual.url},sender);return {ok:candidates?.authorize(message.command,frame)===true||currentNavigation?.authorize(message.command,frame)===true};
  }
  if(message?.type==='HOST_UI_CANCEL_NAVIGATION')return currentNavigation?currentNavigation.cancelAction(message,sender):{ok:false,state:'blocked'};
  if(['HOST_UI_DISPATCH_CURRENT','HOST_UI_DISPATCH_NATIVE'].includes(message?.type))return currentNavigation?currentNavigation.handle(message,sender):{ok:false,state:'blocked'};
  if(['HOST_UI_CANDIDATES','HOST_UI_ACTIVATE_CANDIDATE'].includes(message?.type))return candidates?candidates.handle(message,sender):{ok:false,state:'blocked'};
  if(['HOST_UI_SNIPPET','HOST_UI_SNIPPET_LIST'].includes(message?.type))return snippets?snippets.handle(message,sender):{ok:false,reason:'snippet-unavailable'};
  if(BACKUP_TYPES.includes(message?.type))return backup?backup.handle(message,sender):{ok:false,reason:'backup-unavailable'};
  if(['HOST_UI_RECOVERY_STATUS','HOST_UI_RECOVERY_RELEASE','HOST_UI_RECOVER'].includes(message?.type))return recovery?recovery.handle(message,sender):{ok:false,reason:'recovery-unavailable'};
  if(message?.type==='HOST_DOCUMENT_RENEW')return handshake.renew(message,sender);
  if(message?.type==='HOST_UI_WORKING_SET')return views?views.setWorkingSet(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_SET_HORIZON')return views?views.setHorizon(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_UNDO_AUTO_HORIZON')return views?views.undoAutoHorizon(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_CALIBRATION_ENTRY')return entryCalibration?entryCalibration.handle(message,sender):{ok:false,state:'unavailable'};
  if(message?.type==='HOST_UI_CURRENT_ENTRY')return views?views.enterCurrent(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_PRESENT')return views?views.present(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(['HOST_UI_RESUME','HOST_UI_SAVE_VIEW'].includes(message?.type))return views?views.resume(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_VIEW')return views?views.handle(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(['HOST_UI_IDLE_RELEASE','HOST_UI_IDLE_CHECK'].includes(message?.type))return ui?ui.handle({...message,type:message.type==='HOST_UI_IDLE_CHECK'?'HOST_UI_IDLE_CHECK':'HOST_UI_RELEASE'},sender,{releaseGuard:canReleaseIdleMount}):{ok:false,reason:'host-ui-unavailable'};
  if(typeof message?.type==='string'&&message.type.startsWith('HOST_UI_'))return ui?ui.handle(message,sender):{ok:false,reason:'host-ui-unavailable'};
  if(['vaiwl-host-observation/1','vaiwl-host-observation/2'].includes(message?.protocol)){
   if(!observations)return {state:'rejected',localSeq:message.localSeq,reason:'host-observations-unavailable'};
   const result=await observations.ingest(message,sender,nativeRepository);
   if(message.kind==='current-object'&&result.bodyProofId&&['accepted','duplicate'].includes(result.state)){await oldSendTerminal?.observe(result.bodyProofId);void track('background',async()=>{if(firstSend)await firstSend.observe(result.bodyProofId);if(sendCandidatesEnabled)await sendCandidates?.observe(result.bodyProofId);}).catch(()=>{});}
   return result;
  }
  if(!['HOST_REFRESH','HOST_FOCUS'].includes(message?.type))return broker.handle(message,sender);
  const focus=message.type==='HOST_FOCUS';
  if(!exactHostRecord(message,['v','type','clientId','seq','documentToken','producerToken','routeEpoch'])||message.v!==1||!tokenOK(message.clientId)||!Number.isSafeInteger(message.seq)||message.seq<1||!tokenOK(message.documentToken)||!tokenOK(message.producerToken)||!Number.isSafeInteger(message.routeEpoch)||message.routeEpoch<1)return {ok:false,reason:'invalid-host-refresh'};
  const attempt={active:true,started:elapsedNow(),abort:new AbortController(),frame:null,resolution:null,completed:false};
  refreshAttempts.add(attempt);
  const revokeFocus=()=>{if(!focus||!attempt.frame||!handshake.isBound(message,sender))return;const grant=authority.peek(attempt.frame).grant;if(grant&&grant.id!==attempt.scopeGrantId)return;ingestionPasses?.invalidateDocument(attempt.frame.documentId);observations?.invalidateDocument(attempt.frame.documentId);ui?.revokeDocument(attempt.frame.documentId);views?.revokeDocument(attempt.frame.documentId);};
  const denyFocus=()=>{if(focus&&attempt.producer&&sequences.get(message.producerToken)===attempt.producer)attempt.producer.denied=true;};
  const check=()=>{if(!serviceActive||!attempt.active||attempt.producer?.denied||elapsedNow()-attempt.started>=6000)throw Error('host-refresh-expired');};
  try{const result=await withRequestDeadline(()=>track('background',async()=>{
  if(!await handshake.verify(message,sender))return {ok:false,reason:'invalid-host-document'};check();
  const prior=sequences.get(message.producerToken);if(prior?.denied)return {ok:false,reason:'scope-not-verified'};if(focus&&!prior?.verified)return {ok:false,reason:'scope-not-verified'};if(prior&&message.seq<=prior.seq)return {ok:false,reason:'replayed-sequence'};
  const time=now();for(const [key,value]of sequences)if(value.denied?!handshake.isBound(value.binding,value.sender):value.until<=time)sequences.delete(key);
  if(!sequences.has(message.producerToken)&&sequences.size>=128)return {ok:false,reason:'capacity'};
  const producer=prior??{verified:false,freshStarted:false,binding:Object.freeze({documentToken:message.documentToken,producerToken:message.producerToken,routeEpoch:message.routeEpoch}),sender:Object.freeze({id:sender.id,tab:Object.freeze({id:sender.tab.id,incognito:sender.tab.incognito}),frameId:sender.frameId,documentId:sender.documentId,documentLifecycle:sender.documentLifecycle,url:sender.url})};producer.seq=message.seq;producer.until=time+20000;sequences.set(message.producerToken,producer);attempt.producer=producer;
  const actual=await getFrame({tabId:sender.tab.id,frameId:0});check();
  if(!handshake.matchesFrame(message,sender,actual)||!await handshake.verify(message,sender))return {ok:false,reason:'stale-host-document'};check();
  const frame=asFrame({tabId:sender.tab.id,documentId:actual.documentId,url:actual.url},sender);
  attempt.frame=frame;attempt.scopeGrantId=authority.peek(frame).grant?.id;
  // A newly issued producer must not reuse a pre-suspension account proof.
  // Ordinary renewals keep the existing bounded revalidation/single-flight path.
  const firstFresh=!producer.verified&&!producer.freshStarted;
  if(firstFresh){producer.freshStarted=true;ingestionPasses?.invalidateDocument(frame.documentId);observations?.invalidateDocument(frame.documentId);ui?.revokeDocument(frame.documentId);views?.revokeDocument(frame.documentId);}
  const authorize=({signal})=>focus?authority.revalidate(frame,signal,{force:true}):!producer.verified?authority.refresh(frame,firstFresh?'auth-change':'focus',signal):authority.peek(frame).state==='verified'?authority.revalidate(frame,signal):authority.refresh(frame,'bind',signal);
  const resolution=await (contextRecovery&&!focus&&!producer.verified&&(contextRecovery.ownsFlight(frame,producer)||contextRecovery.ownsDelivery(frame,producer)||!['verified','pending'].includes(authority.peek(frame).state))?contextRecovery.run(frame,{
   attemptOwner:producer,signal:attempt.abort.signal,remainingMs:()=>6000-(elapsedNow()-attempt.started),
   isCurrent:()=>serviceActive&&attempt.active&&!producer.denied&&sequences.get(message.producerToken)===producer&&handshake.isBound(message,sender),
   authorize
  }):authorize({signal:attempt.abort.signal}));attempt.resolution=resolution;if(!focus)claimResolution(attempt,resolution);
  if(resolution.state!=='verified')firstSend?.invalidateTab(frame.tabId);
  if(focus&&resolution.state!=='verified'){denyFocus();revokeFocus();}check();
  const verified=await handshake.verify(message,sender);check();
  if(!verified){firstSend?.invalidateTab(frame.tabId);if(focus&&resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant)authority.invalidate(frame.documentId);revokeFocus();return {ok:false,reason:'stale-host-document'};}
  if(resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant){const scope=authority.scopeFor(frame);if(scope)views?.confirmScope(frame,scope.key);}
  const recoveryProfiles=[...(surfaceProfiles?.size===1?[surfaceProfiles.values().next().value]:[]),...(ackProfile&&resolution.grant?.principal?.providerProfile===ackProfile.providerProfile?[ackProfile]:[])];
  if(!focus&&resolution.state==='verified'&&continuations&&recoveryProfiles.length&&elapsedNow()-attempt.started<4500){
   // Reuse the existing refresh request; no background timer or restored grant.
   // A slow/damaged queue must not consume the scope renewal's whole deadline.
   const scope=authority.scopeFor(frame),drainAbort=new AbortController(),started=elapsedNow();
   let active=true,abortSelection;
   const abort=()=>drainAbort.abort();attempt.abort.signal.addEventListener('abort',abort,{once:true});
   const guard=()=>active&&attempt.active&&!drainAbort.signal.aborted&&elapsedNow()-started<1000&&handshake.isBound(message,sender)&&authority.peek(frame).grant===resolution.grant;
   try{const drained=await withRequestDeadline(async()=>{
    // Validated durable data selects among current trusted profiles; it never
    // creates authority. Select before fresh observations advance source epochs.
    const cancelled=new Promise((_,reject)=>{abortSelection=()=>reject(Error('stale-continuation-authority'));drainAbort.signal.addEventListener('abort',abortSelection,{once:true});if(drainAbort.signal.aborted)abortSelection();});
    const rows=await Promise.race([track('background',()=>nativeRepository.listContinuations(scope,{guard,signal:drainAbort.signal})),cancelled]);if(!guard())throw Error('stale-continuation-authority');
    const queued=recoveryProfiles.filter(profile=>rows.some(row=>row.state==='pending-evidence'&&row.admission.profileId===profile.id)),eligible=queued.length?queued:recoveryProfiles;
    const activeProfile=eligible[recoveryProfileCursor++%eligible.length];
    return continuations.drain({scope,guard,verify:()=>handshake.verify(message,sender),signal:drainAbort.signal,profileId:activeProfile.id,profileVersion:activeProfile.revision});
   },{timeoutMs:1000,now:elapsedNow,schedule,cancel});if(drained.state==='complete'||drained.state==='needs-revalidation')ui?.notifyScope(scope.key);}catch{}finally{active=false;if(abortSelection)drainAbort.signal.removeEventListener('abort',abortSelection);drainAbort.abort();attempt.abort.signal.removeEventListener('abort',abort);}
   check();
   const stillVerified=await handshake.verify(message,sender);check();
   if(!stillVerified||authority.peek(frame).grant!==resolution.grant)return {ok:false,reason:'stale-host-document'};
  }
  if(resolution.state==='verified'&&(authority.peek(frame).grant!==resolution.grant||sequences.get(message.producerToken)!==producer))return {ok:false,reason:'stale-host-document'};
  return {ok:true,v:1,type:'HOST_SCOPE_STATUS',state:resolution.state,...(resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant?{scopeKey:authority.scopeFor(frame)?.key}:{}),...(resolution.reason?{reason:resolution.reason}:{})};
  }),{timeoutMs:6000,now:elapsedNow,schedule,cancel});
  if(result.ok===true&&result.state==='verified'){
   check();
   if(!attempt.frame||authority.peek(attempt.frame).grant!==attempt.resolution?.grant||sequences.get(message.producerToken)!==attempt.producer||!handshake.isBound(message,sender))return {ok:false,reason:'stale-host-document'};
   attempt.producer.verified=true;
   if(attempt.resolutionClaim){attempt.resolutionClaim.delivered=true;contextRecovery?.confirmDelivery(attempt.frame,attempt.producer,attempt.resolutionClaim.grant);}
  }
  attempt.completed=true;return result;}catch{return {ok:false,reason:'host-refresh-unavailable'};}
  finally{refreshAttempts.delete(attempt);attempt.active=false;attempt.abort.abort();if(!attempt.completed){denyFocus();revokeFocus();}
  if(!attempt.completed&&attempt.frame)firstSend?.invalidateTab(attempt.frame.tabId);
  if(focus&&!attempt.completed&&attempt.frame&&attempt.resolution?.state==='verified'&&authority.peek(attempt.frame).grant===attempt.resolution.grant)authority.invalidate(attempt.frame.documentId);releaseResolution(attempt);}
 }
 function invalidate({tabId,frameId=0,documentId,firstSendNavigation=null,preserveViewDocumentId=null}={}){contextRecovery?.invalidate({tabId,documentId});oldSendTerminal?.invalidateTab(tabId);if(firstSendNavigation)firstSend?.navigate({tabId,...firstSendNavigation});else firstSend?.invalidateTab(tabId);broker.invalidate({tabId,frameId});if(documentId){ingestionPasses?.invalidateDocument(documentId);observations?.invalidateDocument(documentId);authority.invalidate(documentId);ui?.revokeDocument(documentId);views?.revokeDocument(documentId);}else{ingestionPasses?.invalidateTab(tabId);observations?.invalidateTab(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId,{preserveDocumentId:preserveViewDocumentId});}}
 function tabClosed(tabId){contextRecovery?.forgetTab(tabId);ingestionPasses?.invalidateTab(tabId);oldSendTerminal?.invalidateTab(tabId);firstSend?.invalidateTab(tabId);observations?.invalidateTab(tabId);broker.tabClosed(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId);}
 function stop(){if(!serviceActive)return;serviceActive=false;contextRecovery?.stop();identityOwner?.stop();entryCalibration?.stop();ingestionPasses?.stop();currentNavigation?.stop();candidates?.stop();views?.stop();snippets?.stop();oldSendTerminal?.stop();firstSend?.stop();sendCandidates?.stop();ackOwner?.stop();historyOwner?.stop();nativeActivity?.stop();for(const attempt of nativeActivityAttempts)attempt.abort.abort();currentMetadata?.stop();observations?.stop();recovery?.stop();backup?.stop();for(const attempt of refreshAttempts){attempt.active=false;attempt.abort.abort();}refreshAttempts.clear();authority.invalidateAll();}
 // Internal worker composition only; no page RPC exposes metadata or accepts proof IDs.
 const consumeNativeActivity=(proof,frame)=>track('background',async()=>{
  const started=elapsedNow(),abort=new AbortController();let active=true,used=false;
  const attempt={abort};nativeActivityAttempts.add(attempt);
  let rejectAbort;const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('native-activity-unverified'));abort.signal.addEventListener('abort',rejectAbort,{once:true});});
  try{return await withRequestDeadline(()=>Promise.race([aborted,(async()=>{
  if(!nativeActivity)throw Error('native-activity-disabled');
  const resolution=authority.peek(frame),source=authority.sourceFor(frame),scope=authority.scopeFor(frame);
  if(resolution.state!=='verified'||!source||!scope||resolution.grant.principal.providerProfile!==activityProfile.providerProfile)throw Error('native-activity-unverified');
  const actual=await getFrame({tabId:frame.tabId,frameId:0});
  if(actual?.documentId!==frame.documentId||actual.url!==frame.actualURL||actual.documentLifecycle!=='active')throw Error('native-activity-unverified');
  const guard=()=>serviceActive&&active&&!abort.signal.aborted&&elapsedNow()-started>=0&&elapsedNow()-started<6000&&authority.peek(frame).grant===resolution.grant&&authority.sourceFor(frame)===source;
  if(!guard())throw Error('native-activity-unverified');
  return provider.withNativeActivity(proof,async({observation,signal,isCurrent})=>{
   if(used||typeof isCurrent!=='function'||!signal)throw Error('native-activity-unverified');
   used=true;const current=()=>guard()&&isCurrent()===true&&!signal.aborted;
   const result=await nativeActivity.consume({observation,context:{scope,providerProfile:activityProfile.providerProfile,signal:abort.signal},guard:current});
   if(!current())throw Error('native-activity-unverified');ui?.notifyScope(scope.key);return result;
  });
  })()]),{now:elapsedNow,schedule,cancel});}finally{active=false;abort.abort();abort.signal.removeEventListener('abort',rejectAbort);nativeActivityAttempts.delete(attempt);}
 });
 const readCurrentMetadata=proofId=>track('requests',()=>currentMetadata?currentMetadata.read(proofId):Promise.reject(Error('current-metadata-unavailable')));
 const handle=(message,sender)=>track('requests',()=>handleWork(message,sender));
 // A conservative local snapshot only; not a document close/admission permit.
 function isIdle(){
  if(!serviceActive||activity.requests||activity.background||refreshAttempts.size)return false;
  return ownersIdle();
 }
 // Exclude exactly this request and its UI handler, not unrelated in-flight work.
 function canReleaseIdleMount(){
  const quiet=()=>serviceActive&&activity.requests===1&&activity.background===0&&refreshAttempts.size===0;
  return quiet()&&ownersIdle(true)&&quiet();
 }
 function ownersIdle(excludeUi=false){
  return [authority,contextRecovery,continuations,nativeActivity,...(excludeUi?[]:[ui]),observations,ingestionPasses,currentMetadata,sendCandidates,firstSend,oldSendTerminal,backup,recovery,views].every(owner=>owner===null||owner.isIdle?.()===true);
 }
 return Object.freeze({isIdle,consumeNativeActivity,activityAdmission:(scope,request)=>nativeActivity?.gate(scope,request)??null,oldSendTerminal,firstSend,ackAdmission:(scope,request)=>ackOwner?.gate(scope,request)??historyOwner?.gate(scope,request)??null,sendCandidates,readCurrentMetadata,stop,connectPort:port=>serviceActive&&(ui?.connectPort(port)??false),handle,invalidate,tabClosed,broker,handshake,authority,nativeRepository,observations,continuations,readService,ui,views});
}
