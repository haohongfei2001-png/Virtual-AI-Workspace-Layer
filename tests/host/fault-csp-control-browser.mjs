/** On-demand no-policy positive control, separate fresh fixture/profile; never edits a CSP header. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir,platform} from 'node:os';import {join} from 'node:path';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {cspObservationScript,observeAuthenticatedCsp} from './fault-csp-observer.mjs';
import {assertAuthenticatedCspProof} from './fault-csp-contract.mjs';
export async function runCspPositiveControl({chromium,sourceHashes,until,expectedRoles,sidebarCoverage}){
 let server,guard,dir,handle;const result={status:'NOT_RUN',sameSource:false,cleanupOK:false};
 try{
  server=await createHostFixtureServer({profile:'FAULT',fault:'forged-scope'});guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});dir=await mkdtemp(join(tmpdir(),'vaiwl-csp-control-'));
  const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));assert.deepEqual(info.sourceHashes,sourceHashes);result.sameSource=true;
  handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
  const {context,browser}=handle;context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(15000);
  await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());await context.addInitScript({content:cspObservationScript()});
  const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
  const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith(`chrome-extension://${id}/`),timeout:15000});
  const page=await context.newPage();const response=await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');assert.equal(response.headers()['content-security-policy'],undefined);
  const {proof}=await observeAuthenticatedCsp({page,context,worker,extensionId:id,until,expectedRoles,sidebarCoverage});assertAuthenticatedCspProof(proof);result.expectedRoles=proof.expectedRoles;result.sidebarCoverage=proof.sidebarCoverage;assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');result.status='PASS_AUTHENTICATED_NO_CSP_CONTROL';
 }catch(error){result.status='FAIL';result.error=String(error.message);}
 finally{const cleanup=await Promise.allSettled([handle?.close(),server?.close(),guard?.close()]);result.cleanupOK=cleanup.every(r=>r.status==='fulfilled');if(dir)try{await rm(dir,{recursive:true,force:true});}catch{result.cleanupOK=false;}if(!result.cleanupOK)result.status='FAIL';}
 return result;
}
