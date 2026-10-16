import {tokenOK} from '../b1/identity.mjs';
import {createUiGrants} from '../host/ui-grants.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
/** UI transport is separate from the unchanged top-frame repository broker. */
export function createHostUiOwner({extensionId,uiURL=null,uiURLs=null,getFrame,getContexts=null,handshake,authority,now=Date.now,makeId=()=>crypto.randomUUID(),maxPending=128,maxPorts=128,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const grants=createUiGrants({extensionId,uiURL,uiURLs,getFrame,getContexts,peekScope:frame=>authority.peek(frame),now,makeId});
 let revocationEpoch=0,activeWork=0;
 async function track(work){activeWork++;try{return await work();}finally{activeWork--;}}
 const backgroundHints=new Map();
 const pending=new Map(),registrations=new Map(),ports=new Map(),uiDocuments=new Map(),inFlight=new Set();
 if(!Number.isInteger(maxPorts)||maxPorts<1||maxPorts>512)throw Error('invalid-ui-port-capacity');
 if(!Number.isInteger(maxPending)||maxPending<1||maxPending>512)throw Error('invalid-ui-pending-capacity');
 const bindingKeys=['documentToken','producerToken','routeEpoch'];
 const schema=(message,keys)=>exactHostRecord(message,['v','type',...keys])&&message.v===1;
 const publicFailure=()=>({ok:false,reason:'ui-authorization-unavailable'});
 async function parent(message,sender){
  if(!await handshake.verify(message,sender))throw Error('invalid-ui-parent-binding');
  const actual=await getFrame({tabId:sender.tab.id,frameId:0});
  if(!handshake.matchesFrame(message,sender,actual))throw Error('invalid-ui-parent-frame');
  return {...sender,url:actual.url};
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
 const validate=args=>track(()=>validateWork(args));
 async function validateWork(args){
  const epoch=revocationEpoch,mount=registrations.get(args.mountId),sender=structuredClone(args.sender);
  await grants.validate({...args,sender});await checkDocument(args.mountId);
  if(epoch!==revocationEpoch||registrations.get(args.mountId)!==mount)throw Error('ui-authority-invalidated');
  const grant=grants.current({...args,sender});remember(sender,grant);return grant;
 }
 // Only pending transport/authorization work occupies this bounded set. Revoking
 // another document must not poison healthy same-scope reads in another tab.
 function invalidateAttempts(matches){
  for(const attempt of inFlight)if(matches(attempt)){attempt.invalidated=true;if(attempt.nonce)deliver(attempt.nonce,null);}
 }
 function revokeMount(id){invalidateAttempts(attempt=>attempt.mountId===id);grants.revokeMount(id);registrations.delete(id);for(const [doc,entry]of [...uiDocuments])if(entry.grant.mountId===id)revokeDocument(doc);for(const [port,entry]of [...ports])if(entry.binding?.grant.mountId===id)disconnectPort(port);}
 async function handle(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return publicFailure();}
  if(inFlight.size>=maxPending*2+maxPorts)return publicFailure();
  const attempt={active:true,started:elapsedNow(),epoch:revocationEpoch,sender,mountId:message?.mountId,mount:registrations.get(message?.mountId),nonce:null,invalidated:false};
  inFlight.add(attempt);
  const check=()=>{
   if(!attempt.active||elapsedNow()-attempt.started>=6000)throw Error('ui-request-expired');
   if(attempt.invalidated||attempt.epoch!==revocationEpoch||(attempt.mountId&&registrations.get(attempt.mountId)!==attempt.mount))throw Error('ui-authority-invalidated');
  };
  const retireLateResult=grant=>{
   // Prior revocation already retired this request. A late reply must not erase
   // a fresh same-document JOIN or a replacement mount created in the meantime.
   if(attempt.invalidated||attempt.epoch!==revocationEpoch||(attempt.mountId&&registrations.get(attempt.mountId)!==attempt.mount))return;
   if(grant)try{grants.currentGrant(grant);}catch{return;}
   revokeDocument(sender.documentId);
  };
  let joined=null;
  try{return await withRequestDeadline(()=>track(async()=>{
   if(message.type==='HOST_UI_MOUNT'){
    if(!schema(message,[...bindingKeys,'mountId','regionEpoch']))throw Error('invalid-ui-mount');
    sender=await parent(message,sender);check();
    if(registrations.size>=128)throw Error('ui-mount-capacity');
    grants.registerMount({handle:{id:message.mountId,documentToken:message.documentToken,regionEpoch:message.regionEpoch},parent:sender});
    registrations.set(message.mountId,{tabId:sender.tab.id,documentId:sender.documentId,url:sender.url,binding:Object.freeze(Object.fromEntries(bindingKeys.map(key=>[key,message[key]])))});
    return {ok:true};
   }
   if(message.type==='HOST_UI_CONFIRM'||message.type==='HOST_UI_JOIN'){
    const isParent=message.type==='HOST_UI_CONFIRM';
    if(!schema(message,isParent?[...bindingKeys,'mountId','regionEpoch','nonce','role']:['nonce','role']))throw Error('invalid-ui-pair');
    if(isParent){sender=await parent(message,sender);check();}
    joined=waitFor(message.nonce,isParent?'parent':'ui');attempt.nonce=message.nonce;
    const direct=isParent?
     await grants.confirmParent({sender,mountId:message.mountId,documentToken:message.documentToken,regionEpoch:message.regionEpoch,nonce:message.nonce,role:message.role}):
     await grants.joinUI({sender,nonce:message.nonce,role:message.role});
    try{check();}catch(error){retireLateResult(direct);throw error;}
    if(direct)deliver(message.nonce,direct);
    let grant=direct??await joined.promise;
    if(!grant)throw Error('ui-join-expired');
    if(!isParent)grant=await validate({sender,grantId:grant.id,mountId:grant.mountId});
    try{check();}catch(error){retireLateResult(grant);throw error;}
    return {ok:true,grant:grants.currentGrant(grant)};
   }
   if(message.type==='HOST_UI_RENEW'){
    if(!schema(message,['grantId','mountId']))throw Error('invalid-ui-renew');
    await checkDocument(message.mountId);check();
    const renewed=await grants.renew({sender,grantId:message.grantId,mountId:message.mountId});await checkDocument(message.mountId);
    try{check();}catch(error){retireLateResult(renewed);throw error;}
    const grant=grants.current({sender,grantId:message.grantId,mountId:message.mountId});remember(sender,grant);
    return {ok:true,grant};
   }
   if(message.type==='HOST_UI_STATUS'){
    if(!schema(message,[...bindingKeys,'mountId']))throw Error('invalid-ui-status');
    const mount=registrations.get(message.mountId),records=[...uiDocuments.values()].filter(entry=>entry.grant.mountId===message.mountId);
    sender=await parent(message,sender);check();
    if(mount?.tabId!==sender.tab.id||mount?.documentId!==sender.documentId)throw Error('ui-mount-mismatch');
    if(records.length!==2||new Set(records.map(entry=>entry.grant.role)).size!==2)throw Error('incomplete-ui-pair');
    for(const record of records){
     await grants.renew({sender:record.sender,grantId:record.grant.id,mountId:message.mountId});check();
    }
    sender=await parent(message,sender);check();
    // Recheck both roles after the last await; a same-role JOIN can replace the
    // first grant while the second renewal or final parent check is pending.
    const renewed=records.map(record=>grants.current({sender:record.sender,grantId:record.grant.id,mountId:message.mountId}));
    records.forEach((record,index)=>remember(record.sender,renewed[index]));
    return {ok:true,grants:renewed};
   }
   if(message.type==='HOST_UI_SURFACE_STATE_GET'){
    if(!schema(message,['grantId','mountId']))throw Error('invalid-ui-surface-query');
    const result=await withScope({sender,grantId:message.grantId,mountId:message.mountId},context=>{
     const state=registrations.get(message.mountId)?.surfaceState;
     return {ok:true,surface:state?{revision:state.revision,visible:state[context.role]}:null};
    });check();return result;
   }
   if(message.type==='HOST_UI_SURFACE_STATE'){
    if(!schema(message,[...bindingKeys,'mountId','revision','workspace','sidebar'])||!Number.isSafeInteger(message.revision)||message.revision<1||!['workspace','sidebar'].every(role=>message[role]===null||typeof message[role]==='boolean'))throw Error('invalid-ui-surface-state');
    sender=await parent(message,sender);check();
    const mount=registrations.get(message.mountId);
    if(mount?.tabId!==sender.tab.id||mount?.documentId!==sender.documentId||mount.url!==sender.url||bindingKeys.some(key=>mount.binding[key]!==message[key]))throw Error('ui-mount-mismatch');
    const scope=authority.scopeFor({tabId:mount.tabId,frameId:0,documentId:mount.documentId,actualURL:mount.url,documentLifecycle:'active',incognito:false});
    if(!scope)throw Error('ui-scope-changed');
    grants.validateMount(message.mountId);
    if(message.revision>(mount.surfaceState?.revision??0)){
     mount.surfaceState=Object.freeze({revision:message.revision,workspace:message.workspace,sidebar:message.sidebar});
     notify(scope.key,message.mountId,'VAIWL_UI_SURFACE_STATE');
    }
    return {ok:true};
   }
   if(message.type==='HOST_UI_WORKSPACE_ENTERED'){
    if(!schema(message,[...bindingKeys,'mountId']))throw Error('invalid-ui-workspace-entry');
    sender=await parent(message,sender);check();
    const mount=registrations.get(message.mountId);
    if(mount?.tabId!==sender.tab.id||mount?.documentId!==sender.documentId||mount.url!==sender.url||bindingKeys.some(key=>mount.binding[key]!==message[key]))throw Error('ui-mount-mismatch');
    const scope=authority.scopeFor({tabId:mount.tabId,frameId:0,documentId:mount.documentId,actualURL:mount.url,documentLifecycle:'active',incognito:false});
    if(!scope)throw Error('ui-scope-changed');
    notify(scope.key,message.mountId,'VAIWL_UI_WORKSPACE_ENTERED');return {ok:true};
   }
   if(message.type==='HOST_UI_RELEASE'){
    if(!schema(message,[...bindingKeys,'mountId']))throw Error('invalid-ui-release');
    sender=await parent(message,sender);check();
    const mount=registrations.get(message.mountId);if(mount?.tabId!==sender.tab.id||mount?.documentId!==sender.documentId)throw Error('ui-mount-mismatch');
    revokeMount(message.mountId);return {ok:true};
   }
   return {ok:false,reason:'unsupported-ui-command'};
  }),{now:elapsedNow,schedule,cancel});}catch{return publicFailure();}
  finally{attempt.active=false;inFlight.delete(attempt);if(joined&&pending.get(joined.nonce)===joined.entry)deliver(joined.nonce,null);}
 }
 function revokeDocument(id){
  invalidateAttempts(attempt=>attempt.sender?.documentId===id||attempt.mount?.documentId===id);grants.revokeDocument(id);
  for(const [key,entry]of registrations)if(entry.documentId===id)registrations.delete(key);
  const documents=new Set([id]);for(const [key,entry]of uiDocuments)if(key===id||entry.grant.parentDocumentId===id){documents.add(key);uiDocuments.delete(key);}
  for(const [port,entry]of [...ports])if(documents.has(entry.sender.documentId)||entry.binding?.grant.parentDocumentId===id){grants.revokeDocument(entry.sender.documentId);disconnectPort(port);}
 }
 function revokeTab(tabId){
  invalidateAttempts(attempt=>attempt.sender?.tab?.id===tabId);
  // A pending UI half has no uiDocuments entry yet. Revoke its grant-side join
  // too, so a late parent confirmation cannot resurrect it after this request.
  for(const attempt of inFlight)if(attempt.sender?.tab?.id===tabId)grants.revokeDocument(attempt.sender.documentId);
  for(const entry of [...registrations.values()])if(entry.tabId===tabId)revokeDocument(entry.documentId);for(const [id,entry]of [...uiDocuments])if(entry.sender.tab.id===tabId)revokeDocument(id);for(const [port,entry]of [...ports])if(entry.sender.tab.id===tabId)disconnectPort(port);}
 function revokeAll(){for(const entry of backgroundHints.values())cancel(entry.timer);backgroundHints.clear();revocationEpoch++;invalidateAttempts(()=>true);grants.revokeAll();registrations.clear();uiDocuments.clear();for(const port of [...ports.keys()])disconnectPort(port);for(const key of [...pending.keys()])deliver(key,null);}
 function notify(scopeKey,mountId,type){
  if(typeof scopeKey!=='string'||!scopeKey)return 0;
  let delivered=0;
  for(const [port,entry]of [...ports]){
   if(ports.get(port)!==entry)continue;
   const record=entry.binding,grant=record?.grant,mount=grant&&registrations.get(grant.mountId);
   if(mountId!==null&&grant?.mountId!==mountId)continue;
   if(!record||uiDocuments.get(entry.sender.documentId)!==record||!mount||!sameSender(record.sender,entry.sender)||Date.parse(grant.expiresAt)<=now())continue;
   const frame={tabId:mount.tabId,frameId:0,documentId:mount.documentId,actualURL:mount.url,documentLifecycle:'active',incognito:false};
   const sender={id:extensionId,tab:{id:mount.tabId,incognito:false},frameId:0,documentId:mount.documentId,documentLifecycle:'active',url:mount.url};
   try{
    const proof=authority.peek(frame);
    if(proof?.state!=='verified'||proof.grant?.scopeKey!==scopeKey||proof.grant.id!==grant.scopeGrantId||Date.parse(proof.grant.expiresAt)<=now()||handshake.isBound?.(mount.binding,sender)!==true)continue;
    // A dirty hint contains no identity or projection. The next read still
    // performs full current browser/document/grant validation.
    port.postMessage(type==='VAIWL_UI_SURFACE_STATE'?{type,revision:mount.surfaceState.revision,visible:mount.surfaceState[grant.role]}:{type});delivered++;
   }catch{revokeDocument(entry.sender.documentId);}
  }
  return delivered;
 }
 function notifyScope(scopeKey,mountId=null){
  // A mount-local notification cannot consume updates owed to sibling mounts.
  if(mountId===null){const entry=backgroundHints.get(scopeKey);if(entry){backgroundHints.delete(scopeKey);cancel(entry.timer);}}
  return notify(scopeKey,mountId,'VAIWL_UI_DATA_CHANGED');
 }
 function notifyBackground(scopeKey){
  if(typeof scopeKey!=='string'||!scopeKey||!ports.size)return 0;
  if(backgroundHints.has(scopeKey))return 0;
  if(backgroundHints.size>=maxPorts)return notifyScope(scopeKey);
  const entry={timer:null};backgroundHints.set(scopeKey,entry);
  // Fixed trailing cadence: later publications cannot postpone this hint.
  // No projection, scope grant or pending read is retained by this timer.
  entry.timer=schedule(()=>{
   if(backgroundHints.get(scopeKey)!==entry)return;
   backgroundHints.delete(scopeKey);notify(scopeKey,null,'VAIWL_UI_DATA_CHANGED');
  },100);
  return 0;
 }
 function notifyMount(id){const mount=registrations.get(id);if(!mount)return 0;const scope=authority.scopeFor({tabId:mount.tabId,frameId:0,documentId:mount.documentId,actualURL:mount.url,documentLifecycle:'active',incognito:false});return scope?notifyScope(scope.key,id):0;}
 const withScope=(args,work)=>track(()=>withScopeWork(args,work));
 async function withScopeWork(args,work){
  const sender=structuredClone(args.sender),grant=await validate({...args,sender}),mount=registrations.get(grant.mountId);
  if(!mount||typeof work!=='function')throw Error('ui-mount-revoked');
  const frame=Object.freeze({tabId:mount.tabId,frameId:0,documentId:mount.documentId,actualURL:mount.url,documentLifecycle:'active',incognito:false});
  const scope=authority.scopeFor(frame);
  const parentSender={id:extensionId,tab:{id:mount.tabId,incognito:false},frameId:0,documentId:mount.documentId,documentLifecycle:'active',url:mount.url};
  const current=()=>{
   const live=uiDocuments.get(sender.documentId);
   try{grants.current({sender,grantId:grant.id,mountId:grant.mountId});}catch{return false;}
   return registrations.get(grant.mountId)===mount&&live?.grant.id===grant.id&&live.grant.scopeGrantId===grant.scopeGrantId&&sameSender(live.sender,sender)&&Date.parse(live.grant.expiresAt)>now()&&handshake.isBound?.(mount.binding,parentSender)===true&&authority.peek(frame)?.grant?.id===grant.scopeGrantId&&authority.scopeFor(frame)?.key===scope?.key;
  };
  if(!scope||!current())throw Error('ui-scope-changed');
  const result=await work(Object.freeze({scope,parentFrame:frame,binding:mount.binding,scopeGrantId:grant.scopeGrantId,role:grant.role,isCurrent:current}));
  await validate({...args,sender});if(!current())throw Error('ui-scope-changed');return result;
 }
 return Object.freeze({isIdle:()=>activeWork===0&&inFlight.size===0&&pending.size===0,handle,validate,withScope,notifyScope,notifyBackground,notifyMount,connectPort,revokeDocument,revokeMount,revokeTab,revokeAll});
}
