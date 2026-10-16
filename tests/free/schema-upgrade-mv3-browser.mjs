import {schemaInflightCase} from './schema-inflight-case.mjs';
/** Real extension-origin IndexedDB schema v2 -> v4, with an actually blocked connection. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {packageSynthetic,verifyUnpacked} from '../../simulator/package.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
async function hashes(){const result={};for(const dir of ['src/b1','src/data','src/navigation','simulator'])for(const name of await readdir(dir))if(name.endsWith('.mjs'))result[dir+'/'+name]=hash(await readFile(dir+'/'+name));result['tests/free/schema-inflight-case.mjs']=hash(await readFile('tests/free/schema-inflight-case.mjs'));result['tests/free/schema-upgrade-mv3-browser.mjs']=hash(await readFile('tests/free/schema-upgrade-mv3-browser.mjs'));return result;}
const before=await hashes(),dir=await mkdtemp(join(tmpdir(),'vaiwl-schema-mv3-')),artifact=packageSynthetic(join(dir,'package')),extension=join(dir,'package','extension'),profile=join(dir,'profile');await mkdir(profile);
const verification=verifyUnpacked(extension),server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const receipt=process.argv[2]??'/private/tmp/free-schema-upgrade-mv3.json',report={evidence:'REAL_HEADLESS_INSTALLED_MV3_EXTENSION_ORIGIN_SCHEMA_UPGRADE',realChatGPT:'NOT_RUN',headless:true,sourceHashes:before,artifact,verification,results:[],pageErrors:[]};
let browser,chromeProcess,context,probe,page;
const save=()=>writeFile(receipt,JSON.stringify(report,null,2)+'\n');
const run=async(name,fn)=>{try{report.results.push({name,status:'PASS',...await fn()});}catch(error){report.results.push({name,status:'FAIL',error:error.stack});await save();throw error;}console.log(JSON.stringify(report.results.at(-1)));await save();};
try{
 chromeProcess=spawn(process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--disable-sync','--disable-background-networking','--use-mock-keychain','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let endpoint;for(let i=0;i<100;i++){try{const [port,path]=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n');endpoint='ws://127.0.0.1:'+port+path;break;}catch{if(chromeProcess.exitCode!==null)throw Error('owned-chrome-exited');await new Promise(r=>setTimeout(r,100));}}assert(endpoint,'owned-chrome-cdp-not-ready');
 browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});context=browser.contexts()[0];context.setDefaultTimeout(15000);
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await browser.newBrowserCDPSession();report.browser=(await cdp.send('Browser.getVersion')).product;const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension});report.extensionId=id;
 probe=await context.newPage();probe.on('pageerror',e=>report.pageErrors.push(e.message));await probe.goto(`chrome-extension://${id}/README.txt`);
 await run('Build valid human assets, logs, views and B1 refs, then seed six actual v2 stores',async()=>probe.evaluate(async({origin})=>{
  const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{WorkspaceRepository}=await import('/src/data/repository.mjs'),{persistentSeed,syntheticEvidenceGate}=await import('/simulator/persistent-seed.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{digest}=await import('/src/data/hash.mjs');
  const scope=scopeOf('A'),stores=['refs','operations','b23_states','b23_operations','b23_checkpoints','b23_views'];
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const dump=db=>new Promise((resolve,reject)=>{const tx=db.transaction(stores),rows={};for(const name of stores){rows[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const c=q.result;if(c){rows[name].push({key:c.key,value:c.value});c.continue();}};}tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error);});
  const seedBase=new ScopeRepository({indexedDB,databaseName:'vaiwl_schema_legal_seed'}),workspace=new WorkspaceRepository({baseRepository:seedBase,evidenceGate:syntheticEvidenceGate});
  check((await workspace.initialize(scope,persistentSeed(scope,origin))).ok,'seed-initialize');
  for(const [i,command] of [{type:'SET_TITLE',refId:'T0',title:'schema升级保留人工标题'},{type:'SET_PREFERENCE',id:'workingSet',value:{refs:['T0','T1'],current:'T0'}}].entries()){const state=(await workspace.read(scope)).state;check((await workspace.command(scope,{operationId:'schema_manual_'+i,expectedRevision:state.revision,command})).ok,'seed-human-command');}
  check((await workspace.saveView(scope,{segment:2,oldOpen:['home:W0'],sidebarOpen:['W0'],capacities:[['home:W0',18]],scroll:300,sidebarVisible:false},0)).ok,'seed-view');
  const oldRef=await seedBase.get(scope,'T0');check((await seedBase.upsert({scope,ref:{conversationId:'T0',nativeUrl:oldRef.nativeUrl,projectId:oldRef.projectId},operationId:'schema_b1_receipt',expectedRevision:oldRef.revision})).ok,'seed-b1-operation');
  const expected=await dump(await seedBase.open());seedBase.close();for(const name of stores)check(expected[name].length>0,'empty-seed-store:'+name);
  const old=await new Promise((resolve,reject)=>{const q=indexedDB.open('vaiwl-hf-synthetic-v1',2);q.onupgradeneeded=()=>{const db=q.result;for(const name of stores){const store=db.createObjectStore(name,{keyPath:'key'});if(name==='refs')store.createIndex('scopeKey','scopeKey');if(name==='b23_operations')store.createIndex('scopeKey','payload.scopeKey');for(const row of expected[name])store.put(row.value);}};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  check(old.version===2,'not-real-v2');check(JSON.stringify(await dump(old))===JSON.stringify(expected),'v2-seed-bytes-differ');
  globalThis.schemaCase={scope,stores,expected,old,dump,digest,check,ScopeRepository,WorkspaceRepository,events:[]};old.onversionchange=e=>schemaCase.events.push({oldVersion:e.oldVersion,newVersion:e.newVersion,trusted:e.isTrusted});
  return {databaseVersion:old.version,storeCounts:Object.fromEntries(stores.map(name=>[name,expected[name].length])),storeDigests:Object.fromEntries(stores.map(name=>[name,digest(expected[name])]))};
 },{origin}));
 await run('A live old connection really blocks owner upgrade and preserves all old records',async()=>probe.evaluate(async()=>{
  const c=schemaCase;c.base=new c.ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'});let reason;
  try{await c.base.open();throw Error('upgrade-was-not-blocked');}catch(e){reason=e.message;}
  c.check(reason==='idb-open-blocked',reason);c.check(c.old.version===2,'old-version-mutated');c.check(JSON.stringify(await c.dump(c.old))===JSON.stringify(c.expected),'blocked-mutated-old-rows');c.check(c.events.some(e=>e.trusted&&e.oldVersion===2&&e.newVersion===4),'missing-real-versionchange');
  return {reason,events:c.events,allSixStoresUnchanged:true};
 }));
 await run('Normal old connection close permits retry, adds native stores and preserves every old row',async()=>probe.evaluate(async()=>{
  const c=schemaCase;c.old.close();const db=await c.base.open();c.check(db.version===4,'retry-not-v4');
  for(const name of ['native_states','native_operations'])c.check(db.objectStoreNames.contains(name),'missing-new-store:'+name);
  c.check(JSON.stringify(await c.dump(db))===JSON.stringify(c.expected),'schema-upgrade-mutated-old-rows');
  const workspace=new c.WorkspaceRepository({baseRepository:c.base}),read=await workspace.read(c.scope);c.check(read.state.identities.T0.title==='schema升级保留人工标题','lost-human-title');c.check(read.view.value.scroll===300,'lost-view');c.check(read.state.preferences.workingSet.value.refs.join(',')==='T0,T1','lost-working-set');
  const rejected=await new Promise(resolve=>{const q=indexedDB.open('vaiwl-hf-synthetic-v1',2);q.onerror=()=>resolve(q.error.name);q.onsuccess=()=>{q.result.close();resolve('unexpected-open');};});c.check(rejected==='VersionError','old-reader-not-rejected');c.check(JSON.stringify(await c.dump(db))===JSON.stringify(c.expected),'reader-rejection-mutated-data');c.base.close();
  return {databaseVersion:db.version,oldReader:rejected,allSixStoresByteForByte:true,humanTitle:true,workingSet:true,view:true};
 }));
 await run('Installed content script and worker read Free after schema upgrade with native draft intact',async()=>{
  page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(origin+'/hf/A/c/T0?mode=mv3');await page.waitForFunction(()=>document.documentElement.dataset.vaiwlHfState==='ACTIVE');if(await page.locator('[data-vaiwl-return]').isVisible())await page.locator('[data-vaiwl-return]').click();await page.getByRole('textbox',{name:'消息输入',exact:true}).fill('schema升级后的未发送草稿');await page.evaluate(()=>{globalThis.schemaComposer=document.querySelector('textarea[aria-label="消息输入"]');});
  await page.waitForFunction(()=>document.documentElement.dataset.vaiwlHfState==='ACTIVE',null,{timeout:30000});
  assert.equal(await page.evaluate(()=>schemaComposer===document.querySelector('textarea[aria-label="消息输入"]')),true);assert.equal(await page.getByRole('textbox',{name:'消息输入',exact:true}).inputValue(),'schema升级后的未发送草稿');assert.equal(await page.getByRole('button',{name:'工具',exact:true}).count(),1);
  const persisted=await probe.evaluate(async()=>{const c=schemaCase,workspace=new c.WorkspaceRepository({baseRepository:c.base}),read=await workspace.read(c.scope);const {NativeRepository}=await import('/src/data/native-repository.mjs');const native=await new NativeRepository({baseRepository:c.base}).read(c.scope);c.check(read.state.identities.T0.title==='schema升级保留人工标题','runtime-lost-human-title');c.check(read.state.preferences.workingSet.value.refs.join(',')==='T0,T1','runtime-lost-workset');c.check(Object.keys(native.refs).length>0,'no-free-native-facts');c.check(native.refs.T0.nativeTitle!=='schema升级保留人工标题','Pro-title-became-native');c.base.close();return {nativeRefCount:Object.keys(native.refs).length,manualTitle:read.state.identities.T0.title};});
  return {...persisted,nativeInputSameNode:true,nativeDraftPreserved:true,documentReloaded:false};
 });
 await run('Existing v3 transaction commits before v4 multi-owner open without lost records',()=>probe.evaluate(schemaInflightCase));
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(verifyUnpacked(extension),verification);report.sourceChangedDuringRun=JSON.stringify(await hashes())!==JSON.stringify(before);assert.equal(report.sourceChangedDuringRun,false);await save();
}catch(error){report.failure=error.stack;await save();throw error;}finally{await save();await browser?.close();chromeProcess?.kill('SIGTERM');await new Promise(r=>server.close(r));}
