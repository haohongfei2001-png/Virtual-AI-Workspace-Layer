/** Isolated synthetic fixtures; actual Chrome IndexedDB, not production ChatGPT or MV3. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const files=['src/data/native-partition-audit.mjs','src/data/native-partitions.mjs','src/data/native-index-migration.mjs','src/data/native-repository.mjs','src/data/native-facts.mjs','src/data/hash.mjs','src/data/repository.mjs','src/data/schema.mjs','tests/free/native-audit-bulk-browser.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')]))),before=await hashes();
const prepare=process.env.FREE_AUDIT_PREPARE==='1';
const output=process.argv[2]??'/private/tmp/free-native-audit-bulk-browser.json',report={evidence:'REAL_HEADLESS_IDB_SYNTHETIC_NATIVE_BULK_AUDIT',realChatGPT:'NOT_RUN',mv3:'NOT_RUN',preparedIndex:prepare,sourceHashes:before,results:[],pageErrors:[]};
const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n');const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});report.browser=browser.version();const context=await browser.newContext();const origin=`http://127.0.0.1:${server.address().port}`;await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(origin+'/hf/A/c/T0?mode=native');
 for(const mode of ['bulk','retained-extra-fallback','tail-checksum','tail-missing','guard']){
  try{const result=await page.evaluate(async ({mode,prepare})=>{
   const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{WorkspaceRepository}=await import('/src/data/repository.mjs'),{NativeRepository}=await import('/src/data/native-repository.mjs'),{normalizedScope}=await import('/src/b1/identity.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{nativePartitionKey,nativeRecord}=await import('/src/data/native-partitions.mjs'),{digest}=await import('/src/data/hash.mjs');
   const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(digest(a)===digest(b),m),scope=normalizedScope(scopeOf('A')),other=normalizedScope(scopeOf('B')),now='2026-10-13T00:00:00Z';
   const base=new ScopeRepository({indexedDB,databaseName:'audit_bulk_'+crypto.randomUUID()}),shared=new WorkspaceRepository({baseRepository:base}),native=new NativeRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'audit',generation:'one'})});let restore=()=>{};
   try{
    check((await shared.command(scope,{operationId:'human',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'manual',name:'Keep Pro asset'}})).ok,'manual-seed');check((await shared.command(other,{operationId:'other',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'manual',name:'Other scope'}})).ok,'other-seed');
    const ids=Array.from({length:600},(_,i)=>'R'+String(i).padStart(4,'0'));
    for(let revision=1;revision<=2;revision++){const refs=ids.map(id=>({id,nativeTitle:'Native 中文 '+id+' v'+revision,nativeUrl:'https://fixture.test/c/'+id,availability:'available'}));const r=await native.apply(scope,{operationId:'seed_'+revision,expectedRevision:revision-1,batch:{scopeKey:scope.key,sourceRevision:revision,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs,membership:ids.map(id=>({id,state:'NONE',projectId:null})),inventory:{projects:'complete',conversations:'complete',cursor:null}}});check(r.ok,'seed '+JSON.stringify(r));}
    const db=await base.open(),dump=()=>new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),data={};for(const name of names){const q=tx.objectStore(name).getAll();q.onsuccess=()=>data[name]=q.result;}tx.oncomplete=()=>resolve(data);tx.onabort=()=>reject(tx.error);});
    const edit=fn=>new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');fn(tx.objectStore('native_states'));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
    if(prepare){const untouched=await dump();const prepared=await native.prepareVersionIndex(scope,{expectedRevision:2});check(prepared.ok&&prepared.prepared,'first pure build');same(await dump(),untouched,'preparation must not write');const repeated=await native.prepareVersionIndex(scope,{expectedRevision:2});check(repeated.ok&&!repeated.prepared,'prepared build reused privately');same(await dump(),untouched,'repeat preparation must not write');}
    if(mode==='retained-extra-fallback')await edit(store=>{for(const id of ids){const q=store.get(nativePartitionKey(scope.key,'refs',id,2));q.onsuccess=()=>{for(let v=3;v<=6;v++){const payload={...q.result.payload,revision:v,row:{...q.result.payload.row,nativeTitle:'EXTRA MUST NOT COUNT'}};store.put(nativeRecord(nativePartitionKey(scope.key,'refs',id,v),payload));}};}});
    const tail=nativePartitionKey(scope.key,'refs',ids.at(-1),2);
    if(mode==='tail-missing')await edit(store=>store.delete(tail));
    if(mode==='tail-checksum')await edit(store=>{const q=store.get(tail);q.onsuccess=()=>store.put({...q.result,checksum:'0'.repeat(64)});});
    const facts=mode==='bulk'||mode==='retained-extra-fallback'?await native.read(scope):null,assets=(await shared.read(scope)).state,otherAssets=(await shared.read(other)).state,before=await dump();
    let bulkCalls=0,keyCalls=0,scanned=0,loadedValues=0,loadedExtraValues=0,exactPieceGets=0,authorized=true;
    const get=IDBObjectStore.prototype.get,getAll=IDBObjectStore.prototype.getAll,getAllKeys=IDBObjectStore.prototype.getAllKeys;
    const isAudit=(store,args)=>store.transaction.db===db&&store.transaction.mode==='readwrite'&&store.name==='native_states'&&args[0] instanceof IDBKeyRange&&String(args[0].lower).includes('native-piece');
    IDBObjectStore.prototype.get=function(key){if(this.transaction.db===db&&this.transaction.mode==='readwrite'&&this.name==='native_states'&&String(key).includes('native-piece'))exactPieceGets++;return get.call(this,key);};
    IDBObjectStore.prototype.getAllKeys=function(...args){const q=getAllKeys.apply(this,args);if(isAudit(this,args)){keyCalls++;check(args[1]<=512,'unbounded bulk key page');q.addEventListener('success',()=>{scanned+=q.result.length;if(mode==='guard'&&keyCalls>=2)authorized=false;});}return q;};
    IDBObjectStore.prototype.getAll=function(...args){const q=getAll.apply(this,args);if(isAudit(this,args)){bulkCalls++;check(args[1]<=512,'unbounded bulk value page');q.addEventListener('success',()=>{loadedValues+=q.result.length;for(const row of q.result)if(row.payload?.revision!==2)loadedExtraValues++;});}return q;};
    restore=()=>{IDBObjectStore.prototype.get=get;IDBObjectStore.prototype.getAll=getAll;IDBObjectStore.prototype.getAllKeys=getAllKeys;};
    const result=await native.migrateVersionIndex(scope,{operationId:'migrate_'+mode,expectedRevision:2},{guard:()=>authorized});restore();
    check(keyCalls>=2,'must cross 512-key bulk page');check(loadedExtraValues===0,'retained or extra payloads must not be loaded');check(scanned<=1200,'scan exceeds 2x selected refs');
    if(facts){check(result.ok,'migration '+JSON.stringify(result));same(await native.read(scope),{...facts,revision:3},'extra or retained version counted as current facts');if(mode==='retained-extra-fallback'){check(scanned===1200,'must reach exact scan budget');check(exactPieceGets>0,'scan cap must fall back to exact gets');}}
    else{check(result.ok===false,'damaged or revoked migration accepted');if(mode==='guard')check(result.reason==='stale-binding','guard reason');same(await dump(),before,'failure changed records or receipts');}
    same((await shared.read(scope)).state,assets,'Pro changed');same((await shared.read(other)).state,otherAssets,'other scope changed');check((await native.read(other)).revision===0,'native crossed scope');
    return {mode,refs:600,bulkCalls,keyCalls,loadedValues,loadedExtraValues,scanned,scanBound:1200,exactPieceGets,result,proPreserved:true,otherScopePreserved:true,rollback:!facts};
   }finally{restore();base.close();}
  },{mode,prepare});report.results.push({status:'PASS',...result});}catch(error){report.results.push({mode,status:'FAIL',error:error.stack});}await save();
 }
 report.sourceHashesAfter=await hashes();report.sourceChangedDuringRun=JSON.stringify(before)!==JSON.stringify(report.sourceHashesAfter);assert.equal(report.sourceChangedDuringRun,false);assert.deepEqual(report.pageErrors,[]);assert.equal(report.results.filter(r=>r.status==='FAIL').length,0);report.status='PASS';console.log(JSON.stringify(report.results));
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}finally{await save();await browser?.close();await new Promise(r=>server.close(r));}
