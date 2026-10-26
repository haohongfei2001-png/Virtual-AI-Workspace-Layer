import historyStructure from './fixtures/observed-history-structure.json' with {type:'json'};
import {HOST_BASELINE_VERSION,materializeHistoryStructure,progressiveOrders,homeMain,longDesktopHTML,observedHomeHTML,prepareHistoryRun,reorderHistory,addPendingChat,promotePendingChat,enterStableChat,setNativeModal,insertHistoryGap,clearHistoryGap} from './fixtures/observed-host-replay.mjs';
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
// The native search navigation reaches a home layout, not a conversation DOM
// under a home URL. Use the observed home boundaries while retaining the same
// document, sidebar, draft and unplanned browser-navigation event.
const server=createServer((req,res)=>{requests.push(req.url);res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(req.url==='/g/'+P+'/project'?observedProjectHTML(P,C)+`<script>document.addEventListener('click',e=>{if(e.target.closest('button')?.textContent==='Native search'){document.querySelector('main').innerHTML=${JSON.stringify(homeMain)};history.pushState({},'','/');return;}const a=e.target.closest('a[href]');if(a&&a.getAttribute('href')==='/c/${B}'&&!e.defaultPrevented){e.preventDefault();const next=a.href;const html=new DOMParser().parseFromString(${JSON.stringify(longDesktopHTML(B))},'text/html');document.body.replaceChildren(...html.body.childNodes);for(const style of document.querySelectorAll('head style'))style.remove();document.head.append(...html.head.childNodes);history.pushState({},'',next);}});</script>`:req.url==='/'?observedHomeHTML(B):longDesktopHTML(B));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
const dir=await mkdtemp(join(tmpdir(),'vaiwl-browser-local-mv3-')),built=packageHost(join(dir,'package'),{offlineOrigin:origin,browserLocal:true}),report={status:'RUNNING',evidence:'ISOLATED_MV3_FORMAL_UI_LOCAL_SESSION_AND_PERSONAL',realChatGPT:'NOT_RUN',baseline:HOST_BASELINE_VERSION,package:built,checks:{},requests};
let context,page;
try{
 const launch=async()=>{
 const result=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1000,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Users/hhf/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await result.route('**/*',r=>r.request().url().startsWith(origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 return result;};
 context=await launch();report.browserErrors=[];context.on('page',p=>p.on('pageerror',e=>report.browserErrors.push(e.stack)));
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 if(process.argv.includes('--sidebar-capture-only')){
  // Exercise the production private popup and exact-document message route.
  // The added branch is a declared synthetic completeness sentinel; the
  // separate anonymous replay retains the actually observed outer topology.
  page=await context.newPage();
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
   const nav=document.querySelector('nav'),history=nav.firstElementChild;
   const root=document.createElement('div'),section=document.createElement('section');section.setAttribute('data-app-action-sidebar-section','');
   const toggle=document.createElement('button');toggle.setAttribute('aria-expanded','true');toggle.textContent='PRIVATE_SENTINEL_CONTROL';
   const list=document.createElement('ul'),item=document.createElement('li'),link=document.createElement('a');link.href='/c/66666666-6666-4666-8666-666666666666';link.textContent='PRIVATE_SENTINEL_TITLE';item.append(link);list.append(item);section.append(toggle,list);root.append(section,history);
   // Observed common-parent ancestry is 60 -> 59 -> 21 -> NAV (two wrappers).
   let shell=root;for(let i=0;i<2;i++){const wrap=document.createElement('div');wrap.append(shell);shell=wrap;}nav.append(shell);
  },{once:true}));
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
   assert.match(sample.coverage??'',/COMPLETE_SNAPSHOT/);
   assert(!JSON.stringify(sample.shape.sidebarStructure).includes('PRIVATE_SENTINEL'));
   assert(!JSON.stringify(sample.shape.sidebarStructure).includes('66666666'));
   assert(sample.shape.sidebarStructure.rows.some(r=>r[2]==='A'&&(r[4]&4)));
   const [download]=await Promise.all([control.waitForEvent('download'),control.locator('#save-sidebar-snapshot').click()]);
   const exported=JSON.parse(await readFile(await download.path(),'utf8'));
   assert.equal(download.suggestedFilename(),'vaiwl-sidebar-structure.json');
   assert.equal(exported.build,build);assert.equal(exported.route,index?'project':'home');
   assert.equal(exported.documentBinding,'verified-at-capture-not-account-identity');
   assert.equal(exported.coverage.state,'COMPLETE_SNAPSHOT');
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
 if(!process.argv.includes('--sidebar-capture-only')&&!process.argv.includes('--entry-receipt-only')&&!process.argv.includes('--progressive-only')&&!process.argv.includes('--history-ready-only')&&!process.argv.includes('--history-diagnostic-only')&&!process.argv.includes('--mixed-history-only')&&!process.argv.includes('--product-states-only')){
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
}catch(error){report.status='FAIL';report.error=error.stack;try{const id=new URL(context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://')).url()).host;const diagnostic=await context.newPage();await diagnostic.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();report.pipeline=await diagnostic.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'pipeline'}));report.layout=await diagnostic.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_LAYOUT'},{frameId:0});});await diagnostic.close();}catch(diagnosticError){report.diagnosticError=String(diagnosticError);}try{report.startup=await page.evaluate(()=>Object.fromEntries([...document.documentElement.attributes].filter(a=>a.name.startsWith('data-vaiwl')).map(a=>[a.name,a.value])));report.presentation=await page.evaluate(()=>({join:document.querySelector("[data-vaiwl-frame-join]")?.getAttribute("data-vaiwl-frame-join"),active:document.activeElement?.tagName,popovers:[...document.querySelectorAll('[data-va-owned][popover]')].map(n=>({open:n.matches(':popover-open'),visibility:getComputedStyle(n).visibility,rect:n.getBoundingClientRect().toJSON()})),roots:[...document.querySelectorAll('[data-va-mask-workspace],[data-va-mask-sidebar]')].map(n=>({visibility:getComputedStyle(n).visibility,display:getComputedStyle(n).display,hidden:n.hidden})),returnCount:document.querySelectorAll('[aria-label="返回工作空间"]').length}));report.frameBodies=await Promise.all(page.frames().filter(f=>f.url().startsWith('chrome-extension://')).map(async f=>({body:await f.locator('body').textContent({timeout:1500}),shadow:await f.evaluate(()=>[...document.querySelectorAll('*')].filter(n=>n.shadowRoot).map(n=>({html:n.shadowRoot.innerHTML.slice(-16000),style:n.getAttribute('style')}))),stage:await f.evaluate(()=>document.documentElement.getAttribute('data-vaiwl-frame-lifecycle'))})));report.page=await page.locator('body').innerText();report.frames=page.frames().map(f=>f.url());const w=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'));report.continuity=await w.evaluate(async()=>{const saved=(await chrome.storage.session.get('vaiwl-browser-local-continuity-v1'))['vaiwl-browser-local-continuity-v1'];const row=saved?.rows?.[0];if(!row)return {rows:saved?.rows?.length??-1};const frame=await chrome.webNavigation.getFrame({tabId:row.tabId,frameId:0});let proof;try{proof=await chrome.tabs.sendMessage(row.tabId,{type:'HOST_LOCAL_CONTINUITY',action:'probe',challenge:'failure-check'},{documentId:row.documentId});}catch{}return {rows:saved.rows.length,documentMatches:frame?.documentId===row.documentId,active:frame?.documentLifecycle==='active',noncePresent:!!proof?.nonce,nonceMatches:proof?.nonce===row.nonce,unexpired:Date.now()<row.expiresAt};});}catch{}process.exitCode=1;}
finally{await context?.close();await new Promise(r=>server.close(r));await guard.close();await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({status:report.status,error:report.error,checks:report.checks,report:join(dir,'report.json')}));
