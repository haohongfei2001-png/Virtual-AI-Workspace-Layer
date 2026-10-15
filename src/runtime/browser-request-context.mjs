import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';

/** Private C2 owner. Browser traffic is a selection witness, not authentication.
 * Headers other than the bounded account/purpose fields are never retained.
 * This profile supports current conversation GETs only, never list/prefetch reads.
 */
export function createBrowserRequestContext({webRequest,getFrame,getTab,associatePage,origin,now=Date.now,elapsedNow=()=>performance.now(),makeId=()=>crypto.randomUUID(),onInvalidate=()=>{},onReady=()=>{},ttl=60000,maxDocuments=128,maxRequests=128}={}){
 const base=new URL(origin);
 if(base.origin!==origin||!['https:','http:'].includes(base.protocol)||typeof getFrame!=='function'||typeof getTab!=='function'||typeof associatePage!=='function'||!['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].every(k=>typeof webRequest?.[k]?.addListener==='function')||!Number.isInteger(ttl)||ttl<1000||ttl>60000||![maxDocuments,maxRequests].every(n=>Number.isInteger(n)&&n>0&&n<=512))throw Error('invalid-browser-context-owner');
 const documents=new Map(),requests=new Map(),closedRequests=new Map(),clocks=new WeakMap(),expired=new WeakSet();let active=true,epoch=0;
 const key=d=>`${d.tabId}:${d.documentId}`;
 const notify=(fn,value)=>{try{Promise.resolve(fn(value)).catch(()=>{});}catch{}};
 const clockOK=(entry,limit)=>{const wall=now(),elapsed=elapsedNow(),prior=clocks.get(entry)??{wall:entry.wall,elapsed:entry.elapsed};if(expired.has(entry)||!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<prior.wall||elapsed<prior.elapsed||wall-entry.wall>=limit||elapsed-entry.elapsed>=limit){expired.add(entry);return false;}clocks.set(entry,{wall,elapsed});return true;};
 const conversation=url=>{try{const u=new URL(url);if(u.origin!==origin||u.username||u.password||u.search||u.hash)return null;return /^\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(u.pathname)?.[1]??null;}catch{return null;}};
 const requestConversation=url=>{try{const u=new URL(url);if(u.origin!==origin||u.username||u.password||u.search||u.hash)return null;return /^\/backend-api\/conversation\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(u.pathname)?.[1]??null;}catch{return null;}};
 const validDetails=d=>active&&Number.isSafeInteger(d?.tabId)&&d.tabId>=0&&d.frameId===0&&tokenOK(d.documentId)&&d.documentLifecycle==='active'&&d.initiator===origin&&d.type==='xmlhttprequest'&&d.method==='GET'&&tokenOK(d.requestId);
 const frameMatches=(frame,entry)=>frame?.documentId===entry.documentId&&frame.frameType==='outermost_frame'&&frame.documentLifecycle==='active'&&conversation(frame.url)===entry.conversationId&&(!entry.actualURL||frame.url===entry.actualURL);
 function drop(document,reason){document.receipt=null;document.epoch=++epoch;document.reason=reason;notify(onInvalidate,{tabId:document.tabId,documentId:document.documentId});}
 function invalidateTab(tabId){for(const [k,d]of documents)if(d.tabId===tabId){drop(d,'navigation');documents.delete(k);}for(const [id,r]of requests)if(r.tabId===tabId)requests.delete(id);}
 function cleanup(){for(const [id,r]of closedRequests)if(!clockOK(r,ttl))closedRequests.delete(id);for(const [id,r]of requests)if(!clockOK(r,6000)){requests.delete(id);if(documents.get(key(r))===r.document)drop(r.document,'request-expired');}for(const [k,d]of documents)if(!clockOK(d,ttl)&&!Array.from(requests.values()).some(r=>r.document===d)){drop(d,'context-expired');documents.delete(k);}}
 function send(details){
  if(!validDetails(details))return;
  const conversationId=requestConversation(details.url);if(!conversationId)return;
  const headers=details.requestHeaders;if(!Array.isArray(headers)||headers.length>256)return;
  let contextId=null,count=0;for(const h of headers){const name=typeof h.name==='string'?h.name.toLowerCase():'';if(['purpose','sec-purpose','x-purpose'].includes(name)&&typeof h.value==='string'&&/prefetch|prerender/i.test(h.value))return;if(name==='chatgpt-account-id'){count++;contextId=h.value;}}
  if(count!==1||typeof contextId!=='string'||!contextId||contextId.length>256||/[\s\u0000-\u001f\u007f]/.test(contextId))return;
  cleanup();
  let document=documents.get(key(details));
  // Capacity may reject new authority, never suppress a revocation signal.
  if(document?.receipt?.conversationId===conversationId&&document.contextId!==contextId)drop(document,'context-selection-pending');
  const conflicting=document&&[...requests.values()].filter(r=>r.document===document&&r.conversationId===conversationId&&r.contextId!==contextId);
  if(conflicting?.length){for(const r of conflicting)r.conflicted=true;drop(document,'concurrent-context-conflict');}
  if(requests.has(details.requestId)||closedRequests.has(details.requestId)||requests.size>=maxRequests||closedRequests.size>=maxRequests*4)return;
  if(!document){if(documents.size>=maxDocuments)return;document={tabId:details.tabId,documentId:details.documentId,epoch:++epoch,receipt:null,contextId:null,wall:now(),elapsed:elapsedNow()};documents.set(key(details),document);}
  // A known document's conflicting current-object request is already a
  // selection-change signal. Revoke synchronously before getFrame can yield.
  if(document.receipt?.conversationId===conversationId&&document.contextId!==contextId)drop(document,'context-selection-pending');
  // No headers object or browser event object survives this callback.
  const request={tabId:details.tabId,documentId:details.documentId,requestId:details.requestId,conversationId,contextId,url:details.url,wall:now(),elapsed:elapsedNow(),document,epoch:document.epoch,actualURL:null,accepted:false};
  const overlap=[...requests.values()].filter(r=>r.document===document&&r.conversationId===conversationId&&r.contextId!==contextId);
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
   if(r.document.receipt&&r.document.receipt.contextId===r.contextId&&r.document.receipt.actualURL===r.actualURL&&clockOK(r.document.receipt,ttl))return;
   const id=makeId();if(!tokenOK(id))return;
   const receipt=Object.freeze({id,tabId:r.tabId,documentId:r.documentId,actualURL:r.actualURL,conversationId:r.conversationId,contextId:r.contextId,selectionEpoch:r.epoch,wall:r.wall,elapsed:r.elapsed});
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
   const answer=await associatePage({tabId:frame.tabId,documentId:frame.documentId,actualURL:receipt.actualURL,conversationId:receipt.conversationId,challenge,expiresAt:new Date(now()+6000).toISOString()});
   if(!current()||answer?.challenge!==challenge||answer.actualURL!==receipt.actualURL||answer.conversationId!==receipt.conversationId||answer.association!=='explicit-body-id')return null;
   const [actual,tab]=await Promise.all([getFrame({tabId:frame.tabId,frameId:0}),getTab(frame.tabId)]);return current()&&tab?.id===frame.tabId&&tab.incognito===false&&frameMatches(actual,receipt)?receipt:null;
  })()]),{timeoutMs:6000,now:elapsedNow});}catch{return null;}finally{finished=true;signal?.removeEventListener('abort',onAbort);}
 }

 const filter={urls:[origin+'/backend-api/conversation/*'],types:['xmlhttprequest']};
 const listeners=[[webRequest.onSendHeaders,send,['requestHeaders']],[webRequest.onCompleted,complete],[webRequest.onErrorOccurred,fail],[webRequest.onBeforeRedirect,fail]];
 for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);
 function stop(){if(!active)return;active=false;for(const [event,listener]of listeners)event.removeListener(listener);requests.clear();closedRequests.clear();documents.clear();}
 return Object.freeze({verify,isCurrent,invalidateTab,stop});
}
