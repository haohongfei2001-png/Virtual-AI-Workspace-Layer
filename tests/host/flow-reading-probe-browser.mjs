/** Production flow/read boundary with a real extension-origin synthetic frame.
 * WEB_MECHANISM_ONLY: this is not the packaged renderer, scope owner, or live
 * ChatGPT acceptance. A disposable headless profile can reach only the fixture.
 */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {longDesktopHTML,materializePartitionedSidebar} from './fixtures/observed-host-replay.mjs';
import partition from './fixtures/observed-sidebar-project-details-20261026.json' with {type:'json'};
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';

const source=process.env.VAIWL_SOURCE??process.cwd(),require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export * from './src/host/document-flow-layout.mjs';export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';export {createFlowMountSurface} from './src/navigation/flow-mount-surface.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';",resolveDir:source},bundle:true,write:false,format:'iife',globalName:'readingModule'});
const renderer=await require('esbuild').build({stdin:{contents:"export {createNavigation} from './src/navigation/navigation.mjs';export {freeNavigationSnapshot} from './src/navigation/free-view.mjs';export {projectFreeFrame} from './src/runtime/free-frame-projection.mjs';export {projectFreeSearch} from './src/runtime/free-search-projection.mjs';",resolveDir:source},bundle:true,write:false,format:'iife',globalName:'rendererModule'});
const C='33333333-3333-4333-8333-333333333333',B='44444444-4444-4444-8444-444444444444';
const html=longDesktopHTML(C).replace('</style>','#reading{height:2600px}[data-thread-scroll-footer]{position:fixed;left:280px;top:602px;width:600px;height:98px}</style>');
const server=createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});response.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,network=await createHistoricalNetworkGuard({fixtureOrigin:origin});
const dir=await mkdtemp(join(tmpdir(),'vaiwl-flow-reading-probe-')),extension=join(dir,'extension');await mkdir(extension);
await writeFile(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Isolated native-reading regression frame',version:'0.0.1',web_accessible_resources:[{resources:['frame.html','frame.js'],matches:[origin+'/*']}],content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; connect-src 'none'"}}));
await writeFile(join(extension,'frame.html'),'<meta charset="utf-8"><style>body{margin:0;height:2200px}input{display:block;width:90%;height:30px}#scroller{height:120px;overflow:auto}#inside{height:1600px}</style><input id="search" value="UNSENT_SYNTHETIC_SEARCH_DRAFT"><div id="scroller"><div id="inside">Synthetic long list</div></div><script src="frame.js"></script>');
await writeFile(join(extension,'frame.js'),`globalThis.events=[];for(const type of ['focus','blur','focusin','focusout'])document.addEventListener(type,event=>events.push({type,target:event.target.id||event.target.tagName}),true);
globalThis.snapshot=()=>({focused:document.activeElement===document.querySelector('#search'),documentHasFocus:document.hasFocus(),value:document.querySelector('#search').value,start:document.querySelector('#search').selectionStart,end:document.querySelector('#search').selectionEnd,scroll:document.querySelector('#scroller').scrollTop,windowScroll:scrollY,events:[...events]});`);
await writeFile(join(extension,'renderer.js'),renderer.outputFiles[0].text);
const sourcePaths=['src/navigation/flow-mount-surface.mjs','src/host/document-flow-layout.mjs','src/host/chatgpt-adapter.mjs','src/navigation/navigation.mjs','src/navigation/styles.mjs','src/runtime/free-search-projection.mjs','src/runtime/free-frame-projection.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(join(source,path))).digest('hex')])));
const report={status:'RUNNING',evidence:'WEB_MECHANISM_ONLY',realChatGPT:'NOT_RUN',formalRenderer:'NOT_RUN',sourceHashes:await hashes(),browserVersion:null,viewports:[],checks:[]};
const check=(name,value)=>{report.checks.push({name,...value});assert.equal(value.ok,true,name+' '+JSON.stringify(value));};
let context,extensionId,browserHandle;
async function setup(){
 const page=await context.newPage();await page.setViewportSize({width:1400,height:900});await page.goto(origin+'/c/'+C);await page.evaluate(materializePartitionedSidebar,partition.sidebarStructure.rows);await page.addScriptTag({content:outputFiles[0].text});
 const setup=await page.evaluate(async({extensionId,origin})=>{
  const {createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile,createFlowMountSurface,createURLPolicy,captureNativeBaseline}=readingModule;
  const binding={documentToken:'reading-document',producerToken:'reading-producer',browserDocumentId:'reading-browser-document',routeEpoch:1,origin,expiresAt:new Date(Date.now()+60000).toISOString()};
  let surface;const adapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy({origin}),isOwnedMask:node=>surface?.isMasked(node)===true,isOwnedSurface:node=>surface?.isOwnedSurface(node)===true,isReadingProbeSurface:node=>surface?.isReadingProbeSurface(node)===true});
  await adapter.start({binding,emit:async proposal=>({state:'accepted',localSeq:proposal.localSeq,receiptId:'reading-fixture'})});
  const inspection=adapter.inspect(),nativeCurrent=inspection.nativeReadingCurrent,authority={allowed:true,source:true,calls:0};
  inspection.nativeReadingCurrent=()=>{authority.calls++;return authority.source&&nativeCurrent();};
  const plan=captureNativeBaseline({document,inspection,isOwnedSurface:node=>surface?.isOwnedSurface(node)===true});if(!plan)throw Error('reading-fixture-preflight');
  surface=createFlowMountSurface({document,createFrameURL:({role})=>`chrome-extension://${extensionId}/frame.html?role=${role}`});
  const surrendered=[],handle=await surface.mount({binding},inspection,{onSurrender:event=>surrendered.push(event)}),frames=surface.frames(handle);
  const frame=frames.find(item=>item.role==='workspace').frame,sidebar=frames.find(item=>item.role==='sidebar')?.frame,port=document.querySelector('[data-app-action-timeline-scroll]'),native=document.querySelector('textarea');
  port.scrollTop=321;const originalNativeScroll=port.scrollTop;if(originalNativeScroll!==321||!surface.showWorkspace(handle))throw Error('reading-fixture-presentation');
  globalThis.readingProbe={adapter,surface,handle,frame,sidebar,port,plan,authority,surrendered,native,nativeValue:native.value,originalNativeScroll,originalWorkspaceStyle:frame.parentElement.getAttribute('style')};
  return {nativeScroll:port.scrollTop,workspace:surface.visibility(handle).workspace,sidebar:surface.visibility(handle).sidebar};
 },{extensionId,origin});
 assert.deepEqual(setup,{nativeScroll:0,workspace:true,sidebar:true});
 const url=`chrome-extension://${extensionId}/frame.html?role=workspace`,frame=page.frames().find(frame=>frame.url()===url)??await page.waitForEvent('framenavigated',{predicate:frame=>frame.url()===url,timeout:5000});
 await frame.waitForFunction(()=>typeof snapshot==='function');
 await frame.evaluate(()=>{const input=document.querySelector('#search');input.focus({preventScroll:true});input.setSelectionRange(3,17);document.querySelector('#scroller').scrollTop=177;scrollTo(0,48);events.length=0;});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 return {page,frame};
}
async function setupRenderer(){
 const {page,frame}=await setup();await frame.addScriptTag({url:`chrome-extension://${extensionId}/renderer.js`});
  await frame.evaluate(()=>{
   document.documentElement.style.height='100%';document.body.style.cssText='height:100%;margin:0;overflow:hidden';const mount=document.createElement('div');mount.id='renderer-root';mount.style.height='100%';document.body.replaceChildren(mount);
   const {createNavigation,freeNavigationSnapshot,projectFreeFrame}=rendererModule,scope='reading-renderer-focus',refs=Array.from({length:40},(_,i)=>{const id='70000000-0000-4000-8000-'+(i+1).toString(16).padStart(12,'0');return {id,scope,nativeTitle:'Synthetic chat '+i,nativeUrl:'https://chatgpt.com/c/'+id,membership:'NONE',projectId:null,activityDecision:{segment:0}};});
   const world={snapshot:freeNavigationSnapshot({scope,viewMode:'free',revision:1,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},refs,projects:[]})},project=()=>projectFreeFrame(world,{role:'workspace',list:'noProject',rowOffset:0,rowLimit:41});
   const navigation=createNavigation({document,surface:{role:'workspace',root:mount},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){},nativeHref:url=>url,navigationPlan:()=>null}});navigation.updateFrameProjection(project());
   const root=navigation.roots().workspace,original=root.scroller,events=[],focusCalls=[],inputs=[],realNow=performance.now.bind(performance);let refresh=null,cancellation=null,paint=null,expiry=null,phase='setup';
   const snapshot=()=>{const pane=navigation.roots()?.workspace,current=pane?.scroller,rect=current?.getBoundingClientRect(),style=current&&getComputedStyle(current),visible=current?.isConnected===true&&rect.width>0&&rect.height>0&&style.display!=='none'&&!['hidden','collapse'].includes(style.visibility);return {at:performance.timeOrigin+realNow(),focused:!!pane&&pane.shadow.activeElement===current,documentHasFocus:document.hasFocus(),documentActive:document.activeElement?.tagName,shadowActive:pane?.shadow.activeElement?.dataset.focusKey??null,originalConnected:original.isConnected,sameNode:current===original,currentConnected:current?.isConnected===true,visible,visibility:style?.visibility??null,styleVisibility:current?.style.visibility??null,hitSelf:!!current&&rect.width>16&&rect.height>16&&pane.shadow.elementFromPoint(rect.left+8,rect.top+8)===current,scroll:current?.scrollTop??null,modelScroll:navigation.view()?.scroll??null,rect:{width:rect?.width??0,height:rect?.height??0},viewMode:navigation.view()?.mode??null,workset:navigation.view()?.worksetOpen??null,rootsPresent:!!navigation.roots(),events:[...events],focusCalls:[...focusCalls],inputs:[...inputs]};};
   for(const type of ['focus','blur','focusin','focusout'])root.shadow.addEventListener(type,event=>events.push({type,original:event.target===original,connected:event.target.isConnected,key:event.target.dataset.focusKey}),true);
   document.addEventListener('keydown',event=>inputs.push({at:performance.timeOrigin+performance.now(),key:event.key,trusted:event.isTrusted}),true);
   const focus=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(...args){if(!this.matches?.('.workspace'))return Reflect.apply(focus,this,args);const record={phase,original:this===original,documentHasFocus:document.hasFocus(),before:navigation.roots()?.workspace?.shadow.activeElement?.dataset.focusKey??null};const result=Reflect.apply(focus,this,args);record.accepted=navigation.roots()?.workspace?.shadow.activeElement===this;record.after=navigation.roots()?.workspace?.shadow.activeElement?.dataset.focusKey??null;focusCalls.push(record);return result;};
   original.focus({preventScroll:true});original.scrollTop=150;events.length=0;focusCalls.length=0;
   const refreshNow=()=>{phase='hidden-refresh';const retired=navigation.roots().workspace.scroller,before=snapshot();navigation.updateFrameProjection(project());refresh={before,after:snapshot(),replaced:navigation.roots().workspace.scroller!==retired,retiredConnected:retired.isConnected};phase='settled';};
   const cancel=mode=>{phase='after-'+mode;if(mode==='intent')navigation.present({kind:'show-working-set'});if(mode==='scope')navigation.invalidate('fixture-scope-revoked');cancellation={mode,at:performance.timeOrigin+performance.now(),after:snapshot()};};
   const observeVisiblePaint=()=>{
    const probe={hiddenFrames:0,hiddenSamples:[],firstVisible:null,afterFirstPaint:null};paint=probe;
    const sample=()=>{const current=snapshot();if(!current.visible){probe.hiddenSamples.push({at:current.at,rect:current.rect,scroll:current.scroll,visibility:current.visibility,hitSelf:current.hitSelf});if(++probe.hiddenFrames<24)requestAnimationFrame(sample);return;}probe.firstVisible=current;requestAnimationFrame(()=>{probe.afterFirstPaint=snapshot();});};
    // Register before the renderer's layout request to observe any earlier
    // callback in the same rAF batch. A nonzero box with computed visibility
    // hidden is not visible. Retain those samples; never discard a visible zero.
    requestAnimationFrame(sample);
   };
   const expireDuringRender=()=>{
    observeVisiblePaint();let clock=10000,crossing=null;const reads=[];Object.defineProperty(performance,'now',{configurable:true,value:()=>{reads.push(clock);return clock;}});
    refreshNow();const issued=refresh,ownerView=navigation.view(),ownerRoot=navigation.roots().workspace;clock=10999;
    const append=ownerRoot.shadow.append;ownerRoot.shadow.append=function(...nodes){
     if(nodes.some(node=>node.matches?.('.workspace'))){crossing={before:clock,at:performance.timeOrigin+realNow()};clock=11001;crossing.after=clock;}
     return Reflect.apply(append,this,nodes);
    };
    // The first hidden VIEW acquired a 1000ms ticket. The next passive VIEW
    // captures that ticket at 999ms, then the real DOM append crosses expiry.
    // Neither a new focus/input nor a scope/presentation change occurs.
    try{refreshNow();}finally{ownerRoot.shadow.append=append;}
    expiry={issued,borrowed:refresh,crossing,reads,sameView:navigation.view()===ownerView,sameRoot:navigation.roots().workspace===ownerRoot};
   };
   globalThis.rendererProbe={navigation,snapshot,refreshNow,cancel,observeVisiblePaint,expireDuringRender,refresh:()=>refresh,cancellation:()=>cancellation,paint:()=>paint,expiry:()=>expiry};
  });

 await frame.waitForFunction(()=>rendererProbe.navigation.view().scroll===150);
 // The public reading presentation still has a real zero-sized frame. Keep
 // the focus-ticket and initial-paint regressions on that supported path;
 // synchronous native-reading probes now retain an offscreen viewport instead.
 const runReadingWindow=(signal,mode=null)=>page.evaluate(({signal,mode})=>{
  const p=readingProbe;p.surface.showReading(p.handle);
  const start=performance.timeOrigin+performance.now(),released=p.frame.getBoundingClientRect().height===0,deadline=performance.now()+150;let nativeFocusedAt=null;
  if(signal)console.debug('VAIWL_TEST_NATIVE_READING_WINDOW');
  while(performance.now()<deadline){if(mode==='native-focus'&&nativeFocusedAt===null&&performance.timeOrigin+performance.now()>=start+100){p.native.focus({preventScroll:true});nativeFocusedAt=performance.timeOrigin+performance.now();}}
  const window={start,end:performance.timeOrigin+performance.now(),released},readingCurrent=readingModule.isNativeReadingCurrent(p.plan),reopened=mode!=='native-focus'&&p.surface.showWorkspace(p.handle);
  return {kind:'PUBLIC_READING_WINDOW',acceptedProbe:false,readingCurrent,reopened,window,nativeFocusedAt,activeFrame:document.activeElement===p.frame,nativeActive:document.activeElement===p.native,workspace:p.surface.visibility(p.handle).workspace};
 },{signal,mode});
 return {page,frame,runReadingWindow};
}
async function setupSearchRenderer(){
 const {page,frame}=await setup();await frame.addScriptTag({url:`chrome-extension://${extensionId}/renderer.js`});
 await frame.evaluate(()=>{
  document.documentElement.style.height='100%';document.body.style.cssText='height:100%;margin:0;overflow:hidden';const mount=document.createElement('div');mount.style.height='100%';document.body.replaceChildren(mount);
  const {createNavigation,freeNavigationSnapshot,projectFreeFrame,projectFreeSearch}=rendererModule,scope='search-input-timing',refs=Array.from({length:40},(_,i)=>{const id='70000000-0000-4000-8000-'+(i+1).toString(16).padStart(12,'0');return {id,scope,nativeTitle:'Synthetic chat '+i,nativeUrl:'https://chatgpt.com/c/'+id,membership:'NONE',projectId:null,activityDecision:{segment:0}};});
  const world={snapshot:freeNavigationSnapshot({scope,viewMode:'free',revision:1,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},refs,projects:[]})};
  let query={role:'workspace',list:'noProject',rowOffset:0,rowLimit:41,search:{query:'Synthetic chat',projectId:null,offset:0,limit:24}},original=null,nextId=0;const nodeIds=new WeakMap(),events=[],requests=[],responses=[];
  const id=node=>{if(!node)return null;if(!nodeIds.has(node))nodeIds.set(node,++nextId);return nodeIds.get(node);},now=()=>performance.timeOrigin+performance.now();
  const project=next=>{const {search,...frameQuery}=next,value=projectFreeFrame(world,frameQuery);if(search!==undefined)value.search=projectFreeSearch(world,search);return value;};
  const navigation=createNavigation({document,surface:{role:'workspace',root:mount},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){},nativeHref:url=>url,navigationPlan:()=>null},onProjectionRequest(next){query=structuredClone(next);requests.push({at:now(),query:next.search?.query??null});return new Promise(resolve=>responses.push(()=>resolve(project(next))));}});
  navigation.updateFrameProjection(project(query));
  const pane=()=>navigation.roots().workspace,input=()=>pane().shadow.querySelector('[data-focus-key="search-input"]');
  const snapshot=()=>{const current=input(),page=pane().scroller,rect=current.getBoundingClientRect();return {at:now(),currentId:id(current),originalId:id(original),sameInput:current===original,originalConnected:original?.isConnected??null,currentConnected:current.isConnected,value:current.value,start:current.selectionStart,end:current.selectionEnd,focused:pane().shadow.activeElement===current,documentHasFocus:document.hasFocus(),documentActive:document.activeElement?.tagName,shadowActive:pane().shadow.activeElement?.dataset.focusKey??null,rect:{width:rect.width,height:rect.height},visibility:getComputedStyle(current).visibility,pageVisibility:getComputedStyle(page).visibility,loading:pane().shadow.textContent.includes('正在查找已知记录'),empty:pane().shadow.textContent.includes('没有找到已知记录'),rowCount:pane().shadow.querySelectorAll('.search-results .row').length,scroll:page.scrollTop,windowScroll:{x:scrollX,y:scrollY},events:[...events],requests:[...requests],responses:responses.length};};
  for(const type of ['focus','blur','focusin','focusout','beforeinput','input'])pane().shadow.addEventListener(type,event=>{const target=event.composedPath()[0];events.push({at:now(),type,trusted:event.isTrusted,targetId:id(target),original:target===original,current:target===input(),connected:target.isConnected,value:target instanceof HTMLInputElement?target.value:null,inputType:event.inputType??null,data:event.data??null});},true);
  globalThis.searchProbe={navigation,snapshot,prepare(){original=input();original.focus({preventScroll:true});original.setSelectionRange(0,original.value.length);events.length=0;requests.length=0;return snapshot();},refresh(){const before=snapshot();navigation.updateFrameProjection({...project(query),compactRows:false});return {before,after:snapshot()};},releaseResponses(){for(const response of responses.splice(0))response();}};
 });
 await frame.waitForFunction(()=>searchProbe.snapshot().rowCount===24&&!searchProbe.snapshot().loading);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const before=await frame.evaluate(()=>searchProbe.prepare());
 const runProbe=(duration=150)=>page.evaluate(duration=>{
  const p=readingProbe,frame=p.frame,frameWindow=frame.contentWindow,sideWindow=p.sidebar.contentWindow,originalStyle=frame.parentElement.getAttribute('style');let window=null;
  const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const measure=()=>{const f=rect(frame),r=rect(p.plan.reading),left=Math.max(0,r.x),top=Math.max(0,r.y),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom),hit=right>left&&bottom>top?document.elementFromPoint((left+right)/2,(top+bottom)/2):null;return {frame:f,offscreen:f.right<=-1,receipt:p.surface.isReadingProbeSurface(frame.parentElement),nativeCurrent:readingModule.isNativeReadingCurrent(p.plan),nativeUnmasked:!p.surface.isMasked(p.plan.reading),readingVisible:getComputedStyle(p.plan.reading).visibility==='visible',readingHit:!!hit&&(hit===p.plan.reading||p.plan.reading.contains(hit)),nativeScroll:p.port.scrollTop,windowScroll:{x:scrollX,y:scrollY}};};
  const before=measure(),parent=frame.parentElement.parentElement,next=frame.parentElement.nextSibling;p.surrendered.length=0;const sheet=document.querySelector(`style[data-va-owned="${p.handle.id}"]`).sheet,rules=[...sheet.cssRules],canonical=rules.map(rule=>rule.cssText),mutations=[];const observer=new MutationObserver(records=>mutations.push(...records));observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  const value=p.surface.withNativeReading(p.handle,()=>{const start=performance.timeOrigin+performance.now(),before=measure(),deadline=performance.now()+duration;console.debug('VAIWL_TEST_SEARCH_INPUT_WINDOW');while(performance.now()<deadline){}const after=measure();window={start,end:performance.timeOrigin+performance.now(),before,after};return after.nativeCurrent;},()=>p.authority.allowed);
  mutations.push(...observer.takeRecords());observer.disconnect();const cssomRestored=rules.length===sheet.cssRules.length&&rules.every((rule,index)=>sheet.cssRules[index]===rule&&rule.cssText===canonical[index]);
  return {value,acceptedProbe:value===true,cssomRestored,ownedMovesOnly:mutations.length===4&&mutations.every(record=>record.type==='childList'&&[parent,document.body].includes(record.target)&&[...record.addedNodes,...record.removedNodes].length===1&&[...record.addedNodes,...record.removedNodes][0]===frame.parentElement),positionRestored:frame.parentElement.parentElement===parent&&frame.parentElement.nextSibling===next,parentMutations:mutations.map(record=>({type:record.type,attribute:record.attributeName})),before,window,after:measure(),workspace:p.surface.visibility(p.handle).workspace,sidebar:p.surface.visibility(p.handle).sidebar,activeFrame:document.activeElement===frame,sameFrame:p.frame===frame&&frame.contentWindow===frameWindow,sameSidebar:p.sidebar.contentWindow===sideWindow,styleRestored:frame.parentElement.getAttribute('style')===originalStyle,nativeDraftUnchanged:p.native.value===p.nativeValue,surrenders:p.surrendered};
 },duration);
 return {page,frame,before,runProbe};
}

try{
 browserHandle=await launchNativeVisibilityBrowser({chromium,profileDir:join(dir,'profile'),headed:false,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Users/hhf/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing':'/usr/bin/chromium'),historicalNetworkGuard:network.config});context=browserHandle.context;report.browserPrecondition=browserHandle.diagnostic;
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 report.browserVersion=context.browser().version();report.viewports.push({width:1400,height:900});
 const cdp=await context.browser().newBrowserCDPSession();({id:extensionId}=await cdp.send('Extensions.loadUnpacked',{path:extension}));

 {
  const {page}=await setup();
  const result=await page.evaluate(()=>{
   const p=readingProbe;p.surface.showReading(p.handle);const inspection=p.adapter.inspect(),box=inspection.returnSlot,button=document.createElement('button');
   button.type='button';button.textContent='Return';button.style.cssText='box-sizing:border-box;margin:0;padding:0;position:fixed;border:0;border-radius:9px;background:transparent;z-index:30;pointer-events:auto';
   Object.assign(button.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});document.body.append(button);p.surface.setReturnControl(p.handle,button);p.adapter.setReturnControl(button);
   const registered=readingModule.isNativeReadingCurrent(p.plan);button.style.left='0px';const displaced=readingModule.isNativeReadingCurrent(p.plan);button.style.left=box.x+'px';
   const restored=readingModule.isNativeReadingCurrent(p.plan),copy=button.cloneNode(true);button.remove();document.body.append(copy);p.surface.setReturnControl(p.handle,copy);const copied=readingModule.isNativeReadingCurrent(p.plan);
   return {ok:inspection.returnPlacement==='header-gap'&&registered&&!displaced&&restored&&!copied,registered,displaced,restored,copied};
  });
  check('native reading accepts only the registered header-gap return control with fresh geometry',result);await page.close();
 }

 for(const mode of ['retained-input','fresh-view-input','keyboard-transition-input']){
  const {page,frame,before,runProbe}=await setupSearchRenderer(),text=mode==='keyboard-transition-input'?'UI10 definitely absent query '+('x'.repeat(171)):'UI10 definitely absent query';
  const inputTask=page.waitForEvent('console',{predicate:message=>message.text()==='VAIWL_TEST_SEARCH_INPUT_WINDOW',timeout:2000}).then(async()=>{
   // Force a real non-search presentation change. Result-only replies now
   // preserve the input; this counterexample must still exercise replacement.
   const rebuild=mode==='fresh-view-input'?await frame.evaluate(()=>searchProbe.refresh()):null;
   // One paced keystroke stream crosses both ends of the fixed 150ms probe.
   // Assert actual event overlap below; do not refocus or retry missing text.
   const beforeInsert=await frame.evaluate(()=>searchProbe.snapshot());if(mode==='keyboard-transition-input')await page.keyboard.type(text,{delay:1});else await page.keyboard.insertText(text);const afterInsert=await frame.evaluate(()=>searchProbe.snapshot());return {rebuild,beforeInsert,afterInsert};
  });
  const [host,attempt]=await Promise.all([runProbe(150),inputTask]);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const afterReopen=await frame.evaluate(()=>searchProbe.snapshot());
  await frame.evaluate(()=>searchProbe.releaseResponses());await frame.waitForFunction(()=>!searchProbe.snapshot().loading,{},{timeout:2000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const settled=await frame.evaluate(()=>searchProbe.snapshot());
  const overlap=mode==='keyboard-transition-input'?settled.events.some(event=>event.type==='input'&&event.at>=host.window.start&&event.at<host.window.end)&&settled.events.some(event=>event.type==='input'&&event.at>host.window.end):attempt.beforeInsert.at>=host.window.start&&attempt.afterInsert.at<=host.window.end;
  const initial=before.focused&&before.documentHasFocus&&before.value==='Synthetic chat'&&before.start===0&&before.end===before.value.length&&!before.loading&&before.rowCount===24;
  const identity=mode!=='fresh-view-input'?attempt.beforeInsert.sameInput&&attempt.beforeInsert.originalConnected:!attempt.beforeInsert.sameInput&&!attempt.beforeInsert.originalConnected&&attempt.rebuild.before.sameInput;
  const readable=host.acceptedProbe&&host.value===true&&[host.window.before,host.window.after].every(sample=>sample.receipt&&sample.offscreen&&sample.nativeCurrent&&sample.nativeUnmasked&&sample.readingVisible&&sample.readingHit&&sample.frame.width===host.before.frame.width&&sample.frame.height===host.before.frame.height&&sample.nativeScroll===host.before.nativeScroll);
  const restored=host.workspace&&host.sidebar&&host.activeFrame&&host.sameFrame&&host.sameSidebar&&host.styleRestored&&host.cssomRestored&&host.ownedMovesOnly&&host.positionRestored&&!host.after.receipt&&host.nativeDraftUnchanged&&host.surrenders.length===0&&JSON.stringify(host.before.frame)===JSON.stringify(host.after.frame)&&JSON.stringify(host.before.windowScroll)===JSON.stringify(host.after.windowScroll)&&host.before.nativeScroll===host.after.nativeScroll&&before.scroll===afterReopen.scroll&&JSON.stringify(before.windowScroll)===JSON.stringify(afterReopen.windowScroll);
  const inputEvents=settled.events.filter(event=>['beforeinput','input'].includes(event.type)),delivered=attempt.beforeInsert.focused&&attempt.beforeInsert.documentHasFocus&&attempt.beforeInsert.start===0&&attempt.beforeInsert.end===before.value.length&&attempt.beforeInsert.rect.width>0&&attempt.beforeInsert.rect.height>0&&attempt.afterInsert.value===text&&attempt.afterInsert.focused&&afterReopen.value===text&&afterReopen.focused&&settled.value===text&&settled.focused&&!settled.loading&&settled.rowCount===0&&settled.requests.length===(mode==='keyboard-transition-input'?text.length:1)&&settled.requests.at(-1).query===text&&inputEvents.length===(mode==='keyboard-transition-input'?text.length*2:2)&&inputEvents.every((event,index)=>event.type===(index%2?'input':'beforeinput')&&event.trusted&&event.current&&event.connected&&event.targetId===attempt.beforeInsert.currentId&&event.data===(mode==='keyboard-transition-input'?text[Math.floor(index/2)]:text)&&event.inputType==='insertText');
  check('accepted native reading probe preserves one real search input delivery: '+mode,{ok:initial&&identity&&overlap&&readable&&restored&&delivered,initial,identity,overlap,readable,restored,delivered,inputOperation:mode==='keyboard-transition-input'?'ONE_KEYBOARD_TYPE_NO_REFOCUS':'ONE_INSERT_TEXT_NO_REFOCUS',before,host,attempt,afterReopen,settled,inputEvents});await frame.evaluate(()=>searchProbe.navigation.stop());await page.close();
 }
 for(const mode of ['unsupported-move','initial-throw','moved-then-throw','restore-throw','restore-native-mutation','next-replaced','extra-slot-child']){
  const {page}=await setup();
  const result=await page.evaluate(mode=>{
   const p=readingProbe,node=p.frame.parentElement,parent=node.parentNode,next=node.nextSibling,body=document.body,frame=p.frame,window=frame.contentWindow,rule=document.querySelector(`style[data-va-owned="${p.handle.id}"]`).sheet.cssRules;
   const originalRules=[...rule].map(r=>r.cssText),originalMove=Element.prototype.moveBefore;let reads=0,moves=0;
   if(mode==='unsupported-move')body.moveBefore=undefined;
   if(mode==='initial-throw')body.moveBefore=()=>{throw Error('synthetic-initial-move-failure');};
   if(mode==='moved-then-throw')body.moveBefore=function(...args){moves++;Reflect.apply(originalMove,this,args);throw Error('synthetic-after-move-failure');};
   if(mode==='restore-throw')parent.moveBefore=()=>{moves++;throw Error('synthetic-restore-failure');};
   if(mode==='restore-native-mutation')parent.moveBefore=function(...args){moves++;Reflect.apply(originalMove,this,args);p.native.setAttribute('data-synthetic-move-mutation','1');};
   if(mode==='extra-slot-child')node.append(document.createElement('span'));
   const value=p.surface.withNativeReading(p.handle,()=>{reads++;if(mode==='next-replaced')next.replaceWith(next.cloneNode(true));return 'must-not-escape';},()=>true);
   const visible=p.surface.visibility(p.handle),position=node.parentNode===parent&&node.nextSibling===next,rect=frame.getBoundingClientRect(),cssomRestored=JSON.stringify([...rule].map(r=>r.cssText))===JSON.stringify(originalRules),unchanged=['unsupported-move','extra-slot-child'].includes(mode);
   return {ok:value===null&&reads===(['restore-throw','restore-native-mutation','next-replaced'].includes(mode)?1:0)&&cssomRestored&&visible?.workspace===unchanged&&!p.surface.isReadingProbeSurface(node)&&frame===p.frame&&window===frame.contentWindow&&p.native.value===p.nativeValue&&(unchanged||['restore-throw','next-replaced'].includes(mode)?unchanged?position:rect.width===0&&rect.height===0:position),mode,value,reads,moves,position,cssomRestored,workspace:visible?.workspace,finalFrame:{width:rect.width,height:rect.height},nativeDraftUnchanged:p.native.value===p.nativeValue,surrenders:p.surrendered};
  },mode);
  check('atomic reading move fails closed: '+mode,result);await page.close();
 }
 {
  const {page}=await setup();
  const result=await page.evaluate(()=>{const p=readingProbe,node=p.frame.parentElement;node.setAttribute('data-va-reading-probe',p.handle.id);const forgedReceipt=p.surface.isReadingProbeSurface(node);node.removeAttribute('data-va-reading-probe');
   const before=p.surface.isReadingProbeSurface(node),value=p.surface.withNativeReading(p.handle,()=>{const fake=node.cloneNode(false);fake.setAttribute('data-va-reading-probe',p.handle.id);return {real:p.surface.isReadingProbeSurface(node),fake:p.surface.isReadingProbeSurface(fake),native:p.surface.isReadingProbeSurface(p.plan.reading),otherOwned:p.surface.isReadingProbeSurface(p.sidebar.parentElement),frame:p.surface.isReadingProbeSurface(p.frame),source:readingModule.isNativeReadingCurrent(p.plan)};},()=>true),after=p.surface.isReadingProbeSurface(node);
   return {ok:forgedReceipt===false&&before===false&&value?.real===true&&value.source===true&&['fake','native','otherOwned','frame'].every(key=>value[key]===false)&&after===false&&node.getAttribute('style')===p.originalWorkspaceStyle,forgedReceipt,before,value,after};});
  check('reading-probe receipt is exact-node and transaction scoped, never an attribute capability',result);await page.close();
 }
 for(const mode of ['onscreen','rule-tamper','frame-tamper','native-forged-attribute']){
  const {page}=await setup();
  const result=await page.evaluate(mode=>{const p=readingProbe,node=p.frame.parentElement,exit=document.getElementById(p.handle.id+'_workspace_exit'),sheet=document.querySelector(`style[data-va-owned="${p.handle.id}"]`).sheet,rule=sheet.cssRules[sheet.cssRules.length-1],canonical=rule.cssText;let reads=0,before=null,after=null,sourceAfter=null,probeGeometry=null;
   const originalRect=node.getBoundingClientRect;node.getBoundingClientRect=function(...args){const r=Reflect.apply(originalRect,this,args);if(rule.media.mediaText==='all')probeGeometry={x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,switchOpen:exit.matches(':popover-open')};return r;};
   // Higher specificity really puts the private slot onscreen, without
   // changing its exact owned CSSOM rule or any native node. The measured
   // receipt-time rect is part of the oracle, not an assumed CSS effect.
   if(mode==='onscreen'){const style=document.createElement('style');style.textContent=`html body #${node.id}#${node.id}#${node.id}{left:0!important}`;document.head.append(style);}
   const value=p.surface.withNativeReading(p.handle,()=>{reads++;before=p.surface.isReadingProbeSurface(node);if(mode==='rule-tamper')rule.cssRules[0].style.setProperty('outline-color','red');if(mode==='frame-tamper')p.frame.setAttribute('srcdoc','<p>Synthetic frame replacement</p>');if(mode==='native-forged-attribute')p.plan.reading.setAttribute('data-va-reading-probe',p.handle.id);after=p.surface.isReadingProbeSurface(mode==='native-forged-attribute'?p.plan.reading:node);sourceAfter=readingModule.isNativeReadingCurrent(p.plan);return 'must-not-escape';},()=>true);
   const cssomRestored=sheet.cssRules[sheet.cssRules.length-1]===rule&&rule.cssText===canonical,visibility=p.surface.visibility(p.handle),closed=!exit.matches(':popover-open')&&(mode==='frame-tamper'?visibility===null:visibility?.workspace===false);
   return {ok:value===null&&reads===(mode==='onscreen'?0:1)&&(mode==='onscreen'?probeGeometry?.x===0&&probeGeometry.right>0&&probeGeometry.switchOpen===true:before===true&&after===false)&&closed&&!p.surface.isReadingProbeSurface(node)&&cssomRestored&&node.getAttribute('style')===p.originalWorkspaceStyle&&p.native.value===p.nativeValue,mode,value,reads,before,after,sourceAfter,probeGeometry,closed,visibility,cssomRestored,styleRestored:node.getAttribute('style')===p.originalWorkspaceStyle};
  },mode);
  check('reading-probe receipt refuses '+mode,result);await page.close();
 }
 {
  const {page}=await setup();
  const result=await page.evaluate(()=>{
   const p=readingProbe,node=p.frame.parentElement,exit=document.getElementById(p.handle.id+'_workspace_exit'),ownedStyle=document.querySelector(`style[data-va-owned="${p.handle.id}"]`),canonicalText=ownedStyle.textContent,canonicalRules=[...ownedStyle.sheet.cssRules].map(rule=>rule.cssText),nativeNodes=[p.plan.reading,p.plan.composer,p.plan.header],nativeStyles=nativeNodes.map(node=>node.getAttribute('style')),mutations=[];
   const observer=new MutationObserver(records=>mutations.push(...records));observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});let reads=0,beforeReceipt=null,afterReceipt=null,sourceAfter=null,attack=null;
   const value=p.surface.withNativeReading(p.handle,()=>{
    reads++;beforeReceipt=p.surface.isReadingProbeSurface(node);const sheet=ownedStyle.sheet,index=sheet.cssRules.length-1,original=sheet.cssRules[index],activeCopy=original.cssText;
    sheet.deleteRule(index);sheet.insertRule(activeCopy,index);const replacement=sheet.cssRules[index];replacement.cssRules[0].style.setProperty('left','0px','important');
    const rect=p.frame.getBoundingClientRect();attack={replaced:replacement!==original,media:replacement.media.mediaText,x:rect.x,width:rect.width,height:rect.height};afterReceipt=p.surface.isReadingProbeSurface(node);sourceAfter=readingModule.isNativeReadingCurrent(p.plan);return 'must-not-escape';
   },()=>true);
   mutations.push(...observer.takeRecords());observer.disconnect();const restoredRules=[...ownedStyle.sheet.cssRules],rect=p.frame.getBoundingClientRect(),style=getComputedStyle(node),closed=!exit.matches(':popover-open')&&p.surface.visibility(p.handle)?.workspace===false,privateZero=rect.width===0&&rect.height===0,privateNonvisible=style.display==='none'||style.visibility==='hidden',canonicalRestored=ownedStyle.textContent===canonicalText&&JSON.stringify(restoredRules.map(rule=>rule.cssText))===JSON.stringify(canonicalRules)&&restoredRules.at(-1).media.mediaText==='not all',receiptAfter=p.surface.isReadingProbeSurface(node),onlyOwnedRestored=mutations.every(record=>(record.target===ownedStyle||record.target.parentNode===ownedStyle)&&['childList','characterData'].includes(record.type)||record.type==='childList'&&[...record.addedNodes,...record.removedNodes].length===1&&[...record.addedNodes,...record.removedNodes][0]===node)&&nativeNodes.every((node,index)=>node.getAttribute('style')===nativeStyles[index]);
   return {ok:value===null&&reads===1&&beforeReceipt===true&&afterReceipt===false&&sourceAfter===false&&attack?.replaced&&attack.media==='all'&&attack.x===0&&attack.width>0&&attack.height>0&&closed&&privateZero&&privateNonvisible&&canonicalRestored&&receiptAfter===false&&onlyOwnedRestored&&p.native.value===p.nativeValue,value,reads,beforeReceipt,afterReceipt,sourceAfter,attack,closed,privateZero,privateNonvisible,canonicalRestored,receiptAfter,onlyOwnedRestored,parentMutations:mutations.map(record=>({type:record.type,ownedSheet:record.target===ownedStyle})),finalFrame:{width:rect.width,height:rect.height},finalDisplay:style.display,finalVisibility:style.visibility};
  });
  check('replaced active CSSOM rule cannot outlive a rejected native reading probe',result);await page.close();
 }
 {
  const {page,frame,runReadingWindow}=await setupRenderer(),before=await frame.evaluate(()=>rendererProbe.snapshot());
  const controlHost=await runReadingWindow(false);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const control=await frame.evaluate(()=>rendererProbe.snapshot());
  check('actual renderer keeps its original workspace focus through a public reading return without a VIEW rebuild',{ok:before.focused&&before.documentHasFocus&&control.focused&&control.documentHasFocus&&control.sameNode&&control.originalConnected&&control.scroll===150&&control.events.length===0&&controlHost.readingCurrent&&controlHost.reopened&&controlHost.window.released&&controlHost.activeFrame&&controlHost.workspace,before,control,host:controlHost});
  // The fixed console marker crosses the test transport while the parent's
  // bounded public-reading presentation window is still running. Execute the separate extension frame's
  // VIEW task only after that marker, then prove the overlap with timestamps.
  const refreshTask=page.waitForEvent('console',{predicate:message=>message.text()==='VAIWL_TEST_NATIVE_READING_WINDOW',timeout:2000}).then(()=>frame.evaluate(()=>{rendererProbe.observeVisiblePaint();rendererProbe.refreshNow();}));
  const [refreshedHost]=await Promise.all([runReadingWindow(true),refreshTask]);await frame.waitForFunction(()=>rendererProbe.paint()?.afterFirstPaint!==null,{},{timeout:2000});const refreshed=await frame.evaluate(()=>({refresh:rendererProbe.refresh(),paint:rendererProbe.paint(),settled:rendererProbe.snapshot()}));
  const overlap=refreshed.refresh.before.at>=refreshedHost.window.start&&refreshed.refresh.after.at<=refreshedHost.window.end;
  const clickSetup=await frame.evaluate(()=>{const pane=rendererProbe.navigation.roots().workspace,page=pane.scroller,control=pane.shadow.querySelector('[data-focus-key="workspace-settings"]');globalThis.workspaceClicks=[];page.addEventListener('click',event=>workspaceClicks.push({trusted:event.isTrusted,current:event.target===page}),{once:true});control.focus({preventScroll:true});return {otherFocused:pane.shadow.activeElement===control,beforeClick:rendererProbe.snapshot()};});
  await frame.locator('.workspace').click({position:{x:8,y:8}});
  const interaction={...clickSetup,...await frame.evaluate(()=>({clicks:workspaceClicks,afterClick:rendererProbe.snapshot()}))};
  const hiddenUntilLayout=!refreshed.refresh.after.visible&&refreshed.refresh.after.visibility==='hidden'&&refreshed.refresh.after.styleVisibility==='hidden'&&!refreshed.refresh.after.hitSelf&&refreshed.paint.hiddenSamples.every(sample=>!sample.hitSelf);
  const visibleAndInteractive=refreshed.paint.firstVisible.visible&&refreshed.paint.firstVisible.visibility==='visible'&&refreshed.paint.firstVisible.styleVisibility===''&&refreshed.paint.firstVisible.hitSelf&&refreshed.paint.afterFirstPaint.visible&&refreshed.settled.visible&&interaction.otherFocused&&interaction.beforeClick.scroll===150&&interaction.clicks.length===1&&interaction.clicks[0].trusted&&interaction.clicks[0].current&&interaction.afterClick.focused&&interaction.afterClick.documentHasFocus&&interaction.afterClick.visible&&interaction.afterClick.scroll===150&&interaction.afterClick.modelScroll===150;
  check('actual renderer restores workspace focus and scroll by the first visible paint after a VIEW rebuild inside a public reading window',{ok:overlap&&hiddenUntilLayout&&visibleAndInteractive&&refreshed.refresh.before.focused&&refreshed.refresh.before.documentHasFocus&&!refreshed.settled.sameNode&&!refreshed.settled.originalConnected&&refreshed.settled.currentConnected&&refreshed.settled.documentHasFocus&&refreshed.settled.focused&&refreshed.settled.scroll===150&&refreshed.settled.modelScroll===150&&refreshed.paint.firstVisible.scroll===150&&refreshed.paint.afterFirstPaint.scroll===150&&refreshed.paint.firstVisible.rect.width===before.rect.width&&refreshed.paint.firstVisible.rect.height===before.rect.height&&refreshed.paint.firstVisible.at>=refreshedHost.window.end&&refreshedHost.readingCurrent&&refreshedHost.reopened&&refreshedHost.window.released&&refreshedHost.activeFrame&&refreshedHost.workspace,overlap,hiddenUntilLayout,visibleAndInteractive,interaction,host:refreshedHost,...refreshed});
  await frame.evaluate(()=>rendererProbe.navigation.stop());await page.close();
 }
 {
  const {page,frame,runReadingWindow}=await setupRenderer();
  const refreshTask=page.waitForEvent('console',{predicate:message=>message.text()==='VAIWL_TEST_NATIVE_READING_WINDOW',timeout:2000}).then(()=>frame.evaluate(()=>rendererProbe.expireDuringRender()));
  const [host]=await Promise.all([runReadingWindow(true),refreshTask]);await frame.waitForFunction(()=>rendererProbe.paint()?.afterFirstPaint!==null,{},{timeout:2000});
  const result=await frame.evaluate(()=>({expiry:rendererProbe.expiry(),paint:rendererProbe.paint(),settled:rendererProbe.snapshot()})),{issued,borrowed,crossing,reads,sameView,sameRoot}=result.expiry;
  const overlap=issued.before.at>=host.window.start&&borrowed.after.at<=host.window.end;
  const issuedTicket=issued.before.focused&&issued.before.documentHasFocus&&issued.replaced&&!issued.retiredConnected&&!issued.after.focused&&issued.after.documentHasFocus&&issued.after.rect.height===0&&!issued.after.visible&&issued.after.visibility==='hidden'&&issued.after.focusCalls.length===2&&issued.after.focusCalls.every(call=>!call.accepted);
  const crossedAfterCapture=reads[0]===10000&&reads[1]===10999&&reads[2]===11001&&crossing.before===10999&&crossing.after===11001&&crossing.at>=borrowed.before.at&&crossing.at<=borrowed.after.at;
  check('borrowed renderer focus expires during passive VIEW rendering without renewing its deadline',{ok:overlap&&issuedTicket&&crossedAfterCapture&&sameView&&sameRoot&&host.readingCurrent&&host.reopened&&host.workspace&&host.activeFrame&&borrowed.replaced&&!borrowed.retiredConnected&&borrowed.after.focusCalls.length===issued.after.focusCalls.length&&!result.settled.focused&&result.settled.documentHasFocus&&result.settled.currentConnected&&result.settled.inputs.length===0&&result.settled.focusCalls.length===issued.after.focusCalls.length&&result.settled.scroll===150&&result.settled.modelScroll===150&&result.paint.firstVisible.visible&&result.paint.firstVisible.visibility==='visible'&&result.paint.firstVisible.hitSelf&&result.paint.firstVisible.scroll===150&&result.paint.afterFirstPaint.visible&&result.paint.afterFirstPaint.scroll===150,overlap,issuedTicket,crossedAfterCapture,host,...result});
  await frame.evaluate(()=>rendererProbe.navigation.stop());await page.close();
 }
 for(const mode of ['input','intent','scope','native-focus']){
  const {page,frame,runReadingWindow}=await setupRenderer();
  const refreshTask=page.waitForEvent('console',{predicate:message=>message.text()==='VAIWL_TEST_NATIVE_READING_WINDOW',timeout:2000}).then(async()=>{
   await frame.evaluate(mode=>{rendererProbe.refreshNow();rendererProbe.cancel(mode);},mode);
   if(mode==='input')await page.keyboard.press('ArrowDown');
  });
  const [host]=await Promise.all([runReadingWindow(true,mode),refreshTask]);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const result=await frame.evaluate(()=>({refresh:rendererProbe.refresh(),cancellation:rendererProbe.cancellation(),settled:rendererProbe.snapshot()}));
  const overlap=result.refresh.before.at>=host.window.start&&result.refresh.after.at<=host.window.end&&result.cancellation.at<=host.window.end;
  const pendingCandidate=result.refresh.before.focused&&result.refresh.before.documentHasFocus&&result.refresh.replaced&&!result.refresh.retiredConnected&&!result.refresh.after.focused&&result.refresh.after.documentHasFocus&&result.refresh.after.rect.height===0&&result.refresh.after.focusCalls.some(call=>call.phase==='hidden-refresh'&&!call.accepted);
  let boundary=host.readingCurrent&&host.reopened&&host.workspace&&result.settled.documentHasFocus;
  if(mode==='input')boundary&&=result.settled.inputs.some(input=>input.key==='ArrowDown'&&input.trusted&&input.at>=result.refresh.after.at&&input.at<host.window.end);
  if(mode==='intent')boundary&&=result.settled.workset===true;
  if(mode==='scope')boundary&&=!result.settled.rootsPresent;
  if(mode==='native-focus'){
   // This real host focus occurs after a pending child restore. Leave the
   // public reading presentation open, then verify an explicit return cannot
   // steal that native focus.
   boundary=host.readingCurrent&&!host.reopened&&!host.workspace&&host.nativeActive&&host.nativeFocusedAt>result.refresh.after.at&&host.nativeFocusedAt<host.window.end&&!result.settled.documentHasFocus;
   const resumed=await page.evaluate(()=>{const p=readingProbe;return {opened:p.surface.showWorkspace(p.handle),nativeActive:document.activeElement===p.native};});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   result.resumed={host:resumed,child:await frame.evaluate(()=>rendererProbe.snapshot())};
   boundary&&=resumed.opened&&resumed.nativeActive&&!result.resumed.child.focused&&!result.resumed.child.documentHasFocus;
  }
  check('pending renderer workspace focus is cancelled by '+mode,{ok:overlap&&pendingCandidate&&boundary&&!result.settled.focused&&result.settled.focusCalls.filter(call=>call.phase!=='hidden-refresh').every(call=>!call.accepted),overlap,pendingCandidate,host,...result});
  await frame.evaluate(()=>rendererProbe.navigation.stop());await page.close();
 }
 {
  const {page,frame}=await setup();
  const before=await frame.evaluate(()=>{
   document.documentElement.style.height='100%';document.body.style.cssText='height:100%;margin:0;overflow:hidden';
   const host=document.createElement('section');host.id='workspace-div-host';host.style.cssText='display:block;height:100%';document.body.replaceChildren(host);
   const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),workspace=document.createElement('div'),content=document.createElement('div');
   style.textContent=':host{display:block;height:100%}.workspace{box-sizing:border-box;height:100%;overflow:auto;padding:24px 24px 36px;position:relative;container-type:inline-size}';
   workspace.className='workspace';workspace.tabIndex=-1;workspace.dataset.focusKey='workspace';content.style.height='2200px';content.textContent='Synthetic workspace content';workspace.append(content);shadow.append(style,workspace);
   const events=[];for(const type of ['focus','blur','focusin','focusout'])shadow.addEventListener(type,event=>events.push({type,target:event.target.className||event.target.tagName}),true);
   let mutations=0;const observer=new MutationObserver(records=>{mutations+=records.length;});observer.observe(shadow,{subtree:true,childList:true});
   globalThis.workspaceDivProbe={host,shadow,workspace,observer,snapshot:()=>({sameNode:shadow.querySelector('.workspace')===workspace,connected:workspace.isConnected,focused:shadow.activeElement===workspace,documentHasFocus:document.hasFocus(),documentActive:document.activeElement?.id||document.activeElement?.tagName,shadowActive:shadow.activeElement?.className??null,scroll:workspace.scrollTop,rect:{width:workspace.getBoundingClientRect().width,height:workspace.getBoundingClientRect().height},events:[...events],mutations:mutations+=observer.takeRecords().length})};
   workspace.focus({preventScroll:true});workspace.scrollTop=150;events.length=0;return workspaceDivProbe.snapshot();
  });
  const host=await page.evaluate(()=>{
   const p=readingProbe,frame=p.frame,window=frame.contentWindow,values=[];p.surrendered.length=0;
   for(let index=0;index<3;index++)values.push(p.surface.withNativeReading(p.handle,()=>({nativeCurrent:readingModule.isNativeReadingCurrent(p.plan),readingVisible:getComputedStyle(p.plan.reading).visibility==='visible',privateViewportRetained:frame.getBoundingClientRect().height>0&&frame.getBoundingClientRect().width>0,privateOffscreen:frame.getBoundingClientRect().right<=-1,probeReceipt:p.surface.isReadingProbeSurface(frame.parentElement),nativeUnmasked:!p.surface.isMasked(p.plan.reading)}),()=>p.authority.allowed));
   return {values,sameFrame:p.frame===frame&&frame.contentWindow===window,activeFrame:document.activeElement===frame,workspace:p.surface.visibility(p.handle).workspace,surrenders:p.surrendered};
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const after=await frame.evaluate(()=>workspaceDivProbe.snapshot());
  check('three native reading probes preserve the original focused percentage-height workspace DIV',{ok:before.focused&&before.documentHasFocus&&before.scroll===150&&after.sameNode&&after.connected&&after.focused&&after.documentHasFocus&&after.documentActive===before.documentActive&&after.shadowActive===before.shadowActive&&after.scroll===before.scroll&&after.events.length===0&&after.mutations===0&&host.sameFrame&&host.activeFrame&&host.workspace&&host.surrenders.length===0&&host.values.length===3&&host.values.every(value=>value&&Object.values(value).every(Boolean)),host,before,after});await page.close();
 }
 {
  const {page,frame}=await setup(),before=await frame.evaluate(()=>snapshot());
  const host=await page.evaluate(()=>{
   const p=readingProbe,sideWindow=p.sidebar.contentWindow,values=[];p.surrendered.length=0;
   for(let index=0;index<3;index++)values.push(p.surface.withNativeReading(p.handle,()=>({nativeCurrent:readingModule.isNativeReadingCurrent(p.plan),readingVisible:getComputedStyle(p.plan.reading).visibility==='visible',privateViewportRetained:p.frame.getBoundingClientRect().height>0&&p.frame.getBoundingClientRect().width>0,privateOffscreen:p.frame.getBoundingClientRect().right<=-1,probeReceipt:p.surface.isReadingProbeSurface(p.frame.parentElement),nativeUnmasked:!p.surface.isMasked(p.plan.reading),sidebarOpen:p.surface.visibility(p.handle).sidebar}),()=>p.authority.allowed));
   return {values,activeFrame:document.activeElement===p.frame,workspace:p.surface.visibility(p.handle).workspace,sidebar:p.surface.visibility(p.handle).sidebar,sameSidebar:p.sidebar===p.surface.frames(p.handle).find(item=>item.role==='sidebar').frame&&sideWindow===p.sidebar.contentWindow,nativeScroll:p.port.scrollTop,sourceCalls:p.authority.calls,surrenders:p.surrendered};
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const after=await frame.evaluate(()=>snapshot());
  check('visible workspace probes retain focused frame, selection, draft, scroll and sidebar',{ok:before.focused&&before.documentHasFocus&&JSON.stringify(after)===JSON.stringify(before)&&host.activeFrame&&host.workspace&&host.sidebar&&host.sameSidebar&&host.nativeScroll===0&&host.sourceCalls>=6&&host.surrenders.length===0&&host.values.length===3&&host.values.every(value=>value&&Object.values(value).every(Boolean)),host,before,after});
  await page.keyboard.type('Z');const typed=await frame.evaluate(()=>snapshot());
  check('trusted typing still reaches the same input after synchronous native reads',{ok:typed.focused&&typed.documentHasFocus&&typed.value===before.value.slice(0,3)+'Z'+before.value.slice(17),focused:typed.focused});
  check('later native exit restores the original reading position without stale draft writes',await page.evaluate(()=>{const p=readingProbe;p.surface.showReading(p.handle);const value=p.surface.withNativeReading(p.handle,()=>readingModule.isNativeReadingCurrent(p.plan),()=>true);return {ok:value===true&&!p.surface.visibility(p.handle).workspace&&p.surface.visibility(p.handle).sidebar&&p.port.scrollTop===p.originalNativeScroll&&p.native===document.querySelector('textarea')&&p.native.value===p.nativeValue,nativeScroll:p.port.scrollTop,originalNativeScroll:p.originalNativeScroll};}));await page.close();
 }
 for(const mode of ['initial-denied','source-denied','scope-lost','source-lost','throw','promise','reentry','reading-replaced','opening-replaced','opening-cancelled','opening-scope-lost','route','layer','native-focus','surface-cancel','sidebar-close']){
  const {page}=await setup();
  const result=await page.evaluate(({mode,B})=>{
   const p=readingProbe,exit=document.getElementById(p.handle.id+'_workspace_exit'),sideExit=document.getElementById(p.handle.id+'_sidebar_exit');let reads=0,nestedReads=0,nestedResult='not-run',openedHooks=0;
   p.surrendered.length=0;if(mode==='initial-denied')p.authority.allowed=false;if(mode==='source-denied')p.authority.source=false;
   if(mode.startsWith('opening-'))exit.addEventListener('beforetoggle',event=>{if(event.newState!=='open')return;openedHooks++;if(mode==='opening-replaced')p.plan.reading.firstElementChild.replaceWith(p.plan.reading.firstElementChild.cloneNode(true));if(mode==='opening-cancelled')event.preventDefault();if(mode==='opening-scope-lost')p.authority.allowed=false;});
   const result=p.surface.withNativeReading(p.handle,()=>{
    reads++;
    if(mode==='scope-lost')p.authority.allowed=false;
    if(mode==='source-lost')p.authority.source=false;
    if(mode==='throw')throw Error('synthetic-reader-failure');
    if(mode==='promise')return Promise.resolve('must-not-escape');
    if(mode==='reentry'){nestedResult=p.surface.withNativeReading(p.handle,()=>{nestedReads++;return 'nested-proof';},()=>true);return nestedResult;}
    if(mode==='reading-replaced')p.plan.reading.replaceWith(p.plan.reading.cloneNode(true));
    if(mode==='route')history.pushState({},'','/c/'+B);
    if(mode==='layer'){const dialog=document.createElement('dialog');dialog.textContent='Synthetic native layer';document.body.append(dialog);dialog.showModal();}
    if(mode==='native-focus')p.native.focus({preventScroll:true});
    if(mode==='surface-cancel')p.surface.showReading(p.handle);
    if(mode==='sidebar-close')sideExit.hidePopover();
    return 'must-not-escape';
   },()=>p.authority.allowed);
   const open=p.surface.visibility(p.handle),expectedOpen=mode==='initial-denied'||mode==='reentry',expectedReads=mode==='initial-denied'||mode==='source-denied'?0:1;
   return {ok:result===null&&reads===expectedReads&&open.workspace===expectedOpen&&open.sidebar===!['sidebar-close','layer'].includes(mode)&&p.frame===p.surface.frames(p.handle).find(item=>item.role==='workspace').frame&&p.native===document.querySelector('textarea')&&p.native.value===p.nativeValue&&(mode!=='reentry'||nestedResult===null&&nestedReads===0)&&(!mode.startsWith('opening-')||openedHooks===1)&&(mode!=='native-focus'||document.activeElement===p.native),mode,result,reads,nestedReads,openedHooks,workspace:open.workspace,sidebar:open.sidebar,nativeScroll:p.port.scrollTop,surrenders:p.surrendered};
  },{mode,B});
  check('probe boundary '+mode,result);await page.close();
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 await browserHandle?.close();await network.close();await new Promise(resolve=>server.close(resolve));report.sourceHashesAfter=await hashes();report.sourceUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);
 if(!report.sourceUnchanged){report.status='FAIL';report.error??='source-changed';process.exitCode=1;}
 if(process.env.FREE_FLOW_READING_REPORT)await writeFile(process.env.FREE_FLOW_READING_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
