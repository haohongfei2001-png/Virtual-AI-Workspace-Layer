import {allNativeKeys,verifyNativeLifecycleMarker} from './native-lifecycle.mjs';
import {auditEvidencePartitions} from './evidence-partition-audit.mjs';
import {EVIDENCE_DIRECTORY_FORMAT,validateEvidenceDirectoryRoot} from './evidence-ref-directory.mjs';
import {createEvidenceDirectoryReader} from './evidence-directory-reader.mjs';
import {isNativeVersionIndexed,validateNativeIndexRoot} from './native-version-index.mjs';
import {createNativeIndexReader} from './native-index-reader.mjs';
import {digest} from './hash.mjs';
import {nativeRecoveryKey,validateNativeManifest,loadNativePieces} from './native-partitions.mjs';
import {freeEvidenceKey,evidenceRecoveryKey,validateEvidenceManifest,loadEvidenceIndexes} from './free-evidence-partitions.mjs';
/** Diagnostic only; no state is changed and repair still performs its own CAS. */
export async function freeRecoveryStatus(repository,scope,kind,options={}) {
 const check=()=>{if(options.signal?.aborted||options.guard?.()===false)throw Error('stale-binding');};check();
 try {await repository.read(scope,options);return {corrupt:false,recoverable:false,damagedHash:null};}
 catch(failure){
  check();const normalized=repository.base.scopeOrThrow(scope),db=await repository.base.open();
  return new Promise((resolve,reject)=>{
   const native=kind==='native',key=native?normalized.key:freeEvidenceKey(normalized.key),shadowKey=native?nativeRecoveryKey(normalized.key):evidenceRecoveryKey(normalized.key);
   const tx=db.transaction(['native_states','native_operations']),store=tx.objectStore('native_states');let result,error;
   const root=store.get(key),shadow=store.get(shadowKey),marker=tx.objectStore('native_operations').get(key);
   const unpack=row=>{if(!row||row.checksum!==digest(row.payload))throw Error('corrupt-recovery-record');return row.payload;};
   const fail=e=>{if(result)result.recoveryReason=e.message;else error=e;};
   marker.onsuccess=()=>{try{
    check();result={corrupt:true,recoverable:false,damagedHash:digest(root.result??null),reason:failure.message};
    const validate=(value,scope)=>native?(isNativeVersionIndexed(value)?validateNativeIndexRoot(value,scope):validateNativeManifest(value,scope)):(value?.format===EVIDENCE_DIRECTORY_FORMAT?validateEvidenceDirectoryRoot(value,scope):validateEvidenceManifest(value,scope));
    // Repair supports corrupt roots only. Missing/corrupt pieces or markers remain fail-closed.
    let intact=false;try{validate(unpack(root.result),normalized);intact=true;}catch{}
    if(intact)throw Error('intact-state-not-replaced');
    const manifest=validate(unpack(shadow.result),normalized);if(native)verifyNativeLifecycleMarker(unpack(marker.result),manifest,shadow.result?.checksum);if(unpack(marker.result).revision!==manifest.revision)throw Error('recovery-revision-conflict');
    if(native&&isNativeVersionIndexed(root.result?.payload)&&!isNativeVersionIndexed(manifest))throw Error('native-index-recovery-format-conflict');
    if(!native&&root.result?.payload?.format===EVIDENCE_DIRECTORY_FORMAT&&manifest.format!==EVIDENCE_DIRECTORY_FORMAT)throw Error('evidence-directory-recovery-format-conflict');
    const done=()=>{if(!result.recoveryReason)result.recoverable=true;};
    const verify=complete=>{if(native)loadNativePieces(store,complete,normalized,allNativeKeys(complete),done,fail);
     else loadEvidenceIndexes(store,complete,normalized,Object.keys(complete.indexVersions),indexes=>auditEvidencePartitions(store,complete,normalized,check,done,fail,indexes),fail);};
    if(native&&isNativeVersionIndexed(manifest))createNativeIndexReader(store,manifest,normalized,fail).all(verify);
    else if(!native&&manifest.format===EVIDENCE_DIRECTORY_FORMAT)createEvidenceDirectoryReader(store,manifest,normalized,fail).all(verify);
    else verify(manifest);
   }catch(e){fail(e);}};
   tx.oncomplete=()=>{try{check();if(error)reject(error);else resolve(result);}catch(e){reject(e);}};
   tx.onabort=()=>reject(tx.error??Error('recovery-status-aborted'));
  });
 }
}
