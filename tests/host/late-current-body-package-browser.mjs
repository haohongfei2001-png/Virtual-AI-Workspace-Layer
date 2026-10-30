/** Actual packaged MV3 late-body admission and synchronous source-revocation
 * regression. Synthetic native data, disposable headless profiles, no real
 * ChatGPT/Profile access. This targeted gate is not full product acceptance.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostScaleServer} from './fixtures/host-scale-server.mjs';
import {delayNativeBodyUntilWorkspace} from './fixtures/late-native-body-fixture.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {digest} from '../../src/data/hash.mjs';

const output=process.argv[2];assert(output,'output-json-required');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashes=async paths=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(path))])));
const testPaths=['tests/host/late-current-body-package-browser.mjs','tests/host/fixtures/late-native-body-fixture.mjs','tests/host/fixtures/host-scale-server.mjs','tests/host/fixtures/host-scale-world.mjs','tests/host/fixtures/ui10-populated-native.mjs','tests/host/fixtures/j3-modern.mjs','tests/host/fixtures/legacy.html','tests/host/fixtures/native.css','tests/host/fixtures/native.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs'];
const report={kind:'ACTUAL_MV3_OFFLINE_LATE_CURRENT_BODY',status:'NOT_RUN',realChatGPT:'NOT_RUN',fullProductAcceptance:'NOT_ESTABLISHED',cloudFailureCause:'NOT_ESTABLISHED',backend:'document-flow',budgetMs:6000,testHashes:await hashes(testPaths),viewports:[],cases:[]};
const scope={verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1','user-host-scale']),organizationId:'context_'+digest(['chatgpt-context-v1','user-host-scale','account-host-scale'])};
let server,network,context,built,manifest;

async function bodyState(page){
 return page.evaluate(()=>{
  const reading=document.querySelector('#reading'),workspace=document.querySelector('[data-va-owned][id$="_workspace"]:not([popover])'),exit=document.querySelector('[data-va-owned][id$="_workspace_exit"]'),style=reading&&getComputedStyle(reading),rect=workspace?.getBoundingClientRect();
  return {at:performance.timeOrigin+performance.now(),route:location.pathname,readingConnected:!!reading?.isConnected,bodyId:reading?.dataset.conversationId??null,messageIds:[...(reading?.querySelectorAll('[data-message-id]')??[])].map(node=>node.dataset.messageId),readingRect:reading?.getBoundingClientRect().toJSON(),readingDisplay:style?.display,readingVisibility:style?.visibility,nativeHidden:reading?.hidden===true,workspaceConnected:!!workspace?.isConnected,workspaceRect:rect?.toJSON(),workspaceVisible:!!workspace&&getComputedStyle(workspace).visibility==='visible'&&getComputedStyle(workspace).display!=='none'&&rect.height>=96,exitOpen:exit?.matches(':popover-open')??false,releases:globalThis.__lateNativeBody?.releases??null};
 });
}
async function facts(reader,target){
 // A passive extension-origin document survives legitimate workspace-frame
 // revocation. Use the real repositories and readonly transactions, not raw
 // records or a fabricated evidence count; service workers cannot import().
 return reader.evaluate(async({scope,target})=>{
  const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs')),{FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs'));
  const base=new ScopeRepository({indexedDB});
  try{const native=await new NativeRepository({baseRepository:base}).read(scope),evidence=await new FreeEvidenceRepository({baseRepository:base}).read(scope),events=Object.values(evidence.events).filter(event=>event.conversationId===target);return {at:performance.timeOrigin+performance.now(),nativeTargetPresent:!!native.refs[target],events:events.length,verifiedNewSend:events.filter(event=>event.actorVerified&&event.kind==='new-send').length,coverage:Object.keys(evidence.coverage).length};}
  finally{base.close();}
 },{scope,target});
}
async function observeBodyTransport(cdp,contexts,id){
 let isolated;
 for(const candidate of contexts.filter(candidate=>candidate.auxData?.isDefault===false)){
  try{const result=await cdp.send('Runtime.evaluate',{contextId:candidate.id,expression:'typeof chrome!=="undefined"&&chrome.runtime?.id',returnByValue:true});if(result.result.value===id){isolated=candidate.id;break;}}catch{}
 }
 assert(isolated,'original-extension-isolated-world-not-found');
 const installed=await cdp.send('Runtime.evaluate',{contextId:isolated,returnByValue:true,expression:`(()=>{
  const events=[];globalThis.__lateBodyTransport=events;const original=chrome.runtime.sendMessage;
  chrome.runtime.sendMessage=function(...args){
   const message=args[0],body=message?.kind==='current-observation'?message.payload?.body:message?.kind==='current-object'?message.payload:null;
   const entry=body?{at:performance.timeOrigin+performance.now(),kind:message.kind,association:body.association,conversationId:body.conversationId,messageCount:body.messageIds.length,localSeq:message.localSeq}:null;
   if(entry&&events.length<128)events.push(entry);
   const promise=Reflect.apply(original,this,args);
   if(entry&&promise&&typeof promise.then==='function')void promise.then(reply=>{entry.ackAt=performance.timeOrigin+performance.now();entry.ack={state:reply?.state??null,localSeq:reply?.localSeq??null,bodyProofPresent:typeof reply?.bodyProofId==='string',bodyEpoch:reply?.bodyEpoch??null,reason:reply?.reason??null};},error=>{entry.error=String(error?.message??error);});
   return promise;
  };return true;
 })()`});
 assert.equal(installed.result.value,true);
 return async()=>{const result=await cdp.send('Runtime.evaluate',{contextId:isolated,expression:'JSON.stringify(globalThis.__lateBodyTransport)',returnByValue:true});assert(!result.exceptionDetails,'runtime-trace-unavailable');return JSON.parse(result.result.value);};
}
async function revokeSourceDuringProbe(page){
 return page.evaluate(()=>{
  const exit=document.querySelector('[data-va-owned][id$="_workspace_exit"]'),reading=document.querySelector('#reading'),workspace=document.querySelector('[data-va-owned][id$="_workspace"]:not([popover])');
  if(!exit||!reading||!workspace||reading.hidden||!exit.matches(':popover-open'))throw Error('source-revoke-control-not-ready');
  const state=globalThis.__lateBodySourceRevoke={armed:true,events:[]};
  exit.addEventListener('beforetoggle',event=>{
   if(!state.armed||event.newState!=='closed'||globalThis.__lateNativeBody.releases!==1)return;
   state.armed=false;
   const box=workspace.getBoundingClientRect(),rules=[...document.querySelectorAll('style[data-va-owned]')].flatMap(node=>[...node.sheet.cssRules]).filter(rule=>rule.media?.mediaText==='all'&&rule.cssText.includes(workspace.id));
   const entry={at:performance.timeOrigin+performance.now(),oldState:event.oldState,newState:event.newState,trusted:event.isTrusted,workspaceConnected:workspace.isConnected,workspaceRect:box.toJSON(),activeExactProbeRules:rules.length,probeRule:rules.length===1?{media:rules[0].media.mediaText,selector:rules[0].cssRules[0].selectorText,width:rules[0].cssRules[0].style.width,height:rules[0].cssRules[0].style.height,left:rules[0].cssRules[0].style.left}:null,readingConnected:reading.isConnected,sourceHiddenBefore:reading.hidden,bodyId:reading.dataset.conversationId,messageCount:reading.querySelectorAll('[data-message-id]').length};
   // A real native source mutation invalidates the real controller/flow proof.
   // No grant, adapter, proposal, owner response, or ACK is stubbed.
   reading.hidden=true;entry.sourceHiddenAfter=reading.hidden;entry.nativeDisplayAfter=getComputedStyle(reading).display;state.events.push(entry);
  },{capture:true});
  return {armed:true,workspaceVisible:getComputedStyle(workspace).visibility==='visible',sourceHidden:reading.hidden};
 });
}

try{
 server=await createHostScaleServer({ui10History:true});report.fixtureOrigin=server.origin;report.target=server.ui10History.rows[0].id;
 const directory=await mkdtemp(join(tmpdir(),'vaiwl-late-current-body-'));report.artifactDirectory=directory;
 built=packageHost(join(directory,'package'),{offlineOrigin:server.origin,offlineHistory:true});report.package=built;
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
 const manifestBytes=await readFile(join(built.unpacked,'build-manifest.json'));manifest=JSON.parse(manifestBytes);report.manifestHash=hash(manifestBytes);report.sourceHashes=manifest.sourceHashes;
 const originalNative=await readFile(new URL('./fixtures/native.mjs',import.meta.url),'utf8'),delayedNative=delayNativeBodyUntilWorkspace(originalNative);
 report.nativeFixture={source:'tests/host/fixtures/native.mjs',sourceHash:hash(originalNative),transformedHash:hash(delayedNative),transform:'tests/host/fixtures/late-native-body-fixture.mjs'};
 network=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 for(const mode of ['late-body','source-revoked']){
  const result={mode,status:'RUNNING',budgetMs:6000,releaseCount:0,errors:[]};report.cases.push(result);
  try{
   context=await chromium.launchPersistentContext(join(directory,'profile-'+mode),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(network.config)]});
   result.browserVersion=context.browser().version();report.browserVersion??=result.browserVersion;
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===server.origin&&url.pathname==='/native.mjs')return route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:delayedNative});return url.origin===server.origin||url.protocol==='chrome-extension:'?route.continue():route.abort();});
   const browserCDP=await context.browser().newBrowserCDPSession(),{id}=await browserCDP.send('Extensions.loadUnpacked',{path:built.unpacked});
   const worker=context.serviceWorkers().find(worker=>worker.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:worker=>worker.url().startsWith(`chrome-extension://${id}/`),timeout:6000});
   result.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com');return false;}catch{return true;}});assert(result.workerNetworkBlocked);
   await worker.evaluate(()=>{globalThis.__lateBodyInbound=[];chrome.runtime.onMessage.addListener(message=>{if(globalThis.__lateBodyInbound.length>=128)return;const body=message?.kind==='current-observation'?message.payload?.body:message?.kind==='current-object'?message.payload:null;if(body)globalThis.__lateBodyInbound.push({at:performance.timeOrigin+performance.now(),kind:message.kind,association:body.association,conversationId:body.conversationId,messageCount:body.messageIds.length});});});
   const reader=await context.newPage();await reader.goto(`chrome-extension://${id}/manifest.json`);
   const page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));
   const pageCDP=await context.newCDPSession(page),contexts=[];pageCDP.on('Runtime.executionContextCreated',event=>contexts.push(event.context));await pageCDP.send('Runtime.enable');await page.goto(server.origin+'/c/'+report.target);
   await page.waitForFunction(()=>!!globalThis.__lateNativeBody,null,{timeout:6000});
   await page.waitForFunction(()=>{const node=document.querySelector('[data-va-owned][id$="_workspace"]:not([popover])');return node&&getComputedStyle(node).visibility==='visible'&&getComputedStyle(node).display!=='none'&&node.getBoundingClientRect().height>=96;},null,{timeout:6000});
   const frame=page.frames().find(frame=>frame.url()===`chrome-extension://${id}/workspace.html`);assert(frame,'formal-workspace-frame-required');await frame.locator('.workspace').waitFor({timeout:6000});
   result.viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));if(!report.viewports.some(viewport=>JSON.stringify(viewport)===JSON.stringify(result.viewport)))report.viewports.push(result.viewport);
   const transport=await observeBodyTransport(pageCDP,contexts,id);
   result.beforeRelease=await bodyState(page);assert(result.beforeRelease.workspaceVisible&&result.beforeRelease.exitOpen);assert.equal(result.beforeRelease.bodyId,null);assert.deepEqual(result.beforeRelease.messageIds,[]);
   result.factsBefore=await facts(reader,report.target);assert.equal(result.factsBefore.verifiedNewSend,0,'fresh isolated evidence required');result.requestsBefore=server.snapshot().requests;
   if(mode==='source-revoked')result.rejectionSetup=await revokeSourceDuringProbe(page);
   const started=performance.now();result.release=await page.evaluate(()=>globalThis.__lateNativeBody.release());result.releaseCount=result.release.releases;assert.equal(result.releaseCount,1);
   result.afterRelease=await bodyState(page);assert.equal(result.afterRelease.bodyId,report.target);assert.equal(result.afterRelease.messageIds.length,1);assert(result.afterRelease.readingConnected);if(mode==='late-body')assert(result.afterRelease.workspaceVisible);
   result.samples=[];let admitted=false;
   do{
    const sample=await facts(reader,report.target);sample.elapsedMs=performance.now()-started;result.samples.push(sample);
    if(sample.verifiedNewSend===1&&sample.elapsedMs<6000){admitted=true;break;}
    const left=6000-(performance.now()-started);if(left>0)await new Promise(resolve=>setTimeout(resolve,Math.min(100,left)));
   }while(performance.now()-started<6000);
   result.elapsedMs=performance.now()-started;result.finalBody=await bodyState(page);result.contentTransport=await transport();result.workerInbound=await worker.evaluate(()=>globalThis.__lateBodyInbound);
   result.requestsAfter=server.snapshot().requests;result.nativeActions=server.snapshot().actions;result.admissionWithinOriginalBudget=admitted;
   result.explicitProposals=result.contentTransport.filter(entry=>entry.association==='explicit-body-id');result.acceptedBodyACKs=result.explicitProposals.filter(entry=>entry.ack?.bodyProofPresent&&['accepted','duplicate'].includes(entry.ack.state));
   result.requestDeltas=Object.fromEntries([...new Set([...Object.keys(result.requestsBefore),...Object.keys(result.requestsAfter)])].map(path=>[path,(result.requestsAfter[path]??0)-(result.requestsBefore[path]??0)]));
   const metadataPath='/backend-api/conversation/:id';result.metadataGETDelta=result.requestDeltas[metadataPath]??0;
   assert.equal(result.finalBody.releases,1);assert.deepEqual(result.nativeActions,{},'no native send, create, or navigation action');assert.deepEqual(result.errors,[]);
   for(const [path,count]of Object.entries(result.requestDeltas)){
    // One owner metadata read can revalidate its original synthetic principal.
    // The driver performs no GET, reload, reauthentication, or product retry.
    if(mode==='late-body'&&['/api/auth/session','/backend-api/accounts/check/v4-2023-04-27'].includes(path))assert(count>=0&&count<=1,'no repeated principal check');
    else assert.equal(count,mode==='late-body'&&path===metadataPath?1:0,'unexpected request/retry '+path);
   }
   if(mode==='late-body'){
    assert.equal(admitted,true,'late native identity must admit within original 6 s');assert(result.elapsedMs<6000);
    assert.equal(result.explicitProposals.length,1);assert.equal(result.acceptedBodyACKs.length,1);assert.equal(result.metadataGETDelta,1);
    const ack=result.acceptedBodyACKs[0];assert.equal(ack.conversationId,report.target);assert.equal(ack.messageCount,1);assert.equal(ack.ack.localSeq,ack.localSeq);assert(ack.at>=result.release.releaseAt&&ack.ackAt>=ack.at&&ack.ackAt-result.release.releaseAt<6000);
    assert(result.finalBody.workspaceVisible&&result.finalBody.exitOpen,'successful synchronous probe restores workspace');
   }else{
    result.rejection=await page.evaluate(()=>({events:globalThis.__lateBodySourceRevoke.events,armed:globalThis.__lateBodySourceRevoke.armed}));const entry=result.rejection.events[0];
    // beforetoggle runs before :popover-open changes. At this point the real
    // offscreen rule is armed with the captured viewport; its selector applies
    // only after this callback returns. Do not demand its later rect here.
    result.rejectionChecks={singleRealProbe:result.rejection.events.length===1&&entry.trusted&&entry.oldState==='open'&&entry.newState==='closed'&&entry.activeExactProbeRules===1&&entry.workspaceConnected&&entry.workspaceRect.width>0&&entry.workspaceRect.height>0&&entry.probeRule?.media==='all'&&entry.probeRule.selector.includes(':popover-open')&&parseFloat(entry.probeRule.width)===entry.workspaceRect.width&&parseFloat(entry.probeRule.height)===entry.workspaceRect.height&&parseFloat(entry.probeRule.left)===-entry.workspaceRect.width-2,
     realSourceRevoked:entry?.readingConnected&&entry.sourceHiddenBefore===false&&entry.sourceHiddenAfter===true&&entry.nativeDisplayAfter==='none'&&entry.bodyId===report.target&&entry.messageCount===1,
     noExplicitProposal:result.explicitProposals.length===0,noAcceptedBodyACK:result.acceptedBodyACKs.length===0,noAdmission:!admitted&&result.samples.every(sample=>sample.verifiedNewSend===0),noMetadataGET:result.metadataGETDelta===0,
     sourceRemainsRevoked:result.finalBody.nativeHidden&&result.finalBody.readingDisplay==='none'&&result.finalBody.bodyId===report.target&&result.finalBody.messageIds.length===1,closedPresentation:result.finalBody.exitOpen===false};
    assert(Object.values(result.rejectionChecks).every(Boolean),JSON.stringify(result.rejectionChecks));
   }
   result.status='PASS';
  }catch(error){result.status='FAIL';result.error=error.stack;throw error;}
  finally{if(!await cleanupOwnedResources(result,[['browser-context',()=>context?.close()]]))throw Error('late-body-browser-cleanup-failed');context=null;}
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 try{
  if(manifest){report.sourceHashesAfter=await hashes(Object.keys(manifest.sourceHashes));report.productSourceStable=JSON.stringify(report.sourceHashesAfter)===JSON.stringify(manifest.sourceHashes);assert(report.productSourceStable,'product-source-changed-during-test');report.packageVerification=verifyHost(built.unpacked);}
  report.testHashesAfter=await hashes(testPaths);report.testSourceStable=JSON.stringify(report.testHashesAfter)===JSON.stringify(report.testHashes);assert(report.testSourceStable,'fixture-source-changed-during-test');
 }catch(error){report.status='FAIL_INTEGRITY';report.integrityError=error.stack;process.exitCode=1;}
 if(!await cleanupOwnedResources(report,[['browser-context',()=>context?.close()],['network-guard',()=>network?.close()],['fixture-server',()=>server?.close()]]))process.exitCode=1;
 await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,report:output,cases:report.cases.map(result=>({mode:result.mode,status:result.status,releaseCount:result.releaseCount,admission:result.admissionWithinOriginalBudget,metadataGETDelta:result.metadataGETDelta})),error:report.error}));
}
