/** Focused geometry/identity regression, synthetic native content only.
 * Not a live-host preflight replay or complete MV3 product acceptance. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {observedHomeHTML,materializeNestedHomeFlow} from './fixtures/observed-host-replay.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {captureNativeBaseline,isSameNativeStructure} from './src/host/document-flow-layout.mjs';export {createFlowMountSurface} from './src/navigation/flow-mount-surface.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'flowModule'});
const dir=await mkdtemp(join(tmpdir(),'vaiwl-nested-home-flow-')),report={evidence:'SYNTHETIC_GEOMETRY_MECHANISM_ONLY',directory:dir,status:'RUNNING'};
const browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']});
try{
 const page=await browser.newPage({viewport:{width:1234,height:897}});
 await page.route('**/*',route=>route.request().url()==='https://chatgpt.com/'?route.fulfill({contentType:'text/html',body:observedHomeHTML('33333333-3333-4333-8333-333333333333')}):route.abort());
 await page.goto('https://chatgpt.com/');await page.evaluate(materializeNestedHomeFlow);await page.addScriptTag({content:outputFiles[0].text});
 report.initial=await page.evaluate(async()=>{
  const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,captureNativeBaseline,createFlowMountSurface}=flowModule;
  const adapter=createChatGPTAdapter({document,profile}),binding={documentToken:'nested-home',producerToken:'nested-home',browserDocumentId:'nested-home',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+60000).toISOString()};
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'nested-home'})});
  const inspection=adapter.inspect();let diagnostic;const plan=captureNativeBaseline({document,inspection,onDiagnostic:r=>diagnostic=r});
  if(!plan){const member=inspection.flowSeam?.composerMember,s=member&&getComputedStyle(member),r=member?.getBoundingClientRect();adapter.stop();return {admitted:false,inspection:inspection.reason,reason:diagnostic?.reason,detail:diagnostic?.detail,member:member?{id:member.id,rect:[r.x,r.y,r.width,r.height],size:[member.clientWidth,member.clientHeight,member.scrollWidth,member.scrollHeight],style:[s.position,s.cssFloat,s.visibility,s.overflowX,s.overflowY]}:null};}
  const form=inspection.composer,editor=form.querySelector('textarea'),container=document.querySelector('#nested-home-composer-container'),plate=document.querySelector('#nested-home-composer-plate');
  editor.setSelectionRange(1,4);const before=container.outerHTML,formParent=form.parentElement,originalPlate=plate.getBoundingClientRect();
  const rejected=(mutate,restore)=>{mutate();try{return captureNativeBaseline({document,inspection:adapter.inspect()})===null;}finally{restore();}};
  const readA=document.querySelector('#nested-home-reading-a'),band=document.querySelector('#nested-home-band'),zero=document.querySelector('#nested-home-before'),root=document.querySelector('#nested-home-root');
  const negative={};
  negative.readingBox=rejected(()=>readA.style.display='block',()=>readA.style.display='contents');
  negative.readingControl=rejected(()=>readA.tabIndex=0,()=>readA.removeAttribute('tabindex'));
  negative.readingEffect=rejected(()=>readA.style.opacity='.5',()=>readA.style.removeProperty('opacity'));
  negative.transparentInputAncestor=rejected(()=>plate.style.opacity='0',()=>plate.style.removeProperty('opacity'));
  negative.wrongBand=rejected(()=>band.style.flexDirection='row',()=>band.style.flexDirection='column');
  const rootParent=root.parentElement;negative.wrongRoot=rejected(()=>rootParent.parentElement.append(root),()=>rootParent.append(root));
  const escaped=document.createElement('div');escaped.style.cssText='height:3px;width:10px';negative.zeroHeightOverflow=rejected(()=>zero.append(escaped),()=>escaped.remove());
  const shadow=document.createElement('div');shadow.attachShadow({mode:'open'}).innerHTML='<button>Opaque fixture tool</button>';negative.opaqueInput=rejected(()=>container.append(shadow),()=>shadow.remove());
  const originalPlan=captureNativeBaseline({document,inspection:adapter.inspect()}),replacement=form.cloneNode(true);
  form.replaceWith(replacement);negative.replacedForm=!flowModule.isSameNativeStructure(originalPlan);replacement.replaceWith(form);
  container.append(form);negative.reparentedForm=!flowModule.isSameNativeStructure(originalPlan);formParent.append(form);
  const surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'}),handle=await surface.mount({binding},inspection);
  const shown=surface.showWorkspace(handle),formBox=form.getBoundingClientRect(),containerBox=container.getBoundingClientRect();
  window.nestedProbe={adapter,surface,handle,inspection,plan,form,formParent,editor,container,plate,before};
  return {admitted:true,shown,negative,containerIsFlowMember:plan.composer===container,actualComposerUnchanged:inspection.composer===form,formParentUnchanged:form.parentElement===formParent,formVisible:formBox.width>0&&formBox.height>0&&formBox.bottom<=innerHeight,containerHeight:containerBox.height,plateBackground:getComputedStyle(plate).backgroundColor,plateWidth:plate.getBoundingClientRect().width,originalPlateWidth:originalPlate.width,draft:editor.value};
 });
 assert.equal(report.initial.admitted,true,JSON.stringify(report.initial));assert.equal(report.initial.shown,true);assert.equal(report.initial.containerIsFlowMember,true);assert.equal(report.initial.actualComposerUnchanged,true);assert.equal(report.initial.formParentUnchanged,true);assert.equal(report.initial.formVisible,true);assert.equal(report.initial.draft,'fixture draft');assert.equal(report.initial.plateBackground,'rgb(242, 242, 242)');
 assert(Object.values(report.initial.negative).every(v=>v===true),JSON.stringify(report.initial.negative));
 await page.getByRole('button',{name:'Native container tool',exact:true}).click();
 assert.equal(await page.evaluate(()=>nestedHomeNativeClicks),1,'tool outside the form retains its native handler');
 report.toolClick=true;
 const show=async()=>assert.equal(await page.evaluate(()=>nestedProbe.surface.showWorkspace(nestedProbe.handle)),true,'each live mutation begins with an admitted visible workspace');
 await show();
 report.liveTransparentInput=await page.evaluate(async()=>{const p=nestedProbe;p.plate.style.opacity='0';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const hidden=p.surface.visibility(p.handle).workspace===false;p.plate.style.removeProperty('opacity');return {hidden};});
 assert.equal(report.liveTransparentInput.hidden,true,'transparent native input ancestor cannot keep workspace admitted');
 await show();
 report.liveReplacement=await page.evaluate(async()=>{const p=nestedProbe,replacement=p.form.cloneNode(true);p.form.replaceWith(replacement);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const hidden=p.surface.visibility(p.handle).workspace===false;replacement.replaceWith(p.form);return {hidden,originalEditor:p.form.querySelector('textarea')===p.editor};});
 assert.deepEqual(report.liveReplacement,{hidden:true,originalEditor:true});
 await show();
 report.liveEnvelopeChange=await page.evaluate(async()=>{const p=nestedProbe,extra=document.createElement('button');extra.textContent='Native outer action';document.querySelector('#nested-home-outer-contents').append(extra);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const hidden=p.surface.visibility(p.handle).workspace===false;extra.remove();return {hidden};});
 assert.equal(report.liveEnvelopeChange.hidden,true,'new outer native sibling must retire the prior nested seam');
 await show();
 report.liveEnvelopeCSS=await page.evaluate(async()=>{const p=nestedProbe,prior=[...document.adoptedStyleSheets],sheet=new CSSStyleSheet();sheet.replaceSync('#nested-home-outer-contents{display:block!important}');document.adoptedStyleSheets=[...prior,sheet];await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const hidden=p.surface.visibility(p.handle).workspace===false;document.adoptedStyleSheets=prior;return {hidden};});
 assert.equal(report.liveEnvelopeCSS.hidden,true,'CSSOM contents loss must retire the prior nested seam');
 await show();
 report.screenshot=join(dir,'workspace.png');await page.screenshot({path:report.screenshot,caret:'initial'});
 report.restored=await page.evaluate(()=>{const p=nestedProbe;p.surface.suspend(p.handle);p.surface.dispose(p.handle);p.adapter.stop();return {sameNodes:p.form.parentElement===p.formParent&&p.editor===p.form.querySelector('textarea'),sameMarkup:p.container.outerHTML===p.before,draft:p.editor.value,selection:[p.editor.selectionStart,p.editor.selectionEnd],...(p.container.outerHTML!==p.before?{before:p.before,after:p.container.outerHTML}:{})};});
 assert.deepEqual(report.restored,{sameNodes:true,sameMarkup:true,draft:'fixture draft',selection:[1,4]});
 report.status='PASS_NESTED_HOME_MECHANISM';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await browser.close();await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
