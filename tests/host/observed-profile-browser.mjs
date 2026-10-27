import projectDetails from './fixtures/observed-sidebar-project-details-20261026.json' with {type:'json'};
import {materializePartitionedSidebar,observedHomeHTML,retainHiddenTitlebar,visibilityWakeAttributes,prepareHistoryRun,insertHistoryGap,clearHistoryGap} from './fixtures/observed-host-replay.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {CHATGPT_OBSERVED_PROFILE,waitForNativeLayout} from './src/host/chatgpt-observed-profile.mjs';export {createMountSurface} from './src/navigation/mount-surface.mjs';export {nativeHistoryPresentation,sidebarPresentationFits} from './src/host/native-history-list.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'observedModule'});
const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
try{
 if(process.argv.includes('--home-dock-only')){
  const page=await browser.newPage({viewport:{width:1000,height:700}}),url='https://chatgpt.com/';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedHomeHTML('33333333-3333-4333-8333-333333333333')}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const checks=await page.evaluate(async()=>{
   const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,createMountSurface}=observedModule;
   let surface;const adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n)===true,isOwnedSurface:n=>surface?.isOwnedSurface(n)===true});
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'home',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const composer=document.querySelector('form'),input=composer.querySelector('textarea'),originalStyle=composer.getAttribute('style');
   // The composer node and its native controls are unchanged; only a transparent
   // host wrapper differs. This is a counterexample, not a claimed live DOM capture.
   const wrapper=document.createElement('div');wrapper.style.display='contents';composer.before(wrapper);wrapper.append(composer);
   const wrapped=adapter.inspect(),parent=composer.parentElement;
   wrapper.style.opacity='.5';const opacityRejected=!adapter.inspect().homeDock;wrapper.style.opacity='';
   wrapper.setAttribute('role','group');const semanticWrapperRejected=!adapter.inspect().homeDock;wrapper.removeAttribute('role');
   const state=adapter.inspect(),checks={proposal:!!state.homeDock,transparentComposerWrapper:!!wrapped.homeDock,opacityRejected,semanticWrapperRejected};
   surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
   const handle=await surface.mount({binding},state);
   const enter=()=>{surface.refreshGeometry(handle,adapter.inspect());const settle=surface.prepareWorkspace(handle,{explicitEntry:false});const next=adapter.inspect();const ok=next.ok&&surface.refreshGeometry(handle,next)&&surface.showWorkspace(handle);settle?.(ok);return next;};
   const expanded=enter();checks.canvas=expanded.ok&&expanded.readingRect.height===562&&composer.getBoundingClientRect().top===614;
   checks.originalNode=composer.parentElement===parent&&document.querySelector('form')===composer&&input.value==='fixture draft'&&composer.getAttribute('style')===originalStyle;
   const probe=surface.withNativeReading(handle,()=>adapter.inspect(),()=>true);checks.probe=probe?.ok===true&&composer.getBoundingClientRect().top===614;
   surface.showReading(handle);checks.readingRestores=composer.getBoundingClientRect().top===302&&!composer.hasAttribute('data-va-home-dock');
   surface.refreshGeometry(handle,adapter.inspect());const settle=surface.prepareWorkspace(handle);settle?.(false);checks.failedEntryRestores=composer.getBoundingClientRect().top===302;
   const blocker=document.createElement('button');blocker.style.cssText='position:fixed;left:240px;top:640px;width:40px;height:20px';document.body.append(blocker);checks.destinationBlocked=!adapter.inspect().homeDock;blocker.remove();
   enter();const workspace=document.querySelector('[id$="_workspace"]');workspace.hidePopover();checks.directCloseRestores=composer.getBoundingClientRect().top===302;
   enter();wrapper.setAttribute('role','group');await new Promise(r=>setTimeout(r,0));checks.semanticChangeRestores=composer.getBoundingClientRect().top===302&&!surface.visibility(handle).workspace;wrapper.removeAttribute('role');
   enter();wrapper.setAttribute('contenteditable','true');await new Promise(r=>setTimeout(r,0));checks.editableChangeRestores=composer.getBoundingClientRect().top===302&&!surface.visibility(handle).workspace;wrapper.removeAttribute('contenteditable');
   enter();surface.suspend(handle,'revoked');checks.revocationRestores=composer.getBoundingClientRect().top===302;
   enter();surface.dispose(handle);checks.disableRestores=composer.getBoundingClientRect().top===302&&composer.getAttribute('style')===originalStyle&&input.value==='fixture draft'&&composer.parentElement===parent;
   // Re-mount for a real pointer journey driven by the existing browser runner.
   const next=adapter.inspect(),h=await surface.mount({binding},next);const settleNext=surface.prepareWorkspace(h);surface.refreshGeometry(h,adapter.inspect());surface.showWorkspace(h);settleNext?.(true);
   window.homeDockJourney={surface,adapter,handle:h,composer,input,checks};const tool=composer.querySelector('button');tool.addEventListener('click',()=>{checks.nativeToolClick=true;});
   return checks;
  });
  assert(Object.values(checks).every(Boolean),JSON.stringify(checks));
  await page.getByRole('button',{name:'Native tools',exact:true}).click();
  const interaction=await page.evaluate(async()=>{const {surface,adapter,handle,composer,input,checks}=homeDockJourney;await new Promise(r=>setTimeout(r,0));const result={nativeToolClick:checks.nativeToolClick===true,restoredAfterClick:composer.getBoundingClientRect().top===302,draftPreserved:input.value==='fixture draft',workspaceYielded:surface.visibility(handle).workspace===false};
   composer.querySelector('button').blur();surface.refreshGeometry(handle,adapter.inspect());const finish=surface.prepareWorkspace(handle);surface.refreshGeometry(handle,adapter.inspect());surface.showWorkspace(handle);finish?.(true);
   const lateControl=document.createElement('button');lateControl.style.cssText='position:fixed;left:240px;top:640px;width:40px;height:20px';document.body.append(lateControl);await new Promise(r=>setTimeout(r,0));
   result.lateDestinationControlRestores=composer.getBoundingClientRect().top===302&&!surface.visibility(handle).workspace;lateControl.remove();
   surface.refreshGeometry(handle,adapter.inspect());const redock=surface.prepareWorkspace(handle);surface.refreshGeometry(handle,adapter.inspect());surface.showWorkspace(handle);redock?.(true);
   // Unexpected rule removal restores native layout and withdraws the canvas.
   const ownStyle=[...document.head.querySelectorAll('style')].find(n=>n.textContent.includes('[data-va-home-dock='));ownStyle.remove();await new Promise(r=>setTimeout(r,0));result.ruleLossRestored=composer.getBoundingClientRect().top===302&&!surface.visibility(handle).workspace;
   composer.querySelector('button').blur();surface.refreshGeometry(handle,adapter.inspect());const next=surface.prepareWorkspace(handle);surface.refreshGeometry(handle,adapter.inspect());surface.showWorkspace(handle);next?.(true);
   const replacement=composer.cloneNode(true);replacement.removeAttribute('data-va-home-dock');composer.replaceWith(replacement);await new Promise(r=>setTimeout(r,0));
   result.replacementRestores=!surface.visibility(handle).workspace&&!composer.hasAttribute('data-va-home-dock')&&replacement.getBoundingClientRect().top===302;
   surface.dispose(handle);await adapter.stop();return result;});
  assert(Object.values(interaction).every(Boolean),JSON.stringify(interaction));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',checks,interaction}));await page.close();
 }else if(process.argv.includes('--home-space-only')){
  const page=await browser.newPage({viewport:{width:1000,height:700}}),url='https://chatgpt.com/';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedHomeHTML('33333333-3333-4333-8333-333333333333')}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const checks=await page.evaluate(async()=>{
   const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,createMountSurface}=observedModule;
   const reading=document.querySelector('.home-composer-anchor'),composer=document.querySelector('form'),root=document.querySelector('[data-app-shell-main-content-layout]');
   // Geometry-only counterexample to a small/centered welcome node. This is
   // NOT a new captured native tree; the approved existing selectors are reused.
   reading.style.cssText='position:absolute;left:100px;top:110px;width:400px;height:120px';
   let surface;const adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n)===true,isOwnedSurface:n=>surface?.isOwnedSurface(n)===true});
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'home',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const state=adapter.inspect(),r=state.readingRect;
   const checks={expandedAboveNativeComposer:state.ok&&r.x===220&&r.y===52&&r.width===780&&r.height===250};
   surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
   const handle=await surface.mount({binding},state);surface.showWorkspace(handle);
   const mounted=document.querySelector('[data-va-owned][id$="_workspace"]');
   checks.actualCanvas=mounted.getBoundingClientRect().width===780&&mounted.getBoundingClientRect().height===250;
   checks.originalMaskOnly=surface.isMasked(reading)&&!surface.isMasked(root)&&!surface.isMasked(reading.parentElement)&&!surface.isMasked(composer);
   checks.renewalAndReturn=adapter.inspect().readingRect.width===780&&adapter.isSameNativeRegions(state)&&adapter.isReturnSlotCurrent(state);
   const fallback=()=>{const next=adapter.inspect();return next.ok&&next.readingRect.x===320&&next.readingRect.y===110&&next.readingRect.width===400&&next.readingRect.height===120;};
   const tool=document.createElement('button');tool.style.cssText='position:absolute;left:20px;top:60px;width:30px;height:24px';root.append(tool);
   checks.nativeGutterControl=fallback()&&surface.refreshGeometry(handle,adapter.inspect())&&surface.visibility(handle).workspace&&document.elementFromPoint(245,70)===tool;tool.remove();
   tool.style.cssText='position:fixed;left:245px;top:70px;width:30px;height:24px';document.body.append(tool);
   checks.externalNativeControl=fallback()&&surface.refreshGeometry(handle,adapter.inspect())&&surface.visibility(handle).workspace&&document.elementFromPoint(250,75)===tool;tool.remove();
   const port=document.createElement('div');port.style.cssText='position:fixed;left:0;top:52px;width:200px;height:240px;overflow:auto';document.body.append(port);
   tool.style.cssText='position:absolute;left:240px;top:20px;width:30px;height:24px';port.append(tool);
   checks.clippedNativeMenuDoesNotShrinkCanvas=adapter.inspect().readingRect.width===780;
   tool.style.cssText='position:fixed;left:240px;top:70px;width:30px;height:24px';checks.fixedNativeMenuEscapeStillBlocks=fallback();
   tool.style.position='absolute';port.style.position='static';checks.absoluteOutsideContainingBlockStillBlocks=fallback();
   port.remove();
   const inline=document.createElement('span');inline.style.cssText='display:inline;position:relative;overflow:hidden';document.body.append(inline);inline.append(tool);
   checks.inlineOverflowIsNotAClip=fallback();inline.remove();
   const css=document.createElement('style');css.textContent='[data-app-shell-main-content-layout]::after{content:"";position:absolute;left:20px;top:60px;width:2px;height:2px}';document.head.append(css);checks.unknownPseudoFallsBack=fallback();css.textContent='html::after{content:"";position:fixed;left:245px;top:70px;width:30px;height:24px}';checks.htmlPseudoFallsBack=fallback();css.remove();
   root.style.clipPath='inset(0px 30px)';checks.clippedAddedAreaFallsBack=fallback();root.style.clipPath='';
   root.style.transform='translateX(0px)';checks.transformedAddedAreaFallsBack=fallback();root.style.transform='';
   const opaque=document.createElement('native-widget');root.append(opaque);checks.opaqueAddedAreaFallsBack=fallback();opaque.remove();
   checks.freshProofRecovers=adapter.inspect().readingRect.width===780&&surface.refreshGeometry(handle,adapter.inspect())&&surface.visibility(handle).workspace;
   surface.showReading(handle);checks.readingRestored=!surface.isMasked(reading)&&composer.querySelector('textarea').value==='fixture draft';surface.showWorkspace(handle);
   const prior=adapter.inspect(),parent=reading.parentElement,wrapper=document.createElement('div');parent.append(wrapper);wrapper.append(reading,composer);
   checks.ancestorReplacementNotBorrowed=!adapter.isSameNativeRegions(prior)&&!adapter.isReturnSlotCurrent(prior);
   const current=adapter.inspect();checks.newProofIdentity=current.ok&&current.regionEpoch!==prior.regionEpoch&&current.homeLayoutNodes.includes(wrapper);
   surface.dispose(handle);await adapter.stop();return checks;
  });
  assert(Object.values(checks).every(Boolean),JSON.stringify(checks));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',checks}));await page.close();
 }else if(process.argv.includes('--sidebar-composition-only')){
  const page=await browser.newPage({viewport:{width:1100,height:900}}),url='https://chatgpt.com/';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedHomeHTML('33333333-3333-4333-8333-333333333333')}):r.abort());
  await page.goto(url);await page.evaluate(materializePartitionedSidebar,projectDetails.sidebarStructure.rows);await page.addScriptTag({content:outputFiles[0].text});
  const checks=await page.evaluate(async()=>{
   const {createMountSurface,createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE}=observedModule;
   const surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
   const adapter=createChatGPTAdapter({document,profile:{...CHATGPT_OBSERVED_PROFILE,origins:[location.origin]},isOwnedMask:n=>surface.isMasked(n),isOwnedSurface:n=>surface.isOwnedSurface(n)});
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const inspected=adapter.inspect();if(!inspected.sidebarPlacement)throw Error('missing placement '+JSON.stringify({ok:inspected.ok,reason:inspected.reason,rect:inspected.sidebarRect}));
   const {project,recent,root,control,scroll}=partitionedFixture,nativeHTML=project.outerHTML,nativeStyle=project.getAttribute('style'),top=recent.getBoundingClientRect().top;
   const handle=await surface.mount({binding},inspected);surface.showWorkspace(handle);
   const slot=root.querySelector('[data-va-sidebar-slot]'),sidebar=document.querySelector('[id$="_sidebar"]'),frame=surface.frames(handle).find(s=>s.role==='sidebar').frame;
   const checks={compositionSelected:inspected.historyMaskRoots.length===0,formalBothVisible:surface.visibility(handle).sidebar&&surface.visibility(handle).workspace,flowReserved:recent.getBoundingClientRect().top>top+240,nativeProjectUnchanged:project.outerHTML===nativeHTML,nativeNeverMasked:!document.querySelector('[data-va-mask-sidebar]')};
   const b=control.getBoundingClientRect();checks.nativeProjectControlReachable=control.contains(document.elementFromPoint(b.x+8,b.y+8));
   document.querySelector('textarea').focus();checks.nativeInputKeepsSidebar=surface.visibility(handle).sidebar&&!surface.visibility(handle).workspace;
   surface.showWorkspace(handle);surface.showReading(handle);checks.readingKeepsFrame=surface.visibility(handle).sidebar&&frame===surface.frames(handle).find(s=>s.role==='sidebar').frame;
   surface.showWorkspace(handle);sidebar.hidePopover();checks.closedSlotReleasesFlow=slot.getBoundingClientRect().height===0&&recent.getBoundingClientRect().top===top;
   surface.showWorkspace(handle,{roles:['sidebar']});scroll.scrollTop=50;
   const next=adapter.inspect();surface.refreshGeometry(handle,next);checks.scrollAnchored=sidebar.getBoundingClientRect().y===slot.getBoundingClientRect().y&&surface.visibility(handle).workspace;
   const scrollBefore=scroll.scrollTop,probe=surface.withNativeReading(handle,()=>({top:scroll.scrollTop,height:slot.getBoundingClientRect().height}),()=>true);checks.readingProbePreservesFlow=!!probe&&probe.top===scrollBefore&&probe.height>=240&&scroll.scrollTop===scrollBefore;
   scroll.scrollTop=520;const deep=scroll.scrollTop,clipped=adapter.inspect();surface.refreshGeometry(handle,clipped);
   checks.clippedAnchorRetained=clipped.sidebarPlacement?.slot===slot&&slot.isConnected&&slot.getBoundingClientRect().height>=240&&scroll.scrollTop===deep&&surface.visibility(handle).workspace;
   scroll.scrollTop=0;surface.refreshGeometry(handle,adapter.inspect());surface.showWorkspace(handle,{roles:['sidebar']});
   project.style.height='36px';control.setAttribute('aria-expanded','false');surface.refreshGeometry(handle,adapter.inspect());
   checks.nativeCollapseDoesNotReplaceFrame=slot===root.firstElementChild&&frame===surface.frames(handle).find(s=>s.role==='sidebar').frame&&control.getAttribute('aria-expanded')==='false';
   project.setAttribute('style',nativeStyle);control.setAttribute('aria-expanded','fixture');surface.refreshGeometry(handle,adapter.inspect());
   const unknown=document.createElement('button');unknown.style.cssText='position:fixed;left:0;top:400px;width:100px;height:30px';unknown.textContent='Unknown';root.append(unknown);
   await new Promise(r=>setTimeout(r,0));checks.unknownObstructionWithdrawsOnlySidebar=!surface.visibility(handle).sidebar&&surface.visibility(handle).workspace;
   unknown.remove();surface.refreshGeometry(handle,adapter.inspect());surface.showWorkspace(handle,{roles:['sidebar']});
   const nativeScrollHeight=scroll.style.height;scroll.style.height='480px';surface.refreshGeometry(handle,adapter.inspect());surface.resizeSidebar(handle,500);
   checks.intrinsicSizeRespectsViewport=slot.getBoundingClientRect().height===320;
   scroll.style.height=nativeScrollHeight;surface.refreshGeometry(handle,adapter.inspect());
   checks.viewportGrowthRestoresRequestedSize=slot.getBoundingClientRect().height===500;
   const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();await new Promise(r=>setTimeout(r,0));
   const retainedHeight=slot.getBoundingClientRect().height,retainedScroll=scroll.scrollTop;surface.resizeSidebar(handle,240);
   checks.hiddenLateSizePreservesFlow=slot.getBoundingClientRect().height===retainedHeight&&scroll.scrollTop===retainedScroll;
   checks.nativeModalPreservesLayout=retainedHeight>=240&&!surface.visibility(handle).sidebar;dialog.remove();
   surface.refreshGeometry(handle,adapter.inspect());surface.showWorkspace(handle,{roles:['sidebar']});checks.reshowAppliesDeferredSize=slot.getBoundingClientRect().height===240;

   surface.dispose(handle);checks.disposeLeavesNative=project.outerHTML===nativeHTML&&!root.querySelector('[data-va-sidebar-slot]');
   root.style.display='grid';checks.gridNotAdmitted=!adapter.inspect().sidebarPlacement;
   await adapter.stop();return checks;
  });assert(Object.values(checks).every(Boolean),JSON.stringify(checks));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',checks}));await page.close();
 }else if(process.argv.includes('--sidebar-region-only')){
  const page=await browser.newPage({viewport:{width:1000,height:700}}),url='https://chatgpt.com/';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedHomeHTML('33333333-3333-4333-8333-333333333333')}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const checks=await page.evaluate(async()=>{
   const {nativeHistoryPresentation,sidebarPresentationFits,createURLPolicy,createMountSurface}=observedModule;
   const root=document.querySelector('#list'),source=document.querySelector('nav'),saved=root.firstElementChild;
   source.style.cssText='height:500px;overflow:auto';root.style.height='700px';
   const list=document.createElement('div');list.setAttribute('role','list');root.replaceChildren(list);
   const local=document.createElement('div');local.style.height='37px';local.innerHTML='<a href="/local/fixture">Native draft</a>';list.append(local);
   const row=n=>{const item=saved.cloneNode(true);item.style.height='37px';item.querySelector('a').href='/c/'+String(n).padStart(8,'0')+'-3333-4333-8333-333333333333';return item;};
   const rows=[row(1),row(2)];list.append(...rows);
   const options={document,source,root,urlPolicy:createURLPolicy()},first=nativeHistoryPresentation(options);
   const checks={mixedRunUsesClearRemainder:first.rect.y===189&&first.rect.height===363&&sidebarPresentationFits(first.rect),onlyStableMasks:first.maskRoots.length===2&&first.maskRoots.every((n,i)=>n===rows[i])};
   const obstacle=document.createElement('button');obstacle.textContent='Unknown native control';obstacle.style.cssText='position:fixed;left:0;top:350px;width:100px;height:30px';source.append(obstacle);
   const blocked=nativeHistoryPresentation(options);checks.unknownControlBlocksExpansion=blocked.rect.height===74&&!sidebarPresentationFits(blocked.rect);obstacle.remove();
   const spacer=document.createElement('div');spacer.style.height='500px';list.append(spacer,row(3),row(4),row(5));
   const visible=nativeHistoryPresentation(options);checks.offscreenLongerRunNotChosen=visible.maskRoots[0]===rows[0]&&visible.rect.height===74;
   spacer.style.height='20px';const fitting=nativeHistoryPresentation(options);checks.usableVisibleRunChosen=fitting.maskRoots.length===3&&sidebarPresentationFits(fitting.rect);
   const pinned=nativeHistoryPresentation({...options,preferredMaskRoots:rows});checks.pinnedSelectionNotMoved=pinned.maskRoots[0]===rows[0]&&pinned.rect.height===74;
   const bad=document.createElement('input');fitting.maskRoots[0].append(bad);const safe=nativeHistoryPresentation(options);checks.unsafeRunNotChosen=safe.maskRoots[0]===rows[0];bad.remove();
   // Returning to the captured mixed shape must actually mount the formal
   // sidebar while leaving the unmarked native draft and its action intact.
   list.replaceChildren(local,...rows);rows.forEach(r=>r.style.height='37px');
   const surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
   const adapter=observedModule.createChatGPTAdapter({document,profile:observedModule.CHATGPT_OBSERVED_PROFILE,isOwnedMask:n=>surface.isMasked(n)});
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const inspected=adapter.inspect(),handle=await surface.mount({binding},inspected);surface.showWorkspace(handle);
   checks.formalSidebarMounted=surface.visibility(handle).sidebar===true&&surface.visibility(handle).workspace===true;
   checks.nativeDraftPreserved=!surface.isMasked(local)&&getComputedStyle(local).visibility==='visible'&&local.querySelector('a').getAttribute('href')==='/local/fixture';
   surface.dispose(handle);await adapter.stop();return checks;
  });
  assert(Object.values(checks).every(Boolean),JSON.stringify(checks));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',checks}));await page.close();
 }else if(process.argv.includes('--history-ready-only')){
  const page=await browser.newPage({viewport:{width:1000,height:700}}),url='https://chatgpt.com/';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedHomeHTML('33333333-3333-4333-8333-333333333333')}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  await page.evaluate(prepareHistoryRun);await page.evaluate(insertHistoryGap);
  await page.evaluate(()=>{window.readyDone=false;window.readyResult=null;window.readyTask=observedModule.waitForNativeLayout({document,profile:observedModule.CHATGPT_OBSERVED_PROFILE,timeoutMs:1200}).then(v=>{window.readyResult=v;window.readyDone=true;});});
  await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>readyDone),false,'unsafe interleaved history cannot pass preparation');
  await page.evaluate(clearHistoryGap);await page.waitForFunction(()=>readyDone);assert.equal(await page.evaluate(()=>readyResult),true);
  const stable=await page.evaluate(async()=>{
   const started=performance.now();let done=false;const pending=observedModule.waitForNativeLayout({document,profile:observedModule.CHATGPT_OBSERVED_PROFILE,timeoutMs:1000}).then(v=>{done=true;return v;});
   await new Promise(r=>setTimeout(r,100));const list=document.querySelector('#list');list.prepend(list.lastElementChild);
   await new Promise(r=>setTimeout(r,90));const stillWaiting=!done;return {stillWaiting,ready:await pending,elapsed:performance.now()-started};
  });assert(stable.stillWaiting&&stable.ready&&stable.elapsed>=240,'row changes restart only the 150ms stability interval');
  await page.evaluate(insertHistoryGap);
  const blocked=await page.evaluate(async()=>{let reason;const started=performance.now();const ready=await observedModule.waitForNativeLayout({document,profile:observedModule.CHATGPT_OBSERVED_PROFILE,timeoutMs:400,onFailure:r=>reason=r});return {ready,reason,elapsed:performance.now()-started};});
  assert.equal(blocked.ready,false);assert.equal(blocked.reason,'layout-history-sibling-overlap');assert(blocked.elapsed<800,'unsafe history cannot extend the total deadline');
  await page.evaluate(clearHistoryGap);
  const unstable=await page.evaluate(async()=>{
   let reason;const list=document.querySelector('#list'),clock=setInterval(()=>list.prepend(list.lastElementChild),75);
   try{const ready=await observedModule.waitForNativeLayout({document,profile:observedModule.CHATGPT_OBSERVED_PROFILE,timeoutMs:400,onFailure:r=>reason=r});return {ready,reason};}finally{clearInterval(clock);}
  });assert.equal(unstable.ready,false);assert.equal(unstable.reason,'layout-history-row-unstable','safe but changing rows must remain eligible for one later full preparation');
  const expiredDuringProof=await page.evaluate(async()=>{
   const now=performance.now.bind(performance),computed=window.getComputedStyle;let clock=0,expire=false;
   performance.now=()=>clock;window.getComputedStyle=function(...args){if(expire)clock=400;return computed.apply(this,args);};
   const expireProof=setTimeout(()=>{expire=true;},75);
   try{return await observedModule.waitForNativeLayout({document,profile:observedModule.CHATGPT_OBSERVED_PROFILE,timeoutMs:400});}finally{clearTimeout(expireProof);performance.now=now;window.getComputedStyle=computed;}
  });assert.equal(expiredDuringProof,false,'a synchronous final proof crossing the deadline cannot be admitted');
  console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',checks:{historyWaitsForFullProof:true,orderedRowsStable:true,unsafeHistoryDeadlinePreserved:true,unstableRowsClassifiedForBoundedRecovery:true,deadlineCheckedAfterSynchronousProof:true}}));await page.close();
 }else{
 for(const focusableViewport of [false,true]){
 const page=await browser.newPage({viewport:{width:1000,height:700}}),id='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+id;
 await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:focusableViewport?observedDesktopHTML(id).replace('<div data-app-action-timeline-scroll>', '<div data-app-action-timeline-scroll role="region" tabindex="0">'):observedDesktopHTML(id)}):r.abort());
 await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
 // A second native app titlebar without the main return slot must not make
 // the conversation titlebar ambiguous. Preserve rejection when both own slots.
 await page.evaluate(()=>{const other=document.createElement('header');other.setAttribute('data-app-shell-titlebar','');other.id='other-native-titlebar';other.style.cssText='left:0;top:0;width:200px;height:40px';document.body.prepend(other);});
 if(focusableViewport)await page.evaluate(()=>document.querySelector('[data-slate-sidebar-content]').removeAttribute('data-slate-sidebar-content'));
 for(const attribute of visibilityWakeAttributes){
  const ready=await page.evaluate(async attribute=>{
   const node=document.querySelector('[data-app-shell-titlebar]:has([data-app-shell-main-titlebar])');node.setAttribute(attribute,'');
   let settled=false;const pending=observedModule.waitForNativeLayout({document,profile:observedModule.CHATGPT_OBSERVED_PROFILE,timeoutMs:1000}).then(result=>{settled=true;return result;});
   await new Promise(resolve=>setTimeout(resolve,180));const waited=!settled;node.removeAttribute(attribute);
   return {waited,ready:await pending};
  },attribute);assert.deepEqual(ready,{waited:true,ready:true},attribute+' alone wakes the complete proof');
 }
 // Same-route retained native trees are hidden after SPA navigation. Keep the
 // duplicate in the document throughout the real layout/mount test.
 await page.evaluate(retainHiddenTitlebar);
 const readiness=await page.evaluate(async()=>{
  const sidebar=document.querySelector('[data-slate-sidebar-content]')??document.querySelector('nav');sidebar.style.display='none';let done=false;
  const pending=observedModule.waitForNativeLayout({document,profile:observedModule.CHATGPT_OBSERVED_PROFILE,timeoutMs:2000}).then(v=>{done=true;return v;});
  await new Promise(r=>setTimeout(r,180));const hiddenWaited=!done;sidebar.style.display='';const ready=await pending;return {hiddenWaited,ready};
 });assert.deepEqual(readiness,{hiddenWaited:true,ready:true});
 const checks=await page.evaluate(async focusableViewport=>{
  const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,createMountSurface}=observedModule;let surface;const proposals=[];
  const adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n)===true,isOwnedSurface:n=>surface?.isOwnedSurface(n)===true});
  const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'parent',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>{proposals.push(p);return {state:'accepted',localSeq:p.localSeq,receiptId:'fixture'};}});for(let i=0;i<40;i++)await Promise.resolve();
  const viewport=document.querySelector('[data-app-action-timeline-scroll]');const marker=document.createElement('div');marker.id='layout-marker';viewport.insertBefore(marker,viewport.lastElementChild);const role=viewport.getAttribute('role'),tabindex=viewport.getAttribute('tabindex');
  const other=document.querySelector('#other-native-titlebar');
  const falseSlot=document.createElement('div');falseSlot.setAttribute('data-app-shell-main-titlebar','');other.append(falseSlot);
  const ambiguousRejected=adapter.inspect().ok===false;falseSlot.remove();
  if(!ambiguousRejected)throw Error('two-slot-bearing-titlebars-admitted');
  const cached=document.querySelector('#cached-native-titlebar');
  const hiddenDuplicateAccepted=adapter.inspect().ok;
  cached.hidden=false;const visibleDuplicateRejected=!adapter.inspect().ok;cached.hidden=true;
  const inspection=adapter.inspect();if(!inspection.ok)throw Error(inspection.reason);
  surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});const handle=await surface.mount({binding},inspection);surface.showWorkspace(handle);for(let i=0;i<40;i++)await Promise.resolve();
  const result={hiddenDuplicateAccepted,visibleDuplicateRejected,viewportShape:role===(focusableViewport?'region':null)&&tabindex===(focusableViewport?'0':null),bodyObservationPresent:proposals.some(p=>p.kind==='current-object'||p.kind==='current-observation'),noMaskedBodyInvalidation:proposals.filter(p=>p.kind==='current-object'||p.kind==='current-observation').every(p=>(p.kind==='current-observation'?p.payload.body:p.payload).association==='explicit-body-id'),profileSelected:inspection.profileId===profile.id,bodyConfigured:profile.currentBody.conversationIdSource==='message-elements',nativeTitle:proposals.some(p=>p.payload?.candidates?.some(c=>c.nativeTitle==='Native A')),noFabricatedMembership:proposals.every(p=>(p.payload?.membershipClaims??[]).every(c=>c.asserted==='UNKNOWN')),readingMasked:surface.isMasked(document.querySelector('#reading')),historyMasked:surface.isMasked(document.querySelector('#list')),searchVisible:getComputedStyle(document.querySelector('#heading')).visibility==='visible',composerVisible:getComputedStyle(document.querySelector('textarea')).visibility==='visible',geometryStillValid:adapter.inspect().ok};
  let scans=0;
  result.synchronousReadingProbe=surface.withNativeReading(handle,()=>{scans++;return getComputedStyle(document.querySelector('#reading')).visibility==='visible'&&[...document.querySelectorAll('[data-va-mask-sidebar]')].every(n=>getComputedStyle(n).visibility==='visible');},()=>true)===true&&scans===1&&surface.visibility(handle).workspace;
  surface.showReading(handle);surface.showWorkspace(handle);
  result.nestedProbeRejected=surface.withNativeReading(handle,()=>surface.withNativeReading(handle,()=>true,()=>true),()=>true)===null;
  result.asyncProbeRejected=surface.withNativeReading(handle,()=>Promise.resolve(true),()=>true)===null&&!surface.visibility(handle).workspace;
  surface.showWorkspace(handle);
  let permitted=true;
  result.authorityLossDoesNotRestore=surface.withNativeReading(handle,()=>{permitted=false;return true;},()=>permitted)===null&&!surface.visibility(handle).workspace;
  surface.showWorkspace(handle);
  result.nativeInputDoesNotRestore=surface.withNativeReading(handle,()=>{document.querySelector('textarea').dispatchEvent(new Event('focusin',{bubbles:true}));return true;},()=>true)===null&&!surface.visibility(handle).workspace;
  surface.showWorkspace(handle);
  const workspaceNode=document.querySelector('[data-va-owned][id$="_workspace"]');
  const cancelOpen=e=>{if(e.newState==='open')e.preventDefault();};workspaceNode.addEventListener('beforetoggle',cancelOpen);
  result.cancelledOpenDoesNotReturnProof=surface.withNativeReading(handle,()=>true,()=>true)===null&&!surface.visibility(handle).workspace;
  workspaceNode.removeEventListener('beforetoggle',cancelOpen);surface.showWorkspace(handle);
  const replaceBody=e=>{if(e.newState==='open'){const root=document.querySelector('#reading');root.firstElementChild.replaceWith(root.firstElementChild.cloneNode(true));}};
  workspaceNode.addEventListener('beforetoggle',replaceBody);
  result.sameIdentityReplacementRejectsProof=surface.withNativeReading(handle,()=>true,()=>true)===null&&!surface.visibility(handle).workspace;
  workspaceNode.removeEventListener('beforetoggle',replaceBody);
  surface.dispose(handle);
  result.fallbackHistoryStillNative=inspection.historySource===document.querySelector('nav');
  result.emptyMarkerUnchanged=marker.isConnected&&marker.childNodes.length===0&&marker.attributes.length===1;
  marker.setAttribute('tabindex','0');result.focusableMarkerRejected=!adapter.inspect().ok;marker.removeAttribute('tabindex');
  marker.style.height='20px';result.visibleMarkerRejected=!adapter.inspect().ok;marker.style.height='';
  const decoration=document.createElement('style');decoration.textContent='#layout-marker::before {content:"";position:fixed;inset:0;background:red}';document.head.append(decoration);result.paintedMarkerRejected=!adapter.inspect().ok;decoration.remove();
  marker.append(document.createElement('button'));result.markerChildRejected=!adapter.inspect().ok;marker.replaceChildren();
  result.markerRecovery=adapter.inspect().ok;adapter.stop();result.draftPreserved=document.querySelector('textarea').value==='fixture draft';result.viewportIdentityPreserved=document.querySelector('[data-app-action-timeline-scroll]')===viewport&&viewport.getAttribute('role')===role&&viewport.getAttribute('tabindex')===tabindex;return result;
 },focusableViewport);
 assert(Object.values(checks).every(v=>v===true),JSON.stringify(checks));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',checks,focusableViewport,authorization:'FIXTURE_NOT_LIVE_SCOPE'}));await page.close();
 }
 // Home has a centered composer, not the conversation timeline. Exercise
 // only the new native boundary; reuse the existing real mount and renderer URL.
 const home=await browser.newPage({viewport:{width:1000,height:700}});
 const homeHTML=observedHomeHTML('33333333-3333-4333-8333-333333333333').replace('fixture draft','home draft');
 await home.route('**/*',r=>r.request().url()==='https://chatgpt.com/'?r.fulfill({contentType:'text/html',body:homeHTML}):r.abort());
 await home.goto('https://chatgpt.com/');await home.addScriptTag({content:outputFiles[0].text});
 const homeChecks=await home.evaluate(async()=>{
  const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,createMountSurface}=observedModule;
  let surface;const adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n)===true,isOwnedSurface:n=>surface?.isOwnedSurface(n)===true});
  const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'home',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
  const inspection=adapter.inspect();if(!inspection.ok)throw Error(inspection.reason);
  surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
  const handle=await surface.mount({binding},inspection);surface.showWorkspace(handle);
  const reading=document.querySelector('.home-composer-anchor'),composer=document.querySelector('form');
  const checks={homeBoundary:inspection.reading===reading,composerProtected:inspection.composer===composer&&!surface.isMasked(composer)&&getComputedStyle(composer).visibility==='visible',welcomeMasked:surface.isMasked(reading),geometryCurrent:adapter.inspect().ok};
  surface.showReading(handle);checks.nativeReturnUnmasks=!surface.isMasked(reading);surface.dispose(handle);
  const rogue=document.createElement('textarea');reading.append(rogue);checks.inputInWelcomeRefused=adapter.inspect().reason==='unsafe-native-home-layout';rogue.remove();
  const duplicate=reading.cloneNode(true);reading.after(duplicate);checks.ambiguousHomeRefused=adapter.inspect().reason==='missing-or-ambiguous-native-boundary';duplicate.remove();
  const nav=document.querySelector('nav'),list=document.querySelector('#list');
  nav.style.cssText='height:400px;overflow:auto';list.style.height='700px';
  let clipped=adapter.inspect();checks.longHistoryClipped=clipped.ok&&clipped.sidebarRect.y===152&&clipped.sidebarRect.height===300;
  nav.scrollTop=50;clipped=adapter.inspect();checks.scrolledHistoryClipped=clipped.ok&&clipped.sidebarRect.y===102&&clipped.sidebarRect.height===350;
  const neighbor=document.createElement('button');neighbor.textContent='Native control';neighbor.style.cssText='position:fixed;left:10px;top:200px;width:40px;height:30px';nav.append(neighbor);
  checks.overlappingNativeControlRefused=adapter.inspect().ok&&adapter.inspect().preserveNativeSidebar&&adapter.inspect().sidebarRect===null;neighbor.remove();
  nav.style.transform='rotate(180deg)';checks.transformedScrollportRefused=adapter.inspect().ok&&adapter.inspect().preserveNativeSidebar&&adapter.inspect().sidebarRect===null;nav.style.transform='';
  nav.style.top='800px';checks.fullyClippedListRefused=adapter.inspect().ok&&adapter.inspect().sidebarRect===null;
  nav.style.top='52px';nav.scrollTop=0;
  const saved=list.firstElementChild;const group=document.createElement('div');group.setAttribute('role','list');list.append(group);group.append(saved);saved.style.height='37px';
  const local=document.createElement('div');local.setAttribute('role','listitem');local.style.height='37px';local.innerHTML='<a href="/local/draft-fixture">Native unsent chat</a>';group.prepend(local);
  const second=saved.cloneNode(true);second.querySelector('a').href='/c/44444444-4444-4444-8444-444444444444';group.append(second);
  const spinner=document.createElement('span');group.append(spinner);
  await adapter.stop();await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
  const partition=adapter.inspect();checks.localDraftRetained=partition.ok&&partition.historyMaskRoots.length===2&&partition.historyMaskRoots[0]===saved&&partition.sidebarRect.y===189&&partition.sidebarRect.height===263;
  const partitionHandle=await surface.mount({binding},partition);surface.showWorkspace(partitionHandle);
  checks.localDraftNotMasked=!surface.isMasked(local)&&getComputedStyle(local).visibility==='visible'&&surface.isMasked(saved)&&surface.visibility(partitionHandle).sidebar&&surface.visibility(partitionHandle).workspace&&adapter.inspect().ok;
  const mixed=adapter.inspect();local.remove();spinner.remove();
  const pure=adapter.inspect();checks.loadingCompletionKeepsRowMasks=pure.ok&&pure.regionEpoch===mixed.regionEpoch&&pure.historyMaskRoots.length===mixed.historyMaskRoots.length&&pure.historyMaskRoots.every((node,i)=>node===mixed.historyMaskRoots[i]);
  group.prepend(local);group.append(spinner);
  const added=second.cloneNode(true);added.removeAttribute('data-va-mask-sidebar');added.querySelector('a').href='/c/55555555-5555-4555-8555-555555555555';spinner.before(added);
  const expanded=adapter.inspect();checks.appendedNativeRowDoesNotReplaceMask=expanded.ok&&expanded.regionEpoch===mixed.regionEpoch&&expanded.historyMaskRoots.length===2&&!surface.isMasked(added)&&getComputedStyle(added).visibility==='visible';added.remove();
  group.insertBefore(second,saved);checks.reorderedPinnedRowsRefused=adapter.inspect().ok&&adapter.inspect().regionEpoch===mixed.regionEpoch;group.insertBefore(saved,second);
  const beforeScroll=adapter.inspect();nav.style.height='180px';nav.scrollTop=180;
  const afterScroll=adapter.inspect();checks.clippedRunKeepsMaskIdentity=afterScroll.ok&&afterScroll.regionEpoch===beforeScroll.regionEpoch&&afterScroll.historyMaskRoots.length===2&&afterScroll.historyMaskRoots.every((n,i)=>n===beforeScroll.historyMaskRoots[i]);
  const hiddenControl=document.createElement('input');saved.append(hiddenControl);checks.clippedUnsafeRowStillRejected=adapter.inspect().ok&&adapter.inspect().preserveNativeSidebar;hiddenControl.remove();
  surface.dispose(partitionHandle);nav.style.height='400px';nav.scrollTop=0;
  saved.after(local);checks.interleavedLocalDraftRefused=adapter.inspect().ok&&adapter.inspect().preserveNativeSidebar;group.prepend(local);
  second.style.marginTop='4px';checks.unknownGapRefused=adapter.inspect().ok&&adapter.inspect().preserveNativeSidebar;
  checks.draftPreserved=composer.querySelector('textarea').value==='home draft';await adapter.stop();return checks;
 });
 assert(Object.values(homeChecks).every(Boolean),JSON.stringify(homeChecks));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',homeChecks}));await home.close();
}
}finally{await browser.close();}
