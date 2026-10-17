/** TEST ONLY readonly inspector callback. Runs in an extension-origin page.
 * Inspection does not provide grants/admissions, repair data or send messages.
 */
export async function readPendingRepairState({scope,origin}){
 const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));
 const {NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs'));
 const {FreeEvidenceRepository,freeEvidenceKey}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs'));
 const {WorkspaceRepository}=await import(chrome.runtime.getURL('src/data/repository.mjs'));
 const {digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
 const base=new ScopeRepository({indexedDB});
 try{
  const scopeKey=base.scopeOrThrow(scope).key,nativeRepo=new NativeRepository({baseRepository:base}),native=await nativeRepo.read(scope),continuations=await nativeRepo.listContinuations(scope);
  let evidence=null,evidenceError=null;
  try{evidence=await new FreeEvidenceRepository({baseRepository:base}).read(scope);}catch(error){if(error.message!=='corrupt-free-evidence-record')throw error;evidenceError=error.message;}
  const state=(await new WorkspaceRepository({baseRepository:base}).read(scope)).state;
  const subset={identities:state.identities,workspaces:state.workspaces,placements:state.placements,workingSet:state.preferences.workingSet??null,savedSnippets:state.preferences.savedSnippets??null,humanRefs:Object.fromEntries(Object.entries(state.refs).filter(([id])=>id==='33333333-3333-4333-8333-333333333333'))};
  const assets={hash:digest(subset),counts:{identities:Object.keys(subset.identities).length,workspaces:Object.keys(subset.workspaces).length,placements:Object.keys(subset.placements).length,snippets:subset.savedSnippets?.value?.length??0,workingSet:subset.workingSet?.value?.refs?.length??0,humanRefs:Object.keys(subset.humanRefs).length}};
  const db=await base.open(),rows=await new Promise((resolve,reject)=>{
   const tx=db.transaction(['native_states','native_operations','b23_views'],'readonly'),states=[],ops=[];
   for(const [name,output]of [['native_states',states],['native_operations',ops]]){const request=tx.objectStore(name).openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){output.push(cursor.value);cursor.continue();}};}
   const budget=tx.objectStore('b23_views').get('host-read-budget:'+digest([scope.accountId,scope.organizationId,origin]));
   tx.oncomplete=()=>resolve({states,ops,budget:budget.result});tx.onabort=()=>reject(tx.error);
  });
  const evidenceKey=freeEvidenceKey(scopeKey),isEvidence=row=>{let parts;try{parts=JSON.parse(row.key);}catch{return false;}return Array.isArray(parts)&&(parts[0]===evidenceKey||parts[0]===scopeKey&&typeof parts[1]==='string'&&parts[1].startsWith('free-evidence'));};
  const receipts=rows.ops.filter(row=>row.payload?.continuation?.scopeKey===scopeKey);
  const budget=rows.budget?{checksumValid:rows.budget.checksum===digest(rows.budget.payload),startedAt:rows.budget.payload.startedAt,lastAt:rows.budget.payload.lastAt,requests:rows.budget.payload.requests,attemptCounts:rows.budget.payload.attempts?.map(row=>row.count)}:null;
  return {scopeKey,native,evidence,evidenceError,continuations,continuationChecksumsValid:receipts.every(row=>row.checksum===digest(row.payload)),evidenceStorageDigest:digest({states:rows.states.filter(isEvidence),operations:rows.ops.filter(isEvidence)}),assets,budget};
 }finally{base.close();}
}
