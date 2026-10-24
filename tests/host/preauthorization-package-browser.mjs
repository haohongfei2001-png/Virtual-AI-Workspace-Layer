/** Actual isolated MV3, offline fixture. Instrumentation retains enum/counts only. */
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
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const upstream=await createHostFixtureServer();let sessionReads=0,accountsReads=0,release,blocked=true,context,guard;
const held=new Promise(resolve=>{release=resolve;});
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/auth/session'){
  sessionReads++;
  if(blocked){await held;res.writeHead(403,{'content-type':'text/html','cf-mitigated':'challenge'});res.end('offline challenge');return;}
 }
 if(req.url.startsWith('/backend-api/accounts/'))accountsReads++;
 const r=http.request(upstream.origin+req.url,{method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});r.on('error',()=>{res.writeHead(502);res.end();});req.pipe(r);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,dir=await mkdtemp(join(tmpdir(),'vaiwl-preauth-')),built=packageHost(join(dir,'package'),{offlineOrigin:origin});
const info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8')),entryPath=join(built.unpacked,'extension/content-entry.mjs'),original=await readFile(entryPath,'utf8');
verifyHost(built.unpacked);
// Same adapter/session source. Expose only the instance inside the extension's
// isolated world; no MAIN bridge or altered response, timing, scope or permission.
const anchor='adapterFactory:options=>createChatGPTAdapter({...options,profile})';assert.equal(original.split(anchor).length,2);
assert.equal(original.split('void session.start();').length,2);
const instrumented=original.replace(anchor,'adapterFactory:options=>{const adapter=createChatGPTAdapter({...options,profile});globalThis.__preauthAdapter=adapter;return adapter;}').replace('void session.start();','globalThis.__preauthLocalStatus=()=>session.localStatus();void session.start();');
await writeFile(entryPath,instrumented);
const scriptHash=hash(await readFile(new URL(import.meta.url))),started=performance.now(),report={kind:'OFFLINE_INSTRUMENTED_MV3_PREAUTH',status:'NOT_RUN',realChatGPT:'NOT_RUN',scriptHash,sourceHashes:info.sourceHashes,instrumentation:{path:'extension/content-entry.mjs',original:hash(original),instrumented:hash(instrumented)},stages:[]};
try{
 guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 const browserCDP=await context.browser().newBrowserCDPSession(),{id}=await browserCDP.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');await worker.evaluate(()=>true);
 const page=await context.newPage(),cdp=await context.newCDPSession(page),worlds=new Set();
 cdp.on('Runtime.executionContextCreated',({context:c})=>{if(c.origin===`chrome-extension://${id}`||c.name===id)worlds.add(c.id);});
 cdp.on('Runtime.executionContextDestroyed',({executionContextId})=>worlds.delete(executionContextId));await cdp.send('Runtime.enable');
 const status=async()=>{for(const contextId of worlds){try{const r=await cdp.send('Runtime.evaluate',{contextId,expression:'globalThis.__preauthAdapter?({...globalThis.__preauthAdapter.observationStatus(),localStatus:globalThis.__preauthLocalStatus?.()}):null',returnByValue:true});if(r.result?.value)return r.result.value;}catch{}}return null;};
 const wait=async(predicate,ms=6000)=>{const deadline=performance.now()+ms;while(performance.now()<deadline){const value=await predicate();if(value)return value;await new Promise(r=>setTimeout(r,25));}throw Error('preauth-observation-deadline');};
 await page.goto(origin+'/c/33333333-3333-4333-8333-333333333333');
 const first=await wait(async()=>{const s=await status();return s?.state==='observing'&&s.candidates>0?s:null;});
 assert(first.bytes<=65536);assert(first.candidates+first.messageIds<=256);assert.equal(accountsReads,0);assert.equal(await page.locator('iframe[src^="chrome-extension://"]').count(),0);
 report.stages.push({name:'current-page-observed-while-session-unresolved',...first,elapsedMs:performance.now()-started});
 await page.locator('textarea').fill('PREAUTH_UNSENT_DRAFT');release();
 await wait(async()=>(await status())?.localStatus==='verification-required');
 // The held response rejects identity; this does not retire the document observer.
 assert.equal((await status()).state,'observing');assert.equal(sessionReads,1);assert.equal(accountsReads,0);
 await page.locator('aside nav a').last().evaluate(node=>node.remove());
 const updated=await wait(async()=>{const s=await status();return s?.state==='observing'&&s.candidates<first.candidates?s:null;});
 report.stages.push({name:'after-denial-current-surface-change-observed',...updated,elapsedMs:performance.now()-started});
 assert.equal(await page.locator('textarea').inputValue(),'PREAUTH_UNSENT_DRAFT');
 // Wait for the original twenty-second document lifetime, no renewal or retry.
 await wait(async()=>{const s=await status();return s?.state==='stopped'&&s.bytes===0;},21000);
 assert.equal(sessionReads,1);assert.equal(accountsReads,0);assert.equal(await page.locator('iframe[src^="chrome-extension://"]').count(),0);
 report.stages.push({name:'original-expiry-clears-ram-without-auth-retry',elapsedMs:performance.now()-started});
 assert.equal(await page.locator('textarea').inputValue(),'PREAUTH_UNSENT_DRAFT');
 // Fresh document + successful first-party fixture response uses the existing
 // authorization path and full UI; no preauth candidates are promoted.
 blocked=false;await page.reload();
 const workspace=await wait(async()=>{const frame=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);return frame&&await page.locator('iframe[src^="chrome-extension://"]').count()===2?frame:null;},15000);
 const back=page.getByRole('button',{name:'返回工作空间',exact:true});if(await back.isVisible())await back.click();
 await workspace.getByRole('link',{name:'Ordinary conversation',exact:true}).first().waitFor({timeout:15000});
 assert.equal((await status()).bytes,0);assert(accountsReads>=1);
 report.stages.push({name:'fresh-authorized-document-enters-existing-free-ui',elapsedMs:performance.now()-started});
 for(const [path,expected]of Object.entries(info.files))assert.equal(hash(await readFile(join(built.unpacked,path))),path==='extension/content-entry.mjs'?hash(instrumented):expected);
 for(const [path,expected]of Object.entries(info.sourceHashes))assert.equal(hash(await readFile(path)),expected);
 assert.equal(hash(await readFile(new URL(import.meta.url))),scriptHash);
 report.status='PASS';report.sourceChangedDuringRun=false;
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{release();report.elapsedMs=performance.now()-started;report.requestCounts={sessionReads,accountsReads};await context?.close();await guard?.close();report.networkGuard=guard?.snapshot();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await upstream.close();await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,stages:report.stages,error:report.error,dir}));}
