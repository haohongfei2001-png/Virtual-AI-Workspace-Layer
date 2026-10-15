import {normalizedScope} from '../b1/identity.mjs';
import {digest} from '../data/hash.mjs';
/** Private authenticated historical read consumer; no message endpoint. */
export function createHostHistoricalSendOwner({evidenceRepository,profileFor,now=Date.now}={}){
 if(typeof evidenceRepository!=='function'||typeof profileFor!=='function')throw Error('invalid-historical-owner');
 const gates=new WeakMap();let stopped=false;
 const gate=(scope,request)=>{const g=gates.get(request);return g&&g.scopeKey===normalizedScope(scope)?.key&&g.guard()?g:null;};
 async function consume({history,context,guard}){
  const scope=normalizedScope(context.scope),profile=profileFor(history.profile.id),at=now();
  if(!scope||!profile||digest(profile)!==digest(history.profile)||history.principalKey!==scope.accountId||history.contextKey!==scope.organizationId||history.conversationId!==context.conversationId||history.providerProfile!==context.providerProfile||profile.providerProfile!==context.providerProfile||history.transport!=='worker-fixed-fetch'||!Array.isArray(history.messages)||history.messages.length>256||typeof guard!=='function')throw Error('invalid-historical-admission');
  const fingerprint=digest(profile);let active=true;
  const current=()=>{try{if(stopped||!active||context.signal?.aborted||profileFor(profile.id)!==profile||digest(profile)!==fingerprint||!Number.isFinite(now())||now()<at||now()-at>=6000||Date.parse(history.expiresAt)<=now())return false;if(guard()===false)return false;return true;}catch{return false;}};
  const check=()=>{if(!current())throw Error('stale-historical-admission');};
  const rows=structuredClone(history.messages),observedAt=new Date(at).toISOString(),validUntil=new Date(at+60000).toISOString(),sourceId='host_history_'+digest(profile.id).slice(0,32),generation='profile_'+profile.revision;
  const semantic=m=>[m.conversationId,m.messageId,m.actorScopeKey,m.role,m.kind,m.sendState,m.sentAt,m.precision];
  try{for(let attempt=0;attempt<2;attempt++){
   check();const repository=evidenceRepository(),page=await repository.page(scope,{ids:[context.conversationId],limit:1},{guard:current,signal:context.signal});check();
   const sourceRevision=(page.evidence.sources[sourceId]?.sourceRevision??0)+1,events=[];
   for(const m of rows){
    if(m.conversationId!==context.conversationId||m.authorPrincipalKey!==scope.accountId||!context.messageIds.includes(m.messageId)||Date.parse(m.sentAt)>at)throw Error('invalid-historical-message');
    const {authorPrincipalKey,...data}=m,id='history_'+digest([scope.key,m.conversationId,m.messageId]).slice(0,48),row={...data,id,sourceId,generation,sourceRevision,observedAt,actorVerified:true,actorScopeKey:scope.key},prior=page.evidence.events[id];
    if(prior){if(prior.revoked)throw Error('historical-send-conflict');if(digest(semantic(prior))===digest(semantic(row)))continue;
     // Keep both original-time claims. Projection rejects contested message identity; never replace it with the later timestamp.
     row.id='history_conflict_'+digest([scope.key,semantic(row)]).slice(0,44);const conflict=page.evidence.events[row.id];if(conflict){if(conflict.revoked||digest(semantic(conflict))!==digest(semantic(row)))throw Error('historical-send-conflict');continue;}
    }events.push(row);
   }
   if(!events.length)return {ok:true,replayed:true,revision:page.revision};
   const request={operationId:'history_'+digest([scope.key,profile.id,page.revision,events.map(semantic)]).slice(0,48),expectedRevision:page.revision,batch:{sources:[{id:sourceId,generation,sourceRevision,observedAt,validUntil,channel:'host-evidence',codecVersion:2,profileId:profile.id,profileVersion:profile.revision}],events,hints:[],coverage:[]}};
   gates.set(request,{scopeKey:scope.key,channel:'host-evidence',purpose:'historical-send',codecVersion:2,sourceId,generation,profileId:profile.id,profileVersion:profile.revision,guard:current});
   let result;try{check();result=await repository.apply(scope,request,{guard:current,signal:context.signal});}finally{gates.delete(request);}check();
   if(result?.ok)return result;if(result?.reason!=='revision-conflict'||attempt===1)throw Error(result?.reason??'historical-persist-failed');
  }}finally{active=false;}
 }
 return Object.freeze({consume,gate,stop(){stopped=true;}});
}
