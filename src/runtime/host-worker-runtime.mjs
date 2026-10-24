import {createBrowserLocalControl} from './browser-local-control.mjs';
import {createBrowserOldSendTerminal} from './browser-old-send-terminal.mjs';
import {createSharedHostReadBudget} from './shared-host-read-budget.mjs';
import {createBrowserFirstSend} from './browser-first-send.mjs';
import {createHostBrowserBootstrap} from './host-browser-bootstrap.mjs';
import {ScopeRepository} from '../b1/scope-repository.mjs';
import {WorkspaceRepository} from '../data/repository.mjs';
import {FreeEvidenceRepository} from '../data/free-evidence-repository.mjs';
import {selectHostSurfaceProfile} from '../host/chatgpt-observed-profile.mjs';
import {createURLPolicy} from '../host/url-policy.mjs';
import {createHostBindingService} from './host-binding-service.mjs';
import {createSessionProvider} from './session-provider.mjs';

/** Zero-seed worker composition. Configuration is packaged code, never page input. */
export function createHostWorkerRuntime({chrome,indexedDB,origin='https://chatgpt.com',scopeProfile={id:'chatgpt-context-unverified',singlePersonalDefault:false},provider=null,surfaceProfile=undefined,sessionProfile={},currentMetadataReadEnabled=false,sendCandidatesEnabled=false,sendAckProfile=null,historicalSendProfile=null,nativeActivityProfile=null,offlineFirstSend=false,offlineOldSendTerminal=false,browserBootstrap=null,serviceFactory=createHostBindingService}={}){
 const browserLocal=scopeProfile.id==='browser-local-session';
 if(browserLocal&&(scopeProfile.singlePersonalDefault!==false||scopeProfile.browserRequestContext||currentMetadataReadEnabled||sendCandidatesEnabled||sendAckProfile||historicalSendProfile||nativeActivityProfile||offlineFirstSend||offlineOldSendTerminal||provider))throw Error('local-mode-network-source-forbidden');
 const baseSurfaceProfile=selectHostSurfaceProfile(surfaceProfile),selectedSurfaceProfile=browserLocal?{...baseSurfaceProfile,currentBody:null,visibleNavigationOnly:true}:baseSurfaceProfile;
 const conversationRequestContext=scopeProfile.conversationRequestContext??null;
 if(Object.hasOwn(sessionProfile,'conversationRequestContext')&&(sessionProfile.conversationRequestContext??null)!==conversationRequestContext)throw Error('host-conversation-profile-mismatch');
 const policy=createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}});
 if(!chrome?.runtime?.id||typeof chrome.runtime.getContexts!=='function'||typeof chrome.webNavigation?.getFrame!=='function')throw Error('host-browser-unavailable');
 // Only the packaged, immutable URL grammar is memoized. A hit carries no
 // document, scope, grant, epoch or expiry; every caller retains its live fence.
 // Key by the original string so URL normalization cannot bless a rejected alias.
 const urlClassifications=new Map();
 const allowedURL=value=>{
  if(typeof value!=='string'||value.length===0||value.length>8192)return false;
  if(urlClassifications.has(value)){const result=urlClassifications.get(value);urlClassifications.delete(value);urlClassifications.set(value,result);return result;}
  let result=false;try{result=new URL(value).origin===origin&&policy.nativeHref(value)!==null;}catch{}
  if(urlClassifications.size===4)urlClassifications.delete(urlClassifications.keys().next().value);
  urlClassifications.set(value,result);return result;
 };
 let service,repository,localControl=null,oldSendObserver=null,firstSendObserver=null,active=true;const listeners=[];
 const bootstrap=browserBootstrap??createHostBrowserBootstrap({chrome,origin,scopeProfile}),browserOwner=bootstrap.claim({chrome,origin,scopeProfile}),contextObserver=browserOwner.contextObserver;
 try{
 repository=new ScopeRepository({indexedDB});const workspaceRepository=new WorkspaceRepository({baseRepository:repository}),freeEvidenceRepository=new FreeEvidenceRepository({baseRepository:repository,hostObservationGate:(scope,request)=>service?.ackAdmission?.(scope,request)??service?.activityAdmission?.(scope,request)??service?.continuations?.admission(scope,request)});
 const readBudget=createSharedHostReadBudget({repository});
 service=serviceFactory({readBudget,extensionId:chrome.runtime.id,repository,workspaceRepository,freeEvidenceRepository,allowedURL,contextObserver,provider:browserLocal?{read:async()=>{throw Error('local-mode-has-no-identity-provider');}}:provider??createSessionProvider({origin,readBudget,profile:{...sessionProfile,conversationRequestContext,currentConversationReadEnabled:currentMetadataReadEnabled,...(sendAckProfile?{sendAckProfile}:{} ),...(historicalSendProfile?{historicalSendProfile}:{})}}),currentMetadataReadEnabled,sendCandidatesEnabled,sendAckProfile,historicalSendProfile,nativeActivityProfile,firstSendOrigin:offlineFirstSend?origin:null,oldSendTerminalOrigin:offlineOldSendTerminal?origin:null,profile:scopeProfile,
  identityOrigin:origin,isolatedIdentityDispatch:(frame,command)=>chrome.tabs.sendMessage(frame.tabId,command,{documentId:frame.documentId}),
  navigationURLPolicy:policy,surfaceProfiles:new Map([[selectedSurfaceProfile.id,{...selectedSurfaceProfile,urlPolicy:policy}]]),
  uiURLs:Object.fromEntries(['workspace','sidebar'].map(role=>[role,chrome.runtime.getURL(role+'.html')])),
  getContexts:filter=>chrome.runtime.getContexts(filter),getFrame:query=>chrome.webNavigation.getFrame(query),
  presentSurface:({parentFrame,binding,mode})=>chrome.tabs.sendMessage(parentFrame.tabId,{type:'HOST_PRESENT_SURFACE',...binding,mode},{documentId:parentFrame.documentId}),
  selectionBridge:async({context,ref,phase,selectionId=null,anchor=null,guard=()=>false,remainingMs=0})=>{
   if(phase==='restore'){
    if(guard()!==true||!Number.isFinite(remainingMs)||remainingMs<=0||remainingMs>6000)return {ok:false};
    const expiresAt=new Date(Date.now()+remainingMs).toISOString();
    const restored=await chrome.tabs.sendMessage(context.parentFrame.tabId,{type:'HOST_SNIPPET_RESTORE',...context.binding,scopeGrantId:context.scopeGrantId,ref:{id:ref.id,nativeUrl:ref.nativeUrl},anchor,expiresAt},{documentId:context.parentFrame.documentId});
    return {ok:restored?.ok===true&&guard()===true&&context.isCurrent()===true};
   }
   if(phase==='capture'&&(guard()!==true||!context.isCurrent()||!Number.isFinite(remainingMs)||remainingMs<=0||remainingMs>6000))return null;
   const result=await chrome.tabs.sendMessage(context.parentFrame.tabId,{type:'HOST_SNIPPET_SELECTION',...context.binding,scopeGrantId:context.scopeGrantId,phase,ref:{id:ref.id,nativeUrl:ref.nativeUrl},selectionId,...(phase==='capture'?{expiresAt:new Date(Date.now()+remainingMs).toISOString()}:{})},{documentId:context.parentFrame.documentId});
   if(phase==='capture')return result?.ok===true?{selectionId:result.selectionId,anchor:result.anchor}:null;
   return result;
  },
  candidateBridge:async({context,phase,candidate,actionId,display,uiGrantId,mountId,offset=0,guard=()=>true,remainingMs=6000})=>{
   if(!guard()||!context.isCurrent())return {state:'blocked'};
   const message={type:'HOST_CANDIDATES',...context.binding,phase,role:context.role,...(phase==='list'?{offset}:{})};
   if(phase==='activate'){
    if(!Number.isFinite(remainingMs)||remainingMs<=0||remainingMs>6000)return {state:'blocked'};
    Object.assign(message,{candidate,actionId,...(display?{display}:{}),uiGrantId,mountId,expiresAt:new Date(Date.now()+remainingMs).toISOString()});
   }
   return chrome.tabs.sendMessage(context.parentFrame.tabId,message,{documentId:context.parentFrame.documentId});
  },
  dispatchCurrent:({context,command,mode,guard,remainingMs,navigationURL})=>{
   if(!guard()||!context.isCurrent()||!Number.isFinite(remainingMs)||remainingMs<=0||remainingMs>6000)return {state:'blocked'};
   if(browserLocal&&mode==='native-control')service.authority.prepareNavigation(context.parentFrame,navigationURL);
   return chrome.tabs.sendMessage(context.parentFrame.tabId,{type:mode==='cancel'?'HOST_NATIVE_CANCEL_PLAN':mode==='native-control'?'HOST_NATIVE_DISPATCH_PLAN':'HOST_NATIVE_DISPATCH_CURRENT',...context.binding,command,expiresAt:new Date(Date.now()+remainingMs).toISOString()},{documentId:context.parentFrame.documentId});
  },
  prepareNavigation:({parentFrame,binding,targets})=>chrome.tabs.sendMessage(parentFrame.tabId,{type:'HOST_NATIVE_PLAN',...binding,targets},{documentId:parentFrame.documentId})});
 oldSendObserver=offlineOldSendTerminal?createBrowserOldSendTerminal({webRequest:chrome.webRequest,origin,onTerminal:event=>service.oldSendTerminal?.terminal(event)}):null;
 firstSendObserver=offlineFirstSend?createBrowserFirstSend({webRequest:chrome.webRequest,origin,onSubmit:event=>service.firstSend?.submit(event)}):null;
 localControl=browserLocal?createBrowserLocalControl({chrome,service,allowedURL,urlPolicy:policy,origin}):null;
 const message=(value,sender,reply)=>{if(!active)return;Promise.resolve().then(async()=>{if(!active)return null;if(localControl&&value?.type==='HOST_LOCAL_SPACE')return localControl.handle(value,sender);if(localControl&&['HOST_HELLO','HOST_REFRESH','HOST_FOCUS'].includes(value?.type))await localControl.resume(sender);return active?service.handle(value,sender):null;}).then(result=>{if(active)reply(result);},()=>{if(active)reply({ok:false,reason:'host-unavailable'});});return true;};
 const connect=port=>{try{if(active&&service.connectPort(port))return;}catch{}try{port.disconnect();}catch{}};
 const invalidate=(details,replacement=false)=>{
  if(!active||details.frameId!==0||!Number.isSafeInteger(details.tabId))return;
  localControl?.navigate(details,replacement);
  // A replacement document also revokes the prior tab document's scope/UI.
  if(replacement){firstSendObserver?.invalidateTab(details.tabId);service.firstSend?.invalidateTab(details.tabId);}
  // Only a trusted same-document browser event may retain display metadata.
  // All tab authority is still revoked synchronously, even on SPA navigation.
  oldSendObserver?.invalidateTab(details.tabId);service.invalidate({tabId:details.tabId,...(browserLocal&&!replacement?{localNavigation:{documentId:details.documentId,url:details.url,documentLifecycle:details.documentLifecycle}}:{}),...(!replacement&&allowedURL(details.url)&&typeof details.documentId==='string'&&details.documentId.length>0?{preserveViewDocumentId:details.documentId}:{}),...(!replacement&&offlineFirstSend?{firstSendNavigation:{browserDocumentId:details.documentId,url:details.url,navigatedAt:details.timeStamp}}:{})});
  if(browserLocal&&!replacement&&allowedURL(details.url))void service.acceptLocalArrival({tabId:details.tabId,frameId:0,documentId:details.documentId,actualURL:details.url,documentLifecycle:details.documentLifecycle,incognito:false});
  if(allowedURL(details.url)&&typeof details.documentId==='string')Promise.resolve().then(()=>active?chrome.tabs.sendMessage(details.tabId,{type:'HOST_DOCUMENT_INVALIDATED'},{documentId:details.documentId}):null).catch(()=>{});
 };
 const removed=tabId=>{if(active){void localControl?.forget(tabId);oldSendObserver?.invalidateTab(tabId);firstSendObserver?.invalidateTab(tabId);service.firstSend?.invalidateTab(tabId);service.tabClosed(tabId);}};
 listeners.push([chrome.runtime.onMessage,message],[chrome.runtime.onConnect,connect]);
 for(const [event,listener]of listeners)event.addListener(listener);
 browserOwner.attach({onNavigation:invalidate,onRemoved:removed,
  onContextInvalidate:({tabId,documentId})=>{service.invalidate({tabId,documentId});return chrome.tabs.sendMessage(tabId,{type:'HOST_CONTEXT_PENDING'},{documentId});},
  onContextReady:({tabId,documentId})=>chrome.tabs.sendMessage(tabId,{type:'HOST_CONTEXT_READY'},{documentId})});
 return Object.freeze({service,stop});
 }catch(error){stop();throw error;}
 function stop(){if(!active)return;active=false;localControl?.stop();urlClassifications.clear();oldSendObserver?.stop();firstSendObserver?.stop();browserOwner.stop();service?.stop?.();for(const [event,listener]of listeners)event.removeListener(listener);service?.ui?.revokeAll();service?.views?.stop();repository?.close();}
}
