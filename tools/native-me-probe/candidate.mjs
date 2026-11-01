import {readSessionJSON,sessionContexts,sessionContextSchemaIssue} from '../../src/host/session-identity.mjs';
import {withRequestDeadline} from '../../src/data/request-deadline.mjs';

const me='https://chatgpt.com/backend-api/me';
const accounts='https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27';
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const reasons=new Set(['request-timeout','document-changed','invalid-session-response','session-challenged','session-unauthorized','invalid-session-mime','session-response-too-large','missing-session-body','invalid-session-body','invalid-session-json','invalid-me-schema','invalid-accounts-schema','principal-changed']);

// A candidate observation, deliberately NOT SessionIdentity. No IDs leave RAM;
// neither a same-ID sandwich nor local freshness grants a scope or server expiry.
export function createNativeMeCandidate({fetch=globalThis.fetch,now=()=>performance.now(),signal,isCurrent=()=>true}={}){
 let spent=false,result=null;
 return Object.freeze({peek:()=>result,async run(){
  if(spent)return {state:'already-consumed'};
  spent=true;
  const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const started=now();let last=started,onAbort,firstId=null,contexts=null;
  const summary={state:'finished',stage:'before-me',requests:0,status:null,jsonMime:false,redirected:false,challenge:false,firstIdValid:false,lastIdValid:false,samePrincipal:false,rosterValid:false,contextCount:null,unknownKindCount:null,schemaIssue:null,sourceExpiryKnown:false,localFreshnessMaxMs:60000,identityEnabled:false,reason:'transport-failed'};
  const check=()=>{
   const time=now();if(!Number.isFinite(started)||!Number.isFinite(time)||time<last||time-started>=6000)throw Error('request-timeout');last=time;
   if(combined.aborted||!isCurrent())throw Error('document-changed');
  };
  const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(Error('document-changed'));combined.addEventListener('abort',onAbort,{once:true});if(combined.aborted)onAbort();});
  const read=async(target,limit,stage)=>{
   check();summary.stage=stage;summary.requests++;summary.status=null;summary.jsonMime=false;summary.redirected=false;summary.challenge=false;
   const response=await fetch(target,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:combined});check();
   summary.status=Number.isInteger(response.status)?response.status:null;
   summary.jsonMime=/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'');
   summary.redirected=response.redirected===true;summary.challenge=response.headers.get('cf-mitigated')==='challenge';
   return readSessionJSON(response,{target,limit,check});
  };
  const id=body=>{if(!body||typeof body!=='object'||Array.isArray(body)||!Object.hasOwn(body,'id')||!validId(body.id))throw Error('invalid-me-schema');return body.id;};
  try{
   await withRequestDeadline(()=>Promise.race([cancelled,(async()=>{
    firstId=id(await read(me,262144,'before-me'));check();summary.firstIdValid=true;
    contexts=sessionContexts(await read(accounts,1048576,'accounts'),new Map([['personal','personal'],['workspace','organization']]));check();
    summary.rosterValid=true;summary.contextCount=contexts.length;summary.unknownKindCount=contexts.filter(c=>c.kind==='unknown').length;contexts=null;
    const lastId=id(await read(me,262144,'after-me'));check();summary.lastIdValid=true;
    if(lastId!==firstId)throw Error('principal-changed');
    summary.samePrincipal=true;summary.reason='candidate-consistent-not-authorized';
   })()]),{timeoutMs:6000,now});check();
  }catch(error){summary.samePrincipal=false;summary.reason=reasons.has(error?.message)?error.message:'transport-failed';summary.schemaIssue=sessionContextSchemaIssue(error);}
  finally{firstId=null;contexts=null;combined.removeEventListener('abort',onAbort);controller.abort();}
  // Snapshot prevents a late uncancellable transport mutating the visible result.
  result=Object.freeze({...summary});return result;
 }});
}
