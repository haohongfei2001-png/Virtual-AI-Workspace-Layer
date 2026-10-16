import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {resolvedNavigationProfile} from './resolved-navigation-profile.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),scriptPath=fileURLToPath(import.meta.url),scriptHash=hash(await readFile(scriptPath));
const selected=resolvedNavigationProfile(process.env.FREE_RESOLVED_NAVIGATION_PROFILE??'LEGACY');
const fixturePaths=['./resolved-navigation-profile.mjs','./expected/modern.mjs','./fixtures/server.mjs','./fixtures/variants-server.mjs','./fixtures/variants-native.mjs','./fixtures/native.mjs','./fixtures/native.css','./fixtures/legacy.html'];
const fixtureSourceHashes=Object.fromEntries(await Promise.all(fixturePaths.map(async path=>[path,hash(await readFile(new URL(path,import.meta.url)))])));
const server=selected.modern?await createVariantHostFixtureServer({profile:'MODERN'}):await createHostFixtureServer();
const dir=await mkdtemp('/private/tmp/vaiwl-resolved-navigation-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,...(selected.modern?{offlineContext:true}:{})}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const {conversation,project}=selected;
const report={evidence:'REAL_HEADLESS_MV3_PACKAGED_HOST_OFFLINE',realChatGPT:'NOT_RUN',profile:selected.profile,startupMode:selected.modern?'WORKER_READY_PRECONDITION_NOT_COLD_ACCEPTANCE':'LEGACY_UNCHANGED',profileAcceptance:'SCOPED_NAVIGATION_ONLY_NOT_FULL_PROFILE_ACCEPTANCE',fixture:server.manifest,fixtureSourceHashes,expectedScope:selected.expectedScope,scriptHash,sourceHashes:manifest.sourceHashes,package:built,results:[],trace:[]};let context,page,id;
const count=()=>server.snapshot().actions.navigate??0;
async function workspace(p){
 await p.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2||[...document.querySelectorAll('button')].some(n=>n.getAttribute('aria-label')==='返回工作空间'),null,{timeout:20000});
 const back=p.getByRole('button',{name:'返回工作空间',exact:true});if(await back.isVisible())await back.click();
 await p.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 const frame=p.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(frame);if(selected.modern)await poll(()=>report.trace.some(row=>row.page===p.url()&&row.frame===frame.url()&&row.phase==='reply'&&row.message.type==='HOST_UI_VIEW'&&row.reply.state==='ready'&&row.reply.scope===selected.expectedScope));return frame;
}
async function settle(frame){await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(200);}
async function poll(check){const until=Date.now()+15000;while(Date.now()<until){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('navigation-observation-deadline');}
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 await context.exposeBinding('recordNavigationObservation',({page:source,frame},entry)=>{report.trace.push({page:source?.url(),frame:frame.url(),...entry});});
 await context.addInitScript(({origin})=>{
  if(location.origin===origin){document.addEventListener('DOMContentLoaded',()=>{globalThis.originalEditor=document.querySelector('textarea');globalThis.nativeClicks=[];document.addEventListener('click',event=>{const a=event.target.closest?.('aside a[href]');if(a)nativeClicks.push({href:a.href,isTrusted:event.isTrusted,defaultPreventedAtCapture:event.defaultPrevented});},true);},{once:true});}
  if(location.protocol==='chrome-extension:'&&globalThis.chrome?.runtime?.sendMessage){const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){const m=args[0],tracked=['HOST_UI_VIEW','HOST_UI_DISPATCH_CURRENT','HOST_UI_DISPATCH_NATIVE'].includes(m?.type);if(tracked&&m.type!=='HOST_UI_VIEW')globalThis.recordNavigationObservation({phase:'request',message:m});const pending=send(...args);if(tracked&&pending?.then)pending.then(reply=>globalThis.recordNavigationObservation({phase:'reply',message:m,reply:m.type==='HOST_UI_VIEW'?{state:reply?.state,scope:reply?.page?.scope,navigation:reply?.navigation}:reply}),()=>{});return pending;};}
 },{origin:server.origin});
 const cdp=await context.browser().newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));
 if(selected.modern){const readyWorker=context.serviceWorkers().find(worker=>worker.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:worker=>worker.url().startsWith(`chrome-extension://${id}/`),timeout:15000});assert.equal(await readyWorker.evaluate(()=>chrome.runtime.id),id);report.workerReadyBeforeNativeRequest=true;}
 page=await context.newPage();await page.goto(server.origin+selected.startPath);let frame=await workspace(page);
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id));assert(worker);report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.workerNetworkBlocked);
 report.clickPrecondition='TWO_VISIBLE_FRAME_RAF_PLUS_200MS';
 for(const spec of [{entity:'conversation',nativeId:conversation,path:'/c/'+conversation,label:selected.conversationTitle},{entity:'project',nativeId:project,path:'/g/'+project+'/project',label:selected.projectLabel}]){
  if(spec.entity==='project'){await page.close();page=await context.newPage();await page.goto(server.origin+selected.startPath);frame=await workspace(page);}
  const link=frame.getByRole('link',{name:spec.label,exact:true}).first();await link.waitFor({timeout:15000});
  await poll(()=>report.trace.some(x=>x.phase==='reply'&&x.message.type==='HOST_UI_VIEW'&&x.reply.navigation?.some(r=>(r.refId??r.projectId)===spec.nativeId&&r.plan.mode==='native-control')));
  assert.equal(await link.getAttribute('href'),server.origin+spec.path);assert.notEqual(await link.getAttribute('aria-disabled'),'true');
  assert(await page.evaluate(()=>originalEditor===document.querySelector('textarea')&&originalEditor.value===''));
  const start=report.trace.length,before=count(),pagesBefore=context.pages().length;let opened=0;const onPage=()=>opened++;context.on('page',onPage);
  await settle(frame);await link.click();await page.waitForURL(server.origin+spec.path,{timeout:15000});await poll(()=>count()===before+1);
  const requests=report.trace.slice(start).filter(x=>x.phase==='request'&&x.message.type==='HOST_UI_DISPATCH_NATIVE');assert.equal(requests.length,1);
  const originalCommand=requests[0].message;assert.equal(opened,0);assert.equal(context.pages().length,pagesBefore);
  const native=await page.evaluate(()=>({editorSame:originalEditor===document.querySelector('textarea'),draft:originalEditor.value,clicks:nativeClicks}));assert.equal(native.editorSame,true);assert.equal(native.draft,'');assert.deepEqual(native.clicks.map(x=>x.href),[server.origin+spec.path]);
  report.results.push({name:spec.entity+'-real-issued-plan-clicks-original-native-anchor-once-same-tab-SPA',status:'PASS',native,actionId:originalCommand.actionId,newPages:opened});
  frame=await workspace(page);const beforeReplay=count();const replay=await frame.evaluate(message=>chrome.runtime.sendMessage(message),originalCommand);assert.equal(replay?.ok,false);await page.waitForTimeout(150);assert.equal(count(),beforeReplay);assert.equal((await page.evaluate(()=>nativeClicks)).length,1);assert.equal(opened,0);
  report.results.push({name:spec.entity+'-old-action-command-replay-rejected-after-route-rebind',status:'PASS',replay});context.off('page',onPage);
 }
 // Browser modifier behavior belongs to the real anchor, with no native delegation RPC.
 await page.close();page=await context.newPage();await page.goto(server.origin+selected.startPath);frame=await workspace(page);const link=frame.getByRole('link',{name:'Ordinary conversation',exact:true}).first();await link.waitFor({timeout:15000});await settle(frame);await page.evaluate(()=>{globalThis.modifierOriginalDocument=document;});
 const start=report.trace.length,before=count();const popupPromise=context.waitForEvent('page',{timeout:10000});await link.click({modifiers:['Meta']});const popup=await popupPromise;await popup.waitForURL(server.origin+'/c/'+conversation,{timeout:15000});await page.waitForTimeout(150);
 assert.equal(report.trace.slice(start).filter(x=>x.phase==='request'&&['HOST_UI_DISPATCH_NATIVE','HOST_UI_DISPATCH_CURRENT'].includes(x.message.type)).length,0);assert.equal(count(),before);assert.deepEqual(await page.evaluate(()=>nativeClicks),[]);assert.equal(page.url(),server.origin+selected.startPath);
 await popup.waitForFunction(id=>document.querySelector('#reading')?.dataset.conversationId===id&&document.querySelector('h1')?.textContent==='Ordinary conversation',conversation,{timeout:15000});
 assert(await page.evaluate(()=>modifierOriginalDocument===document&&originalEditor===document.querySelector('textarea')&&originalEditor.value===''));
 report.results.push({name:'modifier-real-href-default-opens-new-tab-with-zero-delegation-and-original-native-clicks',status:'PASS',popupURL:popup.url(),nativeBodyId:conversation});await popup.close();
 // Keep each additional browser gesture independent, with an actual native draft.
 // Playwright sends mouse/keyboard input; no synthetic dispatch or target rewrite.
 for(const gesture of [{name:'shift',click:{modifiers:['Shift']}},{name:'middle',click:{button:'middle'}}]){
  await page.close();page=await context.newPage();await page.goto(server.origin+selected.startPath);frame=await workspace(page);
  const draft='MODIFIER_NATIVE_DRAFT_'+gesture.name;
  await page.locator('textarea').fill(draft);await page.evaluate(()=>{globalThis.modifierOriginalDocument=document;});frame=await workspace(page);
  const target=frame.getByRole('link',{name:'Ordinary conversation',exact:true}).first();await target.waitFor({timeout:15000});await settle(frame);
  assert.equal(await target.getAttribute('href'),server.origin+'/c/'+conversation);assert.notEqual(await target.getAttribute('aria-disabled'),'true');
  const start=report.trace.length,before=count(),pagesBefore=context.pages().length;let opened=0;const onPage=()=>opened++;context.on('page',onPage);
  const [openedPage]=await Promise.all([context.waitForEvent('page',{timeout:10000}),target.click(gesture.click)]);
  await openedPage.waitForURL(server.origin+'/c/'+conversation,{timeout:15000});
  await openedPage.waitForFunction(id=>document.querySelector('#reading')?.dataset.conversationId===id&&document.querySelector('h1')?.textContent==='Ordinary conversation',conversation,{timeout:15000});await page.waitForTimeout(150);
  assert.equal(opened,1);assert.equal(context.pages().length,pagesBefore+1);
  assert.equal(report.trace.slice(start).filter(x=>x.phase==='request'&&['HOST_UI_DISPATCH_NATIVE','HOST_UI_DISPATCH_CURRENT'].includes(x.message.type)).length,0);
  assert.equal(count(),before);assert.equal(page.url(),server.origin+selected.startPath);
  const native=await page.evaluate(()=>({documentSame:modifierOriginalDocument===document,editorSame:originalEditor===document.querySelector('textarea'),draft:originalEditor.value,clicks:nativeClicks}));
  assert.equal(native.documentSame,true);assert.equal(native.editorSame,true);assert.equal(native.draft,draft);assert.deepEqual(native.clicks,[]);
  report.results.push({name:gesture.name+'-real-href-default-opens-target-once-with-zero-delegation-and-retained-native-draft',status:'PASS',popupURL:openedPage.url(),nativeBodyId:conversation,newPages:opened,native});
  context.off('page',onPage);await openedPage.close();
 }
 assert.equal(report.results.length,7);if(selected.modern){const ready=report.trace.filter(row=>row.phase==='reply'&&row.message.type==='HOST_UI_VIEW'&&row.reply.state==='ready');assert(ready.length>0);assert(ready.every(row=>row.reply.scope===selected.expectedScope));report.modernTeamScope={status:'PASS',readyViews:ready.length,scope:selected.expectedScope,rosterSelection:'INDEPENDENT_ORACLE_NONFIRST_CONTEXT'};}
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=context.browser().version();report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;report.frames=await Promise.all((page?.frames()??[]).map(async f=>{try{return {url:f.url(),state:await f.evaluate(()=>({text:document.body?.innerText,clicks:globalThis.nativeClicks,open:document.querySelectorAll('[data-va-owned]:popover-open').length}))};}catch(error){return {url:f.url(),error:String(error)};}}));if(page)try{report.failureScreenshot=join(dir,'failure.png');await page.screenshot({path:report.failureScreenshot});}catch{}}
finally{report.native=server.snapshot();await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.fixtureChangedDuringRun=(await Promise.all(Object.entries(fixtureSourceHashes).map(async([path,value])=>hash(await readFile(new URL(path,import.meta.url)))!==value))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(scriptPath))!==scriptHash;if(report.sourceChangedDuringRun||report.fixtureChangedDuringRun||report.scriptChangedDuringRun){report.status='FAIL';report.error=(report.error??'')+' source-or-script-changed';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/free-resolved-navigation-package.json',JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
