import {VerifiedRecordCache} from './verified-record-cache.mjs';
import {digest,stable} from './hash.mjs';
import {id,exact} from './state.mjs';
import {validateNativeManifest,NATIVE_PARTITION_FORMAT,nativeRecord,nativeUnpack} from './native-partitions.mjs';

export const NATIVE_INDEX_FORMAT='vaiwl-native-version-index-v1';
const kinds=['projects','refs'],maxCount=100000;
export const nativeIndexBucket=key=>{id(key);return digest(key).slice(0,2);};
export const nativeIndexKey=(scope,kind,bucket,revision)=>JSON.stringify([scope,'native-version-index',kind,bucket,revision]);
const bucketId=b=>{if(typeof b!=='string'||!/^[0-9a-f]{2}$/.test(b))throw Error('invalid-native-index-bucket');};
const version=(v,ceiling)=>{if(!Number.isSafeInteger(v)||v<1||v>ceiling)throw Error('invalid-native-index-version');};
function directory(rows,revision){
 if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('invalid-native-index-directory');
 const keys=Object.keys(rows);if(keys.length>256)throw Error('native-index-capacity');let count=0;
 for(const bucket of keys){bucketId(bucket);const entry=rows[bucket];exact(entry,['revision','count']);version(entry.revision,revision);if(!Number.isSafeInteger(entry.count)||entry.count<1||entry.count>maxCount)throw Error('invalid-native-index-count');count+=entry.count;}
 if(count>maxCount)throw Error('native-index-capacity');return count;
}
/** Validate small root metadata with the original source/change/size contracts.
 * Directory counts are claims until the requested immutable buckets are checked.
 */
export function validateNativeIndexRoot(root,scope){
 exact(root,['format','scopeKey','revision','sources','projects','refs','units','changes']);
 if(root.format!==NATIVE_INDEX_FORMAT)throw Error('invalid-native-index-format');
 for(const kind of kinds)directory(root[kind],root.revision);
 validateNativeManifest({...root,format:NATIVE_PARTITION_FORMAT,projects:{},refs:{}},scope);
 if(stable(root).length>16*1024*1024)throw Error('native-manifest-too-large');return root;
}
// Bounded byte-validation cache only: each newly read payload is fully encoded
// and compared. Scope, physical identity and directory count remain contextual.
// No facts, IDB records or source permissions survive a read through this cache.
const indexPieceValidation=new VerifiedRecordCache({maxEntries:512,maxChars:8*1024*1024});
export function verifyNativeIndexPiece(record,root,kind,bucket){
 if(!kinds.includes(kind))throw Error('invalid-native-index-kind');bucketId(bucket);
 const pointer=root[kind][bucket];if(!pointer)throw Error('missing-native-index-pointer');
 if(record?.key!==nativeIndexKey(root.scopeKey,kind,bucket,pointer.revision))throw Error('native-index-key-mismatch');
 const context=JSON.stringify([root.scopeKey,kind,bucket,pointer.revision,pointer.count]);
 return indexPieceValidation.read(record,context,()=>validateIndexPiece(record,root,kind,bucket,pointer));
}
function validateIndexPiece(record,root,kind,bucket,pointer){
 const payload=nativeUnpack(record);exact(payload,['scopeKey','kind','bucket','revision','versions','ordinals']);
 if(payload.scopeKey!==root.scopeKey||payload.kind!==kind||payload.bucket!==bucket||payload.revision!==pointer.revision)throw Error('native-index-context-mismatch');
 const rows=payload.versions;if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('invalid-native-index-rows');
 const keys=Object.keys(rows);if(keys.length!==pointer.count)throw Error('native-index-count-mismatch');
 const ordinals=payload.ordinals,seen=new Set();if(!Array.isArray(ordinals)||ordinals.length!==keys.length||Object.keys(ordinals).length!==keys.length)throw Error('invalid-native-index-order');
 for(let i=0;i<keys.length;i++){const key=keys[i],ordinal=ordinals[i];if(!Object.hasOwn(ordinals,i)||!Number.isSafeInteger(ordinal)||ordinal<0||ordinal>=maxCount||seen.has(ordinal))throw Error('invalid-native-index-order');seen.add(ordinal);if(nativeIndexBucket(key)!==bucket)throw Error('native-index-routing-mismatch');version(rows[key],pointer.revision);}
 if(stable(payload).length>16*1024*1024)throw Error('native-record-too-large');return payload;
}
/** Pure migration builder. The owner must publish all pieces and root atomically. */
export function buildNativeVersionIndex(manifest,scope){
 validateNativeManifest(manifest,scope);const root={...manifest,format:NATIVE_INDEX_FORMAT,projects:{},refs:{}},records=[];
 for(const kind of kinds){const groups=new Map();let ordinal=0;for(const key of Object.keys(manifest[kind])){const bucket=nativeIndexBucket(key);if(!groups.has(bucket))groups.set(bucket,{versions:{},ordinals:{}});groups.get(bucket).versions[key]=manifest[kind][key];groups.get(bucket).ordinals[key]=ordinal++;}
  for(const [bucket,{versions,ordinals}] of groups){root[kind][bucket]={revision:root.revision,count:Object.keys(versions).length};const payload={scopeKey:root.scopeKey,kind,bucket,revision:root.revision,versions,ordinals:Object.keys(versions).map(key=>ordinals[key])};records.push(nativeRecord(nativeIndexKey(root.scopeKey,kind,bucket,root.revision),payload));}
 }
 validateNativeIndexRoot(root,scope);return {root,records};
}
/** Materialize only after every directory entry has a verified immutable record.
 * Returning the old shape keeps legacy projection logic separate from storage.
 */
export function materializeNativeVersionIndex(root,scope,records){
 validateNativeIndexRoot(root,scope);const byKey=new Map();for(const record of records){if(byKey.has(record.key))throw Error('duplicate-native-index-record');byKey.set(record.key,record);}
 const manifest={...root,format:NATIVE_PARTITION_FORMAT,projects:{},refs:{}};let expected=0;
 for(const kind of kinds){const ordered=[];for(const bucket of Object.keys(root[kind])){expected++;const pointer=root[kind][bucket],key=nativeIndexKey(root.scopeKey,kind,bucket,pointer.revision),piece=verifyNativeIndexPiece(byKey.get(key),root,kind,bucket);Object.keys(piece.versions).forEach((key,i)=>ordered.push({key,version:piece.versions[key],ordinal:piece.ordinals[i]}));}
 ordered.sort((a,b)=>a.ordinal-b.ordinal);for(let i=0;i<ordered.length;i++){if(ordered[i].ordinal!==i)throw Error('invalid-native-index-order');manifest[kind][ordered[i].key]=ordered[i].version;}}
 if(byKey.size!==expected)throw Error('unexpected-native-index-record');validateNativeManifest(manifest,scope);return manifest;
}
/** Copy-on-write replacement of touched buckets only. Unchanged pointers survive.
 * No caller-provided count is trusted. No deletes: native known refs remain reachable.
 */
export function updateNativeVersionIndex(root,scope,revision,updates,records){
 validateNativeIndexRoot(root,scope);version(revision,Number.MAX_SAFE_INTEGER);if(revision!==root.revision+1)throw Error('native-index-revision-conflict');
 exact(updates,['projects','refs']);const next={...root,revision,projects:{...root.projects},refs:{...root.refs}},byKey=new Map(),written=[];
 for(const record of records){if(byKey.has(record.key))throw Error('duplicate-native-index-record');byKey.set(record.key,record);}
 const consumed=new Set();
 for(const kind of kinds){
  const rows=updates[kind];if(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.keys(rows).length>10000)throw Error('invalid-native-index-updates');
  const groups=new Map();let nextOrdinal=directory(root[kind],root.revision);
  for(const key of Object.keys(rows)){
   if(rows[key]!==revision)throw Error('invalid-native-index-update-version');const bucket=nativeIndexBucket(key);
   if(!groups.has(bucket)){
    const pointer=root[kind][bucket];let versions={},ordinals={};
    if(pointer){const physicalKey=nativeIndexKey(root.scopeKey,kind,bucket,pointer.revision),piece=verifyNativeIndexPiece(byKey.get(physicalKey),root,kind,bucket);versions={...piece.versions};ordinals=Object.fromEntries(Object.keys(piece.versions).map((key,i)=>[key,piece.ordinals[i]]));consumed.add(physicalKey);}
    groups.set(bucket,{versions,ordinals});
   }
   const group=groups.get(bucket);if(!Object.hasOwn(group.versions,key))group.ordinals[key]=nextOrdinal++;group.versions[key]=revision;
  }
  for(const [bucket,{versions,ordinals}] of groups){next[kind][bucket]={revision,count:Object.keys(versions).length};written.push(nativeRecord(nativeIndexKey(root.scopeKey,kind,bucket,revision),{scopeKey:root.scopeKey,kind,bucket,revision,versions,ordinals:Object.keys(versions).map(key=>ordinals[key])}));}
 }
 if(consumed.size!==byKey.size)throw Error('unexpected-native-index-record');validateNativeIndexRoot(next,scope);return {root:next,records:written};
}
