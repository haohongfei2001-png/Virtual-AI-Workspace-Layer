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
import {waitHostScaleSurfaces,hostScaleFailureFacts} from './fixtures/host-scale-surfaces.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const output=process.argv[2];assert(output,'output-json-required');
const testPaths=['tests/host/visible-actions-package-browser.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs','tests/host/fixtures/server.mjs','tests/host/fixtures/host-scale-surfaces.mjs','tests/host/fixtures/legacy.html','tests/host/fixtures/native.mjs','tests/host/fixtures/native.css'];
const hashes=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const report={kind:'ACTUAL_MV3_OFFLINE_VISIBLE_ACTIONS',realChatGPT:'NOT_RUN',fullV27Acceptance:'NOT_ESTABLISHED',backend:'document-flow',status:'NOT_RUN',viewports:[],sidebarObservations:[],nativeResponsive:[],steps:[],screenshots:[],errors:[],testHashes:await hashes(testPaths)};
const started=performance.now();
let server,guard,context,page,built,manifest;
try{
 server=await createHostFixtureServer({partitionedSidebar:true});guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 const dir=await mkdtemp(join(tmpdir(),'vaiwl-visible-actions-'));report.artifactDirectory=dir;
 built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineSnippets:true});report.package=built;
 const manifestBytes=await readFile(join(built.unpacked,'build-manifest.json'));manifest=JSON.parse(manifestBytes);report.sourceHashes=manifest.sourceHashes;report.manifestHash=hash(manifestBytes);report.fixture=server.manifest;
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith(`chrome-extension://${id}/`),timeout:15000});
 report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.workerNetworkBlocked);
 report.startup='REGISTERED_WORKER_PRECONDITION_NOT_COLD_START';
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');
 async function workspace(){
  await page.waitForFunction(()=>{const node=document.querySelector('[data-va-owned][id$="_workspace"]:not([popover])'),r=node?.getBoundingClientRect(),s=node&&getComputedStyle(node);return r?.width>=160&&r.height>=96&&s.visibility==='visible'&&s.display!=='none'||[...document.querySelectorAll('button[aria-label="返回工作空间"]')].some(n=>n.getBoundingClientRect().width>0);},null,{timeout:15000});
  const back=page.getByRole('button',{name:'返回工作空间',exact:true});if(await back.isVisible())await back.click();
  const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight})),sidebarMode=viewport.width<=700?'FORMAL_RESPONSIVE_COLLAPSED':'FORMAL';
  const [workspace,sidebar]=await waitHostScaleSurfaces(page,{extensionId:id,backend:'document-flow',sidebarMode,timeout:15000,onObservation:value=>{report.lastSurfaceObservation=value;}});
  if(!report.viewports.some(v=>v.width===viewport.width&&v.height===viewport.height))report.viewports.push(viewport);
  if(!report.sidebarObservations.some(v=>v.width===viewport.width&&v.sidebarMode===sidebarMode))report.sidebarObservations.push({width:viewport.width,sidebarMode,formalSidebar:sidebarMode==='FORMAL'?'PRESENT_VISIBLE_HITTABLE':'NOT_RUN_FORMAL_SIDEBAR_COLLAPSED'});
  return {workspace,sidebar:sidebarMode==='FORMAL'?sidebar:null};
 }
 let frames=await workspace();
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.locator('#prompt-textarea').fill('VISIBLE_ACTIONS_UNSENT_DRAFT');
 await page.locator('#composer input[type=file]').setInputFiles({name:'visible-actions.txt',mimeType:'text/plain',buffer:Buffer.from('offline fixture')});
 await page.evaluate(()=>{globalThis.visibleActionsOriginal={document,editor:document.querySelector('#prompt-textarea'),input:document.querySelector('#composer input[type=file]'),file:document.querySelector('#composer input[type=file]').files[0]};});
 const actionsBefore=server.snapshot().actions;
 async function continuity(){assert.equal(await page.evaluate(()=>{const o=visibleActionsOriginal;return o.document===document&&o.editor===document.querySelector('#prompt-textarea')&&o.editor.isConnected&&o.editor.value==='VISIBLE_ACTIONS_UNSENT_DRAFT'&&o.input===document.querySelector('#composer input[type=file]')&&o.file===o.input.files[0];}),true);assert.deepEqual(server.snapshot().actions,actionsBefore);}
 async function screenshot(name){
  for(const frame of page.frames().filter(f=>f.url().startsWith('chrome-extension://'))){
   const element=await frame.frameElement(),visible=await element.evaluate(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility==='visible';});
   // Native responsive collapse retains its formal iframe at zero size. Such
   // a hidden document has no animation frames and must not block a capture.
   report.screenshotPreparation??=[];report.screenshotPreparation.push({name,role:new URL(frame.url()).pathname,visible});if(!visible)continue;
   let timer;try{await Promise.race([frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('visible-frame-paint-deadline')),1500);})]);}finally{clearTimeout(timer);}
  }
  await page.waitForTimeout(200);await page.screenshot({path:join(dir,name+'.png')});report.screenshots.push({name,path:join(dir,name+'.png')});
 }
 async function visibleLabel(label){
  // Keep the original visibility operation's 30 s deadline. A raw child-frame
  // task can run inside the parent's synchronous close/read/reopen probe, even
  // though no parent paint occurs. Measure exactly two actual paint
  // opportunities, without replaying an action or retrying an invalid sample.
  const deadline=performance.now()+30000;
  await frames.workspace.getByRole('button',{name:label,exact:true}).waitFor({state:'visible',timeout:Math.max(1,deadline-performance.now())});
  let timer,observation;
  try{
   observation=await Promise.race([frames.workspace.evaluate(label=>new Promise(resolve=>{
    function sample(paintTime){
     const paintAt=performance.timeOrigin+paintTime,roots=[...document.querySelectorAll('[data-vaiwl-owned]')].filter(n=>n.shadowRoot?.querySelector('.workspace'));
     if(roots.length!==1)return {node:null,facts:{current:false,roots:roots.length,paintAt}};
     const buttons=[...roots[0].shadowRoot.querySelectorAll('button')].filter(n=>n.getAttribute('aria-label')===label&&n.textContent===label);
     if(buttons.length!==1)return {node:null,facts:{current:false,buttons:buttons.length,paintAt}};
     const n=buttons[0],r=n.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(n);
     const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0),target=n.getRootNode().elementFromPoint(r.x+r.width/2,r.y+r.height/2);
     return {node:n,facts:{current:n.isConnected,text:n.textContent,hit:target===n||n.contains(target),rect:r.toJSON(),textRects:rects.map(r=>r.toJSON()),style:{display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility},viewport:{width:innerWidth,height:innerHeight},scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,paintAt}};
    }
    // Chromium can deliver multiple callbacks with the same frame timestamp
    // after an iframe resumes. Keep and validate every callback, but count that
    // timestamp only once. Eight callbacks is a hard observation cap.
    let first=null,sameNode=true;const paintSamples=[],stableKeys=['rect','textRects','text','style','viewport','scrollWidth','clientWidth'];
    function collect(time){
     const value=sample(time);first??=value;sameNode&&=value.node===first.node;const facts=value.facts;paintSamples.push(facts);
     const valid=facts.current&&facts.hit&&facts.style.display!=='none'&&facts.style.visibility==='visible'&&facts.text===label&&facts.textRects.length>0&&facts.rect.width>0&&facts.rect.height>=30&&facts.rect.left>=-1&&facts.rect.right<=facts.viewport.width+1&&facts.rect.top>=-1&&facts.rect.bottom<=facts.viewport.height+1&&facts.textRects.every(r=>r.left>=facts.rect.left-1&&r.right<=facts.rect.right+1&&r.top>=facts.rect.top-1&&r.bottom<=facts.rect.bottom+1);
     const stable=stableKeys.every(key=>JSON.stringify(facts[key])===JSON.stringify(first.facts[key]));
     if(!valid||!stable||facts.paintAt!==first.facts.paintAt||paintSamples.length>=8){resolve({...facts,sameNode,paintCallbackLimit:8,paintSamples});return;}
     requestAnimationFrame(collect);
    }
    requestAnimationFrame(collect);
   }),label),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('visible-label-operation-deadline')),Math.max(1,deadline-performance.now()));})]);
  }finally{clearTimeout(timer);}
  report.steps.push({label,...observation});
  const first=observation.paintSamples[0],second=observation.paintSamples.at(-1);
  for(const value of observation.paintSamples){
   assert(value.current,'measure current owner settings only');assert(value.hit,'visible label must have a native hit target');assert(value.style.display!=='none'&&value.style.visibility==='visible','label must remain visible at every paint callback');assert.equal(value.text,label,'visible action must carry its readable label');assert(value.textRects.length>0,'visible glyph rectangles required');
   for(const r of value.textRects)assert(r.left>=value.rect.left-1&&r.right<=value.rect.right+1&&r.top>=value.rect.top-1&&r.bottom<=value.rect.bottom+1,'label must fit its control');
   assert(value.rect.width>0&&value.rect.height>=30);assert(value.rect.left>=-1&&value.rect.right<=value.viewport.width+1&&value.rect.top>=-1&&value.rect.bottom<=value.viewport.height+1,'control must stay in frame');
   for(const key of ['rect','textRects','text','style','viewport','scrollWidth','clientWidth'])assert.deepEqual(value[key],first[key],`visible label ${key} must stay stable across every paint callback`);
  }
  // A fresh owner VIEW may replace an owned button between paints. Identity is
  // diagnostic; each callback must still resolve the unique current control and
  // preserve its visible label, hit target and geometry.
  assert(second.paintAt>first.paintAt,'two distinct paint opportunities required within callback cap');
 }

 async function visibleSidebarAction(){
  const button=frames.sidebar.getByRole('button',{name:'已保存片段',exact:true});await button.waitFor({state:'visible'});await button.scrollIntoViewIfNeeded();await button.focus();await button.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const observation=await button.evaluate(n=>{const r=n.getBoundingClientRect(),icon=n.querySelector('svg'),i=icon?.getBoundingClientRect(),target=n.getRootNode().elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label:n.getAttribute('aria-label'),width:r.width,height:r.height,x:r.x,y:r.y,viewport:{width:innerWidth,height:innerHeight},iconVisible:!!i&&i.width>=12&&i.height>=12,hit:target===n||n.contains(target),focusable:n.tabIndex>=0&&!n.disabled};});
  report.steps.push({journey:'approved-sidebar-snippet-icon',...observation});assert.equal(observation.label,'已保存片段');assert(observation.width>=28&&observation.height>=28&&observation.iconVisible&&observation.hit&&observation.focusable,'approved named sidebar icon must be visible and operable');await button.focus();assert.equal(await button.evaluate(n=>n.getRootNode().activeElement===n&&document.hasFocus()),true);report.steps.at(-1).keyboardFocused=true;
 }
 frames=await workspace();await frames.workspace.getByRole('button',{name:'工作空间设置',exact:true}).click();
 await frames.workspace.getByRole('region',{name:'工作空间设置',exact:true}).waitFor();await screenshot('desktop-settings');
 assert(frames.sidebar,'desktop fixture requires its formal sidebar');await visibleSidebarAction();
 const labels=['已保存片段','备份与导入','本地数据恢复','关闭设置'];
 async function checkSettings(){if(frames.sidebar)await visibleSidebarAction();for(const label of labels)await visibleLabel(label);await continuity();}
 await checkSettings();
 await frames.sidebar.getByRole('button',{name:'已保存片段',exact:true}).press('Enter');const fromSidebar=frames.sidebar.getByRole('region',{name:'片段管理',exact:true});await fromSidebar.waitFor({state:'visible'});await continuity();report.steps.push({journey:'sidebar-snippet-keyboard-open',role:'sidebar',visible:true});await fromSidebar.getByRole('button',{name:'返回工作空间',exact:true}).click();frames=await workspace();await checkSettings();
 // Traverse each actual panel through its visible entry and existing return.
 async function panels(phase){for(const [label,region]of [['已保存片段','片段管理'],['备份与导入','人工资产备份'],['本地数据恢复','本地数据恢复']]){
  await frames.workspace.getByRole('button',{name:label,exact:true}).click();const panel=frames.workspace.getByRole('region',{name:region,exact:true});await panel.waitFor();const geometry=await panel.evaluate(n=>({fontSize:getComputedStyle(n.querySelector('h2')).fontSize,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,frameWidth:innerWidth,rect:n.getBoundingClientRect().toJSON()}));report.steps.push({phase,region,geometry});assert.equal(geometry.fontSize,'15px');assert(geometry.scrollWidth<=geometry.clientWidth+1,'panel must not overflow');assert(geometry.rect.right<=geometry.frameWidth+1);await screenshot(phase+'-'+region);await continuity();
  await panel.getByRole('button',{name:'返回工作空间',exact:true}).click();frames=await workspace();await frames.workspace.getByRole('button',{name:'工作空间设置',exact:true}).click();await checkSettings();
 }}
 await panels('desktop');
 await frames.workspace.getByRole('button',{name:'关闭设置',exact:true}).click();assert.equal(await frames.workspace.getByRole('region',{name:'工作空间设置',exact:true}).count(),0);
 for(const [width,colorScheme]of [[1440,'dark'],[420,'dark'],[420,'light']]){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme});
  if(width===420){
   // The narrow host collapses its native sidebar. Verify the native drawer
   // explicitly before evaluating the full-width workspace and its settings.
   await page.getByRole('button',{name:'Open sidebar',exact:true}).click();await page.locator('aside').waitFor({state:'visible'});
   const nativeLink=page.locator('aside nav[aria-label="Chat history"] a[href="/c/33333333-3333-4333-8333-333333333333"]');await nativeLink.scrollIntoViewIfNeeded();
   assert.equal(await nativeLink.evaluate(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return s.visibility==='visible'&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&(hit===n||n.contains(hit));}),true,'native responsive history remains reachable');
   await page.getByRole('button',{name:'Close sidebar',exact:true}).click();await page.locator('aside').waitFor({state:'hidden'});await continuity();report.nativeResponsive.push({width,colorScheme,opened:true,nativeHistoryHit:true,closed:true});
  }
  frames=await workspace();const toggle=frames.workspace.getByRole('button',{name:'工作空间设置',exact:true});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await frames.workspace.getByRole('region',{name:'工作空间设置',exact:true}).waitFor();await checkSettings();await screenshot(`${width}-${colorScheme}-settings`);await panels(`${width}-${colorScheme}`);
 }
 // Exercise the actual cross-frame search request and keyboard return. At this
 // fixture's history boundary the older control exists but cannot take focus.
 await page.setViewportSize({width:1440,height:1000});frames=await workspace();assert(frames.sidebar,'desktop search uses the formal sidebar');
 await frames.sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
 const search=frames.workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true});await search.fill('Ordinary conversation');
 await frames.workspace.locator('.search-results [data-ref-id]').first().waitFor();
 const closeSearch=frames.workspace.getByRole('button',{name:'关闭已知查找',exact:true});await closeSearch.focus();
 await frames.workspace.evaluate(()=>{globalThis.focusReturnTrace=[];for(const type of ['focusin','focusout'])document.addEventListener(type,e=>{if(focusReturnTrace.length<24){const n=e.composedPath()[0];focusReturnTrace.push({type,at:performance.now(),tag:n.tagName,label:n.getAttribute?.('aria-label'),key:n.dataset?.focusKey,documentFocused:document.hasFocus()});}},true);});
 await closeSearch.press('Enter');
 await frames.workspace.locator('.arrows').waitFor();
 assert.equal(await frames.workspace.getByRole('button',{name:'较早的30日',exact:true}).isDisabled(),true);
 // Resolve the current root and active element in one browser task. A locator
 // handle can refer to a removed workspace after an intervening owner repaint.
 const focusState=await frames.workspace.evaluate(()=>{const roots=[...document.querySelectorAll('[data-vaiwl-owned]')].filter(n=>n.shadowRoot?.querySelector('.workspace'));if(roots.length!==1)return {focusReturned:false,roots:roots.length};const shadow=roots[0].shadowRoot,n=shadow.querySelector('.workspace'),active=shadow.activeElement;return {focusReturned:active===n&&n.isConnected,documentFocused:document.hasFocus(),documentActive:document.activeElement?.tagName,shadowActive:active?{tag:active.tagName,label:active.getAttribute('aria-label'),key:active.dataset.focusKey}:null,trace:globalThis.focusReturnTrace};});report.focusReturn=focusState;
 report.parentFocus=await page.evaluate(expected=>({tag:document.activeElement?.tagName,workspaceActive:document.activeElement?.tagName==='IFRAME'&&document.activeElement.src===expected}),frames.workspace.url());
 const {focusReturned}=focusState;assert(focusReturned&&focusState.documentFocused&&report.parentFocus.workspaceActive,'search keyboard return must land in the focused current workspace frame');
 report.steps.push({journey:'sidebar-search-known-chat-keyboard-return',focusReturned,olderDisabled:true});
 await continuity();assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=context.browser().version();report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;report.failure=await hostScaleFailureFacts(page);if(page&&!page.isClosed()){report.failureScreenshot=join(report.artifactDirectory,'failure.png');await page.screenshot({path:report.failureScreenshot}).catch(()=>{});}}
finally{
 report.browserVersion=context?.browser().version();report.elapsedBeforeCleanupMs=performance.now()-started;
 const clean=await cleanupOwnedResources(report,[['context',()=>context?.close()],['fixture',()=>server?.close()],['guard',()=>guard?.close()],['integrity',async()=>{
 report.networkGuard=guard?.snapshot();report.testStable=JSON.stringify(await hashes(testPaths))===JSON.stringify(report.testHashes);
 report.sourceStable=manifest?JSON.stringify(await hashes(Object.keys(manifest.sourceHashes)))===JSON.stringify(manifest.sourceHashes):false;
 report.manifestStable=built?hash(await readFile(join(built.unpacked,'build-manifest.json')))===report.manifestHash:false;
 if(!report.testStable||!report.sourceStable||!report.manifestStable){report.status='FAIL';report.error=(report.error??'')+' source-or-test-or-package-changed';process.exitCode=1;}
 }]]);if(!clean)process.exitCode=1;
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,error:report.error,elapsedBeforeCleanupMs:report.elapsedBeforeCleanupMs,screenshots:report.screenshots}));
