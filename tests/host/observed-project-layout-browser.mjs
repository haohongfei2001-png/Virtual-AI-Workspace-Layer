import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url)),baseline=process.env.FREE_PROJECT_LAYOUT_BASELINE_REF;
const plugins=baseline?[{name:'saved-baseline',setup(build){build.onLoad({filter:/src\/(host\/(chatgpt-adapter|chatgpt-observed-profile)|navigation\/mount-surface)\.mjs$/},args=>({contents:execFileSync('git',['show',`${baseline}:${args.path.slice(process.cwd().length+1)}`],{encoding:'utf8'}),loader:'js'}));}}]:[];
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';export {CHATGPT_OBSERVED_PROFILE,waitForNativeLayout} from './src/host/chatgpt-observed-profile.mjs';export {createSurfaceController} from './src/host/surface-controller.mjs';export {createMountSurface} from './src/navigation/mount-surface.mjs';",resolveDir:process.cwd()},plugins,bundle:true,write:false,format:'iife',globalName:'projectModule'});
const project='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',cid='33333333-3333-4333-8333-333333333333',url=`https://chatgpt.com/g/${project}/project`;
const started=performance.now(),browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}}),results=[];
try{
 if(process.argv.includes('--project-flow-only')){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedProjectHTML(project,cid)}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const checks=await page.evaluate(async()=>{
   const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createMountSurface}=projectModule;
   let surface;const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>/^g-p-[a-f0-9]{32}$/.test(container)?container:null}}),isOwnedMask:n=>surface?.isMasked(n)===true,isOwnedSurface:n=>surface?.isOwnedSurface(n)===true});
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'project',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+30000).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const initial=adapter.inspect(),panel=document.querySelector('#project-panel'),port=document.querySelector('#project-scroll'),form=document.querySelector('form'),native=form.outerHTML;
   surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
   if(!initial.ok)throw Error('initial-proof:'+initial.reason);
   const handle=await surface.mount({binding},initial),frames=surface.frames(handle),before=port.scrollTop;
   const mutations=new MutationObserver(()=>{});mutations.observe(panel,{childList:true});
   const checks={flowAdmitted:!!initial.workspaceFlow};
   const enter=()=>{const settle=surface.prepareWorkspace(handle);if(!settle)return false;const next=adapter.inspect();const ok=next.ok&&next.regionEpoch===initial.regionEpoch&&surface.refreshGeometry(handle,next)&&surface.showWorkspace(handle);settle(ok);return ok;};
   checks.explicitOverview=enter();
   checks.ownInsertionDoesNotWithdraw=surface.surrenderChanged(mutations.takeRecords())===false&&surface.visibility(handle).workspace;
   const expanded=adapter.inspect(),written=port.scrollTop;
   checks.completeNativeScrollViewport=expanded.ok&&expanded.readingRect.height>=port.clientHeight-1&&expanded.readingRect.y===port.getBoundingClientRect().top;
   checks.framesAndNativeFormUnchanged=frames.every((f,i)=>f.frame===surface.frames(handle)[i].frame)&&native===form.outerHTML&&document.querySelector('#draft').value==='fixture draft';
   checks.onlyOriginalPanelMasked=surface.isMasked(panel)&&!surface.isMasked(form)&&!surface.isMasked(port)&&panel.lastElementChild.matches('[data-va-owned]');
   checks.nativeReadDoesNotCollapseFlow=surface.withNativeReading(handle,()=>port.scrollTop,()=>true)===written&&port.scrollTop===written;
   checks.renewalDoesNotReposition=surface.refreshGeometry(handle,adapter.inspect())&&port.scrollTop===written;
   surface.showReading(handle);
   checks.ownRemovalDoesNotWithdraw=surface.surrenderChanged(mutations.takeRecords())===false;
   checks.readingRestoresOriginalScroll=port.scrollTop===before&&!panel.querySelector('[data-va-owned]')&&native===form.outerHTML;
   surface.refreshGeometry(handle,adapter.inspect());checks.secondEntry=enter();
   // A later scroll is user-owned even when removing our space naturally clamps
   // it. Observe writes rather than equating that browser clamp with restoration.
   port.scrollTop=written-20;const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop'),writes=[];
   Object.defineProperty(port,'scrollTop',{configurable:true,get(){return descriptor.get.call(this);},set(v){writes.push(v);descriptor.set.call(this,v);}});
   surface.showReading(handle);checks.userScrollNotOverwritten=writes.length===0;delete port.scrollTop;
   port.style.scrollSnapType='y mandatory';checks.snapLayoutKeepsNative=adapter.inspect().workspaceFlow===null;port.style.scrollSnapType='';
   surface.refreshGeometry(handle,adapter.inspect());checks.reentryAfterNativeLayout=enter();
   surface.surrenderChanged(mutations.takeRecords());panel.querySelector('[data-va-owned]').remove();
   checks.hostSlotRemovalWithdrawsWorkspaceOnly=surface.surrenderChanged(mutations.takeRecords())===true&&!surface.visibility(handle).workspace&&surface.visibility(handle).sidebar;
   surface.refreshGeometry(handle,adapter.inspect());checks.reentryAfterSlotRemoval=enter();
   const replacement=port.cloneNode(true);port.replaceWith(replacement);const detached=port.scrollTop;surface.showReading(handle);
   checks.detachedViewportNotRestored=port.scrollTop===detached&&!panel.querySelector('[data-va-owned]');
   mutations.disconnect();surface.dispose(handle);await adapter.stop();return checks;
  });
  assert(Object.values(checks).every(Boolean),JSON.stringify(checks));results.push({mode:'project-flow-layout',passed:true,checks});await page.close();
 }else{
 if(!baseline){
  const page=await browser.newPage({viewport:{width:785,height:1193}});
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedProjectHTML(project,cid)}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const preparation=await page.evaluate(async()=>{
   const {waitForNativeLayout,CHATGPT_OBSERVED_PROFILE:profile}=projectModule;
   const panel=document.querySelector('#project-panel'),list=panel.parentElement;
   panel.remove();let settled=false;
   const pending=waitForNativeLayout({document,profile,timeoutMs:2000}).then(value=>{settled=true;return value;});
   await new Promise(r=>setTimeout(r,200));const waited=!settled;list.append(panel);
   const ready=await pending;
   const extra=document.createElement('textarea');panel.append(extra);let reason;
   const unsafe=await waitForNativeLayout({document,profile,timeoutMs:220,onFailure:r=>{reason=r;}});extra.remove();
   const shell=document.querySelector('main[data-app-shell-main-surface]');shell.style.clipPath='inset(0px 0px 0px -9999px round 16px)';let clipDetail;
   const clipRejected=await waitForNativeLayout({document,profile,timeoutMs:220,onFailure:(r,d)=>{clipDetail=d;}})===false&&clipDetail?.projectClip==='inset(0px 0px 0px -9999px round 16px)';shell.style.clipPath='';
   const routePending=waitForNativeLayout({document,profile,timeoutMs:1000});history.pushState({},'','/');dispatchEvent(new PopStateEvent('popstate'));
   const routeRejected=await routePending===false;
   return {waited,ready,clipRejected,unsafeRejected:unsafe===false&&reason==='layout-project-composer-title',routeRejected,draftPreserved:document.querySelector('#draft').value==='fixture draft'};
  });
  assert(Object.values(preparation).every(Boolean),JSON.stringify(preparation));results.push({mode:'bounded-project-preparation',passed:true,checks:preparation});await page.close();
 }
 for(const mode of (baseline?['journey']:['journey','centered-panel','centered-gutter-control','shell-border-box','shell-border-box-corner','shell-border-box-percent','shell-zero-radius','shell-asymmetric','shell-layout-ancestor','shell-cut','shell-percent','shell-polygon','hidden-old-root','second-root','extra-native-widget','tiny-gap-control','composer-overflow','title-overflow','tab-overlap','pseudo-overflow','title-shadow','tab-outline','composer-shadow-changed','header-opaque','header-control','outer-clip','clip-path','css-mask','ancestor-transform','foreign-list-link','extra-panel','editable-panel','file-panel','replace-tabs','replace-title','replace-composer','replace-scroll','route-change','scroll','resize','keyboard','controller-journey','controller-scroll','controller-route','controller-replace','controller-resize','controller-popup','controller-expiry'])){
  if(process.argv.includes('--width-only')&&!mode.startsWith('centered-'))continue;
  if(process.argv.includes('--continuity-only')&&!['journey','hidden-old-root','controller-journey'].includes(mode))continue;
  const caseStarted=performance.now(),page=await browser.newPage({viewport:{width:mode.startsWith('centered-')?1400:785,height:1193}});
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedProjectHTML(project,cid)}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(async mode=>{
   const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createMountSurface,createSurfaceController}=projectModule;let surface,forbiddenReads=0;
   const panel=document.querySelector('#project-panel'),draft=document.querySelector('#draft'),tabs=document.querySelector('#project-tabs');
   // 2026-10-27 real screenshot counterexample: the native member column is
   // centered and narrow; geometry only, no account titles/IDs/body are stored.
   if(mode.startsWith('centered-'))document.querySelector('#project-content').style.cssText='max-width:660px;margin-inline:auto';
   if(mode==='centered-gutter-control'){
    const native=document.createElement('button');native.id='gutter-control';native.textContent='Native tool';
    native.style.cssText='position:fixed;left:365px;top:500px;width:80px;height:40px';document.querySelector('#drop').append(native);
   }
   for(const n of [panel,...panel.querySelectorAll('a,a>div,a>div>div:last-child')])for(const k of ['textContent','innerText'])Object.defineProperty(n,k,{configurable:true,get(){forbiddenReads++;throw Error('preview-read')}});
   const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>/^g-p-[a-f0-9]{32}$/.test(container)?container:null}}),isOwnedMask:n=>surface?.isMasked(n)===true});
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+(mode==='controller-expiry'?5000:20000)).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const initial=adapter.inspect();if(!initial.ok){adapter.stop();return {mode,passed:false,reason:initial.reason,forbiddenReads};}
   const initialFullHeight=initial.readingRect.height>800&&initial.readingRect.y===panel.getBoundingClientRect().top;
   if(mode==='hidden-old-root'||mode==='second-root'){const main=document.querySelector('main[data-app-shell-main-surface]'),clone=main.cloneNode(true);clone.hidden=mode==='hidden-old-root';main.after(clone);}
   if(mode==='extra-native-widget'){const b=document.createElement('button');b.style.cssText='position:absolute;top:500px';document.querySelector('#project-content').append(b);}
   if(mode==='tiny-gap-control'){const b=document.createElement('button');b.style.cssText='position:fixed;left:354px;top:20px;width:2px;height:2px;padding:0;border:0';document.querySelector('#project-title').append(b);}
   if(['composer-overflow','title-overflow'].includes(mode)){const b=document.createElement('button');b.style.cssText='position:fixed;left:400px;top:800px;width:40px;height:40px';document.querySelector(mode==='composer-overflow'?'form':'#project-title').append(b);}
   if(mode==='tab-overlap')tabs.style.transform='translateY(300px)';
   if(mode==='pseudo-overflow'){const s=document.createElement('style');s.innerHTML='#model{position:relative}#model::after{content:"";position:absolute;left:0;top:500px;width:30px;height:30px;box-sizing:border-box}';document.head.append(s);}
   if(mode==='title-shadow')document.querySelector('#project-title').style.boxShadow='0 250px 0 80px red';
   if(mode==='tab-outline')tabs.style.outline='100px solid red';
   if(mode==='composer-shadow-changed')document.querySelector('#composer-body').style.boxShadow='rgba(0,0,0,.4) 0 4px 80px 8px';
   if(mode==='header-opaque')document.querySelector('[data-app-shell-header-toolbar]').style.background='red';
   if(mode==='header-control'){const b=document.createElement('button');b.style.cssText='position:fixed;left:354px;top:20px;width:2px;height:2px;padding:0;border:0';document.querySelector('[data-app-shell-header-toolbar]').append(b);}
   if(mode==='outer-clip'){document.querySelector('#project').style.height='400px';document.querySelector('#project-scroll').style.height='1125px';}
   if(mode==='shell-layout-ancestor')document.querySelector('[data-app-shell-main-content-layout]').style.clipPath='inset(0px round 0px)';
   if(mode.startsWith('shell-border-box')){const shell=document.querySelector('main[data-app-shell-main-surface]');shell.style.clipPath='border-box';shell.style.borderRadius=mode==='shell-border-box-percent'?'50%':mode==='shell-border-box-corner'?'128px':'0px';}
   if(mode.startsWith('shell-')&&!mode.startsWith('shell-border-box')&&mode!=='shell-layout-ancestor')document.querySelector('main[data-app-shell-main-surface]').style.clipPath=({'shell-zero-radius':'inset(0px 0px 0px -16px round 0px)','shell-asymmetric':'inset(0px 0px 0px -16px round 16px 8px 0px 8px)','shell-cut':'inset(0px 100px 0px 0px)','shell-percent':'inset(0% 0%)','shell-polygon':'polygon(0 0, 100% 0, 100% 100%)'})[mode];
   if(mode==='clip-path')document.querySelector('#project-scroll').style.clipPath='inset(0 50% 0 0)';
   if(mode==='css-mask')document.querySelector('#project-scroll').style.maskImage='linear-gradient(black,transparent)';
   if(mode==='ancestor-transform')document.querySelector('main').style.transform='scale(.9)';
   if(mode==='foreign-list-link')panel.querySelector('a').href='/files';
   if(mode==='extra-panel')panel.after(panel.cloneNode(true));
   if(mode==='editable-panel')panel.contentEditable='true';
   if(mode==='file-panel')panel.replaceChildren(document.createElement('input'));
   const reject=['shell-border-box-corner','shell-border-box-percent','shell-cut','shell-percent','shell-polygon','second-root','extra-native-widget','tiny-gap-control','composer-overflow','title-overflow','tab-overlap','pseudo-overflow','title-shadow','tab-outline','header-opaque','header-control','outer-clip','clip-path','css-mask','ancestor-transform','foreign-list-link','extra-panel','editable-panel','file-panel'].includes(mode);
   if(['header-opaque','header-control'].includes(mode)){const state=adapter.inspect();adapter.stop();return {mode,passed:state.ok&&state.returnSlot===null&&forbiddenReads===0,workspaceIndependent:true};}
   if(mode==='foreign-list-link'){const state=adapter.inspect();adapter.stop();return {mode,passed:state.ok&&forbiddenReads===0,layoutIndependentOfMemberURL:true};}
   if(reject){const refused=!adapter.inspect().ok;adapter.stop();return {mode,passed:refused&&forbiddenReads===0,refused,forbiddenReads};}
   if(mode.startsWith('controller-')){
    surface=createMountSurface({document,createFrameURL:({role})=>`chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${role}.html`});
    const controller=createSurfaceController({document,adapter,surface,extensionOrigin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',bridge:{registerMount:async()=>({ok:true}),confirmParent:async m=>({ok:true,grant:{id:'fixture_'+m.role,mountId:m.mountId,role:m.role,parentDocumentId:binding.browserDocumentId,uiDocumentId:'fixture_ui_'+m.role,scopeGrantId:'fixture_scope',expiresAt:binding.expiresAt}})}});
    const handle=await controller.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
    if(!handle)return {mode,passed:false,reason:'controller-start-failed'};
    for(const {role,frame}of surface.frames(handle))dispatchEvent(new MessageEvent('message',{origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'fixture_nonce_'+role}}));
    for(let i=0;i<40;i++)await Promise.resolve();
    globalThis.projectTest={adapter,surface,controller,handle,inspection:adapter.inspect(),forbidden:()=>forbiddenReads};
    return {mode,passed:surface.visibility(handle).workspace&&surface.visibility(handle).sidebar&&forbiddenReads===0,authorization:'SYNTHETIC_CONTROLLER_BRIDGE_NOT_MV3',fullHeight:initialFullHeight};
   }
   const inspection=adapter.inspect();if(!inspection.ok){adapter.stop();return {mode,passed:false,reason:inspection.reason};}
   surface=createMountSurface({document,createFrameURL:({role})=>`chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${role}.html`});
   const handle=await surface.mount({binding},inspection);surface.showWorkspace(handle);
   const checks={fullHeight:initialFullHeight,maskOnlyPanel:surface.isMasked(panel)&&getComputedStyle(tabs).visibility==='visible'&&getComputedStyle(draft).visibility==='visible'&&getComputedStyle(document.querySelector('#project-title')).visibility==='visible',current:adapter.inspect().ok&&adapter.isSameNativeRegions(inspection)&&adapter.isReturnSlotCurrent(inspection),noPreviewReads:forbiddenReads===0};
   if(mode.startsWith('centered-')){
    const panelBox=panel.getBoundingClientRect(),viewport=document.querySelector('#project-scroll'),workspace=document.querySelector('[data-va-owned][id$="_workspace"]');
    checks.widthProof=mode==='centered-panel'?inspection.readingRect.width===Math.min(innerWidth,viewport.getBoundingClientRect().x+viewport.clientLeft+viewport.clientWidth)-Math.max(0,viewport.getBoundingClientRect().x+viewport.clientLeft)&&inspection.readingRect.width>panelBox.width:inspection.readingRect.width===panelBox.width;
    checks.actualSurfaceWidth=workspace.getBoundingClientRect().width===inspection.readingRect.width;
    checks.noAncestorMask=!surface.isMasked(viewport)&&!surface.isMasked(document.querySelector('#project-content'));
    if(mode==='centered-gutter-control')checks.nativeGutterReachable=document.elementFromPoint(380,520)===document.querySelector('#gutter-control');
   }
   if(mode.startsWith('replace-')){const ids={tabs:'#project-tabs',title:'#project-title',composer:'form',scroll:'#project-scroll'},n=document.querySelector(ids[mode.slice(8)]);n.replaceWith(n.cloneNode(true));checks.replacementRevokes=!adapter.isSameNativeRegions(inspection)&&!adapter.isReturnSlotCurrent(inspection)&&!surface.refreshGeometry(handle,adapter.inspect())&&!surface.visibility(handle).workspace;}
   if(mode==='route-change'){history.pushState({},'','/c/44444444-4444-4444-8444-444444444444');checks.routeRevokes=!adapter.isSameNativeRegions(inspection)&&!adapter.isReturnSlotCurrent(inspection)&&!adapter.inspect().ok;}
   if(mode==='scroll'){panel.style.minHeight='2000px';document.querySelector('#project-scroll').scrollTop=300;checks.scrolledUnsafe=!adapter.inspect().ok;}
   if(mode==='keyboard'){globalThis.projectTest={adapter,surface,handle,inspection};return {mode,checks,forbiddenReads,passed:Object.values(checks).every(Boolean)};}
   if(mode==='resize'){globalThis.projectTest={adapter,surface,handle,inspection};return {mode,checks,forbiddenReads,passed:Object.values(checks).every(Boolean)};}
   if(['journey','hidden-old-root'].includes(mode)){
    surface.showReading(handle);checks.readingRestored=getComputedStyle(panel).visibility==='visible'&&surface.visibility(handle).sidebar;
    surface.showWorkspace(handle);draft.dispatchEvent(new Event('focusin',{bubbles:true}));checks.inputKeepsSidebar=!surface.visibility(handle).workspace&&surface.visibility(handle).sidebar;
    surface.showWorkspace(handle);const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();checks.nativeModalWins=getComputedStyle(panel).visibility==='visible'&&getComputedStyle(document.querySelector('[data-va-owned][id$="_workspace"]')).visibility==='hidden';dialog.close();dialog.remove();
   }
   surface.dispose(handle);adapter.stop();checks.draftPreserved=draft.value==='fixture draft';checks.clean=!document.querySelector('[data-va-owned]')&&!panel.hasAttribute('data-va-mask-workspace');
   return {mode,checks,forbiddenReads,passed:Object.values(checks).every(Boolean)&&forbiddenReads===0};
  },mode).catch(e=>({mode,passed:false,error:e.message}));
  try{
  if(result.passed&&mode==='keyboard'){
   await page.locator('#files-tab').focus();await page.evaluate(()=>projectTest.surface.showWorkspace(projectTest.handle));await page.keyboard.press('Tab');
   result.forward=await page.evaluate(()=>document.activeElement.matches('[data-va-owned][id$="_workspace"] > button'));
   await page.keyboard.press('Shift+Tab');result.backward=await page.evaluate(()=>document.activeElement.id==='files-tab');result.passed&&=result.forward&&result.backward;
  }
  if(result.passed&&mode==='resize'){
   await page.setViewportSize({width:785,height:600});result.resized=await page.evaluate(()=>{const s=projectTest.adapter.inspect();return s.ok&&s.readingRect.height<400&&projectTest.surface.refreshGeometry(projectTest.handle,s);});result.passed&&=result.resized;
  }
  if(result.passed&&mode.startsWith('controller-')){
   const back=page.getByRole('button',{name:'返回工作空间',exact:true});
   if(mode==='controller-journey'){
    await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await back.waitFor({timeout:10000});assert.equal(await back.count(),1);await back.click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);
    await page.locator('#draft').focus();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===1);await back.waitFor({timeout:10000});assert.equal(await back.count(),1);await back.click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);result.uniqueReturnAndNativeInput=true;
   }
   if(mode==='controller-scroll')await page.evaluate(()=>{document.querySelector('#project-panel').style.minHeight='2000px';document.querySelector('#project-scroll').scrollTop=300;});
   if(mode==='controller-route')await page.evaluate(()=>{history.pushState({},'','/c/44444444-4444-4444-8444-444444444444');dispatchEvent(new PopStateEvent('popstate'));});
   if(mode==='controller-replace')await page.evaluate(()=>{const n=document.querySelector('#project-tabs');n.replaceWith(n.cloneNode(true));});
   if(['controller-route','controller-replace'].includes(mode)){await page.waitForFunction(()=>!document.querySelector('[data-va-owned]'));result.automaticCleanup=await page.locator('#project-panel').evaluate(n=>getComputedStyle(n).visibility==='visible');result.passed&&=result.automaticCleanup;}
   if(mode==='controller-scroll'){
    await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0);
    result.automaticSurrender=await page.locator('#project-panel').evaluate(n=>getComputedStyle(n).visibility==='visible');assert.equal(await back.count(),0);
    await page.evaluate(()=>{document.querySelector('#project-scroll').scrollTop=0;});await page.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_workspace"]')?.matches(':popover-open'));
    await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);result.originalWorkspaceIntentRestored=true;result.passed&&=result.automaticSurrender;
   }
   if(mode==='controller-expiry'){await page.waitForFunction(()=>!document.querySelector('[data-va-owned]'),null,{timeout:10000});result.expiredClean=await page.locator('#project-panel').evaluate(n=>getComputedStyle(n).visibility==='visible');assert.equal(await back.count(),0);result.passed&&=result.expiredClean;}
   if(mode==='controller-resize'){await page.setViewportSize({width:785,height:600});await page.waitForFunction(()=>{const n=document.querySelector('[data-va-owned][id$="_workspace"]');return n?.getBoundingClientRect().height<400;});result.automaticResize=true;}
   if(mode==='controller-popup'){
    await page.evaluate(()=>{const d=document.createElement('dialog');d.id='native-dialog';document.body.append(d);d.showModal();});await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0);
    result.nativePopupPriority=await page.locator('#project-panel').evaluate(n=>getComputedStyle(n).visibility==='visible');await page.evaluate(()=>document.querySelector('#native-dialog').remove());await page.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_workspace"]')?.matches(':popover-open'));result.passed&&=result.nativePopupPriority;
   }
  }
  if(result.passed&&['keyboard','resize'].includes(mode)||result.passed&&mode.startsWith('controller-')){
   result.cleanup=await page.evaluate(()=>{const t=projectTest;if(t.controller)t.controller.stop();else{t.surface.dispose(t.handle);t.adapter.stop();}return !document.querySelector('[data-va-owned]')&&document.querySelector('#draft').value==='fixture draft'&&(!t.forbidden||t.forbidden()===0);});result.passed&&=result.cleanup;
  }
  }catch(error){result.passed=false;result.driverError=String(error.message);}
  result.durationMs=performance.now()-caseStarted;results.push(result);await page.close();
 }
 }
}finally{await browser.close();}
console.log(JSON.stringify({status:results.every(r=>r.passed)?'PASS_WEB_MECHANISM_ONLY':'FAIL',baseline:baseline??null,durationMs:performance.now()-started,authorization:'FIXTURE_NOT_LIVE_SCOPE',results}));
assert(results.every(r=>r.passed),JSON.stringify(results.filter(r=>!r.passed)));
