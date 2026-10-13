import {tokenOK} from '../b1/identity.mjs';
import {createUiGrants} from '../host/ui-grants.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
/** UI transport is separate from the unchanged top-frame repository broker. */
export function createHostUiOwner({extensionId,uiURL=null,uiURLs=null,getFrame,getContexts=null,handshake,authority,now=Date.now,makeId=()=>crypto.randomUUID(),maxPending=128,maxPorts=128,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const grants=createUiGrants({extensionId,uiURL,uiURLs,getFrame,getContexts,peekScope:frame=>authority.peek(frame),now,makeId});
 let revocationEpoch=0;
 const pending=new Map(),registrations=new Map(),ports=new Map(),uiDocuments=new Map();
 if(!Number.isInteger(maxPorts)||maxPorts<1||maxPorts>512)throw Error('invalid-ui-port-capacity');
 if(!Number.isInteger(maxPending)||maxPending<1||maxPending>512)throw Error('invalid-ui-pending-capacity');
 const bindingKeys=['documentToken','producerToken','routeEpoch'];
 const schema=(message,keys)=>exactHostRecord(message,['v','type',...keys])&&message.v===1;
 const publicFailure=()=>({ok:false,reason:'ui-authorization-unavailable'});
 async function parent(message,sender){
  if(!await handshake.verify(message,sender))throw Error('invalid-ui-parent-binding');
  const actual=await getFrame({tabId:sender.tab.id,frameId:0});
  if(!handshake.matchesFrame(message,sender,actual))throw Error('invalid-ui-parent-frame');
 }
 function waitFor(nonce,role){
  let entry=pending.get(nonce);
  if(!entry){if(pending.size>=maxPending)throw Error('ui-pending-capacity');entry={};pending.set(nonce,entry);}
  if(entry[role])throw Error('duplicate-ui-channel');
  let resolve;const promise=new Promise(r=>resolve=r);entry[role]={resolve,promise};return {nonce,entry,promise};
 }
 function deliver(nonce,grant){const entry=pending.get(nonce);if(entry){pending.delete(nonce);entry.ui?.resolve(grant);entry.parent?.resolve(grant);}}
 const urls=uiURLs??{workspace:uiURL,sidebar:uiURL};
 const sameSender=(a,b)=>a.id===b.id&&a.tab.id===b.tab.id&&a.frameId===b.frameId&&a.documentId===b.documentId&&a.url===b.url;
 function portSender(value){return value?.id===extensionId&&Number.isSafeInteger(value.tab?.id)&&value.tab.id>=0&&value.tab.incognito===false&&Number.isSafeInteger(value.frameId)&&value.frameId>0&&tokenOK(value.documentId)&&value.documentLifecycle==='active'&&Object.values(urls).includes(value.url);}
 function disconnectPort(port){const entry=ports.get(port);if(!entry)return;ports.delete(port);try{port.onDisconnect.removeListener(entry.disconnected);}catch{}try{port.disconnect();}catch{}}
 function connectPort(port){
  let sender;try{sender=structuredClone(port?.sender);}catch{return false;}
  if(port?.name!=='vaiwl-ui'||!portSender(sender)||typeof port.onDisconnect?.addListener!=='function'||typeof port.onDisconnect?.removeListener!=='function'||typeof port.disconnect!=='function'||ports.has(port)||ports.size>=maxPorts)return false;
  const record=uiDocuments.get(sender.documentId);
  const entry={sender,binding:record&&sameSender(record.sender,sender)&&Date.parse(record.grant.expiresAt)>now()?record:null,disconnected:null};
  entry.disconnected=()=>{if(ports.get(port)!==entry)return;ports.delete(port);try{port.onDisconnect.removeListener(entry.disconnected);}catch{}revokeDocument(sender.documentId);};
  ports.set(port,entry);port.onDisconnect.addListener(entry.disconnected);return true;
 }
 function remember(sender,grant){
  const mount=registrations.get(grant.mountId);if(!mount||mount.tabId!==sender.tab.id||mount.documentId!==grant.parentDocumentId)throw Error('ui-mount-revoked');
  for(const [id,entry]of uiDocuments)if(Date.parse(entry.grant.expiresAt)<=now())uiDocuments.delete(id);
  if(!uiDocuments.has(sender.documentId)&&uiDocuments.size>=maxPorts)throw Error('ui-document-capacity');
  const record={sender:structuredClone(sender),grant};uiDocuments.set(sender.documentId,record);
  for(const entry of ports.values())if(sameSender(entry.sender,sender))entry.binding=record;
 }
 async function checkDocument(mountId){
  const mount=registrations.get(mountId);if(!mount)throw Error('ui-mount-revoked');
  await parent(mount.binding,{id:extensionId,tab:{id:mount.tabId,incognito:false},frameId:0,documentId:mount.documentId,documentLifecycle:'active',url:mount.url});
  if(registrations.get(mountId)!==mount)throw Error('ui-mount-revoked');
 }
 async function validate(args){const epoch=revocationEpoch,sender=structuredClone(args.sender),grant=await grants.validate({...args,sender});await checkDocument(args.mountId);if(epoch!==revocationEpoch)throw Error('ui-authority-invalidated');remember(sender,grant);return grant;}
 function revokeMount(id){revocationEpoch++;grants.revokeMount(id);registrations.delete(id);for(const [doc,entry]of [...uiDocuments])if(entry.grant.mountId===id)revokeDocument(doc);for(const [port,entry]of [...ports])if(entry.binding?.grant.mountId===id)disconnectPort(port);}
 async function handle(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return publicFailure();}
  const attempt={active:true,started:elapsedNow()};
  const check=()=>{if(!attempt.active||elapsedNow()-attempt.started>=6000)throw Error('ui-request-expired');};
  let joined=null;
  try{return await withRequestDeadline(async()=>{
   if(message.type==='HOST_UI_MOUNT'){
    if(!schema(message,[...bindingKeys,'mountId','regionEpoch']))throw Error('invalid-ui-mount');
    await parent(message,sender);check();
    if(registrations.size>=128)throw Error('ui-mount-capacity');
    grants.registerMount({handle:{id:message.mountId,documentToken:message.documentToken,regionEpoch:message.regionEpoch},parent:sender});
    registrations.set(message.mountId,{tabId:sender.tab.id,documentId:sender.documentId,url:sender.url,binding:Object.freeze(Object.fromEntries(bindingKeys.map(key=>[key,message[key]])))});
    return {ok:true};
   }
   if(message.type==='HOST_UI_CONFIRM'||message.type==='HOST_UI_JOIN'){
    const isParent=message.type==='HOST_UI_CONFIRM';
    if(!schema(message,isParent?[...bindingKeys,'mountId','regionEpoch','nonce','role']:['nonce','role']))throw Error('invalid-ui-pair');
    if(isParent){await parent(message,sender);check();}
    joined=waitFor(message.nonce,isParent?'parent':'ui');
    const direct=isParent?
     await grants.confirmParent({sender,mountId:message.mountId,documentToken:message.documentToken,regionEpoch:message.regionEpoch,nonce:message.nonce,role:message.role}):
     await grants.joinUI({sender,nonce:message.nonce,role:message.role});
    try{check();}catch(error){revokeDocument(sender.documentId);throw error;}
    if(direct)deliver(message.nonce,direct);
    const grant=direct??await joined.promise;
    if(!grant)throw Error('ui-join-expired');
    if(!isParent)await validate({sender,grantId:grant.id,mountId:grant.mountId});
    try{check();}catch(error){revokeDocument(sender.documentId);throw error;}
    return {ok:true,grant};
   }
   if(message.type==='HOST_UI_RENEW'){
    if(!schema(message,['grantId','mountId']))throw Error('invalid-ui-renew');
    const epoch=revocationEpoch;await checkDocument(message.mountId);check();
    const grant=await grants.renew({sender,grantId:message.grantId,mountId:message.mountId});await checkDocument(message.mountId);if(epoch!==revocationEpoch)throw Error('ui-authority-invalidated');remember(sender,grant);
    try{check();}catch(error){revokeDocument(sender.documentId);throw error;}
    return {ok:true,grant};
   }
   if(message.type==='HOST_UI_STATUS'){
    if(!schema(message,[...bindingKeys,'mountId']))throw Error('invalid-ui-status');
    await parent(message,sender);check();
    const mount=registrations.get(message.mountId),epoch=revocationEpoch;
    if(mount?.tabId!==sender.tab.id||mount?.documentId!==sender.documentId)throw Error('ui-mount-mismatch');
    const records=[...uiDocuments.values()].filter(entry=>entry.grant.mountId===message.mountId);
    if(records.length!==2||new Set(records.map(entry=>entry.grant.role)).size!==2)throw Error('incomplete-ui-pair');
    const renewed=[];
    for(const record of records){
     const grant=await grants.renew({sender:record.sender,grantId:record.grant.id,mountId:message.mountId});check();
     if(epoch!==revocationEpoch)throw Error('ui-authority-invalidated');
     remember(record.sender,grant);renewed.push(grant);
    }
    await parent(message,sender);check();
    if(epoch!==revocationEpoch||registrations.get(message.mountId)!==mount)throw Error('ui-authority-invalidated');
    return {ok:true,grants:renewed};
   }
   if(message.type==='HOST_UI_RELEASE'){
    if(!schema(message,[...bindingKeys,'mountId']))throw Error('invalid-ui-release');
    await parent(message,sender);check();
    const mount=registrations.get(message.mountId);if(mount?.tabId!==sender.tab.id||mount?.documentId!==sender.documentId)throw Error('ui-mount-mismatch');
    revokeMount(message.mountId);return {ok:true};
   }
   return {ok:false,reason:'unsupported-ui-command'};
  },{now:elapsedNow,schedule,cancel});}catch{return publicFailure();}
  finally{attempt.active=false;if(joined&&pending.get(joined.nonce)===joined.entry)deliver(joined.nonce,null);}
 }
 function revokeDocument(id){
  revocationEpoch++;grants.revokeDocument(id);
  for(const [key,entry]of registrations)if(entry.documentId===id)registrations.delete(key);
  const documents=new Set([id]);for(const [key,entry]of uiDocuments)if(key===id||entry.grant.parentDocumentId===id){documents.add(key);uiDocuments.delete(key);}
  for(const [port,entry]of [...ports])if(documents.has(entry.sender.documentId)||entry.binding?.grant.parentDocumentId===id){grants.revokeDocument(entry.sender.documentId);disconnectPort(port);}
 }
 function revokeTab(tabId){for(const entry of [...registrations.values()])if(entry.tabId===tabId)revokeDocument(entry.documentId);for(const [id,entry]of [...uiDocuments])if(entry.sender.tab.id===tabId)revokeDocument(id);for(const [port,entry]of [...ports])if(entry.sender.tab.id===tabId)disconnectPort(port);}
 function revokeAll(){revocationEpoch++;grants.revokeAll();registrations.clear();uiDocuments.clear();for(const port of [...ports.keys()])disconnectPort(port);for(const key of [...pending.keys()])deliver(key,null);}
 function notifyScope(scopeKey){
  if(typeof scopeKey!=='string'||!scopeKey)return 0;
  let delivered=0;
  for(const [port,entry]of [...ports]){
   if(ports.get(port)!==entry)continue;
   const record=entry.binding,grant=record?.grant,mount=grant&&registrations.get(grant.mountId);
   if(!record||uiDocuments.get(entry.sender.documentId)!==record||!mount||!sameSender(record.sender,entry.sender)||Date.parse(grant.expiresAt)<=now())continue;
   const frame={tabId:mount.tabId,frameId:0,documentId:mount.documentId,actualURL:mount.url,documentLifecycle:'active',incognito:false};
   const sender={id:extensionId,tab:{id:mount.tabId,incognito:false},frameId:0,documentId:mount.documentId,documentLifecycle:'active',url:mount.url};
   try{
    const proof=authority.peek(frame);
    if(proof?.state!=='verified'||proof.grant?.scopeKey!==scopeKey||proof.grant.id!==grant.scopeGrantId||Date.parse(proof.grant.expiresAt)<=now()||handshake.isBound?.(mount.binding,sender)!==true)continue;
    // A dirty hint contains no identity or projection. The next read still
    // performs full current browser/document/grant validation.
    port.postMessage({type:'VAIWL_UI_DATA_CHANGED'});delivered++;
   }catch{revokeDocument(entry.sender.documentId);}
  }
  return delivered;
 }
 async function withScope(args,work){
  const sender=structuredClone(args.sender),grant=await validate({...args,sender}),mount=registrations.get(grant.mountId);
  if(!mount||typeof work!=='function')throw Error('ui-mount-revoked');
  const frame=Object.freeze({tabId:mount.tabId,frameId:0,documentId:mount.documentId,actualURL:mount.url,documentLifecycle:'active',incognito:false});
  const scope=authority.scopeFor(frame);
  const current=()=>registrations.get(grant.mountId)===mount&&authority.peek(frame)?.grant?.id===grant.scopeGrantId&&authority.scopeFor(frame)?.key===scope?.key;
  if(!scope||!current())throw Error('ui-scope-changed');
  const result=await work(Object.freeze({scope,parentFrame:frame,binding:mount.binding,scopeGrantId:grant.scopeGrantId,role:grant.role,isCurrent:current}));
  await validate({...args,sender});if(!current())throw Error('ui-scope-changed');return result;
 }
 return Object.freeze({handle,validate,withScope,notifyScope,connectPort,revokeDocument,revokeMount,revokeTab,revokeAll});
}
