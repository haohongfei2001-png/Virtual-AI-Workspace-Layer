import {createFixtureService} from '../../simulator/service.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
import {persistentSeed,syntheticEvidenceGate} from '../../simulator/persistent-seed.mjs';
import {SHARED_DIRECTORY_FORMAT} from '../../src/data/shared-ref-directory.mjs';
import {digest} from '../../src/data/hash.mjs';
/** Same assertions under mock and browser IDB. Only the runner labels evidence. */
export async function runSharedLifecycleContracts(indexedDB,origin='https://vaiwl-hf.test'){
 const check=(v,m)=>{if(!v)throw Error(m);},equal=(a,b,m)=>check(digest(a)===digest(b),m+' '+JSON.stringify(a?.b23_states&&b?.b23_states?Object.fromEntries(Object.keys(a).map(store=>[store,[...new Set([...Object.keys(a[store]),...Object.keys(b[store])])].filter(key=>a[store][key]!==b[store][key])])):{actual:a,expected:b})),checks=[],A=normalizedScope(scopeOf('A')),B=normalizedScope(scopeOf('B'));
 const frame={documentId:'shared_lifecycle_document',documentLifecycle:'active',url:origin+'/hf/A/c/T0'},sender={id:'shared_lifecycle_extension',tab:{id:1},frameId:0,...frame};let seq=0,leaseId;
 const service=createFixtureService({indexedDB,extensionId:sender.id,getFrame:async()=>frame}),owner=service.workspaces;let second,reopened;
 const send=(type,extra={})=>service.broker.handle({v:1,type,clientId:'shared_lifecycle_client',seq:++seq,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 try{
  const bound=await send('BIND');check(bound.ok,'bind');leaseId=bound.leaseId;check((await send('B23_FREE_HEADER')).ok,'bootstrap header');
  // The following assertions isolate repository transactions. Drain/cancel the
  // independent known-anchor background writer before comparing whole stores.
  const background=[...service.runtime.bindings.values()].map(entry=>entry.referenceTask).filter(Boolean);service.runtime.stopAll();await Promise.allSettled(background);
  let state=(await owner.read(A)).state;check((await owner.command(A,{operationId:'preserved_human_title',expectedRevision:state.revision,command:{type:'SET_TITLE',refId:'T0',title:'迁移前人工名称'}})).ok,'human title');
  check((await owner.migratePartitioned(A)).ok,'initial partition');const baseline=(await owner.read(A)).state,backup=await owner.exportBackup(A),db=await service.repository.open();
  const get=(store,key)=>new Promise((resolve,reject)=>{const tx=db.transaction(store),q=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
  const put=(store,row)=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  const snapshot=()=>new Promise((resolve,reject)=>{const names=['b23_states','b23_checkpoints','b23_operations','refs','native_states','native_operations'],tx=db.transaction(names),rows=names.map(()=>[]);names.forEach((name,i)=>{const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const c=q.result;if(c){rows[i].push(c.value);c.continue();}};});tx.oncomplete=()=>resolve(Object.fromEntries(names.map((name,i)=>[name,Object.fromEntries(rows[i].map(row=>[row.key,digest(row)]))])));tx.onabort=()=>reject(tx.error);});
  const migrated=await send('B23_FREE_HEADER');check(migrated.ok,'migration header');state=(await owner.read(A)).state;equal({...state,revision:baseline.revision},baseline,'migration facts');check(state.revision===baseline.revision+1,'single migration revision');
  check((await get('b23_states',A.key)).payload.format===SHARED_DIRECTORY_FORMAT,'directory root');check((await get('b23_checkpoints',A.key)).payload.format===SHARED_DIRECTORY_FORMAT,'directory checkpoint');
  const afterBackup=await owner.exportBackup(A);equal({...afterBackup.payload,revision:backup.payload.revision},backup.payload,'backup assets unchanged');checks.push('service-header-migration-preserves-facts-pro-assets-and-backup');
  const beforeHeader=await snapshot();check((await send('B23_FREE_HEADER')).ok,'second header');equal(await snapshot(),beforeHeader,'no second migration');
  const page=await send('B23_FREE_PAGE',{revision:migrated.header.revision,offset:0,limit:5000,ids:{projects:[],refs:['T0']},now:FIXTURE_NOW,viewSession:migrated.header.viewSession});check(page.ok&&page.page.refs.some(ref=>ref.id==='T0'),'page target');check((await send('CHECK')).ok,'version check');checks.push('repeat-header-page-and-check-stable');
  second=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'});const other=new WorkspaceRepository({baseRepository:second,evidenceGate:syntheticEvidenceGate});
  const beforeCasRoot=await get('b23_states',A.key);
  const requests=['one','two'].map(name=>({operationId:'cas_'+name,expectedRevision:state.revision,command:{type:'SET_TITLE',refId:'T0',title:'CAS '+name}})),results=await Promise.all([owner.command(A,requests[0]),other.command(A,requests[1])]);
  check(results.filter(r=>r.ok).length===1,'one CAS winner');equal(await get('b23_checkpoints',A.key),beforeCasRoot,'CAS loser cannot replace winner checkpoint');check(results.find(r=>!r.ok)?.reason==='revision-conflict','CAS loser');const winner=results[0].ok?0:1,winning=requests[winner],stable=await snapshot();check((await owner.command(A,winning)).replayed,'receipt replay');equal(await snapshot(),stable,'replay no writes');
  state=(await owner.read(A)).state;check((await owner.undo(A,{operationId:'undo_cas',expectedRevision:state.revision,targetOperationId:winning.operationId})).ok,'undo');check((await owner.read(A)).state.identities.T0.title===baseline.identities.T0.title,'manual undo title');checks.push('two-connections-cas-replay-and-inverse');
  const preAbort=await snapshot(),original=db.transaction.bind(db);let staged=false;
  db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='b23_states'&&args[1]==='readwrite'){const originalPut=store.put.bind(store);store.put=row=>{const request=originalPut(row);if(!staged&&String(row.key).includes('ref-partition')){staged=true;tx.abort();}return request;};}return store;};return tx;};
  let aborted;try{state=(await owner.read(A)).state;aborted=await owner.command(A,{operationId:'aborted_write',expectedRevision:state.revision,command:{type:'SET_TITLE',refId:'T0',title:'不能落盘'}});}finally{db.transaction=original;}
  check(staged&&!aborted.ok,'staged transaction abort reported');equal(await snapshot(),preAbort,'whole store rollback');checks.push('real-transaction-abort-retains-root-checkpoint-receipts-and-native-data');
  const b=persistentSeed(B,origin);check((await owner.initializePartitioned(B,b)).ok,'account B seed');state=(await owner.read(A)).state;check((await owner.command(A,{operationId:'latest_human',expectedRevision:state.revision,command:{type:'SET_TITLE',refId:'T0',title:'恢复后的人工名称'}})).ok,'latest human');
  const good=await get('b23_states',A.key),bad={...good,checksum:'0'.repeat(64)};await put('b23_states',bad);const diagnosis=await owner.recoveryStatus(A);check(diagnosis.recoverable&&diagnosis.damagedHash===digest(bad),'diagnosis');
  const request={operationId:'lifecycle_recover',damagedHash:diagnosis.damagedHash},beforeConstraint=await snapshot();let duplicated=false;
  db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='b23_operations'&&args[1]==='readwrite'){const add=store.add.bind(store);store.add=row=>{const q=add(row);if(!duplicated&&row.payload?.type==='RECOVER'){duplicated=true;add(row);}return q;};}return store;};return tx;};
  let failedRecovery;try{failedRecovery=await owner.recover(A,request);}finally{db.transaction=original;}
  check(duplicated&&!failedRecovery.ok,'asynchronous duplicate recovery receipt abort reported');equal(await snapshot(),beforeConstraint,'recovery request failure rolls back all stores');checks.push('asynchronous-receipt-constraint-error-rolls-back-provisional-recovery');
  const recovery=await owner.recover(A,request);check(recovery.ok,'recovery commit');const recovered=(await owner.read(A)).state;check(recovered.identities.T0.title==='恢复后的人工名称','human journal preserved');check(Object.values(recovered.sources).every(source=>source.revoked),'all shared sources revoked');equal(recovered.workspaces,baseline.workspaces,'Pro workspaces');equal(recovered.placements,baseline.placements,'Pro placements');
  check((await owner.command(A,winning)).reason==='operation-invalidated-by-recovery','old receipt invalid');const postRecovery=await snapshot();check((await owner.recover(A,request)).replayed,'recovery replay');equal(await snapshot(),postRecovery,'recovery replay unchanged');equal((await owner.read(B)).state,b,'other account untouched');checks.push('complete-recovery-preserves-human-intent-revokes-sources-and-isolates-account');
  const assets=await owner.exportBackup(A);check(!Object.keys(assets.payload.sources).length&&!Object.keys(assets.payload.events).length,'backup has no evidence');check(assets.payload.identities.T0.title===recovered.identities.T0.title,'backup title');
  second.close();second=null;service.close();reopened=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'});const fresh=new WorkspaceRepository({baseRepository:reopened,evidenceGate:syntheticEvidenceGate});equal((await fresh.read(A)).state,recovered,'reopen persists');checks.push('manual-backup-and-database-reopen-preserve-recovered-state');
  return {checks,refs:Object.keys(recovered.refs).length,finalRevision:recovered.revision};
 }finally{second?.close();reopened?.close();service.close();}
}
