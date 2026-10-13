import {withRequestDeadline} from '../data/request-deadline.mjs';
import {instant} from '../navigation/projection.mjs';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
/** Worker-owned fixed endpoints. The returned roster never selects active context. */
export function createSessionProvider({origin='https://chatgpt.com',fetch=globalThis.fetch,now=Date.now,elapsedNow=()=>performance.now(),profile={}}={}){
 const url=new URL(origin),loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.origin!==origin||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'&&!url.port||loopback&&url.protocol==='http:')||typeof fetch!=='function'||typeof now!=='function'||typeof elapsedNow!=='function')throw Error('invalid-session-provider');
 const providerProfile=profile.id??'chatgpt-session-v1',structures=new Map(Object.entries(profile.structures??{personal:'personal',team:'organization',enterprise:'organization'}));
 if(!identifier(providerProfile)||[...structures.values()].some(v=>!['personal','organization','unknown'].includes(v)))throw Error('invalid-session-profile');
 async function read(options={}){
  if(!record(options)||Object.keys(options).some(k=>k!=='signal'))throw Error('invalid-session-read-options');
  const {signal}=options,controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const check=()=>{if(combined.aborted)throw Error('session-aborted');};
  const json=async(path,token)=>{
   check();const target=origin+path,response=await fetch(target,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:combined,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})}});check();
   if(response.status===401||response.status===403)throw Error('session-unauthorized');
   if(response.status!==200||response.redirected||response.url!==target)throw Error('invalid-session-response');
   if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw Error('invalid-session-mime');
   const limit=path==='/api/auth/session'?256*1024:1024*1024,length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit))throw Error('session-response-too-large');
   if(!response.body?.getReader)throw Error('missing-session-body');
   const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
   try{while(true){check();const chunk=await reader.read();check();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))throw Error('invalid-session-body');bytes+=chunk.value.byteLength;if(bytes>limit)throw Error('session-response-too-large');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();try{return JSON.parse(text);}catch{throw Error('invalid-session-json');}}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
  };
  try{return await withRequestDeadline(async()=>{
   const session=await json('/api/auth/session');
   if(!record(session)||!record(session.user)||!identifier(session.user.id)||typeof session.expires!=='string'||instant(session.expires)===null||instant(session.expires)<=now()||typeof session.accessToken!=='string'||!session.accessToken||session.accessToken.length>16384||!/^[\x21-\x7e]+$/.test(session.accessToken))throw Error('invalid-session-schema');
   const principalId=session.user.id,expiresAt=session.expires;let token=session.accessToken;delete session.accessToken;
   let accounts;try{accounts=await json('/backend-api/accounts/check/v4-2023-04-27',token);}finally{token=null;}
   if(!record(accounts)||!record(accounts.accounts)||Object.keys(accounts.accounts).length>1000)throw Error('invalid-accounts-schema');
   const contexts=[],seen=new Set();for(const [key,value]of Object.entries(accounts.accounts)){
    const account=value?.account;if(!identifier(key)||!record(account)||!identifier(account.account_id)||key!==account.account_id||typeof account.structure!=='string'||account.structure.length>128||seen.has(account.account_id))throw Error('invalid-accounts-schema');
    seen.add(account.account_id);contexts.push({id:account.account_id,kind:structures.get(account.structure)??'unknown'});
   }
   check();if(instant(expiresAt)<=now())throw Error('session-expired');
   return {principalId,expiresAt,contexts,providerProfile,transport:'worker-fixed-fetch'};
  },{timeoutMs:6000,now:elapsedNow});}catch(error){const code=error?.message;throw Error(['request-timeout','session-aborted','session-unauthorized','invalid-session-response','invalid-session-mime','session-response-too-large','missing-session-body','invalid-session-body','invalid-session-json','invalid-session-schema','invalid-accounts-schema','session-expired'].includes(code)?code:combined.aborted?'session-aborted':'session-transport-failed');}finally{controller.abort();}
 }
 return Object.freeze({read});
}
