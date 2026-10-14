import {createFrameAppearance,validateFrameAppearance} from './frame-appearance.mjs';
import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';

/** Normal-JS frame lifecycle only; frozen processes/browser hard-kill need their
 * own acceptance evidence. Private data never travels through parent messages. */
export function createUiFrameClient({document:doc,runtime,role,parentOrigin,onGrant=()=>{},onClear=()=>{},onInvalidate=()=>{},onWorkspaceEntry=()=>{},onAppearance=()=>{},privateRoot=doc?.body,now=Date.now,elapsedNow=()=>performance.now(),makeNonce=()=>crypto.randomUUID(),schedule=setTimeout,cancel=clearTimeout}={}){
 const parsed=new URL(parentOrigin);
 if(!['workspace','sidebar'].includes(role)||!doc?.defaultView?.parent||!privateRoot||typeof privateRoot.replaceChildren!=='function'||typeof runtime?.connect!=='function'||typeof runtime.sendMessage!=='function'||parsed.origin!==parentOrigin||!['https:','http:'].includes(parsed.protocol))throw Error('invalid-ui-frame-client');
 const appearance=doc.documentElement?.style?createFrameAppearance({document:doc}):null;
 let appearanceListener=null,appearanceKey=null;
 let active=false,epoch=0,grant=null,port=null,expiryTimer=null,renewTimer=null,abort=null,disconnect=null,messageListener=null,rendering=false,desired=null;
 const clear=(reason,notify=true)=>{privateRoot.replaceChildren();try{if(notify)onClear(reason);}catch{/* Cleanup cannot restore authority. */}};
 function stop(reason='ui-stopped',userExit=false){
  const wasActive=active;active=false;if(appearanceListener){doc.defaultView.removeEventListener?.('message',appearanceListener);appearanceListener=null;}appearance?.clear();appearanceKey=null;if(desired){desired.resolve(false);desired=null;}epoch++;grant=null;cancel(expiryTimer);cancel(renewTimer);expiryTimer=renewTimer=null;abort?.abort();abort=null;
  const previous=port;port=null;if(previous){try{previous.onDisconnect.removeListener(disconnect);}catch{}try{previous.onMessage?.removeListener(messageListener);}catch{}}
  clear(reason,false);
  // Notify before reentrant onClear callbacks or port teardown can start a new session.
  if(wasActive)try{doc.defaultView.parent.postMessage({type:userExit?'VAIWL_UI_EXIT':'VAIWL_UI_SUSPEND',role},parentOrigin);}catch{}
  if(wasActive)try{onClear(reason);}catch{}
  try{previous?.disconnect();}catch{}
 }
 function valid(value,prior){
  if(!value||!['id','mountId','parentDocumentId','uiDocumentId','scopeGrantId'].every(k=>tokenOK(value[k]))||value.role!==role)return false;
  const expiry=Date.parse(value.expiresAt);if(!Number.isFinite(expiry)||expiry<=now()||expiry>now()+20000)return false;
  return !prior||['id','mountId','parentDocumentId','uiDocumentId','scopeGrantId','role'].every(k=>value[k]===prior[k]);
 }
 async function request(message,signal){
  let onAbort;const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(Error('ui-client-stopped'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
  try{return await withRequestDeadline(()=>Promise.race([Promise.resolve().then(()=>runtime.sendMessage(message)),cancelled]),{timeoutMs:6000,now:elapsedNow,schedule,cancel});}
  finally{signal.removeEventListener('abort',onAbort);}
 }
 const renderCurrent=entry=>active&&epoch===entry.run&&grant===entry.value&&now()<Date.parse(entry.value.expiresAt);
 async function drainRender(){
  if(rendering)return;rendering=true;
  try{while(desired){
   const entry=desired;desired=null;
   if(!renderCurrent(entry)){entry.resolve(false);continue;}
   let failure=false;
   try{await onGrant(entry.value,Object.freeze({isCurrent:()=>renderCurrent(entry)}));}catch{failure=true;}
   // No newer render has started while this callback was in flight. Remove its
   // possible late side effects before rendering the one latest desired grant.
   if(!renderCurrent(entry)){clear('ui-stale-render',false);entry.resolve(false);}
   else if(failure){stop('ui-renderer-failed');entry.resolve(false);}
   else entry.resolve(true);
  }}finally{rendering=false;}
 }
 function publish(value,run){
  grant=Object.freeze({...value});cancel(expiryTimer);cancel(renewTimer);
  const remaining=Math.max(0,Date.parse(grant.expiresAt)-now());
  expiryTimer=schedule(()=>{if(epoch===run)stop('ui-grant-expired');},remaining);
  renewTimer=schedule(()=>{void renew(run);},Math.min(10000,remaining/2));
  if(desired)desired.resolve(false);
  const completion=new Promise(resolve=>{desired={value:grant,run,resolve};});
  void drainRender();return completion;
 }
 async function renew(run){
  if(epoch!==run||!grant||!abort)return;const previous=grant,signal=abort.signal;
  try{const ack=await request({v:1,type:'HOST_UI_RENEW',grantId:previous.id,mountId:previous.mountId},signal);
   if(epoch!==run)return;if(ack?.ok!==true||!valid(ack.grant,previous)){stop('ui-renew-failed');return;}await publish(ack.grant,run);
  }catch{if(epoch===run)stop('ui-renew-failed');}
 }
 async function start(){
  stop('ui-starting');active=true;const run=epoch;
  appearanceListener=event=>{if(!active||epoch!==run||event.source!==doc.defaultView.parent||event.origin!==parentOrigin)return;const data=event.data;if(!exactHostRecord(data,['type','role','appearance'])||data.type!=='VAIWL_UI_APPEARANCE'||data.role!==role)return;try{const value=validateFrameAppearance(data.appearance),key=JSON.stringify(value);if(key===appearanceKey)return;appearance?.apply(value);appearanceKey=key;onAppearance(value);}catch{/* Cosmetic input cannot change authority or restart the client. */}};
  doc.defaultView.addEventListener?.('message',appearanceListener);
  abort=new AbortController();const signal=abort.signal;
  try{
   const nonce=makeNonce();if(!tokenOK(nonce))throw Error('invalid-ui-nonce');
   port=runtime.connect({name:'vaiwl-ui'});if(!port?.onDisconnect?.addListener)throw Error('invalid-ui-port');
   disconnect=()=>{if(epoch===run)stop('ui-port-disconnected');};port.onDisconnect.addListener(disconnect);
   const connected=port;
   messageListener=message=>{
    if(!active||epoch!==run||port!==connected||!grant||now()>=Date.parse(grant.expiresAt))return;
    if(!message||typeof message!=='object'||Array.isArray(message)||Object.keys(message).length!==1||!Object.hasOwn(message,'type')||!['VAIWL_UI_DATA_CHANGED','VAIWL_UI_WORKSPACE_ENTERED'].includes(message.type))return;
    try{if(message.type==='VAIWL_UI_WORKSPACE_ENTERED')onWorkspaceEntry();else onInvalidate();}catch{/* A notification cannot change authority. */}
   };
   port.onMessage?.addListener(messageListener);
   doc.defaultView.parent.postMessage({type:'VAIWL_UI_JOIN',role,nonce},parentOrigin);
   const ack=await request({v:1,type:'HOST_UI_JOIN',nonce,role},signal);if(epoch!==run)return false;
   if(ack?.ok!==true||!valid(ack.grant)){stop('ui-join-failed');return false;}
   return await publish(ack.grant,run);
  }catch{if(epoch===run)stop('ui-join-failed');return false;}
 }
 return Object.freeze({start,stop,exit:()=>stop('ui-user-exit',true),isAuthorized:()=>!!grant&&now()<Date.parse(grant.expiresAt)});
}
