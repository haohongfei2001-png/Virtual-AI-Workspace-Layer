import {validateEvidenceDirectoryRoot,verifyEvidenceDirectoryPiece,materializeEvidenceRefDirectory,evidenceRefBucket,evidenceRefDirectoryKey} from './evidence-ref-directory.mjs';
import {id} from './state.mjs';

/** Callback-only reader: all requests belong to one live IDB transaction/root.
 * Unloaded directory claims do not certify inventory or evidence contents.
 */
export function createEvidenceDirectoryReader(store,root,scope,fail){
 validateEvidenceDirectoryRoot(root,scope);
 const records=new Map(),pending=new Map();let failed=false;
 const reject=error=>{if(failed)return;failed=true;pending.clear();fail(error);};
 function readBucket(bucket,done){
  if(failed)return;
  try{
   if(typeof bucket!=='string'||!/^[0-9a-f]{2}$/.test(bucket))throw Error('invalid-evidence-directory-bucket');
   const pointer=root.directory[bucket];if(!pointer){done(null);return;}
   const key=evidenceRefDirectoryKey(root.scopeKey,bucket,pointer.revision);
   if(records.has(key)){done(verifyEvidenceDirectoryPiece(records.get(key),root,bucket));return;}
   if(pending.has(key)){pending.get(key).push(done);return;}
   pending.set(key,[done]);
   const request=store.get(key);
   request.onsuccess=()=>{if(failed)return;try{
    const record=request.result;records.set(key,record);
    const callbacks=pending.get(key);pending.delete(key);
    // records is exposed for inspection; even an overridden set must run before
    // verification, never between verified bytes and their first consumer.
    const verified=verifyEvidenceDirectoryPiece(record,root,bucket);
    // No consumer ran between verification and the first callback. Subsequent
    // consumers must recheck bytes because a prior callback can mutate them.
    for(let i=0;i<callbacks.length;i++){if(failed)break;callbacks[i](i===0?verified:verifyEvidenceDirectoryPiece(record,root,bucket));}
   }catch(error){reject(error);}};
   request.onerror=()=>reject(request.error??Error('evidence-directory-read-failed'));
  }catch(error){reject(error);}
 }
 function lookup(ref,done){
  if(failed)return;try{id(ref);readBucket(evidenceRefBucket(ref),piece=>{
   if(!piece||!Object.hasOwn(piece.versions,ref)){done(undefined);return;}
   const position=Object.keys(piece.versions).indexOf(ref);
   done({version:piece.versions[ref],size:piece.sizes[position]});
  });}catch(error){reject(error);}
 }
 function all(done){
  if(failed)return;const buckets=Object.keys(root.directory);let remaining=buckets.length;
  const finish=()=>{if(failed)return;try{done(materializeEvidenceRefDirectory(root,scope,[...records.values()]));}catch(error){reject(error);}};
  if(!remaining){finish();return;}
  for(const bucket of buckets)readBucket(bucket,()=>{if(!--remaining)finish();});
 }
 // Global index validation must check every referenced ref, without re-encoding
 // one bucket for each row in that index group.
 function lookupMany(refs,done){
  if(failed)return;try{
   const groups=new Map(),result=new Map();
   for(const ref of refs){id(ref);const bucket=evidenceRefBucket(ref);if(!groups.has(bucket))groups.set(bucket,new Set());groups.get(bucket).add(ref);}
   let remaining=groups.size;if(!remaining){done(result);return;}
   for(const [bucket,wanted] of groups)readBucket(bucket,piece=>{
    if(piece){const keys=Object.keys(piece.versions);for(let i=0;i<keys.length;i++)if(wanted.has(keys[i]))result.set(keys[i],{version:piece.versions[keys[i]],size:piece.sizes[i]});}
    if(!--remaining)done(result);
   });
  }catch(error){reject(error);}
 }
 return {root,records,lookup,lookupMany,all,readBucket};
}
