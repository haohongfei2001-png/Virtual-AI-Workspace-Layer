import {normalizedScope,tokenOK} from '../b1/identity.mjs';
import {instant} from '../navigation/projection.mjs';
import {FreeRuntime} from './free-runtime.mjs';
const kinds=new Set(['foreground','current','send','source','expiry','history']);
/** Service-owner registry. Never accept scope, sourceFor, guard or binding lifetime from a page payload. */
export class FreeRuntimeService {
 constructor({nativeRepository,evidenceRepository,sourceFor=null,clock=()=>new Date().toISOString(),timeZone='UTC',onSnapshot=()=>{},onStatus=()=>{},timers={setTimeout,clearTimeout},calibrationOptions={},maxBindings=128}){
  if(sourceFor!==null&&typeof sourceFor!=='function')throw Error('invalid-free-source-factory');
  if(!Number.isSafeInteger(maxBindings)||maxBindings<1||maxBindings>1024)throw Error('invalid-free-binding-capacity');
  Object.assign(this,{nativeRepository,evidenceRepository,sourceFor,clock,timeZone,onSnapshot,onStatus,timers,calibrationOptions,maxBindings});this.bindings=new Map();
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
  const entry={id:bindingId,scope:normalized,guard,authorityCheck,controller:new AbortController(),session,runtime:null,timer:null,expiry:null,source:null};
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
    entry.runtime=new FreeRuntime({nativeRepository:this.wrap(this.nativeRepository,entry),evidenceRepository:this.wrap(this.evidenceRepository,entry),source:protectedSource,clock:this.clock,timeZone:this.timeZone,calibrationOptions:this.calibrationOptions,
     onSnapshot:(snapshot,details)=>{if(!this.active(entry))return;this.onSnapshot({bindingId:entry.id,scope:entry.scope.key,snapshot,...details});if(snapshot)this.observeExpiry(entry,snapshot);},
     onStatus:value=>this.status(entry,value)});
   }
   return {bindingId,scope:normalized.key,supported:!!source};
  }catch(error){this.stop(bindingId,'binding-failed');throw error;}
 }
 async foreground(bindingId,{session=null,objectIds=['inventory'],readCached=true}={}){
  if(typeof readCached!=='boolean')throw Error('invalid-free-cache-read-option');
  const entry=this.get(bindingId);if(!entry)return {snapshot:null,calibration:Promise.resolve({status:'cancelled',reason:'stale-binding'})};
  if(!entry.runtime){const status=this.status(entry,{status:'unsupported',reason:'no-authorized-source',requests:0});return {snapshot:null,calibration:Promise.resolve(status)};}
  try{
   // The broker's header/page path already renders the cached view. It may start
   // bounded calibration without awaiting a second full native/evidence read.
   if(!readCached){
    entry.runtime.setScope(entry.scope);
    entry.session=session??entry.session;
    if(entry.session)entry.runtime.session=entry.session;
    const calibration=entry.runtime.trigger('scope',{objectIds});
    return {snapshot:null,calibration:calibration.then(value=>this.active(entry)?value:{status:'cancelled',reason:'stale-binding'})};
   }
   const result=await entry.runtime.enter(entry.scope,{session:session??entry.session,objectIds});
   if(!this.active(entry))return {snapshot:null,calibration:Promise.resolve({status:'cancelled',reason:'stale-binding'})};
   entry.session=result.snapshot?.viewSession??entry.session;
   return {snapshot:result.snapshot,calibration:result.calibration.then(value=>this.active(entry)?value:{status:'cancelled',reason:'stale-binding'})};
  }catch(error){if(!this.active(entry))return {snapshot:null,calibration:Promise.resolve({status:'cancelled',reason:'stale-binding'})};throw error;}
 }
 async notify(bindingId,kind,options={}){
  if(!kinds.has(kind))throw Error('invalid-free-runtime-trigger');
  const entry=this.get(bindingId);if(!entry)return {status:'cancelled',reason:'stale-binding'};
  if(!entry.runtime)return this.status(entry,{status:'unsupported',reason:'no-authorized-source',requests:0});
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
 scheduleExpiry(bindingId,at){
  const entry=this.get(bindingId);if(!entry?.runtime)return false;
  const clock=instant(this.clock()),deadline=instant(at);if(clock===null||deadline===null)throw Error('invalid-free-expiry-time');
  if(deadline<=clock)return false;
  if(entry.timer!==null&&entry.expiry<=deadline)return true;
  if(entry.timer!==null)this.timers.clearTimeout(entry.timer);
  entry.expiry=deadline;
  entry.timer=this.timers.setTimeout(()=>{
   entry.timer=null;entry.expiry=null;if(!this.active(entry))return;
   if(instant(this.clock())<deadline){this.scheduleExpiry(entry.id,at);return;}
   this.notify(entry.id,'expiry').catch(error=>{if(this.active(entry))this.status(entry,{status:'degraded',reason:error.message,nextTrigger:'foreground-or-source-revision'});});
  },Math.min(2147483647,Math.max(1,deadline-clock)));
  return true;
 }
 stop(bindingId,reason='stopped'){
  const entry=this.bindings.get(bindingId);if(!entry)return false;
  this.bindings.delete(bindingId);entry.externalSignal?.removeEventListener('abort',entry.externalAbort);
  if(entry.timer!==null)this.timers.clearTimeout(entry.timer);entry.controller.abort();entry.runtime?.stop();
  this.onSnapshot({bindingId,scope:null,snapshot:null,reason});return true;
 }
 stopAll(reason='stopped'){for(const id of [...this.bindings.keys()])this.stop(id,reason);}
}
