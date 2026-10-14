import {loadNativePieces,nativeHeader,validateNativeManifest,nativePartitionKey} from './native-partitions.mjs';

/** Optional bounded bulk reads within the caller's still-active transaction.
 * Extra/retained versions never count as coverage. Missing exact keys fall back
 * to the original get/checksum path, so a range scan cannot certify absence.
 */
function prefetchAuditPieces(store,manifest,kind,ids,fence,done,fail){
 const range=globalThis.IDBKeyRange;
 if(!ids.length||typeof store.getAll!=='function'||typeof store.getAllKeys!=='function'||typeof range?.bound!=='function'){done(null);return;}
 const keys=ids.map(id=>nativePartitionKey(manifest.scopeKey,kind,id,manifest[kind][id])).sort();
 const wanted=new Set(keys),records=new Map(),upper=keys.at(-1);let lower=keys[0],open=false,scanned=0,failed=false;
 const reject=error=>{if(!failed){failed=true;fail(error);}};
 const next=()=>{if(failed)return;try{
  fence();const count=Math.min(512,ids.length*2-scanned);
  if(count<=0){done(records);return;}
  // Scan only keys first: large obsolete/foreign payloads are never loaded.
  // The RW transaction prevents new keys appearing inside the selected runs.
  const request=store.getAllKeys(range.bound(lower,upper,open,false),count);
  request.onerror=()=>reject(request.error??Error('native-audit-read-failed'));
  request.onsuccess=()=>{if(failed)return;try{
   fence();const found=request.result;if(!Array.isArray(found)||found.length>count)throw Error('invalid-native-audit-page');
   const runs=[];let run=null,last=null;
   for(const key of found){
    if(typeof key!=='string'||key<lower||(open&&key===lower)||key>upper||(last!==null&&key<=last))throw Error('invalid-native-audit-page');
    last=key;
    if(wanted.has(key)){if(!run){run=[];runs.push(run);}run.push(key);}else run=null;
   }
   scanned+=found.length;
   const advance=()=>{if(failed)return;try{
    fence();
    if(records.size===wanted.size||found.length<count||last===upper||scanned>=ids.length*2){done(records);return;}
    lower=last;open=true;next();
   }catch(error){reject(error);}};
   let waiting=runs.length;if(!waiting){advance();return;}
   for(const selected of runs){
    const values=store.getAll(range.bound(selected[0],selected.at(-1)),selected.length);
    values.onerror=()=>reject(values.error??Error('native-audit-read-failed'));
    values.onsuccess=()=>{if(failed)return;try{
     fence();const rows=values.result;
     if(!Array.isArray(rows)||rows.length!==selected.length)throw Error('invalid-native-audit-page');
     for(let i=0;i<rows.length;i++){if(rows[i]?.key!==selected[i])throw Error('invalid-native-audit-page');records.set(selected[i],rows[i]);}
     if(!--waiting)advance();
    }catch(error){reject(error);}};
   }
  }catch(error){reject(error);}};
 }catch(error){reject(error);}};
 next();
}

/** Full migration audit in one IDB transaction, retaining only one batch.
 * Dependencies are validated again by the original loader in each ref batch.
 * Queue the next batch synchronously from its success callback: yielding here
 * would permit IDB to commit before the owner publishes its root and receipt.
 */
export function auditNativePartitions(store,manifest,scope,fence,done,fail){
 const counts={projects:0,refs:0,membership:0};
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
    if(phase===0){phase=1;offset=0;keys=Object.keys(manifest.refs).sort();}
    else{
     done({factsJSONLength:size,projectCount:counts.projects,refCount:counts.refs,membershipCount:counts.membership});
     finished=true;
     return;
    }
   }
   const table=phase===0?'projects':'refs',selected=keys.slice(offset,offset+5000);
   offset+=selected.length;
   prefetchAuditPieces(store,manifest,table,selected,fence,prefetched=>{
   loadNativePieces(store,manifest,scope,{projects:table==='projects'?selected:[],refs:table==='refs'?selected:[]},(facts,storage)=>{
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
