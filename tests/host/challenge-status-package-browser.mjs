import {j2Poll} from './j2-runner-bounds.mjs';
/** Local challenge fixture; never contacts the real provider or solves a challenge. */
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const upstream=await createHostFixtureServer({profile:'MODERN'});let sessionReads=0,accountsReads=0,context,guard;
const server=http.createServer((req,res)=>{
 if(req.url==='/api/auth/session'){sessionReads++;res.writeHead(403,{'content-type':'text/html','cf-mitigated':'challenge','cache-control':'no-store'});res.end('<p>OFFLINE_CHALLENGE_BODY_NOT_FOR_UI</p>');return;}
 if(req.url.startsWith('/backend-api/accounts/'))accountsReads++;
 const r=http.request(upstream.origin+req.url,{method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});r.on('error',()=>{res.writeHead(502);res.end();});req.pipe(r);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,dir=await mkdtemp(join(tmpdir(),'vaiwl-challenge-status-')),built=packageHost(join(dir,'package'),{offlineOrigin:origin,offlineContext:true}),info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const started=performance.now();
const report={startup:'WORKER_READY_PRECONDITION',profile:'MODERN_C2_CONVERSATION',kind:'OFFLINE_MV3_CHALLENGE_STATUS',status:'NOT_RUN',realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',sourceHashes:info.sourceHashes,results:{},observedStates:[],pageErrors:[]};
try{
 guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');await worker.evaluate(()=>true);
 const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(origin+'/c/33333333-3333-4333-8333-333333333333');
 const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/status.html`);await page.bringToFront();
 assert.equal(await j2Poll(()=>popup.evaluate(async()=>{const {readActiveLocalStatus}=await import(chrome.runtime.getURL('src/host/local-status.mjs'));return await readActiveLocalStatus({tabs:chrome.tabs});}).then(state=>{if(report.observedStates.at(-1)!==state)report.observedStates.push(state);return state==='verification-required';}),10000),true);
 await popup.waitForFunction(()=>document.getElementById('status')?.textContent!=='正在读取本地状态…',null,{timeout:10000});
 await popup.evaluate(()=>import(chrome.runtime.getURL('extension/status.mjs')+'?challenge'));
 const text=await popup.locator('#status').textContent();assert.match(text,/服务端.*验证/);assert(!text.includes('OFFLINE_CHALLENGE_BODY'));assert.equal(await popup.locator('button').count(),0);
 assert.equal(await page.locator('iframe[src^="chrome-extension://"]').count(),0);await page.locator('textarea').fill('CHALLENGE_UNSENT_DRAFT');
 const before=sessionReads;assert.equal(before,1);assert.equal(accountsReads,0);
 for(let i=0;i<3;i++)await popup.evaluate(()=>import(chrome.runtime.getURL('extension/status.mjs')+'?snapshot='+Math.random()));
 assert.equal(sessionReads,before);assert.equal(accountsReads,0);assert.equal(await page.locator('textarea').inputValue(),'CHALLENGE_UNSENT_DRAFT');
 await page.goto('about:blank');assert.equal(await popup.evaluate(async()=>{const {readActiveLocalStatus}=await import(chrome.runtime.getURL('src/host/local-status.mjs'));return readActiveLocalStatus({tabs:chrome.tabs});}),'unavailable');
 assert.deepEqual(report.pageErrors,[]);assert.equal(upstream.snapshot().requests['/backend-api/conversation/33333333-3333-4333-8333-333333333333'],1);
 verifyHost(built.unpacked);for(const [p,h]of Object.entries(info.sourceHashes))assert.equal(createHash('sha256').update(await readFile(p)).digest('hex'),h);
 report.results={exactChallengeMessage:true,noGrantedFrames:true,nativeDraftPreserved:true,sessionReads,accountsReads,passiveSnapshotsNoRetry:true,unrelatedPageUnavailable:true};report.sourceChangedDuringRun=false;report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{report.elapsedMs=performance.now()-started;report.requestCounts={sessionReads,accountsReads};report.fixtureRequests=upstream.snapshot().requests;await context?.close();await guard?.close();report.networkGuard=guard?.snapshot();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await upstream.close();await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,results:report.results,error:report.error,dir}));}
