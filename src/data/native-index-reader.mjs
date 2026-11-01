import {hasNativeLifecycle,NATIVE_LIFECYCLE_PARTITIONS,nativeKinds,nativeLifecycleKinds,emptyNativeMaps} from './native-lifecycle.mjs';
import {validateNativeIndexRoot,snapshotNativeIndexPiece,materializeNativeVersionIndex,selectNativeVersionIndexPage,nativeIndexBucket,nativeIndexKey} from './native-version-index.mjs';
import {NATIVE_PARTITION_FORMAT} from './native-partitions.mjs';
import {id} from './state.mjs';
/** One live IDB transaction, one validated root. Nothing survives this reader.
 * A missing directory pointer is authoritative absence only within this revision.
 * Directory counts do not certify that unloaded buckets are intact.
 */
export function createNativeIndexReader(store,root,scope,fail,ownerGuard=null){
 validateNativeIndexRoot(root,scope);
 const manifest={...root,format:hasNativeLifecycle(root)?NATIVE_LIFECYCLE_PARTITIONS:NATIVE_PARTITION_FORMAT,...emptyNativeMaps(root)},records=new Map(),pending=new Map();let failed=false;
 const reject=error=>{if(failed)return;failed=true;pending.clear();fail(error);};
 // An abandoned reader may still have queued callbacks in a live owner write.
 // Guard failure is separate from tolerable old-checkpoint validation failure.
 const checkOwner=()=>{if(!ownerGuard)return true;try{ownerGuard.check();return true;}catch(error){ownerGuard.fail(error);return false;}};
 function bucket(kind,bucketId,done){
  if(failed)return;const pointer=root[kind]?.[bucketId];if(!pointer){done(null);return;}
  const key=nativeIndexKey(root.scopeKey,kind,bucketId,pointer.revision);
  if(records.has(key)){done(records.get(key).payload);return;}
  if(pending.has(key)){pending.get(key).push(done);return;}
  pending.set(key,[done]);
  try{const request=store.get(key);request.onsuccess=()=>{if(!checkOwner()||failed)return;try{
   const record=snapshotNativeIndexPiece(request.result,root,kind,bucketId),piece=record.payload;
   // Targeted consumers resolve versions through lookup. Full consumers
   // receive the complete ordered maps from all(); do not build a second,
   // unordered inventory here only to discard it during materialization.
   records.set(key,record);
   const callbacks=pending.get(key);pending.delete(key);for(const callback of callbacks){if(failed)break;callback(piece);}
  }catch(error){reject(error);}};request.onerror=()=>{if(checkOwner())reject(request.error??Error('native-index-read-failed'));};}catch(error){reject(error);}
 }
 function lookup(kind,key,done){
  if(failed)return;try{if(!['projects','refs',...nativeLifecycleKinds].includes(kind))throw Error('invalid-native-index-kind');id(key);bucket(kind,nativeIndexBucket(key),piece=>done(piece?.versions[key]));}catch(error){reject(error);}
 }
 function collect(done){
  if(failed)return;const entries=nativeKinds(root).flatMap(kind=>Object.keys(root[kind]).map(key=>[kind,key]));let remaining=entries.length;
  const finish=()=>{if(failed)return;try{done([...records.values()]);}catch(error){reject(error);}};
  if(!remaining){finish();return;}
  for(const [kind,key] of entries)bucket(kind,key,()=>{if(!--remaining)finish();});
 }
 function all(done){collect(rows=>{const complete=materializeNativeVersionIndex(root,scope,rows);for(const kind of nativeKinds(root))manifest[kind]=complete[kind];done(manifest);});}
 function select(offset,limit,done){collect(rows=>done(selectNativeVersionIndexPage(root,scope,rows,offset,limit)));}
 return {root,manifest,records,lookup,all,select,readBucket:bucket};
}
