import {withRequestDeadline} from '../data/request-deadline.mjs';
import {digest} from '../data/hash.mjs';
import {normalizedScope,tokenOK} from '../b1/identity.mjs';
/** Owner-only identity snapshots. The page cannot call the fixed provider or supply proofs. */
export function createScopeAuthority({provider,profile,contextObserver=null,now=Date.now,makeId=()=>crypto.randomUUID(),proofTTL=60000,maxDocuments=128,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,allowedURL=value=>{try{const u=new URL(value);return u.origin==='https://chatgpt.com'&&!u.username&&!u.password;}catch{return false;}}}={}){
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
  if(entry.contextReceipt&&contextObserver?.isCurrent(frame,entry.contextReceipt)!==true){invalidate(frame.documentId);return unverified('context-receipt-stale');}
  if(entry.grant&&now()<entry.until)return {state:'verified',grant:entry.grant};
  return entry.grant?unverified('scope-proof-expired'):entry.result??unverified('scope-not-verified');
 }
 function inspectIdentity(identity,elapsedStarted,contextReceipt=null){
  const expiry=Date.parse(identity?.expiresAt),time=now();
  if(!Number.isFinite(expiry)||expiry<=time||elapsedNow()-elapsedStarted>=6000||typeof identity?.principalId!=='string'||!identity.principalId||identity.principalId.length>1024||!Array.isArray(identity.contexts)||identity.contexts.length>256||!tokenOK(identity.providerProfile)||!['worker-fixed-fetch','isolated-fixed-fetch'].includes(identity.transport))throw Error('invalid-principal-proof');
  const ids=new Set();for(const context of identity.contexts){if(typeof context.id!=='string'||!context.id||context.id.length>1024||ids.has(context.id)||!['personal','organization','unknown'].includes(context.kind))throw Error('invalid-context-roster');ids.add(context.id);}
  // A single roster entry selects context only with packaged C3 semantics.
  const selected=contextReceipt&&profile.browserRequestContext===true?identity.contexts.find(c=>c.id===contextReceipt.contextId&&c.kind!=='unknown'):profile.singlePersonalDefault&&identity.contexts.length===1&&identity.contexts[0].kind==='personal'?identity.contexts[0]:null;
  if(!selected)return {time,expiry,scope:null};
  const contextId=selected.id,principalKey='principal_'+digest(['chatgpt-principal-v1',identity.principalId]);
  const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:principalKey,organizationId:'context_'+digest(['chatgpt-context-v1',identity.principalId,contextId])});
  return {time,expiry,scope,principalKey};
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
  const task=withRequestDeadline(()=>Promise.race([Promise.resolve().then(async()=>{const identity=await provider.read({signal:abort.signal});if(!current())throw Error('stale-scope-refresh');const contextReceipt=profile.browserRequestContext===true?await contextObserver?.verify(entry.frame,{signal:abort.signal}):null;return {identity,contextReceipt};}),aborted]),{timeoutMs:6000,now:elapsedNow,schedule,cancel}).then(({identity,contextReceipt})=>{
   if(contextReceipt&&contextObserver.isCurrent(entry.frame,contextReceipt)!==true)return unverified('context-receipt-stale');
   if(!current())return unverified('stale-scope-refresh');
   const {time,expiry,scope,principalKey}=inspectIdentity(identity,entry.elapsedStarted,contextReceipt);
   if(!scope){entry.result={state:'ambiguous',reason:'current-context-unproven'};entry.until=time+proofTTL;return entry.result;}
   const issuedAt=new Date(time).toISOString(),until=Math.min(expiry,time+proofTTL,...(contextReceipt?[contextReceipt.wall+60000]:[])),expiresAt=new Date(until).toISOString();
   const receipt=makeId(),grantId=makeId();if(!tokenOK(receipt)||!tokenOK(grantId)||receipt===grantId)throw Error('invalid-scope-proof-id');
   const associationId=contextReceipt?makeId():null;if(contextReceipt&&(!tokenOK(associationId)||[receipt,grantId,contextReceipt.id].includes(associationId)))throw Error('invalid-context-association-id');
   const principal=Object.freeze({id:receipt,principalKey,sessionGeneration:entry.epoch,providerProfile:identity.providerProfile,transport:identity.transport,verifiedAt:issuedAt,expiresAt});
   const context=Object.freeze(contextReceipt?{kind:'browser-request-context',requestReceiptId:contextReceipt.id,authorizedContextReceiptId:receipt,pageAssociationReceiptId:associationId,contextKey:scope.organizationId,documentId:entry.frame.documentId,selectionEpoch:contextReceipt.selectionEpoch}:{kind:'single-personal-context',rosterReceiptId:receipt,bindingProfile:profile.id,contextKey:scope.organizationId,documentId:entry.frame.documentId,selectionEpoch:entry.epoch});
   entry.contextReceipt=contextReceipt;entry.bindingProfile=profile.id;
   entry.scope=scope;entry.until=until;entry.grant=Object.freeze({id:grantId,scopeKey:scope.key,principal,context,scopeEpoch:entry.epoch,issuedAt,expiresAt});
   return {state:'verified',grant:entry.grant};
  }).catch(error=>{const result=unverified(current()?(error?.message==='invalid-context-roster'?'invalid-context-roster':'scope-provider-unavailable'):'stale-scope-refresh');if(states.get(k)===entry){entry.result=result;entry.grant=null;entry.scope=null;abort.abort();}return result;}).finally(()=>{signal?.removeEventListener('abort',cancelRefresh);abort.signal.removeEventListener('abort',onAbort);if(states.get(k)===entry)entry.pending=null;});
  entry.pending=task;return task;
 }
 function revalidate(frame,signal,{force=false}={}){
  const resolution=peek(frame);
  if(resolution.state!=='verified')return Promise.resolve(unverified('scope-not-verified'));
  const k=key(frame),entry=states.get(k);
  if(signal?.aborted){invalidate(frame.documentId);return Promise.resolve(unverified('scope-refresh-aborted'));}
  if(entry.rechecking)return entry.rechecking;
  if(force!==true&&entry.until-now()>10000)return Promise.resolve(resolution);
  const original=entry.grant,deadline=entry.until,started=elapsedNow();
  const current=()=>states.get(k)===entry&&!entry.abort.signal.aborted&&entry.grant===original&&now()<deadline&&(!entry.contextReceipt||contextObserver?.isCurrent(frame,entry.contextReceipt)===true);
  const cancelRefresh=()=>{if(states.get(k)===entry)invalidate(frame.documentId);};
  signal?.addEventListener('abort',cancelRefresh,{once:true});
  let onAbort;const aborted=new Promise((_,reject)=>{onAbort=()=>reject(Error('scope-refresh-aborted'));entry.abort.signal.addEventListener('abort',onAbort,{once:true});});
  const task=withRequestDeadline(()=>Promise.race([Promise.resolve().then(async()=>{
   if(!current())throw Error('stale-scope-refresh');const identity=await provider.read({signal:entry.abort.signal});if(!current())throw Error('stale-scope-refresh');const contextReceipt=profile.browserRequestContext===true?await contextObserver?.verify(frame,{signal:entry.abort.signal}):null;return {identity,contextReceipt};
  }),aborted]),{timeoutMs:6000,now:elapsedNow,schedule,cancel}).then(({identity,contextReceipt})=>{
   if(!current()||entry.contextReceipt&&contextReceipt!==entry.contextReceipt)throw Error('stale-scope-refresh');
   const {time,expiry,scope,principalKey}=inspectIdentity(identity,started,contextReceipt);
   if(!scope||scope.key!==original.scopeKey||principalKey!==original.principal.principalKey||scope.organizationId!==original.context.contextKey||profile.id!==entry.bindingProfile||identity.providerProfile!==original.principal.providerProfile||identity.transport!==original.principal.transport)throw Error('scope-identity-changed');
   const receipt=makeId();if(!tokenOK(receipt)||receipt===original.id||receipt===original.principal.id)throw Error('invalid-scope-proof-id');
   const until=Math.min(expiry,time+proofTTL,...(contextReceipt?[contextReceipt.wall+60000]:[])),expiresAt=new Date(until).toISOString(),verifiedAt=new Date(time).toISOString();
   const principal=Object.freeze({...original.principal,id:receipt,verifiedAt,expiresAt});
   const context=Object.freeze({...original.context,...(entry.contextReceipt?{authorizedContextReceiptId:receipt}:{rosterReceiptId:receipt})});
   if(!current())throw Error('stale-scope-refresh');
   entry.until=until;entry.grant=Object.freeze({...original,principal,context,expiresAt});
   return {state:'verified',grant:entry.grant};
  }).catch(error=>{
   if(states.get(k)===entry)invalidate(frame.documentId);
   return unverified(error?.message==='scope-identity-changed'?'scope-identity-changed':'scope-revalidation-failed');
  }).finally(()=>{signal?.removeEventListener('abort',cancelRefresh);entry.abort.signal.removeEventListener('abort',onAbort);if(entry.rechecking===task)entry.rechecking=null;});
  entry.rechecking=task;return task;
 }
 function scopeFor(frame){const result=peek(frame);return result.state==='verified'?states.get(key(frame)).scope:null;}
 function invalidateTab(tabId){for(const [k,entry]of states)if(entry.frame.tabId===tabId){entry.abort.abort();states.delete(k);}}
 function invalidateAll(){for(const entry of states.values())entry.abort?.abort();states.clear();}
 return Object.freeze({peek,refresh,revalidate,invalidate,invalidateTab,invalidateAll,scopeFor});
}
