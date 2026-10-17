import {freeEvidenceKey,isEvidencePartitioned,validateEvidenceManifest} from './free-evidence-partitions.mjs';
import {validateFreeEvidence} from './free-evidence.mjs';
import {EVIDENCE_DIRECTORY_FORMAT,validateEvidenceDirectoryRoot} from './evidence-ref-directory.mjs';
import {validateNativeContinuation,validateContinuationDirectory,continuationDirectoryKey} from './native-observation-continuation.mjs';
import {validateNativeFacts} from './native-facts.mjs';
import {isNativePartitioned,validateNativeManifest} from './native-partitions.mjs';
import {NATIVE_INDEX_FORMAT,validateNativeIndexRoot} from './native-version-index.mjs';
import {digest} from './hash.mjs';
function unpack(row){if(!row||row.checksum!==digest(row.payload))throw Error('corrupt-native-continuation-record');return row.payload;}
/** Reads all origin witnesses inside the evidence writer's existing transaction. */
export function readContinuationForEvidence(tx,scope,request,authority,check,done,fail){
 const ops=tx.objectStore('native_operations'),states=tx.objectStore('native_states');
 const origin=ops.get(JSON.stringify([scope.key,request.nativeOperationId])),root=states.get(scope.key),marker=ops.get(scope.key);
 const directory=ops.get(continuationDirectoryKey(scope.key)),queueMarker=ops.get(JSON.stringify([scope.key,'native-continuations','marker']));
 queueMarker.onsuccess=()=>{try{
  check();const receipt=unpack(origin.result),pending=validateNativeContinuation(receipt.continuation,scope);
  if(receipt.operationId!==request.nativeOperationId||receipt.revision!==pending.nativeRevision||pending.operationId!==request.nativeOperationId||pending.payloadDigest!==request.payloadDigest)throw Error('native-continuation-origin-conflict');
  const evidenceOperationId=pending.state==='pending-evidence'?pending.evidence.operationId:pending.evidenceOperationId;
  if(evidenceOperationId!==request.operationId)throw Error('native-continuation-operation-conflict');
  if(pending.state==='needs-revalidation')throw Error('native-continuation-needs-revalidation');
  const a=pending.admission;
  for(const field of ['scopeKey','sourceId','generation','profileId','profileVersion'])if(a[field]!==authority[field])throw Error('native-continuation-authority-conflict');
  const facts=unpack(root.result);
  if(facts.format===NATIVE_INDEX_FORMAT)validateNativeIndexRoot(facts,scope);else if(isNativePartitioned(facts))validateNativeManifest(facts,scope);else validateNativeFacts(facts,scope);
  if(pending.nativeRevision>facts.revision)throw Error('native-continuation-origin-conflict');
  const nativeMarker=unpack(marker.result);if(nativeMarker.revision!==facts.revision)throw Error('native-root-revision-conflict');
  const dir=validateContinuationDirectory(unpack(directory.result),scope),qm=unpack(queueMarker.result),witness={revision:dir.revision,directoryDigest:digest(dir)};
  if(digest(qm)!==digest(witness)||digest(nativeMarker.continuations??null)!==digest(witness))throw Error('native-continuation-directory-conflict');
  if(pending.state==='pending-evidence'?dir.entries[pending.operationId]!==new TextEncoder().encode(JSON.stringify(pending)).length:Object.hasOwn(dir.entries,pending.operationId))throw Error('native-continuation-directory-conflict');
  // Ordinary source TTL is not revocation. Never renew it while draining.
  const validateCurrentSource=()=>{const n=pending.nativeWitness??a,source=facts.sources[n.sourceId];
   if(!source)throw Error('native-continuation-missing-source');
   if(source.revoked)throw Error('native-continuation-source-revoked');
   if(source.channel!=='host-dom'||source.generation!==n.generation||pending.nativeWitness&&(source.sourceRevision!==n.sourceRevision||source.admission?.semanticFingerprint!==n.semanticFingerprint))throw Error('native-continuation-source-changed');
   if(source.admission?.profileId!==n.profileId||source.admission?.profileVersion!==n.profileVersion)throw Error('native-continuation-profile-changed');
  };
  done(pending,validateCurrentSource);
 }catch(error){fail(error);}};
}

/** Missing initial ACK source is legitimate: this may be its first observation.
 * Existing source retirement is checked independently of the native source. */
export function continuationAckSourceFailure(pending,sources){
 if(!pending.nativeWitness)return null;
 const a=pending.admission,source=sources[a.sourceId];if(!source)return null;
 return source.revoked?'source-revoked':source.channel!=='host-evidence'||source.codecVersion!==1||source.generation!==a.generation?'source-changed':source.profileId!==a.profileId||source.profileVersion!==a.profileVersion?'profile-changed':null;
}
/** Synchronous validation of rows fetched within the caller's existing tx. */
export function continuationEvidenceSources(root,marker,scope,{minimumRevision=0,requiredSourceId=null}={}){
 if(!root){if(marker||minimumRevision>0)throw Error('missing-free-evidence-root');return {};}
 if(root.key!==freeEvidenceKey(scope.key)||!marker||marker.key!==root.key)throw Error('missing-free-evidence-marker');
 const value=unpack(root),mark=unpack(marker);
 if(value.format===EVIDENCE_DIRECTORY_FORMAT)validateEvidenceDirectoryRoot(value,scope);else if(isEvidencePartitioned(value))validateEvidenceManifest(value,scope);else validateFreeEvidence(value,scope);
 if(mark.revision!==value.revision||value.revision<minimumRevision)throw Error('free-evidence-root-revision-conflict');
 if(requiredSourceId!==null&&!value.sources[requiredSourceId])throw Error('missing-continuation-evidence-source');return value.sources;
}
