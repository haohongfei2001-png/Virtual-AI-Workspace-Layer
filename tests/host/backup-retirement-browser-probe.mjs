/** Production owner/repository on real extension-origin IDB; synthetic UI authority.
 * The transaction hook selects a boundary only and never aborts the transaction.
 * This is not evidence of browser document revocation delivery or real accounts.
 */
export async function verifyBackupRetirement(probe){
 return probe.evaluate(async()=>{
  const {createHostBackupService}=await import(chrome.runtime.getURL('src/runtime/host-backup-service.mjs'));
  const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));
  const {WorkspaceRepository}=await import(chrome.runtime.getURL('src/data/repository.mjs'));
  const {normalizedScope}=await import(chrome.runtime.getURL('src/b1/identity.mjs'));
  const {encodeBackupChunk}=await import(chrome.runtime.getURL('src/host/backup-transfer.mjs'));
  const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'backup-boundary-fixture',organizationId:'personal'});
  const results=[],check=(value,message)=>{if(!value)throw Error(message);};
  for(const action of ['normal','ui','parent','close','committed']){
   const base=new ScopeRepository({indexedDB,databaseName:'backup-boundary-target-'+action});
   const sourceBase=new ScopeRepository({indexedDB,databaseName:'backup-boundary-source-'+action});
   let service;
   try{
    const repo=new WorkspaceRepository({baseRepository:base}),source=new WorkspaceRepository({baseRepository:sourceBase});
    check((await source.command(scope,{operationId:'seed',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'imported',name:'Synthetic human workspace'}})).ok,'seed-failed');
    const ui={withScope:async(_,work)=>work({scope,scopeGrantId:'fixture-scope',parentFrame:{documentId:'parent'},isCurrent:()=>true})};
    service=createHostBackupService({ui,workspaceRepository:repo});
    const request=(action,fields={})=>service.handle({v:1,type:'HOST_UI_BACKUP_'+action,grantId:'fixture-grant',mountId:'fixture-mount',...fields},{documentId:'ui'});
    const bytes=new TextEncoder().encode(JSON.stringify(await source.exportBackup(scope)));
    const upload=await request('UPLOAD',{byteLength:bytes.length});check(upload.ok&&upload.chunkCount===1,'upload-fixture-boundary');
    check((await request('CHUNK',{transferId:upload.transferId,index:0,data:encodeBackupChunk(bytes)})).ok,'chunk-failed');
    const plan=await request('PREVIEW',{transferId:upload.transferId});check(plan.ok,'preview-failed');
    const db=await base.open(),transaction=db.transaction.bind(db);let reached=0,idleDuring=null,closeResult;
    const retire=()=>{if(action==='close')closeResult=request('CLOSE',{transferId:upload.transferId});else service.revokeDocument(action==='parent'?'parent':'ui');idleDuring=service.isIdle();};
    db.transaction=(stores,mode,...rest)=>{
     const tx=transaction(stores,mode,...rest);
     if(mode==='readwrite'&&Array.from(stores).includes('b23_operations')){
      if(action==='committed')tx.addEventListener('complete',()=>{reached++;retire();},{once:true});
      else if(action!=='normal'){
       const objectStore=tx.objectStore.bind(tx);
       tx.objectStore=name=>{
        const store=objectStore(name),put=store.put.bind(store);
        if(name==='b23_operations')store.put=value=>{const result=put(value);if(value.payload?.type==='RESTORE_BACKUP'){reached++;queueMicrotask(retire);}return result;};
        return store;
       };
      }
     }
     return tx;
    };
    const result=await request('RESTORE',{transferId:upload.transferId,planId:plan.planId,operationId:'boundary-restore'});
    if(closeResult)check((await closeResult).ok,'close-failed');
    const state=(await repo.read(scope)).state,committed=action==='normal'||action==='committed';
    check(result.ok===(action==='normal'),'wrong-owner-result');
    check(state.revision===(committed?1:0)&&!!state.workspaces.imported===committed,'wrong-persistent-result-'+action);
    if(action!=='normal')check(reached===1&&idleDuring===false,'unwitnessed-boundary-or-early-idle');
    results.push({action,ownerOK:result.ok,revision:state.revision,committed,retirementWitnessed:action!=='normal',pendingAccountingRetained:action!=='normal'});
   }finally{service?.stop();base.close();sourceBase.close();}
  }
  return {evidence:'PRODUCTION_OWNER_REAL_IDB_SYNTHETIC_UI_AUTHORITY',results};
 });
}
