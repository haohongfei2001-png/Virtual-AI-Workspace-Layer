import {nativeKinds} from './native-lifecycle.mjs';
import {prefetchExactAuditRecords} from './audit-record-prefetch.mjs';
import {loadNativePieces,nativeHeader,validateNativeManifest,nativePartitionKey} from './native-partitions.mjs';

/** Full migration audit in one IDB transaction, retaining only one batch.
 * Dependencies are validated again by the original loader in each ref batch.
 * Queue the next batch synchronously from its success callback: yielding here
 * would permit IDB to commit before the owner publishes its root and receipt.
 */
export function auditNativePartitions(store,manifest,scope,fence,done,fail){
 const tables=nativeKinds(manifest),counts=Object.fromEntries([...tables,'membership'].map(kind=>[kind,0]));
 let size=0,phase=0,offset=0,keys=[],failed=false,finished=false;
 const reject=error=>{if(!failed&&!finished){failed=true;fail(error);}};
 const measure=(table,validation)=>{
  const {count,units}=validation.tables[table];
  // Each batch already includes its internal commas. Add only the join comma
  // between nonempty batches, and never recount loaded Project dependencies.
  size+=units+(count&&counts[table]?1:0);counts[table]+=count;
  if(size>128*1024*1024)throw Error('native-facts-too-large');
 };
 const next=()=>{
  if(failed||finished)return;
  try{
   fence();
   if(offset===keys.length){
    if(phase<tables.length-1){phase++;offset=0;keys=Object.keys(manifest[tables[phase]]).sort();}
    else{
     done({factsJSONLength:size,projectCount:counts.projects,refCount:counts.refs,membershipCount:counts.membership});
     finished=true;
     return;
    }
   }
   const table=tables[phase],selected=keys.slice(offset,offset+5000);
   offset+=selected.length;
   prefetchExactAuditRecords(store,selected.map(id=>nativePartitionKey(manifest.scopeKey,table,id,manifest[table][id])),fence,prefetched=>{
   loadNativePieces(store,manifest,scope,{projects:[],refs:[],[table]:selected},(facts,storage)=>{
    if(failed||finished)return;
    try{
     fence();measure(table,storage.validation);
     if(table==='refs')measure('membership',storage.validation);
     next();
    }catch(error){reject(error);}
   },reject,null,true,prefetched);
   },reject);
  }catch(error){reject(error);}
 };
 try{
  fence();validateNativeManifest(manifest,scope);
  // Empty table braces and all source metadata count once. Row lengths and
  // global (not per-batch) commas exactly preserve JSON.stringify(fullFacts).
  size=JSON.stringify(nativeHeader(manifest,scope)).length;
  keys=Object.keys(manifest.projects).sort();next();
 }catch(error){reject(error);}
}
