/** Real isolated Chrome IDB; synthetic local fixtures, not MV3 or real accounts. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const files=['tests/free/policy-initialization-browser.mjs','src/data/free-policy-initialization.mjs','src/data/schema.mjs','src/b1/scope-repository.mjs','src/data/repository.mjs','src/data/state.mjs','src/data/free-time-policy.mjs','src/data/backup.mjs','src/data/hash.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')]))),before=await hashes(),output=process.argv[2]??'/private/tmp/free-policy-initialization-browser.json';
const report={evidence:'REAL_HEADLESS_CHROME_INDEXEDDB_POLICY_INITIALIZATION',authority:'SYNTHETIC_LOCAL_SCOPE_FIXTURE',mv3:'NOT_RUN',liveChatGPT:'NOT_RUN',sourceHashes:before,results:[],pageErrors:[]};
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 for(const scenario of ['fresh','old-v1','concurrent','marker-after-absence','recovery','missing-root-history','missing-root-checkpoint','human-backup']){
  try{const result=await page.evaluate(async scenario=>{
   const [{ScopeRepository},{WorkspaceRepository},{scopeOf},{emptyState,reduceCommand},{initialFreeTimePolicy,setFreeHorizon},{createBackup},{FREE_INSTALLATION_KEY,freePolicyInitializationKey,isFreshInstallationRecord},{digest}]=await Promise.all(['/src/b1/scope-repository.mjs','/src/data/repository.mjs','/simulator/data.mjs','/src/data/state.mjs','/src/data/free-time-policy.mjs','/src/data/backup.mjs','/src/data/free-policy-initialization.mjs','/src/data/hash.mjs'].map(path=>import(path)));
   const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(digest(a)===digest(b),m),A=scopeOf('A'),B=scopeOf('B'),key=emptyState(A).scopeKey,marker=freePolicyInitializationKey(key),day=20740,name='policy_init_real_'+crypto.randomUUID();
   let oldRef,oldOperation;
   if(scenario==='old-v1')await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{const db=request.result,refs=db.createObjectStore('refs',{keyPath:'key'});refs.createIndex('scopeKey','scopeKey',{unique:false});const ops=db.createObjectStore('operations',{keyPath:'key'});oldRef={key:JSON.stringify([key,'old_ref']),scopeKey:key,conversationId:'old_ref',nativeUrl:'https://chatgpt.com/c/old_ref',projectId:null,revision:1};oldOperation={key:JSON.stringify([key,'old_operation']),fixture:'preserve-old-operation'};refs.put(oldRef);ops.put(oldOperation);};request.onerror=()=>reject(request.error);request.onsuccess=()=>{request.result.close();resolve();};});
   const base=new ScopeRepository({indexedDB,databaseName:name}),other=new ScopeRepository({indexedDB,databaseName:name}),repo=new WorkspaceRepository({baseRepository:base}),peer=new WorkspaceRepository({baseRepository:other});
   try{
    const db=await base.open();await other.open();
    const get=(store,key)=>new Promise((resolve,reject)=>{const tx=db.transaction(store),q=tx.objectStore(store).get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    const mutate=(names,work)=>new Promise((resolve,reject)=>{const tx=db.transaction(names,'readwrite');try{work(tx);}catch(e){tx.abort();reject(e);}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error??Error('fixture-abort'));});
    const dump=()=>new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),out={};for(const n of names){const q=tx.objectStore(n).getAll();q.onsuccess=()=>out[n]=Object.fromEntries(q.result.map(row=>[row.key,digest(row)]));}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});
    const state=async()=>(await repo.read(A)).state,init=expectedRevision=>repo.initializeFreeTimePolicy(A,{expectedRevision,day});
    if(scenario==='old-v1'){check(!isFreshInstallationRecord(await get('b23_views',FREE_INSTALLATION_KEY)),'old-upgrade-misclassified');same(await get('refs',oldRef.key),oldRef,'B1-reference-lost');same(await get('operations',oldOperation.key),oldOperation,'old-operation-lost');check((await repo.command(A,{operationId:'manual-asset',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'manual',name:'Preserved Pro workspace'}})).ok,'asset-seed');const assets=(await state()).workspaces;check((await init(1)).initialized,'legacy-policy-not-created');const s=await state();check(s.preferences.freeTimePolicy.value.mode==='fixed'&&s.preferences.freeTimePolicy.owner==='bootstrap','legacy-policy-wrong');same(s.workspaces,assets,'Pro-assets-lost');same(await get('refs',oldRef.key),oldRef,'B1-reference-changed');same(await get('operations',oldOperation.key),oldOperation,'old-operation-changed');return {scenario,mode:'fixed',B1AndProPreserved:true};}
    check(isFreshInstallationRecord(await get('b23_views',FREE_INSTALLATION_KEY)),'missing-fresh-provenance');
    if(scenario.startsWith('missing-root-')){
     check((await repo.command(A,{operationId:'human1',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'manual',name:'Preserve'}})).ok,'human1');check((await repo.command(A,{operationId:'human2',expectedRevision:1,command:{type:'SET_PREFERENCE',id:'sidebarVisible',value:false}})).ok,'human2');
     await mutate(['b23_states','b23_operations','b23_checkpoints'],tx=>{tx.objectStore('b23_states').delete(key);if(scenario.endsWith('history'))tx.objectStore('b23_checkpoints').delete(key);else tx.objectStore('b23_operations').clear();});
     const old=await dump(),r=await init(0);check(!r.ok&&r.reason==='corrupt-record','damaged-scope-recreated:'+JSON.stringify(r));same(await dump(),old,'damaged-scope-wrote');return {scenario,allStoresUnchanged:true,reason:r.reason};
    }
    if(scenario==='concurrent'){
     const results=await Promise.all([init(0),peer.initializeFreeTimePolicy(A,{expectedRevision:0,day})]);check(results.every(r=>r.ok)&&results.filter(r=>r.initialized===true).length===1,'double-initialization:'+JSON.stringify(results));check((await state()).revision===1,'double-revision');return {scenario,initializedCount:1,revision:1};
    }
    const first=await init(0);check(first.ok&&first.initialized,'fresh-initialization-failed');check((await state()).preferences.freeTimePolicy.value.mode==='auto','fresh-not-auto');check((await state()).preferences.freeTimePolicy.owner==='bootstrap','defaults-marked-human');check((await repo.read(B)).state.revision===0,'cross-scope-write');const savedMarker=await get('b23_views',marker);
    if(scenario==='marker-after-absence'){
     // Test-only simulate missing policy/root after an older restore. The marker
     // remains authoritative against reinitialization even if damaged itself.
     await mutate(['b23_states','b23_operations','b23_views'],tx=>{tx.objectStore('b23_states').delete(key);tx.objectStore('b23_operations').clear();tx.objectStore('b23_views').put({...savedMarker,checksum:'damaged'});});
     const old=await dump(),r=await init(0);check(r.ok&&r.initialized===false&&r.diagnostic==='invalid-free-policy-initialization','corrupt-marker-reinitialized');same(await dump(),old,'marker-presence-did-not-block');return {scenario,allStoresUnchanged:true,damagedMarkerRetained:true};
    }
    if(scenario==='recovery'){
     check((await repo.command(A,{operationId:'human-asset',expectedRevision:1,command:{type:'CREATE_WORKSPACE',id:'manual',name:'Recover human asset'}})).ok,'asset');const root=await get('b23_states',key);await mutate(['b23_states'],tx=>tx.objectStore('b23_states').put({...root,checksum:'damaged'}));const status=await repo.recoveryStatus(A);check(status.recoverable,'not-recoverable');check((await repo.recover(A,{operationId:'repair',damagedHash:status.damagedHash})).ok,'repair-failed');same(await get('b23_views',marker),savedMarker,'recovery-lost-marker');const old=await dump(),r=await init((await state()).revision);check(r.ok&&r.initialized===false,'recovery-reinitialized');same(await dump(),old,'post-recovery-init-wrote');return {scenario,markerPreserved:true,allStoresUnchangedAfterReinitialization:true};
    }
    if(scenario==='human-backup'){
     const incoming=reduceCommand(emptyState(A),{type:'SET_PREFERENCE',id:'freeTimePolicy',value:setFreeHorizon(initialFreeTimePolicy(),14,day)}),bundle=createBackup(incoming),preview=await repo.previewRestore(A,bundle);check((await repo.restoreBackup(A,{operationId:'explicit-restore',bundle,...preview})).ok,'restore-failed');const s=await state();check(s.preferences.freeTimePolicy.value.H===14&&s.preferences.freeTimePolicy.value.mode==='fixed'&&s.preferences.freeTimePolicy.owner==='human','backup-did-not-override-bootstrap');same(await get('b23_views',marker),savedMarker,'backup-replaced-marker');const exported=createBackup(s);check(!JSON.stringify(exported).includes('vaiwl-free-policy-initialized')&&!JSON.stringify(exported).includes('fresh-database'),'backup-exported-installation-authority');return {scenario,H:14,mode:'fixed',owner:'human',markersExcludedFromBackup:true};
    }
    return {scenario,mode:'auto',H:30,owner:'bootstrap',scopeBUnchanged:true};
   }finally{base.close();other.close();}
  },scenario);report.results.push({status:'PASS',...result});}catch(error){report.results.push({scenario,status:'FAIL',error:error.stack});}await writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
 report.sourceChangedDuringRun=JSON.stringify(await hashes())!==JSON.stringify(before);assert.equal(report.sourceChangedDuringRun,false);assert.deepEqual(report.pageErrors,[]);assert(report.results.every(r=>r.status==='PASS'));report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,results:report.results,sourceChangedDuringRun:report.sourceChangedDuringRun,error:report.error}));
