import {PROJECT_WRAPPER_DIAGNOSTIC_BATCH,isProjectDiagnosticURL,validProjectWrapperReport} from './project-wrapper-diagnostic.mjs';
const exact=(v,keys)=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value'));
const ticket=v=>exact(v,['nonce'])&&typeof v.nonce==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(v.nonce);
const type='HOST_PROJECT_WRAPPER_DIAGNOSTIC';

/** Private extension UI only. No page/iframe bridge, no DOM objects in DTOs.
 * Reads return cached JSON; only authorize resumes the waiting first session. */
export function installProjectWrapperDiagnosticChannel({runtime,session,beforeAuthorize=()=>{}}){
 let attempted=false;
 const listener=(message,sender,reply)=>{
  if(sender?.id!==runtime.id||sender?.url!==runtime.getURL('status.html')||sender.tab!==undefined||!exact(message,['v','type','action',...(message?.action==='authorize'?['ticket']:[])])||message.v!==1||message.type!==type||!['ticket','authorize','report'].includes(message.action))return;
  if(message.action==='ticket'){const value=session.projectWrapperTicket();reply({v:1,ticket:ticket(value)?value:null});return;}
  if(message.action==='report'){const report=session.readProjectWrapper();reply({v:1,report:validProjectWrapperReport(report)?report:null});return;}
  if(attempted||!ticket(message.ticket)){reply({v:1,report:null});return;}
  const current=session.projectWrapperTicket();
  if(!ticket(current)||current.nonce!==message.ticket.nonce){reply({v:1,report:null});return;}
  attempted=true;
  try{
   beforeAuthorize();
   if(!session.authorizeProjectWrapper(message.ticket)){reply({v:1,report:null});return;}
   Promise.resolve(session.projectWrapperResult()).then(report=>reply({v:1,report:validProjectWrapperReport(report)?report:null}),()=>reply({v:1,report:null}));
   return true;
  }catch{reply({v:1,report:null});}
 };
 runtime.onMessage.addListener(listener);return ()=>runtime.onMessage.removeListener(listener);
}

/** Called only by an explicit status button. The fixed extension-origin lock
 * serializes all tabs/popups; only the spent bit is stored. No report, URL,
 * document identity or capability is persisted. A lost response stays spent. */
export async function runProjectWrapperDiagnosticOnce({chrome,locks,target,schedule=setTimeout,cancel=clearTimeout}){
 if(!exact(target,['tabId','documentId','url'])||!Number.isSafeInteger(target.tabId)||typeof target.documentId!=='string'||!isProjectDiagnosticURL(target.url)||!locks?.request||!chrome.storage?.local)return null;
 let active=true,timer;
 const current=async()=>{const f=await chrome.webNavigation.getFrame({tabId:target.tabId,frameId:0});return active&&f?.documentId===target.documentId&&f.url===target.url&&f.documentLifecycle==='active';};
 const send=action=>chrome.tabs.sendMessage(target.tabId,{v:1,type,...action},{documentId:target.documentId});
 try{return await Promise.race([(async()=>{
  if(!await current())return null;
  const offered=await send({action:'ticket'});
  if(!exact(offered,['v','ticket'])||offered.v!==1||!ticket(offered.ticket)||!await current())return null;
  const claimed=await locks.request(PROJECT_WRAPPER_DIAGNOSTIC_BATCH,{ifAvailable:true},async lock=>{
   if(!lock||!active)return false;
   const old=(await chrome.storage.local.get(PROJECT_WRAPPER_DIAGNOSTIC_BATCH))[PROJECT_WRAPPER_DIAGNOSTIC_BATCH];
   if(old!==undefined||!active||!await current())return false;
   await chrome.storage.local.set({[PROJECT_WRAPPER_DIAGNOSTIC_BATCH]:{spent:true}});
   return active;
  });
  if(!claimed||!await current())return null;
  const result=await send({action:'authorize',ticket:offered.ticket});
  if(!await current()||!exact(result,['v','report'])||result.v!==1||!validProjectWrapperReport(result.report))return null;
  // A delayed reply may cross SPA A -> B -> A in the same browser document.
  // Re-read RAM only, so the session's irreversible invalidation wins.
  const latest=await send({action:'report'});
  return await current()&&exact(latest,['v','report'])&&latest.v===1&&validProjectWrapperReport(latest.report)?structuredClone(latest.report):null;
 })(),new Promise(resolve=>{timer=schedule(()=>{active=false;resolve(null);},35000);})]);}catch{return null;}finally{active=false;cancel(timer);}
}

export async function readProjectWrapperDiagnostic({chrome,target,schedule=setTimeout,cancel=clearTimeout}){
 let timer;
 try{return await Promise.race([(async()=>{
  if(!exact(target,['tabId','documentId','url'])||!isProjectDiagnosticURL(target.url))return null;
  const current=async()=>{const f=await chrome.webNavigation.getFrame({tabId:target.tabId,frameId:0});return f?.documentId===target.documentId&&f.url===target.url&&f.documentLifecycle==='active';};
  if(!await current())return null;
  const r=await chrome.tabs.sendMessage(target.tabId,{v:1,type,action:'report'},{documentId:target.documentId});
  return await current()&&exact(r,['v','report'])&&r.v===1&&validProjectWrapperReport(r.report)?structuredClone(r.report):null;
 })(),new Promise(resolve=>{timer=schedule(()=>resolve(null),1000);})]);}catch{return null;}finally{cancel(timer);}
}
