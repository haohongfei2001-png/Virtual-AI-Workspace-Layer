import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
const paths=['tests/host/isolated-calibration-browser.mjs','tests/host/fixtures/server.mjs'];
const evidenceHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const server=await createHostFixtureServer({journey:'J3'}),dir=await mkdtemp('/private/tmp/vaiwl-isolated-calibration-');
const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineHistory:true}),build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
const report={status:'NOT_RUN',evidence:'REAL_HEADLESS_PACKAGED_MV3_OFFLINE_ISOLATED_SUBJECT_WORKER_CALIBRATION',realChatGPT:'NOT_RUN',firstPartyServiceWorker:'NOT_VERIFIED',G:'NOT_VERIFIED',sourceHashes:build.sourceHashes,evidenceHashes,checks:{},network:{blockedWorkerSession:0,isolatedSession:0,isolatedAccounts:0,workerSession:0,workerAccounts:0,workerDetail:0}};
let handle,phase='launch',blockWorker=true;
async function facts(realm){return realm.evaluate(async()=>{
 const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
 const scope={verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),organizationId:'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-personal'])},base=new ScopeRepository({indexedDB});
 try{const evidence=await new FreeEvidenceRepository({baseRepository:base}).read(scope),db=await base.open(),stores=[...db.objectStoreNames],counts={};let observedSendOrACKRows=0;
 await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readonly');for(const name of stores){counts[name]=0;const request=tx.objectStore(name).openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){counts[name]++;if(/observed-self-send|ackWitness/.test(JSON.stringify(cursor.value)))observedSendOrACKRows++;cursor.continue();}};}tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error('raw-table-scan'));});
 return {stores,counts,observedSendOrACKRows,events:Object.values(evidence.events).map(event=>({conversationId:event.conversationId,messageId:event.messageId,actorVerified:event.actorVerified,kind:event.kind,sendState:event.sendState,precision:event.precision,sentAt:event.sentAt,revoked:event.revoked??false,source:evidence.sources[event.sourceId]})),hintCount:Object.keys(evidence.hints).length};
 }finally{base.close();}
});}
try{
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
 const {context,browser}=handle;
 await context.route('**/*',route=>{const request=route.request(),url=request.url(),worker=!!request.serviceWorker();
  if(url===server.origin+'/api/auth/session'){if(worker&&blockWorker){report.network.blockedWorkerSession++;return route.abort('failed');}report.network[worker?'workerSession':'isolatedSession']++;}
  if(url===server.origin+'/backend-api/accounts/check/v4-2023-04-27')report.network[worker?'workerAccounts':'isolatedAccounts']++;
  if(worker&&url===server.origin+'/backend-api/conversation/33333333-3333-4333-8333-333333333333')report.network.workerDetail++;
  return url.startsWith(server.origin+'/')||url.startsWith('chrome-extension://')?route.continue():route.abort();
 });
 const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const page=await context.newPage();await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');
 phase='isolated-subject-native-mount';await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000});
 const workspace=page.frames().find(frame=>frame.url()===`chrome-extension://${id}/workspace.html`);assert(workspace);await workspace.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:20000});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`));assert(worker);
 assert(report.network.blockedWorkerSession>0);assert(report.network.isolatedSession>0);assert(report.network.isolatedAccounts>0);
 report.checks.isolatedNativeMount=true;
 await workspace.evaluate(()=>{globalThis.calibrationAudit={started:0,finished:0,checked:0,unavailable:0,rejected:0};const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){const calibration=args[0]?.type==='HOST_UI_CALIBRATION_ENTRY';if(calibration)calibrationAudit.started++;const result=original(...args);if(calibration&&result?.then)result.then(reply=>{calibrationAudit.finished++;if(reply?.ok===true&&reply.state==='checked-current')calibrationAudit.checked++;if(reply?.ok===false&&reply.state==='unavailable')calibrationAudit.unavailable++;},()=>{calibrationAudit.finished++;calibrationAudit.rejected++;});return result;};});
 const draft='ISOLATED_CALIBRATION_UNSENT_DRAFT';
 const enter=async()=>{await page.locator('textarea').fill(draft);const back=page.getByRole('button',{name:'返回工作空间',exact:true});assert.equal(await back.count(),1);await back.click();};
 phase='blocked-worker-calibration';await enter();await workspace.waitForFunction(()=>calibrationAudit.started===1&&calibrationAudit.finished===1&&calibrationAudit.unavailable===1,null,{timeout:10000});
 assert.equal(await page.locator('textarea').evaluate((node,value)=>node.value===value,draft),true);
 const before=await facts(workspace);assert.equal(before.events.length,0);assert.equal(before.hintCount,0);assert.equal(before.observedSendOrACKRows,0);report.checks.blockedWorkerUnavailablePreservesNative=true;
 const networkBefore={...report.network};blockWorker=false;
 phase='explicit-worker-reauthentication';await enter();await workspace.waitForFunction(()=>calibrationAudit.started===2&&calibrationAudit.finished===2&&calibrationAudit.checked===1&&calibrationAudit.unavailable===1&&calibrationAudit.rejected===0,null,{timeout:10000});
 report.checks.calibration=await workspace.evaluate(()=>({...calibrationAudit}));
 for(const key of ['workerSession','workerAccounts','workerDetail'])assert(report.network[key]>networkBefore[key]);
 report.checks.workerReauthenticated={session:report.network.workerSession-networkBefore.workerSession,accounts:report.network.workerAccounts-networkBefore.workerAccounts,detail:report.network.workerDetail-networkBefore.workerDetail};
 phase='persisted-history-without-ACK';const after=await facts(workspace);assert.deepEqual(after.stores.sort(),['refs','operations','b23_states','b23_operations','b23_checkpoints','b23_views','native_states','native_operations'].sort());assert(Object.values(after.counts).reduce((a,b)=>a+b,0)>0);assert.equal(after.events.length,1);assert.equal(after.hintCount,0);assert.equal(after.observedSendOrACKRows,0);
 const event=after.events[0];assert.equal(event.conversationId,'33333333-3333-4333-8333-333333333333');assert.equal(event.messageId,'j3_33333333333343338333333333333333_message');assert.equal(event.actorVerified,true);assert.equal(event.kind,'new-send');assert.equal(event.sendState,'committed');assert.equal(event.precision,'second');assert.equal(event.revoked,false);assert.equal(event.source.codecVersion,2);assert.equal(event.source.channel,'host-evidence');assert.equal(event.source.profileId,'offline-original-send-v1');assert.equal(event.source.profileVersion,1);assert(Date.now()-Date.parse(event.sentAt)>44*86400000&&Date.now()-Date.parse(event.sentAt)<46*86400000);
 report.checks.persisted=after;assert.equal(await page.locator('textarea').evaluate((node,value)=>node.value===value,draft),true);assert.equal(server.snapshot().actions['send-intent']??0,0);report.checks.noNativeSend=true;
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.failedPhase=phase;report.errorClass=/^[A-Za-z]+Error$/.test(error?.name)?error.name:'Error';const line=/isolated-calibration-browser\.mjs:(\d+):(\d+)/.exec(error?.stack??'');if(line)report.failureLocation={line:Number(line[1]),column:Number(line[2])};process.exitCode=1;}
finally{
 report.cleanup=(await Promise.allSettled([handle?.close(),server.close(),guard.close()])).map(value=>value.status);
 report.sourceChangedDuringRun=(await Promise.all(Object.entries({...build.sourceHashes,...evidenceHashes}).map(async([path,hash])=>createHash('sha256').update(await readFile(path)).digest('hex')!==hash))).some(Boolean);
 if(report.sourceChangedDuringRun||report.cleanup.includes('rejected')){report.originalFailedPhase=report.failedPhase??null;report.status='FAIL';report.failedPhase='source-or-cleanup';process.exitCode=1;}
 report.networkGuard=guard.snapshot();await writeFile(process.argv[2]??'/private/tmp/free-isolated-calibration.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,phase:report.failedPhase}));
