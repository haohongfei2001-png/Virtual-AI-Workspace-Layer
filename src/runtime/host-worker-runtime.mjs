import {createSharedHostReadBudget} from './shared-host-read-budget.mjs';
import {createBrowserFirstSend} from './browser-first-send.mjs';
import {createBrowserRequestContext} from './browser-request-context.mjs';
import {ScopeRepository} from '../b1/scope-repository.mjs';
import {WorkspaceRepository} from '../data/repository.mjs';
import {FreeEvidenceRepository} from '../data/free-evidence-repository.mjs';
import {LEGACY_SURFACE_PROFILE} from '../host/surface-discovery.mjs';
import {createURLPolicy} from '../host/url-policy.mjs';
import {createHostBindingService} from './host-binding-service.mjs';
import {createSessionProvider} from './session-provider.mjs';

/** Zero-seed worker composition. Configuration is packaged code, never page input. */
export function createHostWorkerRuntime({chrome,indexedDB,origin='https://chatgpt.com',scopeProfile={id:'chatgpt-context-unverified',singlePersonalDefault:false},provider=null,sessionProfile={},currentMetadataReadEnabled=false,sendCandidatesEnabled=false,sendAckProfile=null,historicalSendProfile=null,offlineFirstSend=false,serviceFactory=createHostBindingService}={}){
 const policy=createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}});
 if(!chrome?.runtime?.id||typeof chrome.runtime.getContexts!=='function'||typeof chrome.webNavigation?.getFrame!=='function')throw Error('host-browser-unavailable');
 const allowedURL=value=>{try{return new URL(value).origin===origin&&policy.nativeHref(value)!==null;}catch{return false;}};
 let service;
 const contextObserver=scopeProfile.browserRequestContext===true?createBrowserRequestContext({webRequest:chrome.webRequest,getTab:id=>chrome.tabs.get(id),getFrame:q=>chrome.webNavigation.getFrame(q),origin,associatePage:({tabId,documentId,...query})=>chrome.tabs.sendMessage(tabId,{type:'HOST_CONTEXT_ASSOCIATE',...query},{documentId}),onInvalidate:({tabId,documentId})=>{service?.invalidate({tabId,documentId});return chrome.tabs.sendMessage(tabId,{type:'HOST_CONTEXT_PENDING'},{documentId});},onReady:({tabId,documentId})=>chrome.tabs.sendMessage(tabId,{type:'HOST_CONTEXT_READY'},{documentId})}):null;
 const repository=new ScopeRepository({indexedDB}),workspaceRepository=new WorkspaceRepository({baseRepository:repository}),freeEvidenceRepository=new FreeEvidenceRepository({baseRepository:repository,hostObservationGate:(scope,request)=>service?.ackAdmission?.(scope,request)??service?.continuations?.admission(scope,request)});
 const readBudget=createSharedHostReadBudget({repository});
 service=serviceFactory({readBudget,extensionId:chrome.runtime.id,repository,workspaceRepository,freeEvidenceRepository,allowedURL,contextObserver,provider:provider??createSessionProvider({origin,readBudget,profile:{...sessionProfile,currentConversationReadEnabled:currentMetadataReadEnabled,...(sendAckProfile?{sendAckProfile}:{} ),...(historicalSendProfile?{historicalSendProfile}:{})}}),currentMetadataReadEnabled,sendCandidatesEnabled,sendAckProfile,historicalSendProfile,firstSendOrigin:offlineFirstSend?origin:null,profile:scopeProfile,
  navigationURLPolicy:policy,surfaceProfiles:new Map([[LEGACY_SURFACE_PROFILE.id,{...LEGACY_SURFACE_PROFILE,urlPolicy:policy}]]),
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
   const result=await chrome.tabs.sendMessage(context.parentFrame.tabId,{type:'HOST_SNIPPET_SELECTION',...context.binding,scopeGrantId:context.scopeGrantId,phase,ref:{id:ref.id,nativeUrl:ref.nativeUrl},selectionId},{documentId:context.parentFrame.documentId});
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
  dispatchCurrent:({context,command,mode,guard,remainingMs})=>{
   if(!guard()||!context.isCurrent()||!Number.isFinite(remainingMs)||remainingMs<=0||remainingMs>6000)return {state:'blocked'};
   return chrome.tabs.sendMessage(context.parentFrame.tabId,{type:mode==='native-control'?'HOST_NATIVE_DISPATCH_PLAN':'HOST_NATIVE_DISPATCH_CURRENT',...context.binding,command,expiresAt:new Date(Date.now()+remainingMs).toISOString()},{documentId:context.parentFrame.documentId});
  },
  prepareNavigation:({parentFrame,binding,targets})=>chrome.tabs.sendMessage(parentFrame.tabId,{type:'HOST_NATIVE_PLAN',...binding,targets},{documentId:parentFrame.documentId})});
 const firstSendObserver=offlineFirstSend?createBrowserFirstSend({webRequest:chrome.webRequest,origin,onSubmit:event=>service.firstSend?.submit(event)}):null;
 let active=true;
 const message=(value,sender,reply)=>{if(!active)return;Promise.resolve().then(()=>active?service.handle(value,sender):null).then(result=>{if(active)reply(result);},()=>{if(active)reply({ok:false,reason:'host-unavailable'});});return true;};
 const connect=port=>{try{if(active&&service.connectPort(port))return;}catch{}try{port.disconnect();}catch{}};
 const invalidate=(details,replacement=false)=>{
  if(!active||details.frameId!==0||!Number.isSafeInteger(details.tabId))return;
  // A replacement document also revokes the prior tab document's scope/UI.
  if(replacement){firstSendObserver?.invalidateTab(details.tabId);service.firstSend?.invalidateTab(details.tabId);}
  contextObserver?.invalidateTab(details.tabId);
  service.invalidate({tabId:details.tabId,...(!replacement&&offlineFirstSend?{firstSendNavigation:{browserDocumentId:details.documentId,url:details.url,navigatedAt:details.timeStamp}}:{})});
  if(allowedURL(details.url)&&typeof details.documentId==='string')Promise.resolve().then(()=>active?chrome.tabs.sendMessage(details.tabId,{type:'HOST_DOCUMENT_INVALIDATED'},{documentId:details.documentId}):null).catch(()=>{});
 };
 const removed=tabId=>{if(active){firstSendObserver?.invalidateTab(tabId);service.firstSend?.invalidateTab(tabId);contextObserver?.invalidateTab(tabId);service.tabClosed(tabId);}};
 const committed=details=>invalidate(details,true),historyChanged=details=>invalidate(details,false);
 const listeners=[[chrome.runtime.onMessage,message],[chrome.runtime.onConnect,connect],[chrome.webNavigation.onCommitted,committed],[chrome.webNavigation.onHistoryStateUpdated,historyChanged],[chrome.tabs.onRemoved,removed]];
 for(const [event,listener]of listeners)event.addListener(listener);
 function stop(){if(!active)return;active=false;firstSendObserver?.stop();contextObserver?.stop();service.stop?.();for(const [event,listener]of listeners)event.removeListener(listener);service.ui?.revokeAll();service.views?.stop();repository.close();}
 return Object.freeze({service,stop});
}
