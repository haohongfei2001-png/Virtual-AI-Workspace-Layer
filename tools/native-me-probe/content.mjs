import {createCredentialControlProbe} from './credential-control.mjs';
import {createNativeMeProbe} from './reader.mjs';
import {createNativeMeCandidate} from './candidate.mjs';
import {createNativeAccountsProbe} from './accounts.mjs';
const control=typeof VAIWL_CREDENTIAL_CONTROL!=='undefined'&&VAIWL_CREDENTIAL_CONTROL;
const chain=typeof VAIWL_CANDIDATE_CHAIN!=='undefined'&&VAIWL_CANDIDATE_CHAIN;
const structural=typeof VAIWL_ACCOUNTS_STRUCTURE!=='undefined'&&VAIWL_ACCOUNTS_STRUCTURE;
const accountsOnly=structural||typeof VAIWL_ACCOUNTS_SCHEMA!=='undefined'&&VAIWL_ACCOUNTS_SCHEMA;
const prefix=control?'VAIWL_CREDENTIAL_CONTROL':structural?'VAIWL_ACCOUNTS_STRUCTURE':accountsOnly?'VAIWL_ACCOUNTS_SCHEMA':chain?'VAIWL_ME_CANDIDATE':'VAIWL_ME_PROBE';
// This file is bundled ONLY by the explicit diagnostic overlay builder.
if(window===window.top&&location.origin==='https://chatgpt.com'){
 const controller=new AbortController(),initialURL=location.href,documentKey=crypto.randomUUID();
 let started=false,invalidationReason=null;
 const visible=()=>!(control||chain||accountsOnly)||document.visibilityState==='visible';
 const probe=(control?createCredentialControlProbe:accountsOnly?createNativeAccountsProbe:chain?createNativeMeCandidate:createNativeMeProbe)({structural,signal:controller.signal,isCurrent:()=>location.href===initialURL&&visible()});
 const invalidate=reason=>{invalidationReason??=reason;controller.abort();};
 window.addEventListener('pagehide',()=>invalidate('pagehide'),{once:true});
 window.addEventListener('popstate',()=>invalidate('route-event'),{once:true});
 // Before ONCE there are no candidate facts to retain. Visibility gates fresh
 // admission; once started, any hidden event permanently cancels this attempt.
 if(control||chain||accountsOnly)document.addEventListener('visibilitychange',()=>{if(started&&!visible())invalidate('hidden-during-attempt');});
 if(control)for(const type of ['pointerdown','keydown','input','change'])document.addEventListener(type,event=>{if(started&&event.isTrusted)invalidate('interaction-during-attempt');},{capture:true});
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('native-me-probe.html')||sender.tab||!message)return;
  if(message.type===prefix+'_READY'&&Object.keys(message).length===1){reply({documentKey,receiverVersion:control?5:structural?4:accountsOnly?3:chain?2:1,statusDocumentBound:true,ready:!controller.signal.aborted&&location.href===initialURL&&visible(),spent:started,reason:invalidationReason??(location.href!==initialURL?'route-changed':!visible()?'document-hidden':'ready')});return;}
  if(message.type===prefix+'_STATUS'&&Object.keys(message).length===2&&typeof message.documentKey==='string'){
   reply(message.documentKey===documentKey?(probe.peek()??{state:'no-result'}):{state:'document-changed-no-retry'});return;
  }
  if(message.type!==prefix+'_ONCE'||Object.keys(message).length!==2||message.documentKey!==documentKey)return;
  started=true;
  if(location.href!==initialURL)invalidate('route-changed');
  if(!visible())invalidate('hidden-at-start');
  probe.run().then(reply);return true;
 });
}
