import {withRequestDeadline} from '../data/request-deadline.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {exactHostRecord} from '../host/contract.mjs';
/** Explicit confirmation plus bounded browser-session continuity. Session rows
 * are local capabilities, not account authentication. Restoration also needs
 * the same live browser document's isolated RAM nonce; never a new document. */
export function createBrowserLocalControl({chrome,service,allowedURL,urlPolicy,origin=null,now=Date.now}){
 const descriptorKey='vaiwl-browser-local-personal-v1',sessionKey='vaiwl-browser-local-continuity-v1',rows=new Map(),blockedTabs=new Set(),resumes=new Map();
 let busy=false,revision=0,active=true,revokedAll=false,storageOK=false,writes=Promise.resolve();
 const frameOf=(tab,frame)=>({tabId:tab.id,frameId:0,documentId:frame.documentId,actualURL:frame.url,documentLifecycle:frame.documentLifecycle,incognito:tab.incognito===true});
 const validRow=r=>exactHostRecord(r,['tabId','documentId','spaceId','nonce','confirmedAt','expiresAt'])&&Number.isSafeInteger(r.tabId)&&r.tabId>=0&&[r.documentId,r.spaceId,r.nonce].every(tokenOK)&&Number.isFinite(r.confirmedAt)&&Number.isFinite(r.expiresAt)&&r.expiresAt-r.confirmedAt===43200000&&now()>=r.confirmedAt&&now()<r.expiresAt;
 const ready=(async()=>{try{
  await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const saved=(await chrome.storage.session.get(sessionKey))[sessionKey];
  if(saved!==undefined&&(!exactHostRecord(saved,['version','rows'])||saved.version!==1||!Array.isArray(saved.rows)||saved.rows.length>32))throw Error('invalid-session');
  for(const row of saved?.rows??[])if(validRow(row)){if(revokedAll){service.invalidate({tabId:row.tabId});notifyLocked(row);}else if(!blockedTabs.has(row.tabId)&&!rows.has(row.tabId))rows.set(row.tabId,row);}
  storageOK=true;
 }catch{rows.clear();}})();
 const persist=()=>{const snapshot={version:1,rows:[...rows.values()]};writes=writes.then(async()=>{if(storageOK)try{await chrome.storage.session.set({[sessionKey]:snapshot});}catch{storageOK=false;rows.clear();}});return writes;};
 async function send(tabId,documentId,message){
  let timer;try{return await Promise.race([chrome.tabs.sendMessage(tabId,message,{documentId}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('continuity-timeout')),2000);})]);}finally{clearTimeout(timer);}
 }
 const notifyLocked=frame=>{void send(frame.tabId,frame.documentId,{type:'HOST_LOCAL_LOCKED'}).catch(()=>{});};
 function revokeAll(){
  revision++;revokedAll=true;
  const targets=new Map([...rows.values(),...(service.authority.frames?.()??[])].map(f=>[f.tabId,f]));rows.clear();
  for(const frame of targets.values()){service.invalidate({tabId:frame.tabId});notifyLocked(frame);}
  // Global risk revokes other open documents too, even if storage was still loading.
  return ready.then(()=>{rows.clear();return persist();});
 }
 function forget(tabId){revision++;blockedTabs.add(tabId);rows.delete(tabId);return ready.then(()=>{rows.delete(tabId);return persist();});}
 function navigate(details,replacement){
  let accountRoute=false;try{const url=new URL(details.url);accountRoute=url.origin===origin&&/^\/(?:auth|accounts?|login|logout)(?:\/|$)/.test(url.pathname);}catch{}
  if(accountRoute){void revokeAll();return;}
  if(!allowedURL(details.url)){
   if(rows.has(details.tabId)||service.authority.frames?.().some(f=>f.tabId===details.tabId)){void revokeAll();return;}
   void forget(details.tabId);return;
  }
  if(replacement){void forget(details.tabId);return;}
  revision++; // fence a probe started before this route arrived
 }
 async function resume(sender){
  if(!active||sender?.id!==chrome.runtime.id||sender.frameId!==0||sender.tab?.incognito!==false||!tokenOK(sender.documentId)||!allowedURL(sender.url))return;
  const frame={...sender.tab,tabId:sender.tab.id,frameId:0,documentId:sender.documentId,actualURL:sender.url,documentLifecycle:sender.documentLifecycle,incognito:false};

  const key=JSON.stringify([frame.tabId,frame.documentId]);if(resumes.has(key))return resumes.get(key);
  const attempt=(async()=>{const ticket=revision;await ready;
   const row=rows.get(frame.tabId);if(ticket!==revision)return;
   try{
    const actual=await chrome.webNavigation.getFrame({tabId:frame.tabId,frameId:0});
    if(actual?.documentId!==frame.documentId||!allowedURL(actual.url)||actual.documentLifecycle!=='active')return;
    // MessageSender.url may retain the script document's pre-SPA URL. The
    // browser's exact document lookup, rechecked below, supplies current route.
    frame.actualURL=actual.url;frame.documentLifecycle=actual.documentLifecycle;
    if(service.authority.hasDocumentSelection?.(frame)||service.authority.hasPersonalSelection?.(frame))return;
    if(!storageOK||!row||!validRow(row)||row.documentId!==frame.documentId)return;
    const challenge=crypto.randomUUID(),proof=await send(frame.tabId,frame.documentId,{type:'HOST_LOCAL_CONTINUITY',action:'probe',challenge});
    const check=await chrome.webNavigation.getFrame({tabId:frame.tabId,frameId:0});
    if(!active||ticket!==revision||rows.get(frame.tabId)!==row||!validRow(row)||proof?.challenge!==challenge||proof?.nonce!==row.nonce||check?.documentId!==frame.documentId||check.url!==frame.actualURL||check.documentLifecycle!=='active')return;
    // Reissue fresh grant/epoch; never restore an old broker/UI capability.
    await service.authority.bindPersonal(frame,row.spaceId,row.expiresAt);
   }catch{service.invalidate({tabId:frame.tabId});}
  })();resumes.set(key,attempt);try{await attempt;}finally{if(resumes.get(key)===attempt)resumes.delete(key);}
 }
 // One private-popup snapshot of already admitted local data. Never derive a
 // scope from the durable descriptor or refresh an expired grant for this read.
 async function pipelineSnapshot(){
  const ticket=revision;let reading=true;
  try{return await withRequestDeadline(async()=>{
   await ready;
   if(!reading||!active||ticket!==revision)return null;
   const tabs=await chrome.tabs.query({active:true,currentWindow:true});
   if(!reading||!active||ticket!==revision||tabs.length!==1||tabs[0].incognito!==false)return null;
   const actual=await chrome.webNavigation.getFrame({tabId:tabs[0].id,frameId:0});
   if(!actual||!allowedURL(actual.url)||actual.documentLifecycle!=='active')return null;
   const frame=frameOf(tabs[0],actual),scope=service.authority.scopeFor?.(frame),grant=service.authority.peek?.(frame)?.grant;
   if(!scope||!grant||!service.nativeRepository?.header)return null;
   const guard=()=>reading&&active&&ticket===revision&&service.authority.isCurrentGrant(frame,grant)&&service.authority.scopeFor(frame)?.key===scope.key;
   if(!guard())return null;
   const header=await service.nativeRepository.header(scope,{guard});
   if(!guard())return null;
   const check=await chrome.webNavigation.getFrame({tabId:frame.tabId,frameId:0}),current=await chrome.tabs.query({active:true,currentWindow:true});
   if(!guard()||current.length!==1||current[0].id!==frame.tabId||current[0].incognito!==false||check?.documentId!==frame.documentId||check.url!==frame.actualURL||check.documentLifecycle!=='active')return null;
   const count=value=>value&&Object.getPrototypeOf(value)===Object.prototype?Object.keys(value).length:null;
   return {storage:scope.storage,nativeRevision:header.revision,projects:count(header.manifest?.projects),refs:count(header.manifest?.refs),lastWorkspaceDelivery:service.views?.deliverySummary?.(frame,scope.key)??null,...(service.views?.receiptSummary?{workspaceReceipt:service.views.receiptSummary(frame,scope.key)}:{})};
  },{timeoutMs:1000});}catch{return null;}finally{reading=false;}
 }
 async function handle(m,sender){
  const popup=sender?.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('status.html')&&(sender.tab===undefined||sender.frameId===0&&sender.tab.url===sender.url);
  const content=!popup&&sender?.id===chrome.runtime.id&&sender.frameId===0&&Number.isSafeInteger(sender.tab?.id)&&tokenOK(sender.documentId)&&allowedURL(sender.url);
  if(content&&exactHostRecord(m,['v','type','action','target'])&&m.v===1&&m.type==='HOST_LOCAL_SPACE'&&m.action==='prepare-navigation'){
   const parsed=urlPolicy?.parse(m.target);if(!['conversation','project'].includes(parsed?.kind))return {ok:false};
   return {ok:service.authority.prepareDocumentNavigation({tabId:sender.tab.id,frameId:0,documentId:sender.documentId,documentLifecycle:sender.documentLifecycle,incognito:sender.tab.incognito,actualURL:sender.url},parsed.navigationURL)};
  }
  if(!exactHostRecord(m,['v','type','action'])||m.v!==1||m.type!=='HOST_LOCAL_SPACE'||!['status','pipeline','unlock','lock'].includes(m.action)||(!popup&&!(content&&m.action==='lock')))return {ok:false};
  if(m.action==='lock'){if(content)service.invalidate({tabId:sender.tab.id});await revokeAll();return {ok:true,mode:'session'};}
  // Optional evidence must not hold the confirmation mutex or delay status.
  if(m.action==='pipeline'){const pipeline=await pipelineSnapshot();return {ok:true,...(pipeline?{pipeline}:{})};}
  if(busy)return {ok:false,reason:'local-binding-busy'};
  busy=true;const ticket=m.action==='unlock'?++revision:revision;let stage='read-frame',bindingTab=null;
  try{
   await ready;const tabs=await chrome.tabs.query({active:true,currentWindow:true});
   if(tabs.length!==1||tabs[0].incognito!==false)return {ok:false,reason:'local-tab-unavailable'};
   const tab=tabs[0],actual=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});
   if(!actual||!allowedURL(actual.url)||actual.documentLifecycle!=='active')return {ok:false,reason:'local-tab-unavailable'};
   const frame=frameOf(tab,actual);
   stage='read-descriptor';const stored=(await chrome.storage.local.get(descriptorKey))[descriptorKey];
   if(stored!==undefined&&(!exactHostRecord(stored,['version','spaceId'])||stored.version!==1||!tokenOK(stored.spaceId)))return {ok:false,reason:'local-binding-descriptor-invalid'};
   if(m.action==='status')return {ok:true,exists:!!stored,mode:service.authority.hasPersonalSelection?.(frame)?'personal':'locked'};
   const descriptor=stored??{version:1,spaceId:crypto.randomUUID()};
   stage='save-descriptor';if(!stored)await chrome.storage.local.set({[descriptorKey]:descriptor});
   stage='confirm-live-document';const challenge=crypto.randomUUID(),probe=await send(tab.id,actual.documentId,{type:'HOST_LOCAL_CONTINUITY',action:'probe',challenge});
   if(probe?.challenge!==challenge||!Number.isSafeInteger(probe.revision))throw Error('missing-live-continuity');
   const at=now(),row={tabId:tab.id,documentId:actual.documentId,spaceId:descriptor.spaceId,nonce:crypto.randomUUID(),confirmedAt:at,expiresAt:at+43200000};
   const armed=await send(tab.id,actual.documentId,{type:'HOST_LOCAL_CONTINUITY',action:'arm',nonce:row.nonce,revision:probe.revision,expiresAt:row.expiresAt});
   stage='recheck-frame';const check=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0}),current=await chrome.tabs.query({active:true,currentWindow:true});
   if(armed?.ok!==true||ticket!==revision||current.length!==1||current[0].id!==tab.id||current[0].incognito!==false||check?.documentId!==actual.documentId||check.url!==actual.url||check.documentLifecycle!=='active')return {ok:false,reason:'local-document-changed'};
   stage='bind';bindingTab=tab.id;service.invalidate({tabId:tab.id});await service.authority.bindPersonal(frame,descriptor.spaceId,row.expiresAt);
   blockedTabs.delete(tab.id);if(rows.size>=32&&!rows.has(tab.id))throw Error('session-capacity');rows.set(tab.id,row);await persist();
   if(ticket!==revision)throw Error('binding-revoked');
   stage='restart';const restarted=await send(tab.id,actual.documentId,{type:'HOST_LOCAL_RESTART'});
   if(ticket!==revision||restarted?.ok!==true)throw Error('restart-unconfirmed');
   return {ok:true,exists:true,mode:'personal'};
  }catch{if(bindingTab!==null){service.invalidate({tabId:bindingTab});await forget(bindingTab);}return {ok:false,reason:'local-binding-'+stage+'-unavailable'};}
  finally{busy=false;}
 }
 return {handle,resume,navigate,forget,stop(){active=false;revision++;}};
}
