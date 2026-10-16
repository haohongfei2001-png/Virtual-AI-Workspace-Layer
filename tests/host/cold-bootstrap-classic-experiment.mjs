/** Two-stage classic worker experiment only. Never changes the production build.
 * --contract builds and checks a temporary package without starting a browser.
 * --run keeps the original immediate-cold 20s mount gate and one native GET.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,cp,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {instrumentColdSource} from './cold-context-trace.mjs';
import {digest} from '../../src/data/hash.mjs';
import {coldProjectionTarget,coldConversationRequests} from './context-cold-boundary.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),ROOT=resolve(new URL('../..',import.meta.url).pathname);
const bootstrapKey='__vaiwlClassicExperimentBootstrap';
const paths=['tests/host/cold-bootstrap-classic-experiment.mjs','tests/host/cold-context-trace.mjs','tests/host/context-cold-boundary.mjs','tests/host/expected/modern.mjs','tests/host/fixtures/variants-server.mjs','tests/host/fixtures/legacy.html','tests/host/fixtures/native.mjs','tests/host/fixtures/variants-native.mjs','tests/host/fixtures/native.css','tests/host/fixtures/ui10-conversation-title.mjs','tests/host/fixtures/j4-interruption.mjs','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs'];
async function hashes(){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await readFile(join(ROOT,p)))])));}
async function inventory(root,prefix=''){const result={};for(const item of await readdir(join(root,prefix),{withFileTypes:true})){const path=prefix?prefix+'/'+item.name:item.name;if(item.isDirectory())Object.assign(result,await inventory(root,path));else {assert(item.isFile(),'candidate must contain only ordinary files');result[path]=sha(await readFile(join(root,path)));}}return result;}
function workerSource(bootstrap){return `globalThis.__vaiwlClassicTimeline=[{stage:'entry-first-line',at:Date.now()}];\n${bootstrap}\nglobalThis.__vaiwlClassicTimeline.push({stage:'before-runtime-import',at:Date.now()});\ntry{importScripts('classic-runtime.js');globalThis.__vaiwlClassicTimeline.push({stage:'runtime-attached',at:Date.now()});}catch(error){globalThis.${bootstrapKey}?.stop();throw error;}finally{delete globalThis.${bootstrapKey};}\n`;}
async function buildCandidate(dir,origin){
 const esbuild=await import(pathToFileURL(process.env.FREE_ESBUILD_MODULE??'/private/tmp/vaiwl-classic-bootstrap-tooling/node_modules/esbuild/lib/main.js').href);assert.equal(esbuild.version,'0.25.12','pinned experiment tool only');
 const built=packageHost(join(dir,'original'),{offlineOrigin:origin,offlineContext:true}),original=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8')),candidate=join(dir,'classic-candidate');await cp(built.unpacked,candidate,{recursive:true,errorOnExist:true,force:false});
 const contextPath='src/runtime/browser-request-context.mjs',raw=await readFile(join(candidate,contextPath),'utf8');await writeFile(join(candidate,contextPath),instrumentColdSource(contextPath,raw));
 const bootstrapEntry=`import {createHostBrowserBootstrap} from './src/runtime/host-browser-bootstrap.mjs';import {HOST_CONFIG} from './extension/config.mjs';globalThis.${bootstrapKey}=createHostBrowserBootstrap({chrome,...HOST_CONFIG});`;
 const runtimeEntry=`import {createHostWorkerRuntime} from './src/runtime/host-worker-runtime.mjs';import {HOST_CONFIG} from './extension/config.mjs';const bootstrap=globalThis.${bootstrapKey};if(!bootstrap)throw Error('missing-experiment-bootstrap');createHostWorkerRuntime({chrome,indexedDB,...HOST_CONFIG,browserBootstrap:bootstrap});`;
 const bundle=contents=>esbuild.buildSync({stdin:{contents,resolveDir:candidate,sourcefile:'experiment-entry.mjs'},bundle:true,format:'iife',platform:'browser',target:'chrome120',treeShaking:false,write:false,metafile:true,logLevel:'silent'});
 const bootstrap=bundle(bootstrapEntry),runtime=bundle(runtimeEntry),entry=workerSource(bootstrap.outputFiles[0].text),runtimeText=runtime.outputFiles[0].text;
 await writeFile(join(candidate,'extension/worker.mjs'),entry);await writeFile(join(candidate,'extension/classic-runtime.js'),runtimeText);
 const before=JSON.parse(await readFile(join(candidate,'manifest.json'),'utf8')),manifest=structuredClone(before);assert.equal(manifest.background.type,'module');delete manifest.background.type;await writeFile(join(candidate,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 assert.deepEqual({...manifest,background:before.background},before);assert(!manifest.web_accessible_resources.some(row=>row.resources.includes('extension/classic-runtime.js')));
 new vm.Script(entry);new vm.Script(runtimeText);
 const records=await inventory(candidate),allowed=new Set(['extension/worker.mjs',contextPath,'manifest.json']);
 for(const [path,hash]of Object.entries(original.files))if(!allowed.has(path))assert.equal(records[path],hash,path+' changed outside candidate scope');
 assert.deepEqual(Object.keys(records).sort(),[...Object.keys(original.files),'build-manifest.json','extension/classic-runtime.js'].sort());
 assert.equal(sha(await readFile(join(candidate,'build-manifest.json'))),sha(await readFile(join(built.unpacked,'build-manifest.json'))));
 return {built,original,candidate,records,entry,runtimeText,toolVersion:esbuild.version,bootstrapModules:Object.keys(bootstrap.metafile.inputs).length,runtimeModules:Object.keys(runtime.metafile.inputs).length};
}
function validateExecution(actual,candidate,id){
 assert.equal(actual.url,`chrome-extension://${id}/extension/worker.mjs`,'candidate worker URL');assert.equal(actual.runtimeId,id,'candidate runtime id');
 assert.deepEqual(actual.background,{service_worker:'extension/worker.mjs'},'loaded classic background');
 assert.equal(actual.entryHash,candidate.records['extension/worker.mjs'],'loaded entry bytes');assert.equal(actual.runtimeHash,candidate.records['extension/classic-runtime.js'],'loaded runtime bytes');
 assert.deepEqual(actual.entry.map(row=>row.stage),['entry-first-line','before-runtime-import','runtime-attached'],'complete unique classic timeline');
 const registrations=actual.context.filter(row=>row.stage==='listeners-registered');assert.equal(registrations.length,1,'exactly one actual C2 listener registration');
 const times=[actual.entry[0].at,registrations[0].at,actual.entry[1].at,actual.entry[2].at];assert(times.every(Number.isFinite),'finite execution timestamps');assert(times.every((time,i)=>i===0||time>=times[i-1]),'entry/listener/import/attached order');
 assert.equal(actual.bootstrapPresent,false,'temporary bootstrap bridge removed');
}
function evidenceContract(candidate){
 const id='contract',actual={url:`chrome-extension://${id}/extension/worker.mjs`,runtimeId:id,background:{service_worker:'extension/worker.mjs'},entryHash:candidate.records['extension/worker.mjs'],runtimeHash:candidate.records['extension/classic-runtime.js'],entry:[{stage:'entry-first-line',at:1},{stage:'before-runtime-import',at:3},{stage:'runtime-attached',at:4}],context:[{stage:'listeners-registered',at:2}],bootstrapPresent:false};validateExecution(actual,candidate,id);
 const mutations=[a=>a.url='chrome-extension://other/extension/worker.mjs',a=>a.runtimeId='other',a=>a.background.type='module',a=>a.entryHash='wrong',a=>a.runtimeHash='wrong',a=>a.entry=[],a=>a.context=[],a=>a.context.push({...a.context[0]}),a=>a.entry[2].at=0,a=>a.bootstrapPresent=true];
 for(const mutate of mutations){const altered=structuredClone(actual);mutate(altered);assert.throws(()=>validateExecution(altered,candidate,id));}return {status:'PASS',negativeCases:mutations.length,evidence:'MOCK_EVIDENCE_VALIDATOR_ONLY'};
}
function contract(candidate,origin){
 const events=()=>({listeners:new Set(),addListener(fn){this.listeners.add(fn);},removeListener(fn){this.listeners.delete(fn);}}),webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>[k,events()]));
 const chrome={runtime:{id:'contract',getContexts(){}},webNavigation:{getFrame(){throw Error('no requests in contract');},onCommitted:events(),onHistoryStateUpdated:events()},webRequest,tabs:{get(){throw Error('no requests in contract');},onRemoved:events()}};
 let imported=0,owner;
 const sandbox={chrome,URL,Date,Map,Set,WeakMap,WeakSet,performance,crypto,AbortController,setTimeout,clearTimeout,importScripts(path){assert.equal(path,'classic-runtime.js');assert.equal(++imported,1);assert.equal(webRequest.onSendHeaders.listeners.size,1);assert.equal(webRequest.onCompleted.listeners.size,1);owner=sandbox[bootstrapKey];assert(owner);assert.equal(sandbox.__vaiwlColdTrace.find(row=>row.stage==='listeners-registered')?.stage,'listeners-registered');assert(sandbox.__vaiwlClassicTimeline[0].at<=sandbox.__vaiwlColdTrace[0].at);const claim=owner.claim({chrome,origin,scopeProfile:{browserRequestContext:true}});claim.attach({onContextInvalidate(){},onContextReady(){},onNavigation(){},onRemoved(){}});}};
 vm.runInNewContext(candidate.entry,sandbox);assert.equal(imported,1);assert.equal(sandbox[bootstrapKey],undefined);assert.equal(sandbox.__vaiwlClassicTimeline.at(-1).stage,'runtime-attached');owner.stop();for(const event of Object.values(webRequest))assert.equal(event.listeners.size,0);
 return {status:'PASS',evidence:'NODE_REAL_BOOTSTRAP_CLASSIC_ENTRY_CONTRACT_RUNTIME_IMPORT_STUB',runtimeBundleSyntax:'PASS',browser:'NOT_RUN',oneOwnerRegisteredBeforeImport:true,temporaryBridgeRemoved:true,stopRemovesListeners:true,evidenceValidation:evidenceContract(candidate)};
}
const mode=process.argv[2]??'--contract';assert(['--contract','--run'].includes(mode));const output=process.argv[3]??'/private/tmp/vaiwl-classic-cold-'+mode.slice(2)+'.json';
const dir=await mkdtemp('/private/tmp/vaiwl-classic-cold-'),sourceHashes=await hashes();let candidate,server,guard,handle,page,worker,extensionId,mountPassed=false;
const report={status:'NOT_RUN',mode,evidence:'EXPERIMENTAL_TWO_STAGE_CLASSIC_NOT_PRODUCTION',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',acceptance:'NOT_ESTABLISHED',entryTimestampBoundary:'FIRST_EXECUTED_STATEMENT_AFTER_BOOTSTRAP_SCRIPT_PARSE_NOT_BROWSER_WORKER_DISPATCH_START',sourceHashes,requestTimeline:[],errors:[],results:[]};
try{
 let origin='http://127.0.0.1:54321';
 if(mode==='--run'){const {createVariantHostFixtureServer}=await import('./fixtures/variants-server.mjs');server=await createVariantHostFixtureServer({profile:'MODERN'});origin=server.origin;}
 candidate=await buildCandidate(dir,origin);report.candidate={unpacked:candidate.candidate,original:candidate.built.unpacked,toolVersion:candidate.toolVersion,bootstrapModules:candidate.bootstrapModules,runtimeModules:candidate.runtimeModules,hashes:candidate.records};report.productionHashes=candidate.original.sourceHashes;report.contract=contract(candidate,origin);
 if(mode==='--contract'){report.status='PASS';report.browser='NOT_RUN';}
 else{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs'),{launchNativeVisibilityBrowser}=await import('./native-visibility-browser.mjs'),{createHistoricalNetworkGuard}=await import('./historical-network-guard.mjs');
  guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});const {browser,context}=handle;
  await context.route('**/*',r=>r.request().url().startsWith(origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
  const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:candidate.candidate});extensionId=id;report.extensionId=id;
  // No worker-ready wait, evaluation or synthetic wake before the native route.
  page=await context.newPage();page.on('request',r=>{const u=new URL(r.url());if(u.origin===origin&&/^\/backend-api\/conversation\//.test(u.pathname)&&report.requestTimeline.length<16)report.requestTimeline.push({at:Date.now(),path:u.pathname});});page.on('pageerror',e=>{if(report.errors.length<20)report.errors.push(e.message);});
  const target=coldProjectionTarget();await page.goto(origin+target.path);await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000});mountPassed=true;
  const frame=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(frame);await frame.getByText(target.title,{exact:true}).waitFor({timeout:15000});assert.equal(page.url(),origin+target.path);
  const scopes=await frame.evaluate(async()=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));const base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});}finally{base.close();}});
  assert.deepEqual(scopes,[JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-team'])])]);assert.equal(coldConversationRequests(server.snapshot().nativeRequests).length,1);assert.deepEqual(report.errors,[]);
  report.results.push({name:'original20s-cold-C2-correct-native-title-and-team-scope',status:'PASS'});report.status='PASS';report.browser=browser.version();
 }
}catch(error){report.status='FAIL';report.error=String(error.stack??error);process.exitCode=1;}
finally{
 if(handle){try{
  assert(extensionId,'loaded candidate extension id required');const expectedUrl=`chrome-extension://${extensionId}/extension/worker.mjs`;report.observedWorkerUrls=handle.context.serviceWorkers().map(w=>w.url());worker=handle.context.serviceWorkers().find(w=>w.url()===expectedUrl);assert(worker,'exact candidate worker required');
  report.execution=await worker.evaluate(async()=>{
   const hash=async url=>{const response=await fetch(url);if(!response.ok)throw Error('candidate resource unavailable');const bytes=await response.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');};
   return {url:self.location.href,runtimeId:chrome.runtime.id,background:chrome.runtime.getManifest().background,entryHash:await hash(self.location.href),runtimeHash:await hash(chrome.runtime.getURL('extension/classic-runtime.js')),entry:globalThis.__vaiwlClassicTimeline??[],context:globalThis.__vaiwlColdTrace??[],bootstrapPresent:globalThis.__vaiwlClassicExperimentBootstrap!==undefined};
  });report.timings={entry:report.execution.entry,context:report.execution.context};validateExecution(report.execution,candidate,extensionId);report.candidateExecutionVerified=true;
 }catch(error){report.candidateExecutionVerified=false;report.status='FAIL_EVIDENCE';report.diagnosticError=String(error.stack??error);process.exitCode=1;}}

 if(server){report.native=server.snapshot();report.nativeConversationCount=coldConversationRequests(report.native.nativeRequests).length;if(report.nativeConversationCount!==1){report.status='FAIL';report.requestCountError='expected exactly one natural conversation GET';process.exitCode=1;}}
 if(page)try{report.surface=await page.evaluate(()=>({owned:document.querySelectorAll('[data-va-owned]').length,reading:!!document.querySelector('#reading'),composer:!!document.querySelector('#prompt-textarea')}));assert(report.surface.reading&&report.surface.composer);if(!mountPassed)assert.equal(report.surface.owned,0);}catch(error){report.status='FAIL';report.surfaceError=String(error.message);process.exitCode=1;}
 const clean=await cleanupOwnedResources(report,[['browser',()=>handle?.close()],['network',async()=>{await guard?.close();report.networkGuard=guard?.snapshot();}],['fixture',()=>server?.close()],['original-package',()=>candidate?verifyHost(candidate.built.unpacked):undefined],['candidate-integrity',async()=>{if(candidate)assert.deepEqual(await inventory(candidate.candidate),candidate.records);}],['source-integrity',async()=>{assert.deepEqual(await hashes(),sourceHashes);if(candidate)for(const [p,h]of Object.entries(candidate.original.sourceHashes))assert.equal(sha(await readFile(join(ROOT,p))),h);report.sourceChangedDuringRun=false;}],['temporary-directory',async()=>{await rm(dir,{recursive:true,force:true});report.temporaryDirectoryRemoved=true;}]]);if(!clean)process.exitCode=1;
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,mode,report:output,error:report.error??null}));
