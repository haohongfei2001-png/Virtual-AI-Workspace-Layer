import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const role=process.env.UNAVAILABLE_ROLE??'workspace';if(!['workspace','sidebar'].includes(role))throw Error('invalid-feedback-role');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),scriptPath=fileURLToPath(import.meta.url),scriptHash=hash(await readFile(scriptPath));
const server=await createHostFixtureServer(),dir=await mkdtemp('/private/tmp/vaiwl-unavailable-navigation-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const conversation='33333333-3333-4333-8333-333333333333',project='g-p-11111111111111111111111111111111';
const report={evidence:'REAL_HEADLESS_MV3_PACKAGED_HOST_OFFLINE',realChatGPT:'NOT_RUN',role,scriptHash,sourceHashes:manifest.sourceHashes,package:built,results:[],trace:[]};let context,page,id;
const count=()=>server.snapshot().actions.navigate??0;
async function workspace(p){
 await p.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2||[...document.querySelectorAll('button')].some(n=>n.getAttribute('aria-label')==='返回工作空间'),null,{timeout:20000});
 const back=p.getByRole('button',{name:'返回工作空间',exact:true});if(await back.isVisible())await back.click();
 await p.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 const frame=p.frames().find(f=>f.url()===`chrome-extension://${id}/${role}.html`);assert(frame);return frame;
}
async function settle(frame){await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(200);}
async function poll(check){const until=Date.now()+15000;while(Date.now()<until){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('navigation-observation-deadline');}
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 await context.exposeBinding('recordNavigationObservation',({page:source,frame},entry)=>{report.trace.push({page:source?.url(),frame:frame.url(),...entry});});
 await context.addInitScript(({origin})=>{
  if(location.origin===origin){document.addEventListener('DOMContentLoaded',()=>{
   globalThis.originalEditor=document.querySelector('textarea');globalThis.nativeClicks=[];
   document.addEventListener('click',event=>{const a=event.target.closest?.('aside a[href]');if(a)nativeClicks.push({href:a.href,isTrusted:event.isTrusted});},true);
  },{once:true});}
  if(location.protocol==='chrome-extension:'&&globalThis.chrome?.runtime?.sendMessage){const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){const m=args[0],tracked=['HOST_UI_VIEW','HOST_UI_PRESENT','HOST_UI_DISPATCH_CURRENT','HOST_UI_DISPATCH_NATIVE'].includes(m?.type);if(tracked&&m.type!=='HOST_UI_VIEW')globalThis.recordNavigationObservation({phase:'request',message:m});const pending=send(...args);if(!pending?.then)return pending;return pending.then(reply=>{
   let delivered=reply;if(m?.type==='HOST_UI_VIEW'&&Array.isArray(reply?.navigation)){delivered=structuredClone(reply);for(const row of delivered.navigation)if(row.refId==='33333333-3333-4333-8333-333333333333')row.plan={mode:'unavailable',reason:'offline-fixture-unavailable',planRevision:1};}
   if(tracked)globalThis.recordNavigationObservation({phase:'reply',message:m,reply:m.type==='HOST_UI_VIEW'?{state:delivered?.state,navigation:delivered?.navigation}:delivered});return delivered;
  });};}
 },{origin:server.origin});
 const cdp=await context.browser().newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));
 page=await context.newPage();await page.goto(server.origin+'/');let frame=await workspace(page);
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id));assert(worker);report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.workerNetworkBlocked);
 report.clickPrecondition='TWO_VISIBLE_FRAME_RAF_PLUS_200MS';
 report.failureInjection='PROJECTION_UNAVAILABLE_FAILURE_INJECTION: clone only Ordinary conversation navigation.plan in real HOST_UI_VIEW response; grants, scope, presentation and native handlers unchanged';
 const row=frame.getByRole('button',{name:/Ordinary conversation/}).first();await row.waitFor({timeout:15000});assert.equal(await row.getAttribute('href'),null);assert.equal(await row.getAttribute('aria-disabled'),'true');assert.equal(await row.getAttribute('role'),'button');await row.focus();assert(await row.evaluate(el=>el.getRootNode().activeElement===el));
 const nativeAnchor=page.locator('aside nav[aria-label="Chat history"] a[href="/c/'+conversation+'"]');await page.evaluate(id=>globalThis.originalNativeAnchor=document.querySelector('aside nav[aria-label="Chat history"] a[href="/c/'+id+'"]'),conversation);
 const before=count(),start=report.trace.length;await settle(frame);await row.click({force:true});
 const notice=frame.locator('.navigation-feedback');await notice.waitFor({state:'visible',timeout:10000});assert.equal(await notice.getAttribute('role'),'status');assert((await notice.innerText()).includes('当前无法确认聊天入口，请返回原生页面继续。'));
 assert.equal(report.trace.slice(start).filter(x=>x.phase==='request'&&['HOST_UI_DISPATCH_NATIVE','HOST_UI_DISPATCH_CURRENT'].includes(x.message.type)).length,0);assert.equal(count(),before);assert.deepEqual(await page.evaluate(()=>nativeClicks),[]);
 const returnNative=notice.getByRole('button',{name:'返回原生页面',exact:true});const visible=await returnNative.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});assert(visible);report.screenshot=join(dir,'unavailable-status.png');await page.screenshot({path:report.screenshot});
 report.results.push({name:'unavailable-projection-row-is-focusable-explained-without-href-or-dispatch',status:'PASS',statusText:await notice.innerText(),returnWithinFrameViewport:visible});
 await returnNative.click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:10000});
 const presentations=report.trace.slice(start).filter(x=>x.phase==='request'&&x.message.type==='HOST_UI_PRESENT'&&x.message.intent?.kind==='show-native-page');assert.equal(presentations.length,1);
 const back=page.getByRole('button',{name:'返回工作空间',exact:true});assert.equal(await back.count(),1);assert(await back.isVisible());assert(await nativeAnchor.isVisible());assert(await page.evaluate(()=>originalEditor===document.querySelector('textarea')&&originalEditor.value===''));assert.equal(count(),before);
 report.results.push({name:'real-show-native-page-presentation-closes-both-surfaces-with-one-grid-return',status:'PASS'});
 await nativeAnchor.click();await page.waitForURL(server.origin+'/c/'+conversation,{timeout:15000});await poll(()=>count()===before+1);
 assert.deepEqual(await page.evaluate(()=>nativeClicks.map(x=>({href:x.href,isTrusted:x.isTrusted}))),[{href:server.origin+'/c/'+conversation,isTrusted:true}]);assert(await page.evaluate(id=>originalNativeAnchor===document.querySelector('aside nav[aria-label="Chat history"] a[href="/c/'+id+'"]')&&originalEditor===document.querySelector('textarea')&&originalEditor.value==='',conversation));
 assert.equal(report.trace.slice(start).filter(x=>x.phase==='request'&&['HOST_UI_DISPATCH_NATIVE','HOST_UI_DISPATCH_CURRENT'].includes(x.message.type)).length,0);
 report.results.push({name:'original-native-history-trusted-click-navigates-once-with-original-editor-and-zero-delegated-dispatch',status:'PASS'});
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=context.browser().version();report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;report.frames=await Promise.all((page?.frames()??[]).map(async f=>{try{return {url:f.url(),state:await f.evaluate(()=>({text:document.body?.innerText,clicks:globalThis.nativeClicks,open:document.querySelectorAll('[data-va-owned]:popover-open').length}))};}catch(error){return {url:f.url(),error:String(error)};}}));if(page)try{report.failureScreenshot=join(dir,'failure.png');await page.screenshot({path:report.failureScreenshot});}catch{}}
finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(scriptPath))!==scriptHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun){report.status='FAIL';report.error=(report.error??'')+' source-or-script-changed';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/free-unavailable-navigation-package.json',JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
