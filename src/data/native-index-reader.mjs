import {validateNativeIndexRoot,verifyNativeIndexPiece,materializeNativeVersionIndex,nativeIndexBucket,nativeIndexKey} from './native-version-index.mjs';
import {NATIVE_PARTITION_FORMAT} from './native-partitions.mjs';
import {id} from './state.mjs';
/** One live IDB transaction, one validated root. Nothing survives this reader.
 * A missing directory pointer is authoritative absence only within this revision.
 * Directory counts do not certify that unloaded buckets are intact.
 */
export function createNativeIndexReader(store,root,scope,fail){
 validateNativeIndexRoot(root,scope);
 const manifest={...root,format:NATIVE_PARTITION_FORMAT,projects:{},refs:{}},records=new Map(),pending=new Map();let failed=false;
 const reject=error=>{if(failed)return;failed=true;pending.clear();fail(error);};
 function bucket(kind,bucketId,done){
  if(failed)return;const pointer=root[kind][bucketId];if(!pointer){done(null);return;}
  const key=nativeIndexKey(root.scopeKey,kind,bucketId,pointer.revision);
  if(records.has(key)){done(records.get(key).payload);return;}
  if(pending.has(key)){pending.get(key).push(done);return;}
  pending.set(key,[done]);
  try{const request=store.get(key);request.onsuccess=()=>{if(failed)return;try{
   const record=request.result,piece=verifyNativeIndexPiece(record,root,kind,bucketId);
   // Targeted consumers resolve versions through lookup. Full consumers
   // receive the complete ordered maps from all(); do not build a second,
   // unordered inventory here only to discard it during materialization.
   records.set(key,record);
   const callbacks=pending.get(key);pending.delete(key);for(const callback of callbacks){if(failed)break;callback(piece);}
  }catch(error){reject(error);}};request.onerror=()=>reject(request.error??Error('native-index-read-failed'));}catch(error){reject(error);}
 }
 function lookup(kind,key,done){
  if(failed)return;try{if(!['projects','refs'].includes(kind))throw Error('invalid-native-index-kind');id(key);bucket(kind,nativeIndexBucket(key),piece=>done(piece?.versions[key]));}catch(error){reject(error);}
 }
 function all(done){
  if(failed)return;const entries=['projects','refs'].flatMap(kind=>Object.keys(root[kind]).map(key=>[kind,key]));let remaining=entries.length;
  const finish=()=>{if(failed)return;try{const complete=materializeNativeVersionIndex(root,scope,[...records.values()]);manifest.projects=complete.projects;manifest.refs=complete.refs;done(manifest);}catch(error){reject(error);}};
  if(!remaining){finish();return;}
  for(const [kind,key] of entries)bucket(kind,key,()=>{if(!--remaining)finish();});
 }
 return {root,manifest,records,lookup,all,readBucket:bucket};
}
