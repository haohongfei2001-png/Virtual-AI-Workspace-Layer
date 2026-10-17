import {tokenOK,urlOK} from '../../b1/identity.mjs';
import {withRequestDeadline} from '../../data/request-deadline.mjs';

/** @typedef {import('../../../docs/specs/chatgpt-host/VAIWL_HOST_CONTRACTS.d.ts').BrowserFrameContext} BrowserFrameContext */
/** @typedef {import('../../../docs/specs/chatgpt-host/VAIWL_HOST_CONTRACTS.d.ts').ScopeResolution} ScopeResolution */

const denied=reason=>Object.freeze({state:'unverified',reason});
const missing=()=>Object.freeze({state:'ambiguous',reason:'current-context-unproven'});
const validFrame=f=>f&&Number.isSafeInteger(f.tabId)&&f.tabId>=0&&f.frameId===0&&
 tokenOK(f.documentId)&&f.documentLifecycle==='active'&&f.incognito===false&&urlOK(f.actualURL);
const key=f=>`${f.tabId}:${f.documentId}`;
const sameFrame=(a,b)=>a.tabId===b.tabId&&a.documentId===b.documentId&&a.actualURL===b.actualURL;

/**
 * Owner-only admission policy for an observed loss of C2 context evidence.
 * It neither observes traffic nor creates/imports receipts, grants or scopes.
 * Missing evidence is a settled result: existing native READY -> HELLO/REFRESH
 * supplies the next call. There is no polling, fetch, storage or retry timer.
 *
 * `authority` and `contextObserver` are the existing worker owners. `profile`
 * is packaged configuration, never a message. C3 and evidence-present A use
 * the supplied original authorization operation without a B retry allowance.
 */
export function createNoReceiptContextRecovery({profile,contextObserver=null,authority,
 now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,
 maxDocuments=128,maxSubscribers=128}={}){
 if(!tokenOK(profile?.id)||typeof profile.singlePersonalDefault!=='boolean'||
    !['peek','invalidate'].every(name=>typeof authority?.[name]==='function')||
    profile.browserRequestContext===true&&!['verify','isCurrent'].every(name=>typeof contextObserver?.[name]==='function')||
    ![now,elapsedNow,schedule,cancel].every(fn=>typeof fn==='function')||
    ![maxDocuments,maxSubscribers].every(n=>Number.isInteger(n)&&n>0&&n<=512))throw Error('invalid-context-recovery');
 const stamp={id:profile.id,c2:profile.browserRequestContext===true,c3:profile.singlePersonalDefault};
 const slots=new Map();let active=true;
 const profileCurrent=()=>profile.id===stamp.id&&(profile.browserRequestContext===true)===stamp.c2&&profile.singlePersonalDefault===stamp.c3;
 const bounded=value=>Number.isFinite(value)&&value>0&&value<=6000;
 const safeRemaining=fn=>{try{const n=fn();return bounded(n)?n:0;}catch{return 0;}};
 const safeCurrent=fn=>{try{return fn()===true;}catch{return false;}};
 function clocks(f){
  const wall=now(),elapsed=elapsedNow();
  if(!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<f.lastWall||elapsed<f.lastElapsed){f.clockFailed=true;return false;}
  f.lastWall=wall;f.lastElapsed=elapsed;
  return !f.clockFailed&&wall-f.wall<f.limit&&elapsed-f.elapsed<f.limit;
 }
 const timeLeft=f=>Math.max(0,Math.min(f.limit-(now()-f.wall),f.limit-(elapsedNow()-f.elapsed)));
 const liveSubscriber=s=>!s.done&&!s.signal?.aborted&&safeCurrent(s.isCurrent)&&safeRemaining(s.remainingMs)>0&&
  now()>=s.wall&&elapsedNow()>=s.elapsed&&now()-s.wall<s.limit&&elapsedNow()-s.elapsed<s.limit;
 const current=f=>active&&profileCurrent()&&f.slot.flight===f&&f.slot.generation===f.generation&&
  !f.abort.signal.aborted&&clocks(f)&&[...f.subscribers].some(liveSubscriber);
 function discard(f,result){
  // Never revoke a newer operation or a grant that existed before this call.
  const grant=result?.state==='verified'?result.grant:null;
  if(grant&&grant!==f.priorGrant&&authority.peek(f.frame).grant===grant)authority.invalidate(f.frame.documentId,'context-recovery-discarded');
 }
 function settleSubscriber(f,s,result){
  if(s.done)return;s.done=true;cancel(s.timer);s.signal?.removeEventListener('abort',s.onAbort);f.subscribers.delete(s);s.resolve(result);
 }
 function cancelFlight(f,reason){
  if(f.closed)return;f.closed=true;f.abort.abort();discard(f,f.result);
  if(f.slot.flight===f){f.slot.flight=null;f.slot.state='CANCELLED';f.slot.reason=reason;}
  for(const s of [...f.subscribers])settleSubscriber(f,s,denied(reason));
 }
 function subscribe(f,options){
  if(f.subscribers.size>=maxSubscribers)return Promise.resolve(denied('context-recovery-capacity'));
  const limit=safeRemaining(options.remainingMs);
  if(!limit||options.signal?.aborted||!safeCurrent(options.isCurrent))return Promise.resolve(denied('context-recovery-cancelled'));
  return new Promise(resolve=>{
   const s={...options,resolve,limit,wall:now(),elapsed:elapsedNow(),done:false,timer:null,onAbort:null};
   const detach=reason=>{settleSubscriber(f,s,denied(reason));if(![...f.subscribers].some(liveSubscriber))cancelFlight(f,reason);};
   s.onAbort=()=>detach('context-recovery-cancelled');f.subscribers.add(s);
   s.signal?.addEventListener('abort',s.onAbort,{once:true});
   s.timer=schedule(()=>detach('context-recovery-deadline'),limit);
   if(s.signal?.aborted)s.onAbort();
  });
 }
 function status(f,state,reason){if(f.slot.flight===f){f.slot.state=state;f.slot.reason=reason;}}
 function fence(f){if(!current(f))throw Error('context-recovery-cancelled');}
 function verifiedCurrent(f,result){
  const grant=result?.grant,receipt=f.receipt,live=authority.peek(f.frame);
  return result?.state==='verified'&&live.state==='verified'&&live.grant===grant&&
   Number.isFinite(Date.parse(grant.expiresAt))&&Date.parse(grant.expiresAt)>now()&&
   (!receipt||contextObserver.isCurrent(f.frame,receipt)===true&&grant.context?.kind==='browser-request-context'&&
    grant.context.requestReceiptId===receipt.id&&grant.context.selectionEpoch===receipt.selectionEpoch&&grant.context.documentId===f.frame.documentId);
 }
 async function work(f){
  fence(f);
  // A pending authority belongs to another operation. The caller normally
  // bypasses this policy for A; a race discovered here transfers no cleanup
  // ownership and does not open a competing body challenge or authorization.
  const prior=authority.peek(f.frame);
  if(prior.state==='pending'){status(f,'CHECKING','existing-authorization-pending');return prior;}
  if(prior.state==='verified')return authorize(f,null,false);
  if(!stamp.c2){
   if(stamp.c3)return authorize(f,null,false);
   status(f,'BLOCKED','context-profile-unavailable');return missing();
  }
  status(f,'CHECKING',null);
  const receipt=await contextObserver.verify(f.frame,{signal:f.abort.signal});fence(f);
  if(!receipt){
   if(stamp.c3)return authorize(f,null,false);
   f.slot.waiting=true;status(f,'WAITING_NATIVE','current-context-unproven');return missing();
  }
  if(contextObserver.isCurrent(f.frame,receipt)!==true)throw Error('context-recovery-stale-evidence');
  const recovering=f.slot.waiting;
  if(recovering&&f.slot.attempted.has(receipt)){
   status(f,'BLOCKED','context-recovery-new-evidence-required');return denied('context-recovery-new-evidence-required');
  }
  // Receipt identity is supplied only by this live owner. No serializable ID
  // can consume or replenish an opportunity. Do not charge evidence-present A.
  return authorize(f,receipt,recovering);
 }
 async function authorize(f,receipt,recovering){
  fence(f);
  const before=authority.peek(f.frame);
  if(before.state==='pending'){status(f,'CHECKING','existing-authorization-pending');return before;}
  f.priorGrant=before.grant??null;
  if(recovering)f.slot.attempted.add(receipt);
  f.receipt=receipt;f.recovering=recovering;status(f,'AUTHORIZING',null);
  const result=await f.authorize({signal:f.abort.signal,remainingMs:()=>timeLeft(f)});
  f.result=result;
  if(!current(f)){discard(f,result);throw Error('context-recovery-cancelled');}
  if(result?.state!=='verified'){
   status(f,'BLOCKED',result?.reason??'scope-not-verified');
   return result&&['unverified','ambiguous','signed-out'].includes(result.state)?result:denied('scope-not-verified');
  }
  if(!verifiedCurrent(f,result)){
   discard(f,result);throw Error('context-recovery-stale-evidence');
  }
  return result;
 }
 function finish(f,result){
  if(f.closed){discard(f,result);return;}
  if(!current(f)){discard(f,result);cancelFlight(f,'context-recovery-cancelled');return;}
  const subscribers=[...f.subscribers],eligible=subscribers.filter(liveSubscriber);
  if(!eligible.length){discard(f,result);cancelFlight(f,'context-recovery-cancelled');return;}
  // Completion crosses another promise boundary. Recheck here, not only at
  // the authority return; expiry/revocation in between must not publish.
  if(result?.state==='verified'){
   if(!verifiedCurrent(f,result)){discard(f,result);cancelFlight(f,'context-recovery-stale-evidence');return;}
   if(f.slot.waiting){f.slot.waiting=false;f.slot.attempted=new WeakSet();}
   status(f,'SCOPE_VERIFIED',null);
  }
  f.closed=true;
  if(f.slot.flight===f)f.slot.flight=null;
  for(const s of subscribers)settleSubscriber(f,s,eligible.includes(s)?result:denied('context-recovery-cancelled'));
 }
 /**
  * Called only after the existing HOST_REFRESH sender/HELLO/sequence/frame checks.
  * @param {BrowserFrameContext} frame
  * @param {{attemptOwner:object, authorize:Function, signal?:AbortSignal,
  * remainingMs:Function, isCurrent:Function}} options
  * `attemptOwner` is the existing private producer object, not a page key.
  * `authorize({signal,remainingMs})` synchronously starts the original authority
  * call, without an async preamble or one subscriber's captured abort signal.
  * The first parent's original
  * remaining deadline owns the flight; late joiners never extend it.
  * @returns {Promise<ScopeResolution>}
  */
 function run(frame,options={}){
  if(!active)return Promise.resolve(denied('context-recovery-stopped'));
  if(!validFrame(frame)||!options.attemptOwner||typeof options.attemptOwner!=='object'||
     !['authorize','remainingMs','isCurrent'].every(name=>typeof options[name]==='function'))return Promise.resolve(denied('invalid-context-recovery-call'));
  const limit=safeRemaining(options.remainingMs),wall=now(),elapsed=elapsedNow();
  if(!profileCurrent())return Promise.resolve(denied('context-profile-changed'));
  if(!Number.isFinite(wall)||!Number.isFinite(elapsed)||!limit||options.signal?.aborted||!safeCurrent(options.isCurrent))return Promise.resolve(denied('context-recovery-cancelled'));
  // The caller already verified this browser top document. Retire replaced
  // documents in this tab without resetting a same-document B opportunity.
  for(const [oldKey,old]of slots)if(old.frame.tabId===frame.tabId&&old.frame.documentId!==frame.documentId){
   old.generation++;if(old.flight)cancelFlight(old.flight,'context-recovery-document-replaced');slots.delete(oldKey);
  }
  const id=key(frame);let slot=slots.get(id);
  if(!slot){
   if(slots.size>=maxDocuments)return Promise.resolve(denied('context-recovery-capacity'));
   slot={frame:Object.freeze({...frame}),waiting:false,attempted:new WeakSet(),generation:0,flight:null,state:'CHECKING',reason:null};slots.set(id,slot);
  }
  const previous=slot.flight;
  if(previous&&sameFrame(previous.frame,frame)&&previous.attemptOwner===options.attemptOwner&&current(previous))return subscribe(previous,options);
  if(previous)cancelFlight(previous,'context-recovery-superseded');
  slot.frame=Object.freeze({...frame});slot.generation++;
  const f={slot,generation:slot.generation,frame:slot.frame,attemptOwner:options.attemptOwner,authorize:options.authorize,
   wall,elapsed,lastWall:wall,lastElapsed:elapsed,limit,clockFailed:false,abort:new AbortController(),subscribers:new Set(),closed:false,
   priorGrant:authority.peek(frame).grant??null,result:null};
  slot.flight=f;slot.state='CHECKING';slot.reason=null;
  const pending=subscribe(f,options);
  // Defer until the first subscriber is installed. A waiter is not a signal
  // cache; the live observer is read again on each explicitly requested run.
  Promise.resolve().then(()=>{
   fence(f);const timeoutMs=timeLeft(f);if(timeoutMs<=0)throw Error('context-recovery-deadline');
   return withRequestDeadline(()=>work(f),{timeoutMs,now:elapsedNow,schedule,cancel});
  }).then(
   result=>finish(f,result),error=>{
    if(f.closed){discard(f,f.result);return;}
    status(f,'BLOCKED',error?.message==='request-timeout'?'context-recovery-deadline':error?.message??'context-recovery-failed');
    f.abort.abort();discard(f,f.result);
    const result=denied(f.slot.reason??'context-recovery-failed');f.closed=true;
    if(f.slot.flight===f)f.slot.flight=null;
    for(const s of [...f.subscribers])settleSubscriber(f,s,result);
   });
  return pending;
 }
 function invalidate({tabId,documentId}={}){
  for(const slot of slots.values())if(slot.frame.tabId===tabId&&(documentId===undefined||slot.frame.documentId===documentId)){
   slot.generation++;if(slot.flight)cancelFlight(slot.flight,'context-recovery-invalidated');
   slot.state='CANCELLED';slot.reason='context-recovery-invalidated';
  }
 }
 function forgetTab(tabId){invalidate({tabId});for(const [id,slot]of slots)if(slot.frame.tabId===tabId)slots.delete(id);}
 function stop(){if(!active)return;active=false;for(const slot of slots.values())if(slot.flight)cancelFlight(slot.flight,'context-recovery-stopped');slots.clear();}
 function inspect(frame){
  const slot=validFrame(frame)?slots.get(key(frame)):null;
  if(!active)return Object.freeze({state:'CANCELLED',reason:'context-recovery-stopped'});
  if(!slot)return Object.freeze({state:'IDLE',reason:null});
  if(slot.state==='SCOPE_VERIFIED'&&authority.peek(slot.frame).state!=='verified'){
   slot.state='BLOCKED';slot.reason='context-recovery-proof-expired';
  }
  return Object.freeze({state:slot.state,reason:slot.reason});
 }
 // Route an owned pending operation back through run() so each caller keeps
 // its own cancellation subscription. An external pending authority is A.
 // This private-owner predicate conveys no receipt, grant or authorization.
 function ownsFlight(frame,attemptOwner){
  const f=validFrame(frame)?slots.get(key(frame))?.flight:null;
  return !!f&&!f.closed&&sameFrame(f.frame,frame)&&f.attemptOwner===attemptOwner&&current(f);
 }
 return Object.freeze({run,inspect,ownsFlight,invalidate,forgetTab,stop,isIdle:()=>![...slots.values()].some(slot=>slot.flight)});
}
