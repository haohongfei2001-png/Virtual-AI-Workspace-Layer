import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createColdTracePackage,verifyColdTracePackage} from './cold-context-trace.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {modernExpectedWorld} from './expected/modern.mjs';

// Explicit modified native fixture: application metadata arrives after its real
// detail GET. No extension messages, authorization, or network responses seeded.
const C='33333333-3333-4333-8333-333333333333',delayMs=2500;
const hash=v=>createHash('sha256').update(v).digest('hex');
const script=new URL(import.meta.url),scriptHash=hash(await readFile(script));
const nativeURL=new URL('./fixtures/native.mjs',import.meta.url),native=await readFile(nativeURL,'utf8');
const anchor='if(view.conversationId)reading.dataset.conversationId=view.conversationId;else delete reading.dataset.conversationId;';
assert.equal(native.split(anchor).length,2);
const modified=native.replace(anchor,`delete reading.dataset.conversationId;
  if(view.conversationId){
    const expectedPath=location.pathname,id=view.conversationId;
    globalThis.__delayedBodyFixture=[{stage:'scheduled',at:Date.now()}];
    setTimeout(()=>{if(reading.isConnected&&location.pathname===expectedPath){
      reading.dataset.conversationId=id;
      globalThis.__delayedBodyFixture.push({stage:'installed',at:Date.now()});
    }},${delayMs});
  }`);
const server=await createVariantHostFixtureServer({profile:'MODERN'});
const dir=await mkdtemp(join(tmpdir(),'vaiwl-c2-delayed-body-'));
const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true});
const info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const report={evidence:'REAL_HEADLESS_INSTRUMENTED_PACKAGE_COPY_MODIFIED_NATIVE_FIXTURE',startupMode:'WORKER_READY_PRECONDITION',scenario:'EXPLICIT_DELAYED_BODY_METADATA',knownColdMissingRequestFix:'NOT_CLAIMED',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',scriptHash,sourceHashes:info.sourceHashes,fixture:{...server.manifest,override:{path:'/native.mjs',delayMs,originalSha256:hash(native),modifiedSha256:hash(modified)}},errors:[]};
let running,guard,page,worker,trace,overrides=0;
try{
 report.package= built;report.originalPackageVerification=verifyHost(built.unpacked);
 trace=await createColdTracePackage(built.unpacked,join(dir,'trace-package'));report.instrumentation=trace;
 guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 running=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
 const {context,browser}=running;report.browser=running.diagnostic;report.browserVersion=browser.version();
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url===server.origin+'/native.mjs'){overrides++;await route.fulfill({status:200,contentType:'text/javascript',body:modified});}
  else if(url.startsWith(server.origin+'/')||url.startsWith('chrome-extension://'))await route.continue();
  else await route.abort();
 });
 const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:trace.unpacked});
 worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');
 await worker.evaluate(async()=>{const end=Date.now()+5000;while(!globalThis.__vaiwlColdTrace?.some(r=>r.stage==='listeners-registered')){if(Date.now()>=end)throw Error('worker-listeners-not-ready');await new Promise(r=>setTimeout(r,20));}});
 report.workerReady=await worker.evaluate(()=>globalThis.__vaiwlColdTrace.find(r=>r.stage==='listeners-registered'));
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(server.origin+'/c/'+C);
 try{await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});report.projection='MOUNTED';}
 catch(error){if(error.name!=='TimeoutError')throw error;report.projection='TIMEOUT';}
 report.trace=await worker.evaluate(()=>globalThis.__vaiwlColdTrace);
 report.native=server.snapshot();
 report.page=await page.evaluate(()=>({url:location.href,bodyId:document.querySelector('#reading')?.dataset.conversationId,events:globalThis.__delayedBodyFixture,owned:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length,state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason}));
 assert.equal(overrides,1);assert.equal(report.page.bodyId,C);assert.equal(report.page.url,server.origin+'/c/'+C);
 const installed=report.page.events.find(e=>e.stage==='installed'),receipt=report.trace.find(e=>e.stage==='receipt-issued'),challenge=report.trace.find(e=>e.stage==='outgoing'&&e.type==='HOST_CONTEXT_ASSOCIATE');
 assert(installed&&receipt&&challenge,'actual receipt, challenge and eventual native metadata required');
 assert(receipt.at<installed.at&&challenge.at<installed.at,'must witness actual association before native metadata');
 assert(report.workerReady.at<receipt.at);assert.equal(report.native.nativeRequests.length,1);assert.deepEqual(report.errors,[]);
 report.timingWitness={receiptAt:receipt.at,challengeAt:challenge.at,bodyInstalledAt:installed.at};
 if(report.projection==='TIMEOUT'){
  const denied=report.trace.find(e=>e.stage==='outgoing-result'&&e.type==='HOST_CONTEXT_ASSOCIATE'&&e.hasResult===false&&e.at<installed.at);
  assert(denied,'one-shot null association must precede body metadata');
  report.status='FAIL';report.failureKind='REPRODUCED_DELAYED_BODY_ONE_SHOT_FAILURE';process.exitCode=1;
 }else{
  const workspace=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(workspace);
  await workspace.getByText(modernExpectedWorld.conversations.find(row=>row.id===C).title,{exact:true}).waitFor({timeout:5000});
  report.status='PASS';
 }
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 if(worker&&!report.trace)try{report.trace=await worker.evaluate(()=>globalThis.__vaiwlColdTrace);}catch{}
 report.fixtureOverrideCount=overrides;report.networkGuard=guard?.snapshot();
 const clean=await cleanupOwnedResources(report,[['browser',()=>running?.close()],['guard',()=>guard?.close()],['trace-integrity',()=>trace&&verifyColdTracePackage(trace)],['package-integrity',()=>verifyHost(built.unpacked)],['fixture',()=>server.close()],['source-integrity',async()=>{
  report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);
  report.scriptChangedDuringRun=hash(await readFile(script))!==scriptHash;
  report.fixtureChangedDuringRun=hash(await readFile(nativeURL))!==hash(native);
  assert(!report.sourceChangedDuringRun&&!report.scriptChangedDuringRun&&!report.fixtureChangedDuringRun,'source/runtime must remain stable');
 }]]);if(!clean)process.exitCode=1;
 await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,failureKind:report.failureKind,error:report.error,timingWitness:report.timingWitness,sourceChangedDuringRun:report.sourceChangedDuringRun}));
