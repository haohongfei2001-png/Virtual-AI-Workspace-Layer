/** Real wall-clock scope renewal in the unchanged packaged offline host. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const server=await createHostFixtureServer(),directory=await mkdtemp('/private/tmp/vaiwl-scope-renewal-'),built=packageHost(join(directory,'package'),{offlineOrigin:server.origin}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const report={evidence:'REAL_HEADLESS_PACKAGED_MV3_SCOPE_RENEWAL_LEGACY_RECONSTRUCTION',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',databaseRevisionUnchanged:'NOT_TESTED; UI continuity and fixed-provider request coalescing only',package:built,sourceHashes:manifest.sourceHashes,samples:[],results:[],errors:[],transport:[],workerLifecycle:[]};let context,page;
const providerCounts=()=>{const r=server.snapshot().requests;return {session:r['/api/auth/session']??0,roster:r['/backend-api/accounts/check/v4-2023-04-27']??0};};
try{
 context=await chromium.launchPersistentContext(join(directory,'profile'),{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin)||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));const loadedAt=performance.now();await page.goto(server.url);
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});
 const workspace=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`),sidebar=page.frames().find(f=>f.url()===`chrome-extension://${id}/sidebar.html`);assert(workspace&&sidebar);await workspace.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:15000});
 await page.locator('textarea').fill('SCOPE_RENEWAL_UNSENT_DRAFT');await page.evaluate(()=>{globalThis.renewalOriginalEditor=document.querySelector('textarea');});await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
 const horizon=workspace.getByRole('combobox',{name:'工作空间时间范围',exact:true});await horizon.selectOption('7');await workspace.waitForFunction(()=>{const e=document.querySelector('[data-vaiwl-owned]')?.shadowRoot?.querySelector('[aria-label="工作空间时间范围"]');return e?.value==='7'&&!e.disabled;},{},{timeout:10000});
 await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();const search=workspace.getByRole('searchbox',{name:'已知聊天查找输入'});await search.waitFor({timeout:10000});await search.fill('Ordinary');await workspace.getByRole('link',{name:'Ordinary conversation',exact:true}).waitFor({timeout:10000});
 const traceStarted=performance.now();
 const traceSource=`(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async packet=>{try{const result=await original(packet);console.log('VAIWL_RENEWAL_TRACE '+JSON.stringify({type:packet.type??packet.kind,publicState:result?.state,ok:result?.ok,reason:result?.reason}));return result;}catch(error){console.log('VAIWL_RENEWAL_TRACE '+JSON.stringify({type:packet.type??packet.kind,reason:'transport-rejected'}));throw error;}};})()`;
 function recordTrace(text,channel){if(!text.startsWith('VAIWL_RENEWAL_TRACE '))return;try{const value=JSON.parse(text.slice(20));report.transport.push({elapsedMs:performance.now()-traceStarted,channel,type:value.type,publicState:value.publicState,ok:value.ok,reason:value.reason});}catch{}}
 page.on('console',message=>recordTrace(message.text(),'page-or-frame'));
 for(const worker of context.serviceWorkers()){report.workerLifecycle.push({event:'present',elapsedMs:performance.now()-traceStarted});worker.on('close',()=>report.workerLifecycle.push({event:'closed',elapsedMs:performance.now()-traceStarted}));}
 context.on('serviceworker',worker=>{report.workerLifecycle.push({event:'created',elapsedMs:performance.now()-traceStarted});worker.on('close',()=>report.workerLifecycle.push({event:'closed',elapsedMs:performance.now()-traceStarted}));});
 for(const frame of [workspace,sidebar])await frame.evaluate(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async packet=>{try{const result=await original(packet);console.log('VAIWL_RENEWAL_TRACE '+JSON.stringify({type:packet.type??packet.kind,publicState:result?.state,ok:result?.ok,reason:result?.reason}));return result;}catch(error){console.log('VAIWL_RENEWAL_TRACE '+JSON.stringify({type:packet.type??packet.kind,reason:'transport-rejected'}));throw error;}};});
 const contentCDP=await context.newCDPSession(page),worlds=[];contentCDP.on('Runtime.executionContextCreated',event=>worlds.push(event.context));
 contentCDP.on('Runtime.consoleAPICalled',event=>{const text=event.args?.[0]?.value;if(typeof text==='string')recordTrace(text,'cdp-isolated');});
 await contentCDP.send('Runtime.enable');const contentWorld=worlds.find(world=>world.origin==='chrome-extension://'+id);
 report.contentTraceInstalled=!!contentWorld;if(contentWorld)await contentCDP.send('Runtime.evaluate',{contextId:contentWorld.id,expression:traceSource});
 const initial=providerCounts();assert.deepEqual(initial,{session:1,roster:1});const started=performance.now();
 async function observe(label){assert(!workspace.isDetached()&&!sidebar.isDetached());assert.equal(page.frames().find(f=>f.url()===workspace.url()),workspace);assert.equal(page.frames().find(f=>f.url()===sidebar.url()),sidebar);assert.equal(await search.inputValue(),'Ordinary');assert.equal(await horizon.inputValue(),'7');assert.equal(await page.evaluate(()=>document.querySelector('textarea')===renewalOriginalEditor&&renewalOriginalEditor.value==='SCOPE_RENEWAL_UNSENT_DRAFT'),true);report.samples.push({label,elapsedMs:performance.now()-started,sinceNavigationMs:performance.now()-loadedAt,...providerCounts()});}
 await observe('initial');
 // Real timers intentionally run; each wait is <=30 seconds. No virtual clock,
 // renewed-grant injection, service hook or browser focus is used.
 await page.waitForTimeout(30000);await observe('30-seconds');assert.deepEqual(providerCounts(),initial,'ten-second UI/document heartbeats must not refetch session/roster');
 await page.waitForTimeout(30000);await observe('60-seconds');
 await page.waitForTimeout(6000);await observe('66-seconds');
 assert(performance.now()-started>=65000);assert.deepEqual(providerCounts(),{session:2,roster:2},'one near-expiry coalesced principal/context verification');assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
 report.results.push({name:'real-over-65s-same-private-frames-query-H7-and-native-editor-preserved',status:'PASS'},{name:'session-roster-initial-once-plus-one-near-expiry-not-every-heartbeat',status:'PASS'});report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;report.providerCounts=providerCounts();try{report.frames=page?.frames().map(f=>f.url());}catch{}process.exitCode=1;}
finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([path,hash])=>createHash('sha256').update(await readFile(path)).digest('hex')!==hash))).some(Boolean);await writeFile(process.argv[2]??'/private/tmp/free-scope-renewal-package-mv3.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error,samples:report.samples,results:report.results}));
