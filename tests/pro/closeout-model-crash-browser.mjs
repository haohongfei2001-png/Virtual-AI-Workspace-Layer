/** G05: actual MV3 worker death after a synthetic provider enters transport.
 * This creates a separate disposable TEST-ONLY extension. It imports the real
 * production model bridge and DB4 billing modules, but supplies explicitly
 * synthetic authority/metadata and an in-process provider that never networks.
 * No provider configuration or test endpoint is added to the product package.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, join, relative, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHistoricalNetworkGuard, historicalNetworkGuardArgs} from '../host/historical-network-guard.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), require = createRequire(import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, label, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const value = await read(); if (value) return value; await pause(25); }
  throw Error('G05-timeout:' + label);
}
async function sourceDigests() {
  const files = ['tests/pro/closeout-model-crash-browser.mjs', 'tests/host/historical-network-guard.mjs'];
  async function visit(path) {
    for (const entry of await readdir(path, {withFileTypes: true})) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) files.push(relative(repository, child));
    }
  }
  await visit(join(repository, 'src'));
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [file, hash(await readFile(join(repository, file)))])));
}

const workerSource = String.raw`
import {ScopeRepository} from './src/b1/scope-repository.mjs';
import {digest} from './src/data/hash.mjs';
import {emptyOverlay} from './src/pro/domain/index.mjs';
import {prepareMetadataEvidence} from './src/pro/evidence/metadata.mjs';
import {createSameDatabaseBillingStore} from './src/pro/integration/billing-store.mjs';
import {createProductionModelBridge} from './src/pro/integration/model-bridge.mjs';

const NOW = '2026-11-01T10:00:00.000Z';
const scope = {kind:'verified-scope',key:'g05_synthetic_scope',serverIdentity:'established',persistence:'same-idb'};
let accidentalFetchCalls = 0;
globalThis.fetch = async () => { accidentalFetchCalls++; throw Error('G05-network-forbidden'); };
const ready = (async () => {
  const previous = await chrome.storage.local.get(['g05BootCount']);
  const bootCount = (previous.g05BootCount ?? 0) + 1, bootId = crypto.randomUUID();
  await chrome.storage.local.set({g05BootCount:bootCount});
  const repository = new ScopeRepository({indexedDB,databaseName:'vaiwl_g05_synthetic_db4'}), db = await repository.open();
  const authority = Object.freeze({}), ownerContext = Object.freeze({fixtureOnly:true,bootId});
  const store = createSameDatabaseBillingStore({enabled:true,connection:()=>repository.open(),clock:()=>NOW,
    verifyAuthority(value){if(value!==authority)throw Error('G05-authority-invalid');return scope;}});
  const configuration = {schema:'vaiwl-pro-model-configuration/1',billingProfileId:'g05_synthetic_payer',maxChargePerTaskMicros:30000,
    profile:{id:'g05_synthetic_profile',providerProfileId:'openai-responses',frozenModelVersion:'synthetic-no-network-model',promptVersion:'synthetic-g05-prompt',
      outputSchemaVersion:'vaiwl-pro-model-output/1',inputKinds:['metadata'],maxInputTokens:32768,maxOutputTokens:1000,maxUtf8Bytes:32768,priceCardVersion:'synthetic-g05-prices',qualityGateReference:null},
    priceCard:{version:'synthetic-g05-prices',currency:'USD',providerProfileId:'openai-responses',inputPerMillion:'0',outputPerMillion:'30',
      validFrom:'2026-11-01T00:00:00.000Z',validThrough:'2026-11-30T23:59:59.999Z',otherMaximumMicros:0}};
  const overlay = emptyOverlay(scope.key), references = [{id:'g05_synthetic_ref',nativeTitle:'原创合成资料：核对积分参数',nativeUrl:'https://fixture.invalid/c/g05',
    membership:{state:'NONE',evidenceId:'synthetic-positive-none',revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['synthetic-owner']}];
  const versions = {scopeKey:scope.key,authorizationEpoch:bootCount,sourceGeneration:{synthetic:bootCount},nativeFields:{syntheticRoot:1},
    overlayRevision:0,targets:{},constraintRevision:0,policyVersion:'g05-synthetic-policy',evidenceDigest:digest(references)};
  const capabilities = {scope,metadata:'available',positiveNone:'available',selectedText:'unavailable',sentUserInput:'unavailable',historicalCompleteness:'partial',reasonCodes:['synthetic-only']};
  const session = {key:'g05_synthetic_document',context:ownerContext,scope,live:()=>true,canRun:()=>true,autoRequested:()=>false};
  const bridge = createProductionModelBridge({connection:()=>repository.open(),now:()=>Date.parse(NOW),
    context:async(_session,{refIds})=>({pack:prepareMetadataEvidence({scope,references,versions,overlay,capabilities,refIds,
      consent:{mode:'cloud',inputKinds:['metadata'],revision:bootCount}}),overlay:structuredClone(overlay),currentVersions:structuredClone(versions),
      mode:'pro-default-none',processing:'cloud',foregroundBusy:false,backgroundWhileNative:false}),
    register:async()=>{await chrome.storage.local.set({g05UnexpectedRegistration:true});throw Error('G05-no-provider-result-expected');},
    provider:{enabled:true,configuration,canUse:context=>context===ownerContext,
      disclosure:{provider:'Synthetic G05 transport (no network)',policyVersion:'synthetic-only',policyUrl:'https://openai.com/policies/privacy-policy/',retentionText:'No real provider receives these synthetic fields.'},
      authorizeDispatch:async()=>({ok:true,apiKey:'SYNTHETIC_SENTINEL_NOT_A_REAL_KEY'}),
      transport:async(url)=>{
        if(url!=='https://api.openai.com/v1/responses')throw Error('G05-unexpected-provider-url');
        const value=await chrome.storage.local.get(['g05SyntheticTransportCalls']);
        await chrome.storage.local.set({g05SyntheticTransportCalls:(value.g05SyntheticTransportCalls??0)+1,g05TransportBootId:bootId});
        // The real bridge has already durably dispatched. Hold the synthetic
        // reply forever; the external harness kills this actual worker next.
        return new Promise(()=>{});
      }}});
  async function inspect() {
    const saved=await store.read(authority),model=await bridge.status(session),metadata=await chrome.storage.local.get(['g05SyntheticTransportCalls','g05TransportBootId','g05UnexpectedRegistration']);
    return {bootId,bootCount,databaseVersion:db.version,objectStores:[...db.objectStoreNames],sourceEpoch:versions.authorizationEpoch,
      syntheticTransportCalls:metadata.g05SyntheticTransportCalls??0,transportBootId:metadata.g05TransportBootId??null,
      unexpectedRegistration:metadata.g05UnexpectedRegistration===true,accidentalFetchCalls,
      jobs:Object.values(saved.jobs).map(row=>({id:row.checkpoint.id,state:row.checkpoint.state,inputEpoch:row.checkpoint.inputVersions?.authorizationEpoch??null})),
      reservations:Object.values(saved.ledger.reservations).map(row=>({id:row.reservation.id,status:row.reservation.status,heldCharge:row.reservation.heldCharge??null,actualCharge:row.reservation.actualCharge??null,dispatchRecorded:row.dispatchRecorded})),
      dispatchReceipts:saved.records.filter(row=>row.action==='DISPATCH_JOB').length,model};
  }
  return {bridge,session,inspect};
})();
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('harness.html')||!message||Object.keys(message).join()!=='op'){
    reply({ok:false,reason:'G05-test-owner-required'});return false;
  }
  ready.then(async({bridge,session,inspect})=>{
    if(message.op==='configure'){
      const before=await bridge.budgetSettings(session);
      return bridge.configureBudget(session,{limits:{taskMicros:30000,dayMicros:60000,monthMicros:120000},expectedRevision:before.revision,operationId:'g05_explicit_synthetic_budget'});
    }
    if(message.op==='start')return bridge.start(session,{refIds:['g05_synthetic_ref']});
    if(message.op==='inspect')return inspect();
    if(message.op==='recover'){await bridge.recover(session);return inspect();}
    throw Error('G05-unsupported-test-command');
  }).then(value=>reply({ok:true,value}),error=>reply({ok:false,reason:error.message}));
  return true;
});
`;

test('G05 actual MV3 dispatch crash retains the same DB4 held charge and never automatically resends', {timeout:120000}, async () => {
  if (!process.env.PRO_CHROMIUM_EXECUTABLE) throw Error('isolated-full-Chromium-required-no-skip');
  const playwright = require(require.resolve('playwright', {paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ?? repository]}));
  const directory = await mkdtemp(join(tmpdir(), 'vaiwl-g05-model-crash-')), extension = join(directory, 'test-only-extension');
  const output = resolve(process.env.PRO_EVIDENCE_DIR ?? join(repository, 'artifacts/pro-closeout/model-crash-browser'));
  await mkdir(output, {recursive:true}); await mkdir(extension);
  const git = (...args) => execFileSync('git', args, {cwd:repository,encoding:'utf8'}).trim();
  const sourceSHA = git('rev-parse','HEAD'), sourceStatus = () => git('status','--porcelain','--untracked-files=all','--','src','tests','extension');
  const report = {format:'vaiwl-pro-model-crash-browser/1',status:'RUNNING',evidenceClass:'MV3_SYNTHETIC_PROVIDER_CRASH',
    sourceSHA,sourceStatusBefore:sourceStatus(),sourceDigests:await sourceDigests(),testOnlyExtension:true,actualMV3Worker:true,actualIndexedDB:true,
    realProviderCalls:0,realCredentials:false,realChatGPT:'NOT_RUN',personalDevice:'NOT_RUN',naturalWorkerSleep:'NOT_TESTED_FORCED_STOP',
    startedAt:new Date().toISOString(),externalPageRequests:[],pageErrors:[]};
  const server = createServer((_request,response)=>response.writeHead(204).end());
  let context, guard;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    guard = await createHistoricalNetworkGuard({fixtureOrigin:'http://127.0.0.1:'+server.address().port});
    await cp(join(repository,'src'),join(extension,'src'),{recursive:true});
    const manifest = {manifest_version:3,name:'VAIWL G05 isolated synthetic crash test',version:'1.0.0',permissions:['storage'],
      background:{service_worker:'worker.mjs',type:'module'},content_security_policy:{extension_pages:"script-src 'self'; object-src 'self'; connect-src 'none'"}};
    await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
    await writeFile(join(extension,'worker.mjs'),workerSource);
    await writeFile(join(extension,'harness.html'),'<!doctype html><meta charset="utf-8"><title>G05 isolated synthetic worker test</title><script src="harness.js"></script>');
    await writeFile(join(extension,'harness.js'),"globalThis.g05Command=async op=>{const result=await chrome.runtime.sendMessage({op});if(!result?.ok)throw Error(result?.reason??'G05-no-reply');return result.value;};");
    report.testWorkerSHA256=hash(workerSource);report.testManifestSHA256=hash(JSON.stringify(manifest));
    context = await playwright.chromium.launchPersistentContext(join(directory,'profile'),{executablePath:process.env.PRO_CHROMIUM_EXECUTABLE,headless:true,
      ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging','--no-zygote','--disable-gpu',...historicalNetworkGuardArgs(guard.config)]});
    report.browser=context.browser().version();
    await context.route('**/*',route=>{const url=route.request().url();if(!url.startsWith('chrome-extension://')){report.externalPageRequests.push(new URL(url).origin);return route.abort();}return route.continue();});
    const cdp=await context.browser().newBrowserCDPSession(),loaded=await cdp.send('Extensions.loadUnpacked',{path:extension}),workerURL='chrome-extension://'+loaded.id+'/worker.mjs';
    const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
    await page.goto('chrome-extension://'+loaded.id+'/harness.html');await page.waitForFunction(()=>typeof globalThis.g05Command==='function');
    const command=op=>page.evaluate(op=>globalThis.g05Command(op),op);
    const settings=await command('configure');assert.equal(settings.limits.taskMicros,30000);assert.equal(settings.blocked,false);
    assert.equal((await command('start')).state,'registered');
    const before=await poll(async()=>{const value=await command('inspect');return value.syntheticTransportCalls===1&&value.jobs[0]?.state==='dispatched'?value:null;},'durable-dispatch-and-synthetic-send');
    assert.equal(before.databaseVersion,4);assert.equal(before.jobs.length,1);assert.equal(before.reservations.length,1);
    assert.equal(before.reservations[0].status,'sent-uncertain');assert.equal(before.reservations[0].heldCharge,30000);assert.equal(before.reservations[0].dispatchRecorded,true);
    assert.equal(before.dispatchReceipts,1);assert.equal(before.model.budget.uncertain,30000);assert.equal(before.model.budget.settled,0);assert.equal(before.accidentalFetchCalls,0);
    report.beforeTermination=before;
    const events=[],workerCDP=await context.newCDPSession(page);
    workerCDP.on('ServiceWorker.workerVersionUpdated',event=>events.push(...(event.versions??[])));
    await workerCDP.send('ServiceWorker.enable');
    const running=await poll(()=>events.find(version=>version.scriptURL===workerURL&&version.runningStatus==='running'),'actual-running-worker');
    const oldTarget=(await cdp.send('Target.getTargets')).targetInfos.find(target=>target.type==='service_worker'&&target.url===workerURL);assert(oldTarget);
    await workerCDP.send('ServiceWorker.stopWorker',{versionId:running.versionId});
    await poll(()=>events.find(version=>version.versionId===running.versionId&&version.runningStatus==='stopped'),'actual-stopped-event');
    report.termination={method:'ServiceWorker.stopWorker',versionId:running.versionId,oldTargetId:oldTarget.targetId,observedStopped:true};
    await workerCDP.detach();
    const reopened=await command('inspect');
    assert.notEqual(reopened.bootId,before.bootId);assert.equal(reopened.bootCount,before.bootCount+1);assert.equal(reopened.sourceEpoch,before.sourceEpoch+1);
    assert.equal(reopened.jobs[0].id,before.jobs[0].id);assert.equal(reopened.jobs[0].state,'dispatched');assert.equal(reopened.jobs[0].inputEpoch,before.sourceEpoch);
    assert.equal(reopened.syntheticTransportCalls,1);assert.equal(reopened.model.runningCount,0);assert.equal(reopened.model.budget.uncertain,30000);
    const newTarget=(await cdp.send('Target.getTargets')).targetInfos.find(target=>target.type==='service_worker'&&target.url===workerURL);assert(newTarget);
    // Chromium may reuse a registration's CDP target ID. The actual stopped
    // event plus a different worker-local UUID and next boot count prove the
    // process context was lost and freshly evaluated; target identity does not.
    report.reopenedBeforeRecovery=reopened;report.termination.newTargetId=newTarget.targetId;
    report.termination.targetIdReused=newTarget.targetId===oldTarget.targetId;
    const recovered=await command('recover'),again=await command('recover');
    for(const value of [recovered,again]){
      assert.equal(value.jobs[0].id,before.jobs[0].id);assert.equal(value.jobs[0].state,'outcome-unknown');assert.equal(value.reservations[0].id,before.reservations[0].id);
      assert.equal(value.reservations[0].status,'sent-uncertain');assert.equal(value.reservations[0].heldCharge,30000);assert.equal(value.reservations[0].actualCharge,null);
      assert.equal(value.model.budget.uncertain,30000);assert.equal(value.model.budget.reserved,0);assert.equal(value.model.budget.settled,0);
      assert.equal(value.syntheticTransportCalls,1);assert.equal(value.dispatchReceipts,1);assert.equal(value.accidentalFetchCalls,0);assert.equal(value.unexpectedRegistration,false);
    }
    report.afterRecovery=recovered;report.repeatRecoveryPreservedCharge=true;report.automaticResendCount=again.syntheticTransportCalls-before.syntheticTransportCalls;
    assert.deepEqual(report.externalPageRequests,[]);assert.deepEqual(report.pageErrors,[]);
    assert.deepEqual(await sourceDigests(),report.sourceDigests,'source must not change while its copied modules are tested');
    report.status='PASS';
  } catch(error) { report.status='FAIL';report.error=error.stack;throw error; }
  finally {
    await context?.close();report.networkGuard=guard?.snapshot()??null;await guard?.close();
    await new Promise(resolve=>server.close(resolve));
    report.sourceSHAAfter=git('rev-parse','HEAD');report.sourceStatusAfter=sourceStatus();
    report.sourceMatchesCommit=!report.sourceStatusBefore&&!report.sourceStatusAfter&&report.sourceSHA===report.sourceSHAAfter;
    report.finishedAt=new Date().toISOString();await writeFile(join(output,'closeout-model-crash-browser.json'),JSON.stringify(report,null,2)+'\n');
    await rm(directory,{recursive:true,force:true});
  }
});
