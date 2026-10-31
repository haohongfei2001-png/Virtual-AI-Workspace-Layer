/** Actual frame client and renderer with bounded protocol doubles.
 * WEB_MECHANISM_ONLY: not a packaged MV3 or real ChatGPT acceptance claim.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';

const repository=fileURLToPath(new URL('../..',import.meta.url));
async function openBrowserFrame(t){
 const server=http.createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/frame'){
   res.setHeader('Content-Type','text/html');
   res.end('<!doctype html><html><head><link rel="stylesheet" href="/extension/frame-shell.css"></head><body><main id="mount" style="height:722px"></main></body></html>');return;
  }
  if(path!=='/extension/frame-shell.css'&&!/^\/src\/(navigation|data|b1|runtime|host)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('not-allowed');
  res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');
  res.end(await readFile(resolve(repository,'.'+path)));
 }catch{res.statusCode=404;res.end();}});
 let browser,guard;
 t.after(async()=>{try{await browser?.close();}finally{try{await guard?.close();}finally{await new Promise(resolve=>server.close(resolve));}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??chromium.executablePath(),args:historicalNetworkGuardArgs(guard.config)});
 const context=await browser.newContext({viewport:{width:1180,height:722}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(5000);
 await page.goto(origin+'/frame');
 return {page,browserVersion:browser.version()};
}
async function openFrame(t){
 const {page,browserVersion}=await openBrowserFrame(t);
 await page.evaluate(async()=>{
  const [{createFreeFrameClient},{createNavigation},{freeNavigationSnapshot},{projectFreeFrame}]=await Promise.all([
   import('/src/host/free-frame-client.mjs'),import('/src/navigation/navigation.mjs'),
   import('/src/navigation/free-view.mjs'),import('/src/runtime/free-frame-projection.mjs')
  ]);
  const scope='navigation-hydration-fixture';
  const refs=Array.from({length:30},(_,i)=>{
   const id='60000000-0000-4000-8000-'+(i+1).toString(16).padStart(12,'0');
   return {id,scope,nativeTitle:'Fixture '+i,nativeUrl:'https://chatgpt.com/c/'+id,membership:'NONE',projectId:null,activityDecision:{segment:0}};
  });
  const world={snapshot:freeNavigationSnapshot({scope,viewMode:'free',revision:1,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},refs,projects:[]})};
  const calls=[],renders=[],held=[],listeners=new Set();let delivery=0,navigation,pending=false;
  const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(Date.now()+20000).toISOString()});
  const runtime={
   connect:()=>({onMessage:{addListener(fn){listeners.add(fn);},removeListener(fn){listeners.delete(fn);}},onDisconnect:{addListener(){},removeListener(){}},disconnect(){}}),
   async sendMessage(message){
    calls.push(structuredClone(message));
    if(message.type==='HOST_UI_VIEW')return {ok:true,state:'ready',deliveryId:++delivery,page:projectFreeFrame(world,{role:'workspace',...message.query}),navigation:[]};
    if(message.type==='HOST_UI_NAVIGATION_PLANS'){
     if(message.deliveryId===1)return {ok:true,deliveryId:1,navigation:[]};
     return new Promise(resolve=>held.push({deliveryId:message.deliveryId,resolve}));
    }
    if(message.type==='HOST_UI_RESUME')return {ok:true,resume:null};
    if(['HOST_UI_JOIN','HOST_UI_RENEW'].includes(message.type))return {ok:true,grant:grant()};
    if(['HOST_UI_SAVE_VIEW','HOST_UI_VIEW_RECEIPT'].includes(message.type))return {ok:true};
    throw Error('unexpected-fixture-request:'+message.type);
   }
  };
  const client=createFreeFrameClient({document,runtime,role:'workspace',parentOrigin:'https://chatgpt.com',privateRoot:document.querySelector('#mount'),makeNonce:()=> 'nonce',
   navigationFactory(options){
    navigation=createNavigation({...options,onFrameRendered:(dto,counts)=>{renders.push(structuredClone(dto));options.onFrameRendered(dto,counts);}});
    return {...navigation,setNativeNavigationPending(value){pending=value;navigation.setNativeNavigationPending(value);}};
   }
  });
  globalThis.hydration={client,calls,renders,held,emit:message=>{for(const fn of listeners)fn(message);},get navigation(){return navigation;},get pending(){return pending;}};
  await client.start();
 });
 await page.locator('[data-free-list="noProject"] .row').first().waitFor();
 await page.waitForFunction(()=>hydration.renders.length>0&&!hydration.pending);
 return {page,browserVersion};
}

for(const mode of ['empty','href'])test('same-delivery '+mode+' navigation hydration preserves real row DOM, scrolling and focus',{timeout:20000},async t=>{
 const {page,browserVersion}=await openFrame(t);
 // Use the real client read callback and renderer's 5 -> 17 -> 29 -> 30
 // paging. Only the final navigation-plan answer is held independently.
 for(const count of [17,29,30]){
  await page.getByRole('button',{name:'显示更多无项目聊天',exact:true}).click();
  await page.waitForFunction(count=>hydration.held.length===1&&hydration.navigation.roots().workspace.shadow.querySelectorAll('[data-free-list="noProject"] .row').length===count,count);
  if(count<30){
   await page.evaluate(()=>{const answer=hydration.held.shift();answer.resolve({ok:true,deliveryId:answer.deliveryId,navigation:[]});});
   await page.waitForFunction(()=>!hydration.pending);
  }
 }
 await page.evaluate(()=>{hydration.navigation.roots().workspace.scroller.scrollTop=0;});
 await page.waitForFunction(()=>hydration.navigation.view().scroll===0&&hydration.calls.filter(message=>message.type==='HOST_UI_SAVE_VIEW').at(-1)?.view.scroll===0);
 await page.evaluate(()=>{
  const h=hydration,root=h.navigation.roots().workspace;
  h.originalWorkspace=root.scroller;h.originalTail=[...root.shadow.querySelectorAll('[data-free-list="noProject"] .row')].at(-1);
  h.originalTail.focus({preventScroll:true});
  h.before={views:h.calls.filter(message=>message.type==='HOST_UI_VIEW').length,saves:h.calls.filter(message=>message.type==='HOST_UI_SAVE_VIEW').length,renders:h.renders.length};
 });
 await page.locator('[data-free-list="noProject"] .row').last().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>{
  const h=hydration,saves=h.calls.filter(message=>message.type==='HOST_UI_SAVE_VIEW');
  return h.originalWorkspace.scrollTop>0&&saves.length>h.before.saves&&saves.at(-1).view.scroll===h.originalWorkspace.scrollTop;
 });
 const scrollOnly=await page.evaluate(()=>{
  const h=hydration,root=h.navigation.roots().workspace;
  h.scrollBeforeReply=root.scroller.scrollTop;
  return {sameWorkspace:root.scroller===h.originalWorkspace,tailConnected:h.originalTail.isConnected,sameFocus:root.shadow.activeElement===h.originalTail,
   viewsBefore:h.before.views,viewsAfter:h.calls.filter(message=>message.type==='HOST_UI_VIEW').length,rendersBefore:h.before.renders,rendersAfter:h.renders.length};
 });
 assert(scrollOnly.sameWorkspace&&scrollOnly.tailConnected&&scrollOnly.sameFocus,'scroll saving preserves the existing focused DOM');
 assert.equal(scrollOnly.viewsAfter,scrollOnly.viewsBefore,'scroll saving must not request another data projection');
 assert.equal(scrollOnly.rendersAfter,scrollOnly.rendersBefore,'scroll saving must not rebuild the renderer');

 await page.evaluate(mode=>{
  const h=hydration,dto=h.renders.at(-1),answer=h.held.shift();
  const rows=[...new Map([...dto.entries.noProject.items,...(dto.selection?.items??[])].map(row=>[row.id,row])).values()];
  h.planKeys=mode==='empty'?[]:rows.map(row=>row.id);h.sameDelivery=answer.deliveryId;
  answer.resolve({ok:true,deliveryId:answer.deliveryId,navigation:mode==='empty'?[]:rows.map(row=>({refId:row.id,targetKey:'href_'+row.id,plan:{mode:'href',planRevision:1,disposition:'new-tab-preserve-current',target:{kind:'resolved',entity:'conversation',nativeId:row.id,navigationURL:row.nativeUrl,liveHandle:null}}}))});
 },mode);
 await page.waitForFunction(()=>!hydration.pending);
 const after=await page.evaluate(()=>{
  const h=hydration,root=h.navigation.roots().workspace,rows=[...root.shadow.querySelectorAll('[data-free-list="noProject"] .row')],tail=rows.at(-1);
  return {sameWorkspace:root.scroller===h.originalWorkspace,sameTail:tail===h.originalTail,tailConnected:h.originalTail.isConnected,sameFocus:root.shadow.activeElement===h.originalTail,
   scrollBefore:h.scrollBeforeReply,scrollAfter:root.scroller.scrollTop,rows:rows.length,planKeys:h.planKeys.length,views:h.calls.filter(message=>message.type==='HOST_UI_VIEW').length,
   href:tail.getAttribute('href'),target:tail.getAttribute('target'),disabled:tail.getAttribute('aria-disabled'),id:tail.getAttribute('data-ref-id')};
 });
 assert(after.sameWorkspace&&after.sameTail&&after.tailConnected,'same-delivery plan hydration must preserve workspace and tail nodes: '+JSON.stringify(after));
 assert(after.sameFocus,'same-delivery plan hydration must retain focus on the original tail');
 assert.equal(after.scrollAfter,after.scrollBefore,'same-delivery plan hydration must retain actual scroll position');
 assert.equal(after.rows,30);assert.equal(after.views,scrollOnly.viewsAfter);
 assert.equal(after.planKeys,mode==='empty'?0:30);
 if(mode==='href'){
  assert.equal(after.href,'https://chatgpt.com/c/'+after.id);assert.equal(after.target,'_blank');assert.equal(after.disabled,null);
  // Observe native default handling, then suppress navigation in the fixture.
  // A stale unavailable-handler can leave a plausible href that still cannot open.
  const activation=await page.evaluate(()=>{
   const h=hydration,target=h.originalTail;let defaultAllowed=null;
   target.addEventListener('click',event=>{defaultAllowed=!event.defaultPrevented;event.preventDefault();},{once:true});
   target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
   return {defaultAllowed,dispatches:h.calls.filter(message=>['HOST_UI_DISPATCH_CURRENT','HOST_UI_DISPATCH_NATIVE'].includes(message.type)).length};
  });
  assert.equal(activation.defaultAllowed,true,'hydrated href must allow the browser default');assert.equal(activation.dispatches,0);
  // Counterexample to combining an enabled snapshot with a later Locator read:
  // a new real client VIEW retires the old capability before its new plans.
  await page.evaluate(()=>hydration.emit({type:'VAIWL_UI_DATA_CHANGED'}));
  await page.waitForFunction(()=>hydration.held.length===1&&hydration.held[0].deliveryId>hydration.sameDelivery);
  const retired=await page.evaluate(()=>{
   const h=hydration,row=h.navigation.roots().workspace.shadow.querySelector('[data-ref-id="'+h.originalTail.dataset.refId+'"]');
   const activate=target=>{let allowed;target.addEventListener('click',e=>{allowed=!e.defaultPrevented;e.preventDefault();},{once:true});target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));return allowed;};
   const snapshot={oldConnected:h.originalTail.isConnected,newNode:row!==h.originalTail,href:row.getAttribute('href'),disabled:row.getAttribute('aria-disabled')};
   return {...snapshot,retiredDefault:activate(h.originalTail),pendingDefault:activate(row),dispatches:h.calls.filter(m=>['HOST_UI_DISPATCH_CURRENT','HOST_UI_DISPATCH_NATIVE'].includes(m.type)).length};
  });
  assert.deepEqual(retired,{oldConnected:false,newNode:true,href:null,disabled:'true',retiredDefault:false,pendingDefault:false,dispatches:0});
  await page.evaluate(()=>{const h=hydration,answer=h.held.shift(),dto=h.renders.at(-1);answer.resolve({ok:true,deliveryId:answer.deliveryId,navigation:[...new Map([...dto.entries.noProject.items,...(dto.selection?.items??[])].map(row=>[row.id,row])).values()].map(row=>({refId:row.id,targetKey:'fresh_'+row.id,plan:{mode:'href',planRevision:2,disposition:'new-tab-preserve-current',target:{kind:'resolved',entity:'conversation',nativeId:row.id,navigationURL:row.nativeUrl,liveHandle:null}}}))});});
  await page.waitForFunction(()=>!hydration.pending);
  const restored=await page.locator('[data-ref-id="'+after.id+'"]').evaluate(n=>({href:n.getAttribute('href'),disabled:n.getAttribute('aria-disabled')}));
  assert.deepEqual(restored,{href:after.href,disabled:null});
  t.diagnostic(JSON.stringify({crossTaskSnapshotCounterexample:{firstEnabled:{href:after.href,disabled:after.disabled},retired,restored}}));
 }else{assert.equal(after.href,null);assert.equal(after.disabled,'true','an empty answer must not invent action authority');}
 await page.evaluate(()=>hydration.client.stop());
 t.diagnostic(JSON.stringify({evidence:'WEB_MECHANISM_ONLY',MV3:'NOT_RUN',realChatGPT:'NOT_RUN',browserVersion,mode,scrollOnly,after}));
});

test('live row and project-create capabilities retain focus and use only current valid plans',{timeout:15000},async t=>{
 const {page,browserVersion}=await openBrowserFrame(t);
 const result=await page.evaluate(async()=>{
  const [{createNavigation},{freeNavigationSnapshot},{projectFreeFrame}]=await Promise.all([
   import('/src/navigation/navigation.mjs'),import('/src/navigation/free-view.mjs'),import('/src/runtime/free-frame-projection.mjs')
  ]);
  const scope='capability-transition-fixture';
  const refs=Array.from({length:30},(_,i)=>{
   const id='70000000-0000-4000-8000-'+(i+1).toString(16).padStart(12,'0');
   return {id,scope,nativeTitle:'Transition fixture '+i,nativeUrl:'https://chatgpt.com/c/'+id,membership:'NONE',projectId:null,activityDecision:{segment:0}};
  });
  const selected=refs.at(-1),project={id:'g-p-0123456789abcdef0123456789abcdef',scope,nativeName:'Capability project',nativeUrl:'https://chatgpt.com/g/g-p-0123456789abcdef0123456789abcdef/project',members:[],activityDecision:{segment:0}};
  const world={snapshot:freeNavigationSnapshot({scope,viewMode:'free',revision:1,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},refs,projects:[project]})};
  let issued=null,projectIssued=null,projectionRequests=0,blurs=0;const dispatches=[],stages=[];
  const navigation=createNavigation({document,surface:{role:'workspace',root:document.querySelector('#mount')},
   adapter:{currentURL:()=>'',isCurrent:()=>false,status(){},nativeHref:url=>[selected.nativeUrl,project.nativeUrl].includes(url)?url:null,navigationPlan:ref=>ref.id===selected.id?issued:null,projectNavigationPlan:group=>group.id===project.id?projectIssued:null},
   onProjectionRequest(){projectionRequests++;throw Error('capability-refresh-must-not-request-a-projection');},
   onDispatch(command){dispatches.push(structuredClone(command));return new Promise(()=>{});}
  });
  // Hold only the synthetic dispatch result so an actual native navigation
  // result cannot change presentation while the capability transitions run.
  try{
   navigation.updateFrameProjection(projectFreeFrame(world,{role:'workspace',list:'noProject',rowOffset:0,rowLimit:41}));
   const root=navigation.roots().workspace,workspace=root.scroller,row=root.shadow.querySelector('[data-ref-id="'+selected.id+'"]');
   workspace.scrollTop=200;row.focus({preventScroll:true});row.addEventListener('blur',()=>blurs++);
   const scroll=workspace.scrollTop;
   const transition=(name,next)=>{
    issued=next;const refreshed=navigation.refreshNavigationPlans(),current=navigation.roots().workspace;
    const value={name,refreshed,sameWorkspace:current.scroller===workspace,sameRow:current.shadow.querySelector('[data-ref-id="'+selected.id+'"]')===row,connected:row.isConnected,
     focused:current.shadow.activeElement===row,blurs,scroll:current.scroller.scrollTop,href:row.getAttribute('href'),disabled:row.getAttribute('aria-disabled')};
    stages.push(value);return value;
   };
   const activate=(element,modifiers)=>{
    let defaultAllowed=null;const before=dispatches.length;
    element.addEventListener('click',event=>{defaultAllowed=!event.defaultPrevented;event.preventDefault();},{once:true});
    element.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,...modifiers}));
    return {defaultAllowed,extraDispatches:dispatches.length-before};
   };
   const activation=modifiers=>activate(row,modifiers);
   const target={kind:'resolved',entity:'conversation',nativeId:selected.id,navigationURL:selected.nativeUrl,liveHandle:null};
   transition('unavailable',null);
   transition('href',{plan:{mode:'href',target,disposition:'new-tab-preserve-current',planRevision:1}});
   const hrefActivation=activation({});
   const control={id:'control-old',documentToken:'document',routeEpoch:0,regionEpoch:0,controlKind:'conversation'};
   const certificate=(revision,key,handle)=>({targetKey:key,uiGrantId:'grant',mountId:'mount',plan:{mode:'native-control',target:{...target,liveHandle:handle},control:handle,bodyProofId:'proof-'+revision,planRevision:revision}});
   transition('delegated',certificate(17,'target-old',control));
   transition('renewed-certificate',certificate(18,'target-current',{...control,id:'control-current'}));
   const modifiedActivations=[{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{button:1}].map(activation);
   const delegatedActivation=activation({});
   transition('revoked',null);
   const revokedActivation=activation({});
   // Also call the old DOM reference after its unavailable-action feedback.
   // Neither a current revoked row nor a retired callback may reuse the tuple.
   const staleActivation=activation({ctrlKey:true});
   // The explicit unavailable action above may render feedback. Independently
   // capture the resulting project control while it still has no capability;
   // every subsequent plan arrival must preserve this exact control and pane.
   const projectRoot=navigation.roots().workspace,projectWorkspace=projectRoot.scroller,create=projectRoot.shadow.querySelector('.project-create'),projectRow=projectRoot.shadow.querySelector('[data-ref-id="'+selected.id+'"]');
   projectWorkspace.scrollTop=200;create.focus({preventScroll:true});let projectBlurs=0;create.addEventListener('blur',()=>projectBlurs++);
   const projectScroll=projectWorkspace.scrollTop,projectStages=[];
   const projectTransition=(name,next)=>{
    const scrollBefore=navigation.roots().workspace.scroller.scrollTop;
    projectIssued=next;const refreshed=navigation.refreshNavigationPlans(),current=navigation.roots().workspace;
    projectStages.push({name,refreshed,sameWorkspace:current.scroller===projectWorkspace,sameCreate:current.shadow.querySelector('.project-create')===create,sameRow:current.shadow.querySelector('[data-ref-id="'+selected.id+'"]')===projectRow,
     connected:create.isConnected,focused:current.shadow.activeElement===create,blurs:projectBlurs,scrollBefore,scroll:current.scroller.scrollTop,href:create.getAttribute('href'),target:create.getAttribute('target'),disabled:create.getAttribute('aria-disabled')});
   };
   const projectPlan=disposition=>({plan:{mode:'href',disposition,planRevision:1,target:{kind:'resolved',entity:'project',nativeId:project.id,navigationURL:project.nativeUrl,liveHandle:null}}});
   projectTransition('unavailable',null);
   projectTransition('same-tab-rejected',projectPlan('same-tab'));
   projectTransition('new-tab-href',projectPlan('new-tab-preserve-current'));
   // Explicit activation removes the previous unavailable-action feedback.
   // Measure that separate layout change, not as part of plan hydration.
   const projectHrefScroll={before:projectWorkspace.scrollTop},projectHrefActivation=activate(create,{});projectHrefScroll.after=projectWorkspace.scrollTop;
   projectTransition('same-tab-revoked',projectPlan('same-tab'));
   const projectRejectedActivation=activate(create,{});
   return {stages,scroll,selectedId:selected.id,selectedURL:selected.nativeUrl,projectionRequests,hrefActivation,modifiedActivations,delegatedActivation,revokedActivation,staleActivation,dispatches,
    projectStages,projectScroll,projectURL:project.nativeUrl,projectHrefActivation,projectHrefScroll,projectRejectedActivation};
  }finally{navigation.stop();}
 });
 assert(result.scroll>0,'the fixture must have a real scroll position');
 assert.deepEqual(result.stages.map(stage=>stage.name),['unavailable','href','delegated','renewed-certificate','revoked']);
 for(const stage of result.stages){
  assert(stage.refreshed&&stage.sameWorkspace&&stage.sameRow&&stage.connected,'capability refresh must retain the original nodes: '+JSON.stringify(stage));
  assert(stage.focused,'capability refresh must retain the original focused row: '+stage.name);
  assert.equal(stage.blurs,0,'capability refresh must not transiently drop focus: '+stage.name);
  assert.equal(stage.scroll,result.scroll,'capability refresh must preserve scroll: '+stage.name);
 }
 for(const stage of result.stages.filter(stage=>['unavailable','revoked'].includes(stage.name))){assert.equal(stage.href,null);assert.equal(stage.disabled,'true');}
 for(const stage of result.stages.filter(stage=>!['unavailable','revoked'].includes(stage.name))){assert.equal(stage.href,result.selectedURL);assert.equal(stage.disabled,null);}
 assert.deepEqual(result.hrefActivation,{defaultAllowed:true,extraDispatches:0});
 for(const activation of result.modifiedActivations)assert.deepEqual(activation,{defaultAllowed:true,extraDispatches:0});
 assert.deepEqual(result.delegatedActivation,{defaultAllowed:false,extraDispatches:1});
 assert.deepEqual(result.revokedActivation,{defaultAllowed:false,extraDispatches:0});
 assert.deepEqual(result.staleActivation,{defaultAllowed:false,extraDispatches:0});
 assert(result.projectScroll>0,'the project fixture must have a real scroll position');
 assert.deepEqual(result.projectStages.map(stage=>stage.name),['unavailable','same-tab-rejected','new-tab-href','same-tab-revoked']);
 for(const stage of result.projectStages){
  assert(stage.refreshed&&stage.sameWorkspace&&stage.sameCreate&&stage.sameRow&&stage.connected,'project capability refresh must retain the original nodes: '+JSON.stringify(stage));
  assert(stage.focused,'project capability refresh must retain focus: '+stage.name);assert.equal(stage.blurs,0);assert.equal(stage.scroll,stage.scrollBefore,'project capability refresh must preserve scroll: '+stage.name);
  assert.equal(stage.href,stage.name==='new-tab-href'?result.projectURL:null);assert.equal(stage.disabled,stage.name==='new-tab-href'?null:'true');
  assert.equal(stage.target,stage.name==='new-tab-href'?'_blank':null);
 }
 assert.deepEqual(result.projectHrefActivation,{defaultAllowed:true,extraDispatches:0});
 assert.deepEqual(result.projectRejectedActivation,{defaultAllowed:false,extraDispatches:0});
 assert.equal(result.projectionRequests,0);assert.equal(result.dispatches.length,1);
 const [command]=result.dispatches;assert.match(command.actionId,/^ui_[a-f0-9]+$/);
 assert.deepEqual({...command,actionId:'one-action'},{actionId:'one-action',uiGrantId:'grant',mountId:'mount',planRevision:18,targetKey:'target-current'});
 t.diagnostic(JSON.stringify({evidence:'WEB_MECHANISM_ONLY',MV3:'NOT_RUN',realChatGPT:'NOT_RUN',browserVersion,...result}));
});
