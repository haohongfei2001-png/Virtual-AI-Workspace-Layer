import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),scriptPath=fileURLToPath(import.meta.url),scriptHash=hash(await readFile(scriptPath));
const server=await createHostFixtureServer(),dir=await mkdtemp('/private/tmp/vaiwl-current-navigation-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const currentId='33333333-3333-4333-8333-333333333333',targetURL=server.origin+'/c/'+currentId;
const report={evidence:'REAL_HEADLESS_MV3_PACKAGED_HOST_OFFLINE',realChatGPT:'NOT_RUN',scriptHash,sourceHashes:manifest.sourceHashes,package:built,results:[]};let context,page,frame;
async function localUseState(f){return f.evaluate(async()=>{
 const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs'));
 const base=new ScopeRepository({indexedDB});try{
  const db=await base.open(),roots=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});
  if(roots.length!==1)throw Error('expected-one-fixture-scope');const [provider,accountId,organizationId]=JSON.parse(roots[0]),scope={verified:true,provider,accountId,organizationId};
  const evidence=await new FreeEvidenceRepository({baseRepository:base}).read(scope);
  return {revision:evidence.revision,hints:Object.values(evidence.hints).filter(h=>h.hintType==='local-recent-use'),events:Object.keys(evidence.events).length,coverage:Object.keys(evidence.coverage).length};
 }finally{base.close();}
});}
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 await context.addInitScript(({origin})=>{
  if(location.origin===origin){document.addEventListener('DOMContentLoaded',()=>{globalThis.currentEditor=document.querySelector('textarea');if(currentEditor)currentEditor.value='CURRENT_NAVIGATION_UNSENT_DRAFT';},{once:true});}
  if(location.protocol==='chrome-extension:'&&globalThis.chrome?.runtime?.sendMessage){globalThis.currentNavigationTrace=[];const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){const pending=send(...args),m=args[0];if(['HOST_UI_VIEW','HOST_UI_DISPATCH_CURRENT'].includes(m?.type)&&pending?.then)pending.then(reply=>{currentNavigationTrace.push(m.type==='HOST_UI_VIEW'?{type:m.type,state:reply?.state,current:reply?.page?.current,navigation:reply?.navigation}:{type:m.type,actionId:m.actionId,targetKey:m.targetKey,reply});if(currentNavigationTrace.length>64)currentNavigationTrace.shift();},()=>{});return pending;};}
 },{origin:server.origin});
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});page=await context.newPage();await page.goto(targetURL);
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2||[...document.querySelectorAll('button')].some(n=>n.getAttribute('aria-label')==='返回工作空间'),null,{timeout:15000});
 const back=page.getByRole('button',{name:'返回工作空间',exact:true});if(await back.isVisible())await back.click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 frame=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(frame);
 const link=frame.getByRole('link',{name:'Ordinary conversation',exact:true}).first();await link.waitFor({timeout:15000});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id));assert(worker);report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.workerNetworkBlocked);
 report.beforeTrace=await frame.evaluate(()=>currentNavigationTrace);const plans=report.beforeTrace.filter(x=>x.type==='HOST_UI_VIEW').flatMap(x=>x.navigation??[]).filter(x=>x.refId===currentId);assert(plans.some(x=>x.plan.mode==='same-target'),'current row must carry a real same-target plan');assert.notEqual(await link.getAttribute('aria-disabled'),'true');
 assert(await page.evaluate(()=>currentEditor===document.querySelector('textarea')&&currentEditor.value==='CURRENT_NAVIGATION_UNSENT_DRAFT'));report.results.push({name:'current-conversation-real-view-plan-is-same-target-despite-unsent-native-draft',status:'PASS'});
 report.useBefore=await localUseState(frame);assert.equal(report.useBefore.hints.length,0,'discovery is not local use');
 const pagesBefore=context.pages().length,actionsBefore=structuredClone(server.snapshot().actions),requestsBefore=structuredClone(server.snapshot().requests);let opened=0;const countPage=()=>opened++;context.on('page',countPage);
 // Compositor settling is explicit; this is not an immediate-first-paint click test.
 await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(200);report.clickPrecondition='TWO_VISIBLE_FRAME_RAF_PLUS_200MS';
 await link.click();
 const deadline=Date.now()+10000;while(Date.now()<deadline){report.afterTrace=await frame.evaluate(()=>currentNavigationTrace);if(report.afterTrace.some(x=>x.type==='HOST_UI_DISPATCH_CURRENT'))break;await new Promise(r=>setTimeout(r,50));}
 const dispatched=report.afterTrace.filter(x=>x.type==='HOST_UI_DISPATCH_CURRENT');assert.equal(dispatched.length,1);assert.equal(dispatched[0].reply?.ok,true);assert.equal(dispatched[0].reply?.state,'already-current');
 await page.waitForFunction(()=>!document.querySelector('iframe[src$="/workspace.html"]')?.closest('[data-va-owned]')?.matches(':popover-open'),null,{timeout:10000});await page.waitForTimeout(500);
 assert.equal(page.url(),targetURL);assert.equal(opened,0);assert.equal(context.pages().length,pagesBefore);assert.deepEqual(server.snapshot().actions,actionsBefore);assert(await page.evaluate(()=>currentEditor===document.querySelector('textarea')&&currentEditor.value==='CURRENT_NAVIGATION_UNSENT_DRAFT'));assert.equal(await back.count(),1);assert(await back.isVisible());assert(await page.locator('#reading').isVisible());
 report.native={url:page.url(),newPages:opened,actionsBefore,actionsAfter:server.snapshot().actions,requestsBefore,requestsAfter:server.snapshot().requests,editorSame:true,draftPreserved:true,returnCount:await back.count(),openSurfaces:await page.locator('[data-va-owned]:popover-open').count()};report.screenshot=join(dir,'current-navigation-reading.png');await page.screenshot({path:report.screenshot});report.results.push({name:'trusted-current-row-click-dispatches-once-enters-reading-with-one-return-no-native-navigation-and-original-draft',status:'PASS'});
 await back.click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:10000});assert.equal(page.url(),targetURL);assert.equal(opened,0);assert(await page.evaluate(()=>currentEditor===document.querySelector('textarea')&&currentEditor.value==='CURRENT_NAVIGATION_UNSENT_DRAFT'));context.off('page',countPage);report.results.push({name:'unique-return-restores-both-surfaces-without-native-navigation',status:'PASS'});
 report.useAfter=await localUseState(frame);assert.equal(report.useAfter.hints.length,1);assert.equal(report.useAfter.hints[0].conversationId,currentId);assert.equal(report.useAfter.events,0);assert.equal(report.useAfter.coverage,0);assert.equal(report.useAfter.hints[0].sentAt,undefined);
 await page.reload();await page.waitForFunction(()=>document.querySelector('iframe[src$="/workspace.html"]'),null,{timeout:15000});
 await page.frameLocator('iframe[src$="/workspace.html"]').getByRole('link',{name:'Ordinary conversation',exact:true}).first().waitFor({state:'attached',timeout:15000});
 const renewed=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(renewed);
 report.useAfterReload=await localUseState(renewed);assert.deepEqual(report.useAfterReload,report.useAfter,'refresh must not renew local use');
 report.results.push({name:'formal-current-action-persists-one-local-use-without-send-evidence-and-refresh-does-not-renew',status:'PASS'});
 // Use the real native sidebar after surrendering the formal surface. The
 // extension must confirm the resulting body under the new SPA binding before
 // storing recency; it must neither dispatch the native action nor create ACK.
 if(await back.isVisible())await back.click();
 const workspace=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(workspace);
 await workspace.getByRole('link',{name:'Ordinary conversation',exact:true}).first().click();
 await page.getByRole('button',{name:'显示原生列表',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:10000});
 const nextId='44444444-4444-4444-8444-444444444444';
 await page.locator('nav[aria-label="Chat history"] a[href="/c/'+nextId+'"]').click();
 await page.waitForURL(server.origin+'/c/'+nextId);
 await page.waitForFunction(()=>document.querySelector('iframe[src$="/workspace.html"]'),null,{timeout:15000});
 await page.frameLocator('iframe[src$="/workspace.html"]').getByRole('link',{name:'Membership not loaded',exact:true}).first().waitFor({state:'attached',timeout:15000});
 const nativeFrame=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(nativeFrame);
 const useDeadline=Date.now()+6000;do{report.nativeUse=await localUseState(nativeFrame);if(report.nativeUse.hints.some(h=>h.conversationId===nextId))break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<useDeadline);
 assert.equal(report.nativeUse.hints.filter(h=>h.conversationId===nextId).length,1,'native click must persist only after current body confirmation');
 assert.equal(report.nativeUse.events,0);assert.equal(report.nativeUse.coverage,0);assert(report.nativeUse.hints.every(h=>h.sentAt===undefined));
 assert(await page.evaluate(()=>currentEditor===document.querySelector('textarea')&&currentEditor.value==='CURRENT_NAVIGATION_UNSENT_DRAFT'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('iframe[src$="/workspace.html"]'),null,{timeout:15000});
 await page.frameLocator('iframe[src$="/workspace.html"]').getByRole('link',{name:'Membership not loaded',exact:true}).first().waitFor({state:'attached',timeout:15000});
 const afterNativeReload=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(afterNativeReload);
 assert.deepEqual(await localUseState(afterNativeReload),report.nativeUse,'native click recency must survive refresh without renewal');
 report.results.push({name:'trusted-native-sidebar-spa-arrival-persists-local-use-and-preserves-draft-without-send-or-refresh-renewal',status:'PASS'});
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=context.browser().version();report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;report.frames=await Promise.all((page?.frames()??[]).map(async f=>{try{return {url:f.url(),state:await f.evaluate(()=>({text:document.body?.innerText,trace:globalThis.currentNavigationTrace,open:document.querySelectorAll('[data-va-owned]:popover-open').length}))};}catch(error){return {url:f.url(),error:String(error)};}}));if(page)try{report.failureScreenshot=join(dir,'failure.png');await page.screenshot({path:report.failureScreenshot});}catch{}}
finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(scriptPath))!==scriptHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun){report.status='FAIL';report.error=(report.error??'')+' source-or-script-changed';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/free-current-navigation-package.json',JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
