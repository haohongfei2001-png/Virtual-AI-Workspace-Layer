/** Narrow same-route C2 replacement; no silent-expiry/J2 or live-account claim. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {j2JourneyProfile} from './j2-journey-profile.mjs';
import {j2Within,j2Poll,j2ExternalProbe} from './j2-runner-bounds.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
const dormantMutant=process.argv[3]==='dormant-recovery-mutant',dormantRecovery=dormantMutant||process.argv[3]==='dormant-recovery';
const hash=v=>createHash('sha256').update(v).digest('hex');
const paths=['tests/host/context-replacement-package-browser.mjs','tests/host/fixtures/variants-server.mjs','tests/host/fixtures/variants-native.mjs','tests/host/fixtures/native-current-refresh.mjs','tests/host/fixtures/native.mjs','tests/host/expected/modern.mjs','tests/host/j2-journey-profile.mjs','tests/host/j2-runner-bounds.mjs','tests/host/isolated-browser-cleanup.mjs'];
const fixtureHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const server=await createVariantHostFixtureServer({profile:'MODERN',nativeCurrentRefresh:true}),dir=await mkdtemp(join(tmpdir(),'vaiwl-context-replacement-')),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));
let instrumentedEntry,mutantSession;
if(dormantRecovery){
 const path=join(built.unpacked,'extension/content-entry.mjs'),original=await readFile(path,'utf8'),anchor=' void session.start();';assert.equal(original.split(anchor).length,2);
 instrumentedEntry=original.replace(anchor,' globalThis.__vaiwlIdleProbeSession=Object.freeze({prepareIdle:()=>!!session.prepareIdle(),enterDormant:()=>session.enterDormant()});\n'+anchor);await writeFile(path,instrumentedEntry);
}
if(dormantMutant){
 const path=join(built.unpacked,'src/host/content-session.mjs'),original=await readFile(path,'utf8'),anchor="if(error?.message==='scope-not-verified')contextPending();else stop();";assert.equal(original.split(anchor).length,2);mutantSession=original.replace(anchor,'stop();');await writeFile(path,mutantSession);
}
const C='33333333-3333-4333-8333-333333333333',scope=j2JourneyProfile('MODERN').scope,scopeKey=JSON.stringify([scope.provider,scope.accountId,scope.organizationId]);
const report={status:'NOT_RUN',evidence:'OFFLINE_C2_RECEIPT_REPLACEMENT_NARROW',startupMode:'WORKER_READY_PRECONDITION_NOT_COLD_ACCEPTANCE',realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',sourceHashes:manifest.sourceHashes,fixtureHashes,fixture:server.manifest,results:[],requests:[],errors:[]};let context,page,id;
if(dormantRecovery){report.evidence='OFFLINE_C2_INSTRUMENTED_DORMANT_SCOPE_RECOVERY';report.instrumentation={path:'extension/content-entry.mjs',after:hash(instrumentedEntry),exposes:['prepareIdle','enterDormant']};report.mutation=dormantMutant?'RESTORE_PERMANENT_STOP_AFTER_DENIED_WAKE':null;report.forcedWorkerStop=true;report.naturalWorkerSleep='NOT_ESTABLISHED';}
async function verifyPackage(){if(!dormantRecovery){assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');return;}for(const [path,expected] of Object.entries(manifest.files))assert.equal(hash(await readFile(join(built.unpacked,path))),path==='extension/content-entry.mjs'?hash(instrumentedEntry):dormantMutant&&path==='src/host/content-session.mjs'?hash(mutantSession):expected);}
const poll=fn=>j2Poll(fn,15000),within=(name,fn,ms=5000)=>j2Within(name,fn,ms);
const frame=()=>page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);
const step=(name,detail={})=>report.results.push({name,status:'PASS',...detail});
async function continuity(){assert.deepEqual(await page.evaluate(()=>({sameDocument:document===replacementDocument,sameEditor:document.querySelector('textarea')===replacementEditor,draft:replacementEditor.value,start:replacementEditor.selectionStart,end:replacementEditor.selectionEnd,pagehides:replacementPagehides})),{sameDocument:true,sameEditor:true,draft:'UNSENT_CONTEXT_REPLACEMENT',start:3,end:8,pagehides:0});assert.equal(page.url(),server.origin+'/c/'+C);}
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{timeout:25000,headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(15000);
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await within('browser-cdp',()=>context.browser().newBrowserCDPSession());({id}=await within('load',()=>cdp.send('Extensions.loadUnpacked',{path:built.unpacked}),15000));
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith(`chrome-extension://${id}/`),timeout:15000});assert.equal(await within('worker-ready',()=>worker.evaluate(()=>chrome.runtime.id)),id);assert.equal(await within('network-refusal',()=>worker.evaluate(j2ExternalProbe,1500),3000),'BLOCKED');
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',response=>{const request=response.request();if(request.url()===server.origin+'/backend-api/conversation/'+C)report.requests.push({at:Date.now(),status:response.status(),method:request.method(),resourceType:request.resourceType()});});
 await page.goto(server.origin+'/c/'+C);await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);let initial=await poll(()=>frame());await initial.getByText('Ordinary conversation',{exact:true}).waitFor();
 await page.locator('textarea').fill('UNSENT_CONTEXT_REPLACEMENT');await page.evaluate(()=>{globalThis.replacementDocument=document;globalThis.replacementEditor=document.querySelector('textarea');replacementEditor.setSelectionRange(3,8);globalThis.replacementPagehides=0;addEventListener('pagehide',()=>replacementPagehides++);});
 await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();await continuity();assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);step('initial-team-projection-native-reading-and-unsent-draft');
 const oldFrame=frame(),before=report.requests.length;assert(oldFrame);assert.equal(before,1);
 let renewed;
 if(dormantRecovery){
  const session=await context.newCDPSession(page),worlds=[],versions=[];session.on('Runtime.executionContextCreated',e=>worlds.push(e.context));session.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await session.send('Runtime.enable');await session.send('ServiceWorker.enable');
  const evaluate=async(expression,contextId)=>{const r=await session.send('Runtime.evaluate',{expression,contextId,returnByValue:true,awaitPromise:true});assert.equal(r.exceptionDetails,undefined);return r.result.value;};
  const isolated=await poll(async()=>{for(const world of worlds.filter(w=>w.auxData?.isDefault===false)){try{if(await evaluate(`window===window.top&&chrome.runtime.id===${JSON.stringify(id)}&&typeof __vaiwlIdleProbeSession==='object'`,world.id))return world.id;}catch{}}return null;});
  assert.equal(await page.evaluate(()=>typeof globalThis.__vaiwlIdleProbeSession),'undefined');
  await poll(()=>evaluate('__vaiwlIdleProbeSession.prepareIdle()',isolated));
  assert.equal(await evaluate('__vaiwlIdleProbeSession.enterDormant()',isolated),true);step('actual-dormant-close-before-worker-loss');
  const running=await poll(()=>versions.find(v=>v.scriptURL===`chrome-extension://${id}/extension/worker.mjs`&&v.runningStatus==='running'));const start=versions.length;
  await session.send('ServiceWorker.stopWorker',{versionId:running.versionId});await poll(()=>versions.slice(start).some(v=>v.versionId===running.versionId&&v.runningStatus==='stopped'));assert.equal(oldFrame.isDetached(),false);assert.equal(frame(),oldFrame);assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);await continuity();step('worker-stop-confirmed-no-receipt-replay');
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await poll(()=>oldFrame.isDetached());await continuity();assert.equal(await page.locator('[data-va-owned]').count(),0);assert.equal(report.requests.length,1);step('denied-wake-withdraws-old-projection-preserves-native-draft');
  await page.getByRole('button',{name:'Refresh current conversation',exact:true}).click();await poll(()=>report.requests.length===before+1);assert.equal(report.requests.at(-1).status,200);assert.equal(report.requests.at(-1).method,'GET');
  report.phase='await-fresh-frame-after-native-GET';await poll(()=>frame()&&frame()!==oldFrame);report.phase='fresh-frame-observed';renewed=frame();await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);await continuity();step('fresh-native-GET-READY-rebinds-in-reading');await session.detach();
 }else{
 // One user-triggered refresh midway through the real old receipt lifetime.
 // No periodic requests, fake clock, worker keepalive or owner hooks.
 await page.waitForTimeout(30000);await continuity();
 await page.getByRole('button',{name:'Refresh current conversation',exact:true}).click();
 await poll(()=>report.requests.length===before+1);assert.deepEqual(report.requests.at(-1).status,200);assert.equal(report.requests.at(-1).method,'GET');
 await poll(()=>oldFrame.isDetached()&&frame()&&frame()!==oldFrame);
 renewed=frame();await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);await continuity();step('one-native-same-route-GET-replaces-old-frame-and-restores-reading');
 const originalDeadline=report.requests[0].at+65000;while(Date.now()<originalDeadline)await page.waitForTimeout(Math.min(30000,originalDeadline-Date.now()));
 assert(Date.now()-report.requests[0].at>=65000);assert(Date.now()-report.requests[1].at<60000);assert.equal(frame(),renewed);assert.equal(renewed.isDetached(),false);await continuity();
 report.realReceiptWindow={sinceOriginalResponseMs:Date.now()-report.requests[0].at,sinceReplacementResponseMs:Date.now()-report.requests[1].at};
 step('new-selection-survives-original-receipt-expiry-with-no-more-native-requests');
 }
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);await renewed.getByText('Ordinary conversation',{exact:true}).waitFor();
 const scopes=await within('scope-oracle',()=>renewed.evaluate(async()=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});}finally{base.close();}}));assert.deepEqual(scopes,[scopeKey]);await continuity();step('new-projection-same-nonfirst-team-no-personal-writes');
 assert.equal(report.requests.length,2);assert.deepEqual(report.errors,[]);await verifyPackage();report.status=dormantRecovery?'PASS_NARROW_OFFLINE_DORMANT_RECOVERY':'PASS_NARROW_OFFLINE_REPLACEMENT';report.browserVersion=context.browser().version();
}catch(error){report.status=context?'FAIL':'NOT_RUN_BROWSER_STARTUP';report.error=error.stack;process.exitCode=1;try{report.failure=await within('failure-dom',()=>page?.evaluate(()=>({state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,frames:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length,returns:document.querySelectorAll('[aria-label="返回工作空间"]').length})));}catch(error){report.diagnosticError=String(error);}}
finally{const clean=await cleanupOwnedResources(report,[['package-integrity',verifyPackage],['context-close',()=>within('context-close',()=>context?.close(),10000)],['server-close',()=>within('server-close',()=>server.close())],['source-integrity',async()=>{report.sourceChangedDuringRun=(await Promise.all(Object.entries({...manifest.sourceHashes,...fixtureHashes}).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);assert.equal(report.sourceChangedDuringRun,false);}]]);if(!clean)process.exitCode=1;await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error,results:report.results,requests:report.requests}));
