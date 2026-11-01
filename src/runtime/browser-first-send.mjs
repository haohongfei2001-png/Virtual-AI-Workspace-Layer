import {tokenOK} from '../b1/identity.mjs';
import {createLoopbackFirstSendProfile} from '../host/first-send-profile.mjs';
/** Privileged browser request events only. Never installs a fetch wrapper, reads
 * request bodies, modifies headers or interprets HTTP success as message ACK. */
export function createBrowserFirstSend({webRequest,origin,onSubmit,now=Date.now,elapsedNow=()=>performance.now()}={}){
 const profile=createLoopbackFirstSendProfile(origin),pending=new Map(),closed=new Set();let stopped=false;
 if(typeof onSubmit!=='function'||!['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].every(k=>typeof webRequest?.[k]?.addListener==='function'))throw Error('invalid-first-send-browser');
 const valid=d=>!stopped&&d?.url===origin+profile.submitPath&&d.method==='POST'&&d.type==='xmlhttprequest'&&d.initiator===origin&&d.frameId===0&&d.documentLifecycle==='active'&&Number.isSafeInteger(d.tabId)&&d.tabId>=0&&tokenOK(d.documentId)&&tokenOK(d.requestId);
 function send(d){if(!valid(d)||!Number.isFinite(d.timeStamp)||Math.floor(d.timeStamp)>now()||now()-d.timeStamp>=30000||pending.has(d.requestId)||closed.has(d.requestId)||closed.size>=256)return;const wall=now(),elapsed=elapsedNow();for(const [id,r]of pending)if(wall-r.wall>=6000||elapsed-r.elapsed>=6000)pending.delete(id);if(pending.size>=32||!Array.isArray(d.requestHeaders)||d.requestHeaders.length>128)return;
  const get=name=>{const values=d.requestHeaders.filter(h=>h.name?.toLowerCase()===name);return values.length===1&&tokenOK(values[0].value)?values[0].value:null;};
  const operationId=get(profile.operationHeader),messageId=get(profile.messageHeader);if(!operationId||!messageId)return;
  pending.set(d.requestId,{tabId:d.tabId,browserDocumentId:d.documentId,requestId:d.requestId,operationId,messageId,startedAt:d.timeStamp,wall,elapsed});
 }
 function fail(d){const r=pending.get(d?.requestId);if(r){pending.delete(d.requestId);closed.add(d.requestId);}}
 function complete(d){const r=pending.get(d?.requestId);if(!r)return;fail(d);const wall=now(),elapsed=elapsedNow();if(!valid(d)||d.tabId!==r.tabId||d.documentId!==r.browserDocumentId||d.statusCode!==200||d.fromCache===true||!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<r.wall||elapsed<r.elapsed||wall-r.wall>=6000||elapsed-r.elapsed>=6000)return;
  try{Promise.resolve(onSubmit(Object.freeze({tabId:r.tabId,browserDocumentId:r.browserDocumentId,requestId:r.requestId,operationId:r.operationId,messageId:r.messageId,startedAt:r.startedAt}))).catch(()=>{});}catch{}
 }
 const filter={urls:[origin+profile.submitPath],types:['xmlhttprequest']};
 webRequest.onSendHeaders.addListener(send,filter,['requestHeaders']);webRequest.onCompleted.addListener(complete,filter);webRequest.onErrorOccurred.addListener(fail,filter);webRequest.onBeforeRedirect.addListener(fail,filter);
 return Object.freeze({invalidateTab(tabId){for(const [id,r]of pending)if(r.tabId===tabId)fail({requestId:id});},stop(){stopped=true;pending.clear();closed.clear();for(const [event,fn]of [[webRequest.onSendHeaders,send],[webRequest.onCompleted,complete],[webRequest.onErrorOccurred,fail],[webRequest.onBeforeRedirect,fail]])event.removeListener(fn);}});
}
