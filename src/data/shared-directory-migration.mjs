import {auditSharedPartitions} from './shared-partition-audit.mjs';
import {normalizedScope} from '../b1/identity.mjs';
import {id} from './state.mjs';
import {digest} from './hash.mjs';
import {SHARED_DIRECTORY_FORMAT,buildSharedRefDirectory} from './shared-ref-directory.mjs';
import {manifest_PARTITION_FORMAT,manifest_partitionRecord,manifest_partitionUnpack} from './partition-manifest.mjs';
/** Explicit storage migration only. Does not create evidence or renew sources.
 * Validate all pieces and global evidence locators before atomic publication.
 */
export async function migrateSharedDirectory(owner,scope,{operationId,expectedRevision},{guard=()=>true,signal=null}={}){
 const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');id(operationId);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('invalid-revision');
 const kind='MIGRATE_SHARED_DIRECTORY',fingerprint=digest({kind,expectedRevision}),fence=()=>{if(signal?.aborted||guard()!==true)throw Error('stale-binding');},db=await owner.connection();fence();
 return new Promise(resolve=>{
  const tx=db.transaction(['b23_states','b23_checkpoints','b23_operations'],'readwrite'),store=tx.objectStore('b23_states'),ops=tx.objectStore('b23_operations'),opKey=JSON.stringify([s.key,operationId]);let outcome;
  const abort=e=>{if(outcome?.ok===false)return;outcome={ok:false,reason:e.message??String(e)};try{tx.abort();}catch{}},revoked=()=>abort(Error('stale-binding'));signal?.addEventListener('abort',revoked,{once:true});
  const root=store.get(s.key),receipt=ops.get(opKey);
  receipt.onsuccess=()=>{try{
   fence();const indexed=root.result?.payload?.format===SHARED_DIRECTORY_FORMAT;
   const manifest=indexed?owner.partitioned.verifiedDirectory(root.result,s):owner.partitioned.verifiedManifest(root.result,s.key);
   if(receipt.result){const prior=manifest_partitionUnpack(receipt.result);if(prior.invalidatedBy)throw Error('operation-invalidated-by-recovery');outcome=prior.type===kind&&prior.fingerprint===fingerprint?{ok:true,replayed:true,revision:prior.resultRevision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
   if(manifest.revision!==expectedRevision)throw Error('revision-conflict');
   if(indexed){outcome={ok:true,alreadyIndexed:true,revision:manifest.revision,operationId};return;}
   if(manifest.format!==manifest_PARTITION_FORMAT)throw Error('shared-directory-migration-requires-partitioned-root');
   if(manifest.revision===Number.MAX_SAFE_INTEGER)throw Error('revision-exhausted');
   const publish=()=>{try{
    fence();
    const revision=manifest.revision+1,built=buildSharedRefDirectory({...manifest,revision,changes:[...manifest.changes,{revision,refs:[]}].slice(-64)},s);
    for(const row of built.records){fence();store.put(row);}
    const row=manifest_partitionRecord(s.key,built.root);store.put(row);
    // A legacy checkpoint would let old readers mistake a new format for damage
    // and overwrite it. Checkpoint the fully verified current directory instead.
    tx.objectStore('b23_checkpoints').put(row);
    ops.put(manifest_partitionRecord(opKey,{id:operationId,scopeKey:s.key,type:kind,actor:'evidence',fingerprint,baseRevision:manifest.revision,resultRevision:revision,recordedAt:owner.clock(),patch:[],changedObjects:0,undoneBy:null}));
    fence();outcome={ok:true,replayed:false,revision,operationId};
   }catch(e){abort(e);}};
   auditSharedPartitions(owner,tx,manifest,fence,publish,abort);
  }catch(e){abort(e);}};
  tx.oncomplete=()=>{signal?.removeEventListener('abort',revoked);try{fence();resolve(outcome);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
  tx.onabort=()=>{signal?.removeEventListener('abort',revoked);resolve(outcome?.ok===false?outcome:{ok:false,reason:tx.error?.name??'shared-directory-migration-aborted'});};tx.onerror=()=>{};
 });
}
