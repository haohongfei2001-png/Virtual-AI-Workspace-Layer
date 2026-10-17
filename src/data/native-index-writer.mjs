import {NATIVE_INDEX_FORMAT,updateNativeVersionIndex,validateNativeIndexRoot,nativeIndexBucket,nativeIndexKey} from './native-version-index.mjs';
import {createNativeIndexReader} from './native-index-reader.mjs';
import {nativeRecord,nativePartitionKey,nativeRecoveryKey,nativeCheckpointKey,isNativePartitioned} from './native-partitions.mjs';

/** The caller owns CAS, source authority, shared anchors, receipts and transaction.
 * Only the changed native pieces and their version buckets are newly allocated.
 */
export function saveIndexedNativePieces(store,scope,next,storage,command,reader,verifyCheckpoint,check,fail){
 const prior=reader.root,updates={projects:{},refs:{}},changed={projects:(command.batch?.projects??[]).map(r=>r.id),refs:[...new Set([...(command.batch?.refs??[]).map(r=>r.id),...(command.batch?.membership??[]).map(r=>r.id)])]},wanted=new Set();let units=prior.units;
 for(const kind of ['projects','refs'])for(const key of changed[kind]){
  updates[kind][key]=next.revision;const bucket=nativeIndexBucket(key),pointer=prior[kind][bucket];if(pointer)wanted.add(nativeIndexKey(prior.scopeKey,kind,bucket,pointer.revision));
  const old=storage.pieces.get(JSON.stringify([kind,key]));if(old)units-=JSON.stringify(old).length;
  const piece={scopeKey:next.scopeKey,kind,id:key,revision:next.revision,row:next[kind][key],...(kind==='refs'?{membership:next.membership[key]??null}:{})};
  if(!piece.row)throw Error('orphan-native-membership');units+=JSON.stringify(piece).length;check();store.put(nativeRecord(nativePartitionKey(next.scopeKey,kind,key,next.revision),piece));
 }
 const built=updateNativeVersionIndex(prior,scope,next.revision,updates,[...reader.records.values()].filter(r=>wanted.has(r.key)));
 built.root.sources=next.sources;built.root.units=units;built.root.changes=[...prior.changes,{revision:next.revision,projects:changed.projects.slice(0,10000),refs:changed.refs.slice(0,10000)}].slice(-64);
 validateNativeIndexRoot(built.root,scope);for(const record of built.records){check();store.put(record);}
 const rootRecord=nativeRecord(next.scopeKey,built.root);
 // Queue the superseded checkpoint read before the owner stores the prior root.
 const request=store.get(nativeCheckpointKey(next.scopeKey));request.onsuccess=()=>{
  try{check();}catch(error){fail(error);return;}
  // Corrupt prior checkpoints grant no GC authority; revocation above must
  // abort the queued write, not masquerade as a tolerable missing checkpoint.
  let old;try{old=verifyCheckpoint(request.result);}catch{return;}
  if(!isNativePartitioned(old)&&old?.format!==NATIVE_INDEX_FORMAT)return;
  const newer=createNativeIndexReader(store,built.root,scope,fail),older=old.format===NATIVE_INDEX_FORMAT?createNativeIndexReader(store,old,scope,()=>{}):null;
  const lookupOld=(kind,key,done)=>older?older.lookup(kind,key,done):done(old[kind][key]);
  const retire=(kind,key)=>lookupOld(kind,key,version=>{if(!version)return;reader.lookup(kind,key,previousVersion=>newer.lookup(kind,key,currentVersion=>{try{check();if(version!==previousVersion&&version!==currentVersion)store.delete(nativePartitionKey(next.scopeKey,kind,key,version));}catch(error){fail(error);}}));});
  const change=prior.changes.find(row=>row.revision===prior.revision);
  if(change){for(const kind of ['projects','refs'])for(const key of change[kind])retire(kind,key);}
  else if(older)older.all(manifest=>{for(const kind of ['projects','refs'])for(const key of Object.keys(manifest[kind]))retire(kind,key);});
  else for(const kind of ['projects','refs'])for(const key of Object.keys(old[kind]))retire(kind,key);
  if(older)for(const kind of ['projects','refs'])for(const [bucket,pointer] of Object.entries(old[kind])){
   if(pointer.revision===prior[kind][bucket]?.revision||pointer.revision===built.root[kind][bucket]?.revision)continue;
   // A corrupt checkpoint bucket cannot authorize deleting any of its records.
   older.readBucket(kind,bucket,()=>{try{check();store.delete(nativeIndexKey(next.scopeKey,kind,bucket,pointer.revision));}catch(error){fail(error);}});
  }
 };
 check();store.put({...rootRecord,key:nativeRecoveryKey(next.scopeKey)});store.put(rootRecord);return built.root;
}
