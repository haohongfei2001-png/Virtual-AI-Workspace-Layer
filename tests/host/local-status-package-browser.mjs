/** Passive status in an isolated actual MV3 package; no real account access. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const server=await createHostFixtureServer(),dir=await mkdtemp(join(tmpdir(),'vaiwl-local-status-')),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const report={kind:'OFFLINE_MV3_LOCAL_STATUS',status:'RUNNING',realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',sourceHashes:info.sourceHashes,results:{},errors:[]};let context;
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',route=>route.request().url().startsWith(server.origin)||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});
 await page.locator('textarea').fill('STATUS_UNSENT_DRAFT');
 const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/status.html`);await page.bringToFront();
 // Same packaged popup origin and entry; query the current active fixture tab.
 const status=()=>popup.evaluate(async()=>{const {readActiveLocalStatus}=await import(chrome.runtime.getURL('src/host/local-status.mjs'));return readActiveLocalStatus({tabs:chrome.tabs});});
 report.results.ready=await status();assert.equal(report.results.ready,'ready');
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
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await context?.close();await server.close();await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,results:report.results,error:report.error,report:join(dir,'report.json')}));}
