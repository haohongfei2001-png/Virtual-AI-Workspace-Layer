/** Existing anonymous host fixtures; no account, network responses or credentials.
 * Browser mechanism regression only; the formal MV3 journey is separate. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {observedHomeHTML,longDesktopHTML} from './fixtures/observed-host-replay.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {createFlowMountSurface} from './src/navigation/flow-mount-surface.mjs';export {observeNativeProjectManagement} from './src/host/native-project-management.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'flowModule'});
const P='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',C='33333333-3333-4333-8333-333333333333';
const browser=await chromium.launch({headless:true,args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']}),results=[];
try{
 for(const [kind,path,html]of [['home','/',observedHomeHTML(C)],['project','/g/'+P+'/project',observedProjectHTML(P,C)],['conversation','/c/'+C,longDesktopHTML(C)]]){
  const page=await browser.newPage({viewport:{width:1400,height:900}}),url='https://chatgpt.com'+path;
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(async()=>{
   const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;
   let surface;const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>container}}),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const before=adapter.inspect();if(!before.ok){adapter.stop();return {error:before};}
   const draft=document.querySelector('textarea'),parent=draft.parentElement,value=draft.value,original=before.composer.getBoundingClientRect().toJSON();
   surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
   let handle;try{handle=await surface.mount({binding},before);}catch(e){adapter.stop();return {error:e.message};}
   const shown=surface.showWorkspace(handle),workspace=surface.frames(handle)[0].frame.parentElement;
   const boxes={workspace:workspace.getBoundingClientRect().toJSON(),composer:before.composer.getBoundingClientRect().toJSON()};
   const structural=adapter.inspectStructure(before).ok,active=surface.validateActiveLayout(handle),privatePopover=workspace.hasAttribute('popover');
   draft.focus();draft.setSelectionRange(2,4);draft.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:null}));
   const input=surface.visibility(handle).workspace&&document.activeElement===draft&&draft.parentElement===parent&&draft.value===value&&draft.selectionStart===2;
   surface.showReading(handle);const restored=JSON.stringify(before.composer.getBoundingClientRect().toJSON())===JSON.stringify(original);
   surface.showWorkspace(handle);workspace.querySelector('button').click();const declarative=surface.visibility(handle).workspace===false;
   surface.showWorkspace(handle);const dialog=document.createElement('dialog');dialog.setAttribute('aria-modal','true');document.body.append(dialog);dialog.showModal();
   await Promise.resolve();const nativeWins=getComputedStyle(workspace).display==='none';dialog.remove();surface.dispose(handle);adapter.stop();
   return {shown,structural,active,privatePopover,input,restored,declarative,nativeWins,clean:!document.querySelector('[data-va-flow-root]')&&draft.parentElement===parent,boxes};
  });results.push({kind,...result});
  if(kind==='home'){
   // A stale pointer token after a declarative close must never reactivate
   // layout on a later native press, even if script cleanup never ran.
   await page.evaluate(async()=>{const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;let surface;const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>container}}),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});const binding={documentToken:'probe',producerToken:'probe',browserDocumentId:'probe',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'probe'})});const inspection=adapter.inspect();surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});const handle=await surface.mount({binding},inspection);surface.showWorkspace(handle);const exit=document.getElementById(handle.id+'_workspace_exit');exit.setAttribute('data-va-gesture',handle.id);exit.hidePopover();window.gestureProbe={surface,handle,adapter};});
   const before=await page.locator('form').evaluate(n=>n.getBoundingClientRect().toJSON()),box=await page.locator('textarea').boundingBox();
   await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();
   assert.deepEqual(await page.locator('form').evaluate(n=>n.getBoundingClientRect().toJSON()),before,'closed exit cannot revive geometry from a stale gesture');await page.mouse.up();
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
 console.log(JSON.stringify(results,null,2));assert(results.every(r=>r.shown&&r.structural&&r.active&&!r.privatePopover&&r.input&&r.restored&&r.declarative&&r.nativeWins&&r.clean));
}finally{await browser.close();}
