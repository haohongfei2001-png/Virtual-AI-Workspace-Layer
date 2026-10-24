/** Real DOM + native mask; synthetic grants only, not MV3 identity evidence. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url)),baseline=process.env.FREE_PROJECT_MASK_BASELINE_REF;
const plugins=baseline?[{name:'baseline',setup(b){b.onLoad({filter:/src\/host\/(surface-discovery|chatgpt-adapter)\.mjs$/},args=>({contents:execFileSync('git',['show',baseline+':'+args.path.slice(process.cwd().length+1)],{encoding:'utf8'}),loader:'js'}));}}]:[];
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {createSurfaceDiscovery} from './src/host/surface-discovery.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {createMountSurface} from './src/navigation/mount-surface.mjs';export {createSurfaceController} from './src/host/surface-controller.mjs';export {splitSurfacePayload} from './src/host/surface-fragments.mjs';",resolveDir:process.cwd()},plugins,bundle:true,write:false,format:'iife',globalName:'maskedModule'});
const P='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',C='33333333-3333-4333-8333-333333333333',B='44444444-4444-4444-8444-444444444444',url='https://chatgpt.com/g/'+P+'/project',browser=await chromium.launch({headless:true}),results=[];
try{
 for(const mode of ['unmasked-alias','mask','native-hidden-attribute','native-hidden-css','native-hidden-aria','replace-root','probe-refused','title-conflict','identity-query-conflict','stable-drain','project-reading-return','return-corner-occluded']){
  const page=await browser.newPage({viewport:{width:785,height:1193}});await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedProjectHTML(P,C)}):r.abort());await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(async({mode,C,B})=>{
   const {createChatGPTAdapter,createSurfaceDiscovery,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createMountSurface,createSurfaceController,splitSurfacePayload}=maskedModule;
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()},policy=createURLPolicy({profile:{projectId:({container})=>container,query:{variant:{semantic:'identity',values:['a','b']}}}});
   let surface,controller,probes=0,reads=0,emissions=0;const panel=document.querySelector('#project-panel'),leaf=panel.querySelectorAll('a>div>div:first-child')[1],draft=document.querySelector('#draft');
   for(const n of panel.querySelectorAll('a,a>div,a>div>div:last-child'))for(const k of ['textContent','innerText'])Object.defineProperty(n,k,{get(){reads++;throw Error('forbidden-preview-read');}});
   if(mode==='unmasked-alias'){
    const d=createSurfaceDiscovery({document,binding,profile,urlPolicy:policy}),payload=d.scan();
    const parts=splitSurfacePayload(payload,{protocol:'vaiwl-host-observation/1',localSeq:1});
    const targets=parts.flatMap(p=>p.candidates).map(c=>c.target.nativeId);d.stop();
    return {passed:targets.length===3&&targets.includes(C)&&targets.includes(B)&&reads===0};
   }
   const adapter=createChatGPTAdapter({document,profile,urlPolicy:policy,isOwnedMask:n=>surface?.isMasked(n)===true,isOwnedSurface:n=>surface?.isOwnedSurface(n)===true,withNativeReading:read=>{probes++;return mode==='probe-refused'?null:controller?.withNativeReading(read)??null;}});
   surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
   controller=createSurfaceController({document,adapter,surface,extensionOrigin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',bridge:{registerMount:async()=>({ok:true}),confirmParent:async m=>({ok:true,grant:{id:'fixture_'+m.role,mountId:m.mountId,role:m.role,parentDocumentId:binding.browserDocumentId,uiDocumentId:'fixture_ui_'+m.role,scopeGrantId:'fixture_scope',expiresAt:binding.expiresAt}})}});
   const handle=await controller.start({binding,emit:async p=>{emissions++;return {state:'accepted',localSeq:p.localSeq,receiptId:'fixture'};}});assertExists(handle);
   for(const {role,frame}of surface.frames(handle))dispatchEvent(new MessageEvent('message',{origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'fixture_'+role}}));
   for(let i=0;i<50;i++)await Promise.resolve();
   const discovery=createSurfaceDiscovery({document,binding,profile,urlPolicy:policy,isOwnedMask:n=>surface.isMasked(n),withNativeReading:read=>mode==='probe-refused'?null:controller.withNativeReading(read)});
   if(mode==='probe-refused'){let rejected=false;try{discovery.scan();}catch{rejected=true;}controller.stop();discovery.stop();return {passed:rejected&&reads===0};}
   if(mode==='project-reading-return'||mode==='return-corner-occluded'){
    const returned=controller.showReading(),button=document.querySelector('button[aria-label="返回工作空间"]');
    let passed=returned&&!!button&&button.querySelector('svg')!==null;
    if(mode==='return-corner-occluded'&&button){const r=button.getBoundingClientRect(),occluder=document.createElement('button');occluder.style.cssText=`position:fixed;left:${r.x+1}px;top:${r.y+1}px;width:2px;height:2px;border:0;padding:0;z-index:31`;document.body.append(occluder);passed&&=controller.showWorkspace()===false;occluder.remove();}else passed&&=controller.showWorkspace()===true;controller.stop();discovery.stop();return {passed,returned,buttonPresent:!!button};
   }
   const initial=discovery.scan(),row=initial.candidates.find(c=>c.target.nativeId===B),alias=initial.candidates.filter(c=>c.target.nativeId===C);assertExists(row);
   const envelope={protocol:'vaiwl-host-observation/1',...binding,localSeq:1,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'surface-delta'};
   if(mode==='title-conflict')document.querySelector('nav a').textContent='Different title';
   if(mode==='identity-query-conflict')document.querySelector('nav a').href+="?variant=a";
   if(mode.endsWith('conflict')){let rejects=false;try{splitSurfacePayload(discovery.scan(),envelope);}catch(e){rejects=e.message==='host-candidate-conflict';}controller.stop();discovery.stop();return {passed:rejects&&reads===0};}
   const canonical=alias.length===1&&alias[0].target.navigationURL.includes('/g/'),parts=splitSurfacePayload(initial,envelope),node=discovery.getNode(row.target.liveHandle),maskedDispatch=discovery.getNode(row.target.liveHandle,{forDispatch:true});
   const nativeHandleSafe=!!node&&maskedDispatch===null&&!!discovery.resolveLoadedTargets([{entity:'conversation',nativeId:B,navigationURL:row.target.navigationURL}])[0];
   let hiddenSafe=true;
   if(mode==='native-hidden-attribute')leaf.hidden=true;if(mode==='native-hidden-css')leaf.style.visibility='hidden';if(mode==='native-hidden-aria')leaf.setAttribute('aria-hidden','true');
   if(mode.startsWith('native-hidden'))hiddenSafe=!discovery.scan().candidates.some(c=>c.target.nativeId===B)&&discovery.getNode(row.target.liveHandle)===null;
   if(mode==='replace-root'){panel.replaceWith(panel.cloneNode(true));hiddenSafe=discovery.getNode(row.target.liveHandle)===null;}
   if(mode==='stable-drain'){globalThis.maskedCase={adapter,controller,discovery,emissions:()=>emissions,probes:()=>probes};return {passed:canonical&&nativeHandleSafe&&reads===0};}
   const remaining=surface.visibility(handle),sameDraft=document.querySelector('#draft')===draft&&draft.value==='fixture draft';controller.stop();discovery.stop();
   return {passed:canonical&&parts.length===1&&nativeHandleSafe&&hiddenSafe&&sameDraft&&reads===0,canonical,nativeHandleSafe,hiddenSafe,reads,remaining};
   function assertExists(value){if(!value)throw Error('missing-fixture-handle-or-row');}
  },{mode,C,B}).catch(e=>({passed:false,error:e.message}));
  if(result.passed&&mode==='stable-drain')try{await page.waitForFunction(()=>!!maskedCase.adapter.prepareIdle(),null,{timeout:1500});const before=await page.evaluate(()=>({emissions:maskedCase.emissions(),probes:maskedCase.probes()}));await page.waitForTimeout(250);const after=await page.evaluate(()=>({emissions:maskedCase.emissions(),probes:maskedCase.probes()}));result.stable=JSON.stringify(before)===JSON.stringify(after);result.passed&&=result.stable;await page.evaluate(()=>{maskedCase.controller.stop();maskedCase.discovery.stop();});}catch(e){result.passed=false;result.error=e.message;}
  results.push({mode,...result});await page.close();
 }
 console.log(JSON.stringify({status:results.every(x=>x.passed)?'PASS_WEB_MECHANISM_ONLY':'FAIL',baseline:baseline??null,results}));assert(results.every(x=>x.passed));
}finally{await browser.close();}
