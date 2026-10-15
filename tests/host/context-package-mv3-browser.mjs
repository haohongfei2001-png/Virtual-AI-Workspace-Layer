import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createColdTracePackage,verifyColdTracePackage} from './cold-context-trace.mjs';
import {digest} from '../../src/data/hash.mjs';
const C='33333333-3333-4333-8333-333333333333',server=await createVariantHostFixtureServer({profile:'MODERN'}),dir=await mkdtemp(join(tmpdir(),'vaiwl-c2-package-')),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true});
const info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8')),hash=v=>createHash('sha256').update(v).digest('hex');
const script=new URL(import.meta.url),scriptHash=hash(await readFile(script));
const report={scriptHash,startupMode:['cold','cold-trace'].includes(process.argv[3])?'COLD_IMMEDIATE_AFTER_LOAD_UNPACKED':'WORKER_READY_PRECONDITION',evidence:'REAL_HEADLESS_PACKAGED_MV3_OFFLINE_C2',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',profileScope:'CONVERSATION_GET_ONLY_NOT_FULL_MODERN_ACCEPTANCE',package:built,fixture:server.manifest,sourceHashes:info.sourceHashes,results:[],errors:[]};let context,page,worker;
try{
 report.originalPackageVerification=verifyHost(built.unpacked);
 const trace=process.argv[3]==='cold-trace'?await createColdTracePackage(built.unpacked,join(dir,'cold-trace-extension')):null;if(trace){report.evidence="REAL_HEADLESS_INSTRUMENTED_PACKAGE_COPY_OFFLINE_C2";report.instrumentation=trace;await verifyColdTracePackage(trace);}
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:trace?.unpacked??built.unpacked});
 if(!['cold','cold-trace'].includes(process.argv[3])){worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');
 await worker.evaluate(()=>{globalThis.__offlineDiagnostic=[];const record=x=>{if(__offlineDiagnostic.length<40)__offlineDiagnostic.push(x);};for(const name of ['onSendHeaders','onCompleted','onErrorOccurred'])chrome.webRequest[name].addListener(d=>{record({event:name,requestId:d.requestId,tabId:d.tabId,frameId:d.frameId,documentId:d.documentId,documentLifecycle:d.documentLifecycle,initiator:d.initiator,type:d.type,method:d.method,url:d.url,statusCode:d.statusCode,fromCache:d.fromCache});void chrome.webNavigation.getFrame({tabId:d.tabId,frameId:0}).then(frame=>record({event:'getFrame',frame}));void chrome.tabs.get(d.tabId).then(tab=>record({event:'getTab',id:tab.id,incognito:tab.incognito}));},{urls:['http://127.0.0.1/*/conversation/*','http://127.0.0.1/backend-api/conversation/*']});chrome.runtime.onMessage.addListener((m,sender)=>{record({event:'content-command',type:m?.type,documentId:sender.documentId});});});
 }
 page=await context.newPage();report.requestTimeline=[];page.on('request',r=>{const u=new URL(r.url());if(u.origin===server.origin&&u.pathname.startsWith('/backend-api/conversation/')&&report.requestTimeline.length<16)report.requestTimeline.push({at:Date.now(),event:'native-request',path:u.pathname});});page.on('pageerror',error=>report.errors.push(error.message));await page.goto(server.origin+'/c/'+C);
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000});
 const workspace=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(workspace);await workspace.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:15000});
 worker??=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`));assert(worker);
 assert(await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}}));report.workerExternalNetworkBlocked=true;
 const scopes=await workspace.evaluate(async()=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));const base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});}finally{base.close();}});
 const expected=JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-team'])]);assert.deepEqual(scopes,[expected]);
 report.results.push({name:'C2-native-request-authenticated-roster-second-context-to-native-Free-UI',status:'PASS',scopeCount:scopes.length});
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');assert.deepEqual(report.errors,[]);report.browserVersion=context.browser().version();report.status='PASS';
}catch(error){report.status=context?'FAIL':'NOT_RUN_BROWSER_STARTUP';report.error=error.stack;process.exitCode=1;try{report.failure=await page.evaluate(()=>({url:location.href,state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,owned:document.querySelectorAll('[data-va-owned]').length,body:document.querySelector('#reading')?.outerHTML}));report.native=server.snapshot();worker??=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'));report.diagnostics=await worker?.evaluate(()=>({warm:globalThis.__offlineDiagnostic??null,cold:globalThis.__vaiwlColdTrace??null}));}catch{}}
finally{if(worker&&!report.diagnostics)try{report.diagnostics=await worker.evaluate(()=>({warm:globalThis.__offlineDiagnostic??null,cold:globalThis.__vaiwlColdTrace??null}));}catch{}await context?.close();if(report.instrumentation)await verifyColdTracePackage(report.instrumentation);verifyHost(built.unpacked);await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(script))!==scriptHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun){report.status='FAIL';process.exitCode=1;}await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
