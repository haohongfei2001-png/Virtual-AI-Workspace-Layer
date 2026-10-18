/** Actual MV3 visible-entry regression; synthetic host, no live Profile access.
 * These observations are not a replacement for the full approved v2.7 oracle.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const output=process.argv[2];assert(output,'output-json-required');
const testPaths=['tests/host/visible-actions-package-browser.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs','tests/host/fixtures/server.mjs','tests/host/fixtures/legacy.html','tests/host/fixtures/native.mjs','tests/host/fixtures/native.css'];
const hashes=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const report={kind:'ACTUAL_MV3_OFFLINE_VISIBLE_ACTIONS',realChatGPT:'NOT_RUN',fullV27Acceptance:'NOT_ESTABLISHED',status:'NOT_RUN',steps:[],screenshots:[],errors:[],testHashes:await hashes(testPaths)};
const started=performance.now();
let server,guard,context,page,built,manifest;
try{
 server=await createHostFixtureServer();guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 const dir=await mkdtemp(join(tmpdir(),'vaiwl-visible-actions-'));report.artifactDirectory=dir;
 built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineSnippets:true});
 const manifestBytes=await readFile(join(built.unpacked,'build-manifest.json'));manifest=JSON.parse(manifestBytes);report.sourceHashes=manifest.sourceHashes;report.manifestHash=hash(manifestBytes);report.fixture=server.manifest;
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith(`chrome-extension://${id}/`),timeout:15000});
 report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.workerNetworkBlocked);
 report.startup='REGISTERED_WORKER_PRECONDITION_NOT_COLD_START';
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');
 async function workspace(){
  await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2||[...document.querySelectorAll('button')].some(n=>n.getAttribute('aria-label')==='返回工作空间'),null,{timeout:15000});
  const back=page.getByRole('button',{name:'返回工作空间',exact:true});if(await back.isVisible())await back.click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
  const frames=Object.fromEntries(['workspace','sidebar'].map(role=>[role,page.frames().find(f=>f.url()===`chrome-extension://${id}/${role}.html`)]));assert(frames.workspace&&frames.sidebar);
  await frames.workspace.locator('.workspace').waitFor();await frames.sidebar.locator('.toolbar').waitFor();return frames;
 }
 let frames=await workspace();
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.locator('#prompt-textarea').fill('VISIBLE_ACTIONS_UNSENT_DRAFT');
 await page.locator('#composer input[type=file]').setInputFiles({name:'visible-actions.txt',mimeType:'text/plain',buffer:Buffer.from('offline fixture')});
 await page.evaluate(()=>{globalThis.visibleActionsOriginal={document,editor:document.querySelector('#prompt-textarea'),input:document.querySelector('#composer input[type=file]'),file:document.querySelector('#composer input[type=file]').files[0]};});
 const actionsBefore=server.snapshot().actions;
 async function continuity(){assert.equal(await page.evaluate(()=>{const o=visibleActionsOriginal;return o.document===document&&o.editor===document.querySelector('#prompt-textarea')&&o.editor.isConnected&&o.editor.value==='VISIBLE_ACTIONS_UNSENT_DRAFT'&&o.input===document.querySelector('#composer input[type=file]')&&o.file===o.input.files[0];}),true);assert.deepEqual(server.snapshot().actions,actionsBefore);}
 async function screenshot(name){await Promise.all(page.frames().filter(f=>f.url().startsWith('chrome-extension://')).map(f=>f.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))));await page.waitForTimeout(200);await page.screenshot({path:join(dir,name+'.png')});report.screenshots.push({name,path:join(dir,name+'.png')});}
 async function visibleLabel(locator,label){
  await locator.waitFor({state:'visible'});
  const observation=await locator.evaluate(n=>{const r=n.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(n);const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);return {text:n.textContent,rect:r.toJSON(),textRects:rects.map(r=>r.toJSON()),style:{display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility},viewport:{width:innerWidth,height:innerHeight},scrollWidth:n.scrollWidth,clientWidth:n.clientWidth};});
  report.steps.push({label,...observation});assert.equal(observation.text,label,'visible action must carry its readable label');assert(observation.textRects.length>0,'visible glyph rectangles required');
  for(const r of observation.textRects)assert(r.left>=observation.rect.left-1&&r.right<=observation.rect.right+1&&r.top>=observation.rect.top-1&&r.bottom<=observation.rect.bottom+1,'label must fit its control');
  assert(observation.rect.width>0&&observation.rect.height>=30);assert(observation.rect.left>=-1&&observation.rect.right<=observation.viewport.width+1,'control must stay in frame');
 }
 frames=await workspace();await frames.workspace.getByRole('button',{name:'工作空间设置',exact:true}).click();
 await frames.workspace.getByRole('region',{name:'工作空间设置',exact:true}).waitFor();await screenshot('desktop-settings');
 await visibleLabel(frames.sidebar.getByRole('button',{name:'已保存片段',exact:true}),'已保存片段');
 const labels=['已保存片段','备份与导入','本地数据恢复','关闭设置'];
 async function checkSettings(){await visibleLabel(frames.sidebar.getByRole('button',{name:'已保存片段',exact:true}),'已保存片段');for(const label of labels)await visibleLabel(frames.workspace.getByRole('button',{name:label,exact:true}),label);await continuity();}
 await checkSettings();
 // Traverse each actual panel through its visible entry and existing return.
 async function panels(phase){for(const [label,region]of [['已保存片段','片段管理'],['备份与导入','人工资产备份'],['本地数据恢复','本地数据恢复']]){
  await frames.workspace.getByRole('button',{name:label,exact:true}).click();const panel=frames.workspace.getByRole('region',{name:region,exact:true});await panel.waitFor();const geometry=await panel.evaluate(n=>({fontSize:getComputedStyle(n.querySelector('h2')).fontSize,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,frameWidth:innerWidth,rect:n.getBoundingClientRect().toJSON()}));report.steps.push({phase,region,geometry});assert.equal(geometry.fontSize,'15px');assert(geometry.scrollWidth<=geometry.clientWidth+1,'panel must not overflow');assert(geometry.rect.right<=geometry.frameWidth+1);await screenshot(phase+'-'+region);await continuity();
  await panel.getByRole('button',{name:'返回工作空间',exact:true}).click();frames=await workspace();await frames.workspace.getByRole('button',{name:'工作空间设置',exact:true}).click();await checkSettings();
 }}
 await panels('desktop');
 await frames.workspace.getByRole('button',{name:'关闭设置',exact:true}).click();assert.equal(await frames.workspace.getByRole('region',{name:'工作空间设置',exact:true}).count(),0);
 for(const [width,colorScheme]of [[1440,'dark'],[420,'dark'],[420,'light']]){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme});frames=await workspace();const toggle=frames.workspace.getByRole('button',{name:'工作空间设置',exact:true});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await frames.workspace.getByRole('region',{name:'工作空间设置',exact:true}).waitFor();await checkSettings();await screenshot(`${width}-${colorScheme}-settings`);await panels(`${width}-${colorScheme}`);
 }
 await continuity();assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=context.browser().version();report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 report.elapsedBeforeCleanupMs=performance.now()-started;
 const clean=await cleanupOwnedResources(report,[['context',()=>context?.close()],['fixture',()=>server?.close()],['guard',()=>guard?.close()],['integrity',async()=>{
 report.networkGuard=guard?.snapshot();report.testStable=JSON.stringify(await hashes(testPaths))===JSON.stringify(report.testHashes);
 report.sourceStable=manifest?JSON.stringify(await hashes(Object.keys(manifest.sourceHashes)))===JSON.stringify(manifest.sourceHashes):false;
 report.manifestStable=built?hash(await readFile(join(built.unpacked,'build-manifest.json')))===report.manifestHash:false;
 if(!report.testStable||!report.sourceStable||!report.manifestStable){report.status='FAIL';report.error=(report.error??'')+' source-or-test-or-package-changed';process.exitCode=1;}
 }]]);if(!clean)process.exitCode=1;
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,error:report.error,elapsedBeforeCleanupMs:report.elapsedBeforeCleanupMs,screenshots:report.screenshots}));
