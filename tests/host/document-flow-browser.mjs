/** Existing anonymous host fixtures; no account, network responses or credentials.
 * Browser mechanism regression only; the formal MV3 journey is separate. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {observedHomeHTML,longDesktopHTML,materializePartitionedSidebar} from './fixtures/observed-host-replay.mjs';
import partitionDetails from './fixtures/observed-sidebar-project-details-20261026.json' with {type:'json'};
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {captureNativeBaseline} from './src/host/document-flow-layout.mjs';export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {createFlowMountSurface} from './src/navigation/flow-mount-surface.mjs';export {observeNativeProjectManagement} from './src/host/native-project-management.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'flowModule'});
const P='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',C='33333333-3333-4333-8333-333333333333';
const legacy=(await readFile(new URL('./fixtures/legacy.html',import.meta.url),'utf8')).replace('<link rel="stylesheet" href="/native.css">','<style>'+await readFile(new URL('./fixtures/native.css',import.meta.url),'utf8')+'</style>');
const browser=await chromium.launch({headless:true,args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']}),results=[];
try{
 // Reuse the actual anonymous partition shape; replacement is a lifecycle
 // counterexample, not a claim that a new native selector has been observed.
 const replacement=await browser.newPage({viewport:{width:1400,height:900}});
 await replacement.route('**/*',r=>r.request().url()==='https://chatgpt.com/'?r.fulfill({contentType:'text/html',body:observedHomeHTML(C)}):r.abort());
 await replacement.goto('https://chatgpt.com/');await replacement.evaluate(materializePartitionedSidebar,partitionDetails.sidebarStructure.rows);await replacement.addScriptTag({content:outputFiles[0].text});
 const recovery=await replacement.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;
  let surface;const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'replacement',producerToken:'replacement',browserDocumentId:'replacement',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'replacement'})});
  let inspection=adapter.inspect();surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
  const scrolls=[],handle=await surface.mount({binding},inspection,{onSidebarScroll:n=>scrolls.push(n)}),workspace=surface.frames(handle)[0].frame,sidebar=surface.frames(handle)[1].frame;
  surface.showWorkspace(handle);
  // A restored member window can grow after the first VIEW. Browser clamping
  // while those rows are absent is not a new saved scroll choice.
  const port=inspection.sidebarPlacement.scrollPort;
  surface.resizeSidebar(handle,128);const target=port.scrollHeight-port.clientHeight+700;
  scrolls.length=0;surface.restoreSidebar(handle,target);
  port.dispatchEvent(new Event('scroll'));
  const pendingDidNotOverwrite=scrolls.length===0;
  surface.resizeSidebar(handle,1600);
  const restoredAfterGrowth=port.scrollTop===target&&scrolls.at(-1)===target;
  // A distinct actual scroll takes precedence over a still-clamped restore.
  if(port.scrollHeight-port.clientHeight<=0)throw Error('scroll-counterexample-needs-scrollable-content');
  surface.restoreSidebar(handle,port.scrollHeight-port.clientHeight+700);
  port.scrollTop=0;port.dispatchEvent(new Event('scroll'));surface.resizeSidebar(handle,2400);
  const manualScrollPreserved=port.scrollTop===0&&scrolls.at(-1)===0;
  const recent=inspection.sidebarPlacement.recent,nextRecent=recent.cloneNode(true);recent.replaceWith(nextRecent);
  const fresh=adapter.inspectStructure(inspection),recentProof=fresh.history?.isConnected===true&&fresh.sidebarPlacement?.recent===nextRecent;
  surface.refreshGeometry(handle,fresh);surface.showWorkspace(handle,{roles:['sidebar']});
  const recentRecovered=surface.visibility(handle).sidebar&&surface.frames(handle)[1].frame===sidebar;
  const parent=fresh.sidebarPlacement?.parent,copy=parent.cloneNode(true);copy.querySelector('[data-va-sidebar-slot]')?.remove();parent.replaceWith(copy);
  inspection=adapter.inspectStructure(fresh);surface.retireRole(handle,'sidebar');surface.refreshGeometry(handle,inspection);
  const restored=surface.restoreRole(handle,'sidebar');surface.showWorkspace(handle,{roles:['sidebar']});
  const parentRecovered=!!restored&&restored.frame!==sidebar&&restored.frame.parentElement.parentElement===copy&&surface.visibility(handle).sidebar;
  const workspacePreserved=surface.frames(handle)[0].frame===workspace&&surface.visibility(handle).workspace;
  const oldPort=inspection.sidebarPlacement.scrollPort,newPort=oldPort.cloneNode(true);newPort.querySelector('[data-va-sidebar-slot]')?.remove();oldPort.replaceWith(newPort);
  inspection=adapter.inspectStructure(inspection);surface.retireRole(handle,'sidebar');surface.refreshGeometry(handle,inspection);surface.restoreRole(handle,'sidebar');surface.showWorkspace(handle,{roles:['sidebar']});
  scrolls.length=0;oldPort.dispatchEvent(new Event('scroll'));const oldScrollDetached=scrolls.length===0;
  newPort.dispatchEvent(new Event('scroll'));const newScrollBound=scrolls.length===1;
  // Unknown topology clears the old proof and cannot receive a moved frame.
  inspection.sidebarPlacement.parent.append(document.createElement('button'));const unknown=adapter.inspectStructure(inspection);
  surface.retireRole(handle,'sidebar');surface.refreshGeometry(handle,unknown);
  const unknownRejected=!unknown.sidebarPlacement&&unknown.preserveNativeSidebar&&surface.restoreRole(handle,'sidebar')===null&&surface.visibility(handle).workspace;
  surface.dispose(handle);adapter.stop();return {pendingDidNotOverwrite,restoredAfterGrowth,manualScrollPreserved,recentProof,recentRecovered,parentRecovered,workspacePreserved,oldScrollDetached,newScrollBound,unknownRejected};
 });
 assert.deepEqual(recovery,{pendingDidNotOverwrite:true,restoredAfterGrowth:true,manualScrollPreserved:true,recentProof:true,recentRecovered:true,parentRecovered:true,workspacePreserved:true,oldScrollDetached:true,newScrollBound:true,unknownRejected:true});await replacement.close();
 for(const [kind,path,html]of [['home','/',observedHomeHTML(C)],['project','/g/'+P+'/project',observedProjectHTML(P,C)],['conversation','/c/'+C,longDesktopHTML(C)],['header-inside','/c/'+C,legacy]]){
  const page=await browser.newPage({viewport:{width:1400,height:900}}),url='https://chatgpt.com'+path;
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(async kind=>{
   const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;
   let surface;const adapter=createChatGPTAdapter({document,profile:kind==='header-inside'?undefined:profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>container}}),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const before=adapter.inspect();if(!before.ok){adapter.stop();return {error:before};}
   const draft=document.querySelector('textarea');if(!draft.value)draft.value='fixture draft';const parent=draft.parentElement,value=draft.value,original=before.composer.getBoundingClientRect().toJSON();
   surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
   let handle;try{handle=await surface.mount({binding},before);}catch(e){adapter.stop();return {error:e.message};}
   const shown=surface.showWorkspace(handle),workspace=surface.frames(handle)[0].frame.parentElement;
   const boxes={workspace:workspace.getBoundingClientRect().toJSON(),composer:before.composer.getBoundingClientRect().toJSON()};
   const structural=adapter.inspectStructure(before).ok,active=surface.validateActiveLayout(handle),privatePopover=workspace.hasAttribute('popover');
   const nextHeader=before.header.cloneNode(true);before.header.replaceWith(nextHeader);await new Promise(resolve=>setTimeout(resolve,0));
   const replacedHeaderRejected=surface.isSameNativeRegions(handle)===false&&surface.visibility(handle).workspace===false;
   nextHeader.replaceWith(before.header);surface.showWorkspace(handle);
   // A newly inserted native accessible control may overflow a transparent
   // titlebar shell. It must participate in the active occlusion proof.
   const extra=document.createElement('div');extra.setAttribute('role','menuitem');extra.tabIndex=0;
   extra.style.cssText=`position:fixed;pointer-events:auto;left:${boxes.workspace.x+10}px;top:${boxes.workspace.y+10}px;width:80px;height:30px`;
   before.header.append(extra);await new Promise(resolve=>setTimeout(resolve,0));
   const lateHeaderControlRejected=surface.visibility(handle).workspace===false;extra.remove();surface.showWorkspace(handle);
   const interactiveShellChecks=[];for(const [attribute,value] of [['tabindex','0'],['contenteditable','true'],['inert',''],['role','button']]){const root=workspace.parentElement;root.setAttribute(attribute,value);await new Promise(resolve=>setTimeout(resolve,0));interactiveShellChecks.push(surface.isSameNativeRegions(handle)===false&&surface.visibility(handle).workspace===false);root.removeAttribute(attribute);surface.showWorkspace(handle);}
   const interactiveShellRejected=interactiveShellChecks.every(Boolean);surface.showReading(handle);const root=workspace.parentElement,priorRole=root.getAttribute('role');root.setAttribute('role','button');const interactiveBaselineRejected=flowModule.captureNativeBaseline({document,inspection:before,isOwnedSurface:n=>surface.isOwnedSurface(n)})===null;if(priorRole===null)root.removeAttribute('role');else root.setAttribute('role',priorRole);surface.showWorkspace(handle);
   draft.focus();draft.setSelectionRange(2,4);draft.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:null}));
   const input=surface.visibility(handle).workspace&&document.activeElement===draft&&draft.parentElement===parent&&draft.value===value&&draft.selectionStart===2;
   surface.showReading(handle);const restored=JSON.stringify(before.composer.getBoundingClientRect().toJSON())===JSON.stringify(original);
   surface.showWorkspace(handle);workspace.querySelector('button').click();const declarative=surface.visibility(handle).workspace===false;
   surface.showWorkspace(handle);const dialog=document.createElement('dialog');dialog.setAttribute('aria-modal','true');document.body.append(dialog);dialog.showModal();
   await Promise.resolve();const nativeWins=getComputedStyle(workspace).display==='none';dialog.remove();surface.dispose(handle);adapter.stop();
   return {shown,structural,active,privatePopover,replacedHeaderRejected,lateHeaderControlRejected,interactiveShellRejected,interactiveBaselineRejected,input,restored,declarative,nativeWins,clean:!document.querySelector('[data-va-flow-root]')&&draft.parentElement===parent,boxes};
  },kind);results.push({kind,...result});
  if(kind==='home'){
   // A stale pointer token after a declarative close must never reactivate
   // layout on a later native press, even if script cleanup never ran.
   await page.evaluate(async()=>{const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;let surface;const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>container}}),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});const binding={documentToken:'probe',producerToken:'probe',browserDocumentId:'probe',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'probe'})});const inspection=adapter.inspect();surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});const handle=await surface.mount({binding},inspection);surface.showWorkspace(handle);const exit=document.getElementById(handle.id+'_workspace_exit');exit.setAttribute('data-va-gesture',handle.id);exit.hidePopover();window.gestureProbe={surface,handle,adapter};});
   const before=await page.locator('form').evaluate(n=>n.getBoundingClientRect().toJSON()),box=await page.locator('textarea').boundingBox();
   await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();
   assert.deepEqual(await page.locator('form').evaluate(n=>n.getBoundingClientRect().toJSON()),before,'closed exit cannot revive geometry from a stale gesture');await page.mouse.up();
   // Native focus styling changes between pointerdown and pointerup must
   // conceal private content without moving the original click target.
   await page.evaluate(()=>{const {surface,handle}=gestureProbe;surface.showWorkspace(handle);const form=document.querySelector('form'),button=form.querySelector('button');window.handoffButton=button;window.handoffClicks=0;button.addEventListener('pointerdown',()=>form.classList.add('native-focus-ring'),{once:true});button.addEventListener('click',()=>window.handoffClicks++);});
   const handoffBox=await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON());
   await page.mouse.move(handoffBox.x+handoffBox.width/2,handoffBox.y+handoffBox.height/2);await page.mouse.down();
   assert.deepEqual(await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON()),handoffBox,'native focus styling cannot shift first click');
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-va-input-handoff]')).visibility),'hidden');
   await page.mouse.up();await page.waitForFunction(()=>handoffClicks===1);
   assert.equal(await page.evaluate(()=>gestureProbe.surface.visibility(gestureProbe.handle).workspace),false);
   await page.clock.install();
   await page.evaluate(()=>{document.querySelector('form').classList.remove('native-focus-ring');gestureProbe.surface.showWorkspace(gestureProbe.handle);handoffButton.addEventListener('pointerdown',()=>document.querySelector('form').classList.add('native-focus-ring'),{once:true});});
   const expiryBox=await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON());
   await page.mouse.move(expiryBox.x+expiryBox.width/2,expiryBox.y+expiryBox.height/2);await page.mouse.down();
   await page.clock.fastForward(3001);
   assert.equal(await page.evaluate(()=>document.querySelector('[data-va-input-handoff]')),null,'missing parent pointerup cannot retain handoff');
   assert.equal(await page.evaluate(()=>document.getElementById(gestureProbe.handle.id+'_workspace_exit').matches(':popover-open')),false);
   await page.mouse.up();
   await page.evaluate(()=>{document.querySelector('form').classList.remove('native-focus-ring');gestureProbe.surface.showWorkspace(gestureProbe.handle);});
   const corruptBox=await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON());
   await page.mouse.move(corruptBox.x+corruptBox.width/2,corruptBox.y+corruptBox.height/2);await page.mouse.down();
   await page.evaluate(()=>{document.querySelector('style[data-va-owned]').textContent+=' /* changed */';});
   assert.equal(await page.evaluate(()=>document.getElementById(gestureProbe.handle.id+'_workspace_exit').matches(':popover-open')),false,'untrusted owned stylesheet cannot use handoff exemption');
   await page.mouse.up();
   await page.evaluate(()=>{gestureProbe.surface.dispose(gestureProbe.handle);gestureProbe.adapter.stop();});
  }
  await page.close();
 }
 // A disclosure contract counterexample, not a newly observed ChatGPT selector.
 const management=await browser.newPage({viewport:{width:800,height:600}});
 await management.route('**/*',r=>r.request().url()==='https://chatgpt.com/'?r.fulfill({contentType:'text/html',body:`<nav style="height:80px;overflow:auto"><section id="native"><div><a href="/g/${P}/project">Project</a><button aria-controls="panel" aria-expanded="true">Manage</button><div id="panel"><a href="/c/${C}">Member</a></div></div><div style="height:900px"></div></section></nav>`}):r.abort());await management.goto('https://chatgpt.com/');await management.addScriptTag({content:outputFiles[0].text});
 await management.evaluate(()=>{window.m=flowModule.observeNativeProjectManagement({document,root:document.querySelector('#native')});document.querySelector('button').addEventListener('click',e=>{const b=e.currentTarget;b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));});});
 assert.deepEqual(await management.evaluate(()=>m.read()),[],'initial native expansion is not management intent');
 await management.getByRole('button',{name:'Manage'}).click();await management.evaluate(()=>{document.querySelector('#panel').style.cssText='height:0;overflow:hidden';});await management.getByRole('button',{name:'Manage'}).click();assert.deepEqual(await management.evaluate(()=>m.read()),[],'clipped transition cannot remove owned members');
 await management.evaluate(()=>document.querySelector('#panel').style.cssText='');await management.waitForFunction(()=>m.read().length===1);assert.deepEqual(await management.evaluate(()=>m.read()),[{projectId:P,refIds:[C]}]);
 await management.evaluate(()=>document.querySelector('nav').scrollTop=500);assert.equal((await management.evaluate(()=>m.read()))[0].refIds.length,1,'NAV scrolling does not revoke management intent');
 await management.evaluate(()=>{document.querySelector('nav').scrollTop=0;document.querySelector('#panel').style.cssText='height:0;overflow:hidden';});assert.deepEqual(await management.evaluate(()=>m.read()),[]);
 await management.evaluate(()=>m.stop());await management.close();
 console.log(JSON.stringify(results,null,2));assert(results.every(r=>r.shown&&r.structural&&r.active&&!r.privatePopover&&r.replacedHeaderRejected&&r.lateHeaderControlRejected&&r.interactiveShellRejected&&r.interactiveBaselineRejected&&r.input&&r.restored&&r.declarative&&r.nativeWins&&r.clean));
}finally{await browser.close();}
