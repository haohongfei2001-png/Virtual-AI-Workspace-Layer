import {normalizedScope} from '../b1/identity.mjs';
import {digest} from '../data/hash.mjs';
import {continuationSemanticFingerprint} from '../data/native-observation-continuation.mjs';
/** Internal consumer only; never expose this owner through an extension message. */
export function createHostSendAckOwner({nativeRepository,profileFor,now=Date.now}={}){
 if(typeof nativeRepository!=='function'||typeof profileFor!=='function'||typeof now!=='function')throw Error('invalid-send-ack-owner');
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
  const current=()=>{try{const clock=now();if(stopped||!active||signal?.aborted||profileFor(profile.id)!==profile||digest(profile)!==profileFingerprint||!Number.isFinite(clock)||clock<firstAt||clock-intentAt>=30000)return false;guard();return true;}catch{return false;}};
  const check=()=>{if(!current())throw Error('stale-send-ack-owner');};
  const at=now();if(!Number.isFinite(at)||Date.parse(snapshot.firstObservedAt)>at||at-Date.parse(snapshot.candidateInterval?.from)>=30000)throw Error('expired-send-ack-owner');
  const observedAt=new Date(at).toISOString(),validUntil=new Date(at+60000).toISOString();
  const sourceId='host_ack_'+digest(profile.id).slice(0,32),generation='profile_'+profile.revision;
  const eventKey='send_'+digest([scope.key,snapshot.conversationId,snapshot.messageId]).slice(0,48);
  const operationId='ack_'+digest([scope.key,profile.id,profile.revision,snapshot.conversationId,snapshot.messageId,ack.semanticFingerprint]).slice(0,48);
  const repository=nativeRepository();
  try{for(let attempt=0;attempt<2;attempt++){
   check();const page=await repository.page(scope,{ids:{projects:[],refs:[]},limit:1},{guard:current,signal});check();
   const sourceRevision=(page.facts.sources[sourceId]?.sourceRevision??0)+1;
   const batch={scopeKey:scope.key,sourceRevision,observedAt,validUntil,projects:[],refs:[],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}};
   const evidence={sources:[{id:sourceId,generation,sourceRevision,observedAt,validUntil,channel:'host-evidence',codecVersion:1,profileId:profile.id,profileVersion:profile.revision}],events:[],coverage:[],hints:[{...snapshot,id:eventKey,sourceId,generation,sourceRevision,observedAt,eventKey,hintType:'observed-self-send',anchorVersion:1,calibrationDueAt:validUntil}]};
   const surface={profileId:profile.id,profileVersion:profile.revision,evidenceClass:'surface',semanticFingerprint:digest(batch),acceptedAt:observedAt};
   const request={operationId,expectedRevision:page.revision,batch};
   gates.set(request,{scopeKey:scope.key,channel:'host-dom',sourceId,generation,guard:current,admission:surface,continuation:{evidenceOperationId:operationId+'_evidence',expectedEvidenceRevision:0,batch:evidence},continuationAdmission:{...surface,evidenceClass:'observed-self-send',semanticFingerprint:continuationSemanticFingerprint(evidence)}});
   let result;try{check();result=await repository.apply(scope,request,{guard:current,signal});}finally{gates.delete(request);}check();
   if(result?.ok===true)return result;
   if(result?.reason!=='revision-conflict'||attempt===1)throw Error(result?.reason??'send-ack-persist-failed');
  }}finally{active=false;}
 }
 return Object.freeze({gate,consume,stop(){stopped=true;}});
}
