import {tokenOK} from '../b1/identity.mjs';

/** Worker-owned RAM only. confirmParent is called by the authenticated content
 * controller only after its own connected iframe.contentWindow/region check.
 * Neither channel alone, nor possession of the public join nonce, grants access. */
export function createUiGrants({extensionId,uiURL,getFrame,peekScope,now=Date.now,makeId=()=>crypto.randomUUID(),maxEntries=2048}={}){
 if(!tokenOK(extensionId)||typeof getFrame!=='function'||typeof peekScope!=='function'||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>8192)throw Error('invalid-ui-grants');
 const url=new URL(uiURL);if(url.protocol!=='chrome-extension:'||url.hostname!==extensionId||url.search||url.hash)throw Error('invalid-ui-url');
 const mounts=new Map(),joins=new Map(),grants=new Map();let generation=0;
 const fail=reason=>{throw Error(reason);};
 const roleOK=role=>role==='workspace'||role==='sidebar';
 const currentScope=parent=>{const result=peekScope(parent);if(result?.state!=='verified'||!tokenOK(result.grant?.id)||!Number.isSafeInteger(result.grant.scopeEpoch)||!Number.isFinite(Date.parse(result.grant.expiresAt))||Date.parse(result.grant.expiresAt)<=now())fail('ui-scope-unverified');return result.grant;};
 function parentFrame(sender){
  if(sender?.id!==extensionId||!Number.isSafeInteger(sender.tab?.id)||sender.tab.id<0||sender.tab.incognito!==false||sender.frameId!==0||!tokenOK(sender.documentId)||sender.documentLifecycle!=='active')fail('invalid-ui-parent');
  return {tabId:sender.tab.id,frameId:0,documentId:sender.documentId,documentLifecycle:'active',incognito:false,actualURL:sender.url};
 }
 function uiFrame(sender){
  if(sender?.id!==extensionId||!Number.isSafeInteger(sender.tab?.id)||sender.tab.id<0||sender.tab.incognito!==false||!Number.isSafeInteger(sender.frameId)||sender.frameId<=0||!tokenOK(sender.documentId)||sender.documentLifecycle!=='active'||sender.url!==uiURL)fail('invalid-ui-sender');
  return Object.freeze({tabId:sender.tab.id,frameId:sender.frameId,documentId:sender.documentId,url:sender.url});
 }
 async function actual(frame,parentId){const found=await getFrame({tabId:frame.tabId,frameId:frame.frameId});if(!found||found.documentId!==frame.documentId||found.documentLifecycle!=='active'||found.url!==(frame.actualURL??frame.url)||(parentId!==undefined&&found.parentFrameId!==parentId))fail('stale-ui-document');}
 function registerMount({handle,parent}){
  const frame=parentFrame(parent),scope=currentScope(frame);
  if(!tokenOK(handle?.id)||!tokenOK(handle.documentToken)||!Number.isSafeInteger(handle.regionEpoch)||handle.regionEpoch<0||mounts.has(handle.id))fail('invalid-ui-mount');
  if(mounts.size>=maxEntries)fail('ui-grant-capacity');
  const entry={handle:Object.freeze({...handle}),parent:Object.freeze(frame),scopeId:scope.id,scopeEpoch:scope.scopeEpoch,scopeKey:scope.scopeKey,generation:++generation};mounts.set(handle.id,entry);return entry.handle;
 }
 function liveMount(id){const mount=mounts.get(id);if(!mount)fail('ui-mount-revoked');const scope=currentScope(mount.parent);if(scope.id!==mount.scopeId||scope.scopeEpoch!==mount.scopeEpoch||scope.scopeKey!==mount.scopeKey)fail('ui-scope-changed');return {mount,scope};}
 function discard(entry){entry.revoked=true;joins.delete(entry.nonce);}
 function join(nonce,role){
  if(!tokenOK(nonce)||!roleOK(role))fail('invalid-ui-join');
  let entry=joins.get(nonce);
  if(entry&&(entry.used||entry.expires<=now()||entry.role!==role)){entry.used=true;fail('ui-join-replayed');}
  if(!entry){
   // UI-only WAR traffic has never received the authenticated parent half.
   // Its expired nonce cannot authorize anything, so it needs no tombstone.
   for(const pending of joins.values())if(!pending.parent&&pending.expires<=now())discard(pending);
   if(joins.size>=maxEntries)fail('ui-grant-capacity');entry={nonce,role,expires:now()+20000,used:false,revoked:false,parent:null,ui:null};joins.set(nonce,entry);}
  return entry;
 }
 async function pair(entry){
  if(!entry.parent||!entry.ui)return null;
  entry.used=true; // Consume before any await, including failed or concurrent pairing.
  const {mount,scope}=liveMount(entry.parent.mountId),ui=entry.ui;
  if(entry.revoked)fail('ui-mount-mismatch');
  if(ui.tabId!==mount.parent.tabId||ui.documentId===mount.parent.documentId)fail('ui-parent-mismatch');
  await Promise.all([actual(mount.parent),actual(ui,0)]);
  const live=liveMount(mount.handle.id);
  if(live.mount!==mount||entry.revoked||entry.expires<=now())fail('ui-join-expired');
  const id=makeId();if(!tokenOK(id)||grants.has(id))fail('invalid-ui-grant-id');
  const until=Math.min(entry.expires,Date.parse(scope.expiresAt),Date.parse(live.scope.expiresAt),now()+20000);
  if(until<=now())fail('ui-join-expired');
  for(const [key,value]of grants)if(Date.parse(value.grant.expiresAt)<=now())grants.delete(key);
  for(const [key,value]of grants)if(value.mount===mount&&value.grant.role===entry.role)grants.delete(key);
  if(grants.size>=maxEntries)fail('ui-grant-capacity');
  const grant=Object.freeze({id,mountId:mount.handle.id,parentDocumentId:mount.parent.documentId,uiDocumentId:ui.documentId,scopeGrantId:scope.id,role:entry.role,expiresAt:new Date(until).toISOString()});
  grants.set(id,{grant,mount,ui});return grant;
 }
 function joinUI({sender,nonce,role}){const ui=uiFrame(sender),entry=join(nonce,role);if(entry.ui){entry.used=true;fail('ui-join-conflict');}entry.ui=ui;return pair(entry);}
 function confirmParent({sender,mountId,documentToken,regionEpoch,nonce,role}){
  const parent=parentFrame(sender),{mount}=liveMount(mountId);
  if(parent.tabId!==mount.parent.tabId||parent.documentId!==mount.parent.documentId||parent.actualURL!==mount.parent.actualURL||documentToken!==mount.handle.documentToken||regionEpoch!==mount.handle.regionEpoch)fail('ui-mount-mismatch');
  const entry=join(nonce,role);if(entry.parent){entry.used=true;fail('ui-join-conflict');}entry.parent={mountId};return pair(entry);
 }
 async function validate({sender,grantId,mountId}){
  const ui=uiFrame(sender),entry=grants.get(grantId);if(!entry||entry.grant.mountId!==mountId||entry.grant.expiresAt<=new Date(now()).toISOString())fail('ui-grant-expired');
  const {mount}=liveMount(mountId);if(mount!==entry.mount||ui.tabId!==entry.ui.tabId||ui.frameId!==entry.ui.frameId||ui.documentId!==entry.ui.documentId)fail('ui-grant-mismatch');
  await Promise.all([actual(mount.parent),actual(ui,0)]);
  if(grants.get(grantId)!==entry||liveMount(mountId).mount!==mount||Date.parse(entry.grant.expiresAt)<=now())fail('ui-grant-revoked');return entry.grant;
 }
 function revokeMount(id){mounts.delete(id);for(const [key,value]of grants)if(value.grant.mountId===id)grants.delete(key);for(const entry of joins.values())if(entry.parent?.mountId===id)discard(entry);}
 function revokeDocument(id){for(const [key,value]of mounts)if(value.parent.documentId===id)revokeMount(key);for(const [key,value]of grants)if(value.ui.documentId===id)grants.delete(key);for(const entry of joins.values())if(entry.ui?.documentId===id){entry.used=true;entry.revoked=true;}}
 function revokeAll(){for(const id of [...mounts.keys()])revokeMount(id);for(const entry of joins.values())discard(entry);grants.clear();}
 async function renew({sender,grantId,mountId}){
  const entry=grants.get(grantId);const checked=await validate({sender,grantId,mountId});
  if(!entry||grants.get(grantId)!==entry)fail('ui-grant-revoked');
  const {mount,scope}=liveMount(mountId);if(mount!==entry.mount)fail('ui-grant-revoked');
  const expiresAt=new Date(Math.min(now()+20000,Date.parse(scope.expiresAt))).toISOString();
  const grant=Object.freeze({...checked,expiresAt});grants.set(grantId,{...entry,grant});return grant;
 }
 return Object.freeze({registerMount,renew,joinUI,confirmParent,validate,revokeMount,revokeDocument,revokeAll});
}
