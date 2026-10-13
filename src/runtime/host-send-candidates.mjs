import {createSendCorrelator} from '../host/send-correlator.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Private RAM candidate correlation. Never signs an ACK or writes activity facts. */
export function createHostSendCandidates({observations,reader,enabled=false,now=Date.now,onCandidate=null,maxBindings=128}={}){
 if(typeof observations?.withCurrent!=='function'||typeof observations?.isCurrentProof!=='function'||typeof observations?.isCurrentProducer!=='function'||typeof enabled!=='boolean'||enabled&&typeof reader?.read!=='function'||typeof now!=='function'||onCandidate!==null&&typeof onCandidate!=='function'||!Number.isInteger(maxBindings)||maxBindings<1||maxBindings>128)throw Error('invalid-host-send-candidates');
 const entries=new Map(),inflight=new Map();let stopped=false,settled=Promise.resolve();
 const active=()=>{if(stopped)throw Error('host-send-candidates-stopped');if(!enabled)throw Error('host-send-candidates-disabled');};
 function binding(context){const b={scopeKey:context.scope?.key,documentToken:context.documentToken,producerToken:context.producerToken,routeEpoch:context.routeEpoch,bodyEpoch:context.bodyEpoch,conversationId:context.conversationId};if(typeof b.scopeKey!=='string'||!b.scopeKey||!['documentToken','producerToken','conversationId'].every(k=>tokenOK(b[k]))||!['routeEpoch','bodyEpoch'].every(k=>Number.isSafeInteger(b[k])&&b[k]>=0)||typeof context.guard!=='function'||!context.signal)throw Error('invalid-send-context');return b;}
 function check(context){active();if(context.signal.aborted||context.guard()!==true)throw Error('stale-send-context');}
 function entryFor(context){check(context);const b=binding(context),key=b.producerToken,signature=JSON.stringify(b);let entry=entries.get(key);if(entry?.signature!==signature){if(entry){entry.correlator.stop();entries.delete(key);}for(const [otherKey,other]of entries)if(otherKey!==key&&observations.isCurrentProducer(otherKey)!==true){other.correlator.stop();entries.delete(otherKey);}if(entries.size>=maxBindings)throw Error('host-send-capacity');const correlator=createSendCorrelator({now});correlator.bind(b);entry={signature,correlator,baseline:false,proof:null,generation:0,readProof:null,readAttempts:0,lastReadAt:null};entries.set(key,entry);}return entry;}
 function publish(candidates){if(onCandidate)for(const candidate of candidates){try{onCandidate(candidate);}catch{/* A diagnostic consumer cannot authorize retries. */}}return candidates;}
 function observe(proofId){
  try{active();if(!tokenOK(proofId))throw Error('invalid-body-proof');}catch(error){return Promise.reject(error);}
  if(inflight.has(proofId))return inflight.get(proofId);
  if(inflight.size>=maxBindings)return Promise.reject(Error('host-send-capacity'));
  let context,entry,generation;
  const pending=settled.then(()=>observations.withCurrent(proofId,async current=>{
   context=current;entry=entryFor(current);
   const at=now();if(!Number.isFinite(at))throw Error('send-clock-invalid');
   if(entry.proof===proofId&&entry.baseline)return [];
   // A partial response is not a permanent completion. Retry only on a later
   // explicit observation, with a per-proof budget; never schedule polling.
   if(entry.readProof===proofId){if(entry.readAttempts>=3||at-entry.lastReadAt<1000)return [];}
   else{entry.readProof=proofId;entry.readAttempts=0;}
   entry.readAttempts++;entry.lastReadAt=at;
   generation=++entry.generation;
   const value=await reader.read(proofId);check(current);
   if(entries.get(current.producerToken)!==entry||entry.generation!==generation)throw Error('stale-send-observation');
   if(!value||value.conversationId!==current.conversationId||value.bodyEpoch!==current.bodyEpoch||value.state!==value.metadata?.state)throw Error('invalid-send-metadata');
   const candidates=entry.correlator.observe(value.metadata);entry.baseline=value.metadata.state==='candidate'&&value.metadata.gaps?.length===0;
   entry.proof=proofId;check(current);return candidates;
  })).then(candidates=>{active();if(observations.isCurrentProof(proofId)!==true)throw Error('stale-send-proof');if(entries.get(context.producerToken)!==entry||generation!==undefined&&entry.generation!==generation)throw Error('stale-send-observation');return publish(candidates);}).catch(error=>{if(entry&&generation!==undefined&&entry.generation===generation){entry.baseline=false;entry.proof=null;entry.correlator.invalidate();entries.forEach((value,key)=>{if(value===entry)entries.delete(key);});}throw error;}).finally(()=>{if(inflight.get(proofId)===pending)inflight.delete(proofId);});
  settled=pending.catch(()=>{});inflight.set(proofId,pending);return pending;
 }
 async function intent(proofId,value){
  active();if(!tokenOK(proofId))throw Error('invalid-body-proof');if(!exactHostRecord(value,['intentId','kind','isComposing'])||!tokenOK(value.intentId)||value.kind!=='send'||value.isComposing!==false)return null;const input={intentId:value.intentId,kind:'send',isComposing:false};let usedEntry=null,intentGeneration=null;return observations.withCurrent(proofId,current=>{const entry=entryFor(current);usedEntry=entry;intentGeneration=entry.generation;check(current);if(!entry.baseline||entry.proof!==proofId)return null;const candidate=entry.correlator.intent(input);check(current);return candidate;}).then(candidate=>{active();if(observations.isCurrentProof(proofId)!==true)throw Error('stale-send-proof');return candidate;}).catch(error=>{if(usedEntry&&usedEntry.generation===intentGeneration){usedEntry.correlator.invalidate();usedEntry.baseline=false;usedEntry.proof=null;entries.forEach((entry,key)=>{if(entry===usedEntry)entries.delete(key);});}throw error;});
 }
 function stop(){if(stopped)return;stopped=true;for(const entry of entries.values())entry.correlator.stop();entries.clear();inflight.clear();}
 return Object.freeze({observe,intent,stop});
}
