import {readSessionJSON,sessionContexts,sessionContextSchemaIssue} from '../../src/host/session-identity.mjs';
import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
import {stable} from '../../src/data/hash.mjs';
import {summarizeAccountsStructure} from './accounts-structure.mjs';
const me='https://chatgpt.com/backend-api/me',accounts='https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27';
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const reasons=new Set(['request-timeout','document-changed','invalid-session-response','session-challenged','session-unauthorized','rate-limited','invalid-session-mime','session-response-too-large','missing-session-body','invalid-session-body','invalid-session-json','invalid-me-schema','same-id-without-credentials','accounts-limit']);
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
// Discard non-target metadata before either legacy helper compares aliases.
// The resulting schema verdict concerns selected fields, never the complete
// authenticated roster contract (which also compares full default entries).
function selectedAccounts(body){
 const scalar=v=>v===null?null:Array.isArray(v)?[]:typeof v==='object'?{}:v;
 const fields=(v,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(v,k)).map(k=>[k,scalar(v[k])]));
 if(!record(body))return scalar(body);
 if(!Object.hasOwn(body,'accounts'))return {};
 if(!record(body.accounts))return {accounts:scalar(body.accounts)};
 if(Object.keys(body.accounts).length>1000)throw Error('accounts-limit');
 return {accounts:Object.fromEntries(Object.entries(body.accounts).map(([key,v])=>[key,record(v)?{...fields(v,['can_access_with_session']),...(Object.hasOwn(v,'account')?{account:record(v.account)?fields(v.account,['account_id','id','structure','is_deactivated']):scalar(v.account)}:{})}:scalar(v)]))};
}
function comparisonProjection(body){
 if(!record(body)||!record(body.accounts)||Object.keys(body.accounts).length>1000)return null;
 const field=(value,key)=>!record(value)||!Object.hasOwn(value,key)?['missing']:value[key]===null?['null']:typeof value[key]==='object'?['non-scalar']:['value',value[key]];
 return stable(Object.entries(body.accounts).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>[key,field(value,'can_access_with_session'),...['account_id','id','structure','is_deactivated'].map(k=>field(value?.account,k))]));
}
// One authorized diagnostic batch. Credentials modes are transport controls,
// not proof of logout (the first-party service worker may affect fetch).
export function createCredentialControlProbe({fetch=globalThis.fetch,now=()=>performance.now(),signal,isCurrent=()=>true}={}){
 let spent=false,result=null;
 return Object.freeze({peek:()=>result,async run(){
  if(spent)return {state:'already-consumed'};spent=true;
  const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const started=now();let last=started,onAbort,firstId=null,accountsProjection=null;
  const summary={state:'finished',stage:'before-request',requests:0,meInclude:null,meOmit:null,meRelation:'not-compared',accountsInclude:null,accountsOmit:null,accountsRelation:'not-compared',credentialDependence:'not-established',identityEnabled:false,reason:'transport-failed'};
  const check=()=>{const t=now();if(!Number.isFinite(started)||!Number.isFinite(t)||t<last||t-started>=6000)throw Error('request-timeout');last=t;if(combined.aborted||!isCurrent())throw Error('document-changed');};
  const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(Error('document-changed'));combined.addEventListener('abort',onAbort,{once:true});if(combined.aborted)onAbort();});
  async function read(target,credentials,stage,limit){
   check();summary.stage=stage;summary.requests++;
   const response=await fetch(target,{method:'GET',credentials,cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:combined});check();
   const meta={status:Number.isInteger(response.status)?response.status:null,jsonMime:/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''),challenge:response.headers.get('cf-mitigated')==='challenge',redirected:response.redirected===true};
   summary[stage]=meta;
   if(meta.challenge)throw Error('session-challenged');
   if(meta.status===429)throw Error('rate-limited');
   if(meta.redirected||response.url!==target)throw Error('invalid-session-response');
   if(credentials==='omit'&&(meta.status===401||meta.status===403)){
    if(!meta.jsonMime)throw Error('invalid-session-mime');
    // Do not read error-body contents. Cancellation is best effort and cannot
    // delay the overall deadline or authorize an additional request.
    try{Promise.resolve(response.body?.cancel?.()).catch(()=>{});}catch{}
    check();meta.denied=true;return null;
   }
   return readSessionJSON(response,{target,limit,check});
  }
  const id=body=>body&&typeof body==='object'&&!Array.isArray(body)&&Object.hasOwn(body,'id')&&validId(body.id)?body.id:null;
  const summarize=(body,stage)=>{
   check();if(body===null){summary.accountsRelation='not-comparable';return;}
   body=selectedAccounts(body);check();
   const projection=comparisonProjection(body);
   if(stage==='accountsInclude')accountsProjection=projection;else {summary.accountsRelation=accountsProjection===null||projection===null?'not-comparable':accountsProjection===projection?'same':'different';accountsProjection=null;}
   summary[stage].structure=summarizeAccountsStructure(body,{check});
   try{const contexts=sessionContexts(body,new Map([['personal','personal'],['workspace','organization']]));summary[stage].selectedFieldSchemaValid=true;summary[stage].contextCount=contexts.length;summary[stage].unknownKindCount=contexts.filter(c=>c.kind==='unknown').length;}
   catch(error){const issue=sessionContextSchemaIssue(error);if(issue===null)throw Error('invalid-session-json');summary[stage].selectedFieldSchemaValid=false;summary[stage].schemaIssue=issue;}
   check();
  };
  try{
   await withRequestDeadline(()=>Promise.race([cancelled,(async()=>{
    firstId=id(await read(me,'include','meInclude',262144));check();summary.meInclude.idValid=firstId!==null;if(firstId===null)throw Error('invalid-me-schema');
    const without=id(await read(me,'omit','meOmit',262144));check();summary.meOmit.idValid=without!==null;
    summary.meRelation=without===null?'not-comparable':without===firstId?'same':'different';
    if(without===firstId)throw Error('same-id-without-credentials');
    summary.credentialDependence=summary.meOmit.denied?'include-id-omit-denied':'inconclusive';firstId=null;
    summarize(await read(accounts,'include','accountsInclude',1048576),'accountsInclude');
    summarize(await read(accounts,'omit','accountsOmit',1048576),'accountsOmit');
    summary.reason='control-complete-not-authorized';
   })()]),{timeoutMs:6000,now});check();
  }catch(error){summary.reason=reasons.has(error?.message)?error.message:'transport-failed';}
  finally{firstId=null;accountsProjection=null;combined.removeEventListener('abort',onAbort);controller.abort();}
  if(summary.reason==='document-changed'||summary.reason==='request-timeout'){
   summary.meInclude=null;summary.meOmit=null;summary.meRelation='not-compared';summary.accountsInclude=null;summary.accountsOmit=null;summary.accountsRelation='not-compared';summary.credentialDependence='not-established';
  }
  result=freeze(JSON.parse(JSON.stringify(summary)));return result;
 }});
}
