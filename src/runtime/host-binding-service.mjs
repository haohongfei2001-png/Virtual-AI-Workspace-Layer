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
export function createHostBindingService({extensionId,getFrame,getContexts=null,allowedURL,provider,profile,repository,surfaceProfiles=null,currentMetadataReadEnabled=false,sendCandidatesEnabled=false,uiURL=null,uiURLs=null,workspaceRepository=null,freeEvidenceRepository=null,prepareNavigation=null,presentSurface=null,selectionBridge=null,freeRuntime=null,now=Date.now,makeId=()=>crypto.randomUUID(),elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const handshake=createHostDocumentHandshake({extensionId,getFrame,allowedURL,now,makeId,elapsedNow,schedule,cancel});
 const authority=createScopeAuthority({provider,profile,allowedURL,now,makeId,elapsedNow,schedule,cancel});
 const asFrame=(doc,sender)=>({tabId:doc.tabId,frameId:0,documentId:doc.documentId,parentDocumentId:null,actualURL:doc.url,documentLifecycle:'active',incognito:sender.tab?.incognito===true});

 const ui=uiURL||uiURLs?createHostUiOwner({extensionId,uiURL,uiURLs,getFrame,getContexts,handshake,authority,now,makeId}):null;
 let sendCandidates=null;
 const observations=surfaceProfiles?createHostObservationOwner({handshake,authority,getFrame,profiles:surfaceProfiles,onAccepted:scope=>ui?.notifyScope(scope.key),onSendIntent:(proof,intent)=>sendCandidates?.intent(proof,intent),now,makeId,elapsedNow,schedule,cancel}):null;
 const currentMetadata=observations?createCurrentMetadataReader({observations,provider,enabled:currentMetadataReadEnabled,now}):null;
 sendCandidates=currentMetadata?createHostSendCandidates({observations,reader:currentMetadata,enabled:sendCandidatesEnabled,now}):null;
 const nativeRepository=observations?new NativeRepository({baseRepository:repository,workspaceRepository,hostObservationGate:observations.gate,clock:()=>new Date(now()).toISOString()}):null;
 const continuations=nativeRepository&&typeof freeEvidenceRepository?.applyContinuation==='function'?createHostContinuationOwner({nativeRepository,evidenceRepository:freeEvidenceRepository,profileFor:id=>surfaceProfiles.get(id)}):null;
 const readService=workspaceRepository&&freeEvidenceRepository&&nativeRepository?createFreeReadService({initializeTimePolicy:true,repository,workspaces:workspaceRepository,native:nativeRepository,evidence:freeEvidenceRepository,clock:()=>new Date(now()).toISOString()}):null;
 const views=ui&&readService?createHostViewService({ui,readService,workspaceRepository,prepareNavigation,presentSurface,clock:()=>new Date(now()).toISOString(),elapsedNow,schedule,cancel}):null;
 const snippets=ui&&views&&selectionBridge?createHostSnippetService({ui,workspaceRepository,resolveView:views.resolveSnippetView,selectionBridge,onChanged:scopeKey=>{views.refreshScope(scopeKey);ui.notifyScope?.(scopeKey);},elapsedNow,schedule,cancel,makeId}):null;
 const recovery=ui&&readService?createHostRecoveryService({ui,readService,workspaceRepository,onRecovered:scopeKey=>{views?.refreshScope(scopeKey);ui.notifyScope?.(scopeKey);},elapsedNow,schedule,cancel}):null;
 const backup=ui&&['exportBackup','previewRestore','restoreBackup'].every(name=>typeof workspaceRepository?.[name]==='function')?createHostBackupService({ui,workspaceRepository,onRestored:scopeKey=>{views?.refreshScope(scopeKey);ui.notifyScope?.(scopeKey);},elapsedNow,schedule,cancel,makeId}):null;
 const commands={};if(readService)for(const name of ['snapshot','command','undo','history','saveView','exportBackup','previewRestore','restoreBackup','recoveryStatus','recover'])if(typeof workspaceRepository[name]==='function')commands[name]=workspaceRepository[name].bind(workspaceRepository);
 const broker=createDocumentBindingBroker({extensionId,getFrame,allowedURL,repository,workspaceRepository:readService?{...readService,...commands}:workspaceRepository,freeRuntime,now,makeId,hostHandshake:handshake,resolveScope:({currentFrame,sender})=>authority.scopeFor(asFrame(currentFrame,sender))});
 const sequences=new Map(),refreshAttempts=new Set();let serviceActive=true;
 async function handle(message,sender){
  if(!serviceActive)return {ok:false,reason:'host-service-stopped'};
  if(['HOST_UI_SNIPPET','HOST_UI_SNIPPET_LIST'].includes(message?.type))return snippets?snippets.handle(message,sender):{ok:false,reason:'snippet-unavailable'};
  if(BACKUP_TYPES.includes(message?.type))return backup?backup.handle(message,sender):{ok:false,reason:'backup-unavailable'};
  if(['HOST_UI_RECOVERY_STATUS','HOST_UI_RECOVER'].includes(message?.type))return recovery?recovery.handle(message,sender):{ok:false,reason:'recovery-unavailable'};
  if(message?.type==='HOST_DOCUMENT_RENEW')return handshake.renew(message,sender);
  if(message?.type==='HOST_UI_WORKING_SET')return views?views.setWorkingSet(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_SET_HORIZON')return views?views.setHorizon(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_UNDO_AUTO_HORIZON')return views?views.undoAutoHorizon(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_CURRENT_ENTRY')return views?views.enterCurrent(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_PRESENT')return views?views.present(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(message?.type==='HOST_UI_VIEW')return views?views.handle(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(typeof message?.type==='string'&&message.type.startsWith('HOST_UI_'))return ui?ui.handle(message,sender):{ok:false,reason:'host-ui-unavailable'};
  if(message?.protocol==='vaiwl-host-observation/1'){
   if(!observations)return {state:'rejected',localSeq:message.localSeq,reason:'host-observations-unavailable'};
   const result=await observations.ingest(message,sender,nativeRepository);
   if(message.kind==='current-object'&&result.bodyProofId&&['accepted','duplicate'].includes(result.state))sendCandidates?.observe(result.bodyProofId).catch(()=>{});
   return result;
  }
  if(message?.type!=='HOST_REFRESH')return broker.handle(message,sender);
  if(!exactHostRecord(message,['v','type','clientId','seq','documentToken','producerToken','routeEpoch'])||message.v!==1||!tokenOK(message.clientId)||!Number.isSafeInteger(message.seq)||message.seq<1||!tokenOK(message.documentToken)||!tokenOK(message.producerToken)||!Number.isSafeInteger(message.routeEpoch)||message.routeEpoch<1)return {ok:false,reason:'invalid-host-refresh'};
  const attempt={active:true,started:elapsedNow(),abort:new AbortController(),frame:null,resolution:null,completed:false};
  refreshAttempts.add(attempt);
  const check=()=>{if(!serviceActive||!attempt.active||elapsedNow()-attempt.started>=6000)throw Error('host-refresh-expired');};
  try{const result=await withRequestDeadline(async()=>{
  if(!await handshake.verify(message,sender))return {ok:false,reason:'invalid-host-document'};check();
  const prior=sequences.get(message.producerToken);if(prior&&message.seq<=prior.seq)return {ok:false,reason:'replayed-sequence'};
  const time=now();for(const [key,value]of sequences)if(value.until<=time)sequences.delete(key);
  if(!sequences.has(message.producerToken)&&sequences.size>=128)return {ok:false,reason:'capacity'};
  const producer=prior??{verified:false,freshStarted:false};producer.seq=message.seq;producer.until=time+20000;sequences.set(message.producerToken,producer);
  const actual=await getFrame({tabId:sender.tab.id,frameId:0});check();
  if(!handshake.matchesFrame(message,sender,actual)||!await handshake.verify(message,sender))return {ok:false,reason:'stale-host-document'};check();
  const frame=asFrame({tabId:sender.tab.id,documentId:actual.documentId,url:actual.url},sender);
  attempt.frame=frame;
  // A newly issued producer must not reuse a pre-suspension account proof.
  // Ordinary renewals keep the existing bounded revalidation/single-flight path.
  const firstFresh=!producer.verified&&!producer.freshStarted;
  if(firstFresh){producer.freshStarted=true;observations?.invalidateDocument(frame.documentId);ui?.revokeDocument(frame.documentId);views?.revokeDocument(frame.documentId);}
  const resolution=await (!producer.verified?authority.refresh(frame,firstFresh?'auth-change':'focus',attempt.abort.signal):authority.peek(frame).state==='verified'?authority.revalidate(frame,attempt.abort.signal):authority.refresh(frame,'bind',attempt.abort.signal));attempt.resolution=resolution;check();
  const verified=await handshake.verify(message,sender);check();
  if(!verified){if(resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant)authority.invalidate(frame.documentId);return {ok:false,reason:'stale-host-document'};}
  if(resolution.state==='verified'&&continuations&&surfaceProfiles.size===1&&elapsedNow()-attempt.started<4500){
   // Reuse the existing refresh request; no background timer or restored grant.
   // A slow/damaged queue must not consume the scope renewal's whole deadline.
   const activeProfile=surfaceProfiles.values().next().value,scope=authority.scopeFor(frame),drainAbort=new AbortController(),started=elapsedNow();
   let active=true;
   const abort=()=>drainAbort.abort();attempt.abort.signal.addEventListener('abort',abort,{once:true});
   const guard=()=>active&&attempt.active&&!drainAbort.signal.aborted&&elapsedNow()-started<1000&&handshake.isBound(message,sender)&&authority.peek(frame).grant===resolution.grant;
   try{const drained=await withRequestDeadline(()=>continuations.drain({scope,guard,verify:()=>handshake.verify(message,sender),signal:drainAbort.signal,profileId:activeProfile.id,profileVersion:activeProfile.revision}),{timeoutMs:1000,now:elapsedNow,schedule,cancel});if(drained.state==='complete'||drained.state==='needs-revalidation')ui?.notifyScope(scope.key);}catch{}finally{active=false;drainAbort.abort();attempt.abort.signal.removeEventListener('abort',abort);}
   check();
   const stillVerified=await handshake.verify(message,sender);check();
   if(!stillVerified||authority.peek(frame).grant!==resolution.grant)return {ok:false,reason:'stale-host-document'};
  }
  if(resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant&&sequences.get(message.producerToken)===producer)producer.verified=true;
  return {ok:true,v:1,type:'HOST_SCOPE_STATUS',state:resolution.state,...(resolution.reason?{reason:resolution.reason}:{})};
  },{timeoutMs:6000,now:elapsedNow,schedule,cancel});attempt.completed=true;return result;}catch{return {ok:false,reason:'host-refresh-unavailable'};}
  finally{refreshAttempts.delete(attempt);attempt.active=false;attempt.abort.abort();if(!attempt.completed&&attempt.frame&&attempt.resolution?.state==='verified'&&authority.peek(attempt.frame).grant===attempt.resolution.grant)authority.invalidate(attempt.frame.documentId);}
 }
 function invalidate({tabId,frameId=0,documentId}={}){broker.invalidate({tabId,frameId});if(documentId){observations?.invalidateDocument(documentId);authority.invalidate(documentId);ui?.revokeDocument(documentId);views?.revokeDocument(documentId);}else{observations?.invalidateTab(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId);}}
 function tabClosed(tabId){observations?.invalidateTab(tabId);broker.tabClosed(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId);}
 function stop(){if(!serviceActive)return;serviceActive=false;snippets?.stop();sendCandidates?.stop();currentMetadata?.stop();observations?.stop();recovery?.stop();backup?.stop();for(const attempt of refreshAttempts){attempt.active=false;attempt.abort.abort();}refreshAttempts.clear();authority.invalidateAll();}
 // Internal worker composition only; no page RPC exposes metadata or accepts proof IDs.
 const readCurrentMetadata=proofId=>currentMetadata?currentMetadata.read(proofId):Promise.reject(Error('current-metadata-unavailable'));
 return Object.freeze({sendCandidates,readCurrentMetadata,stop,connectPort:port=>serviceActive&&(ui?.connectPort(port)??false),handle,invalidate,tabClosed,broker,handshake,authority,nativeRepository,observations,continuations,readService,ui,views});
}
