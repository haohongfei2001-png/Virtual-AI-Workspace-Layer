import {normalizedScope} from '../b1/identity.mjs';
import {FreeCalibration} from './free-calibration.mjs';
import {projectFreeActivity} from './free-activity.mjs';
import {createFreeViewSession} from './free-time-policy.mjs';
import {digest} from './hash.mjs';
const priorities={foreground:'recent',scope:'scope',current:'current',send:'send',source:'scope',expiry:'expiry',history:'history'};
function failure(message,code){const e=Error(message);e.retryable=false;e.code=code;return e;}
/** Owner-created read source only. A page message can request refresh but cannot install a source or authenticate production. */
export class FreeRuntime {
 constructor({nativeRepository,evidenceRepository,source=null,clock=()=>new Date().toISOString(),timeZone='UTC',onSnapshot=()=>{},onStatus=()=>{},calibrationOptions={}}){
  if(!nativeRepository?.read||!nativeRepository?.snapshot||!nativeRepository?.apply||!evidenceRepository?.read||!evidenceRepository?.apply)throw Error('free-runtime-repositories-required');
  if(source!==null&&(source.channel!=='synthetic'||typeof source.read!=='function'))throw Error('untrusted-free-runtime-source');
  Object.assign(this,{nativeRepository,evidenceRepository,source,clock,timeZone,onSnapshot,onStatus});
  this.scope=null;this.epoch=0;this.session=null;this.sourceRevision=null;this.applied=new Set();
  this.operationPrefix='free_runtime_'+crypto.randomUUID().replaceAll('-','');this.sequence=0;
  this.calibration=new FreeCalibration({...calibrationOptions,request:request=>this.request(request),apply:(value,context)=>this.apply(value,context)});
 }
 setScope(scope){
  const next=normalizedScope(scope);if(next?.key===this.scope?.key)return;
  this.epoch++;this.calibration.setScope(next?.key??null);this.scope=next;this.session=null;this.sourceRevision=null;this.applied.clear();
  this.onSnapshot(null,{reason:'scope-change',scope:next?.key??null});
 }
 stop(){this.epoch++;this.calibration.cancel();}
 options(context=null){const epoch=this.epoch,scope=this.scope?.key;return {signal:context?.signal,guard:()=>epoch===this.epoch&&scope===this.scope?.key&&(!context||context.isCurrent())};}
 async read({session=this.session,context=null}={}){
  const scope=this.scope;if(!scope)throw Error('unverified-scope');const options=this.options(context);
  const [snapshot,evidence]=await Promise.all([this.nativeRepository.snapshot(scope,options),this.evidenceRepository.read(scope,options)]);
  if(!options.guard())throw Error('stale-binding');
  session??=createFreeViewSession({now:this.clock(),timeZone:this.timeZone});
  const projected=projectFreeActivity(snapshot,{...evidence,evidenceRevision:evidence.revision},session,this.clock());
  if(!options.guard())throw Error('stale-binding');this.session=session;this.onSnapshot(projected,{scope:scope.key});return projected;
 }
 /** Resolves cached display before awaiting any upstream source. The caller may separately observe calibration. */
 async enter(scope,{session=null,objectIds=['inventory']}={}){
  this.setScope(scope);if(!this.scope)return {snapshot:null,calibration:Promise.resolve(this.status({status:'unsupported',reason:'unverified-scope',requests:0}))};
  const snapshot=await this.read({session});return {snapshot,calibration:this.trigger('scope',{objectIds})};
 }
 status(value){this.onStatus(value);return value;}
 async trigger(kind,{objectIds=['inventory'],sourceRevision=null}={}){
  if(!Object.hasOwn(priorities,kind))return Promise.reject(Error('invalid-free-runtime-trigger'));
  if(this.scope&&['foreground','source','expiry'].includes(kind))await this.read();
  if(!this.scope||!this.source)return Promise.resolve(this.status({status:'unsupported',reason:this.scope?'no-authorized-source':'unverified-scope',scope:this.scope?.key??null,requests:0}));
  if(!Array.isArray(objectIds)||objectIds.length>100000||objectIds.some(id=>typeof id!=='string'||!id))return Promise.reject(Error('invalid-free-calibration-targets'));
  if(kind==='source'&&sourceRevision!==null){
   if(!Number.isSafeInteger(sourceRevision)||sourceRevision<0)return Promise.reject(Error('invalid-source-revision'));
   if(this.sourceRevision!==null&&sourceRevision<=this.sourceRevision)return Promise.resolve(this.status({status:'unchanged',scope:this.scope.key,requests:0}));
   this.sourceRevision=sourceRevision;
  }
  const epoch=this.epoch;
  for(const id of objectIds)this.calibration.enqueue(id,priorities[kind]);
  return this.calibration.run().then(result=>{
   if(epoch!==this.epoch)return {...result,status:'cancelled'};
   const unsupported=result.outcomes.some(o=>o.status==='unsupported');
   const degraded=result.outcomes.some(o=>o.status==='degraded');
   return this.status(unsupported?{...result,status:'unsupported'}:degraded?{...result,status:'degraded'}:result);
  });
 }
 async request({scope,objectId,trigger,signal}){
  if(scope!==this.scope?.key||signal.aborted)throw failure('stale-binding');
  if(!this.source)throw failure('no-authorized-source','unsupported');
  const result=await this.source.read({scope:this.scope,objectId,trigger,signal});
  if(result?.status==='unsupported')throw failure(result.reason??'unsupported-source','unsupported');
  if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).some(k=>!['nativeBatch','evidenceBatch'].includes(k))||(!result.nativeBatch&&!result.evidenceBatch))throw failure('invalid-free-source-response');
  return result;
 }
 async write(repository,batch,context,kind){
  const scope=this.scope,options=this.options(context),batchHash=digest(batch),dedupe=kind+':'+batchHash;
  if(this.applied.has(dedupe))return false;
  for(let attempt=0;attempt<3;attempt++){
   if(!options.guard())throw failure('stale-binding');
   const current=await (repository.header?repository.header(scope,options):repository.read(scope,options));
   const operationId=this.operationPrefix+'_'+(++this.sequence);
   const result=await repository.apply(scope,{operationId,expectedRevision:current.revision,batch},options);
   if(result.ok){if(this.applied.size>=256)this.applied.delete(this.applied.values().next().value);this.applied.add(dedupe);return true;}
   if(result.reason!=='revision-conflict')throw failure(result.reason??'free-evidence-write-failed');
  }
  throw failure('bounded-free-cas-conflict');
 }
 async apply(result,context){
  if(!context.isCurrent()||context.scope!==this.scope?.key)throw failure('stale-binding');
  let changed=false;
  try{
   if(result.nativeBatch)changed=(await this.write(this.nativeRepository,result.nativeBatch,context,'native'))||changed;
   if(result.evidenceBatch)changed=(await this.write(this.evidenceRepository,result.evidenceBatch,context,'evidence'))||changed;
  }finally{
   // Independent committed native discovery remains visible even if activity ingestion degrades.
   if(changed&&context.isCurrent())await this.read({context});
  }
 }
}
