/** Same-schema package replacement and rollback, not a production/schema upgrade. */
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const baseline='/private/tmp/vaiwl-free-delivery-round23-20261013/extension',candidate=process.env.FREE_UPGRADE_CANDIDATE,baselineOnly=process.argv.includes('--baseline-only');
if(!candidate&&!baselineOnly)throw Error('FREE_UPGRADE_CANDIDATE must identify a frozen built extension');
const dir=await mkdtemp(join(tmpdir(),'vaiwl-upgrade-')),extension=join(dir,'extension'),profile=join(dir,'profile');await cp(baseline,extension,{recursive:true});await mkdir(profile);
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const report={evidence:'REAL_HEADLESS_MV3_SAME_SCHEMA_PACKAGE_REPLACEMENT',baseline,candidate:candidate??null,actualSchemaUpgrade:'NOT_RUN',realChatGPT:'NOT_RUN',results:[],pageErrors:[]};let browser,chromeProcess,context,page,manager,extensionId;
const receipt=process.env.FREE_UPGRADE_REPORT??(baselineOnly?'/private/tmp/free-upgrade-baseline.json':'/private/tmp/free-upgrade-browser.json');
const save=()=>writeFile(receipt,JSON.stringify(report,null,2));
const run=async(name,fn)=>{try{report.results.push({name,status:'PASS',...await fn()});}catch(error){report.results.push({name,status:'FAIL',error:error.stack});await save();throw error;}console.log(JSON.stringify(report.results.at(-1)));await save();};
const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.vaiwlHfState==='ACTIVE',null,{timeout:20000});
const worker=()=>context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${extensionId}/`));
const inspect=async({initialize=false,future=false}={})=>{const probePage=await context.newPage();await probePage.goto(`chrome-extension://${extensionId}/README.txt`);try{return await probePage.evaluate(async({initialize,future})=>{
 const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{WorkspaceRepository}=await import('/src/data/repository.mjs'),{NativeRepository}=await import('/src/data/native-repository.mjs'),{FreeEvidenceRepository}=await import('/src/data/free-evidence-repository.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{digest}=await import('/src/data/hash.mjs'),{DATABASE_VERSION}=await import('/src/data/schema.mjs');
 const base=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'}),workspace=new WorkspaceRepository({baseRepository:base}),native=new NativeRepository({baseRepository:base}),evidence=new FreeEvidenceRepository({baseRepository:base}),scope=scopeOf('A');
 try{
  if(initialize){let state=(await workspace.read(scope)).state;for(const [index,command] of [{type:'SET_TITLE',refId:'T0',title:'升级保留Pro人工标题'},{type:'SET_PREFERENCE',id:'workingSet',value:{refs:['T0'],current:'T0'}}].entries()){const result=await workspace.command(scope,{operationId:'upgrade_manual_'+index,expectedRevision:state.revision,command});if(!result.ok)throw Error(result.reason);state=(await workspace.read(scope)).state;}}
  const shared=(await workspace.read(scope)).state,facts=await native.read(scope),activity=await evidence.read(scope);const result={extensionId:chrome.runtime.id,manifestVersion:chrome.runtime.getManifest().version,databaseVersion:DATABASE_VERSION,shared:digest(shared),native:digest(facts),evidence:digest(activity),manualTitle:shared.identities.T0.title,workingSet:shared.preferences.workingSet.value,nativeRefCount:Object.keys(facts.refs).length};
  if(future){
   const name='vaiwl_upgrade_future_probe',marker={key:'retained',value:'never-clear-on-VersionError'};
   await new Promise((resolve,reject)=>{const request=indexedDB.open(name,DATABASE_VERSION+1);request.onupgradeneeded=()=>request.result.createObjectStore('marker',{keyPath:'key'}).put(marker);request.onerror=()=>reject(request.error);request.onsuccess=()=>{request.result.close();resolve();};});
   const olderReader=new ScopeRepository({indexedDB,databaseName:name});let reason;try{await olderReader.open();throw Error('older-reader-must-reject');}catch(error){reason=error.name;}finally{olderReader.close();}if(reason!=='VersionError')throw Error('wrong-future-rejection:'+reason);
   const retained=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('marker'),row=tx.objectStore('marker').get('retained');tx.oncomplete=()=>{db.close();resolve(row.result);};tx.onabort=()=>reject(tx.error);};});
   if(JSON.stringify(retained)!==JSON.stringify(marker))throw Error('future-database-was-mutated');result.futureSchemaSimulation={readerVersion:DATABASE_VERSION,createdVersion:DATABASE_VERSION+1,rejection:reason,markerRetained:true};
  }
  return result;
 }finally{base.close();}
},{initialize,future});}finally{await probePage.close();}};
const preserve=async()=>{assert.deepEqual(await page.evaluate(()=>({same:originalUpgradeComposer===document.querySelector('textarea'),draft:document.querySelector('textarea').value,document:upgradeDocument})),{same:true,draft:'替换扩展包时保留未发送草稿',document:'original-document'});assert.equal(await page.getByRole('button',{name:'工具',exact:true}).count(),1);};
try{
 chromeProcess=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--disable-sync','--disable-background-networking','--use-mock-keychain','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let endpoint;for(let i=0;i<100;i++){try{const [port,path]=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n');endpoint='ws://127.0.0.1:'+port+path;break;}catch{if(chromeProcess.exitCode!==null)throw Error('chrome-exited');await new Promise(r=>setTimeout(r,100));}}assert(endpoint);
 browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});context=browser.contexts()[0];context.setDefaultTimeout(15000);await context.route('**/*',r=>(r.request().url().startsWith(origin+'/')||r.request().url().startsWith('chrome-extension://'))?r.continue():r.abort());
 const cdp=await browser.newBrowserCDPSession();report.browser=(await cdp.send('Browser.getVersion')).product;extensionId=(await cdp.send('Extensions.loadUnpacked',{path:extension})).id;report.extensionId=extensionId;
 page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(origin+'/hf/A/c/T0?mode=mv3');await ready(page);await page.getByRole('textbox',{name:'消息输入',exact:true}).fill('替换扩展包时保留未发送草稿');await page.evaluate(()=>{globalThis.originalUpgradeComposer=document.querySelector('textarea');globalThis.upgradeDocument='original-document';});
 let before;await run('Committed Round23 package creates persistent human assets and Free facts',async()=>{before=await inspect({initialize:true});assert.equal(before.extensionId,extensionId);assert.equal(before.manualTitle,'升级保留Pro人工标题');assert(before.nativeRefCount>0);return before;});
 await run('Actual baseline reader rejects simulated future-schema database without deleting its marker',()=>inspect({future:true}).then(value=>value.futureSchemaSimulation));
 if(!baselineOnly){
  const oldManifest=JSON.parse(await readFile(join(baseline,'manifest.json'),'utf8')),newManifest=JSON.parse(await readFile(join(candidate,'manifest.json'),'utf8'));report.packageVersions={baseline:oldManifest.version,candidate:newManifest.version};
  report.packageHashes={};for(const [name,path] of [['baseline',baseline],['candidate',candidate]])report.packageHashes[name]=createHash('sha256').update(await readFile(join(path,'verification/source-manifest.json'))).digest('hex');assert.notEqual(report.packageHashes.baseline,report.packageHashes.candidate,'candidate must be a genuinely different source package');
  manager=await context.newPage();await manager.goto('chrome://extensions/');const devMode=manager.locator('extensions-toolbar #devMode');if(!await devMode.evaluate(node=>node.checked))await devMode.click();
  const item=manager.locator(`extensions-item#${extensionId}`);await item.waitFor();
  const replace=async path=>{
   await manager.bringToFront();await rm(extension,{recursive:true});await cp(path,extension,{recursive:true});
   // Explicit reload asks Chrome to read the replacement files at the same path.
   await manager.evaluate(id=>new Promise((resolve,reject)=>chrome.developerPrivate.reload(id,{failQuietly:true},()=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve())),extensionId);
   report.reloadExtensionInfo=await manager.evaluate(id=>new Promise(resolve=>chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true},items=>resolve(items.filter(item=>item.id===id)))),extensionId);await save();const fresh=await context.newPage();fresh.on('pageerror',e=>report.pageErrors.push(e.message));await fresh.goto(origin+'/hf/A/c/T0?mode=mv3');await fresh.bringToFront();try{await ready(fresh);}catch(error){report.reloadDiagnostic={url:fresh.url(),state:await fresh.locator('html').getAttribute('data-vaiwl-hf-state'),reason:await fresh.locator('html').getAttribute('data-vaiwl-hf-reason'),visible:await fresh.evaluate(()=>document.visibilityState),workers:context.serviceWorkers().map(w=>w.url())};throw error;}const actual=await inspect();assert.deepEqual(actual,before);await preserve();await fresh.close();return {extensionId:actual.extensionId,manifestVersion:actual.manifestVersion,databaseVersion:actual.databaseVersion,sharedNativeEvidenceDigestsUnchanged:true,oldDraftDocumentReloaded:false};
  };
  await run('Same-directory candidate package replacement preserves ID, database and untouched draft document',()=>replace(candidate));
  await run('Rollback to actual Round23 package reader retains compatible schema and all assets',()=>replace(baseline));
 }
 assert.deepEqual(report.pageErrors,[]);await save();
}finally{await save();await browser?.close();chromeProcess?.kill('SIGTERM');await new Promise(r=>server.close(r));}
