import {validateSharedDirectoryRoot,verifySharedDirectoryPiece,materializeSharedRefDirectory,sharedRefBucket,sharedRefDirectoryKey} from './shared-ref-directory.mjs';
import {id} from './state.mjs';

/** Callback-only reader: all requests belong to one live IDB transaction/root.
 * Unloaded directory claims do not certify inventory or shared contents.
 */
export function createSharedDirectoryReader(store,root,scope,fail,ownerGuard=null){
 validateSharedDirectoryRoot(root,scope);
 const records=new Map(),pending=new Map();let failed=false;
 const reject=error=>{if(failed)return;failed=true;pending.clear();fail(error);};
 // Guard every queued reply, including replies after a corrupt old bucket
 // abandoned this reader. Data tolerance must not swallow owner revocation.
 const checkOwner=()=>{if(!ownerGuard)return true;try{ownerGuard.check();return true;}catch(error){ownerGuard.fail(error);return false;}};
 function readBucket(bucket,done){
  if(failed)return;
  try{
   if(typeof bucket!=='string'||!/^[0-9a-f]{2}$/.test(bucket))throw Error('invalid-shared-directory-bucket');
   const pointer=root.refDirectory[bucket];if(!pointer){done(null);return;}
   const key=sharedRefDirectoryKey(root.scopeKey,root.generation,bucket,pointer.revision);
   if(records.has(key)){done(verifySharedDirectoryPiece(records.get(key),root,bucket));return;}
   if(pending.has(key)){pending.get(key).push(done);return;}
   pending.set(key,[done]);
   const request=store.get(key);
   request.onsuccess=()=>{if(!checkOwner()||failed)return;try{
    const record=request.result,verified=verifySharedDirectoryPiece(record,root,bucket);records.set(key,record);
    const callbacks=pending.get(key);pending.delete(key);
    // No external callback intervenes before the first consumer. Every later
    // consumer rechecks fresh bytes and the current root ordinal ceiling.
    for(let i=0;i<callbacks.length;i++){if(failed)break;callbacks[i](i===0?verified:verifySharedDirectoryPiece(record,root,bucket));}
   }catch(error){reject(error);}};
   request.onerror=()=>{if(checkOwner())reject(request.error??Error('shared-directory-read-failed'));};
  }catch(error){reject(error);}
 }
 function lookup(ref,done){
  if(failed)return;try{id(ref);readBucket(sharedRefBucket(ref),piece=>{
   if(!piece||!Object.hasOwn(piece.versions,ref)){done(undefined);return;}
   done(piece.versions[ref]);
  });}catch(error){reject(error);}
 }
 function all(done){
  if(failed)return;const buckets=Object.keys(root.refDirectory);let remaining=buckets.length;
  const finish=()=>{if(failed)return;try{done(materializeSharedRefDirectory(root,scope,[...records.values()]));}catch(error){reject(error);}};
  if(!remaining){finish();return;}
  for(const bucket of buckets)readBucket(bucket,()=>{if(!--remaining)finish();});
 }
 // Batch requested references by bucket, while verifying every loaded bucket.
 function lookupMany(refs,done){
  if(failed)return;try{
   const groups=new Map(),result=new Map();
   for(const ref of refs){id(ref);const bucket=sharedRefBucket(ref);if(!groups.has(bucket))groups.set(bucket,new Set());groups.get(bucket).add(ref);}
   let remaining=groups.size;if(!remaining){done(result);return;}
   for(const [bucket,wanted] of groups)readBucket(bucket,piece=>{
    if(piece){const keys=Object.keys(piece.versions);for(let i=0;i<keys.length;i++)if(wanted.has(keys[i]))result.set(keys[i],piece.versions[keys[i]]);}
    if(!--remaining)done(result);
   });
  }catch(error){reject(error);}
 }
 return {root,records,lookup,lookupMany,all,readBucket};
}
