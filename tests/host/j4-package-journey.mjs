import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
import {collectJ4ContentLifecycle} from './j4-content-lifecycle-collector.mjs';
import {installJ4GrantObserver} from './j4-grant-observer.mjs';
import {createJ4LifecycleOrderTracePackage,verifyJ4LifecycleOrderTracePackage} from './j4-lifecycle-order-trace.mjs';
import {inspectJ3Failure} from './j3-failure-inspection.mjs';
import {createBackgroundAuxiliaryPage} from './background-auxiliary-page.mjs';
import {probeJ4HistoricalCodec} from './j4-codec-roundtrip.mjs';
import {finalizeJ4Report} from './j4-report-cleanup.mjs';
import {createColdTracePackage,verifyColdTracePackage} from './cold-context-trace.mjs';
import {createJ4ReadBudgetTracePackage,verifyJ4ReadBudgetTracePackage} from './j4-read-budget-trace.mjs';
import {runJ4JointInterruption} from './j4-joint-interruption.mjs';
import {runJ4EvidenceRecovery} from './j4-evidence-recovery.mjs';
import {runJ4EvidenceInterruption} from './j4-evidence-interruption.mjs';
/** Continuous C2/asset/recovery/lifecycle journey. Remaining SYS-01/schema cases
 * stay explicit; no directly seeded IDB, grants, ACKs or synthetic native delta. */
import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {packageHost,verifyHost} from '../../extension/package.mjs';import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';import {j4AssetBackup,J4_REF} from './fixtures/j4-assets.mjs';import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
export const j4Remaining=Object.freeze(['SYS-01 default before-evidence continuous segment has scoped evidence; remaining combinations require separate actual records','SYS-03 old Host codec before/after-evidence roundtrips and standalone asset upgrades have scoped evidence; re-enable stability and remaining combinations remain open','Remaining supported-profile matrix and lifecycle surface combinations']);
export const contextScope=id=>({verified:true,provider:'chatgpt',accountId:'principal_'+hash(JSON.stringify(['chatgpt-principal-v1','user-host-fixture'])),organizationId:'context_'+hash(JSON.stringify(['chatgpt-context-v1','user-host-fixture',id]))});
// Independent continuous SYS-03 slice; old flags retain their preparation semantics.
function unpreparedAfterEvidenceCodec(env){
 const enabled=env.FREE_J4_UNPREPARED_AFTER_EVIDENCE_CODEC==='1';
 if(enabled&&['FREE_J4_UNPREPARED_AFTER_EVIDENCE','FREE_J4_AFTER_EVIDENCE','FREE_J4_BEFORE_NATIVE_COMMIT','FREE_J4_CODEC_ROUNDTRIP','FREE_J4_CODEC_BEFORE_EVIDENCE','FREE_J4_SCOPE_TRACE','FREE_J4_READ_BUDGET_TRACE','FREE_J4_LIFECYCLE_ORDER_TRACE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY'].some(key=>env[key]==='1'))throw Error('unprepared-after-evidence-codec-requires-exclusive-journey');
 return enabled;
}
export function j4CodecScenario(env={}){if(unpreparedAfterEvidenceCodec(env))return 'AFTER_EVIDENCE';const before=env.FREE_J4_CODEC_BEFORE_EVIDENCE==='1',after=env.FREE_J4_CODEC_ROUNDTRIP==='1';if(before&&['FREE_J4_CODEC_ROUNDTRIP','FREE_J4_AFTER_EVIDENCE','FREE_J4_SCOPE_TRACE','FREE_J4_READ_BUDGET_TRACE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY'].some(k=>env[k]==='1'))throw Error('before-evidence-codec-requires-default-unprepared-journey');if(after&&env.FREE_J4_AFTER_EVIDENCE!=='1')throw Error('codec-roundtrip-requires-after-evidence-boundary');return before?'BEFORE_EVIDENCE':after?'AFTER_EVIDENCE':null;}
export function j4BeforeNativeCommitScenario(env={}){unpreparedAfterEvidenceCodec(env);const enabled=env.FREE_J4_BEFORE_NATIVE_COMMIT==='1';if(enabled&&['FREE_J4_CODEC_ROUNDTRIP','FREE_J4_CODEC_BEFORE_EVIDENCE','FREE_J4_AFTER_EVIDENCE','FREE_J4_SCOPE_TRACE','FREE_J4_READ_BUDGET_TRACE','FREE_J4_LIFECYCLE_ORDER_TRACE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY'].some(k=>env[k]==='1'))throw Error('before-native-commit-requires-unprepared-exclusive-journey');return enabled;}
export function j4AfterEvidenceScenario(env={}){
 if(unpreparedAfterEvidenceCodec(env))return Object.freeze({afterEvidence:true,preparedBudget:false,scenario:'UNPREPARED_AFTER_EVIDENCE_CODEC'});
 const unprepared=env.FREE_J4_UNPREPARED_AFTER_EVIDENCE==='1',preparedBudget=env.FREE_J4_AFTER_EVIDENCE==='1';
 if(unprepared&&['FREE_J4_AFTER_EVIDENCE','FREE_J4_BEFORE_NATIVE_COMMIT','FREE_J4_CODEC_ROUNDTRIP','FREE_J4_CODEC_BEFORE_EVIDENCE','FREE_J4_SCOPE_TRACE','FREE_J4_READ_BUDGET_TRACE','FREE_J4_LIFECYCLE_ORDER_TRACE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY'].some(key=>env[key]==='1'))throw Error('unprepared-after-evidence-requires-exclusive-journey');
 return Object.freeze({afterEvidence:unprepared||preparedBudget,preparedBudget,scenario:unprepared?'UNPREPARED_AFTER_EVIDENCE':preparedBudget?'PREPARED_BUDGET_AFTER_EVIDENCE_NOT_DEFAULT_J4':'DEFAULT_J4'});
}
// Select only after the original failure. A primary-tab closure cannot explain
// the peer timeout; never infer peer readiness from another tab's session.
export function selectJ4FailurePage(error,primaryPage,peerPage){
 const peer=peerPage&&error?.message==='J4-peer-current-scope-timeout';
 return {role:peer?'peer':'primary',page:peer?peerPage:primaryPage};
}
// Capture at the already-awaited hop boundary, before disable/uninstall can
// destroy the worker. Never inspect a paused commit boundary or prewarm a worker.
export async function recordJ4JointDiagnostic(report,facts,capture=null){
 (report.jointDiagnostics??=[]).push(facts);
 if(capture&&['joint-peer-native-hop','joint-peer-native-hop-state'].includes(facts?.stage))await capture(facts.stage);
}
export async function inspectJ4FailureAfterError(report,options,inspect=inspectJ3Failure){if(report.status!=='FAIL'||!options?.context||!options?.page||!options?.browser||!options?.extensionId)return;try{report.failureInspection=await inspect(options);}catch{report.failureInspection={error:'failure-inspection-unavailable'};}}
export function j4Status(steps){return steps.some(s=>s.status==='FAIL')?'FAIL':'PARTIAL_J4_NOT_ACCEPTED';}
// Recovery revokes source metadata. Shared identity/route survives, its old title does not.
export function assertRecoveredUnknownLink(link,{id,nativeUrl}){
 assert.equal(link.id,id);assert.equal(link.href,nativeUrl);assert.notEqual(link.disabled,'true');
 assert.equal(link.text.trim(),'名称暂不可用');
 return link;
}
// A rendered row is not yet an enabled navigation plan: frame reads fence
// delegated controls until their finalization. Share the original row deadline.
export async function waitForRecoveredUnknownLink(locator,expected,{now=()=>performance.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const start=now(),remaining=()=>{const elapsed=now()-start;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=15000)throw Error('J4-recovered-link-deadline');return 15000-elapsed;};
 return withRequestDeadline(async()=>{
  await locator.waitFor({timeout:remaining()});remaining();
  while(true){
   const link=await locator.evaluate(el=>({id:el.getAttribute('data-ref-id'),href:el.getAttribute('href'),disabled:el.getAttribute('aria-disabled'),text:el.textContent??''}));remaining();
   if(link.disabled!=='true')return assertRecoveredUnknownLink(link,expected);
   await pause(Math.min(50,remaining()));
  }
 },{timeoutMs:15000,now});
}
export async function runJ4(output=join(tmpdir(),'free-j4-package-journey.json')){
 const afterEvidenceScenario=j4AfterEvidenceScenario(process.env);
 const beforeNativeCommit=j4BeforeNativeCommitScenario(process.env);
 const lifecycleOrderEnabled=process.env.FREE_J4_LIFECYCLE_ORDER_TRACE==='1';
 if(lifecycleOrderEnabled&&['FREE_J4_SCOPE_TRACE','FREE_J4_READ_BUDGET_TRACE','FREE_J4_CODEC_ROUNDTRIP','FREE_J4_CODEC_BEFORE_EVIDENCE','FREE_J4_AFTER_EVIDENCE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY'].some(k=>process.env[k]==='1'))throw Error('lifecycle-order-trace-requires-unmodified-package-slot');
 const readBudgetTraceEnabled=process.env.FREE_J4_READ_BUDGET_TRACE==='1';
 if(readBudgetTraceEnabled&&['FREE_J4_SCOPE_TRACE','FREE_J4_AFTER_EVIDENCE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY','FREE_J4_CODEC_ROUNDTRIP','FREE_J4_CODEC_BEFORE_EVIDENCE'].some(k=>process.env[k]==='1'))throw Error('read-budget-trace-requires-original-default-J4');
 const codecScenario=j4CodecScenario(process.env);
 if(process.env.FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY==='1'&&(process.env.FREE_J4_NATURAL_ENTRY_RECOVERY!=='1'||process.env.FREE_J4_AFTER_EVIDENCE==='1'||process.env.FREE_J4_SCOPE_TRACE==='1'))throw Error('natural-entry-continuation-requires-unprepared-nondiagnostic-followup');
 if(process.env.FREE_J4_CODEC_ROUNDTRIP==='1'&&process.env.FREE_J4_AFTER_EVIDENCE!=='1')throw Error('codec-roundtrip-requires-after-evidence-boundary');
 const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
 const dir=await mkdtemp(join(tmpdir(),'vaiwl-j4-')),server=await createVariantHostFixtureServer({profile:'MODERN',journey:'J4',interruption:true}),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true,offlineExistingSend:true,offlineHistory:true});
 const manifestBytes=await readFile(join(built.unpacked,'build-manifest.json')),manifest=JSON.parse(manifestBytes),files=['j4-content-lifecycle-collector.mjs','j4-grant-observer.mjs','j4-lifecycle-order-trace.mjs','j4-before-native-commit.mjs','j4-before-native-recovery.mjs','j3-failure-inspection.mjs','j3-failure-closures.mjs','background-auxiliary-page.mjs','j4-read-budget-trace.mjs','loaded-worker-bytes.mjs','j4-natural-entry-recovery.mjs','j4-codec-roundtrip.mjs','historical-host-runtime.mjs','historical-package.mjs','fixtures/budget-expiry-wait.mjs','expected/modern.mjs','j4-debugger-transport.mjs','j4-report-cleanup.mjs','cold-context-trace.mjs','j4-package-journey.mjs','j4-evidence-interruption.mjs','j4-evidence-recovery.mjs','j4-joint-interruption.mjs','fixtures/j4-interruption.mjs','native-visibility-browser.mjs','isolated-browser-cleanup.mjs','historical-network-guard.mjs','fixtures/variants-server.mjs','fixtures/variants-native.mjs','fixtures/j4-native-context.mjs','fixtures/j4-assets.mjs','fixtures/native.mjs','fixtures/legacy.html','fixtures/native.css'];
 const sourceHashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
 const report={specRevision:'VA-HOST/1.1 FINAL',profile:'MODERN_C2_CONVERSATION_GET_OFFLINE',evidence:'S_CONTINUOUS_REAL_PACKAGED_MV3_J4_SEGMENT',sourceCommit:process.env.FREE_SOURCE_COMMIT??null,sourceHashes:manifest.sourceHashes,runnerFixtureHashes:sourceHashes,buildManifestHash:hash(manifestBytes),fixture:server.manifest,realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',limitations:j4Remaining,steps:[],errors:[]};
 let trace=null,readBudgetTrace=null,lifecycleOrderTrace=null;
 let handle,context,id,probe,controller,worker,cdp,primaryPage,peerPage;const record=(name,details={})=>report.steps.push({name,status:'PASS',...details});
 async function captureLifecycleOrder(stage){if(lifecycleOrderTrace){report.lifecycleOrderSnapshots??=[];if(report.lifecycleOrderSnapshots.length>=16)return;const workers=(context?.serviceWorkers()??[]).filter(w=>w.url()===`chrome-extension://${id}/extension/worker.mjs`);if(!workers.length){report.lifecycleOrderSnapshots.push({stage,unavailable:true});return;}for(const latest of workers){let timer;try{const rows=await Promise.race([latest.evaluate(()=>globalThis.__vaiwlJ4LifecycleOrder??null),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('worker-trace-unavailable')),1500);})]);report.lifecycleOrderSnapshots.push({stage,rows});}catch{report.lifecycleOrderSnapshots.push({stage,unavailable:true});}finally{clearTimeout(timer);}}}}
 async function capturePeerLifecycle(stage){
  if(!lifecycleOrderTrace)return;
  const snapshots=report.peerContentLifecycleSnapshots??=[];if(snapshots.length>=16)return;
  const workers=(context?.serviceWorkers()??[]).filter(w=>w.url()===`chrome-extension://${id}/extension/worker.mjs`);
  snapshots.push({stage,...await collectJ4ContentLifecycle({context,page:peerPage,extensionId:id,worker:workers.length===1?workers[0]:null})});
 }
 async function captureReadBudget(stage){
  if(!readBudgetTrace)return;
  const workers=(context?.serviceWorkers()??[]).filter(w=>w.url().startsWith(`chrome-extension://${id}/`));
  if(!workers.length)(report.readBudgetSnapshots??=[]).push({stage,unavailable:true});
  for(const current of workers){let timer;try{
   const snapshot=await Promise.race([current.evaluate(()=>globalThis.__j4ReadBudgetTrace?JSON.parse(JSON.stringify(globalThis.__j4ReadBudgetTrace)):null),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('diagnostic-worker-unavailable')),1500);})]);
   (report.readBudgetSnapshots??=[]).push({stage,snapshot:snapshot??null});
  }catch{(report.readBudgetSnapshots??=[]).push({stage,unavailable:true});}finally{clearTimeout(timer);}}
 }
 const frame=page=>page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);
 async function mounted(page){await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000,polling:100});const f=frame(page);assert(f);await f.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:15000});return f;}
 async function auxiliaryOperation(kind,work){
  const frames=context.pages().filter(p=>p.url().startsWith(server.origin+'/')).flatMap(p=>p.frames().filter(f=>f===p.mainFrame()||f.url()===`chrome-extension://${id}/workspace.html`));
  assert(frames.length>0,'missing-native-surfaces-for-auxiliary-oracle');
  const state=f=>f.evaluate(()=>({generation:globalThis.__j4AuxGeneration,visibility:document.visibilityState,focused:document.hasFocus(),events:globalThis.__j4AuxEvents}));
  const before=await Promise.all(frames.map(state));for(const surface of before)assert(typeof surface.generation==='string'&&Number.isSafeInteger(surface.events?.count),'missing-auxiliary-surface-recorder');const result=await work();
  const after=await Promise.all(frames.map(state));
  (report.auxiliarySurfaceChecks??=[]).push({kind,before,after});assert.deepEqual(after,before,'auxiliary-page-changed-native-focus-or-visibility');return result;
 }
 async function openAuxiliary(url){
  return auxiliaryOperation('open',()=>createBackgroundAuxiliaryPage({context,cdp,url}));
 }
 async function closeProbe(){if(probe&&!probe.isClosed())await auxiliaryOperation('close',()=>probe.close());probe=null;}
 async function inspector(){if(!probe||probe.isClosed())probe=await openAuxiliary(`chrome-extension://${id}/workspace.html`);return probe;}
 async function assets(scope){return (await inspector()).evaluate(async scope=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{WorkspaceRepository}=await import(chrome.runtime.getURL('src/data/repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));const base=new ScopeRepository({indexedDB});try{const state=(await new WorkspaceRepository({baseRepository:base}).read(scope)).state;const subset={identities:state.identities,workspaces:state.workspaces,placements:state.placements,workingSet:state.preferences.workingSet??null,savedSnippets:state.preferences.savedSnippets??null,humanRefs:Object.fromEntries(Object.entries(state.refs).filter(([k])=>k==='33333333-3333-4333-8333-333333333333'))};return {hash:digest(subset),counts:{identities:Object.keys(subset.identities).length,workspaces:Object.keys(subset.workspaces).length,placements:Object.keys(subset.placements).length,snippets:subset.savedSnippets?.value?.length??0,workingSet:subset.workingSet?.value?.refs?.length??0,humanRefs:Object.keys(subset.humanRefs).length}};}finally{base.close();}},scope);}
 // Explicit TEST_ONLY corruption of one already production-created root; no facts/grants/ACKs are injected.
 async function faultNativeRoot(scope){return (await inspector()).evaluate(async scope=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));const base=new ScopeRepository({indexedDB});try{const key=base.scopeOrThrow(scope).key,db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),q=store.get(key);let result;q.onsuccess=()=>{const root=q.result;if(!root||root.key!==key||root.payload?.scopeKey!==key||!Object.keys(root.payload.sources??{}).length||root.checksum!==digest(root.payload)){tx.abort();return;}const damaged={...root,checksum:'0'.repeat(64)};result={authority:'TEST_ONLY_CHECKSUM_FAULT',beforeRootDigest:digest(root),afterRootDigest:digest(damaged),payloadUnchanged:digest(root.payload)===digest(damaged.payload),changedFields:['checksum']};store.put(damaged);};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error??Error('missing-real-generated-root'));});}finally{base.close();}},scope);}
 async function repairedNative(scope){return (await inspector()).evaluate(async scope=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs'));const base=new ScopeRepository({indexedDB});try{const facts=await new NativeRepository({baseRepository:base}).read(scope);return {refs:Object.keys(facts.refs).length,sources:Object.keys(facts.sources).length,allSourcesRevoked:Object.values(facts.sources).every(s=>s.revoked===true),sourceStates:Object.fromEntries(Object.entries(facts.sources).map(([id,s])=>[id,{generation:s.generation,revoked:s.revoked}])),currentRefSource:facts.refs['33333333-3333-4333-8333-333333333333']?.sourceId??null};}finally{base.close();}},scope);}
 async function scopeOf(page){const f=frame(page);assert(f);await f.waitForFunction(()=>globalThis.j4LastScope,null,{timeout:15000});return f.evaluate(()=>j4LastScope);}
 async function privateState(frames){const states=[];for(const f of frames){if(f.isDetached()){states.push({detached:true,privatePresent:false});continue;}try{states.push(await f.evaluate(()=>{let privatePresent=false;const visit=root=>{for(const n of root.querySelectorAll('*')){if(n.shadowRoot)visit(n.shadowRoot);for(const c of n.childNodes)if(c.nodeType===Node.TEXT_NODE&&['Research','Ordinary conversation','J4 retained private human title'].some(s=>(c.textContent??'').includes(s)))privatePresent=true;}};visit(document);return {detached:false,privatePresent};}));}catch(error){if(!f.isDetached())throw error;states.push({detached:true,privatePresent:false});}}return {absent:states.every(s=>!s.privatePresent),frames:states};}
 async function absent(frames){const until=Date.now()+10000;let state;do{state=await privateState(frames);if(state.absent)return state;await new Promise(r=>setTimeout(r,100));}while(Date.now()<until);assert.fail('private-projection-survived:'+JSON.stringify(state));}
 async function native(page,suffix){await page.locator('textarea').press('End');await page.locator('textarea').pressSequentially(suffix);const value=await page.evaluate(()=>({sameDocument:document===j4Document,sameEditor:document.querySelector('textarea')===j4Editor,draft:j4Editor.value,focused:document.activeElement===j4Editor,pageHides:j4PageHides,openOwned:document.querySelectorAll('[data-va-owned]:popover-open').length,readingVisible:getComputedStyle(document.querySelector('#reading')).visibility,historyVisible:getComputedStyle(document.querySelector('aside nav[aria-label="Chat history"]')).visibility}));assert(value.sameDocument&&value.sameEditor&&value.focused);assert.equal(value.pageHides,0);assert.equal(value.openOwned,0);assert.equal(value.readingVisible,'visible');assert.equal(value.historyVisible,'visible');return value;}
 async function unrefreshedPeer(page,oldFrames,suffix){
  const frames=[...new Set([...oldFrames,...page.frames().filter(f=>f.url().startsWith(`chrome-extension://${id}/`))])];
  const privateProjection=await absent(frames);
  // Assert before focusing the editor: native focus itself can dismiss a mask.
  const surface=await page.evaluate(()=>({openOwned:document.querySelectorAll('[data-va-owned]:popover-open').length,reading:getComputedStyle(document.querySelector('#reading')).visibility,history:getComputedStyle(document.querySelector('aside nav[aria-label="Chat history"]')).visibility}));
  assert.deepEqual(surface,{openOwned:0,reading:'visible',history:'visible'});
  return {privateProjection,surface,native:await native(page,suffix)};
 }
 async function mark(page,draft){await page.locator('textarea').fill(draft);await page.evaluate(()=>{globalThis.j4Document=document;globalThis.j4Editor=document.querySelector('textarea');globalThis.j4PageHides=0;addEventListener('pagehide',()=>j4PageHides++);});}
 try{
  if(lifecycleOrderEnabled){lifecycleOrderTrace=await createJ4LifecycleOrderTracePackage(built.unpacked,join(dir,'j4-lifecycle-order-extension'));report.evidence='DIAGNOSTIC_ONLY_J4_LIFECYCLE_ORDER';report.lifecycleOrderInstrumentation=lifecycleOrderTrace;}
  trace=process.env.FREE_J4_SCOPE_TRACE==='1'?await createColdTracePackage(built.unpacked,join(dir,'j4-scope-trace-extension')):null;if(trace){report.evidence='DIAGNOSTIC_ONLY_INSTRUMENTED_J4_BASELINE';report.instrumentation=trace;await verifyColdTracePackage(trace);}
  if(readBudgetTraceEnabled){readBudgetTrace=await createJ4ReadBudgetTracePackage(built.unpacked,join(dir,'j4-read-budget-trace-extension'));report.evidence='DIAGNOSTIC_ONLY_J4_READ_BUDGET_TRACE';report.instrumentation=readBudgetTrace;await verifyJ4ReadBudgetTracePackage(readBudgetTrace);}
  handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',profileDir:join(dir,'profile'),headed:process.env.FREE_CHROME_HEADED==='1'});context=handle.context;report.browserPrecondition=handle.diagnostic;
  report.auxiliaryObserver='BACKGROUND_EXACT_TARGET_WITH_NATIVE_SURFACE_INVARIANCE';await context.addInitScript(()=>{globalThis.__j4AuxGeneration=crypto.randomUUID();globalThis.__j4AuxEvents={count:0,recent:[]};for(const type of ['focus','blur','visibilitychange'])addEventListener(type,()=>{const value=globalThis.__j4AuxEvents;value.count++;if(value.recent.length===32)value.recent.shift();value.recent.push({type,visibility:document.visibilityState,focused:document.hasFocus()});});});
  await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
  await context.addInitScript(installJ4GrantObserver);
  cdp=await handle.browser.newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:lifecycleOrderTrace?.unpacked??readBudgetTrace?.unpacked??trace?.unpacked??built.unpacked}));worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');assert(await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}}));
  const a=primaryPage=await context.newPage();a.on('pageerror',e=>report.errors.push(e.message));await a.goto(server.origin+'/c/'+J4_REF);await mounted(a);
  const b=peerPage=await context.newPage();b.on('pageerror',e=>report.errors.push(e.message));await b.goto(server.origin+'/c/'+J4_REF);await mounted(b);
  const team=contextScope('account-host-team'),personal=contextScope('account-host-personal'),key=s=>JSON.stringify([s.provider,s.accountId,s.organizationId]);assert.equal(await scopeOf(a),key(team));assert.equal(await scopeOf(b),key(team));record('two-native-tabs-authenticated-C2-team-context-not-first-roster-entry');
  await a.bringToFront();await a.locator('#account-button').click();const navigated=a.waitForNavigation();await a.locator('#native-dialog').getByRole('button',{name:'Switch to Personal',exact:true}).click();await navigated;await mounted(a);assert.equal(await scopeOf(a),key(personal));assert.equal(await scopeOf(b),key(team));assert(server.snapshot().nativeRequests.some(r=>r.context==='account-host-personal'));assert.equal(server.snapshot().actions['context-switch'],1);record('native-account-menu-switch-personal-A-retains-team-B-with-distinct-authenticated-contexts');
  let f=frame(a);await f.getByRole('button',{name:'工作空间设置',exact:true}).click();await f.getByRole('button',{name:'备份与导入',exact:true}).click();const before=await assets(personal),bundle=j4AssetBackup(personal,server.origin);assert.equal(before.counts.identities,0);await a.bringToFront();await f.getByLabel('选择备份 JSON 文件',{exact:true}).setInputFiles({name:'j4-human-assets.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});await f.getByText('请核对摘要。只有点击“确认恢复”才会修改本地人工资产。',{exact:true}).waitFor();assert.deepEqual(await assets(personal),before);await a.bringToFront();await f.getByRole('button',{name:'确认恢复',exact:true}).click();await f.getByRole('button',{name:'工作空间设置',exact:true}).waitFor();const preserved=await assets(personal);assert.deepEqual(preserved.counts,{identities:1,workspaces:1,placements:1,snippets:1,workingSet:1,humanRefs:1});assert.equal((await assets(team)).counts.identities,0);record('real-backup-preview-and-explicit-import-human-assets-isolated-to-personal-scope',{assetDigest:preserved.hash,counts:preserved.counts,previewReadOnly:true});
  await captureReadBudget('after-backup-import-before-interruption');
  const controllerDir=join(dir,'controller');await mkdir(controllerDir);await writeFile(join(controllerDir,'manifest.json'),JSON.stringify({manifest_version:3,name:'J4 isolated target lifecycle controller',version:'0.0.1',permissions:['management'],content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; connect-src 'none'"}}));await writeFile(join(controllerDir,'controller.html'),'<script src="controller.js"></script>');await writeFile(join(controllerDir,'controller.js'),`const target=${JSON.stringify(id)};globalThis.setTargetEnabled=async enabled=>{if(typeof enabled!=='boolean')throw Error('invalid-state');await chrome.management.setEnabled(target,enabled);const v=await chrome.management.get(target);return {id:v.id,enabled:v.enabled};};`);const loaded=await cdp.send('Extensions.loadUnpacked',{path:controllerDir});controller=await openAuxiliary(`chrome-extension://${loaded.id}/controller.html`);assert.equal(JSON.parse(await readFile(join(built.unpacked,'manifest.json'))).permissions.includes('management'),false);
  report.continuationScenario=process.env.FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY==='1'?'NATURAL_ENTRY_FOLLOWUP_ORIGINAL_FAILURE_RETAINED':'DEFAULT_STOP_AT_FAILURE';
  report.preparationScenario=afterEvidenceScenario.scenario;
  await runJ4EvidenceInterruption({continueAfterNaturalEntry:process.env.FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY==='1',naturalEntryRecovery:process.env.FREE_J4_NATURAL_ENTRY_RECOVERY==='1',preparedBudget:afterEvidenceScenario.preparedBudget,a,b,id,server,controller,inspector,closeProbe,assets,preserved,personal,team,scopeOf,mounted,absent,record,readBudgetDiagnostic:readBudgetTrace?captureReadBudget:null,diagnosticOnly:!!trace,diagnostic:async facts=>{(report.interruptionDiagnostics??=[]).push(facts);await captureLifecycleOrder(facts.stage);}});
  if(trace){report.status='DIAGNOSTIC_ONLY_BASELINE_OBSERVED';return report;}
  report.codecScenario=codecScenario;
  report.jointInterruptionBoundary=beforeNativeCommit?'BEFORE_NATIVE_COMMIT':afterEvidenceScenario.afterEvidence?'AFTER_EVIDENCE_BEFORE_COMPLETE':'BEFORE_EVIDENCE_APPLY';
  await runJ4JointInterruption({beforeNativeCommit,packageRoot:lifecycleOrderTrace?.unpacked??readBudgetTrace?.unpacked??built.unpacked,codecRoundTrip:codecScenario?({pending,committedReceipt,afterEvidence})=>probeJ4HistoricalCodec({debugEndpoint:handle.debugEndpoint,context,cdp,controller,id,slot:built.unpacked,root:dir,origin:server.origin,scope:personal,pending,committedReceipt,afterEvidence,closeProbe,assets,preserved,record}):null,afterEvidence:afterEvidenceScenario.afterEvidence,a,b,id,server,cdp,debugEndpoint:handle.debugEndpoint,context,inspector,assets,preserved,personal,team,scopeOf,mounted,record,diagnostic:facts=>recordJ4JointDiagnostic(report,facts,lifecycleOrderTrace?capturePeerLifecycle:null)});
  assert.equal(server.snapshot().actions['send-intent']??0,2);assert.equal(server.snapshot().interruption.accepts,2);
  report.evidenceRecovery=await runJ4EvidenceRecovery({beforeNativeCommit,a,id,server,inspector,assets,preserved,personal,team,scopeOf,mounted,record});
  await a.bringToFront();await mark(a,'J4_CONTINUOUS_NATIVE_DRAFT');await a.getByRole('button',{name:'返回工作空间',exact:true}).click();f=frame(a);await f.getByRole('button',{name:'工作空间设置',exact:true}).click();await f.getByRole('button',{name:'本地数据恢复',exact:true}).click();await f.getByText('选择需要修复的本地记录。',{exact:true}).waitFor();assert.equal(await f.getByText('未发现损坏。',{exact:true}).count(),3);assert.deepEqual(await assets(personal),preserved);record('healthy-production-recovery-inspection-preserves-imported-Pro-assets',{assetDigest:preserved.hash,damagedRepair:'NOT_RUN'});await a.bringToFront();await f.getByRole('button',{name:'返回工作空间',exact:true}).click();await mounted(a);
  const fault=await faultNativeRoot(personal);assert(fault.payloadUnchanged);assert.notEqual(fault.beforeRootDigest,fault.afterRootDigest);assert.deepEqual(await assets(personal),preserved);await a.bringToFront();const sidebar=a.frames().find(f=>f.url()===`chrome-extension://${id}/sidebar.html`);assert(sidebar);await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();f=frame(a);await f.getByRole('button',{name:'修复项目与聊天索引',exact:true}).waitFor({timeout:15000});assert.deepEqual(await assets(personal),preserved);await a.bringToFront();await f.getByRole('button',{name:'修复项目与聊天索引',exact:true}).click();await f.getByRole('button',{name:'关闭派生查找',exact:true}).waitFor({timeout:15000});const repaired=await repairedNative(personal);assert(repaired.refs>0&&repaired.sources>0&&repaired.allSourcesRevoked);assert.deepEqual(await assets(personal),preserved);assert(await a.evaluate(()=>document===j4Document&&document.querySelector('textarea')===j4Editor&&j4Editor.value==='J4_CONTINUOUS_NATIVE_DRAFT'));record('explicit-native-root-checksum-fault-and-real-UI-repair-preserve-assets-draft-and-revoke-source',{fault,repaired,assetDigest:preserved.hash});
  await a.bringToFront();await f.getByRole('button',{name:'关闭派生查找',exact:true}).click();
  const unknownLink=f.locator('[data-free-list="unknown"]').locator(`a[data-ref-id="${J4_REF}"]`);
  const recoveredLink=await waitForRecoveredUnknownLink(unknownLink,{id:J4_REF,nativeUrl:server.origin+'/c/'+J4_REF});
  assert.equal(await f.getByText('Ordinary conversation',{exact:true}).count(),0);assert.equal(await f.getByText('J4 retained private human title',{exact:true}).count(),0);
  record('recovered-UNKNOWN-route-retains-identity-and-hides-revoked-titles',{link:recoveredLink,oldTitleRestoration:'not authorized; old source remains revoked'});
  await b.bringToFront();await mark(b,'J4_UNREFRESHED_PEER_DRAFT');
  const oldFrames=[...a.frames(),...b.frames()].filter(f=>f.url().startsWith(`chrome-extension://${id}/`));assert.equal((await privateState(oldFrames)).absent,false,'private-detector-positive-control');

  await closeProbe();assert.deepEqual(await controller.evaluate(()=>setTargetEnabled(false)),{id,enabled:false});const disabledPrivate=await absent(oldFrames);await a.bringToFront();const disabledNative=await native(a,'_DISABLED');assert.equal(disabledNative.draft,'J4_CONTINUOUS_NATIVE_DRAFT_DISABLED');record('actual-target-management-disable-clears-both-tabs-private-projection-and-keeps-original-native-editor',{private:disabledPrivate,native:disabledNative});
  assert.deepEqual(await controller.evaluate(()=>setTargetEnabled(true)),{id,enabled:true});await a.bringToFront();const reenabledNative=await native(a,'_REENABLED');assert.equal(reenabledNative.draft,'J4_CONTINUOUS_NATIVE_DRAFT_DISABLED_REENABLED');assert((await absent(oldFrames)).absent);assert.deepEqual(await assets(personal),preserved);record('reenable-without-page-refresh-does-not-resurrect-old-private-projection-or-change-assets',{native:reenabledNative,assetDigest:preserved.hash});
  await b.bringToFront();const peerOldFrames=oldFrames.filter(f=>f.page()===b),reenabledPeer=await unrefreshedPeer(b,peerOldFrames,'_REENABLED');assert.equal(reenabledPeer.native.draft,'J4_UNREFRESHED_PEER_DRAFT_REENABLED');record('reenabled-unrefreshed-peer-keeps-native-document-draft-and-no-private-projection',reenabledPeer);
  // Explicitly clear our fixture draft before a normal navigation; no hidden reload.
  await a.bringToFront();await a.locator('textarea').fill('');await a.reload();await mounted(a);assert.equal(await scopeOf(a),key(personal));assert.deepEqual(await assets(personal),preserved);const revalidated=await repairedNative(personal);assert(revalidated.currentRefSource);assert.equal(revalidated.sourceStates[revalidated.currentRefSource]?.revoked,false);assert(!Object.hasOwn(repaired.sourceStates,revalidated.currentRefSource));for(const sourceId of Object.keys(repaired.sourceStates))assert.deepEqual(revalidated.sourceStates[sourceId],repaired.sourceStates[sourceId]);record('fresh-native-observation-after-repair-revalidates-current-ref-with-old-sources-still-revoked',{revalidated,assetDigest:preserved.hash});await b.bringToFront();const peerAfterFreshPrimary=await unrefreshedPeer(b,peerOldFrames,'_PRIMARY_REBOUND');assert.equal(peerAfterFreshPrimary.native.draft,'J4_UNREFRESHED_PEER_DRAFT_REENABLED_PRIMARY_REBOUND');assert.deepEqual(await assets(personal),preserved);record('fresh-primary-grant-does-not-resurrect-unrefreshed-peer',{native:peerAfterFreshPrimary,assetDigest:preserved.hash});await a.bringToFront();await mark(a,'J4_UNINSTALL_NATIVE_DRAFT');await a.getByRole('button',{name:'返回工作空间',exact:true}).click();await mounted(a);const uninstallFrames=a.frames().filter(f=>f.url().startsWith(`chrome-extension://${id}/`));assert.equal((await privateState(uninstallFrames)).absent,false);await closeProbe();
  await cdp.send('Extensions.uninstall',{id});const uninstalledPrivate=await absent(uninstallFrames);await a.bringToFront();const uninstalledNative=await native(a,'_UNINSTALLED');assert.equal(uninstalledNative.draft,'J4_UNINSTALL_NATIVE_DRAFT_UNINSTALLED');record('actual-uninstall-keeps-original-native-document-operable-without-private-projection',{private:uninstalledPrivate,native:uninstalledNative,extensionDatabaseRetention:'NOT_PROMISED_OR_ASSERTED'});
  await a.locator('textarea').fill('');await a.reload();assert.equal(await a.locator('[data-va-owned]').count(),0);await a.locator('textarea').fill('J4_NATIVE_AFTER_UNINSTALL_NAVIGATION');await a.locator('#model-button').click();await a.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();assert.equal(await a.locator('textarea').inputValue(),'J4_NATIVE_AFTER_UNINSTALL_NAVIGATION');record('subsequent-native-navigation-model-and-editor-operate-after-uninstall');
  assert.equal(server.snapshot().actions['send-intent']??0,3);assert.equal(server.snapshot().interruption.accepts,3);assert.equal(report.evidenceRecovery.additionalNativeSends,1);assert.equal(server.snapshot().actions['create-project']??0,0);assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=handle.browser.version();report.status=j4Status(report.steps);process.exitCode=report.status==='FAIL'?1:2;if(lifecycleOrderTrace&&report.status!=='FAIL')report.status='DIAGNOSTIC_ONLY_J4_LIFECYCLE_ORDER';
 }catch(error){report.steps.push({name:'continuous-execution',status:'FAIL',error:error.stack});report.status=handle?'FAIL':'NOT_RUN_BROWSER_STARTUP';process.exitCode=1;const target=selectJ4FailurePage(error,primaryPage,peerPage);report.failureInspectionTarget=target.role;await inspectJ4FailureAfterError(report,{context,page:target.page,browser:handle?.browser,extensionId:id});}
 finally{
  const clean=await finalizeJ4Report(report,[
   ['lifecycle-order-snapshot',()=>captureLifecycleOrder('final-before-cleanup')],
   ['lifecycle-order-integrity',async()=>{if(lifecycleOrderTrace){await verifyJ4LifecycleOrderTracePackage(lifecycleOrderTrace);report.lifecycleOrderPackageUnchanged=true;}}],
   ['read-budget-snapshot',async()=>{await captureReadBudget('final-before-cleanup');}],
   ['read-budget-package-check',async()=>{if(readBudgetTrace){await verifyJ4ReadBudgetTracePackage(readBudgetTrace);report.instrumentedReadBudgetPackageUnchanged=true;}}],
   ['instrumented-package-check',async()=>{if(trace){await verifyColdTracePackage(trace);report.instrumentedPackageUnchanged=true;}}],
   ['browser-close',async()=>{await handle?.close();}],['fixture-close',async()=>{await server.close();}],
   ['native-action-snapshot',async()=>{report.nativeActions=server.snapshot().actions;}],
   ['source-integrity',async()=>{report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean)||(await Promise.all(Object.entries(sourceHashes).map(async([p,h])=>hash(await readFile(new URL(p,import.meta.url)))!==h))).some(Boolean);if(report.sourceChangedDuringRun)throw Error('source-changed-during-run');}],
   ['build-integrity',async()=>{report.buildManifestUnchanged=hash(await readFile(join(built.unpacked,'build-manifest.json')))===report.buildManifestHash;if(!report.buildManifestUnchanged)throw Error('build-manifest-changed');}]
  ],()=>writeFile(output,JSON.stringify(report,null,2)+'\n'));
  if(!clean)process.exitCode=1;
 }return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await runJ4(process.argv[2])));
