/** Real packaged popup on synthetic observed Project DOM; never a live account. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import {observeTemporaryNativeOpen} from './temporary-native-open-observer.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const origin='https://chatgpt.com',project='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',cid='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',url=origin+'/g/'+project+'/project';
const dir=await mkdtemp(join(tmpdir(),'vaiwl-temporary-project-')),built=packageHost(join(dir,'package'),{observedChatGPTContext:true,temporaryReadOnly:true}),info=verifyHost(built.unpacked),hash=s=>createHash('sha256').update(s).digest('hex');
const build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'))),report={status:'RUNNING',qualification:'TEMPORARY_PROJECT_NAVIGATION_NOT_FREE_ACCEPTED',realChatGPT:'NOT_RUN',sourceHashes:build.sourceHashes,requests:[],checks:{},popupStates:[]};
report.testHashes=Object.fromEntries(await Promise.all(['tests/host/temporary-project-mv3-browser.mjs','tests/host/fixtures/observed-project.mjs','tests/host/fixtures/observed-desktop.mjs','tests/host/temporary-native-open-observer.mjs','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs'].map(async p=>[p,hash(await readFile(p))])));
let guard,browser,context,ws,control,popupTarget,popupSession;const started=performance.now(),closedListeners=new Set(),pending=new Map();
try{
 // No forwarding proxy. Only Playwright's exact synthetic pages are served;
 // worker traffic and any missed route are denied by the separate proxy.
 guard=await createHistoricalNetworkGuard({fixtureOrigin:'http://127.0.0.1:1'});
 browser=await launchNativeVisibilityBrowser({chromium,profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Users/hhf/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});context=browser.context;context.setDefaultTimeout(6000);
 await context.route('**/*',r=>{
  const request=r.request();if(request.url().startsWith('chrome-extension://'))return r.continue();
  report.requests.push({url:request.url(),method:request.method()});
  if(request.url()===url)return r.fulfill({contentType:'text/html',body:observedProjectHTML(project,cid)});
  if(request.url()===origin+'/c/'+other)return r.fulfill({contentType:'text/html',body:observedDesktopHTML(other)});return r.abort();
 });
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'))??await context.waitForEvent('serviceworker');
 await worker.evaluate(()=>{globalThis.temporaryRequestAttempts=[];chrome.webRequest.onBeforeRequest.addListener(d=>{if(temporaryRequestAttempts.length<100)temporaryRequestAttempts.push({path:new URL(d.url).pathname,method:d.method,type:d.type});},{urls:['https://chatgpt.com/*']});});
 const page=await context.newPage();await page.goto(url);await page.evaluate(()=>{globalThis.originalDocument=document;globalThis.originalEditor=document.querySelector('textarea');});
 ws=new WebSocket(browser.debugEndpoint);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});let serial=0;
 ws.addEventListener('message',event=>{const v=JSON.parse(event.data);
  if(v.method==='Target.detachedFromTarget'&&v.params.sessionId===popupSession||v.method==='Target.targetDestroyed'&&v.params.targetId===popupTarget){for(const fn of closedListeners)fn();for(const [id,p]of pending)if(p.sessionId===popupSession){pending.delete(id);clearTimeout(p.timer);p.reject(Object.assign(Error('cdp-target-closed'),{code:'CDP_TARGET_CLOSED'}));}}
  const p=pending.get(v.id);if(p){pending.delete(v.id);clearTimeout(p.timer);v.error?p.reject(Error(v.error.message)):p.resolve(v.result);}
 });
 control={send:(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('cdp-deadline:'+method));},6000);pending.set(id,{resolve,reject,timer,sessionId});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));})};
 await control.send('Target.setDiscoverTargets',{discover:true});
 async function open(){
  // Closing an action popup can leave Linux Chrome without an active window.
  // Restore only this runner's fixture tab before the one user-equivalent open.
  await page.bringToFront();
  const windowState=await worker.evaluate(async fixtureURL=>{
   const tabs=(await chrome.tabs.query({active:true})).filter(tab=>tab.url===fixtureURL);
   if(tabs.length!==1)throw Error('fixture-active-tab-not-unique');
   const window=await chrome.windows.get(tabs[0].windowId);
   if(window.type!=='normal'||window.focused!==true)throw Error('fixture-window-not-focused');
   await chrome.action.openPopup({windowId:window.id});
   return {fixtureTabUnique:true,windowFocused:window.focused,windowType:window.type};
  },url);
  (report.popupOpens??=[]).push({phase:report.phase,...windowState});
  const targets=(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.url==='chrome-extension://'+id+'/status.html');assert.equal(targets.length,1);popupTarget=targets[0].targetId;({sessionId:popupSession}=await control.send('Target.attachToTarget',{targetId:popupTarget,flatten:true}));}
 async function evaluate(expression){const result=await control.send('Runtime.evaluate',{expression:`(()=>{const root=document.querySelector('body>div')?.shadowRoot;${expression}})()`,returnByValue:true,awaitPromise:true},popupSession);if(result.exceptionDetails)throw Error('popup-evaluate');return result.result.value;}
 async function wait(expression){const end=performance.now()+6000;while(performance.now()<end){const result=await evaluate(`const matched=(()=>{${expression}})();return {matched,state:{readyState:document.readyState,root:!!root,rows:root?.querySelectorAll('a.row').length??null,notice:root?.querySelector('main>p:nth-of-type(3)')?.textContent?.slice(0,160)??null,refreshDisabled:root?.querySelector('button')?.disabled??null}};`);const previous=report.popupStates.at(-1);if(report.popupStates.length<32&&(!previous||JSON.stringify(previous.state)!==JSON.stringify(result.state)))report.popupStates.push({phase:report.phase,elapsedMs:performance.now()-started,state:result.state});if(result.matched)return;await new Promise(r=>setTimeout(r,25));}throw Error('temporary-project-popup-timeout');}
 const hasRows="return !!root&&root.querySelectorAll('a.row').length===2;";
 report.phase='observe-and-search';await open();await wait(hasRows);
 const items=await evaluate("return [...root.querySelectorAll('a.row')].map(a=>({title:a.textContent,href:a.href}));");assert.deepEqual(items,[{title:'Native A',href:origin+'/g/'+project+'/c/'+cid},{title:'Native B',href:origin+'/c/'+other}]);report.checks.projectOnlyChatVisible=true;
 await evaluate("const input=root.querySelector('input');input.value='Native B';input.dispatchEvent(new Event('input',{bubbles:true}));return true;");assert.equal(await evaluate("return root.querySelectorAll('a.row').length;"),1);
 report.checks.currentListSearch=true;
 report.phase='native-open-and-return';let box;
 const opened=await observeTemporaryNativeOpen({onPage:fn=>{context.on('page',fn);return ()=>context.off('page',fn);},onPopupClosed:fn=>{closedListeners.add(fn);return ()=>closedListeners.delete(fn);},
  press:async()=>{box=await evaluate("const a=root.querySelector('a.row');if(a.target!=='_blank'||a.rel!=='noopener noreferrer')throw Error('unsafe-native-link');a.scrollIntoView({block:'center'});const r=a.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};");await control.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box},popupSession);},
  release:()=>control.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box},popupSession),
  readPage:async(target,remainingMs)=>{await target.waitForURL(origin+'/c/'+other,{timeout:remainingMs});return {correctURL:target.url()===origin+'/c/'+other,openerNull:await target.evaluate(()=>opener===null)};},
  readOriginal:()=>page.evaluate(()=>document===originalDocument&&document.querySelector('textarea')===originalEditor&&originalEditor.value==='fixture draft'),
 });const {page:target,...input}=opened;report.nativeInput=input;await target.close();await page.bringToFront();await control.send('Target.closeTarget',{targetId:popupTarget}).catch(()=>{});await open();await wait(hasRows);assert.equal(await evaluate("return root.querySelector('input').value;"),'');report.checks.openReturnFreshList=true;
 report.phase='invalidate-project-list';await page.evaluate(()=>document.querySelector('#project-panel').remove());await wait("return !!root&&root.querySelectorAll('a.row').length===0;");report.checks.listRemovalClearsPopup=true;
 await control.send('Target.closeTarget',{targetId:popupTarget});await open();await wait("return !!root&&root.querySelectorAll('a.row').length===1;");assert.equal(await evaluate("return root.querySelector('a.row').textContent;"),'Native A');report.checks.sidebarStillReachable=true;
 assert.deepEqual(await worker.evaluate(()=>indexedDB.databases()),[]);assert.equal(await page.locator('[data-va-owned]').count(),0);assert.equal(await page.locator('textarea').inputValue(),'fixture draft');
 assert(report.requests.every(r=>[url,origin+'/c/'+other].includes(r.url)&&r.method==='GET'));report.requestAttempts=await worker.evaluate(()=>temporaryRequestAttempts);
 assert(report.requestAttempts.length<100,'request-observer-capacity-reached');assert(report.requestAttempts.some(r=>r.type==='main_frame'));assert(report.requestAttempts.every(r=>!r.path.startsWith('/api/')&&!r.path.startsWith('/backend-api/')));
 // The browser can attempt origin preconnects; a proxy CONNECT has no path and
 // cannot prove an authentication attempt. The observer above covers the full
 // page/popup journey after worker readiness, including extension requests.
 report.checks.noAuthenticationOrDetailRequestsDuringJourney=true;report.checks.databaseEmpty=true;report.checks.draftPreserved=true;report.status='PASS_TEMPORARY_PROJECT_MV3';report.elapsedMs=performance.now()-started;
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('test-closed'));}pending.clear();ws?.close();
 try{await browser?.close();}finally{report.networkGuard=guard?.snapshot();await guard?.close();}
 report.sourceStable=(await Promise.all(Object.entries(build.sourceHashes).map(async([p,h])=>hash(await readFile(p))===h))).every(Boolean);if(!report.sourceStable){report.status='SOURCE_CHANGED';process.exitCode=1;}
 report.testSourcesStable=(await Promise.all(Object.entries(report.testHashes).map(async([p,h])=>hash(await readFile(p))===h))).every(Boolean);if(!report.testSourcesStable){report.status='TEST_SOURCE_CHANGED';process.exitCode=1;}
 report.packageStatus=info.releaseStatus;const output=process.argv[2]??join(dir,'result.json');await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,phase:report.phase,elapsedMs:report.elapsedMs,output}));
}
