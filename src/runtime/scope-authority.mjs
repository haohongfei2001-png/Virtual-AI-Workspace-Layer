import {withRequestDeadline} from '../data/request-deadline.mjs';
import {digest} from '../data/hash.mjs';
import {normalizedScope,tokenOK} from '../b1/identity.mjs';
/** Owner-only identity snapshots. The page cannot call the fixed provider or supply proofs. */
export function createScopeAuthority({provider,profile,now=Date.now,makeId=()=>crypto.randomUUID(),proofTTL=60000,maxDocuments=128,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,allowedURL=value=>{try{const u=new URL(value);return u.origin==='https://chatgpt.com'&&!u.username&&!u.password;}catch{return false;}}}={}){
 if(typeof provider?.read!=='function'||!tokenOK(profile?.id)||typeof profile.singlePersonalDefault!=='boolean'||!Number.isInteger(proofTTL)||proofTTL<1000||proofTTL>300000||!Number.isInteger(maxDocuments)||maxDocuments<1||maxDocuments>512)throw Error('invalid-scope-authority');
 const states=new Map();let epoch=0;
 const valid=f=>f&&Number.isSafeInteger(f.tabId)&&f.tabId>=0&&f.frameId===0&&tokenOK(f.documentId)&&f.documentLifecycle==='active'&&f.incognito===false&&typeof f.actualURL==='string'&&allowedURL(f.actualURL);
 const key=f=>`${f.tabId}:${f.documentId}`;
 const unverified=reason=>({state:'unverified',reason});
 const same=(a,b)=>a.tabId===b.tabId&&a.documentId===b.documentId&&a.actualURL===b.actualURL&&b.incognito===false&&b.documentLifecycle==='active';
 function invalidate(documentId,reason='scope-invalidated'){
  for(const [k,entry]of states)if(entry.frame.documentId===documentId){entry.abort?.abort();states.delete(k);}
 }
 function peek(frame){
  if(!valid(frame))return unverified('invalid-scope-frame');const entry=states.get(key(frame));
  if(!entry||entry.abort.signal.aborted||!same(entry.frame,frame))return unverified('scope-not-verified');
  if(entry.pending)return {state:'pending',retryAt:new Date(entry.started+6000).toISOString()};
  if(entry.grant&&now()<entry.until)return {state:'verified',grant:entry.grant};
  return entry.grant?unverified('scope-proof-expired'):entry.result??unverified('scope-not-verified');
 }
 function refresh(frame,reason,signal){
  if(!valid(frame)||!['bind','focus','expiry','auth-change'].includes(reason))return Promise.resolve(unverified('invalid-scope-refresh'));
  if(signal?.aborted)return Promise.resolve(unverified('scope-refresh-aborted'));
  const cached=peek(frame);if(reason==='bind'&&cached.state==='verified')return Promise.resolve(cached);
  const k=key(frame),prior=states.get(k);
  if(prior?.pending&&same(prior.frame,frame)&&reason!=='auth-change')return prior.pending;
  prior?.abort?.abort();states.delete(k);
  for(const [id,entry]of states)if(!entry.pending&&entry.until<=now())states.delete(id);
  if(states.size>=maxDocuments)return Promise.resolve(unverified('scope-capacity'));
  const abort=new AbortController(),entry={frame:Object.freeze({...frame}),started:now(),elapsedStarted:elapsedNow(),until:now()+6000,abort,grant:null,result:null,pending:null,epoch:++epoch};
  states.set(k,entry);const cancelRefresh=()=>abort.abort();signal?.addEventListener('abort',cancelRefresh,{once:true});
  const current=()=>states.get(k)===entry&&!abort.signal.aborted;
  let onAbort;const aborted=new Promise((_,reject)=>{onAbort=()=>reject(Error('scope-refresh-aborted'));abort.signal.addEventListener('abort',onAbort,{once:true});});
  const task=withRequestDeadline(()=>Promise.race([Promise.resolve().then(()=>provider.read({signal:abort.signal})),aborted]),{timeoutMs:6000,now:elapsedNow,schedule,cancel}).then(identity=>{
   if(!current())return unverified('stale-scope-refresh');
   const expiry=Date.parse(identity?.expiresAt),time=now();
   if(!Number.isFinite(expiry)||expiry<=time||elapsedNow()-entry.elapsedStarted>=6000||typeof identity?.principalId!=='string'||!identity.principalId||identity.principalId.length>1024||!Array.isArray(identity.contexts)||identity.contexts.length>256||!tokenOK(identity.providerProfile)||!['worker-fixed-fetch','isolated-fixed-fetch'].includes(identity.transport))throw Error('invalid-principal-proof');
   const ids=new Set();for(const context of identity.contexts){if(typeof context.id!=='string'||!context.id||context.id.length>1024||ids.has(context.id)||!['personal','organization','unknown'].includes(context.kind))throw Error('invalid-context-roster');ids.add(context.id);}
   // C3 is enabled only by a packaged profile whose default-context semantics
   // have separate offline/live evidence. A roster's first item never selects it.
   if(!profile.singlePersonalDefault||identity.contexts.length!==1||identity.contexts[0].kind!=='personal'){entry.result={state:'ambiguous',reason:'current-context-unproven'};entry.until=time+proofTTL;return entry.result;}
   const contextId=identity.contexts[0].id,principalKey='principal_'+digest(['chatgpt-principal-v1',identity.principalId]);
   const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:principalKey,organizationId:'context_'+digest(['chatgpt-context-v1',identity.principalId,contextId])});
   const issuedAt=new Date(time).toISOString(),until=Math.min(expiry,time+proofTTL),expiresAt=new Date(until).toISOString();
   const receipt=makeId(),grantId=makeId();if(!tokenOK(receipt)||!tokenOK(grantId)||receipt===grantId)throw Error('invalid-scope-proof-id');
   const principal=Object.freeze({id:receipt,principalKey,sessionGeneration:entry.epoch,providerProfile:identity.providerProfile,transport:identity.transport,verifiedAt:issuedAt,expiresAt});
   const context=Object.freeze({kind:'single-personal-context',rosterReceiptId:receipt,bindingProfile:profile.id,contextKey:scope.organizationId,documentId:entry.frame.documentId,selectionEpoch:entry.epoch});
   entry.scope=scope;entry.until=until;entry.grant=Object.freeze({id:grantId,scopeKey:scope.key,principal,context,scopeEpoch:entry.epoch,issuedAt,expiresAt});
   return {state:'verified',grant:entry.grant};
  }).catch(error=>{const result=unverified(current()?(error?.message==='invalid-context-roster'?'invalid-context-roster':'scope-provider-unavailable'):'stale-scope-refresh');if(states.get(k)===entry){entry.result=result;entry.grant=null;entry.scope=null;abort.abort();}return result;}).finally(()=>{signal?.removeEventListener('abort',cancelRefresh);abort.signal.removeEventListener('abort',onAbort);if(states.get(k)===entry)entry.pending=null;});
  entry.pending=task;return task;
 }
 function scopeFor(frame){const result=peek(frame);return result.state==='verified'?states.get(key(frame)).scope:null;}
 function invalidateTab(tabId){for(const [k,entry]of states)if(entry.frame.tabId===tabId){entry.abort.abort();states.delete(k);}}
 return Object.freeze({peek,refresh,invalidate,invalidateTab,scopeFor});
}
