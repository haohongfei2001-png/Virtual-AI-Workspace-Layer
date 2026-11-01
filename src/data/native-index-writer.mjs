import {nativeKinds,nativeCommandKeys,emptyNativeMaps} from './native-lifecycle.mjs';
import {isNativeVersionIndexed,buildNativeIndexUpdateRecord,nativeIndexBucket,nativeIndexKey} from './native-version-index.mjs';
import {createNativeIndexReader} from './native-index-reader.mjs';
import {nativeRecord,nativePartitionKey,nativeRecoveryKey,nativeCheckpointKey,isNativePartitioned} from './native-partitions.mjs';

/** The caller owns CAS, source authority, shared anchors, receipts and transaction.
 * Only the changed native pieces and their version buckets are newly allocated.
 */
export function saveIndexedNativePieces(store,scope,next,storage,command,reader,verifyCheckpoint,check,fail){
 const prior=reader.root,updates=emptyNativeMaps(next),changed=nativeCommandKeys(command,next),wanted=new Set();let units=prior.units;
 for(const kind of nativeKinds(next))for(const key of changed[kind]){
  updates[kind][key]=next.revision;const bucket=nativeIndexBucket(key),pointer=prior[kind]?.[bucket];if(pointer)wanted.add(nativeIndexKey(prior.scopeKey,kind,bucket,pointer.revision));
  const old=storage.pieces.get(JSON.stringify([kind,key]));if(old)units-=JSON.stringify(old).length;
  const piece={scopeKey:next.scopeKey,kind,id:key,revision:next.revision,row:next[kind][key],...(kind==='refs'?{membership:next.membership[key]??null}:{})};
  if(!piece.row)throw Error('orphan-native-membership');units+=JSON.stringify(piece).length;check();store.put(nativeRecord(nativePartitionKey(next.scopeKey,kind,key,next.revision),piece));
 }
 const built=buildNativeIndexUpdateRecord(prior,scope,next.revision,updates,[...reader.records.values()].filter(r=>wanted.has(r.key)),{
  sources:next.sources,units,changes:[{revision:next.revision,...Object.fromEntries(nativeKinds(next).map(kind=>[kind,changed[kind].slice(0,10000)]))}]
 });
 for(const record of built.records){check();store.put(record);}
 const rootRecord=built.rootRecord;
 // Queue the superseded checkpoint read before the owner stores the prior root.
 const request=store.get(nativeCheckpointKey(next.scopeKey));request.onsuccess=()=>{
  try{check();}catch(error){fail(error);return;}
  // Corrupt prior checkpoints grant no GC authority; revocation above must
  // abort the queued write, not masquerade as a tolerable missing checkpoint.
  let old;try{old=verifyCheckpoint(request.result);}catch{return;}
  if(!isNativePartitioned(old)&&!isNativeVersionIndexed(old))return;
  const newer=createNativeIndexReader(store,built.root,scope,fail),older=isNativeVersionIndexed(old)?createNativeIndexReader(store,old,scope,()=>{},{check,fail}):null;
  const lookupOld=(kind,key,done)=>older?older.lookup(kind,key,done):done(old[kind]?.[key]);
  const retire=(kind,key)=>lookupOld(kind,key,version=>{if(!version)return;reader.lookup(kind,key,previousVersion=>{
   const finish=currentVersion=>{try{check();if(version!==previousVersion&&version!==currentVersion)store.delete(nativePartitionKey(next.scopeKey,kind,key,version));}catch(error){fail(error);}};
   // Both roots belong to this transaction. An unchanged physical bucket and
   // count have exactly the same verified versions; do not read it twice.
   const bucket=nativeIndexBucket(key),before=prior[kind]?.[bucket],after=built.root[kind]?.[bucket];
   if(before&&after&&before.revision===after.revision&&before.count===after.count)finish(previousVersion);
   else newer.lookup(kind,key,finish);
  });});
  const matches=prior.changes.filter(row=>row.revision===prior.revision),change=matches.length===1?matches[0]:null;
  if(change){for(const kind of nativeKinds(prior))for(const key of change[kind])retire(kind,key);}
  else if(older)older.all(manifest=>{for(const kind of nativeKinds(manifest))for(const key of Object.keys(manifest[kind]))retire(kind,key);});
  else for(const kind of nativeKinds(old))for(const key of Object.keys(old[kind]))retire(kind,key);
  if(older)for(const kind of nativeKinds(old))for(const [bucket,pointer] of Object.entries(old[kind])){
   if(pointer.revision===prior[kind]?.[bucket]?.revision||pointer.revision===built.root[kind]?.[bucket]?.revision)continue;
   // A corrupt checkpoint bucket cannot authorize deleting any of its records.
   older.readBucket(kind,bucket,()=>{try{check();store.delete(nativeIndexKey(next.scopeKey,kind,bucket,pointer.revision));}catch(error){fail(error);}});
  }
 };
 check();store.put({...rootRecord,key:nativeRecoveryKey(next.scopeKey)});store.put(rootRecord);return built.root;
}
