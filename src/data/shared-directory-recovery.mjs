import {normalizedScope} from '../b1/identity.mjs';
import {id,validateState} from './state.mjs';
import {digest} from './hash.mjs';
import {SHARED_DIRECTORY_FORMAT,buildSharedRefDirectory} from './shared-ref-directory.mjs';
import {manifest_PARTITION_FORMAT,manifest_partitionRecord,manifest_partitionUnpack} from './partition-manifest.mjs';
import {auditSharedPartitions} from './shared-partition-audit.mjs';
import {knownAnchorCursorKey} from './known-anchor-key.mjs';
/** Recover manual intent without replaying commands or reviving source grants. */
export async function recoverSharedDirectory(owner,scope,{operationId=null,damagedHash=null}={},options={}){
 const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');if(operationId)id(operationId);
 const fence=()=>{if(options.signal?.aborted||options.guard&&options.guard()!==true)throw Error('stale-binding');},db=await owner.connection();fence();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['b23_states','b23_checkpoints','b23_operations'],operationId?'readwrite':'readonly'),store=tx.objectStore('b23_states'),ops=tx.objectStore('b23_operations');let result,error,stateRow,checkpointRow,waiting=3;const logs=[];
  const fail=e=>{error??=e;result=operationId?{ok:false,reason:error.message}:{corrupt:true,recoverable:false,reason:error.message};try{tx.abort();}catch{}},revoked=()=>fail(Error('stale-binding'));options.signal?.addEventListener('abort',revoked,{once:true});
  const finish=()=>{if(--waiting)return;try{
   fence();const prior=operationId?logs.find(row=>row.log.id===operationId)?.log:null;
   if(prior){result=prior.type==='RECOVER'&&prior.fingerprint===damagedHash&&!prior.invalidatedBy?{ok:true,replayed:true,revision:prior.resultRevision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
   let intact=false;try{
    if(stateRow?.payload?.format===SHARED_DIRECTORY_FORMAT)owner.partitioned.verifiedDirectory(stateRow,s);
    else if(stateRow?.payload?.format===manifest_PARTITION_FORMAT)owner.partitioned.verifiedManifest(stateRow,s.key);
    else validateState(manifest_partitionUnpack(stateRow),s.key);
    intact=true;
   }catch{}
   if(intact){if(operationId)throw Error('intact-state-not-replaced');result={corrupt:false};return;}
   const fingerprint=digest(stateRow??null);if(operationId&&fingerprint!==damagedHash)throw Error('recovery-conflict');
   owner.partitioned.verifiedDirectory(checkpointRow,s);
   owner.partitioned.readManifest(tx,checkpointRow,s,checkpoint=>auditSharedPartitions(owner,tx,checkpoint,fence,()=>{
    owner.partitioned.plan(tx,s.key,checkpoint,logs.map(row=>row.log),plan=>{try{
     fence();if(!operationId){result={corrupt:true,recoverable:true,damagedHash:fingerprint,checkpointRevision:checkpoint.revision,restoredHumanChanges:plan.restoredHumanChanges,recoveryRevision:plan.state.revision,evidenceInvalidated:true};return;}
     // Recovery is deliberately a complete validation path. Preserve unchanged
     // immutable pieces, intercept the temporary legacy root, and rebuild buckets.
     let captured=null;const proxy={objectStore:name=>name==='b23_states'?{put:row=>{if(row.key===s.key){captured=row;return;}return store.put(row);}}:tx.objectStore(name)};
     const next=owner.partitioned.saveMutation(proxy,plan.storage,null,plan.state,plan.patch,'human');if(captured?.payload!==next)throw Error('missing-shared-root-write');
     const built=buildSharedRefDirectory(next,s);for(const row of built.records){fence();store.put(row);}const root=manifest_partitionRecord(s.key,built.root);store.put(root);tx.objectStore('b23_checkpoints').put(root);store.delete(knownAnchorCursorKey(s.key));
     for(const row of logs)ops.put(manifest_partitionRecord(row.key,{...row.log,invalidatedBy:operationId}));
     const log={id:operationId,scopeKey:s.key,type:'RECOVER',actor:'human',fingerprint:damagedHash,baseRevision:plan.highWater,resultRevision:plan.state.revision,recordedAt:owner.clock(),patch:[],changedObjects:0,undoneBy:null,checkpointRevision:checkpoint.revision,restoredHumanChanges:plan.restoredHumanChanges,evidenceInvalidated:true};
     const receiptWrite=ops.add(manifest_partitionRecord(JSON.stringify([s.key,operationId]),log));receiptWrite.onsuccess=()=>{try{fence();}catch(e){fail(e);}};fence();result={ok:true,replayed:false,revision:plan.state.revision,operationId,checkpointRevision:checkpoint.revision,restoredHumanChanges:plan.restoredHumanChanges,evidenceInvalidated:true};
    }catch(e){fail(e);}},fail);
   },fail),fail);
  }catch(e){fail(e);}};
  const root=store.get(s.key),checkpoint=tx.objectStore('b23_checkpoints').get(s.key),cursor=ops.index('scopeKey').openCursor(s.key);
  root.onsuccess=()=>{stateRow=root.result;finish();};checkpoint.onsuccess=()=>{checkpointRow=checkpoint.result;finish();};
  cursor.onsuccess=()=>{try{fence();const c=cursor.result;if(!c){finish();return;}const log=manifest_partitionUnpack(c.value);id(log.id);if(log.scopeKey!==s.key||c.primaryKey!==JSON.stringify([s.key,log.id]))throw Error('corrupt-operation-history');logs.push({key:c.primaryKey,log});c.continue();}catch(e){fail(e);}};
  tx.oncomplete=()=>{options.signal?.removeEventListener('abort',revoked);try{fence();resolve(result);}catch(e){if(operationId)resolve({ok:false,reason:'stale-after-commit',committed:true});else reject(e);}};
  tx.onabort=()=>{options.signal?.removeEventListener('abort',revoked);if(!operationId&&error?.message==='stale-binding'){reject(error);return;}resolve(operationId?(result?.ok===false?result:{ok:false,reason:error?.message??tx.error?.name??'recovery-aborted'}):(result?.recoverable===false?result:{corrupt:true,recoverable:false,reason:error?.message??tx.error?.name??'recovery-aborted'}));};tx.onerror=()=>{};
 });
}
