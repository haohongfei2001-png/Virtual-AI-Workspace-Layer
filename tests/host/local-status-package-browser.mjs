/** Passive status in an isolated actual MV3 package; no real account access. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {installStartupSurfaceObserver} from './startup-surface-observer.mjs';
const server=await createHostFixtureServer(),dir=await mkdtemp(join(tmpdir(),'vaiwl-local-status-')),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const runnerHash=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const observerURL=new URL('./startup-surface-observer.mjs',import.meta.url),observerHash=createHash('sha256').update(await readFile(observerURL)).digest('hex');
const report={sourceCommit:process.env.FREE_SOURCE_COMMIT??null,runnerHash,startup:'IMMEDIATE_LOAD_ORIGINAL_15S_WINDOW',kind:'OFFLINE_MV3_LOCAL_STATUS',status:'RUNNING',realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',sourceHashes:info.sourceHashes,results:{},errors:[],stage:'launch',timeline:[]};const started=performance.now();let context,guard,page,popup;
try{
 guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await context.route('**/*',route=>route.request().url().startsWith(server.origin)||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 context.on('serviceworker',()=>{if(report.timeline.length<16)report.timeline.push({event:'worker',elapsedMs:performance.now()-started});});
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 page=await context.newPage();await page.addInitScript(installStartupSurfaceObserver,{fixtureOrigin:server.origin,extensionOrigin:`chrome-extension://${id}`});report.observerHash=observerHash;
 page.on('pageerror',e=>{if(report.errors.length<16)report.errors.push(e.message.slice(0,1000));});report.stage='initial-surfaces';await page.goto(server.url);report.timeline.push({event:'page-loaded',elapsedMs:performance.now()-started});await page.waitForFunction(()=>{const n=document.querySelector('[data-va-owned][id$="_workspace"]');if(!n||n.hasAttribute('popover'))return false;const box=n.getBoundingClientRect(),style=getComputedStyle(n);return style.display!=='none'&&style.visibility==='visible'&&box.width>=160&&box.height>=96&&!!n.querySelector('iframe');},{},{timeout:15000});
 report.startupTrace=await page.evaluate(()=>globalThis.__vaiwlOfflineStartup?.finish()??{status:'INCOMPLETE',issues:['not-installed']});
 await page.locator('textarea').fill('STATUS_UNSENT_DRAFT');
 report.stage='status';popup=await context.newPage();await popup.goto(`chrome-extension://${id}/status.html`);await page.bringToFront();
 // Same packaged popup origin and entry; query the current active fixture tab.
 const status=()=>popup.evaluate(async()=>{const {readActiveLocalStatus}=await import(chrome.runtime.getURL('src/host/local-status.mjs'));return readActiveLocalStatus({tabs:chrome.tabs});});
 report.results.reading=await status();assert.equal(report.results.reading,'reading');assert.equal(await page.locator('[data-va-owned][id$="_workspace"]:visible').count(),0);assert.equal(await page.locator('textarea').inputValue(),'STATUS_UNSENT_DRAFT');
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await page.locator('[data-va-owned][id$="_workspace"]:visible').waitFor();report.results.ready=await status();assert.equal(report.results.ready,'ready');
 await popup.evaluate(()=>import(chrome.runtime.getURL('extension/status.mjs')+'?ready'));assert.match(await popup.locator('#status').textContent(),/已连接/);assert.equal(await popup.locator('button').count(),0);
 report.results.draft=await page.locator('textarea').inputValue()==='STATUS_UNSENT_DRAFT';assert(report.results.draft);
 // Public frame documents cannot impersonate the private popup sender.
 const rogue=await context.newPage();await rogue.goto(`chrome-extension://${id}/workspace.html`);await page.bringToFront();
 report.results.frameRejected=await rogue.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});try{return await chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_STATUS'},{frameId:0})===undefined;}catch{return true;}});assert(report.results.frameRejected);
 await page.goto('about:blank');report.results.unavailable=await status();assert.equal(report.results.unavailable,'unavailable');
 await popup.evaluate(()=>import(chrome.runtime.getURL('extension/status.mjs')+'?unavailable'));assert.match(await popup.locator('#status').textContent(),/尚未接入/);
 assert.deepEqual(report.errors,[]);verifyHost(built.unpacked);
 for(const [path,expected]of Object.entries(info.sourceHashes))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),expected,'source drift '+path);
 report.sourceChanged=false;report.status='PASS_OFFLINE_MV3_LOCAL_STATUS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;let timer;try{const snapshot=await Promise.race([page.evaluate(()=>({startupTrace:globalThis.__vaiwlOfflineStartup?.finish()??{status:'INCOMPLETE',issues:['not-installed']},surface:{readyState:document.readyState,visible:document.visibilityState,focused:document.hasFocus(),activeTag:document.activeElement?.tagName,nativeEditorFocused:document.activeElement===document.querySelector('#prompt-textarea'),popovers:document.querySelectorAll('[data-va-owned]:popover-open').length,frames:document.querySelectorAll('iframe[src^="chrome-extension://"]').length,returns:[...document.querySelectorAll('button')].filter(n=>n.getAttribute('aria-label')==='返回工作空间').length}})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('snapshot-deadline')),1000);})]);report.surface=snapshot.surface;report.startupTrace??=snapshot.startupTrace;}catch{report.snapshotUnavailable=true;}finally{clearTimeout(timer);} }
finally{report.browserVersion=context?.browser()?.version();report.elapsedMs=performance.now()-started;report.fixtureRequests=server.snapshot().requests;await context?.close();await guard?.close();report.networkGuard=guard?.snapshot();await server.close();report.sourceStable=true;for(const [path,expected]of Object.entries(info.sourceHashes))if(createHash('sha256').update(await readFile(path)).digest('hex')!==expected)report.sourceStable=false;report.runnerStable=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')===runnerHash;report.observerStable=createHash('sha256').update(await readFile(observerURL)).digest('hex')===observerHash;if(!report.sourceStable||!report.runnerStable||!report.observerStable){report.status='FAIL';report.integrityError='source-or-runner-drift';process.exitCode=1;}await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,stage:report.stage,results:report.results,error:report.error,surface:report.surface,timeline:report.timeline,requests:report.fixtureRequests,report:process.argv[2]??join(dir,'report.json')}));}
