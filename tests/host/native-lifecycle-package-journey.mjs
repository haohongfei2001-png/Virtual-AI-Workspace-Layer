import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {createLifecycleResultServer} from './fixtures/lifecycle-result-server.mjs';
import {createSys05StartupDeadline,waitForSys05Worker} from './sys05-startup-precondition.mjs';
import {verifyLoadedWorkerBytes} from './loaded-worker-bytes.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),sha=v=>createHash('sha256').update(v).digest('hex');
const C='33333333-3333-4333-8333-333333333333',CURRENT='44444444-4444-4444-8444-444444444444';
const scope={verified:true,provider:'chatgpt',accountId:'principal_'+sha(JSON.stringify(['chatgpt-principal-v1','user-host-fixture'])),organizationId:'context_'+sha(JSON.stringify(['chatgpt-context-v1','user-host-fixture','account-host-team']))};
const fixtureFiles=['tests/host/native-lifecycle-package-journey.mjs','tests/host/fixtures/lifecycle-result-service.mjs','tests/host/fixtures/lifecycle-result-server.mjs','tests/host/fixtures/lifecycle-native.mjs','tests/host/fixtures/variants-server.mjs','tests/host/fixtures/variants-native.mjs','tests/host/fixtures/native.mjs','tests/host/fixtures/native.css','tests/host/fixtures/legacy.html','tests/host/fixtures/sys05-stream-server.mjs','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs','tests/host/sys05-startup-precondition.mjs','tests/host/loaded-worker-bytes.mjs','tests/host/j4-debugger-transport.mjs'];
// Chromium may preserve its DevTools target across a stopped worker restart.
// A target ID or Playwright wrapper is not a JavaScript realm identity.
export function assertLifecycleWorkerRestart({before,after,events,stopIndex,versionId,dropped}){
 assert.equal(dropped,0);assert(Number.isSafeInteger(stopIndex)&&stopIndex>=0);
 const stopped=events.findIndex((v,i)=>i>=stopIndex&&v.versionId===versionId&&v.runningStatus==='stopped');
 assert(stopped>=0,'actual-worker-stopped-event-required');
 assert(events.some((v,i)=>i>stopped&&v.versionId===versionId&&v.runningStatus==='running'),'subsequent-worker-running-event-required');
 assert.equal(typeof before.instanceId,'string');assert(before.instanceId);assert.equal(typeof after.instanceId,'string');assert(after.instanceId);
 assert.notEqual(after.instanceId,before.instanceId,'fresh-worker-realm-required');
 assert(before.rows.some(r=>r.operationId==='delete'&&r.ok===true));
 assert.deepEqual(after.rows,[]);assert.equal(after.pending,0);assert.equal(after.active,false);
 return {actualStoppedThenRunning:true,freshRealm:true,freshResultRAMEmpty:true};
}
export async function runNativeLifecycle(output,{execute=false}={}){
 const report={status:'NOT_RUN',evidence:'S_SYNTHETIC_LIFECYCLE_CONSUMER_ONLY',INV09:'NOT_ESTABLISHED',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',sourceCommit:process.env.FREE_SOURCE_COMMIT??null,limits:['Fictional loopback result semantics only','Forced worker stop plus explicit fresh native reload, not automatic peer recovery','Existing manual asset subset initially empty; nonempty assets covered separately','Not the full INV-09 matrix or real G'],steps:[],errors:[]};
 if(!execute){await writeFile(output,JSON.stringify(report,null,2)+'\n');return report;}
 let server,guard,handle,built,worker,page;const dir=await mkdtemp(join(tmpdir(),'vaiwl-lifecycle-'));
 const record=(name,details={})=>{report.steps.push({name,...details});console.log(JSON.stringify({stage:name}));};
 report.fixtureHashes=Object.fromEntries(await Promise.all(fixtureFiles.map(async p=>[p,sha(await readFile(join(root,p)))])));
 try{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');server=await createLifecycleResultServer();guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
  built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true});verifyHost(built.unpacked);
  const manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));report.sourceHashes=manifest.sourceHashes;
  // Keep the original bootstrap, manifest, content, modules, and UI bytes.
  // One explicitly test-only composition replaces classic-runtime.js, using
  // the existing serviceFactory hook. This is NOT a normal distributable package.
  const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url)),esbuild=require('esbuild');
  const contents=`import {createHostWorkerRuntime} from ${JSON.stringify(join(root,'src/runtime/host-worker-runtime.mjs'))};import {createLoopbackLifecycleService} from ${JSON.stringify(join(root,'tests/host/fixtures/lifecycle-result-service.mjs'))};import {HOST_CONFIG} from ${JSON.stringify(join(built.unpacked,'extension/config.mjs'))};createHostWorkerRuntime({chrome,indexedDB,...HOST_CONFIG,browserBootstrap:globalThis.__vaiwlHostBootstrap,serviceFactory:createLoopbackLifecycleService});`;
  const runtime=esbuild.buildSync({stdin:{contents,resolveDir:root},bundle:true,format:'iife',platform:'browser',target:'chrome120',treeShaking:false,write:false,logLevel:'silent'}).outputFiles[0].text;
  await writeFile(join(built.unpacked,'extension/classic-runtime.js'),runtime);
  report.testComposition={file:'extension/classic-runtime.js',originalHash:manifest.files['extension/classic-runtime.js'],testHash:sha(runtime),defaultPackage:false,productionIssuerRegistered:false};
  handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??chromium.executablePath(),profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
  const {context,browser}=handle;report.browserVersion=browser.version();context.setDefaultTimeout(6000);
  await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
  const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}),startup=createSys05StartupDeadline();
  await waitForSys05Worker(context,id,startup);worker=context.serviceWorkers().find(w=>w.url()===`chrome-extension://${id}/extension/worker.mjs`);
  assert(await worker.evaluate(async()=>{try{await fetch('https://example.invalid/',{signal:AbortSignal.timeout(1000)});return false;}catch{return true;}}));
  const snapshot=()=>worker.evaluate(()=>globalThis.__lifecycleFixtureSnapshot());
  const frame=()=>page.frames().find(f=>!f.isDetached()&&f.url()===`chrome-extension://${id}/workspace.html`);
  page=await startup.run(()=>context.newPage(),'page');page.on('pageerror',e=>report.errors.push(e.message));
  await startup.run(()=>page.goto(server.origin+'/c/'+CURRENT,{timeout:startup.remaining()}),'native-navigation');
  await startup.poll(async()=>frame()&&await frame().locator(`a[data-ref-id="${C}"]`).count()>0,'initial-projection');record('real-C2-document-and-initial-native-projection',{elapsedMs:startup.elapsedMs()});
  report.loadedWorkerBefore=await verifyLoadedWorkerBytes({debugEndpoint:handle.debugEndpoint,extensionId:id,packagePath:built.unpacked});
  const facts=()=>frame().evaluate(async({scope,C})=>{
   const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs')),{WorkspaceRepository}=await import(chrome.runtime.getURL('src/data/repository.mjs')),{FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
   const base=new ScopeRepository({indexedDB});try{const native=await new NativeRepository({baseRepository:base}).read(scope),workspace=await new WorkspaceRepository({baseRepository:base}).read(scope),evidence=await new FreeEvidenceRepository({baseRepository:base}).read(scope);
    return {ref:native.refs[C]??null,fence:native.refLifecycle?.[C]??null,projectIds:Object.keys(native.projects).sort(),evidenceHash:digest(evidence),manualHash:digest({identities:workspace.state.identities,workspaces:workspace.state.workspaces,placements:workspace.state.placements,workingSet:workspace.state.preferences.workingSet??null,savedSnippets:workspace.state.preferences.savedSnippets??null,humanRefs:Object.fromEntries(Object.entries(workspace.state.refs).filter(([,r])=>r.human===true))})};
   }finally{base.close();}
  },{scope,C});
  const returnWorkspace=async deadline=>{
   if(await page.locator('[data-va-owned]:popover-open').count()===2)return;
   await deadline.run(()=>page.getByRole('button',{name:'返回工作空间',exact:true}).click({timeout:deadline.remaining()}),'native-return');
   await deadline.poll(async()=>await page.locator('[data-va-owned]:popover-open').count()===2,'workspace-visible');
  };
  const act=async(operation,label,{hold=false}={})=>{
   const phase=createSys05StartupDeadline({timeoutMs:6000});
   await phase.poll(async()=>{const value=await snapshot();return value.ownerIdle&&!value.active&&value.documents>0;},'owner-ready');
   await phase.run(()=>page.locator('#model-button').click({timeout:phase.remaining()}),'native-menu');
   if(operation==='cancel'||operation==='delete')await phase.run(()=>page.getByRole('button',{name:'Delete conversation',exact:true}).click({timeout:phase.remaining()}),'native-delete-confirmation');
   await phase.run(()=>page.getByRole('button',{name:label,exact:true}).click({timeout:phase.remaining()}),'one-native-operation');
   await phase.poll(()=>server.snapshot().ledger[operation],'server-result-recorded');
   if(hold){await returnWorkspace(phase);server.release(operation);}
   const value=await phase.poll(async()=>{const value=await snapshot();return value.rows.find(r=>r.operationId===operation);},'private-owner-result');
   await returnWorkspace(phase);return {value,phase};
  };
  const before=await facts();assert(before.ref&&!before.fence);
  for(const [operation,label]of [['cancel','Cancel deletion'],['http-only','HTTP-only result'],['wrong-target','Wrong target result']]){
   const {value,phase}=await act(operation,label);assert.equal(value.ok,false);const after=await phase.run(facts,'negative-facts');assert.equal(after.fence,null);assert.equal(after.ref.id,before.ref.id);assert.equal(server.snapshot().exists,true);record(operation+'-does-not-delete',{owner:value,elapsedMs:phase.elapsedMs()});
  }
  const deleted=await act('delete','Confirm deletion',{hold:true});assert.equal(deleted.value.ok,true);
  const deletion=await deleted.phase.poll(async()=>{const value=await facts();return value.fence?.state==='deletion-confirmed'?value:null;},'durable-deletion');
  await deleted.phase.poll(async()=>await frame().locator(`a[data-ref-id="${C}"]`).count()===0,'automatic-projection-removal');
  assert.equal(server.snapshot().exists,false);assert.equal(deletion.manualHash,before.manualHash);assert.equal(deletion.evidenceHash,before.evidenceHash);assert.deepEqual(deletion.projectIds,before.projectIds);
  record('server-delete-private-admission-CAS-automatic-UI-removal',{owner:deleted.value,elapsedMs:deleted.phase.elapsedMs()});
  const stale=createSys05StartupDeadline({timeoutMs:6000});await page.locator('#model-button').click();await page.getByRole('button',{name:'Observe stale title',exact:true}).click();await returnWorkspace(stale);
  const late=await stale.poll(async()=>{const value=await facts();return value.ref?.nativeTitle==='Stale retained native title'?value:null;},'fresh-stale-available-admitted');assert.deepEqual(late.fence,deletion.fence);assert.equal(await frame().locator(`a[data-ref-id="${C}"]`).count(),0);record('late-native-available-cannot-refill');
  // Actual worker termination. Reload creates fresh native context/handshake;
  // this is deliberately NOT an automatic peer foreground-recovery claim.
  const targets=await cdp.send('Target.getTargets'),target=targets.targetInfos.find(t=>t.type==='service_worker'&&t.url===worker.url());assert(target);
  const beforeStop=await snapshot(),workerURL=worker.url(),browserSession=await context.newCDPSession(page);
  const lifecycle={events:[],dropped:0,stopIndex:null};report.workerLifecycle=lifecycle;
  browserSession.on('ServiceWorker.workerVersionUpdated',event=>{for(const v of event.versions)if(v.scriptURL===workerURL){if(lifecycle.events.length<32)lifecycle.events.push({versionId:v.versionId,runningStatus:v.runningStatus,targetId:v.targetId??null});else lifecycle.dropped++;}});
  await browserSession.send('ServiceWorker.enable');
  const oldWorker=worker,recovery=createSys05StartupDeadline({timeoutMs:30000});
  const running=await recovery.poll(()=>{const latest=new Map(lifecycle.events.map(v=>[v.versionId,v])),matches=[...latest.values()].filter(v=>v.runningStatus==='running'&&v.targetId===target.targetId);return matches.length===1?matches[0]:null;},'worker-version');
  lifecycle.stopIndex=lifecycle.events.length;await browserSession.send('ServiceWorker.stopWorker',{versionId:running.versionId});
  await recovery.poll(()=>lifecycle.events.slice(lifecycle.stopIndex).some(v=>v.versionId===running.versionId&&v.runningStatus==='stopped'),'actual-worker-stopped');
  await recovery.run(()=>page.reload({timeout:recovery.remaining()}),'fresh-native-reload');
  await recovery.poll(()=>{const workers=context.serviceWorkers().filter(w=>w.url()===workerURL);if(workers.length!==1)return null;worker=workers[0];return worker;},'restarted-worker');
  await recovery.poll(async()=>frame()&&await frame().getByRole('button',{name:'工作空间设置',exact:true}).count()>0,'fresh-UI');
  const fresh=await snapshot(),restart=assertLifecycleWorkerRestart({before:beforeStop,after:fresh,...lifecycle,versionId:running.versionId});
  const newTarget=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url===workerURL);assert(newTarget);
  const recovered=await facts();assert.deepEqual(recovered.fence,deletion.fence);assert.equal(await frame().locator(`a[data-ref-id="${C}"]`).count(),0);
  record('actual-worker-stop-fresh-C2-retains-deletion-fence',{...restart,targetReused:newTarget.targetId===target.targetId,playwrightWrapperReused:worker===oldWorker});await browserSession.detach();
  const restored=await act('restore','Confirm restoration',{hold:true});assert.equal(restored.value.ok,true);
  const restoration=await restored.phase.poll(async()=>{const value=await facts();return value.fence?.state==='existence-confirmed'?value:null;},'durable-existence');
  assert.equal(restoration.fence.fenceId,deletion.fence.fenceId);assert.equal(server.snapshot().exists,true);assert.equal(restoration.manualHash,before.manualHash);assert.equal(restoration.evidenceHash,before.evidenceHash);
  // Raw native facts survive the tombstone. Only the independently admitted
  // restoration can make them visible again; no manual refresh masks notify.
  await restored.phase.poll(async()=>await frame().locator(`a[data-ref-id="${C}"]`).count()>0,'restored-projection');record('independent-server-existence-bound-to-exact-deletion-restores-projection',{owner:restored.value,elapsedMs:restored.phase.elapsedMs()});
  report.server=server.snapshot();report.worker=await snapshot();assert.equal(report.worker.dropped,0);assert.deepEqual(report.server.reads,['cancel','http-only','wrong-target','delete','restore']);assert.deepEqual(report.errors,[]);
  report.loadedWorkerAfter=await verifyLoadedWorkerBytes({debugEndpoint:handle.debugEndpoint,extensionId:id,packagePath:built.unpacked});
  const changed=[];for(const [p,h]of Object.entries(manifest.files))if(sha(await readFile(join(built.unpacked,p)))!==h)changed.push(p);
  assert.deepEqual(changed,['extension/classic-runtime.js']);report.packageDifferences=changed;
  report.sourceUnchanged=(await Promise.all(Object.entries({...report.sourceHashes,...report.fixtureHashes}).map(async([p,h])=>sha(await readFile(join(root,p)))===h))).every(Boolean);assert(report.sourceUnchanged);
  report.status='PASS_SYNTHETIC_MV3_LIFECYCLE_CONSUMER';
 }catch(error){report.status='FAIL';report.error=String(error.stack??error);if(server)report.server=server.snapshot();if(worker)try{report.worker=await worker.evaluate(()=>globalThis.__lifecycleFixtureSnapshot?.());}catch{report.workerUnavailable=true;}}
 finally{
  report.cleanup=(await Promise.allSettled([handle?.close(),server?.close(),guard?.close()])).map(r=>r.status);report.guardClosed=guard?.snapshot().closed;
  if(report.cleanup.some(v=>v!=='fulfilled')){report.statusBeforeCleanup=report.status;report.status='FAIL_CLEANUP';}
  await rm(dir,{recursive:true,force:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,steps:report.steps,error:report.error,cleanup:report.cleanup}));
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await runNativeLifecycle(process.argv[2]??join(tmpdir(),'vaiwl-native-lifecycle-plan.json'),{execute:process.argv.includes('--execute-browser')});
 if(report.status.startsWith('FAIL'))process.exitCode=1;
}
