import {createSharedDirectoryReader} from './shared-directory-reader.mjs';
import {validateSharedDirectoryRoot,snapshotSharedDirectoryRoot,createSharedDirectoryRootRecordReader,sharedRefDirectoryKey} from './shared-ref-directory.mjs';
import {manifest_partitionKey} from './partition-manifest.mjs';
const readCheckpointRoot=createSharedDirectoryRootRecordReader();

/** Capture the superseded checkpoint BEFORE its replacement is enqueued.
 * Returned callback accepts the newly written root. All reads/deletes remain
 * in the owner's transaction. Journals, locators and reference anchors survive.
 */
export function prepareSharedDirectoryRetention(tx,scope,prior,check,fail){
 const previous=snapshotSharedDirectoryRoot(prior,scope),store=tx.objectStore('b23_states');
 let old=null,ready=false,next=null,started=false;
 // Deletions may be queued after the owner's receipt. Fence their active
 // success events too, before a deferred expiry timer can arrive too late.
 const remove=key=>{const request=store.delete(key);request.onsuccess=()=>{try{check();}catch(error){fail(error);}};};
 const start=()=>{
  if(!ready||!next||!old||started)return;started=true;
  try{
   check();validateSharedDirectoryRoot(next,scope);
   // A format/generation transition is not authority to purge older assets.
   if(old.generation!==previous.generation||old.generation!==next.generation||old.revision>previous.revision)return;
   if(next.revision!==previous.revision+1)throw Error('shared-retention-revision-conflict');
   // Old-bucket corruption grants no deletion authority. It must not hide
   // revocation that happened after the checkpoint's earlier guard check.
   const older=createSharedDirectoryReader(store,old,scope,()=>{},{check,fail});
   const retained=createSharedDirectoryReader(store,previous,scope,fail);
   const current=createSharedDirectoryReader(store,next,scope,fail);
   for(const [bucket,pointer] of Object.entries(old.refDirectory)){
    if(pointer.revision===previous.refDirectory[bucket]?.revision||pointer.revision===next.refDirectory[bucket]?.revision)continue;
    // Invalid checkpoint buckets cannot authorize any deletion. Retained
    // buckets, however, must validate or the whole owner write must abort.
    older.readBucket(bucket,piece=>{
     const refs=Object.keys(piece.versions);
     // The verified old piece already establishes every ref's bucket. Read
     // both retained generations from storage with their full validators,
     // without rerouting and regrouping the same refs twice.
     const versionAt=(value,ref)=>value&&Object.hasOwn(value.versions,ref)?value.versions[ref]:undefined;
     const finish=(before,after)=>{try{
      check();for(const ref of refs){const version=piece.versions[ref];if(version!==versionAt(before,ref)&&version!==versionAt(after,ref)){check();remove(manifest_partitionKey(old.scopeKey,ref,version,old.generation));}}
      check();remove(sharedRefDirectoryKey(old.scopeKey,old.generation,bucket,pointer.revision));
     }catch(error){fail(error);}};
     // Private roots and this callback belong to the same transaction. Reuse
     // only identical physical and validation contexts, as before.
     const retainedPointer=previous.refDirectory[bucket],currentPointer=next.refDirectory[bucket];
     if(retainedPointer&&currentPointer&&retainedPointer.revision===currentPointer.revision&&retainedPointer.count===currentPointer.count&&retainedPointer.units===currentPointer.units&&next.nextOrdinal>=previous.nextOrdinal){
      retained.readBucket(bucket,before=>finish(before,before));
     }else{
      // Both keys are already known. Queue independent fresh reads together,
      // but do not authorize deletion until BOTH validators have succeeded.
      // A null result is a verified absent pointer, not an unfinished read.
      let before,after,beforeReady=false,afterReady=false;
      const complete=()=>{if(beforeReady&&afterReady)finish(before,after);};
      retained.readBucket(bucket,value=>{before=value;beforeReady=true;complete();});
      current.readBucket(bucket,value=>{after=value;afterReady=true;complete();});
     }
    });
   }
  }catch(error){fail(error);}
 };
 const request=tx.objectStore('b23_checkpoints').get(previous.scopeKey);
 request.onsuccess=()=>{try{check();}catch(error){fail(error);return;}try{
  old=readCheckpointRoot(request.result,scope);
 }catch{ /* A corrupt/missing checkpoint grants no deletion authority. */ }
 finally{ready=true;start();}};
 request.onerror=()=>fail(request.error??Error('shared-retention-checkpoint-read-failed'));
 return root=>{next=snapshotSharedDirectoryRoot(root,scope);start();};
}
