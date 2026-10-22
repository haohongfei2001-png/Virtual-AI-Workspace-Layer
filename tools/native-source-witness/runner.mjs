import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {readSessionJSON,sessionCredentials,sessionContexts,sessionContextSchemaIssue} from '../../src/host/session-identity.mjs';
import {parseConversationDirectoryMetadata,parseArchivedConversationDirectoryMetadata} from '../../src/host/conversation-directory-metadata.mjs';
import {parseProjectSidebarMetadata,parseProjectConversationListMetadata} from '../../src/host/project-metadata.mjs';
import {digest} from '../../src/data/hash.mjs';

export const BATCH='vaiwl-local-source-witness-20261022-v1';
export const SCOPE_PROFILE=Object.freeze({id:'chatgpt-observed-c2-candidate',singlePersonalDefault:false,browserRequestContext:true,conversationRequestContext:'conversation-detail-plural-v1'});
const origin='https://chatgpt.com',structures=new Map([['personal','personal'],['workspace','organization']]);
const codes=new Set(['request-timeout','session-aborted','session-challenged','session-unauthorized','invalid-session-response','invalid-session-mime','session-response-too-large','missing-session-body','invalid-session-body','invalid-session-json','invalid-session-schema','invalid-accounts-schema','session-expired','session-transport-failed','document-changed','context-changed','identity-changed','aggregate-byte-limit','request-limit','concurrent-request','invalid-directory-schema','current-context-unproven','scope-provider-unavailable','host-verification-required','scope-revalidation-failed','scope-identity-changed','binding-unavailable']);
const code=e=>codes.has(e?.message)?e.message:'transport-failed';
const status=(state='NOT_RUN',reason='not-reached')=>({state,reason});
export function emptyReport(reason='not-started'){
 return {schema:BATCH,state:'NOT_RUN',decision:'BLOCKED',reason,requests:0,decodedBytes:0,elapsedMs:0,transport:'worker-fixed-fetch',productionEnabled:false,fullHistory:'NOT_ESTABLISHED',websiteSupport:'NOT_ESTABLISHED',crossDevice:'NOT_RUN',selfActivity:'NOT_RUN',localUnknownIds:'NOT_ESTABLISHED',controlledSampleCoverage:'NOT_ESTABLISHED',productionAdmission:'BLOCKED_PENDING_SOURCE_SEMANTICS_AND_WEBSITE_CONDITIONS',stages:Object.fromEntries(['identity','currentSpace','ordinary','archived','projects','members','finalIdentity'].map(k=>[k,status()])),http:[]};
}
/** Private, development-only composition. No DB, RPC producer, arbitrary URL or token export. */
export async function runWitness({frame,contextObserver,getFrame,fetch=globalThis.fetch,signal,now=Date.now,elapsedNow=()=>performance.now(),startedAt=null,onProgress=()=>{}}){
 const report=emptyReport(),abort=new AbortController(),combined=signal?AbortSignal.any([signal,abort.signal]):abort.signal;
 const start=startedAt??elapsedNow();let last=start,stageDeadline=start,stageAbort=null,inflight=false,finished=false,authority=null,frozen=null,receipt=null,identity=null,activeStage='identity',providerFailure=null;
 const snapshot=()=>JSON.parse(JSON.stringify(report));
 const timeCheck=()=>{const time=elapsedNow();if(!Number.isFinite(time)||time<last||time-start>=30000||time>=stageDeadline)throw Error('request-timeout');last=time;if(finished||combined.aborted||stageAbort?.signal.aborted)throw Error('session-aborted');return time;};
 const check=()=>{timeCheck();if(receipt&&!contextObserver.isCurrent(frame,receipt))throw Error('context-changed');if(frozen){const current=authority.peek(frame);if(current.state!=='verified'||current.grant.id!==frozen.id||current.grant.scopeEpoch!==frozen.epoch||authority.sourceFor(frame)!==frozen.source)throw Error('context-changed');}};
 const guard=async()=>{check();const actual=await getFrame();check();if(actual?.documentId!==frame.documentId||actual?.tabId!==frame.tabId||actual?.actualURL!==frame.actualURL||actual?.incognito!==false||actual?.documentLifecycle!=='active')throw Error('document-changed');};
 const boundedFetch=async(target,options)=>{
  await guard();if(options?.method!=='GET'||options.redirect!=='error'||options.cache!=='no-store'||options.credentials!=='include'||!target.startsWith(origin+'/'))throw Error('binding-unavailable');
  if(report.requests>=12)throw Error('request-limit');if(inflight)throw Error('concurrent-request');
  inflight=true;report.requests++;let released=false;
  const release=()=>{if(!released){released=true;inflight=false;}};
  try{
   const response=await fetch(target,{...options,signal:AbortSignal.any([combined,stageAbort.signal,...(options.signal?[options.signal]:[])])});
   check();await guard();
   report.http.push({stage:activeStage,status:Number.isInteger(response.status)?response.status:0,jsonMime:/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type')??''),challenge:response.headers?.get('cf-mitigated')==='challenge'});
   // Count decoded stream bytes for every authentication and directory response.
   // No body clone, HAR or credential/header logging. readSessionJSON owns cancellation.
   return {url:response.url,status:response.status,redirected:response.redirected,headers:response.headers,get body(){const body=response.body;return body?.getReader?{getReader(){const reader=body.getReader();return {async read(){check();const value=await reader.read();check();if(value.value instanceof Uint8Array){report.decodedBytes+=value.value.byteLength;if(report.decodedBytes>4*1024*1024)throw Error('aggregate-byte-limit');}if(value.done)release();return value;},async cancel(){release();await reader.cancel();},releaseLock(){release();reader.releaseLock();}};}}:null;}};
  }catch(e){release();throw e;}
 };
 const stage=async(name,work)=>{
  // The initial C2 frame/body preparation shares this same identity deadline.
  activeStage=name;stageDeadline=Math.min(start+30000,name==='identity'?start+6000:elapsedNow()+6000);stageAbort=new AbortController();
  let timer,stop;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{stageAbort.abort();reject(Error('request-timeout'));},Math.max(0,stageDeadline-elapsedNow()));stop=()=>reject(Error('session-aborted'));combined.addEventListener('abort',stop,{once:true});});
  try{check();return await Promise.race([work(),deadline]);}finally{clearTimeout(timer);combined.removeEventListener('abort',stop);stageAbort.abort();}
 };
 const provider=createSessionProvider({fetch:boundedFetch,now,elapsedNow,profile:{structures:{personal:'personal',workspace:'organization'}}});
 const trackedProvider={async read(options){try{const value=await provider.read(options);check();identity=value;report.stages.identity={state:'PASS',reason:'canonical-roster-parsed',contexts:value.contexts.length};return value;}catch(e){providerFailure=code(e);throw e;}}};
 const observer={isCurrent:contextObserver.isCurrent,async verify(f,options){const value=await contextObserver.verify(f,options);check();if(receipt&&value!==receipt)throw Error('context-changed');if(value)receipt=value;return value;}};
 authority=createScopeAuthority({provider:trackedProvider,profile:SCOPE_PROFILE,contextObserver:observer,now,elapsedNow});
 const json=async(path,token,{raw=false,contextId=null}={})=>{
  const target=origin+path,r=await boundedFetch(target,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(contextId?{'ChatGPT-Account-ID':contextId}:{})}});
  const value=await readSessionJSON(r,{target,limit:path==='/api/auth/session'?262144:1048576,raw,check});await guard();return value;
 };
 const pageSummary=(parsed,baseline=new Set())=>({state:parsed.state==='candidate'?'PASS':'PARTIAL',reason:parsed.state==='candidate'?'candidate-page-only':'parser-gaps',candidates:parsed.candidates.length,newRelativeToFirstPage:parsed.candidates.filter(c=>!baseline.has(c.nativeId)).length,gaps:parsed.gaps.map(g=>g.reason),terminalObserved:parsed.page.terminalObserved,termination:parsed.page.termination??(parsed.page.terminalObserved?'cursor-null':'unknown'),continuationPresent:parsed.page.nextOffset!=null||parsed.page.nextCursor!=null,...(parsed.page.fields?{fields:Object.fromEntries(Object.entries(parsed.page.fields).map(([k,v])=>[k,v.state]))}:{})});
 const directoryResult=pages=>({state:pages.every(p=>p.state==='PASS')?'PASS':'PARTIAL',reason:'readability-only-not-full-inventory',pages});
 const parse=(fn,input)=>{try{return fn(input);}catch{throw Error('invalid-directory-schema');}};
 try{
  const first=await stage('identity',()=>authority.refresh(frame,'focus',combined));
  if(first.state!=='verified')throw Error(providerFailure??(first.state==='ambiguous'?'current-context-unproven':first.reason));
  report.stages.currentSpace=status('PASS','browser-request-and-current-body-and-roster');
  frozen={id:first.grant.id,epoch:first.grant.scopeEpoch,source:authority.sourceFor(frame)};
  const firstPrincipal=identity.principalId,contextId=receipt.contextId;
  await stage('ordinary',async()=>{
   // Separate closure: never reuse the first provider's token.
   let credentials=sessionCredentials(await json('/api/auth/session'),now()),token=credentials.token;credentials.token=null;
   try{
    if(credentials.principalId!==firstPrincipal)throw Error('identity-changed');
    const contexts=sessionContexts(await json('/backend-api/accounts/check/v4-2023-04-27',token),structures);
    const selected=contexts.find(c=>c.id===contextId&&c.kind!=='unknown');
    if(!selected||'context_'+digest(['chatgpt-context-v1',credentials.principalId,contextId])!==first.grant.context.contextKey)throw Error('identity-changed');
    const read=async(path)=>{if(Date.parse(credentials.expiresAt)<=now())throw Error('session-expired');const result=await json(path,token,{raw:true,contextId});if(Date.parse(credentials.expiresAt)<=now())throw Error('session-expired');return result;};
    let request={offset:0,limit:100,cursor:null,sort:'unspecified',starred:'unspecified'};
    let parsed=parse(parseConversationDirectoryMetadata,{payload:await read('/backend-api/conversations?offset=0&limit=100'),request,pageOrdinal:0,priorPage:null,stopReason:null});
    const ordinary=[pageSummary(parsed)],baseline=new Set(parsed.candidates.map(c=>c.nativeId));
    report.stages.ordinary=directoryResult(ordinary);
    if(parsed.state==='candidate'&&parsed.gaps.length===0&&parsed.page.nextOffset!==null){
     request={...request,offset:parsed.page.nextOffset};
     parsed=parse(parseConversationDirectoryMetadata,{payload:await read('/backend-api/conversations?offset='+request.offset+'&limit=100'),request,pageOrdinal:1,priorPage:parsed.summary,stopReason:null});ordinary.push(pageSummary(parsed,baseline));report.stages.ordinary=directoryResult(ordinary);
    }
    activeStage='archived';
    const archived=parse(parseArchivedConversationDirectoryMetadata,{payload:await read('/backend-api/conversations?offset=0&limit=100&is_archived=true&order=updated'),request:{offset:0,limit:100,cursor:null,sort:'updated',starred:'unspecified'},pageOrdinal:0,priorPage:null,stopReason:null});
    report.stages.archived=directoryResult([pageSummary(archived)]);
    activeStage='projects';
    const projects=parse(parseProjectSidebarMetadata,{payload:await read('/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0'),previousCursor:null});
    report.stages.projects=directoryResult([pageSummary(projects)]);
    // One Project from this batch's index only. No local/old database or name lookup.
    const project=projects.candidates.find(c=>c.entity==='project');
    activeStage='members';
    if(projects.state==='candidate'&&projects.gaps.length===0&&project){
     let cursor=0;const pages=[],seen=new Set();
     for(let i=0;i<2;i++){
      const members=parse(parseProjectConversationListMetadata,{payload:await read('/backend-api/gizmos/'+encodeURIComponent(project.nativeId)+'/conversations?cursor='+encodeURIComponent(cursor)+'&limit=50'),projectId:project.nativeId,previousCursor:cursor});
      const page=pageSummary(members,seen);if(i&&members.candidates.some(c=>seen.has(c.nativeId))){page.state='PARTIAL';page.reason='overlapping-page';page.gaps.push('overlapping-page');}
      pages.push(page);report.stages.members=directoryResult(pages);members.candidates.forEach(c=>seen.add(c.nativeId));
      if(page.state!=='PASS'||members.page.nextCursor===null)break;cursor=members.page.nextCursor;
     }
    }else report.stages.members=status('NOT_RUN','no-gap-free-project-candidate');
   }finally{token=null;credentials=null;}
  });
  await stage('finalIdentity',async()=>{const final=await authority.revalidate(frame,combined,{force:true});if(final.state!=='verified')throw Error(providerFailure??final.reason);await guard();});
  report.stages.finalIdentity=status('PASS','fresh-principal-and-context-equal');
  report.state='PARTIAL';const readable=['ordinary','archived','projects','members'].some(k=>report.stages[k].pages?.some(p=>p.state==='PASS'&&p.candidates>0));report.decision=readable?'CONDITIONAL GO':'BLOCKED';report.reason=readable?'bounded-source-sample-only':'no-usable-directory-candidate';
 }catch(e){
  report.state='BLOCKED';report.decision='BLOCKED';report.reason=code(e);
  if(report.reason==='current-context-unproven')activeStage='currentSpace';
  report.stages[activeStage]={...report.stages[activeStage],state:'BLOCKED',reason:report.reason};
  const schema=sessionContextSchemaIssue(e);if(schema)report.schemaIssue=schema;
 }finally{
  finished=true;abort.abort();authority.invalidateAll();identity=null;receipt=null;frozen=null;
  // Report observed duration, including delayed abort delivery; never clamp a
  // slow timer to the budget and thereby manufacture a timing pass.
  report.elapsedMs=Math.max(0,Math.round(elapsedNow()-start));
 }
 // Late transports cannot mutate the returned, persistable anonymous report.
 const result=snapshot();onProgress(result);return result;
}
