/** Child process: actual packaged MV3 / actual IndexedDB. No fake browser events. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir,platform} from 'node:os';import {createHash} from 'node:crypto';
import {chromium} from '../../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from '../fixtures/server.mjs';
import {packageHost,verifyHost} from '../../../extension/package.mjs';
import {runDatabaseCut} from './browser-transaction.mjs';
const [id,output]=process.argv.slice(2),hash=b=>createHash('sha256').update(b).digest('hex');
const report={id,status:'NOT_RUN',phase:'setup',sourceCommit:process.env.FREE_SOURCE_COMMIT??null,G:'NOT_RUN',U:'NOT_RUN',release:'NOT_RELEASE_READY'};
let context,server,dir;
try{
 server=await createHostFixtureServer();dir=await mkdtemp(join(tmpdir(),'vaiwl-guard-probe-'));
 const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),bytes=await readFile(join(built.unpacked,'build-manifest.json')),manifest=JSON.parse(bytes);
 report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=hash(bytes);report.packageStatus=verifyHost(built.unpacked).status;
 report.phase='browser-start';context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const observations=[];await context.exposeBinding('guardClickObservation',(_,value)=>observations.push(value));
 await context.addInitScript(()=>{globalThis.guardSurfaceOpens=[];document.addEventListener('beforetoggle',e=>{if(e.newState==='open'&&e.target.hasAttribute?.('data-va-owned'))guardSurfaceOpens.push(e.target.id);},true);if(location.protocol==='chrome-extension:')document.addEventListener('click',e=>{const a=e.composedPath().find(n=>n?.matches?.('a[data-ref-id]'));if(a)globalThis.guardClickObservation({ref:a.getAttribute('data-ref-id'),prevented:e.defaultPrevented,trusted:e.isTrusted});});});
 const cdp=await context.browser().newBrowserCDPSession(),{id:extensionId}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+extensionId))??await context.waitForEvent('serviceworker');
 report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert.equal(report.workerNetworkBlocked,true,'worker network precondition');report.browser=context.browser().version();
 if(id==='postcommit-window'){
  report.phase='database-cut';const result=await runDatabaseCut(context,extensionId,server.origin);report.observation=result;
  report.phase='target';assert.equal(result.nativeCommitted,true,'native commit must actually be durable');assert.equal(result.pendingAfterClose,1,'SYS-01 committed native must retain atomic pending continuation after writer page closes');report.evidence='D_REAL_INDEXEDDB_TEST_AUTHORITY';
 }else{
  report.phase='host-ready';const page=await context.newPage();await page.goto(server.origin+'/');
  await page.waitForFunction(()=>new Set(globalThis.guardSurfaceOpens).size>=2,null,{timeout:20000});
  if(id==='auto-popover'){
   // Do not wait for two OPEN popovers: that is exactly the mutated property.
   await page.waitForTimeout(300);report.observation=await page.evaluate(()=>({open:[...document.querySelectorAll('[data-va-owned]:popover-open')].map(n=>n.id),surfaces:document.querySelectorAll('[data-va-owned] iframe').length}));
   report.phase='target';assert.equal(report.observation.open.length,2,'UI-08 browser must keep both independently opened surfaces');
  }else{
   await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
   const frame=page.frames().find(f=>f.url()===`chrome-extension://${extensionId}/workspace.html`);assert(frame,'workspace frame precondition');
   if(id==='background-mask'){
    // Native history link existed in the fixture before content script execution.
    report.observation=await page.evaluate(()=>{const n=document.querySelector('nav[aria-label="Chat history"] a');n.focus();return {focused:document.activeElement===n,visibility:getComputedStyle(n).visibility,interactivity:getComputedStyle(n).interactivity,nativeInert:n.closest('[inert]')!==null};});
    report.phase='target';assert.equal(report.observation.focused,false,'UI-06 native history must not accept focus behind open workspace/sidebar');assert.equal(report.observation.nativeInert,false,'no HTML inert mutation');
   }else if(id==='async-default'){
    const link=frame.getByRole('link',{name:'Ordinary conversation',exact:true}).first();await link.waitFor();await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForTimeout(200);
    await link.click();const until=Date.now()+5000;while(!observations.length&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
    if(!observations.length)throw Error('missing-browser-click-observation');report.observation=observations;
    report.phase='target';assert.equal(observations[0].trusted,true,'trusted browser click');assert.equal(observations[0].prevented,true,'UI-01 delegated native-control click must synchronously cancel default before document bubbling');
   }else throw Error('unknown-case');
  }
  report.evidence='S_REAL_PACKAGED_MV3_OFFLINE';
 }
 report.status='PASS';
}catch(error){report.status=report.phase==='target'&&error.code==='ERR_ASSERTION'?'TARGET_ASSERTION_FAILURE':'INFRASTRUCTURE_OR_PRECONDITION_FAILURE';report.error={code:error.code,message:error.message,stack:error.stack};process.exitCode=1;}
finally{await context?.close();await server?.close();await writeFile(output,JSON.stringify(report,null,2)+'\n');if(dir)await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify({id,status:report.status,phase:report.phase}));
