import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {digest} from '../../src/data/hash.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
const paths=['tests/host/isolated-auth-browser.mjs',...['server.mjs','variants-server.mjs','variants-native.mjs','native.mjs','legacy.html','native.css'].map(p=>'tests/host/fixtures/'+p)];
const evidenceHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const c2=process.argv[3]==='c2';
const server=c2?await createVariantHostFixtureServer({profile:'MODERN'}):await createHostFixtureServer({journey:'J3'}),dir=await mkdtemp('/private/tmp/vaiwl-isolated-auth-');
const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,...(c2?{offlineContext:true}:{})});
const build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
const report={evidence:'REAL_HEADLESS_MV3_OFFLINE_ISOLATED_AUTH',status:'NOT_RUN',contextProfile:c2?'OFFLINE_C2_SECOND_ROSTER_CONTEXT':'OFFLINE_C3',startup:c2?'WORKER_READY_PRECONDITION':'IMMEDIATE',realAccount:'NOT_RUN',firstPartyServiceWorker:'NOT_VERIFIED',sourceHashes:build.sourceHashes,evidenceHashes,checks:{workerAuthAborted:0,pageAuthContinued:0,pageAccountsContinued:0}};
let handle,phase='launch';
try{
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
 const {context,browser}=handle;
 await context.route('**/*',route=>{
  const request=route.request(),url=request.url();
  if(url===server.origin+'/api/auth/session'){
   if(request.serviceWorker()){report.checks.workerAuthAborted++;return route.abort('failed');}
   report.checks.pageAuthContinued++;
  }
  if(url===server.origin+'/backend-api/accounts/check/v4-2023-04-27'&&!request.serviceWorker())report.checks.pageAccountsContinued++;
  return url.startsWith(server.origin+'/')||url.startsWith('chrome-extension://')?route.continue():route.abort();
 });
 const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 let worker;if(c2){worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');await worker.evaluate(()=>true);}
 const page=await context.newPage();
 await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');
 phase='fallback-native-mount';
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000});
 assert(report.checks.workerAuthAborted>0,'worker primary must genuinely fail transport');
 assert(report.checks.pageAuthContinued>0,'isolated fixed auth must reach network');
 assert(report.checks.pageAccountsContinued>0,'isolated accounts must reach network');
 const workspace=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(workspace);
 await workspace.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:20000});
 report.checks.nativeProjection=true;
 if(c2){
  const scopes=await worker.evaluate(async()=>{const names=await indexedDB.databases();if(names.length!==1)throw Error('unexpected-databases');const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(names[0].name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('open'));});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(Error('scan'));});}finally{db.close();}});
  const expected=JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-team'])]);assert.deepEqual(scopes,[expected]);
  const native=server.snapshot().nativeRequests.filter(r=>r.path==='/backend-api/conversation/33333333-3333-4333-8333-333333333333');assert(native.some(r=>r.context==='account-host-team'));report.checks.secondRosterContextOnly={scopeCount:scopes.length,nativeRequestCount:native.length};
 }
 // The original native editor survives fallback authentication and mounting.
 await page.locator('textarea').fill('isolated auth native draft');
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
 assert.equal(await page.locator('textarea').inputValue(),'isolated auth native draft');
 report.checks.nativeDraftAndReturn=true;
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.failedPhase=phase;report.errorClass=error?.name;report.error=String(error?.message).slice(0,800);process.exitCode=1;}
finally{
 report.cleanup=(await Promise.allSettled([handle?.close(),server.close(),guard.close()])).map(v=>v.status);
 report.sourceChangedDuringRun=(await Promise.all(Object.entries({...build.sourceHashes,...evidenceHashes}).map(async([p,hash])=>createHash('sha256').update(await readFile(p)).digest('hex')!==hash))).some(Boolean);
 if(report.sourceChangedDuringRun||report.cleanup.includes('rejected')){report.status='FAIL';report.failedPhase='source-or-cleanup';process.exitCode=1;}
 report.networkGuard=guard.snapshot();await writeFile(process.argv[2]??'/private/tmp/free-isolated-auth-browser.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,phase:report.failedPhase,checks:report.checks}));
