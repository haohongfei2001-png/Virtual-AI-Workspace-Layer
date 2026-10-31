/** Actual Chrome tab zoom, not CSS zoom or a simulated device scale factor.
 * Synthetic metadata and a disposable testing extension/profile only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,dirname,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url);
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;font-family:system-ui}#workspace{height:100%}</style><div id="workspace"></div><script type="module">
import {createFixtureOwner} from '/tests/pro/support/fixture-owner.mjs';
import {createProController} from '/src/pro/runtime/controller.mjs';
import {createProWorkspace} from '/src/pro/ui/workspace.mjs';
const owner=await createFixtureOwner({fixtureOnly:true,indexedDB,databaseName:'zoom_synthetic'});window.controller=await createProController(owner);window.ui=createProWorkspace(document.getElementById('workspace'),controller);window.ready=true;
</script>`;
test('real100/125/200 percent Chrome zoom keeps keyboard creation and modal actions operable',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vaiwl-pro-real-zoom-')),extension=join(directory,'zoom-control');await mkdir(extension);
 await writeFile(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Isolated zoom test control',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
 await writeFile(join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('content-type','text/html;charset=utf-8');res.end(html);return;}const path=resolve(repository,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(repository+'/')){res.writeHead(403).end();return;}res.setHeader('content-type',extname(path)==='.mjs'?'text/javascript;charset=utf-8':'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let context;
 const observations=[],errors=[],external=[],output=resolve(process.env.PRO_EVIDENCE_DIR??join(repository,'artifacts/pro-closeout/zoom'));
 try{
  const playwright=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??repository]}));
  if(!process.env.PRO_CHROMIUM_EXECUTABLE)throw Error('Isolated full Chromium required');
  context=await playwright.chromium.launchPersistentContext(join(directory,'profile'),{executablePath:process.env.PRO_CHROMIUM_EXECUTABLE,headless:true,viewport:{width:1280,height:840},ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging','--no-zygote','--disable-gpu']});
  const cdp=await context.browser().newBrowserCDPSession();await cdp.send('Extensions.loadUnpacked',{path:extension});
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'&&u.protocol!=='chrome-extension:'){external.push(u.origin);return route.abort();}return route.continue();});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,page.url());
  await mkdir(output,{recursive:true});
  for(const zoom of [1,1.25,2]){
   await worker.evaluate(async({tabId,zoom})=>{await chrome.tabs.setZoomSettings(tabId,{mode:'automatic',scope:'per-tab'});await chrome.tabs.setZoom(tabId,zoom);},{tabId,zoom});
   const actual=await worker.evaluate(tabId=>chrome.tabs.getZoom(tabId),tabId);assert.equal(actual,zoom);
   await page.waitForFunction(factor=>Math.abs(devicePixelRatio-factor)<0.01,zoom);
   const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom}));assert.equal(metrics.cssZoom,'1');assert(Math.abs(metrics.width-1280/zoom)<2);
   const open=page.getByRole('button',{name:'新建主题',exact:true});await open.focus();await page.keyboard.press('Enter');
   const title=page.getByRole('textbox',{name:'主题名称',exact:true});await title.fill('Zoom '+zoom+' · 可读主题');await title.press('Enter');await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByRole('heading',{name:'Zoom '+zoom+' · 可读主题',exact:true}).waitFor();
   await open.click();await title.fill('尚未保存的缩放草稿');
   const button=page.getByRole('button',{name:'创建主题',exact:true}),bounds=await button.boundingBox();assert(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=metrics.width+1&&bounds.y+bounds.height<=metrics.height+1);
   const overflow=await page.evaluate(()=>({document:document.documentElement.scrollWidth>innerWidth,workspace:document.getElementById('workspace').shadowRoot.querySelector('.pro-workspace')?.scrollWidth>innerWidth}));assert.equal(overflow.document,false);assert.equal(overflow.workspace,false);
   await page.keyboard.press('Tab');assert(await page.evaluate(()=>{const s=document.getElementById('workspace').shadowRoot;return s.querySelector('[role="dialog"]').contains(s.activeElement);}));
   const screenshot='pro-real-zoom-'+Math.round(zoom*100)+'.png';await page.screenshot({path:join(output,screenshot),fullPage:false});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
   observations.push({requestedZoom:zoom,actualChromeTabZoom:actual,metrics,keyboardCreate:true,dialogActionsWithinViewport:true,screenshot});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile(join(output,'real-zoom.json'),JSON.stringify({status:'PASS',evidenceClass:'ISOLATED_CHROMIUM_REAL_TAB_ZOOM',browser:context.browser().version(),observations,externalRequests:external,pageErrors:errors,realChatGPT:'NOT_RUN',personalDevice:'NOT_RUN'},null,2)+'\n');
 }finally{await context?.close();await new Promise(resolve=>server.close(resolve));}
});
