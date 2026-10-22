import {createURLPolicy} from '../host/url-policy.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';

// Optional private diagnostics contain fixed categories only, never browser
// objects, URLs, IDs, header values or response bodies. They grant no authority.
export const BROWSER_CONTEXT_DIAGNOSTICS=Object.freeze([
 'send-observed','request-metadata-rejected','endpoint-or-query-rejected',
 'headers-unavailable','prefetch-rejected','context-header-missing','context-header-duplicate','context-header-invalid',
 'request-capacity-or-duplicate','document-capacity','request-admitted',
 'initial-state-rejected','initial-frame-mismatch','initial-frame-unavailable','request-prepared',
 'history-retained-pending','history-dropped-pending','commit-retained-pending','commit-dropped-pending','request-expired','request-clock-invalid',
 'completion-observed','completion-untracked','completion-metadata-rejected','completion-http-rejected','completion-cached',
 'completion-unprepared','completion-stale','final-frame-rejected','completion-lookup-failed','receipt-created',
 'native-request-failed','native-request-redirected',
 'association-no-current-receipt','association-started','association-rejected','association-final-frame-rejected','association-failed-or-timeout','association-passed',
]);

/** Private C2 owner. Browser traffic is a selection witness, not authentication.
 * Headers other than the bounded account/purpose fields are never retained.
 * Current conversation GETs and an explicitly loopback-only Project profile
 * are supported; list/prefetch reads never select a context.
 */
export function createBrowserRequestContext({webRequest,getFrame,getTab,associatePage,origin,projectRequestContext=null,conversationRequestContext=null,now=Date.now,elapsedNow=()=>performance.now(),makeId=()=>crypto.randomUUID(),onInvalidate=()=>{},onReady=()=>{},onDiagnostic=null,ttl=60000,maxDocuments=128,maxRequests=128}={}){
 const base=new URL(origin);
 if(base.origin!==origin||!['https:','http:'].includes(base.protocol)||typeof getFrame!=='function'||typeof getTab!=='function'||typeof associatePage!=='function'||!['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].every(k=>typeof webRequest?.[k]?.addListener==='function')||!Number.isInteger(ttl)||ttl<1000||ttl>60000||![maxDocuments,maxRequests].every(n=>Number.isInteger(n)&&n>0&&n<=512))throw Error('invalid-browser-context-owner');
 if(conversationRequestContext!==null&&conversationRequestContext!=='conversation-detail-plural-v1')throw Error('invalid-conversation-context-profile');
 const conversationEndpoint=conversationRequestContext===null?'conversation':'conversations';
 const conversationPattern=new RegExp('^/backend-api/'+conversationEndpoint+'/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$','i');
 const projects=projectRequestContext==='loopback-project-v1';
 if(projectRequestContext!==null&&(!projects||base.protocol!=='http:'||base.hostname!=='127.0.0.1'))throw Error('invalid-project-context-profile');
 const documents=new Map(),requests=new Map(),closedRequests=new Map(),clocks=new WeakMap(),expired=new WeakSet();let active=true,epoch=0;
 const key=d=>`${d.tabId}:${d.documentId}`;
 const notify=(fn,value)=>{try{Promise.resolve(fn(value)).catch(()=>{});}catch{}};
 const diagnostic=code=>{if(active&&typeof onDiagnostic==='function')notify(onDiagnostic,code);};
 const clockOK=(entry,limit)=>{const wall=now(),elapsed=elapsedNow(),prior=clocks.get(entry)??{wall:entry.wall,elapsed:entry.elapsed};if(expired.has(entry))return false;const invalid=!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<prior.wall||elapsed<prior.elapsed;if(invalid||wall-entry.wall>=limit||elapsed-entry.elapsed>=limit){expired.add(entry);if(limit===6000)diagnostic(invalid?'request-clock-invalid':'request-expired');return false;}clocks.set(entry,{wall,elapsed});return true;};
 // Share native navigation's route grammar. A container identifies only the
 // conversation; its hint never establishes Project membership or account scope.
 const routePolicy=createURLPolicy({origin});
 const conversation=url=>{const route=routePolicy.parse(url);return route.kind==='conversation'?route.conversationId:null;};
 // Only the two presentation parameters observed on the native current-chat
 // GET are accepted, with their exact observed values. They never select an
 // account, change the current object, or replace document/body verification.
 const observedQuery=search=>conversationRequestContext==='conversation-detail-plural-v1'&&['?num_turns=10&include_has_versions=true','?include_has_versions=true&num_turns=10'].includes(search);
 const requestConversation=url=>{try{const u=new URL(url);if(u.origin!==origin||u.username||u.password||u.search&&!observedQuery(u.search)||u.hash)return null;return conversationPattern.exec(u.pathname)?.[1]??null;}catch{return null;}};
 const project=(url,request=false)=>{if(!projects)return null;try{const u=new URL(url);if(u.origin!==origin||u.username||u.password||u.search||u.hash)return null;return (request?/^\/backend-api\/projects\/(g-p-[0-9a-f]{32})$/:/^\/g\/(g-p-[0-9a-f]{32})\/project$/).exec(u.pathname)?.[1]??null;}catch{return null;}};
 const target=url=>{const id=conversation(url);return id?'c:'+id:project(url)?'p:'+project(url):null;};
 const targetOf=entry=>entry.projectId?'p:'+entry.projectId:'c:'+entry.conversationId;
 const validDetails=d=>active&&Number.isSafeInteger(d?.tabId)&&d.tabId>=0&&d.frameId===0&&tokenOK(d.documentId)&&d.documentLifecycle==='active'&&d.initiator===origin&&d.type==='xmlhttprequest'&&d.method==='GET'&&tokenOK(d.requestId);
 const frameMatches=(frame,entry)=>frame?.documentId===entry.documentId&&frame.frameType==='outermost_frame'&&frame.documentLifecycle==='active'&&target(frame.url)===targetOf(entry)&&(!entry.actualURL||frame.url===entry.actualURL)&&(!entry.historyTargetURL||frame.url===entry.historyTargetURL);
 function drop(document,reason){document.receipt=null;document.epoch=++epoch;document.reason=reason;notify(onInvalidate,{tabId:document.tabId,documentId:document.documentId});}
 function invalidateTab(tabId){for(const [k,d]of documents)if(d.tabId===tabId){drop(d,'navigation');documents.delete(k);}for(const [id,r]of requests)if(r.tabId===tabId)requests.delete(id);}
 function invalidateCommitted(details){
  const valid=Number.isSafeInteger(details?.tabId)&&details.tabId>=0&&details.frameId===0&&details?.frameType==='outermost_frame'&&details?.documentLifecycle==='active'&&tokenOK(details?.documentId)&&target(details?.url);
  const keep=new Set();
  // webRequest and webNavigation have no cross-API delivery order. Retain
  // only a still-pending GET for this exact new document, never its old grant
  // or a completed receipt. Its original deadline and final checks survive.
  if(valid)for(const r of requests.values())if(r.tabId===details.tabId&&r.documentId===details.documentId&&targetOf(r)===target(details.url)&&(!r.actualURL||r.actualURL===details.url)&&!r.document.receipt&&r.epoch===r.document.epoch&&!r.conflicted&&!r.commitRetained&&clockOK(r,6000))keep.add(r);
  for(const [k,d]of documents)if(d.tabId===details?.tabId){drop(d,'navigation');if(![...keep].some(r=>r.document===d))documents.delete(k);}
  for(const [id,r]of requests)if(r.tabId===details?.tabId){if(keep.has(r)){r.commitRetained=true;r.historyTargetURL=details.url;r.epoch=r.document.epoch;diagnostic('commit-retained-pending');}else{requests.delete(id);diagnostic('commit-dropped-pending');}}
 }
 function invalidateHistory(details){
  const nextTarget=target(details?.url),valid=details?.frameId===0&&details?.frameType==='outermost_frame'&&details?.documentLifecycle==='active'&&tokenOK(details?.documentId)&&nextTarget;
  const keep=new Set();
  if(valid)for(const r of requests.values()){
   const prior=r.document.receipt;
   // A newly started worker has no prior selection to retain. The new browser
   // GET can still survive its first matching history event while its first
   // frame lookup is pending. No old selection or prior-route retry is minted.
   const cold=!prior&&r.document.contextId===null&&r.document.reason===undefined;
   const unprepared=!r.accepted&&r.actualURL===null&&(prior?prior.actualURL!==details.url:cold);
   // getFrame may already have confirmed the new route before its history
   // notification arrives. Keep only that unfinished, exact selection once;
   // a receipt, prior retention or unrelated revocation cannot cross this path.
   const prepared=r.accepted&&r.actualURL===details.url&&!prior&&!r.commitRetained&&r.document.contextId===r.contextId&&r.document.reason==='context-selection-pending';
   if(r.tabId===details.tabId&&r.documentId===details.documentId&&targetOf(r)===nextTarget&&(unprepared||prepared)&&!r.conflicted&&!r.historyRetained&&documents.get(key(r))===r.document&&r.epoch===r.document.epoch&&clockOK(r,6000)){keep.add(r);if(prior)r.historyPriorURL=prior.actualURL;}
  }
  // History delivery may follow the real new-route GET. Revoke every old grant
  // now, but do not erase that still-pending, independently verified request.
  // Its original six-second clock and later frame/tab/body checks are unchanged.
  for(const [k,d]of documents)if(d.tabId===details?.tabId){drop(d,'navigation');if(![...keep].some(r=>r.document===d))documents.delete(k);}
  for(const [id,r]of requests)if(r.tabId===details?.tabId){if(keep.has(r)){r.historyRetained=true;r.historyTargetURL=details.url;r.epoch=r.document.epoch;diagnostic('history-retained-pending');}else{requests.delete(id);diagnostic('history-dropped-pending');}}
 }
 function cleanup(){for(const [id,r]of closedRequests)if(!clockOK(r,ttl))closedRequests.delete(id);for(const [id,r]of requests)if(!clockOK(r,6000)){requests.delete(id);if((!r.document.receipt||r.epoch===r.document.epoch)&&documents.get(key(r))===r.document)drop(r.document,'request-expired');}for(const [k,d]of documents)if(!clockOK(d,ttl)&&!Array.from(requests.values()).some(r=>r.document===d)){drop(d,'context-expired');documents.delete(k);}}
 function send(details){
  diagnostic('send-observed');
  if(!validDetails(details)){diagnostic('request-metadata-rejected');return;}
  const conversationId=requestConversation(details.url),projectId=project(details.url,true);if(!conversationId&&!projectId){diagnostic('endpoint-or-query-rejected');return;}
  const objectKey=projectId?'p:'+projectId:'c:'+conversationId;
  const headers=details.requestHeaders;if(!Array.isArray(headers)||headers.length>256){diagnostic('headers-unavailable');return;}
  let contextId=null,count=0;for(const h of headers){const name=typeof h.name==='string'?h.name.toLowerCase():'';if(['purpose','sec-purpose','x-purpose'].includes(name)&&typeof h.value==='string'&&/prefetch|prerender/i.test(h.value)){diagnostic('prefetch-rejected');return;}if(name==='chatgpt-account-id'){count++;contextId=h.value;}}
  if(count!==1){diagnostic(count===0?'context-header-missing':'context-header-duplicate');return;}
  if(typeof contextId!=='string'||!contextId||contextId.length>256||/[\s\u0000-\u001f\u007f]/.test(contextId)){diagnostic('context-header-invalid');return;}
  cleanup();
  let document=documents.get(key(details));
  // Capacity may reject new authority, never suppress a revocation signal.
  if(document?.receipt&&targetOf(document.receipt)===objectKey&&document.contextId!==contextId)drop(document,'context-selection-pending');
  const conflicting=document&&[...requests.values()].filter(r=>r.document===document&&targetOf(r)===objectKey&&r.contextId!==contextId);
  if(conflicting?.length){for(const r of conflicting)r.conflicted=true;drop(document,'concurrent-context-conflict');}
  if(requests.has(details.requestId)||closedRequests.has(details.requestId)||requests.size>=maxRequests||closedRequests.size>=maxRequests*4){diagnostic('request-capacity-or-duplicate');return;}
  if(!document){if(documents.size>=maxDocuments){diagnostic('document-capacity');return;}document={tabId:details.tabId,documentId:details.documentId,epoch:++epoch,receipt:null,contextId:null,wall:now(),elapsed:elapsedNow()};documents.set(key(details),document);}
  // A known document's conflicting current-object request is already a
  // selection-change signal. Revoke synchronously before getFrame can yield.
  if(document.receipt&&targetOf(document.receipt)===objectKey&&document.contextId!==contextId)drop(document,'context-selection-pending');
  // No headers object or browser event object survives this callback.
  const request={tabId:details.tabId,documentId:details.documentId,requestId:details.requestId,conversationId,...(projectId?{projectId}:{}),contextId,url:details.url,wall:now(),elapsed:elapsedNow(),document,epoch:document.epoch,actualURL:null,accepted:false};
  const overlap=[...requests.values()].filter(r=>r.document===document&&targetOf(r)===objectKey&&r.contextId!==contextId);
  if(overlap.length){request.conflicted=true;for(const r of overlap)r.conflicted=true;drop(document,'concurrent-context-conflict');}
  requests.set(request.requestId,request);
  diagnostic('request-admitted');
  request.prepare=()=>Promise.resolve().then(()=>Promise.all([getFrame({tabId:request.tabId,frameId:0}),getTab(request.tabId)])).then(([frame,tab])=>{
   // Delayed browser lookups cannot adopt an epoch revoked while they awaited.
   // Authorized navigation retention updates the pending epoch explicitly.
   if(request.conflicted||request.epoch!==document.epoch||tab?.id!==request.tabId||tab.incognito!==false||!active||requests.get(request.requestId)!==request||documents.get(key(request))!==document||!clockOK(request,6000)){diagnostic('initial-state-rejected');return false;}
   if(!frameMatches(frame,request)){
    request.priorLookupURL=frame?.documentId===request.documentId&&frame.frameType==='outermost_frame'&&frame.documentLifecycle==='active'&&target(frame.url)&&target(frame.url)!==targetOf(request)?frame.url:null;
    diagnostic('initial-frame-mismatch');return false;
   }
   request.actualURL=frame.url;
   const concurrent=[...requests.values()].some(r=>r!==request&&r.document===document&&r.accepted&&r.contextId!==contextId);
   if(concurrent){drop(document,'concurrent-context-conflict');return false;}
   // Before the first successful receipt, a second independently prepared GET
   // for this exact live selection must not invalidate the first one's epoch.
   // Never revive a stale request: the epoch guard above still runs first.
   const preparedSelection=!document.receipt&&[...requests.values()].some(r=>r!==request&&r.document===document&&r.epoch===document.epoch&&r.accepted&&!r.conflicted&&r.contextId===contextId&&r.actualURL===request.actualURL&&targetOf(r)===targetOf(request)&&clockOK(r,6000));
   if(document.contextId!==contextId||(document.receipt?.actualURL!==request.actualURL&&!preparedSelection)){drop(document,'context-selection-pending');document.contextId=contextId;}
   request.epoch=document.epoch;request.accepted=true;diagnostic('request-prepared');return true;
  }).catch(()=>{diagnostic('initial-frame-unavailable');return false;});
  request.prepared=request.prepare();
 }
 // Protect only an installed receipt from a newer successful native request.
 // Without one, a failed old request must still poison pending preparations.
 function fail(details){const r=requests.get(details?.requestId);if(!r)return;requests.delete(r.requestId);closedRequests.set(r.requestId,r);if(r.accepted&&(!r.document.receipt||r.epoch===r.document.epoch)&&documents.get(key(r))===r.document)drop(r.document,'request-failed');}
 function complete(details){
  diagnostic('completion-observed');
  // A cache flag is observable even when no matching send event was admitted;
  // it never establishes whether an unobserved load used the JS memory cache.
  if(details?.fromCache===true)diagnostic('completion-cached');
  const r=requests.get(details?.requestId);if(!r){diagnostic('completion-untracked');return;}
  if(!validDetails(details)||details.url!==r.url||details.documentId!==r.documentId||details.tabId!==r.tabId){diagnostic('completion-metadata-rejected');fail(details);return;}
  if(details.statusCode!==200){diagnostic('completion-http-rejected');fail(details);return;}
  if(details.fromCache===true){fail(details);return;}
  void (async()=>{try{
   let prepared=await r.prepared;
   // The trusted history event retained this still-unprepared request. Only a
   // first browser lookup of that exact prior route may be rechecked once at
   // successful completion; revocation, failures and other mismatches cannot.
   if(!prepared&&r.historyRetained&&!r.accepted&&!r.reprepareUsed&&r.priorLookupURL&&r.priorLookupURL===r.historyPriorURL&&!r.conflicted&&active&&requests.get(r.requestId)===r&&documents.get(key(r))===r.document&&r.epoch===r.document.epoch&&clockOK(r,6000)){
    r.reprepareUsed=true;prepared=await r.prepare();
   }
   if(!prepared){diagnostic('completion-unprepared');return;}
   if(r.conflicted||!active||requests.get(r.requestId)!==r||documents.get(key(r))!==r.document||r.epoch!==r.document.epoch||!clockOK(r,6000)){diagnostic('completion-stale');return;}
   const [frame,tab]=await Promise.all([getFrame({tabId:r.tabId,frameId:0}),getTab(r.tabId)]);
   if(r.conflicted||tab?.id!==r.tabId||tab.incognito!==false||!active||requests.get(r.requestId)!==r||r.epoch!==r.document.epoch||!clockOK(r,6000)||!frameMatches(frame,r)){diagnostic('final-frame-rejected');return;}
   const prior=r.document.receipt;
   if(prior&&prior.contextId===r.contextId&&prior.actualURL===r.actualURL){
    // A genuinely later native request is new evidence, not a renewal of the
    // old receipt. Ignore tied/older starts, including reversed completions.
    if(r.wall<=prior.wall||r.elapsed<=prior.elapsed)return;
    const previousEpoch=r.document.epoch;
    drop(r.document,'context-selection-pending');r.epoch=r.document.epoch;
    // Preserve only independently prepared, later requests for this unchanged
    // selection. A conflict, route change or expired request never follows it.
    for(const pending of requests.values())if(pending!==r&&pending.document===r.document&&pending.epoch===previousEpoch&&pending.accepted&&!pending.conflicted&&pending.contextId===r.contextId&&pending.actualURL===r.actualURL&&targetOf(pending)===targetOf(r)&&pending.wall>r.wall&&pending.elapsed>r.elapsed&&clockOK(pending,6000))pending.epoch=r.document.epoch;
   }
   const id=makeId();if(!tokenOK(id))return;
   const receipt=Object.freeze({id,tabId:r.tabId,documentId:r.documentId,actualURL:r.actualURL,...(r.projectId?{projectId:r.projectId}:{conversationId:r.conversationId}),contextId:r.contextId,selectionEpoch:r.epoch,wall:r.wall,elapsed:r.elapsed});
   r.document.receipt=receipt;r.document.wall=r.wall;r.document.elapsed=r.elapsed;
   diagnostic('receipt-created');
   notify(onReady,{tabId:r.tabId,documentId:r.documentId});
  }finally{if(requests.get(r.requestId)===r){requests.delete(r.requestId);closedRequests.set(r.requestId,r);}}})().catch(()=>{diagnostic('completion-lookup-failed');});
 }
 function isCurrent(frame,receipt){
  if(!active||!receipt||frame?.frameId!==0||frame.incognito!==false||frame.documentLifecycle!=='active'||frame.actualURL!==receipt.actualURL||frame.tabId!==receipt.tabId||frame.documentId!==receipt.documentId)return false;
  const d=documents.get(key(frame));return d?.receipt===receipt&&d.epoch===receipt.selectionEpoch&&clockOK(receipt,ttl);
 }
 async function verify(frame,{signal}={}){
  const receipt=documents.get(key(frame))?.receipt;if(signal?.aborted||!isCurrent(frame,receipt)){diagnostic('association-no-current-receipt');return null;}
  const challenge=makeId();if(!tokenOK(challenge))return null;
  let onAbort,finished=false;const aborted=new Promise(resolve=>{onAbort=()=>resolve(null);signal?.addEventListener('abort',onAbort,{once:true});});
  const current=()=>!finished&&!signal?.aborted&&isCurrent(frame,receipt);
  diagnostic('association-started');
  try{return await withRequestDeadline(()=>Promise.race([aborted,(async()=>{
   const answer=await associatePage({tabId:frame.tabId,documentId:frame.documentId,actualURL:receipt.actualURL,...(receipt.projectId?{projectId:receipt.projectId}:{conversationId:receipt.conversationId}),challenge,expiresAt:new Date(now()+6000).toISOString()});
   if(!current()||answer?.challenge!==challenge||answer.actualURL!==receipt.actualURL||(receipt.projectId?answer.projectId!==receipt.projectId||answer.association!=='explicit-project-id':answer.conversationId!==receipt.conversationId||answer.association!=='explicit-body-id')){diagnostic('association-rejected');return null;}
   const [actual,tab]=await Promise.all([getFrame({tabId:frame.tabId,frameId:0}),getTab(frame.tabId)]);const matched=current()&&tab?.id===frame.tabId&&tab.incognito===false&&frameMatches(actual,receipt);diagnostic(matched?'association-passed':'association-final-frame-rejected');return matched?receipt:null;
  })()]),{timeoutMs:6000,now:elapsedNow});}catch{diagnostic('association-failed-or-timeout');return null;}finally{finished=true;signal?.removeEventListener('abort',onAbort);}
 }

 const filter={urls:[origin+'/backend-api/'+conversationEndpoint+'/*',...(projects?[origin+'/backend-api/projects/*']:[])],types:['xmlhttprequest']};
 const listeners=[[webRequest.onSendHeaders,send,['requestHeaders']],[webRequest.onCompleted,complete],[webRequest.onErrorOccurred,d=>{diagnostic('native-request-failed');fail(d);}],[webRequest.onBeforeRedirect,d=>{diagnostic('native-request-redirected');fail(d);}]];
 for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);
 function stop(){if(!active)return;active=false;for(const [event,listener]of listeners)event.removeListener(listener);requests.clear();closedRequests.clear();documents.clear();}
 return Object.freeze({verify,isCurrent,invalidateTab,invalidateCommitted,invalidateHistory,stop});
}
