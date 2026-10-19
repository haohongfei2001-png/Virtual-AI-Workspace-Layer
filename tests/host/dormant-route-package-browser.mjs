/** Controlled resize-before-route-scan fault in an isolated LEGACY MV3 package.
 * The native fixture performs navigation; no driver URL write or forged scope.
 * This is a narrow ordering probe, not J1/full J4 or live-host acceptance.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {packageHost} from '../../extension/package.mjs';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {createPreparedDormancyProbe,createWorkerPreparedDormancyProbe,observeWorkerPreparedDormancy} from './prepared-dormancy-probe.mjs';
import {j2Poll,j2Within,j2ExternalProbe} from './j2-runner-bounds.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const mutant=process.argv[3]==='mutant';if(process.argv[3]&&!mutant)throw Error('unsupported-probe');
const hash=x=>createHash('sha256').update(x).digest('hex'),output=process.argv[2]??join(tmpdir(),'vaiwl-dormant-route.json');
const paths=['tests/host/dormant-route-package-browser.mjs','tests/host/fixtures/server.mjs','tests/host/fixtures/native.mjs','tests/host/fixtures/legacy.html','tests/host/prepared-dormancy-probe.mjs','tests/host/j2-runner-bounds.mjs','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs'];
const report={status:'NOT_RUN',qualification:'NARROW_INSTRUMENTED_DORMANT_ROUTE_ORDERING_NOT_J1_ACCEPTANCE',realChatGPT:'NOT_RUN',naturalWorkerSleep:'NOT_TESTED',mutation:mutant?'REMOVE_DORMANT_NATIVE_ROUTE_REBIND':null,errors:[]};
let browser,server,guard,context,page,manifest,built,readTrace;const modified=new Map(),started=performance.now();
const poll=fn=>j2Poll(fn,15000);
try{
 report.fixtureHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
 server=await createHostFixtureServer();const dir=await mkdtemp(join(tmpdir(),'vaiwl-dormant-route-'));built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));report.sourceHashes=manifest.sourceHashes;
 const patch=async(path,anchor,replacement)=>{const original=await readFile(join(built.unpacked,path),'utf8');assert.equal(original.split(anchor).length,2,path);const source=original.replace(anchor,replacement);await writeFile(join(built.unpacked,path),source);modified.set(path,hash(source));};
 function observeTransport(){
  const send=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.__routeTrace=[];let sequence=0;
  const route=()=>location.pathname==='/c/44444444-4444-4444-8444-444444444444'?'TARGET':'INITIAL';
  const record=row=>{if(__routeTrace.length<128)__routeTrace.push({...row,at:performance.now(),route:route()});};
  chrome.runtime.onMessage.addListener(message=>{if(message?.type==='HOST_DOCUMENT_INVALIDATED')record({direction:'incoming',type:message.type});});
  chrome.runtime.sendMessage=function(...args){const message=args[0],id=++sequence,observed=['HOST_HELLO','HOST_REFRESH','HOST_UI_IDLE_RELEASE','HOST_UI_CONFIRM'].includes(message?.type);if(observed)record({direction:'request',id,type:message.type});const result=send(...args);if(observed&&result?.then)result.then(value=>record({direction:'reply',id,type:message.type,ok:value?.ok===true,state:value?.state??null,documentToken:value?.binding?.documentToken??message.documentToken??null}),()=>record({direction:'rejection',id,type:message.type}));return result;};
 }
 await patch('extension/content-entry.mjs',' void session.start();',' ('+observeTransport.toString()+')();\n globalThis.__routeDormancy=('+createPreparedDormancyProbe.toString()+')(session);\n void session.start();');
 await patch('src/runtime/host-worker-runtime.mjs',' return Object.freeze({service,stop});',' globalThis.__routeWorkerIdle=()=>service.isIdle()===true;\n return Object.freeze({service,stop});');
 const compiled=compileClassicWorker(built.unpacked);for(const [p,s]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){await writeFile(join(built.unpacked,p),s);modified.set(p,hash(s));}
 if(mutant){const anchor="    if(current===s&&reason==='dormant-document-changed'&&doc.location.href!==s.url){rebind(s,'reading');return;}\n";await patch('src/host/content-session.mjs',anchor,'');}
 const native=await readFile('tests/host/fixtures/native.mjs','utf8'),anchor="  if (!pop) history.pushState(null, '', path);";assert.equal(native.split(anchor).length,2);
 const injected=native.replace(anchor,anchor+"\n  if(!pop){globalThis.fixtureRouteResizeCount=(globalThis.fixtureRouteResizeCount??0)+1;dispatchEvent(new Event('resize'));}");
 report.fixtureFault={kind:'SYNCHRONOUS_NATIVE_RESIZE_AFTER_NATIVE_PUSHSTATE_BEFORE_DOM_MUTATION',originalHash:hash(native),injectedHash:hash(injected)};
 report.packageInstrumentation=Object.fromEntries(modified);
 guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});browser=await launchNativeVisibilityBrowser({chromium,profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config,executablePath:process.env.FREE_CHROME_EXECUTABLE});context=browser.context;context.setDefaultTimeout(15000);
 await context.route('**/*',r=>r.request().url()===server.origin+'/native.mjs'?r.fulfill({contentType:'text/javascript',body:injected}):r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'))??await context.waitForEvent('serviceworker');
 assert.equal(await j2Within('worker-network-probe',()=>worker.evaluate(j2ExternalProbe)), 'BLOCKED');
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);
 const frame=()=>page.frames().find(f=>f.url()==='chrome-extension://'+id+'/workspace.html');const oldFrame=await poll(frame);await oldFrame.getByRole('link',{name:'Membership not loaded',exact:true}).waitFor();
 await page.locator('textarea').fill('DORMANT_ROUTE_DRAFT');await page.evaluate(()=>{globalThis.routeDocument=document;globalThis.routeEditor=document.querySelector('textarea');routeEditor.setSelectionRange(2,7);globalThis.routePagehides=0;addEventListener('pagehide',()=>routePagehides++);});
 await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();await page.locator('main > header > h1').click();
 const session=await context.newCDPSession(page),worlds=[];session.on('Runtime.executionContextCreated',e=>worlds.push(e.context));await session.send('Runtime.enable');
 const evaluate=async(expression,contextId)=>{const r=await j2Within('isolated-observation',()=>session.send('Runtime.evaluate',{expression,contextId,returnByValue:true,awaitPromise:true}));assert.equal(r.exceptionDetails,undefined);return r.result.value;};
 const isolated=await poll(async()=>{for(const w of worlds.filter(w=>w.auxData?.isDefault===false))try{if(await evaluate(`window===top&&chrome.runtime.id===${JSON.stringify(id)}&&typeof __routeDormancy==='function'`,w.id))return w.id;}catch{}return null;});
 assert.equal(await page.evaluate(()=>typeof __routeDormancy),'undefined');readTrace=()=>evaluate('__routeTrace.slice()',isolated);
 const probe=createWorkerPreparedDormancyProbe({workerIdle:()=>worker.evaluate(()=>__routeWorkerIdle()),attempt:()=>evaluate('__routeDormancy()',isolated)});
 report.phase='prepare-dormant';report.prepared=await observeWorkerPreparedDormancy(poll,probe);assert.deepEqual(report.prepared,{prepared:true,entered:true});assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);
 const before=await readTrace();assert.equal(before.filter(r=>r.direction==='reply'&&r.type==='HOST_HELLO').length,1);assert(before.some(r=>r.type==='HOST_UI_IDLE_RELEASE'&&r.ok));
 report.phase='native-route';await page.locator('aside nav[aria-label="Chat history"] a[href="/c/44444444-4444-4444-8444-444444444444"]').click();
 await page.waitForURL(server.origin+'/c/44444444-4444-4444-8444-444444444444');assert.equal(await page.locator('#reading').getAttribute('data-conversation-id'),'44444444-4444-4444-8444-444444444444');
 report.nativeRouteObserved={targetURL:page.url()===server.origin+'/c/44444444-4444-4444-8444-444444444444',targetBody:await page.locator('#reading').getAttribute('data-conversation-id')==='44444444-4444-4444-8444-444444444444',resizeCount:await page.evaluate(()=>fixtureRouteResizeCount)};assert.deepEqual(report.nativeRouteObserved,{targetURL:true,targetBody:true,resizeCount:1});report.phase='fresh-reading-return';await poll(()=>frame()&&frame()!==oldFrame);assert.equal(oldFrame.isDetached(),true);
 await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);
 const trace=await readTrace(),requests=trace.filter(r=>r.direction==='request'),hellos=trace.filter(r=>r.direction==='reply'&&r.type==='HOST_HELLO'),targetHellos=requests.filter(r=>r.type==='HOST_HELLO'&&r.route==='TARGET'),invalidations=trace.filter(r=>r.direction==='incoming');
 // The synchronous content rebind precedes Chrome's independent navigation
 // revocation. That notification requires another fresh HELLO; its superseded
 // predecessor must not proceed to REFRESH, and cannot authorize the new frame.
 assert.equal(invalidations.length,1);assert.equal(invalidations[0].route,'TARGET');assert.equal(hellos.length,3);assert.equal(targetHellos.length,2);
 assert(targetHellos[0].at<invalidations[0].at&&invalidations[0].at<=targetHellos[1].at);assert.equal(new Set(hellos.map(r=>r.documentToken)).size,3);
 assert.equal(requests.filter(r=>r.type==='HOST_REFRESH').length,2);assert.equal(trace.filter(r=>r.type==='HOST_REFRESH'&&r.state==='verified').length,2);
 const targetRefresh=requests.find(r=>r.type==='HOST_REFRESH'&&r.route==='TARGET');assert(targetRefresh.at>=targetHellos[1].at);
 const latest=hellos.find(r=>r.id===targetHellos[1].id).documentToken,superseded=hellos.find(r=>r.id===targetHellos[0].id).documentToken;
 assert.notEqual(latest,superseded);assert.equal(trace.find(r=>r.direction==='reply'&&r.id===targetRefresh.id).documentToken,latest);
 const confirmations=trace.filter(r=>r.direction==='reply'&&r.type==='HOST_UI_CONFIRM'&&r.route==='TARGET');assert.equal(confirmations.length,2);assert(confirmations.every(r=>r.ok&&r.documentToken===latest));
 report.navigationRevocation={observed:1,contentRouteHello:1,postRevocationHello:1,supersededRefreshRequests:0,refreshAndBothFramesUseLatestBinding:true};
 assert.deepEqual(await page.evaluate(()=>({document:document===routeDocument,editor:document.querySelector('textarea')===routeEditor,draft:routeEditor.value,start:routeEditor.selectionStart,end:routeEditor.selectionEnd,pagehides:routePagehides})),{document:true,editor:true,draft:'DORMANT_ROUTE_DRAFT',start:2,end:7,pagehides:0});
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);await frame().getByRole('link',{name:'Membership not loaded',exact:true}).waitFor();
 report.freshBinding=true;report.freshVerifiedRefresh=true;report.native=server.snapshot();assert.equal(report.native.actions.navigate,1);assert.deepEqual(report.errors,[]);report.status='PASS_NARROW_DORMANT_NATIVE_ROUTE';report.elapsedMs=performance.now()-started;
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 if(readTrace)try{const trace=await readTrace();report.transport=trace.map(({documentToken,...row})=>row);}catch{}
 const clean=await cleanupOwnedResources(report,[['package-integrity',async()=>{if(manifest)for(const [p,h]of Object.entries(manifest.files))assert.equal(hash(await readFile(join(built.unpacked,p))),modified.get(p)??h,p);}],['browser',()=>browser?.close()],['fixture',()=>server?.close()],['guard',async()=>{if(guard){report.networkGuard=guard.snapshot();await guard.close();}}],['source-integrity',async()=>{report.sourceStable=(await Promise.all(Object.entries({...report.sourceHashes,...report.fixtureHashes}).map(async([p,h])=>hash(await readFile(p))===h))).every(Boolean);assert(report.sourceStable);}]]);
 if(!clean)process.exitCode=1;await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,phase:report.phase,error:report.error,elapsedMs:report.elapsedMs,output}));
