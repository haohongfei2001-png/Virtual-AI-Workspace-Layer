// Actual packaged MV3, disposable profile, loopback-only anonymous Project.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {PROJECT_WRAPPER_DIAGNOSTIC_BATCH} from '../../src/host/project-wrapper-diagnostic.mjs';
import {MAIN_MOUNT_DIAGNOSTIC_BATCH} from '../../src/host/native-flow-diagnostic.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {materializePartitionedSidebar} from './fixtures/observed-host-replay.mjs';
import partitionDetails from './fixtures/observed-sidebar-project-details-20261026.json' with {type:'json'};
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
const P='g-p-11111111111111111111111111111111',C='33333333-3333-4333-8333-333333333333',requests=[];
const server=createServer((req,res)=>{requests.push(req.url);res.writeHead(200,{'Content-Type':'text/html'});res.end(observedProjectHTML(P,C));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const guard=await createHistoricalNetworkGuard({fixtureOrigin:origin}),dir=await mkdtemp(join(tmpdir(),'vaiwl-project-wrapper-mv3-'));
const built=packageHost(join(dir,'package'),{offlineOrigin:origin,browserLocal:true,projectWrapperDiagnostic:true});verifyHost(built.unpacked);
const report={schema:'project-wrapper-diagnostic-mv3-v1',status:'RUNNING',realChatGPT:'NOT_RUN',liveAuthorization:'NOT_AUTHORIZED',checks:{},package:built,requests};
report.sourceHashes=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8')).sourceHashes;
let context;
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1400,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 report.browser=context.browser().version();const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const page=await context.newPage();
 await page.addInitScript({content:'document.addEventListener("DOMContentLoaded",()=>{('+materializePartitionedSidebar.toString()+')('+JSON.stringify(partitionDetails.sidebarStructure.rows)+');const panel=document.querySelector("[role=tabpanel]"),wrapper=document.createElement("div");wrapper.dataset.fixtureUnseamed="";wrapper.style.cssText="display:flex;flex-direction:column";panel.replaceWith(wrapper);wrapper.append(panel);},{once:true});'});
 await page.goto(origin+'/g/'+P+'/project');
 const control=await context.newPage();await page.bringToFront();await control.goto('chrome-extension://'+id+'/status.html');
 await control.locator('#authorize-project-wrapper').waitFor({state:'attached'});
 const editor=await page.locator('textarea').elementHandle(),draft=await page.locator('textarea').inputValue();
 assert.equal(await page.locator('[data-va-owned]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.dataset.vaiwlStartup??null),null);
 assert.equal(await control.locator('#read-sidebar-structure').count(),0);assert.equal(await control.locator('#history-structure-report').count(),0);
 const before=await control.evaluate(async batch=>(await chrome.storage.local.get(batch))[batch]??null,PROJECT_WRAPPER_DIAGNOSTIC_BATCH);assert.equal(before,null);report.checks.defaultOffWithoutNativeStartup=true;
 // Preserve existing spent fixtures; they cannot authorize the new capability.
 await control.evaluate(async key=>chrome.storage.local.set({[key]:{spent:true},'synthetic-previous-project-permit':{spent:true}}),MAIN_MOUNT_DIAGNOSTIC_BATCH);
 await control.locator('#diagnostic-details summary').click();await control.locator('#authorize-project-wrapper').click();
 await control.waitForFunction(()=>{try{return JSON.parse(document.getElementById('project-wrapper-report').textContent).report;}catch{return false;}},null,{timeout:40000});
 const snapshot=await control.locator('#project-wrapper-report').textContent().then(JSON.parse);report.snapshot=snapshot;
 assert(['COMPLETE','PARTIAL'].includes(snapshot.report.state),JSON.stringify(snapshot.report));assert.equal(snapshot.report.reason,'native-flow-wrapper-paint');assert.equal(snapshot.report.detail,'wrapper-seam');assert.equal(snapshot.report.phase,'walk');assert(snapshot.report.nodes.length<=3);
 assert.equal(await control.locator('#authorize-project-wrapper').isDisabled(),true);report.checks.firstFormalWrapperRefusal=true;
 const current=await control.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url),frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});return {tabId:tab.id,documentId:frame.documentId,url:frame.url};},page.url());
 const read=()=>control.evaluate(async target=>chrome.tabs.sendMessage(target.tabId,{v:1,type:'HOST_PROJECT_WRAPPER_DIAGNOSTIC',action:'report'},{documentId:target.documentId}),current);
 assert.deepEqual((await read()).report,snapshot.report);assert.deepEqual((await read()).report,snapshot.report);report.checks.cachedReadsOnly=true;
 const storage=await control.evaluate(async key=>({current:(await chrome.storage.local.get(key))[key],all:await chrome.storage.local.get(null)}),PROJECT_WRAPPER_DIAGNOSTIC_BATCH);
 assert.deepEqual(storage.current,{spent:true});assert.deepEqual(storage.all[MAIN_MOUNT_DIAGNOSTIC_BATCH],{spent:true});assert.deepEqual(storage.all['synthetic-previous-project-permit'],{spent:true});report.checks.independentPermitConsumed=true;
 assert.equal(await editor.evaluate(node=>node===document.querySelector('textarea')),true);assert.equal(await page.locator('textarea').inputValue(),draft);assert.equal(await page.locator('[data-va-owned]').count(),0);report.checks.nativeDOMAndDraftPreserved=true;
 assert(!JSON.stringify(snapshot).includes('fixture draft'));assert(!JSON.stringify(snapshot).includes('Native Project'));assert(!JSON.stringify(snapshot).includes(P));assert(!JSON.stringify(snapshot).includes(current.documentId));report.checks.strictAnonymousJSON=true;
 const downloadPromise=control.waitForEvent('download');await control.locator('#save-project-wrapper-report').click();const download=await downloadPromise;assert.deepEqual(JSON.parse(await readFile(await download.path(),'utf8')),snapshot);report.checks.actualJSONDownload=true;
 await page.evaluate(()=>{const original=location.href;history.pushState({},'','/');history.pushState({},'',original);});
 assert.equal((await read()).report.state,'INVALIDATED');report.checks.sameDocumentRouteABAInvalidates=true;
 await page.reload();await page.bringToFront();await control.reload();await control.locator('#authorize-project-wrapper').waitFor({state:'attached'});assert.equal(await control.locator('#authorize-project-wrapper').isDisabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.dataset.vaiwlStartup??null),null);report.checks.reloadCannotReplay=true;
 assert(!requests.some(value=>/backend-api|\/api\//.test(value)));report.checks.noPrivateNetwork=true;report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack??error);throw error;}finally{
 await context?.close();await guard.close();await new Promise(resolve=>server.close(resolve));await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,report:join(dir,'report.json')}));
}
