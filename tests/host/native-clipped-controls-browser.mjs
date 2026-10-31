/** Closed-native strictly clipped controls: isolated real layout, no live account data. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {longDesktopHTML} from './fixtures/observed-host-replay.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {createFlowMountSurface} from './src/navigation/flow-mount-surface.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'flowModule'});
const C='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+C;
const browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']}),results=[];
try{
 for(const scenario of ['native-clipped','visible-then-clipped','new-clipped','replacement','reparent','cross-region-parent','clip-restored','hiding-changed','protected-region','nonempty-clip','interactive-child']){
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:longDesktopHTML(C)}):r.abort());await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(async scenario=>{
   const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;
   const composer=document.querySelector('[data-thread-scroll-footer]'),button=document.createElement('button');composer.style.position='relative';button.textContent='Synthetic native control';button.type='button';
   button.style.cssText='position:absolute;bottom:calc(100% + 40px);left:50%;width:1px;height:1px;padding:0;border:0;overflow:hidden';
   const hidden=()=>{button.style.clipPath='inset(50%)';};
   if(scenario!=='visible-then-clipped')hidden();composer.append(button);
   if(scenario==='cross-region-parent'){const parent=document.createElement('div');composer.append(parent);parent.append(button);}
   if(scenario==='nonempty-clip')button.style.clipPath='inset(49%)';
   if(scenario==='interactive-child'){const child=document.createElement('span');child.setAttribute('role','button');child.tabIndex=0;child.style.cssText='position:fixed;left:600px;top:200px;display:block;width:16px;height:16px;pointer-events:auto';button.append(child);}
   let nativeActions=0;button.addEventListener('click',()=>nativeActions++);const originalParent=button.parentElement,initialMarkup=button.outerHTML,draft=document.querySelector('textarea');draft.value='UNSENT_SYNTHETIC';
   let surface;const adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
   const binding={documentToken:'invisible',producerToken:'invisible',browserDocumentId:'invisible',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'invisible'})});const inspection=adapter.inspect();if(!inspection.ok)throw Error('fixture-inspection');
   surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});const handle=await surface.mount({binding},inspection),shown=surface.showWorkspace(handle);
   if(['nonempty-clip','interactive-child'].includes(scenario)){const rejected=!shown;surface.dispose(handle);adapter.stop();return {scenario,rejected};}
   if(!shown)throw Error('closed-native-clipped-control-blocked:'+scenario+':'+surface.activeLayoutFailure(handle));
   const workspace=surface.frames(handle)[0].frame.parentElement,original=button.getBoundingClientRect(),board=workspace.getBoundingClientRect();
   if(scenario==='native-clipped'){
    const unchanged=button.outerHTML===initialMarkup&&button.parentElement===originalParent,active=surface.validateActiveLayout(handle),noUnnecessaryClearance=board.bottom>original.top;
    surface.showReading(handle);button.focus();const focusPreserved=document.activeElement===button;button.click();surface.dispose(handle);adapter.stop();return {scenario,active,unchanged,noUnnecessaryClearance,draftPreserved:draft.value==='UNSENT_SYNTHETIC',focusPreserved,nativeHandlerPreserved:nativeActions===1};
   }
   let clone,wrapper;
   if(scenario==='visible-then-clipped')hidden();
   if(scenario==='new-clipped'){clone=button.cloneNode(true);composer.append(clone);}
   if(scenario==='replacement'){clone=button.cloneNode(true);button.replaceWith(clone);}
   if(scenario==='reparent'){wrapper=document.createElement('div');composer.append(wrapper);wrapper.append(button);}
   if(scenario==='cross-region-parent')inspection.header.append(button.parentElement);
   if(scenario==='clip-restored'){button.style.clipPath='none';button.style.width='32px';button.style.height='32px';}
   if(scenario==='hiding-changed')button.setAttribute('aria-hidden','true');
   if(scenario==='protected-region'){inspection.header.style.cssText+=';position:absolute;width:1px;height:1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%)';}
   const rejected=!surface.validateActiveLayout(handle);
   surface.surrenderChanged();
   let recovered=null;
   if(scenario==='clip-restored'){
    button.style.pointerEvents='auto';
    recovered=surface.needsNativeBaselineRefresh(handle)&&surface.refreshNativeBaseline(handle,()=>adapter.inspect())&&surface.showWorkspace(handle);
    const r=button.getBoundingClientRect(),b=workspace.getBoundingClientRect();recovered=!!recovered&&b.bottom<=r.top&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===button;
   }
   surface.dispose(handle);adapter.stop();return {scenario,rejected,recovered,draftPreserved:draft.value==='UNSENT_SYNTHETIC'};
  },scenario);
  if(scenario==='native-clipped')assert.deepEqual(result,{scenario,active:true,unchanged:true,noUnnecessaryClearance:true,draftPreserved:true,focusPreserved:true,nativeHandlerPreserved:true});
  else {assert.equal(result.rejected,true,scenario);if(scenario==='clip-restored')assert.equal(result.recovered,true);if(!['nonempty-clip','interactive-child'].includes(scenario))assert.equal(result.draftPreserved,true);}
  results.push(result);await page.close();
 }
 console.log(JSON.stringify({status:'PASS_ISOLATED_NATIVE_CLIPPED_CONTROL_MECHANISM',realChatGPT:'NOT_RUN',results},null,2));
}finally{await browser.close();}
