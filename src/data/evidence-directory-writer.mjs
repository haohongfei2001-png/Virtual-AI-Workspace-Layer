import {updateEvidenceRefDirectory,evidenceRefBucket,evidenceRefDirectoryKey,validateEvidenceDirectoryRoot} from './evidence-ref-directory.mjs';
import {saveEvidencePieces,evidenceRecord,freeEvidenceKey,evidenceRecoveryKey} from './free-evidence-partitions.mjs';
/** Reuse the existing evidence/index writer on a bounded manifest. Root writes
 * are withheld until the complete directory aggregate has been validated.
 * Caller owns the same readwrite transaction, CAS, marker and receipt.
 */
export function saveDirectoryEvidence(store,scope,next,root,partial,indexes,reader,done,fail){
 const refs=[...new Set(['events','hints','coverage'].flatMap(table=>Object.values(next[table]).map(row=>row.conversationId)))];
 reader.lookupMany(refs,versions=>{try{
  const bounded={format:'vaiwl-free-evidence-partitions-v1',scopeKey:root.scopeKey,revision:root.revision,sources:root.sources,refVersions:{},sizes:{},counts:root.counts,indexVersions:root.indexVersions,indexChecksums:root.indexChecksums};
  for(const [ref,pointer] of versions){bounded.refVersions[ref]=pointer.version;bounded.sizes[ref]=pointer.size;}
  const rootKey=freeEvidenceKey(scope.key),shadowKey=evidenceRecoveryKey(scope.key);
  const piecesOnly={put:record=>{if(record.key!==rootKey&&record.key!==shadowKey)store.put(record);},delete:key=>store.delete(key)};
  const written=saveEvidencePieces(piecesOnly,scope,next,bounded,partial,indexes),updates={},buckets=new Set(refs.map(evidenceRefBucket)),records=[];
  for(const ref of refs)updates[ref]={version:written.refVersions[ref],size:written.sizes[ref]};
  for(const bucket of buckets){const pointer=root.directory[bucket];if(pointer)records.push(reader.records.get(evidenceRefDirectoryKey(root.scopeKey,bucket,pointer.revision)));}
  const built=updateEvidenceRefDirectory(root,scope,next.revision,updates,records);
  built.root.sources=written.sources;built.root.counts=written.counts;built.root.indexVersions=written.indexVersions;built.root.indexChecksums=written.indexChecksums;validateEvidenceDirectoryRoot(built.root,scope);
  for(const record of built.records)store.put(record);
  // Activity recovery is an identical current-root shadow, not an older
  // checkpoint. Superseded buckets/pieces retire in this same transaction.
  for(const bucket of buckets){const pointer=root.directory[bucket];if(pointer)store.delete(evidenceRefDirectoryKey(root.scopeKey,bucket,pointer.revision));}
  const record=evidenceRecord(rootKey,built.root);store.put(record);store.put({...record,key:shadowKey});done(built.root);
 }catch(error){fail(error);}});
}
