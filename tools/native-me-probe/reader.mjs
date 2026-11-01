import {readSessionJSON} from '../../src/host/session-identity.mjs';
import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
const target='https://chatgpt.com/backend-api/me';
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const codes=new Set(['request-timeout','document-changed','invalid-session-response','session-challenged','session-unauthorized','invalid-session-mime','session-response-too-large','missing-session-body','invalid-session-body','invalid-session-json']);
// Diagnostic only. No principal value escapes this closure, and no grant is made.
export function createNativeMeProbe({fetch=globalThis.fetch,now=()=>performance.now(),signal,isCurrent=()=>true}={}){
 let spent=false,result=null;
 return Object.freeze({peek:()=>result,async run(){
  if(spent)return {state:'already-consumed'};
  spent=true;
  const controller=new AbortController(),combined=signal?AbortSignal.any([controller.signal,signal]):controller.signal;
  const started=now();let last=started,onAbort;
  const summary={state:'finished',status:null,jsonMime:false,redirected:false,challenge:false,idValid:false,reason:'transport-failed'};
  const check=()=>{const time=now();if(!Number.isFinite(time)||!Number.isFinite(started)||time<last||time-started>=6000)throw Error('request-timeout');last=time;if(combined.aborted||!isCurrent())throw Error('document-changed');};
  const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(Error('document-changed'));combined.addEventListener('abort',onAbort,{once:true});if(combined.aborted)onAbort();});
  try{
   await withRequestDeadline(()=>Promise.race([cancelled,(async()=>{
    check();const response=await fetch(target,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:combined});check();
    summary.status=Number.isInteger(response.status)?response.status:null;
    summary.jsonMime=/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'');
    summary.redirected=response.redirected===true;
    summary.challenge=response.headers.get('cf-mitigated')==='challenge';
    let body=await readSessionJSON(response,{target,limit:262144,check});check();
    summary.idValid=!!body&&typeof body==='object'&&!Array.isArray(body)&&Object.hasOwn(body,'id')&&validId(body.id);
    body=null;summary.reason=summary.idValid?'valid-id-structure':'invalid-id-structure';
   })()]),{timeoutMs:6000,now});check();
  }catch(error){summary.idValid=false;summary.reason=codes.has(error?.message)?error.message:'transport-failed';}
  finally{combined.removeEventListener('abort',onAbort);controller.abort();}
  // Copy now: a late transport cannot mutate an already returned result.
  result=Object.freeze({...summary});return result;
 }});
}
