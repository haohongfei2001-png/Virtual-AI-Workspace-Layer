import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
/** Partial J2/J4 prerequisites only. Run with Node; output defaults to OS tmpdir.
 * No writes to repositories, fake grants, ACKs, clock acceleration or custom worker.
 * Exit 2 is intentional when tested prerequisites pass but full journeys remain open.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir,platform} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';

export const requiredGaps=Object.freeze([
 ['J2','old-dated-conversation','The default fixture has no established old activity anchor.'],
 ['J2','successful-ACK-without-original-time','Default package fixture does not confirm a durable native send.'],
 ['J2','calibration-deadline-and-worker-restart','Requires a real accepted no-time anchor; no injected clock or evidence.'],
 ['J2','later-original-time-and-event-deduplication','Requires supported original-time evidence after the same accepted send.'],
 ['J2','shared-other-author-and-old-branch','Default fixture does not provide these continuous native journey surfaces.'],
 ['J4','active-context-A-B-switch','Default C3 package is not a C2 selected-context certification.'],
 ['J4','exit-between-native-and-evidence','No transaction fault injection in this prerequisite runner.'],
 ['J4','schema-preparation-and-recovery','No schema/recovery operation performed.'],
 ['J4','actual-disable-uninstall','Neither worker stop nor scope loss is disable/uninstall.'],
 ['J4','Pro-assets-preserved','No preexisting Pro assets in this fresh profile.'],
]);
export function resultStatus(steps,{sourceChanged=false}={}){
 if(sourceChanged||steps.some(s=>s.status==='FAIL'))return 'FAIL';
 if(steps.some(s=>s.status==='NOT_RUN'))return 'NOT_RUN_BROWSER_STARTUP';
 // This runner never claims completion, even if a caller omits its gap rows.
 return 'PARTIAL_J2_J4_NOT_ACCEPTED';
}
// Product proof TTL remains 60s; 70s is only the runner's diagnostic exit.
export const scopeLossTiming=Object.freeze({proofTTL:60000,revalidateBeforeExpiry:10000,requestDeadline:6000,schedulerAllowance:4000,outerTimeout:70000,foregroundTimeout:35000});
export function assertNaturalRevocation(sample){
 assert(Number.isFinite(sample.removedAfterProofStartMs)&&sample.removedAfterProofStartMs>=0,'missing natural revocation timestamp');
 assert(sample.removedAfterProofStartMs<=scopeLossTiming.proofTTL,'private projection survived conservative original proof deadline');
}
// The caller already owns an exact browser Page. A URL is not tab identity:
// two documents may share it, so URL lookup does not preserve Page identity.
// Playwright's Chromium implementation sends Page.bringToFront on that session.
export async function activatePrerequisitePage(page){await page.bringToFront();}
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function runPrerequisites({output=join(tmpdir(),'free-j2-j4-prerequisites.json')}={}){
 const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
 const script=fileURLToPath(import.meta.url),scriptHash=hash(await readFile(script));
 const server=await createHostFixtureServer(),dir=await mkdtemp(join(tmpdir(),'vaiwl-j2-j4-'));
 const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});
 const manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes);
 const headed=process.env.FREE_CHROME_HEADED==='1';
 const report={specRevision:'VA-HOST/1.1 FINAL',evidence:'S_REAL_DEFAULT_PACKAGED_MV3_OFFLINE_PREREQUISITES',browserMode:headed?'HEADED':'HEADLESS',display:headed?(process.env.DISPLAY??null):null,
  realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',fullJourneys:'NOT_ACCEPTED',profile:'LEGACY_OFFLINE_C3',
  sourceCommit:process.env.FREE_SOURCE_COMMIT??null,sourceCommitProvenance:'caller supplied; source hashes are authoritative',
  scriptHash,visibilityDependencies:await Promise.all(['isolated-browser-cleanup.mjs','historical-network-guard.mjs'].map(async name=>[name,hash(await readFile(new URL(name,import.meta.url)))])),visibilityLauncherHash:hash(await readFile(new URL('./native-visibility-browser.mjs',import.meta.url))),sourceHashes:manifest.sourceHashes,buildManifestHash:hash(manifestBytes),fixture:server.manifest,os:platform(),
  networkPolicy:'page allowlist plus unchanged package worker CSP; external worker fetch checked',
  steps:[],errors:[],limitations:requiredGaps.map(([journey,name,reason])=>({journey,name,status:'NOT_RUN',reason}))};
 let context,worker,id,inspectionFrame,browserHandle;const observedPages=[];
 const record=(journey,name,details={})=>report.steps.push({journey,name,status:'PASS',...details});
 async function mounted(page){
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-va-owned][id$="_workspace"]:popover-open')].some(n=>getComputedStyle(n).visibility==='visible'),null,{timeout:15000});
  const frame=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(frame);
  await frame.locator('.workspace').waitFor({timeout:15000});
  const known=frame.getByRole('button',{name:'其他已知聊天',exact:true});
  if(await known.getAttribute('aria-expanded')==='false')await known.click();
  await frame.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:15000});inspectionFrame=frame;return frame;
 }
 async function observeLoss(page){
  await page.evaluate(()=>{
   const sample=globalThis.j4ScopeLoss={startedAt:performance.now(),removedAfterProofStartMs:null,removedAfterSignalMs:null,visibility:[]};
   const visibility=e=>sample.visibility.push({state:document.visibilityState,trusted:e.isTrusted,at:performance.now()});document.addEventListener('visibilitychange',visibility);
   const observer=new MutationObserver(()=>{if(document.querySelectorAll('[data-va-owned]').length===0&&sample.removedAfterProofStartMs===null){sample.removedAfterProofStartMs=performance.now();sample.removedAfterSignalMs=performance.now()-sample.startedAt;observer.disconnect();}});
   observer.observe(document,{childList:true,subtree:true});
  });observedPages.push(page);
 }
 async function removed(page,timeout){
  // Hidden tabs do not reliably run requestAnimationFrame. A timer poll merely
  // observes the unchanged DOM; the MutationObserver records actual removal.
  await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]').length===0,null,{timeout,polling:100});
  return page.evaluate(()=>globalThis.j4ScopeLoss??null);
 }

 async function evidenceCounts(){
  return inspectionFrame.evaluate(async()=>{
   const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));
   const {FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs'));
   const base=new ScopeRepository({indexedDB});
   try{
    const db=await base.open(),keys=await new Promise((resolve,reject)=>{
     const tx=db.transaction('native_states','readonly'),request=tx.objectStore('native_states').getAll();
     tx.oncomplete=()=>resolve(request.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);
    });
    const counts=[];
    for(const key of keys){const [provider,accountId,organizationId]=JSON.parse(key);
     const value=await new FreeEvidenceRepository({baseRepository:base}).read({verified:true,provider,accountId,organizationId});
     counts.push({events:Object.keys(value.events).length,anchors:Object.values(value.hints).filter(h=>h.hintType==='observed-self-send').length});
    }return counts;
   }finally{base.close();}
  });
 }
 try{
  browserHandle=await launchNativeVisibilityBrowser({chromium,profileDir:join(dir,'profile'),headed,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium')});context=browserHandle.context;report.browserPrecondition=browserHandle.diagnostic;
  await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
  const cdp=await context.browser().newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));
  worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');
  report.workerExternalNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.workerExternalNetworkBlocked);
  const a=await context.newPage();a.on('pageerror',e=>report.errors.push(e.message));await a.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');await mounted(a);
  const before=await evidenceCounts();assert.equal(before.length,1);assert.deepEqual(before,[{events:0,anchors:0}]);
  await a.locator('textarea').fill('J2_LOCAL_UNCONFIRMED_SEND');await a.evaluate(()=>{globalThis.journeyEditor=document.querySelector('textarea');globalThis.journeyDocument=document;});
  await a.getByRole('button',{name:'Send',exact:true}).click();await a.locator('#composer output').getByText('Offline reconstruction: message not sent',{exact:true}).waitFor();
  // Observe beyond the native operation completion and adapter batch interval; not a calibration deadline.
  await a.waitForTimeout(1000);assert.deepEqual(await evidenceCounts(),before);assert.equal(server.snapshot().actions['send-intent'],1);
  assert(await a.evaluate(()=>document===journeyDocument&&document.querySelector('textarea')===journeyEditor&&journeyEditor.value==='J2_LOCAL_UNCONFIRMED_SEND'));
  record('J2','native-unconfirmed-send-does-not-create-strict-event-or-observed-ACK',{before,after:await evidenceCounts(),nativeDispatches:1,observationWindowMs:1000,oldAnchorPreservation:'NOT_RUN'});
  const b=await context.newPage();b.on('pageerror',e=>report.errors.push(e.message));await b.goto(server.url);await mounted(b);
  assert(await a.evaluate(()=>document.querySelector('textarea')===journeyEditor&&journeyEditor.value==='J2_LOCAL_UNCONFIRMED_SEND'));
  record('J4','two-native-tabs-same-authorized-scope-with-original-unsent-draft',{tabs:2,contexts:'same C3 context only'});
  await observeLoss(a);server.setPrincipal(null);await b.reload();
  // No activation/focus/navigation of A in this natural-renewal case. The
  // original 35s expectation preceded the default 50s revalidation point.
  const natural=await removed(a,scopeLossTiming.outerTimeout);await removed(b,scopeLossTiming.outerTimeout);
  report.naturalRevocation={...natural,timing:scopeLossTiming,proofStart:'document performance origin, conservatively earlier than first scope proof',outerTimeoutMeaning:'diagnostic exit only; proof TTL assertion remains 60000ms'};assertNaturalRevocation(natural);
  assert(await a.evaluate(()=>document===journeyDocument&&document.querySelector('textarea')===journeyEditor&&journeyEditor.value==='J2_LOCAL_UNCONFIRMED_SEND'));
  await a.locator('textarea').focus();assert(await a.locator('textarea').evaluate(n=>document.activeElement===n));
  await b.locator('textarea').fill('J4_NATIVE_AFTER_SCOPE_LOSS');assert.equal(await b.locator('textarea').inputValue(),'J4_NATIVE_AFTER_SCOPE_LOSS');
  record('J4','natural-renewal-authentication-loss-clears-both-private-surfaces-native-editors-remain-operable',{privateProjectionAbsent:true,nativeEditorOperable:true,nativeModel:'NOT_RUN: fixture action endpoint requires authentication',disableUninstall:'NOT_RUN',untouchedTabDraftPreserved:true,revocation:report.naturalRevocation});
  server.setPrincipal('user-host-fixture');b.once('dialog',dialog=>dialog.accept());await b.reload();await mounted(b);
  assert.deepEqual(await evidenceCounts(),before);assert.equal(server.snapshot().actions['send-intent'],1);
  record('J4','normal-authentication-restoration-renders-without-replaying-unconfirmed-send',{nativeDispatches:1});
  // Independent foreground case starts with a freshly authorized document;
  // its activation cannot affect the already completed natural-renewal case.
  const c=await context.newPage();c.on('pageerror',e=>report.errors.push(e.message));await c.goto(server.origin+'/c/44444444-4444-4444-8444-444444444444');await mounted(c);report.foregroundBrowserPrecondition={...browserHandle.diagnostic,activation:'Page.bringToFront exact Page session',syntheticVisibilityEvents:false};await activatePrerequisitePage(c);await c.waitForFunction(()=>document.visibilityState==='visible',null,{timeout:5000,polling:100});
  await c.locator('textarea').fill('J4_FOREGROUND_DRAFT');await c.evaluate(()=>{globalThis.j4OriginalDocument=document;globalThis.j4OriginalEditor=document.querySelector('textarea');});await observeLoss(c);
  await activatePrerequisitePage(b);await c.waitForFunction(()=>document.visibilityState==='hidden',null,{timeout:5000,polling:100});
  server.setPrincipal(null);await b.reload();await removed(b,scopeLossTiming.foregroundTimeout);
  const foregroundStart=await c.evaluate(()=>performance.now());await activatePrerequisitePage(c);
  const foreground=await removed(c,scopeLossTiming.foregroundTimeout);report.foregroundRevocation={...foreground,elapsedSinceActivationMs:foreground.removedAfterProofStartMs-foregroundStart};
  assert(foreground.visibility.some(e=>e.state==='hidden'&&e.trusted));assert(foreground.visibility.some(e=>e.state==='visible'&&e.trusted));assert(report.foregroundRevocation.elapsedSinceActivationMs>=0,'revocation must follow real foreground activation');
  assert(await c.evaluate(()=>document===j4OriginalDocument&&document.querySelector('textarea')===j4OriginalEditor&&j4OriginalEditor.value==='J4_FOREGROUND_DRAFT'));
  assert.equal(await b.locator('[data-va-owned]').count(),0);assert.equal(server.snapshot().actions['send-intent'],1);
  record('J4','real-tab-foreground-revalidation-clears-private-projection-preserves-original-draft',{revocation:report.foregroundRevocation,outerTimeoutMs:scopeLossTiming.foregroundTimeout,naturalCaseIndependent:true});
  assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=context.browser().version();
 }catch(error){report.failureObservations=await Promise.all(observedPages.map(async page=>{try{return await page.evaluate(()=>({url:location.href,owned:document.querySelectorAll('[data-va-owned]').length,state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,loss:globalThis.j4ScopeLoss}));}catch{return {unavailable:true};}}));report.nativeRequests=server.snapshot().requests;report.steps.push({journey:'prerequisites',name:'execution',status:context?'FAIL':'NOT_RUN',error:error.stack});}
 finally{
  await browserHandle?.close();await server.close();
  report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);
  report.scriptChangedDuringRun=hash(await readFile(script))!==scriptHash||hash(await readFile(new URL('./native-visibility-browser.mjs',import.meta.url)))!==report.visibilityLauncherHash;for(const [name,before] of report.visibilityDependencies)if(hash(await readFile(new URL(name,import.meta.url)))!==before)report.scriptChangedDuringRun=true;report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;
  report.status=resultStatus(report.steps,{sourceChanged:report.sourceChangedDuringRun||report.scriptChangedDuringRun||!report.buildManifestUnchanged});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=await runPrerequisites({output:process.argv[2]});console.log(JSON.stringify({status:report.status,steps:report.steps,limitations:report.limitations}));process.exitCode=report.status==='PARTIAL_J2_J4_NOT_ACCEPTED'?2:1;
}
