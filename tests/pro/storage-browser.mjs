import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createFixtureServer} from './serve.mjs';
const require=createRequire(import.meta.url),playwright=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??process.cwd()]}));

test('actual Chromium IDB: compound restore aborts both namespaces, commits once, persists and remains readable by Free',async()=>{
 const profile=await mkdtemp(join(tmpdir(),'vaiwl-unified-storage-profile-')),server=createFixtureServer(),external=[],errors=[];
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;let context;
 const launch=async()=>{const c=await playwright.chromium.launchPersistentContext(profile,{executablePath:process.env.PRO_CHROMIUM_EXECUTABLE,headless:true,args:['--no-zygote','--disable-gpu']});await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){external.push(u.origin);return route.abort();}return route.continue();});return c;};
 const page=async()=>{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/tests/pro/storage-browser-host.html');return p;};
 try{
  context=await launch();const p=await page();
  const report=await p.evaluate(async()=>{
   const [{createFixtureOwner},{createProController},{WorkspaceRepository},{createCompositeBackupRepository},{stable}]=await Promise.all([
    import('/tests/pro/support/fixture-owner.mjs'),import('/src/pro/runtime/controller.mjs'),import('/src/data/repository.mjs'),import('/src/pro/integration/composite-backup.mjs'),import('/src/data/hash.mjs')]);
   const ensure=(v,m)=>{if(!v)throw Error(m);};
   const make=async name=>{const owner=await createFixtureOwner({indexedDB,databaseName:name,fixtureOnly:true}),controller=await createProController(owner),workspace=new WorkspaceRepository({baseRepository:owner.base}),backup=createCompositeBackupRepository({workspaceRepository:workspace,resolvePro:async()=>({store:owner.store,grant:owner.grant(),versions:(await owner.readPrivate()).snapshot.versions})});return {owner,controller,workspace,backup};};
   const a=await make('unified_storage_source'),b=await make('unified_storage_target');
   try{
    ensure((await a.workspace.command(a.owner.scope,{operationId:'free_create',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'free_asset',name:'Free retained asset'}})).ok,'free setup');
    await a.controller.dispatch({type:'CREATE_TOPIC',name:'Pro retained asset'});await a.controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'Persistent derived title'});
    const bundle=await a.backup.exportBackup(a.owner.scope),plan=await b.backup.previewRestore(b.owner.scope,bundle),request={bundle,operationId:'compound_restore',planHash:plan.planHash,expectedRevision:plan.expectedRevision},db=await b.owner.base.open();
    const beforeFree=await b.workspace.read(b.owner.scope),beforePro=await b.owner.store.read(b.owner.grant());
    const originalTransaction=db.transaction.bind(db);let abortedAfterBothNamespaces=false;
    db.transaction=(...args)=>{const tx=originalTransaction(...args),originalStore=tx.objectStore.bind(tx),instrumented=new WeakSet();tx.objectStore=name=>{const store=originalStore(name);if(args[1]==='readwrite'&&name==='b23_operations'&&!instrumented.has(store)){instrumented.add(store);const put=store.put.bind(store);store.put=row=>{const write=put(row);if(row.payload?.scopeKey===b.owner.scope.key&&row.payload.type==='RESTORE_BACKUP')write.addEventListener('success',()=>{abortedAfterBothNamespaces=true;tx.abort();},{once:true});return write;};}return store;};return tx;};
    const aborted=await b.backup.restoreBackup(b.owner.scope,request);db.transaction=originalTransaction;
    ensure(aborted.ok===false&&abortedAfterBothNamespaces,'real IDB must abort after both namespaces queued');
    ensure(stable(await b.workspace.read(b.owner.scope))===stable(beforeFree),'Free root/history rollback');ensure(stable(await b.owner.store.read(b.owner.grant()))===stable(beforePro),'Pro root/checkpoint/history rollback');
    const committed=await b.backup.restoreBackup(b.owner.scope,request);ensure(committed.ok,'compound commit');
    const replayed=await b.backup.restoreBackup(b.owner.scope,request);ensure(replayed.ok&&replayed.replayed,'idempotent restore');
    const legacy=new WorkspaceRepository({baseRepository:b.owner.base}),free=(await legacy.read(b.owner.scope)).state,pro=(await b.owner.store.read(b.owner.grant())).state;
    ensure(free.workspaces.free_asset?.name==='Free retained asset','legacy Free read');ensure(pro.titles.c_beta?.title==='Persistent derived title','Pro title');ensure(db.version===4,'DB4 retained');
    return {scope:b.owner.scope,free,pro,abortedAfterBothNamespaces,actualIndexedDB:true,legacyFreeReader:true,databaseVersion:db.version,restoredProcessingPermission:false};
   }finally{a.controller.destroy();b.controller.destroy();}
  });
  const version=context.browser()?.version()??'chromium';await context.close();context=null;
  context=await launch();const reopened=await page();const after=await reopened.evaluate(async(scope)=>{
   const [{createFixtureOwner},{WorkspaceRepository}]=await Promise.all([import('/tests/pro/support/fixture-owner.mjs'),import('/src/data/repository.mjs')]);
   const owner=await createFixtureOwner({indexedDB,databaseName:'unified_storage_target',fixtureOnly:true,scope}),legacy=new WorkspaceRepository({baseRepository:owner.base});if((await owner.raw()).sequence>0)await owner.restart();try{return {free:(await legacy.read(scope)).state,pro:(await owner.store.read(owner.grant())).state,processingMode:owner.status().processingMode};}finally{owner.stop();}
  },report.scope);
  assert.deepEqual(after.free,report.free);assert.deepEqual(after.pro,report.pro);assert.equal(after.processingMode,'off');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  if(process.env.PRO_EVIDENCE_DIR){await mkdir(process.env.PRO_EVIDENCE_DIR,{recursive:true});await writeFile(join(process.env.PRO_EVIDENCE_DIR,'compound-storage-browser.json'),JSON.stringify({status:'PASS',browserVersion:version,actualIndexedDB:true,abortedAfterBothNamespaces:true,processRestart:true,databaseVersion:4,legacyFreeReader:true,grantsRestored:false,externalRequests:external,errors,liveChatGPT:'NOT_RUN',mv3Worker:'NOT_CLAIMED'},null,2)+'\n');}
 }finally{await context?.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}
});
