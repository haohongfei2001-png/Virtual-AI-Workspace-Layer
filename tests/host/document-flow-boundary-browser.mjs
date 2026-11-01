/** Native layout boundary regressions using production modules in Chrome.
 * BROWSER_MECHANISM_ONLY. Pair with browser-local-mv3.mjs --flow-only and
 * terminal-delivery-mv3.mjs for actual packaged renderer/authority evidence.
 * No live ChatGPT, user profile, credentials, or private content is accessed.
 */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {observedHomeHTML,longDesktopHTML,materializeFlatHomeBranch} from './fixtures/observed-host-replay.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const source=process.env.VAIWL_SOURCE??process.cwd(),toggleOnly=process.argv.includes('--toggle-only');
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export * from './src/host/document-flow-layout.mjs';export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {createFlowMountSurface} from './src/navigation/flow-mount-surface.mjs';",resolveDir:source},bundle:true,write:false,format:'iife',globalName:'boundaryModule'});
const C='33333333-3333-4333-8333-333333333333';
const report={status:'RUNNING',source,evidence:'BROWSER_MECHANISM_ONLY',realChatGPT:'NOT_RUN',checks:[]};
const browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']});
report.browser=browser.version();
const check=(name,value)=>{report.checks.push({name,...value});assert.equal(value.ok,true,name+' '+JSON.stringify(value));};
async function pageFor(kind='home'){
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 const url=kind==='home'?'https://chatgpt.com/':'https://chatgpt.com/c/'+C;
 const html=kind==='home'?observedHomeHTML(C):longDesktopHTML(C).replace('</style>','#reading{height:2600px}[data-thread-scroll-footer]{position:fixed;left:280px;top:602px;width:600px;height:98px}</style>');
 await page.route('**/*',route=>route.request().url()===url?route.fulfill({contentType:'text/html',body:html}):route.abort());
 await page.goto(url);report.viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));if(kind==='home')await page.evaluate(materializeFlatHomeBranch);
 await page.addScriptTag({content:outputFiles[0].text});
 await page.evaluate(async kind=>{
  const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface,captureNativeBaseline}=boundaryModule;
  let island=null,button=null,sheet=null;
  if(kind==='home'){
   island=document.createElement('section');island.id='boundary-island';island.style.cssText='height:24px;width:100%';
   button=document.createElement('button');button.id='boundary-native-button';button.textContent='Native island action';button.style.cssText='box-sizing:border-box;width:150px;height:24px';island.append(button);document.querySelector('[role=main]').append(island);
   sheet=document.createElement('style');sheet.textContent='#boundary-native-button{position:relative}';document.head.append(sheet);
  }
  const binding={documentToken:'boundary-document',producerToken:'boundary-producer',browserDocumentId:'boundary-browser-document',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+60000).toISOString()};
  let surface;const adapter=createChatGPTAdapter({document,profile,isOwnedMask:node=>surface?.isMasked(node),isOwnedSurface:node=>surface?.isOwnedSurface(node),isReadingProbeSurface:node=>surface?.isReadingProbeSurface?.(node)===true});
  await adapter.start({binding,emit:async p=>({state:'accepted',localSeq:p.localSeq,receiptId:'boundary-fixture'})});
  const inspection=adapter.inspect(),plan=captureNativeBaseline({document,inspection});
  if(!plan)throw Error('boundary-fixture-preflight');
  surface=createFlowMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});
  const surrendered=[],handle=await surface.mount({binding},inspection,{onSurrender:event=>surrendered.push(event)}),frame=surface.frames(handle).find(f=>f.role==='workspace').frame;
  const p=globalThis.boundaryProbe={adapter,surface,handle,frame,island,button,sheet,inspection,plan,binding,surrendered,clicks:0,reads:0};
  button?.addEventListener('click',()=>p.clicks++);
  p.tick=async(count=3)=>{for(let i=0;i<count;i++)await new Promise(requestAnimationFrame);};
  if(kind==='home'&&!surface.showWorkspace(handle))throw Error('boundary-fixture-presentation');
 },kind);
 return page;
}
try{
 const page=await pageFor();
 if(!toggleOnly){
 check('opaque cosmetic and concrete native button replacement',await page.evaluate(async()=>{
  const p=boundaryProbe,{surface,handle,island,frame}=p,old=p.button;
  island.style.boxShadow='inset 0 0 1px rgba(0,0,0,.15)';island.className='native-cosmetic';
  const next=old.cloneNode(true);next.addEventListener('click',()=>p.clicks++);old.replaceWith(next);p.button=next;
  island.append(document.createTextNode(' '));await p.tick();
  return {ok:surface.visibility(handle).workspace&&surface.frames(handle)[0].frame===frame&&boundaryModule.isNativeControlCurrent(p.plan,next)&&!boundaryModule.isNativeControlCurrent(p.plan,old),sameFrame:surface.frames(handle)[0].frame===frame,oldConnected:old.isConnected};
 }));
 await page.getByRole('button',{name:'Native island action',exact:true}).click();
 check('replacement keeps its actual native listener',await page.evaluate(()=>({ok:boundaryProbe.clicks===1,clicks:boundaryProbe.clicks})));
 check('large opaque internal subtree is not a paint-admission budget',await page.evaluate(async()=>{
  const p=boundaryProbe,group=document.createElement('span');group.id='opaque-passive-group';for(let i=0;i<300;i++)group.append(document.createElement('span'));p.island.append(group);await p.tick();
  const nativeStyle=window.getComputedStyle;let passiveStyleReads=0;window.getComputedStyle=function(node,...args){if(node===group||group.contains(node))passiveStyleReads++;return nativeStyle.call(this,node,...args);};
  try{await p.tick(6);}finally{window.getComputedStyle=nativeStyle;}
  return {ok:p.surface.visibility(p.handle).workspace&&passiveStyleReads===0,sameFrame:p.surface.frames(p.handle)[0].frame===p.frame,passiveStyleReads};
 }));
 check('CSSOM-only existing control overlap surrenders workspace',await page.evaluate(async()=>{
  const p=boundaryProbe;let nativeMutations=0,resizes=0;
  const observer=new MutationObserver(records=>nativeMutations+=records.length);observer.observe(p.island,{subtree:true,childList:true,attributes:true,characterData:true});
  const resize=new ResizeObserver(()=>resizes++);resize.observe(p.island);resize.observe(p.button);await p.tick();resizes=0;
  const before=p.button.getBoundingClientRect();
  p.sheet.sheet.insertRule('#boundary-native-button{position:fixed;left:400px;top:200px;z-index:80}',p.sheet.sheet.cssRules.length);
  const moved=p.button.getBoundingClientRect();await p.tick();
  const r=p.button.getBoundingClientRect(),nativeHit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===p.button;
  observer.disconnect();resize.disconnect();
  return {ok:!p.surface.visibility(p.handle).workspace&&nativeHit&&nativeMutations===0&&resizes===0&&before.width===moved.width&&before.height===moved.height,nativeMutations,resizes,nativeHit,workspace:p.surface.visibility(p.handle).workspace};
 }));
 await page.getByRole('button',{name:'Native island action',exact:true}).click();
 check('CSSOM native control remains actually clickable',await page.evaluate(()=>({ok:boundaryProbe.clicks===2,clicks:boundaryProbe.clicks})));
 check('normal geometry recovers without a new frame',await page.evaluate(async()=>{
  const p=boundaryProbe;p.sheet.sheet.deleteRule(p.sheet.sheet.cssRules.length-1);p.surface.showReading(p.handle);const shown=p.surface.showWorkspace(p.handle);await p.tick();
  return {ok:shown&&p.surface.visibility(p.handle).workspace&&p.surface.frames(p.handle)[0].frame===p.frame};
 }));
 check('visible overflowing text is not treated as harmless decoration',await page.evaluate(async()=>{
  const p=boundaryProbe,overflow=document.createElement('span');overflow.style.cssText='display:block;height:150px';overflow.textContent='Native overflowing content';p.island.append(overflow);await p.tick();
  const hidden=!p.surface.visibility(p.handle).workspace;overflow.remove();p.surface.showReading(p.handle);const recovered=p.surface.showWorkspace(p.handle);return {ok:hidden&&recovered,hidden,recovered};
 }));
 check('native modal has presentation priority',await page.evaluate(async()=>{
  const p=boundaryProbe,dialog=document.createElement('dialog');dialog.textContent='Native modal';document.body.append(dialog);dialog.showModal();await p.tick();const hidden=!p.surface.visibility(p.handle).workspace;dialog.close();dialog.remove();p.surface.showReading(p.handle);return {ok:hidden&&p.surface.showWorkspace(p.handle),hidden};
 }));
 }
 check('a stale closed toggle cannot cancel a re-proved workspace intent',await page.evaluate(async()=>{
  const p=boundaryProbe;await p.tick();p.surrendered.length=0;let reopened=false;
  const capture=event=>{if(event.target.id!==p.handle.id+'_workspace_exit'||event.newState!=='closed')return;document.removeEventListener('toggle',capture,true);reopened=p.surface.showWorkspace(p.handle);};
  document.addEventListener('toggle',capture,true);p.surface.suspend(p.handle,'workspace-geometry','workspace');await p.tick();document.removeEventListener('toggle',capture,true);
  const falseUserExit=p.surrendered.some(event=>event.reason==='native-reading');
  return {ok:reopened&&p.surface.visibility(p.handle).workspace&&!falseUserExit,reopened,falseUserExit,events:p.surrendered.map(event=>event.reason)};
 }));
 if(!toggleOnly){
 for(const kind of ['hidden','shown','replaced'])check('closed native island '+kind+' reproof preserves frame',await page.evaluate(async kind=>{
  const p=boundaryProbe;p.surface.showReading(p.handle);
  if(kind==='hidden')p.island.style.display='none';
  if(kind==='shown')p.island.style.display='block';
  if(kind==='replaced'){const replacement=document.createElement('section');replacement.style.cssText=p.island.style.cssText;replacement.id=p.island.id;const button=document.createElement('button');button.textContent='Native island action';replacement.append(button);p.island.replaceWith(replacement);p.island=replacement;p.button=button;}
  let diagnostic;const inspection=p.adapter.inspect(),candidate=boundaryModule.captureNativeBaseline({document,inspection,isOwnedSurface:node=>p.surface.isOwnedSurface(node),onDiagnostic:value=>diagnostic=value});
  const refreshed=p.surface.refreshNativeBaseline(p.handle,()=>p.adapter.inspect()),shown=!!refreshed&&p.surface.showWorkspace(p.handle);await p.tick();
  return {ok:shown&&p.surface.frames(p.handle)[0].frame===p.frame,candidate:!!candidate,refreshed:!!refreshed,shown,inspectionEpoch:inspection.regionEpoch,handleEpoch:p.handle.regionEpoch,diagnostic:candidate?null:diagnostic};
 },kind));
 check('layout reproof never takes over a foreign row marker',await page.evaluate(()=>{
  const p=boundaryProbe;p.surface.showReading(p.handle);const old=p.island,replacement=document.createElement('section');replacement.style.cssText=old.style.cssText;
  const row=[...old.attributes].find(attribute=>attribute.name.startsWith('data-va-flow-row-')).name;replacement.setAttribute(row,'foreign-owner');old.replaceWith(replacement);
  const result=p.surface.refreshNativeBaseline(p.handle,()=>p.adapter.inspect()),preserved=replacement.getAttribute(row)==='foreign-owner';replacement.replaceWith(old);
  return {ok:result===null&&preserved&&p.surface.frames(p.handle)[0].frame===p.frame&&p.surface.showWorkspace(p.handle),refused:result===null,foreignMarkerPreserved:preserved};
 }));
 check('native reading requires its fresh exact source and callback',await page.evaluate(()=>{
  const p=boundaryProbe;p.surface.showReading(p.handle);
  const first=p.surface.withNativeReading(p.handle,()=>++p.reads,()=>true);
  const callbackRequired=!boundaryModule.isNativeReadingCurrent({...p.plan,nativeReadingCurrent:undefined});
  const old=p.plan.reading,next=old.cloneNode(true);old.replaceWith(next);
  const second=p.surface.withNativeReading(p.handle,()=>++p.reads,()=>true);
  next.replaceWith(old);return {ok:first===1&&second===null&&p.reads===1&&callbackRequired,first,second,reads:p.reads,callbackRequired};
 }));
 check('unknown layout roots and intervening wrappers are refused',await page.evaluate(()=>{
  const p=boundaryProbe;p.surface.showReading(p.handle);let reason;
  const noRoot=boundaryModule.captureNativeBaseline({document,inspection:{...p.inspection,flowSeam:{...p.inspection.flowSeam,roots:[]}},isOwnedSurface:node=>p.surface.isOwnedSurface(node),onRefused:r=>reason=r});
  const form=p.plan.composer,parent=form.parentElement,wrapper=document.createElement('div');parent.insertBefore(wrapper,form);wrapper.append(form);
  const fresh=p.adapter.inspect(),unknown=boundaryModule.captureNativeBaseline({document,inspection:fresh,isOwnedSurface:node=>p.surface.isOwnedSurface(node)});
  wrapper.replaceWith(form);return {ok:noRoot===null&&unknown===null,noRootReason:reason,unknownWrapperRefused:unknown===null};
 }));
 check('a newly positive unknown common ancestor does not become an owned root',await page.evaluate(()=>{
  const p=boundaryProbe,root=p.plan.root,parent=root.parentElement,style=root.getAttribute('style'),outer=document.createElement('div');outer.style.cssText='position:relative;width:100%;height:850px';parent.insertBefore(outer,root);outer.append(root);root.style.height='0px';
  let reason;const inspection=p.adapter.inspect(),next=boundaryModule.captureNativeBaseline({document,inspection,isOwnedSurface:node=>p.surface.isOwnedSurface(node),onRefused:value=>reason=value});
  outer.replaceWith(root);if(style===null)root.removeAttribute('style');else root.setAttribute('style',style);
  return {ok:inspection.ok&&next===null&&reason==='native-flow-root',inspection:inspection.ok,reason};
 }));
 await page.evaluate(()=>{boundaryProbe.surface.dispose(boundaryProbe.handle);boundaryProbe.adapter.stop();});await page.close();
 for(const nested of [false,true]){
  const shadowPage=await pageFor();
  check((nested?'nested':'root')+' open shadow boundary surrenders without a light-tree mutation',await shadowPage.evaluate(async nested=>{
   const p=boundaryProbe,host=nested?document.createElement('div'):p.island;
   if(nested){host.style.display='contents';p.island.append(host);await p.tick(6);}
   const before=p.surface.visibility(p.handle).workspace;let mutations=0;
   const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(p.island,{subtree:true,childList:true,attributes:true});
   const shadow=host.attachShadow({mode:'open'}),button=document.createElement('button');button.textContent='Native shadow action';button.style.cssText='position:fixed;left:400px;top:200px;width:160px;height:40px;z-index:80';shadow.append(button);
   await p.tick(6);observer.disconnect();const hidden=p.surface.visibility(p.handle).workspace!==true;
   const refused=p.surface.refreshNativeBaseline(p.handle,()=>p.adapter.inspect())===null;
   return {ok:before&&mutations===0&&hidden&&refused,before,mutations,hidden,refused};
  },nested));
  await shadowPage.evaluate(()=>{boundaryProbe.surface.dispose(boundaryProbe.handle);boundaryProbe.adapter.stop();});await shadowPage.close();
 }
 for(const damage of ['style','srcdoc']){
  const damaged=await pageFor();
  check('owned '+damage+' integrity remains mandatory',await damaged.evaluate(async damage=>{
   const p=boundaryProbe;if(damage==='style')document.head.querySelector('style[data-va-owned]').textContent='/* changed */';else p.frame.srcdoc='<p>untrusted replacement</p>';
   await p.tick();const style=getComputedStyle(p.frame.parentElement),hidden=style.display==='none'||style.visibility!=='visible';return {ok:p.surface.visibility(p.handle)?.workspace!==true&&hidden,hidden};
  },damage));
  await damaged.evaluate(()=>{boundaryProbe.surface.dispose(boundaryProbe.handle);boundaryProbe.adapter.stop();});await damaged.close();
 }
 for(const reason of ['native-popover','adapter-stopped']){
  const reading=await pageFor('conversation');
  check('scroll rollback survives '+reason,await reading.evaluate(async reason=>{
   const p=boundaryProbe,scroll=document.querySelector('[data-app-action-timeline-scroll]');scroll.scrollTop=600;const original=scroll.scrollTop,shown=p.surface.showWorkspace(p.handle);await p.tick();const clamped=scroll.scrollTop;
   let restored;
   if(reason==='native-popover'){const layer=document.createElement('div');layer.setAttribute('popover','manual');layer.textContent='Native layer';document.body.append(layer);layer.showPopover();await p.tick();restored=scroll.scrollTop;layer.hidePopover();layer.remove();p.surface.dispose(p.handle);p.adapter.stop();}
   else{p.adapter.stop();p.surface.dispose(p.handle);restored=scroll.scrollTop;}
   return {ok:shown&&original===600&&clamped===0&&restored===600,original,clamped,restored,owned:document.querySelectorAll('[data-va-owned]').length};
  },reason));
  await reading.close();
 }
 }else{await page.evaluate(()=>{boundaryProbe.surface.dispose(boundaryProbe.handle);boundaryProbe.adapter.stop();});await page.close();}
 report.status='PASS_BOUNDARY_MECHANISMS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await browser.close();if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
