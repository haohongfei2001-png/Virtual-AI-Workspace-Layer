/** Actual IDB bounded evidence audit: full preservation and atomic failures. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const files=['src/data/audit-record-prefetch.mjs','src/data/evidence-partition-audit.mjs','src/data/evidence-directory-migration.mjs','src/data/free-evidence-partitions.mjs','src/data/free-evidence-repository.mjs','src/data/free-evidence.mjs','src/data/evidence-ref-directory.mjs','src/data/hash.mjs','src/data/schema.mjs','src/b1/scope-repository.mjs','tests/free/evidence-audit-browser.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')]))),before=await hashes();
const report={evidence:'REAL_HEADLESS_CHROME_IDB_EVIDENCE_BATCH_AUDIT',realChatGPT:'NOT_RUN',mv3:'NOT_RUN',sourceHashes:before,results:[],pageErrors:[]},receipt=process.argv[2]??'/private/tmp/free-round72-evidence-audit-browser.json';
const save=()=>writeFile(receipt,JSON.stringify(report,null,2)+'\n'),server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});report.browser=browser.version();const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 for(const mode of ['success','checksum','abort']){
  try{const value=await page.evaluate(async mode=>{
   const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{FreeEvidenceRepository}=await import('/src/data/free-evidence-repository.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{normalizedScope}=await import('/src/b1/identity.mjs'),{evidencePieceKey}=await import('/src/data/free-evidence-partitions.mjs');
   const scope=normalizedScope(scopeOf('A')),now='2026-10-13T00:00:00Z',base=new ScopeRepository({indexedDB,databaseName:'evidence_audit_'+crypto.randomUUID().replaceAll('-','')}),repo=new FreeEvidenceRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'source',generation:'one'})});
   const check=(ok,message)=>{if(!ok)throw Error(message);},same=(a,b,message)=>check(JSON.stringify(a)===JSON.stringify(b),message);let restore=()=>{};
   try{
    for(let offset=0;offset<5001;offset+=5000){const revision=offset?2:1,events=Array.from({length:Math.min(5000,5001-offset)},(_,i)=>({id:'E'+(offset+i),sourceId:'source',generation:'one',sourceRevision:revision,observedAt:now,conversationId:'R'+(offset+i),messageId:'M'+(offset+i),branchId:'main',actorVerified:true,actorScopeKey:scope.key,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:'2026-08-01T00:00:00Z'}));const result=await repo.apply(scope,{operationId:'seed_'+revision,expectedRevision:revision-1,batch:{sources:[{id:'source',generation:'one',sourceRevision:revision,observedAt:now,validUntil:'2026-10-14T00:00:00Z',channel:'synthetic'}],events,hints:[],coverage:[]}});check(result.ok,JSON.stringify(result));}
    const db=await base.open(),tail=evidencePieceKey(scope.key,'R5000',2),dump=()=>new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),rows={};for(const name of names){const q=tx.objectStore(name).getAll();q.onsuccess=()=>rows[name]=q.result;}tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error);});
    const beforePreparation=await dump(),preparation=await repo.prepareRefDirectory(scope,{expectedRevision:2});check(preparation.ok&&preparation.prepared,'preparation-failed');same(await dump(),beforePreparation,'preparation-wrote-stores');
    if(mode==='checksum')await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),s=tx.objectStore('native_states'),q=s.get(tail);q.onsuccess=()=>{check(!!q.result,'missing-tail-fixture');s.put({...q.result,checksum:'0'.repeat(64)});};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
    const oldRows=await dump(),facts=mode==='success'?await repo.read(scope):null,controller=new AbortController();let sawTail=false;
    const originals={get:IDBObjectStore.prototype.get,getAll:IDBObjectStore.prototype.getAll,getAllKeys:IDBObjectStore.prototype.getAllKeys},prefetch={keyPages:0,valuePages:0,maxPage:0};
    for(const method of Object.keys(originals))IDBObjectStore.prototype[method]=function(...args){
     const request=originals[method].apply(this,args),active=this.transaction.db===db&&this.transaction.mode==='readwrite';
     if(active&&method!=='get'&&args[0] instanceof IDBKeyRange&&String(args[0].lower).includes('free-evidence-piece')){
      check(Number.isSafeInteger(args[1])&&args[1]>0&&args[1]<=512,'unbounded-evidence-prefetch');prefetch[method==='getAll'?'valuePages':'keyPages']++;prefetch.maxPage=Math.max(prefetch.maxPage,args[1]);
     }
     if(mode==='abort'&&active&&(method==='get'&&args[0]===tail||method==='getAll'&&args[0] instanceof IDBKeyRange&&args[0].includes(tail))){sawTail=true;controller.abort();}
     return request;
    };restore=()=>{for(const method of Object.keys(originals))IDBObjectStore.prototype[method]=originals[method];};
    const result=await repo.migrateRefDirectory(scope,{operationId:'audit_'+mode,expectedRevision:2},{signal:controller.signal});restore();check(prefetch.keyPages>0&&prefetch.valuePages>0,'real-prefetch-not-exercised');
    if(mode==='success'){check(result.ok,JSON.stringify(result));same(await repo.read(scope),{...facts,revision:3},'complete-evidence-changed');check((await repo.header(scope,{includeStorageFormat:true})).storageFormat==='vaiwl-free-evidence-directory-v1','directory-not-published');}
    else{check(!result.ok,'failure-accepted');check(result.reason===(mode==='checksum'?'corrupt-free-evidence-record':'stale-binding'),'wrong-failure:'+result.reason);if(mode==='abort')check(sawTail,'second-batch-not-reached');same(await dump(),oldRows,'atomic-all-stores-rollback-failed');}
    return {mode,refs:5001,prefetch,result,secondBatchReached:mode==='abort'?sawTail:undefined,allStoresUnchanged:mode!=='success',completeFactsPreserved:mode==='success'};
   }finally{restore();base.close();}
  },mode);report.results.push({status:'PASS',...value});}catch(error){report.results.push({mode,status:'FAIL',error:error.stack});}
  await save();
 }
 report.sourceChangedDuringRun=JSON.stringify(await hashes())!==JSON.stringify(before);await save();assert.equal(report.sourceChangedDuringRun,false);assert.deepEqual(report.pageErrors,[]);assert.equal(report.results.filter(r=>r.status==='FAIL').length,0);console.log(JSON.stringify(report.results));
}catch(error){report.failure=error.stack;await save();throw error;}finally{await save();await browser?.close();await new Promise(r=>server.close(r));}
