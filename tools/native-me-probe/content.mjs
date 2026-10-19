import {createNativeMeProbe} from './reader.mjs';
import {createNativeMeCandidate} from './candidate.mjs';
const chain=typeof VAIWL_CANDIDATE_CHAIN!=='undefined'&&VAIWL_CANDIDATE_CHAIN;
const prefix=chain?'VAIWL_ME_CANDIDATE':'VAIWL_ME_PROBE';
// This file is bundled ONLY by the explicit diagnostic overlay builder.
if(window===window.top&&location.origin==='https://chatgpt.com'){
 const controller=new AbortController(),initialURL=location.href,documentKey=crypto.randomUUID();
 const probe=(chain?createNativeMeCandidate:createNativeMeProbe)({signal:controller.signal,isCurrent:()=>location.href===initialURL});
 const invalidate=()=>controller.abort();
 window.addEventListener('pagehide',invalidate,{once:true});
 window.addEventListener('popstate',invalidate,{once:true});
 if(chain)document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')invalidate();});
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('native-me-probe.html')||sender.tab||!message)return;
  if(message.type===prefix+'_READY'&&Object.keys(message).length===1){reply({documentKey,ready:!controller.signal.aborted&&location.href===initialURL,spent:probe.peek()!==null});return;}
  if(message.type===prefix+'_STATUS'&&Object.keys(message).length===1){reply(probe.peek()??{state:'no-result'});return;}
  if(message.type!==prefix+'_ONCE'||Object.keys(message).length!==2||message.documentKey!==documentKey)return;
  if(location.href!==initialURL)invalidate();
  probe.run().then(reply);return true;
 });
}
