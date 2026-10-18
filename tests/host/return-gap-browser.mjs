import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createSurfaceController} from './src/host/surface-controller.mjs';export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {LEGACY_SURFACE_PROFILE} from './src/host/surface-discovery.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'slotModule'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}}),url='https://chatgpt.com/c/33333333-3333-4333-8333-333333333333';
 await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:`<style>body{margin:0}#header{position:fixed;left:220px;top:0;width:780px;height:52px}#header{pointer-events:none;z-index:30}#slot{position:absolute;left:0;top:0;width:780px;height:52px;pointer-events:none}#hit{position:fixed;left:220px;top:0;width:780px;height:700px}#history{position:fixed;left:0;top:60px;width:200px;height:600px}#reading{position:fixed;left:220px;top:60px;width:780px;height:400px}#composer{position:fixed;left:220px;top:500px;width:780px;height:80px}</style><div id="hit"></div><nav id="history"></nav><header id="header"><div id="slot"></div></header><section id="reading"></section><form id="composer"><textarea>fixture draft</textarea></form>`}):r.abort());
 await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const {createChatGPTAdapter,LEGACY_SURFACE_PROFILE}=slotModule,profile={...LEGACY_SURFACE_PROFILE,currentBody:undefined,regions:{...LEGACY_SURFACE_PROFILE.regions,history:'#history'},nativeLayout:{header:'#header',reading:'#reading',composer:'#composer',navigationSlot:'#slot',returnPlacement:'header-gap',returnHitRoot:'#hit'}};
  const adapter=createChatGPTAdapter({document,profile}),binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});const first=adapter.inspect(),slot=document.querySelector('#slot'),header=document.querySelector('#header');
  if(!first.ok)throw Error(first.reason);
  const button=document.createElement('button');button.textContent='▦';Object.assign(button.style,{boxSizing:'border-box',margin:'0',padding:'0',position:'fixed',left:first.returnSlot.x+'px',top:first.returnSlot.y+'px',width:'36px',height:'36px',zIndex:'30'});document.body.append(button);adapter.setReturnControl(button);
  const ownedAccepted=adapter.inspect().ok;button.style.transform='translateX(12px)';const movedOwnedRejected=!adapter.inspect().ok;button.style.transform='none';button.style.visibility='hidden';const hiddenOwnedRejected=!adapter.inspect().ok;button.style.visibility='visible';const obstacle=document.createElement('button');obstacle.style.cssText='position:absolute;left:14px;top:14px;width:2px;height:2px;padding:0;border:0;pointer-events:auto';slot.append(obstacle);
  const tinyControlRejected=!adapter.inspect().ok;obstacle.remove();
  const portal=document.createElement('button');portal.style.cssText='position:fixed;left:228px;top:8px;width:36px;height:36px;z-index:31';document.body.append(portal);const portalRejected=!adapter.inspect().ok;portal.remove();
  header.inert=true;const inertRejected=!adapter.inspect().ok;header.inert=false;
  const hit=document.querySelector('#hit'),replacement=hit.cloneNode();hit.replaceWith(replacement);const identityRejected=!adapter.isReturnSlotCurrent(first);replacement.replaceWith(hit);
  const restored=adapter.inspect().ok;adapter.stop();const dormant=adapter.isReturnSlotCurrent(first)&&!adapter.inspect().ok;
  slot.append(obstacle);const dormantRejectsNewControl=!adapter.isReturnSlotCurrent(first);obstacle.remove();button.remove();adapter.setReturnControl(null);
  return {initial:first.ok,ownedAccepted,movedOwnedRejected,hiddenOwnedRejected,tinyControlRejected,portalRejected,inertRejected,identityRejected,restored,dormant,dormantRejectsNewControl,draftPreserved:document.querySelector('textarea').value==='fixture draft'};
 });
 assert(Object.values(result).every(v=>v===true),JSON.stringify(result));
 await page.evaluate(async()=>{
  const {createChatGPTAdapter,LEGACY_SURFACE_PROFILE,createSurfaceController}=slotModule;
  const profile={...LEGACY_SURFACE_PROFILE,currentBody:undefined,regions:{...LEGACY_SURFACE_PROFILE.regions,history:'#history'},nativeLayout:{header:'#header',reading:'#reading',composer:'#composer',navigationSlot:'#slot',returnPlacement:'header-gap',returnHitRoot:'#hit'}};
  const adapter=createChatGPTAdapter({document,profile}),binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'parent',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  const frames=['workspace','sidebar'].map(role=>{const frame=document.createElement('iframe');frame.style.display='none';document.body.append(frame);return {role,frame};});
  let shows=0;const surface={mount:async(c,i)=>({id:'mount',documentToken:'fixture',regionEpoch:i.regionEpoch}),frames:()=>frames,showWorkspace:()=>{shows++;return true;},showReading:()=>true,suspend:()=>{},dispose:()=>frames.forEach(f=>f.frame.remove())};
  const bridge={registerMount:async()=>({ok:true}),confirmParent:async v=>({ok:true,grant:{id:'grant_'+v.role,mountId:'mount',role:v.role,parentDocumentId:'parent',uiDocumentId:'ui_'+v.role,scopeGrantId:'scope',expiresAt:new Date(Date.now()+20000).toISOString()}})};
  const controller=createSurfaceController({document,adapter,surface,bridge,extensionOrigin:'chrome-extension://extension'});
  const handle=await controller.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});if(!handle)throw Error('controller start');
  for(const {role,frame}of frames)window.dispatchEvent(new MessageEvent('message',{origin:'chrome-extension://extension',source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'nonce_'+role}}));
  for(let i=0;i<30;i++)await Promise.resolve();
  if(!controller.showReading())throw Error('controller reading');
  window.gapTest={controller,adapter,shows:()=>shows};
 });
 const button=page.getByRole('button',{name:'返回工作空间'});await button.click();
 const controller=await page.evaluate(()=>{const result={workspaceOpened:gapTest.shows()===2,returnRemoved:!document.querySelector('[aria-label="返回工作空间"]'),nativeSlotUnchanged:document.querySelector('#slot').children.length===0,draftPreserved:document.querySelector('textarea').value==='fixture draft'};gapTest.controller.showReading();return result;});
 assert(Object.values(controller).every(v=>v===true),JSON.stringify(controller));
 await page.evaluate(()=>{document.querySelector('#slot').style.transform='translateX(50px)';});
 const automaticGeometrySafety=await page.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,0));const b=document.querySelector('[aria-label="返回工作空间"]');return !b||(gapTest.adapter.inspect().ok&&b.getBoundingClientRect().x===document.querySelector('#slot').getBoundingClientRect().x+8);});
 assert.equal(automaticGeometrySafety,true,'style mutation must withdraw or safely reposition before grant expiry');
 await page.evaluate(()=>gapTest.controller.stop());
 console.log(JSON.stringify({result:'PASS_WEB_MECHANISM_ONLY',checks:result,controller,automaticGeometrySafety,bridge:'FIXTURE_NOT_MV3'}));
}finally{await browser.close();}
