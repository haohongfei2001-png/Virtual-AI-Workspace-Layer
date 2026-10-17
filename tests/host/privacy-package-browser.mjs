import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {createPrivacyScanner} from './privacy-scan.mjs';
const evidencePaths=['tests/host/privacy-package-browser.mjs','tests/host/privacy-scan.mjs','tests/host/fixtures/server.mjs'];
const evidenceHashes=Object.fromEntries(await Promise.all(evidencePaths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const server=await createHostFixtureServer({journey:'J3'}),dir=await mkdtemp('/private/tmp/vaiwl-privacy-');
const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineHistory:true});
const manifest=JSON.parse(await readFile(join(built.unpacked,'manifest.json'),'utf8'));
const build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const sentinels={...server.privacySentinels(),draft:'PRIVACY_NATIVE_DRAFT_63892'};
const report={evidence:'REAL_HEADLESS_PRODUCTION_PACKAGE_OFFLINE_PRIVACY',status:'NOT_RUN',realAccount:'NOT_RUN',fallbackAuth:'NOT_EXERCISED_BY_THIS_JOURNEY',sys07:'PARTIAL_MAIN_AUTH_METADATA_FAILURE',sourceHashes:build.sourceHashes,evidenceHashes,observationScope:'Post-initial-mount authenticated metadata failure; continuous content world, worker and existing UI frames only',checks:{}};
const guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
let handle,phase='launch',probeHits=0;
const probe=createServer((_req,res)=>{probeHits++;res.end('loopback-probe');});
await new Promise(r=>probe.listen(0,'127.0.0.1',r));
const probeOrigin=`http://127.0.0.1:${probe.address().port}`;
// A passive observer: preserves dispatch arguments, original Promise and authority.
function installObserver(factory,secrets){
 if(globalThis.__privacyAudit)return;
 const messages=factory(secrets),logs=factory(secrets);
 const counts={requests:0,replies:0,pushes:0,console:0,errors:0,calibrationStarted:0,calibrationFinished:0,calibrationUnavailable:0};
 globalThis.__privacyAudit={messages,logs,counts};
 if(globalThis.chrome?.runtime?.sendMessage){const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){counts.requests++;messages.scan(args);const calibration=args[0]?.type==='HOST_UI_CALIBRATION_ENTRY';if(calibration)counts.calibrationStarted++;const result=original(...args);if(result?.then)result.then(reply=>{counts.replies++;messages.scan(reply);if(calibration){counts.calibrationFinished++;if(reply?.ok===false&&reply.state==='unavailable')counts.calibrationUnavailable++;}},error=>{counts.replies++;messages.scan({name:error?.name,message:error?.message});});return result;};chrome.runtime.onMessage.addListener(message=>{counts.pushes++;messages.scan(message);});}
 for(const method of ['log','info','warn','error','debug']){const original=console[method].bind(console);console[method]=function(...args){counts.console++;logs.scan(args);return original(...args);};}
 if(globalThis.addEventListener){addEventListener('error',event=>{counts.errors++;logs.scan({message:event.message,name:event.error?.name,stack:event.error?.stack});});addEventListener('unhandledrejection',event=>{counts.errors++;logs.scan({message:event.reason?.message,stack:event.reason?.stack});});}
}
const installer=`(${installObserver.toString()})((${createPrivacyScanner.toString()}),${JSON.stringify(sentinels)})`;
function evaluateRealm(realm,callback,args){const expression=callback.toString().replace('(0,eval)(`(${source})`)',`(${createPrivacyScanner.toString()})`);return realm.evaluate(`(${expression})(${JSON.stringify(args)})`);}
const clean=result=>{assert(result&&result.values>0);assert.equal(result.unsupported,0);assert.deepEqual(result.hits,{token:0,cookie:0,body:0,draft:0});};
try{
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
 const {context,browser}=handle;
 await context.route('**/*',route=>route.request().url().startsWith(server.origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 // Only extension frames, never the native page, are message/log sinks.
 // Observer installed only into extension realms below; no secrets in native MAIN.
 const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const page=await context.newPage(),nativeLogs=createPrivacyScanner(sentinels),logTasks=[];let consoleIncomplete=false;
 page.on('console',message=>{logTasks.push(Promise.all(message.args().map(arg=>arg.jsonValue())).then(values=>nativeLogs.scan(values),()=>{consoleIncomplete=true;}));});
 page.on('pageerror',error=>nativeLogs.scan({name:error.name,message:error.message,stack:error.stack}));
 await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');
 phase='initial-native-mount';
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000});
 const workspace=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(workspace);
 await workspace.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:20000});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`));assert(worker);
 await worker.evaluate(installer);
 for(const frame of page.frames().filter(f=>f.url().startsWith(`chrome-extension://${id}/`)))await frame.evaluate(installer);
 const session=await context.newCDPSession(page),worlds=[];session.on('Runtime.executionContextCreated',e=>worlds.push(e.context));await session.send('Runtime.enable');
 const contentWorld=worlds.find(w=>w.origin===`chrome-extension://${id}`);assert(contentWorld,'missing-content-observation-world');
 const installed=await session.send('Runtime.evaluate',{contextId:contentWorld.id,expression:installer});assert(!installed.exceptionDetails);
 phase='authenticated-metadata-failure';
 // The existing verified current body is read through a genuine native return.
 // Keep the same UI frames so the exact calibration request/reply is observable.
 await page.locator('textarea').fill(sentinels.draft);
 server.failNextAuthenticatedMetadata();
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
 const until=Date.now()+20000;while(server.privacyFailureStatus().authenticatedFailures===0&&Date.now()<until)await new Promise(r=>setTimeout(r,50));
 assert.deepEqual(server.privacyFailureStatus(),{armed:false,authenticatedFailures:1});
 report.checks.authenticatedFailure={...server.privacyFailureStatus(),authorization:'Fixture consumed failure only after exact session cookie and Bearer validation; known conversation GET'};
 // The terminal unavailable response belongs to the single post-arm calibration.
 await workspace.waitForFunction(()=>__privacyAudit.counts.calibrationStarted===1&&__privacyAudit.counts.calibrationFinished===1&&__privacyAudit.counts.calibrationUnavailable===1,null,{timeout:10000});
 report.checks.failureTerminal={operation:'HOST_UI_CALIBRATION_ENTRY',started:1,finished:1,state:'unavailable'};
 assert.equal(await page.locator('textarea').evaluate((node,draft)=>node.value===draft,sentinels.draft),true);
 report.checks.nativeDraftRetained=true;
 assert.equal(await page.evaluate(()=>document.body.textContent.includes('Offline prefix uniquely selected fixture words suffix.')),true);report.checks.nativeBodyPresent=true;
 phase='raw-idb-scan';
 const scan=await evaluateRealm(worker,async({source,secrets})=>{
  const scanner=(0,eval)(`(${source})`)(secrets),databases=await indexedDB.databases(),out=[];
  for(const item of databases){const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(item.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('idb-open'));});try{const stores=[...db.objectStoreNames],counts={};await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readonly');for(const name of stores){counts[name]=0;const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const cursor=q.result;if(cursor){counts[name]++;scanner.scan({key:cursor.key,value:cursor.value});cursor.continue();}};}tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('idb-scan'));});out.push({stores,counts});}finally{db.close();}}
  return {databases:out,scan:scanner.snapshot()};
 },{source:createPrivacyScanner.toString(),secrets:sentinels});
 assert.equal(scan.databases.length,1);assert.deepEqual(scan.databases[0].stores.sort(),['refs','operations','b23_states','b23_operations','b23_checkpoints','b23_views','native_states','native_operations'].sort());assert(Object.values(scan.databases[0].counts).reduce((a,b)=>a+b,0)>0);clean(scan.scan);report.checks.rawIDB=scan;
 phase='extension-surfaces-and-observer-scan';
 const frames=page.frames().filter(f=>f.url().startsWith(`chrome-extension://${id}/`));assert.equal(frames.length,2);
 report.checks.surfaces=[];
 for(const frame of frames){const surface=await evaluateRealm(frame,({source,secrets})=>{const scanner=(0,eval)(`(${source})`)(secrets);function walk(root){scanner.scan(root.textContent??'');for(const node of root.querySelectorAll('*')){for(const attr of node.attributes)scanner.scan(attr.value);if('value'in node)scanner.scan(node.value);if(node.shadowRoot)walk(node.shadowRoot);}}walk(document);return scanner.snapshot();},{source:createPrivacyScanner.toString(),secrets:sentinels});clean(surface);report.checks.surfaces.push(surface);}
 const observe=()=>globalThis.__privacyAudit?{counts:{...__privacyAudit.counts},messages:__privacyAudit.messages.snapshot(),logs:__privacyAudit.logs.snapshot()}:null;
 const content=await session.send('Runtime.evaluate',{contextId:contentWorld.id,expression:`(${observe.toString()})()`,returnByValue:true});assert(!content.exceptionDetails);
 assert(content.result.value,'continuous-content-observer-lost');const workerObserved=await worker.evaluate(observe);assert(workerObserved,'continuous-worker-observer-lost');
 assert(content.result.value.counts.requests>0);assert(content.result.value.counts.replies>0);
 const uiObserved=await Promise.all(frames.map(f=>f.evaluate(observe)));report.checks.uiMessageCoverage=uiObserved.map(value=>value?'EXISTING_FRAME_OBSERVED':'REPLACED_FRAME_DOM_ONLY_NO_MESSAGE_HISTORY');
 const observations=[content.result.value,workerObserved,...uiObserved.filter(Boolean)];
 assert(observations.reduce((n,o)=>n+o.counts.requests,0)>0);assert(observations.reduce((n,o)=>n+o.counts.replies,0)>0);
 for(const observed of observations)for(const result of [observed.messages,observed.logs]){assert.equal(result.unsupported,0);assert.deepEqual(result.hits,{token:0,cookie:0,body:0,draft:0});}
 await Promise.all(logTasks);assert.equal(consoleIncomplete,false);const nativeLogResult=nativeLogs.snapshot();assert.equal(nativeLogResult.unsupported,0);assert.deepEqual(nativeLogResult.hits,{token:0,cookie:0,body:0,draft:0});report.checks.nativeConsole=nativeLogResult;
 report.checks.observers=observations;
 phase='actual-war-boundary';
 const resources=manifest.web_accessible_resources.flatMap(group=>group.resources);assert(resources.length>2);assert(resources.every(p=>!p.includes('*')&&!p.startsWith('src/runtime/')&&p!=='worker.mjs'&&p!=='extension/worker.mjs'));
 const warRaw=await page.evaluate(async({id,resources})=>{const texts=[],allowed=[];for(const path of resources){const response=await fetch(`chrome-extension://${id}/${path}`);allowed.push(response.ok);texts.push(await response.text());}const denied=[];for(const path of ['worker.mjs','extension/worker.mjs','src/runtime/session-provider.mjs']){try{const response=await fetch(`chrome-extension://${id}/${path}`);denied.push(!response.ok);}catch{denied.push(true);}}return {allowed,denied,texts};},{id,resources});
 const warScanner=createPrivacyScanner(sentinels);warScanner.scan(warRaw.texts);const war={allowed:warRaw.allowed,denied:warRaw.denied,scan:warScanner.snapshot()};warRaw.texts.length=0;
 assert(war.allowed.every(Boolean));assert(war.denied.every(Boolean));clean(war.scan);report.checks.war={allowedCount:war.allowed.length,privateDenied:war.denied,scan:war.scan};
 phase='worker-network-boundary';
 assert(manifest.content_security_policy.extension_pages.includes(`connect-src ${server.origin}`));
 const probeBlocked=await worker.evaluate(async origin=>{try{await fetch(origin+'/privacy-probe');return false;}catch{return true;}},probeOrigin);
 assert.equal(probeBlocked,true);assert.equal(probeHits,0);report.checks.workerNetworkBoundary={blocked:true,secondLoopbackHits:probeHits,attribution:'ISOLATION_BOUNDARY_NOT_INDEPENDENT_CSP_PROOF'};
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.failedPhase=phase;report.errorClass=/^[A-Za-z]+Error$/.test(error?.name)?error.name:'Error';const line=/privacy-package-browser\.mjs:(\d+):(\d+)/.exec(error?.stack??'');if(line)report.failureLocation={line:Number(line[1]),column:Number(line[2])};process.exitCode=1;}
finally{
 const cleanup=await Promise.allSettled([handle?.close(),server.close(),guard.close(),new Promise(r=>probe.close(r))]);report.cleanup=cleanup.map(item=>item.status);if(cleanup.some(item=>item.status==='rejected')){report.status='FAIL';report.failedPhase='cleanup';process.exitCode=1;}
 report.sourceChangedDuringRun=(await Promise.all(Object.entries({...build.sourceHashes,...evidenceHashes}).map(async([path,digest])=>createHash('sha256').update(await readFile(path)).digest('hex')!==digest))).some(Boolean);
 if(report.sourceChangedDuringRun){report.originalFailedPhase=report.failedPhase??null;report.status='FAIL';report.failedPhase='source-changed';process.exitCode=1;}
 report.networkGuard=guard.snapshot();await writeFile(process.argv[2]??'/private/tmp/free-privacy-package.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,failedPhase:report.failedPhase,sys07:report.sys07}));
