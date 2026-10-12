/** Actual browser lifecycle, isolated synthetic host. No private ChatGPT access. */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {build} from '../../simulator/build.mjs';
import {createServer} from '../../simulator/server.mjs';
const dir=await mkdtemp(join(tmpdir(),'vaiwl-free-lifecycle-')),extension=join(dir,'extension'),hashes=build(extension);
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const report={evidence:'REAL_CHROME_MV3_SYNTHETIC_LIFECYCLE',realChatGPT:'NOT_RUN',headless:true,hashes,results:[],pageErrors:[]};let context,page,ownedBrowser,chromeProcess;
const save=()=>process.argv[2]?writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n'):Promise.resolve();
const run=async(name,fn)=>{try{report.results.push({name,status:'PASS',...await fn()});}catch(e){report.results.push({name,status:'FAIL',error:e.stack});}console.log(JSON.stringify(report.results.at(-1)));await save();};
const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.vaiwlHfState==='ACTIVE',null,{timeout:15000});
const probe=async p=>{await p.evaluate(()=>{delete document.documentElement.dataset.hfWorkerProbe;document.dispatchEvent(new Event('hf:test-worker-probe'));});await p.waitForFunction(()=>document.documentElement.dataset.hfWorkerProbe);return JSON.parse(await p.locator('html').getAttribute('data-hf-worker-probe'));};
const draft='FR-11 未发送草稿，禁止自动刷新';
const preserved=async()=>{assert.deepEqual(await page.evaluate(()=>({same:globalThis.lifecycleComposer===document.querySelector('textarea[aria-label="消息输入"]'),draft:document.querySelector('textarea[aria-label="消息输入"]').value,documents:performance.getEntriesByType('navigation').length})),{same:true,draft,documents:1});assert.equal(await page.getByRole('button',{name:'工具',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'搜索聊天',exact:true}).count(),1);};
try{
 const profile=join(dir,'profile');await mkdir(profile);chromeProcess=spawn(process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--disable-sync','--disable-background-networking','--disable-component-update','--use-mock-keychain','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let endpoint;for(let i=0;i<100;i++){try{const [port,path]=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n');endpoint='ws://127.0.0.1:'+port+path;break;}catch{if(chromeProcess.exitCode!==null)throw Error('owned-chrome-exited');await new Promise(r=>setTimeout(r,100));}}
 assert(endpoint,'owned-chrome-cdp-not-ready');ownedBrowser=await chromium.connectOverCDP(endpoint,{noDefaults:true});context=ownedBrowser.contexts()[0];report.noDefaults=true;
 context.setDefaultTimeout(12000);
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession();report.browser=(await cdp.send('Browser.getVersion')).product;const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension});report.extensionId=id;
 page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(origin+'/hf/A/c/T0?mode=mv3');await ready(page);
 if(await page.locator('[data-vaiwl-return]').isVisible())await page.locator('[data-vaiwl-return]').click();
 await page.getByRole('textbox',{name:'消息输入',exact:true}).fill(draft);
 await page.evaluate(()=>{globalThis.lifecycleComposer=document.querySelector('textarea[aria-label="消息输入"]');globalThis.lifecycleEvents=[];for(const type of ['freeze','resume'])document.addEventListener(type,e=>lifecycleEvents.push({type,trusted:e.isTrusted}));});
 const baseline=await probe(page);assert(baseline.ok&&baseline.persistedRef);
 await run('Native Back and Forward preserve the same composer, draft, tools and exactly one reading return',async()=>{
  await page.locator('[data-ref-id="T1"]').first().click();await page.locator('[data-vaiwl-return]').waitFor({state:'visible'});const next=page.url();assert(next.includes('/c/T1'));
  await page.getByRole('textbox',{name:'消息输入',exact:true}).fill('T1 独立草稿');await page.evaluate(()=>{globalThis.lifecycleSecondComposer=document.querySelector('textarea[aria-label="消息输入"]');});
  await page.goBack();await ready(page);assert(page.url().includes('/c/T0'));await preserved();
  await page.goForward();await ready(page);assert.equal(page.url(),next);assert(await page.evaluate(()=>lifecycleSecondComposer===document.querySelector('textarea[aria-label="消息输入"]')));assert.equal(await page.getByRole('textbox',{name:'消息输入',exact:true}).inputValue(),'T1 独立草稿');assert.equal(await page.locator('[data-vaiwl-return]:visible').count(),1);assert.equal(await page.locator('section[aria-label="Conversation"][data-vaiwl-mask]').count(),0);await page.goBack();await ready(page);await preserved();
 });
 await run('Actual CDP freeze and resume preserve draft without reloading and rebind the same document',async()=>{
  const session=await context.newCDPSession(page);await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});const background=await context.newPage();await background.bringToFront();await page.waitForFunction(()=>document.visibilityState==='hidden');await session.send('Page.setWebLifecycleState',{state:'frozen'});await new Promise(r=>setTimeout(r,1000));await session.send('Page.setWebLifecycleState',{state:'active'});await page.bringToFront();await background.close();await session.detach();await ready(page);await preserved();
  const events=await page.evaluate(()=>lifecycleEvents);assert(events.some(e=>e.type==='freeze'&&e.trusted));assert(events.some(e=>e.type==='resume'&&e.trusted));assert.equal(await page.locator('[data-vaiwl-return]:visible').count(),1);const data=await probe(page);assert(data.ok&&data.persistedRef);assert.equal(data.workspaceRevision,baseline.workspaceRevision);return {events};
 });
 const manager=await context.newPage();await manager.goto('chrome://extensions/');const item=manager.locator(`extensions-item#${id}`);await item.waitFor();
 await run('Chrome extension manager really disables the extension; old draft page falls back to usable native UI',async()=>{
  await item.locator('#enableToggle').click();await page.bringToFront();await page.waitForFunction(()=>document.documentElement.dataset.vaiwlHfState!=='ACTIVE',null,{timeout:25000});
  assert.equal((await probe(page)).ok,false);await page.waitForFunction(()=>document.documentElement.dataset.vaiwlHfReason==='transport-unavailable');assert.equal(await page.evaluate(()=>document.visibilityState),'visible');await preserved();assert.equal(await page.locator('section[aria-label="Conversation"][data-vaiwl-mask]').count(),0);assert.equal(await page.locator('[data-vaiwl-return]:visible').count(),0);
  return {hostState:await page.locator('html').getAttribute('data-vaiwl-hf-state'),reason:await page.locator('html').getAttribute('data-vaiwl-hf-reason')};
 });
 await run('Chrome re-enable retains extension-origin facts on a fresh document without refreshing the old draft page',async()=>{
  await manager.bringToFront();await item.locator('#enableToggle').click();const fresh=await context.newPage();await fresh.goto(origin+'/hf/A/c/T0?mode=mv3');await ready(fresh);const data=await probe(fresh);assert(data.ok&&data.persistedRef);assert.equal(data.workspaceRevision,baseline.workspaceRevision);assert((await fresh.locator('.theme-name').allTextContents()).includes('城市观察'));await preserved();assert.equal(await page.locator('section[aria-label="Conversation"][data-vaiwl-mask]').count(),0);await fresh.close();return {workspaceRevision:data.workspaceRevision,oldDraftPageReloaded:false};
 });
 await run('No page JavaScript errors across lifecycle transitions',async()=>assert.deepEqual(report.pageErrors,[]));
}finally{await save();await ownedBrowser?.close();chromeProcess?.kill('SIGTERM');await new Promise(resolve=>server.close(resolve));}
if(report.results.some(r=>r.status==='FAIL'))process.exitCode=1;
