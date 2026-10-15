import {createFirstSendCausality} from '../host/first-send-causality.mjs';
import {createLoopbackFirstSendProfile} from '../host/first-send-profile.mjs';
import {prepareSendAckAdmission} from './send-ack-admission.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Private service composition. No serialized receipt, DOM attribute or runtime
 * message can invoke submit(). Only the worker's browser observer holds that hook. */
export function createHostFirstSend({origin,handshake,authority,getFrame,observations,reader,readOperation,onAcknowledged,readBudget,now=Date.now,elapsedNow=()=>performance.now()}={}){
 const profile=createLoopbackFirstSendProfile(origin),chain=createFirstSendCausality({now,elapsedNow}),pending=new Map(),proofs=new Map(),inflight=new Map(),early=new Map(),epochs=new Map(),departures=new Map();let stopped=false,work=Promise.resolve();
 if(typeof readBudget?.reserve!=='function'||!['capture','captureDeparture','matchesCapture'].every(k=>typeof handshake?.[k]==='function')||!authority?.scopeFor||typeof getFrame!=='function'||!observations?.withCurrent||!reader?.read||!reader?.withReadback||typeof readOperation!=='function'||typeof onAcknowledged!=='function')throw Error('invalid-first-send-owner');
 const key=c=>`${c.tabId}:${c.browserDocumentId}`;
 const identity=(frame,scope)=>({tabId:frame.tabId,browserDocumentId:frame.documentId,scopeKey:scope.key,principalKey:scope.accountId,contextKey:scope.organizationId,profileId:profile.id,profileVersion:profile.revision});
 function prune(){for(const [op,r]of pending){const wall=now()-r.at,elapsed=elapsedNow()-r.elapsed;if(wall<0||elapsed<0||wall>=30000||elapsed>=30000)pending.delete(op);}for(const k of proofs.keys())if(![...pending.values()].some(r=>key(r.context)===k))proofs.delete(k);}
 const eventKey=e=>JSON.stringify([e.tabId,e.browserDocumentId,e.operationId]);
 const epoch=tabId=>epochs.get(tabId)??0;
 function pruneEarly(){for(const [k,r]of departures){const w=now()-r.at,e=elapsedNow()-r.elapsed;if(w<0||e<0||w>=30000||e>=30000)departures.delete(k);}for(const [k,r]of early){const w=now()-r.at,e=elapsedNow()-r.elapsed;if(w<0||e<0||w>=30000||e>=30000)early.delete(k);}}
 async function intent(message,sender){
  prune();pruneEarly();
  if(stopped||pending.size>=32||pending.has(message?.operationId)||!exactHostRecord(message,['type','documentToken','producerToken','routeEpoch','intentId','operationId','messageId','observedAt'])||message.type!=='HOST_FIRST_SEND_INTENT'||!['intentId','operationId','messageId'].every(k=>tokenOK(message[k])))return {ok:false};
  const intentAt=Date.parse(message.observedAt);if(typeof message.observedAt!=='string'||!Number.isFinite(intentAt)||intentAt>now()||now()-intentAt>=30000)return {ok:false};
  // Capture the previously bound browser sender synchronously before the native
  // handler can navigate. This accepts a candidate only, never current authority.
  const departure=departures.get(sender.tab?.id);let captured=handshake.capture(message,sender),scope=null;
  if(!captured&&departure&&departure.epoch===epoch(sender.tab?.id)&&handshake.matchesCapture(departure.transport,message,sender)&&intentAt<=departure.navigatedAt&&intentAt<Date.parse(departure.transport.expiresAt)){captured=departure.transport;scope=departure.scope;}
  if(!captured||captured.url!==origin+'/'||captured.tabId!==sender.tab?.id)return {ok:false};
  const frame={tabId:captured.tabId,frameId:0,documentId:captured.documentId,parentDocumentId:null,actualURL:captured.url,documentLifecycle:'active',incognito:sender.tab.incognito===true};
  if(!scope){scope=authority.scopeFor(frame);if(!scope||authority.peek(frame).state!=='verified')return {ok:false};}
  const context=identity(frame,scope),accepted=chain.intent({...context,routeKind:'home'},{intentId:message.intentId,operationId:message.operationId,messageId:message.messageId,observedAt:message.observedAt});
  if(accepted){const r={context,operationId:message.operationId,messageId:message.messageId,requestId:null,at:intentAt,elapsed:elapsedNow()-(now()-intentAt),attempts:0,budgetWindow:null,epoch:epoch(frame.tabId),target:departure?.target??null,nativeBefore:departure?.navigatedAt??null,continuationGrant:null};pending.set(message.operationId,r);const k=eventKey({...context,operationId:message.operationId}),saved=early.get(k);if(saved){early.delete(k);if(saved.conflict||saved.epoch!==r.epoch||saved.event.messageId!==r.messageId){pending.delete(message.operationId);chain.invalidate(context);return {ok:false};}submit(saved.event);}}return {ok:accepted};
 }
 function submit(event){
  if(stopped||!Number.isFinite(event?.startedAt)||Math.floor(event.startedAt)>now()||now()-event.startedAt>=30000||!exactHostRecord(event,['tabId','browserDocumentId','requestId','operationId','messageId','startedAt'])||!Number.isSafeInteger(event.tabId)||event.tabId<0||!['browserDocumentId','requestId','operationId','messageId'].every(k=>tokenOK(event[k])))return false;
  prune();pruneEarly();const r=pending.get(event.operationId);
  if(!r){const k=eventKey(event),saved=early.get(k);if(saved){if(saved.event.requestId!==event.requestId||saved.event.messageId!==event.messageId)saved.conflict=true;return false;}if(early.size>=32)return false;early.set(k,{event:Object.freeze({...event}),epoch:epoch(event.tabId),at:now(),elapsed:elapsedNow(),conflict:false});return false;}
  if(event.startedAt<r.at||r.nativeBefore!==null&&event.startedAt>r.nativeBefore||r.epoch!==epoch(event.tabId)||r.context.tabId!==event.tabId||r.context.browserDocumentId!==event.browserDocumentId||r.messageId!==event.messageId)return false;
  const accepted=chain.submit(r.context,{operationId:event.operationId,messageId:event.messageId,requestId:event.requestId});if(!accepted){pending.delete(event.operationId);return false;}r.requestId=event.requestId;const proof=proofs.get(key(r.context));if(proof)void observe(proof);return true;
 }
 // Only one same-document native home -> exact conversation transition may carry
 // a candidate. Account changes, generic revocation and subsequent hops erase it.
 function navigate({tabId,browserDocumentId,url,navigatedAt}={}){
  prune();pruneEarly();let target=null;try{const u=new URL(url);if(u.origin===origin&&!u.search&&!u.hash)target=/^\/c\/([A-Za-z0-9_-]{1,128})$/.exec(u.pathname)?.[1]??null;}catch{}
  const rows=[...pending.values()].filter(r=>r.context.tabId===tabId),transport=handshake.captureDeparture({tabId,documentId:browserDocumentId});
  if(!Number.isFinite(navigatedAt)||Math.floor(navigatedAt)>now()||now()-navigatedAt>=30000||!target||departures.has(tabId)||!transport||transport.url!==origin+'/'||rows.some(r=>r.context.browserDocumentId!==browserDocumentId||r.target!==null)){invalidateTab(tabId);return false;}
  const frame={tabId,frameId:0,documentId:browserDocumentId,parentDocumentId:null,actualURL:transport.url,documentLifecycle:'active',incognito:false},scope=authority.scopeFor(frame);
  if(!scope||authority.peek(frame).state!=='verified'||departures.size>=128){invalidateTab(tabId);return false;}
  departures.set(tabId,{transport,scope:Object.freeze({...scope}),target,navigatedAt,at:now(),elapsed:elapsedNow(),epoch:epoch(tabId)});
  for(const r of rows){r.target=target;r.nativeBefore=navigatedAt;}return true;
 }
 function observe(proofId){if(stopped)return Promise.resolve();if(inflight.has(proofId))return inflight.get(proofId);if(inflight.size>=32)return Promise.resolve();const next=work.catch(()=>{}).then(()=>observations.withCurrent(proofId,async context=>{
  if(stopped)return;const current={tabId:context.tabId,browserDocumentId:context.browserDocumentId,scopeKey:context.scope.key,principalKey:context.scope.accountId,contextKey:context.scope.organizationId,profileId:profile.id,profileVersion:profile.revision};if([...pending.values()].some(r=>key(r.context)===key(current)))proofs.set(key(current),proofId);
  for(const [op,r]of pending){const age=now()-r.at,elapsed=elapsedNow()-r.elapsed;if(age<0||elapsed<0||age>=30000||elapsed>=30000){pending.delete(op);continue;}if(key(r.context)!==key(current))continue;if(r.epoch!==epoch(current.tabId)||r.target!==context.conversationId||!tokenOK(context.scopeGrantId)||!Number.isSafeInteger(context.scopeEpoch)){pending.delete(op);continue;}const grantKey=JSON.stringify([context.scopeGrantId,context.scopeEpoch]);if(r.continuationGrant!==null&&r.continuationGrant!==grantKey){pending.delete(op);continue;}r.continuationGrant=grantKey;if(r.context.scopeKey!==current.scopeKey||r.context.principalKey!==current.principalKey||r.context.contextKey!==current.contextKey){pending.delete(op);chain.invalidate(current);continue;}if(!r.requestId||r.attempts>=3)continue;
   r.attempts++;const guard=()=>{const wall=now()-r.at,elapsed=elapsedNow()-r.elapsed;if(stopped||r.epoch!==epoch(current.tabId)||pending.get(op)!==r||context.signal.aborted||context.guard()!==true||!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<0||elapsed<0||wall>=30000||elapsed>=30000)throw Error('stale-first-send');};
   try{guard();const ticket=await readBudget.reserve({principalKey:current.principalKey,contextKey:current.contextKey,sourceDomain:origin,attemptKey:'operation:'+op,windowStartedAt:r.budgetWindow,signal:context.signal});r.budgetWindow=ticket.windowStartedAt;guard();const mapping=await readOperation({operationId:op,principalKey:current.principalKey,contextKey:current.contextKey,signal:context.signal});guard();
    if(mapping.conversationId!==context.conversationId||mapping.messageId!==r.messageId||!context.messageIds.includes(r.messageId))continue;
    const candidate=chain.resolve(current,{...mapping,requestId:r.requestId});if(!candidate)continue;
    const metadata=await reader.read(proofId,{budgetWindow:r.budgetWindow});guard();await reader.withReadback(metadata,proofId,r.messageId,async({profile:ackProfile,readback,guard:ackGuard})=>{
     const check=()=>{guard();ackGuard();};check();
     // Exact native operation linkage is already independently established above.
     // Reuse strict message ACK validation without changing its legacy null-ID API.
     const ackContext={proofId,conversationId:context.conversationId,bodyEpoch:context.bodyEpoch,scopeKey:current.scopeKey,principalKey:current.principalKey,contextKey:current.contextKey,providerProfile:context.providerProfile,providerTransport:context.providerTransport};
     const admission=prepareSendAckAdmission({profile:ackProfile,context:ackContext,candidate:{...candidate,operationId:null},readback,intentAt:candidate.observedAt,observedAt:new Date(now()).toISOString()});
     check();await onAcknowledged({admission,context,guard:check});check();if(!chain.consume(current,candidate))throw Error('first-send-already-consumed');pending.delete(op);if(![...pending.values()].some(row=>key(row.context)===key(current)))proofs.delete(key(current));
    });
   }catch{/* Remains bounded; a future current-body observation may retry. */}
  }
 })).catch(()=>{}).finally(()=>{if(inflight.get(proofId)===next)inflight.delete(proofId);});work=next;inflight.set(proofId,next);return next;}
 function invalidateTab(tabId){epochs.set(tabId,epoch(tabId)+1);departures.delete(tabId);chain.invalidate({tabId});for(const [k,r]of early)if(r.event.tabId===tabId)early.delete(k);for(const [op,r]of pending)if(r.context.tabId===tabId)pending.delete(op);for(const k of proofs.keys())if(k.startsWith(tabId+':'))proofs.delete(k);}
 return Object.freeze({intent,submit,observe,navigate,invalidateTab,stop(){stopped=true;chain.stop();pending.clear();proofs.clear();inflight.clear();early.clear();epochs.clear();departures.clear();}});
}
