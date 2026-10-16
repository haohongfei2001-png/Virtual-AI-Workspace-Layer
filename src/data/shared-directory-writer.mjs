import {normalizedScope} from '../b1/identity.mjs';
import {validateSharedDirectoryRoot,updateSharedRefDirectory,sharedRefBucket,sharedRefDirectoryKey,verifySharedDirectoryPiece} from './shared-ref-directory.mjs';
import {manifest_PARTITION_FORMAT,manifest_checkManifest,manifest_partitionRecord} from './partition-manifest.mjs';

/** Delta hints are a bounded contiguous suffix, never the human journal.
 * A replica older than this suffix must use its existing full-read fallback.
 * Keep whole rows: truncating a row would falsely certify an incomplete delta.
 */
export function boundedSharedChanges(changes){
 let total=0,start=changes.length;
 while(start>0&&changes.length-start<64){const count=changes[start-1].refs.length;if(total+count>20000)break;total+=count;start--;}
 return changes.slice(start);
}
const metadata=['generation','scopeKey','revision','channel','sources','workspaces','preferences','humanRefs','units','changes'];
const changedRefs=patch=>[...new Set(patch.flatMap(p=>['refs','identities'].includes(p.table)?[p.key]:p.table==='placements'?[(p.after??p.before).refId]:['events','coverage'].includes(p.table)?[(p.after??p.before).conversationId]:[]))];
/** Build a bounded legacy view only from verified transaction-local buckets.
 * It is reducer input, never a complete inventory or a publishable root.
 */
export function sharedMutationManifest(root,scope,refs,records){
 validateSharedDirectoryRoot(root,scope);const wanted=new Set(refs),versions={},buckets=new Map();
 for(const record of records){const bucket=record?.payload?.bucket;if(buckets.has(bucket))throw Error('duplicate-shared-directory-record');buckets.set(bucket,verifySharedDirectoryPiece(record,root,bucket));}
 for(const ref of wanted){const bucket=sharedRefBucket(ref);if(root.refDirectory[bucket]&&!buckets.has(bucket))throw Error('missing-shared-directory-record');const p=buckets.get(bucket);if(p&&Object.hasOwn(p.versions,ref))versions[ref]=p.versions[ref];}
 const manifest={format:manifest_PARTITION_FORMAT,...Object.fromEntries(metadata.map(k=>[k,root[k]])),refVersions:versions,humanRefs:root.humanRefs.filter(ref=>Object.hasOwn(versions,ref))};
 manifest_checkManifest(manifest,root.scopeKey);return manifest;
}
/** Reuse the existing piece/locator writer in the caller's SAME transaction.
 * The owner still owns CAS, source authority, receipts, checkpoints and abort.
 * No migration, garbage collection, or permission to delete native facts.
 */
export function saveSharedDirectoryMutation(tx,root,scope,storage,current,next,patch,actor,saveLegacy){
 const s=normalizedScope(scope);validateSharedDirectoryRoot(root,scope);
 if(!s||s.key!==root.scopeKey||next.revision!==root.revision+1)throw Error('shared-directory-revision-conflict');
 if(typeof saveLegacy!=='function')throw Error('shared-directory-legacy-writer-required');
 const ids=changedRefs(patch),records=storage.directoryRecords,byKey=new Map(records.map(row=>[row.key,row]));
 if(byKey.size!==records.length)throw Error('duplicate-shared-directory-record');
 const bounded=sharedMutationManifest(root,scope,[...Object.keys(current.refs),...ids],records);
 // The existing writer needs original old pieces for aggregate unit deltas.
 for(const ref of ids)if(Object.hasOwn(bounded.refVersions,ref)&&!storage.pieces.has(ref))throw Error('missing-shared-mutation-piece');
 const legacyStorage={manifest:bounded,pieces:storage.pieces};let captured=null;
 const captureRoot=payload=>{if(captured)throw Error('duplicate-shared-root-write');captured={payload};};
 const store=tx.objectStore('b23_states'),proxy={objectStore:name=>name==='b23_states'?{put:row=>{
  if(row.key===root.scopeKey){captureRoot(row.payload);return;}
  return store.put(row);
 }}:tx.objectStore(name)};
 const legacy=saveLegacy(proxy,legacyStorage,current,next,patch,actor,captureRoot);
 if(!captured||captured.payload!==legacy)throw Error('missing-shared-root-write');
 const updates=Object.fromEntries(ids.map(ref=>[ref,Object.hasOwn(legacy.refVersions,ref)?next.revision:null]));
 const touched=new Set(ids.map(sharedRefBucket)),selected=[];
 for(const bucket of touched){const pointer=root.refDirectory[bucket];if(pointer){const key=sharedRefDirectoryKey(root.scopeKey,root.generation,bucket,pointer.revision);if(!byKey.has(key))throw Error('missing-shared-directory-record');selected.push(byKey.get(key));}}
 const humans=[...new Set([...root.humanRefs,...(actor==='human'?ids:[])])].filter(ref=>!Object.hasOwn(updates,ref)||updates[ref]!==null);
 const built=updateSharedRefDirectory(root,scope,next.revision,updates,selected,{metadata:{channel:legacy.channel,sources:legacy.sources,workspaces:legacy.workspaces,preferences:legacy.preferences,humanRefs:humans,units:legacy.units,changes:boundedSharedChanges(legacy.changes)}});
 for(const row of built.records)store.put(row);
 store.put(manifest_partitionRecord(root.scopeKey,built.root));return built.root;
}
