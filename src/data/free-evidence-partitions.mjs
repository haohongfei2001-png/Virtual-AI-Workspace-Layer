import {emptyFreeEvidence,validateFreeEvidence} from './free-evidence.mjs';
import {digest,stable,sha256} from './hash.mjs';
import {id} from './state.mjs';
export const freeEvidenceKey=scopeKey=>JSON.stringify([scopeKey,'free-evidence']);
export const evidenceRecoveryKey=scopeKey=>JSON.stringify([scopeKey,'free-evidence-recovery']);
export const evidenceIndexKey=(scopeKey,group,version)=>JSON.stringify([scopeKey,'free-evidence-index',group,version]);
export const evidencePieceKey=(scopeKey,ref,version)=>JSON.stringify([scopeKey,'free-evidence-piece',ref,version]);
export const evidenceRecord=(key,payload)=>({key,payload,checksum:digest(payload)});
export function unpackEvidence(row){if(!row||row.checksum!==digest(row.payload))throw Error('corrupt-free-evidence-record');return row.payload;}
export const isEvidencePartitioned=value=>value?.format==='vaiwl-free-evidence-partitions-v1';
const tables=['events','hints','coverage'];
const indexGroup=(table,key)=>table+'_'+digest(key).slice(0,2);
export function evidenceHeader(manifest,scope){return {...emptyFreeEvidence(scope),format:'vaiwl-free-evidence-v2',revision:manifest.revision,sources:manifest.sources};}
function checkEvidenceManifestStructure(value,scope){
 if(!isEvidencePartitioned(value)||value.scopeKey!==scope.key||!Number.isSafeInteger(value.revision)||value.revision<1)throw Error('invalid-free-evidence-manifest');
 validateFreeEvidence(evidenceHeader(value,scope),scope);
 for(const table of ['refVersions','sizes']){
  const rows=value[table];if(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.keys(rows).length>100000)throw Error('free-evidence-capacity');
  for(const [key,v] of Object.entries(rows)){
   id(key);if(!Number.isSafeInteger(v)||v<1||(table==='refVersions'&&v>value.revision))throw Error('invalid-free-evidence-piece-version');
  }
 }
 if(!value.indexVersions||typeof value.indexVersions!=='object'||Array.isArray(value.indexVersions)||Object.keys(value.indexVersions).length>1024)throw Error('invalid-free-evidence-index-manifest');
 for(const [key,v] of Object.entries(value.indexVersions))if(!/^(events|hints|coverage|hintEvents)_[0-9a-f]{2}$/.test(key)||!Number.isSafeInteger(v)||v<1||v>value.revision)throw Error('invalid-free-evidence-index-manifest');
 for(const table of tables)if(!Number.isSafeInteger(value.counts?.[table])||value.counts[table]<0||value.counts[table]>100000)throw Error('free-evidence-capacity');
 if(Object.keys(value.sizes).length!==Object.keys(value.refVersions).length||Object.keys(value.refVersions).some(k=>!Object.hasOwn(value.sizes,k)))throw Error('invalid-free-evidence-sizes');
 if(Object.values(value.sizes).reduce((a,b)=>a+b,0)>128*1024*1024)throw Error('free-evidence-too-large');
 return value;
}
export function validateEvidenceManifest(value,scope){
 checkEvidenceManifestStructure(value,scope);
 if(JSON.stringify(value).length>16*1024*1024)throw Error('free-evidence-too-large');
 return value;
}
function evidenceManifestRecord(key,manifest,scope){
 checkEvidenceManifestStructure(manifest,scope);
 const encoded=stable(manifest);
 if(encoded.length>16*1024*1024)throw Error('free-evidence-too-large');
 return {key,payload:manifest,checksum:sha256(encoded)};
}
export function loadEvidencePieces(store,manifest,scope,ids,done,fail){
 const result=evidenceHeader(manifest,scope),keys=[...new Set(ids)].filter(k=>Object.hasOwn(manifest.refVersions,k));let pending=keys.length;
 if(!pending){done(result);return;}
 for(const ref of keys){const request=store.get(evidencePieceKey(scope.key,ref,manifest.refVersions[ref]));request.onsuccess=()=>{try{
  const piece=unpackEvidence(request.result);
  if(piece.scopeKey!==scope.key||piece.ref!==ref||piece.revision!==manifest.refVersions[ref]||JSON.stringify(piece).length!==manifest.sizes[ref])throw Error('invalid-free-evidence-piece');
  for(const table of tables){if(!piece[table]||typeof piece[table]!=='object')throw Error('invalid-free-evidence-piece');for(const [key,row] of Object.entries(piece[table])){
   if(row.conversationId!==ref||row.id!==key||Object.hasOwn(result[table],key))throw Error('invalid-free-evidence-piece-index');result[table][key]=row;
  }}
  if(--pending===0){
   validateFreeEvidence(result,scope);done(result);
  }
 }catch(error){fail(error);}};}
}
export function saveEvidencePieces(store,scope,next,previous=null,partial=null,indexes={}){
 const manifest=previous?{...previous,refVersions:{...previous.refVersions},indexVersions:{...previous.indexVersions},counts:{...previous.counts},sizes:{...previous.sizes}}:{format:'vaiwl-free-evidence-partitions-v1',scopeKey:scope.key,revision:0,sources:{},refVersions:{},indexVersions:{},counts:{events:0,hints:0,coverage:0},sizes:{}};
 for(const table of tables)manifest.counts[table]+=Object.keys(next[table]).length-(partial?Object.keys(partial[table]).length:0);
 manifest.revision=next.revision;manifest.sources=next.sources;
 const pieces=new Map(),changedIndexes=new Set();
 const addIndex=(table,key,ref)=>{const group=indexGroup(table,key);if(!indexes[group]){if(manifest.indexVersions[group])throw Error('missing-free-evidence-index');indexes[group]={};}if(indexes[group][key]&&indexes[group][key]!==ref)throw Error('free-evidence-index-conflict');indexes[group][key]=ref;changedIndexes.add(group);};
 for(const table of tables)for(const [key,row] of Object.entries(next[table])){
  const ref=row.conversationId;if(!pieces.has(ref))pieces.set(ref,{scopeKey:scope.key,ref,revision:next.revision,events:{},hints:{},coverage:{}});
  pieces.get(ref)[table][key]=row;
  if(!partial?.[table]?.[key]){
   addIndex(table,key,ref);
   if(table==='hints')addIndex('hintEvents',digest([row.sourceId,row.eventKey]),ref);
  }
 }
 for(const [ref,piece] of pieces){
  const bytes=JSON.stringify(piece).length;if(bytes>16*1024*1024)throw Error('free-evidence-piece-too-large');
  const prior=manifest.refVersions[ref];manifest.refVersions[ref]=next.revision;manifest.sizes[ref]=bytes;
  store.put(evidenceRecord(evidencePieceKey(scope.key,ref,next.revision),piece));
  if(prior)store.delete(evidencePieceKey(scope.key,ref,prior));
 }
 for(const group of changedIndexes){const prior=manifest.indexVersions[group];manifest.indexVersions[group]=next.revision;const key=evidenceIndexKey(scope.key,group,next.revision);store.put(evidenceRecord(key,{scopeKey:scope.key,group,revision:next.revision,refs:indexes[group]}));if(prior)store.delete(evidenceIndexKey(scope.key,group,prior));}
 const rootRecord=evidenceManifestRecord(freeEvidenceKey(scope.key),manifest,scope);
 // Root and recovery are identical immutable payloads in this transaction.
 store.put(rootRecord);store.put({...rootRecord,key:evidenceRecoveryKey(scope.key)});
 return manifest;
}
export function loadEvidenceIndexes(store,manifest,scope,groups,done,fail){
 const indexes={},keys=[...new Set(groups)].filter(g=>Object.hasOwn(manifest.indexVersions,g));let pending=keys.length;
 if(!pending){done(indexes);return;}
 for(const group of keys){const request=store.get(evidenceIndexKey(scope.key,group,manifest.indexVersions[group]));request.onsuccess=()=>{try{
  const value=unpackEvidence(request.result);
  if(value.scopeKey!==scope.key||value.group!==group||value.revision!==manifest.indexVersions[group]||!value.refs||typeof value.refs!=='object'||Array.isArray(value.refs))throw Error('invalid-free-evidence-index');
  const table=group.slice(0,group.lastIndexOf('_'));
  for(const [key,ref] of Object.entries(value.refs)){id(key);id(ref);if(indexGroup(table,key)!==group||!Object.hasOwn(manifest.refVersions,ref))throw Error('orphan-free-evidence-index');}
  indexes[group]=value.refs;if(--pending===0)done(indexes);
 }catch(error){fail(error);}};}
}
export function evidenceTouchedRefs(store,manifest,scope,command,done,fail){
 const refs=new Set(),lookups=[];
 for(const table of tables)for(const row of command.batch?.[table]??[]){
  refs.add(row.conversationId);lookups.push([indexGroup(table,row.id),row.id]);
  if(table==='hints'){const key=digest([row.sourceId,row.eventKey]);lookups.push([indexGroup('hintEvents',key),key]);}
 }
 loadEvidenceIndexes(store,manifest,scope,lookups.map(([g])=>g),indexes=>{
  for(const [group,key] of lookups)if(indexes[group]?.[key])refs.add(indexes[group][key]);
  done(refs,indexes);
 },fail);
}
