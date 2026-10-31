import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {LEGACY_SURFACE_PROFILE} from './src/host/surface-discovery.mjs';export {createMountSurface} from './src/navigation/mount-surface.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'viewportModule'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}});
 const url='https://chatgpt.com/c/33333333-3333-4333-8333-333333333333';
 await page.route('**/*',route=>route.request().url()===url?route.fulfill({contentType:'text/html',body:`<!doctype html><style>
 body{margin:0}#header{position:fixed;left:220px;top:0;width:780px;height:52px}#slot{width:40px;height:40px}
 #history{position:fixed;left:0;top:60px;width:200px;height:600px}
 #viewport{position:absolute;left:220px;top:52px;width:780px;height:648px;overflow:auto}
 #reading{height:2000px}#footer{position:sticky;bottom:0;height:80px;background:white}#editor{height:40px}
 </style><nav id="history"></nav><header id="header"><div id="slot"></div></header><div id="viewport"><section id="reading"><button id="native-message-control">Native message control</button></section><footer id="footer"><textarea id="editor">unsaved fixture draft</textarea><button id="native-tool">Native tool</button></footer></div>`}):route.abort());
 await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const {createChatGPTAdapter,LEGACY_SURFACE_PROFILE,createMountSurface}=viewportModule;
  const profile={...LEGACY_SURFACE_PROFILE,currentBody:undefined,regions:{...LEGACY_SURFACE_PROFILE.regions,history:'#history'},nativeLayout:{header:'#header',reading:'#reading',composer:'#footer',navigationSlot:'#slot',readingViewport:'#viewport'}};
  const adapter=createChatGPTAdapter({document,profile}),binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
  const viewport=document.querySelector('#viewport'),reading=document.querySelector('#reading'),editor=document.querySelector('#editor'),footer=document.querySelector('#footer');
  viewport.scrollTop=viewport.scrollHeight;
  const first=adapter.inspect();if(!first.ok)throw Error(first.reason);
  const mount=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'}),handle=await mount.mount({binding},first);
  mount.showWorkspace(handle);
  const workspace=document.querySelector('section[popover]'),initial={contentOffscreen:reading.getBoundingClientRect().y<0,top:first.readingRect.y,bottom:first.readingRect.y+first.readingRect.height,footerTop:footer.getBoundingClientRect().y,rootMasked:getComputedStyle(reading).visibility==='hidden',viewportUnmasked:getComputedStyle(viewport).visibility==='visible',inputVisible:getComputedStyle(editor).visibility==='visible',noHTMLInert:!viewport.hasAttribute('inert')&&!reading.hasAttribute('inert')};
  footer.style.height='160px';const updated=adapter.inspect(),refreshed=mount.refreshGeometry(handle,updated);
  const resized={refreshed,bottom:parseFloat(workspace.style.top)+parseFloat(workspace.style.height),footerTop:footer.getBoundingClientRect().y,draftPreserved:editor.value==='unsaved fixture draft'};
  workspace.querySelector('button[popovertarget]').click();await new Promise(r=>setTimeout(r,0));
  const closed={restored:getComputedStyle(reading).visibility==='visible',inputVisible:getComputedStyle(editor).visibility==='visible',workspaceClosed:!workspace.matches(':popover-open')};
  viewport.append(document.createElement('button'));const unknownSiblingRejected=adapter.inspect().ok===false;
  mount.dispose(handle);adapter.stop();return {initial,resized,closed,unknownSiblingRejected,ownedRemoved:document.querySelectorAll('[data-va-owned]').length===0};
 });
 assert.equal(result.initial.contentOffscreen,true);assert.equal(result.initial.top,52);assert.equal(result.initial.bottom,result.initial.footerTop);
 for(const key of ['rootMasked','viewportUnmasked','inputVisible','noHTMLInert'])assert.equal(result.initial[key],true,key);
 assert.equal(result.resized.refreshed,true);assert.equal(result.resized.bottom,result.resized.footerTop);assert.equal(result.resized.draftPreserved,true);
 assert.deepEqual(result.closed,{restored:true,inputVisible:true,workspaceClosed:true});assert.equal(result.unknownSiblingRejected,true);assert.equal(result.ownedRemoved,true);
 console.log(JSON.stringify({result:'PASS_WEB_MECHANISM_ONLY',...result}));
}finally{await browser.close();}
