import {observeLeaseExpiry} from './observe-lease-expiry.mjs';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import {createPreparedDormancyProbe,createWorkerPreparedDormancyProbe,observeWorkerPreparedDormancy} from './prepared-dormancy-probe.mjs';
import {instrumentIdleWorkSource} from './idle-work-trace.mjs';
import {instrumentFramePendingWork,framePendingWorkIsIdle} from './frame-pending-work-probe.mjs';
/** Narrow same-route C2 replacement; no silent-expiry/J2 or live-account claim. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {j2JourneyProfile} from './j2-journey-profile.mjs';
import {j2Within,j2Poll,j2ExternalProbe} from './j2-runner-bounds.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {installJ4GrantObserver} from './j4-grant-observer.mjs';
import {currentJ4Grant,waitJ4PeerScope} from './j4-joint-interruption.mjs';
const frameLossMutant=process.argv[3]==='dormant-frame-loss-mutant',frameLoss=frameLossMutant||process.argv[3]==='dormant-frame-loss';
const regionMutant=process.argv[3]==='region-replacement-mutant',regionReplacement=frameLoss||regionMutant||process.argv[3]==='region-replacement';
const dormantMutant=process.argv[3]==='dormant-recovery-mutant',dormantRecovery=dormantMutant||process.argv[3]==='dormant-recovery';
const transportMutant=process.argv[3]==='transport-expiry-mutant',transportExpiry=transportMutant||process.argv[3]==='transport-expiry',idleProbe=dormantRecovery||transportExpiry||frameLoss;
const hash=v=>createHash('sha256').update(v).digest('hex');
const paths=['tests/host/prepared-dormancy-probe.mjs','tests/host/context-replacement-package-browser.mjs','tests/host/fixtures/variants-server.mjs','tests/host/fixtures/variants-native.mjs','tests/host/fixtures/native-current-refresh.mjs','tests/host/fixtures/native.mjs','tests/host/expected/modern.mjs','tests/host/j2-journey-profile.mjs','tests/host/j2-runner-bounds.mjs','tests/host/isolated-browser-cleanup.mjs',...((transportExpiry||regionReplacement)?['tests/host/j4-grant-observer.mjs','tests/host/j4-joint-interruption.mjs','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs']:[])];
const fixtureHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
if(idleProbe)fixtureHashes['tests/host/idle-work-trace.mjs']=hash(await readFile('tests/host/idle-work-trace.mjs'));
if(transportExpiry||dormantRecovery)fixtureHashes['tests/host/frame-pending-work-probe.mjs']=hash(await readFile('tests/host/frame-pending-work-probe.mjs'));
if(transportExpiry)fixtureHashes['tests/host/observe-lease-expiry.mjs']=hash(await readFile('tests/host/observe-lease-expiry.mjs'));
const server=await createVariantHostFixtureServer({profile:'MODERN',nativeCurrentRefresh:true}),dir=await mkdtemp(join(tmpdir(),'vaiwl-context-replacement-')),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));
let instrumentedEntry,mutantSession;
// Passive isolated-world tracing only. It returns the original Promise and
// never supplies a response, changes a timer, or creates context authority.
function installTransportExpiryObserver(){
 const send=chrome.runtime.sendMessage.bind(chrome.runtime),rows=[];globalThis.__vaiwlTransportExpiryTrace=rows;
 chrome.runtime.sendMessage=function(...args){
  const request=args[0],requestedAt=Date.now(),result=send(...args);
  if(result?.then)result.then(response=>{try{
   if(!['HOST_HELLO','HOST_DOCUMENT_RENEW','HOST_FOCUS','HOST_REFRESH','HOST_UI_IDLE_CHECK','HOST_UI_IDLE_RELEASE'].includes(request?.type))return;
   rows.push({type:request.type,requestedAt,receivedAt:Date.now(),ok:response?.ok===true,state:typeof response?.state==='string'?response.state:null,reason:typeof response?.reason==='string'?response.reason:null,bindingExpiresAt:typeof response?.binding?.expiresAt==='string'?Date.parse(response.binding.expiresAt):null});
   if(rows.length>128)rows.shift();
  }catch{}},()=>{}).catch(()=>{});
  return result;
 };
}
if(idleProbe){
 const path=join(built.unpacked,'extension/content-entry.mjs'),original=await readFile(path,'utf8'),anchor=' void session.start();';assert.equal(original.split(anchor).length,2);
 instrumentedEntry=original.replace(anchor,' ('+installTransportExpiryObserver.toString()+')();\n'+' globalThis.__vaiwlIdleProbeSession=Object.freeze({attempt:('+createPreparedDormancyProbe.toString()+')(session)});\n'+anchor);await writeFile(path,instrumentedEntry);
}
if(dormantMutant){
 const path=join(built.unpacked,'src/host/content-session.mjs'),original=await readFile(path,'utf8'),anchor="if(['scope-not-verified','context-handshake-transport-unavailable'].includes(error?.message))contextPending();else stop();";assert.equal(original.split(anchor).length,2,'denied wake mutation must match exactly one production branch');mutantSession=original.replace(anchor,"if(error?.message==='context-handshake-transport-unavailable')contextPending();else stop();");await writeFile(path,mutantSession);
}
if(transportMutant){
 const path=join(built.unpacked,'src/host/content-session.mjs'),original=await readFile(path,'utf8');
 const anchor="    if(exactHostRecord(result,['ok','reason'])&&result.ok===false&&result.reason==='invalid-host-document'&&recoverTransport())return;\n";
 assert.equal(original.split(anchor).length,2,'transport recovery mutation must remove exactly its production branch');mutantSession=original.replace(anchor,'');await writeFile(path,mutantSession);
}
if(regionMutant){
 const path=join(built.unpacked,'src/host/content-session.mjs'),original=await readFile(path,'utf8');
 const anchor="    if(current===s&&['native-region-changed','native-geometry-changed','dormant-document-changed'].includes(reason)){contextPending();return;}\n";
 assert.equal(original.split(anchor).length,2);mutantSession=original.replace(anchor,'');await writeFile(path,mutantSession);
}
if(frameLossMutant){
 const path=join(built.unpacked,'src/host/content-session.mjs'),original=await readFile(path,'utf8'),anchor="'native-geometry-changed','dormant-document-changed'";
 assert.equal(original.split(anchor).length,2);mutantSession=original.replace(anchor,"'native-geometry-changed'");await writeFile(path,mutantSession);
}
// Test-package-only, read-only worker readiness. Never supplied by content,
// never closes/releases a mount, and never changes a production owner or clock.
const workerReadinessHashes={};
if(transportExpiry||dormantRecovery){const path='src/host/free-frame-client.mjs',source=instrumentFramePendingWork(await readFile(join(built.unpacked,path),'utf8'));await writeFile(join(built.unpacked,path),source);workerReadinessHashes[path]=hash(source);}
if(idleProbe){
 for(const [path,kind] of [['src/runtime/host-binding-service.mjs','service'],['src/runtime/host-ui-owner.mjs','ui']]){
  const source=instrumentIdleWorkSource(await readFile(join(built.unpacked,path),'utf8'),kind);await writeFile(join(built.unpacked,path),source);workerReadinessHashes[path]=hash(source);
 }
 const path='src/runtime/host-worker-runtime.mjs',original=await readFile(join(built.unpacked,path),'utf8'),anchor=' return Object.freeze({service,stop});';assert.equal(original.split(anchor).length,2);
 const source=original.replace(anchor," globalThis.__vaiwlFixtureWorkerIdle=()=>service.isIdle()===true;\n"+anchor);await writeFile(join(built.unpacked,path),source);workerReadinessHashes[path]=hash(source);
 const compiled=compileClassicWorker(built.unpacked);
 for(const [path,source]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){await writeFile(join(built.unpacked,path),source);workerReadinessHashes[path]=hash(source);}
}
const C='33333333-3333-4333-8333-333333333333',scope=j2JourneyProfile('MODERN').scope,scopeKey=JSON.stringify([scope.provider,scope.accountId,scope.organizationId]);
const report={status:'NOT_RUN',evidence:'OFFLINE_C2_RECEIPT_REPLACEMENT_NARROW',startupMode:'WORKER_READY_PRECONDITION_NOT_COLD_ACCEPTANCE',realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',sourceHashes:manifest.sourceHashes,fixtureHashes,fixture:server.manifest,results:[],requests:[],errors:[]};let context,page,id,browserHandle,readTransportExpiryTrace,endTransportOwnerObservation,readIdleWorkTrace,networkGuard;
if(regionReplacement){report.evidence='OFFLINE_NATIVE_REGION_REPLACEMENT_FRESH_CONTEXT';report.mutation=regionMutant?'REMOVE_NATIVE_REGION_CONTEXT_WAIT':null;}
if(dormantRecovery){report.evidence='OFFLINE_C2_INSTRUMENTED_DORMANT_SCOPE_RECOVERY';report.instrumentation={path:'extension/content-entry.mjs',after:hash(instrumentedEntry),exposes:['attempt']};report.mutation=dormantMutant?'RESTORE_PERMANENT_STOP_AFTER_DENIED_WAKE':null;report.forcedWorkerStop=true;report.naturalWorkerSleep='NOT_ESTABLISHED';report.workerReadiness={kind:'PASSIVE_TEST_PACKAGE_IS_IDLE_ONLY',hashes:workerReadinessHashes,samples:[],totalSamples:0};}
if(transportExpiry){report.evidence='OFFLINE_C2_DORMANT_TRANSPORT_EXPIRY_FOREGROUND_RECOVERY';report.instrumentation={path:'extension/content-entry.mjs',after:hash(instrumentedEntry),exposes:['attempt'],passiveContentTransport:true,passiveFrameGrantAndView:true};report.mutation=transportMutant?'REMOVE_EXACT_FOREGROUND_INVALID_DOCUMENT_RECOVERY':null;report.workerReadiness={kind:'PASSIVE_TEST_PACKAGE_IS_IDLE_ONLY',hashes:workerReadinessHashes,samples:[],totalSamples:0};report.forcedWorkerStop=false;report.naturalWorkerSleep='NOT_TESTED';report.nativeRequestStarts=[];report.transportOwner={workerClosed:false,focusedAt:null};}
if(frameLoss){report.evidence='OFFLINE_DORMANT_FRAME_LOSS_FRESH_CONTEXT';report.mutation=frameLossMutant?'REMOVE_DORMANT_FRAME_CONTEXT_WAIT':null;report.instrumentation={path:'extension/content-entry.mjs',after:hash(instrumentedEntry),exposes:['attempt'],passiveContentTransport:true};report.workerReadiness={kind:'PASSIVE_TEST_PACKAGE_IS_IDLE_ONLY',hashes:workerReadinessHashes,samples:[],totalSamples:0};report.forcedWorkerStop=false;report.naturalWorkerSleep='NOT_TESTED';}
async function verifyPackage(){if(!idleProbe&&!regionMutant&&!frameLossMutant){assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');return;}for(const [path,expected] of Object.entries(manifest.files))assert.equal(hash(await readFile(join(built.unpacked,path))),idleProbe&&path==='extension/content-entry.mjs'?hash(instrumentedEntry):(dormantMutant||transportMutant||regionMutant||frameLossMutant)&&path==='src/host/content-session.mjs'?hash(mutantSession):(workerReadinessHashes[path]??expected));}
const poll=fn=>j2Poll(fn,15000),within=(name,fn,ms=5000)=>j2Within(name,fn,ms);
const frame=()=>page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);
const step=(name,detail={})=>report.results.push({name,status:'PASS',...detail});
async function continuity(){assert.deepEqual(await page.evaluate(()=>({sameDocument:document===replacementDocument,sameEditor:document.querySelector('textarea')===replacementEditor,draft:replacementEditor.value,start:replacementEditor.selectionStart,end:replacementEditor.selectionEnd,pagehides:replacementPagehides})),{sameDocument:true,sameEditor:true,draft:'UNSENT_CONTEXT_REPLACEMENT',start:3,end:8,pagehides:0});assert.equal(page.url(),server.origin+'/c/'+C);}
try{
 if(transportExpiry||regionReplacement)networkGuard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 if(transportExpiry||regionReplacement){browserHandle=await launchNativeVisibilityBrowser({chromium,profileDir:join(dir,'profile'),headed:false,...(networkGuard?{historicalNetworkGuard:networkGuard.config}:{}),executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});context=browserHandle.context;report.browserPrecondition=browserHandle.diagnostic;}
 else context=await chromium.launchPersistentContext(join(dir,'profile'),{timeout:25000,headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(15000);
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await within('browser-cdp',()=>context.browser().newBrowserCDPSession());({id}=await within('load',()=>cdp.send('Extensions.loadUnpacked',{path:built.unpacked}),15000));
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith(`chrome-extension://${id}/`),timeout:15000});assert.equal(await within('worker-ready',()=>worker.evaluate(()=>chrome.runtime.id)),id);assert.equal(await within('network-refusal',()=>worker.evaluate(j2ExternalProbe,1500),3000),'BLOCKED');
 if(idleProbe)readIdleWorkTrace=()=>within('idle-work-trace',()=>worker.evaluate(()=>globalThis.__vaiwlFixtureIdleWork?.slice()??[]));
 if(transportExpiry){const closed=()=>{report.transportOwner.workerClosed=true;};worker.on('close',closed);endTransportOwnerObservation=()=>{worker.off('close',closed);report.transportOwner.observationEndedAt=Date.now();};await context.addInitScript(installJ4GrantObserver);}
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));if(transportExpiry)await page.bringToFront();
 page.on('response',response=>{const request=response.request();if(request.url()===server.origin+'/backend-api/conversation/'+C)report.requests.push({at:Date.now(),status:response.status(),method:request.method(),resourceType:request.resourceType()});});
 if(transportExpiry)page.on('request',request=>{if(request.method()==='GET'&&request.url()===server.origin+'/backend-api/conversation/'+C)report.nativeRequestStarts.push(Date.now());});
 await page.goto(server.origin+'/c/'+C);await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);let initial=await poll(()=>frame());await initial.getByText('Ordinary conversation',{exact:true}).waitFor();
 await page.locator('textarea').fill('UNSENT_CONTEXT_REPLACEMENT');await page.evaluate(()=>{globalThis.replacementDocument=document;globalThis.replacementEditor=document.querySelector('textarea');replacementEditor.setSelectionRange(3,8);globalThis.replacementPagehides=0;addEventListener('pagehide',()=>replacementPagehides++);});
 await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();await continuity();assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);step('initial-team-projection-native-reading-and-unsent-draft');
 const oldFrame=frame(),before=report.requests.length;assert(oldFrame);assert.equal(before,1);
 let renewed;
 if(transportExpiry){
  const initialProof=await poll(()=>currentJ4Grant(page,id,scopeKey,{expectedCurrentRef:C}));assert(initialProof,'initial real grant and VIEW required');
  // A real native heading click leaves the composer before quiescence, so
  // foreground restoration cannot compete with dormant native editing wake.
  await page.locator('main > header > h1').click();
  const composerFocused=await page.evaluate(()=>document.querySelector('#composer').contains(document.activeElement));
  assert.equal(composerFocused,false,'foreground probe must leave the native composer');await continuity();
  report.foregroundFocusIsolation={nativeHeadingClicked:true,composerFocused};
  const session=await context.newCDPSession(page),worlds=[];session.on('Runtime.executionContextCreated',e=>worlds.push(e.context));await session.send('Runtime.enable');
  const evaluate=async(expression,contextId)=>{const r=await within('transport-content-read',()=>session.send('Runtime.evaluate',{expression,contextId,returnByValue:true,awaitPromise:true}));assert.equal(r.exceptionDetails,undefined);return r.result.value;};
  const isolated=await poll(async()=>{for(const world of worlds.filter(w=>w.auxData?.isDefault===false)){try{if(await evaluate(`window===window.top&&chrome.runtime.id===${JSON.stringify(id)}&&typeof __vaiwlIdleProbeSession==='object'&&Array.isArray(__vaiwlTransportExpiryTrace)`,world.id))return world.id;}catch{}}return null;});
  assert.equal(await page.evaluate(()=>typeof globalThis.__vaiwlIdleProbeSession),'undefined');assert.equal(await page.evaluate(()=>typeof globalThis.__vaiwlTransportExpiryTrace),'undefined');
  readTransportExpiryTrace=()=>evaluate('globalThis.__vaiwlTransportExpiryTrace.slice(-128)',isolated);
  // Worker idle cannot see a frame's queued 100ms presentation save. Observe
  // both actual frame owners first, without draining/cancelling their work.
  // This is a prerequisite only: the single original CHECK/RELEASE still rules.
  report.frameReadiness={totalSamples:0,samples:[]};let sampledFrames=null;
  const currentPair=()=>['workspace','sidebar'].map(role=>page.frames().filter(f=>f.url()===`chrome-extension://${id}/${role}.html`));
  const framesIdle=async()=>{report.frameReadiness.totalSamples++;sampledFrames=null;const pair=currentPair();if(pair.some(items=>items.length!==1))return false;
   const frames=pair.map(items=>items[0]),states=await Promise.all(frames.map(f=>within('frame-pending-work',()=>f.evaluate(()=>globalThis.__vaiwlFixtureFramePendingWork?.()??null))));
   const latest=currentPair(),same=latest.every((items,i)=>items.length===1&&items[0]===frames[i]&&!frames[i].isDetached()),ready=same&&states.every((state,i)=>framePendingWorkIsIdle(state,['workspace','sidebar'][i]));
   if(report.frameReadiness.samples.length<32)report.frameReadiness.samples.push({at:Date.now(),ready,states});if(ready)sampledFrames=frames;return ready;
  };
  const preparedProbe=createWorkerPreparedDormancyProbe({framesIdle,workerIdle:async()=>{const ready=await worker.evaluate(()=>globalThis.__vaiwlFixtureWorkerIdle());report.workerReadiness.totalSamples++;if(report.workerReadiness.samples.length<32)report.workerReadiness.samples.push({at:Date.now(),idle:ready});return ready;},attempt:()=>{const pair=currentPair();return sampledFrames&&pair.every((items,i)=>items.length===1&&items[0]===sampledFrames[i]&&!items[0].isDetached())?evaluate('__vaiwlIdleProbeSession.attempt()',isolated):null;}});
  report.idlePrecondition=await observeWorkerPreparedDormancy(poll,preparedProbe);
  try{report.idlePreconditionWorkTrace=await readIdleWorkTrace();}catch{report.idlePreconditionWorkTraceUnavailable=true;}
  assert.deepEqual(report.idlePrecondition,{prepared:true,entered:true});await continuity();
  const priorTrace=await readTransportExpiryTrace(),binding=priorTrace.findLast(row=>['HOST_HELLO','HOST_DOCUMENT_RENEW'].includes(row.type)&&row.ok&&Number.isFinite(row.bindingExpiresAt));assert(binding,'actual binding expiry required');
  assert.equal(report.nativeRequestStarts.length,1);const receiptStartedAt=report.nativeRequestStarts[0];
  const waitMs=Math.max(1,binding.bindingExpiresAt+1-Date.now());assert(waitMs<=20001,'document lease cannot be extended by driver');assert(Date.now()+waitMs+15000<receiptStartedAt+60000,'original C2 must remain valid for original recovery observation window');
  assert.equal(oldFrame.isDetached(),false);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);
  const peer=await context.newPage();await peer.bringToFront();assert.equal(await page.evaluate(()=>document.hasFocus()),false,'genuine browser foreground edge required');
  const waitedAt=Date.now();report.leaseExpiryObservations=[];await observeLeaseExpiry(binding.bindingExpiresAt,{trace:report.leaseExpiryObservations});assert(Date.now()>binding.bindingExpiresAt);assert(Date.now()+15000<receiptStartedAt+60000,'original recovery window must still fit live C2');assert.equal(report.transportOwner.workerClosed,false,'transport expiry scenario must retain its original C2 owner');
  const beforeFocus=await readTransportExpiryTrace();assert.deepEqual(beforeFocus,priorTrace,'dormant wait must not renew or refetch authority');assert.equal(report.requests.length,1);assert.equal(report.nativeRequestStarts.length,1);await continuity();
  step('real-dormant-document-lease-expires-with-live-C2-no-renewal-or-native-GET',{bindingExpiresAt:binding.bindingExpiresAt,waitedMs:Date.now()-waitedAt,receiptAgeMs:Date.now()-receiptStartedAt});
  const focusedAt=report.transportOwner.focusedAt=Date.now();await new Promise(resolve=>setTimeout(resolve,2));await page.bringToFront();
  report.phase='await-fresh-foreground-grant-and-VIEW';await waitJ4PeerScope(page,id,scopeKey,{previousGrant:initialProof.grant,expectedCurrentRef:C,afterTime:focusedAt});
  const proof=await currentJ4Grant(page,id,scopeKey,{previousGrant:initialProof.grant,expectedCurrentRef:C,afterTime:focusedAt});assert(proof,'new current grant must still be live');renewed=proof.frame;assert.notEqual(renewed,oldFrame);assert.equal(oldFrame.isDetached(),true);
  const trace=await readTransportExpiryTrace(),focus=trace.find(row=>row.type==='HOST_FOCUS'&&row.requestedAt>focusedAt),hello=trace.find(row=>row.type==='HOST_HELLO'&&row.requestedAt>=focus?.receivedAt&&row.ok),refresh=trace.find(row=>row.type==='HOST_REFRESH'&&row.requestedAt>=hello?.receivedAt&&row.state==='verified');
  assert(focus);assert.equal(focus.ok,false);assert.equal(focus.reason,'invalid-host-document');assert(hello&&refresh,'real fresh HELLO and verified REFRESH required after stale transport');assert.equal(trace.filter(row=>row.type==='HOST_HELLO'&&row.requestedAt>focusedAt).length,1,'one foreground recovery only');
  assert.equal(report.transportOwner.workerClosed,false);assert.equal(report.requests.length,1);assert.equal(report.nativeRequestStarts.length,1);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);await continuity();
  report.transport=trace;report.foregroundRecovery={focusedAt,newGrant:true,actualPostFocusVIEW:true,scopeKey,sameWorker:true,nativeGETCount:1};step('foreground-expired-transport-fresh-same-Team-grant-and-VIEW-reading-preserved',report.foregroundRecovery);report.phase='foreground-recovered';await session.detach();readTransportExpiryTrace=null;await peer.close();
 }else if(regionReplacement){
  report.phase='replace-reading-region';const started=performance.now();
  if(frameLoss){
   await page.locator('main > header > h1').click();assert.equal(await page.evaluate(()=>document.querySelector('#composer').contains(document.activeElement)),false);
   const session=await context.newCDPSession(page),worlds=[];session.on('Runtime.executionContextCreated',e=>worlds.push(e.context));await session.send('Runtime.enable');
   const evaluate=async(expression,contextId)=>{const r=await within('frame-loss-content-read',()=>session.send('Runtime.evaluate',{expression,contextId,returnByValue:true,awaitPromise:true}));assert.equal(r.exceptionDetails,undefined);return r.result.value;};
   const isolated=await poll(async()=>{for(const world of worlds.filter(w=>w.auxData?.isDefault===false)){try{if(await evaluate(`window===window.top&&chrome.runtime.id===${JSON.stringify(id)}&&typeof __vaiwlIdleProbeSession==='object'`,world.id))return world.id;}catch{}}return null;});
   assert.equal(await page.evaluate(()=>typeof globalThis.__vaiwlIdleProbeSession),'undefined');
   const probe=createWorkerPreparedDormancyProbe({workerIdle:async()=>{const idle=await worker.evaluate(()=>globalThis.__vaiwlFixtureWorkerIdle());report.workerReadiness.totalSamples++;if(report.workerReadiness.samples.length<32)report.workerReadiness.samples.push({at:Date.now(),idle});return idle;},attempt:()=>evaluate('__vaiwlIdleProbeSession.attempt()',isolated)});
   report.idlePrecondition=await observeWorkerPreparedDormancy(poll,probe);assert.deepEqual(report.idlePrecondition,{prepared:true,entered:true});
   report.dormantFrameTrace=await evaluate('__vaiwlTransportExpiryTrace.slice(-128)',isolated);assert(report.dormantFrameTrace.some(r=>r.type==='HOST_UI_IDLE_RELEASE'&&r.ok));
   await session.detach();await continuity();
   await page.evaluate(()=>{const n=document.querySelector('iframe[title="工作空间"]');if(!n)throw Error('missing-owned-frame');n.remove();});
  }else await page.evaluate(()=>{const old=document.querySelector('#reading');globalThis.replacedReading=old;old.replaceWith(old.cloneNode(true));});
  await poll(()=>oldFrame.isDetached());assert.equal(await page.locator('[data-va-owned]').count(),0);
  await continuity();assert.equal(report.requests.length,before,'DOM replacement is not a native metadata request');
  // Read the shipped private status channel. A later native GET can emit an
  // independent invalidation and hide the stale-ready bug; check the waiting
  // boundary before that GET, not just eventual successful navigation.
  const focusedBeforeStatus=await page.evaluate(()=>document.hasFocus());
  const statusReady=context.waitForEvent('page');await cdp.send('Target.createTarget',{url:`chrome-extension://${id}/status.html`,background:true});const statusPage=await statusReady;await statusPage.waitForLoadState('domcontentloaded');
  report.regionStatusFocus={before:focusedBeforeStatus,after:await page.evaluate(()=>document.hasFocus())};
  assert.deepEqual(report.regionStatusFocus,{before:true,after:true},'status observation must not cause a foreground recovery');
  report.regionWaitingStatus=await statusPage.evaluate(async()=>{const {readActiveLocalStatus}=await import(chrome.runtime.getURL('src/host/local-status.mjs'));return readActiveLocalStatus({tabs:chrome.tabs});});
  assert.equal(report.regionWaitingStatus,'waiting','retired surface must enter the context wait before any new native GET');
  await statusPage.close();
  step(frameLoss?'dormant-owned-frame-loss-withdraws-old-surface':'same-document-region-replacement-withdraws-old-surface');
  // Only the existing native refresh control supplies new C2 evidence.
  await page.getByRole('button',{name:'Refresh current conversation',exact:true}).click();
  await poll(()=>report.requests.length===before+1);assert.equal(report.requests.at(-1).status,200);
  report.phase='await-region-fresh-frame';await poll(()=>frame()&&frame()!==oldFrame);renewed=frame();
  await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);
  await continuity();if(!frameLoss)assert.equal(await page.evaluate(()=>document.querySelector('#reading')!==replacedReading&&!replacedReading.isConnected),true);
  report.regionRecoveryMs=performance.now()-started;step(frameLoss?'fresh-native-context-rebuilds-reading-return-after-dormant-frame-loss':'fresh-native-context-rebuilds-reading-return-after-region-replacement',{elapsedMs:report.regionRecoveryMs});
 }else if(dormantRecovery){
  const session=await context.newCDPSession(page),worlds=[],versions=[];session.on('Runtime.executionContextCreated',e=>worlds.push(e.context));session.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await session.send('Runtime.enable');await session.send('ServiceWorker.enable');
  const evaluate=async(expression,contextId)=>{const r=await session.send('Runtime.evaluate',{expression,contextId,returnByValue:true,awaitPromise:true});assert.equal(r.exceptionDetails,undefined);return r.result.value;};
  const isolated=await poll(async()=>{for(const world of worlds.filter(w=>w.auxData?.isDefault===false)){try{if(await evaluate(`window===window.top&&chrome.runtime.id===${JSON.stringify(id)}&&typeof __vaiwlIdleProbeSession==='object'`,world.id))return world.id;}catch{}}return null;});
  assert.equal(await page.evaluate(()=>typeof globalThis.__vaiwlIdleProbeSession),'undefined');
  assert.equal(await page.evaluate(()=>typeof globalThis.__vaiwlTransportExpiryTrace),'undefined');
  readTransportExpiryTrace=()=>evaluate('globalThis.__vaiwlTransportExpiryTrace.slice(-128)',isolated);
  // Same passive frame prerequisite for formal and mutant: queued saves are
  // not visible to worker isIdle until they are dispatched. Never flush them.
  report.frameReadiness={totalSamples:0,samples:[]};let sampledFrames=null;
  const currentPair=()=>['workspace','sidebar'].map(role=>page.frames().filter(f=>f.url()===`chrome-extension://${id}/${role}.html`));
  const framesIdle=async()=>{report.frameReadiness.totalSamples++;sampledFrames=null;const pair=currentPair();if(pair.some(items=>items.length!==1))return false;
   const frames=pair.map(items=>items[0]),states=await Promise.all(frames.map(f=>within('frame-pending-work',()=>f.evaluate(()=>globalThis.__vaiwlFixtureFramePendingWork?.()??null))));
   const latest=currentPair(),same=latest.every((items,i)=>items.length===1&&items[0]===frames[i]&&!frames[i].isDetached()),ready=same&&states.every((state,i)=>framePendingWorkIsIdle(state,['workspace','sidebar'][i]));
   if(report.frameReadiness.samples.length<32)report.frameReadiness.samples.push({at:Date.now(),ready,states});if(ready)sampledFrames=frames;return ready;
  };
  const preparedProbe=createWorkerPreparedDormancyProbe({framesIdle,workerIdle:async()=>{const ready=await worker.evaluate(()=>globalThis.__vaiwlFixtureWorkerIdle());report.workerReadiness.totalSamples++;if(report.workerReadiness.samples.length<32)report.workerReadiness.samples.push({at:Date.now(),idle:ready});return ready;},attempt:()=>{const pair=currentPair();return sampledFrames&&pair.every((items,i)=>items.length===1&&items[0]===sampledFrames[i]&&!items[0].isDetached())?evaluate('__vaiwlIdleProbeSession.attempt()',isolated):null;}});
  report.idlePrecondition=await observeWorkerPreparedDormancy(poll,preparedProbe);
  try{report.idlePreconditionWorkTrace=await readIdleWorkTrace();}catch{report.idlePreconditionWorkTraceUnavailable=true;}
  assert.deepEqual(report.idlePrecondition,{prepared:true,entered:true});step('actual-dormant-close-before-worker-loss');
  const running=await poll(()=>versions.find(v=>v.scriptURL===`chrome-extension://${id}/extension/worker.mjs`&&v.runningStatus==='running'));const start=versions.length;
  await session.send('ServiceWorker.stopWorker',{versionId:running.versionId});await poll(()=>versions.slice(start).some(v=>v.versionId===running.versionId&&v.runningStatus==='stopped'));assert.equal(oldFrame.isDetached(),false);assert.equal(frame(),oldFrame);assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);await continuity();step('worker-stop-confirmed-no-receipt-replay');
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await poll(()=>oldFrame.isDetached());await continuity();assert.equal(await page.locator('[data-va-owned]').count(),0);assert.equal(report.requests.length,1);step('denied-wake-withdraws-old-projection-preserves-native-draft');
  await page.getByRole('button',{name:'Refresh current conversation',exact:true}).click();await poll(()=>report.requests.length===before+1);assert.equal(report.requests.at(-1).status,200);assert.equal(report.requests.at(-1).method,'GET');
  report.phase='await-fresh-frame-after-native-GET';await poll(()=>frame()&&frame()!==oldFrame);report.phase='fresh-frame-observed';renewed=frame();await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);await continuity();step('fresh-native-GET-READY-rebinds-in-reading');report.transport=await readTransportExpiryTrace();await session.detach();readTransportExpiryTrace=null;
 }else{
 // One user-triggered refresh midway through the real old receipt lifetime.
 // No periodic requests, fake clock, worker keepalive or owner hooks.
 await page.waitForTimeout(30000);await continuity();
 await page.getByRole('button',{name:'Refresh current conversation',exact:true}).click();
 await poll(()=>report.requests.length===before+1);assert.deepEqual(report.requests.at(-1).status,200);assert.equal(report.requests.at(-1).method,'GET');
 await poll(()=>oldFrame.isDetached()&&frame()&&frame()!==oldFrame);
 renewed=frame();await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);await continuity();step('one-native-same-route-GET-replaces-old-frame-and-restores-reading');
 const originalDeadline=report.requests[0].at+65000;while(Date.now()<originalDeadline)await page.waitForTimeout(Math.min(30000,originalDeadline-Date.now()));
 assert(Date.now()-report.requests[0].at>=65000);assert(Date.now()-report.requests[1].at<60000);assert.equal(frame(),renewed);assert.equal(renewed.isDetached(),false);await continuity();
 report.realReceiptWindow={sinceOriginalResponseMs:Date.now()-report.requests[0].at,sinceReplacementResponseMs:Date.now()-report.requests[1].at};
 step('new-selection-survives-original-receipt-expiry-with-no-more-native-requests');
 }
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);await renewed.getByText('Ordinary conversation',{exact:true}).waitFor();
 const scopes=await within('scope-oracle',()=>renewed.evaluate(async()=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});}finally{base.close();}}));assert.deepEqual(scopes,[scopeKey]);await continuity();step('new-projection-same-nonfirst-team-no-personal-writes');
 if(transportExpiry)assert.equal(report.requests.length,1);else assert.equal(report.requests.length,2);assert.deepEqual(report.errors,[]);await verifyPackage();report.status=frameLoss?'PASS_NARROW_OFFLINE_DORMANT_FRAME_LOSS':regionReplacement?'PASS_NARROW_OFFLINE_REGION_REPLACEMENT':transportExpiry?'PASS_NARROW_OFFLINE_TRANSPORT_EXPIRY':dormantRecovery?'PASS_NARROW_OFFLINE_DORMANT_RECOVERY':'PASS_NARROW_OFFLINE_REPLACEMENT';report.browserVersion=context.browser().version();
}catch(error){if(readTransportExpiryTrace)try{report.transport=await readTransportExpiryTrace();}catch{}report.status=context?'FAIL':'NOT_RUN_BROWSER_STARTUP';report.error=error.stack;process.exitCode=1;try{report.failure=await within('failure-dom',()=>page?.evaluate(()=>({state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,frames:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length,returns:document.querySelectorAll('[aria-label="返回工作空间"]').length})));}catch(error){report.diagnosticError=String(error);}}
finally{endTransportOwnerObservation?.();if(readIdleWorkTrace)try{report.idleWorkTrace=await readIdleWorkTrace();}catch{report.idleWorkTraceUnavailable=true;}const clean=await cleanupOwnedResources(report,[['package-integrity',verifyPackage],['context-close',()=>within('context-close',()=>browserHandle?browserHandle.close():context?.close(),10000)],['server-close',()=>within('server-close',()=>server.close())],['network-guard',async()=>{if(networkGuard){report.networkGuard=networkGuard.snapshot();await networkGuard.close();}}],['source-integrity',async()=>{report.sourceChangedDuringRun=(await Promise.all(Object.entries({...manifest.sourceHashes,...fixtureHashes}).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);assert.equal(report.sourceChangedDuringRun,false);}]]);if(!clean)process.exitCode=1;await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error,results:report.results,requests:report.requests}));
