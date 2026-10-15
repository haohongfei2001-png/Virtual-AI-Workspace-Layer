/** UI-13 actual CDP uninstall, isolated immutable production package; no management permission. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),script='tests/host/uninstall-states-package-mv3-browser.mjs',scriptHash=hash(await readFile(script));
const server=await createHostFixtureServer(),dir=await mkdtemp('/private/tmp/vaiwl-uninstall-states-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),info=JSON.parse(manifestBytes),output=process.argv[2]??'/private/tmp/free-uninstall-states-package-mv3.json';
const report={evidence:'REAL_HEADLESS_PACKAGED_MV3_UNINSTALL_FOUR_STATES_OFFLINE',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',package:built,sourceHashes:info.sourceHashes,buildManifestHash:hash(manifestBytes),scriptHash,results:[],errors:[],blockedExternal:[]};let context,page,extensionId;
async function inspectPrivate(frames){
 const states=[];
 for(const frame of frames){
  if(frame.isDetached()){states.push({detached:true,privatePresent:false});continue;}
  try{states.push(await frame.evaluate(()=>{let privatePresent=false,textNodes=0;const walk=root=>{for(const node of root.childNodes??[]){if(node.nodeType===Node.TEXT_NODE){textNodes++;if(['Research','Ordinary conversation','Membership not loaded'].some(s=>(node.textContent??'').includes(s)))privatePresent=true;}else walk(node);if(node.shadowRoot)walk(node.shadowRoot);}};walk(document);return {detached:false,url:location.href,privatePresent,textNodes,bodyChildren:document.body?.childElementCount??0};}));}
  catch(error){if(!frame.isDetached())throw Error('connected-old-frame-unreadable:'+error.message);states.push({detached:true,privatePresent:false});}
 }
 return {privateProjectionAbsent:states.every(s=>s.privatePresent===false),frames:states};
}
const surfaceState=()=>page.evaluate(()=>Object.fromEntries(['workspace','sidebar'].map(role=>[role,!!document.querySelector('[data-va-owned][id$="_'+role+'"]')?.matches(':popover-open')])));
const verifyNative=()=>page.evaluate(()=>{const reading=document.querySelector('#reading'),history=document.querySelector('nav[aria-label="Chat history"]'),style=n=>({visibility:getComputedStyle(n).visibility,interactivity:getComputedStyle(n).interactivity,htmlInert:n.hasAttribute('inert')});return {sameDocument:document===uninstallDocument,sameEditor:document.querySelector('textarea')===uninstallEditor,editorConnected:uninstallEditor.isConnected,draft:uninstallEditor.value,pageHides:uninstallPageHides,focused:document.activeElement===uninstallEditor,reading:style(reading),history:style(history),owned:[...document.querySelectorAll('section[data-va-owned]')].map(n=>({open:n.matches(':popover-open'),visibility:getComputedStyle(n).visibility,interactivity:getComputedStyle(n).interactivity,display:getComputedStyle(n).display})),openOwned:document.querySelectorAll('[data-va-owned]:popover-open').length};});
try{
 assert.equal((JSON.parse(await readFile(join(built.unpacked,'manifest.json'),'utf8')).permissions??[]).includes('management'),false);
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>{const url=r.request().url();if(url.startsWith(server.origin+'/')||extensionId&&url.startsWith('chrome-extension://'+extensionId+'/'))return r.continue();report.blockedExternal.push(url);return r.abort();});
 const cdp=await context.browser().newBrowserCDPSession();
 for(const mode of ['both-open','workspace-only','sidebar-only','both-closed']){
  ({id:extensionId}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));report.activeCase=mode;
  page=await context.newPage();page.on('pageerror',error=>report.errors.push({mode,message:error.message}));await page.goto(server.url);
  const urls=['workspace','sidebar'].map(role=>`chrome-extension://${extensionId}/${role}.html`);
  await page.frameLocator('iframe[title="工作空间"]').getByText('Ordinary conversation',{exact:true}).waitFor({state:'attached',timeout:15000});
  const oldFrames=urls.map(url=>page.frames().find(f=>f.url()===url));assert(oldFrames.every(Boolean));
  const positive=await inspectPrivate(oldFrames);assert.equal(positive.privateProjectionAbsent,false,'detector must see shadow private text even before hidden-state tests');
  const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${extensionId}/`));assert(worker);assert.equal(await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}}),true);
  await page.locator('textarea').fill('UNINSTALL_STATES_DRAFT');await page.evaluate(()=>{globalThis.uninstallEditor=document.querySelector('textarea');globalThis.uninstallDocument=document;globalThis.uninstallPageHides=0;addEventListener('pagehide',()=>uninstallPageHides++);});
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);
  if(mode==='workspace-only'||mode==='both-closed')await page.getByRole('button',{name:'显示原生列表',exact:true}).click();
  if(mode==='sidebar-only'||mode==='both-closed')await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
  const before=await surfaceState();assert.deepEqual(before,{workspace:mode==='both-open'||mode==='workspace-only',sidebar:mode==='both-open'||mode==='sidebar-only'});
  assert.equal((await inspectPrivate(oldFrames)).privateProjectionAbsent,false,'closed CSS must not fool private DOM detector');
  await cdp.send('Extensions.uninstall',{id:extensionId});
  let privateState;for(let i=0;i<50;i++){privateState=await inspectPrivate(oldFrames);if(privateState.privateProjectionAbsent)break;await page.waitForTimeout(100);}assert.equal(privateState.privateProjectionAbsent,true,'uninstall must clear original private DOM or detach old frames');
  // Audit retained old Frame objects regardless of their post-uninstall URL.
  const connected=await page.locator('iframe').evaluateAll((nodes,urls)=>nodes.filter(n=>urls.includes(n.src)).length,urls);assert(connected<=oldFrames.filter(f=>!f.isDetached()).length,'connected private iframe cannot escape inspection');
  // Natural uninstall must release both masks. A manual close would conceal a
  // lifecycle failure, so retain the pre-input state before any native gesture.
  const naturalUninstall=await verifyNative();report.lastNaturalUninstall={mode,...naturalUninstall};
  assert.equal(naturalUninstall.openOwned,0,'uninstall itself must close owned surfaces');
  for(const value of [naturalUninstall.reading,naturalUninstall.history]){assert.equal(value.visibility,'visible','uninstall itself must release native mask');assert.notEqual(value.interactivity,'inert');assert.equal(value.htmlInert,false);}
  for(const shell of naturalUninstall.owned){assert.equal(shell.open,false);assert(shell.display==='none'||shell.visibility==='hidden'&&shell.interactivity==='inert','naturally retained shell must be closed and noninteractive');}
  await page.locator('textarea').press('End');await page.locator('textarea').pressSequentially('_AFTER_UNINSTALL');
  const native=await verifyNative();assert.equal(native.sameDocument,true);assert.equal(native.sameEditor,true);assert.equal(native.editorConnected,true);assert.equal(native.focused,true);assert.equal(native.pageHides,0);assert.equal(native.draft,'UNINSTALL_STATES_DRAFT_AFTER_UNINSTALL');assert.equal(native.openOwned,0);
  for(const value of [native.reading,native.history]){assert.equal(value.visibility,'visible');assert.notEqual(value.interactivity,'inert');assert.equal(value.htmlInert,false);}
  for(const shell of native.owned){assert.equal(shell.open,false);assert(shell.display==='none'||shell.visibility==='hidden'&&shell.interactivity==='inert','retained shell must be closed and noninteractive');}
  const link=page.locator('nav[aria-label="Chat history"] a').filter({hasText:'Ordinary conversation'}),href=await link.getAttribute('href'),beforeNavigate=server.snapshot().actions.navigate??0;assert(href);await link.click();await page.waitForURL(new URL(href,server.origin).href);await page.waitForFunction(()=>document.querySelector('#reading')?.dataset.conversationId==='33333333-3333-4333-8333-333333333333');assert.equal((server.snapshot().actions.navigate??0)-beforeNavigate,1);
  const afterNavigation=await verifyNative();assert.equal(afterNavigation.sameDocument,true);assert.equal(afterNavigation.sameEditor,true);assert.equal(afterNavigation.draft,native.draft);assert.equal(afterNavigation.pageHides,0);assert.equal(afterNavigation.openOwned,0);assert.equal((await inspectPrivate(oldFrames)).privateProjectionAbsent,true);
  const screenshot=join(dir,mode+'.png');await page.screenshot({path:screenshot});report.results.push({name:mode,status:'PASS',uninstallConfirmed:true,workerExternalNetworkBlocked:true,privateDetectorPositiveControl:true,hiddenPrivateDetectorPositiveControl:true,before,privateState,nativeOperable:true,privateProjectionAbsent:true,cleanLayout:true,native,naturalUninstall,afterNavigation,manualCloseUsed:false,screenshot});await page.close();page=null;
 }
 assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browser=context.browser().version();report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;try{if(page){report.failureScreenshot=join(dir,'failure.png');await page.screenshot({path:report.failureScreenshot});report.diagnostic=await page.evaluate(()=>({url:location.href,dataset:{...document.documentElement.dataset},owned:[...document.querySelectorAll('[data-va-owned]')].map(n=>({tag:n.tagName,id:n.id,open:n.matches(':popover-open'),visibility:getComputedStyle(n).visibility,interactivity:getComputedStyle(n).interactivity})),frames:[...document.querySelectorAll('iframe')].map(n=>n.src)}));report.frames=await Promise.all(page.frames().map(async f=>({url:f.url(),detached:f.isDetached(),state:await f.evaluate(()=>({readyState:document.readyState,body:document.body?.innerText?.slice(0,1000)})).catch(e=>({inspectionError:e.message}))})));}report.fixtureSnapshot=server.snapshot();}catch(diagnosticError){report.diagnosticError=diagnosticError.message;}}
finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(script))!==scriptHash;report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun||!report.buildManifestUnchanged){report.status='FAIL';report.error=(report.error??'')+' source-or-package-changed';process.exitCode=1;}await writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
