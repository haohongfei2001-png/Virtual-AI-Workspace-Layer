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
export function createHostBindingService({extensionId,getFrame,getContexts=null,allowedURL,provider,profile,repository,surfaceProfiles=null,uiURL=null,uiURLs=null,workspaceRepository=null,freeEvidenceRepository=null,prepareNavigation=null,freeRuntime=null,now=Date.now,makeId=()=>crypto.randomUUID(),elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const handshake=createHostDocumentHandshake({extensionId,getFrame,allowedURL,now,makeId,elapsedNow,schedule,cancel});
 const authority=createScopeAuthority({provider,profile,allowedURL,now,makeId});
 const asFrame=(doc,sender)=>({tabId:doc.tabId,frameId:0,documentId:doc.documentId,parentDocumentId:null,actualURL:doc.url,documentLifecycle:'active',incognito:sender.tab?.incognito===true});

 const ui=uiURL||uiURLs?createHostUiOwner({extensionId,uiURL,uiURLs,getFrame,getContexts,handshake,authority,now,makeId}):null;
 const observations=surfaceProfiles?createHostObservationOwner({handshake,authority,getFrame,profiles:surfaceProfiles,onAccepted:scope=>ui?.notifyScope(scope.key),now}):null;
 const nativeRepository=observations?new NativeRepository({baseRepository:repository,workspaceRepository,hostObservationGate:observations.gate,clock:()=>new Date(now()).toISOString()}):null;
 const readService=workspaceRepository&&freeEvidenceRepository&&nativeRepository?createFreeReadService({repository,workspaces:workspaceRepository,native:nativeRepository,evidence:freeEvidenceRepository,clock:()=>new Date(now()).toISOString()}):null;
 const views=ui&&readService?createHostViewService({ui,readService,prepareNavigation,clock:()=>new Date(now()).toISOString(),elapsedNow,schedule,cancel}):null;
 const commands={};if(readService)for(const name of ['snapshot','command','undo','history','saveView','exportBackup','previewRestore','restoreBackup','recoveryStatus','recover'])if(typeof workspaceRepository[name]==='function')commands[name]=workspaceRepository[name].bind(workspaceRepository);
 const broker=createDocumentBindingBroker({extensionId,getFrame,allowedURL,repository,workspaceRepository:readService?{...readService,...commands}:workspaceRepository,freeRuntime,now,makeId,hostHandshake:handshake,resolveScope:({currentFrame,sender})=>authority.scopeFor(asFrame(currentFrame,sender))});
 const sequences=new Map();
 async function handle(message,sender){
  if(message?.type==='HOST_DOCUMENT_RENEW')return handshake.renew(message,sender);
  if(message?.type==='HOST_UI_VIEW')return views?views.handle(message,sender):{ok:false,reason:'host-view-unavailable'};
  if(typeof message?.type==='string'&&message.type.startsWith('HOST_UI_'))return ui?ui.handle(message,sender):{ok:false,reason:'host-ui-unavailable'};
  if(message?.protocol==='vaiwl-host-observation/1'){
   if(!observations)return {state:'rejected',localSeq:message.localSeq,reason:'host-observations-unavailable'};
   return observations.ingest(message,sender,nativeRepository);
  }
  if(message?.type!=='HOST_REFRESH')return broker.handle(message,sender);
  if(!exactHostRecord(message,['v','type','clientId','seq','documentToken','producerToken','routeEpoch'])||message.v!==1||!tokenOK(message.clientId)||!Number.isSafeInteger(message.seq)||message.seq<1||!tokenOK(message.documentToken)||!tokenOK(message.producerToken)||!Number.isSafeInteger(message.routeEpoch)||message.routeEpoch<1)return {ok:false,reason:'invalid-host-refresh'};
  try{
  if(!await handshake.verify(message,sender))return {ok:false,reason:'invalid-host-document'};
  const prior=sequences.get(message.producerToken);if(prior&&message.seq<=prior.seq)return {ok:false,reason:'replayed-sequence'};
  const time=now();for(const [key,value]of sequences)if(value.until<=time)sequences.delete(key);
  if(!sequences.has(message.producerToken)&&sequences.size>=128)return {ok:false,reason:'capacity'};
  sequences.set(message.producerToken,{seq:message.seq,until:time+20000});
  const actual=await getFrame({tabId:sender.tab.id,frameId:0});
  if(!await handshake.verify(message,sender))return {ok:false,reason:'stale-host-document'};
  const frame=asFrame({tabId:sender.tab.id,documentId:actual.documentId,url:actual.url},sender);
  const resolution=await authority.refresh(frame,'bind');
  if(!await handshake.verify(message,sender)){authority.invalidate(frame.documentId);return {ok:false,reason:'stale-host-document'};}
  return {ok:true,v:1,type:'HOST_SCOPE_STATUS',state:resolution.state,...(resolution.reason?{reason:resolution.reason}:{})};
  }catch{return {ok:false,reason:'host-refresh-unavailable'};}
 }
 function invalidate({tabId,frameId=0,documentId}={}){broker.invalidate({tabId,frameId});if(documentId){authority.invalidate(documentId);ui?.revokeDocument(documentId);views?.revokeDocument(documentId);}else{authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId);}}
 function tabClosed(tabId){broker.tabClosed(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId);}
 return Object.freeze({connectPort:port=>ui?.connectPort(port)??false,handle,invalidate,tabClosed,broker,handshake,authority,nativeRepository,readService,ui,views});
}
