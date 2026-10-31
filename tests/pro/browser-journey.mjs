import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createFixtureServer} from './serve.mjs';
const require=createRequire(import.meta.url);
const playwright=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??process.cwd()]}));
const evidence=process.env.PRO_EVIDENCE_DIR;

test('actual Chromium: continuous journey, original Free renderer, unchanged composer, disk restart and data-only restore',async()=>{
 const profile=await mkdtemp(join(tmpdir(),'vaiwl-pro-isolated-profile-')),server=createFixtureServer(),errors=[],external=[];
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let context;const launch=async()=>{const c=await playwright.chromium.launchPersistentContext(profile,{executablePath:process.env.PRO_CHROMIUM_EXECUTABLE,headless:true,args:['--no-zygote','--disable-gpu'],viewport:{width:1340,height:980}});await c.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){external.push(url.origin);return route.abort();}return route.continue();});return c;};
 async function load(path='/'){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+path);await page.waitForFunction(()=>document.querySelector('#pro-frame')?.contentWindow.proReady===true);await page.evaluate(async()=>{await document.fonts.load('14px "PingFang SC"','运行连续旅程独立样例输入区切换时保留草稿');await document.fonts.ready;});const frame=page.frames().find(f=>f.url().includes('demo-frame.html'));await frame.waitForFunction(()=>document.querySelector('#workspace').shadowRoot?.querySelector('.pro-native-container')?.firstElementChild?.shadowRoot?.querySelectorAll('[data-theme-id]').length===2);return {page,frame};}
 try{
  context=await launch();let {page,frame}=await load();
  await page.locator('#native-draft').fill('这个草稿在整理、切换和返回中保留。');await page.evaluate(()=>{window.originalComposer=document.querySelector('#native-draft');});
  assert.deepEqual(await frame.evaluate(async()=>{const db=await indexedDB.databases();return db.map(x=>x.name);}),['vaiwl_pro_r1_demo']);
  const nativeBefore=await frame.evaluate(()=>proFixture.owner.native.read(proFixture.owner.scope));
  await page.getByRole('button',{name:'运行连续旅程',exact:true}).click();await page.waitForFunction(()=>window.journeyReport?.status==='PASS');
  const report=await page.evaluate(()=>window.journeyReport);assert.equal(report.trace.length,11);assert.equal(report.realModelCalls,0);
  assert.equal(await page.evaluate(()=>originalComposer===document.querySelector('#native-draft')),true);assert.equal(await page.locator('#native-draft').inputValue(),'这个草稿在整理、切换和返回中保留。');
  assert.deepEqual(await frame.evaluate(()=>proFixture.owner.native.read(proFixture.owner.scope)),nativeBefore);
  const before=await frame.evaluate(()=>proFixture.controller.getState()),backup=await frame.evaluate(()=>proFixture.controller.exportBackup());
  // Projects are the existing Free component, with original IDs and names.
  assert.deepEqual(await frame.evaluate(()=>[...document.querySelector('#workspace').shadowRoot.querySelector('.pro-native-container').firstElementChild.shadowRoot.querySelectorAll('[data-theme-id]')].map(n=>n.dataset.themeId)),['p_alpha','p_beta']);
  if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,'pro-workspace-desktop.png'),fullPage:true});}
  await frame.getByRole('button',{name:'原生项目',exact:true}).click();await frame.waitForFunction(()=>proFixture.controller.getView().mode==='native');await frame.getByRole('heading',{name:'同名原生项目',exact:true}).first().waitFor();
  assert.equal(await frame.evaluate(()=>proFixture.controller.getView().overlay),undefined);assert.deepEqual(await frame.evaluate(()=>proFixture.controller.getState()),before);
  // Native known search uses the existing Free search projection and title.
  const nativeWorkspace=frame.locator('#workspace');await nativeWorkspace.getByRole('button',{name:'工作空间设置',exact:true}).click();const search=nativeWorkspace.getByRole('button',{name:'查找已知项目与聊天',exact:true});await search.first().click();const input=nativeWorkspace.getByRole('searchbox',{name:'已知聊天查找输入'});await input.fill('Riftlet');await nativeWorkspace.getByText('Riftlet 首击可靠性排查',{exact:true}).waitFor();
  await frame.getByRole('button',{name:'主题',exact:true}).click();await frame.waitForFunction(()=>proFixture.controller.getView().mode==='pro-default-none');
  await page.setViewportSize({width:430,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(evidence)await page.screenshot({path:join(evidence,'pro-workspace-narrow.png'),fullPage:true});
  await page.setViewportSize({width:1340,height:980});await page.emulateMedia({colorScheme:'dark'});await frame.waitForFunction(()=>getComputedStyle(document.querySelector('#workspace').shadowRoot.querySelector('.pro-mode button[aria-pressed="true"]')).backgroundColor==='rgb(33, 33, 33)');if(evidence)await page.screenshot({path:join(evidence,'pro-workspace-dark.png'),fullPage:true});
  const browserVersion=context.browser()?.version()??'persistent-chromium';await context.close();context=null;
  // Close the browser process, then reopen the same disposable disk profile.
  context=await launch();({page,frame}=await load());
  assert.deepEqual(await frame.evaluate(()=>proFixture.controller.getState()),before);assert.equal(await frame.evaluate(()=>proFixture.controller.getStatus().processingMode),'off');
  await frame.evaluate(async()=>{let blocked=false;try{await proFixture.controller.suggest();}catch{blocked=true;}if(!blocked)throw Error('processing silently replayed');});
  // An explicitly separate empty fixture installation imports data, never grants/jobs.
  const restored=await load('/?db=restored_fixture');await restored.frame.evaluate(value=>proFixture.controller.restoreBackup(value),backup);
  const restoredState=await restored.frame.evaluate(()=>proFixture.controller.getState());assert.deepEqual({...restoredState,revision:0},{...backup.state,revision:0});assert.equal(await restored.frame.evaluate(()=>proFixture.controller.getStatus().processingMode),'off');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  if(evidence)await writeFile(join(evidence,'browser-journey.json'),JSON.stringify({...report,browserVersion,realIndexedDB:true,browserProcessRestart:true,originalFreeRenderer:true,originalNativeStateUnchanged:true,composerIdentityPreserved:true,dataOnlyBackupRestore:true,networkRequestsOutsideLoopback:external,uncaughtErrors:errors,device:{platform:process.platform,arch:process.arch,node:process.version}},null,2)+'\n');
 }finally{await context?.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}
});
