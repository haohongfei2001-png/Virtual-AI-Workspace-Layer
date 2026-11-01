import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {J4_SEND_C} from './fixtures/j4-interruption.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
const paths=['tests/host/isolated-ack-browser.mjs',...['variants-server.mjs','j4-interruption.mjs','variants-native.mjs','native.mjs','legacy.html','native.css','j4-native-context.mjs','j4-assets.mjs'].map(p=>'tests/host/fixtures/'+p)];
const evidenceHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const server=await createVariantHostFixtureServer({profile:'MODERN',journey:'J4',interruption:true}),dir=await mkdtemp('/private/tmp/vaiwl-isolated-ack-');
const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true,offlineExistingSend:true}),build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
const report={status:'NOT_RUN',evidence:'REAL_HEADLESS_PACKAGED_MV3_ISOLATED_SUBJECT_EXISTING_SEND_ACK',realChatGPT:'NOT_RUN',firstPartyServiceWorker:'NOT_VERIFIED',coldStart:'NOT_CLAIMED_WORKER_READY_BEFORE_NAVIGATION',sourceHashes:build.sourceHashes,evidenceHashes,fixture:server.manifest,network:{workerSessionAborted:0,workerSession:0,isolatedSession:0,isolatedAccounts:0,workerAccounts:0,workerDetail:0},checks:{}};
let handle,phase='launch';
async function poll(read){const deadline=Date.now()+15000;while(Date.now()<deadline){const result=await read();if(result)return result;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('isolated-ack-condition-timeout');}
async function evidence(frame){return frame.evaluate(async()=>{
 const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
 const principal='principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),scope=id=>({verified:true,provider:'chatgpt',accountId:principal,organizationId:'context_'+digest(['chatgpt-context-v1','user-host-fixture',id])}),team=scope('account-host-team'),personal=scope('account-host-personal'),base=new ScopeRepository({indexedDB});
 try{const repository=new FreeEvidenceRepository({baseRepository:base}),state=await repository.read(team),other=await repository.read(personal);return {scopeKey:JSON.stringify([team.provider,team.accountId,team.organizationId]),hints:Object.values(state.hints),sources:state.sources,eventCount:Object.keys(state.events).length,personalHints:Object.keys(other.hints).length};}finally{base.close();}
});}
const observe=()=>({...isolatedACKAudit});
try{
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});const {context,browser}=handle;
 await context.route('**/*',route=>{const request=route.request(),url=request.url(),worker=!!request.serviceWorker();
  if(url===server.origin+'/api/auth/session'){if(worker&&report.network.workerSessionAborted===0){report.network.workerSessionAborted++;return route.abort('failed');}report.network[worker?'workerSession':'isolatedSession']++;}
  if(url===server.origin+'/backend-api/accounts/check/v4-2023-04-27')report.network[worker?'workerAccounts':'isolatedAccounts']++;
  if(worker&&url===server.origin+'/backend-api/conversation/'+J4_SEND_C)report.network.workerDetail++;
  return url.startsWith(server.origin+'/')||url.startsWith('chrome-extension://')?route.continue():route.abort();
 });
 const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith(`chrome-extension://${id}/`),timeout:15000});
 await worker.evaluate(()=>{globalThis.isolatedACKAudit={hello:0,refresh:0,identityResults:0,isolatedIdentity:0,otherIdentity:0,bodyObservations:0};chrome.runtime.onMessage.addListener(message=>{if(message?.type==='HOST_HELLO')isolatedACKAudit.hello++;if(message?.type==='HOST_REFRESH')isolatedACKAudit.refresh++;if(message?.type==='HOST_IDENTITY_RESULT'){isolatedACKAudit.identityResults++;if(message.ok===true&&message.identity?.transport==='isolated-fixed-fetch')isolatedACKAudit.isolatedIdentity++;else isolatedACKAudit.otherIdentity++;}if(['current-object','current-observation'].includes(message?.kind))isolatedACKAudit.bodyObservations++;});});
 const page=await context.newPage();await page.goto(server.origin+'/c/'+J4_SEND_C);
 phase='isolated-Team-body-baseline';await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000});await page.locator('[data-message-id="j4_original_old"]').first().waitFor({state:'attached',timeout:10000});
 const frame=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(frame);await frame.getByText('Membership not loaded',{exact:true}).first().waitFor({timeout:15000});
 await poll(()=>server.snapshot().interruption.reads.some(row=>row.authenticatedWorker&&row.finishedAt!==null));
 const initialAudit=await worker.evaluate(observe);assert.equal(initialAudit.hello,1);assert.equal(initialAudit.refresh,1);assert.equal(initialAudit.identityResults,1);assert.equal(initialAudit.isolatedIdentity,1);assert.equal(initialAudit.otherIdentity,0);assert(initialAudit.bodyObservations>0);assert.equal(report.network.workerSessionAborted,1);assert(report.network.isolatedSession>0&&report.network.isolatedAccounts>0);assert(report.network.workerDetail>0);
 const before=await evidence(frame);assert.equal(before.hints.length,0);assert.equal(before.personalHints,0);report.checks.initial={audit:initialAudit,baseline:'NATIVE_BODY_ATTACHED_UNDER_WORKSPACE_MASK_AND_AUTHENTICATED_INITIAL_METADATA_RESPONSE_FINISHED',scope:before.scopeKey};
 phase='one-native-send-and-held-readback';const acceptedBefore=server.snapshot().interruption.accepts,readsBefore=server.snapshot().interruption.reads.length;
 await page.locator('#prompt-textarea').fill('One offline native send for isolated subject ACK');const intentAt=Date.now();await page.locator('button[type="submit"]').click();await page.locator('#composer output').getByText('J4 native send accepted',{exact:true}).waitFor();
 const accepted=server.snapshot().interruption;assert.equal(accepted.accepts,acceptedBefore+1);const sent=accepted.rows.at(-1);assert.notEqual(sent.id,'j4_original_old');assert(Date.parse(sent.at)>=intentAt);
 await poll(()=>server.snapshot().interruption.pending>0);assert(server.releaseInterruption()>0);
 phase='durable-Team-ACK';const persisted=await poll(async()=>{const result=await evidence(frame);return result.hints.length===1?result:null;});
 const hint=persisted.hints[0],source=persisted.sources[hint.sourceId];assert.equal(hint.messageId,sent.id);assert.equal(hint.conversationId,J4_SEND_C);assert.equal(hint.hintType,'observed-self-send');assert.equal(hint.actorScopeKey,persisted.scopeKey);assert.equal(persisted.scopeKey,before.scopeKey);assert.equal(hint.actorVerified,true);assert.equal(hint.ackWitness.kind,'authenticated-message-readback');assert.equal(hint.ackWitness.profileId,source.profileId);assert.equal(hint.ackWitness.profileVersion,source.profileVersion);assert.equal(source.codecVersion,1);assert(!Object.hasOwn(hint,'sentAt'));assert(Date.parse(hint.firstObservedAt)>=intentAt);assert(Date.parse(hint.candidateInterval.through)-Date.parse(hint.candidateInterval.from)<=30000);assert.equal(persisted.personalHints,0);assert.equal(persisted.eventCount,0);
 assert(server.snapshot().interruption.reads.slice(readsBefore).some(row=>row.authenticatedWorker&&row.held&&row.finishedAt!==null));
 phase='repeat-persisted-read-no-origin-renewal';for(let i=0;i<3;i++){const repeated=await evidence(frame);assert.deepEqual(repeated.hints,persisted.hints);assert.equal(repeated.personalHints,0);}
 const finalAudit=await worker.evaluate(observe);assert.equal(finalAudit.hello,initialAudit.hello);assert.equal(finalAudit.refresh,initialAudit.refresh);assert.equal(finalAudit.identityResults,initialAudit.identityResults);assert.equal(finalAudit.isolatedIdentity,1);assert.equal(finalAudit.otherIdentity,0);assert.equal(server.snapshot().interruption.accepts,acceptedBefore+1);assert.equal(server.snapshot().actions['send-intent'],1);
 report.checks.ack={scopeKey:persisted.scopeKey,messageId:sent.id,hint,source};report.checks.repeat={reads:3,kind:'PERSISTED_REPOSITORY_READ_ONLY_NOT_SECOND_AUTHENTICATED_METADATA_READ',firstObservedAtUnchanged:true};report.checks.finalAudit=finalAudit;report.checks.nativeSends=1;
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.failedPhase=phase;report.errorClass=/^[A-Za-z]+Error$/.test(error?.name)?error.name:'Error';const line=/isolated-ack-browser\.mjs:(\d+):(\d+)/.exec(error?.stack??'');if(line)report.failureLocation={line:Number(line[1]),column:Number(line[2])};process.exitCode=1;}
finally{
 report.cleanup=(await Promise.allSettled([handle?.close(),server.close(),guard.close()])).map(value=>value.status);report.sourceChangedDuringRun=(await Promise.all(Object.entries({...build.sourceHashes,...evidenceHashes}).map(async([path,hash])=>createHash('sha256').update(await readFile(path)).digest('hex')!==hash))).some(Boolean);
 if(report.sourceChangedDuringRun||report.cleanup.includes('rejected')){report.originalFailedPhase=report.failedPhase??null;report.status='FAIL';report.failedPhase='source-or-cleanup';process.exitCode=1;}
 report.networkGuard=guard.snapshot();await writeFile(process.argv[2]??'/private/tmp/free-isolated-ack.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,phase:report.failedPhase}));
