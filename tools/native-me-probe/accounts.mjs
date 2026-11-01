import {readSessionJSON,sessionContexts,sessionContextSchemaIssue} from '../../src/host/session-identity.mjs';
import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
import {summarizeAccountsStructure} from './accounts-structure.mjs';
const target='https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27';
const codes=new Set(['request-timeout','document-changed','invalid-session-response','session-challenged','session-unauthorized','invalid-session-mime','session-response-too-large','missing-session-body','invalid-session-body','invalid-session-json']);
// Separately authorized, single accounts-only diagnostic. Structural mode
// permits fixed categories/counts only; no roster values or credentials leave.
export function createNativeAccountsProbe({fetch=globalThis.fetch,now=()=>performance.now(),signal,isCurrent=()=>true,structural=false}={}){
 if(typeof structural!=='boolean')throw Error('invalid-diagnostic-mode');
 let spent=false,result=null;
 return Object.freeze({peek:()=>result,async run(){
  if(spent)return {state:'already-consumed'};
  spent=true;
  const controller=new AbortController(),combined=signal?AbortSignal.any([controller.signal,signal]):controller.signal;
  const started=now();let last=started,onAbort,reason='transport-failed',structure=null;
  const check=()=>{const time=now();if(!Number.isFinite(time)||!Number.isFinite(started)||time<last||time-started>=6000)throw Error('request-timeout');last=time;if(combined.aborted||!isCurrent())throw Error('document-changed');};
  const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(Error('document-changed'));combined.addEventListener('abort',onAbort,{once:true});if(combined.aborted)onAbort();});
  try{
   await withRequestDeadline(()=>Promise.race([cancelled,(async()=>{
    check();const response=await fetch(target,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:combined});check();
    let body=await readSessionJSON(response,{target,limit:1048576,check});
    try{check();if(structural)structure=summarizeAccountsStructure(body,{check});sessionContexts(body,new Map([['personal','personal'],['workspace','organization']]));check();}finally{body=null;}
    reason='accounts-schema-valid-not-authorized';
   })()]),{timeoutMs:6000,now});check();
  }catch(error){
   // Even a schema rejection may finish after synchronous parsing/comparison
   // crossed the deadline. Expiry or document loss wins over partial metadata.
   try{check();}catch(invalidated){error=invalidated;}
   const issue=sessionContextSchemaIssue(error);reason=issue?'accounts-schema:'+issue:codes.has(error?.message)?error.message:'transport-failed';if(!issue)structure=null;
  }
  finally{combined.removeEventListener('abort',onAbort);controller.abort();}
  result=Object.freeze({state:'finished',reason,...structural?{structure}: {}});return result;
 }});
}
