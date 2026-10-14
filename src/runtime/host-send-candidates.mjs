import {createSendCorrelator} from '../host/send-correlator.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {digest} from '../data/hash.mjs';
import {prepareSendAckAdmission} from './send-ack-admission.mjs';
/** Private correlation with an optional guarded ACK consumer; no repository writes here. */
export function createHostSendCandidates({observations,reader,enabled=false,now=Date.now,onCandidate=null,onAcknowledged=null,schedule=null,cancel=null,maxBindings=128}={}){
 if((schedule!==null||cancel!==null)&&(typeof schedule!=='function'||typeof cancel!=='function'))throw Error('invalid-send-ack-scheduler');
 if(onAcknowledged!==null&&(typeof onAcknowledged!=='function'||typeof reader?.withReadback!=='function'))throw Error('invalid-send-ack-consumer');
 if(typeof observations?.withCurrent!=='function'||typeof observations?.isCurrentProof!=='function'||typeof observations?.isCurrentProducer!=='function'||typeof enabled!=='boolean'||enabled&&typeof reader?.read!=='function'||typeof now!=='function'||onCandidate!==null&&typeof onCandidate!=='function'||!Number.isInteger(maxBindings)||maxBindings<1||maxBindings>128)throw Error('invalid-host-send-candidates');
 const entries=new Map(),inflight=new Map();let stopped=false,settled=Promise.resolve();
 function clearRetry(entry){if(entry.retry!==null){cancel?.(entry.retry);entry.retry=null;}}
 function armRetry(entry){
  if(!entry)return;clearRetry(entry);
  if(stopped||!enabled||!onAcknowledged||!schedule||!entry.pendingAcks.size||![...entries.values()].includes(entry)||entry.readAttempts>=3||!entry.proof||observations.isCurrentProof(entry.proof)!==true)return;
  const at=now();if(!Number.isFinite(at))return;
  const eligible=[...entry.pendingAcks.values()].filter(p=>p.attempts<3&&p.wakeups<2&&at>=Date.parse(p.candidate.observedAt)&&at-Date.parse(p.candidate.observedAt)<30000);
  if(!eligible.length)return;
  const delay=Math.max(1,Math.min(...eligible.map(p=>Math.max(p.lastAttempt+1000,entry.lastReadAt+1000)-at)));
  const proof=entry.proof;
  entry.retry=schedule(()=>{entry.retry=null;if(stopped||![...entries.values()].includes(entry)||entry.proof!==proof||observations.isCurrentProof(proof)!==true)return;for(const pending of eligible)pending.wakeups++;return observe(proof).catch(()=>{});},delay);
 }
 const active=()=>{if(stopped)throw Error('host-send-candidates-stopped');if(!enabled)throw Error('host-send-candidates-disabled');};
 function binding(context){const b={scopeKey:context.scope?.key,documentToken:context.documentToken,producerToken:context.producerToken,routeEpoch:context.routeEpoch,bodyEpoch:context.bodyEpoch,conversationId:context.conversationId};if(typeof b.scopeKey!=='string'||!b.scopeKey||!['documentToken','producerToken','conversationId'].every(k=>tokenOK(b[k]))||!['routeEpoch','bodyEpoch'].every(k=>Number.isSafeInteger(b[k])&&b[k]>=0)||typeof context.guard!=='function'||!context.signal)throw Error('invalid-send-context');return b;}
 function check(context){active();if(context.signal.aborted||context.guard()!==true)throw Error('stale-send-context');}
 function entryFor(context){check(context);const b=binding(context),key=b.producerToken,signature=JSON.stringify(b);let entry=entries.get(key);if(entry?.signature!==signature){if(entry){clearRetry(entry);entry.correlator.stop();entries.delete(key);}for(const [otherKey,other]of entries)if(otherKey!==key&&observations.isCurrentProducer(otherKey)!==true){clearRetry(other);other.correlator.stop();entries.delete(otherKey);}if(entries.size>=maxBindings)throw Error('host-send-capacity');const correlator=createSendCorrelator({now});correlator.bind(b);entry={signature,correlator,baseline:false,proof:null,generation:0,readProof:null,readAttempts:0,lastReadAt:null,pendingAcks:new Map(),retry:null};entries.set(key,entry);}return entry;}
 function publish(candidates){if(onCandidate)for(const candidate of candidates){try{onCandidate(candidate);}catch{/* A diagnostic consumer cannot authorize retries. */}}return candidates;}
 function observe(proofId){
  try{active();if(!tokenOK(proofId))throw Error('invalid-body-proof');}catch(error){return Promise.reject(error);}
  if(inflight.has(proofId))return inflight.get(proofId);
  if(inflight.size>=maxBindings)return Promise.reject(Error('host-send-capacity'));
  let context,entry,generation;
  const pending=settled.then(()=>observations.withCurrent(proofId,async current=>{
   context=current;entry=entryFor(current);
   const at=now();if(!Number.isFinite(at))throw Error('send-clock-invalid');
   for(const [key,pending]of entry.pendingAcks){const age=at-Date.parse(pending.candidate.observedAt);if(age<0||age>=30000||pending.attempts>=3)entry.pendingAcks.delete(key);}
   if(entry.proof===proofId&&entry.baseline&&![...entry.pendingAcks.values()].some(p=>at-p.lastAttempt>=1000))return [];
   // A partial response is not a permanent completion. Retry only on a later
   // observation, with a per-proof budget. Only pending ACKs get finite wakeups.
   if(entry.readProof===proofId){if(entry.readAttempts>=3||at-entry.lastReadAt<1000)return [];}
   else{entry.readProof=proofId;entry.readAttempts=0;}
   entry.readAttempts++;entry.lastReadAt=at;
   generation=++entry.generation;
   const value=await reader.read(proofId);check(current);
   if(entries.get(current.producerToken)!==entry||entry.generation!==generation)throw Error('stale-send-observation');
   if(!value||value.conversationId!==current.conversationId||value.bodyEpoch!==current.bodyEpoch||value.state!==value.metadata?.state)throw Error('invalid-send-metadata');
   const candidates=entry.correlator.observe(value.metadata);entry.baseline=value.metadata.state==='candidate'&&value.metadata.gaps?.length===0;
   if(!entry.baseline)entry.pendingAcks.clear();
   if(onAcknowledged){
    for(const candidate of candidates){if(entry.pendingAcks.size>=32)throw Error('send-ack-capacity');const message=value.metadata.messages.find(m=>m.messageId===candidate.messageId);entry.pendingAcks.set(candidate.messageId,{candidate,semantic:digest(message),dependencies:value.metadata.messages.map(m=>[m.messageId,digest(m)]),attempts:0,wakeups:0,lastAttempt:null});}
    for(const [key,pendingAck]of entry.pendingAcks){
     const candidate=pendingAck.candidate,message=value.metadata.messages.find(m=>m.messageId===key);
     if(!message||digest(message)!==pendingAck.semantic||pendingAck.dependencies.some(([id,semantic])=>{const currentMessage=value.metadata.messages.find(m=>m.messageId===id);return !currentMessage||digest(currentMessage)!==semantic;})){entry.pendingAcks.delete(key);continue;}
     if(pendingAck.lastAttempt!==null&&at-pendingAck.lastAttempt<1000)continue;
     pendingAck.attempts++;pendingAck.lastAttempt=at;let entered=false;
     try{await reader.withReadback(value,proofId,candidate.messageId,async({profile,readback,guard:readbackGuard})=>{
    const guard=()=>{check(current);readbackGuard();if(entries.get(current.producerToken)!==entry||entry.generation!==generation||observations.isCurrentProof(proofId)!==true)throw Error('stale-send-observation');};
    guard();const context={proofId,conversationId:current.conversationId,bodyEpoch:current.bodyEpoch,scopeKey:current.scope.key,principalKey:current.scope.accountId,contextKey:current.scope.organizationId,providerProfile:current.providerProfile,providerTransport:current.providerTransport};
    const admission=prepareSendAckAdmission({profile,context,candidate,readback,intentAt:candidate.observedAt,observedAt:new Date(now()).toISOString()});
    guard();entered=true;await onAcknowledged({admission,context:current,guard});guard();
     });entry.pendingAcks.delete(key);
     }catch(error){if(entered||error?.message!=='pending-send-ack')throw error;check(current);if(pendingAck.attempts>=3)entry.pendingAcks.delete(key);}
    }
   }
   entry.proof=proofId;check(current);return candidates;
  })).then(candidates=>{active();if(observations.isCurrentProof(proofId)!==true)throw Error('stale-send-proof');if(entries.get(context.producerToken)!==entry||generation!==undefined&&entry.generation!==generation)throw Error('stale-send-observation');return publish(candidates);}).catch(error=>{if(entry&&generation!==undefined&&entry.generation===generation){entry.baseline=false;entry.proof=null;entry.correlator.invalidate();entries.forEach((value,key)=>{if(value===entry)entries.delete(key);});}throw error;}).finally(()=>{if(inflight.get(proofId)===pending)inflight.delete(proofId);armRetry(entry);});
  settled=pending.catch(()=>{});inflight.set(proofId,pending);return pending;
 }
 async function intent(proofId,value){
  active();if(!tokenOK(proofId))throw Error('invalid-body-proof');if(!exactHostRecord(value,['intentId','kind','isComposing'])||!tokenOK(value.intentId)||value.kind!=='send'||value.isComposing!==false)return null;const input={intentId:value.intentId,kind:'send',isComposing:false};let usedEntry=null,intentGeneration=null;return observations.withCurrent(proofId,current=>{const entry=entryFor(current);usedEntry=entry;intentGeneration=entry.generation;check(current);if(!entry.baseline||entry.proof!==proofId)return null;const candidate=entry.correlator.intent(input);check(current);return candidate;}).then(candidate=>{active();if(observations.isCurrentProof(proofId)!==true)throw Error('stale-send-proof');return candidate;}).catch(error=>{if(usedEntry&&usedEntry.generation===intentGeneration){usedEntry.correlator.invalidate();usedEntry.baseline=false;usedEntry.proof=null;entries.forEach((entry,key)=>{if(entry===usedEntry)entries.delete(key);});}throw error;});
 }
 function stop(){if(stopped)return;stopped=true;for(const entry of entries.values()){clearRetry(entry);entry.correlator.stop();}entries.clear();inflight.clear();}
 return Object.freeze({observe,intent,stop});
}
