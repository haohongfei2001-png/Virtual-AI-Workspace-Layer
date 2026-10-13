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
  const validateCurrentSource=()=>{const source=facts.sources[a.sourceId];
   if(!source)throw Error('native-continuation-missing-source');
   if(source.revoked)throw Error('native-continuation-source-revoked');
   if(source.channel!=='host-dom'||source.generation!==a.generation)throw Error('native-continuation-source-changed');
   if(source.admission?.profileId!==a.profileId||source.admission?.profileVersion!==a.profileVersion)throw Error('native-continuation-profile-changed');
  };
  done(pending,validateCurrentSource);
 }catch(error){fail(error);}};
}
