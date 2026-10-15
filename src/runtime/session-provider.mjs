import {validateHistoricalSendProfile,extractHistoricalSends} from './historical-send-profile.mjs';
import {digest} from '../data/hash.mjs';
import {parseConversationMetadata} from '../host/conversation-metadata.mjs';
import {extractConversationAcceptance} from '../host/conversation-acceptance.mjs';
import {validateSendAckProfile} from './send-ack-admission.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {instant} from '../navigation/projection.mjs';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
/** Worker-owned fixed endpoints. The returned roster never selects active context. */
export function createSessionProvider({origin='https://chatgpt.com',fetch=globalThis.fetch,now=Date.now,elapsedNow=()=>performance.now(),profile={},readBudget=null}={}){
 const url=new URL(origin),loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.origin!==origin||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'&&!url.port||loopback&&url.protocol==='http:')||typeof fetch!=='function'||typeof now!=='function'||typeof elapsedNow!=='function')throw Error('invalid-session-provider');
 const providerProfile=profile.id??'chatgpt-session-v1',structures=new Map(Object.entries(profile.structures??{personal:'personal',team:'organization',enterprise:'organization'}));
 if(!identifier(providerProfile)||[...structures.values()].some(v=>!['personal','organization','unknown'].includes(v)))throw Error('invalid-session-profile');
 const currentEnabled=profile.currentConversationReadEnabled===true,contextHeader=profile.currentConversationContextHeader===true,rosterContext=profile.currentConversationRosterContext===true;
 const historicalProfile=profile.historicalSendProfile===undefined?null:validateHistoricalSendProfile(profile.historicalSendProfile),histories=new WeakMap();
 if(historicalProfile&&(!currentEnabled||historicalProfile.providerProfile!==providerProfile||!loopback))throw Error('invalid-session-history-profile');
 const ackProfile=profile.sendAckProfile===undefined?null:validateSendAckProfile(profile.sendAckProfile),acceptances=new WeakMap();
 if(ackProfile&&(!currentEnabled||ackProfile.providerProfile!==providerProfile))throw Error('invalid-session-ack-profile');
 async function execute(options={},current=null){
  if(!record(options)||Object.keys(options).some(k=>k!=='signal'))throw Error('invalid-session-read-options');
  const started=elapsedNow();const {signal}=options,controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const check=()=>{if(elapsedNow()-started>=6000)throw Error('request-timeout');if(combined.aborted)throw Error('session-aborted');};
  let budgetWindow=current?.budgetWindow??null;
  const json=async(path,token,{raw=false,contextId=null}={})=>{
   check();if(current&&readBudget){const reservation=await readBudget.reserve({principalKey:current.expectedPrincipalKey,contextKey:current.expectedContextKey,sourceDomain:origin,attemptKey:path==='/api/auth/session'?'conversation:'+current.conversationId:null,windowStartedAt:budgetWindow,signal:combined});budgetWindow=reservation.windowStartedAt;check();}
   const target=origin+path,response=await fetch(target,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:combined,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(contextId&&contextHeader?{'ChatGPT-Account-ID':contextId}:{})}});check();
   if(response.status===401||response.status===403)throw Error('session-unauthorized');
   if(response.status!==200||response.redirected||response.url!==target)throw Error('invalid-session-response');
   if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw Error('invalid-session-mime');
   const limit=raw?8*1024*1024:path==='/api/auth/session'?256*1024:1024*1024,length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit))throw Error('session-response-too-large');
   if(!response.body?.getReader)throw Error('missing-session-body');
   const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
   try{while(true){check();const chunk=await reader.read();check();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))throw Error('invalid-session-body');bytes+=chunk.value.byteLength;if(bytes>limit)throw Error('session-response-too-large');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();if(raw)return text;try{return JSON.parse(text);}catch{throw Error('invalid-session-json');}}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
  };
  let onAbort;const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(Error('session-aborted'));combined.addEventListener('abort',onAbort,{once:true});if(combined.aborted)onAbort();});
  try{return await withRequestDeadline(()=>Promise.race([cancelled,(async()=>{
   const session=await json('/api/auth/session');
   if(!record(session)||!record(session.user)||!identifier(session.user.id)||typeof session.expires!=='string'||instant(session.expires)===null||instant(session.expires)<=now()||typeof session.accessToken!=='string'||!session.accessToken||session.accessToken.length>16384||!/^[\x21-\x7e]+$/.test(session.accessToken))throw Error('invalid-session-schema');
   const principalId=session.user.id,expiresAt=session.expires;let token=session.accessToken;delete session.accessToken;
   try{
   const principalKey='principal_'+digest(['chatgpt-principal-v1',principalId]);
   if(current&&principalKey!==current.expectedPrincipalKey)throw Error('conversation-principal-conflict');
   const accounts=await json('/backend-api/accounts/check/v4-2023-04-27',token);
   if(!record(accounts)||!record(accounts.accounts)||Object.keys(accounts.accounts).length>1000)throw Error('invalid-accounts-schema');
   const contexts=[],seen=new Set();for(const [key,value]of Object.entries(accounts.accounts)){
    const account=value?.account;if(!identifier(key)||!record(account)||!identifier(account.account_id)||key!==account.account_id||typeof account.structure!=='string'||account.structure.length>128||seen.has(account.account_id))throw Error('invalid-accounts-schema');
    seen.add(account.account_id);contexts.push({id:account.account_id,kind:structures.get(account.structure)??'unknown'});
   }
   check();if(instant(expiresAt)<=now())throw Error('session-expired');
   if(current){
    const selected=contexts.filter(c=>c.kind!=='unknown'&&'context_'+digest(['chatgpt-context-v1',principalId,c.id])===current.expectedContextKey);
    if(selected.length!==1||!(rosterContext&&contextHeader)&&!(contexts.length===1&&selected[0].kind==='personal'))throw Error('conversation-context-conflict');
    const raw=await json('/backend-api/conversation/'+encodeURIComponent(current.conversationId),token,{raw:true,contextId:selected[0].id});check();
    let metadata;try{metadata=parseConversationMetadata({conversationId:current.conversationId,principalId,payload:raw});}catch{throw Error('invalid-conversation-metadata');}
    check();if(instant(expiresAt)<=now())throw Error('session-expired');
    const result={principalKey,contextKey:current.expectedContextKey,expiresAt,providerProfile,transport:'worker-fixed-fetch',metadata};
    if(ackProfile){
     let messages;try{messages=extractConversationAcceptance({conversationId:current.conversationId,principalId,payload:raw,profile:ackProfile});}catch{throw Error('invalid-conversation-metadata');}
     check();if(instant(expiresAt)<=now())throw Error('session-expired');
     acceptances.set(result,Object.freeze({profile:ackProfile,conversationId:current.conversationId,principalKey,contextKey:current.expectedContextKey,expiresAt,providerProfile,transport:'worker-fixed-fetch',messages}));
    }
    if(historicalProfile){const messages=extractHistoricalSends({conversationId:current.conversationId,principalId,payload:raw,profile:historicalProfile});check();if(instant(expiresAt)<=now())throw Error('session-expired');histories.set(result,Object.freeze({profile:historicalProfile,conversationId:current.conversationId,principalKey,contextKey:current.expectedContextKey,expiresAt,providerProfile,transport:'worker-fixed-fetch',messages}));}
    return result;
   }
   return {principalId,expiresAt,contexts,providerProfile,transport:'worker-fixed-fetch'};
   }finally{token=null;}
  })()]),{timeoutMs:6000,now:elapsedNow});}catch(error){const code=error?.message;throw Error(['read-budget-exhausted','read-budget-retries-exhausted','invalid-host-read-budget-state','conversation-principal-conflict','conversation-context-conflict','invalid-conversation-metadata','request-timeout','session-aborted','session-unauthorized','invalid-session-response','invalid-session-mime','session-response-too-large','missing-session-body','invalid-session-body','invalid-session-json','invalid-session-schema','invalid-accounts-schema','session-expired'].includes(code)?code:combined.aborted?'session-aborted':'session-transport-failed');}finally{combined.removeEventListener('abort',onAbort);controller.abort();}
 }
 const read=options=>execute(options);
 function readCurrentConversation(options){
  if(!currentEnabled)return Promise.reject(Error('current-conversation-read-disabled'));
  if(!record(options)||Object.keys(options).some(k=>!['conversationId','expectedPrincipalKey','expectedContextKey','signal','budgetWindow'].includes(k))||typeof options.conversationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.conversationId)||typeof options.expectedPrincipalKey!=='string'||!/^principal_[0-9a-f]{64}$/.test(options.expectedPrincipalKey)||typeof options.expectedContextKey!=='string'||!/^context_[0-9a-f]{64}$/.test(options.expectedContextKey)||options.budgetWindow!==undefined&&(!Number.isFinite(options.budgetWindow)||options.budgetWindow<0))return Promise.reject(Error('invalid-current-conversation-options'));
  const {signal,conversationId,expectedPrincipalKey,expectedContextKey,budgetWindow}=options;
  return execute({signal},{conversationId,expectedPrincipalKey,expectedContextKey,budgetWindow});
 }
 // Private in-process association, never restored from serialized data. Fresh
 // observation/body guards remain the reader's responsibility.
 function acceptanceFor(result){const value=acceptances.get(result);if(!value)return null;const checkedAt=now();if(!Number.isFinite(checkedAt)||instant(value.expiresAt)<=checkedAt){acceptances.delete(result);return null;}return value;}
 function historyFor(result){const value=histories.get(result);if(!value)return null;const checkedAt=now();if(!Number.isFinite(checkedAt)||instant(value.expiresAt)<=checkedAt){histories.delete(result);return null;}return value;}
 return Object.freeze({read,readCurrentConversation,acceptanceFor,historyFor});
}
