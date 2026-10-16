import {readSessionJSON,sessionCredentials,sessionContexts} from './session-identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {instant} from '../navigation/projection.mjs';
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const errors=new Set(['request-timeout','session-aborted','session-unauthorized','invalid-session-response','invalid-session-mime','session-response-too-large','missing-session-body','invalid-session-body','invalid-session-json','invalid-session-schema','invalid-accounts-schema','session-expired']);
/** Packaged isolated-world fallback. Token never enters a message or returned result. */
export function createIsolatedSessionReader({origin,fetch=globalThis.fetch,now=Date.now,elapsedNow=()=>performance.now(),profile={}}={}){
 let url;try{url=new URL(origin);}catch{throw Error('invalid-session-provider');}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.origin!==origin||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'&&!url.port||loopback&&url.protocol==='http:')||typeof fetch!=='function'||typeof now!=='function'||typeof elapsedNow!=='function')throw Error('invalid-session-provider');
 if(!record(profile)||profile.structures!==undefined&&!record(profile.structures))throw Error('invalid-session-profile');
 const providerProfile=profile.id??'chatgpt-session-v1',structures=new Map(Object.entries(profile.structures??{personal:'personal',team:'organization',enterprise:'organization'}));
 if(!identifier(providerProfile)||[...structures.values()].some(value=>!['personal','organization','unknown'].includes(value)))throw Error('invalid-session-profile');
 async function read(options={}){
  if(!record(options)||Object.keys(options).some(key=>!['signal','timeoutMs'].includes(key)))throw Error('invalid-session-read-options');
  const {signal,timeoutMs=6000}=options;
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>6000||signal!==undefined&&!(signal instanceof AbortSignal))throw Error('invalid-session-read-options');
  const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  let token=null,onAbort,last=elapsedNow();const started=last;
  const check=()=>{const elapsed=elapsedNow();if(!Number.isFinite(started)||!Number.isFinite(elapsed)||elapsed<last||elapsed-started>=timeoutMs)throw Error('request-timeout');last=elapsed;if(combined.aborted)throw Error('session-aborted');};
  const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(Error('session-aborted'));combined.addEventListener('abort',onAbort,{once:true});if(combined.aborted)onAbort();});
  const json=async(path,limit)=>{check();const target=origin+path,response=await fetch(target,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:combined,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})}});check();return readSessionJSON(response,{target,limit,check});};
  try{
   const result=await withRequestDeadline(()=>Promise.race([cancelled,(async()=>{
    check();const session=await json('/api/auth/session',256*1024);check();
    const sessionTime=now();if(!Number.isFinite(sessionTime))throw Error('invalid-session-schema');
    const credentials=sessionCredentials(session,sessionTime),{principalId,expiresAt}=credentials;
    token=credentials.token;credentials.token=null;delete session.accessToken;
    const accounts=await json('/backend-api/accounts/check/v4-2023-04-27',1024*1024);check();
    const contexts=sessionContexts(accounts,structures),time=now();check();
    if(!Number.isFinite(time)||instant(expiresAt)<=time)throw Error('session-expired');
    return {principalId,expiresAt,contexts,providerProfile,transport:'isolated-fixed-fetch'};
   })()]),{timeoutMs,now:elapsedNow});
   check();const returnedAt=now();if(!Number.isFinite(returnedAt)||instant(result.expiresAt)<=returnedAt)throw Error('session-expired');return result;
  }catch(error){const code=error?.message;throw Error(errors.has(code)?code:combined.aborted?'session-aborted':'session-transport-failed');}
  finally{token=null;combined.removeEventListener('abort',onAbort);controller.abort();}
 }
 return Object.freeze({read});
}
