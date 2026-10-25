import {observedHomeHTML,retainHiddenTitlebar,visibilityWakeAttributes} from './fixtures/observed-host-replay.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {CHATGPT_OBSERVED_PROFILE,waitForNativeLayout} from './src/host/chatgpt-observed-profile.mjs';export {createMountSurface} from './src/navigation/mount-surface.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'observedModule'});
const browser=await chromium.launch({headless:true});
try{
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
  const adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n)===true});
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
  result.synchronousReadingProbe=surface.withNativeReading(handle,()=>{scans++;return getComputedStyle(document.querySelector('#reading')).visibility==='visible';},()=>true)===true&&scans===1&&surface.visibility(handle).workspace;
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
  let surface;const adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n)===true});
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
  checks.overlappingNativeControlRefused=adapter.inspect().reason==='unsafe-native-history-list'&&adapter.inspect().historyFailure==='sibling-overlap';neighbor.remove();
  nav.style.transform='rotate(180deg)';checks.transformedScrollportRefused=adapter.inspect().reason==='unsafe-native-history-list'&&adapter.inspect().historyFailure==='geometry';nav.style.transform='';
  nav.style.top='800px';checks.fullyClippedListRefused=adapter.inspect().ok===false;
  nav.style.top='52px';nav.scrollTop=0;
  const saved=list.firstElementChild;const group=document.createElement('div');group.setAttribute('role','list');list.append(group);group.append(saved);saved.style.height='37px';
  const local=document.createElement('div');local.setAttribute('role','listitem');local.style.height='37px';local.innerHTML='<a href="/local/draft-fixture">Native unsent chat</a>';group.prepend(local);
  const second=saved.cloneNode(true);second.querySelector('a').href='/c/44444444-4444-4444-8444-444444444444';group.append(second);
  const spinner=document.createElement('span');group.append(spinner);
  await adapter.stop();await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
  const partition=adapter.inspect();checks.localDraftRetained=partition.ok&&partition.historyMaskRoots.length===2&&partition.historyMaskRoots[0]===saved&&partition.sidebarRect.y===189&&partition.sidebarRect.height===74;
  const partitionHandle=await surface.mount({binding},partition);surface.showWorkspace(partitionHandle);
  checks.localDraftNotMasked=!surface.isMasked(local)&&getComputedStyle(local).visibility==='visible'&&surface.isMasked(saved)&&adapter.inspect().ok;
  const mixed=adapter.inspect();local.remove();spinner.remove();
  const pure=adapter.inspect();checks.loadingCompletionKeepsRowMasks=pure.ok&&pure.regionEpoch===mixed.regionEpoch&&pure.historyMaskRoots.length===mixed.historyMaskRoots.length&&pure.historyMaskRoots.every((node,i)=>node===mixed.historyMaskRoots[i]);
  group.prepend(local);group.append(spinner);
  const added=second.cloneNode(true);added.removeAttribute('data-va-mask-sidebar');added.querySelector('a').href='/c/55555555-5555-4555-8555-555555555555';spinner.before(added);
  const expanded=adapter.inspect();checks.appendedNativeRowDoesNotReplaceMask=expanded.ok&&expanded.regionEpoch===mixed.regionEpoch&&expanded.historyMaskRoots.length===2&&!surface.isMasked(added)&&getComputedStyle(added).visibility==='visible';added.remove();
  group.insertBefore(second,saved);checks.reorderedPinnedRowsRefused=adapter.inspect().reason==='unsafe-native-history-list'&&adapter.inspect().historyFailure==='row-order';group.insertBefore(saved,second);
  const beforeScroll=adapter.inspect();nav.style.height='180px';nav.scrollTop=180;
  const afterScroll=adapter.inspect();checks.clippedRunKeepsMaskIdentity=afterScroll.ok&&afterScroll.regionEpoch===beforeScroll.regionEpoch&&afterScroll.historyMaskRoots.length===2&&afterScroll.historyMaskRoots.every((n,i)=>n===beforeScroll.historyMaskRoots[i]);
  const hiddenControl=document.createElement('input');saved.append(hiddenControl);checks.clippedUnsafeRowStillRejected=adapter.inspect().reason==='unsafe-native-history-list';hiddenControl.remove();
  surface.dispose(partitionHandle);nav.style.height='400px';nav.scrollTop=0;
  saved.after(local);checks.interleavedLocalDraftRefused=adapter.inspect().reason==='unsafe-native-history-list';group.prepend(local);
  second.style.marginTop='4px';checks.unknownGapRefused=adapter.inspect().reason==='unsafe-native-history-list'&&adapter.inspect().historyFailure==='row-gap';
  checks.draftPreserved=composer.querySelector('textarea').value==='home draft';await adapter.stop();return checks;
 });
 assert(Object.values(homeChecks).every(Boolean),JSON.stringify(homeChecks));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',homeChecks}));await home.close();
}finally{await browser.close();}
