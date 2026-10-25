import {HOST_BASELINE_VERSION,progressiveOrders,homeMain,longDesktopHTML,observedHomeHTML,prepareHistoryRun,reorderHistory,addPendingChat,promotePendingChat,enterStableChat,setNativeModal,insertHistoryGap,clearHistoryGap} from './fixtures/observed-host-replay.mjs';
/** Actual formal MV3 UI with an empty local memory session; offline host only. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageHost} from '../../extension/package.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
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
 context=await launch();
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 // Two explicit partial-order counterexamples, not claimed real event timings.
 // Reuse formal Browser-Local owner/UI; do not inject business records or ACKs.
 if(process.argv.includes('--progressive-only'))for(const [index,order] of progressiveOrders.entries()){
  const newId=['66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777'][index];
  const progressive=await context.newPage();page=progressive;
  await progressive.addInitScript({content:'document.addEventListener("DOMContentLoaded",'+prepareHistoryRun.toString()+',{once:true});'});
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
  await formal.getByText('归属待核对',{exact:true}).first().waitFor();
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
  await delayed.addInitScript({content:'document.addEventListener("DOMContentLoaded",()=>{('+prepareHistoryRun.toString()+')();('+insertHistoryGap.toString()+')();},{once:true});'});
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
 if(!process.argv.includes('--progressive-only')&&!process.argv.includes('--history-ready-only')){
 // A native row reorder invalidates the old mask; a fresh same-document
 // handshake must prove the current row run before restoring the formal UI.
 const reordered=await context.newPage();await reordered.addInitScript({content:'document.addEventListener("DOMContentLoaded",'+prepareHistoryRun.toString()+',{once:true});'});
 await reordered.goto(origin+'/c/'+B);
 await reordered.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 const priorHistoryFrame=await reordered.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle();
 await reordered.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await reordered.evaluate(reorderHistory);
 await reordered.waitForFunction(node=>!node.isConnected,priorHistoryFrame,{timeout:10000});
 await reordered.getByRole('button',{name:'返回工作空间',exact:true}).waitFor({timeout:15000});
 assert.equal(await reordered.locator('textarea').inputValue(),'fixture draft');
 assert.equal(await reordered.locator('[data-va-owned]:popover-open').count(),0,'recovery preserves native reading');
 await reordered.getByRole('button',{name:'返回工作空间',exact:true}).click();
 await reordered.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]').getByRole('link',{name:'Native reordered',exact:true}).waitFor({timeout:10000});
 report.checks.nativeHistoryReorderReplacesStaleMaskAndRestoresFormalUI=true;
 await reordered.close();
 // A native sidebar absent at first load can appear after the six-second
 // readiness deadline. Its appearance permits one fresh, reading-only startup.
 for(const lateRoute of ['conversation','project','project-rows']){
 const delayed=await context.newPage();await delayed.addInitScript(lateRoute=>{
  document.addEventListener('DOMContentLoaded',()=>{
   if(lateRoute==='project-rows'){const list=document.querySelector('#project-panel ol'),rows=[...list.children];list.replaceChildren(Object.assign(document.createElement('li'),{textContent:'Loading'}));const button=document.createElement('button');button.textContent='Reveal fixture sidebar';button.onclick=()=>{list.replaceChildren(...rows);button.remove();};document.body.append(button);return;}
   const list=document.querySelector('nav:not([data-app-navigation-rail]) [data-app-action-sidebar-section] > div > div[aria-hidden]:has([data-sidebar-chatgpt-conversation-key])');
   if(!list)throw Error('fixture-history-missing');const marker=document.createComment('delayed-native-history');list.replaceWith(marker);
   const button=document.createElement('button');button.textContent='Reveal fixture sidebar';button.onclick=()=>{marker.replaceWith(list);button.remove();};document.body.append(button);
  },{once:true});
 },lateRoute);
 await delayed.goto(origin+(lateRoute.startsWith('project')?'/g/'+P+'/project':'/c/'+B));
 await delayed.waitForFunction(()=>document.documentElement.dataset.vaiwlStartup==='layout-failed',null,{timeout:10000});
 assert.equal(await delayed.locator('iframe[src^="chrome-extension://"]').count(),0);
 await delayed.getByRole('button',{name:'Reveal fixture sidebar',exact:true}).click();
 await delayed.getByRole('button',{name:'返回工作空间',exact:true}).waitFor({timeout:15000});
 assert.equal(await delayed.locator('[data-va-owned]:popover-open').count(),0,'late readiness must not steal native focus');
 await delayed.getByRole('button',{name:'返回工作空间',exact:true}).click();
 await delayed.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]').getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:10000});
 report.checks[lateRoute==='project-rows'?'lateProjectRowsStartWithoutReload':lateRoute==='project'?'lateProjectSidebarStartsWithoutReload':'lateNativeSidebarStartsWithoutReload']=true;await delayed.close();
 }
 // A Project layout failure must not disable later supported SPA routes.
 const failedProject=await context.newPage();await failedProject.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>document.querySelector('#project-panel')?.remove(),{once:true}));
 await failedProject.goto(origin+'/g/'+P+'/project');
 await failedProject.waitForFunction(()=>document.documentElement.dataset.vaiwlStartup==='layout-failed',null,{timeout:10000});
 assert.equal(await failedProject.locator('[data-va-owned]').count(),0);
 await failedProject.getByRole('button',{name:'Native search',exact:true}).click();await failedProject.waitForURL(origin+'/');
 await failedProject.getByRole('button',{name:'返回工作空间',exact:true}).waitFor({timeout:15000});
 assert.equal(await failedProject.locator('[data-va-owned]:popover-open').count(),0);
 assert.equal(await failedProject.locator('textarea').inputValue(),'fixture draft');
 report.checks.failedProjectToNativeHomeRecoversWithoutReload=true;await failedProject.close();
 page=await context.newPage();report.browserErrors=[];page.on('pageerror',error=>{if(report.browserErrors.length<10)report.browserErrors.push(error.message);});await page.goto(origin+'/g/'+P+'/project');
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 const workspace=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]'),sidebar=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
 await workspace.getByRole('link',{name:'Native B',exact:true}).first().waitFor({timeout:10000});
 assert.equal(await page.locator('#draft').inputValue(),'fixture draft');report.checks.projectAndMembersInFormalUI=true;
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
 for(let at=0;at<25;at++){
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
 await back.waitFor({timeout:10000});assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);await back.click();
 await workspace.getByText('Native Project',{exact:true}).first().waitFor({timeout:10000});await assertPersonal();assert.equal(await modalFrame.evaluate(node=>node.isConnected),true);await modalFrame.dispose();
 report.checks.nativeModalAcrossRenewalRestoresOnlyReturn=true;

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
 await popup.close();await context.close();context=await launch();
 const cdpRestart=await context.browser().newBrowserCDPSession(),restored=await cdpRestart.send('Extensions.loadUnpacked',{path:built.unpacked});assert.equal(restored.id,id);
 page=await context.newPage();report.browserErrors=[];page.on('pageerror',error=>{if(report.browserErrors.length<10)report.browserErrors.push(error.message);});await page.goto(origin+'/c/'+B);
 const reopened=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]');await reopened.getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:15000});assert.equal(await reopened.getByText('Native Project',{exact:true}).count(),0);
 const status=await context.newPage();await status.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();
 const restoredBinding=await status.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}));assert.equal(restoredBinding.ok,true,JSON.stringify(restoredBinding));await reopened.getByText('Native Project',{exact:true}).first().waitFor({timeout:15000});report.checks.browserRestartLocksAndExplicitUnlockRestores=true;
 }
 assert(requests.every(p=>!p.startsWith('/api/')&&!p.startsWith('/backend-api/')));report.checks.noInternalRequests=true;report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;try{report.startup=await page.evaluate(()=>Object.fromEntries([...document.documentElement.attributes].filter(a=>a.name.startsWith('data-vaiwl')).map(a=>[a.name,a.value])));report.presentation=await page.evaluate(()=>({join:document.querySelector("[data-vaiwl-frame-join]")?.getAttribute("data-vaiwl-frame-join"),active:document.activeElement?.tagName,popovers:[...document.querySelectorAll('[data-va-owned][popover]')].map(n=>({open:n.matches(':popover-open'),visibility:getComputedStyle(n).visibility,rect:n.getBoundingClientRect().toJSON()})),roots:[...document.querySelectorAll('[data-va-mask-workspace],[data-va-mask-sidebar]')].map(n=>({visibility:getComputedStyle(n).visibility,display:getComputedStyle(n).display,hidden:n.hidden})),returnCount:document.querySelectorAll('[aria-label="返回工作空间"]').length}));report.frameBodies=await Promise.all(page.frames().filter(f=>f.url().startsWith('chrome-extension://')).map(async f=>({body:await f.locator('body').textContent({timeout:1500}),stage:await f.evaluate(()=>document.documentElement.getAttribute('data-vaiwl-frame-lifecycle'))})));report.page=await page.locator('body').innerText();report.frames=page.frames().map(f=>f.url());const w=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'));report.continuity=await w.evaluate(async()=>{const saved=(await chrome.storage.session.get('vaiwl-browser-local-continuity-v1'))['vaiwl-browser-local-continuity-v1'];const row=saved?.rows?.[0];if(!row)return {rows:saved?.rows?.length??-1};const frame=await chrome.webNavigation.getFrame({tabId:row.tabId,frameId:0});let proof;try{proof=await chrome.tabs.sendMessage(row.tabId,{type:'HOST_LOCAL_CONTINUITY',action:'probe',challenge:'failure-check'},{documentId:row.documentId});}catch{}return {rows:saved.rows.length,documentMatches:frame?.documentId===row.documentId,active:frame?.documentLifecycle==='active',noncePresent:!!proof?.nonce,nonceMatches:proof?.nonce===row.nonce,unexpired:Date.now()<row.expiresAt};});}catch{}process.exitCode=1;}
finally{await context?.close();await new Promise(r=>server.close(r));await guard.close();await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({status:report.status,error:report.error,checks:report.checks,report:join(dir,'report.json')}));
