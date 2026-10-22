import {evidenceSourceIncarnation} from './evidence-source-incarnation.mjs';
import {validateNativeActivityProfile,parseNativeActivityRows} from './native-activity-profile.mjs';
import {normalizedScope} from '../b1/identity.mjs';
import {instant} from '../navigation/projection.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {digest} from '../data/hash.mjs';
/** Private provider callback -> existing scoped evidence CAS. No network, RPC,
 * membership mutation, send/ACK assertion, or independent persistence engine. */
export function createHostNativeActivityOwner({evidenceRepository,profileFor,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof evidenceRepository!=='function'||typeof profileFor!=='function')throw Error('invalid-native-activity-owner');
 const gates=new WeakMap(),attempts=new Set(),latest=new Map();let stopped=false,busy=0;
 const gate=(scope,request)=>{const g=gates.get(request);return g&&g.scopeKey===normalizedScope(scope)?.key&&g.guard()?g:null;};
 async function consume({observation,context,guard}){
  observation=structuredClone(observation);
  const scope=normalizedScope(context?.scope),profile=profileFor(observation?.profileId),at=now();
  if(!Number.isFinite(at)||!scope||!profile||observation.scopeKey!==scope.key||observation.profileVersion!==profile.revision||profile.providerProfile!==context.providerProfile||typeof guard!=='function'||instant(observation.observedAt)===null||instant(observation.observedAt)>at||at-instant(observation.observedAt)>=6000)throw Error('invalid-native-activity-admission');
  validateNativeActivityProfile(profile);const fingerprint=digest(profile),parsed=parseNativeActivityRows({items:observation.items,observedAt:observation.observedAt,profile});
  const observedAt=observation.observedAt,validUntil=new Date(instant(observedAt)+60000).toISOString();let active=true;const observationTime=instant(observedAt),key=JSON.stringify([scope.key,profile.id]),semantics=digest(observation.items);const started=elapsedNow(),abort=new AbortController();busy++;attempts.add(abort);
  const cancelAttempt=()=>abort.abort();context.signal?.addEventListener('abort',cancelAttempt,{once:true});
  let rejectAbort;
  const current=()=>{try{const mark=latest.get(key);return (!mark||mark.time===observationTime&&mark.semantics===semantics)&&!stopped&&active&&!context.signal?.aborted&&!abort.signal.aborted&&elapsedNow()-started>=0&&elapsedNow()-started<6000&&profileFor(profile.id)===profile&&digest(profile)===fingerprint&&now()>=at&&now()-observationTime<6000&&guard()===true;}catch{return false;}};
  const check=()=>{if(!current())throw Error('stale-native-activity');};
  try{
   for(const [k,mark]of latest)if(elapsedNow()-mark.elapsed>=6000)latest.delete(k);
   const previous=latest.get(key);
   if(previous&&(previous.time>observationTime||previous.time===observationTime&&previous.semantics!==semantics))throw Error('stale-native-activity-observation');
   if(!latest.has(key)&&latest.size>=128)throw Error('native-activity-capacity');
   // Private RAM sequencing, not an authorization or a persisted activity date.
   // Fresh proof after restart is still mandatory; repeated values cannot let a
   // late different observation overwrite the newer snapshot in this worker.
   if(stopped||context.signal?.aborted||guard()!==true)throw Error('stale-native-activity');
   latest.set(key,{time:observationTime,semantics,elapsed:started});
   // Install rejection only once the deadline race will observe it. Admission
   // failures above must not leave an unhandled abort promise during cleanup.
   const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('stale-native-activity'));abort.signal.addEventListener('abort',rejectAbort,{once:true});});
   return await withRequestDeadline(()=>Promise.race([aborted,(async()=>{for(let attempt=0;attempt<2;attempt++){
   check();const repository=evidenceRepository(),page=await repository.page(scope,{ids:observation.items.map(r=>r.conversationId),limit:256},{guard:current,signal:abort.signal});check();
   const {sourceId,generation,sourceRevision}=evidenceSourceIncarnation(page.evidence.sources,profile,3),priorSource=page.evidence.sources[sourceId];
   if(priorSource&&instant(priorSource.observedAt)>instant(observedAt))throw Error('stale-native-activity-observation');
   const source={id:sourceId,generation,sourceRevision,observedAt,validUntil,channel:'host-evidence',codecVersion:3,profileId:profile.id,profileVersion:profile.revision,orderDomain:parsed.order?.domain??null,orderBatch:parsed.order?.batch??null};
   const base={sourceId,generation,sourceRevision,observedAt,validUntil};
   const hints=[];
   for(const row of parsed.times){const eventKey='update_'+digest([sourceId,generation,row.conversationId]);hints.push({...base,...row,id:eventKey,eventKey,hintType:'native-activity',semanticsVerified:true});}
   for(const [rank,conversationId]of (parsed.order?.ids??[]).entries()){const eventKey='rank_'+digest([sourceId,generation,conversationId]);hints.push({...base,conversationId,id:eventKey,eventKey,hintType:'native-order',orderDomain:parsed.order.domain,orderBatch:parsed.order.batch,rank});}
   const fresh=hints.filter(h=>{const old=page.evidence.hints[h.id];if(!old)return true;if(old.revoked)throw Error('revoked-native-activity');return h.hintType==='native-order'?old.orderBatch!==h.orderBatch:JSON.stringify(old.candidateInterval)!==JSON.stringify(h.candidateInterval);});
   if(!fresh.length&&priorSource?.orderBatch===source.orderBatch)return {ok:true,replayed:true,revision:page.revision,gaps:parsed.gaps};
   if(!hints.length&&!priorSource)return {ok:true,replayed:true,revision:page.revision,gaps:parsed.gaps};
   const request={operationId:'activity_'+digest([scope.key,sourceId,generation,page.revision,source.orderBatch,fresh]),expectedRevision:page.revision,batch:{sources:[source],events:[],coverage:[],hints:fresh}};
   gates.set(request,{scopeKey:scope.key,channel:'host-evidence',purpose:'native-activity',codecVersion:3,sourceId,generation,profileId:profile.id,profileVersion:profile.revision,guard:current});
   let result;try{result=await repository.apply(scope,request,{guard:current,signal:abort.signal});}finally{gates.delete(request);}check();
   if(result?.ok)return {...result,gaps:parsed.gaps};if(result?.reason!=='revision-conflict'||attempt===1)throw Error(result?.reason??'native-activity-persist-failed');
  }})()]),{now:elapsedNow,schedule,cancel});}finally{active=false;abort.abort();if(rejectAbort)abort.signal.removeEventListener('abort',rejectAbort);context.signal?.removeEventListener('abort',cancelAttempt);attempts.delete(abort);busy--;}
 }
 return Object.freeze({consume,gate,isIdle:()=>!stopped&&busy===0,stop(){stopped=true;for(const abort of attempts)abort.abort();latest.clear();}});
}
