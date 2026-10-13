import {loadNativePieces,nativeHeader,validateNativeManifest} from './native-partitions.mjs';

/** Full migration audit in one IDB transaction, retaining only one batch.
 * Dependencies are validated again by the original loader in each ref batch.
 * Queue the next batch synchronously from its success callback: yielding here
 * would permit IDB to commit before the owner publishes its root and receipt.
 */
export function auditNativePartitions(store,manifest,scope,fence,done,fail){
 const counts={projects:0,refs:0,membership:0};
 let size=0,phase=0,offset=0,keys=[],failed=false,finished=false;
 const reject=error=>{if(!failed&&!finished){failed=true;fail(error);}};
 const measure=(table,rows)=>{
  for(const [key,row] of Object.entries(rows)){
   size+=JSON.stringify(key).length+1+JSON.stringify(row).length+(counts[table]++?1:0);
   if(size>128*1024*1024)throw Error('native-facts-too-large');
  }
 };
 const next=()=>{
  if(failed||finished)return;
  try{
   fence();
   if(offset===keys.length){
    if(phase===0){phase=1;offset=0;keys=Object.keys(manifest.refs);}
    else{
     done({factsJSONLength:size,projectCount:counts.projects,refCount:counts.refs,membershipCount:counts.membership});
     finished=true;
     return;
    }
   }
   const table=phase===0?'projects':'refs',selected=keys.slice(offset,offset+5000);
   offset+=selected.length;
   loadNativePieces(store,manifest,scope,{projects:table==='projects'?selected:[],refs:table==='refs'?selected:[]},facts=>{
    if(failed||finished)return;
    try{
     fence();measure(table,facts[table]);
     if(table==='refs')measure('membership',facts.membership);
     next();
    }catch(error){reject(error);}
   },reject);
  }catch(error){reject(error);}
 };
 try{
  fence();validateNativeManifest(manifest,scope);
  // Empty table braces and all source metadata count once. Row lengths and
  // global (not per-batch) commas exactly preserve JSON.stringify(fullFacts).
  size=JSON.stringify(nativeHeader(manifest,scope)).length;
  keys=Object.keys(manifest.projects);next();
 }catch(error){reject(error);}
}
