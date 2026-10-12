import {emptyFreeEvidence,validateFreeEvidence,applyFreeEvidence} from './free-evidence.mjs';
import {digest} from './hash.mjs';
import {id} from './state.mjs';
export const freeEvidenceKey=scopeKey=>JSON.stringify([scopeKey,'free-evidence']);
const record=(key,payload)=>({key,payload,checksum:digest(payload)});
function unpack(row){if(!row||row.checksum!==digest(row.payload))throw Error('corrupt-free-evidence-record');return row.payload;}
function fence({guard=()=>true,signal}={}){if(signal?.aborted||guard()!==true)throw Error('stale-binding');}
function markerCheck(root,marker,revision){
 if(!root&&marker)throw Error('missing-free-evidence-root');
 if(revision&&!marker)throw Error('missing-free-evidence-marker');
 if(marker&&unpack(marker).revision!==revision)throw Error('free-evidence-root-revision-conflict');
}
/** Evidence shares the B1 database but never its native or Pro record keys. No export/restore grants. */
export class FreeEvidenceRepository {
 constructor({baseRepository,observationGate=null,clock=()=>new Date().toISOString()}){
  if(!baseRepository?.open||!baseRepository?.scopeOrThrow)throw Error('b1-repository-required');
  this.base=baseRepository;this.observationGate=observationGate;this.clock=clock;
 }
 async read(scope,options={}){
  const normalized=this.base.scopeOrThrow(scope),db=await this.base.open(),key=freeEvidenceKey(normalized.key);fence(options);
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['native_states','native_operations'],'readonly');let value,error;
   const abort=failure=>{error=failure;try{tx.abort();}catch{}};
   const revoked=()=>abort(Error('stale-binding'));options.signal?.addEventListener('abort',revoked,{once:true});
   const root=tx.objectStore('native_states').get(key);
   root.onsuccess=()=>{try{
    fence(options);value=root.result?validateFreeEvidence(unpack(root.result),normalized):emptyFreeEvidence(normalized);
    const marker=tx.objectStore('native_operations').get(key);marker.onsuccess=()=>{try{fence(options);markerCheck(root.result,marker.result,value.revision);}catch(failure){abort(failure);}};
   }catch(failure){abort(failure);}};
   tx.oncomplete=()=>{options.signal?.removeEventListener('abort',revoked);try{fence(options);resolve(value);}catch(failure){reject(failure);}};
   tx.onabort=()=>{options.signal?.removeEventListener('abort',revoked);reject(error??tx.error??Error('free-evidence-read-aborted'));};
  });
 }
 async apply(scope,request,options={}){
  const normalized=this.base.scopeOrThrow(scope),authority=this.observationGate?.(normalized);
  if(authority?.channel!=='synthetic')throw Error('untrusted-free-evidence-source');
  id(authority.sourceId);id(authority.generation);
  if(!request.batch||!['sources','events','hints','coverage'].every(t=>Array.isArray(request.batch[t])))throw Error('invalid-free-evidence-batch');
  for(const row of request.batch.sources)if(row.id!==authority.sourceId||row.generation!==authority.generation)throw Error('free-evidence-source-gate-mismatch');
  for(const table of ['events','hints','coverage'])for(const row of request.batch[table])if(row.sourceId!==authority.sourceId||row.generation!==authority.generation)throw Error('free-evidence-source-gate-mismatch');
  const command={type:'OBSERVE_FREE_EVIDENCE',batch:request.batch};
  return this.mutate(normalized,request,command,options);
 }
 async invalidate(scope,request,options={}){
  id(request.sourceId);return this.mutate(scope,request,{type:'REVOKE_FREE_EVIDENCE_SOURCE',sourceId:request.sourceId},options);
 }
 async mutate(scope,{operationId,expectedRevision},command,options){
  const normalized=this.base.scopeOrThrow(scope);id(operationId);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('invalid-revision');
  const fingerprint=digest({command,expectedRevision}),db=await this.base.open(),key=freeEvidenceKey(normalized.key);fence(options);
  return new Promise(resolve=>{
   const tx=db.transaction(['native_states','native_operations'],'readwrite'),states=tx.objectStore('native_states'),operations=tx.objectStore('native_operations');let result;
   const abort=reason=>{result={ok:false,reason};try{tx.abort();}catch{}};
   const revoked=()=>abort('stale-binding');options.signal?.addEventListener('abort',revoked,{once:true});
   const root=states.get(key);
   root.onsuccess=()=>{try{
    fence(options);const current=root.result?validateFreeEvidence(unpack(root.result),normalized):emptyFreeEvidence(normalized);
    const marker=operations.get(key);marker.onsuccess=()=>{try{
     fence(options);markerCheck(root.result,marker.result,current.revision);
     const operationKey=JSON.stringify([key,operationId]),receipt=operations.get(operationKey);
     receipt.onsuccess=()=>{try{
      fence(options);
      if(receipt.result){const prior=unpack(receipt.result);result=prior.fingerprint===fingerprint?{ok:true,replayed:true,revision:prior.revision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
      if(current.revision!==expectedRevision)throw Error('revision-conflict');
      const next=applyFreeEvidence(current,command,{scope:normalized,now:this.clock(),channel:'synthetic'});fence(options);
      states.put(record(key,next));operations.put(record(key,{revision:next.revision}));operations.put(record(operationKey,{fingerprint,revision:next.revision,operationId}));fence(options);
      result={ok:true,replayed:false,revision:next.revision,operationId};
     }catch(failure){abort(failure.message);}};
    }catch(failure){abort(failure.message);}};
   }catch(failure){abort(failure.message);}};
   tx.oncomplete=()=>{options.signal?.removeEventListener('abort',revoked);try{fence(options);resolve(result);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
   tx.onabort=()=>{options.signal?.removeEventListener('abort',revoked);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'free-evidence-write-aborted'});};
   tx.onerror=()=>{};
  });
 }
}
