import {tokenOK} from '../b1/identity.mjs';
import {exactHostRecord} from './contract.mjs';
const id=v=>tokenOK(v)&&!['__proto__','constructor','prototype'].includes(v);
const fields=['tabId','browserDocumentId','scopeKey','principalKey','contextKey','profileId','profileVersion'];
const identity=v=>v&&Number.isSafeInteger(v.tabId)&&v.tabId>=0&&['browserDocumentId','principalKey','contextKey','profileId'].every(k=>id(v[k]))&&typeof v.scopeKey==='string'&&v.scopeKey.length>0&&v.scopeKey.length<=4096&&Number.isSafeInteger(v.profileVersion)&&v.profileVersion>0;
const same=(a,b)=>fields.every(k=>a[k]===b[k]);
/** RAM-only exact causality. Inputs are private owner observations, never authority
 * by shape. The owner supplies independently guarded intent/submit/readback sources.
 * Route epochs deliberately do not join records: one browser document may move
 * home -> conversation, but scope/principal/context/profile must remain identical.
 * No timestamps, latest conversation, author equality or unique bubble can join.
 */
export function createFirstSendCausality({now=Date.now,elapsedNow=()=>performance.now(),maxPending=32}={}){
 if(typeof now!=='function'||typeof elapsedNow!=='function'||!Number.isInteger(maxPending)||maxPending<1||maxPending>32)throw Error('invalid-first-send-options');
 let stopped=false,priorWall=null,priorElapsed=null;const rows=new Map(),used=new Set();
 function clock(){const wall=now(),elapsed=elapsedNow();if(!Number.isFinite(wall)||!Number.isFinite(elapsed)||priorWall!==null&&wall<priorWall||priorElapsed!==null&&elapsed<priorElapsed){rows.clear();throw Error('first-send-clock-invalid');}priorWall=wall;priorElapsed=elapsed;for(const [k,v]of rows)if(wall-v.wall>=30000||elapsed-v.elapsed>=30000)rows.delete(k);return {wall,elapsed};}
 function active(){if(stopped)throw Error('first-send-stopped');return clock();}
 const key=(context,operationId)=>JSON.stringify([context.tabId,context.browserDocumentId,operationId]);
 function intent(context,value){const t=active();if(!identity(context)||context.routeKind!=='home'||!exactHostRecord(value,Object.hasOwn(value??{},'observedAt')?['intentId','operationId','messageId','observedAt']:['intentId','operationId','messageId'])||![value.intentId,value.operationId,value.messageId].every(id))return false;
  const observed=value.observedAt===undefined?t.wall:Date.parse(value.observedAt);if(!Number.isFinite(observed)||observed>t.wall||t.wall-observed>=30000)return false;
  const k=key(context,value.operationId),replay=JSON.stringify([context.tabId,context.browserDocumentId,value.intentId]);
  if(used.has(replay)||rows.has(k)||used.size>=256||rows.size>=maxPending)return false;
  // An ID cannot be reused by another pending native operation in this document.
  if([...rows.values()].some(r=>r.context.tabId===context.tabId&&r.context.browserDocumentId===context.browserDocumentId&&(r.messageId===value.messageId||r.intentId===value.intentId)))return false;
  used.add(replay);rows.set(k,{...value,context:Object.freeze(Object.fromEntries(fields.map(k=>[k,context[k]]))),...t,wall:observed,elapsed:t.elapsed-(t.wall-observed),submit:null,result:null});return true;
 }
 function submit(context,value){active();if(!identity(context)||!exactHostRecord(value,['operationId','messageId','requestId'])||!Object.values(value).every(id))return false;const r=rows.get(key(context,value.operationId));if(!r||!same(r.context,context)||r.messageId!==value.messageId)return false;
  // An independent second native request is ambiguous, not a retry we can replay.
  if(r.submit){if(r.submit!==value.requestId)rows.delete(key(context,value.operationId));return false;}
  r.submit=value.requestId;return true;
 }
 function resolve(context,value){active();if(!identity(context)||!exactHostRecord(value,['operationId','messageId','requestId','conversationId','acceptanceState'])||!['operationId','messageId','requestId','conversationId'].every(k=>id(value[k]))||value.acceptanceState!=='accepted')return null;
  const k=key(context,value.operationId),r=rows.get(k);if(!r||!same(r.context,context)||r.messageId!==value.messageId||r.submit!==value.requestId)return null;
  if(r.result&&r.result!==value.conversationId){rows.delete(k);return null;}r.result=value.conversationId;
  return Object.freeze({protocol:'vaiwl-send-candidate/1',intentId:r.intentId,conversationId:r.result,messageId:r.messageId,operationId:r.operationId,stage:'correlated',observedAt:new Date(r.wall).toISOString()});
 }
 function consume(context,candidate){active();if(!identity(context)||!candidate)return false;const k=key(context,candidate.operationId),r=rows.get(k);if(!r||!same(r.context,context)||!r.submit||r.result!==candidate.conversationId||r.messageId!==candidate.messageId||r.intentId!==candidate.intentId||new Date(r.wall).toISOString()!==candidate.observedAt)return false;rows.delete(k);return true;}
 function invalidate({tabId,browserDocumentId=null}={}){for(const [k,r]of rows)if(r.context.tabId===tabId&&(browserDocumentId===null||r.context.browserDocumentId===browserDocumentId))rows.delete(k);}
 function stop(){stopped=true;rows.clear();used.clear();}
 return Object.freeze({intent,submit,resolve,consume,invalidate,stop});
}
