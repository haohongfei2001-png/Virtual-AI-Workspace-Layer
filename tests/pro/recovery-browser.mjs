import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createFixtureServer} from './serve.mjs';
const require=createRequire(import.meta.url),playwright=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??process.cwd()]}));

test('actual Chromium IDB: explicit missing-root repair has zero partial abort, preserves quarantine, survives restart and leaves Free readable',async()=>{
 const profile=await mkdtemp(join(tmpdir(),'vaiwl-recovery-profile-')),server=createFixtureServer(),external=[],errors=[];
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;let context;
 const launch=async()=>{const c=await playwright.chromium.launchPersistentContext(profile,{executablePath:process.env.PRO_CHROMIUM_EXECUTABLE,headless:true,args:['--no-zygote','--disable-gpu']});await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){external.push(u.origin);return route.abort();}return route.continue();});return c;};
 const openPage=async()=>{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/tests/pro/storage-browser-host.html');return p;};
 try{
  context=await launch();const page=await openPage();
  const report=await page.evaluate(async()=>{
   const [{createFixtureOwner},{createProController},{WorkspaceRepository},{proRootKey,proRecoveryKey},{stable}]=await Promise.all([
    import('/tests/pro/support/fixture-owner.mjs'),import('/src/pro/runtime/controller.mjs'),import('/src/data/repository.mjs'),import('/src/pro/integration/storage-registry.mjs'),import('/src/data/hash.mjs')]);
   const ensure=(value,message)=>{if(!value)throw Error(message);};
   const owner=await createFixtureOwner({indexedDB,databaseName:'unified_recovery',fixtureOnly:true}),controller=await createProController(owner),free=new WorkspaceRepository({baseRepository:owner.base});
   try{
    ensure((await free.command(owner.scope,{operationId:'free_human_asset',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'keep_free',name:'Free asset survives repair'}})).ok,'Free setup');
    await controller.dispatch({type:'CREATE_TOPIC',name:'Recovered human topic'});await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'Recovered protected title'});
    const topicId=Object.keys(controller.getState().topics)[0];await controller.dispatch({type:'EXCLUDE_TOPIC',refId:'c_gamma',topicId});await owner.pauseLocal();
    const original=await owner.store.read(owner.grant()),expected=controller.getSnapshot().versions,db=await owner.base.open(),key=proRootKey(owner.scope.key),quarantineKey=proRecoveryKey(owner.scope.key);
    const dump=()=>new Promise(resolve=>{const names=['b23_states','b23_checkpoints','b23_operations','native_states','native_operations'],out={},tx=db.transaction(names);for(const name of names){out[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){out[name].push(q.result.value);q.result.continue();}};}tx.oncomplete=()=>resolve(out);});
    const beforeFree=(await free.read(owner.scope)).state;
    await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite');tx.objectStore('b23_states').delete(key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
    let blocked=false;try{await owner.store.read(owner.grant());}catch(e){blocked=e.message==='pro-missing-root-with-history';}ensure(blocked,'missing root must fail closed');
    const damaged=await dump(),preview=await owner.store.previewRecovery(owner.grant(),{expected});ensure(preview.counts.topics===1&&preview.counts.constraints===1&&preview.sequence===3,'bounded complete-history preview');ensure(stable(await dump())===stable(damaged),'preview is read-only');
    const request={operationId:'explicit_repair',expected,planHash:preview.planHash,requestFingerprint:{kind:'explicit-recovery',originalReview:'browser-review'}},originalTransaction=db.transaction.bind(db);let aborted=false,queuedWrites=0;
    db.transaction=(...args)=>{const tx=originalTransaction(...args),originalStore=tx.objectStore.bind(tx),instrumented=new WeakSet();tx.objectStore=name=>{const store=originalStore(name);if(args[1]==='readwrite'&&!instrumented.has(store)){instrumented.add(store);for(const method of ['add','put']){const write=store[method].bind(store);store[method]=row=>{if([key,quarantineKey].includes(row.key))queuedWrites++;const q=write(row);if(row.key===quarantineKey)q.addEventListener('success',()=>{aborted=true;tx.abort();},{once:true});return q;};}}return store;};return tx;};
    const rolledBack=await owner.store.recover(owner.grant(),request);db.transaction=originalTransaction;
    ensure(rolledBack.ok===false&&aborted&&queuedWrites===3,'abort after all three repair writes queued');ensure(stable(await dump())===stable(damaged),'root checkpoint quarantine all roll back');
    const repaired=await owner.store.recover(owner.grant(),request);ensure(repaired.ok&&!repaired.replayed,'explicit repair commit');ensure(stable(await owner.store.read(owner.grant()))===stable(original),'all overlay and original journal preserved');
    const after=await dump(),quarantine=after.b23_states.find(r=>r.key===quarantineKey);ensure(quarantine?.payload.original.root===null,'missing original retained');ensure(stable(quarantine.payload.original.checkpoint)===stable(damaged.b23_checkpoints.find(r=>r.key===key)),'exact original checkpoint retained');
    ensure(stable(after.b23_operations)===stable(damaged.b23_operations),'journal remains untouched');ensure(stable(after.native_states)===stable(damaged.native_states)&&stable(after.native_operations)===stable(damaged.native_operations),'native evidence remains untouched');
    const retry=await owner.store.recover(owner.grant(),request);ensure(retry.ok&&retry.replayed,'repair replay');ensure(stable(await dump())===stable(after),'replay zero writes');
    const legacy=new WorkspaceRepository({baseRepository:owner.base}),freeAfter=(await legacy.read(owner.scope)).state;ensure(stable(freeAfter)===stable(beforeFree),'old Free path reads identical assets');ensure(owner.status().processingMode==='off','data repair cannot restore processing');
    return {scope:owner.scope,original,free:freeAfter,quarantine,requestFingerprint:request.requestFingerprint,operationId:request.operationId,receipt:repaired.value,queuedWrites};
   }finally{controller.destroy();}
  });
  const version=context.browser()?.version()??'chromium';await context.close();context=null;
  context=await launch();const reopened=await openPage();const after=await reopened.evaluate(async report=>{
   const [{createFixtureOwner},{WorkspaceRepository},{proRecoveryKey}]=await Promise.all([import('/tests/pro/support/fixture-owner.mjs'),import('/src/data/repository.mjs'),import('/src/pro/integration/storage-registry.mjs')]);
   const owner=await createFixtureOwner({indexedDB,databaseName:'unified_recovery',fixtureOnly:true,scope:report.scope});await owner.restart();try{
    const db=await owner.base.open(),quarantine=await new Promise(resolve=>{const q=db.transaction('b23_states').objectStore('b23_states').get(proRecoveryKey(report.scope.key));q.onsuccess=()=>resolve(q.result);});
    return {pro:await owner.store.read(owner.grant()),free:(await new WorkspaceRepository({baseRepository:owner.base}).read(report.scope)).state,quarantine,reconciled:await owner.store.reconcileRecovery(owner.grant(),{operationId:report.operationId,requestFingerprint:report.requestFingerprint}),processingMode:owner.status().processingMode,databaseVersion:db.version};
   }finally{owner.stop();}
  },report);
  assert.deepEqual(after.pro,report.original);assert.deepEqual(after.free,report.free);assert.deepEqual(after.quarantine,report.quarantine);assert.deepEqual(after.reconciled.value,report.receipt);assert.equal(after.reconciled.replayed,true);assert.equal(after.processingMode,'off');assert.equal(after.databaseVersion,4);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  if(process.env.PRO_EVIDENCE_DIR){await mkdir(process.env.PRO_EVIDENCE_DIR,{recursive:true});await writeFile(join(process.env.PRO_EVIDENCE_DIR,'recovery-storage-browser.json'),JSON.stringify({status:'PASS',browserVersion:version,actualIndexedDB:true,injectedMissingRoot:true,completeJournalReplay:true,repairWritesQueued:report.queuedWrites,abortZeroPartial:true,immutableQuarantine:true,processRestart:true,durableRepairReceipt:true,legacyFreeReader:true,databaseVersion:4,grantsRestored:false,externalRequests:external,errors,liveChatGPT:'NOT_RUN',mv3Worker:'NOT_CLAIMED'},null,2)+'\n');}
 }finally{await context?.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}
});
