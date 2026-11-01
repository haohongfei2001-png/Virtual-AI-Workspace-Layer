import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const files=['src/data/native-repository.mjs','src/data/repository.mjs','src/data/partitioned.mjs','src/data/state.mjs'],hashes={};for(const file of files)hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 const result=await page.evaluate(async()=>{
  const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{WorkspaceRepository}=await import('/src/data/repository.mjs'),{NativeRepository}=await import('/src/data/native-repository.mjs'),{emptyState}=await import('/src/data/state.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{digest}=await import('/src/data/hash.mjs');
  const check=(v,m='assertion-failed')=>{if(!v)throw Error(m);},scope=scopeOf('A'),other=scopeOf('B'),now='2026-10-13T00:00:00Z',base=new ScopeRepository({indexedDB,databaseName:'native_shared_migration_'+crypto.randomUUID().replaceAll('-','')}),shared=new WorkspaceRepository({baseRepository:base,evidenceGate:()=> 'synthetic'}),native=new NativeRepository({baseRepository:base,workspaceRepository:shared,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'fixture',generation:'one'})});
  try{
   const initial=emptyState(scope);initial.revision=1;initial.channel='synthetic';for(let i=0;i<15000;i++){const id='R'+String(i).padStart(5,'0');initial.refs[id]={id,nativeUrl:'https://vaiwl-hf.test/hf/A/c/'+id,projectId:null,nativeTitle:'Known '+i,available:true};}
   initial.identities.R00000={id:'R00000',title:'Keep human Pro title',aliases:['Prior title'],locked:true,owner:'human',revision:1};initial.preferences.workingSet={id:'workingSet',value:{refs:['R14999','R00000'],current:'R14999'},owner:'human',revision:1};
   check((await shared.initialize(scope,initial)).ok);check(await shared.partitioned.manifest(scope)===null);
   const db=await base.open(),dump=async()=>new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations']),out={};for(const store of ['native_states','native_operations']){const q=tx.objectStore(store).getAll();q.onsuccess=()=>out[store]=q.result;}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});
   const empty=await dump();check(empty.native_states.length===0&&empty.native_operations.length===0,'native stores initially empty');
   let migrations=0,abortedBeforeMigration=false;const migrate=shared.migratePartitioned.bind(shared);shared.migratePartitioned=async(...args)=>{migrations++;const before=await dump();abortedBeforeMigration=before.native_states.length===0&&before.native_operations.length===0;check(abortedBeforeMigration,'native first transaction must abort before migration');return migrate(...args);};
   const batch=id=>({scopeKey:initial.scopeKey,sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id,nativeUrl:'https://vaiwl-hf.test/hf/A/c/'+id,nativeTitle:'New native ref',availability:'available'}],membership:[{id,state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}});
   const request={operationId:'native_shared_first',expectedRevision:0,batch:batch('NEW')},applied=await native.apply(scope,request);check(applied.ok,JSON.stringify(applied));check(migrations===1);
   const state=(await shared.read(scope)).state;check(Object.keys(state.refs).length===15001);check(!!await shared.partitioned.manifest(scope));check(digest(state.identities)===digest(initial.identities),'Pro identities preserved');check(digest(state.preferences)===digest(initial.preferences),'manual working set preserved');check(Object.keys((await shared.read(other)).state.refs).length===0,'scope isolated');
   const committed=digest(await dump()),replay=await native.apply(scope,request);check(replay.ok&&replay.replayed,'same operation is idempotent');check(digest(await dump())===committed,'replay must not rewrite native stores');check(migrations===1);
   await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite'),store=tx.objectStore('b23_states'),q=store.get(initial.scopeKey);q.onsuccess=()=>store.put({...q.result,checksum:'0'.repeat(64)});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
   let refused;try{refused=await native.apply(scope,{operationId:'native_shared_corrupt',expectedRevision:applied.revision,batch:{...batch('AFTER_CORRUPT'),sourceRevision:2}});}catch(e){refused={ok:false,reason:e.message};}check(refused.ok===false&&refused.reason==='corrupt-record','corrupt shared root must reject native observation: '+JSON.stringify(refused));check(digest(await dump())===committed,'corrupt shared root cannot partially commit native data');check(migrations===1,'corruption is not migration permission');
   return {initialRefs:15000,finalRefs:15001,migrations,abortedBeforeMigration,proPreserved:true,workingSetPreserved:true,scopeIsolated:true,replayIdempotent:true,corruptRootRejected:refused.reason,nativeUnchangedAfterRejection:true};
  }finally{base.close();}
 });
 for(const file of files)assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),hashes[file]);await writeFile('/private/tmp/free-native-shared-migration-browser.json',JSON.stringify({evidence:'REAL_HEADLESS_IDB_SYNTHETIC_NATIVE_SHARED_MIGRATION',browser:browser.version(),hashes,result,pass:1,fail:0},null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
