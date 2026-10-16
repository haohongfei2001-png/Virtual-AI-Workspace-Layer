import {VerifiedRecordCache} from './verified-record-cache.mjs';
import {normalizedScope} from '../b1/identity.mjs';
import {id,exact} from './state.mjs';
import {stable,digest} from './hash.mjs';
import {manifest_PARTITION_FORMAT,manifest_checkManifest,manifest_partitionRecord,manifest_partitionUnpack} from './partition-manifest.mjs';
const PARTITION_FORMAT=manifest_PARTITION_FORMAT,checkManifest=manifest_checkManifest,partitionRecord=manifest_partitionRecord,partitionUnpack=manifest_partitionUnpack;

export const SHARED_DIRECTORY_FORMAT='vaiwl-shared-ref-directory-v1';
const MAX_REFS=100000,MAX_RECORD=16*1024*1024;
const metadata=['generation','scopeKey','revision','channel','sources','workspaces','preferences','humanRefs','units','changes'];
const scopeKey=scope=>{const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');return s.key;};
const bucketId=b=>{if(typeof b!=='string'||!/^[0-9a-f]{2}$/.test(b))throw Error('invalid-shared-directory-bucket');};
const version=(v,max)=>{if(!Number.isSafeInteger(v)||v<1||v>max)throw Error('invalid-shared-directory-version');};
export const sharedRefBucket=ref=>{id(ref);return digest(ref).slice(0,2);};
export const sharedRefDirectoryKey=(scope,generation,bucket,revision)=>JSON.stringify([scope,'shared-ref-directory',generation,bucket,revision]);
const legacy=(root,refVersions)=>({format:PARTITION_FORMAT,...Object.fromEntries(metadata.map(k=>[k,root[k]])),refVersions});
function countDirectory(root){
 const rows=root.refDirectory;if(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.keys(rows).length>256)throw Error('invalid-shared-directory');
 let count=0,units=0;for(const [bucket,p] of Object.entries(rows)){bucketId(bucket);exact(p,['revision','count','units']);version(p.revision,root.revision);version(p.count,MAX_REFS);version(p.units,MAX_RECORD);count+=p.count;units+=p.units;}
 if(count>MAX_REFS)throw Error('shared-directory-capacity');
 if(!Number.isSafeInteger(root.nextOrdinal)||root.nextOrdinal<count||root.nextOrdinal<0)throw Error('invalid-shared-directory-order');
 // Preserve the old 16Mi manifest boundary without reconstructing all keys.
 // Per-bucket units omit object braces and commas; the full map adds them once.
 if(stable(legacy(root,{})).length+units+Math.max(0,count-1)>MAX_RECORD)throw Error('state-too-large');return count;
}
/** Root validation checks metadata syntax, not the existence of human/preference
 * targets. Those claims require verified buckets and full legacy validation.
 */
function validateRootStructure(root,scope){
 exact(root,['format',...metadata,'refDirectory','nextOrdinal']);if(root.format!==SHARED_DIRECTORY_FORMAT)throw Error('invalid-shared-directory-format');
 const count=countDirectory(root),refs={};
 // Reuse the original metadata validators with explicit target claims only.
 // Never expose this synthetic map as an inventory or pass it to storage reads.
 if(!Array.isArray(root.humanRefs))throw Error('invalid-human-ref-index');
 const claimed=[...root.humanRefs,...(root.preferences?.workingSet?.value?.refs??[]),...(root.preferences?.savedSnippets?.value??[]).map(row=>row.refId)];
 for(const ref of claimed){id(ref);refs[ref]=1;}
 if(Object.keys(refs).length>count)throw Error('orphan-shared-directory-metadata');
 checkManifest(legacy(root,refs),scopeKey(scope));if(stable(root).length>MAX_RECORD)throw Error('state-too-large');return root;
}
// This cache certifies structure only. Owners separately verify the stored
// envelope checksum. Every caller's fresh object is encoded and compared in
// full, including large change lists; no mutable object identity is trusted.
const rootValidation=new VerifiedRecordCache({maxEntries:8,maxChars:16*1024*1024});
export function validateSharedDirectoryRoot(root,scope){
 const key=scopeKey(scope);
 return rootValidation.read({key,payload:root,checksum:'shared-directory-structure-v1'},key,()=>validateRootStructure(root,scope));
}
const pieceValidation=new VerifiedRecordCache({maxEntries:512,maxChars:8*1024*1024});
export function verifySharedDirectoryPiece(record,root,bucket){
 bucketId(bucket);const pointer=root.refDirectory[bucket];if(!pointer)throw Error('missing-shared-directory-pointer');
 if(record?.key!==sharedRefDirectoryKey(root.scopeKey,root.generation,bucket,pointer.revision))throw Error('shared-directory-key-mismatch');
 const context=JSON.stringify([root.scopeKey,root.generation,bucket,pointer.revision,pointer.count,pointer.units]);
 const piece=pieceValidation.read(record,context,()=>validatePiece(record,root,bucket,pointer));
 // Appending a ref changes this ceiling, not the bytes or routing of every
 // untouched bucket. Still check the CURRENT bound on every cached read.
 if(piece.ordinals.some(ordinal=>ordinal>=root.nextOrdinal))throw Error('invalid-shared-directory-order');
 return piece;
}
function validatePiece(record,root,bucket,pointer){
 return validatePiecePayload(partitionUnpack(record),root,bucket,pointer);
}
function validatePiecePayload(p,root,bucket,pointer,routingVerified=false){
 exact(p,['scopeKey','generation','bucket','revision','versions','ordinals']);
 if(p.scopeKey!==root.scopeKey||p.generation!==root.generation||p.bucket!==bucket||p.revision!==pointer.revision)throw Error('shared-directory-context-mismatch');
 if(!p.versions||typeof p.versions!=='object'||Array.isArray(p.versions))throw Error('invalid-shared-directory-versions');
 const keys=Object.keys(p.versions);if(keys.length!==pointer.count)throw Error('shared-directory-count-mismatch');
 if(!Array.isArray(p.ordinals)||p.ordinals.length!==keys.length||Object.keys(p.ordinals).length!==keys.length)throw Error('invalid-shared-directory-order');
 let units=0;const seen=new Set();for(let i=0;i<keys.length;i++){const ordinal=p.ordinals[i];if(!Number.isSafeInteger(ordinal)||ordinal<0||ordinal>=root.nextOrdinal||seen.has(ordinal))throw Error('invalid-shared-directory-order');seen.add(ordinal);if(!routingVerified&&sharedRefBucket(keys[i])!==bucket)throw Error('shared-directory-routing-mismatch');version(p.versions[keys[i]],pointer.revision);units+=JSON.stringify(keys[i]).length+1+String(p.versions[keys[i]]).length;}
 if(units!==pointer.units)throw Error('shared-directory-units-mismatch');
 if(stable(p).length>MAX_RECORD)throw Error('state-too-large');return p;
}
function makeBucket(root,bucket,versions,ordinals){
 const keys=Object.keys(versions);root.refDirectory[bucket]={revision:root.revision,count:keys.length,units:keys.reduce((sum,key)=>sum+JSON.stringify(key).length+1+String(versions[key]).length,0)};
 const record=partitionRecord(sharedRefDirectoryKey(root.scopeKey,root.generation,bucket,root.revision),{scopeKey:root.scopeKey,generation:root.generation,bucket,revision:root.revision,versions,ordinals:keys.map(k=>ordinals[k])});
 // Only build/update call this constructor: every existing input piece was
 // verified, and every new ref was independently routed before grouping.
 // Certify these freshly constructed bytes once; fresh or mutated storage
 // bytes still take the full checksum/routing validator above.
 const pointer=root.refDirectory[bucket],context=JSON.stringify([root.scopeKey,root.generation,bucket,pointer.revision,pointer.count,pointer.units]);
 pieceValidation.read(record,context,()=>validatePiecePayload(record.payload,root,bucket,pointer,true));return record;
}
export function buildSharedRefDirectory(manifest,scope){
 checkManifest(manifest,scopeKey(scope));const {refVersions,...rest}=manifest,root={...rest,format:SHARED_DIRECTORY_FORMAT,refDirectory:{},nextOrdinal:Object.keys(refVersions).length},groups=new Map(),records=[];let ordinal=0;
 for(const [ref,v] of Object.entries(refVersions)){const bucket=sharedRefBucket(ref);if(!groups.has(bucket))groups.set(bucket,{versions:{},ordinals:{}});const g=groups.get(bucket);g.versions[ref]=v;g.ordinals[ref]=ordinal++;}
 for(const [bucket,g] of groups)records.push(makeBucket(root,bucket,g.versions,g.ordinals));validateSharedDirectoryRoot(root,scope);return {root,records};
}
export function materializeSharedRefDirectory(root,scope,records){
 validateSharedDirectoryRoot(root,scope);const byKey=new Map(),rows=[],seen=new Set();for(const record of records){if(byKey.has(record.key))throw Error('duplicate-shared-directory-record');byKey.set(record.key,record);}
 for(const [bucket,pointer] of Object.entries(root.refDirectory)){const p=verifySharedDirectoryPiece(byKey.get(sharedRefDirectoryKey(root.scopeKey,root.generation,bucket,pointer.revision)),root,bucket),keys=Object.keys(p.versions);for(let i=0;i<keys.length;i++){const ordinal=p.ordinals[i];if(seen.has(ordinal))throw Error('invalid-shared-directory-order');seen.add(ordinal);rows.push({ref:keys[i],version:p.versions[keys[i]],ordinal});}}
 if(byKey.size!==Object.keys(root.refDirectory).length)throw Error('unexpected-shared-directory-record');
 rows.sort((a,b)=>a.ordinal-b.ordinal);const manifest=legacy(root,Object.fromEntries(rows.map(row=>[row.ref,row.version])));checkManifest(manifest,scopeKey(scope));return manifest;
}
/** Directory-only update, not permission to delete a known native conversation.
 * The owner must reconcile humanRefs/preferences and commit all data/receipts
 * atomically; old immutable records remain available to its checkpoint/GC policy.
 */
export function updateSharedRefDirectory(root,scope,revision,updates,records,options={}){
 exact(options,[],['metadata']);const metadataPatch=options.metadata===undefined?{}:options.metadata;exact(metadataPatch,[],['channel','sources','workspaces','preferences','humanRefs','units','changes']);
 validateSharedDirectoryRoot(root,scope);version(revision,Number.MAX_SAFE_INTEGER);if(revision!==root.revision+1)throw Error('shared-directory-revision-conflict');
 if(!updates||typeof updates!=='object'||Array.isArray(updates)||Object.keys(updates).length>20000)throw Error('invalid-shared-directory-updates');
 const next={...root,revision,refDirectory:{...root.refDirectory}},byKey=new Map(),used=new Set(),groups=new Map(),written=[];let count=countDirectory(root);
 for(const record of records){if(byKey.has(record.key))throw Error('duplicate-shared-directory-record');byKey.set(record.key,record);}
 for(const [ref,v] of Object.entries(updates)){
  id(ref);if(v!==null&&v!==revision)throw Error('invalid-shared-directory-update-version');const bucket=sharedRefBucket(ref);
  if(!groups.has(bucket)){let versions={},ordinals={};const pointer=root.refDirectory[bucket];if(pointer){const key=sharedRefDirectoryKey(root.scopeKey,root.generation,bucket,pointer.revision),p=verifySharedDirectoryPiece(byKey.get(key),root,bucket);used.add(key);versions={...p.versions};Object.keys(versions).forEach((k,i)=>ordinals[k]=p.ordinals[i]);}groups.set(bucket,{versions,ordinals});}
  const g=groups.get(bucket),exists=Object.hasOwn(g.versions,ref);
  if(v===null){if(exists){delete g.versions[ref];delete g.ordinals[ref];count--;}continue;}
  if(!exists){if(next.nextOrdinal===Number.MAX_SAFE_INTEGER)throw Error('shared-directory-order-exhausted');g.ordinals[ref]=next.nextOrdinal++;count++;}g.versions[ref]=v;
 }
 if(used.size!==byKey.size)throw Error('unexpected-shared-directory-record');if(count>MAX_REFS)throw Error('shared-directory-capacity');
 for(const [bucket,g] of groups){if(Object.keys(g.versions).length)written.push(makeBucket(next,bucket,g.versions,g.ordinals));else delete next.refDirectory[bucket];}
 Object.assign(next,metadataPatch);validateSharedDirectoryRoot(next,scope);return {root:next,records:written};
}
