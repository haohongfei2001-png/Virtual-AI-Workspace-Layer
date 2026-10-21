/** Actual untouched package against nine designated fixture faults. NOT full FAULT acceptance. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {faultCases,assertFaultObservation,assertFaultPackageReport} from './fault-package-contract.mjs';
const requestedCases=process.argv[3]?process.argv[3].split(','):faultCases;
assert(requestedCases.length&&new Set(requestedCases).size===requestedCases.length&&requestedCases.every(f=>faultCases.includes(f)),'unknown or repeated fault');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths=['tests/host/fault-package-matrix-browser.mjs','tests/host/fault-package-contract.mjs','tests/host/expected/fault.mjs','tests/host/fixtures/server.mjs','tests/host/fixtures/variants-server.mjs','tests/host/fixtures/variants-native.mjs','tests/host/fixtures/native.mjs','tests/host/fixtures/native.css','tests/host/fixtures/legacy.html','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs'];
const evidenceHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const report={status:'NOT_RUN',evidence:'ACTUAL_PACKAGED_MV3_DESIGNATED_FAULT_OBSERVATIONS',sourceCommit:process.env.GITHUB_SHA??null,realChatGPT:'NOT_RUN',fullFAULT:'NOT_ESTABLISHED',requestedCases,evidenceHashes,limits:['Finite terminal observation is not infinite-time retry proof.','iframe-destroy removes frames before prior JOIN; already-issued grant revocation is a separate gate.','stale-response delays native navigation, which changes route when released; old worker epoch rejection is a separate context-stale-request-package-browser gate.'],results:[]};
const C='33333333-3333-4333-8333-333333333333',U='44444444-4444-4444-8444-444444444444';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(await check())return;await sleep(30);}throw Error('fault-observation-deadline');}
async function database(worker){return worker.evaluate(async()=>{const output={persistedNativeStates:0,forgedScopePersisted:false};for(const row of await indexedDB.databases()){const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(row.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{if(!db.objectStoreNames.contains('native_states'))continue;const records=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});output.persistedNativeStates+=records.length;output.forgedScopePersisted ||= records.some(row=>JSON.stringify(row).includes('attacker-chosen-scope'));}finally{db.close();}}return output;});}
for(const fault of requestedCases){
 const result={fault,status:'NOT_RUN',packagedMV3:false,triggerObserved:false};report.results.push(result);
 let server,guard,handle,dir,build,built,page,phase='setup';
 try{
  server=await createHostFixtureServer({profile:'FAULT',fault});guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});dir=await mkdtemp(join(tmpdir(),'vaiwl-fault-'+fault+'-'));
  built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));result.sourceHashes=build.sourceHashes;result.fixture=server.manifest;
  phase='launch';handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
  const {context,browser}=handle;context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(15000);
  const responses=[],responseTasks=[];context.on('response',response=>{const request=response.request(),url=new URL(response.url());if(url.origin!==server.origin)return;const row={path:url.pathname,status:response.status(),worker:!!request.serviceWorker()};responses.push(row);if(url.pathname==='/backend-api/conversation/'+C&&['corrupt','unknown-protocol'].includes(fault))responseTasks.push(response.json().then(body=>{row.invalidJSON=false;row.unknownSchema=body.protocol==='future-99'&&!body.mapping;},error=>{row.invalidJSON=error?.name==='SyntaxError';row.unknownSchema=false;}));});
  await context.route('**/*',route=>route.request().url().startsWith(server.origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
  await context.addInitScript(()=>{
   globalThis.faultWitness={forgedMessages:0,framePolicyViolations:0,removedOwnedFrames:0};
   addEventListener('message',e=>{if(e.source===window&&e.origin===location.origin&&e.data?.type==='HOST_SCOPE'&&e.data.scopeKey==='attacker-chosen-scope')faultWitness.forgedMessages++;});
   addEventListener('securitypolicyviolation',e=>{if(e.effectiveDirective==='frame-src')faultWitness.framePolicyViolations++;});
   new MutationObserver(records=>{for(const record of records)for(const n of record.removedNodes)if(n.nodeType===1)faultWitness.removedOwnedFrames+=(n.matches('iframe[title="工作空间"],iframe[title="侧边栏"]')?1:0)+n.querySelectorAll('iframe[title="工作空间"],iframe[title="侧边栏"]').length;}).observe(document,{subtree:true,childList:true});
  });
  const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith('chrome-extension://'+id+'/'),timeout:15000});
  result.packagedMV3=await worker.evaluate(()=>typeof chrome.runtime.id==='string');
  // The disposable reject proxy has no forwarder, including for service workers.
  result.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.invalid/',{signal:AbortSignal.timeout(1500)});return false;}catch{return true;}});
  page=await context.newPage();phase='native-navigation';await page.goto(server.origin+(fault==='stale-response'?'/':'/c/'+C));
  const frame=()=>page.frames().find(f=>f.url()==='chrome-extension://'+id+'/workspace.html');
  if(fault==='stale-response'){
   await until(()=>frame());await frame().getByRole('link',{name:'Ordinary conversation',exact:true}).first().waitFor();
   const close=page.getByRole('button',{name:'返回原生阅读',exact:true});if(await close.isVisible())await close.click();
   await page.locator('aside').getByRole('link',{name:'Ordinary conversation',exact:true}).click();await until(()=>server.snapshot().pendingResponses===1);result.heldNativeRoute=true;
   await page.locator('aside').getByRole('link',{name:'Membership not loaded',exact:true}).click();await page.waitForURL('**/c/'+U);await until(()=>frame());await frame().getByRole('link',{name:'Membership not loaded',exact:true}).waitFor();result.freshRouteBeforeRelease=true;
   result.releasedResponses=server.releaseStaleResponses();await page.waitForURL('**/c/'+C);await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Ordinary conversation');result.lateNativeRouteReplacedCurrent=true;
   await until(()=>frame());await frame().locator('[aria-current="page"]').filter({hasText:'Ordinary conversation'}).first().waitFor();result.projectionMatchesActualNativeRoute=true;result.oldWorkerEpochRejection='NOT_ESTABLISHED_NATIVE_ROUTE_FIXTURE';result.triggerObserved=true;
  }
  phase='fault-terminal';
  if(['forged-scope','rate-limit','corrupt','unknown-protocol'].includes(fault)){
   await until(()=>frame());await frame().getByRole('link',{name:'Ordinary conversation',exact:true}).first().waitFor();
  }
  if(['rate-limit','corrupt','unknown-protocol'].includes(fault)){
   const workspace=frame();await workspace.evaluate(()=>{globalThis.faultCalibration=[];const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){const result=send(...args);if(args[0]?.type==='HOST_UI_CALIBRATION_ENTRY'&&result?.then)result.then(r=>faultCalibration.push({ok:r?.ok,state:r?.state}),()=>faultCalibration.push({rejected:true}));return result;};});
   const close=page.getByRole('button',{name:'返回原生阅读',exact:true});if(await close.isVisible())await close.click();
   await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await workspace.waitForFunction(()=>faultCalibration.length===1);const terminal=await workspace.evaluate(()=>faultCalibration[0]);assert.equal(terminal.ok,false);result.calibrationTerminal=terminal.state;
   const metadata=responses.filter(r=>r.path==='/backend-api/conversation/'+C);result.nativeMetadataResponses=metadata.filter(r=>!r.worker).length;result.workerMetadataResponses=metadata.filter(r=>r.worker).length;
   result.metadataStatus=fault==='rate-limit'?429:200;assert(metadata.every(r=>r.status===result.metadataStatus));
   // Classify observed responses only; do not issue another metadata request.
   await Promise.all(responseTasks);const workerRows=metadata.filter(r=>r.worker);
   if(fault==='corrupt')result.invalidJSON=workerRows.length>0&&workerRows.every(r=>r.invalidJSON===true);
   if(fault==='unknown-protocol')result.unknownSchema=workerRows.length>0&&workerRows.every(r=>r.unknownSchema===true);
   result.triggerObserved=true;
  }
  if(fault==='auth-failure'){await until(()=>responses.some(r=>r.path==='/api/auth/session'&&r.status===401));result.session401=responses.filter(r=>r.path==='/api/auth/session'&&r.status===401).length;result.triggerObserved=true;}
  if(fault==='unsafe-reading'){result.composerInsideReading=await page.locator('#reading #composer').count()===1;result.triggerObserved=result.composerInsideReading;}
  if(fault==='csp'){const response=await page.request.get(server.origin+'/');result.frameSourceNone=(response.headers()['content-security-policy']??'').includes("frame-src 'none'");await until(async()=>await page.evaluate(()=>faultWitness.framePolicyViolations>0));result.triggerObserved=true;}
  if(fault==='iframe-destroy'){await until(async()=>await page.evaluate(()=>faultWitness.removedOwnedFrames>0));result.staleGrantRevocation='NOT_ESTABLISHED_NO_PRIOR_JOIN';result.triggerObserved=true;}
  if(fault==='forged-scope'){await until(async()=>await page.evaluate(()=>faultWitness.forgedMessages>0));result.legitimateProjection=true;result.triggerObserved=true;}
  // Unsafe reading must never be rescued by the harness closing a bad mount.
  if(fault==='unsafe-reading'){
   result.unsafeWorkspaceMountedBeforeToggle=await page.locator('iframe[title="工作空间"]').count()>0;
   result.unsafeWorkspaceOpenBeforeToggle=await page.locator('[data-va-owned]:popover-open').count()>0;
   assert.equal(result.unsafeWorkspaceMountedBeforeToggle,false);assert.equal(result.unsafeWorkspaceOpenBeforeToggle,false);
  }
  phase='native-continuity';
  // Return to the native reading surface when a healthy pair is open.
  const nativeReading=page.getByRole('button',{name:'返回原生阅读',exact:true});if(fault!=='unsafe-reading'&&await nativeReading.isVisible())await nativeReading.click();
  await page.locator('textarea').fill('FAULT_OFFLINE_UNSENT_DRAFT');await page.evaluate(()=>{globalThis.faultEditor=document.querySelector('textarea');});
  await page.getByRole('button',{name:'Send',exact:true}).click();await page.locator('#composer output').filter({hasText:'message not sent'}).waitFor();result.nativeSendRetained=true;
  const before=responses.filter(r=>r.worker&&r.path==='/backend-api/conversation/'+C).length,start=Date.now();
  // A bounded post-terminal window, explicitly not an infinite-time guarantee.
  while(Date.now()-start<1000){if(fault==='unsafe-reading'){assert.equal(await page.locator('iframe[title="工作空间"]').count(),0);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);}assert.equal(await page.evaluate(()=>document.querySelector('textarea')===faultEditor&&faultEditor.value==='FAULT_OFFLINE_UNSENT_DRAFT'),true);await sleep(50);}result.observationMs=Date.now()-start;result.nativeEditorRetained=true;
  result.workerRequestsStableAfterTerminal=responses.filter(r=>r.worker&&r.path==='/backend-api/conversation/'+C).length===before;
  result.privateFrames=page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id+'/')&&['workspace.html','sidebar.html'].some(name=>f.url().endsWith('/'+name))).length;
  result.workspaceOpen=await page.locator('[data-va-owned]:popover-open').count()>0;
  result.pageFallbackProjection=await page.evaluate(()=>!!document.querySelector('main [data-free-list],aside [data-free-list]'));
  Object.assign(result,await page.evaluate(()=>faultWitness),await database(worker));
  result.packageVerified=verifyHost(built.unpacked).status==='OFFLINE_HOST_RECONSTRUCTION';result.status='OBSERVED';
 }catch(error){result.status='FAIL';result.phase=phase;result.error=String(error?.message??error);process.exitCode=1;}
 finally{
  const cleanup=await Promise.allSettled([handle?.close(),server?.close(),guard?.close()]);result.cleanupOK=cleanup.every(r=>r.status==='fulfilled');result.guardClosed=guard?.snapshot().closed===true;
  result.sourceChanged=(await Promise.all(Object.entries({...build?.sourceHashes,...evidenceHashes}).map(async([path,digest])=>hash(await readFile(path))!==digest))).some(Boolean);
  if(dir){try{await rm(dir,{recursive:true,force:true});result.temporaryDirectoryRemoved=true;}catch{result.cleanupOK=false;result.temporaryDirectoryRemoved=false;}}
  if(result.status==='OBSERVED'){try{assertFaultObservation(result);result.status='PASS_NARROW_OBSERVATION';}catch(error){result.status='FAIL';result.phase='fixed-oracle';result.error=String(error.message);process.exitCode=1;}}
  if(!result.cleanupOK||result.sourceChanged){result.status='FAIL';result.phase='cleanup-or-source';process.exitCode=1;}
 }
}
report.status=report.results.every(r=>r.status==='PASS_NARROW_OBSERVATION')?'PASS_NARROW_PACKAGED_FAULT_OBSERVATIONS':'FAIL';
if(report.status!=='FAIL')assertFaultPackageReport(report);
await writeFile(process.argv[2]??join(tmpdir(),'free-fault-package.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,fullFAULT:report.fullFAULT,cases:report.results.map(({fault,status,phase})=>({fault,status,phase}))}));
