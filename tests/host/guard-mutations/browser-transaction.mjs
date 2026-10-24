/** Real extension-origin IndexedDB, isolated database, explicit synthetic owner authority.
 * A page close is the actual writer-lifetime boundary, not MockIDB or a fake timer.
 */
export async function runDatabaseCut(context,id,origin){
 const page=await context.newPage();await page.goto(`chrome-extension://${id}/workspace.html`);
 const databaseName='guard_atomic_'+Date.now()+'_'+Math.random().toString(36).slice(2);
 const cut=await page.evaluate(async({databaseName,origin})=>{
  const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),
  {NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs')),
  {normalizedScope}=await import(chrome.runtime.getURL('src/b1/identity.mjs')),
  {digest}=await import(chrome.runtime.getURL('src/data/hash.mjs')),
  {continuationSemanticFingerprint}=await import(chrome.runtime.getURL('src/data/native-observation-continuation.mjs'));
  const NOW='2026-10-13T12:00:00Z',scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'guard_fixture',organizationId:'personal'}),gates=new WeakMap(),base=new ScopeRepository({indexedDB,databaseName});
  const native=new NativeRepository({baseRepository:base,clock:()=>NOW,hostObservationGate:(s,r)=>s.key===scope.key?gates.get(r):undefined});
  function make(operationId='native_ack',expectedRevision=0){
   const sourceId='host_ack',generation='generation_one',scopeKey=scope.key,request={operationId,expectedRevision,batch:{scopeKey,sourceRevision:expectedRevision+1,observedAt:NOW,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id:'continuation_ref',nativeTitle:'Native title',nativeUrl:origin+'/c/continuation_ref',availability:'available'}],membership:[{id:'continuation_ref',state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}};
   const batch={sources:[{id:sourceId,generation,sourceRevision:1,observedAt:NOW,validUntil:'2026-10-14T00:00:00Z',channel:'host-evidence',codecVersion:1,profileId:'profile_one',profileVersion:1}],events:[],coverage:[],hints:[{id:'anchor_one',sourceId,generation,sourceRevision:1,observedAt:NOW,conversationId:'continuation_ref',eventKey:'ref_message',hintType:'observed-self-send',anchorVersion:1,messageId:'message_one',firstObservedAt:NOW,candidateInterval:{from:'2026-10-13T11:59:59Z',through:NOW},clockBasis:'local-bounded',calibrationDueAt:'2026-10-13T12:01:00Z',actorVerified:true,actorScopeKey:scopeKey,ackWitness:{kind:'authenticated-message-readback',profileId:'profile_one',profileVersion:1,semanticFingerprint:digest(['continuation_ref','message_one'])}}]};
   const admission={profileId:'profile_one',profileVersion:1,evidenceClass:'surface',semanticFingerprint:digest(request.batch),acceptedAt:NOW},gate={channel:'host-dom',sourceId,generation,guard:()=>true,admission,continuation:{evidenceOperationId:'evidence_ack',expectedEvidenceRevision:0,batch},continuationAdmission:{...admission,evidenceClass:'observed-self-send',semanticFingerprint:continuationSemanticFingerprint(batch)}};gates.set(request,gate);return {request,gate};
  }
  let mark;const postCommitCut=new Promise(r=>mark=r);globalThis.__guardPostCommitCut=()=>mark({cut:'after-native-before-continuation'});
  const {request}=make();const applied=native.apply(scope,request).then(result=>{if(!result.ok)throw Error('native-apply-precondition:'+JSON.stringify(result));return {cut:'atomic-commit-complete'};});
  const reached=await Promise.race([applied,postCommitCut]);
  // Verify commit in a separate readonly IDB transaction before closing writer.
  const facts=await native.read(scope);return {...reached,scope,nativeCommitted:!!facts.refs.continuation_ref};
 },{databaseName,origin});
 if(!cut.nativeCommitted)throw Error('postcommit-cut-not-established');
 await page.close();
 const reader=await context.newPage();await reader.goto(`chrome-extension://${id}/workspace.html`);
 try{const pendingAfterClose=await reader.evaluate(async({databaseName,scope})=>{
  const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs'));
  const base=new ScopeRepository({indexedDB,databaseName});try{return (await new NativeRepository({baseRepository:base}).listContinuations(scope)).length;}finally{base.close();}
 },{databaseName,scope:cut.scope});return {...cut,pendingAfterClose,writerPageClosed:true,authority:'EXPLICIT_TEST_WEAKMAP_NOT_PRODUCTION_ACK'};
 }finally{await reader.close();}
}
