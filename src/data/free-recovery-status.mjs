import {digest} from './hash.mjs';
import {nativeRecoveryKey,validateNativeManifest,loadNativePieces} from './native-partitions.mjs';
import {freeEvidenceKey,evidenceRecoveryKey,validateEvidenceManifest,loadEvidencePieces,loadEvidenceIndexes} from './free-evidence-partitions.mjs';
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
    const validate=native?validateNativeManifest:validateEvidenceManifest;
    // Repair supports corrupt roots only. Missing/corrupt pieces or markers remain fail-closed.
    let intact=false;try{validate(unpack(root.result),normalized);intact=true;}catch{}
    if(intact)throw Error('intact-state-not-replaced');
    const manifest=validate(unpack(shadow.result),normalized);if(unpack(marker.result).revision!==manifest.revision)throw Error('recovery-revision-conflict');
    const done=()=>{result.recoverable=true;};
    if(native)loadNativePieces(store,manifest,normalized,{projects:Object.keys(manifest.projects),refs:Object.keys(manifest.refs)},done,fail);
    else loadEvidenceIndexes(store,manifest,normalized,Object.keys(manifest.indexVersions),()=>loadEvidencePieces(store,manifest,normalized,Object.keys(manifest.refVersions),done,fail),fail);
   }catch(e){fail(e);}};
   tx.oncomplete=()=>{try{check();if(error)reject(error);else resolve(result);}catch(e){reject(e);}};
   tx.onabort=()=>reject(tx.error??Error('recovery-status-aborted'));
  });
 }
}
