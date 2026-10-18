import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {createSurfaceDiscovery} from './src/host/surface-discovery.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'observedModule'});
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const mode of ['baseline','body-nav','hidden-backup','hidden-details-backup','body-only','hidden-sidebar','two-visible-sidebars','two-navs','replace-sidebar','mobile-sidebar']){
  const page=await browser.newPage({viewport:{width:1000,height:700}}),id='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+id;
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedDesktopHTML(id)}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const checks=await page.evaluate(async mode=>{
   const {createChatGPTAdapter,createSurfaceDiscovery,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile}=observedModule;
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'parent',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   const sidebar=document.querySelector('aside'),discovery=createSurfaceDiscovery({document,binding,profile,urlPolicy:createURLPolicy()}),first=discovery.scan(),oldHandle=first.candidates.find(c=>c.entity==='conversation')?.target.liveHandle;
   let forbiddenReads=0,bodyNav=null;
   const guardTitles=node=>{for(const n of node.querySelectorAll('a'))for(const key of ['textContent','innerText'])Object.defineProperty(n,key,{get(){forbiddenReads++;throw Error('outside-sidebar-title-read')}});};
   if(mode==='body-nav'||mode==='body-only'){
    const n=document.createElement('nav');n.innerHTML='<a href="/c/44444444-4444-4444-8444-444444444444">Outside</a>';n.style.cssText='position:static';document.querySelector('#reading').append(n);bodyNav=n;guardTitles(n);if(mode==='body-only')sidebar.remove();
   }
   if(mode==='hidden-backup'||mode==='hidden-details-backup'||mode==='two-visible-sidebars'){
    const n=sidebar.cloneNode(true);if(mode==='hidden-backup')n.hidden=true;
    if(mode==='hidden-details-backup'){const details=document.createElement('details');details.append(n);document.body.append(details);}else document.body.append(n);
    guardTitles(n);
   }
   if(mode==='hidden-sidebar')sidebar.hidden=true;
   if(mode==='two-navs')sidebar.querySelector('[data-slate-sidebar-content]').append(document.createElement('nav'));
   if(mode==='replace-sidebar')sidebar.replaceWith(sidebar.cloneNode(true));
   if(mode==='mobile-sidebar'){
    const mobile=document.createElement('div');mobile.setAttribute('role','dialog');mobile.setAttribute('aria-modal','true');mobile.setAttribute('data-state','open');
    mobile.append(sidebar.querySelector('[data-sidebar-navigation-root]').cloneNode(true));sidebar.hidden=true;document.body.append(mobile);guardTitles(sidebar);
   }
   if(mode==='body-nav')discovery.affectsSurface([]);
   const unrelatedBodyDoesNotInvalidate=mode!=='body-nav'||discovery.affectsSurface([{type:'characterData',target:bodyNav.firstChild}])===false;
   const rows=discovery.scan().candidates.filter(c=>c.entity==='conversation'),expected=['body-only','hidden-sidebar','two-visible-sidebars','two-navs'].includes(mode)?0:1;
   const handleValid=oldHandle?discovery.getNode(oldHandle)!==null:false;
   const adapter=createChatGPTAdapter({document,profile});let emissions=0;
   await adapter.start({binding,phase:'observation',emit:()=>{emissions++;throw Error('observation-must-not-emit')}});for(let i=0;i<30;i++)await Promise.resolve();
   const observation=adapter.observationStatus();await adapter.stop();
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});for(let i=0;i<30;i++)await Promise.resolve();
   const inspection=adapter.inspect();await adapter.stop();discovery.stop();
   return {mode,expected,unrelatedBodyDoesNotInvalidate,rowCount:rows.length,correctTitles:rows.every(c=>c.nativeTitle==='Native A'),noOutsideTitleReads:forbiddenReads===0,noMembershipPromotion:first.membershipClaims.every(c=>c.asserted==='UNKNOWN'),oldHandleValid:handleValid,expectedOldHandleValid:['baseline','body-nav','hidden-backup','hidden-details-backup'].includes(mode),preauthorizationCandidates:observation.candidates,preauthorizationNoEmission:emissions===0,inspectionOK:inspection.ok,inspectionReason:inspection.reason,draftIntact:document.querySelector('textarea').value==='fixture draft'};
  },mode).catch(error=>({mode,error:error.message}));
  checks.passed=!!(checks.rowCount===checks.expected&&checks.unrelatedBodyDoesNotInvalidate&&checks.correctTitles&&checks.noOutsideTitleReads&&checks.noMembershipPromotion&&checks.oldHandleValid===checks.expectedOldHandleValid&&checks.preauthorizationCandidates===checks.expected&&checks.preauthorizationNoEmission&&checks.inspectionOK===(checks.expected===1)&&checks.draftIntact);
  results.push(checks);await page.close();
 }
 {
  const page=await browser.newPage({viewport:{width:1000,height:700}}),id='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+id;
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedDesktopHTML(id)+'<style>@media(max-width:900px){aside{display:none}}</style>'}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  await page.evaluate(async()=>{const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile}=observedModule;globalThis.resizeAdapter=createChatGPTAdapter({document,profile});await resizeAdapter.start({binding:{documentToken:'fixture',producerToken:'fixture',browserDocumentId:'parent',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()},phase:'observation'});});
  await page.waitForFunction(()=>resizeAdapter.observationStatus().candidates===1,null,{timeout:1000});
  await page.setViewportSize({width:800,height:700});
  await page.waitForFunction(()=>resizeAdapter.observationStatus().candidates===0,null,{timeout:1000});
  await page.setViewportSize({width:1000,height:700});
  await page.waitForFunction(()=>resizeAdapter.observationStatus().candidates===1,null,{timeout:1000});
  await page.evaluate(async()=>{await resizeAdapter.stop();delete globalThis.resizeAdapter;});
  results.push({mode:'real-css-viewport-hide-restore',passed:true});await page.close();
 }
 console.log(JSON.stringify({status:results.every(r=>r.passed)?'PASS_WEB_MECHANISM_ONLY':'FAIL',evidence:'ISOLATED_REAL_BROWSER_BOUNDARY_NOT_LIVE_OR_MV3',results}));assert(results.every(r=>r.passed));
}finally{await browser.close();}
