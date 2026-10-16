import {evidenceSourceIncarnation} from './evidence-source-incarnation.mjs';
import {normalizedScope} from '../b1/identity.mjs';
import {digest} from '../data/hash.mjs';
/** Internal consumer only; never expose this owner through an extension message. */
export function createHostSendAckOwner({evidenceRepository,profileFor,commitNative=null,drain=null,now=Date.now}={}){
 if(typeof evidenceRepository!=='function'||typeof profileFor!=='function'||typeof now!=='function')throw Error('invalid-send-ack-owner');
 const gates=new WeakMap();let stopped=false;
 function gate(scope,request){const value=gates.get(request);return value&&value.scopeKey===normalizedScope(scope)?.key&&value.guard()?value:null;}
 async function consume({admission,context,guard}){
  const scope=normalizedScope(context?.scope),snapshot=structuredClone(admission),ack=snapshot?.ackWitness;
  if(!scope||snapshot.actorScopeKey!==scope.key||snapshot.actorVerified!==true||snapshot.conversationId!==context.conversationId||typeof guard!=='function'||ack?.kind!=='authenticated-message-readback')throw Error('invalid-send-ack-owner-admission');
  const signal=context.signal,profile=profileFor(ack.profileId);
  if(!profile||profile.id!==ack.profileId||profile.revision!==ack.profileVersion||profile.providerProfile!==context.providerProfile)throw Error('invalid-send-ack-owner-profile');
  const profileFingerprint=digest(profile),intentAt=Date.parse(snapshot.candidateInterval?.from),firstAt=Date.parse(snapshot.firstObservedAt);
  if(!Number.isFinite(intentAt)||!Number.isFinite(firstAt))throw Error('invalid-send-ack-owner-time');
  let active=true;
  const current=()=>{try{const clock=now();if(stopped||!active||signal?.aborted||profileFor(profile.id)!==profile||digest(profile)!==profileFingerprint||!Number.isFinite(clock)||clock<firstAt||clock-intentAt>=30000)return false;if(guard()===false)return false;return true;}catch{return false;}};
  const check=()=>{if(!current())throw Error('stale-send-ack-owner');};
  const at=now();if(!Number.isFinite(at)||Date.parse(snapshot.firstObservedAt)>at||at-Date.parse(snapshot.candidateInterval?.from)>=30000)throw Error('expired-send-ack-owner');
  const observedAt=new Date(at).toISOString(),validUntil=new Date(at+60000).toISOString();
  const eventKey='send_'+digest([scope.key,snapshot.conversationId,snapshot.messageId]).slice(0,48);
  const repository=evidenceRepository();
  try{for(let attempt=0;attempt<2;attempt++){
   check();const page=await repository.page(scope,{ids:[snapshot.conversationId],limit:1},{guard:current,signal});check();
   const {sourceId,generation,sourceRevision}=evidenceSourceIncarnation(page.evidence.sources,profile,1);
   const operationId='ack_'+digest([scope.key,profile.id,profile.revision,snapshot.conversationId,snapshot.messageId,ack.semanticFingerprint,sourceId,generation]).slice(0,48);
   const evidence={sources:[{id:sourceId,generation,sourceRevision,observedAt,validUntil,channel:'host-evidence',codecVersion:1,profileId:profile.id,profileVersion:profile.revision}],events:[],coverage:[],hints:[{...snapshot,id:eventKey,sourceId,generation,sourceRevision,observedAt,eventKey,hintType:'observed-self-send',anchorVersion:1,calibrationDueAt:validUntil}]};
   const prior=page.evidence.hints[eventKey];
   if(prior){if(prior.revoked||prior.sourceId!==sourceId||prior.generation!==generation||page.evidence.sources[sourceId]?.revoked!==false||prior.conversationId!==snapshot.conversationId||prior.messageId!==snapshot.messageId||prior.actorScopeKey!==scope.key||digest(prior.ackWitness)!==digest(ack))throw Error('send-ack-existing-conflict');return {ok:true,replayed:true,revision:page.revision};}
   const request={operationId,expectedRevision:page.revision,batch:evidence};
   if(commitNative){
    gates.set(request,{scopeKey:scope.key,channel:'host-evidence',sourceId,generation,guard:current,profileId:profile.id,profileVersion:profile.revision});
    let joint;try{check();joint=await commitNative({context,evidenceRequest:request,guard:current});}finally{gates.delete(request);}check();
    if(joint){
     if(joint.ok!==true)throw Error('joint-native-apply-failed');
     // Pending payload is durable now. Completion may be retried under a fresh
     // owner grant; never write a second ordinary evidence operation here.
     const result=await drain?.({scope,guard:current,signal,profileId:profile.id,profileVersion:profile.revision});
     return {ok:true,nativeOperationId:joint.nativeOperationId,pending:result?.state!=='complete',continuation:result?.state??'pending'};
    }
   }
   gates.set(request,{scopeKey:scope.key,channel:'host-evidence',sourceId,generation,guard:current,profileId:profile.id,profileVersion:profile.revision});
   let result;try{check();result=await repository.apply(scope,request,{guard:current,signal});}finally{gates.delete(request);}check();
   if(result?.ok===true)return result;
   if(result?.reason!=='revision-conflict'||attempt===1)throw Error(result?.reason??'send-ack-persist-failed');
  }}finally{active=false;}
 }
 return Object.freeze({gate,consume,stop(){stopped=true;}});
}
