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
 // CSS-only breakpoint counterexample, not a newly observed ChatGPT topology.
 // The native fixture is explicitly responsive and all its controls fit.
 const responsive=await browser.newPage({viewport:{width:1440,height:1000}});
 await responsive.route('**/*',r=>r.request().url()==='https://chatgpt.com/c/'+C?r.fulfill({contentType:'text/html',body:legacy.replace('</head>','<style>#composer input[type=file]{max-width:100%}@media(max-width:760px){aside{display:none}header{height:110px;flex-wrap:wrap;gap:4px}header h1{font-size:14px}}</style></head>')}):r.abort());
 await responsive.goto('https://chatgpt.com/c/'+C);await responsive.addScriptTag({content:outputFiles[0].text});
 const initial=await responsive.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,createFlowMountSurface}=flowModule;let surface;
  const adapter=createChatGPTAdapter({document,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'local-probe',producerToken:'local-probe',browserDocumentId:'local-probe',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'local-probe'})});const inspection=adapter.inspect();if(!inspection.ok)return {inspection};
  surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});const handle=await surface.mount({binding},inspection);globalThis.probe={surface,handle,adapter,inspection};return {shown:surface.showWorkspace(handle),active:surface.validateActiveLayout(handle)};
 });
 const activeSidebarToggle=await responsive.evaluate(()=>{
  const {surface,handle}=probe,workspace=surface.frames(handle)[0].frame.parentElement,aside=document.querySelector('aside'),frame=workspace.querySelector('iframe'),out=[];
  for(const display of ['none','flex']){
   aside.style.display=display;
   const box=workspace.getBoundingClientRect();
   out.push({x:box.x,width:box.width,active:surface.validateActiveLayout(handle),sameFrame:surface.frames(handle)[0].frame===frame,refreshRequested:surface.needsNativeBaselineRefresh(handle)});
  }
  aside.style.removeProperty('display');return out;
 });
 assert.deepEqual(activeSidebarToggle,[
  {x:0,width:1440,active:true,sameFrame:true,refreshRequested:false},
  {x:260,width:1180,active:true,sameFrame:true,refreshRequested:false}
 ]);
 await responsive.evaluate(()=>probe.surface.showReading(probe.handle));
 await responsive.setViewportSize({width:420,height:1000});
 const narrow=await responsive.evaluate(()=>{
  const {surface,handle,adapter,inspection}=probe;const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const same=surface.isSameNativeRegions(handle),needsRefresh=surface.needsNativeBaselineRefresh(handle),frames=surface.frames(handle).map(x=>x.frame);const refreshed=surface.refreshNativeBaseline(handle,()=>adapter.inspect());const shown=surface.showWorkspace(handle);const result={same,needsRefresh,framesKept:frames.every((frame,i)=>frame===surface.frames(handle)[i].frame),fresh:!surface.needsNativeBaselineRefresh(handle),refreshed:!!refreshed,shown,workspace:rect(surface.frames(handle)[0].frame.parentElement),active:surface.validateActiveLayout(handle)};surface.showReading(handle);return result;
 });
 assert.deepEqual(initial,{shown:true,active:true});
 assert.equal(narrow.same,true);assert.equal(narrow.needsRefresh,true);assert.equal(narrow.refreshed,true);
 assert.equal(narrow.shown,true);assert.equal(narrow.active,true);assert.equal(narrow.framesKept,true);assert.equal(narrow.fresh,true);
 assert.equal(narrow.workspace.x,0);assert.equal(narrow.workspace.width,420);
 await responsive.setViewportSize({width:1440,height:1000});
 const wideAgain=await responsive.evaluate(()=>{const {surface,handle,adapter}=probe;const stale=surface.needsNativeBaselineRefresh(handle);const refreshed=!!surface.refreshNativeBaseline(handle,()=>adapter.inspect());const shown=surface.showWorkspace(handle),active=surface.validateActiveLayout(handle);surface.showReading(handle);return {stale,refreshed,shown,active};});
 assert.deepEqual(wideAgain,{stale:true,refreshed:true,shown:true,active:true});
 // The native sidebar can collapse without changing the viewport or any
 // recorded main-region attribute. Reusing its old left offset clips the
 // available workspace width even though the old active proof still passes.
 const sidebarToggle=await responsive.evaluate(()=>{
  const {surface,handle,adapter}=probe,frames=surface.frames(handle).map(x=>x.frame),aside=document.querySelector('aside');
  const results=[];
  for(const display of ['none','flex']){
   aside.style.display=display;
   const same=surface.isSameNativeRegions(handle),stale=surface.needsNativeBaselineRefresh(handle);
   const refreshed=stale&&!!surface.refreshNativeBaseline(handle,()=>adapter.inspect());
   const shown=surface.showWorkspace(handle),active=surface.validateActiveLayout(handle),box=frames[0].parentElement.getBoundingClientRect();
   results.push({same,stale,refreshed,shown,active,x:box.x,width:box.width,framesKept:frames.every((frame,i)=>frame===surface.frames(handle)[i].frame)});
   surface.showReading(handle);
  }
  surface.dispose(handle);adapter.stop();return results;
 });
 assert.deepEqual(sidebarToggle,[
  {same:true,stale:true,refreshed:true,shown:true,active:true,x:0,width:1440,framesKept:true},
  {same:true,stale:true,refreshed:true,shown:true,active:true,x:260,width:1180,framesKept:true}
 ]);await responsive.close();

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
   // CSS-only positioning changes must not retain a baseline for a different
   // containing-block model, even when attributes and node identities match.
   const changedPosition=document.createElement('style');
   changedPosition.textContent=`[data-va-flow-root="${handle.id}"]{position:${getComputedStyle(workspace.parentElement).position==='relative'?'static':'relative'}!important}`;
   document.head.append(changedPosition);
   const positionChangeRejected=surface.isSameNativeRegions(handle)&&!surface.validateActiveLayout(handle);
   surface.surrenderChanged();const positionNeedsReproof=surface.needsNativeBaselineRefresh(handle);
   changedPosition.remove();surface.showWorkspace(handle);
   if(!positionChangeRejected||!positionNeedsReproof)throw Error('positioning-change-must-reprove');
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
   // Native focus state may keep its class after the first input gesture.
   // Re-prove the closed native layout without recreating either private frame.
   await page.waitForFunction(()=>!document.getElementById(gestureProbe.handle.id+'_workspace_exit').matches(':popover-open'));
   const reproof=await page.evaluate(()=>{
    const {surface,handle,adapter}=gestureProbe,frames=surface.frames(handle).map(x=>x.frame),form=document.querySelector('form');
    const oldProofRejected=!surface.isSameNativeRegions(handle);
    const refreshed=surface.refreshNativeBaseline?.(handle,()=>adapter.inspect());
    const reopened=!!refreshed&&surface.showWorkspace(handle)&&surface.validateActiveLayout(handle);
    let reads=0;const activeRejected=surface.refreshNativeBaseline?.(handle,()=>{reads++;return adapter.inspect();})===null&&reads===0;
    surface.showReading(handle);form.setAttribute('tabindex','0');
    const semanticRejected=surface.refreshNativeBaseline?.(handle,()=>adapter.inspect())===null;
    form.removeAttribute('tabindex');
    const tool=form.querySelector('button'),oldStyle=tool.getAttribute('style');tool.style.display='none';
    const hiddenControlRejected=surface.refreshNativeBaseline?.(handle,()=>adapter.inspect())===null;
    if(oldStyle===null)tool.removeAttribute('style');else tool.setAttribute('style',oldStyle);surface.showWorkspace(handle);
    return {oldProofRejected,reopened,framesPreserved:surface.frames(handle).every((x,i)=>x.frame===frames[i]),activeRejected,semanticRejected,hiddenControlRejected};
   });
   assert.deepEqual(reproof,{oldProofRejected:true,reopened:true,framesPreserved:true,activeRejected:true,semanticRejected:true,hiddenControlRejected:true});
   await page.clock.install();
   await page.evaluate(()=>{document.querySelector('form').classList.remove('native-focus-ring');gestureProbe.surface.showReading(gestureProbe.handle);gestureProbe.surface.refreshNativeBaseline(gestureProbe.handle,()=>gestureProbe.adapter.inspect());if(!gestureProbe.surface.showWorkspace(gestureProbe.handle))throw Error('gesture-probe-workspace-not-open');handoffButton.addEventListener('pointerdown',()=>document.querySelector('form').classList.add('native-focus-ring'),{once:true});});
   const expiryBox=await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON());
   await page.mouse.move(expiryBox.x+expiryBox.width/2,expiryBox.y+expiryBox.height/2);await page.mouse.down();
   await page.clock.fastForward(3001);
   assert.equal(await page.evaluate(()=>document.querySelector('[data-va-input-handoff]')),null,'missing parent pointerup cannot retain handoff');
   assert.equal(await page.evaluate(()=>document.getElementById(gestureProbe.handle.id+'_workspace_exit').matches(':popover-open')),false);
   await page.mouse.up();
   await page.evaluate(()=>{document.querySelector('form').classList.remove('native-focus-ring');gestureProbe.surface.showReading(gestureProbe.handle);gestureProbe.surface.refreshNativeBaseline(gestureProbe.handle,()=>gestureProbe.adapter.inspect());if(!gestureProbe.surface.showWorkspace(gestureProbe.handle))throw Error('gesture-probe-workspace-not-open');});
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
 await management.evaluate(()=>{window.managementNotifications=[];window.m=flowModule.observeNativeProjectManagement({document,root:document.querySelector('#native'),onChanged:()=>managementNotifications.push(m.read())});document.querySelector('button').addEventListener('click',e=>{const b=e.currentTarget;b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));});});
 assert.deepEqual(await management.evaluate(()=>m.read()),[],'initial native expansion is not management intent');
 await management.getByRole('button',{name:'Manage'}).click();await management.evaluate(()=>{document.querySelector('#panel').style.cssText='height:0;overflow:hidden';});await management.getByRole('button',{name:'Manage'}).click();assert.deepEqual(await management.evaluate(()=>m.read()),[],'clipped transition cannot remove owned members');
 await management.evaluate(()=>document.querySelector('#panel').style.cssText='');await management.waitForFunction(()=>m.read().length===1);assert.deepEqual(await management.evaluate(()=>m.read()),[{projectId:P,refIds:[C]}]);
 await management.evaluate(()=>document.querySelector('nav').scrollTop=500);assert.equal((await management.evaluate(()=>m.read()))[0].refIds.length,1,'NAV scrolling does not revoke management intent');
 // F-01 deduplication is based on the visible members inside the explicitly
 // expanded native management panel. Inner scrolling has no DOM mutation.
 await management.evaluate(()=>{document.querySelector('nav').scrollTop=0;const panel=document.querySelector('#panel');panel.style.cssText='height:24px;overflow:auto';panel.innerHTML='<a style="display:block;height:24px" href="/c/33333333-3333-4333-8333-333333333333">A</a><a style="display:block;height:24px" href="/c/44444444-4444-4444-8444-444444444444">B</a>';});
 await management.waitForFunction(()=>managementNotifications.at(-1)?.[0]?.refIds.join() === '33333333-3333-4333-8333-333333333333');
 const innerScroll=await management.evaluate(async()=>{
  const panel=document.querySelector('#panel'),before=managementNotifications.length;let eventSeen=false;
  panel.addEventListener('scroll',()=>eventSeen=true,{once:true});panel.scrollTop=24;
  for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
  return {eventSeen,changed:managementNotifications.length>before,notified:managementNotifications.at(-1),actual:m.read()};
 });
 assert.equal(innerScroll.eventSeen,true);assert.deepEqual(innerScroll.actual,[{projectId:P,refIds:['44444444-4444-4444-8444-444444444444']}]);
 assert.equal(innerScroll.changed,true,'inner native scroll must notify the formal sidebar, not just change manual readback');assert.deepEqual(innerScroll.notified,innerScroll.actual);
 await management.evaluate(()=>{document.querySelector('#panel').style.cssText='height:0;overflow:hidden';});assert.deepEqual(await management.evaluate(()=>m.read()),[]);
 await management.evaluate(()=>m.stop());await management.close();
 console.log(JSON.stringify(results,null,2));assert(results.every(r=>r.shown&&r.structural&&r.active&&!r.privatePopover&&r.replacedHeaderRejected&&r.lateHeaderControlRejected&&r.interactiveShellRejected&&r.interactiveBaselineRejected&&r.input&&r.restored&&r.declarative&&r.nativeWins&&r.clean));
}finally{await browser.close();}
