/** Test-only readback. No page creation, focus changes, grants or data seeding. */
export async function inspectColdNativeCache(){
 // Runs in ServiceWorkerGlobalScope: use built-in IDB only, never import().
 let nativeRows=0;
 for(const entry of await indexedDB.databases()){
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(entry.name);q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('unexpected-cold-inspection-upgrade'));};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  try{if(db.objectStoreNames.contains('native_states'))nativeRows+=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readonly'),q=tx.objectStore('native_states').count();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
 }
 return {nativeRows};
}
export async function inspectNativeFactsInFrame({extensionId}){
 // Check actual execution realm before importing any repository code.
 if(typeof document==='undefined'||location.href!==`chrome-extension://${extensionId}/workspace.html`||chrome.runtime.id!==extensionId)throw Error('native-facts-inspection-requires-owned-workspace-frame');
 const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs'));const base=new ScopeRepository({indexedDB});
 try{const db=await base.open(),rows=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readonly'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});const roots=rows.filter(r=>r.key===r.payload?.scopeKey&&Object.values(r.payload?.sources??{}).some(s=>s.channel==='host-dom'));if(!roots.length)return null;if(roots.length!==1)throw Error('unexpected-scope-count');const [provider,accountId,organizationId]=JSON.parse(roots[0].key);return await new NativeRepository({baseRepository:base}).read({verified:true,provider,accountId,organizationId});}finally{base.close();}
}
export async function readNativeEntryFacts({pages,extensionId,fixtureOrigin}){
 for(const page of [...pages].reverse()){
  if(page.isClosed()||new URL(page.url()).origin!==fixtureOrigin)continue;
  const frame=page.frames().find(f=>!f.isDetached()&&f.parentFrame()===page.mainFrame()&&f.url()===`chrome-extension://${extensionId}/workspace.html`);
  if(!frame)continue;
  try{return await frame.evaluate(inspectNativeFactsInFrame,{extensionId});}catch(error){if(frame.isDetached())continue;throw error;}
 }
 // A native route may temporarily have no owned frame. Caller polls readiness;
 // it must never silently fall back to MAIN or a service worker import.
 return null;
}
