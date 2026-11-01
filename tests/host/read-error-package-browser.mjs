/** Diagnostic-only real MV3: no injected facts, grants or runtime authorization. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir,platform} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {legacyExpectedWorld as oracle} from './expected/legacy.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createReadErrorPackage,verifyReadErrorPackage} from './read-error-injection.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex'),script=fileURLToPath(import.meta.url),scriptHash=hash(await readFile(script));
const fixturePaths=['./read-error-injection.mjs','./fixtures/server.mjs','./fixtures/variants-server.mjs','./fixtures/native.mjs','./fixtures/native.css','./fixtures/legacy.html','./expected/legacy.mjs'];
const fixtureSourceHashes=Object.fromEntries(await Promise.all(fixturePaths.map(async path=>[path,hash(await readFile(new URL(path,import.meta.url)))])));
const server=await createHostFixtureServer(),dir=await mkdtemp(join(tmpdir(),'vaiwl-read-error-')),built=packageHost(join(dir,'official'),{offlineOrigin:server.origin});
assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
const manifestBytes=await readFile(join(built.unpacked,'build-manifest.json')),manifest=JSON.parse(manifestBytes),diagnostic=await createReadErrorPackage(built.unpacked,join(dir,'diagnostic'));
const report={evidence:'DIAGNOSTIC_ONLY_REAL_HEADLESS_MV3_READ_ERROR_EXPLICIT_RETRY',profile:'LEGACY_OFFLINE_RECONSTRUCTION',realChatGPT:'NOT_RUN',acceptance:'SCOPED_FAULT_INJECTION_NOT_FULL_81_OR_RELEASE',scriptHash,fixtureSourceHashes,sourceHashes:manifest.sourceHashes,buildManifestHash:hash(manifestBytes),diagnostic,fixture:server.manifest,attempts:[],trace:[],steps:[],errors:[]};
let context,page,worker,id;
const record=(name,details={})=>report.steps.push({name,status:'PASS',...details});
const poll=async check=>{const deadline=Date.now()+15000;while(Date.now()<deadline){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('read-error-observation-deadline');};
const viewRequests=()=>report.trace.filter(row=>row.phase==='request'&&row.type==='HOST_UI_VIEW');
const continuity=async()=>assert.deepEqual(await page.evaluate(()=>({document:document===readErrorDocument,editor:document.querySelector('#prompt-textarea')===readErrorEditor,pageHides:readErrorPageHides})),{document:true,editor:true,pageHides:0});
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',route=>route.request().url().startsWith(server.origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 await context.addInitScript(()=>{
  if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;
  const send=chrome.runtime.sendMessage.bind(chrome.runtime),emit=row=>console.log('READ_ERROR_RPC '+JSON.stringify({frame:location.pathname,...row}));
  chrome.runtime.sendMessage=function(...args){const message=args[0],safe={type:message?.type,grantId:message?.grantId??null,mountId:message?.mountId??null,retry:typeof message?.retryToken==='string'};emit({phase:'request',...safe});const result=send(...args);if(result?.then)result.then(reply=>emit({phase:'response',...safe,ok:reply?.ok??null,state:reply?.state??null,reason:reply?.reason??null,grantId:reply?.grant?.id??safe.grantId,mountId:reply?.grant?.mountId??safe.mountId}),()=>emit({phase:'reject',...safe}));return result;};
  const connect=chrome.runtime.connect.bind(chrome.runtime);chrome.runtime.connect=function(...args){const port=connect(...args);port.onMessage.addListener(message=>{if(['VAIWL_UI_DATA_CHANGED','VAIWL_UI_WORKSPACE_ENTERED'].includes(message?.type))emit({phase:'notification',type:message.type});});return port;};
 });
 const cdp=await context.browser().newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:diagnostic.unpacked}));
 worker=context.serviceWorkers().find(value=>value.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:value=>value.url().startsWith(`chrome-extension://${id}/`),timeout:15000});

 report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.workerNetworkBlocked);
 page=await context.newPage();page.on('console',message=>{const value=message.text();if(value.startsWith('READ_ERROR_RPC '))try{report.trace.push(JSON.parse(value.slice(15)));}catch{}});page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(server.origin+'/');await page.evaluate(()=>{globalThis.readErrorDocument=document;globalThis.readErrorEditor=document.querySelector('#prompt-textarea');globalThis.readErrorPageHides=0;addEventListener('pagehide',()=>readErrorPageHides++);});
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 const frames={};for(const role of ['workspace','sidebar']){const frame=page.frames().find(value=>value.url()===`chrome-extension://${id}/${role}.html`);assert(frame);frames[role]=frame;await frame.getByRole('status').filter({hasText:'工作空间数据正在更新，本次读取已停止。'}).waitFor({timeout:15000});}
 await continuity();const frameURLs=page.frames().map(frame=>frame.url()).filter(url=>url.startsWith(`chrome-extension://${id}/`)).sort();assert.equal(frameURLs.length,2);
 report.attempts=await worker.evaluate(()=>globalThis.__vaiwlReadErrorTrace);const injectedByOwner=new Map();for(const row of report.attempts)if(row.injected)injectedByOwner.set(row.owner,[...(injectedByOwner.get(row.owner)??[]),row.attempt]);assert.equal(injectedByOwner.size,1);for(const attempts of injectedByOwner.values())assert.deepEqual(attempts,[1,2,3]);
 const terminalGrants=Object.fromEntries(['workspace','sidebar'].map(role=>{const request=viewRequests().filter(row=>row.frame===`/${role}.html`).at(-1);assert(request?.grantId);return [role,request.grantId];}));
 record('real-owner-initial-plus-two-retries-exhausted-with-live-document-editor-grants-and-two-surfaces',{terminalGrants,injectedOwners:injectedByOwner.size});
 const before=viewRequests().length,renewBefore=report.trace.filter(row=>row.type==='HOST_UI_RENEW'&&row.phase==='response'&&row.ok).length;
 await poll(()=>report.trace.filter(row=>row.type==='HOST_UI_RENEW'&&row.phase==='response'&&row.ok).length>=renewBefore+2);
 assert.equal(viewRequests().length,before,'terminal must not restart VIEW on natural renewal');await continuity();assert.deepEqual(page.frames().map(frame=>frame.url()).filter(url=>url.startsWith(`chrome-extension://${id}/`)).sort(),frameURLs);
 assert(!report.trace.some(row=>/SUSPEND|REPAIR/.test(row.type??'')));record('natural-dual-frame-renewal-keeps-terminal-without-new-view-suspend-or-repair',{notificationCoverage:'ONLY_IF_OBSERVED_NOT_REQUIRED_OR_CLAIMED',notificationsObserved:report.trace.filter(row=>row.phase==='notification').length});
 const oldButtons=[];
 for(const role of ['workspace']){
  const frame=frames[role],button=frame.getByRole('button',{name:'重新读取',exact:true});oldButtons.push(await button.elementHandle());const beforeRetries=viewRequests().filter(row=>row.retry&&row.frame===`/${role}.html`).length;
  await button.dblclick();await frame.locator('[data-vaiwl-read-error]').waitFor({state:'detached',timeout:15000});
  const requests=viewRequests().filter(row=>row.retry&&row.frame===`/${role}.html`);assert.equal(requests.length,beforeRetries+1);assert.equal(requests.at(-1).grantId,terminalGrants[role]);
 }
 for(const button of oldButtons)await button.evaluate(node=>node.click());
 assert.equal(viewRequests().filter(row=>row.retry).length,1);report.attempts=await worker.evaluate(()=>globalThis.__vaiwlReadErrorTrace);for(const row of report.attempts.filter(row=>!row.injected))assert(row.attempt>=4);await continuity();
 await frames.workspace.getByRole('link',{name:oracle.conversations[2].title,exact:true}).first().waitFor();await frames.workspace.getByRole('link',{name:oracle.conversations[3].title,exact:true}).first().waitFor();await frames.workspace.locator(`[data-theme-id="${oracle.projects[0].id}"]`).waitFor();record('explicit-workspace-retry-once-restores-native-names-and-lists-stale-buttons-inert');
 // The normal product exit remains available after successful recovery.
 const exit=frames.sidebar.getByRole('button',{name:'返回原生界面',exact:true});await exit.click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:15000});await continuity();assert(await page.locator('#prompt-textarea').isVisible());assert(await page.locator('aside').isVisible());record('remaining-terminal-native-exit-restores-editor-and-navigation');
 assert(!report.trace.some(row=>/SUSPEND|REPAIR/.test(row.type??'')));assert.deepEqual(report.errors,[]);report.status='PASS_DIAGNOSTIC_ONLY';report.browserVersion=context.browser().version();
}catch(error){report.status=context?'FAIL':'NOT_RUN_BROWSER_STARTUP';report.error=error.stack;process.exitCode=1;try{report.screenshot=join(dir,'failure.png');await page?.screenshot({path:report.screenshot});}catch{}}
finally{
 const finalize=async(stage,fn)=>{try{await fn();}catch(error){(report.finalizationErrors??=[]).push({stage,error:String(error)});report.status='FAIL_FINALIZATION';process.exitCode=1;}};
 await finalize('diagnostic-integrity',()=>verifyReadErrorPackage(diagnostic));await finalize('official-package-integrity',()=>assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION'));
 await finalize('browser-close',()=>context?.close());await finalize('fixture-close',()=>server.close());
 await finalize('source-integrity',async()=>{report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([path,expected])=>hash(await readFile(path))!==expected))).some(Boolean);assert.equal(report.sourceChangedDuringRun,false);});
 await finalize('fixture-integrity',async()=>{report.fixtureChangedDuringRun=(await Promise.all(Object.entries(fixtureSourceHashes).map(async([path,expected])=>hash(await readFile(new URL(path,import.meta.url)))!==expected))).some(Boolean);assert.equal(report.fixtureChangedDuringRun,false);});
 await finalize('script-integrity',async()=>{report.scriptChangedDuringRun=hash(await readFile(script))!==scriptHash;assert.equal(report.scriptChangedDuringRun,false);});
 await finalize('report',()=>writeFile(process.argv[2]??join(tmpdir(),'free-read-error-package-browser.json'),JSON.stringify(report,null,2)+'\n'));
}console.log(JSON.stringify(report));
