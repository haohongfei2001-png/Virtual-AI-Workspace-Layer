/** Actual packaged MV3 against PARTIAL reconstruction, never live ChatGPT. */
import assert from 'node:assert/strict';
import {tmpdir,platform} from 'node:os';
import {j2ExternalProbe} from './j2-runner-bounds.mjs';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const server=await createHostFixtureServer({profile:'PARTIAL'}),dir=await mkdtemp(join(tmpdir(),'vaiwl-partial-package-')),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});
const info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),scriptHash=hash(await readFile(new URL(import.meta.url))),manifestHash=hash(await readFile(join(built.unpacked,'build-manifest.json')));
const fixtureFiles=['j2-runner-bounds.mjs','fixtures/server.mjs','fixtures/native.mjs','fixtures/variants-server.mjs','fixtures/variants-native.mjs','fixtures/native.css','fixtures/legacy.html'];
const fixtureHashes=Object.fromEntries(await Promise.all(fixtureFiles.map(async file=>[file,hash(await readFile(new URL(file,import.meta.url)))])));
const ids=['77777777-7777-4777-8777-000000001000','77777777-7777-4777-8777-000000000999'];
const report={evidence:'REAL_HEADLESS_PACKAGED_MV3_PARTIAL_RECONSTRUCTION',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',package:built,sourceHashes:info.sourceHashes,scriptHash,fixtureHashes,buildManifestHash:manifestHash,results:[],errors:[],transport:[]};let context,page;
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');report.workerExternalNetwork=await worker.evaluate(j2ExternalProbe,1500);assert.equal(report.workerExternalNetwork,'BLOCKED');page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',message=>{const text=message.text();if(text.startsWith('VAIWL_TRANSPORT ')){try{report.transport.push(JSON.parse(text.slice(16)));}catch{}}});await page.goto(server.origin+'/c/'+ids[0]);
 const workspace=async()=>{await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});const frame=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(frame);return frame;};
 const traceFrame=async frame=>frame.evaluate(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async packet=>{try{const result=await send(packet);console.log('VAIWL_TRANSPORT '+JSON.stringify({role:location.pathname,type:packet.type??packet.kind,state:result?.state,ok:result?.ok,reason:result?.reason}));return result;}catch(error){console.log('VAIWL_TRANSPORT '+JSON.stringify({role:location.pathname,type:packet.type??packet.kind,reason:'transport-rejected'}));throw error;}};});
 let frame=await workspace();for(const ui of page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id)))await traceFrame(ui);assert.equal(await page.locator('aside nav[aria-label="Chat history"] a').count(),25);assert.equal(await page.locator(`aside nav[aria-label="Chat history"] a[href="/c/${ids[0]}"]`).count(),0);
 let current=frame.locator('[data-free-list="unknown"]').getByRole('link',{name:'Archive conversation 1000',exact:true});await current.waitFor({timeout:15000});assert.equal(await current.getAttribute('aria-current'),'page');assert.equal(await frame.locator('[data-free-list="noProject"]').getByRole('link',{name:'Archive conversation 1000',exact:true}).count(),0);
 report.results.push({name:'deep-link-outside-initial-25-uses-native-title-UNKNOWN-and-current',status:'PASS'});
 await page.locator('textarea').fill('PARTIAL_NATIVE_UNSENT_DRAFT');await page.evaluate(()=>{globalThis.partialOriginalEditor=document.querySelector('textarea');});await page.getByRole('button',{name:'返回工作空间',exact:true}).click();frame=await workspace();
 // DOM virtualization probe only: remove exposed native history rows, without
 // changing accounts, backing facts, current route, or adapter-owned UI.
 await page.locator('aside nav[aria-label="Chat history"]').evaluate(nav=>{nav.querySelectorAll('a').forEach(a=>a.remove());});
 // A real visible title mutation provides an observable accepted update after
 // removal; the current chat must remain reachable from its reading identity.
 await page.locator('main h1').evaluate(node=>{node.textContent='Archive conversation 1000 refreshed';});
 current=frame.locator('[data-free-list="unknown"]').getByRole('link',{name:'Archive conversation 1000 refreshed',exact:true});await current.waitFor({timeout:15000});assert.equal(await current.getAttribute('aria-current'),'page');
 assert.equal(await page.evaluate(()=>document.querySelector('textarea')===partialOriginalEditor&&partialOriginalEditor.value==='PARTIAL_NATIVE_UNSENT_DRAFT'),true);
 report.results.push({name:'native-history-unmount-retains-reading-bound-current-and-editor',status:'PASS'});
 // Use the fixture's ordinary native search UI to navigate, not history.pushState
 // or a privileged extension command.
 await page.locator('#search-button').click();await page.locator('#search-dialog input').fill('Archive conversation 999');const nativeResult=page.locator('#search-dialog').getByRole('link',{name:'Archive conversation 999',exact:true});await nativeResult.waitFor();const oldFrames=page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id));await nativeResult.click();await page.waitForURL('**/c/'+ids[1]);
 frame=await workspace();await frame.locator('[data-free-list="unknown"], [aria-label="当前聊天"][data-current-membership="UNKNOWN"]').getByRole('link',{name:'Archive conversation 999',exact:true}).waitFor({timeout:15000});assert(oldFrames.every(f=>f.isDetached()));
 assert.equal(await frame.getByRole('link',{name:'Archive conversation 999',exact:true}).getAttribute('aria-current'),'page');assert.equal(await frame.locator(`[data-ref-id="${ids[0]}"][aria-current="page"]`).count(),0);
 assert.equal(await page.evaluate(()=>document.querySelector('textarea')===partialOriginalEditor&&partialOriginalEditor.value==='PARTIAL_NATIVE_UNSENT_DRAFT'),true);
 report.results.push({name:'native-search-SPA-second-unloaded-chat-does-not-reuse-old-current',status:'PASS'});
 assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;try{report.pages=await Promise.all(context.pages().map(async p=>({url:p.url(),frames:await Promise.all(p.frames().map(async f=>({url:f.url(),body:await f.locator('body').innerText().catch(()=>null),rows:await f.locator('[data-ref-id]').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-ref-id'),current:n.getAttribute('aria-current'),text:n.textContent}))).catch(()=>[])}))),body:await p.locator('body').innerText()})));}catch{}process.exitCode=1;}
finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([path,hash])=>createHash('sha256').update(await readFile(path)).digest('hex')!==hash))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(new URL(import.meta.url)))!==scriptHash;report.fixtureChangedDuringRun=(await Promise.all(Object.entries(fixtureHashes).map(async([file,value])=>hash(await readFile(new URL(file,import.meta.url)))!==value))).some(Boolean);report.buildManifestUnchanged=hash(await readFile(join(built.unpacked,'build-manifest.json')))===manifestHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun||report.fixtureChangedDuringRun||!report.buildManifestUnchanged){report.status='SOURCE_CHANGED';process.exitCode=1;}await writeFile(process.argv[2]??join(tmpdir(),'free-partial-package-mv3.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
