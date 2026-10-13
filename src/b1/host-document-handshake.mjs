import {tokenOK,isRecord} from './identity.mjs';
import {hostHelloOK,exactHostRecord} from '../host/contract.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
/** Browser-document transport only. No scope resolver, storage or source grants. */
export function createHostDocumentHandshake({extensionId,getFrame,allowedURL,now=Date.now,makeId=()=>crypto.randomUUID(),ttlMs=20000,maxDocuments=128,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(!tokenOK(extensionId)||typeof getFrame!=='function'||typeof allowedURL!=='function'||typeof now!=='function'||typeof makeId!=='function'||!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>20000||!Number.isInteger(maxDocuments)||maxDocuments<1||maxDocuments>512)throw Error('invalid-host-handshake');
 const slots=new Map(),pending=new Map();let nextEpoch=0;
 const key=tabId=>String(tabId),deny=reason=>({ok:false,reason});
 const invalidate=({tabId,frameId=0}={})=>{if(!Number.isSafeInteger(tabId)||frameId!==0)return false;const k=key(tabId);pending.delete(k);slots.delete(k);return true;};
 const tabClosed=tabId=>{invalidate({tabId});};
 function senderFrame(sender){
  if(!isRecord(sender)||sender.id!==extensionId||!Number.isSafeInteger(sender.tab?.id)||sender.tab.id<0||sender.frameId!==0||!tokenOK(sender.documentId)||sender.documentLifecycle!=='active'||sender.tab.incognito===true||!allowedURL(sender.url))return null;
  return {tabId:sender.tab.id,documentId:sender.documentId,url:sender.url};
 }
 async function current(sender){
  const initial=senderFrame(sender);if(!initial)return null;
  const actual=await getFrame({tabId:initial.tabId,frameId:0});
  if(!isRecord(actual)||actual.documentId!==initial.documentId||actual.errorOccurred===true||actual.documentLifecycle!=='active'||!allowedURL(actual.url)||new URL(actual.url).origin!==new URL(initial.url).origin)return null;
  return {...initial,url:actual.url};
 }
 async function handle(message,sender){
  if(!hostHelloOK(message))return deny('invalid-host-hello');
  const initial=senderFrame(sender);if(!initial)return deny('invalid-sender');
  const k=key(initial.tabId),started=now();
  for(const [id,entry]of pending)if(entry.until<=started)pending.delete(id);
  if(!pending.has(k)&&pending.size>=maxDocuments)return deny('capacity');
  const attempt={until:started+ttlMs};pending.set(k,attempt);
  try{
   const frame=await current(sender);if(!frame)return deny('not-current-document');
   if(pending.get(k)!==attempt||now()>=attempt.until)return deny('invalidated-during-check');
   const prior=slots.get(k),time=now();
   if(prior&&prior.frame.documentId===frame.documentId&&prior.clientId===message.clientId&&message.seq<=prior.seq)return deny('replayed-sequence');
   for(const [id,slot]of slots)if(slot.until<=time)slots.delete(id);
   if(!slots.has(k)&&slots.size>=maxDocuments)return deny('capacity');
   const documentToken=makeId(),producerToken=makeId();if(!tokenOK(documentToken)||!tokenOK(producerToken)||documentToken===producerToken)return deny('bad-document-token');
   if(!Number.isSafeInteger(nextEpoch+1))return deny('epoch-capacity');
   const routeEpoch=++nextEpoch,until=time+ttlMs;
   const binding=Object.freeze({documentToken,producerToken,browserDocumentId:frame.documentId,routeEpoch,origin:new URL(frame.url).origin,expiresAt:new Date(until).toISOString()});
   slots.set(k,{frame,binding,until,clientId:message.clientId,seq:message.seq});
   return {ok:true,v:1,type:'HOST_BOUND',seq:message.seq,binding};
  }catch{return deny('host-document-unavailable');}
 }
 async function verify(binding,sender){
  const initial=senderFrame(sender);if(!initial)return false;
  const k=key(initial.tabId),slot=slots.get(k);
  if(!slot||now()>=slot.until||binding?.documentToken!==slot.binding.documentToken||binding?.producerToken!==slot.binding.producerToken||binding?.routeEpoch!==slot.binding.routeEpoch)return false;
  try{const frame=await current(sender);return slots.get(k)===slot&&now()<slot.until&&frame?.documentId===slot.frame.documentId&&frame.url===slot.frame.url;}catch{return false;}
 }
 function isBound(binding,sender){
  const initial=senderFrame(sender);if(!initial)return false;
  const slot=slots.get(key(initial.tabId));
  return !!slot&&slot.frame.documentId===initial.documentId&&now()<slot.until&&binding?.documentToken===slot.binding.documentToken&&binding?.producerToken===slot.binding.producerToken&&binding?.routeEpoch===slot.binding.routeEpoch;
 }
 function matchesFrame(binding,sender,actual){
  if(!isBound(binding,sender))return false;
  const slot=slots.get(key(sender.tab.id));
  return actual?.documentId===slot.frame.documentId&&actual?.url===slot.frame.url&&actual?.documentLifecycle==='active'&&actual?.errorOccurred!==true;
 }
 async function renew(message,sender){
  if(!exactHostRecord(message,['v','type','clientId','seq','documentToken','producerToken','routeEpoch'])||message.v!==1||message.type!=='HOST_DOCUMENT_RENEW'||!tokenOK(message.clientId)||!Number.isSafeInteger(message.seq)||message.seq<1)return deny('invalid-host-renew');
  try{message=structuredClone(message);sender=structuredClone(sender);}catch{return deny('invalid-host-renew');}
  const initial=senderFrame(sender);if(!initial)return deny('invalid-sender');
  const k=key(initial.tabId),slot=slots.get(k),started=elapsedNow();let active=true;
  const valid=()=>active&&elapsedNow()-started<6000&&slots.get(k)===slot&&isBound(message,sender)&&slot.clientId===message.clientId&&message.seq>slot.seq;
  if(!valid())return deny('stale-host-document');
  try{return await withRequestDeadline(async()=>{
   const frame=await current(sender);
   if(!valid()||frame?.documentId!==slot.frame.documentId||frame.url!==slot.frame.url)return deny('stale-host-document');
   // Renewal is transport authority only. Producer identity and observed fact
   // freshness survive unchanged; scope proof is independently enforced.
   const until=now()+ttlMs,binding=Object.freeze({...slot.binding,expiresAt:new Date(until).toISOString()});
   slot.until=until;slot.binding=binding;slot.seq=message.seq;
   return {ok:true,v:1,type:'HOST_BOUND',seq:message.seq,binding};
  },{now:elapsedNow,schedule,cancel});}catch{return deny('host-renew-unavailable');}finally{active=false;}
 }
 return Object.freeze({handle,renew,verify,isBound,matchesFrame,invalidate,tabClosed});
}
