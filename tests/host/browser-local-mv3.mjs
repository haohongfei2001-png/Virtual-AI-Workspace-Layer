import partitionDetails from './fixtures/observed-sidebar-project-details-20261026.json' with {type:'json'};
import historyStructure from './fixtures/observed-history-structure.json' with {type:'json'};
import projectSidebarSnapshot from './fixtures/observed-sidebar-project-20261026.json' with {type:'json'};
import {HOST_BASELINE_VERSION,materializePartitionedSidebar,materializeHistoryStructure,progressiveOrders,homeMain,longDesktopHTML,observedHomeHTML,prepareHistoryRun,reorderHistory,addPendingChat,promotePendingChat,enterStableChat,setNativeModal,insertHistoryGap,clearHistoryGap} from './fixtures/observed-host-replay.mjs';
/** Actual formal MV3 UI with an empty local memory session; offline host only. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageHost} from '../../extension/package.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {validLocalPipeline} from '../../src/host/local-status.mjs';
const P='g-p-11111111111111111111111111111111',C='33333333-3333-4333-8333-333333333333',B='44444444-4444-4444-8444-444444444444',requests=[];
// Existing explicit scroll-region contract, reconstructed in the same host.
// Exercise it through the real package/owner path, not just the return proof.
const conversationHTML=id=>process.argv.includes('--flow-only')?longDesktopHTML(id).replace('<div data-app-action-timeline-scroll>','<div data-app-action-timeline-scroll role="region" tabindex="0">').replace('</style>','#reading{height:2600px}[data-thread-scroll-footer]{position:fixed;left:280px;top:602px;width:600px;height:98px}</style>'):longDesktopHTML(id);
// The native search navigation reaches a home layout, not a conversation DOM
// under a home URL. Use the observed home boundaries while retaining the same
// document, sidebar, draft and unplanned browser-navigation event.
const server=createServer((req,res)=>{requests.push(req.url);res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(req.url==='/g/'+P+'/project'?observedProjectHTML(P,C)+`<script>document.addEventListener('click',e=>{if(e.target.closest('button')?.textContent==='Native search'){document.querySelector('main').innerHTML=${JSON.stringify(homeMain)};history.pushState({},'','/');return;}const a=e.target.closest('a[href]');if(a&&a.getAttribute('href')==='/c/${B}'&&!e.defaultPrevented){e.preventDefault();const next=a.href;const html=new DOMParser().parseFromString(${JSON.stringify(conversationHTML(B))},'text/html');document.body.replaceChildren(...html.body.childNodes);for(const style of document.querySelectorAll('head style'))style.remove();document.head.append(...html.head.childNodes);history.pushState({},'',next);${process.argv.includes('--flow-only')?'('+materializePartitionedSidebar.toString()+')('+JSON.stringify(partitionDetails.sidebarStructure.rows)+');':''}}});</script>`:req.url==='/'?observedHomeHTML(B):conversationHTML(B));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
const dir=await mkdtemp(join(tmpdir(),'vaiwl-browser-local-mv3-')),built=packageHost(join(dir,'package'),{offlineOrigin:origin,browserLocal:true}),report={status:'RUNNING',evidence:'ISOLATED_MV3_FORMAL_UI_LOCAL_SESSION_AND_PERSONAL',realChatGPT:'NOT_RUN',baseline:HOST_BASELINE_VERSION,package:built,checks:{},requests};
let context,page;
try{
 const launch=async()=>{
 const result=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1000,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Users/hhf/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await result.route('**/*',r=>r.request().url().startsWith(origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 return result;};
 context=await launch();report.browserErrors=[];context.on('page',p=>p.on('pageerror',e=>report.browserErrors.push(e.stack||e.message)));
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 if(process.argv.includes('--mount-recovery-only')){
  // Full production owner -> adapter -> preflight -> JOIN -> VIEW -> renderer.
  // Temporary branch is a local lifecycle counterexample, not captured site DOM.
  page=await context.newPage();await page.setViewportSize({width:1400,height:900});
  await page.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",()=>{('+materializePartitionedSidebar.toString()+')('+JSON.stringify(partitionDetails.sidebarStructure.rows)+');const branch=document.createElement("div");branch.style.cssText="position:absolute;width:8px;height:8px;bottom:0";branch.dataset.fixturePreflight="";document.querySelector("[role=main]").append(branch);},{once:true});'});
  await page.goto(origin+'/');
  await page.waitForFunction(()=>document.documentElement.dataset.vaiwlStartup==='surface-failed',{timeout:15000});
  const editor=await page.locator('textarea').elementHandle(),draft=await page.locator('textarea').inputValue();
  const control=await context.newPage();await control.goto('chrome-extension://'+id+'/status.html');
  const read=()=>control.evaluate(async origin=>{const [tab]=await chrome.tabs.query({url:origin+'/*'}),frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});return {documentId:frame.documentId,status:await chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_STATUS'},{documentId:frame.documentId}),pipeline:await chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'pipeline'}),local:await chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'})};},origin);
  await page.bringToFront();const before=await read();
  assert.equal(before.status.state,'surface-native-flow-branch-paint');
  assert.equal(before.pipeline.pipeline.storage,'session');assert(before.pipeline.pipeline.refs>0);
  assert.equal(before.pipeline.pipeline.lastWorkspaceDelivery,null);assert.equal(before.pipeline.pipeline.workspaceReceipt,null);
  assert.equal(await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').count(),0);
  // Only the native fixture removes its temporary branch; no Reload, new
  // handshake, personal confirmation or fabricated private records.
  await page.locator('[data-fixture-preflight]').evaluate(n=>n.remove());
  const workspace=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]'),sidebar=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
  await workspace.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});
  await page.locator('[id$="_workspace"]:visible').waitFor({timeout:15000});
  await sidebar.locator('.sidebar-footer').waitFor({timeout:15000});
  const after=await read();assert.equal(after.documentId,before.documentId);assert.equal(after.status.state,'ready');
  assert.equal(after.pipeline.pipeline.refs,before.pipeline.pipeline.refs);assert.equal(after.pipeline.pipeline.workspaceReceipt.phase,'rendered');assert.equal(after.pipeline.pipeline.workspaceReceipt.rows,1);
  assert.equal(after.local.mode,'locked');assert.equal(after.local.exists,false);
  assert(await editor.evaluate(n=>n.isConnected&&n===document.querySelector('textarea')));assert.equal(await page.locator('textarea').inputValue(),draft);
  const databases=await context.serviceWorkers().find(w=>w.url()==='chrome-extension://'+id+'/extension/worker.mjs').evaluate(()=>indexedDB.databases());assert.deepEqual(databases,[]);
  report.checks.nativePreflightRecovery={initialStatus:before.status.state,inventoryRetained:true,viewInitiallyAbsent:true,sameDocument:true,status:after.status.state,viewRendered:true,workspaceVisible:true,sidebarVisible:true,originalEditorAndDraft:true,privateMode:after.local.mode,privateDatabases:0};
  const image=join(dir,'mount-recovered.png');await page.screenshot({path:image});report.images=[image];await control.close();
 }
 if(process.argv.includes('--instant-recovery-only')){
  // The instant RAM scope deliberately changes when its worker is lost. This
  // is not a personal unlock or a continuation of the previous RAM inventory.
  page=await context.newPage();await page.setViewportSize({width:1400,height:900});
  await page.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",()=>{('+materializePartitionedSidebar.toString()+')('+JSON.stringify(partitionDetails.sidebarStructure.rows)+');},{once:true});'});
  await page.goto(origin+'/');
  const workspace=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]'),sidebar=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
  await workspace.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});
  await sidebar.locator('.sidebar-footer').waitFor({timeout:15000});
  const oldFrame=await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle(),draft=await page.locator('textarea').inputValue(),editor=await page.locator('textarea').elementHandle();
  const lifecycle=await context.newCDPSession(page),versions=[];lifecycle.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await lifecycle.send('ServiceWorker.enable');
  const waitUntil=async(read,test,label)=>{const until=Date.now()+10000;while(Date.now()<until){const value=await read();if(test(value))return value;await new Promise(r=>setTimeout(r,50));}throw Error(label+': '+JSON.stringify(await read()));};
  const workerURL='chrome-extension://'+id+'/extension/worker.mjs';
  const running=await waitUntil(async()=>versions,v=>v.some(x=>x.scriptURL===workerURL&&x.runningStatus==='running'),'instant-worker-not-running');
  const liveVersion=running.find(x=>x.scriptURL===workerURL&&x.runningStatus==='running');
  const control=await context.newPage();await control.goto('chrome-extension://'+id+'/status.html');
  const offset=versions.length;await lifecycle.send('ServiceWorker.stopWorker',{versionId:liveVersion.versionId});
  await waitUntil(async()=>versions.slice(offset),v=>v.some(x=>x.versionId===liveVersion.versionId&&x.runningStatus==='stopped'),'instant-worker-not-stopped');
  await page.bringToFront();
  await page.waitForFunction(n=>!n.isConnected,oldFrame,{timeout:15000});
  await workspace.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});
  await page.locator('[id$="_workspace"]:visible').waitFor({timeout:15000});
  await sidebar.locator('.sidebar-footer').waitFor({timeout:15000});
  const current=await control.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true}),frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});return {status:await chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_STATUS'},{documentId:frame.documentId}),local:await chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}),pipeline:await chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'pipeline'})};});
  assert.equal(current.status.state,'ready');assert.equal(current.local.mode,'locked');assert.equal(current.local.exists,false);
  assert.equal(current.pipeline.pipeline.storage,'session');assert.equal(current.pipeline.pipeline.refs,1);assert.equal(current.pipeline.pipeline.workspaceReceipt.phase,'rendered');assert.equal(current.pipeline.pipeline.workspaceReceipt.rows,1);
  assert(await editor.evaluate(n=>n.isConnected&&n===document.querySelector('textarea')));
  assert.equal(await page.locator('textarea').inputValue(),draft);
  assert.deepEqual(await context.serviceWorkers().find(w=>w.url()===workerURL).evaluate(()=>indexedDB.databases()),[]);
  report.checks.instantWorkerRecovery={status:current.status.state,privateMode:current.local.mode,storage:current.pipeline.pipeline.storage,knownChatRendered:true,workspaceVisible:true,sidebarVisible:true,originalEditorAndDraft:true,privateDatabases:0};
  const image=join(dir,'instant-worker-recovered.png');await page.screenshot({path:image});report.images=[image];
  await control.close();
 }
 if(process.argv.includes('--flow-only')){
  page=await context.newPage();await page.setViewportSize({width:1400,height:900});
  await page.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",()=>{('+materializePartitionedSidebar.toString()+')('+JSON.stringify(partitionDetails.sidebarStructure.rows)+');},{once:true});'});
  // Local counterexample for an inspected home with additional native flow
  // content. This is not a claim about the real unidentified rejected branch.
  await page.addInitScript(()=>{if(window===window.top)document.addEventListener('DOMContentLoaded',()=>{
   const parent=document.querySelector('[role=main]');if(!parent?.querySelector('.home-composer-anchor'))return;
   // The older fixture positions both landmarks absolutely. A new ordinary
   // sibling would then start at y=0 over the native header. Give this local
   // counterexample a real native flow before the extension starts; do not
   // relax the return-gap proof to accept a pre-existing header occluder.
   parent.style.marginTop='52px';for(const node of [parent.querySelector('.home-composer-anchor'),parent.querySelector('form')]){node.style.position='relative';node.style.top='auto';}
   const branch=document.createElement('section'),button=document.createElement('button'),hidden=document.createElement('div');
   branch.style.cssText='padding:12px;box-sizing:border-box';button.type='button';button.textContent='Native auxiliary action';branch.append(button);hidden.hidden=true;parent.append(branch,hidden);
   window.nativeFlowExtra={branch,button,hidden,parent,clicks:0};button.addEventListener('click',()=>window.nativeFlowExtra.clicks++);
  },{once:true});});
  report.images=[];
  for(const [scene,path] of [['project','/g/'+P+'/project'],['home','/'],['conversation','/c/'+B]]){
   await page.goto(origin+path);
   const workspace=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]'),sidebar=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
   await workspace.locator('.workspace').waitFor({timeout:15000});
   await page.locator('[id$="_workspace"]:visible').waitFor({timeout:15000});
   await sidebar.locator('.sidebar-footer').waitFor({timeout:15000});
   await sidebar.locator('.sidebar-footer').evaluate(n=>new Promise((resolve,reject)=>{const deadline=performance.now()+3000;const check=()=>{if(n.getBoundingClientRect().bottom<=innerHeight&&innerHeight>=128)resolve();else if(performance.now()>deadline)reject(Error('footer-clipped'));else requestAnimationFrame(check);};check();}));
   report.checks[scene+'Footer']=await sidebar.locator('.sidebar-footer').evaluate(n=>({y:n.getBoundingClientRect().y,bottom:n.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height,viewport:innerHeight,panel:n.parentElement.getBoundingClientRect().height}));
   assert(report.checks[scene+'Footer'].bottom<=report.checks[scene+'Footer'].viewport,'footer must fit content-sized frame');
   assert(await page.locator('[id$="_workspace"]').evaluate(n=>!n.hasAttribute('popover')&&getComputedStyle(n).position!=='fixed'));
   assert(await sidebar.locator('.themes').evaluate(n=>getComputedStyle(n).overflowY==='visible'));
   assert(await sidebar.locator('main').evaluate(n=>getComputedStyle(n).overflowY==='visible'));
   if(scene==='conversation'){
    const original=await page.locator('[data-app-action-timeline-scroll]').elementHandle();
    assert(await original.evaluate(n=>n.getAttribute('role')==='region'&&n.getAttribute('tabindex')==='0'&&getComputedStyle(n).display==='grid'));
    report.checks.nativeScrollRegion={originalTabStop:true,flowRoot:true};
   }
   if(scene==='home'){
    await page.getByRole('button',{name:'Native auxiliary action',exact:true}).click();
    report.checks.retainedHomeMember=await page.evaluate(()=>{const p=window.nativeFlowExtra;return {sameParents:p.branch.parentElement===p.parent&&p.button.parentElement===p.branch&&p.hidden.parentElement===p.parent,nativeClick:p.clicks===1,hiddenUntouched:p.hidden.outerHTML==='<div hidden=""></div>',workspaceVisible:[...document.querySelectorAll('[id$="_workspace"][data-va-owned]')].some(n=>getComputedStyle(n).display!=='none')};});
    assert.deepEqual(report.checks.retainedHomeMember,{sameParents:true,nativeClick:true,hiddenUntouched:true,workspaceVisible:true});
   }
   const image=join(dir,'flow-'+scene+'.png');await page.screenshot({path:image});report.images.push(image);
   const draft=await page.locator('textarea').inputValue();
   await page.locator('textarea').evaluate(n=>{
    window.flowInputFrames=[...document.querySelectorAll('iframe[src^="chrome-extension://"]')];
    n.addEventListener('pointerdown',()=>n.closest('[data-va-flow-composer]').classList.add('native-focus-ring'),{once:true});
   });
   await page.locator('textarea').click();await page.keyboard.type('x');assert.equal(await page.locator('textarea').inputValue(),draft+'x');
   await page.locator('[id$="_workspace"]:visible').waitFor({state:'hidden'});
   await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
   await page.locator('[id$="_workspace"]:visible').waitFor();
   assert.equal(await page.locator('textarea').inputValue(),draft+'x');
   assert(await page.locator('textarea').evaluate(n=>n.closest('[data-va-flow-composer]').classList.contains('native-focus-ring')),'return must accept the safely re-proved persistent native presentation');
   const inputFrames=await page.evaluate(()=>({before:window.flowInputFrames.map(n=>({role:n.src.split('/').pop(),connected:n.isConnected})),after:[...document.querySelectorAll('iframe[src^="chrome-extension://"]')].map(n=>({role:n.src.split('/').pop(),retained:window.flowInputFrames.includes(n)}))}));
   assert(inputFrames.before.every(n=>n.connected)&&inputFrames.after.every(n=>n.retained),'native presentation recovery must retain the existing frames: '+JSON.stringify(inputFrames));
   report.checks[scene+'FormalFlowInputReturn']=true;
   if(scene==='project'){
    await page.locator('#project-tool').evaluate(n=>{window.fixtureToolClicks=0;n.addEventListener('click',()=>window.fixtureToolClicks++);return n;});
    await page.locator('#project-tool').click();assert.equal(await page.evaluate(()=>window.fixtureToolClicks),1);
    await page.locator('#model').evaluate(n=>n.addEventListener('click',()=>window.fixtureModelClicks=(window.fixtureModelClicks??0)+1));
    await page.locator('#model').click();assert.equal(await page.evaluate(()=>window.fixtureModelClicks),1,'first native tool gesture must reach original handler');
    await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
    report.checks.firstNativeToolGesture=true;
   }
  }
  // One continuous formal journey, using the existing local confirmation and
  // native SPA event fixture. This is not real-account or live website proof.
  await page.goto(origin+'/g/'+P+'/project');
  const workspace=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]'),sidebar=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor({timeout:15000});
  const popup=await context.newPage();await popup.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();
  const unlocked=await popup.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}));assert.equal(unlocked.ok,true,JSON.stringify(unlocked));
  const localState=()=>popup.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}));
  report.checks.afterUnlock=await localState();assert.equal(report.checks.afterUnlock.mode,'personal');
  const flowWorker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'));
  await flowWorker.evaluate(()=>{globalThis.flowNavigationTrace=[];chrome.webNavigation.onCommitted.addListener(d=>{if(d.frameId===0)flowNavigationTrace.push({type:'commit',documentId:d.documentId});});chrome.webNavigation.onHistoryStateUpdated.addListener(d=>{if(d.frameId===0)flowNavigationTrace.push({type:'history',documentId:d.documentId});});});
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor({timeout:15000});
  await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).waitFor({timeout:15000});
  // NAV owns scrolling; no wheel message or nested iframe scroll is involved.
  await page.locator('nav').evaluate(n=>{n.style.height='340px';});
  const frameBox=await page.locator('iframe[src="chrome-extension://'+id+'/sidebar.html"]').boundingBox();
  await page.mouse.move(frameBox.x+60,frameBox.y+60);await page.mouse.wheel(0,140);
  await page.waitForFunction(()=>document.querySelector('nav').scrollTop>0);
  assert.equal(await sidebar.locator('.themes').evaluate(n=>n.scrollTop),0);
  assert.equal(await sidebar.locator('body').evaluate(()=>scrollY),0);
  report.checks.nativeNavScrollChain=true;
  await page.locator('nav').evaluate(n=>{n.scrollTop=0;n.style.height='calc(100vh - 52px)';});
  const originalFrame=await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle();
  await page.locator('iframe[src="chrome-extension://'+id+'/sidebar.html"]').evaluate(n=>n.remove());
  await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).waitFor({timeout:15000});
  assert(await originalFrame.evaluate(n=>n.isConnected&&n.getBoundingClientRect().height>0));
  report.checks.localSidebarFailurePreservesWorkspace=true;
  // Native partition replacement must not strand the owned role on detached
  // nodes, nor replace the independent workspace/document authority.
  const sidebarBeforeRecent=await page.locator('iframe[src="chrome-extension://'+id+'/sidebar.html"]').elementHandle();
  await page.evaluate(()=>{const old=partitionedFixture.recent,next=old.cloneNode(true);old.replaceWith(next);partitionedFixture.recent=next;});
  await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).waitFor({timeout:15000});
  assert(await sidebarBeforeRecent.evaluate(n=>n.isConnected&&n.getBoundingClientRect().height>0));
  await page.evaluate(()=>{
   const old=partitionedFixture.root,next=old.cloneNode(true);next.querySelector('[data-va-sidebar-slot]')?.remove();old.replaceWith(next);
   partitionedFixture.root=next;partitionedFixture.project=next.querySelector('[data-fixture-structure-row="1"]');partitionedFixture.recent=next.querySelector('[data-fixture-structure-row="92"]');partitionedFixture.control=next.querySelector('[data-fixture-structure-row="7"]');
  });
  await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).waitFor({timeout:15000});
  assert(await originalFrame.evaluate(n=>n.isConnected&&n.getBoundingClientRect().height>0));
  assert.equal(await sidebarBeforeRecent.evaluate(n=>n.isConnected),false,'replaced parent cannot retain old sidebar document');
  assert(await page.locator('[data-va-sidebar-slot]').evaluate(n=>n.parentElement===partitionedFixture.root&&n.nextElementSibling===partitionedFixture.project));
  report.checks.nativePartitionReplacementRejoinsSidebarOnly=true;
  report.checks.beforeMember=await localState();assert.equal(report.checks.beforeMember.mode,'personal');
  await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
  await page.getByRole('button',{name:'显示原生列表',exact:true}).click();
  await page.locator('[id$="_sidebar"]:visible').waitFor({state:'hidden'});
  await page.locator('#project-panel a[href="/c/'+B+'"]').click();await page.waitForURL(origin+'/c/'+B);
  report.checks.afterMember=await localState();report.checks.navigationTrace=await flowWorker.evaluate(()=>globalThis.flowNavigationTrace);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor({timeout:15000});
  assert.equal(await page.locator('[id$="_sidebar"]:visible').count(),0,'fresh same-document owner must retain explicit native-list choice');
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).waitFor({timeout:15000});
  report.checks.nativeListChoiceAcrossFreshDocumentBinding=true;
  await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
  const readingImage=join(dir,'flow-journey-reading.png');await page.screenshot({path:readingImage});report.images.push(readingImage);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});
  report.checks.sameDocumentProjectMemberReadingReturn=true;
  // A visible child locator alone does not prove the cross-origin frame has
  // reached its final host layout. Inspect both surfaces before capturing it.
  await page.locator('[id$="_workspace"]:visible').waitFor({timeout:15000});
  const returnCard=workspace.locator('.card').first();
  await returnCard.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  report.checks.returnPaint=await returnCard.evaluate(n=>{
   const b=n.getBoundingClientRect(),shadow=n.getRootNode(),hit=shadow.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
   return {box:b.toJSON(),viewport:[innerWidth,innerHeight],scroll:shadow.querySelector('.workspace').scrollTop,
    visible:getComputedStyle(n).visibility==='visible',hit:!!hit&&n.contains(hit)};
  });
  const paint=report.checks.returnPaint;
  assert(paint.visible&&paint.hit&&paint.box.width>0&&paint.box.height>0&&paint.box.x>=0&&paint.box.y>=0&&paint.box.right<=paint.viewport[0]&&paint.box.bottom<=paint.viewport[1],JSON.stringify(paint));
  assert(await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').evaluate(n=>{
   const b=n.getBoundingClientRect();return b.width>0&&b.height>0&&document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===n;
  }),'returned workspace iframe must be exposed in the host');
  const returnImage=join(dir,'flow-journey-return.png');await page.screenshot({path:returnImage});report.images.push(returnImage);
  await page.setViewportSize({width:720,height:900});
  await page.locator('[id$="_workspace"]:visible').waitFor({timeout:15000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  report.checks.narrowFlowStructure=await page.evaluate(()=>({workspaces:[...document.querySelectorAll('[data-va-owned][id$="_workspace"]')].filter(n=>getComputedStyle(n).display!=='none').length,headers:document.querySelectorAll('header').length,composers:document.querySelectorAll('textarea').length,roots:[...document.querySelectorAll('[data-va-flow-root]')].map(n=>n.getBoundingClientRect().toJSON()),height:innerHeight}));
  assert.equal(report.checks.narrowFlowStructure.workspaces,1);
  assert.equal(report.checks.narrowFlowStructure.headers,1);
  assert.equal(report.checks.narrowFlowStructure.composers,1);
  const layout=await page.locator('[id$="_workspace"]').evaluate(n=>{const b=n.getBoundingClientRect();return {right:b.right,width:b.width,height:b.height,viewport:innerWidth};});
  assert(layout.right<=layout.viewport+1&&layout.width>=160&&layout.height>=96,JSON.stringify(layout));
  const narrowImage=join(dir,'flow-journey-narrow.png');await page.screenshot({path:narrowImage});report.images.push(narrowImage);
  await page.setViewportSize({width:1400,height:900});
  await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
  await page.evaluate(setNativeModal,true);
  assert.equal(await page.locator('[id$="_workspace"]:visible').count(),0);
  await page.evaluate(setNativeModal,false);
  await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).waitFor({timeout:15000});
  assert.equal(await page.locator('[id$="_workspace"]:visible').count(),0,'native modal must not change reading intent');
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  // Native NAV coordinates and the user's project expansion are persisted by
  // the existing b23_views CAS path, not a test-injected record.
  await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).click();
  await page.locator('nav').evaluate(n=>{n.style.height='340px';n.scrollTop=100;});
  const readViews=()=>context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/')).evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('vaiwl-b1-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views'),q=tx.objectStore('b23_views').getAll();tx.oncomplete=()=>resolve(q.result.map(r=>r.payload?.value).filter(Boolean));tx.onabort=()=>reject(tx.error);});}finally{db.close();}});
  const waitUntil=async(read,test,label)=>{const until=Date.now()+10000;while(Date.now()<until){const value=await read();if(test(value))return value;await new Promise(r=>setTimeout(r,50));}throw Error(label+': '+JSON.stringify(await read()));};
  report.checks.persistedNativeNav=await waitUntil(readViews,rows=>rows.some(r=>r.sidebarViewport?.owner==='native-nav'&&r.sidebarViewport.scroll>0),'native-nav-view-not-persisted');
  assert.equal(report.checks.persistedNativeNav.find(r=>r.sidebarViewport)?.sidebarViewport.scroll,await page.locator('nav').evaluate(n=>Math.round(n.scrollTop)));
  const lifecycle=await context.newCDPSession(page),versions=[];lifecycle.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await lifecycle.send('ServiceWorker.enable');
  const running=await waitUntil(async()=>versions,v=>v.some(x=>x.scriptURL==='chrome-extension://'+id+'/extension/worker.mjs'&&x.runningStatus==='running'),'worker-not-running');
  const liveVersion=running.find(x=>x.scriptURL==='chrome-extension://'+id+'/extension/worker.mjs'&&x.runningStatus==='running');const offset=versions.length;
  await lifecycle.send('ServiceWorker.stopWorker',{versionId:liveVersion.versionId});
  await waitUntil(async()=>versions.slice(offset),v=>v.some(x=>x.versionId===liveVersion.versionId&&x.runningStatus==='stopped'),'worker-not-stopped');
  await localState();
  await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).waitFor({timeout:15000});
  await waitUntil(localState,v=>v.mode==='personal','same-document-worker-binding-lost');
  assert.equal(await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).getAttribute('aria-expanded'),'false');
  report.checks.workerRecoveryKeepsPersonalAndUserExpansion=true;
  await page.reload();
  await workspace.locator('.workspace').waitFor({timeout:15000});
  assert.equal((await localState()).mode,'locked');
  assert.equal(await workspace.getByText('Native Project',{exact:true}).count(),0);
  assert.equal((await popup.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}))).ok,true);
  await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});
  await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).waitFor({timeout:15000});
  assert.equal(await sidebar.getByRole('button',{name:'侧栏项目 Native Project',exact:true}).getAttribute('aria-expanded'),'false');
  report.checks.newDocumentLocksAndConfirmedPrivateObjectAndLayoutRestore=true;
  await popup.bringToFront();const locked=await popup.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'lock'}));assert.equal(locked.ok,true,JSON.stringify(locked));
  await workspace.getByText('Native Project',{exact:true}).first().waitFor({state:'hidden',timeout:15000});
  report.checks.privateScopeRevokeClearsPriorProject=true;
  await page.bringToFront();
  await page.locator('button[aria-label="返回工作空间"]:visible,button[aria-label="返回原生阅读"]:visible').first().waitFor({timeout:15000});
  if(await page.getByRole('button',{name:'返回原生阅读',exact:true}).isVisible())await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
  // Synthetic length and fixed composer reproduce a native scroll clamp.
  // Actual extension removal must restore it, not just surface.dispose().
  const nativeScroll=page.locator('[data-app-action-timeline-scroll]');
  await nativeScroll.evaluate(n=>{n.scrollTop=600;});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await nativeScroll.evaluate(n=>n.scrollTop),600);
  const nativeBefore=await page.locator('[data-thread-scroll-footer]').evaluate(n=>({rect:n.getBoundingClientRect().toJSON(),style:n.getAttribute('style')}));
  const draftBefore=await page.locator('textarea').inputValue();
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await page.locator('[id$="_workspace"]:visible').waitFor({timeout:15000});
  assert.equal(await nativeScroll.evaluate(n=>n.scrollTop),0,'prove the active flow clamped the original scroll before uninstall');
  await cdp.send('Extensions.uninstall',{id});
  await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:10000});
  assert.deepEqual(await page.locator('[data-thread-scroll-footer]').evaluate(n=>({rect:n.getBoundingClientRect().toJSON(),style:n.getAttribute('style')})),nativeBefore);
  assert.equal(await page.locator('textarea').inputValue(),draftBefore);
  assert.equal(await page.locator('[id$="_workspace"]:visible').count(),0);
  assert.equal(await page.locator('[id$="_sidebar"]:visible').count(),0);
  assert.equal(await nativeScroll.evaluate(n=>n.scrollTop),600,'actual uninstall must restore the native reading position');
  await page.locator('textarea').click();assert(await page.locator('textarea').evaluate(n=>document.activeElement===n));
  report.checks.actualIsolatedUninstallRestoresNativeGeometryDraftAndInput=true;
  report.checks.actualIsolatedUninstallRestoresNativeReadingPosition=true;
  await popup.close();
 }
 if(process.argv.includes('--sidebar-composition-only')){
  page=await context.newPage();await page.setViewportSize({width:1400,height:900});
  // The real 2026-10-27 Project screenshot has a centered member column.
  // Replay only this geometric fact, with the existing formal renderer/data.
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const content=document.querySelector('#project-content');if(content)content.style.cssText='max-width:660px;margin-inline:auto';const welcome=document.querySelector('.home-composer-anchor');if(welcome){welcome.style.cssText='position:absolute;left:100px;top:110px;width:400px;height:120px';
   // The anonymous host's old 780px constant overflowed the partitioned 260px
   // sidebar at 1000px. Preserve the observed containment relation on resize;
   // this is fixture geometry, not evidence of the live host's CSS declarations.
   const root=document.querySelector('[data-app-shell-main-content-layout]');root.style.width='calc(100vw - 260px)';root.style.height='100vh';const composer=document.querySelector('form');composer.style.width='100%';
   // Integrate the independently reproduced transparent-wrapper case into the
   // formal MV3 owner journey, without claiming it is a newly captured host.
   const wrapper=document.createElement('div');wrapper.style.display='contents';composer.before(wrapper);wrapper.append(composer);
  }},{once:true}));
  await page.addInitScript({content:'if(window===window.top&&location.hostname==="127.0.0.1")document.addEventListener("DOMContentLoaded",()=>{('+materializePartitionedSidebar.toString()+')('+JSON.stringify(partitionDetails.sidebarStructure.rows)+');},{once:true});'});
  report.controlEvents=[];await page.exposeFunction('__recordControl',v=>{if(report.controlEvents.length<120)report.controlEvents.push(v);});
  await page.addInitScript(()=>addEventListener('message',e=>{const d=e.data;if(e.origin.startsWith('chrome-extension://')&&d&&['VAIWL_UI_SUSPEND','VAIWL_UI_REVEAL_FOCUS','VAIWL_UI_SIDEBAR_WHEEL','VAIWL_UI_BOOT'].includes(d.type))window.__recordControl({type:d.type,role:d.role,reason:d.reason,stage:d.stage});}));
  await page.goto(origin+'/g/'+P+'/project');
  const workspace=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]'),sidebar=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor({timeout:15000});
  await page.waitForFunction(()=>!!document.querySelector('[data-va-sidebar-slot]')&&document.querySelector('[id$="_sidebar"]')?.matches(':popover-open'),null,{timeout:15000});
  await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).waitFor();
  assert.equal(await page.locator('[data-va-mask-sidebar]').count(),0);
  report.checks.partitionSlotWithFormalProjectAndMembers=true;
  await page.getByText('ChatGPT 项目管理与最近聊天',{exact:true}).waitFor();
  assert.equal(await workspace.locator('[data-vaiwl-candidate-root]:visible').count(),0,'no empty native-project disclosure');
  report.images=[];
  const capture=async name=>{const path=join(dir,name+'.png');await page.screenshot({path});report.images.push(path);};
  await page.waitForFunction(()=>document.querySelector('[data-va-sidebar-slot]').getBoundingClientRect().height<400);
  report.checks.sparseSidebarFitsContent=true;
  assert(await page.evaluate(()=>{const panel=document.querySelector('#project-panel'),workspace=document.querySelector('[id$="_workspace"]');return workspace.getBoundingClientRect().width>panel.getBoundingClientRect().width+300;}));
  report.checks.centeredNativePanelDoesNotConstrainWorkspace=true;
  // The host exit is retained declaratively, but no longer inserts a blank
  // row above the formal UI. It occupies the renderer's reserved edge only.
  assert(await page.locator('[id$="_workspace"]').evaluate(n=>Math.abs(n.getBoundingClientRect().top-n.querySelector('iframe').getBoundingClientRect().top)<1));
  assert.equal(await sidebar.getByRole('button',{name:'退出工作空间增强',exact:true}).count(),0);
  report.checks.singleDeclarativeHostExit=true;
  assert(await sidebar.locator('.sidebar-footer').evaluate(n=>n.parentElement.firstElementChild.classList.contains('themes')&&n.querySelectorAll('button').length===4));
  const closeSidebar=await page.locator('[id$="_sidebar"]>button').boundingBox();
  for(const button of await sidebar.locator('.sidebar-footer button').all()){const r=await button.boundingBox();assert(r&&closeSidebar);assert(!(r.x<closeSidebar.x+closeSidebar.width&&r.x+r.width>closeSidebar.x&&r.y<closeSidebar.y+closeSidebar.height&&r.y+r.height>closeSidebar.y),'lower bar must reserve the declarative native-list exit');}
  report.checks.topicsLeadQuietExtensionTools=true;
  await sidebar.getByRole('button',{name:'折叠主题导航',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-va-sidebar-slot]').getBoundingClientRect().height===128);
  const foldedFooter=await sidebar.locator('.sidebar-footer').boundingBox(),foldedClose=await page.locator('[id$="_sidebar"]>button').boundingBox();
  assert(foldedClose.y>=foldedFooter.y&&foldedClose.y+foldedClose.height<=foldedFooter.y+foldedFooter.height,'folded footer and host exit share the same reserved row');
  await sidebar.getByRole('button',{name:'折叠主题导航',exact:true}).click();
  await sidebar.getByRole('button',{name:'侧栏主题 Native Project',exact:true}).waitFor();
  report.checks.foldedToolsStayAligned=true;
  // Reuse the actual empty auxiliary component. Temporarily expose its summary
  // only to measure slot placement; no candidate data or actions are invented.
  for(const [frame,role] of [[workspace,'workspace'],[sidebar,'sidebar']]){
   assert(await frame.locator('[data-vaiwl-candidate-root]').evaluate((n,role)=>{
    const slot=n.assignedSlot;if(!slot||slot.name!=='native-candidates')return false;
    if(role==='sidebar')return slot.parentElement.tagName==='SECTION'&&slot.nextElementSibling?.classList.contains('sidebar-footer');
    const area=slot.parentElement,cards=area.querySelector('.cards');if(!area.classList.contains('workspace-core')||!cards)return false;
    const hidden=n.hidden;try{n.hidden=false;const r=n.getBoundingClientRect(),c=cards.getBoundingClientRect();return r.top>=c.bottom&&r.top-c.bottom<80;}finally{n.hidden=hidden;}
   },role));
  }
  report.checks.nativeCandidatesInFormalContentFlow=true;
  // Exercise the existing disclosure's actual toggle/size path. A blank
  // owned test box supplies height, not native records or synthetic targets.
  const slotHeight=await page.locator('[data-va-sidebar-slot]').evaluate(n=>n.getBoundingClientRect().height);
  await sidebar.locator('[data-vaiwl-candidate-root]').evaluate(n=>{n.hidden=false;n.firstElementChild.nextElementSibling.style.minHeight='200px';n.open=true;});
  await page.waitForFunction(h=>document.querySelector('[data-va-sidebar-slot]').getBoundingClientRect().height>h+100,slotHeight);
  await sidebar.locator('[data-vaiwl-candidate-root]').evaluate(n=>{n.open=false;n.hidden=true;n.firstElementChild.nextElementSibling.style.removeProperty('min-height');});
  await page.waitForFunction(h=>Math.abs(document.querySelector('[data-va-sidebar-slot]').getBoundingClientRect().height-h)<2,slotHeight);
  report.checks.candidateDisclosureResizesWithoutRebuilding=true;
  const checkExitRail=async()=>{
   const close=await page.locator('[id$="_workspace"]>button').boundingBox();
   for(const control of await workspace.locator('.arrows button').all()){
    const r=await control.boundingBox();assert(r&&close);assert(!(r.x<close.x+close.width&&r.x+r.width>close.x&&r.y<close.y+close.height&&r.y+r.height>close.y),'host exit must not cover period/settings controls');
   }
  };
  await checkExitRail();
  // The formal surfaces share their proved host canvas, including the native
  // boundary caption. Do not recolor/move native input or enlarge the mask.
  await page.evaluate(()=>{document.querySelector('main').style.backgroundColor='rgb(250, 250, 250)';partitionedFixture.root.style.backgroundColor='rgb(243, 243, 243)';});
  for(const [frame,color] of [[workspace,'rgb(250, 250, 250)'],[sidebar,'rgb(243, 243, 243)']]){
   await frame.locator('body').evaluate(async(n,color)=>{for(let i=0;i<100;i++){if(getComputedStyle(n).backgroundColor===color)return;await new Promise(r=>setTimeout(r,20));}throw Error('formal frame did not adopt host canvas');},color);
  }
  assert.equal(await workspace.locator('.workspace').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(250, 250, 250)');
  assert.equal(await workspace.locator('.card').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)','native canvas must not flatten the approved card surface');
  assert.equal(await page.locator('[data-va-native-boundary]').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(243, 243, 243)');
  report.checks.provedRoleCanvasMatchesNativeWithoutNativeRestyling=true;
  // Explicit overview entry composes with native Project scrolling. Automatic
  // startup above did not reposition the form or require an extra native action.
  assert.equal(await page.locator('#project-scroll').evaluate(n=>n.scrollTop),0);
  await page.locator('[id$="_workspace"]>button').click();
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await page.waitForFunction(()=>{const surface=document.querySelector('[id$="_workspace"]'),port=document.querySelector('#project-scroll');return surface?.matches(':popover-open')&&port.scrollTop>0&&surface.getBoundingClientRect().height>=port.clientHeight-1;});
  assert.equal(await page.locator('#draft').inputValue(),'fixture draft');
  report.checks.projectOverviewUsesNativeScrollFlow=true;
  await capture('partition-desktop-workspace');

  const before=await page.locator('[data-fixture-structure-row="1"]').evaluate(n=>n.outerHTML);
  await page.locator('#draft').focus();
  await page.waitForFunction(()=>!document.querySelector('[id$="_workspace"]')?.matches(':popover-open')&&document.querySelector('[id$="_sidebar"]')?.matches(':popover-open'));
  assert.equal(await page.locator('#draft').inputValue(),'fixture draft');
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor();
  report.checks.nativeInputAndReturnKeepContinuousSidebar=true;
  const theme=sidebar.getByRole('button',{name:'侧栏主题 Native Project',exact:true});
  await theme.click();
  const selected=await theme.getAttribute('aria-expanded');
  await page.evaluate(()=>{const marker=document.createElement('span');marker.setAttribute('data-fixture-update','');partitionedFixture.recent.append(marker);marker.remove();});
  await page.waitForTimeout(300);
  assert.equal(await theme.getAttribute('aria-expanded'),selected);
  report.checks.themeDisclosureSurvivesHostChange=true;
  await theme.click();
  const frameIdentity=await page.locator('[id$="_sidebar"]').getAttribute('id');
  await page.evaluate(()=>{partitionedFixture.savedDisclosure=partitionedFixture.control.getAttribute('aria-expanded');partitionedFixture.project.dataset.savedStyle=partitionedFixture.project.getAttribute('style');partitionedFixture.project.style.height='36px';partitionedFixture.control.setAttribute('aria-expanded','false');});
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[id$="_sidebar"]').getAttribute('id'),frameIdentity);
  assert.equal(await page.evaluate(()=>partitionedFixture.control.getAttribute('aria-expanded')),'false');
  await capture('partition-native-collapsed');
  await page.evaluate(()=>{const n=partitionedFixture.project;n.setAttribute('style',n.dataset.savedStyle);delete n.dataset.savedStyle;if(partitionedFixture.savedDisclosure===null)partitionedFixture.control.removeAttribute('aria-expanded');else partitionedFixture.control.setAttribute('aria-expanded',partitionedFixture.savedDisclosure);});
  report.checks.nativeDisclosureDoesNotRebuildSidebar=true;
  await page.setViewportSize({width:760,height:900});
  await page.waitForTimeout(300);
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor();
  await checkExitRail();await capture('partition-narrow-workspace');
  await page.setViewportSize({width:1000,height:900});
  await page.waitForTimeout(300);

  await page.evaluate(()=>{partitionedFixture.scroll.style.height='400px';});
  await page.waitForTimeout(200);
  // A composed sidebar is one navigation journey: wheel at the end of our
  // short theme list must reach the adjacent native management/recents region.
  const wheelTarget=await theme.boundingBox();
  await page.mouse.move(wheelTarget.x+wheelTarget.width/2,wheelTarget.y+wheelTarget.height/2);
  const themes=sidebar.locator('.themes');
  await themes.evaluate(n=>{const probe=document.createElement('div');probe.dataset.wheelProbe='';probe.style.height='700px';n.append(probe);n.scrollTop=0;});
  await page.mouse.wheel(0,60);
  await page.waitForFunction(()=>{const frame=document.querySelector('[id$="_sidebar"] iframe');return !!frame;});
  await themes.evaluate(n=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert((await themes.evaluate(n=>n.scrollTop))>0,'owned overflow consumes wheel before native scrolling');
  assert.equal(await page.evaluate(()=>partitionedFixture.scroll.scrollTop),0);
  await themes.evaluate(n=>{n.querySelector('[data-wheel-probe]').remove();n.scrollTop=n.scrollHeight;n.dispatchEvent(new WheelEvent('wheel',{bubbles:true,composed:true,cancelable:true,deltaY:80,clientX:30,clientY:30}));});
  await themes.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>partitionedFixture.scroll.scrollTop),0,'synthetic wheel cannot move native sidebar');
  await page.mouse.wheel(80,0);
  await themes.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>partitionedFixture.scroll.scrollTop),0,'horizontal gestures do not become native vertical scroll');
  await page.mouse.wheel(0,80);
  await page.waitForFunction(()=>partitionedFixture.scroll.scrollTop>0,null,{timeout:2000});
  assert.equal(await page.locator('#draft').inputValue(),'fixture draft');
  report.checks.ownedSidebarWheelContinuesNativeFlow=true;
  await page.evaluate(()=>{partitionedFixture.scroll.scrollTop=0;});
  await themes.evaluate(n=>{n.scrollTop=0;});
  await page.mouse.move(999,899);
  await page.waitForFunction(()=>Math.abs(document.querySelector('[id$="_sidebar"]').getBoundingClientRect().top-document.querySelector('[data-va-sidebar-slot]').getBoundingClientRect().top)<1);
  const sidebarCanvasHeight=await page.locator('[id$="_sidebar"] iframe').evaluate(n=>n.getBoundingClientRect().height);
  const themeBeforeNativeScroll=await theme.boundingBox();
  await page.evaluate(()=>{partitionedFixture.scroll.scrollTop=30;});
  await page.waitForFunction(()=>Math.abs(document.querySelector('[id$="_sidebar"]').getBoundingClientRect().y-document.querySelector('[data-va-sidebar-slot]').getBoundingClientRect().y)<1);
  report.checks.nativeScrollKeepsFrameAligned=true;
  // The slot's leading edge now leaves the scrollport. The visible surface
  // clips, but neither iframe layout nor the theme's native-flow position resets.
  await page.evaluate(()=>{partitionedFixture.scroll.scrollTop=140;});
  assert.equal(await page.evaluate(()=>partitionedFixture.scroll.scrollTop),140,'fixture must actually scroll');
  await page.waitForFunction(()=>{const slot=document.querySelector('[data-va-sidebar-slot]'),surface=document.querySelector('[id$="_sidebar"]');return surface.matches(':popover-open')&&slot.getBoundingClientRect().top<surface.getBoundingClientRect().top&&Math.abs(surface.querySelector('iframe').getBoundingClientRect().top-slot.getBoundingClientRect().top)<1;});
  assert.equal(await page.locator('[id$="_sidebar"] iframe').evaluate(n=>n.getBoundingClientRect().height),sidebarCanvasHeight);
  assert(Math.abs((await theme.boundingBox()).y-themeBeforeNativeScroll.y+140)<1,'clipped themes move with native scroll, without restarting at y=0');
  report.checks.clippedNativeScrollKeepsContentCoordinates=true;
  const closeOffset=await page.locator('[id$="_sidebar"]').evaluate(n=>n.querySelector('button').getBoundingClientRect().top-n.querySelector('iframe').getBoundingClientRect().top);
  assert.equal(closeOffset,sidebarCanvasHeight-32,'declarative exit moves with its lower toolbar');
  // Focusing a clipped owned control reveals its slot in the native scrollport.
  await page.locator('#draft').focus();
  await theme.focus();
  await page.waitForFunction(()=>partitionedFixture.scroll.scrollTop<140);
  const focusedBox=await theme.boundingBox(),visiblePort=await page.evaluate(()=>partitionedFixture.scroll.getBoundingClientRect().toJSON());
  assert(focusedBox.y>=visiblePort.top&&focusedBox.y+focusedBox.height<=visiblePort.bottom,'focused control is visible without aligning the entire slot');
  report.checks.clippedKeyboardFocusRevealed=true;
  await page.evaluate(()=>{partitionedFixture.scroll.scrollTop=0;partitionedFixture.scroll.style.height='calc(100vh - 52px)';});
  await page.getByRole('button',{name:'显示原生列表',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-va-sidebar-slot]').getBoundingClientRect().height===0);
  assert.equal(await page.locator('[data-fixture-structure-row="1"]').evaluate(n=>n.outerHTML),before);
  report.checks.nativeProjectUntouchedAndSpaceReversible=true;
  // The focus check already entered native reading. Explicit return reopens both roles.
  assert.equal(await page.locator('[id$="_workspace"]').evaluate(n=>n.matches(':popover-open')),false);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor();
  assert((await page.locator('[data-va-sidebar-slot]').evaluate(n=>n.getBoundingClientRect().height))>=128,'flow slot follows its actual compact content, not the legacy replacement-list minimum');
  report.checks.explicitWorkspaceReturnRestoresComposition=true;
  const opened=context.waitForEvent('page');
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().click();
  const chat=await opened;await chat.waitForURL(origin+'/c/'+B);
  assert.equal(await chat.evaluate(()=>opener),null);await chat.close();
  assert.equal(await page.locator('#draft').inputValue(),'fixture draft');
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor();
  report.checks.nativeMemberOpenPreservesOriginalDraftAndWorkspace=true;
  // Same-document native activation must retain observed Project facts even
  // when the native SPA replaces every body node. No private authorization is
  // imported from another document and no fixture business rows are injected.
  await page.locator('#draft').fill('');
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor();
  if(await theme.getAttribute('aria-expanded')==='true')await theme.click();
  assert.equal(await theme.getAttribute('aria-expanded'),'false');
  const pagesBefore=context.pages().length;
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().click();
  await page.waitForURL(origin+'/c/'+B,{timeout:15000});
  assert.equal(context.pages().length,pagesBefore,'safe exact native action stays in this document');
  await sidebar.getByRole('button',{name:'侧栏主题 Native Project',exact:true}).waitFor({timeout:15000});
  assert.equal(await theme.getAttribute('aria-expanded'),'false','same-document navigation preserves the explicit theme choice');
  await theme.click();
  await sidebar.locator('a[href="'+origin+'/c/'+B+'"]').first().waitFor();
  await capture('partition-member-reading');
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await workspace.getByRole('link',{name:'Native A',exact:true}).first().waitFor();
  await workspace.locator('a[href="'+origin+'/c/'+B+'"]').first().waitFor();
  report.checks.sameDocumentMemberRetainsProjectAndReturn=true;
  await capture('partition-member-return');
  // The following independent home/long-reading scenes keep their old draft.
  await page.goto(origin+'/g/'+P+'/project');
  await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor();

  await page.locator('#draft').focus();
  await page.waitForFunction(()=>document.querySelector('[id$="_sidebar"]')?.matches(':popover-open')&&!document.querySelector('[id$="_workspace"]')?.matches(':popover-open'));
  await capture('partition-native-reading');
  for(const [scene,path] of [['home','/'],['long-chat','/c/'+B]]){
   await page.goto(origin+path);
   await page.waitForFunction(()=>!!document.querySelector('[data-va-sidebar-slot]')&&document.querySelector('[id$="_sidebar"]')?.matches(':popover-open'),null,{timeout:15000});
   await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).waitFor();
   if(scene==='home'){
    await page.waitForFunction(()=>document.querySelector('[id$="_workspace"]')?.matches(':popover-open'));
    assert(await page.evaluate(()=>{const surface=document.querySelector('[id$="_workspace"]').getBoundingClientRect(),welcome=document.querySelector('.home-composer-anchor').getBoundingClientRect(),composer=document.querySelector('form').getBoundingClientRect();return surface.width>welcome.width&&surface.top<welcome.top&&surface.bottom<=composer.top;}));
    report.checks.homeCanvasIndependentOfWelcomeSize=true;
    assert(await page.evaluate(()=>{const surface=document.querySelector('[id$="_workspace"]').getBoundingClientRect(),composer=document.querySelector('form').getBoundingClientRect();return composer.bottom===innerHeight-16&&surface.height>innerHeight*.7&&document.querySelector('form').hasAttribute('data-va-home-dock');}),'formal owner must actually consume the proved home docking proposal');
    report.checks.homeDockIntegrated=true;await capture('partition-home-workspace');
    await page.setViewportSize({width:760,height:900});
    await page.waitForFunction(()=>{const workspace=document.querySelector('[id$="_workspace"]'),c=document.querySelector('form').getBoundingClientRect();return workspace?.matches(':popover-open')&&workspace.getBoundingClientRect().right<=innerWidth&&c.right<=innerWidth&&c.bottom===innerHeight-16;});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    report.homeDockNarrow=await page.evaluate(()=>{const c=document.querySelector('form'),r=c.getBoundingClientRect(),w=document.querySelector('[id$="_workspace"]').getBoundingClientRect();return {composer:r.toJSON(),canvas:w.toJSON(),hitInsideComposer:c.contains(document.elementFromPoint(r.x+20,r.y+10)),draft:c.querySelector('textarea').value==='fixture draft'};});
    assert(report.homeDockNarrow.hitInsideComposer&&report.homeDockNarrow.draft);
    await capture('partition-home-narrow-workspace');await page.setViewportSize({width:1000,height:900});
    report.checks.homeDockResponsive=true;
   }
   await page.locator('textarea').focus();
   await page.waitForFunction(()=>document.querySelector('[id$="_sidebar"]')?.matches(':popover-open')&&!document.querySelector('[id$="_workspace"]')?.matches(':popover-open'));
   await capture('partition-'+scene+'-reading');
   await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[id$="_workspace"]')?.matches(':popover-open'));
   report.checks[scene+'InputAndReturnKeepSidebar']=true;
   if(scene==='home')await capture('partition-home-return');
  }
  await sidebar.getByRole('button',{name:'已保存片段',exact:true}).click();
  const auxiliary=sidebar.locator('[data-vaiwl-frame-snippets]');await auxiliary.waitFor();
  const auxiliaryBox=await auxiliary.boundingBox(),auxiliaryExit=await page.locator('[id$="_sidebar"]>button').boundingBox();
  assert(auxiliaryBox&&auxiliaryExit&&auxiliaryBox.y+auxiliaryBox.height<=auxiliaryExit.y,'auxiliary scrollport stays entirely above the declarative exit lane');
  report.checks.auxiliaryPanelReservesExitLane=true;

  assert.deepEqual(report.browserErrors,[]);
 }
 if(process.argv.includes('--sidebar-capture-only')){
  // Exercise the production private popup and exact-document message route.
  // The added branch is a declared synthetic completeness sentinel; the
  // separate anonymous replay retains the actually observed outer topology.
  page=await context.newPage();
  await page.addInitScript(rows=>{
   // Playwright init scripts also run in extension child frames. Materialize
   // the anonymous native topology only in the fixture's top document.
   if(window!==window.top||location.hostname!=='127.0.0.1'||location.protocol!=='http:')return;
   document.addEventListener('DOMContentLoaded',()=>{
   const nav=document.querySelector('nav'),history=nav.firstElementChild;
   const nodes=[];
   for(const [parent,,tag,role,flags]of rows){const n=document.createElement(tag==='OTHER'?'div':tag.toLowerCase());
    if(role!=='absent')n.setAttribute('role',role);for(const [i,attr]of ['data-sidebar-chatgpt-conversation-key','data-app-action-sidebar-section','href','aria-expanded','aria-controls','tabindex'].entries())if(flags&(1<<i))n.setAttribute(attr,'PRIVATE');
    nodes.push(n);if(parent>=0)nodes[parent].append(n);
   }
   // Real outer topology; four synthetic sentinels at its explicitly unknown
   // cut points test reach/transport, never establish actual member semantics.
   for(const index of [32,35,40,42]){const span=document.createElement('span'),button=document.createElement('button');button.setAttribute('role','menuitem');button.textContent='PRIVATE_SENTINEL_CONTROL';span.append(button);nodes[index].append(span);}
   const root=nodes[0];root.append(history);
   // Observed common-parent ancestry is 60 -> 59 -> 21 -> NAV (two wrappers).
   let shell=root;for(let i=0;i<2;i++){const wrap=document.createElement('div');wrap.append(shell);shell=wrap;}nav.append(shell);
   },{once:true});
  },projectSidebarSnapshot.sidebarStructure.rows.slice(0,44));
  const control=await context.newPage();await control.goto('chrome-extension://'+id+'/status.html');
  const content=await readFile(join(built.unpacked,'content.js'),'utf8'),build=/build="([a-f0-9]{64})"/.exec(content)?.[1];assert(build);
  let stale;
  for(const [index,route]of ['/', '/g/'+P+'/project'].entries()){
   await page.goto(origin+route);await page.bringToFront();
   await page.waitForFunction(()=>document.documentElement.dataset.vaiwlBoot==='loaded');
   const sample=await control.evaluate(async index=>{
    const api=await import(chrome.runtime.getURL('src/host/local-status.mjs'));let target;
    const state=await api.readActiveLocalStatus({tabs:chrome.tabs,webNavigation:chrome.webNavigation,onTarget:t=>target=t});
    const boot=await api.readLocalBoot({tabs:chrome.tabs,webNavigation:chrome.webNavigation,target});
    const shape=await api.readActiveLocalLayout({tabs:chrome.tabs,webNavigation:chrome.webNavigation,target});
    await import(chrome.runtime.getURL('extension/status.mjs')+'?sidebar-capture='+index);
    return {state,boot,shape,target,coverage:document.querySelector('#sidebar-structure-coverage')?.textContent};
   },index);
   assert.equal(sample.boot?.build,build);assert.equal(sample.boot.stage,'module-loaded');
   assert(sample.shape?.sidebarStructure);assert.equal(sample.shape.sidebarStructure.reason,'complete');
   assert.match(sample.coverage??'',/COMPLETE_FOCUSED_SNAPSHOT/);
   assert(!JSON.stringify(sample.shape.sidebarStructure).includes('PRIVATE_SENTINEL'));
   assert(!JSON.stringify(sample.shape.sidebarStructure).includes('66666666'));
   assert.equal(sample.shape.sidebarStructure.rows.filter(r=>r[3]==='menuitem').length,4);
   const [download]=await Promise.all([control.waitForEvent('download'),control.locator('#save-sidebar-snapshot').click()]);
   const exported=JSON.parse(await readFile(await download.path(),'utf8'));
   assert.equal(download.suggestedFilename(),'vaiwl-sidebar-structure.json');
   assert.equal(exported.build,build);assert.equal(exported.route,index?'project':'home');
   assert.equal(exported.documentBinding,'verified-at-capture-not-account-identity');
   assert.equal(exported.coverage.state,'COMPLETE_FOCUSED_SNAPSHOT');
   assert.equal(exported.coverage.scope,'non-history-section-details');
   assert.equal(exported.coverage.contextOnly.length,1);
   assert(!JSON.stringify(exported).includes('PRIVATE_SENTINEL')&&!JSON.stringify(exported).includes('66666666'));
   assert(!Object.hasOwn(exported,'url')&&!Object.hasOwn(exported,'documentId'));
   if(stale){assert.notEqual(stale.documentId,sample.target.documentId);const old=await control.evaluate(async target=>{const api=await import(chrome.runtime.getURL('src/host/local-status.mjs'));return api.readActiveLocalLayout({tabs:chrome.tabs,webNavigation:chrome.webNavigation,target});},stale);assert.equal(old,null);}
   stale=sample.target;
   report.checks[index?'projectCollectorPopupComplete':'homeCollectorPopupComplete']=true;
   assert.equal(await page.locator('textarea').inputValue(),'fixture draft');
  }
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'));
  assert.deepEqual(await worker.evaluate(()=>indexedDB.databases()),[]);
  report.checks.collectorBuildReceiptMatchesPackage=true;report.checks.staleDocumentRejected=true;report.checks.noPrivateDatabaseOrDraftChanges=true;report.checks.popupDownloadsBoundAnonymousSnapshot=true;
  await control.close();await page.close();
  assert.deepEqual(report.browserErrors,[],'capture fixture and formal frames must complete without script errors');
  report.checks.captureAndFramesWithoutScriptErrors=true;
 }
 // Product states use the same installed MV3 and native observation path.
 // These pixels are offline reconstruction, never real-account acceptance.
 if(process.argv.includes('--product-states-only')){
  report.productStates=[];
  for(const scene of ['empty','ordinary','project','project-narrow']){
   page=await context.newPage();await page.setViewportSize({width:scene==='project-narrow'?785:1440,height:1000});
   await page.addInitScript(({scene,materialize})=>{
    if(window!==window.top)return;
    document.addEventListener('DOMContentLoaded',()=>{
     if(scene==='empty')document.querySelector('#list').replaceChildren();
     else {
      (0,eval)('('+materialize+')')(Array(13).fill(true));
      // Offline bounded-row geometry: titles cannot wrap over the next row.
      // This is fixture layout, not a claim about private native CSS values.
      const style=document.createElement('style');style.textContent='#list [role="group"]{display:flex;height:30px;align-items:center}#list a{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#list button{flex:none}';document.head.append(style);
     }
    },{once:true});
   },{scene,materialize:materializeHistoryStructure.toString()});
   await page.goto(origin+(scene.startsWith('project')?'/g/'+P+'/project':'/'));
   const formal=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]');
   await page.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_workspace"]')?.matches(':popover-open'),null,{timeout:15000});
   if(scene==='empty')await formal.getByText('从一次聊天开始',{exact:true}).waitFor();
   else if(scene.startsWith('project'))await formal.getByRole('link',{name:'Native B',exact:true}).first().waitFor();
   else await formal.getByRole('link',{name:'Known latest fixture',exact:true}).first().waitFor();
   if(scene!=='empty')await page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]').getByRole('button',{name:'查找已知项目与聊天',exact:true}).waitFor({timeout:10000});
   if(scene!=='empty'){const side=page.frames().find(f=>f.url().endsWith('/sidebar.html'));assert.equal(await side.evaluate(()=>{const root=[...document.querySelectorAll('*')].find(n=>n.shadowRoot)?.shadowRoot;return getComputedStyle(root.querySelector('.themes')).overscrollBehaviorY;}),'contain');}
   const f=page.frames().find(f=>f.url().endsWith('/workspace.html'));
   const metrics=await f.evaluate(()=>{const root=[...document.querySelectorAll('*')].find(n=>n.shadowRoot)?.shadowRoot;
    const workspace=root.querySelector('.workspace'),cards=[...root.querySelectorAll('.card')];
    return {cards:cards.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,radius:getComputedStyle(n).borderRadius})),width:workspace.clientWidth,overflow:workspace.scrollWidth>workspace.clientWidth,rows:root.querySelectorAll('[data-ref-id]').length,text:root.textContent};});
   assert(!metrics.overflow);assert.equal(metrics.cards.length,scene.startsWith('project')?1:0);assert(metrics.cards.every(c=>c.width<=357&&c.radius==='13px'));
   assert(!metrics.text.includes('每页')&&!metrics.text.includes('上次确认'));
   const image=join(dir,'formal-'+scene+'.png');await page.screenshot({path:image});
   report.productStates.push({scene,image,metrics:{...metrics,text:undefined},evidence:'ISOLATED_FORMAL_MV3_NOT_REAL_ACCOUNT'});
   if(scene==='ordinary'){
    const control=await context.newPage();await control.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();
    assert.equal((await control.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}))).ok,true);
    await formal.getByRole('link',{name:'Known latest fixture',exact:true}).first().waitFor();
    const more=formal.getByRole('button',{name:'显示更多其他已知聊天',exact:true});
    // Existing row-window pagination is exercised without inventing extra records.
    await more.waitFor();await more.click();
    await formal.getByRole('link',{name:'Known fixture 12',exact:true}).waitFor();
    report.productStates.at(-1).allKnownRowsReachable=true;
    const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'));
    // Await the existing durable SAVE receipt, not a guessed debounce sleep.
    const saved=async()=>worker.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('vaiwl-b1-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views'),q=tx.objectStore('b23_views').getAll();tx.oncomplete=()=>resolve(q.result.some(r=>r.payload?.value?.capacities?.some(([k,n])=>k==='workspace|frame-row:[null,\"unknown\",0,0,0]'&&n===17)));tx.onabort=()=>reject(tx.error);});}finally{db.close();}});
    let expanded=false;for(let i=0;i<40;i++){if(await saved()){expanded=true;break;}await page.waitForTimeout(50);}
    assert(expanded,'expanded row window is saved through WorkspaceRepository/CAS');
    await page.reload();await formal.getByRole('link',{name:'Known latest fixture',exact:true}).first().waitFor();
    assert.equal((await control.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}))).mode,'locked');
    assert.equal(await formal.getByRole('link',{name:'Known fixture 12',exact:true}).count(),0,'locked new document cannot restore private layout');
    assert.equal((await control.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}))).ok,true);
    await formal.getByRole('link',{name:'Known fixture 12',exact:true}).waitFor();
    report.productStates.at(-1).privateExpandedRowsRestoreAfterExplicitBinding=true;
    await control.close();
   }
   await page.close();
  }
 }
 // Two explicit partial-order counterexamples, not claimed real event timings.
 // Reuse formal Browser-Local owner/UI; do not inject business records or ACKs.
 if(process.argv.includes('--progressive-only'))for(const [index,order] of progressiveOrders.entries()){
  const newId=['66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777'][index];
  const progressive=await context.newPage();page=progressive;
  await progressive.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",'+prepareHistoryRun.toString()+',{once:true});'});
  await progressive.goto(origin+'/');
  await progressive.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
  const control=await context.newPage();await control.goto('chrome-extension://'+id+'/status.html');await progressive.bringToFront();
  assert.equal((await control.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}))).ok,true);
  const formal=progressive.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]');
  await formal.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});
  await progressive.getByRole('button',{name:'返回原生阅读',exact:true}).click();
  await progressive.evaluate(addPendingChat);
  const promote=()=>progressive.evaluate(promotePendingChat,{id:newId});
  const navigate=()=>progressive.evaluate(enterStableChat,{html:observedDesktopHTML(newId),id:newId});
  if(order==='route-first'){await navigate();await promote();}else{await promote();await navigate();}
  await progressive.getByRole('button',{name:'返回工作空间',exact:true}).waitFor({timeout:15000});
  assert.equal(await progressive.locator('textarea').inputValue(),'fixture draft');
  await progressive.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await formal.locator('a[href="'+origin+'/c/'+newId+'"]').first().waitFor({timeout:15000});
  await formal.getByText('其他已知聊天',{exact:true}).first().waitFor();
  assert.equal((await control.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}))).mode,'personal');
  const w=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'));
  const passiveOnly=await w.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('vaiwl-b1-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
   try{return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>{const data=JSON.stringify(q.result);resolve(!data.includes('"sentAt":')&&!data.includes('observed-self-send'));};tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  });assert(passiveOnly,'navigation and stable ID do not manufacture a send/ACK');
  report.checks['homePendingStableChatReorder-'+order]=true;
  await control.close();await progressive.close();
 }
 if(process.argv.includes('--history-ready-only')){
  // Keep the real MV3 preparation closed through its original deadline. A
  // later complete run earns the existing one-shot reading recovery only.
  const delayed=await context.newPage();page=delayed;
  await delayed.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",()=>{('+prepareHistoryRun.toString()+')();('+insertHistoryGap.toString()+')();},{once:true});'});
  await delayed.goto(origin+'/');
  await delayed.waitForFunction(()=>document.documentElement.dataset.vaiwlStartup==='layout-failed',null,{timeout:10000});
  assert.equal(await delayed.locator('iframe[src^="chrome-extension://"]').count(),0);
  for(let n=0;n<3;n++){await delayed.locator('#fixture-history-gap').evaluate((row,n)=>row.textContent='Native pending '+n,n);await delayed.waitForTimeout(100);}
  assert.equal(await delayed.locator('iframe[src^="chrome-extension://"]').count(),0,'unsafe mutations must not mount or spend late recovery');
  await delayed.evaluate(clearHistoryGap);
  await delayed.getByRole('button',{name:'返回工作空间',exact:true}).waitFor({timeout:15000});
  assert.equal(await delayed.locator('[data-va-owned]:popover-open').count(),0,'late proof restores reading without taking native input');
  assert.equal(await delayed.locator('textarea').inputValue(),'fixture draft');
  await delayed.getByRole('button',{name:'返回工作空间',exact:true}).click();
  const formal=delayed.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]');
  await formal.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:10000});
  await formal.getByRole('link',{name:'Native reordered',exact:true}).first().waitFor({timeout:10000});
  const w=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'));
  const control=await context.newPage();await control.goto('chrome-extension://'+id+'/status.html');await delayed.bringToFront();
  assert.equal((await control.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}))).mode,'locked','late layout cannot confirm a new document');
  // The progressive cases deliberately created a private database earlier.
  // Its existence is not a current unlock; old private-only rows must stay out.
  if(process.argv.includes('--progressive-only')){
   for(const privateId of ['66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777'])assert.equal(await formal.locator('a[href="'+origin+'/c/'+privateId+'"]').count(),0);
  }else assert.deepEqual(await w.evaluate(async()=>await indexedDB.databases()),[]);
  await control.close();
  report.checks.lateHistoryFullProofRestoresReadingThenFormalUI=true;
  report.checks.historyRecoveryPreservesDraftAndPrivateLock=true;
  await delayed.close();
 }
 if(process.argv.includes('--entry-receipt-only')){
  const target=await context.newPage(),control=await context.newPage();await control.goto('chrome-extension://'+id+'/status.html');
  for(const route of ['/', '/g/'+P+'/project']){
   await target.goto(origin+route);await target.bringToFront();
   await target.waitForFunction(()=>document.documentElement.dataset.vaiwlBoot==='loaded');
   const result=await control.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true}),frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});const options={documentId:frame.documentId};return {boot:await chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_BOOT'},options),status:await chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_STATUS'},options)};});
   assert.equal(result.boot.stage,'module-loaded');assert.match(result.boot.build,/^[a-f0-9]{64}$/);assert.equal(result.status.v,1);assert.equal(typeof result.status.state,'string');
  }
  report.checks.homeAndProjectHardNavigationReceiverSurvives=true;
  await control.close();await target.close();
 }
 if(process.argv.includes('--mixed-history-only')){
  page=await context.newPage();
  const markers=historyStructure.report.snapshots[0].rows.map(r=>r[3]);
  // Preserve the observed anonymous row order. Empty inline descendants are
  // an offline amplifier, not a claim about private DOM: force the existing
  // 256-node traversal to yield across the formal popover opening.
  await page.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",()=>{if(window!==window.top||location.protocol!=="http:")return;('+materializeHistoryStructure.toString()+')('+JSON.stringify(markers)+');for(const a of document.querySelectorAll("#list a")){const span=document.createElement("span");for(let i=0;i<30;i++)span.append(document.createElement("span"));a.append(span);}},{once:true});'});
  await page.goto(origin+'/');
  await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:10000});
  const formal=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]');
  await formal.getByRole('link',{name:'Known latest fixture',exact:true}).first().waitFor({timeout:10000});
  // A failed candidate read must not be mistaken for an empty successful page.
  await formal.locator('[data-vaiwl-candidate-root]').waitFor({state:'attached',timeout:10000});
  assert.equal(await formal.getByText('加载未完成，请重试。',{exact:true}).count(),0,'locked immediate scope completes the candidate bridge');
  const control=await context.newPage();await control.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();
  const local=await control.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}));
  assert.equal(local.mode,'locked');
  const snapshot=await control.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'pipeline'}));
  assert.equal(snapshot.ok,true);assert(validLocalPipeline(snapshot.pipeline));
  assert.equal(snapshot.pipeline.storage,'session');assert.equal(snapshot.pipeline.refs,13);
  assert.equal(snapshot.pipeline.lastWorkspaceDelivery.inventory[1],13);
  assert.equal(snapshot.pipeline.lastWorkspaceDelivery.unknown[0],13);
  assert.equal(snapshot.pipeline.workspaceReceipt.phase,'rendered');
  assert(snapshot.pipeline.workspaceReceipt.rows>0);
  const startup=await control.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});return chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_BOOT'},{documentId:frame.documentId});});
  assert.equal(startup.stage,'module-loaded');assert.match(startup.build,/^[a-f0-9]{64}$/);
  report.checks.currentDocumentBootAndActualRendererReceipt=true;
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'));
  assert.deepEqual(await worker.evaluate(()=>indexedDB.databases()),[],'locked pipeline does not open the private database');
  report.checks.currentLocalStoreAndWorkspaceReplyCountsAgree=true;
  await control.close();
  const proof=await page.evaluate(()=>{
   const rows=[...document.querySelector('#list').children],sidebar=document.querySelector('[data-va-owned][id$="_sidebar"]'),box=sidebar.getBoundingClientRect();
   return {masked:rows.map((r,i)=>r.hasAttribute('data-va-mask-sidebar')?i:-1).filter(i=>i>=0),native:rows.filter((_,i)=>i<3||i>14).every(row=>getComputedStyle(row).visibility==='visible'),maskedHidden:rows.slice(3,15).every(row=>getComputedStyle(row).visibility==='hidden'),sidebarClosed:!sidebar.matches(':popover-open'),draft:document.querySelector('textarea').value==='fixture draft'};
  });assert.deepEqual(proof,{masked:Array.from({length:12},(_,i)=>i+3),native:true,maskedHidden:true,sidebarClosed:false,draft:true});
  const sidebarFrame=page.frames().find(f=>f.url()==='chrome-extension://'+id+'/sidebar.html');
  const sidebarUI=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
  await sidebarUI.getByRole('button',{name:'其他已知聊天',exact:true}).click();
  await sidebarUI.getByRole('button',{name:'显示更多其他已知聊天',exact:true}).click();
  await sidebarUI.getByRole('link',{name:'Known fixture 14',exact:true}).waitFor();
  const fit=await sidebarFrame.evaluate(()=>{
   const root=[...document.querySelectorAll('*')].find(n=>n.shadowRoot)?.shadowRoot,nav=root.querySelector('.themes'),head=root.querySelector('.toolbar'),foot=root.querySelector('.sidebar-footer');
   const bounds=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
   const before=nav.scrollTop;nav.scrollTop=nav.scrollHeight;const scrollable=nav.scrollTop>before;nav.scrollTop=before;
   return {height:innerHeight,nav:bounds(nav),head:bounds(head),foot:bounds(foot),scrollable};
  });
  assert(fit.nav.height>=44&&fit.head.top>=0&&fit.foot.bottom<=fit.height+1);assert(fit.scrollable);
  // Clipping below the declared usable size releases only the sidebar; growing
  // the same scrollport restores it without changing workspace identity.
  const core=await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle();
  await page.evaluate(()=>{document.querySelector('nav').style.cssText+=';height:280px;overflow:hidden';});
  await page.waitForFunction(()=>!document.querySelector('[data-va-owned][id$="_sidebar"]').matches(':popover-open'));
  assert(await core.evaluate(n=>n.isConnected&&n.parentElement.matches(':popover-open')));
  await page.evaluate(()=>document.querySelector('nav').style.cssText='');
  await page.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_sidebar"]').matches(':popover-open'));await core.dispose();
  report.checks.sidebarInternalScrollAndClippedRegionRecovery=true;
  // Sidebar uncertainty surrenders only that role, never the independent workspace.
  await page.evaluate(()=>{const n=document.createElement('button');n.id='fixture-overlap';n.textContent='Unknown overlap';const b=document.querySelector('[data-va-owned][id$="_sidebar"]').getBoundingClientRect();n.style.cssText='position:fixed;left:'+b.x+'px;top:'+(b.y+5)+'px;width:30px;height:20px';document.querySelector('nav').append(n);});
  await page.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_workspace"]')?.matches(':popover-open')&&!document.querySelector('[data-va-owned][id$="_sidebar"]')?.matches(':popover-open'),null,{timeout:5000});
  await formal.getByRole('link',{name:'Known latest fixture',exact:true}).first().waitFor();
  assert.equal(await page.locator('#fixture-overlap').isVisible(),true);
  assert.equal(await page.locator('textarea').inputValue(),'fixture draft');
  report.checks.safeMixedRunFullSidebar=true;report.checks.realAnonymousMixedRowsFormalWorkspace=true;report.checks.unknownRowsAndOtherRunRemainNative=true;
  report.checks.discoveryIndependentOfMaskRun=true;report.checks.unknownOverlapOnlySurrendersSidebar=true;
  report.checks.multiPageCandidatesSurviveOwnedPresentation=true;
  await page.close();
 }
 if(process.argv.includes('--history-diagnostic-only')){
  page=await context.newPage();
  await page.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",()=>{('+prepareHistoryRun.toString()+')();('+insertHistoryGap.toString()+')();},{once:true});'});
  await page.goto(origin+'/');
  await page.waitForFunction(()=>document.documentElement.dataset.vaiwlStartup==='layout-failed',null,{timeout:10000});
  const control=await context.newPage();await control.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();
  await control.waitForSelector('#history-structure-report',{state:'attached'});
  await control.evaluate(()=>{document.querySelector('details').open=true;document.querySelector('details button').click();});
  await control.waitForFunction(()=>document.querySelector('#history-structure-report').textContent.startsWith('{'),null,{timeout:10000});
  const result=JSON.parse(await control.locator('#history-structure-report').textContent());
  assert.equal(result.state,'complete',JSON.stringify(result));assert.equal(result.report.reason,'complete');
  assert(result.report.snapshots.some(s=>s.phase==='preparation'&&s.rows.length===3&&s.rows[0][3]&&!s.rows[1][3]&&s.rows[2][3]));
  assert(!JSON.stringify(result).includes('Native'));assert(!JSON.stringify(result).includes(B));
  await control.reload();await control.waitForSelector('#history-structure-report',{state:'attached'});
  assert.equal(await control.locator('details button').isDisabled(),true);
  const saved=JSON.parse(await control.locator('#history-structure-report').textContent());assert.equal(saved.state,'spent');assert.deepEqual(saved.report,result.report);
  const w=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'));
  assert.deepEqual(await w.evaluate(()=>indexedDB.databases()),[]);
  assert.equal(await page.locator('textarea').inputValue(),'fixture draft');
  report.checks.historyDiagnosticPrivateSenderAndDurableOnce=true;
  report.checks.historyDiagnosticAnonymousGapPreparation=true;
  report.checks.historyDiagnosticNoPrivateDatabaseOrDraftChange=true;
  await control.close();await page.close();
 }
 if(!process.argv.includes('--mount-recovery-only')&&!process.argv.includes('--instant-recovery-only')&&!process.argv.includes('--flow-only')&&!process.argv.includes('--sidebar-composition-only')&&!process.argv.includes('--sidebar-capture-only')&&!process.argv.includes('--entry-receipt-only')&&!process.argv.includes('--progressive-only')&&!process.argv.includes('--history-ready-only')&&!process.argv.includes('--history-diagnostic-only')&&!process.argv.includes('--mixed-history-only')&&!process.argv.includes('--product-states-only')){
 // Row reorder reproves only the sidebar mask; workspace identity survives.
 const reordered=await context.newPage();await reordered.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",'+prepareHistoryRun.toString()+',{once:true});'});
 await reordered.goto(origin+'/c/'+B);
 await reordered.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 const priorHistoryFrame=await reordered.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle();
 await reordered.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await reordered.evaluate(reorderHistory);
 await reordered.waitForFunction(node=>node.isConnected,priorHistoryFrame,{timeout:10000});
 await reordered.getByRole('button',{name:'返回工作空间',exact:true}).waitFor({timeout:15000});
 assert.equal(await reordered.locator('textarea').inputValue(),'fixture draft');
 assert.equal(await reordered.locator('[data-va-owned][id$="_workspace"]:popover-open').count(),0,'recovery preserves native reading');
 await reordered.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_sidebar"]')?.matches(':popover-open'));
 await reordered.getByRole('button',{name:'返回工作空间',exact:true}).click();
 await reordered.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]').getByRole('link',{name:'Native reordered',exact:true}).waitFor({timeout:10000});
 report.checks.nativeHistoryReorderReplacesStaleMaskAndRestoresFormalUI=true;
 await reordered.close();
 // Sidebar absence and late Project members cannot prevent workspace startup.
 for(const lateRoute of ['conversation','project','project-rows']){
 const delayed=await context.newPage();page=delayed;report.activeScenario=lateRoute;await delayed.addInitScript(lateRoute=>{
  if(window!==window.top)return;
  document.addEventListener('DOMContentLoaded',()=>{
   if(lateRoute==='project-rows'){const list=document.querySelector('#project-panel ol'),rows=[...list.children];list.replaceChildren(Object.assign(document.createElement('li'),{textContent:'Loading'}));const button=document.createElement('button');button.textContent='Reveal fixture sidebar';button.onclick=()=>{list.replaceChildren(...rows);button.remove();};document.body.append(button);return;}
   const list=document.querySelector('nav:not([data-app-navigation-rail]) [data-app-action-sidebar-section] > div > div[aria-hidden]:has([data-sidebar-chatgpt-conversation-key])');
   if(!list)throw Error('fixture-history-missing');const marker=document.createComment('delayed-native-history');list.replaceWith(marker);
   const button=document.createElement('button');button.textContent='Reveal fixture sidebar';button.onclick=()=>{marker.replaceWith(list);button.remove();};document.body.append(button);
  },{once:true});
 },lateRoute);
 await delayed.goto(origin+(lateRoute.startsWith('project')?'/g/'+P+'/project':'/c/'+B));
 await delayed.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_workspace"]')?.matches(':popover-open'),null,{timeout:10000});
 await delayed.getByRole('button',{name:'Reveal fixture sidebar',exact:true}).click();
 if(await delayed.getByRole('button',{name:'返回工作空间',exact:true}).isVisible())await delayed.getByRole('button',{name:'返回工作空间',exact:true}).click();
 await delayed.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]').getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:10000});
 report.checks[lateRoute==='project-rows'?'lateProjectRowsStartWithoutReload':lateRoute==='project'?'lateProjectSidebarStartsWithoutReload':'lateNativeSidebarStartsWithoutReload']=true;await delayed.close();
 }
 // A Project layout failure must not disable later supported SPA routes.
 const failedProject=await context.newPage();page=failedProject;report.activeScenario='missing-project-panel';await failedProject.addInitScript(()=>window===window.top&&document.addEventListener('DOMContentLoaded',()=>document.querySelector('#project-panel')?.remove(),{once:true}));
 await failedProject.goto(origin+'/g/'+P+'/project');
 await failedProject.waitForFunction(()=>document.documentElement.dataset.vaiwlStartup==='surface-failed',null,{timeout:10000});
 assert.equal(await failedProject.locator('[data-va-owned]').count(),0);
 await failedProject.getByRole('button',{name:'Native search',exact:true}).click();await failedProject.waitForURL(origin+'/');
 await failedProject.getByRole('button',{name:'返回工作空间',exact:true}).waitFor({timeout:15000});
 assert.equal(await failedProject.locator('[data-va-owned][id$="_workspace"]:popover-open').count(),0);
 assert.equal(await failedProject.locator('textarea').inputValue(),'fixture draft');
 report.checks.failedProjectToNativeHomeRecoversWithoutReload=true;await failedProject.close();
 page=await context.newPage();report.browserErrors=[];page.on('pageerror',error=>{if(report.browserErrors.length<10)report.browserErrors.push(error.message);});await page.goto(origin+'/g/'+P+'/project');
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 const workspace=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]'),sidebar=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
 await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor({timeout:10000});
 assert.equal(await page.locator('#draft').inputValue(),'fixture draft');report.checks.projectAndMembersInFormalUI=true;
 await page.locator('#draft').focus();
 await page.waitForFunction(()=>!document.querySelector('[data-va-owned][id$="_workspace"]')?.matches(':popover-open')&&document.querySelector('[data-va-owned][id$="_sidebar"]')?.matches(':popover-open'));
 assert.equal(await page.locator('#draft').inputValue(),'fixture draft');
 await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).waitFor();
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
 await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor();
 report.checks.nativeComposerKeepsContinuousSidebar=true;
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await page.getByRole('button',{name:'显示原生列表',exact:true}).click();
 await page.evaluate(()=>dispatchEvent(new Event('resize')));
 await page.waitForTimeout(150);
 assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0,'explicit native list must remain available');
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);
 report.checks.nativeListUserChoiceSurvivesGeometry=true;

 const workspaceNode=await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle();
 await page.locator('iframe[src="chrome-extension://'+id+'/sidebar.html"]').evaluate(n=>n.remove());
 await page.waitForTimeout(150);
 assert(await workspaceNode.evaluate(n=>n.isConnected&&n.parentElement.matches(':popover-open')));
 await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor();
 await page.evaluate(()=>dispatchEvent(new Event('resize')));
 await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).waitFor({timeout:10000});
 assert(await workspaceNode.evaluate(n=>n.isConnected));await workspaceNode.dispose();
 report.checks.sidebarFrameLossRejoinsWithoutReplacingWorkspace=true;

 await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();await workspace.getByRole('searchbox',{name:'已知聊天查找输入'}).fill('Native B');
 const opened=context.waitForEvent('page');await workspace.getByRole('link',{name:'Native B',exact:true}).click();const chat=await opened;await chat.waitForURL(origin+'/c/'+B);assert.equal(await chat.evaluate(()=>opener),null);await chat.close();assert.equal(await page.locator('#draft').inputValue(),'fixture draft');report.checks.nativeOpenPreservesDraft=true;
 const back=page.getByRole('button',{name:'返回工作空间',exact:true});if(await back.isVisible())await back.click();
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await back.waitFor();await back.focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);report.checks.uniqueReturn=true;
 assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'IFRAME','keyboard return must carry focus into the workspace, not drop it to native body');
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'IFRAME','next Tab stays in formal workspace');report.checks.keyboardReturnKeepsFocus=true;
 let worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'));assert(worker);
 assert.deepEqual(await worker.evaluate(async()=>await indexedDB.databases()),[]);report.checks.noDatabaseOpened=true;
 await page.reload();await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor({timeout:15000});report.checks.reloadRediscoversVisibleObjects=true;
 await page.goto(origin+'/c/'+B);await workspace.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});assert.equal(await workspace.getByText('Native Project',{exact:true}).count(),0);report.checks.replacementDoesNotExposeOldProject=true;
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await back.waitFor();await back.click();await workspace.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});report.checks.longChatReadingReturn=true;
 // Keep the same formal surfaces alive across document/UI renewal, not merely
 // long enough for the initial render to appear.
 const longMount=await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle();
 for(let at=0;at<60;at++){
  await new Promise(resolve=>setTimeout(resolve,1000));
  assert.equal(await page.locator('[data-va-owned]:popover-open').count(),2,'long-chat presentation lost during renewal at '+at);
  assert.equal(await longMount.evaluate(node=>node.isConnected),true,'original frame must not be silently replaced');
 }
 await longMount.dispose();report.checks.longChatRenewalContinuity=true;

 const popup=await context.newPage();await popup.goto('chrome-extension://'+id+'/status.html');
 await page.goto(origin+'/g/'+P+'/project');await page.bringToFront();await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor({timeout:15000});
 const unlock=()=>popup.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}));
 const unlocked=await unlock();assert.equal(unlocked.ok,true,JSON.stringify(unlocked));await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor({timeout:15000});
 const descriptor=await worker.evaluate(async()=> (await chrome.storage.local.get('vaiwl-browser-local-personal-v1'))['vaiwl-browser-local-personal-v1']);assert(descriptor?.spaceId);
 const roots=()=>worker.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('vaiwl-b1-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});}finally{db.close();}});
 const stored=await roots();assert.equal(stored.length,1);assert.deepEqual(JSON.parse(stored[0]),['vaiwl-local-v1','browser-local','personal',descriptor.spaceId]);report.checks.explicitBindingUsesExistingIDBInSeparateNamespace=true;
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await page.locator('#project-panel a[href="/c/'+B+'"]').click();await page.waitForURL(origin+'/c/'+B);await back.waitFor({timeout:15000});await back.click();
 await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});
 assert.deepEqual(await roots(),stored);report.checks.trustedSameDocumentNavigationRetainsPersonalSpace=true;
 const localHints=await worker.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('vaiwl-b1-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}});
 report.localUseObserved=JSON.stringify(localHints).includes('local-recent-use');assert(report.localUseObserved);
 // Exercise the same installed formal UI; no business-state/grant injection.
 const assertPersonal=async()=>assert.equal((await popup.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}))).mode,'personal');
 await popup.bringToFront();await page.bringToFront();await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});await assertPersonal();
 report.checks.tabFocusKeepsBinding=true;
 // Native modal hides the background without replacing its document or roots.
 // Keep the real installed frames/owner alive through several renewal windows.
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await back.waitFor();
 const modalFrame=await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle();
 await page.evaluate(setNativeModal,true);
 for(let at=0;at<25;at++){await new Promise(r=>setTimeout(r,1000));assert.equal(await modalFrame.evaluate(node=>node.isConnected),true,'native modal must not destroy the bound frame');assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);}
 await assertPersonal();
 await page.evaluate(()=>{document.querySelector('#fixture-native-modal').remove();for(const node of [document.querySelector('main'),document.querySelector('nav')]){node.removeAttribute('aria-hidden');node.inert=false;}});
 await back.waitFor({timeout:10000});assert.equal(await page.locator('[data-va-owned][id$="_workspace"]:popover-open').count(),0);
 await page.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_sidebar"]')?.matches(':popover-open'));await back.click();
 await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:10000});await assertPersonal();assert.equal(await modalFrame.evaluate(node=>node.isConnected),true);await modalFrame.dispose();
 report.checks.nativeModalAcrossRenewalRestoresReadingSidebarAndReturn=true;

 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await page.getByRole('button',{name:'Native search',exact:true}).click();await page.waitForURL(origin+'/');await back.waitFor({timeout:15000});await back.click();
 await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});await assertPersonal();report.checks.nativeSearchAndUnplannedSpaKeepsBinding=true;

  const lifecycle=await context.newCDPSession(page),versions=[];
 lifecycle.on('ServiceWorker.workerVersionUpdated',event=>versions.push(...event.versions));await lifecycle.send('ServiceWorker.enable');
 const version=async(predicate)=>{const end=Date.now()+10000;while(Date.now()<end){const found=versions.find(predicate);if(found)return found;await new Promise(r=>setTimeout(r,50));}throw Error('worker-version-timeout');};
 const running=await version(v=>v.scriptURL==='chrome-extension://'+id+'/extension/worker.mjs'&&v.runningStatus==='running');
 const oldWorkerFrames=page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id+'/'));
 const offset=versions.length;await lifecycle.send('ServiceWorker.stopWorker',{versionId:running.versionId});
 await version((v,i)=>i>=offset&&v.versionId===running.versionId&&v.runningStatus==='stopped');report.checks.actualWorkerStopped=true;
 await popup.bringToFront();await page.bringToFront();
 await version((v,i)=>i>=offset&&v.runningStatus==='running'&&v.scriptURL===running.scriptURL);
 worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'));
 // Keep the pre-interruption presentation. Use the existing return only if
 // recovery is in reading mode, never synthesize a second entry.
 const replacedUntil=Date.now()+15000;while(!oldWorkerFrames.every(f=>f.isDetached())&&Date.now()<replacedUntil)await new Promise(r=>setTimeout(r,50));
 assert(oldWorkerFrames.every(f=>f.isDetached()),'worker recovery needs fresh UI documents');
 if(await back.isVisible())await back.click();
 await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});await assertPersonal();
 report.checks.workerRestartSameDocumentNoConfirmation=true;
 assert.equal(await page.locator('textarea').inputValue(),'fixture draft');report.checks.workerRecoveryPreservesDraft=true;
 // Native account control is a risk boundary. It is a fixture button, never a
 // real account action; the production capture handler must revoke the binding.
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await page.evaluate(()=>{const button=document.createElement('button');button.setAttribute('aria-label','切换账户');button.id='account-risk';button.textContent='Account';document.querySelector('#heading').append(button);});
 await page.locator('#account-risk').click();
 await popup.bringToFront();await page.bringToFront();
 await workspace.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});
 assert.equal(await workspace.getByText('Native Project',{exact:true}).count(),0);assert.equal((await popup.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}))).mode,'locked');
 assert.deepEqual(await worker.evaluate(async()=> (await chrome.storage.session.get('vaiwl-browser-local-continuity-v1'))['vaiwl-browser-local-continuity-v1'].rows),[]);
 report.checks.accountRiskClearsContinuityAndPrivateProjection=true;


 await page.goto(origin+'/c/'+B);await workspace.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});assert.equal(await workspace.getByText('Native Project',{exact:true}).count(),0);
 assert.equal((await unlock()).ok,true);await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});report.checks.explicitUnlockRestoresKnownProject=true;
 await page.reload();await workspace.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});assert.equal(await workspace.getByText('Native Project',{exact:true}).count(),0);assert.deepEqual(await roots(),stored);report.checks.refreshLocksButPreservesPersonalCache=true;
 assert.equal((await unlock()).ok,true);await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});
 await sidebar.getByRole('button',{name:'折叠主题导航',exact:true}).click();
 await page.waitForTimeout(350);
 const savedLayout=await worker.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('vaiwl-b1-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views'),q=tx.objectStore('b23_views').getAll();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}});
 assert(JSON.stringify(savedLayout).includes('"sidebarVisible":false'));
 await popup.close();await context.close();context=await launch();
 const cdpRestart=await context.browser().newBrowserCDPSession(),restored=await cdpRestart.send('Extensions.loadUnpacked',{path:built.unpacked});assert.equal(restored.id,id);
 page=await context.newPage();report.browserErrors=[];page.on('pageerror',error=>{if(report.browserErrors.length<10)report.browserErrors.push(error.message);});await page.goto(origin+'/c/'+B);
 const reopened=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]');await reopened.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});assert.equal(await reopened.getByText('Native Project',{exact:true}).count(),0);
 const status=await context.newPage();await status.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();
 const restoredBinding=await status.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}));assert.equal(restoredBinding.ok,true,JSON.stringify(restoredBinding));await reopened.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});report.checks.browserRestartLocksAndExplicitUnlockRestores=true;
 const restoredSidebar=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
 await restoredSidebar.getByRole('button',{name:'折叠主题导航',exact:true}).waitFor({timeout:10000});
 assert(await restoredSidebar.locator('nav[aria-label="VAIWL 主题导航"]').evaluate(n=>n.hidden));
 report.checks.persistedPrivateLayoutRestoresAfterExplicitNewDocumentBinding=true;

 // Actual uninstall of this isolated package, after its continuous private
 // journey. Never apply this operation to the user's installed extension.
 const privateFrames=page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id+'/'));
 assert(privateFrames.length>0);const draftBefore=await page.locator('textarea').inputValue();
 await cdpRestart.send('Extensions.uninstall',{id});
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:10000});
 for(const frame of privateFrames)if(!frame.isDetached()){
  const privateText=await frame.evaluate(()=>[document.body?.textContent??'',...[...document.querySelectorAll('*')].filter(n=>n.shadowRoot).map(n=>n.shadowRoot.textContent)].join('')).catch(()=>null);
  assert(privateText===null||!privateText.includes('Native Project'),'uninstall must erase private projection');
 }
 assert.equal(await page.locator('textarea').inputValue(),draftBefore);
 await page.locator('textarea').focus();assert(await page.locator('textarea').evaluate(n=>document.activeElement===n));
 assert(await page.evaluate(()=>[...document.querySelectorAll('[data-va-mask-workspace],[data-va-mask-sidebar]')].every(n=>getComputedStyle(n).visibility==='visible'&&!n.inert)));
 report.checks.uninstallReleasesPrivateFramesAndNativeInput=true;

 }
 assert(requests.every(p=>!p.startsWith('/api/')&&!p.startsWith('/backend-api/')));report.checks.noInternalRequests=true;report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;
 // Capture the failing presentation before a diagnostic tab changes native
 // focus, visibility or a pending lifecycle transition. Only fixed structure
 // and lifecycle state are needed to distinguish a return failure on CI.
 try{report.failurePresentation=await page.evaluate(()=>({
  startup:Object.fromEntries([...document.documentElement.attributes].filter(a=>a.name.startsWith('data-vaiwl')).map(a=>[a.name,a.value])),
  visibility:document.visibilityState,focused:document.hasFocus(),active:document.activeElement?.tagName,
  returnControls:[...document.querySelectorAll('[aria-label="返回工作空间"]')].map(n=>({connected:n.isConnected,rect:n.getBoundingClientRect().toJSON(),display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility})),
  flowRoles:[...document.querySelectorAll('[data-va-owned][id$="_workspace"],[data-va-owned][id$="_sidebar"]')].map(n=>({role:n.id.endsWith('_workspace')?'workspace':'sidebar',rect:n.getBoundingClientRect().toJSON(),display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,popover:n.hasAttribute('popover')})),
  exits:[...document.querySelectorAll('[data-va-owned][popover]')].map(n=>({open:n.matches(':popover-open')}))
 }));}catch(snapshotError){report.failurePresentation={error:String(snapshotError)};}
 try{const id=new URL(context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://')).url()).host;const diagnostic=await context.newPage();await diagnostic.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();report.pipeline=await diagnostic.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'pipeline'}));report.layout=await diagnostic.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_LAYOUT'},{frameId:0});});await diagnostic.close();}catch(diagnosticError){report.diagnosticError=String(diagnosticError);}try{report.startup=await page.evaluate(()=>Object.fromEntries([...document.documentElement.attributes].filter(a=>a.name.startsWith('data-vaiwl')).map(a=>[a.name,a.value])));report.presentation=await page.evaluate(()=>({join:document.querySelector("[data-vaiwl-frame-join]")?.getAttribute("data-vaiwl-frame-join"),active:document.activeElement?.tagName,popovers:[...document.querySelectorAll('[data-va-owned][popover]')].map(n=>({open:n.matches(':popover-open'),visibility:getComputedStyle(n).visibility,rect:n.getBoundingClientRect().toJSON()})),roots:[...document.querySelectorAll('[data-va-mask-workspace],[data-va-mask-sidebar]')].map(n=>({visibility:getComputedStyle(n).visibility,display:getComputedStyle(n).display,hidden:n.hidden})),returnCount:document.querySelectorAll('[aria-label="返回工作空间"]').length}));report.frameBodies=await Promise.all(page.frames().filter(f=>f.url().startsWith('chrome-extension://')).map(async f=>({body:await f.locator('body').textContent({timeout:1500}),shadow:await f.evaluate(()=>[...document.querySelectorAll('*')].filter(n=>n.shadowRoot).map(n=>({html:n.shadowRoot.innerHTML.slice(-16000),style:n.getAttribute('style')}))),stage:await f.evaluate(()=>document.documentElement.getAttribute('data-vaiwl-frame-lifecycle'))})));report.page=await page.locator('body').innerText();report.frames=page.frames().map(f=>f.url());const w=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'));report.continuity=await w.evaluate(async()=>{const saved=(await chrome.storage.session.get('vaiwl-browser-local-continuity-v1'))['vaiwl-browser-local-continuity-v1'];const row=saved?.rows?.[0];if(!row)return {rows:saved?.rows?.length??-1};const frame=await chrome.webNavigation.getFrame({tabId:row.tabId,frameId:0});let proof;try{proof=await chrome.tabs.sendMessage(row.tabId,{type:'HOST_LOCAL_CONTINUITY',action:'probe',challenge:'failure-check'},{documentId:row.documentId});}catch{}return {rows:saved.rows.length,documentMatches:frame?.documentId===row.documentId,active:frame?.documentLifecycle==='active',noncePresent:!!proof?.nonce,nonceMatches:proof?.nonce===row.nonce,unexpired:Date.now()<row.expiresAt};});}catch{}process.exitCode=1;}
finally{await context?.close();await new Promise(r=>server.close(r));await guard.close();await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({status:report.status,error:report.error,checks:report.checks,failurePresentation:report.failurePresentation,layout:report.status==='FAIL'?report.layout:undefined,report:join(dir,'report.json')}));
