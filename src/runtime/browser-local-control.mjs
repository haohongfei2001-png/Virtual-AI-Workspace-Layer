import {tokenOK} from '../b1/identity.mjs';
import {exactHostRecord} from '../host/contract.mjs';
/** Popup-only personal binding. The saved descriptor is not a grant. A fresh
 * exact active document and explicit confirmation are required after every lock. */
export function createBrowserLocalControl({chrome,service,allowedURL,urlPolicy}){
 const descriptorKey='vaiwl-browser-local-personal-v1';let busy=false,revision=0;
 const frameOf=(tab,frame)=>({tabId:tab.id,frameId:0,documentId:frame.documentId,actualURL:frame.url,documentLifecycle:frame.documentLifecycle,incognito:tab.incognito===true});
 async function handle(m,sender){
  const popup=sender?.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('status.html')&&(sender.tab===undefined||sender.frameId===0&&sender.tab.url===sender.url);
  const content=!popup&&sender?.id===chrome.runtime.id&&sender.frameId===0&&Number.isSafeInteger(sender.tab?.id)&&tokenOK(sender.documentId);
  if(content&&exactHostRecord(m,['v','type','action','target'])&&m.v===1&&m.type==='HOST_LOCAL_SPACE'&&m.action==='prepare-navigation'){
   const parsed=urlPolicy?.parse(m.target);
   if(!['conversation','project'].includes(parsed?.kind))return {ok:false};
   return {ok:service.authority.prepareNavigation({tabId:sender.tab.id,frameId:0,documentId:sender.documentId,documentLifecycle:sender.documentLifecycle,incognito:sender.tab.incognito,actualURL:sender.url},parsed.navigationURL)};
  }
  if(!exactHostRecord(m,['v','type','action'])||m.v!==1||m.type!=='HOST_LOCAL_SPACE'||!['status','unlock','lock'].includes(m.action)||(!popup&&!(content&&m.action==='lock')))return {ok:false};
  if(content&&m.action==='lock'){revision++;service.invalidate({tabId:sender.tab.id});return {ok:true,mode:'session'};}
  if(busy)return {ok:false,reason:'local-binding-busy'};
  busy=true;const ticket=++revision;let stage='read-frame',bindingTab=null;
  try{
   const tabs=popup?await chrome.tabs.query({active:true,currentWindow:true}):[sender.tab];
   if(tabs.length!==1||tabs[0].incognito!==false)return {ok:false,reason:'local-tab-unavailable'};
   const tab=tabs[0],actual=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});
   if(!actual||!allowedURL(actual.url)||actual.documentLifecycle!=='active'||content&&actual.documentId!==sender.documentId)return {ok:false,reason:'local-tab-unavailable'};
   const frame=frameOf(tab,actual);
   if(m.action==='lock'){service.invalidate({tabId:tab.id});return {ok:true,mode:'session'};}
   stage='read-descriptor';const stored=(await chrome.storage.local.get(descriptorKey))[descriptorKey];
   if(stored!==undefined&&(!exactHostRecord(stored,['version','spaceId'])||stored.version!==1||!tokenOK(stored.spaceId)))return {ok:false,reason:'local-binding-descriptor-invalid'};
   if(m.action==='status')return {ok:true,exists:!!stored,mode:service.authority.scopeFor(frame)?.storage??'locked'};
   const descriptor=stored??{version:1,spaceId:crypto.randomUUID()};
   stage='save-descriptor';if(!stored)await chrome.storage.local.set({[descriptorKey]:descriptor});
   stage='recheck-frame';const check=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});
   const active=await chrome.tabs.query({active:true,currentWindow:true});
   if(ticket!==revision||active.length!==1||active[0].id!==tab.id||active[0].incognito!==false||check?.documentId!==actual.documentId||check.url!==actual.url||check.documentLifecycle!=='active')return {ok:false,reason:'local-document-changed'};
   stage='bind';bindingTab=tab.id;service.invalidate({tabId:tab.id});await service.authority.bindPersonal(frame,descriptor.spaceId);
   stage='restart';const restarted=await chrome.tabs.sendMessage(tab.id,{type:'HOST_LOCAL_RESTART'},{documentId:actual.documentId});
   if(ticket!==revision||restarted?.ok!==true){service.invalidate({tabId:tab.id});return {ok:false,reason:'local-restart-unconfirmed'};}
   return {ok:true,exists:true,mode:'personal'};
  }catch{if(bindingTab!==null)service.invalidate({tabId:bindingTab});return {ok:false,reason:'local-binding-'+stage+'-unavailable'};}
  finally{busy=false;}
 }
 return {handle};
}
