import {VerifiedRecordCache} from './verified-record-cache.mjs';
import {captureJSONSnapshot} from './capture-json-snapshot.mjs';
import {normalizedScope} from '../b1/identity.mjs';
import {digest,stable} from './hash.mjs';
import {sha256} from './hash.mjs';
import {id,exact} from './state.mjs';
import {validateNativeManifest,NATIVE_PARTITION_FORMAT,nativeRecord,nativeUnpack} from './native-partitions.mjs';

export const NATIVE_INDEX_FORMAT='vaiwl-native-version-index-v1';
const kinds=['projects','refs'],maxCount=100000;
const rootSnapshots=new WeakMap();
const rootScope=scope=>{const normalized=normalizedScope(scope);if(!normalized)throw Error('unverified-scope');return normalized;};
function freezeRoot(root,scope){
 const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const key of Object.keys(value))freeze(value[key]);Object.freeze(value);}};
 freeze(root);rootSnapshots.set(root,scope.key);return root;
}
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
 const normalized=rootScope(scope);
 if(rootSnapshots.get(root)===normalized.key)return root;
 checkNativeIndexRoot(root,normalized);
 if(stable(root).length>16*1024*1024)throw Error('native-manifest-too-large');return root;
}
/** Capture before validating: getters run once and caller-owned objects remain mutable.
 * Only this exact getter-free, deeply frozen object can reuse its schema proof.
 * This proof says nothing about current source permissions or stored envelopes.
 */
export function snapshotNativeIndexRoot(root,scope){
 const normalized=rootScope(scope);if(rootSnapshots.get(root)===normalized.key)return root;
 const copy=captureJSONSnapshot(root);
 validateNativeIndexRoot(copy,normalized);return freezeRoot(copy,normalized);
}
/** Each new IDB row is captured and fully byte-compared. The bounded cache retains
 * encodings only; callers always receive their current read's immutable payload.
 */
export function createNativeIndexRootRecordReader(){
 const validation=new VerifiedRecordCache({maxEntries:3,maxChars:8*1024*1024});
 return (record,scope,expectedKey)=>{
  const normalized=rootScope(scope),key=expectedKey===undefined?normalized.key:expectedKey,copy=captureJSONSnapshot(record);
  if(typeof key!=='string'||!key.length||copy?.key!==key)throw Error('native-index-key-mismatch');
  if(typeof copy.checksum!=='string'||!/^[0-9a-f]{64}$/.test(copy.checksum))throw Error('corrupt-native-record');
  const root=validation.read(copy,JSON.stringify([normalized.key,copy.checksum]),()=>validateNativeIndexRoot(nativeUnpack(copy),normalized));
  return freezeRoot(root,normalized);
 };
}
function checkNativeIndexRoot(root,scope){
 exact(root,['format','scopeKey','revision','sources','projects','refs','units','changes']);
 if(root.format!==NATIVE_INDEX_FORMAT)throw Error('invalid-native-index-format');
 for(const kind of kinds)directory(root[kind],root.revision);
 validateNativeManifest({...root,format:NATIVE_PARTITION_FORMAT,projects:{},refs:{}},scope);
}
// Bounded byte-validation cache only: each newly read payload is fully encoded
// and compared. Scope, physical identity and directory count remain contextual.
// No facts, IDB records or source permissions survive a read through this cache.
const indexPieceValidation=new VerifiedRecordCache({maxEntries:512,maxChars:8*1024*1024});
// Proof belongs only to a fully verified, getter-free, deeply frozen snapshot.
// Weak keys neither retain records nor extend the bounded byte cache's lifetime.
const indexSnapshots=new WeakMap();
export function snapshotNativeIndexPiece(record,root,kind,bucket){
 const pointer=root[kind]?.[bucket],contextRoot={scopeKey:root.scopeKey,[kind]:{[bucket]:pointer?{revision:pointer.revision,count:pointer.count}:undefined}};
 const copy=structuredClone(record),piece=verifyNativeIndexPiece(copy,contextRoot,kind,bucket);
 Object.freeze(piece.versions);Object.freeze(piece.ordinals);Object.freeze(piece);Object.freeze(copy);
 const verified=contextRoot[kind][bucket];
 indexSnapshots.set(copy,JSON.stringify([contextRoot.scopeKey,kind,bucket,verified.revision,verified.count]));
 return copy;
}
function updateIndexPiece(record,root,kind,bucket){
 const pointer=root[kind][bucket],context=JSON.stringify([root.scopeKey,kind,bucket,pointer.revision,pointer.count]);
 if(indexSnapshots.get(record)===context)return record.payload;
 return verifyNativeIndexPiece(structuredClone(record),root,kind,bucket);
}
export function verifyNativeIndexPiece(record,root,kind,bucket){
 if(!kinds.includes(kind))throw Error('invalid-native-index-kind');bucketId(bucket);
 const pointer=root[kind][bucket];if(!pointer)throw Error('missing-native-index-pointer');
 if(record?.key!==nativeIndexKey(root.scopeKey,kind,bucket,pointer.revision))throw Error('native-index-key-mismatch');
 const context=JSON.stringify([root.scopeKey,kind,bucket,pointer.revision,pointer.count]);
 return indexPieceValidation.read(record,context,()=>validateIndexPiece(record,root,kind,bucket,pointer));
}
function validateIndexPiece(record,root,kind,bucket,pointer){
 return validateIndexPayload(nativeUnpack(record),root,kind,bucket,pointer);
}
function validateIndexPayload(payload,root,kind,bucket,pointer,routingVerified=false){
 exact(payload,['scopeKey','kind','bucket','revision','versions','ordinals']);
 if(payload.scopeKey!==root.scopeKey||payload.kind!==kind||payload.bucket!==bucket||payload.revision!==pointer.revision)throw Error('native-index-context-mismatch');
 const rows=payload.versions;if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('invalid-native-index-rows');
 const keys=Object.keys(rows);if(keys.length!==pointer.count)throw Error('native-index-count-mismatch');
 const ordinals=payload.ordinals,seen=new Set();if(!Array.isArray(ordinals)||ordinals.length!==keys.length||Object.keys(ordinals).length!==keys.length)throw Error('invalid-native-index-order');
 for(let i=0;i<keys.length;i++){const key=keys[i],ordinal=ordinals[i];if(!Object.hasOwn(ordinals,i)||!Number.isSafeInteger(ordinal)||ordinal<0||ordinal>=maxCount||seen.has(ordinal))throw Error('invalid-native-index-order');seen.add(ordinal);if(!routingVerified&&nativeIndexBucket(key)!==bucket)throw Error('native-index-routing-mismatch');version(rows[key],pointer.revision);}
 if(stable(payload).length>16*1024*1024)throw Error('native-record-too-large');return payload;
}
// Private constructor: old members came from verified pieces and every new key
// was routed before grouping. Certify these newly checksummed bytes without
// hashing their routes again; fresh/mutated storage reads keep the full validator.
function makeIndexBucket(root,kind,bucket,versions,ordinals){
 const keys=Object.keys(versions),pointer={revision:root.revision,count:keys.length};
 root[kind][bucket]=pointer;
 const record=nativeRecord(nativeIndexKey(root.scopeKey,kind,bucket,root.revision),{scopeKey:root.scopeKey,kind,bucket,revision:root.revision,versions,ordinals:keys.map(key=>ordinals[key])});
 const context=JSON.stringify([root.scopeKey,kind,bucket,pointer.revision,pointer.count]);
 indexPieceValidation.read(record,context,()=>validateIndexPayload(record.payload,root,kind,bucket,pointer,true));
 return record;
}
/** Pure migration builder. The owner must publish all pieces and root atomically. */
export function buildNativeVersionIndex(manifest,scope){
 validateNativeManifest(manifest,scope);const root={...manifest,format:NATIVE_INDEX_FORMAT,projects:{},refs:{}},records=[];
 for(const kind of kinds){const groups=new Map();let ordinal=0;for(const key of Object.keys(manifest[kind])){const bucket=nativeIndexBucket(key);if(!groups.has(bucket))groups.set(bucket,{versions:{},ordinals:{}});groups.get(bucket).versions[key]=manifest[kind][key];groups.get(bucket).ordinals[key]=ordinal++;}
  for(const [bucket,{versions,ordinals}] of groups)records.push(makeIndexBucket(root,kind,bucket,versions,ordinals));
 }
 validateNativeIndexRoot(root,scope);return {root,records};
}
/** Materialize only after every directory entry has a verified immutable record.
 * Returning the old shape keeps legacy projection logic separate from storage.
 */
export function materializeNativeVersionIndex(root,scope,records){
 validateNativeIndexRoot(root,scope);const byKey=new Map();for(const record of records){if(byKey.has(record.key))throw Error('duplicate-native-index-record');byKey.set(record.key,record);}
 const manifest={...root,format:NATIVE_PARTITION_FORMAT,projects:{},refs:{}};let expected=0;
 for(const kind of kinds){
 const buckets=Object.keys(root[kind]),count=buckets.reduce((sum,b)=>sum+root[kind][b].count,0),keys=new Array(count),versions=new Array(count);let orderError=false;
 for(const bucket of buckets){expected++;const pointer=root[kind][bucket],physicalKey=nativeIndexKey(root.scopeKey,kind,bucket,pointer.revision),piece=verifyNativeIndexPiece(byKey.get(physicalKey),root,kind,bucket);
 const names=Object.keys(piece.versions);for(let i=0;i<names.length;i++){const ordinal=piece.ordinals[i];if(ordinal>=count||keys[ordinal]!==undefined){orderError=true;continue;}keys[ordinal]=names[i];versions[ordinal]=piece.versions[names[i]];}}
 if(orderError)throw Error('invalid-native-index-order');for(let i=0;i<count;i++){if(keys[i]===undefined)throw Error('invalid-native-index-order');manifest[kind][keys[i]]=versions[i];}}

 if(byKey.size!==expected)throw Error('unexpected-native-index-record');validateNativeManifest(manifest,scope);return manifest;
}
/** Copy-on-write replacement of touched buckets only. Unchanged pointers survive.
 * No caller-provided count is trusted. No deletes: native known refs remain reachable.
 */
export function updateNativeVersionIndex(root,scope,revision,updates,records){
 const built=updateIndexPieces(root,scope,revision,updates,records);validateNativeIndexRoot(built.root,scope);return built;
}
/** Build the final writer root before validation; no caller-supplied proof or hash.
 * The same canonical bytes enforce the size bound and produce the checksum.
 */
export function buildNativeIndexUpdateRecord(root,scope,revision,updates,records,metadata){
 const normalized=rootScope(scope);
 const captured=captureJSONSnapshot(metadata);exact(captured,['sources','units','changes']);
 const built=updateIndexPieces(root,normalized,revision,updates,records);
 Object.assign(built.root,captured);built.root=captureJSONSnapshot(built.root);checkNativeIndexRoot(built.root,normalized);
 const encoded=stable(built.root);if(encoded.length>16*1024*1024)throw Error('native-manifest-too-large');
 freezeRoot(built.root,normalized);
 return {...built,rootRecord:{key:built.root.scopeKey,payload:built.root,checksum:sha256(encoded)}};
}
function updateIndexPieces(root,scope,revision,updates,records){
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
    // Consume only the exact getter-free snapshot that passed byte validation.
    if(pointer){const physicalKey=nativeIndexKey(root.scopeKey,kind,bucket,pointer.revision),piece=updateIndexPiece(byKey.get(physicalKey),root,kind,bucket);versions={...piece.versions};ordinals=Object.fromEntries(Object.keys(piece.versions).map((key,i)=>[key,piece.ordinals[i]]));consumed.add(physicalKey);}
    groups.set(bucket,{versions,ordinals});
   }
   const group=groups.get(bucket);if(!Object.hasOwn(group.versions,key))group.ordinals[key]=nextOrdinal++;group.versions[key]=revision;
  }
  if(nextOrdinal>maxCount)throw Error('native-index-capacity');
  for(const [bucket,{versions,ordinals}] of groups)written.push(makeIndexBucket(next,kind,bucket,versions,ordinals));
 }
 if(consumed.size!==byKey.size)throw Error('unexpected-native-index-record');return {root:next,records:written};
}
