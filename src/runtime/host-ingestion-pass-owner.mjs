import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
/** Private, RAM-only scheduling hints. These never admit data, refresh proof,
 * establish completeness, or replace the reader's snapshot/CAS checks. */
export function createHostIngestionPassOwner({handshake,authority,getFrame,profiles,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,maxProducers=128}={}){
 if(!handshake?.verify||!handshake?.isBound||!handshake?.matchesFrame||!authority?.peek||!authority?.scopeFor||typeof getFrame!=='function'||!(profiles instanceof Map)||!Number.isInteger(maxProducers)||maxProducers<1||maxProducers>128)throw Error('invalid-host-ingestion-owner');
 const producers=new Map(),requests=new Set();let stopped=false;
 function bound(entry){try{return !stopped&&handshake.isBound(entry.message,entry.sender);}catch{return false;}}
 function current(entry){
  try{
   const time=now(),elapsed=elapsedNow(),resolution=authority.peek(entry.frame);
   const valid=bound(entry)&&profiles.get(entry.profile.id)===entry.profile&&entry.profile.revision===entry.message.profileVersion&&resolution.state==='verified'&&resolution.grant?.id===entry.grantId&&resolution.grant?.scopeEpoch===entry.scopeEpoch&&authority.scopeFor(entry.frame)?.key===entry.scopeKey&&Number.isFinite(time)&&time>=entry.lastTime&&Number.isFinite(elapsed)&&elapsed>=entry.lastElapsed&&time<entry.startedTime+30000&&elapsed<entry.startedElapsed+30000;
   if(valid){entry.lastTime=time;entry.lastElapsed=elapsed;}else entry.terminal=true;
   return valid&&!entry.terminal;
  }catch{entry.terminal=true;return false;}
 }
 function prune(){for(const [key,entry]of producers)if(!bound(entry))producers.delete(key);}
 async function handle(input,sender){
  const deny=()=>({ok:false});let message;
  try{message=structuredClone(input);sender=structuredClone(sender);}catch{return deny();}
  if(stopped||!exactHostRecord(message,['v','type','documentToken','producerToken','routeEpoch','profileId','profileVersion','passSeq','phase'])||message.v!==1||message.type!=='HOST_INGESTION_PASS'||!['documentToken','producerToken','profileId'].every(key=>tokenOK(message[key]))||!Number.isSafeInteger(message.routeEpoch)||message.routeEpoch<1||!Number.isSafeInteger(message.profileVersion)||message.profileVersion<1||!Number.isSafeInteger(message.passSeq)||message.passSeq<1||!['start','end','cancel'].includes(message.phase)||requests.size>=maxProducers)return deny();
  const attempt={sender,active:true,started:elapsedNow(),time:now()};requests.add(attempt);
  const live=()=>!stopped&&attempt.active&&Number.isFinite(elapsedNow())&&elapsedNow()>=attempt.started&&elapsedNow()-attempt.started<6000&&Number.isFinite(now())&&now()>=attempt.time;
  try{return await withRequestDeadline(async()=>{
   if(!await handshake.verify(message,sender)||!live())return deny();
   const actual=await getFrame({tabId:sender.tab.id,frameId:0});
   if(!live()||!handshake.matchesFrame(message,sender,actual)||!await handshake.verify(message,sender)||!live())return deny();
   const frame={tabId:sender.tab.id,frameId:0,documentId:actual.documentId,parentDocumentId:null,actualURL:actual.url,documentLifecycle:actual.documentLifecycle,incognito:sender.tab.incognito===true};
   const resolution=authority.peek(frame),scope=authority.scopeFor(frame),profile=profiles.get(message.profileId);
   if(resolution.state!=='verified'||!scope||!profile||profile.revision!==message.profileVersion||!handshake.isBound(message,sender))return deny();
   prune();const previous=producers.get(message.producerToken);
   if(previous&&(previous.grantId!==resolution.grant.id||previous.scopeEpoch!==resolution.grant.scopeEpoch||previous.scopeKey!==scope.key||previous.profile!==profile))return deny();
   if(previous&&message.passSeq<previous.message.passSeq)return deny();
   if(previous&&message.passSeq===previous.message.passSeq){
    // A terminal message that validates first is a tombstone even when start
    // is still awaiting getFrame. Duplicate starts cannot renew any deadline.
    if(message.phase!=='start'){previous.terminal=true;return {ok:true};}
    return {ok:current(previous)};
   }
   if(!previous&&producers.size>=maxProducers)return deny();
   const entry={message,sender,frame,profile,scopeKey:scope.key,grantId:resolution.grant.id,scopeEpoch:resolution.grant.scopeEpoch,startedTime:attempt.time,startedElapsed:attempt.started,lastTime:attempt.time,lastElapsed:attempt.started,terminal:message.phase!=='start'};
   producers.set(message.producerToken,entry);
   return {ok:message.phase!=='start'||current(entry)};
  },{now:elapsedNow,schedule,cancel});}catch{return deny();}finally{attempt.active=false;requests.delete(attempt);}
 }
 function invalidate(predicate){for(const entry of producers.values())if(predicate(entry.frame))entry.terminal=true;for(const attempt of requests)if(predicate({tabId:attempt.sender.tab?.id,documentId:attempt.sender.documentId}))attempt.active=false;}
 return Object.freeze({handle,isPending(scopeKey){if(typeof scopeKey!=='string'||!scopeKey||stopped)return false;prune();let pending=false;for(const entry of producers.values())if(entry.scopeKey===scopeKey&&current(entry))pending=true;return pending;},invalidateDocument:documentId=>invalidate(frame=>frame.documentId===documentId),invalidateTab:tabId=>invalidate(frame=>frame.tabId===tabId),stop(){stopped=true;for(const request of requests)request.active=false;requests.clear();producers.clear();}});
}
