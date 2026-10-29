/** Existing anonymous host fixtures; no account, network responses or credentials.
 * Browser mechanism regression only; the formal MV3 journey is separate. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {j3ModernPage} from './fixtures/j3-modern.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {observedHomeHTML,longDesktopHTML,materializePartitionedSidebar,materializeFlatHomeBranch} from './fixtures/observed-host-replay.mjs';
import mainMountReceipt from './fixtures/observed-main-mount-20261029.json' with {type:'json'};
import partitionDetails from './fixtures/observed-sidebar-project-details-20261026.json' with {type:'json'};
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {captureNativeBaseline} from './src/host/document-flow-layout.mjs';export {validMainMountCheck} from './src/host/native-flow-diagnostic.mjs';export {createSurfaceController} from './src/host/surface-controller.mjs';export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {createFlowMountSurface} from './src/navigation/flow-mount-surface.mjs';export {observeNativeProjectManagement} from './src/host/native-project-management.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'flowModule'});
const P='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',C='33333333-3333-4333-8333-333333333333';
const legacy=(await readFile(new URL('./fixtures/legacy.html',import.meta.url),'utf8')).replace('<link rel="stylesheet" href="/native.css">','<style>'+await readFile(new URL('./fixtures/native.css',import.meta.url),'utf8')+'</style>');
const browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']}),results=[];
try{
 {
 const flat=await browser.newPage({viewport:{width:1234,height:897}});
 await flat.route('**/*',r=>r.request().url()==='https://chatgpt.com/'?r.fulfill({contentType:'text/html',body:observedHomeHTML(C)}):r.abort());
 await flat.goto('https://chatgpt.com/');await flat.evaluate(materializeFlatHomeBranch);await flat.addScriptTag({content:outputFiles[0].text});
 const decision=await flat.evaluate(async receipt=>{
  const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,captureNativeBaseline,validMainMountCheck,createFlowMountSurface}=flowModule;
  if(!validMainMountCheck(receipt))throw Error('invalid real receipt');
  const adapter=createChatGPTAdapter({document,profile});
  const binding={documentToken:'flat-home',producerToken:'flat-home',browserDocumentId:'flat-home',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'flat-home'})});
  const inspection=adapter.inspect(),branch=document.querySelector('#fixture-flat-native-member'),original=branch.outerHTML,box=branch.getBoundingClientRect();let report;
  const plan=captureNativeBaseline({document,inspection,onDiagnostic:r=>report=r});
  if(!plan){adapter.stop();return {admitted:false,reason:report?.reason,detail:report?.detail,box:[box.x,box.y,box.width,box.height]};}
  const capture=()=>captureNativeBaseline({document,inspection});
  const escaped=document.createElement('div');escaped.style.cssText='height:.2px;width:10px';branch.append(escaped);const subpixelRejected=capture()===null;escaped.remove();
  const text=document.createTextNode('native overflow');branch.append(text);const textRejected=capture()===null;text.remove();
  const zeroWidth=document.createTextNode('\u200b');branch.append(zeroWidth);const range=document.createRange();range.selectNodeContents(zeroWidth);const textBox=range.getBoundingClientRect();
  const zeroWidthTextRejected=textBox.width===0&&textBox.height>0&&capture()===null;zeroWidth.remove();
  const child=document.createElement('button');child.textContent='Native action';child.style.cssText='position:fixed;left:400px;top:200px';branch.append(child);const controlRejected=capture()===null;child.remove();
  const slider=document.createElement('input');slider.type='range';slider.style.cssText='width:100px;height:0;border:0;padding:0';branch.append(slider);const nativeZeroHeightControlRejected=slider.getBoundingClientRect().height===0&&capture()===null;slider.remove();
  const rule=document.createElement('style');rule.textContent='#fixture-flat-native-member::before{content:"";display:block;height:1px}';document.head.append(rule);const pseudoRejected=capture()===null;rule.remove();
  const prior=branch.style.cssText;branch.style.outline='1px solid black';branch.style.outlineOffset='-2px';const outlineRejected=capture()===null;branch.style.cssText=prior;
  branch.style.boxShadow='0 0 2px black';const shadowRejected=capture()===null;branch.style.cssText=prior;
  const surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'}),handle=await surface.mount({binding},inspection);
  const editor=document.querySelector('textarea'),draft=editor.value,shown=surface.showWorkspace(handle),safe=surface.validateActiveLayout(handle);
  const tick=async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);};
  branch.append(escaped);await tick();const liveOverflowSurrendered=!surface.visibility(handle).workspace;escaped.remove();surface.showReading(handle);
  const recovered=surface.showWorkspace(handle)&&surface.validateActiveLayout(handle);
  const stylesheet=document.createElement('style');document.head.append(stylesheet);stylesheet.sheet.insertRule('#fixture-flat-native-leaf { height:.2px!important }');await tick();
  const cssomOverflowSurrendered=!surface.visibility(handle).workspace;stylesheet.remove();surface.showReading(handle);const cssomRecovered=surface.showWorkspace(handle)&&surface.validateActiveLayout(handle);
  surface.showReading(handle);surface.dispose(handle);adapter.stop();
  return {admitted:true,box:[box.x,box.y,box.width,box.height],subpixelRejected,textRejected,zeroWidthTextRejected,controlRejected,nativeZeroHeightControlRejected,pseudoRejected,outlineRejected,shadowRejected,shown,safe,liveOverflowSurrendered,recovered,cssomOverflowSurrendered,cssomRecovered,originalNodeAndDraft:editor.isConnected&&editor===document.querySelector('textarea')&&editor.value===draft,restored:branch.outerHTML===original};
 },mainMountReceipt.mainMountCheck);
 // The report rounds geometry and does not capture CSS. Reconstruct its
 // decisive width/zero-height condition, not an invented pixel-exact subtree.
 assert.deepEqual(decision.box.slice(2),mainMountReceipt.mainMountCheck.rows[3][5].slice(2));
 assert.deepEqual({...decision,box:undefined},{admitted:true,box:undefined,subpixelRejected:true,textRejected:true,zeroWidthTextRejected:true,controlRejected:true,nativeZeroHeightControlRejected:true,pseudoRejected:true,outlineRejected:true,shadowRejected:true,shown:true,safe:true,liveOverflowSurrendered:true,recovered:true,cssomOverflowSurrendered:true,cssomRecovered:true,originalNodeAndDraft:true,restored:true});
 console.log(JSON.stringify({observedFlatHomeBranch:decision}));await flat.close();
 }
 {
 const probe=await browser.newPage({viewport:{width:1440,height:1000}});
 await probe.route('**/*',r=>r.request().url()==='https://chatgpt.com/c/'+C?r.fulfill({contentType:'text/html',body:legacy}):r.abort());
 await probe.goto('https://chatgpt.com/c/'+C);await probe.addScriptTag({content:outputFiles[0].text});
 const decisions=await probe.evaluate(async()=>{
  const {captureNativeBaseline,createChatGPTAdapter,validMainMountCheck}=flowModule;
  const adapter=createChatGPTAdapter({document});await adapter.start({binding:{documentToken:'diag',producerToken:'diag',browserDocumentId:'diag',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()},emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'diag'})});const base=adapter.inspect();if(!base.ok)throw Error('diagnostic fixture inspection');
  const root=base.reading.parentElement,initial=root.innerHTML,results=[];
  const check=(kind,expected,detail,mutate)=>{
   root.innerHTML=initial;const inspection=adapter.inspect();if(!inspection.ok)throw Error('reset inspection');
   const selected=mutate?.(inspection);let report,reason;
   const before=document.documentElement.outerHTML;
   const plan=captureNativeBaseline({document,inspection,onRefused:r=>reason=r,onDiagnostic:r=>report=r});
   if(!validMainMountCheck(report)||report.reason!==expected||report.detail!==detail)throw Error('wrong refusal '+kind+' '+JSON.stringify(report));
   const repeated=captureNativeBaseline({document,inspection,onDiagnostic:()=>{throw Error('diagnostic observer failed');}});
   if(!!plan!==!!repeated||document.documentElement.outerHTML!==before)throw Error('diagnostic changed admission or DOM');
   if(selected){const row=report.rows[report.rejected],rect=selected.nodeType===1?selected.getBoundingClientRect():null;if(!row||!(row[4]&64)||rect&&JSON.stringify(row[5])!==JSON.stringify([rect.x,rect.y,rect.width,rect.height].map(Math.round)))throw Error('wrong rejected node '+kind);}
   if(JSON.stringify(report).includes('PRIVATE'))throw Error('diagnostic leaked content');
   results.push({kind,reason:report.reason,detail:report.detail,coverage:report.coverage});
  };
  const wrap=inspection=>{const n=document.createElement('div');inspection.reading.before(n);n.append(inspection.reading);return n;};
  check('accepted','none','accepted');
  check('uncovered','native-flow-uncovered-branch','branch-without-landmark',i=>{const n=document.createElement('div');n.setAttribute('data-private-id','PRIVATE_ID');n.title='PRIVATE_TITLE';n.textContent='PRIVATE_BODY';i.composer.after(n);return n;});
  check('wrapper-control','native-flow-wrapper-control','wrapper-control',i=>{const n=wrap(i);n.tabIndex=0;return n;});
  check('wrapper-text','native-flow-wrapper-text','wrapper-text',i=>{const n=wrap(i);n.prepend('PRIVATE_TEXT');return n;});
  check('wrapper-effect','native-flow-wrapper-paint','wrapper-effect',i=>{const n=wrap(i);n.style.transform='translateX(1px)';return n;});
  check('wrapper-visibility','native-flow-wrapper-paint','wrapper-visibility',i=>{const n=wrap(i);n.style.visibility='hidden';return n;});
  check('retained-style','native-flow-branch-paint','retained-style',i=>{i.homeLayoutNodes=[];const n=document.createElement('div'),child=document.createElement('button');n.style.cssText='height:40px;position:relative';child.textContent='PRIVATE_BUTTON';child.style.position='absolute';n.append(child);i.composer.after(n);return child;});
  check('retained-svg-reference','native-flow-branch-paint','retained-svg',i=>{i.homeLayoutNodes=[];const n=document.createElement('div');n.style.height='40px';n.innerHTML='<svg width="20" height="20" style="overflow:hidden"><use href="#PRIVATE_ID"/></svg>';i.composer.after(n);return n.querySelector('use');});
  root.innerHTML=initial;const inspection=adapter.inspect(),nativeGet=window.getComputedStyle;let thrown;
  window.getComputedStyle=()=>{throw Error('PRIVATE_NATIVE_ERROR');};
  try{captureNativeBaseline({document,inspection,onDiagnostic:r=>thrown=r});}finally{window.getComputedStyle=nativeGet;}
  if(!validMainMountCheck(thrown)||thrown.reason!=='native-flow-check-failed'||thrown.rejected!==null||thrown.coverage!=='partial')throw Error('unknown exception fabricated node');
  results.push({kind:'unknown-exception',reason:thrown.reason,detail:thrown.detail,coverage:thrown.coverage});
  root.innerHTML=initial;adapter.stop();return results;
 });
 assert.equal(decisions.length,9);assert(decisions.slice(0,8).every(r=>r.coverage==='complete'));assert.equal(decisions[8].coverage,'partial');
 console.log(JSON.stringify({mainMountDiagnostic:decisions}));await probe.close();
 }
 {
 // The owner starts observation before native hydration. Choosing a layout
 // contract must not depend on whether its first landmark already exists.
 const hydration=await browser.newPage({viewport:{width:1400,height:900}});
 await hydration.route('**/*',r=>r.request().url()==='https://chatgpt.com/'?r.fulfill({contentType:'text/html',body:observedHomeHTML(C)}):r.abort());
 await hydration.goto('https://chatgpt.com/');await hydration.addScriptTag({content:outputFiles[0].text});
 const lateHome=await hydration.evaluate(async()=>{
  const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface,createSurfaceController}=flowModule;
  const anchor=document.querySelector('.home-composer-anchor'),parent=anchor.parentElement,next=anchor.nextSibling;anchor.remove();
  let surface,mount=null,registrations=0;
  const adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'late-home',producerToken:'late-home',browserDocumentId:'late-home',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()},context=await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'late-home'})});
  const extensionOrigin='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';surface=createFlowMountSurface({document,createFrameURL:({role})=>extensionOrigin+'/'+role+'.html'});
  const bridge={registerMount:async({handle})=>{mount=handle;registrations++;return {ok:true};},confirmParent:async()=>({ok:false})};
  const controller=createSurfaceController({document,adapter,surface,bridge,extensionOrigin});
  const before=await controller.start({context}),waiting=!before&&controller.localStatus()==='surface-missing-or-ambiguous-native-boundary';
  parent.insertBefore(anchor,next);for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
  const inspection=adapter.inspect(),result={waiting,homeContract:inspection.ok&&inspection.reading===anchor&&Array.isArray(inspection.homeLayoutNodes),mounted:!!mount,registrations,privateHidden:!!mount&&surface.visibility(mount).workspace===false};
  controller.stop();adapter.stop();return result;
 });
 await hydration.close();
 // A native control may be replaced within the same protected composer. The
 // old proof must fail, then the complete restored-native proof may recover.
 const replacement=await browser.newPage({viewport:{width:1440,height:1000}});
 await replacement.route('**/*',r=>r.request().url()==='https://chatgpt.com/c/'+C?r.fulfill({contentType:'text/html',body:legacy}):r.abort());
 await replacement.goto('https://chatgpt.com/c/'+C);await replacement.addScriptTag({content:outputFiles[0].text});
 const replacedControl=await replacement.evaluate(async()=>{
  const {createChatGPTAdapter,createFlowMountSurface,createSurfaceController}=flowModule;let surface,registrations=0,currentHandle=null;
  const adapter=createChatGPTAdapter({document,isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'control-replacement',producerToken:'control-replacement',browserDocumentId:'control-replacement',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()},context=await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'control-replacement'})});
  const extensionOrigin='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';surface=createFlowMountSurface({document,createFrameURL:({role})=>extensionOrigin+'/'+role+'.html'});
  const bridge={registerMount:async({handle})=>{currentHandle=handle;registrations++;return {ok:true};},confirmParent:async({mountId,role})=>({ok:true,grant:{id:'grant_'+role,mountId,role,parentDocumentId:binding.browserDocumentId,uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:binding.expiresAt}})};
  const controller=createSurfaceController({document,adapter,surface,bridge,extensionOrigin}),handle=await controller.start({context});
  const settle=async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);};
  for(const {role,frame}of surface.frames(handle))window.dispatchEvent(new MessageEvent('message',{origin:extensionOrigin,source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'nonce_'+role}}));
  await settle();const frames=surface.frames(handle).map(x=>x.frame),initial=surface.visibility(handle).workspace,input=document.querySelector('textarea');input.value='preserved draft';
  const old=document.querySelector('#tools-button'),fresh=old.cloneNode(true);old.replaceWith(fresh);
  const oldProofRejected=!surface.isSameNativeRegions(handle);await settle();
  const result={initial,oldProofRejected,recovered:surface.visibility(handle).workspace,sameFrames:frames.every((f,i)=>surface.frames(handle)[i]?.frame===f),registrations,draft:input.value==='preserved draft',newProof:surface.isSameNativeRegions(handle)};
  controller.showReading();const composer=document.querySelector('#composer');composer.setAttribute('role','group');
  result.changedStructureRejected=surface.refreshNativeBaseline(handle,()=>adapter.inspect())===null;composer.removeAttribute('role');
  controller.showWorkspace();await settle();
  const header=document.querySelector('main > header'),nextHeader=header.cloneNode(true),oldWindows=frames.map(f=>f.contentWindow);
  // Native replacement does not inherit extension-owned presentation markers.
  for(const node of [nextHeader,...nextHeader.querySelectorAll('*')])for(const attr of [...node.attributes])if(attr.name.startsWith('data-va-'))node.removeAttribute(attr.name);
  header.replaceWith(nextHeader);await settle();
  const rejoined=currentHandle!==handle;let newFrames=surface.frames(currentHandle);
  result.landmarkReplacement=rejoined&&registrations===2&&frames.every(f=>!f.isConnected)&&surface.visibility(currentHandle).workspace===false;
  for(const source of oldWindows)window.dispatchEvent(new MessageEvent('message',{origin:extensionOrigin,source,data:{type:'VAIWL_UI_JOIN',role:'workspace',nonce:'retired'}}));
  await settle();result.oldJoinRejected=surface.visibility(currentHandle).workspace===false;
  for(const {role,frame}of newFrames)window.dispatchEvent(new MessageEvent('message',{origin:extensionOrigin,source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'new_'+role}}));
  await settle();result.freshGrantResumes=rejoined&&surface.visibility(currentHandle).workspace&&controller.presentationIntent()==='workspace'&&input.isConnected&&input.value==='preserved draft';
  const provedHeader=document.querySelector('main > header'),temporary=provedHeader.cloneNode(true),main=document.querySelector('main'),beforeFailure=currentHandle;
  for(const node of [temporary,...temporary.querySelectorAll('*')])for(const attr of [...node.attributes])if(attr.name.startsWith('data-va-'))node.removeAttribute(attr.name);
  main.setAttribute('tabindex','0');provedHeader.replaceWith(temporary);await settle();
  result.failedProofHidden=currentHandle===beforeFailure&&!surface.visibility(currentHandle).workspace&&!controller.isNativeStructureCurrent();
  temporary.replaceWith(provedHeader);main.removeAttribute('tabindex');await settle();
  result.restoredProofRejoins=currentHandle!==beforeFailure&&registrations===3&&!surface.visibility(currentHandle).workspace&&newFrames.every(({frame})=>!frame.isConnected);
  newFrames=surface.frames(currentHandle);
  for(const {role,frame}of newFrames)window.dispatchEvent(new MessageEvent('message',{origin:extensionOrigin,source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'restored_'+role}}));
  await settle();result.restoredProofResumes=currentHandle!==beforeFailure&&surface.visibility(currentHandle).workspace;
  controller.revoke();await settle();result.revoked=!newFrames.some(({frame})=>frame.isConnected)&&!document.querySelector('[data-va-flow-root]');adapter.stop();return result;
 });
 await replacement.close();
 console.log(JSON.stringify({lateHome,replacedControl}));
 assert.deepEqual(lateHome,{waiting:true,homeContract:true,mounted:true,registrations:1,privateHidden:true});
 assert.deepEqual(replacedControl,{initial:true,oldProofRejected:true,recovered:true,sameFrames:true,registrations:1,draft:true,newProof:true,changedStructureRejected:true,landmarkReplacement:true,oldJoinRejected:true,freshGrantResumes:true,failedProofHidden:true,restoredProofRejoins:true,restoredProofResumes:true,revoked:true});
 }
 // The home adapter admits the welcome/composer landmarks without claiming
 // that they exhaust their common parent. Replay an additional native flow
 // member, not a purported capture of the user's unidentified extra branch.
 const members=await browser.newPage({viewport:{width:1400,height:900}});
 await members.route('**/*',r=>r.request().url()==='https://chatgpt.com/'?r.fulfill({contentType:'text/html',body:observedHomeHTML(C)}):r.abort());
 await members.goto('https://chatgpt.com/');await members.addScriptTag({content:outputFiles[0].text});
 const retainedHome=await members.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface,captureNativeBaseline}=flowModule;let surface;
  const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'home-members',producerToken:'home-members',browserDocumentId:'home-members',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'home-members'})});
  const parent=document.querySelector('[role=main]'),editor=parent.querySelector('textarea'),branch=document.createElement('section'),button=document.createElement('button'),hidden=document.createElement('div');
  parent.style.marginTop='52px';for(const node of [parent.querySelector('.home-composer-anchor'),parent.querySelector('form')]){node.style.position='relative';node.style.top='auto';}
  branch.id='native-extra';branch.style.cssText='padding:12px;box-sizing:border-box';button.type='button';button.textContent='Native extra action';
  // A retained native action can include a static clipped icon. This is a
  // local contract counterexample, not the unidentified real-page branch.
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(icon.namespaceURI,'path');
  icon.id='native-extra-icon';icon.setAttribute('viewBox','0 0 16 16');icon.setAttribute('width','16');icon.setAttribute('height','16');icon.setAttribute('aria-hidden','true');icon.style.cssText='overflow:hidden;vertical-align:middle';path.setAttribute('d','M2 2H14V14H2Z');icon.append(path);button.prepend(icon);
  branch.append(button);parent.append(branch);hidden.hidden=true;parent.append(hidden);
  let clicks=0;button.addEventListener('click',()=>clicks++);
  const original=parent.outerHTML,inspection=adapter.inspect();
  surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
  let handle;try{handle=await surface.mount({binding},inspection);}catch(e){adapter.stop();return {adapterReady:inspection.ok,reason:e.message};}
  const shown=surface.showWorkspace(handle),safe=surface.validateActiveLayout(handle),workspace=surface.frames(handle).find(f=>f.role==='workspace').frame.parentElement;
  globalThis.nativeMemberProbe={adapter,surface,handle,parent,editor,branch,button,icon,path,hidden,original,inspection,binding,captureNativeBaseline,clicks:()=>clicks,workspace};
  return {adapterReady:inspection.ok,returnReady:inspection.roles.return.available,shown,safe,nativeAfterComposer:branch.getBoundingClientRect().top>=editor.closest('form').getBoundingClientRect().bottom,retained:branch.parentElement===parent&&button.parentElement===branch&&getComputedStyle(branch).display!=='contents'&&hidden.hidden};
 });
 assert.deepEqual(retainedHome,{adapterReady:true,returnReady:true,shown:true,safe:true,nativeAfterComposer:true,retained:true});
 await members.getByRole('button',{name:'Native extra action',exact:true}).click();
 assert.equal(await members.evaluate(()=>nativeMemberProbe.clicks()),1);
 // Keyboard activation is the same native gesture contract. A tool may
 // open on Space down, before the browser's Space up/default click.
 await members.getByRole('button',{name:'Native extra action',exact:true}).focus();
 const keyTop=await members.evaluate(()=>nativeMemberProbe.button.getBoundingClientRect().top);
 await members.evaluate(()=>{
  const {button}=nativeMemberProbe,popup=document.createElement('div');popup.id='native-key-tool';popup.setAttribute('popover','manual');popup.style.cssText='position:fixed;inset:0 auto auto 0;width:100px;height:40px;margin:0';document.body.append(popup);
  window.nativeKeyEvents=[];button.addEventListener('keydown',e=>{if(e.key===' ')popup.showPopover();},{once:true});
  for(const type of ['keyup','click'])button.addEventListener(type,e=>nativeKeyEvents.push({type:e.type,top:button.getBoundingClientRect().top}),{once:true});
 });
 await members.keyboard.down('Space');
 assert.equal(await members.evaluate(()=>getComputedStyle(nativeMemberProbe.workspace).display),'none','native keyboard layer conceals private workspace');
 assert.equal(await members.evaluate(()=>nativeMemberProbe.button.getBoundingClientRect().top),keyTop,'native keyboard target keeps its position until keyup');
 await members.keyboard.up('Space');
 assert.deepEqual(await members.evaluate(()=>nativeKeyEvents),[{type:'keyup',top:keyTop},{type:'click',top:keyTop}],'original keyboard tool activation completes before geometry release');
 assert.equal(await members.evaluate(()=>nativeMemberProbe.clicks()),2);
 await members.evaluate(()=>document.querySelector('#native-key-tool').remove());
 await members.clock.install();
 await members.evaluate(()=>{
  const {surface,handle,button}=nativeMemberProbe;surface.showWorkspace(handle);button.focus();
  const popup=document.createElement('div');popup.id='native-held-key';popup.setAttribute('popover','manual');popup.style.cssText='position:fixed;inset:0 auto auto 0;width:100px;height:40px;margin:0';document.body.append(popup);
  button.addEventListener('keydown',()=>popup.showPopover(),{once:true});
 });
 await members.keyboard.down('Space');await members.clock.fastForward(1500);
 await members.keyboard.down('Space');await members.clock.fastForward(1501);
 assert.equal(await members.evaluate(()=>document.getElementById(nativeMemberProbe.handle.id+'_workspace_exit').hasAttribute('data-va-gesture')),false,'key repeat must not renew the original gesture deadline');
 assert.equal(await members.evaluate(()=>nativeMemberProbe.surface.visibility(nativeMemberProbe.handle).workspace),false);
 await members.keyboard.up('Space');await members.evaluate(()=>{document.querySelector('#native-held-key').remove();nativeMemberProbe.surface.showWorkspace(nativeMemberProbe.handle);});
 await members.keyboard.down('Space');
 assert.equal(await members.evaluate(()=>{const {surface,handle}=nativeMemberProbe;surface.showReading(handle);const cleared=!document.getElementById(handle.id+'_workspace_exit').hasAttribute('data-va-gesture');return cleared&&surface.showWorkspace(handle);}),true,'explicit close cancels the held activation key');
 await members.keyboard.up('Space');await members.clock.runFor(1);
 assert.equal(await members.evaluate(()=>nativeMemberProbe.surface.visibility(nativeMemberProbe.handle).workspace),true,'old keyup cannot close a newly reopened workspace');
 const retainedGuards=await members.evaluate(async()=>{
  const p=nativeMemberProbe,{surface,handle,branch,button,icon,path,hidden,parent,editor}=p,tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  surface.showReading(handle);
  const capture=()=>p.captureNativeBaseline({document,inspection:p.inspection,isOwnedSurface:n=>surface.isOwnedSurface(n)});
  const iconStyle=icon.getAttribute('style'),pathData=path.getAttribute('d');
  icon.style.overflow='visible';const unclippedIconRejected=capture()===null;
  icon.style.overflow='clip';icon.style.overflowClipMargin='100px';const expandedClipRejected=capture()===null;icon.setAttribute('style',iconStyle);
  const rejectedGraphics=[];
  for(const tag of ['use','foreignObject','animate']){const node=document.createElementNS(icon.namespaceURI,tag);icon.append(node);rejectedGraphics.push(capture()===null);node.remove();}
  path.setAttribute('d','M-100 -100H100V100H-100Z');const clippedOversizeAccepted=!!capture();path.setAttribute('d',pathData);
  // The final retained member is a hidden empty leaf. Model an expensive last
  // style read without sleeping or changing any native node: passing earlier
  // budget checks must not authorize a result produced after the deadline.
  const nativeStyle=window.getComputedStyle,ownNow=Object.getOwnPropertyDescriptor(performance,'now');let clock=0,hiddenReads=0,lateDeadlineRejected;
  Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
  window.getComputedStyle=(node,pseudo)=>{const result=nativeStyle.call(window,node,pseudo);if(node===hidden&&++hiddenReads===3)clock=26;return result;};
  try{lateDeadlineRejected=capture()===null;}finally{window.getComputedStyle=nativeStyle;if(ownNow)Object.defineProperty(performance,'now',ownNow);else delete performance.now;}
  const rule=document.createElement('style');document.head.append(rule);
  rule.textContent='#native-extra{position:absolute}';const absoluteRejected=capture()===null;
  rule.textContent='#native-extra button{position:fixed}';const escapeRejected=capture()===null;rule.remove();
  const text=document.createTextNode('x'.repeat(1000));branch.append(text);const textOverflowRejected=capture()===null;text.remove();
  const pseudo=document.createElement('style');pseudo.textContent='#native-extra::after{content:"native annotation"}';document.head.append(pseudo);const pseudoRejected=capture()===null;pseudo.remove();
  const list=document.createElement('ul');list.innerHTML='<li>Native item</li>';branch.append(list);const markerRejected=capture()===null;list.remove();
  rule.textContent='#native-extra button{-webkit-text-stroke:1000px black}';document.head.append(rule);const strokeRejected=capture()===null;rule.remove();
  // Keep native element order while also refusing a conflict with the known
  // welcome-before-composer contract. No silent reinterpretation of a member.
  const reading=p.inspection.reading,composer=p.inspection.composer;
  parent.prepend(composer);const conflict=document.createElement('div');conflict.style.cssText='height:20px';composer.after(conflict);const orderRejected=capture()===null;conflict.remove();reading.after(composer);
  const resumed=surface.showWorkspace(handle)&&surface.validateActiveLayout(handle);
  icon.style.overflow='visible';await tick();const clipChangeSurrendered=!surface.visibility(handle).workspace;
  icon.setAttribute('style',iconStyle);surface.showReading(handle);const clipRestored=surface.showWorkspace(handle)&&surface.validateActiveLayout(handle);
  const css=document.createElement('style');document.head.append(css);await tick();
  css.sheet.insertRule('#native-extra button{position:relative;left:1200px}');
  await tick();const cssomSurrendered=!surface.visibility(handle).workspace;
  css.remove();surface.showReading(handle);const returned=surface.showWorkspace(handle);
  hidden.hidden=false;await tick();const hiddenChangeSurrendered=!surface.visibility(handle).workspace;hidden.hidden=true;
  surface.showReading(handle);surface.showWorkspace(handle);
  const replacement=branch.cloneNode(true);branch.replaceWith(replacement);await tick();const replacementRejected=!surface.isSameNativeRegions(handle)&&!surface.visibility(handle).workspace;replacement.replaceWith(branch);
  surface.dispose(handle);p.adapter.stop();
  return {unclippedIconRejected,expandedClipRejected,rejectedGraphics,clippedOversizeAccepted,lateDeadlineRejected,clipChangeSurrendered,clipRestored,absoluteRejected,escapeRejected,textOverflowRejected,pseudoRejected,markerRejected,strokeRejected,orderRejected,resumed,cssomSurrendered,returned,hiddenChangeSurrendered,replacementRejected,restored:parent.outerHTML===p.original&&editor===parent.querySelector('textarea')&&editor.value==='fixture draft'&&icon===button.querySelector('svg')&&path===icon.firstChild};
 });
 assert.deepEqual(retainedGuards,{unclippedIconRejected:true,expandedClipRejected:true,rejectedGraphics:[true,true,true],clippedOversizeAccepted:true,lateDeadlineRejected:true,clipChangeSurrendered:true,clipRestored:true,absoluteRejected:true,escapeRejected:true,textOverflowRejected:true,pseudoRejected:true,markerRejected:true,strokeRejected:true,orderRejected:true,resumed:true,cssomSurrendered:true,returned:true,hiddenChangeSurrendered:true,replacementRejected:true,restored:true});
 const overlapRejected=await members.evaluate(async()=>{
  const p=nativeMemberProbe,branch=document.createElement('div');branch.style.cssText='height:40px;position:relative;top:-24px';p.parent.append(branch);
  const surface=flowModule.createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
  const handle=await surface.mount({binding:p.binding},p.inspection),refused=!surface.showWorkspace(handle);surface.dispose(handle);branch.remove();
  return refused&&p.parent.outerHTML===p.original;
 });
 assert.equal(overlapRejected,true);
 console.log(JSON.stringify({retainedHome,retainedGuards,overlapRejected}));await members.close();
 // Reuse the package-selected native-scroll-region variant already covered
 // by the return-gap proof. The same region must remain a real, focusable box
 // in flow layout, never be flattened as an arbitrary layout wrapper.
 const region=await browser.newPage({viewport:{width:1400,height:900}});
 await region.route('**/*',r=>r.request().url()==='https://chatgpt.com/c/'+C?r.fulfill({contentType:'text/html',body:longDesktopHTML(C)}):r.abort());
 await region.goto('https://chatgpt.com/c/'+C);await region.addScriptTag({content:outputFiles[0].text});
 const regionProof=await region.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface,captureNativeBaseline}=flowModule;let surface;
  const viewport=document.querySelector('[data-app-action-timeline-scroll]');viewport.setAttribute('role','region');viewport.setAttribute('tabindex','0');
  const original=viewport.outerHTML,parent=viewport.parentElement,editor=viewport.querySelector('textarea');
  const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'region',producerToken:'region',browserDocumentId:'region',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'region'})});
  const inspection=adapter.inspect();let refusal=null;
  const plan=captureNativeBaseline({document,inspection,onRefused:value=>refusal=value});
  if(!plan){adapter.stop();return {adapterReady:inspection.ok,returnReady:!!inspection.returnSlot,policy:inspection.viewportFocus??null,flowReady:false,refusal};}
  const rejects=()=>captureNativeBaseline({document,inspection})===null;
  const unselectedRejected=captureNativeBaseline({document,inspection:{...inspection,viewportFocus:null}})===null;
  viewport.setAttribute('role','button');const actionRejected=rejects();viewport.setAttribute('role','region');
  viewport.setAttribute('tabindex','1');const tabOrderRejected=rejects();viewport.setAttribute('tabindex','0');
  viewport.setAttribute('contenteditable','false');const editableRejected=rejects();viewport.removeAttribute('contenteditable');
  viewport.style.overflow='visible';const nonScrollingRejected=rejects();viewport.removeAttribute('style');
  surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
  const handle=await surface.mount({binding},inspection),shown=surface.showWorkspace(handle),active=surface.validateActiveLayout(handle);
  viewport.focus();const focusRetained=document.activeElement===viewport&&getComputedStyle(viewport).display==='grid'&&viewport.getAttribute('role')==='region'&&viewport.getAttribute('tabindex')==='0';
  surface.showReading(handle);const readingRestored=getComputedStyle(viewport).display==='block'&&document.activeElement===viewport&&surface.showWorkspace(handle);
  viewport.setAttribute('role','button');await new Promise(resolve=>setTimeout(resolve,0));
  const changedRoleSurrendered=!surface.visibility(handle).workspace&&!surface.isSameNativeRegions(handle);viewport.setAttribute('role','region');
  surface.dispose(handle);adapter.stop();
  return {adapterReady:inspection.ok,returnReady:!!inspection.returnSlot,policy:inspection.viewportFocus,flowReady:true,unselectedRejected,actionRejected,tabOrderRejected,editableRejected,nonScrollingRejected,shown,active,focusRetained,readingRestored,changedRoleSurrendered,restored:viewport.outerHTML===original&&viewport.parentElement===parent&&viewport.querySelector('textarea')===editor};
 });
 assert.deepEqual(regionProof,{adapterReady:true,returnReady:true,policy:'native-scroll-region',flowReady:true,unselectedRejected:true,actionRejected:true,tabOrderRejected:true,editableRejected:true,nonScrollingRejected:true,shown:true,active:true,focusRetained:true,readingRestored:true,changedRoleSurrendered:true,restored:true});
 console.log(JSON.stringify({nativeScrollRegion:regionProof}));
 // Browser mechanism counterexample on the same reconstructed native region:
 // a genuinely long reading flow with its original composer kept in view.
 // No claim that these fixture dimensions are a newly observed ChatGPT page.
 const readingScroll=await region.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;let surface;
  const viewport=document.querySelector('[data-app-action-timeline-scroll]'),editor=viewport.querySelector('textarea'),parent=viewport.parentElement;
  document.querySelector('#reading').style.height='2600px';document.querySelector('footer').style.cssText='position:fixed;left:280px;top:602px;width:600px;height:98px';
  const original=viewport.outerHTML,url=location.href;
  const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'reading-scroll',producerToken:'reading-scroll',browserDocumentId:'reading-scroll',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'reading-scroll'})});
  const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  const mount=async()=>{surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});return surface.mount({binding},adapter.inspect());};
  viewport.scrollTop=600;let handle=await mount();
  const shown=surface.showWorkspace(handle)&&viewport.scrollTop===0;
  surface.showWorkspace(handle);surface.showReading(handle);
  const apiRestored=viewport.scrollTop===600;
  viewport.scrollTop=150;await tick();const laterNativeScrollKept=viewport.scrollTop===150;
  surface.showWorkspace(handle);document.getElementById(handle.id+'_workspace_exit').hidePopover();await tick();
  const declarativeRestored=viewport.scrollTop===150;
  surface.showWorkspace(handle);surface.dispose(handle);const disposeRestored=viewport.scrollTop===150;
  viewport.scrollTop=600;handle=await mount();surface.showWorkspace(handle);
  document.getElementById(handle.id+'_workspace').style.setProperty('min-height','1500px','important');viewport.scrollTop=100;
  surface.showReading(handle);const changedScrollKept=viewport.scrollTop===100;surface.dispose(handle);
  viewport.scrollTop=600;handle=await mount();surface.showWorkspace(handle);
  document.getElementById(handle.id+'_workspace').style.setProperty('min-height','1500px','important');viewport.scrollTop=100;
  // Replay delivery before another native update returns to the clamp value.
  // Comparing only the final coordinate would incorrectly restore old 600.
  viewport.dispatchEvent(new Event('scroll'));viewport.scrollTop=0;surface.showReading(handle);
  const returnedScrollKept=viewport.scrollTop===0;surface.dispose(handle);
  viewport.scrollTop=600;handle=await mount();surface.showWorkspace(handle);
  history.pushState({},'','/c/55555555-5555-4555-8555-555555555555');surface.showReading(handle);
  const changedRouteNotRestored=viewport.scrollTop===0;surface.dispose(handle);history.replaceState({},'',url);
  viewport.scrollTop=600;handle=await mount();surface.showWorkspace(handle);
  document.head.querySelector('style[data-va-owned]').remove();await tick();
  const removedStyleRestored=viewport.scrollTop===600&&!surface.visibility(handle);surface.dispose(handle);adapter.stop();
  return {shown,apiRestored,laterNativeScrollKept,declarativeRestored,disposeRestored,changedScrollKept,returnedScrollKept,changedRouteNotRestored,removedStyleRestored,nativeIntact:viewport.outerHTML===original&&viewport.parentElement===parent&&viewport.querySelector('textarea')===editor&&editor.value==='fixture draft'};
 });
 assert.deepEqual(readingScroll,{shown:true,apiRestored:true,laterNativeScrollKept:true,declarativeRestored:true,disposeRestored:true,changedScrollKept:true,returnedScrollKept:true,changedRouteNotRestored:true,removedStyleRestored:true,nativeIntact:true});
 console.log(JSON.stringify({readingScroll}));await region.close();
 // Lifecycle counterexample on the existing host, not a newly collected real
 // topology: native layout can retain a temporary branch after adapter readiness.
 // Reject it intact, then recover only after the original page removes it.
 const preflight=await browser.newPage({viewport:{width:1440,height:1000}});
 await preflight.route('**/*',r=>r.request().url()==='https://chatgpt.com/c/'+C?r.fulfill({contentType:'text/html',body:legacy}):r.abort());
 await preflight.goto('https://chatgpt.com/c/'+C);await preflight.addScriptTag({content:outputFiles[0].text});
 const refused=await preflight.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,createFlowMountSurface,createSurfaceController}=flowModule;let surface,registrations=0,attempts=0;
  const adapter=createChatGPTAdapter({document,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'preflight',producerToken:'preflight',browserDocumentId:'preflight',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  const context=await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'preflight'})});
  const original=document.querySelector('#prompt-textarea');original.value='existing draft';
  const branch=document.createElement('div');branch.hidden=true;document.querySelector('main').append(branch);
  const extensionOrigin='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const implementation=createFlowMountSurface({document,createFrameURL:({role})=>extensionOrigin+'/'+role+'.html'});
  surface={...implementation,mount:async(...args)=>{attempts++;return implementation.mount(...args);}};
  const bridge={registerMount:async()=>{registrations++;return {ok:true};},confirmParent:async({mountId,role})=>({ok:true,grant:{id:'grant_'+role,mountId,role,parentDocumentId:'preflight',uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:binding.expiresAt}})};
  const controller=createSurfaceController({document,adapter,surface,bridge,extensionOrigin}),adapterReady=adapter.inspect().ok;
  const handle=await controller.start({context});
  globalThis.preflightProbe={controller,surface,adapter,branch,original,extensionOrigin,registrations:()=>registrations,attempts:()=>attempts};
  return {adapterReady,handle:!!handle,status:controller.localStatus(),mode:controller.presentationSnapshot()?.mode,attempts,registrations,owned:document.querySelectorAll('[data-va-owned],[data-va-flow-root]').length,draft:original.value};
 });
 assert.deepEqual(refused,{adapterReady:true,handle:false,status:'surface-native-flow-uncovered-branch',mode:'waiting',attempts:1,registrations:0,owned:0,draft:'existing draft'});
 await preflight.evaluate(()=>preflightProbe.branch.remove());
 await preflight.waitForFunction(()=>preflightProbe.controller.presentationSnapshot()?.registered===true);
 await preflight.evaluate(()=>{const p=preflightProbe;for(const frame of document.querySelectorAll('iframe')){const role=frame.title==='工作空间'?'workspace':'sidebar';window.dispatchEvent(new MessageEvent('message',{origin:p.extensionOrigin,source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'nonce_'+role}}));}});
 await preflight.waitForFunction(()=>preflightProbe.controller.localStatus()==='ready');
 const recovered=await preflight.evaluate(()=>{const p=preflightProbe,result={status:p.controller.localStatus(),visible:p.controller.isWorkspacePresented(),attempts:p.attempts(),registrations:p.registrations(),sameEditor:document.querySelector('#prompt-textarea')===p.original,draft:p.original.value};p.controller.revoke();p.adapter.stop();return {...result,restored:!document.querySelector('[data-va-owned],[data-va-flow-root]')&&document.querySelector('#prompt-textarea')===p.original};});
 assert.deepEqual(recovered,{status:'ready',visible:true,attempts:2,registrations:1,sameEditor:true,draft:'existing draft',restored:true});
 console.log(JSON.stringify({nativeFlowPreflight:{refused,recovered}}));await preflight.close();
 // Reuse the observed viewport's existing empty-div-v1 contract. This is a
 // compatibility counterexample, not evidence of the user's home topology.
 const markers=await browser.newPage({viewport:{width:1400,height:900}});
 await markers.route('**/*',r=>r.request().url()==='https://chatgpt.com/c/'+C?r.fulfill({contentType:'text/html',body:longDesktopHTML(C)}):r.abort());
 await markers.goto('https://chatgpt.com/c/'+C);await markers.addScriptTag({content:outputFiles[0].text});
 const markerProof=await markers.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface,captureNativeBaseline}=flowModule;let surface;
  const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'markers',producerToken:'markers',browserDocumentId:'markers',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'markers'})});
  const viewport=document.querySelector('[data-app-action-timeline-scroll]'),marker=document.createElement('div');marker.id='fixture-native-marker';
  const css=document.createElement('style');css.textContent='#fixture-native-marker{display:none}';document.head.append(css);viewport.append(marker);
  const inspection=adapter.inspect(),before=marker.outerHTML,nativeChildren=[...viewport.children];
  const unselectedRejected=captureNativeBaseline({document,inspection:{...inspection,viewportMarkers:null}})===null;
  surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
  const handle=await surface.mount({binding},inspection),shown=surface.showWorkspace(handle),active=surface.validateActiveLayout(handle);
  const untouched=marker.outerHTML===before&&marker.parentElement===viewport&&nativeChildren.every((n,i)=>[...viewport.children].filter(n=>!surface.isOwnedSurface(n))[i]===n);
  const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,0))));
  // Flush mount mutations first: they must not accidentally trigger the check
  // for a later HEAD-only change. Read visibility without invoking any proof.
  await settle();const stableBeforeChange=surface.visibility(handle).workspace;
  // A media-rule change need not mutate the node. A formerly absent marker
  // must never silently become an implicit grid track, even at zero height.
  css.textContent='#fixture-native-marker{display:block;height:0}';
  await settle();const automaticallyHidden=!surface.visibility(handle).workspace;
  const cssChangeRejected=!surface.isSameNativeRegions(handle)&&!surface.validateActiveLayout(handle);
  surface.showReading(handle);
  const visibleZeroRejected=captureNativeBaseline({document,inspection:adapter.inspect(),isOwnedSurface:n=>surface.isOwnedSurface(n)})===null;
  css.textContent='#fixture-native-marker{display:none}';marker.append(document.createElement('button'));
  const childRejected=!surface.isSameNativeRegions(handle);marker.replaceChildren();marker.setAttribute('tabindex','0');
  const focusRejected=!surface.isSameNativeRegions(handle);marker.removeAttribute('tabindex');
  const recovered=surface.isSameNativeRegions(handle)&&surface.showWorkspace(handle)&&surface.validateActiveLayout(handle);
  await settle();
  css.sheet.insertRule('#fixture-native-marker{display:block;height:0}',css.sheet.cssRules.length);
  await settle();const cssomAutomaticallyHidden=!surface.visibility(handle).workspace;
  const nativeHead=document.head;nativeHead.remove();let cleanupComplete=true;
  try{surface.dispose(handle);}catch{cleanupComplete=false;}finally{document.documentElement.prepend(nativeHead);adapter.stop();}
  cleanupComplete=cleanupComplete&&!document.querySelector('[data-va-owned],[data-va-flow-root]');
  return {adapterReady:inspection.ok,policy:inspection.viewportMarkers,unselectedRejected,shown,active,untouched,stableBeforeChange,automaticallyHidden,cssChangeRejected,visibleZeroRejected,childRejected,focusRejected,recovered,cssomAutomaticallyHidden,cleanupComplete,restored:marker.outerHTML===before&&nativeChildren.every((n,i)=>viewport.children[i]===n)};
 });
 assert.deepEqual(markerProof,{adapterReady:true,policy:'empty-div-v1',unselectedRejected:true,shown:true,active:true,untouched:true,stableBeforeChange:true,automaticallyHidden:true,cssChangeRejected:true,visibleZeroRejected:true,childRejected:true,focusRejected:true,recovered:true,cssomAutomaticallyHidden:true,cleanupComplete:true,restored:true});
 console.log(JSON.stringify({inactiveViewportMarker:markerProof}));await markers.close();
 // Native popovers have no required aria-modal attribute. The real adapter,
 // controller and flow backend must agree while one is open and after close.
 // Grants below are offline mechanism doubles, never account evidence.
 const layers=await browser.newPage({viewport:{width:1400,height:900}});
 await layers.route('**/*',r=>r.request().url()==='https://chatgpt.com/'?r.fulfill({contentType:'text/html',body:observedHomeHTML(C)}):r.abort());
 await layers.goto('https://chatgpt.com/');await layers.evaluate(materializePartitionedSidebar,partitionDetails.sidebarStructure.rows);await layers.addScriptTag({content:outputFiles[0].text});
 const layerRecovery=await layers.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface,createSurfaceController}=flowModule;
  let surface,registrations=0,confirmations=0;
  const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'layers',producerToken:'layers',browserDocumentId:'layers',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  const context=await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'layers'})});
  const extensionOrigin='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  surface=createFlowMountSurface({document,hasNativeLayer:()=>adapter.hasNativeLayer(),createFrameURL:({role})=>extensionOrigin+'/'+role+'.html'});
  const bridge={registerMount:async()=>{registrations++;return {ok:true};},confirmParent:async({mountId,role})=>{confirmations++;return {ok:true,grant:{id:'grant_'+role,mountId,role,parentDocumentId:'layers',uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:binding.expiresAt}};}};
  const controller=createSurfaceController({document,adapter,surface,bridge,extensionOrigin}),handle=await controller.start({context});
  if(!handle)throw Error('layer-fixture-mount');
  const frames=surface.frames(handle).map(x=>x.frame),settle=async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);};
  for(const {role,frame}of surface.frames(handle))window.dispatchEvent(new MessageEvent('message',{origin:extensionOrigin,source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'nonce_'+role}}));
  await settle();const initial=surface.visibility(handle),ownedExcluded=!adapter.hasNativeLayer();
  const popover=document.createElement('div');popover.setAttribute('popover','manual');document.body.append(popover);await settle();
  popover.showPopover();await settle();
  const during={detected:adapter.hasNativeLayer(),visible:surface.visibility(handle),mode:controller.localStatus(),intent:controller.presentationIntent(),returnCount:document.querySelectorAll('[aria-label="返回工作空间"]').length};
  popover.hidePopover();await settle();
  const after={visible:surface.visibility(handle),intent:controller.presentationIntent(),sameFrames:frames.every((frame,i)=>surface.frames(handle)[i].frame===frame),registrations,confirmations};
  popover.showPopover();await settle();controller.revoke();popover.hidePopover();await settle();
  const revoked=frames.every(frame=>!frame.isConnected)&&!document.querySelector('[data-va-flow-root]')&&document.querySelectorAll('[aria-label="返回工作空间"]').length===0;
  controller.stop();adapter.stop();popover.remove();return {initial,ownedExcluded,during,after,revoked};
 });
 assert.deepEqual(layerRecovery,{initial:{workspace:true,sidebar:true},ownedExcluded:true,during:{detected:true,visible:{workspace:false,sidebar:false},mode:'suspended',intent:'workspace',returnCount:0},after:{visible:{workspace:true,sidebar:true},intent:'workspace',sameFrames:true,registrations:1,confirmations:2},revoked:true});
 console.log(JSON.stringify({nativeLayerRecovery:layerRecovery}));
 await layers.close();
 // Existing J3 native editor switch: both original nodes and drafts survive.
 // Returning must re-prove visible controls in the restored native layout,
 // and must not retain our temporary return button as a native identity.
 const editor=await browser.newPage({viewport:{width:1440,height:1000}});
 await editor.route('**/*',r=>r.request().url()==='https://chatgpt.com/c/'+C?r.fulfill({contentType:'text/html',body:j3ModernPage(legacy)}):r.abort());
 await editor.goto('https://chatgpt.com/c/'+C);await editor.addScriptTag({content:outputFiles[0].text});
 await editor.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,createFlowMountSurface,createSurfaceController}=flowModule;let surface;
  const adapter=createChatGPTAdapter({document,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'editors',producerToken:'editors',browserDocumentId:'editors',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()},context=await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'editors'})});
  const extensionOrigin='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';surface=createFlowMountSurface({document,createFrameURL:({role})=>extensionOrigin+'/'+role+'.html'});
  const bridge={registerMount:async()=>({ok:true}),confirmParent:async({mountId,role})=>({ok:true,grant:{id:'grant_'+role,mountId,role,parentDocumentId:'editors',uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:binding.expiresAt}})};
  const controller=createSurfaceController({document,adapter,surface,bridge,extensionOrigin}),handle=await controller.start({context});
  if(!handle)throw Error('editor-fixture-mount');
  const frames=surface.frames(handle).map(x=>x.frame),plain=document.querySelector('[data-j3-editor=plain]'),rich=document.querySelector('[data-j3-editor=rich]');plain.value='plain draft';rich.textContent='rich draft';
  globalThis.editorProbe={controller,adapter,surface,handle,frames,plain,rich};
  for(const {role,frame}of surface.frames(handle))window.dispatchEvent(new MessageEvent('message',{origin:extensionOrigin,source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'nonce_'+role}}));
 });
 await editor.waitForFunction(()=>editorProbe.surface.visibility(editorProbe.handle).workspace);
 await editor.evaluate(()=>{editorProbe.frames=editorProbe.surface.frames(editorProbe.handle).map(x=>x.frame);});
 for(const toRich of [true,false]){
  await editor.evaluate(toRich=>{const {controller,plain,rich}=editorProbe;controller.showReading();plain.hidden=toRich;rich.hidden=!toRich;plain.id=toRich?'j3-textarea':'prompt-textarea';rich.id=toRich?'prompt-textarea':'j3-contenteditable';},toRich);
  await editor.getByRole('button',{name:'返回工作空间',exact:true}).click();
  await editor.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await editor.evaluate(()=>{const p=editorProbe;return {shown:p.surface.visibility(p.handle).workspace,mode:p.controller.localStatus(),sameFrames:p.frames.every((f,i)=>p.surface.frames(p.handle)[i]?.frame===f),drafts:p.plain.value==='plain draft'&&p.rich.textContent==='rich draft',nodes:p.plain.isConnected&&p.rich.isConnected,returnRemoved:!document.querySelector('[aria-label="返回工作空间"]')};});
  assert.deepEqual(state,{shown:true,mode:'ready',sameFrames:true,drafts:true,nodes:true,returnRemoved:true});
 }
 const inactiveIdentity=await editor.evaluate(()=>{const {controller,surface,handle,adapter,rich}=editorProbe;controller.showReading();rich.remove();return {same:surface.isSameNativeRegions(handle),refreshed:!!surface.refreshNativeBaseline(handle,()=>adapter.inspect())};});assert.deepEqual(inactiveIdentity,{same:false,refreshed:true});
 await editor.evaluate(()=>{editorProbe.controller.stop();editorProbe.adapter.stop();});await editor.close();
 // CSS-only breakpoint counterexample, not a newly observed ChatGPT topology.
 // The native fixture is explicitly responsive and all its controls fit.
 const responsive=await browser.newPage({viewport:{width:1440,height:1000}});
 await responsive.route('**/*',r=>r.request().url()==='https://chatgpt.com/c/'+C?r.fulfill({contentType:'text/html',body:legacy.replace('</head>','<style>#composer input[type=file]{max-width:100%}@media(max-width:760px){aside{display:none}header{height:110px;flex-wrap:wrap;gap:4px}header h1{font-size:14px}}</style></head>')}):r.abort());
 await responsive.goto('https://chatgpt.com/c/'+C);await responsive.addScriptTag({content:outputFiles[0].text});
 const initial=await responsive.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,createFlowMountSurface}=flowModule;let surface;
  const adapter=createChatGPTAdapter({document,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'local-probe',producerToken:'local-probe',browserDocumentId:'local-probe',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'local-probe'})});const inspection=adapter.inspect();if(!inspection.ok)return {inspection};
  surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});const handle=await surface.mount({binding},inspection);globalThis.probe={surface,handle,adapter,inspection};return {shown:surface.showWorkspace(handle),active:surface.validateActiveLayout(handle)};
 });
 const activeSidebarToggle=await responsive.evaluate(()=>{
  const {surface,handle}=probe,workspace=surface.frames(handle)[0].frame.parentElement,aside=document.querySelector('aside'),frame=workspace.querySelector('iframe'),out=[];
  for(const display of ['none','flex']){
   aside.style.display=display;
   const box=workspace.getBoundingClientRect();
   out.push({x:box.x,width:box.width,active:surface.validateActiveLayout(handle),sameFrame:surface.frames(handle)[0].frame===frame,refreshRequested:surface.needsNativeBaselineRefresh(handle)});
  }
  aside.style.removeProperty('display');return out;
 });
 assert.deepEqual(activeSidebarToggle,[
  {x:0,width:1440,active:true,sameFrame:true,refreshRequested:false},
  {x:260,width:1180,active:true,sameFrame:true,refreshRequested:false}
 ]);
 await responsive.evaluate(()=>probe.surface.showReading(probe.handle));
 await responsive.setViewportSize({width:420,height:1000});
 const narrow=await responsive.evaluate(()=>{
  const {surface,handle,adapter,inspection}=probe;const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const same=surface.isSameNativeRegions(handle),needsRefresh=surface.needsNativeBaselineRefresh(handle),frames=surface.frames(handle).map(x=>x.frame);const refreshed=surface.refreshNativeBaseline(handle,()=>adapter.inspect());const shown=surface.showWorkspace(handle);const result={same,needsRefresh,framesKept:frames.every((frame,i)=>frame===surface.frames(handle)[i].frame),fresh:!surface.needsNativeBaselineRefresh(handle),refreshed:!!refreshed,shown,workspace:rect(surface.frames(handle)[0].frame.parentElement),active:surface.validateActiveLayout(handle)};surface.showReading(handle);return result;
 });
 assert.deepEqual(initial,{shown:true,active:true});
 assert.equal(narrow.same,true);assert.equal(narrow.needsRefresh,true);assert.equal(narrow.refreshed,true);
 assert.equal(narrow.shown,true);assert.equal(narrow.active,true);assert.equal(narrow.framesKept,true);assert.equal(narrow.fresh,true);
 assert.equal(narrow.workspace.x,0);assert.equal(narrow.workspace.width,420);
 await responsive.setViewportSize({width:1440,height:1000});
 const wideAgain=await responsive.evaluate(()=>{const {surface,handle,adapter}=probe;const stale=surface.needsNativeBaselineRefresh(handle);const refreshed=!!surface.refreshNativeBaseline(handle,()=>adapter.inspect());const shown=surface.showWorkspace(handle),active=surface.validateActiveLayout(handle);surface.showReading(handle);return {stale,refreshed,shown,active};});
 assert.deepEqual(wideAgain,{stale:true,refreshed:true,shown:true,active:true});
 // The native sidebar can collapse without changing the viewport or any
 // recorded main-region attribute. Reusing its old left offset clips the
 // available workspace width even though the old active proof still passes.
 const sidebarToggle=await responsive.evaluate(()=>{
  const {surface,handle,adapter}=probe,frames=surface.frames(handle).map(x=>x.frame),aside=document.querySelector('aside');
  const results=[];
  for(const display of ['none','flex']){
   aside.style.display=display;
   const same=surface.isSameNativeRegions(handle),stale=surface.needsNativeBaselineRefresh(handle);
   const refreshed=stale&&!!surface.refreshNativeBaseline(handle,()=>adapter.inspect());
   const shown=surface.showWorkspace(handle),active=surface.validateActiveLayout(handle),box=frames[0].parentElement.getBoundingClientRect();
   results.push({same,stale,refreshed,shown,active,x:box.x,width:box.width,framesKept:frames.every((frame,i)=>frame===surface.frames(handle)[i].frame)});
   surface.showReading(handle);
  }
  surface.dispose(handle);adapter.stop();return results;
 });
 assert.deepEqual(sidebarToggle,[
  {same:true,stale:true,refreshed:true,shown:true,active:true,x:0,width:1440,framesKept:true},
  {same:true,stale:true,refreshed:true,shown:true,active:true,x:260,width:1180,framesKept:true}
 ]);await responsive.close();

 // Reuse the actual anonymous partition shape; replacement is a lifecycle
 // counterexample, not a claim that a new native selector has been observed.
 const replacement=await browser.newPage({viewport:{width:1400,height:900}});
 await replacement.route('**/*',r=>r.request().url()==='https://chatgpt.com/'?r.fulfill({contentType:'text/html',body:observedHomeHTML(C)}):r.abort());
 await replacement.goto('https://chatgpt.com/');await replacement.evaluate(materializePartitionedSidebar,partitionDetails.sidebarStructure.rows);await replacement.addScriptTag({content:outputFiles[0].text});
 const recovery=await replacement.evaluate(async()=>{
  const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;
  let surface;const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy(),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
  const binding={documentToken:'replacement',producerToken:'replacement',browserDocumentId:'replacement',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'replacement'})});
  let inspection=adapter.inspect();surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
  // Start with an unsupported partition, then let the real adapter prove the
  // original native topology. An absent sidebar must not load in the body.
  const extra=document.createElement('button');inspection.sidebarPlacement.parent.append(extra);inspection=adapter.inspectStructure(inspection);
  const scrolls=[],handle=await surface.mount({binding},inspection,{onSidebarScroll:n=>scrolls.push(n)}),workspace=surface.frames(handle)[0].frame;
  surface.showWorkspace(handle);
  const initiallyAbsent=!inspection.sidebarPlacement&&surface.frames(handle).length===1&&document.querySelectorAll('iframe').length===1&&surface.restoreRole(handle,'sidebar')===null&&surface.visibility(handle).workspace;
  extra.remove();inspection=adapter.inspectStructure(inspection);surface.refreshGeometry(handle,inspection);
  const late=surface.restoreRole(handle,'sidebar'),sidebar=late?.frame;
  const lateHidden=!!sidebar&&sidebar.isConnected&&!surface.visibility(handle).sidebar;
  surface.showWorkspace(handle,{roles:['sidebar']});const lateRecovered=surface.visibility(handle).sidebar&&surface.frames(handle)[0].frame===workspace&&surface.visibility(handle).workspace;
  // A restored member window can grow after the first VIEW. Browser clamping
  // while those rows are absent is not a new saved scroll choice.
  const port=inspection.sidebarPlacement.scrollPort;
  surface.resizeSidebar(handle,128);const target=port.scrollHeight-port.clientHeight+700;
  scrolls.length=0;surface.restoreSidebar(handle,target);
  port.dispatchEvent(new Event('scroll'));
  const pendingDidNotOverwrite=scrolls.length===0;
  surface.resizeSidebar(handle,1600);
  const restoredAfterGrowth=port.scrollTop===target&&scrolls.at(-1)===target;
  // A distinct actual scroll takes precedence over a still-clamped restore.
  if(port.scrollHeight-port.clientHeight<=0)throw Error('scroll-counterexample-needs-scrollable-content');
  surface.restoreSidebar(handle,port.scrollHeight-port.clientHeight+700);
  port.scrollTop=0;port.dispatchEvent(new Event('scroll'));surface.resizeSidebar(handle,2400);
  const manualScrollPreserved=port.scrollTop===0&&scrolls.at(-1)===0;
  const recent=inspection.sidebarPlacement.recent,nextRecent=recent.cloneNode(true);recent.replaceWith(nextRecent);
  const fresh=adapter.inspectStructure(inspection),recentProof=fresh.history?.isConnected===true&&fresh.sidebarPlacement?.recent===nextRecent;
  surface.refreshGeometry(handle,fresh);surface.showWorkspace(handle,{roles:['sidebar']});
  const recentRecovered=surface.visibility(handle).sidebar&&surface.frames(handle)[1].frame===sidebar;
  const parent=fresh.sidebarPlacement?.parent,copy=parent.cloneNode(true);copy.querySelector('[data-va-sidebar-slot]')?.remove();parent.replaceWith(copy);
  inspection=adapter.inspectStructure(fresh);surface.retireRole(handle,'sidebar');surface.refreshGeometry(handle,inspection);
  const restored=surface.restoreRole(handle,'sidebar');surface.showWorkspace(handle,{roles:['sidebar']});
  const parentRecovered=!!restored&&restored.frame!==sidebar&&restored.frame.parentElement.parentElement===copy&&surface.visibility(handle).sidebar;
  const workspacePreserved=surface.frames(handle)[0].frame===workspace&&surface.visibility(handle).workspace;
  const oldPort=inspection.sidebarPlacement.scrollPort,newPort=oldPort.cloneNode(true);newPort.querySelector('[data-va-sidebar-slot]')?.remove();oldPort.replaceWith(newPort);
  inspection=adapter.inspectStructure(inspection);surface.retireRole(handle,'sidebar');surface.refreshGeometry(handle,inspection);surface.restoreRole(handle,'sidebar');surface.showWorkspace(handle,{roles:['sidebar']});
  scrolls.length=0;oldPort.dispatchEvent(new Event('scroll'));const oldScrollDetached=scrolls.length===0;
  newPort.dispatchEvent(new Event('scroll'));const newScrollBound=scrolls.length===1;
  // Unknown topology clears the old proof and cannot receive a moved frame.
  inspection.sidebarPlacement.parent.append(document.createElement('button'));const unknown=adapter.inspectStructure(inspection);
  surface.retireRole(handle,'sidebar');surface.refreshGeometry(handle,unknown);
  const unknownRejected=!unknown.sidebarPlacement&&unknown.preserveNativeSidebar&&surface.restoreRole(handle,'sidebar')===null&&surface.visibility(handle).workspace;
  surface.dispose(handle);adapter.stop();return {initiallyAbsent,lateHidden,lateRecovered,pendingDidNotOverwrite,restoredAfterGrowth,manualScrollPreserved,recentProof,recentRecovered,parentRecovered,workspacePreserved,oldScrollDetached,newScrollBound,unknownRejected};
 });
 assert.deepEqual(recovery,{initiallyAbsent:true,lateHidden:true,lateRecovered:true,pendingDidNotOverwrite:true,restoredAfterGrowth:true,manualScrollPreserved:true,recentProof:true,recentRecovered:true,parentRecovered:true,workspacePreserved:true,oldScrollDetached:true,newScrollBound:true,unknownRejected:true});await replacement.close();
 for(const [kind,path,html]of [['home','/',observedHomeHTML(C)],['project','/g/'+P+'/project',observedProjectHTML(P,C)],['conversation','/c/'+C,longDesktopHTML(C)],['header-inside','/c/'+C,legacy]]){
  const page=await browser.newPage({viewport:{width:1400,height:900}}),url='https://chatgpt.com'+path;
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(async kind=>{
   const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;
   let surface;const adapter=createChatGPTAdapter({document,profile:kind==='header-inside'?undefined:profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>container}}),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});
   const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'})});
   const before=adapter.inspect();if(!before.ok){adapter.stop();return {error:before};}
   const draft=document.querySelector('textarea');if(!draft.value)draft.value='fixture draft';const parent=draft.parentElement,value=draft.value,original=before.composer.getBoundingClientRect().toJSON();
   surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
   let handle;try{handle=await surface.mount({binding},before);}catch(e){adapter.stop();return {error:e.message};}
   const shown=surface.showWorkspace(handle),workspace=surface.frames(handle)[0].frame.parentElement;
   const boxes={workspace:workspace.getBoundingClientRect().toJSON(),composer:before.composer.getBoundingClientRect().toJSON()};
   const structural=adapter.inspectStructure(before).ok,active=surface.validateActiveLayout(handle),privatePopover=workspace.hasAttribute('popover');
   // CSS-only positioning changes must not retain a baseline for a different
   // containing-block model, even when attributes and node identities match.
   const changedPosition=document.createElement('style');
   changedPosition.textContent=`[data-va-flow-root="${handle.id}"]{position:${getComputedStyle(workspace.parentElement).position==='relative'?'static':'relative'}!important}`;
   document.head.append(changedPosition);
   const positionChangeRejected=surface.isSameNativeRegions(handle)&&!surface.validateActiveLayout(handle);
   surface.surrenderChanged();const positionNeedsReproof=surface.needsNativeBaselineRefresh(handle);
   changedPosition.remove();surface.showWorkspace(handle);
   if(!positionChangeRejected||!positionNeedsReproof)throw Error('positioning-change-must-reprove');
   const nextHeader=before.header.cloneNode(true);before.header.replaceWith(nextHeader);await new Promise(resolve=>setTimeout(resolve,0));
   const replacedHeaderRejected=surface.isSameNativeRegions(handle)===false&&surface.visibility(handle).workspace===false;
   nextHeader.replaceWith(before.header);surface.showWorkspace(handle);
   // A newly inserted native accessible control may overflow a transparent
   // titlebar shell. It must participate in the active occlusion proof.
   const extra=document.createElement('div');extra.setAttribute('role','menuitem');extra.tabIndex=0;
   extra.style.cssText=`position:fixed;pointer-events:auto;left:${boxes.workspace.x+10}px;top:${boxes.workspace.y+10}px;width:80px;height:30px`;
   extra.dataset.vaOwned=handle.id; // A page-written marker is not an owned identity.
   before.header.append(extra);await new Promise(resolve=>setTimeout(resolve,0));
   const lateHeaderControlRejected=surface.visibility(handle).workspace===false;extra.remove();surface.showWorkspace(handle);
   const interactiveShellChecks=[];for(const [attribute,value] of [['tabindex','0'],['contenteditable','true'],['inert',''],['role','button']]){const root=workspace.parentElement;root.setAttribute(attribute,value);await new Promise(resolve=>setTimeout(resolve,0));interactiveShellChecks.push(surface.isSameNativeRegions(handle)===false&&surface.visibility(handle).workspace===false);root.removeAttribute(attribute);surface.showWorkspace(handle);}
   const interactiveShellRejected=interactiveShellChecks.every(Boolean);surface.showReading(handle);const root=workspace.parentElement,priorRole=root.getAttribute('role');root.setAttribute('role','button');const interactiveBaselineRejected=flowModule.captureNativeBaseline({document,inspection:before,isOwnedSurface:n=>surface.isOwnedSurface(n)})===null;if(priorRole===null)root.removeAttribute('role');else root.setAttribute('role',priorRole);surface.showWorkspace(handle);
   draft.focus();draft.setSelectionRange(2,4);draft.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:null}));
   const input=surface.visibility(handle).workspace&&document.activeElement===draft&&draft.parentElement===parent&&draft.value===value&&draft.selectionStart===2;
   surface.showReading(handle);const restored=JSON.stringify(before.composer.getBoundingClientRect().toJSON())===JSON.stringify(original);
   surface.showWorkspace(handle);workspace.querySelector('button').click();const declarative=surface.visibility(handle).workspace===false;
   surface.showWorkspace(handle);const dialog=document.createElement('dialog');dialog.setAttribute('aria-modal','true');document.body.append(dialog);dialog.showModal();
   await Promise.resolve();const nativeWins=getComputedStyle(workspace).display==='none';dialog.remove();surface.dispose(handle);adapter.stop();
   return {shown,structural,active,privatePopover,replacedHeaderRejected,lateHeaderControlRejected,interactiveShellRejected,interactiveBaselineRejected,input,restored,declarative,nativeWins,clean:!document.querySelector('[data-va-flow-root]')&&draft.parentElement===parent,boxes};
  },kind);results.push({kind,...result});
  if(kind==='home'){
   // A stale pointer token after a declarative close must never reactivate
   // layout on a later native press, even if script cleanup never ran.
   await page.evaluate(async()=>{const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface}=flowModule;let surface;const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>container}}),isOwnedMask:n=>surface?.isMasked(n),isOwnedSurface:n=>surface?.isOwnedSurface(n)});const binding={documentToken:'probe',producerToken:'probe',browserDocumentId:'probe',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'probe'})});const inspection=adapter.inspect();surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});const handle=await surface.mount({binding},inspection);surface.showWorkspace(handle);const exit=document.getElementById(handle.id+'_workspace_exit');exit.setAttribute('data-va-gesture',handle.id);exit.hidePopover();window.gestureProbe={surface,handle,adapter};});
   const before=await page.locator('form').evaluate(n=>n.getBoundingClientRect().toJSON()),box=await page.locator('textarea').boundingBox();
   await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();
   assert.deepEqual(await page.locator('form').evaluate(n=>n.getBoundingClientRect().toJSON()),before,'closed exit cannot revive geometry from a stale gesture');await page.mouse.up();
   // Native focus styling changes between pointerdown and pointerup must
   // conceal private content without moving the original click target.
   await page.evaluate(()=>{const {surface,handle}=gestureProbe;surface.showWorkspace(handle);const form=document.querySelector('form'),button=form.querySelector('button');window.handoffButton=button;window.handoffClicks=0;button.addEventListener('pointerdown',()=>form.classList.add('native-focus-ring'),{once:true});button.addEventListener('click',()=>window.handoffClicks++);});
   const handoffBox=await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON());
   await page.mouse.move(handoffBox.x+handoffBox.width/2,handoffBox.y+handoffBox.height/2);await page.mouse.down();
   assert.deepEqual(await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON()),handoffBox,'native focus styling cannot shift first click');
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-va-input-handoff]')).visibility),'hidden');
   await page.mouse.up();await page.waitForFunction(()=>handoffClicks===1);
   assert.equal(await page.evaluate(()=>gestureProbe.surface.visibility(gestureProbe.handle).workspace),false);
   // Native focus state may keep its class after the first input gesture.
   // Re-prove the closed native layout without recreating either private frame.
   await page.waitForFunction(()=>!document.getElementById(gestureProbe.handle.id+'_workspace_exit').matches(':popover-open'));
   const reproof=await page.evaluate(()=>{
    const {surface,handle,adapter}=gestureProbe,frames=surface.frames(handle).map(x=>x.frame),form=document.querySelector('form');
    const oldProofRejected=!surface.isSameNativeRegions(handle);
    const refreshed=surface.refreshNativeBaseline?.(handle,()=>adapter.inspect());
    const reopened=!!refreshed&&surface.showWorkspace(handle)&&surface.validateActiveLayout(handle);
    let reads=0;const activeRejected=surface.refreshNativeBaseline?.(handle,()=>{reads++;return adapter.inspect();})===null&&reads===0;
    surface.showReading(handle);form.setAttribute('tabindex','0');
    const semanticRejected=surface.refreshNativeBaseline?.(handle,()=>adapter.inspect())===null;
    form.removeAttribute('tabindex');
    surface.showWorkspace(handle);const tool=form.querySelector('button'),oldStyle=tool.getAttribute('style');tool.style.display='none';
    const hiddenActiveRejected=!surface.validateActiveLayout(handle);surface.surrenderChanged();
    const nativeHiddenReproved=!!surface.refreshNativeBaseline(handle,()=>adapter.inspect())&&surface.showWorkspace(handle)&&surface.validateActiveLayout(handle);
    surface.showReading(handle);if(oldStyle===null)tool.removeAttribute('style');else tool.setAttribute('style',oldStyle);surface.refreshNativeBaseline(handle,()=>adapter.inspect());surface.showWorkspace(handle);
    return {oldProofRejected,reopened,framesPreserved:surface.frames(handle).every((x,i)=>x.frame===frames[i]),activeRejected,semanticRejected,hiddenActiveRejected,nativeHiddenReproved};
   });
   assert.deepEqual(reproof,{oldProofRejected:true,reopened:true,framesPreserved:true,activeRejected:true,semanticRejected:true,hiddenActiveRejected:true,nativeHiddenReproved:true});
   // Native tools may open their layer on pointerdown. The original target
   // must still receive the first pointerup/click at its enhanced position.
   await page.evaluate(()=>{
    window.toolGesture=[];const popup=document.createElement('div');popup.id='native-tool-popover';popup.setAttribute('popover','manual');popup.style.cssText='position:fixed;inset:60px 20px auto auto;margin:0;width:120px;height:60px';popup.textContent='Native tool';document.body.append(popup);
    const record=e=>toolGesture.push({type:e.type,target:e.target===handoffButton,top:handoffButton.getBoundingClientRect().top});
    handoffButton.addEventListener('pointerdown',()=>popup.showPopover(),{once:true});for(const type of ['pointerup','click'])document.addEventListener(type,record,{capture:true,once:true});
   });
   const popupBox=await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON());
   await page.mouse.move(popupBox.x+popupBox.width/2,popupBox.y+popupBox.height/2);await page.mouse.down();
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-va-flow-root] > [data-va-owned]')).display),'none','native tool layer conceals private workspace');
   assert.equal(await page.evaluate(()=>handoffButton.getBoundingClientRect().top),popupBox.top,'pointerdown layer keeps original native target');
   await page.mouse.up();
   assert.deepEqual(await page.evaluate(()=>toolGesture),[{type:'pointerup',target:true,top:popupBox.top},{type:'click',target:true,top:popupBox.top}],'native first tool gesture completes before layout release');
   assert.equal(await page.evaluate(()=>handoffClicks),2);
   await page.waitForFunction(()=>!document.getElementById(gestureProbe.handle.id+'_workspace_exit').matches(':popover-open'));
   await page.evaluate(()=>document.querySelector('#native-tool-popover').remove());
   await page.clock.install();
   // Closing is synchronous. A tail task queued by the old gesture cannot
   // later override a new workspace choice, even when close/reopen share a task.
   await page.evaluate(()=>{
    const {surface,handle,adapter}=gestureProbe;document.querySelector('form').classList.remove('native-focus-ring');surface.refreshNativeBaseline(handle,()=>adapter.inspect());surface.showWorkspace(handle);
    document.addEventListener('pointerup',()=>{surface.showReading(handle);window.closedGestureCleared=!document.getElementById(handle.id+'_workspace_exit').hasAttribute('data-va-gesture');window.reopenedAfterGesture=surface.showWorkspace(handle);},{capture:true,once:true});
   });
   const closingBox=await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON());
   await page.mouse.move(closingBox.x+closingBox.width/2,closingBox.y+closingBox.height/2);await page.mouse.down();
   // Release outside the composer: the browser must not turn this canceled
   // press into a fresh composer click that would legitimately yield again.
   await page.mouse.move(10,10);
   await page.mouse.up();await page.clock.runFor(1);
   assert.equal(await page.evaluate(()=>closedGestureCleared&&reopenedAfterGesture&&gestureProbe.surface.visibility(gestureProbe.handle).workspace),true,'old input tail cannot close a new workspace choice');
   await page.evaluate(()=>{document.querySelector('form').classList.remove('native-focus-ring');gestureProbe.surface.showReading(gestureProbe.handle);gestureProbe.surface.refreshNativeBaseline(gestureProbe.handle,()=>gestureProbe.adapter.inspect());if(!gestureProbe.surface.showWorkspace(gestureProbe.handle))throw Error('gesture-probe-workspace-not-open');handoffButton.addEventListener('pointerdown',()=>document.querySelector('form').classList.add('native-focus-ring'),{once:true});});
   const expiryBox=await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON());
   await page.mouse.move(expiryBox.x+expiryBox.width/2,expiryBox.y+expiryBox.height/2);await page.mouse.down();
   await page.clock.fastForward(3001);
   assert.equal(await page.evaluate(()=>document.querySelector('[data-va-input-handoff]')),null,'missing parent pointerup cannot retain handoff');
   assert.equal(await page.evaluate(()=>document.getElementById(gestureProbe.handle.id+'_workspace_exit').matches(':popover-open')),false);
   await page.mouse.up();
   await page.evaluate(()=>{document.querySelector('form').classList.remove('native-focus-ring');gestureProbe.surface.showReading(gestureProbe.handle);gestureProbe.surface.refreshNativeBaseline(gestureProbe.handle,()=>gestureProbe.adapter.inspect());if(!gestureProbe.surface.showWorkspace(gestureProbe.handle))throw Error('gesture-probe-workspace-not-open');});
   const corruptBox=await page.evaluate(()=>handoffButton.getBoundingClientRect().toJSON());
   await page.mouse.move(corruptBox.x+corruptBox.width/2,corruptBox.y+corruptBox.height/2);await page.mouse.down();
   await page.evaluate(()=>{document.querySelector('style[data-va-owned]').textContent+=' /* changed */';});
   assert.equal(await page.evaluate(()=>document.getElementById(gestureProbe.handle.id+'_workspace_exit').matches(':popover-open')),false,'untrusted owned stylesheet cannot use handoff exemption');
   await page.mouse.up();
   await page.evaluate(()=>{gestureProbe.surface.dispose(gestureProbe.handle);gestureProbe.adapter.stop();});
  }
  await page.close();
 }
 // A disclosure contract counterexample, not a newly observed ChatGPT selector.
 const management=await browser.newPage({viewport:{width:800,height:600}});
 await management.route('**/*',r=>r.request().url()==='https://chatgpt.com/'?r.fulfill({contentType:'text/html',body:`<nav style="height:80px;overflow:auto"><section id="native"><div><a href="/g/${P}/project">Project</a><button aria-controls="panel" aria-expanded="true">Manage</button><div id="panel"><a href="/c/${C}">Member</a></div></div><div style="height:900px"></div></section></nav>`}):r.abort());await management.goto('https://chatgpt.com/');await management.addScriptTag({content:outputFiles[0].text});
 await management.evaluate(()=>{window.managementCurrent=true;window.managementNotifications=[];window.m=flowModule.observeNativeProjectManagement({document,root:document.querySelector('#native'),isCurrent:()=>managementCurrent,onChanged:()=>managementNotifications.push(m.read())});document.querySelector('button').addEventListener('click',e=>{const b=e.currentTarget;b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));});});
 assert.deepEqual(await management.evaluate(()=>m.read()),[],'initial native expansion is not management intent');
 await management.getByRole('button',{name:'Manage'}).click();await management.evaluate(()=>{document.querySelector('#panel').style.cssText='height:0;overflow:hidden';});await management.getByRole('button',{name:'Manage'}).click();assert.deepEqual(await management.evaluate(()=>m.read()),[],'clipped transition cannot remove owned members');
 await management.evaluate(()=>document.querySelector('#panel').style.cssText='');await management.waitForFunction(()=>m.read().length===1);assert.deepEqual(await management.evaluate(()=>m.read()),[{projectId:P,refIds:[C]}]);
 await management.evaluate(()=>document.querySelector('nav').scrollTop=500);assert.equal((await management.evaluate(()=>m.read()))[0].refIds.length,1,'NAV scrolling does not revoke management intent');
 // F-01 deduplication is based on the visible members inside the explicitly
 // expanded native management panel. Inner scrolling has no DOM mutation.
 await management.evaluate(()=>{document.querySelector('nav').scrollTop=0;const panel=document.querySelector('#panel');panel.style.cssText='height:24px;overflow:auto';panel.innerHTML='<a style="display:block;height:24px" href="/c/33333333-3333-4333-8333-333333333333">A</a><a style="display:block;height:24px" href="/c/44444444-4444-4444-8444-444444444444">B</a>';});
 await management.waitForFunction(()=>managementNotifications.at(-1)?.[0]?.refIds.join() === '33333333-3333-4333-8333-333333333333');
 const innerScroll=await management.evaluate(async()=>{
  const panel=document.querySelector('#panel'),before=managementNotifications.length;let eventSeen=false;
  panel.addEventListener('scroll',()=>eventSeen=true,{once:true});panel.scrollTop=24;
  for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
  return {eventSeen,changed:managementNotifications.length>before,notified:managementNotifications.at(-1),actual:m.read()};
 });
 assert.equal(innerScroll.eventSeen,true);assert.deepEqual(innerScroll.actual,[{projectId:P,refIds:['44444444-4444-4444-8444-444444444444']}]);
 assert.equal(innerScroll.changed,true,'inner native scroll must notify the formal sidebar, not just change manual readback');assert.deepEqual(innerScroll.notified,innerScroll.actual);
 // Accessibility and responsive geometry changes can revoke a native row's
 // availability without changing its URL or expanded state. The downstream
 // renderer must learn that before it continues suppressing its own row.
 const inertChange=await management.evaluate(async()=>{
  const before=managementNotifications.length;document.querySelector('#panel').inert=true;
  for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
  return {changed:managementNotifications.length>before,notified:managementNotifications.at(-1)};
 });
 assert.equal(inertChange.changed,true,'inert native panel must release duplicate suppression');assert.deepEqual(inertChange.notified,[]);
 await management.evaluate(()=>{const panel=document.querySelector('#panel');panel.inert=false;panel.style.height='max(24px, calc(100vh - 576px))';panel.scrollTop=0;});
 await management.waitForFunction(()=>managementNotifications.at(-1)?.[0]?.refIds.join()==='33333333-3333-4333-8333-333333333333');
 await management.setViewportSize({width:800,height:624});
 const widerPanel=await management.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);return {height:document.querySelector('#panel').clientHeight,notified:managementNotifications.at(-1)};});
 assert.equal(widerPanel.height,48);assert.deepEqual(widerPanel.notified,[{projectId:P,refIds:['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']}],'responsive native panel must update duplicate rows without a DOM mutation');
 await management.setViewportSize({width:800,height:600});
 const smallerPanel=await management.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);return {height:document.querySelector('#panel').clientHeight,notified:managementNotifications.at(-1)};});
 assert.equal(smallerPanel.height,24);assert.deepEqual(smallerPanel.notified,[{projectId:P,refIds:['33333333-3333-4333-8333-333333333333']}],'newly clipped native row must become available again in VAIWL');
 await management.evaluate(()=>{document.querySelector('#panel').style.cssText='height:0;overflow:hidden';});
 await management.waitForFunction(()=>managementNotifications.at(-1)?.length===0);
 await management.evaluate(()=>{document.querySelector('#panel').style.cssText='height:24px;overflow:auto';});
 await management.waitForFunction(()=>managementNotifications.at(-1)?.[0]?.refIds.join()==='33333333-3333-4333-8333-333333333333');
 // Actual collapse retires intent; untrusted re-expansion cannot revive it.
 await management.evaluate(()=>{document.querySelector('button').setAttribute('aria-expanded','false');});
 await management.waitForFunction(()=>managementNotifications.at(-1)?.length===0);
 await management.evaluate(()=>document.querySelector('button').setAttribute('aria-expanded','true'));
 await management.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual(await management.evaluate(()=>m.read()),[],'untrusted re-expansion cannot reuse retired intent');
 await management.getByRole('button',{name:'Manage'}).click();await management.getByRole('button',{name:'Manage'}).click();
 await management.waitForFunction(()=>managementNotifications.at(-1)?.length===1);
 assert.deepEqual(await management.evaluate(()=>{managementCurrent=false;return m.read();}),[]);
 assert.deepEqual(await management.evaluate(()=>{managementCurrent=true;return m.read();}),[],'lost document binding cannot reuse old management intent');
 await management.getByRole('button',{name:'Manage'}).click();
 await management.evaluate(()=>{document.querySelector('#panel').style.height='max(0px, calc(100vh - 600px))';});
 await management.getByRole('button',{name:'Manage'}).click();
 assert.deepEqual(await management.evaluate(()=>m.read()),[],'new expansion waits for a usable panel');
 await management.setViewportSize({width:800,height:624});
 const delayedPanel=await management.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);return managementNotifications.at(-1);});
 assert.deepEqual(delayedPanel,[{projectId:P,refIds:['33333333-3333-4333-8333-333333333333']}],'trusted pending expansion must finish on geometry within its original deadline');
 await management.getByRole('button',{name:'Manage'}).click();await management.setViewportSize({width:800,height:600});
 await management.getByRole('button',{name:'Manage'}).click();assert.deepEqual(await management.evaluate(()=>m.read()),[]);
 await management.evaluate(()=>document.querySelector('button').setAttribute('aria-expanded','false'));
 await management.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await management.evaluate(()=>document.querySelector('button').setAttribute('aria-expanded','true'));
 await management.setViewportSize({width:800,height:624});
 await management.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual(await management.evaluate(()=>m.read()),[],'pending intent cannot revive after an observed native collapse');
 const stoppedNotifications=await management.evaluate(()=>{m.stop();return managementNotifications.length;});await management.setViewportSize({width:800,height:600});
 await management.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await management.evaluate(()=>managementNotifications.length),stoppedNotifications,'stopped geometry callbacks are retired');await management.close();
 console.log(JSON.stringify(results,null,2));assert(results.every(r=>r.shown&&r.structural&&r.active&&!r.privatePopover&&r.replacedHeaderRejected&&r.lateHeaderControlRejected&&r.interactiveShellRejected&&r.interactiveBaselineRejected&&r.input&&r.restored&&r.declarative&&r.nativeWins&&r.clean));
}finally{await browser.close();}
