import {validateNativeRootRecord} from './native-repository.mjs';
import {validateFreeEvidenceRootRecord} from './free-evidence-repository.mjs';
import {freeEvidenceKey} from './free-evidence-partitions.mjs';
import {digest} from './hash.mjs';
import {verifyNativeLifecycleMarker} from './native-lifecycle.mjs';
/** Commit-time root/marker consistency and revision fence. This does not certify inventory,
 * piece integrity, membership coverage or time-dependent source freshness. */
export function activityVersionPrecondition(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==2)throw Error('invalid-activity-version-precondition');
 const snapshot={};
 for(const key of ['nativeRevision','evidenceRevision']){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!Object.hasOwn(descriptor,'value')||!Number.isSafeInteger(descriptor.value)||descriptor.value<0)throw Error('invalid-activity-version-precondition');
  snapshot[key]=descriptor.value;
 }
 return Object.freeze(snapshot);
}
export function checkActivityVersionFence(tx,scope,expected,check,ready,fail){
 const key=scope.key,evidenceKey=freeEvidenceKey(key),states=tx.objectStore('native_states'),operations=tx.objectStore('native_operations');
 const reads=[states.get(key),operations.get(key),states.get(evidenceKey),operations.get(evidenceKey)];let remaining=reads.length;
 const inspect=(root,marker,rootKey,validate,label)=>{
  if(root&&root.key!==rootKey||marker&&marker.key!==rootKey)throw Error('invalid-activity-root-key');
  const revision=root?validate(root,scope).revision:0;
  if(!root&&marker)throw Error('missing-'+label+'-root');
  if(marker){if(marker.checksum!==digest(marker.payload))throw Error('corrupt-'+label+'-record');if(marker.payload.revision!==revision)throw Error(label+'-root-revision-conflict');}
  else if(revision!==0)throw Error(label+'-root-revision-conflict');
  return revision;
 };
 for(const request of reads)request.onsuccess=()=>{
  if(--remaining)return;
  try{
   if(!check())return;
   const native=inspect(reads[0].result,reads[1].result,key,validateNativeRootRecord,'native');
   verifyNativeLifecycleMarker(reads[1].result?.payload,reads[0].result?.payload,reads[0].result?.checksum);
   const evidence=inspect(reads[2].result,reads[3].result,evidenceKey,validateFreeEvidenceRootRecord,'free-evidence');
   if(native!==expected.nativeRevision||evidence!==expected.evidenceRevision)throw Error('activity-revision-conflict');
   if(check())ready();
  }catch(error){fail(error.message);}
 };
}
