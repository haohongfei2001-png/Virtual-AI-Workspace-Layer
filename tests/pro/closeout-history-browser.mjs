import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createFixtureServer} from './serve.mjs';
const require=createRequire(import.meta.url),playwright=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??process.cwd()]}));

test('actual Chromium IDB: real history rollover, retained undo/replay, repeated repair and immutable receipt restart', {timeout:180000},async()=>{
 const profile=await mkdtemp(join(tmpdir(),'vaiwl-closeout-history-')),server=createFixtureServer(),external=[],errors=[];
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;let context;
 const launch=async()=>{const c=await playwright.chromium.launchPersistentContext(profile,{executablePath:process.env.PRO_CHROMIUM_EXECUTABLE,headless:true,args:['--no-zygote','--disable-gpu']});await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){external.push(u.origin);return route.abort();}return route.continue();});return c;};
 const open=async()=>{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/tests/pro/storage-browser-host.html');return p;};
 try{
  context=await launch();const p=await open(),report=await p.evaluate(async()=>{
   const [{createFixtureOwner},{createProController},{planTransaction,previewUndo},{proRootKey,proOperationKey,proHistoryKey},{digest,stable}]=await Promise.all([
    import('/tests/pro/support/fixture-owner.mjs'),import('/src/pro/runtime/controller.mjs'),import('/src/pro/domain/index.mjs'),import('/src/pro/integration/storage-registry.mjs'),import('/src/data/hash.mjs')]);
   const ensure=(v,m)=>{if(!v)throw Error(m);},owner=await createFixtureOwner({indexedDB,databaseName:'closeout_history',fixtureOnly:true}),controller=await createProController(owner);
   try{
    const firstCommand={type:'CREATE_TOPIC',name:'Archived human operation'},first=await controller.dispatch(firstCommand);
    await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'Independent retained title'});
    const firstRequest={operationId:first.operationId,expected:first.base,fingerprint:{actor:'human',command:firstCommand,expected:first.base}},snapshot=controller.getSnapshot(),db=await owner.base.open();let state=controller.getState(),aborted=false,archiveWrites=0;
    const versions=()=>({...snapshot.versions,overlayRevision:state.revision,constraintRevision:state.revision,targets:Object.fromEntries([...Object.values(state.topics).map(x=>['topic_'+x.id,x.revision]),...Object.values(state.titles).map(x=>['title_'+x.conversationId,x.revision])])});
    const get=(store,key)=>new Promise((resolve,reject)=>{const tx=db.transaction(store),q=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
    const firstBefore=await get('b23_operations',proOperationKey(owner.scope.key,first.operationId));
    const commit=async(id,command,historyOperationIds=[])=>{
      const expected=versions();let planned;
      const result=await owner.store.transact(owner.grant(),{operationId:id,expected,historyOperationIds,fingerprint:{actor:'human',command,expected},execute(current,records){
        const context={actor:'human',operationId:id,snapshot:{...snapshot,versions:expected},expected,mode:'pro-default-none',operations:Object.fromEntries(records.filter(r=>r.transaction.actor!=='system').map(r=>[r.transaction.operationId,r.transaction]))};
        planned=planTransaction(current,command,context);
        return {state:planned.state,transaction:{operationId:id,actor:'human',provenance:'explicit-user-command',base:expected,planHash:planned.planHash,resultRevision:planned.state.revision,proposalId:null,
          inverse:planned.inverse,patch:planned.patch,inverseHash:planned.inverseHash,readSet:planned.readSet,status:'applied'},...(command.type==='UNDO_TRANSACTION'?{undoneOperationId:command.targetOperationId}:{})};
      }});if(result.ok)state=planned.state;return result;
    };
    for(let i=0;i<510;i++){const result=await commit('human_lock_'+i,{type:'SET_LOCK',target:{kind:'title',refId:'c_beta'},locked:i%2===0});ensure(result.ok,'real sequential commit '+i+': '+result.reason);}
    const rootBefore=await get('b23_states',proRootKey(owner.scope.key)),originalTransaction=db.transaction.bind(db);
    db.transaction=(...args)=>{const tx=originalTransaction(...args),originalStore=tx.objectStore.bind(tx),seen=new WeakSet();tx.objectStore=name=>{const store=originalStore(name);if(args[1]==='readwrite'&&name==='b23_checkpoints'&&!seen.has(store)){seen.add(store);const add=store.add.bind(store);store.add=row=>{const q=add(row);if(row.key===proHistoryKey(owner.scope.key,1)){archiveWrites++;q.addEventListener('success',()=>{aborted=true;tx.abort();},{once:true});}return q;};}return store;};return tx;};
    const failed=await commit('rollover_commit',{type:'SET_LOCK',target:{kind:'title',refId:'c_beta'},locked:true});db.transaction=originalTransaction;
    ensure(!failed.ok&&aborted&&archiveWrites===1,'abort real archive write');ensure(stable(await get('b23_states',proRootKey(owner.scope.key)))===stable(rootBefore),'rollover root rollback');ensure(await get('b23_checkpoints',proHistoryKey(owner.scope.key,1))===undefined,'rollover archive rollback');
    ensure((await commit('rollover_commit',{type:'SET_LOCK',target:{kind:'title',refId:'c_beta'},locked:true})).ok,'rollover commit');
    const raw=await owner.raw(),root=await get('b23_states',proRootKey(owner.scope.key)),archive=await get('b23_checkpoints',proHistoryKey(owner.scope.key,1));
    ensure(raw.sequence===513&&raw.records.length===1&&root.payload.format==='vaiwl-pro-root/2','bounded v2 active root');ensure(archive.payload.operationIds.length===512,'512 retained archive receipts');
    ensure(stable(await get('b23_operations',proOperationKey(owner.scope.key,first.operationId)))===stable(firstBefore),'original receipt bytes unchanged');
    const page=await owner.store.readHistory(owner.grant(),{offset:510,limit:10,visibleOnly:true});ensure(stable(page.records.map(r=>r.sequence))===stable([3,2,1])&&page.total===513&&!page.hasMore,'oldest visible page');
    const old=await owner.store.getOperation(owner.grant(),first.operationId),preview=previewUndo(state,old.transaction);ensure(preview.state==='ready','old undo remains complete');
    ensure((await commit('undo_old_topic',{type:'UNDO_TRANSACTION',targetOperationId:first.operationId,reviewedInverseHash:preview.inverseHash},[first.operationId])).ok,'archived whole undo');
    ensure(Object.keys(state.topics).length===0&&state.titles.c_beta.title==='Independent retained title','undo keeps later independent asset');
    const replay=await owner.store.transact(owner.grant(),{...firstRequest,execute(){throw Error('must-not-reexecute-old-intent');}});ensure(replay.ok&&replay.replayed,'old durable receipt replay');
    return {scope:owner.scope,firstRequest,state,sequence:514,archiveChecksum:archive.checksum,originalInverse:first.inverse,abortedArchiveWrite:aborted,actualSequentialHumanCommits:514,syntheticSeededJournalRows:0};
   }finally{controller.destroy();}
  });
  const version=context.browser()?.version()??'chromium';await context.close();context=null;context=await launch();const reopened=await open();
  const after=await reopened.evaluate(async report=>{
   const [{createFixtureOwner},{proRootKey,proHistoryKey,proRecoveryKey,proRecoveryHeadKey,proRecoveryReceiptKey},{stable}]=await Promise.all([import('/tests/pro/support/fixture-owner.mjs'),import('/src/pro/integration/storage-registry.mjs'),import('/src/data/hash.mjs')]);
   const ensure=(v,m)=>{if(!v)throw Error(m);},owner=await createFixtureOwner({indexedDB,databaseName:'closeout_history',fixtureOnly:true,scope:report.scope});await owner.restart();
   try{
    const before=await owner.readPrivate(),db=await owner.base.open();ensure(stable(before.state)===stable(report.state),'process restart assets');
    const old=await owner.store.getOperation(owner.grant(),report.firstRequest.operationId);ensure(old.transaction.status==='undone'&&stable(old.transaction.inverse)===stable(report.originalInverse),'restart old complete inverse');
    const replay=await owner.store.transact(owner.grant(),{...report.firstRequest,execute(){throw Error('must-not-replay');}});ensure(replay.ok&&replay.replayed,'restart durable receipt');
    await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite');tx.objectStore('b23_states').delete(proRootKey(report.scope.key));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
    let denied=false;try{await owner.raw();}catch(e){denied=e.message==='pro-missing-root-with-history';}ensure(denied,'missing root cannot reset archive');
    const expected=before.snapshot.versions,preview=await owner.store.previewRecovery(owner.grant(),{expected});ensure(preview.sequence===514,'checkpoint plus suffix highwater');
    const firstRepairRequest={operationId:'repair_after_restart',expected,planHash:preview.planHash,requestFingerprint:{kind:'explicit-browser-repair',number:1}},repair=await owner.store.recover(owner.grant(),firstRepairRequest);ensure(repair.ok,'sealed checkpoint recovery '+repair.reason);
    const recovered=await owner.raw(),history=await owner.store.readHistory(owner.grant(),{offset:512,limit:10,visibleOnly:true});
    ensure(stable(recovered.state)===stable(report.state)&&recovered.sequence===514,'repaired exact final assets');ensure(history.total===514&&history.records.length===2,'retained paged history after repair');
    const archive=await new Promise((resolve,reject)=>{const tx=db.transaction('b23_checkpoints'),q=tx.objectStore('b23_checkpoints').get(proHistoryKey(report.scope.key,1));tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
    ensure(archive.checksum===report.archiveChecksum,'immutable checkpoint unchanged');
    const get=key=>new Promise((resolve,reject)=>{const tx=db.transaction('b23_states'),q=tx.objectStore('b23_states').get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);}),legacy=await get(proRecoveryKey(report.scope.key));
    await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite');tx.objectStore('b23_states').delete(proRootKey(report.scope.key));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
    const next=await owner.store.previewRecovery(owner.grant(),{expected});ensure(next.sequence===514&&next.planHash!==preview.planHash,'second corruption remains recoverable with a new review');
    const second=await owner.store.recover(owner.grant(),{operationId:'second_real_repair',expected,planHash:next.planHash,requestFingerprint:{kind:'explicit-browser-repair',number:2}});ensure(second.ok,'second real IDB recovery '+second.reason);
    const appended=await get(proRecoveryReceiptKey(report.scope.key,'second_real_repair')),head=await get(proRecoveryHeadKey(report.scope.key));
    ensure(head.payload.latest.number===2&&appended.payload.previous.checksum===legacy.checksum,'append-only recovery head');ensure(stable(await get(legacy.key))===stable(legacy),'original recovery evidence unchanged');
    ensure(stable((await owner.raw()).state)===stable(report.state),'second repair assets');
    const oldRepair=await owner.store.reconcileRecovery(owner.grant(),{operationId:firstRepairRequest.operationId,requestFingerprint:firstRepairRequest.requestFingerprint});ensure(oldRepair.replayed&&stable(oldRepair.value)===stable(repair.value),'old exact repair replay after second repair');
    return {state:recovered.state,sequence:recovered.sequence,processingMode:owner.status().processingMode,databaseVersion:db.version,historyTotal:history.total,repairProcessingMode:repair.value.processingMode,firstRepairRequest,firstRepairReceipt:repair.value,legacyChecksum:legacy.checksum};
   }finally{owner.stop();}
  },report);
  assert.deepEqual(after.state,report.state);assert.equal(after.sequence,514);assert.equal(after.historyTotal,514);assert.equal(after.databaseVersion,4);assert.equal(after.processingMode,'off');assert.equal(after.repairProcessingMode,'off');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await context.close();context=null;context=await launch();const last=await open(),receiptRestart=await last.evaluate(async({scope,after})=>{
    const [{createFixtureOwner},{proRecoveryKey,proRecoveryHeadKey}]=await Promise.all([import('/tests/pro/support/fixture-owner.mjs'),import('/src/pro/integration/storage-registry.mjs')]),owner=await createFixtureOwner({indexedDB,databaseName:'closeout_history',fixtureOnly:true,scope});await owner.restart();
    try{const db=await owner.base.open(),get=key=>new Promise((resolve,reject)=>{const tx=db.transaction('b23_states'),q=tx.objectStore('b23_states').get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});return {head:(await get(proRecoveryHeadKey(scope.key))).payload.latest.number,legacyChecksum:(await get(proRecoveryKey(scope.key))).checksum,replay:await owner.store.reconcileRecovery(owner.grant(),{operationId:after.firstRepairRequest.operationId,requestFingerprint:after.firstRepairRequest.requestFingerprint}),state:(await owner.raw()).state,processingMode:owner.status().processingMode};}finally{owner.stop();}
  },{scope:report.scope,after});
  assert.equal(receiptRestart.head,2);assert.equal(receiptRestart.legacyChecksum,after.legacyChecksum);assert.equal(receiptRestart.replay.replayed,true);assert.deepEqual(receiptRestart.replay.value,after.firstRepairReceipt);assert.deepEqual(receiptRestart.state,report.state);assert.equal(receiptRestart.processingMode,'off');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const postRepair=await last.evaluate(async scope=>{
    const [{createFixtureOwner},{createProController},{proRootKey,proOperationKey,proRecoveryHeadKey},{stable}]=await Promise.all([import('/tests/pro/support/fixture-owner.mjs'),import('/src/pro/runtime/controller.mjs'),import('/src/pro/integration/storage-registry.mjs'),import('/src/data/hash.mjs')]);
    const ensure=(v,m)=>{if(!v)throw Error(m);},owner=await createFixtureOwner({indexedDB,databaseName:'closeout_history',fixtureOnly:true,scope});await owner.restart();const controller=await createProController(owner);
    try{
      const edit=await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'New human asset after repeated repair'}),db=await owner.base.open(),raw=await owner.raw();ensure(raw.sequence===515&&raw.state.titles.c_beta.title==='New human asset after repeated repair','normal post-repair edit remains usable');
      const get=key=>new Promise((resolve,reject)=>{const tx=db.transaction('b23_states'),q=tx.objectStore('b23_states').get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);}),root=await get(proRootKey(scope.key)),head=await get(proRecoveryHeadKey(scope.key));
      ensure(root.payload.minimumReader==='vaiwl-pro-storage/3'&&head.payload.current.sequence===515&&head.payload.current.checksum===root.checksum,'normal edit atomically advances recovery high-water');
      await new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states','b23_operations'],'readwrite');tx.objectStore('b23_states').delete(proRootKey(scope.key));tx.objectStore('b23_operations').delete(proOperationKey(scope.key,edit.operationId));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
      const census=()=>new Promise((resolve,reject)=>{const names=['b23_states','b23_operations','b23_checkpoints'],tx=db.transaction(names),values={};for(const name of names){values[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){values[name].push([q.result.primaryKey,q.result.value.checksum]);q.result.continue();}};}tx.oncomplete=()=>resolve(values);tx.onabort=()=>reject(tx.error);}),before=await census();let refused=false;
      try{await owner.store.previewRecovery(owner.grant(),{expected:{...controller.getSnapshot().versions,overlayRevision:0,constraintRevision:0}});}catch(error){refused=/high-water|incomplete-history/.test(error.message);}
      ensure(refused,'lost newest root and journal must not restore the older repaired checkpoint');ensure(stable(await census())===stable(before),'unsafe shorter recovery writes nothing');
      return {actualSequentialHumanCommits:515,lostPostRepairSuccessorRefused:refused,normalEditHighWater:head.payload.current.sequence};
    }finally{controller.destroy();}
  },report.scope);
  assert.equal(postRepair.actualSequentialHumanCommits,515);assert.equal(postRepair.lostPostRepairSuccessorRefused,true);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  if(process.env.PRO_EVIDENCE_DIR){await mkdir(process.env.PRO_EVIDENCE_DIR,{recursive:true});await writeFile(join(process.env.PRO_EVIDENCE_DIR,'closeout-history-browser.json'),JSON.stringify({status:'PASS',browserVersion:version,actualIndexedDB:true,actualSequentialHumanCommits:postRepair.actualSequentialHumanCommits,syntheticSeededJournalRows:0,archiveWindow:512,abortZeroPartial:true,originalReceiptAndInverseRetained:true,archivedUndo:true,oldIdempotentReplay:true,visibleHistoryPaging:true,processRestart:true,sealedCheckpointRecovery:true,repeatedRecovery:true,immutableRecoveryReceipts:2,oldRepairReplayAfterSecondRepair:true,recoveryHeadAfterProcessRestart:receiptRestart.head,postRepairNormalEdit:true,normalEditHighWater:postRepair.normalEditHighWater,lostPostRepairSuccessorRefused:true,unsafeShorterRecoveryWrites:0,databaseVersion:4,grantsRestored:false,externalRequests:external,errors,liveChatGPT:'NOT_RUN',physicalDevice:'NOT_RUN',mv3Worker:'NOT_CLAIMED'},null,2)+'\n');}
 }finally{await context?.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}
});
