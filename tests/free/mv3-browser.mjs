/** Local synthetic origin only. Does not certify a production ChatGPT adapter. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {build} from '../../simulator/build.mjs';
import {createServer} from '../../simulator/server.mjs';

const directory=await mkdtemp(join(tmpdir(),'vaiwl-free-mv3-')),extension=join(directory,'extension'),hashes=build(extension);
const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const report={evidence:'REAL_CHROME_MV3_SYNTHETIC_ONLY',realChatGPT:'NOT_RUN',headless:true,hashes,results:[],pageErrors:[],moduleFailures:[]};
let context,cdp,a,b;
const save=()=>process.argv[2]?writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n'):Promise.resolve();
const run=async(name,fn)=>{try{const data=await fn();report.results.push({name,status:'PASS',...data});}catch(error){report.results.push({name,status:'FAIL',error:error.stack,diagnostic:a?await a.evaluate(()=>({url:location.href,state:document.documentElement.dataset.vaiwlHfState,reason:document.documentElement.dataset.vaiwlHfReason,status:[...document.querySelectorAll('[role=\"status\"]')].map(n=>n.textContent),route:globalThis.HF?.getView?.()?.ref,nativeBoundaries:{history:document.querySelectorAll('aside[aria-label="Sidebar"] nav[aria-label="Chat history"]').length,header:document.querySelectorAll('main header[aria-label="Chat actions"]').length,reading:document.querySelectorAll('main section[aria-label="Conversation"]').length},hostInitialized:!!globalThis.HF})):null});}console.log(JSON.stringify(report.results.at(-1)));await save();};
const ready=page=>page.waitForFunction(()=>document.documentElement.dataset.vaiwlHfState==='ACTIVE',null,{timeout:15000});
const probe=async page=>{await page.evaluate(()=>{delete document.documentElement.dataset.hfWorkerProbe;document.dispatchEvent(new Event('hf:test-worker-probe'));});await page.waitForFunction(()=>document.documentElement.dataset.hfWorkerProbe);return JSON.parse(await page.locator('html').getAttribute('data-hf-worker-probe'));};
const open=async account=>{const page=await context.newPage();if(!a)a=page;page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).origin===origin)report.moduleFailures.push({url:response.url(),status:response.status()});});page.on('pageerror',error=>report.pageErrors.push(error.message));await page.goto(`${origin}/hf/${account}/c/T0?mode=mv3`);await ready(page);if(await page.locator('[data-vaiwl-return]').isVisible())await page.locator('[data-vaiwl-return]').click();return page;};
try{
 context=await chromium.launchPersistentContext(join(directory,'profile'),{executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],timezoneId:'Asia/Shanghai'});
 context.setDefaultTimeout(10000);
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 cdp=await context.browser().newBrowserCDPSession();report.browser=(await cdp.send('Browser.getVersion')).product;
 const extensionId=(await cdp.send('Extensions.loadUnpacked',{path:extension})).id;
 await run('Free package is synthetic-only and does not request production host access',async()=>{
  assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.content_scripts[0].matches,['http://127.0.0.1/hf/*']);
  assert(!JSON.stringify(manifest).includes('chatgpt.com'));assert(!manifest.host_permissions?.some(value=>value.includes('all_urls')));
  return {productionMatched:false};
 });
 await run('Actual MV3 worker renders default Free native names and NONE rows',async()=>{
  a=await open('A');assert(context.serviceWorkers().some(worker=>worker.url().startsWith(`chrome-extension://${extensionId}/`)));
  const names=await a.locator('.theme-name').allTextContents();assert(names.includes('城市观察'));assert(!names.includes('城市声音档案'));
  await a.getByRole('button',{name:'较早的30日',exact:true}).click();
  assert((await a.locator('.theme-name').allTextContents()).includes('材料与方法'));
  await a.getByRole('button',{name:'较近的30日',exact:true}).click();
  assert(await a.locator('[data-free-list="noProject"] [data-ref-id]').count()>0);
  const p=await probe(a);assert(p.ok&&p.persistedRef);return {boot:p.boot};
 });
 await run('Second tab shares persisted native projection without page-origin database access',async()=>{
  b=await open('A');assert.deepEqual(await b.locator('.theme-name').allTextContents(),await a.locator('.theme-name').allTextContents());
  const names=await b.evaluate(async()=>await indexedDB.databases());assert(!names.some(value=>value.name?.includes('vaiwl')));
  const p=await probe(b);assert(p.ok&&p.persistedRef);return {workspaceRevision:p.workspaceRevision};
 });
 await run('Native composer, draft, tools, search and unique reading return survive navigation',async()=>{
  await a.bringToFront();await ready(a);
  const input=a.getByRole('textbox',{name:'消息输入',exact:true});await input.fill('未发送的本地合成草稿');
  await a.evaluate(()=>{globalThis.freeOriginalComposer=document.querySelector('textarea[aria-label="消息输入"]');});
  await a.locator('[data-ref-id="T0"]').first().click();
  assert.equal(await input.inputValue(),'未发送的本地合成草稿');assert.equal(await a.locator('[data-vaiwl-return]:visible').count(),1);
  assert(await a.getByRole('button',{name:'工具',exact:true}).count()>0);
  assert(await a.getByRole('button',{name:'搜索聊天',exact:true}).count()>0);
  await a.locator('[data-vaiwl-return]').click();
  assert(await a.evaluate(()=>globalThis.freeOriginalComposer===document.querySelector('textarea[aria-label="消息输入"]')));
  assert.equal(await input.inputValue(),'未发送的本地合成草稿');
 });
 await run('Stopping actual worker rebinds without losing draft or native persisted projection',async()=>{
  const before=await probe(a),session=await context.newCDPSession(a);await session.send('ServiceWorker.enable');await session.send('ServiceWorker.stopAllWorkers');await session.detach();
  const after=await probe(a);assert(after.ok&&after.persistedRef);assert.notEqual(before.boot,after.boot);await ready(a);
  assert.equal(await a.getByRole('textbox',{name:'消息输入',exact:true}).inputValue(),'未发送的本地合成草稿');
  assert((await a.locator('.theme-name').allTextContents()).includes('城市观察'));return {workerBootChanged:true};
 });
 await run('Existing native conversation send persists observation through the MV3 queue',async()=>{
  const before=await probe(a);await a.locator('[data-ref-id="T0"]').first().click();
  const input=a.getByRole('textbox',{name:'消息输入',exact:true});await input.fill('已保存聊天的合成发送');await a.getByRole('button',{name:'发送消息',exact:true}).click();
  let after;for(let attempt=0;attempt<20;attempt++){after=await probe(a);if(after.workspaceRevision>before.workspaceRevision)break;await a.waitForTimeout(100);}
  assert(after.workspaceRevision>before.workspaceRevision,'existing-send-metadata-not-persisted');assert.equal(await input.inputValue(),'');
  await a.locator('[data-vaiwl-return]').click();return {workspaceRevision:after.workspaceRevision};
 });
 await run('Native synthetic new chat becomes a persisted NONE row and accepts shared working-set metadata',async()=>{
  await a.getByRole('link',{name:'新聊天',exact:true}).click();
  await a.locator('[data-vaiwl-return]').waitFor({state:'visible'});
  assert.equal(await a.locator('section[aria-label="Conversation"][data-vaiwl-mask]').count(),0);
  const input=a.getByRole('textbox',{name:'消息输入',exact:true});await input.fill('MV3 新聊天原生标题');await a.getByRole('button',{name:'发送消息',exact:true}).click();
  await ready(a);await a.locator('[data-vaiwl-return]').click();
  await a.locator('[data-free-list="noProject"] [data-ref-id]').filter({hasText:'MV3 新聊天原生标题'}).first().waitFor({timeout:8000});
  await a.getByRole('button',{name:'管理工作空间',exact:true}).click();
  await a.getByRole('combobox',{name:'窗口选择',exact:true}).selectOption({label:'MV3 新聊天原生标题'});
  await a.getByRole('button',{name:'加入当前工作集',exact:true}).click();
  await a.getByText('已完成。',{exact:true}).waitFor({timeout:8000});
  await a.getByRole('button',{name:'关闭设置',exact:true}).click();
  await a.getByRole('button',{name:'当前工作集',exact:true}).click();
  await a.getByRole('region',{name:'当前工作集',exact:true}).locator('[data-ref-id]').filter({hasText:'MV3 新聊天原生标题'}).waitFor();
 });
 await run('Unknown account hides scoped Free cache while preserving native host',async()=>{
  await a.goto(`${origin}/hf/unknown/c/T0?mode=mv3`);
  await a.getByText('账户身份尚未确认',{exact:true}).waitFor();
  assert.equal(await a.locator('.theme-name:visible').count(),0);assert.equal(await a.locator('[data-ref-id]:visible').count(),0);
  await a.goto(`${origin}/hf/A/c/T0?mode=mv3`);await ready(a);assert((await a.locator('.theme-name').allTextContents()).includes('城市观察'));
 });
 await run('No page JavaScript errors',async()=>assert.deepEqual(report.pageErrors,[]));
}finally{await save();await context?.close();await new Promise(resolve=>server.close(resolve));}
if(report.results.some(result=>result.status==='FAIL'))process.exitCode=1;
