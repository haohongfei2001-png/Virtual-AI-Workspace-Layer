import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const role=process.env.FEEDBACK_ROLE??'workspace';if(!['workspace','sidebar'].includes(role))throw Error('invalid-feedback-role');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),scriptPath=fileURLToPath(import.meta.url),scriptHash=hash(await readFile(scriptPath));
const server=await createHostFixtureServer(),dir=await mkdtemp('/private/tmp/vaiwl-navigation-feedback-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
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
  if(location.protocol==='chrome-extension:'&&globalThis.chrome?.runtime?.sendMessage){const send=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.resumeSaveFault={enabled:false,count:0};chrome.runtime.sendMessage=function(...args){if(resumeSaveFault.enabled&&args[0]?.type==='HOST_UI_SAVE_VIEW'){resumeSaveFault.count++;return Promise.resolve({ok:false,reason:'view-resume-unavailable'});}return send(...args);};}
  if(location.protocol==='chrome-extension:'&&globalThis.chrome?.runtime?.sendMessage){const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){const m=args[0],tracked=['HOST_UI_VIEW','HOST_UI_DISPATCH_CURRENT','HOST_UI_DISPATCH_NATIVE'].includes(m?.type);if(tracked&&m.type!=='HOST_UI_VIEW')globalThis.recordNavigationObservation({phase:'request',message:m});const pending=send(...args);if(tracked&&pending?.then)pending.then(reply=>globalThis.recordNavigationObservation({phase:'reply',message:m,reply:m.type==='HOST_UI_VIEW'?{state:reply?.state,navigation:reply?.navigation}:reply}),()=>{});return pending;};}
 },{origin:server.origin});
 const cdp=await context.browser().newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));
 page=await context.newPage();await page.goto(server.origin+'/');let frame=await workspace(page);
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id));assert(worker);report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.workerNetworkBlocked);
 report.clickPrecondition='TWO_VISIBLE_FRAME_RAF_PLUS_200MS';
 report.failureInjection='FAILURE_INJECTION_NOT_NATIVE_HOST_BEHAVIOR: CDP original extension isolated world on local fixture only';
 const contentCDP=await context.newCDPSession(page),worlds=[];contentCDP.on('Runtime.executionContextCreated',e=>worlds.push(e.context));await contentCDP.send('Runtime.enable');
 const {frameTree}=await contentCDP.send('Page.getFrameTree');const candidates=worlds.filter(w=>w.origin==='chrome-extension://'+id&&w.auxData?.frameId===frameTree.frame.id&&w.auxData?.isDefault===false);assert.equal(candidates.length,1);const contentWorld=candidates[0];
 const injection=await contentCDP.send('Runtime.evaluate',{contextId:contentWorld.id,returnByValue:true,expression:`(()=>{if(location.origin!==${JSON.stringify(server.origin)})throw Error('fixture-origin-mismatch');const a=document.querySelector('aside nav[aria-label="Chat history"] a[href="/c/33333333-3333-4333-8333-333333333333"]');if(!a)throw Error('fixture-anchor-missing');globalThis.injectedClickAttempts=0;a.click=function(){globalThis.injectedClickAttempts++;throw Error('OFFLINE_TEST_INJECTED_NATIVE_CLICK_FAILURE');};return {url:location.href,isolatedExtension:chrome.runtime.id};})()`});assert.equal(injection.result.value?.isolatedExtension,id);report.injection=injection.result.value;
 async function nativeState(){const observed=await page.evaluate(()=>({clicks:nativeClicks,editorSame:originalEditor===document.querySelector('textarea'),draft:originalEditor.value}));const attempts=await contentCDP.send('Runtime.evaluate',{contextId:contentWorld.id,returnByValue:true,expression:'globalThis.injectedClickAttempts'});return {attempts:attempts.result.value,...observed};}
 const link=frame.getByRole('link',{name:'Ordinary conversation',exact:true}).first();await link.waitFor({timeout:15000});
 await poll(()=>report.trace.some(x=>x.phase==='reply'&&x.message.type==='HOST_UI_VIEW'&&x.reply.navigation?.some(r=>r.refId===conversation&&r.plan.mode==='native-control')));
 if(role==='sidebar'){
  await settle(frame);await frame.evaluate(()=>{resumeSaveFault.enabled=true;});
  await frame.locator('.theme-toggle').first().click();
  await frame.waitForFunction(()=>resumeSaveFault.count>0,null,{timeout:15000});await settle(frame);
  const saves=await frame.evaluate(()=>resumeSaveFault.count),beforeDispatch=report.trace.filter(x=>x.phase==='request'&&x.message.type==='HOST_UI_DISPATCH_NATIVE').length;
  await link.click();const blocked=frame.locator('.navigation-feedback');await blocked.waitFor({state:'visible',timeout:10000});assert((await blocked.innerText()).includes('暂时无法打开'));
  assert.equal(await frame.evaluate(()=>resumeSaveFault.count),saves+1);
  assert.equal(report.trace.filter(x=>x.phase==='request'&&x.message.type==='HOST_UI_DISPATCH_NATIVE').length,beforeDispatch);
  assert.equal((await nativeState()).attempts,0);assert.equal(page.url(),server.origin+'/');
  await settle(frame);assert.equal(await frame.evaluate(()=>resumeSaveFault.count),saves+1,'blocked feedback repaint cannot retry failed save');
  await frame.evaluate(()=>{resumeSaveFault.enabled=false;});
  report.results.push({name:'settled-failed-layout-save-blocks-native-dispatch-with-explicit-feedback-and-no-background-retry',status:'PASS',fault:'FRAME_RPC_FAILURE_BEFORE_OWNER_SAVE_NOT_HOST_BEHAVIOR'});
 }
 assert(await page.evaluate(()=>originalEditor===document.querySelector('textarea')&&originalEditor.value===''));
 const before=count(),pagesBefore=context.pages().length,start=report.trace.length;let opened=0;const onPage=()=>opened++;context.on('page',onPage);
 await settle(frame);await link.click();
 await poll(()=>report.trace.slice(start).some(x=>x.phase==='reply'&&x.message.type==='HOST_UI_DISPATCH_NATIVE'));
 const dispatches=report.trace.slice(start).filter(x=>x.phase==='request'&&x.message.type==='HOST_UI_DISPATCH_NATIVE');assert.equal(dispatches.length,1);
 const reply=report.trace.slice(start).find(x=>x.phase==='reply'&&x.message.type==='HOST_UI_DISPATCH_NATIVE');assert.equal(reply.reply?.state,'unconfirmed');assert.equal(reply.reply?.ok,true);
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:10000});
 assert.equal(count(),before);assert.equal(opened,0);assert.equal(context.pages().length,pagesBefore);assert.equal(page.url(),server.origin+'/');
 const failedNative=await nativeState();assert.deepEqual(failedNative,{attempts:1,clicks:[],editorSame:true,draft:''});
 report.results.push({name:'actual-delegation-injected-native-click-throw-is-unconfirmed-once-without-navigation-or-auto-fallback',status:'PASS',native:failedNative,reply:reply.reply});
 const back=page.getByRole('button',{name:'返回工作空间',exact:true});assert.equal(await back.count(),1);assert(await back.isVisible());await back.click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 const notice=frame.locator('.navigation-feedback');await notice.waitFor({state:'visible',timeout:10000});assert.equal(await notice.getAttribute('role'),'status');assert.equal(await notice.getAttribute('aria-live'),'polite');assert((await notice.innerText()).includes('打开结果未确认，请先查看原生页面。'));
 const fallback=notice.getByRole('link',{name:'保留当前内容，在新标签打开',exact:true});assert.equal(await fallback.getAttribute('href'),server.origin+'/c/'+conversation);assert.equal(await fallback.getAttribute('target'),'_blank');assert((await fallback.getAttribute('rel')).includes('noopener'));
 report.screenshot=join(dir,'navigation-feedback.png');await page.screenshot({path:report.screenshot});report.results.push({name:'unique-real-return-preserves-visible-unconfirmed-status-and-explicit-safe-href',status:'PASS',text:await notice.innerText()});
 const traceBeforeFallback=report.trace.length,popupPromise=context.waitForEvent('page',{timeout:10000});await fallback.click();const popup=await popupPromise;await popup.waitForURL(server.origin+'/c/'+conversation,{timeout:15000});await page.waitForTimeout(150);
 assert.equal(report.trace.slice(traceBeforeFallback).filter(x=>x.phase==='request'&&['HOST_UI_DISPATCH_NATIVE','HOST_UI_DISPATCH_CURRENT'].includes(x.message.type)).length,0);assert.equal(count(),before);assert.equal(page.url(),server.origin+'/');assert.equal(opened,1);
 assert.deepEqual(await nativeState(),failedNative);
 report.results.push({name:'explicit-fallback-real-link-opens-one-new-tab-with-zero-repeat-dispatch-and-original-page-editor-preserved',status:'PASS',popupURL:popup.url()});await popup.close();context.off('page',onPage);
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=context.browser().version();report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;report.frames=await Promise.all((page?.frames()??[]).map(async f=>{try{return {url:f.url(),state:await f.evaluate(()=>({text:document.body?.innerText,clicks:globalThis.nativeClicks,open:document.querySelectorAll('[data-va-owned]:popover-open').length}))};}catch(error){return {url:f.url(),error:String(error)};}}));if(page)try{report.failureScreenshot=join(dir,'failure.png');await page.screenshot({path:report.failureScreenshot});}catch{}}
finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(scriptPath))!==scriptHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun){report.status='FAIL';report.error=(report.error??'')+' source-or-script-changed';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/free-navigation-feedback-package.json',JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
