/** Reproduce empty-srcdoc replacement without a real account or external network. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageHost} from '../../extension/package.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
const C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444',requests=[];
const replace=`<script>new MutationObserver(()=>{for(const f of document.querySelectorAll('iframe'))if(f.src.startsWith('chrome-extension:')&&!f.hasAttribute('srcdoc'))f.setAttribute('srcdoc','');}).observe(document.body,{subtree:true,childList:true});</script>`;
const server=createServer((req,res)=>{requests.push(req.url);res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(observedDesktopHTML(req.url.endsWith(D)?D:C)+(req.url.endsWith(D)?replace:''));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
const dir=await mkdtemp(join(tmpdir(),'vaiwl-frame-integrity-')),built=packageHost(join(dir,'package'),{offlineOrigin:origin,browserLocal:true}),report={status:'RUNNING',scope:'ISOLATED_MV3_SOURCE_REPLACEMENT_ONLY',realMac:'NOT_RUN',checks:{}};
let context;
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1000,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Users/hhf/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession();await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const page=await context.newPage();await page.goto(origin+'/c/'+C);
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:10000});
 const before=await page.evaluate(()=>JSON.parse(document.querySelector('[data-vaiwl-frame-join]').dataset.vaiwlFrameJoin));
 assert.equal(before.modules,2);assert.equal(before.inlineFrames,0);assert.equal(before.granted,2);report.checks.originalFormalFramesJoin=true;
 await page.evaluate(()=>{window.testEditor=document.querySelector('[contenteditable],textarea');window.testDraft=window.testEditor.value??window.testEditor.textContent;document.querySelector('iframe[title="工作空间"]').setAttribute('srcdoc','');});
 await page.waitForFunction(()=>document.documentElement.dataset.vaiwlSurfaceStop==='ui-frame-document-replaced');
 assert.deepEqual(await page.evaluate(()=>({frames:document.querySelectorAll('iframe[title="工作空间"],iframe[title="导航"]').length,masks:document.querySelectorAll('[data-va-mask-workspace],[data-va-mask-sidebar]').length,editorSame:window.testEditor===document.querySelector('[contenteditable],textarea'),draftSame:window.testDraft===(window.testEditor.value??window.testEditor.textContent)})),{frames:0,masks:0,editorSame:true,draftSame:true});
 report.checks.replacementClosesBothAndPreservesNativeDraft=true;
 await page.goto(origin+'/c/'+D);
 await page.waitForFunction(()=>document.documentElement.dataset.vaiwlSurfaceStop==='ui-frame-document-replaced',null,{timeout:10000});
 const rejected=await page.evaluate(()=>JSON.parse(document.documentElement.dataset.vaiwlFrameExit));assert.equal(rejected.granted,0);assert.equal(rejected.inlineFrames,2);report.checks.initialReplacementNeverGrants=true;
 const worker=context.serviceWorkers()[0];assert.deepEqual(await worker.evaluate(()=>indexedDB.databases()),[]);assert(requests.every(p=>!p.startsWith('/api/')&&!p.startsWith('/backend-api/')));report.checks.noPrivateDatabaseOrInternalRequests=true;
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await context?.close();await new Promise(r=>server.close(r));await guard.close();await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({...report,report:join(dir,'report.json')}));
