/** UI-12 actual target-only management lifecycle on an isolated offline package. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {disableStatesProfile} from './disable-states-profile.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const selected=disableStatesProfile(process.env.FREE_DISABLE_PROFILE??'LEGACY');
const server=selected.modern?await createVariantHostFixtureServer({profile:'MODERN'}):await createHostFixtureServer();
const dir=await mkdtemp('/private/tmp/vaiwl-disable-states-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,...selected.packageOptions}),info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8')),script='tests/host/disable-states-package-mv3-browser.mjs',hash=b=>createHash('sha256').update(b).digest('hex'),scriptHash=hash(await readFile(script)),output=process.argv[2]??'/private/tmp/free-disable-states-package-mv3.json';
const fixturePaths=['disable-states-profile.mjs','expected/legacy.mjs','expected/modern.mjs','fixtures/server.mjs','fixtures/variants-server.mjs','fixtures/variants-native.mjs','fixtures/native.mjs','fixtures/native.css','fixtures/legacy.html'];
const fixtureSourceHashes=Object.fromEntries(await Promise.all(fixturePaths.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
const report={profile:selected.profile,expectedScope:selected.scope,fixture:server.manifest,fixtureSourceHashes,evidence:'REAL_HEADLESS_PACKAGED_MV3_DISABLE_STATES_SYNTHETIC_GENERATION_OFFLINE',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',package:built,sourceHashes:info.sourceHashes,scriptHash,results:[],errors:[]};let context;
try{
 assert.equal(JSON.parse(await readFile(join(built.unpacked,'manifest.json'),'utf8')).permissions.includes('management'),false);
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 await context.addInitScript(()=>{if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;globalThis.reenableGrant=null;globalThis.disableStatesScope=null;const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async m=>{const r=await send(m);if(m?.type==='HOST_UI_VIEW'&&r?.ok===true&&r.page?.scope)globalThis.disableStatesScope=r.page.scope;if(r?.ok===true&&r.grant?.id)globalThis.reenableGrant={id:r.grant.id,mountId:r.grant.mountId,uiDocumentId:r.grant.uiDocumentId};return r;};});
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 // Only this separate test extension has management permission. Its API closes
 // over the one target ID, never accepts an arbitrary extension identifier.
 const controllerDir=join(dir,'controller');await mkdir(controllerDir);
 await writeFile(join(controllerDir,'manifest.json'),JSON.stringify({manifest_version:3,name:'VAIWL isolated target lifecycle controller',version:'0.0.1',permissions:['management'],content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; connect-src 'none'"}}));
 await writeFile(join(controllerDir,'controller.html'),'<script src="controller.js"></script>');
 await writeFile(join(controllerDir,'controller.js'),`const target=${JSON.stringify(id)};globalThis.targetState=async()=>{const v=await chrome.management.get(target);return {id:v.id,enabled:v.enabled};};globalThis.setTargetEnabled=async enabled=>{if(typeof enabled!=='boolean')throw Error('invalid-state');await chrome.management.setEnabled(target,enabled);return targetState();};`);
 const {id:controllerId}=await cdp.send('Extensions.loadUnpacked',{path:controllerDir}),controller=await context.newPage();await controller.goto(`chrome-extension://${controllerId}/controller.html`);
 const frameURLs=['workspace','sidebar'].map(role=>`chrome-extension://${id}/${role}.html`);
 async function absence(page,oldFrames){
  const frames=page.frames().filter(f=>frameURLs.includes(f.url())),states=[];
  const connected=await page.locator('iframe').evaluateAll((nodes,urls)=>nodes.filter(n=>urls.includes(n.src)).length,frameURLs);assert(connected<=frames.length,'connected private frame cannot go unchecked');
  for(const frame of new Set([...oldFrames,...frames])){if(frame.isDetached()){states.push({detached:true,privatePresent:false});continue;}try{states.push(await frame.evaluate(()=>{let present=false;const walk=root=>{for(const n of root.querySelectorAll('*')){if(n.shadowRoot)walk(n.shadowRoot);for(const c of n.childNodes)if(c.nodeType===Node.TEXT_NODE&&['Research','Ordinary conversation','Membership not loaded'].some(s=>(c.textContent??'').includes(s)))present=true;}};walk(document);return {reachable:true,privatePresent:present};}));}catch(e){if(!frame.isDetached())throw Error('connected-private-frame-unreadable:'+e.message);states.push({detached:true,privatePresent:false});}}
  return {privateProjectionAbsent:states.every(s=>!s.privatePresent),frames:states};
 }
 async function naturalState(page){
  const state=await page.evaluate(()=>{const style=n=>({visibility:getComputedStyle(n).visibility,interactivity:getComputedStyle(n).interactivity,htmlInert:n.hasAttribute('inert')});return {openOwned:document.querySelectorAll('[data-va-owned]:popover-open').length,reading:style(document.querySelector('#reading')),history:style(document.querySelector('nav[aria-label="Chat history"]'))};});
  assert.equal(state.openOwned,0,'disable itself must close surfaces');
  for(const area of [state.reading,state.history]){assert.equal(area.visibility,'visible');assert.notEqual(area.interactivity,'inert');assert.equal(area.htmlInert,false);}
  return state;
 }
 async function surfaceState(page){return page.evaluate(()=>Object.fromEntries(['workspace','sidebar'].map(role=>[role,!!document.querySelector('[data-va-owned][id$="_'+role+'"]')?.matches(':popover-open')])));}
 for(const mode of ['both-open','workspace-only','sidebar-only','both-closed','synthetic-generation']){
  assert.deepEqual(await controller.evaluate(()=>setTargetEnabled(true)),{id,enabled:true});
  const nativeRequestStart=selected.modern?server.snapshot().nativeRequests.length:0;
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(selected.modern?server.origin+selected.entryPath:server.url);
  await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned] iframe').length===2,{},{timeout:15000});await page.frameLocator('iframe[title="工作空间"]').getByText('Ordinary conversation',{exact:true}).waitFor({state:'attached',timeout:15000});if(await page.locator('[data-va-owned]:popover-open').count()!==2)await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);
  if(selected.modern){const workspace=page.frames().find(f=>f.url()===frameURLs[0]);assert(workspace);assert.equal(await workspace.evaluate(()=>globalThis.disableStatesScope),selected.scopeKey,'MODERN UI must use independently selected nonfirst Team');const native=server.snapshot().nativeRequests.slice(nativeRequestStart);assert(native.some(r=>r.path==='/backend-api/conversation/'+selected.conversationId&&r.context===selected.contextId),'native account-bound current-conversation request required');}
  const oldFrames=page.frames().filter(f=>frameURLs.includes(f.url()));assert.equal(oldFrames.length,2);
  assert.equal((await absence(page,oldFrames)).privateProjectionAbsent,false,'shadow-private detection positive control');
  const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`));assert(worker);assert.equal(await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}}),true);
  await page.locator('textarea').fill('DISABLE_STATES_DRAFT');await page.evaluate(()=>{globalThis.statesEditor=document.querySelector('textarea');globalThis.statesDocument=document;globalThis.statesPageHides=0;addEventListener('pagehide',()=>statesPageHides++);});
  if(mode==='synthetic-generation'){
   // Test-owned local reconstruction only: no send, native backend write, or AI.
   await page.evaluate(()=>{const form=document.querySelector('#composer'),output=document.createElement('output'),stop=document.createElement('button');output.id='synthetic-generation-output';output.setAttribute('data-native-generation','active');stop.id='synthetic-generation-stop';stop.type='button';stop.textContent='Stop offline generation';globalThis.syntheticGeneration={ticks:0,stops:0,output,stop};const timer=setInterval(()=>{syntheticGeneration.ticks++;output.textContent='OFFLINE_SYNTHETIC_TOKEN_'+syntheticGeneration.ticks;},40);stop.addEventListener('click',()=>{syntheticGeneration.stops++;clearInterval(timer);output.removeAttribute('data-native-generation');});form.append(output,stop);});
   await page.waitForFunction(()=>syntheticGeneration.ticks>=2);
  }
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);
  if(mode==='workspace-only'||mode==='both-closed')await page.getByRole('button',{name:'显示原生列表',exact:true}).click();
  if(mode==='sidebar-only'||mode==='both-closed'||mode==='synthetic-generation')await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
  const expected={workspace:mode==='both-open'||mode==='workspace-only',sidebar:mode==='both-open'||mode==='sidebar-only'||mode==='synthetic-generation'};
  await page.waitForTimeout(100);const before=await surfaceState(page);assert.deepEqual(before,expected,'requested combination must be declaratively reachable');
  const ticksBefore=mode==='synthetic-generation'?await page.evaluate(()=>syntheticGeneration.ticks):null;
  assert.deepEqual(await controller.evaluate(()=>setTargetEnabled(false)),{id,enabled:false});
  let privateState;for(let i=0;i<50;i++){privateState=await absence(page,oldFrames);if(privateState.privateProjectionAbsent)break;await page.waitForTimeout(100);}assert.equal(privateState.privateProjectionAbsent,true);
  const natural=await naturalState(page);
  let generation=null;
  if(mode==='synthetic-generation'){
   const ticksAfterDisable=await page.evaluate(()=>syntheticGeneration.ticks);await page.waitForFunction(before=>syntheticGeneration.ticks>before+2,ticksAfterDisable);
   assert.equal(await page.locator('#synthetic-generation-stop').evaluate(n=>n===syntheticGeneration.stop),true);
   await page.getByRole('button',{name:'Stop offline generation',exact:true}).click();const stopped=await page.evaluate(()=>({ticks:syntheticGeneration.ticks,stops:syntheticGeneration.stops,active:syntheticGeneration.output.hasAttribute('data-native-generation')}));await page.waitForTimeout(160);
   assert.deepEqual(await page.evaluate(()=>({ticks:syntheticGeneration.ticks,stops:syntheticGeneration.stops,active:syntheticGeneration.output.hasAttribute('data-native-generation')})),stopped);assert.equal(stopped.stops,1);assert.equal(stopped.active,false);generation={evidence:'LOCAL_SYNTHETIC_GENERATION_NOT_CHATGPT_G',ticksBefore,ticksAfterDisable,ticksAfter:stopped.ticks,originalStopHandlerCalls:stopped.stops};
  }
  await page.locator('textarea').press('End');await page.locator('textarea').pressSequentially('_AFTER_DISABLE');
  const native=await page.evaluate(()=>({nativeOperable:document.activeElement===statesEditor&&document.querySelector('textarea')===statesEditor,draft:statesEditor.value,sameDocument:document===statesDocument,pageHides:statesPageHides,cleanLayout:document.querySelectorAll('[data-va-owned]:popover-open').length===0&&getComputedStyle(document.querySelector('#reading')).visibility==='visible'}));
  assert.equal(native.cleanLayout,true);assert.equal(native.nativeOperable,true);assert.equal(native.draft,'DISABLE_STATES_DRAFT_AFTER_DISABLE');assert.equal(native.sameDocument,true);assert.equal(native.pageHides,0);
  report.results.push({name:mode,status:'PASS',disableConfirmed:true,workerExternalNetworkBlocked:true,privateDetectorPositiveControl:true,before,natural,...native,...privateState,...(generation?{generation}:{})});await page.close();
 }
 assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browser=context.browser().version();report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;try{report.diagnostic=await context.pages().at(-1).evaluate(()=>({url:location.href,dataset:{...document.documentElement.dataset},owned:[...document.querySelectorAll('[data-va-owned]')].map(n=>({tag:n.tagName,id:n.id,open:n.matches(':popover-open')})),frames:[...document.querySelectorAll('iframe')].map(n=>n.src),body:document.body.innerText.slice(0,2000)}));report.fixtureRequests=server.snapshot();report.workers=context.serviceWorkers().map(w=>w.url());report.frames=await Promise.all(context.pages().at(-1).frames().map(async f=>({url:f.url(),detached:f.isDetached(),state:await f.evaluate(()=>({dataset:{...document.documentElement.dataset},readyState:document.readyState})).catch(e=>({error:e.message}))}))); }catch{}process.exitCode=1;}finally{await context?.close();await server.close();report.fixtureChangedDuringRun=(await Promise.all(Object.entries(fixtureSourceHashes).map(async([p,h])=>hash(await readFile(new URL(p,import.meta.url)))!==h))).some(Boolean);report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean)||hash(await readFile(script))!==scriptHash;if(report.sourceChangedDuringRun||report.fixtureChangedDuringRun){report.status='FAIL';process.exitCode=1;}await writeFile(output,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
