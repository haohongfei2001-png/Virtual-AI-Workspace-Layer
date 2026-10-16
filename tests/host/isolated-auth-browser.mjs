import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
const paths=['tests/host/isolated-auth-browser.mjs','tests/host/fixtures/server.mjs'];
const evidenceHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const server=await createHostFixtureServer({journey:'J3'}),dir=await mkdtemp('/private/tmp/vaiwl-isolated-auth-');
const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});
const build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
const report={evidence:'REAL_HEADLESS_MV3_OFFLINE_ISOLATED_AUTH',status:'NOT_RUN',realAccount:'NOT_RUN',firstPartyServiceWorker:'NOT_VERIFIED',sourceHashes:build.sourceHashes,evidenceHashes,checks:{workerAuthAborted:0,pageAuthContinued:0,pageAccountsContinued:0}};
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
