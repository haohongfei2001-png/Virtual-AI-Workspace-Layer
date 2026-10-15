import {createOldSendTerminalProfile} from '../host/old-send-terminal-profile.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {digest} from '../data/hash.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
/** Fixed cookie-authenticated loopback operation readback, not a production endpoint. Terminal states are immutable application declarations.
 * The bounded result maps exact operation/message/C; it never grants ACK or original-time authority. */
export function createOldSendTerminalReadback({origin,fetch=globalThis.fetch,elapsedNow=()=>performance.now()}={}){
 const profile=createOldSendTerminalProfile(origin);
 return async({operationId,principalKey,contextKey,signal})=>{
  if(!tokenOK(operationId))throw Error('invalid-old-send-terminal-operation');const abort=new AbortController(),combined=signal?AbortSignal.any([signal,abort.signal]):abort.signal;
  try{return await withRequestDeadline(async()=>{
   const target=origin+profile.readbackPrefix+encodeURIComponent(operationId),response=await fetch(target,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:combined});
   if(response.status!==200||response.redirected||response.url!==target||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('invalid-old-send-terminal-readback');
   if(!response.body?.getReader)throw Error('invalid-old-send-terminal-body');const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
   try{while(true){if(combined.aborted)throw Error('old-send-terminal-aborted');const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096)throw Error('old-send-terminal-body-too-large');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
   const v=JSON.parse(text);if(!exactHostRecord(v,['operationId','messageId','conversationId','acceptanceState','principalId','contextId'])||v.operationId!==operationId||!['operationId','messageId','conversationId','principalId','contextId'].every(k=>tokenOK(v[k]))||!['failed','cancelled'].includes(v.acceptanceState)||'principal_'+digest(['chatgpt-principal-v1',v.principalId])!==principalKey||'context_'+digest(['chatgpt-context-v1',v.principalId,v.contextId])!==contextKey)throw Error('invalid-old-send-terminal-identity');
   return Object.freeze({operationId:v.operationId,messageId:v.messageId,conversationId:v.conversationId,acceptanceState:v.acceptanceState});
  },{timeoutMs:6000,now:elapsedNow});}finally{abort.abort();}
 };
}
