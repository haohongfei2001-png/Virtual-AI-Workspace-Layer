/** Failure-only diagnostic. Directory inventory is not a distinct-ID/admission audit.
 * Self-contained for an existing extension frame. No page(), writes or grants.
 */
export async function readHostScaleProgress({timeout=800,keyLimit=512}={},reader=null){
 const base={acceptance:'NOT_ESTABLISHED',evidence:'DIAGNOSTIC_ROOT_INVENTORY_ONLY'};
 if(!Number.isInteger(timeout)||timeout<1||timeout>1000||!Number.isInteger(keyLimit)||keyLimit<1||keyLimit>512)return {...base,status:'INVALID_DIAGNOSTIC_OPTIONS'};
 const deadline=performance.now()+timeout;
 let database,timer,expired=false;const transactions=new Set();
 const work=async()=>{
  if(!reader){
   const [{NativeRepository},{normalizedScope},{nativeUnpack}]=await Promise.all([import(chrome.runtime.getURL('src/data/native-repository.mjs')),import(chrome.runtime.getURL('src/b1/identity.mjs')),import(chrome.runtime.getURL('src/data/native-partitions.mjs'))]);
   if(expired)throw Error('deadline');
   const info=(await indexedDB.databases()).find(row=>row.name==='vaiwl-b1-v1');if(!info)return null;
   if(expired)throw Error('deadline');
   database=await new Promise((resolve,reject)=>{const request=indexedDB.open(info.name,info.version);request.onupgradeneeded=()=>{request.transaction.abort();reject(Error('schema-upgrade-refused'));};request.onerror=()=>reject(Error('database-open-failed'));request.onsuccess=()=>{if(expired){request.result.close();reject(Error('deadline'));}else resolve(request.result);};});
   if(!database.objectStoreNames.contains('native_states')||!database.objectStoreNames.contains('native_operations'))return null;
   const repository=new NativeRepository({baseRepository:{open:async()=>{throw Error('diagnostic-no-repository-io');},scopeOrThrow:normalizedScope}});
   reader=()=>new Promise((resolve,reject)=>{
    if(expired){reject(Error('deadline'));return;}
    const tx=database.transaction(['native_states','native_operations'],'readonly');transactions.add(tx);
    const store=tx.objectStore('native_states'),cursor=store.openKeyCursor();let visited=0,roots=[],result=null,failure;
    const fail=error=>{failure=error;tx.abort();};
    cursor.onsuccess=()=>{try{
     const item=cursor.result;
     if(item){/* Nested shard keys begin with a serialized scope, never a root token. */
      if(typeof item.key==='string'&&item.key.startsWith('["[')){item.continue('["\\');return;}
      if(++visited>keyLimit)throw Error('key-scan-limit');const key=item.key;let tokens;try{tokens=JSON.parse(key);}catch{}
      if(Array.isArray(tokens)&&tokens.length===3&&tokens.every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v))){const row=store.get(key);row.onsuccess=()=>{if(row.result?.payload?.scopeKey===key)roots.push({key,tokens,row:row.result});};}item.continue();return;}
     if(roots.length!==1){if(roots.length)throw Error('ambiguous-scope');return;}
     const {key,tokens,row}=roots[0],scope=normalizedScope({verified:true,provider:tokens[0],accountId:tokens[1],organizationId:tokens[2]});
     const root=repository.verifiedRoot(row,scope),request=tx.objectStore('native_operations').get(key);
     request.onsuccess=()=>{try{const marker=nativeUnpack(request.result);if(marker.revision!==root.revision)throw Error('root-marker-conflict');result={root,continuationWitness:!!marker.continuations};}catch(error){fail(error);}};
    }catch(error){fail(error);}};
    tx.oncomplete=()=>{transactions.delete(tx);resolve(result);};tx.onabort=()=>{transactions.delete(tx);reject(failure??Error('snapshot-aborted'));};
   });
  }
  const snapshot=await reader();if(expired||performance.now()>=deadline)throw Error('deadline');if(!snapshot)return {...base,status:'INDEX_ABSENT'};
  const {root,continuationWitness}=snapshot,indexed=root.format==='vaiwl-native-version-index-v1';
  const count=kind=>indexed?Object.values(root[kind]).reduce((n,row)=>n+row.count,0):Object.keys(root[kind]).length;
  const sources=Object.values(root.sources),revisions=sources.map(row=>row.sourceRevision);
  const result={...base,status:'POINT_IN_TIME_ROOT_SNAPSHOT',consistency:'SINGLE_READONLY_TRANSACTION_NOT_INTERVAL_STABILITY',format:indexed?'VERSION_INDEX':root.format==='vaiwl-native-partitions-v1'?'PARTITIONED':'FACTS',revision:root.revision,inventoryRefs:count('refs'),inventoryProjects:count('projects'),sources:sources.length,revokedSources:sources.filter(row=>row.revoked).length,sourceRevisionMin:revisions.length?Math.min(...revisions):null,sourceRevisionMax:revisions.length?Math.max(...revisions):null,continuationWitness:!!continuationWitness,queueState:'NOT_READ'};
  if(performance.now()>=deadline)throw Error('deadline');return result;
 };
 try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;for(const tx of transactions){try{tx.abort();}catch{}}reject(Error('deadline'));},Math.max(0,deadline-performance.now()));})]);}
 catch(error){return {...base,status:error.message==='deadline'?'DIAGNOSTIC_TIMEOUT':error.message==='key-scan-limit'?'DIAGNOSTIC_KEY_LIMIT':'DIAGNOSTIC_UNAVAILABLE'};}
 finally{expired=true;clearTimeout(timer);database?.close();}
}

export async function hostScaleFailureProgress(page,extensionId,{timeout=1000}={}){
 const base={acceptance:'NOT_ESTABLISHED',evidence:'DIAGNOSTIC_ROOT_INVENTORY_ONLY'};
 if(!page||page.isClosed()||!extensionId)return {...base,status:'NO_CURRENT_FRAME'};
 const current=()=>page.frames().filter(frame=>!frame.isDetached()&&frame.url()===`chrome-extension://${extensionId}/workspace.html`);
 const deadline=performance.now()+timeout;
 const frames=current();if(frames.length!==1)return {...base,status:'NO_UNIQUE_CURRENT_FRAME'};
 let timer;try{
  const result=await Promise.race([frames[0].evaluate(readHostScaleProgress,{timeout:Math.min(800,timeout),keyLimit:512}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('deadline')),Math.max(0,deadline-performance.now()));})]);
  const after=current();if(page.isClosed()||after.length!==1||after[0]!==frames[0])return {...base,status:'FRAME_CHANGED'};
  if(performance.now()>=deadline)throw Error('deadline');
  return result;
 }catch{return {...base,status:'DIAGNOSTIC_UNAVAILABLE'};}finally{clearTimeout(timer);}
}
