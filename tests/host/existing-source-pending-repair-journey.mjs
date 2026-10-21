import {waitForBudgetExpiry} from './fixtures/budget-expiry-wait.mjs';
/** Existing-source pending repair S candidate. TEST ONLY; browser execution is
 * opt-in. Two genuine fixture sends, unchanged product package and budgets.
 * This runner does not replace the continuous J4 journey or any SYS02 case.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {J4_SEND_C,J4_MIXED_TITLE} from './fixtures/j4-interruption.mjs';
import {j4AssetBackup,J4_REF} from './fixtures/j4-assets.mjs';
import {contextScope} from './j4-package-journey.mjs';
import {pauseJointDrain} from './j4-joint-interruption.mjs';
import {connectJ4Debugger} from './j4-debugger-transport.mjs';
import {faultJ4EvidenceRoot,pollJ4EvidenceRecovery} from './j4-evidence-recovery.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {createSys05StartupDeadline,waitForSys05Worker} from './sys05-startup-precondition.mjs';
import {readPendingRepairState} from './existing-source-pending-repair-browser-read.mjs';
import {PENDING_REPAIR_LIMITS,setPendingRepairStage,assertExistingSourcePending,assertCorruptPending,assertRetiredPending,assertOriginalNativeSource,assertPendingRepairBudget,observePendingRepairReplies,pendingDiagnosticError,appendPendingDiagnostic,pendingDiagnosticDeadline,capturePendingRepairFailure,pendingDiagnosticText,observePendingWorkerVersions} from './existing-source-pending-repair-oracle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const key=scope=>JSON.stringify([scope.provider,scope.accountId,scope.organizationId]);
const files=['fixtures/budget-expiry-wait.mjs','existing-source-pending-repair-journey.mjs','existing-source-pending-repair-oracle.mjs','existing-source-pending-repair-browser-read.mjs','j4-package-journey.mjs','j4-debugger-transport.mjs','j4-joint-interruption.mjs','j4-evidence-recovery.mjs','j4-evidence-interruption.mjs','j4-report-cleanup.mjs','cold-context-trace.mjs','native-visibility-browser.mjs','isolated-browser-cleanup.mjs','historical-network-guard.mjs','sys05-startup-precondition.mjs','fixtures/variants-server.mjs','fixtures/variants-native.mjs','fixtures/j4-native-context.mjs','fixtures/j4-interruption.mjs','fixtures/j4-assets.mjs','fixtures/native.mjs','fixtures/native.css','fixtures/legacy.html','fixtures/ui10-conversation-title.mjs','expected/modern.mjs'];
export function pendingRepairPlan(){return {status:'NOT_RUN',S:'NOT_RUN',scopeFeasibility:'NOT_ESTABLISHED_NORMAL_SURFACE_CAN_INVALIDATE_NATIVE_WITNESS',specRevision:'VA-HOST/1.1 FINAL',requirement:'SYS-02 / SYS-01 / J4 existing-source pending repair S slice',profile:'MODERN_C2_CONVERSATION_GET_OFFLINE',sourceCommit:process.env.FREE_SOURCE_COMMIT??null,dirtyPatchHash:process.env.FREE_DIRTY_PATCH_HASH??null,workingTreePatch:'NOT_MEASURED_BY_RUNNER',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',fullSYS02:'NOT_ESTABLISHED',fullJ4:'NOT_ESTABLISHED',limits:PENDING_REPAIR_LIMITS,steps:[],errors:[],limitations:['One existing persisted ACK source, one pending-before-Evidence-apply cut only','Missing initial ACK source, post-Evidence/pre-completion cut, capacity/quota/GC stress NOT_RUN','Full supported-profile matrix, full J4 and other SYS02 subcases NOT_RUN','Fresh post-repair send/successor ACK, unloaded branches, physical crash/disk quota NOT_RUN','G/U, physical devices, PAIA and performance/p95 NOT_RUN'],instrumentation:'PASSIVE_UI_REPLY_OBSERVER_AND_REAL_DEBUGGER_FAULT_CONTROL; NOT_PERFORMANCE_EVIDENCE'};}
/** Test scheduling only: inspect existing reservations; never reserve/reset them.
 * One current read needs session + accounts + conversation GETs and one attempt.
 * Counts omit attempt identities, so an exhausted OTHER attempt conservatively
 * waits too. This is not authority or a guarantee against concurrent consumers.
 */
export async function waitPendingRepairReadCapacity({read,wait=sleep,now=Date.now}){
 const observations=[];
 const inspect=async()=>{const budget=assertPendingRepairBudget(await read()),at=now();assert(Number.isSafeInteger(at)&&at>=budget.lastAt,'pending-repair-budget-clock');observations.push(budget);return {budget,at};};
 const available=({budget,at})=>at-budget.startedAt>=PENDING_REPAIR_LIMITS.readWindowMs||(budget.requests+3<=PENDING_REPAIR_LIMITS.maxGETs&&budget.attemptCounts.every(count=>count+1<=PENDING_REPAIR_LIMITS.maxReadAttempts)&&budget.startedAt+PENDING_REPAIR_LIMITS.readWindowMs-at>=PENDING_REPAIR_LIMITS.rpcMs);
 const first=await inspect();if(available(first))return {waitMs:0,observations};
 const waitMs=Math.max(0,first.budget.startedAt+PENDING_REPAIR_LIMITS.readWindowMs+1-first.at);
 await wait(waitMs);
 // A competing real reader may have opened and consumed another window. Do not
 // loop, reset its budget, retry a failed native action, or manufacture capacity.
 assert(available(await inspect()),'pending-repair-read-capacity-unavailable');
 return {waitMs,observations};
}
/** Read-only parent presentation diagnostics. Never capture text, URLs, drafts,
 * opaque grants, DOM markup or private runtime objects. No recovery action. */
export function pendingRepairPresentationSnapshot(){
 const count=selector=>Math.min(64,document.querySelectorAll(selector).length);
 const buttons=[...document.querySelectorAll('button[aria-label="返回工作空间"]')].slice(0,8);
 const visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden';};
 return {documentVisible:document.visibilityState==='visible',documentFocused:document.hasFocus(),ownedOpen:count('[data-va-owned]:popover-open'),ownedFrames:count('iframe[data-va-owned]'),returnControls:count('button[aria-label="返回工作空间"]'),returnVisible:buttons.filter(visible).length,returnDisabled:buttons.filter(node=>node.disabled).length,nativeDialogOpen:!!document.querySelector('#native-dialog[open]'),nativeModalCount:count('dialog:modal'),nativePopoverCount:Math.min(64,[...document.querySelectorAll(':popover-open')].filter(node=>!node.hasAttribute('data-va-owned')).length)};
}
export async function waitPendingRepairFreshWindow(budget,options){
 assertPendingRepairBudget(budget);
 return waitForBudgetExpiry(budget.startedAt,options);
}
export async function preparePendingRepairPackage(directory,origin){
 const built=packageHost(directory,{offlineOrigin:origin,offlineContext:true,offlineExistingSend:true,offlineHistory:true});
 const permissions=JSON.parse(await readFile(join(built.unpacked,'manifest.json')));
 assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*']);assert.deepEqual(permissions.permissions,['webNavigation','webRequest']);
 assert.equal(permissions.content_security_policy.extension_pages,`script-src 'self'; object-src 'none'; connect-src ${origin}`);
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');return built;
}
/** The only write fault is the existing checksum callback. Ordering is tested
 * independently; paused is a production call before the Evidence transaction.
 */
export async function faultThenStopPending({pause,inspect,assertPaused,fault,stop,confirmStopped}){
 const hit=await pause.wait(),before=await inspect(),pending=assertPaused(before);
 const injected=await fault(before);
 assert.equal(injected.payloadUnchanged,true);assert.deepEqual(injected.changedFields,['checksum']);assert.notEqual(injected.beforeRootDigest,injected.afterRootDigest);
 const damaged=await inspect();assertCorruptPending({state:damaged,pending,faultedStorageDigest:damaged.evidenceStorageDigest});
 await stop();await confirmStopped();
 return {hit,before,pending,damaged,injected};
}
/** Used by the real finally path. Every phase is independent and bounded.
 * Phase callbacks return patches; late promises never mutate the report.
 */
export async function finalizePendingRepairReport(report,steps,write,{stderr=text=>process.stderr.write(text),deadlineOptions={}}={}){
 for(const [stage,run]of steps){
  try{const patch=await pendingDiagnosticDeadline(run,{timeoutMs:6000,...deadlineOptions});if(patch)Object.assign(report,patch);}
  catch(error){appendPendingDiagnostic(report,'cleanupErrors',error,stage);}
 }
 if(report.cleanupErrors?.length){report.statusBeforeCleanup=report.status;report.status='FAIL_CLEANUP_OR_INTEGRITY';report.S='NOT_ACCEPTED';}
 try{await pendingDiagnosticDeadline(signal=>write(report,signal),{timeoutMs:6000,...deadlineOptions});report.reportWriteSucceeded=true;}
 catch(error){report.statusBeforeReportWrite=report.status;report.status='FAIL_REPORT_WRITE';report.S='NOT_ACCEPTED';report.reportWriteSucceeded=false;report.reportWriteError=pendingDiagnosticError(error);try{const diagnostic=pendingDiagnosticText(JSON.stringify({status:report.status,error:report.reportWriteError,originalError:report.error??null}),4096);stderr(diagnostic.text+(diagnostic.truncated?' [truncated]':'')+'\n');}catch{}}
 return report;
}
export async function runExistingSourcePendingRepair(output,{execute=false}={},testIO={}){
 const report=pendingRepairPlan(),writeReport=testIO.writeReport??((value,signal)=>writeFile(output,JSON.stringify(value,null,2)+'\n',{signal}));
 if(!execute)return finalizePendingRepairReport(report,[],writeReport,{stderr:testIO.stderr});
 let server,networkGuard,handle,context,built,manifest,probe,pause,debuggerCDP,id,a,b,dir,diagnosticRead,diagnosticPending;
 const lifecycleTrace={events:[],seen:0,dropped:0,truncated:false};
 const record=(name,details={})=>report.steps.push({name,status:'PASS',...details}),stage=value=>setPendingRepairStage(report,value);
 const poll=pollJ4EvidenceRecovery;
 try{
  stage('SETUP');
  dir=await (testIO.makeDirectory??mkdtemp)(join(tmpdir(),'vaiwl-existing-source-pending-'));
  report.runnerFixtureHashes=Object.fromEntries(await Promise.all(files.map(async path=>['tests/host/'+path,hash(await readFile(new URL(path,import.meta.url)))])));
  report.runnerContentHash=hash(JSON.stringify(Object.fromEntries(Object.entries(report.runnerFixtureHashes).filter(([path])=>path.includes('existing-source-pending-repair')))));
  server=await createVariantHostFixtureServer({profile:'MODERN',journey:'J4',interruption:true});report.fixture=server.manifest;
  built=await preparePendingRepairPackage(join(dir,'package'),server.origin);const bytes=await readFile(join(built.unpacked,'build-manifest.json'));manifest=JSON.parse(bytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=hash(bytes);report.packageSha256=built.archiveSha256;
  networkGuard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
  const {chromium}=await import(process.env.FREE_PLAYWRIGHT_MODULE??'../b1/tooling/node_modules/playwright/index.mjs');
  handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',profileDir:join(dir,'profile'),headed:process.env.FREE_CHROME_HEADED==='1',historicalNetworkGuard:networkGuard.config});context=handle.context;context.setDefaultTimeout(15000);report.browserPrecondition=handle.diagnostic;
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===server.origin||url.protocol==='chrome-extension:'?route.continue():route.abort();});
  await context.addInitScript(observePendingRepairReplies);
  const cdp=await handle.browser.newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));
  const startup=createSys05StartupDeadline();report.startup={kind:'WORKER_READY_FUNCTIONAL_NOT_COLD',budgetMs:30000,worker:await waitForSys05Worker(context,id,startup)};
  const personal=contextScope('account-host-personal'),team=contextScope('account-host-team');
  const frame=page=>page.frames().find(f=>!f.isDetached()&&f.url()===`chrome-extension://${id}/workspace.html`);
  const replies=async page=>{const f=frame(page);if(!f)return null;try{return await f.evaluate(()=>globalThis.__pendingRepairReplies??null);}catch(error){if(f.isDetached()||/Execution context was destroyed/.test(error.message))return null;throw error;}};
  async function ready(page,scope,ref,deadline=null){const read=async()=>{const state=await replies(page);return state?.grant&&state.scope===key(scope)&&state.currentRef===ref&&await frame(page).getByRole('button',{name:'工作空间设置',exact:true}).count()?state:null;};return deadline?deadline.poll(read,'initial-real-native-C2-and-UI'):poll(read,'real-native-C2-and-UI');}
  async function inspect(scope=personal){if(!probe||probe.isClosed()){probe=await context.newPage();await probe.goto(`chrome-extension://${id}/workspace.html`);}if(a)await a.bringToFront();return probe.evaluate(readPendingRepairState,{scope,origin:server.origin});}
  diagnosticRead=()=>{if(!probe||probe.isClosed())throw Error('failure-inspector-unavailable');return probe.evaluate(readPendingRepairState,{scope:personal,origin:server.origin});};
  async function native(){await a.bringToFront();await a.locator('#model-button').click();await a.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();}
  async function workspace(){await a.bringToFront();await poll(async()=>{if(await a.locator('[data-va-owned]:popover-open').count()===2)return true;const back=a.getByRole('button',{name:'返回工作空间',exact:true});if(await back.isVisible()){await back.click();return true;}return false;},'workspace-return');return frame(a);}
  const budgetObservations=[];report.budgetObservations=budgetObservations;
  async function budgetWindow(){const budget=assertPendingRepairBudget((await inspect()).budget);budgetObservations.push(budget);const waitMs=await waitPendingRepairFreshWindow(budget);return {waitMs,budget};}
  async function readCapacity(){const value=await waitPendingRepairReadCapacity({read:async()=>(await inspect()).budget});budgetObservations.push(...value.observations);report.readCapacityChecks??=[];report.readCapacityChecks.push({stage:report.stage,waitMs:value.waitMs,observations:value.observations});}
  stage('INITIAL_CONTEXT_AND_ASSETS');
  b=await startup.run(()=>context.newPage(),'initial-peer-page');b.on('pageerror',error=>appendPendingDiagnostic(report,'errors',error,'peer-pageerror'));await startup.run(()=>b.goto(server.origin+'/c/'+J4_REF,{timeout:startup.remaining('initial-native-navigation')}),'initial-native-navigation');await ready(b,team,J4_REF,startup);report.startup.elapsedMs=startup.elapsedMs();
  a=await context.newPage();a.on('pageerror',error=>appendPendingDiagnostic(report,'errors',error,'active-pageerror'));await a.goto(server.origin+'/c/'+J4_SEND_C);await ready(a,team,J4_SEND_C);
  await a.locator('#account-button').click();const switched=a.waitForNavigation();await a.getByRole('button',{name:'Switch to Personal',exact:true}).click();await switched;await ready(a,personal,J4_SEND_C);
  assert(server.snapshot().nativeRequests.some(row=>row.path==='/backend-api/conversation/'+J4_SEND_C&&row.context==='account-host-personal'));
  let f=frame(a);await f.getByRole('button',{name:'工作空间设置',exact:true}).click();await f.getByRole('button',{name:'备份与导入',exact:true}).click();
  const beforeAssets=(await inspect()).assets;assert.equal(beforeAssets.counts.identities,0);await a.bringToFront();await f.getByLabel('选择备份 JSON 文件',{exact:true}).setInputFiles({name:'pending-repair-human-assets.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(j4AssetBackup(personal,server.origin)))});
  await f.getByText('请核对摘要。只有点击“确认恢复”才会修改本地人工资产。',{exact:true}).waitFor();assert.deepEqual((await inspect()).assets,beforeAssets);await a.bringToFront();await f.getByRole('button',{name:'确认恢复',exact:true}).click();await ready(a,personal,J4_SEND_C);
  const preserved=(await inspect()).assets;assert.deepEqual(preserved.counts,{identities:1,workspaces:1,placements:1,snippets:1,workingSet:1,humanRefs:1});
  record('real-C2-contexts-and-production-human-asset-import',{assetDigest:preserved.hash});
  // The first send leaves the native title unchanged. Release only the fixture's
  // pre-existing response hold; no restart occurs until its ACK source exists.
  stage('FIRST_SEND_AND_ACK');
  stage('FIRST_SEND_BUDGET');await budgetWindow();stage('FIRST_SEND_NATIVE_INPUT');await native();await a.locator('#j4-rename-on-send').uncheck();await a.locator('textarea').fill('Existing source before pending repair');await a.locator('button[type="submit"]').click();
  stage('FIRST_SEND_ACK_READ');const first=await poll(()=>{const value=server.snapshot().interruption;return value.accepts===1?value.rows.at(-1):null;},'first-real-native-send');server.releaseInterruption();
  const baseline=await poll(async()=>{const value=await inspect();return Object.values(value.evidence.hints).filter(h=>h.messageId===first.id).length===1?value:null;},'persisted-first-ACK-source');
  assert.equal(baseline.native.refs[J4_SEND_C].nativeTitle,'Membership not loaded');assert.equal(baseline.continuations.filter(row=>row.state==='pending-evidence').length,0);assert.deepEqual(baseline.assets,preserved);
  record('first-real-send-persists-existing-ACK-source-before-second-send',{messageId:first.id,ACKs:1,nativeSends:1});
  stage('PRE_SECOND_BUDGET');await readCapacity();
  // Capture genuine current-frame proof before yielding to native controls.
  // It is comparison evidence only; it never authorizes later production work.
  stage('PRE_SECOND_WORKSPACE_AUTHORITY');await workspace();
  const oldAuthority=await ready(a,personal,J4_SEND_C),oldGrant=oldAuthority?.grant;assert(Boolean(oldGrant&&oldAuthority.scopeGrant),'PENDING_REPAIR_PRIOR_AUTHORITY_REQUIRED');
  stage('SECOND_NATIVE_INPUT');await native();await a.locator('#j4-rename-on-send').check();await a.locator('textarea').fill('Existing-source joint pending before Evidence repair');
  stage('WORKER_LIFECYCLE');
  const lifecycle=await context.newCDPSession(a),versions=lifecycleTrace.events;lifecycle.on('ServiceWorker.workerVersionUpdated',event=>observePendingWorkerVersions(lifecycleTrace,event));await lifecycle.send('ServiceWorker.enable');
  const running=await poll(()=>{const value=versions.filter(version=>version.scriptURL===`chrome-extension://${id}/extension/worker.mjs`).at(-1);return value?.runningStatus==='running'?value:null;},'worker-before-joint-cut');assert(Boolean(running.targetId),'PENDING_REPAIR_WORKER_TARGET_REQUIRED');
  stage('DEBUGGER_INSTALL');debuggerCDP=await connectJ4Debugger(handle.debugEndpoint);pause=await pauseJointDrain(debuggerCDP,id,{packageRoot:built.unpacked,expectedTargetId:running.targetId});stage('DEBUGGER_CONTROL');await pause.verifyControl();
  // Start the native click before waiting for its actual production breakpoint.
  stage('SECOND_SEND_AND_PENDING_CUT');await a.locator('button[type="submit"]').click();
  let sent,stopSequence;
  const cut=await faultThenStopPending({pause,inspect,assertPaused:paused=>{
   const value=server.snapshot().interruption;assert.equal(value.accepts,2);assert.equal(value.title,J4_MIXED_TITLE);sent=value.rows.at(-1);assert.notEqual(sent.id,first.id);
   diagnosticPending=paused.continuations.find(row=>row.state==='pending-evidence'&&row.evidence?.batch.hints.some(hint=>hint.messageId===sent.id));
   return assertExistingSourcePending({baseline,paused,messageId:sent.id,firstMessageId:first.id,conversationId:J4_SEND_C,title:J4_MIXED_TITLE});
  },fault:before=>probe.evaluate(faultJ4EvidenceRoot,{scope:personal,expectedRevision:before.evidence.revision}),stop:()=>{stopSequence=lifecycleTrace.seen;return lifecycle.send('ServiceWorker.stopWorker',{versionId:running.versionId});},confirmStopped:()=>poll(()=>versions.some(version=>version.sequence>stopSequence&&version.versionId===running.versionId&&version.runningStatus==='stopped'),'actual-worker-stopped')});
  await pause.close();pause=null;debuggerCDP.close();debuggerCDP=null;
  const {pending}=cut;report.pendingIdentity={operationId:pending.operationId,payloadDigest:pending.payloadDigest,sourceId:pending.admission.sourceId,nativeWitness:pending.nativeWitness,messageId:sent.id};
  record('same-transaction-native-delta-and-existing-source-pending-cut-before-evidence',{...report.pendingIdentity,breakpointBoundary:cut.hit.boundary,fault:cut.injected,workerStopConfirmed:true});
  assertCorruptPending({state:await inspect(),pending,faultedStorageDigest:cut.damaged.evidenceStorageDigest});
  stage('CORRUPT_REBIND');await a.bringToFront();await a.reload();await a.locator('[data-message-id="'+sent.id+'"]').first().waitFor();await workspace();
  const fresh=await poll(async()=>{const value=await replies(a);return value?.grant&&value.grant!==oldGrant&&value.scopeGrant!==oldAuthority.scopeGrant&&value.recovery?.corrupt&&value.recovery?.recoverable?value:null;},'fresh-grant-real-recovery-status-while-corrupt');
  assertCorruptPending({state:await inspect(),pending,faultedStorageDigest:cut.damaged.evidenceStorageDigest});
  const teamBefore=await inspect(team);assert(!Object.values(teamBefore.evidence.hints).some(row=>[first.id,sent.id].includes(row.messageId)));
  await a.bringToFront();await a.locator('textarea').fill('PENDING_REPAIR_NATIVE_DRAFT');await a.evaluate(()=>{globalThis.pendingRepairDocument=document;globalThis.pendingRepairEditor=document.querySelector('textarea');});await workspace();
  const draft=async()=>assert(await a.evaluate(()=>document===pendingRepairDocument&&document.querySelector('textarea')===pendingRepairEditor&&pendingRepairEditor.value==='PENDING_REPAIR_NATIVE_DRAFT'));
  f=frame(a);await f.getByRole('button',{name:'修复活跃度记录',exact:true}).waitFor();await draft();assert.deepEqual((await inspect()).assets,preserved);
  stage('UI_REPAIR');await a.bringToFront();await f.getByRole('button',{name:'修复活跃度记录',exact:true}).click();
  const repaired=await poll(async()=>{const value=await inspect();return value.evidence&&value.evidence.sources[pending.admission.sourceId]?.revoked===true?value:null;},'production-UI-repair-revokes-existing-ACK-source');
  assertOriginalNativeSource(repaired,pending);assert.equal(Object.values(repaired.evidence.hints).filter(row=>row.messageId===sent.id).length,0);assert.deepEqual(repaired.assets,preserved);await draft();
  record('fresh-grant-corrupt-root-keeps-pending-and-real-UI-repair-revokes-old-source',{freshGrant:true,nativeSourceUnchanged:true,assetDigest:preserved.hash,draftSameNode:true});
  // Repair notifies views but does not drain. A normal same-URL reload creates a
  // new grant and runs the existing HOST_REFRESH drain; no business RPC is sent.
  stage('REPAIR_DRAIN');await readCapacity();await a.bringToFront();await a.locator('textarea').fill('');await a.reload();await a.locator('[data-message-id="'+sent.id+'"]').first().waitFor();
  const finalGrant=await ready(a,personal,J4_SEND_C);assert(finalGrant.grant!==fresh.grant,'PENDING_REPAIR_FINAL_GRANT_FRESH');
  const retired=await poll(async()=>{const value=await inspect();return value.continuations.find(row=>row.operationId===pending.operationId)?.state==='needs-revalidation'?value:null;},'same-operation-needs-revalidation');
  const summary=assertRetiredPending({before:cut.before,state:retired,pending,messageId:sent.id,conversationId:J4_SEND_C});
  assert.deepEqual((await inspect(team)).evidence,teamBefore.evidence);assert.deepEqual((await inspect(team)).assets,teamBefore.assets);
  record('same-operation-retires-only-for-ACK-source-revocation',{operationId:summary.operationId,payloadDigest:summary.payloadDigest,reason:summary.reason,targets:summary.targets,oldACKReplayed:false});
  stage('REPEATED_REBIND');await readCapacity();await a.bringToFront();await a.reload();await a.locator('[data-message-id="'+sent.id+'"]').first().waitFor();const repeatedGrant=await ready(a,personal,J4_SEND_C);assert(repeatedGrant.grant!==finalGrant.grant,'PENDING_REPAIR_REPEAT_GRANT_FRESH');
  const repeated=await inspect();assertRetiredPending({before:cut.before,state:repeated,pending,messageId:sent.id,conversationId:J4_SEND_C});assert.deepEqual(repeated.continuations,retired.continuations);
  const peer=await inspect(team);assert.deepEqual(peer.evidence,teamBefore.evidence);assert.deepEqual(peer.assets,teamBefore.assets);budgetObservations.push(assertPendingRepairBudget(repeated.budget));
  stage('FINAL_ACCEPTANCE');const actual=server.snapshot();assert.equal(actual.interruption.accepts,2);assert.equal(actual.actions['send-intent'],2);assert.equal(actual.actions['create-project']??0,0);assert.deepEqual(report.errors,[]);
  report.budgetObservations=budgetObservations;report.nativeSends=2;report.originalACK=Object.values(cut.before.evidence.hints).find(row=>row.messageId===first.id);report.finalSummary=summary;
  record('second-real-rebind-is-idempotent-and-Team-isolated',{nativeSends:2,retiredWitnessBytesPreserved:true,summaryByteIdentity:true,peerUnchanged:true,legitimateFreshHistory:'ALLOWED_NOT_AN_OLD_ACK_REPLAY'});
  report.status='PASS_NARROW_EXISTING_SOURCE_PENDING_REPAIR';report.S='REAL_PACKAGED_MV3_EXISTING_SOURCE_PENDING_REPAIR_ONLY';report.browserVersion=handle.browser.version();
 }catch(error){
  report.status=handle?'FAIL':'NOT_RUN_BROWSER_STARTUP';report.S=handle?'EXECUTED_FAILED':'NOT_RUN';report.error=pendingDiagnosticError(error);
  await capturePendingRepairFailure(report,diagnosticRead,diagnosticPending);
  if(a&&!a.isClosed())try{report.presentationFailure=await pendingDiagnosticDeadline(()=>a.evaluate(pendingRepairPresentationSnapshot),{timeoutMs:1000});}catch{report.presentationFailure={status:'READ_ONLY_DIAGNOSTIC_UNAVAILABLE'};}
 }finally{
  await finalizePendingRepairReport(report,[
   ['debugger-detach',()=>pause?.close()],['debugger-close',()=>debuggerCDP?.close()],
   ['final-server-snapshot',()=>{if(!server)return;const value=server.snapshot();return {nativeActions:value.actions,nativeSends:value.interruption.accepts,authenticatedReadsTruncated:value.interruption.reads.length>=64,authenticatedReads:value.interruption.reads.filter(row=>row.authenticatedWorker).slice(-64).map(({held,receivedAt,finishedAt})=>({held,receivedAt,finishedAt}))};}],
   ['browser-close',()=>handle?.close()],['fixture-close',()=>server?.close()],
   ['worker-lifecycle-snapshot',()=>({workerLifecycle:{...lifecycleTrace,events:lifecycleTrace.events.map(row=>({...row}))}})],
   ['network-guard-snapshot',()=>networkGuard?{networkGuard:networkGuard.snapshot()}:undefined],
   ['network-guard-close',()=>networkGuard?.close()],
   ['source-and-package-integrity',async()=>{if(!manifest)return;const sourceChangedDuringRun=(await Promise.all(Object.entries({...manifest.sourceHashes,...report.runnerFixtureHashes}).map(async([path,expected])=>hash(await readFile(join(root,path)))!==expected))).some(Boolean);assert.equal(sourceChangedDuringRun,false);assert.equal(hash(await readFile(join(built.unpacked,'build-manifest.json'))),report.buildManifestHash);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');return {sourceChangedDuringRun};}],
  ],writeReport,{stderr:testIO.stderr});
 }
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=await runExistingSourcePendingRepair(process.argv[2]??join(tmpdir(),'existing-source-pending-repair.json'),{execute:process.argv.includes('--execute-browser')});
 console.log(JSON.stringify({status:report.status,S:report.S,fullSYS02:report.fullSYS02,fullJ4:report.fullJ4}));if(report.status.startsWith('FAIL')||report.status==='NOT_RUN_BROWSER_STARTUP')process.exitCode=1;
}
