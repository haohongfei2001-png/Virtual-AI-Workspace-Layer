import {normalizedScope,tokenOK} from '../b1/identity.mjs';
import {emptyNativeFacts,applyNativeObservations} from '../data/native-facts.mjs';
import {emptyFreeEvidence,applyFreeEvidence} from '../data/free-evidence.mjs';
import {emptyState,reduceCommand} from '../data/state.mjs';
import {digest} from '../data/hash.mjs';
/** Volatile storage adapter for the existing observation/read/projection owners.
 * Uses the production reducers and CAS; no IDB, seed data or identity fallback.
 * Persistent personal storage remains a separate, explicitly unlocked concern. */
export function createBrowserLocalMemory({clock=()=>new Date().toISOString()}={}){
 const spaces=new Map();let nativeGate=()=>null,activityGate=()=>null;
 const check=options=>{if(options?.signal?.aborted||options?.guard&&options.guard()!==true)throw Error('stale-binding');};
 function scopeOrThrow(scope){const s=normalizedScope(scope);if(s?.kind!=='browser-local'||s.storage!=='session')throw Error('not-a-local-session');return s;}
 function entry(scope,options){check(options);const s=scopeOrThrow(scope);let e=spaces.get(s.key);if(!e){if(spaces.size>=32)throw Error('local-session-capacity');e={native:emptyNativeFacts(s),evidence:emptyFreeEvidence(s),state:emptyState(s),operations:new Map()};spaces.set(s.key,e);}return e;}
 const copy=structuredClone;
 function cas(scope,request,options,table,reduce){
  if(!tokenOK(request?.operationId))throw Error('invalid-local-operation');
  const e=entry(scope,options),fingerprint=digest([table,request]);
  const prior=e.operations.get(request.operationId);
  if(prior)return prior.fingerprint===fingerprint?{ok:true,replayed:true,revision:prior.revision}:{ok:false,reason:'operation-conflict'};
  if(request.expectedRevision!==e[table].revision)return {ok:false,reason:'revision-conflict'};
  if(e.operations.size>=4096)throw Error('local-operation-capacity');
  const next=reduce(e[table]);
  if(['projects','refs','hints'].some(k=>Object.keys(next[k]??{}).length>2000))throw Error('local-object-capacity');
  check(options);e[table]=next;e.operations.set(request.operationId,{fingerprint,revision:next.revision});return {ok:true,revision:next.revision};
 }
 const base={scopeOrThrow,open(){throw Error('local-session-has-no-database');},close(){spaces.clear();},
  async get(scope,id){const row=entry(scope).native.refs[id];return row?{conversationId:id,nativeUrl:row.nativeUrl,projectId:null}:null;},
  async list(scope){return Object.values(entry(scope).native.refs).map(row=>({conversationId:row.id,nativeUrl:row.nativeUrl,projectId:null}));},
  async upsert(){throw Error('local-reference-write-unavailable');}};
 const native={
  async read(scope,options){return copy(entry(scope,options).native);},
  async version(scope,options){return entry(scope,options).native.revision;},
  async header(scope,options){const f=entry(scope,options).native;return {revision:f.revision,manifest:{sources:copy(f.sources),projects:Object.fromEntries(Object.keys(f.projects).map(id=>[id,f.revision])),refs:Object.fromEntries(Object.keys(f.refs).map(id=>[id,f.revision]))}};},
  async page(scope,{revision=null,ids=null,offset=0,limit=500}={},options){
   const f=entry(scope,options).native;if(revision!==null&&revision!==f.revision)throw Error('snapshot-revision-changed');
   if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>5000)throw Error('invalid-native-page');
   const projects=Object.keys(f.projects),refs=Object.keys(f.refs),selectedProjects=ids?.projects??projects.slice(offset,offset+limit),selectedRefs=ids?.refs??refs.slice(Math.max(0,offset-projects.length),Math.max(0,offset+limit-projects.length));
   const facts={...emptyNativeFacts(scope),format:f.format,revision:f.revision,sources:copy(f.sources)};
   for(const id of selectedRefs){if(f.refs[id])facts.refs[id]=copy(f.refs[id]);if(f.membership[id])facts.membership[id]=copy(f.membership[id]);}
   for(const id of new Set([...selectedProjects,...Object.values(facts.membership).filter(r=>r.state==='PROJECT').map(r=>r.projectId)]))if(f.projects[id])facts.projects[id]=copy(f.projects[id]);
   const total=projects.length+refs.length;return {revision:f.revision,offset,total,nextOffset:Math.min(total,offset+limit),facts,selectedProjects,selectedRefs};
  },
  async apply(scope,request,options){const gate=nativeGate(scope,request);if(gate?.channel!=='host-dom'||gate.guard()!==true||Object.hasOwn(request,'continuation'))throw Error('untrusted-local-observation');
   return cas(scope,request,{...options,guard:()=>gate.guard()&&(options?.guard?.()??true)},'native',current=>applyNativeObservations(current,request.batch,{scope,...gate,now:clock()}));}
 };
 const evidence={
  async read(scope,options){return copy(entry(scope,options).evidence);},
  async header(scope,options){return copy(entry(scope,options).evidence);},
  async version(scope,options){return entry(scope,options).evidence.revision;},
  async page(scope,_query,options){const evidence=copy(entry(scope,options).evidence);return {evidence,revision:evidence.revision};},
  async apply(scope,request,options){const gate=activityGate(scope,request);if(gate?.channel!=='host-evidence'||gate.purpose!=='local-use'||gate.guard()!==true)throw Error('untrusted-local-activity');
   if(request.batch.events.length||request.batch.coverage.length||request.batch.sources.some(r=>r.id!==gate.sourceId||r.generation!==gate.generation||r.channel!=='host-evidence'||r.codecVersion!==3||r.profileId!==gate.profileId||r.profileVersion!==gate.profileVersion)||request.batch.hints.some(r=>r.sourceId!==gate.sourceId||r.generation!==gate.generation||r.hintType!=='local-recent-use'))throw Error('local-activity-source-mismatch');
   return cas(scope,request,{...options,guard:()=>gate.guard()&&(options?.guard?.()??true)},'evidence',current=>applyFreeEvidence(current,{type:'OBSERVE_FREE_EVIDENCE',batch:request.batch},{scope,now:clock(),channel:'host-evidence'}));}
 };
 const workspaces={base,
  partitioned:{async storageInfo(){return null;},async partialContext(){return null;}},
  async partitionHeader(){return null;},async partitionVersion(){return null;},
  async read(scope,options){return {state:copy(entry(scope,options).state),view:null,diagnostics:{view:null}};},
  async command(scope,request,options){if(request.command?.type!=='SET_PREFERENCE')throw Error('local-command-unavailable');return cas(scope,request,options,'state',state=>reduceCommand(state,request.command));}
 };
 return Object.freeze({base,native,evidence,workspaces,discard:key=>spaces.delete(key),
  setGates({native:ng,activity:ag}){nativeGate=ng;activityGate=ag;},stop(){spaces.clear();}});
}
