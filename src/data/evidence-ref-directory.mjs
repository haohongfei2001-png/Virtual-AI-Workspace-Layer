import {VerifiedRecordCache} from './verified-record-cache.mjs';
import {normalizedScope} from '../b1/identity.mjs';
import {id,exact} from './state.mjs';
import {digest,stable} from './hash.mjs';
import {validateEvidenceManifest,evidenceRecord,unpackEvidence} from './free-evidence-partitions.mjs';

export const EVIDENCE_DIRECTORY_FORMAT='vaiwl-free-evidence-directory-v1';
const LEGACY='vaiwl-free-evidence-partitions-v1',MAX_REFS=100000,MAX_RECORD=16*1024*1024,MAX_TOTAL=128*1024*1024;
const scopeOf=scope=>{const value=normalizedScope(scope);if(!value)throw Error('unverified-scope');return value;};
const positive=(value,max)=>{if(!Number.isSafeInteger(value)||value<1||value>max)throw Error('invalid-evidence-directory-number');};
const bucketId=value=>{if(typeof value!=='string'||!/^[0-9a-f]{2}$/.test(value))throw Error('invalid-evidence-directory-bucket');};
export const evidenceRefBucket=ref=>{id(ref);return digest(ref).slice(0,2);};
export const evidenceRefDirectoryKey=(scopeKey,bucket,revision)=>JSON.stringify([scopeKey,'free-evidence-ref-directory',bucket,revision]);
function totals(directory,revision){
 if(!directory||typeof directory!=='object'||Array.isArray(directory)||Object.keys(directory).length>256)throw Error('invalid-evidence-directory');
 let count=0,bytes=0;for(const [bucket,pointer] of Object.entries(directory)){bucketId(bucket);exact(pointer,['revision','count','bytes']);positive(pointer.revision,revision);positive(pointer.count,MAX_REFS);positive(pointer.bytes,MAX_TOTAL);count+=pointer.count;bytes+=pointer.bytes;}
 if(count>MAX_REFS||bytes>MAX_TOTAL)throw Error('evidence-directory-capacity');return {count,bytes};
}
function legacyHeader(root){return {format:LEGACY,scopeKey:root.scopeKey,revision:root.revision,sources:root.sources,refVersions:{},indexVersions:root.indexVersions,counts:root.counts,sizes:{}};}
/** Counts and byte totals are directory claims until the referenced buckets are verified. */
export function validateEvidenceDirectoryRoot(root,scope){
 const normalized=scopeOf(scope);exact(root,['format','scopeKey','revision','sources','directory','indexVersions','counts']);
 if(root.format!==EVIDENCE_DIRECTORY_FORMAT)throw Error('invalid-evidence-directory-format');
 validateEvidenceManifest(legacyHeader(root),normalized);totals(root.directory,root.revision);
 if(stable(root).length>MAX_RECORD)throw Error('free-evidence-too-large');return root;
}
// Retain validation strings only. Every fresh read must match all bytes again;
// directory count/bytes changes invalidate context even at the same piece key.
const pieceValidation=new VerifiedRecordCache({maxEntries:512,maxChars:8*1024*1024});
/** Version, size and ordinal share one immutable record and aligned key order. */
export function verifyEvidenceDirectoryPiece(record,root,bucket){
 bucketId(bucket);const pointer=root.directory[bucket];if(!pointer)throw Error('missing-evidence-directory-pointer');
 if(record?.key!==evidenceRefDirectoryKey(root.scopeKey,bucket,pointer.revision))throw Error('evidence-directory-key-mismatch');
 const context=JSON.stringify([root.scopeKey,bucket,pointer.revision,pointer.count,pointer.bytes]);
 return pieceValidation.read(record,context,()=>validateDirectoryPiece(record,root,bucket,pointer));
}
function validateDirectoryPiece(record,root,bucket,pointer){
 const piece=unpackEvidence(record);exact(piece,['scopeKey','bucket','revision','versions','sizes','ordinals']);
 if(piece.scopeKey!==root.scopeKey||piece.bucket!==bucket||piece.revision!==pointer.revision)throw Error('evidence-directory-context-mismatch');
 const versions=piece.versions;if(!versions||typeof versions!=='object'||Array.isArray(versions))throw Error('invalid-evidence-directory-versions');
 const keys=Object.keys(versions);if(keys.length!==pointer.count)throw Error('evidence-directory-count-mismatch');
 for(const rows of [piece.sizes,piece.ordinals])if(!Array.isArray(rows)||rows.length!==keys.length||Object.keys(rows).length!==keys.length)throw Error('invalid-evidence-directory-alignment');
 let bytes=0;const seen=new Set();for(let i=0;i<keys.length;i++){
  const ref=keys[i],ordinal=piece.ordinals[i];if(evidenceRefBucket(ref)!==bucket)throw Error('evidence-directory-routing-mismatch');positive(versions[ref],pointer.revision);positive(piece.sizes[i],MAX_RECORD);bytes+=piece.sizes[i];
  if(!Number.isSafeInteger(ordinal)||ordinal<0||ordinal>=MAX_REFS||seen.has(ordinal))throw Error('invalid-evidence-directory-order');seen.add(ordinal);
 }
 if(bytes!==pointer.bytes)throw Error('evidence-directory-size-mismatch');if(stable(piece).length>MAX_RECORD)throw Error('free-evidence-piece-too-large');return piece;
}
function bucketRecord(root,bucket,versions,sizes,ordinals){
 const keys=Object.keys(versions),payload={scopeKey:root.scopeKey,bucket,revision:root.revision,versions,sizes:keys.map(key=>sizes[key]),ordinals:keys.map(key=>ordinals[key])};
 root.directory[bucket]={revision:root.revision,count:keys.length,bytes:payload.sizes.reduce((sum,size)=>sum+size,0)};
 const record=evidenceRecord(evidenceRefDirectoryKey(root.scopeKey,bucket,root.revision),payload);verifyEvidenceDirectoryPiece(record,root,bucket);return record;
}
/** Pure conversion only. The repository must verify actual evidence/index pieces before committing migration. */
export function buildEvidenceRefDirectory(manifest,scope){
 const normalized=scopeOf(scope);validateEvidenceManifest(manifest,normalized);
 exact(manifest,['format','scopeKey','revision','sources','refVersions','indexVersions','counts','sizes']);
 const root={format:EVIDENCE_DIRECTORY_FORMAT,scopeKey:manifest.scopeKey,revision:manifest.revision,sources:manifest.sources,directory:{},indexVersions:manifest.indexVersions,counts:manifest.counts},groups=new Map(),records=[];let ordinal=0;
 for(const ref of Object.keys(manifest.refVersions)){const bucket=evidenceRefBucket(ref);if(!groups.has(bucket))groups.set(bucket,{versions:{},sizes:{},ordinals:{}});const group=groups.get(bucket);group.versions[ref]=manifest.refVersions[ref];group.sizes[ref]=manifest.sizes[ref];group.ordinals[ref]=ordinal++;}
 for(const [bucket,group] of groups)records.push(bucketRecord(root,bucket,group.versions,group.sizes,group.ordinals));validateEvidenceDirectoryRoot(root,normalized);return {root,records};
}
/** Restore the exact old manifest order, validating every bucket and cross-bucket ordinal. */
export function materializeEvidenceRefDirectory(root,scope,records){
 validateEvidenceDirectoryRoot(root,scope);const byKey=new Map();for(const record of records){if(byKey.has(record.key))throw Error('duplicate-evidence-directory-record');byKey.set(record.key,record);}
 const manifest=legacyHeader(root),count=totals(root.directory,root.revision).count,refs=new Array(count),versions=new Array(count),sizes=new Array(count);let expected=0;
 for(const bucket of Object.keys(root.directory)){expected++;const pointer=root.directory[bucket],piece=verifyEvidenceDirectoryPiece(byKey.get(evidenceRefDirectoryKey(root.scopeKey,bucket,pointer.revision)),root,bucket),keys=Object.keys(piece.versions);
  for(let i=0;i<keys.length;i++){const ordinal=piece.ordinals[i];if(ordinal>=count||refs[ordinal]!==undefined)throw Error('invalid-evidence-directory-order');refs[ordinal]=keys[i];versions[ordinal]=piece.versions[keys[i]];sizes[ordinal]=piece.sizes[i];}
 }
 if(byKey.size!==expected)throw Error('unexpected-evidence-directory-record');
 for(let i=0;i<count;i++){if(refs[i]===undefined)throw Error('invalid-evidence-directory-order');manifest.refVersions[refs[i]]=versions[i];manifest.sizes[refs[i]]=sizes[i];}
 validateEvidenceManifest(manifest,scopeOf(scope));return manifest;
}
/** Replace only touched buckets. All updates pair the new piece version with its exact size. */
export function updateEvidenceRefDirectory(root,scope,revision,updates,records){
 validateEvidenceDirectoryRoot(root,scope);positive(revision,Number.MAX_SAFE_INTEGER);if(revision!==root.revision+1)throw Error('evidence-directory-revision-conflict');
 if(!updates||typeof updates!=='object'||Array.isArray(updates)||Object.keys(updates).length>10000)throw Error('invalid-evidence-directory-updates');
 const next={...root,revision,directory:{...root.directory}},byKey=new Map(),used=new Set(),groups=new Map(),written=[];let ordinal=totals(root.directory,root.revision).count;
 for(const record of records){if(byKey.has(record.key))throw Error('duplicate-evidence-directory-record');byKey.set(record.key,record);}
 for(const ref of Object.keys(updates)){
  id(ref);const value=updates[ref];exact(value,['version','size']);if(value.version!==revision)throw Error('invalid-evidence-directory-update-version');positive(value.size,MAX_RECORD);
  const bucket=evidenceRefBucket(ref);if(!groups.has(bucket)){let versions={},sizes={},ordinals={};const pointer=root.directory[bucket];if(pointer){const key=evidenceRefDirectoryKey(root.scopeKey,bucket,pointer.revision),piece=verifyEvidenceDirectoryPiece(byKey.get(key),root,bucket),keys=Object.keys(piece.versions);used.add(key);versions={...piece.versions};for(let i=0;i<keys.length;i++){sizes[keys[i]]=piece.sizes[i];ordinals[keys[i]]=piece.ordinals[i];}}groups.set(bucket,{versions,sizes,ordinals});}
  const group=groups.get(bucket);if(!Object.hasOwn(group.versions,ref)){if(ordinal>=MAX_REFS)throw Error('evidence-directory-capacity');group.ordinals[ref]=ordinal++;}group.versions[ref]=revision;group.sizes[ref]=value.size;
 }
 if(used.size!==byKey.size)throw Error('unexpected-evidence-directory-record');
 for(const [bucket,group] of groups)written.push(bucketRecord(next,bucket,group.versions,group.sizes,group.ordinals));validateEvidenceDirectoryRoot(next,scope);return {root:next,records:written};
}
