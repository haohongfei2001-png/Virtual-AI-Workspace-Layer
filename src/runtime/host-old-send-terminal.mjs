import {createOldSendTerminalProfile} from '../host/old-send-terminal-profile.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Private browser-terminal / already accepted intent join. A DOM operation ID
 * is only a candidate. No terminal state, grant, ACK or timestamp is persisted. */
export function createHostOldSendTerminal({origin,handshake,observations,sendCandidates,readOperation,readBudget,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 createOldSendTerminalProfile(origin);
 if(!handshake?.verify||!observations?.withCurrent||!sendCandidates?.settle||!sendCandidates?.pendingIntent||typeof readOperation!=='function'||!readBudget?.reserve)throw Error('invalid-old-send-terminal');
 const rows=new Map(),events=new Map(),accepted=new Map(),waiters=new Set(),used=new Set();let stopped=false,queued=0,work=Promise.resolve();
 const identity=c=>JSON.stringify([c.tabId,c.browserDocumentId,c.scope.key,c.scopeGrantId,c.scopeEpoch,c.documentToken,c.producerToken,c.routeEpoch,c.bodyEpoch,c.conversationId]);
 const key=e=>JSON.stringify([e.tabId,e.browserDocumentId,e.operationId]);
 const fresh=r=>{const w=now()-r.at,e=elapsedNow()-r.elapsed;return w>=0&&e>=0&&w<30000&&e<30000;};
 function prune(){for(const map of [rows,events,accepted])for(const [k,r]of map)if(!fresh(r))map.delete(k);}
 function join(k){if(stopped||queued>=128)return Promise.resolve(false);queued++;const result=work.then(async()=>{
  prune();const r=rows.get(k),event=events.get(k)?.event;if(stopped||!r||!event||used.has(k))return false;
  // Conflicts are terminal for this operation. A later gesture cannot rebind it.
  if(event.messageId!==r.messageId||event.startedAt<r.intentAt){used.add(k);rows.delete(k);events.delete(k);return false;}
  if(r.attempts>=3)return false;
  return observations.withCurrent(r.proofId,async c=>{
   const check=()=>{if(stopped||rows.get(k)!==r||events.get(k)?.event!==event||used.has(k)||identity(c)!==r.identity||!fresh(r)||c.signal.aborted||c.guard()!==true||c.tabId!==r.tabId||c.browserDocumentId!==r.browserDocumentId||c.documentToken!==r.documentToken||c.producerToken!==r.producerToken||c.routeEpoch!==r.routeEpoch||c.conversationId!==r.conversationId)throw Error('stale-old-send-terminal');};check();
   if(!await sendCandidates.pendingIntent(r.proofId,r.intentId))return false;check();
   r.attempts++;const reservation=await readBudget.reserve({principalKey:c.scope.accountId,contextKey:c.scope.organizationId,sourceDomain:origin,attemptKey:'old-send-terminal:'+r.operationId,windowStartedAt:r.budgetWindow,signal:c.signal});r.budgetWindow=reservation.windowStartedAt;check();
   const v=await readOperation({operationId:r.operationId,principalKey:c.scope.accountId,contextKey:c.scope.organizationId,signal:c.signal});check();
   if(v?.operationId!==r.operationId||v.messageId!==r.messageId||v.conversationId!==r.conversationId||v.acceptanceState!==event.stage||!['failed','cancelled'].includes(v.acceptanceState)){used.add(k);rows.delete(k);events.delete(k);return false;}
   const result=await sendCandidates.settle(r.proofId,{intentId:r.intentId,stage:event.stage},check);check();used.add(k);rows.delete(k);events.delete(k);return result?.stage===event.stage;
  });
 }).catch(()=>false).finally(()=>{queued--;});work=result.then(()=>{});return result;}
 async function intent(message,sender){
  try{message=structuredClone(message);sender=structuredClone(sender);}catch{return false;}
  prune();if(stopped||rows.size>=32||used.size>=256||!exactHostRecord(message,['type','documentToken','producerToken','routeEpoch','bodyProofId','intentId','operationId','messageId','observedAt'])||message.type!=='HOST_OLD_SEND_OPERATION'||!['bodyProofId','intentId','operationId','messageId'].every(k=>tokenOK(message[k])))return false;
  const intentAt=Date.parse(message.observedAt);if(!Number.isFinite(intentAt)||intentAt>now()||now()-intentAt>=30000||!await handshake.verify(message,sender))return false;
  const known=accepted.get(message.intentId),proofId=known?.originalProof===message.bodyProofId?known.proofId:message.bodyProofId;
  return observations.withCurrent(proofId,async c=>{
   if(known&&(known.originalProof!==message.bodyProofId||known.identity!==identity(c)))return false;
   if(c.guard()!==true||c.tabId!==sender.tab?.id||c.browserDocumentId!==sender.documentId||c.documentToken!==message.documentToken||c.producerToken!==message.producerToken||c.routeEpoch!==message.routeEpoch||!tokenOK(c.conversationId)||c.messageIds.includes(message.messageId))return false;
   if(c.guard()!==true)return false;
   const r={...message,identity:identity(c),attempts:0,budgetWindow:null,proofId,conversationId:c.conversationId,tabId:c.tabId,browserDocumentId:c.browserDocumentId,intentAt,at:intentAt,elapsed:elapsedNow()-(now()-intentAt)},k=key(r);
   if(used.has(k)||rows.has(k)||[...rows.values()].some(v=>v.intentId===r.intentId)||known?.operationId&&known.operationId!==r.operationId)return false;if(known)known.operationId=r.operationId;rows.set(k,r);for(const done of waiters)done();void join(k);return true;
  }).catch(()=>false);
 }
 function terminal(event){
  prune();if(stopped||events.size>=32||used.size>=256||!exactHostRecord(event,['tabId','browserDocumentId','requestId','operationId','messageId','startedAt','stage'])||!Number.isSafeInteger(event.tabId)||event.tabId<0||!['browserDocumentId','requestId','operationId','messageId'].every(k=>tokenOK(event[k]))||!['failed','cancelled'].includes(event.stage)||!Number.isFinite(event.startedAt)||Math.floor(event.startedAt)>now()||now()-event.startedAt>=30000)return Promise.resolve(false);
  const k=key(event);if(used.has(k))return Promise.resolve(false);if(events.has(k)){if(JSON.stringify(events.get(k).event)!==JSON.stringify(event)){used.add(k);events.delete(k);rows.delete(k);}return Promise.resolve(false);}
  events.set(k,{event:Object.freeze({...event}),at:now(),elapsed:elapsedNow()});return join(k);
 }
 async function intentAccepted(proofId,intentId){prune();if(stopped||accepted.size>=32||accepted.has(intentId))return;await observations.withCurrent(proofId,c=>{accepted.set(intentId,{intentId,originalProof:proofId,proofId,identity:identity(c),tabId:c.tabId,browserDocumentId:c.browserDocumentId,at:now(),elapsed:elapsedNow()});for(const [k,r]of rows)if(r.intentId===intentId&&r.identity===identity(c))void join(k);}).catch(()=>{});}
 async function observe(proofId){
  prune();if(stopped)return;const context=await observations.withCurrent(proofId,c=>({identity:identity(c),tabId:c.tabId,browserDocumentId:c.browserDocumentId})).catch(()=>null);if(!context)return;
  for(const r of accepted.values())if(r.identity===context.identity)r.proofId=proofId;
  // Browser completion and content IPC can arrive in either order. Only an
  // already accepted intent plus an actual terminal event may hold foreground
  // correlation, bounded to the ordinary six-second operation deadline.
  const missing=()=>[...events.values()].some(r=>r.event.tabId===context.tabId&&r.event.browserDocumentId===context.browserDocumentId&&!rows.has(key(r.event)))&&[...accepted.values()].some(r=>r.identity===context.identity&&![...rows.values()].some(row=>row.intentId===r.intentId));
  if(missing()&&waiters.size<32)await new Promise(resolve=>{let timer;const done=()=>{waiters.delete(done);cancel(timer);resolve();};waiters.add(done);timer=schedule(done,6000);});
  const keys=await observations.withCurrent(proofId,c=>{const matches=[];for(const [k,r]of rows)if(identity(c)===r.identity){r.proofId=proofId;matches.push(k);}return matches;}).catch(()=>[]);for(const k of keys)await join(k);
 }
 return Object.freeze({intent,intentAccepted,terminal,observe,drain:()=>work,invalidateTab(tabId){for(const done of waiters)done();for(const [k,r]of accepted)if(r.tabId===tabId)accepted.delete(k);for(const [k,r]of rows)if(r.tabId===tabId){rows.delete(k);used.add(k);}for(const [k,r]of events)if(r.event.tabId===tabId){events.delete(k);used.add(k);}},stop(){stopped=true;for(const done of waiters)done();accepted.clear();rows.clear();events.clear();used.clear();}});
}
