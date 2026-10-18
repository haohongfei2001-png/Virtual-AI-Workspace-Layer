import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {createMountSurface} from './src/navigation/mount-surface.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'observedModule'});
const browser=await chromium.launch({headless:true});
try{
 for(const focusableViewport of [false,true]){
 const page=await browser.newPage({viewport:{width:1000,height:700}}),id='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+id;
 await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:focusableViewport?observedDesktopHTML(id).replace('<div data-app-action-timeline-scroll>', '<div data-app-action-timeline-scroll role="region" tabindex="0">'):observedDesktopHTML(id)}):r.abort());
 await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
 const checks=await page.evaluate(async focusableViewport=>{
  const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,createMountSurface}=observedModule;let surface;const proposals=[];
  const adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n)===true});
  const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'parent',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>{proposals.push(p);return {state:'accepted',localSeq:p.localSeq,receiptId:'fixture'};}});for(let i=0;i<40;i++)await Promise.resolve();
  const viewport=document.querySelector('[data-app-action-timeline-scroll]'),role=viewport.getAttribute('role'),tabindex=viewport.getAttribute('tabindex');
  const inspection=adapter.inspect();if(!inspection.ok)throw Error(inspection.reason);
  surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});const handle=await surface.mount({binding},inspection);surface.showWorkspace(handle);for(let i=0;i<40;i++)await Promise.resolve();
  const result={viewportShape:role===(focusableViewport?'region':null)&&tabindex===(focusableViewport?'0':null),bodyObservationPresent:proposals.some(p=>p.kind==='current-object'||p.kind==='current-observation'),noMaskedBodyInvalidation:proposals.filter(p=>p.kind==='current-object'||p.kind==='current-observation').every(p=>(p.kind==='current-observation'?p.payload.body:p.payload).association==='explicit-body-id'),profileSelected:inspection.profileId===profile.id,bodyConfigured:profile.currentBody.conversationIdSource==='message-elements',nativeTitle:proposals.some(p=>p.payload?.candidates?.some(c=>c.nativeTitle==='Native A')),noFabricatedMembership:proposals.every(p=>(p.payload?.membershipClaims??[]).every(c=>c.asserted==='UNKNOWN')),readingMasked:surface.isMasked(document.querySelector('#reading')),historyMasked:surface.isMasked(document.querySelector('#list')),searchVisible:getComputedStyle(document.querySelector('#heading')).visibility==='visible',composerVisible:getComputedStyle(document.querySelector('textarea')).visibility==='visible',geometryStillValid:adapter.inspect().ok};
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
  surface.dispose(handle);adapter.stop();result.draftPreserved=document.querySelector('textarea').value==='fixture draft';result.viewportIdentityPreserved=document.querySelector('[data-app-action-timeline-scroll]')===viewport&&viewport.getAttribute('role')===role&&viewport.getAttribute('tabindex')===tabindex;return result;
 },focusableViewport);
 assert(Object.values(checks).every(v=>v===true),JSON.stringify(checks));console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',checks,focusableViewport,authorization:'FIXTURE_NOT_LIVE_SCOPE'}));await page.close();
 }
}finally{await browser.close();}
