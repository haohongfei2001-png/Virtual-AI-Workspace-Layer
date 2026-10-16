import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';

/** Private C2 owner. Browser traffic is a selection witness, not authentication.
 * Headers other than the bounded account/purpose fields are never retained.
 * Current conversation GETs and an explicitly loopback-only Project profile
 * are supported; list/prefetch reads never select a context.
 */
export function createBrowserRequestContext({webRequest,getFrame,getTab,associatePage,origin,projectRequestContext=null,now=Date.now,elapsedNow=()=>performance.now(),makeId=()=>crypto.randomUUID(),onInvalidate=()=>{},onReady=()=>{},ttl=60000,maxDocuments=128,maxRequests=128}={}){
 const base=new URL(origin);
 if(base.origin!==origin||!['https:','http:'].includes(base.protocol)||typeof getFrame!=='function'||typeof getTab!=='function'||typeof associatePage!=='function'||!['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].every(k=>typeof webRequest?.[k]?.addListener==='function')||!Number.isInteger(ttl)||ttl<1000||ttl>60000||![maxDocuments,maxRequests].every(n=>Number.isInteger(n)&&n>0&&n<=512))throw Error('invalid-browser-context-owner');
 const projects=projectRequestContext==='loopback-project-v1';
 if(projectRequestContext!==null&&(!projects||base.protocol!=='http:'||base.hostname!=='127.0.0.1'))throw Error('invalid-project-context-profile');
 const documents=new Map(),requests=new Map(),closedRequests=new Map(),clocks=new WeakMap(),expired=new WeakSet();let active=true,epoch=0;
 const key=d=>`${d.tabId}:${d.documentId}`;
 const notify=(fn,value)=>{try{Promise.resolve(fn(value)).catch(()=>{});}catch{}};
 const clockOK=(entry,limit)=>{const wall=now(),elapsed=elapsedNow(),prior=clocks.get(entry)??{wall:entry.wall,elapsed:entry.elapsed};if(expired.has(entry)||!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<prior.wall||elapsed<prior.elapsed||wall-entry.wall>=limit||elapsed-entry.elapsed>=limit){expired.add(entry);return false;}clocks.set(entry,{wall,elapsed});return true;};
 const conversation=url=>{try{const u=new URL(url);if(u.origin!==origin||u.username||u.password||u.search||u.hash)return null;return /^\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(u.pathname)?.[1]??null;}catch{return null;}};
 const requestConversation=url=>{try{const u=new URL(url);if(u.origin!==origin||u.username||u.password||u.search||u.hash)return null;return /^\/backend-api\/conversation\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(u.pathname)?.[1]??null;}catch{return null;}};
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
  for(const [id,r]of requests)if(r.tabId===details?.tabId){if(keep.has(r)){r.commitRetained=true;r.historyTargetURL=details.url;r.epoch=r.document.epoch;}else requests.delete(id);}
 }
 function invalidateHistory(details){
  const nextTarget=target(details?.url),valid=details?.frameId===0&&details?.frameType==='outermost_frame'&&details?.documentLifecycle==='active'&&tokenOK(details?.documentId)&&nextTarget;
  const keep=new Set();
  if(valid)for(const r of requests.values())if(r.tabId===details.tabId&&r.documentId===details.documentId&&targetOf(r)===nextTarget&&!r.accepted&&r.actualURL===null&&!r.conflicted&&!r.historyRetained&&r.document.receipt&&r.document.receipt.actualURL!==details.url&&clockOK(r,6000))keep.add(r);
  // History delivery may follow the real new-route GET. Revoke every old grant
  // now, but do not erase that still-unprepared, independently verified request.
  // Its original six-second clock and later frame/tab/body checks are unchanged.
  for(const [k,d]of documents)if(d.tabId===details?.tabId){drop(d,'navigation');if(![...keep].some(r=>r.document===d))documents.delete(k);}
  for(const [id,r]of requests)if(r.tabId===details?.tabId){if(keep.has(r)){r.historyRetained=true;r.historyTargetURL=details.url;r.epoch=r.document.epoch;}else requests.delete(id);}
 }
 function cleanup(){for(const [id,r]of closedRequests)if(!clockOK(r,ttl))closedRequests.delete(id);for(const [id,r]of requests)if(!clockOK(r,6000)){requests.delete(id);if(documents.get(key(r))===r.document)drop(r.document,'request-expired');}for(const [k,d]of documents)if(!clockOK(d,ttl)&&!Array.from(requests.values()).some(r=>r.document===d)){drop(d,'context-expired');documents.delete(k);}}
 function send(details){
  if(!validDetails(details))return;
  const conversationId=requestConversation(details.url),projectId=project(details.url,true);if(!conversationId&&!projectId)return;
  const objectKey=projectId?'p:'+projectId:'c:'+conversationId;
  const headers=details.requestHeaders;if(!Array.isArray(headers)||headers.length>256)return;
  let contextId=null,count=0;for(const h of headers){const name=typeof h.name==='string'?h.name.toLowerCase():'';if(['purpose','sec-purpose','x-purpose'].includes(name)&&typeof h.value==='string'&&/prefetch|prerender/i.test(h.value))return;if(name==='chatgpt-account-id'){count++;contextId=h.value;}}
  if(count!==1||typeof contextId!=='string'||!contextId||contextId.length>256||/[\s\u0000-\u001f\u007f]/.test(contextId))return;
  cleanup();
  let document=documents.get(key(details));
  // Capacity may reject new authority, never suppress a revocation signal.
  if(document?.receipt&&targetOf(document.receipt)===objectKey&&document.contextId!==contextId)drop(document,'context-selection-pending');
  const conflicting=document&&[...requests.values()].filter(r=>r.document===document&&targetOf(r)===objectKey&&r.contextId!==contextId);
  if(conflicting?.length){for(const r of conflicting)r.conflicted=true;drop(document,'concurrent-context-conflict');}
  if(requests.has(details.requestId)||closedRequests.has(details.requestId)||requests.size>=maxRequests||closedRequests.size>=maxRequests*4)return;
  if(!document){if(documents.size>=maxDocuments)return;document={tabId:details.tabId,documentId:details.documentId,epoch:++epoch,receipt:null,contextId:null,wall:now(),elapsed:elapsedNow()};documents.set(key(details),document);}
  // A known document's conflicting current-object request is already a
  // selection-change signal. Revoke synchronously before getFrame can yield.
  if(document.receipt&&targetOf(document.receipt)===objectKey&&document.contextId!==contextId)drop(document,'context-selection-pending');
  // No headers object or browser event object survives this callback.
  const request={tabId:details.tabId,documentId:details.documentId,requestId:details.requestId,conversationId,...(projectId?{projectId}:{}),contextId,url:details.url,wall:now(),elapsed:elapsedNow(),document,epoch:document.epoch,actualURL:null,accepted:false};
  const overlap=[...requests.values()].filter(r=>r.document===document&&targetOf(r)===objectKey&&r.contextId!==contextId);
  if(overlap.length){request.conflicted=true;for(const r of overlap)r.conflicted=true;drop(document,'concurrent-context-conflict');}
  requests.set(request.requestId,request);
  request.prepared=Promise.resolve().then(()=>Promise.all([getFrame({tabId:request.tabId,frameId:0}),getTab(request.tabId)])).then(([frame,tab])=>{
   if(request.conflicted||tab?.id!==request.tabId||tab.incognito!==false||!active||requests.get(request.requestId)!==request||documents.get(key(request))!==document||!clockOK(request,6000)||!frameMatches(frame,request))return false;
   request.actualURL=frame.url;
   const concurrent=[...requests.values()].some(r=>r!==request&&r.document===document&&r.accepted&&r.contextId!==contextId);
   if(concurrent){drop(document,'concurrent-context-conflict');return false;}
   if(document.contextId!==contextId||document.receipt?.actualURL!==request.actualURL){drop(document,'context-selection-pending');document.contextId=contextId;}
   request.epoch=document.epoch;request.accepted=true;return true;
  }).catch(()=>false);
 }
 function fail(details){const r=requests.get(details?.requestId);if(!r)return;requests.delete(r.requestId);closedRequests.set(r.requestId,r);if(r.accepted&&documents.get(key(r))===r.document)drop(r.document,'request-failed');}
 function complete(details){
  const r=requests.get(details?.requestId);if(!r)return;
  if(!validDetails(details)||details.url!==r.url||details.documentId!==r.documentId||details.tabId!==r.tabId||details.statusCode!==200||details.fromCache===true){fail(details);return;}
  void (async()=>{try{
   if(!await r.prepared||r.conflicted||!active||requests.get(r.requestId)!==r||documents.get(key(r))!==r.document||r.epoch!==r.document.epoch||!clockOK(r,6000))return;
   const [frame,tab]=await Promise.all([getFrame({tabId:r.tabId,frameId:0}),getTab(r.tabId)]);
   if(r.conflicted||tab?.id!==r.tabId||tab.incognito!==false||!active||requests.get(r.requestId)!==r||r.epoch!==r.document.epoch||!clockOK(r,6000)||!frameMatches(frame,r))return;
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
   notify(onReady,{tabId:r.tabId,documentId:r.documentId});
  }finally{if(requests.get(r.requestId)===r){requests.delete(r.requestId);closedRequests.set(r.requestId,r);}}})().catch(()=>{});
 }
 function isCurrent(frame,receipt){
  if(!active||!receipt||frame?.frameId!==0||frame.incognito!==false||frame.documentLifecycle!=='active'||frame.actualURL!==receipt.actualURL||frame.tabId!==receipt.tabId||frame.documentId!==receipt.documentId)return false;
  const d=documents.get(key(frame));return d?.receipt===receipt&&d.epoch===receipt.selectionEpoch&&clockOK(receipt,ttl);
 }
 async function verify(frame,{signal}={}){
  const receipt=documents.get(key(frame))?.receipt;if(signal?.aborted||!isCurrent(frame,receipt))return null;
  const challenge=makeId();if(!tokenOK(challenge))return null;
  let onAbort,finished=false;const aborted=new Promise(resolve=>{onAbort=()=>resolve(null);signal?.addEventListener('abort',onAbort,{once:true});});
  const current=()=>!finished&&!signal?.aborted&&isCurrent(frame,receipt);
  try{return await withRequestDeadline(()=>Promise.race([aborted,(async()=>{
   const answer=await associatePage({tabId:frame.tabId,documentId:frame.documentId,actualURL:receipt.actualURL,...(receipt.projectId?{projectId:receipt.projectId}:{conversationId:receipt.conversationId}),challenge,expiresAt:new Date(now()+6000).toISOString()});
   if(!current()||answer?.challenge!==challenge||answer.actualURL!==receipt.actualURL||(receipt.projectId?answer.projectId!==receipt.projectId||answer.association!=='explicit-project-id':answer.conversationId!==receipt.conversationId||answer.association!=='explicit-body-id'))return null;
   const [actual,tab]=await Promise.all([getFrame({tabId:frame.tabId,frameId:0}),getTab(frame.tabId)]);return current()&&tab?.id===frame.tabId&&tab.incognito===false&&frameMatches(actual,receipt)?receipt:null;
  })()]),{timeoutMs:6000,now:elapsedNow});}catch{return null;}finally{finished=true;signal?.removeEventListener('abort',onAbort);}
 }

 const filter={urls:[origin+'/backend-api/conversation/*',...(projects?[origin+'/backend-api/projects/*']:[])],types:['xmlhttprequest']};
 const listeners=[[webRequest.onSendHeaders,send,['requestHeaders']],[webRequest.onCompleted,complete],[webRequest.onErrorOccurred,fail],[webRequest.onBeforeRedirect,fail]];
 for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);
 function stop(){if(!active)return;active=false;for(const [event,listener]of listeners)event.removeListener(listener);requests.clear();closedRequests.clear();documents.clear();}
 return Object.freeze({verify,isCurrent,invalidateTab,invalidateCommitted,invalidateHistory,stop});
}
