/** UI-13 actual target-only management lifecycle on an isolated offline package. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {disableStatesProfile} from './disable-states-profile.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const selected=disableStatesProfile(process.env.FREE_REENABLE_PROFILE??'LEGACY');
const server=selected.modern?await createVariantHostFixtureServer({profile:'MODERN'}):await createHostFixtureServer();
const dir=await mkdtemp('/private/tmp/vaiwl-reenable-package-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,...selected.packageOptions}),info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8')),script='tests/host/reenable-package-mv3-browser.mjs',hash=b=>createHash('sha256').update(b).digest('hex'),scriptHash=hash(await readFile(script)),output=process.argv[2]??'/private/tmp/free-reenable-package-mv3.json';
const fixturePaths=['disable-states-profile.mjs','expected/legacy.mjs','expected/modern.mjs','fixtures/server.mjs','fixtures/variants-server.mjs','fixtures/variants-native.mjs','fixtures/native-current-refresh.mjs','fixtures/native.mjs','fixtures/native.css','fixtures/legacy.html'];
const fixtureSourceHashes=Object.fromEntries(await Promise.all(fixturePaths.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
const report={profile:selected.profile,expectedScope:selected.scope,fixture:server.manifest,fixtureSourceHashes,evidence:'REAL_HEADLESS_PACKAGED_MV3_DISABLE_REENABLE_OFFLINE',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',package:built,sourceHashes:info.sourceHashes,scriptHash,results:[],errors:[]};let context;
try{
 assert.equal(JSON.parse(await readFile(join(built.unpacked,'manifest.json'),'utf8')).permissions.includes('management'),false);
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 await context.addInitScript(()=>{if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;globalThis.reenableGrant=null;globalThis.reenableScope=null;const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async m=>{const r=await send(m);if(m?.type==='HOST_UI_VIEW'&&r?.ok===true&&r.page?.scope)globalThis.reenableScope=r.page.scope;if(r?.ok===true&&r.grant?.id)globalThis.reenableGrant={id:r.grant.id,mountId:r.grant.mountId,uiDocumentId:r.grant.uiDocumentId};return r;};});
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 // Only this separate test extension has management permission. Its API closes
 // over the one target ID, never accepts an arbitrary extension identifier.
 const controllerDir=join(dir,'controller');await mkdir(controllerDir);
 await writeFile(join(controllerDir,'manifest.json'),JSON.stringify({manifest_version:3,name:'VAIWL isolated target lifecycle controller',version:'0.0.1',permissions:['management'],content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; connect-src 'none'"}}));
 await writeFile(join(controllerDir,'controller.html'),'<script src="controller.js"></script>');
 await writeFile(join(controllerDir,'controller.js'),`const target=${JSON.stringify(id)};globalThis.targetState=async()=>{const v=await chrome.management.get(target);return {id:v.id,enabled:v.enabled};};globalThis.setTargetEnabled=async enabled=>{if(typeof enabled!=='boolean')throw Error('invalid-state');await chrome.management.setEnabled(target,enabled);return targetState();};`);
 const {id:controllerId}=await cdp.send('Extensions.loadUnpacked',{path:controllerDir}),controller=await context.newPage();await controller.goto(`chrome-extension://${controllerId}/controller.html`);
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(selected.modern?server.origin+selected.entryPath:server.url);
 const frameURLs=['workspace','sidebar'].map(role=>`chrome-extension://${id}/${role}.html`);
 async function pair(){await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});const frames=frameURLs.map(url=>page.frames().find(f=>f.url()===url));assert(frames.every(Boolean));await frames[0].getByText('Ordinary conversation',{exact:true}).waitFor({timeout:15000});if(selected.modern){assert.equal(await frames[0].evaluate(()=>reenableScope),selected.scopeKey);assert(server.snapshot().nativeRequests.some(r=>r.path==='/backend-api/conversation/'+selected.conversationId&&r.context===selected.contextId));}return frames;}
 async function grant(frame){await frame.waitForFunction(()=>!!globalThis.reenableGrant,{},{timeout:10000});return frame.evaluate(()=>reenableGrant);}
 async function blockedNetwork(){const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`));assert(worker);assert.equal(await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}}),true);}
 const oldFrames=await pair(),oldGrants=await Promise.all(oldFrames.map(grant));await blockedNetwork();report.workerExternalNetworkBlockedBefore=true;
 await page.locator('textarea').fill('REENABLE_NATIVE_DRAFT');await page.evaluate(()=>{globalThis.reenableEditor=document.querySelector('textarea');globalThis.reenableDocument=document;globalThis.reenablePageHides=0;addEventListener('pagehide',()=>reenablePageHides++);});await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await pair();
 const privatePositive=await privateAbsent();assert.equal(privatePositive.privateProjectionAbsent,false,'detector must find actual private shadow-rendered text before disable');assert.equal(privatePositive.frames.length,2);report.privateProjectionDetectorPositiveControl=true;
 const originalURL=page.url();assert.deepEqual(await controller.evaluate(()=>setTargetEnabled(false)),{id,enabled:false});report.disableConfirmed=true;
 async function privateAbsent(){
  const states=[],currentFrames=page.frames().filter(f=>frameURLs.includes(f.url()));
  const connectedTargets=await page.locator('iframe').evaluateAll((nodes,urls)=>nodes.filter(n=>urls.includes(n.src)).length,frameURLs);
  assert.ok(connectedTargets<=currentFrames.length,'connected private frame without inspectable frame identity is not absent');
  for(const frame of new Set([...oldFrames,...currentFrames])){if(frame.isDetached()){states.push({reachable:false,detached:true,privatePresent:false});continue;}try{states.push(await frame.evaluate(()=>{
   let privatePresent=false;const visit=root=>{for(const node of root.querySelectorAll('*')){if(node.shadowRoot)visit(node.shadowRoot);for(const child of node.childNodes)if(child.nodeType===Node.TEXT_NODE&&['Ordinary conversation','Research','Membership not loaded'].some(s=>(child.textContent??'').includes(s)))privatePresent=true;}};visit(document);
   return {reachable:true,privatePresent};
  }));}catch(error){if(!frame.isDetached())throw Error('connected-private-frame-unreadable:'+error.message);states.push({reachable:false,detached:true,privatePresent:false});}}
  return {privateProjectionAbsent:states.every(s=>!s.privatePresent),frames:states};
 }
 let absence;for(let i=0;i<50;i++){absence=await privateAbsent();if(absence.privateProjectionAbsent)break;await page.waitForTimeout(100);}assert.equal(absence.privateProjectionAbsent,true);
 async function nativeState(suffix){
  // Inspect automatic cleanup before any native input could conceal a failure.
  const natural=await page.evaluate(()=>{const style=n=>({visibility:getComputedStyle(n).visibility,interactivity:getComputedStyle(n).interactivity,htmlInert:n.hasAttribute('inert')});return {openOwned:document.querySelectorAll('[data-va-owned]:popover-open').length,reading:style(document.querySelector('#reading')),history:style(document.querySelector('nav[aria-label="Chat history"]'))};});
  assert.equal(natural.openOwned,0,'lifecycle itself must close surfaces');
  for(const area of [natural.reading,natural.history]){assert.equal(area.visibility,'visible');assert.notEqual(area.interactivity,'inert');assert.equal(area.htmlInert,false);}
  await page.locator('textarea').press('End');await page.locator('textarea').pressSequentially(suffix);const state=await page.evaluate(()=>({nativeOperable:document.activeElement===reenableEditor&&document.querySelector('textarea')===reenableEditor,draft:reenableEditor.value,sameDocument:document===reenableDocument,pageHides:reenablePageHides,cleanLayout:document.querySelectorAll('[data-va-owned]:popover-open').length===0&&getComputedStyle(document.querySelector('#reading')).visibility==='visible'}));assert.equal(state.cleanLayout,true,'disable/reenable must release native masks');assert.equal(state.nativeOperable,true);assert.equal(state.sameDocument,true);assert.equal(state.pageHides,0);assert.equal(page.url(),originalURL);return {...state,natural};}
 const disabledNative=await nativeState('_DISABLED');assert.equal(disabledNative.draft,'REENABLE_NATIVE_DRAFT_DISABLED');report.results.push({name:'actual-disable-keeps-native-editor-operable-and-removes-private-projection',status:'PASS',...disabledNative,...absence});
 assert.deepEqual(await controller.evaluate(()=>setTargetEnabled(true)),{id,enabled:true});report.reenableConfirmed=true;await page.waitForTimeout(500);
 absence=await privateAbsent();assert.equal(absence.privateProjectionAbsent,true,'old page must not resurrect private projection without a fresh owner grant');
 const enabledNative=await nativeState('_REENABLED');assert.equal(enabledNative.draft,'REENABLE_NATIVE_DRAFT_DISABLED_REENABLED');report.results.push({name:'reenable-without-refresh-does-not-revive-old-private-frames-or-touch-draft',status:'PASS',...enabledNative,...absence});
 // Browser document navigation to an existing native link. This does not call
 // product dispatch, synthetic history APIs, or authorizing messages.
 const destination=await page.locator('nav[aria-label="Chat history"] a').filter({hasText:'Ordinary conversation'}).getAttribute('href');assert(destination);await page.goto(new URL(destination,server.origin).href);
 const newFrames=await pair(),newGrants=await Promise.all(newFrames.map(grant));assert(oldFrames.every(f=>f.isDetached()));
 for(let i=0;i<newFrames.length;i++){assert.notEqual(newFrames[i],oldFrames[i]);assert.notEqual(newGrants[i].id,oldGrants[i].id);assert.notEqual(newGrants[i].uiDocumentId,oldGrants[i].uiDocumentId);assert.notEqual(newGrants[i].mountId,oldGrants[i].mountId);const fresh=await newFrames[i].evaluate(current=>chrome.runtime.sendMessage({v:1,type:'HOST_UI_CANDIDATES',grantId:current.id,mountId:current.mountId,offset:0}),newGrants[i]);assert.equal(fresh?.ok,true,'same endpoint must accept the current frame grant');const stale=await newFrames[i].evaluate(old=>chrome.runtime.sendMessage({v:1,type:'HOST_UI_CANDIDATES',grantId:old.id,mountId:old.mountId,offset:0}),oldGrants[i]);assert.notEqual(stale?.ok,true,'old grant cannot authorize a new frame');}
 await blockedNetwork();report.workerExternalNetworkBlockedAfter=true;report.results.push({name:'native-destination-document-has-new-owner-grants-and-private-projection',status:'PASS',oldFramesDetached:true,newGrantIds:true,newMountIds:true,newUiDocuments:true,navigationKind:'browser document navigation to observed native href'});
 assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browser=context.browser().version();report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}finally{await context?.close();await server.close();report.fixtureChangedDuringRun=(await Promise.all(Object.entries(fixtureSourceHashes).map(async([p,h])=>hash(await readFile(new URL(p,import.meta.url)))!==h))).some(Boolean);report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean)||hash(await readFile(script))!==scriptHash;if(report.sourceChangedDuringRun||report.fixtureChangedDuringRun){report.status='FAIL';process.exitCode=1;}await writeFile(output,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
