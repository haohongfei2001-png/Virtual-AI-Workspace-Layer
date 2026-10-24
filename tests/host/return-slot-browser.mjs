import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {LEGACY_SURFACE_PROFILE} from './src/host/surface-discovery.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'slotModule'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}}),url='https://chatgpt.com/c/33333333-3333-4333-8333-333333333333';
 await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:`<style>body{margin:0}#header{position:fixed;left:220px;top:0;width:780px;height:52px}#slot{position:absolute;left:8px;top:8px;width:36px;height:36px}#history{position:fixed;left:0;top:60px;width:200px;height:600px}#reading{position:fixed;left:220px;top:60px;width:780px;height:400px}#composer{position:fixed;left:220px;top:500px;width:780px;height:80px}</style><nav id="history"></nav><header id="header"><div id="slot"></div></header><section id="reading"></section><form id="composer"><textarea>fixture draft</textarea></form>`}):r.abort());
 await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const {createChatGPTAdapter,LEGACY_SURFACE_PROFILE}=slotModule,profile={...LEGACY_SURFACE_PROFILE,currentBody:undefined,regions:{...LEGACY_SURFACE_PROFILE.regions,history:'#history'},nativeLayout:{header:'#header',reading:'#reading',composer:'#composer',navigationSlot:'#slot'}};
  const adapter=createChatGPTAdapter({document,profile}),binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});const first=adapter.inspect(),slot=document.querySelector('#slot'),header=document.querySelector('#header');
  slot.style.top='510px';const movedRejected=!adapter.inspect().ok;slot.style.top='8px';slot.style.visibility='hidden';const hiddenRejected=!adapter.inspect().ok;slot.style.visibility='visible';
  const obstacle=document.createElement('button');obstacle.style.cssText='position:absolute;left:14px;top:14px;width:2px;height:2px;padding:0;border:0';header.append(obstacle);
  const r=slot.getBoundingClientRect(),sampleHitsClear=[[1,1],[35,1],[1,35],[35,35],[18,18]].every(([x,y])=>document.elementFromPoint(r.x+x,r.y+y)===slot),smallSiblingRejected=!adapter.inspect().ok;obstacle.remove();
  const restored=adapter.inspect().ok;adapter.stop();return {initial:first.ok,movedRejected,hiddenRejected,sampleHitsClear,smallSiblingRejected,restored,dormantGeometryOnly:adapter.isReturnSlotCurrent(first)&&!adapter.inspect().ok,draftPreserved:document.querySelector('textarea').value==='fixture draft'};
 });
 assert(Object.values(result).every(v=>v===true),JSON.stringify(result));console.log(JSON.stringify({result:'PASS_WEB_MECHANISM_ONLY',checks:result}));
}finally{await browser.close();}
