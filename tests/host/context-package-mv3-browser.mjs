import assert from 'node:assert/strict';
import {inspectJ3Failure} from './j3-failure-inspection.mjs';
import {installJ4GrantObserver} from './j4-grant-observer.mjs';
import {verifyColdNativeRecovery} from './context-cold-recovery-oracle.mjs';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createColdTracePackage,verifyColdTracePackage} from './cold-context-trace.mjs';
import {digest} from '../../src/data/hash.mjs';
import {observeColdBoundary,coldConversationRequests,coldProjectionTarget} from './context-cold-boundary.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
const forcedColdRecovery=process.argv[3]==='cold-unavailable-recovery';
const containerConversation=process.argv[3]==='container',C='33333333-3333-4333-8333-333333333333',containerPath='/g/g-p-11111111111111111111111111111111/c/'+C,server=await createVariantHostFixtureServer({profile:'MODERN',containerConversation,coldInitialUnavailable:forcedColdRecovery}),dir=await mkdtemp(join(tmpdir(),'vaiwl-c2-package-')),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true});
const info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8')),hash=v=>createHash('sha256').update(v).digest('hex');
const script=new URL(import.meta.url),scriptHash=hash(await readFile(script)),boundaryHelper=new URL('./context-cold-boundary.mjs',import.meta.url),boundaryHelperHash=hash(await readFile(boundaryHelper)),projectionOracle=new URL('./expected/modern.mjs',import.meta.url),projectionOracleHash=hash(await readFile(projectionOracle));
const inspectionFiles=['j3-failure-inspection.mjs','j3-failure-closures.mjs','j4-grant-observer.mjs','j4-joint-interruption.mjs','context-cold-recovery-oracle.mjs'];
const inspectionHashes=Object.fromEntries(await Promise.all(inspectionFiles.map(async name=>[name,hash(await readFile(new URL(name,import.meta.url)))])));
const report={containerConversation,inspectionHashes,scriptHash,boundaryHelperHash,projectionOracleHash,startupMode:['cold','cold-trace','cold-recovery','cold-unavailable-recovery'].includes(process.argv[3])?'COLD_IMMEDIATE_AFTER_LOAD_UNPACKED':'WORKER_READY_PRECONDITION',evidence:'REAL_HEADLESS_PACKAGED_MV3_OFFLINE_C2',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',profileScope:'CONVERSATION_GET_ONLY_NOT_FULL_MODERN_ACCEPTANCE',package:built,fixture:server.manifest,sourceHashes:info.sourceHashes,results:[],errors:[]};let context,page,worker,extensionId;
try{
 report.originalPackageVerification=verifyHost(built.unpacked);
 const trace=process.argv[3]==='cold-trace'?await createColdTracePackage(built.unpacked,join(dir,'cold-trace-extension')):null;if(trace){report.evidence="REAL_HEADLESS_INSTRUMENTED_PACKAGE_COPY_OFFLINE_C2";report.instrumentation=trace;await verifyColdTracePackage(trace);}
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:trace?.unpacked??built.unpacked});
 extensionId=id;
 if(!['cold','cold-trace','cold-recovery','cold-unavailable-recovery'].includes(process.argv[3])){worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');
 await worker.evaluate(()=>{globalThis.__offlineDiagnostic=[];const record=x=>{if(__offlineDiagnostic.length<40)__offlineDiagnostic.push(x);};for(const name of ['onSendHeaders','onCompleted','onErrorOccurred'])chrome.webRequest[name].addListener(d=>{record({event:name,requestId:d.requestId,tabId:d.tabId,frameId:d.frameId,documentId:d.documentId,documentLifecycle:d.documentLifecycle,initiator:d.initiator,type:d.type,method:d.method,url:d.url,statusCode:d.statusCode,fromCache:d.fromCache});void chrome.webNavigation.getFrame({tabId:d.tabId,frameId:0}).then(frame=>record({event:'getFrame',frame}));void chrome.tabs.get(d.tabId).then(tab=>record({event:'getTab',id:tab.id,incognito:tab.incognito}));},{urls:['http://127.0.0.1/*/conversation/*','http://127.0.0.1/backend-api/conversation/*']});chrome.runtime.onMessage.addListener((m,sender)=>{record({event:'content-command',type:m?.type,documentId:sender.documentId});});});
 }
 page=await context.newPage();
 if(forcedColdRecovery){report.acceptance='PARTIAL_S_NOT_FREE_ACCEPTED';report.controlledConversationResponses=[];page.on('response',response=>{const u=new URL(response.url());if(u.origin===server.origin&&/^\/backend-api\/conversation\/[0-9a-f-]+$/.test(u.pathname)&&report.controlledConversationResponses.length<16)report.controlledConversationResponses.push({path:u.pathname,status:response.status()});});}
 report.requestTimeline=[];page.on('request',r=>{const u=new URL(r.url());if(u.origin===server.origin&&u.pathname.startsWith('/backend-api/conversation/')&&report.requestTimeline.length<16)report.requestTimeline.push({at:Date.now(),event:'native-request',path:u.pathname});});page.on('pageerror',error=>report.errors.push(error.message));await page.goto(server.origin+(containerConversation?containerPath:'/c/'+C));
 const waitMounted=(timeout=20000)=>page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout});
 if(process.argv[3]==='cold-recovery'||forcedColdRecovery){
  report.coldBoundary=await observeColdBoundary({waitMounted,snapshot:()=>page.evaluate(()=>({owned:document.querySelectorAll('[data-va-owned]').length,nativeReading:!!document.querySelector('#reading'),nativeComposer:!!document.querySelector('#prompt-textarea')}))});
  if(forcedColdRecovery){assert.equal(report.coldBoundary.initialProjection,'TIMEOUT');report.coldBoundary.controlledFault='INITIAL_CONVERSATION_503_NOT_HISTORICAL_RACE_REPRODUCTION';}
  report.coldBoundary.nativeBeforeNavigation=server.snapshot().nativeRequests;
  assert.equal(report.coldBoundary.nativeBeforeNavigation.length,1,'one initial native request only');
  if(report.coldBoundary.initialProjection==='TIMEOUT'){
  const priorFrames=page.frames().filter(f=>!f.isDetached()&&f.url()===`chrome-extension://${id}/workspace.html`);assert.equal(priorFrames.length,0,'initial no-private-surface boundary must have no attached workspace frame');
  const previousGrant=null;report.coldBoundary.beforeNavigation={attachedWorkspaceFrames:0,previousGrantPresent:false};
  await context.addInitScript(installJ4GrantObserver); // Only future frames, after the original cold observation.
  const editor=page.locator('#prompt-textarea'),draft='offline cold recovery draft';await editor.click();await editor.fill(draft);
  await page.evaluate(()=>{globalThis.c2ColdDocument=document;globalThis.c2ColdEditor=document.querySelector('#prompt-textarea');});
  const recoveryScope=JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-team'])]);
  const nativeLink=page.locator('aside nav[aria-label="Chat history"] a[href="/c/44444444-4444-4444-8444-444444444444"]');const navigatedAt=Date.now();await nativeLink.click();
  await page.waitForURL(server.origin+'/c/44444444-4444-4444-8444-444444444444',{timeout:20000});
  report.coldBoundary.recovery=await verifyColdNativeRecovery({page,id,scopeKey:recoveryScope,currentRef:'44444444-4444-4444-8444-444444444444',afterTime:navigatedAt,previousGrant,expectedDraft:draft,waitMounted});
  assert.equal(await editor.inputValue(),draft);const allRequests=server.snapshot().nativeRequests,requests=coldConversationRequests(allRequests);report.coldBoundary.nativeAfterNavigation=allRequests;assert.equal(requests.length,2);assert.equal(requests[1].path,'/backend-api/conversation/44444444-4444-4444-8444-444444444444');
  if(forcedColdRecovery)assert.deepEqual(report.controlledConversationResponses,[{path:'/backend-api/conversation/'+C,status:503},{path:'/backend-api/conversation/44444444-4444-4444-8444-444444444444',status:200}]);
  report.coldBoundary.nativeNavigationRecovery='PASS';report.coldBoundary.originalDraftRetained=true;
  }else report.coldBoundary.nativeNavigationRecovery='NOT_COVERED_THIS_RUN';
 }else await waitMounted();
 const expectedProjection=coldProjectionTarget(report.coldBoundary);if(containerConversation)expectedProjection.path=containerPath;assert.equal(page.url(),server.origin+expectedProjection.path);
 const workspace=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(workspace);await workspace.getByText(expectedProjection.title,{exact:true}).waitFor({timeout:15000});report.currentProjection=expectedProjection;
 worker??=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`));assert(worker);
 assert(await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}}));report.workerExternalNetworkBlocked=true;
 const scopes=await workspace.evaluate(async()=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));const base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});}finally{base.close();}});
 const expected=JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-team'])]);assert.deepEqual(scopes,[expected]);
 report.results.push({name:'C2-native-request-authenticated-roster-second-context-to-native-Free-UI',status:'PASS',scopeCount:scopes.length});
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');assert.deepEqual(report.errors,[]);report.browserVersion=context.browser().version();report.status='PASS';
 }catch(error){
 report.status=context?'FAIL':'NOT_RUN_BROWSER_STARTUP';report.error=error.stack;process.exitCode=1;report.diagnosticErrors=[];
 try{report.failure=await page?.evaluate(()=>({url:location.href,state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,owned:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length,returns:document.querySelectorAll('button[data-va-owned][aria-label="返回工作空间"]').length,body:document.querySelector('#reading')?.outerHTML}));}catch(e){report.diagnosticErrors.push({stage:'page',error:String(e)});}
 try{report.native=server.snapshot();}catch(e){report.diagnosticErrors.push({stage:'native',error:String(e)});}
 // Attach only after the original failure. Never warm the cold worker or create a world.
 if(context&&page&&extensionId)try{report.failureInspection=await inspectJ3Failure({context,page,browser:context.browser(),extensionId});}catch{report.failureInspection={error:'failure-inspection-unavailable'};}
 try{worker??=context?.serviceWorkers().find(w=>w.url()===`chrome-extension://${extensionId}/extension/worker.mjs`);report.diagnostics=await worker?.evaluate(()=>({warm:globalThis.__offlineDiagnostic??null,cold:globalThis.__vaiwlColdTrace??null,coldDropped:globalThis.__vaiwlColdTraceDropped??0}));}catch(e){report.diagnosticErrors.push({stage:'worker',error:String(e)});}
}finally{
 if(worker&&!report.diagnostics)try{report.diagnostics=await worker.evaluate(()=>({warm:globalThis.__offlineDiagnostic??null,cold:globalThis.__vaiwlColdTrace??null,coldDropped:globalThis.__vaiwlColdTraceDropped??0}));}catch{}
 const clean=await cleanupOwnedResources(report,[['browser',()=>context?.close()],['instrumentation',()=>report.instrumentation?verifyColdTracePackage(report.instrumentation):undefined],['package',()=>verifyHost(built.unpacked)],['fixture',()=>server.close()],['source-integrity',async()=>{
  report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);
  report.scriptChangedDuringRun=hash(await readFile(script))!==scriptHash||hash(await readFile(boundaryHelper))!==boundaryHelperHash||hash(await readFile(projectionOracle))!==projectionOracleHash;
  report.inspectionChangedDuringRun=(await Promise.all(Object.entries(inspectionHashes).map(async([name,value])=>hash(await readFile(new URL(name,import.meta.url)))!==value))).some(Boolean);
  if(report.sourceChangedDuringRun||report.scriptChangedDuringRun||report.inspectionChangedDuringRun)throw Error('C2-source-integrity-changed');
 }]]);if(!clean)process.exitCode=1;
 await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report));
