/** Optional bounded bulk reads within the caller's still-active transaction.
 * Extra/retained versions never count as coverage. Missing exact keys fall back
 * to the original get/checksum path, so a range scan cannot certify absence.
 */
export function prefetchExactAuditRecords(store,inputKeys,fence,done,fail){
 if(!Array.isArray(inputKeys)||inputKeys.length>5000||inputKeys.some(key=>typeof key!=='string')||new Set(inputKeys).size!==inputKeys.length){fail(Error('invalid-audit-keys'));return;}
 const keys=[...inputKeys].sort();
 const range=globalThis.IDBKeyRange;
 if(!keys.length||typeof store.getAll!=='function'||typeof store.getAllKeys!=='function'||typeof range?.bound!=='function'){done(null);return;}
 const wanted=new Set(keys),records=new Map(),upper=keys.at(-1);let lower=keys[0],open=false,scanned=0,failed=false;
 const reject=error=>{if(!failed){failed=true;fail(error);}};
 const next=()=>{if(failed)return;try{
  fence();const count=Math.min(512,keys.length*2-scanned);
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
    if(records.size===wanted.size||found.length<count||last===upper||scanned>=keys.length*2){done(records);return;}
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

