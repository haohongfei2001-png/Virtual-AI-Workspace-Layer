/** Actual untouched package against nine designated fixture faults. NOT full FAULT acceptance. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createVariantHostFixtureServer as createHostFixtureServer} from './fixtures/variants-server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {faultCases,assertFaultObservation,assertFaultPackageReport} from './fault-package-contract.mjs';
import {cspObservationScript,installCspMountObservation,observeAuthenticatedCsp,scanCspPage,prepareCspNativeClose,exactCspControlMessage} from './fault-csp-observer.mjs';
import {observeFaultMetadataResponse,createFaultMetadataRequestTracker,unknownActionWindowCohort,validUnknownActionWindowCohort} from './fault-metadata-response.mjs';
import {createFaultUnknownTracePackage,verifyFaultUnknownTracePackage,captureFaultUnknownTrace,summarizeFaultUnknownTrace,FAULT_UNKNOWN_TRACE_KIND} from './fault-unknown-trace.mjs';
import {runCspPositiveControl} from './fault-csp-control-browser.mjs';
import {observeFaultBodyStream,BODY_STREAM_KIND} from './fault-body-stream-observer.mjs';
import {installFaultDormancyPrecondition} from './fault-dormancy-precondition.mjs';
const unknownTraceEnabled=process.env.FREE_FAULT_UNKNOWN_TRACE==='1';
const bodyStreamEnabled=process.env.FREE_FAULT_BODY_STREAM==='1';
const requestedCases=process.argv[3]?process.argv[3].split(','):faultCases;
assert(requestedCases.length&&new Set(requestedCases).size===requestedCases.length&&requestedCases.every(f=>faultCases.includes(f)),'unknown or repeated fault');
if(unknownTraceEnabled)assert.deepEqual(requestedCases,['unknown-protocol'],'unknown trace requires the single designated case');
if(bodyStreamEnabled){assert.deepEqual(requestedCases,['unknown-protocol'],'body stream requires the single designated case');assert.equal(unknownTraceEnabled,false,'body stream observes only the unchanged package');}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths=['tests/host/fault-package-matrix-browser.mjs','tests/host/fault-metadata-response.mjs','tests/host/fault-csp-observer.mjs','tests/host/fault-csp-contract.mjs','tests/host/fault-csp-control-browser.mjs','tests/host/disable-states-profile.mjs','tests/host/fault-package-contract.mjs','tests/host/expected/fault.mjs','tests/host/fixtures/server.mjs','tests/host/fixtures/variants-server.mjs','tests/host/fixtures/variants-native.mjs','tests/host/fixtures/native.mjs','tests/host/fixtures/native.css','tests/host/fixtures/legacy.html','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs'];
if(requestedCases.includes('unknown-protocol'))paths.push('tests/host/fault-dormancy-precondition.mjs');
if(unknownTraceEnabled)paths.push('tests/host/fault-unknown-trace.mjs');
if(bodyStreamEnabled)paths.push('tests/host/fault-body-stream-observer.mjs');
const evidenceHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const report={status:'NOT_RUN',evidence:'ACTUAL_PACKAGED_MV3_DESIGNATED_FAULT_OBSERVATIONS',sourceCommit:process.env.GITHUB_SHA??null,realChatGPT:'NOT_RUN',fullFAULT:'NOT_ESTABLISHED',requestedCases,evidenceHashes,limits:['Finite terminal observation is not infinite-time retry proof.','iframe-destroy removes frames before prior JOIN; already-issued grant revocation is a separate gate.','stale-response delays native navigation, which changes route when released; old worker epoch rejection is a separate context-stale-request-package-browser gate.'],results:[]};
if(requestedCases.includes('unknown-protocol'))report.limits.push('Unknown protocol covers only a completed reading-to-dormant-to-wake journey. Rapid return cancellation remains a separate safety contract. This precondition does not establish the cause of earlier aborted responses.');
if(unknownTraceEnabled)Object.assign(report,{evidence:FAULT_UNKNOWN_TRACE_KIND,diagnosticOnly:true,acceptance:'NOT_ESTABLISHED',formalReportSuperseded:false});
if(bodyStreamEnabled){Object.assign(report,{evidence:BODY_STREAM_KIND,diagnosticOnly:true,acceptance:'NOT_ESTABLISHED',formalReportSuperseded:false});report.limits.push('Additional non-intercepting Network session can change timing. Only its own request ID binds stream and cache readback; Playwright correlation is not exact. Network completion is not production reader EOF.');}
if(unknownTraceEnabled)report.limits.push('Copy-only synchronous probes can perturb timing. This collector intentionally reports correlationComplete=false: unique-action order alone is only a candidate. Optional unique synthetic response headers link the actual response across processes but change diagnostic headers and cannot establish causality. Complete capture does not close target GET acceptance or supersede the formal FAIL.');
// This historical fault fixture has no Projects/history common native NAV.
// A missing workspace remains a failure; sidebar CSP coverage is explicitly absent.
const cspScope={expectedRoles:['workspace'],sidebarCoverage:'NOT_RUN_NO_COMMON_NATIVE_NAV'};
const C='33333333-3333-4333-8333-333333333333',U='44444444-4444-4444-8444-444444444444';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(await check())return;await sleep(30);}throw Error('fault-observation-deadline');}
async function database(worker){return worker.evaluate(async()=>{const output={persistedNativeStates:0,forgedScopePersisted:false};for(const row of await indexedDB.databases()){const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(row.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{if(!db.objectStoreNames.contains('native_states'))continue;const records=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});output.persistedNativeStates+=records.length;output.forgedScopePersisted ||= records.some(row=>JSON.stringify(row).includes('attacker-chosen-scope'));}finally{db.close();}}return output;});}
// Only runner/Playwright observation times. A test response.body() terminal is
// not evidence of EOF in the independent production reader.
function recordMetadataLifecycle(timeline,stage,row=null,{boundary=null,requestFailure=null,observerRejected=false}={}){
 if(!timeline)return;
 try{
  const elapsedMs=performance.now()-timeline.start,sequence=++timeline.observed;
  if(stage==='calibration-before')timeline.calibrationBeforeElapsedMs=elapsedMs;
  if(stage==='calibration-terminal')timeline.calibrationTerminalElapsedMs=elapsedMs;
  if(stage==='worker-close')timeline.workerClosedElapsedMs=elapsedMs;
  if(timeline.events.length>=32){timeline.dropped++;return;}
  const failure=requestFailure??row?.requestFailure,error=row?.bodyReadError;
  timeline.events.push({sequence,stage,elapsedMs,requestStart:Number.isSafeInteger(row?.requestStart)?row.requestStart:null,worker:stage==='worker-close'?true:typeof row?.worker==='boolean'?row.worker:null,status:Number.isSafeInteger(row?.status)?row.status:null,boundary:Number.isSafeInteger(boundary)?boundary:null,bodyRead:['NO_RESPONSE','PENDING','COMPLETE','FAILED'].includes(row?.bodyRead)?row.bodyRead:null,errorCategory:observerRejected?'OBSERVER_REJECTED':['TimeoutError','RESOURCE_ID_MISSING','RESOURCE_CONTENT_UNAVAILABLE','INSPECTOR_CACHE_EVICTED','TargetClosed','ResponseBodyUnavailable'].includes(error)?error:null,requestFailure:typeof failure==='string'&&/^net::ERR_[A-Z_]{1,64}$/.test(failure)?failure:failure===null||failure===undefined?null:'NONE_OR_UNCLASSIFIED'});
 }catch{/* Diagnostics never replace the original observer result or error. */}
}
for(const fault of requestedCases){
 const result={fault,status:'NOT_RUN',packagedMV3:false,triggerObserved:false};report.results.push(result);
 const metadataLifecycle=fault==='unknown-protocol'?{kind:'PASSIVE_PLAYWRIGHT_METADATA_LIFECYCLE_NOT_READER_EOF',clock:'node-performance-elapsed',start:performance.now(),limit:32,observed:0,dropped:0,events:[],calibrationBeforeElapsedMs:null,calibrationTerminalElapsedMs:null,workerClosedElapsedMs:null}:null;
 if(metadataLifecycle)result.metadataLifecycle=metadataLifecycle;
 let trace,traceWorker,traceBefore,traceAfter,traceRows,traceBrowserEvents=[],traceBrowserDropped=0,traceClock=performance.now();
 const traceBrowserEvent=event=>{if(traceBrowserEvents.length<256)traceBrowserEvents.push(event);else traceBrowserDropped++;};
 let server,guard,handle,dir,build,built,page,cspRescan,cspRecheck,cspMountsBefore,bodyStream,dormancy,phase='setup';
 try{
  server=await createHostFixtureServer({profile:'FAULT',fault,...(unknownTraceEnabled?{faultUnknownTrace:true}:{}),...(['rate-limit','corrupt','unknown-protocol'].includes(fault)?{faultNativeBody:true}:{})});guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});dir=await mkdtemp(join(tmpdir(),'vaiwl-fault-'+fault+'-'));
  built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,...(['rate-limit','corrupt','unknown-protocol'].includes(fault)?{offlineHistory:true}:{})});build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));result.sourceHashes=build.sourceHashes;result.metadataReadEnabled=build.offlineHistory===true;result.fixture=server.manifest;if(['rate-limit','corrupt','unknown-protocol'].includes(fault))assert.equal(result.fixture.faultNativeBody,true,'independent native body fixture must be enabled at actual server entry');
  if(unknownTraceEnabled){trace=await createFaultUnknownTracePackage(built.unpacked,join(dir,'unknown-trace'));result.tracePackage={kind:trace.kind,manifestSha256:trace.manifestSha256,limit:trace.limit,changes:trace.changes};}
  phase='launch';handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
  const {context,browser}=handle;context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(15000);
  const metadataTracker=createFaultMetadataRequestTracker({origin:server.origin,path:'/backend-api/conversation/'+C});if(fault==='unknown-protocol')context.on('request',request=>{metadataTracker.start(request);const tracked=metadataTracker.row(request);if(!tracked)return;recordMetadataLifecycle(metadataLifecycle,'request-start',tracked);if(trace){const row=metadataTracker.row(request);if(row)traceBrowserEvent({stage:'request-start',requestStart:row.requestStart,worker:row.worker,at:performance.now()-traceClock});}});
  if(trace)traceRows=metadataTracker;if(fault==='unknown-protocol')for(const event of ['requestfinished','requestfailed'])context.on(event,request=>{const row=metadataTracker.row(request);if(!row)return;let requestFailure=null;if(event==='requestfailed')try{requestFailure=request.failure()?.errorText??null;}catch{requestFailure='UNCLASSIFIED';}recordMetadataLifecycle(metadataLifecycle,event,row,{requestFailure});if(trace)traceBrowserEvent({stage:event,requestStart:row.requestStart,worker:row.worker,at:performance.now()-traceClock});});
  const responses=[],responseTasks=[];context.on('response',response=>{const request=response.request(),url=new URL(response.url());if(url.origin!==server.origin)return;const row={path:url.pathname,status:response.status(),worker:!!request.serviceWorker()};responses.push(row);if(url.pathname==='/backend-api/conversation/'+C&&fault==='unknown-protocol'){const started=metadataTracker.row(request);assert(started,'metadata response must have a request-start witness');Object.assign(started,row);recordMetadataLifecycle(metadataLifecycle,'response',started);if(trace){started.expectedWorker=request.serviceWorker()===traceWorker;const tag=response.headers()['x-vaiwl-offline-response'];if(typeof tag==='string'&&/^fxu-[a-f0-9]{32}-[1-9][0-9]{0,2}$/.test(tag)&&Number(tag.split('-').at(-1))<=256)started.responseTag=tag;}responses[responses.length-1]=started;started.ordinal=responses.filter(r=>r.path===url.pathname).length;if(trace)traceBrowserEvent({stage:'body-read-start',requestStart:started.requestStart,worker:started.worker,at:performance.now()-traceClock});recordMetadataLifecycle(metadataLifecycle,'body-read-start',started);const bodyTask=observeFaultMetadataResponse(response,started);void bodyTask.then(()=>recordMetadataLifecycle(metadataLifecycle,'body-terminal',started),()=>recordMetadataLifecycle(metadataLifecycle,'body-terminal',started,{observerRejected:true}));if(trace)responseTasks.push(bodyTask.finally(()=>traceBrowserEvent({stage:'body-read-terminal',requestStart:started.requestStart,worker:started.worker,at:performance.now()-traceClock})));else responseTasks.push(bodyTask);}else if(url.pathname==='/backend-api/conversation/'+C&&fault==='corrupt')responseTasks.push(response.json().then(()=>{row.invalidJSON=false;},error=>{row.invalidJSON=error?.name==='SyntaxError';}));});
  await context.route('**/*',route=>route.request().url().startsWith(server.origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
  let cspExtensionId;const cspMarkers=new Set(),cspRuntimeCounts={privateViews:0,invalid:0};if(fault==='csp'){await context.exposeBinding('__faultCspRecord',(source,event)=>{if(!cspExtensionId||source.frame.url()!==`chrome-extension://${cspExtensionId}${event?.role}`||!['/workspace.html','/sidebar.html'].includes(event?.role)){cspRuntimeCounts.invalid++;return;}if(event.kind==='private-view')cspRuntimeCounts.privateViews++;else if(event.kind==='private-grant'&&Array.isArray(event.markers)&&event.markers.length===2&&event.markers.every(v=>typeof v==='string'&&v.length>0)){for(const v of event.markers)cspMarkers.add(v);}else cspRuntimeCounts.invalid++;});await context.addInitScript({content:cspObservationScript()});}
  await context.addInitScript({content:`(${((validControl)=>{
   globalThis.faultWitness={forgedMessages:0,framePolicyViolations:0,removedOwnedFrames:0,packageFramePolicyViolations:0,mainProbePolicyViolations:0,extensionPageMessageCount:0,extensionPageMessageSchemaViolations:0};
   addEventListener('message',e=>{if(e.source===window&&e.origin===location.origin&&e.data?.type==='HOST_SCOPE'&&e.data.scopeKey==='attacker-chosen-scope')faultWitness.forgedMessages++;});
   addEventListener('securitypolicyviolation',e=>{if(e.effectiveDirective==='frame-src'){faultWitness.framePolicyViolations++;if(e.blockedURI.startsWith('chrome-extension://'))faultWitness.packageFramePolicyViolations++;if(e.blockedURI.includes('/fault-csp-probe'))faultWitness.mainProbePolicyViolations++;}});
   addEventListener('message',e=>{if(!e.origin.startsWith('chrome-extension://'))return;faultWitness.extensionPageMessageCount++;if(!validControl(e.data))faultWitness.extensionPageMessageSchemaViolations++;});
   new MutationObserver(records=>{for(const record of records)for(const n of record.removedNodes)if(n.nodeType===1)faultWitness.removedOwnedFrames+=(n.matches('iframe[title="工作空间"],iframe[title="侧边栏"]')?1:0)+n.querySelectorAll('iframe[title="工作空间"],iframe[title="侧边栏"]').length;}).observe(document,{subtree:true,childList:true});
  }).toString()})(${exactCspControlMessage.toString()})`});
  const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:trace?.unpacked??built.unpacked});
  if(fault==='csp'){cspExtensionId=id;await context.addInitScript(installCspMountObservation,{extensionId:id});}
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith('chrome-extension://'+id+'/'),timeout:15000});
  if(trace)traceWorker=worker;if(fault==='unknown-protocol')worker.on('close',()=>recordMetadataLifecycle(metadataLifecycle,'worker-close'));
  result.packagedMV3=await worker.evaluate(()=>typeof chrome.runtime.id==='string');
  // The disposable reject proxy has no forwarder, including for service workers.
  result.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.invalid/',{signal:AbortSignal.timeout(1500)});return false;}catch{return true;}});
  if(bodyStreamEnabled){assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');bodyStream=await observeFaultBodyStream(cdp,{extensionId:id,origin:server.origin});}
  page=await context.newPage();phase='native-navigation';await page.goto(server.origin+(fault==='stale-response'?'/':'/c/'+C));
  if(fault==='csp'){await page.locator('textarea').fill('FAULT_OFFLINE_UNSENT_DRAFT');await page.locator('textarea').evaluate(n=>{globalThis.cspNativeEditor=n;n.setSelectionRange(2,7);});}
  const frame=()=>page.frames().find(f=>f.url()==='chrome-extension://'+id+'/workspace.html');
  if(fault==='stale-response'){
   await until(()=>frame());await frame().getByRole('link',{name:'Ordinary conversation',exact:true}).first().waitFor();
   for(const name of ['返回原生阅读','显示原生列表']){const close=page.getByRole('button',{name,exact:true});if(await close.isVisible())await close.click();}
   await page.locator('aside').getByRole('link',{name:'Ordinary conversation',exact:true}).click();await until(()=>server.snapshot().pendingResponses===1);result.heldNativeRoute=true;
   await page.locator('aside').getByRole('link',{name:'Membership not loaded',exact:true}).click();await page.waitForURL('**/c/'+U);await until(async()=>{const f=frame();try{return !!f&&!f.isDetached()&&await f.locator('[aria-current="page"]').filter({hasText:'Membership not loaded'}).count()>0;}catch{return false;}});result.freshRouteBeforeRelease=true;
   result.releasedResponses=server.releaseStaleResponses();await page.waitForURL('**/c/'+C);await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Ordinary conversation');result.lateNativeRouteReplacedCurrent=true;
   await until(async()=>{const f=frame();try{return !!f&&!f.isDetached()&&await f.locator('[aria-current="page"]').filter({hasText:'Ordinary conversation'}).count()>0;}catch{return false;}});result.projectionMatchesActualNativeRoute=true;result.oldWorkerEpochRejection='NOT_ESTABLISHED_NATIVE_ROUTE_FIXTURE';result.triggerObserved=true;
  }
  phase='fault-terminal';
  if(['forged-scope','rate-limit','corrupt','unknown-protocol'].includes(fault)){
   await until(()=>frame());await frame().getByRole('link',{name:'Ordinary conversation',exact:true}).first().waitFor();
  }
  if(['rate-limit','corrupt','unknown-protocol'].includes(fault)){
   result.nativeMessageIds=await page.locator('#reading [data-message-id]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('data-message-id')))]);assert.deepEqual(result.nativeMessageIds,['msg-self']);
   const workspace=frame();await workspace.evaluate(()=>{globalThis.faultCalibration=[];const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){const result=send(...args);if(args[0]?.type==='HOST_UI_CALIBRATION_ENTRY'&&result?.then)result.then(r=>faultCalibration.push({ok:r?.ok,state:r?.state}),()=>faultCalibration.push({rejected:true}));return result;};});
   const close=page.getByRole('button',{name:'返回原生阅读',exact:true});
   if(fault==='unknown-protocol'){
    phase='unknown-dormancy-precondition';dormancy=await installFaultDormancyPrecondition({context,page,extensionId:id});result.dormancyPrecondition=dormancy.receipt;
    await dormancy.arm();assert.equal(await close.isVisible(),true,'unknown protocol requires the one original workspace close');await close.click({timeout:dormancy.remaining()});await dormancy.wait();await dormancy.close();phase='fault-terminal';
   }else if(await close.isVisible())await close.click();
   if(trace)traceBefore=await captureFaultUnknownTrace(worker);
   if(fault==='unknown-protocol'){result.calibrationRequestBoundary=metadataTracker.boundary();recordMetadataLifecycle(metadataLifecycle,'calibration-before',null,{boundary:result.calibrationRequestBoundary});}
   await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await workspace.waitForFunction(()=>faultCalibration.length===1);if(fault==='unknown-protocol')result.calibrationTerminalBoundary=metadataTracker.boundary();const terminal=await workspace.evaluate(()=>faultCalibration[0]);result.calibrationObservation=terminal;if(fault==='unknown-protocol')recordMetadataLifecycle(metadataLifecycle,'calibration-terminal',null,{boundary:result.calibrationTerminalBoundary});assert.equal(terminal.ok,false);result.calibrationTerminal=terminal.state;
   const metadata=responses.filter(r=>r.path==='/backend-api/conversation/'+C);result.nativeMetadataResponses=metadata.filter(r=>!r.worker).length;result.workerMetadataResponses=metadata.filter(r=>r.worker).length;
   result.metadataStatus=fault==='rate-limit'?429:200;assert(metadata.every(r=>r.status===result.metadataStatus));
   // Classify observed responses only; do not issue another metadata request.
   await Promise.all(responseTasks);const workerRows=metadata.filter(r=>r.worker);
   if(fault==='corrupt')result.invalidJSON=workerRows.length>0&&workerRows.every(r=>r.invalidJSON===true);
   if(fault==='unknown-protocol'){result.calibrationConsumption='NOT_ESTABLISHED';result.metadataResponseObservations=metadataTracker.rows().map(row=>({...row}));result.targetWorkerRequestStarts=unknownActionWindowCohort(result.metadataResponseObservations,result.calibrationRequestBoundary,result.calibrationTerminalBoundary).map(r=>r.requestStart);result.unknownSchema=validUnknownActionWindowCohort(result.metadataResponseObservations,result.calibrationRequestBoundary,result.calibrationTerminalBoundary);result.workerMetadataRequests=metadataTracker.rows().filter(r=>r.worker).length;assert(result.workerMetadataRequests<=3);}
   result.triggerObserved=true;
  }
  if(fault==='auth-failure'){await until(()=>responses.some(r=>r.path==='/api/auth/session'&&r.status===401));result.session401=responses.filter(r=>r.path==='/api/auth/session'&&r.status===401).length;result.triggerObserved=true;}
  if(fault==='unsafe-reading'){result.composerInsideReading=await page.locator('#reading #composer').count()===1;result.triggerObserved=result.composerInsideReading;}
  if(fault==='csp'){
   const response=await page.request.get(server.origin+'/');result.frameSourceNone=(response.headers()['content-security-policy']??'').includes("frame-src 'none'");
   // MAIN probe proves only that the page policy is active, never package fallback.
   await page.evaluate(()=>{const probe=document.createElement('iframe');probe.id='fault-csp-main-probe';probe.src='/fault-csp-probe';document.body.append(probe);});
   await until(async()=>await page.evaluate(()=>faultWitness.mainProbePolicyViolations>0));
   result.mainProbeRequests=server.snapshot().requests['/fault-csp-probe']??0;assert.equal(result.mainProbeRequests,0);
   await page.locator('#fault-csp-main-probe').evaluate(n=>n.remove());result.triggerObserved=true;
   result.cspHeader=response.headers()['content-security-policy'];
   const mounts=await page.evaluate(()=>({...__faultCspMounts}));
   if(mounts.violations>0){
    const control=await runCspPositiveControl({chromium,sourceHashes:build.sourceHashes,until,...cspScope});result.cspNoPolicyControl=control;
    cspRescan=()=>scanCspPage({page,extensionId:id,privateMarkers:[...cspMarkers]});
    result.cspProof={...cspScope,branch:'PACKAGE_BLOCKED',status:'PASS_NARROW_CSP_BLOCKED_NATIVE_PRESERVED',noCspPositiveControl:control.status==='PASS_AUTHENTICATED_NO_CSP_CONTROL'&&control.sameSource&&control.cleanupOK,successfulPrivateViews:cspRuntimeCounts.privateViews,nativeRetainedBeforeCorrectiveToggle:await page.locator('textarea').isVisible(),...await cspRescan()};
   }else{const observed=await observeAuthenticatedCsp({page,context,worker,extensionId:id,until,...cspScope});result.cspProof=observed.proof;cspRescan=observed.rescan;cspRecheck=observed.recheck;}
   cspMountsBefore=await page.evaluate(()=>({...__faultCspMounts}));


  }
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
  if(fault==='csp'&&result.cspProof.branch==='ISOLATED_AUTHENTICATED'){result.cspProof.nativeClosePreparation=await prepareCspNativeClose(page,{roles:cspScope.expectedRoles});result.cspProof.sameAuthenticatedGrantsBeforeClose=await cspRecheck();assert.equal(result.cspProof.sameAuthenticatedGrantsBeforeClose,true);}
  const nativeReading=page.getByRole('button',{name:'返回原生阅读',exact:true});if(fault==='csp'&&result.cspProof.branch==='ISOLATED_AUTHENTICATED'){await nativeReading.waitFor({state:'visible'});await nativeReading.click();result.cspProof.workspaceNativeCloseExercised=true;result.cspProof.nativeCloseRolesExercised=['workspace'];}else if(fault!=='unsafe-reading'&&await nativeReading.isVisible())await nativeReading.click();
  if(fault==='csp'){if(result.cspProof.branch==='ISOLATED_AUTHENTICATED'){if(cspScope.expectedRoles.includes('sidebar')){const nativeList=page.getByRole('button',{name:'显示原生列表',exact:true});await nativeList.waitFor({state:'visible'});await nativeList.click();result.cspProof.nativeCloseRolesExercised.push('sidebar');}result.cspProof.bothNativeCloseControlsExercised=result.cspProof.nativeCloseRolesExercised.length===2;}else result.cspProof.bothNativeCloseControlsExercised='NOT_APPLICABLE_BLOCKED';}
  if(fault!=='csp')await page.locator('textarea').fill('FAULT_OFFLINE_UNSENT_DRAFT');await page.evaluate(()=>{globalThis.faultEditor=document.querySelector('textarea');});
  await page.getByRole('button',{name:'Send',exact:true}).click();await page.locator('#composer output').filter({hasText:'message not sent'}).waitFor();result.nativeSendRetained=true;
  const requestBoundaryBefore=fault==='unknown-protocol'?metadataTracker.boundary():null;
  const before=responses.filter(r=>r.worker&&r.path==='/backend-api/conversation/'+C).length,start=Date.now();
  // A bounded post-terminal window, explicitly not an infinite-time guarantee.
  while(Date.now()-start<1000){if(fault==='unsafe-reading'){assert.equal(await page.locator('iframe[title="工作空间"]').count(),0);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);}assert.equal(await page.evaluate(()=>document.querySelector('textarea')===faultEditor&&faultEditor.value==='FAULT_OFFLINE_UNSENT_DRAFT'),true);await sleep(50);}result.observationMs=Date.now()-start;result.nativeEditorRetained=true;
  result.workerRequestsStableAfterTerminal=responses.filter(r=>r.worker&&r.path==='/backend-api/conversation/'+C).length===before;if(fault==='unknown-protocol'){result.workerRequestsStableAfterTerminal&&=metadataTracker.boundary()===requestBoundaryBefore&&requestBoundaryBefore===result.calibrationTerminalBoundary;result.metadataResponseObservations=metadataTracker.rows().map(row=>({...row}));}
  result.privateFrames=page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id+'/')&&['workspace.html','sidebar.html'].some(name=>f.url().endsWith('/'+name))).length;
  result.workspaceOpen=await page.locator('[data-va-owned]:popover-open').count()>0;
  result.pageFallbackProjection=await page.evaluate(()=>!!document.querySelector('main [data-free-list],aside [data-free-list]'));
  Object.assign(result,await page.evaluate(()=>faultWitness),await database(worker));
  if(fault==='csp')result.cspPackagePolicy=result.cspProof?.branch;
  if(fault==='csp'){const policyResponse=await page.request.get(server.origin+'/');result.pagePolicyUnchanged=policyResponse.headers()['content-security-policy']===result.cspHeader;result.cspProof.successfulPrivateViews=cspRuntimeCounts.privateViews;const finalScan=await cspRescan();for(const key of ['pageProjectionLeaks','pageMessageLeaks','captureDropped','captureUnsupported'])finalScan[key]=Math.max(finalScan[key],result.cspProof[key]);Object.assign(result.cspProof,finalScan,{finalScanPerformed:true});result.cspProof.captureUnsupported+=cspRuntimeCounts.invalid;const native=await page.locator('textarea').evaluate(n=>({same:n===cspNativeEditor,draft:n.value==='FAULT_OFFLINE_UNSENT_DRAFT',selection:n.selectionStart===2&&n.selectionEnd===7}));Object.assign(result.cspProof,{nativeEditorSame:native.same,nativeDraftSame:native.draft,nativeSelectionSame:native.selection,nativeActionWorked:result.nativeSendRetained});const mounts=await page.evaluate(()=>({...__faultCspMounts}));Object.assign(result.cspProof,{packageFrameAttempts:mounts.attempts,packageFrameAttemptsByRole:mounts.byRole,packageFramePolicyViolations:mounts.violations,packageFrameAttemptsBeforeContinuation:cspMountsBefore.attempts,packageFrameAttemptsAfterContinuation:mounts.attempts,boundedRetryStable:mounts.attempts===cspMountsBefore.attempts});result.packageFramePolicyViolations=mounts.violations;}
  result.packageVerified=verifyHost(built.unpacked).status==='OFFLINE_HOST_RECONSTRUCTION';result.status='OBSERVED';
 }catch(error){result.status='FAIL';result.phase=phase;result.error=String(error?.message??error);process.exitCode=1;}
 finally{
  if(bodyStream)try{result.bodyStream=await bodyStream.finish();}catch{result.bodyStream={kind:BODY_STREAM_KIND,status:'FAIL_DIAGNOSTIC',captureComplete:false,reason:'collector-unavailable'};}
  if(trace){try{traceAfter=await captureFaultUnknownTrace(traceWorker);}catch{result.traceCaptureError='snapshot-unavailable-or-timeout';}try{result.tracePackageVerified=await verifyFaultUnknownTracePackage(trace);}catch{result.tracePackageVerified=false;}try{result.workerTrace={before:traceBefore??null,after:traceAfter??null};result.browserTrace={clock:'node-performance-relative',timeOrigin:performance.timeOrigin,start:traceClock,limit:256,dropped:traceBrowserDropped,events:traceBrowserEvents};result.traceFixture=server.snapshot().faultUnknownTrace??null;result.traceSummary=summarizeFaultUnknownTrace({fixtureResponseTrace:result.traceFixture,before:traceBefore,after:traceAfter,rows:traceRows?.rows()??[],start:result.calibrationRequestBoundary,end:result.calibrationTerminalBoundary,browserEvents:traceBrowserEvents,browserDropped:traceBrowserDropped});}catch{result.traceSummary={status:'INCOMPLETE',correlationComplete:false,reason:'trace-capture-or-verification-failed'};}}
  const observerCleanup=await Promise.allSettled([dormancy?.close()]);const cleanup=await Promise.allSettled([handle?.close(),server?.close(),guard?.close()]);result.cleanupOK=[...observerCleanup,...cleanup].every(r=>r.status==='fulfilled');result.guardClosed=guard?.snapshot().closed===true;
  result.cleanupErrors=[...observerCleanup,...cleanup].flatMap((r,i)=>r.status==='rejected'?[{resource:['dormancy-observer','browser','fixture','network-guard'][i],code:/^[A-Z_]{1,40}$/.test(r.reason?.code??'')?r.reason.code:'CLOSE_FAILED'}]:[]);
  result.sourceChanged=(await Promise.all(Object.entries({...build?.sourceHashes,...evidenceHashes}).map(async([path,digest])=>hash(await readFile(path))!==digest))).some(Boolean);
  // Only this runner's new temporary root; Chromium descendants may finish
  // their last profile writes just after the launcher has closed its process.
  if(dir){try{await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});result.temporaryDirectoryRemoved=true;}catch(error){result.cleanupOK=false;result.temporaryDirectoryRemoved=false;result.cleanupErrors.push({resource:'temporary-root',code:/^[A-Z_]{1,40}$/.test(error?.code??'')?error.code:'REMOVE_FAILED'});}}
  if(result.status==='OBSERVED'){try{assertFaultObservation(result);result.status='PASS_NARROW_OBSERVATION';}catch(error){result.status='FAIL';result.phase='fixed-oracle';result.error=String(error.message);process.exitCode=1;}}
  if(!result.cleanupOK||result.sourceChanged){result.status='FAIL';result.phase='cleanup-or-source';process.exitCode=1;}
 }
}
if(bodyStreamEnabled){let integrity=true;for(const result of report.results){result.contractOutcome={status:result.status,phase:result.phase??null,error:result.error??null};const valid=result.packageVerified===true&&result.sourceChanged===false&&result.cleanupOK===true&&result.guardClosed===true&&result.temporaryDirectoryRemoved===true&&result.bodyStream?.kind===BODY_STREAM_KIND&&result.bodyStream?.status==='DIAGNOSTIC_ONLY'&&['PASS_NARROW_OBSERVATION','FAIL'].includes(result.contractOutcome.status)&&(!result.contractOutcome.phase||result.contractOutcome.phase==='fixed-oracle');integrity&&=valid;result.status=valid?'DIAGNOSTIC_ONLY':'FAIL_DIAGNOSTIC';}report.status=integrity?'DIAGNOSTIC_ONLY':'FAIL_DIAGNOSTIC';process.exitCode=integrity?2:1;}
else if(unknownTraceEnabled){let integrity=true;for(const result of report.results){result.contractOutcome={status:result.status,phase:result.phase??null,error:result.error??null};result.correlationComplete=result.traceSummary?.correlationComplete===true;result.integrity={originalPackageVerified:result.packageVerified===true,tracePackageVerified:result.tracePackageVerified===true,sourceUnchanged:result.sourceChanged===false,cleanupOK:result.cleanupOK===true&&result.guardClosed===true&&result.temporaryDirectoryRemoved===true};const valid=Object.values(result.integrity).every(v=>v===true)&&result.workerTrace?.before?.kind===FAULT_UNKNOWN_TRACE_KIND&&result.workerTrace?.after?.kind===FAULT_UNKNOWN_TRACE_KIND&&['PASS_NARROW_OBSERVATION','FAIL'].includes(result.contractOutcome.status)&&(!result.contractOutcome.phase||result.contractOutcome.phase==='fixed-oracle');integrity&&=valid;result.status=valid?'INCOMPLETE':'FAIL_DIAGNOSTIC';}report.status=integrity?'INCOMPLETE':'FAIL_DIAGNOSTIC';report.correlationComplete=false;process.exitCode=integrity?2:1;}
else report.status=report.results.every(r=>r.status==='PASS_NARROW_OBSERVATION')?'PASS_NARROW_PACKAGED_FAULT_OBSERVATIONS':'FAIL';
if(!unknownTraceEnabled&&!bodyStreamEnabled&&report.status!=='FAIL')assertFaultPackageReport(report);
await writeFile(process.argv[2]??join(tmpdir(),'free-fault-package.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,fullFAULT:report.fullFAULT,cases:report.results.map(({fault,status,phase})=>({fault,status,phase}))}));
