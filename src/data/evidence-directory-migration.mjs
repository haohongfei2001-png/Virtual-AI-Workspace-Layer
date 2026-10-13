import {EVIDENCE_DIRECTORY_FORMAT,buildEvidenceRefDirectory} from './evidence-ref-directory.mjs';
import {freeEvidenceKey,evidenceRecoveryKey,evidenceRecord,unpackEvidence,isEvidencePartitioned,loadEvidencePieces,loadEvidenceIndexes} from './free-evidence-partitions.mjs';
import {digest} from './hash.mjs';
import {id} from './state.mjs';
/** Explicit owner migration. Never upgrades a source grant or observes native data. */
export async function migrateEvidenceDirectory(owner,scope,{operationId,expectedRevision},{guard=()=>true,signal=null}={}){
 const normalized=owner.base.scopeOrThrow(scope);id(operationId);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('invalid-revision');
 const fence=()=>{if(signal?.aborted||guard()!==true)throw Error('stale-binding');},kind='MIGRATE_EVIDENCE_DIRECTORY',fingerprint=digest({kind,expectedRevision}),db=await owner.base.open();fence();
 return new Promise(resolve=>{
  const tx=db.transaction(['native_states','native_operations'],'readwrite'),store=tx.objectStore('native_states'),ops=tx.objectStore('native_operations'),key=freeEvidenceKey(normalized.key),operationKey=JSON.stringify([key,operationId]);let result;
  const abort=reason=>{if(result?.ok===false)return;result={ok:false,reason};try{tx.abort();}catch{}},revoked=()=>abort('stale-binding');signal?.addEventListener('abort',revoked,{once:true});
  const root=store.get(key),marker=ops.get(key),receipt=ops.get(operationKey);
  receipt.onsuccess=()=>{try{
   fence();if(!root.result)throw Error('missing-free-evidence-root');const payload=owner.verifiedRoot(root.result,normalized);
   if(unpackEvidence(marker.result).revision!==payload.revision)throw Error('free-evidence-root-revision-conflict');
   if(receipt.result){const prior=unpackEvidence(receipt.result);result=prior.kind===kind&&prior.fingerprint===fingerprint?{ok:true,replayed:true,revision:prior.revision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
   if(payload.revision!==expectedRevision)throw Error('revision-conflict');
   if(payload.format===EVIDENCE_DIRECTORY_FORMAT){result={ok:true,alreadyIndexed:true,revision:payload.revision,operationId};return;}
   if(!isEvidencePartitioned(payload))throw Error('evidence-directory-migration-requires-partitioned-root');
   loadEvidenceIndexes(store,payload,normalized,Object.keys(payload.indexVersions),()=>loadEvidencePieces(store,payload,normalized,Object.keys(payload.refVersions),evidence=>{try{
    fence();for(const table of ['events','hints','coverage'])if(Object.keys(evidence[table]).length!==payload.counts[table])throw Error('free-evidence-count-mismatch');
    const built=buildEvidenceRefDirectory({...payload,revision:payload.revision+1},normalized);
    for(const row of built.records){fence();store.put(row);}const record=evidenceRecord(key,built.root);store.put(record);store.put({...record,key:evidenceRecoveryKey(normalized.key)});
    ops.put(evidenceRecord(key,{revision:built.root.revision}));ops.put(evidenceRecord(operationKey,{kind,fingerprint,revision:built.root.revision,operationId}));fence();result={ok:true,revision:built.root.revision,operationId};
   }catch(e){abort(e.message);}},e=>abort(e.message)),e=>abort(e.message));
  }catch(e){abort(e.message);}};
  tx.oncomplete=()=>{signal?.removeEventListener('abort',revoked);try{fence();resolve(result);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
  tx.onabort=()=>{signal?.removeEventListener('abort',revoked);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'evidence-directory-migration-aborted'});};tx.onerror=()=>{};
 });
}
