import {createSharedDirectoryReader} from './shared-directory-reader.mjs';
import {validateSharedDirectoryRoot,sharedRefDirectoryKey} from './shared-ref-directory.mjs';
import {manifest_partitionUnpack,manifest_partitionKey} from './partition-manifest.mjs';

/** Capture the superseded checkpoint BEFORE its replacement is enqueued.
 * Returned callback accepts the newly written root. All reads/deletes remain
 * in the owner's transaction. Journals, locators and reference anchors survive.
 */
export function prepareSharedDirectoryRetention(tx,scope,prior,check,fail){
 const previous=structuredClone(prior),store=tx.objectStore('b23_states');
 validateSharedDirectoryRoot(previous,scope);
 let old=null,ready=false,next=null,started=false;
 const start=()=>{
  if(!ready||!next||!old||started)return;started=true;
  try{
   check();validateSharedDirectoryRoot(next,scope);
   // A format/generation transition is not authority to purge older assets.
   if(old.generation!==previous.generation||old.generation!==next.generation||old.revision>previous.revision)return;
   if(next.revision!==previous.revision+1)throw Error('shared-retention-revision-conflict');
   const older=createSharedDirectoryReader(store,old,scope,()=>{});
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
     retained.readBucket(bucket,before=>current.readBucket(bucket,after=>{try{
      check();for(const ref of refs){const version=piece.versions[ref];if(version!==versionAt(before,ref)&&version!==versionAt(after,ref)){check();store.delete(manifest_partitionKey(old.scopeKey,ref,version,old.generation));}}
      check();store.delete(sharedRefDirectoryKey(old.scopeKey,old.generation,bucket,pointer.revision));
     }catch(error){fail(error);}}));
    });
   }
  }catch(error){fail(error);}
 };
 const request=tx.objectStore('b23_checkpoints').get(previous.scopeKey);
 request.onsuccess=()=>{try{check();}catch(error){fail(error);return;}try{
  const row=request.result;if(row?.key!==previous.scopeKey)return;
  const candidate=manifest_partitionUnpack(row);validateSharedDirectoryRoot(candidate,scope);old=candidate;
 }catch{ /* A corrupt/missing checkpoint grants no deletion authority. */ }
 finally{ready=true;start();}};
 request.onerror=()=>fail(request.error??Error('shared-retention-checkpoint-read-failed'));
 return root=>{next=structuredClone(root);start();};
}
