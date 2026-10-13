import {FREE_HORIZONS} from '../data/free-time-policy.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {createReadRecoveryBudget} from '../data/read-recovery-budget.mjs';
import {normalizedScope} from '../b1/identity.mjs';
import {instant} from '../navigation/projection.mjs';
import {loadFreeHeader} from '../data/free-header-loader.mjs';
import {loadFreePages} from '../data/free-page-loader.mjs';
import {planFreeReplica,freeReplicaRequests,assembleFreeReplicaAsync} from '../data/free-replica.mjs';
import {freeNavigationSnapshot,rebindPreparedFreeSnapshot} from '../navigation/free-view.mjs';
import {currentIndexAsync} from '../navigation/current-index.mjs';
/** Privileged local owner only. Never serialize this complete replica into UI frames. */
export function createFreeViewOwner({readService,scope,guard=()=>true,clock=()=>new Date().toISOString(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,elapsedNow=()=>performance.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){
 const normalized=normalizedScope(scope);if(!normalized||!['freeHeader','freePage','version'].every(k=>typeof readService?.[k]==='function')||typeof guard!=='function')throw Error('invalid-free-view-owner');
 const bound=Object.freeze({...normalized});let generation=0,stopped=false,pending=null,replica=null,published=null,session=null,cachedIndex=null;
 const allowed=()=>!stopped&&guard()===true;
 function invalidate(){generation++;pending?.abort.abort(Error('stale-free-view'));pending=null;replica=null;published=null;session=null;cachedIndex=null;}
 function current(){if(!allowed()){invalidate();return null;}return published;}
 function reconfigureSession(value){
  if(!allowed()){invalidate();throw Error('stale-free-view');}
  if(!published||!session)throw Error('free-view-session-unavailable');
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==2||!Object.hasOwn(value,'H')||!Object.hasOwn(value,'policyRevision')||!FREE_HORIZONS.includes(value.H)||!Number.isSafeInteger(value.policyRevision)||value.policyRevision<session.policyRevision||value.policyRevision===session.policyRevision&&value.H!==session.H)throw Error('invalid-free-session-reconfiguration');
  if(value.H===session.H&&value.policyRevision===session.policyRevision)return session;
  const next=Object.freeze({...session,H:value.H,policyRevision:value.policyRevision});
  generation++;pending?.abort.abort(Error('stale-free-view'));pending=null;
  cachedIndex=published.index;published=null;session=next;return next;
 }
 function refresh(query={}){
  if(!query||Object.getPrototypeOf(query)!==Object.prototype||Reflect.ownKeys(query).some(k=>!['now','timeZone','pageSize'].includes(k)))return Promise.reject(Error('invalid-free-view-query'));
  const at=query.now??clock(),zone=query.timeZone??timeZone,size=query.pageSize??5000;
  if(typeof at!=='string'||instant(at)===null||!Number.isInteger(size)||size<1||size>5000||typeof zone!=='string'||zone.length>80)return Promise.reject(Error('invalid-free-view-query'));
  try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{return Promise.reject(Error('invalid-free-view-query'));}
  if(!allowed()){invalidate();return Promise.reject(Error('stale-free-view'));}
  const key=JSON.stringify([query.now??null,zone,size]);if(pending)return pending.key===key?pending.promise:Promise.reject(Error('free-view-refresh-in-progress'));
  const ticket=generation,abort=new AbortController(),entry={key,abort,promise:null};pending=entry;
  const valid=()=>ticket===generation&&!abort.signal.aborted&&allowed();
  const budget=createReadRecoveryBudget({now:elapsedNow,schedule,cancel,onExpire:()=>abort.abort(Error('read-budget-exhausted'))});
  const check=()=>{budget.check();if(!valid())throw Error('stale-free-view');};
  const options={guard:valid,signal:abort.signal};
  let onAbort;const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(abort.signal.reason instanceof Error?abort.signal.reason:Error('stale-free-view'));abort.signal.addEventListener('abort',onAbort,{once:true});});
  const request=async work=>{check();try{const result=await withRequestDeadline(()=>Promise.race([work(),cancelled]),{now:elapsedNow,schedule,cancel});check();return result;}catch(error){if(abort.signal.aborted||['request-timeout','read-budget-exhausted','stale-free-view'].includes(error?.message))abort.abort(error);throw error;}};
  budget.begin();
  entry.promise=Promise.race([cancelled,(async()=>{
   const reply=await loadFreeHeader({scope:()=>bound.key,guard:valid,load:async()=>({ok:true,header:await request(()=>readService.freeHeader(bound,options,at,zone,session,undefined,true))})});
   const header=reply.header,plan=planFreeReplica(replica,header);
   const pages=await loadFreePages({requests:freeReplicaRequests(plan,size),guard:valid,load:async ids=>{
    try{const page=await request(()=>readService.freePage(bound,{revision:header.revision,offset:0,limit:size,ids,viewSession:header.viewSession,now:at},options));if(page.scope!==bound.key)throw Error('stale-free-view');return {ok:true,page};}catch(error){return {ok:false,reason:error.message};}
   }});
   check();let candidate=replica,snapshot,index=published?.index??cachedIndex;
   if(!plan.full&&!plan.rebuild&&!plan.projects.length&&!plan.refs.length&&replica){
    try{snapshot=rebindPreparedFreeSnapshot(published.snapshot,replica.snapshot,header);}catch{snapshot=freeNavigationSnapshot({...replica.snapshot,...header,viewMode:'free'});}
   }else{
    candidate=await assembleFreeReplicaAsync(replica,header,pages,plan,valid);snapshot=freeNavigationSnapshot(candidate.snapshot);
    index=(!plan.full&&index?await index.rebindCompatibleAsync(snapshot,snapshot.groups,valid):null)??await currentIndexAsync(snapshot,snapshot.groups,valid,!plan.full?index:null);
   }
   check();const version=await request(()=>readService.version(bound,options));check();
   if(snapshot.scope!==bound.key||version.nativeRevision!==header.revision||version.revision!==header.workspaceRevision||version.evidenceRevision!==header.evidenceRevision||version.viewRevision!==header.viewRevision)throw Error('snapshot-revision-changed');
   replica=candidate;session=header.viewSession;cachedIndex=index;published=Object.freeze({snapshot,index});return published;
  })()]).catch(error=>{if(ticket===generation&&!allowed())invalidate();throw error;}).finally(()=>{budget.complete();abort.signal.removeEventListener('abort',onAbort);abort.abort();if(pending===entry)pending=null;});
  return entry.promise;
 }
 return Object.freeze({refresh,current,reconfigureSession,invalidate,stop(){stopped=true;invalidate();}});
}
