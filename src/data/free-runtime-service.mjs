import {normalizedScope,tokenOK} from '../b1/identity.mjs';
import {instant} from '../navigation/projection.mjs';
import {FreeRuntime} from './free-runtime.mjs';
const kinds=new Set(['foreground','current','send','source','expiry','history']);
/** Service-owner registry. Never accept scope, sourceFor, guard or binding lifetime from a page payload. */
export class FreeRuntimeService {
 constructor({nativeRepository,evidenceRepository,referenceRepository=null,sourceFor=null,clock=()=>new Date().toISOString(),timeZone='UTC',onSnapshot=()=>{},onChange=()=>{},publication='snapshot',onStatus=()=>{},timers={setTimeout:(...args)=>globalThis.setTimeout(...args),clearTimeout:id=>globalThis.clearTimeout(id)},calibrationOptions={},maxBindings=128}){
  if(sourceFor!==null&&typeof sourceFor!=='function')throw Error('invalid-free-source-factory');
  if(referenceRepository!==null&&(typeof referenceRepository.reconcileKnownReferences!=='function'||typeof referenceRepository.migratePartitioned!=='function'))throw Error('invalid-reference-repository');
  if(!Number.isSafeInteger(maxBindings)||maxBindings<1||maxBindings>1024)throw Error('invalid-free-binding-capacity');
  Object.assign(this,{nativeRepository,evidenceRepository,referenceRepository,sourceFor,clock,timeZone,onSnapshot,onChange,publication,onStatus,timers,calibrationOptions,maxBindings});this.bindings=new Map();
 }
 active(entry){try{return this.bindings.get(entry.id)===entry&&!entry.controller.signal.aborted&&entry.guard()===true;}catch{return false;}}
 async authority(entry){
  let verified=false;try{verified=this.active(entry)&&(await entry.authorityCheck())===true;}catch{}
  if(!verified||!this.active(entry)){if(this.bindings.get(entry.id)===entry)this.stop(entry.id,'stale-authority');return false;}return true;
 }
 get(id){const entry=this.bindings.get(id);if(!entry)return null;if(!this.active(entry)){this.stop(id,'stale-binding');return null;}return entry;}
 status(entry,value){if(this.active(entry)){const result={...value,bindingId:entry.id,scope:entry.scope.key};this.onStatus(result);return result;}return {status:'cancelled',reason:'stale-binding'};}
 wrap(repository,entry){
  const wrapped={};
  for(const name of ['read','snapshot','header','version','apply','invalidate'])if(typeof repository?.[name]==='function')wrapped[name]=async(scope,...args)=>{
   if(normalizedScope(scope)?.key!==entry.scope.key||!(await this.authority(entry)))throw Error('stale-binding');
   const optionIndex=['read','snapshot','header','version'].includes(name)?0:1,options=args[optionIndex]??{};
   const signal=options.signal?AbortSignal.any([entry.controller.signal,options.signal]):entry.controller.signal;
   args[optionIndex]={...options,signal,guard:()=>this.active(entry)&&(options.guard?.()??true)===true};
   const value=await repository[name](entry.scope,...args);
   if(signal.aborted||!(await this.authority(entry)))throw Error('stale-binding');return value;
  };
  return wrapped;
 }
 bind({bindingId,scope,guard,signal,session=null,authorityCheck=async()=>true}){
  if(!tokenOK(bindingId)||typeof guard!=='function'||typeof authorityCheck!=='function')throw Error('invalid-free-runtime-binding');
  const normalized=normalizedScope(scope);if(!normalized||signal?.aborted||guard()!==true)throw Error('unverified-free-runtime-binding');
  // Rebinding a document, including the same account, ends every old lifetime.
  if(this.bindings.has(bindingId))this.stop(bindingId,'binding-replaced');
  if(this.bindings.size>=this.maxBindings)throw Error('free-runtime-binding-capacity');
  const entry={id:bindingId,scope:normalized,guard,authorityCheck,controller:new AbortController(),session,runtime:null,timer:null,expiry:null,source:null,deadlines:new Set()};
  this.bindings.set(bindingId,entry);
  entry.externalSignal=signal;entry.externalAbort=()=>this.stop(bindingId,'binding-aborted');signal?.addEventListener('abort',entry.externalAbort,{once:true});
  try{
   const source=this.sourceFor?.({scope:normalized,bindingId})??null;
   if(source!==null&&(source.channel!=='synthetic'||typeof source.read!=='function'))throw Error('untrusted-free-runtime-source');
   entry.source=source;
   if(source){
    const protectedSource={channel:source.channel,read:async request=>{
     if(request.scope.key!==entry.scope.key||!(await this.authority(entry)))throw Error('stale-binding');
     const value=await source.read({...request,signal:AbortSignal.any([entry.controller.signal,request.signal])});
     if(request.signal.aborted||!(await this.authority(entry)))throw Error('stale-binding');return value;
    }};
    entry.runtime=new FreeRuntime({nativeRepository:this.wrap(this.nativeRepository,entry),evidenceRepository:this.wrap(this.evidenceRepository,entry),source:protectedSource,clock:this.clock,timeZone:this.timeZone,calibrationOptions:this.calibrationOptions,publication:this.publication,
     onChange:value=>{if(!this.active(entry))return;this.observeDeadlines(entry.id,value.deadlines);this.onChange({bindingId:entry.id,...value});},
     onSnapshot:(snapshot,details)=>{if(!this.active(entry))return;this.onSnapshot({bindingId:entry.id,scope:entry.scope.key,snapshot,...details});if(snapshot)this.observeExpiry(entry,snapshot);},
     onStatus:value=>this.status(entry,value)});
   }
   return {bindingId,scope:normalized.key,supported:!!source};
  }catch(error){this.stop(bindingId,'binding-failed');throw error;}
 }
 async foreground(bindingId,{session=null,objectIds=['inventory'],readCached=true}={}){
  if(typeof readCached!=='boolean')throw Error('invalid-free-cache-read-option');
  const entry=this.get(bindingId);if(!entry)return {snapshot:null,calibration:Promise.resolve({status:'cancelled',reason:'stale-binding'})};
  // Local identity reconciliation does not need an upstream activity source.
  // Rendering does not await the whole scan; each bounded transaction still
  // shares IndexedDB scheduling with foreground reads.
  this.reconcileReferences(bindingId);
  if(!entry.runtime){const status=this.status(entry,{status:'unsupported',reason:'no-authorized-source',requests:0});return {snapshot:null,calibration:Promise.resolve(status)};}
  try{
   // The broker's header/page path already renders the cached view. It may start
   // bounded calibration without awaiting a second full native/evidence read.
   if(!readCached){
    entry.runtime.setScope(entry.scope);
    entry.session=session??entry.session;
    if(entry.session)entry.runtime.session=entry.session;
    // A refresh notification only rereads durable pages. Start this foreground
    // cycle once per binding; explicit send/source/expiry/history triggers remain
    // available, and a renewed lease starts a new bounded foreground cycle.
    const calibration=entry.foregroundCalibration??=entry.runtime.trigger('scope',{objectIds});
    return {snapshot:null,calibration:calibration.then(value=>this.active(entry)?value:{status:'cancelled',reason:'stale-binding'})};
   }
   const result=await entry.runtime.enter(entry.scope,{session:session??entry.session,objectIds});
   if(!this.active(entry))return {snapshot:null,calibration:Promise.resolve({status:'cancelled',reason:'stale-binding'})};
   entry.session=result.snapshot?.viewSession??entry.session;
   return {snapshot:result.snapshot,calibration:result.calibration.then(value=>this.active(entry)?value:{status:'cancelled',reason:'stale-binding'})};
  }catch(error){if(!this.active(entry))return {snapshot:null,calibration:Promise.resolve({status:'cancelled',reason:'stale-binding'})};throw error;}
 }
 scopeEntries(scopeKey){
  return [...this.bindings.values()].filter(entry=>entry.scope.key===scopeKey&&this.active(entry));
 }
 scopeForegroundBusy(entry){return this.scopeEntries(entry.scope.key).some(peer=>peer.foregroundRequests>0);}
 scopeReferenceDeadline(entry){return Math.max(0,...this.scopeEntries(entry.scope.key).map(peer=>peer.referencesNotBefore??0));}
 resumeScopeReferences(scopeKey){
  const peers=this.scopeEntries(scopeKey);
  if(peers.some(peer=>peer.foregroundRequests>0))return;
  for(const peer of peers){
   peer.referencesNotBefore=Date.now()+1000;
   if(peer.referencesDirty||!peer.referenceFinished)this.scheduleReferenceResume(peer);
  }
 }
 beginForeground(bindingId){
  const entry=this.get(bindingId);if(!entry||!this.referenceRepository)return ()=>{};
  entry.foregroundRequests=(entry.foregroundRequests??0)+1;
  this.prioritizeForeground(bindingId);
  let released=false;
  return ()=>{
   if(released)return;released=true;
   // Resolve revocation while the hold is still visible to stop(), so peers
   // receive their quiet-resume deadline even when the guard just expired.
   if(this.get(bindingId)!==entry)return;
   entry.foregroundRequests--;
   this.resumeScopeReferences(entry.scope.key);
  };
 }
 prioritizeForeground(bindingId){
  const entry=this.get(bindingId);if(!entry||!this.referenceRepository)return;
  // All tabs of this scope share the owner database. A background repair in
  // another binding must yield as well, without revoking that binding or writes.
  for(const peer of this.scopeEntries(entry.scope.key)){
   peer.referencesNotBefore=Date.now()+1000;
   if(peer.referenceFinished&&peer.referenceFinished.status!=='paused'&&!peer.referencesDirty&&!peer.referenceTask)continue;
   peer.referenceController?.abort();
   peer.referencesDirty=true;
   this.scheduleReferenceResume(peer);
  }
 }
 scheduleReferenceResume(entry){
  if(entry.referenceTimer!==undefined)this.timers.clearTimeout(entry.referenceTimer);
  entry.referenceTimer=undefined;
  if(this.scopeForegroundBusy(entry))return;
  entry.referenceTimer=this.timers.setTimeout(()=>{
   entry.referenceTimer=undefined;if(this.active(entry))this.reconcileReferences(entry.id);
  },Math.max(1,this.scopeReferenceDeadline(entry)-Date.now()));
 }
 reconcileReferences(bindingId,{restart=false}={}){
  const entry=this.get(bindingId);if(!entry||!this.referenceRepository)return Promise.resolve({status:'unsupported'});
  if(restart)entry.referencesDirty=true;
  if(entry.referenceTask)return entry.referenceTask;
  if(this.scopeForegroundBusy(entry)||Date.now()<this.scopeReferenceDeadline(entry)){
   if(!entry.referenceFinished||entry.referencesDirty)this.scheduleReferenceResume(entry);
   return Promise.resolve({status:'deferred'});
  }
  if(entry.referenceFinished&&!entry.referencesDirty)return Promise.resolve(entry.referenceFinished);
  entry.referencesDirty=false;
  const controller=new AbortController();entry.referenceController=controller;
  const signal=AbortSignal.any([entry.controller.signal,controller.signal]);
  const paused=()=>signal.aborted;
  const cancelled=()=>({status:this.active(entry)?'paused':'cancelled',reason:this.active(entry)?'foreground-priority':'stale-binding'});
  const task=(async()=>{
   const began=Date.now();let migrated=false;
   for(let batch=0;batch<32;batch++){
    if(paused()||!(await this.authority(entry)))return cancelled();
    const options={limit:5000,guard:()=>this.active(entry)&&!paused(),signal};
    let result=await this.referenceRepository.reconcileKnownReferences(entry.scope,options);
    if(paused()||!(await this.authority(entry)))return cancelled();
    if(!result.ok&&result.reason==='invalid-state-table'&&!migrated){
     // A valid legacy root can reach its 20k ceiling during repair. Reuse the
     // existing checked migration once; corruption/capacity errors stay visible.
     const migration=await this.referenceRepository.migratePartitioned(entry.scope,options);migrated=true;
     if(paused()||!(await this.authority(entry)))return cancelled();
     if(!migration.ok)return this.status(entry,{status:'degraded',reason:migration.reason,task:'known-references'});
     result=await this.referenceRepository.reconcileKnownReferences(entry.scope,options);
    }
    if(paused()||!(await this.authority(entry)))return cancelled();
    if(!result.ok)return this.status(entry,{status:'degraded',reason:result.reason,task:'known-references'});
    if(result.added)this.onChange({bindingId:entry.id,scope:entry.scope.key,reason:'known-references',deadlines:[]});
    if(result.done)return this.status(entry,{status:'ready',task:'known-references'});
    if(Date.now()-began>=5000)break;
    await new Promise(resolve=>globalThis.setTimeout(resolve,0));
   }
   return this.status(entry,{status:'partial',task:'known-references',nextTrigger:'binding-or-reference-change'});
  })().catch(error=>paused()?cancelled():this.active(entry)?this.status(entry,{status:'degraded',reason:error.message,task:'known-references'}):{status:'cancelled',reason:'stale-binding'});
  entry.referenceTask=task;
  void task.then(result=>{entry.referenceFinished=result;entry.referenceTask=null;entry.referenceController=null;if(entry.referencesDirty&&this.active(entry))this.reconcileReferences(bindingId);});
  return task;
 }
 async notify(bindingId,kind,options={}){
  if(!kinds.has(kind))throw Error('invalid-free-runtime-trigger');
  const entry=this.get(bindingId);if(!entry)return {status:'cancelled',reason:'stale-binding'};
  if(!(await this.authority(entry)))return {status:'cancelled',reason:'stale-binding'};
  if(!entry.runtime){if(kind==='expiry'&&this.publication==='invalidation')this.onChange({bindingId:entry.id,scope:entry.scope.key,reason:kind,deadlines:[]});return this.status(entry,{status:'unsupported',reason:'no-authorized-source',requests:0});}
  if(!entry.runtime.scope)entry.runtime.setScope(entry.scope);
  try{const result=await entry.runtime.trigger(kind,options);return this.active(entry)?result:{status:'cancelled',reason:'stale-binding'};}
  catch(error){if(!this.active(entry))return {status:'cancelled',reason:'stale-binding'};throw error;}
 }
 observeExpiry(entry,snapshot){
  const now=instant(this.clock());let earliest=null;
  for(const row of [...snapshot.refs,...snapshot.projects]){
   const d=row.activityDecision??row.activity;
   for(const value of [d?.nextCheck,d?.validUntil]){const n=instant(value);if(n!==null&&n>now&&(earliest===null||n<earliest))earliest=n;}
  }
  // Once an expired hint falls back, do not schedule its old expiry again.
  if(earliest!==null)this.scheduleExpiry(entry.id,new Date(earliest).toISOString());
 }
 observeDeadlines(bindingId,values=[]){
  const entry=this.get(bindingId);if(!entry||(!entry.runtime&&this.publication!=='invalidation'))return;
  const now=instant(this.clock());
  for(const value of values){const time=instant(value);if(time!==null&&time>now)entry.deadlines.add(time);}
  let next=null;for(const time of entry.deadlines){if(time<=now)entry.deadlines.delete(time);else if(next===null||time<next)next=time;}
  if(next!==null)this.scheduleExpiry(bindingId,new Date(next).toISOString());
 }
 scheduleExpiry(bindingId,at){
  const entry=this.get(bindingId);if(!entry||(!entry.runtime&&this.publication!=='invalidation'))return false;
  const clock=instant(this.clock()),deadline=instant(at);if(clock===null||deadline===null)throw Error('invalid-free-expiry-time');
  if(deadline<=clock)return false;
  if(entry.timer!==null&&entry.expiry<=deadline)return true;
  if(entry.timer!==null)this.timers.clearTimeout(entry.timer);
  entry.expiry=deadline;
  entry.timer=this.timers.setTimeout(()=>{
   entry.timer=null;entry.expiry=null;if(!this.active(entry))return;
   if(instant(this.clock())<deadline){this.scheduleExpiry(entry.id,at);return;}
   this.observeDeadlines(entry.id);
   this.notify(entry.id,'expiry').catch(error=>{if(this.active(entry))this.status(entry,{status:'degraded',reason:error.message,nextTrigger:'foreground-or-source-revision'});});
  },Math.min(2147483647,Math.max(1,deadline-clock)));
  return true;
 }
 stop(bindingId,reason='stopped'){
  const entry=this.bindings.get(bindingId);if(!entry)return false;
  this.bindings.delete(bindingId);entry.externalSignal?.removeEventListener('abort',entry.externalAbort);
  if(entry.timer!==null)this.timers.clearTimeout(entry.timer);entry.controller.abort();entry.runtime?.stop();
  if(entry.referenceTimer!==undefined)this.timers.clearTimeout(entry.referenceTimer);
  if(entry.foregroundRequests>0&&this.referenceRepository)this.resumeScopeReferences(entry.scope.key);
  this.onSnapshot({bindingId,scope:null,snapshot:null,reason});return true;
 }
 stopAll(reason='stopped'){for(const id of [...this.bindings.keys()])this.stop(id,reason);}
}
