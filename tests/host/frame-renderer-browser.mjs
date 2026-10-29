import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';

// The actual frame client and owned panels share one content-sized iframe.
// The outer scrollport/runtime are explicit fixtures, not MV3 authorization.
test('sidebar auxiliary panels resize after navigation detaches without a second scroll owner',{timeout:30000},async t=>{
 const root=resolve('.'),server=http.createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/host'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><nav style="width:240px;height:360px;overflow:auto"><iframe id="frame" src="/frame" style="border:0;width:100%;height:128px;display:block" scrolling="no"></iframe><button id="native-account">Native account</button></nav><script>window.sizes=[];addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.type!=="VAIWL_UI_INTRINSIC_SIZE")return;sizes.push(e.data.height);frame.style.height=e.data.height+"px";});</script>');return;}
  if(path==='/frame'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/extension/frame-shell.css"><body data-frame-role="sidebar"><main></main>');return;}
  if(!/^\/src\/[a-z0-9/-]+\.mjs$/.test(path)&&path!=='/extension/frame-shell.css')throw Error('path');
  res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(resolve(root,'.'+path)));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});let browser;
 t.after(async()=>{await browser?.close();await guard.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:historicalNetworkGuardArgs(guard.config)});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/host');
 const frame=page.frames().find(f=>f.url()===origin+'/frame');assert(frame);
 await frame.evaluate(async()=>{
  const {createFreeFrameClient}=await import('/src/host/free-frame-client.mjs');const messages=new Set(),empty=()=>({items:[],total:0,offset:0,limit:5,hasMore:false});
  const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'sidebar',expiresAt:new Date(Date.now()+20000).toISOString()});
  const dto={protocol:'vaiwl-free-frame/1',role:'sidebar',scope:'fixture',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:{...empty(),limit:8},entries:{noProject:empty(),unknown:empty()},selection:null};
  globalThis.panelFixture={messages,invalid:false,release:null};const f=panelFixture;
  const runtime={connect:()=>({onMessage:{addListener:fn=>messages.add(fn),removeListener:fn=>messages.delete(fn)},onDisconnect:{addListener(){},removeListener(){}},disconnect(){}}),async sendMessage(m){
   if(m.type==='HOST_UI_JOIN'||m.type==='HOST_UI_RENEW')return {ok:true,grant:grant()};
   if(m.type==='HOST_UI_VIEW')return {ok:true,state:'ready',page:f.invalid?null:dto,navigation:[]};
   if(m.type==='HOST_UI_SNIPPET_LIST')return new Promise(resolve=>{f.release=()=>resolve({ok:true,workspaceRevision:1,snippets:{total:8,offset:0,limit:12,items:Array.from({length:8},(_,i)=>({id:'saved'+i,refId:'11111111-1111-4111-8111-111111111111',preview:'Local explicitly saved fixture text '.repeat(3),title:'Saved fixture '+i,nativeUrl:location.origin+'/c/11111111-1111-4111-8111-111111111111'}))}});});
   return {ok:true};
  }};
  f.client=createFreeFrameClient({document,runtime,role:'sidebar',parentOrigin:location.origin,privateRoot:document.querySelector('main')});await f.client.start();
 });
 await frame.getByRole('button',{name:'已保存片段',exact:true}).waitFor();
 const settled=()=>frame.waitForFunction(()=>Math.abs(innerHeight-Math.max(128,Math.ceil(document.querySelector('main').getBoundingClientRect().height)))<1,{},{timeout:2000});
 await settled();await frame.getByRole('button',{name:'已保存片段',exact:true}).click();
 await frame.waitForFunction(()=>typeof panelFixture.release==='function');await frame.evaluate(()=>panelFixture.release());
 await frame.getByText('共 8 个片段',{exact:true}).waitFor();await settled();
 const height=await frame.evaluate(()=>innerHeight);assert(height>1000,'the asynchronously loaded panel must enlarge the old navigation frame');
 const last=frame.getByRole('button',{name:'返回工作空间',exact:true});await last.focus();
 assert(await page.locator('nav').evaluate(n=>n.scrollTop>0));
 assert.deepEqual(await frame.evaluate(()=>({window:scrollY,panel:document.querySelector('[data-vaiwl-frame-snippets]').scrollTop,overflow:getComputedStyle(document.querySelector('main')).overflowY})),{window:0,panel:0,overflow:'visible'});
 await page.locator('nav').evaluate(n=>n.style.width='180px');await settled();assert(await frame.evaluate(()=>innerHeight)>height,'narrow wrapping must republish the owned extent');
 await last.click();await frame.getByRole('button',{name:'已保存片段',exact:true}).waitFor();await settled();assert(await frame.evaluate(()=>innerHeight)<height);
 // An invalid fresh VIEW removes navigation but must leave the local error
 // and retry controls sized and reachable. It supplies no new authority.
 await frame.evaluate(()=>{panelFixture.invalid=true;for(const fn of panelFixture.messages)fn({type:'VAIWL_UI_DATA_CHANGED'});});
 await frame.locator('[data-vaiwl-read-error-container]').waitFor();await settled();
 await frame.evaluate(()=>panelFixture.client.stop());const retired=await page.evaluate(()=>sizes.length);
 await frame.evaluate(()=>{document.querySelector('main').style.height='5000px';});await page.waitForTimeout(60);
 assert.equal(await page.evaluate(()=>sizes.length),retired,'revoked/retired frames cannot publish new layout');assert.deepEqual(errors,[]);
});

test('candidate panels keep native NAV as the sidebar scroll owner',{timeout:30000},async t=>{
 const root=resolve('.'),server=http.createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/frame'){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><body style="margin:0"><main id="mount" style="width:220px"></main>');return;}
  if(!/^\/src\/(host|b1)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('path');
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(root,'.'+path)));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});let browser;
 t.after(async()=>{await browser?.close();await guard.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:historicalNetworkGuardArgs(guard.config)});
 const context=await browser.newContext({viewport:{width:600,height:800}});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();await page.goto(origin+'/frame');
 for(const role of ['sidebar','workspace']){
  await page.evaluate(async role=>{
   const {createFreeFrameCandidates}=await import('/src/host/free-frame-candidates.mjs');const changes=[];
   const ui=createFreeFrameCandidates({document,container:document.querySelector('#mount'),role,onLayoutChange:()=>changes.push(document.querySelector('[data-vaiwl-candidates]').getBoundingClientRect().height),onActivate:()=>new Promise(r=>window.finishCandidate=r)});
   const items=Array.from({length:32},(_,i)=>({renderKey:'candidate:row'+i,nativeTitle:'原生候选项目 '+i,titleState:'exact',available:true,reason:null}));
   ui.update(items);window.candidateCase={ui,items,changes,read(){const s=document.querySelector('[data-vaiwl-candidates]').shadowRoot,n=s.querySelector('ul');n.scrollTop=200;return {overflow:getComputedStyle(n).overflowY,scroll:n.scrollTop,height:n.clientHeight,extent:n.scrollHeight,changes:changes.length};}};
  },role);
  const state=await page.evaluate(()=>candidateCase.read());
  if(role==='sidebar'){
   assert.equal(state.overflow,'visible');assert.equal(state.scroll,0);assert.equal(state.height,state.extent);assert(state.height>800);
   await page.waitForFunction(()=>candidateCase.changes.length>0);const before=await page.evaluate(()=>candidateCase.changes.length);
   await page.getByRole('button',{name:'原生候选项目 0',exact:true}).click();await page.evaluate(()=>finishCandidate({state:'unconfirmed'}));
   await page.waitForFunction(before=>candidateCase.changes.length>before,before);
   // Text wrapping changes after the asynchronous native result. The parent
   // must receive the new natural extent, including the last candidate row.
   assert.equal(await page.evaluate(()=>candidateCase.changes.at(-1)===document.querySelector('[data-vaiwl-candidates]').getBoundingClientRect().height),true);
   const last=page.getByRole('button',{name:'原生候选项目 31',exact:true});await last.focus();assert(await last.evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight));
  }else {assert.equal(state.overflow,'auto');assert(state.scroll>0);assert(state.height<state.extent);}
  await page.evaluate(()=>candidateCase.ui.stop());
 }
});

// Real DOM, empty frame document: no fabricated host.inspect() regions or host seed.
test('single-role frame renderer reuses navigation without host DOM access',{timeout:30000},async t=>{
 const root=resolve('.');
 const server=http.createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/frame'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><body style="margin:0;height:800px"><div id="mount" style="height:100%"></div></body></html>');return;}
  if(!/^\/src\/(navigation|data|b1|host)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('not-found');
  res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(resolve(root,'.'+path)));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 t.after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext();const origin=`http://127.0.0.1:${server.address().port}`;
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/frame');
 const result=await page.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs');
  const checks=[],check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const hostURL='https://chatgpt.com/c/33333333-3333-4333-8333-333333333333';
  const refs=[{id:'33333333-3333-4333-8333-333333333333',scope:'A',nativeTitle:'First native conversation',nativeUrl:hostURL,membership:'PROJECT',activityDecision:{segment:0}},{id:'44444444-4444-4444-8444-444444444444',scope:'A',nativeTitle:'Unknown native conversation',nativeUrl:'https://chatgpt.com/c/44444444-4444-4444-8444-444444444444',membership:'UNKNOWN',activityDecision:{segment:null}}];
  const raw={viewMode:'free',scope:'A',refs,projects:[{id:'g-p-11111111111111111111111111111111',scope:'A',nativeName:'Native Project',members:[refs[0]],activityDecision:{segment:0}}],noProject:[],unknown:[refs[1]],viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0}};
  const root=document.querySelector('#mount'),events=[],dispatches=[];
  let currentPlan=null;
  const adapter={currentURL:()=>hostURL,isCurrent:url=>url===hostURL,nativeHref:url=>typeof url==='string'&&url.startsWith('https://chatgpt.com/c/')?url:null,status(){},inspect(){throw Error('frame-must-not-inspect-host');},hasNativeLayer(){throw Error('frame-must-not-read-native-layer');},openNative(){throw Error('frame-must-not-use-legacy-navigation');},navigationPlan:()=>currentPlan};
  const make=role=>createNavigation({document,adapter,surface:{role,root},onPresentationRequest:intent=>events.push(intent),onDispatch:dto=>{dispatches.push(dto);return Promise.reject(Error('lost-ack'));}});
  let nav=make('workspace');nav.update(raw,'2026-10-13T12:00:00Z','UTC');
  check(nav.roots().sidebar===null&&root.children.length===1,'workspace-only-one-root');
  check(!document.querySelector('[inert],[data-vaiwl-mask],[data-vaiwl-return]'),'no-host-mask-or-return');
  let shadow=nav.roots().workspace.shadow,link=shadow.querySelector('[data-ref-id]');
  check(!link.hasAttribute('href')&&link.getAttribute('aria-disabled')==='true','no-plan-no-raw-url-fallback');
  check(!link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}))&&dispatches.length===0,'missing-plan-explicitly-blocked');
  const unavailableCreate=shadow.querySelector('[data-navigation-reason="native-create-plan-unavailable"]');
  check(unavailableCreate.getAttribute('aria-disabled')==='true'&&!!unavailableCreate.getAttribute('aria-description')&&!unavailableCreate.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}))&&dispatches.length===0&&events.length===0,'native-create-explains-unavailable-without-dispatch');
  const target={kind:'resolved',entity:'conversation',nativeId:refs[0].id,navigationURL:hostURL,liveHandle:null};
  currentPlan={plan:{mode:'native-control',target,control:{id:'control'},planRevision:8},targetKey:'owner-plan',uiGrantId:'grant',mountId:'mount'};
  nav.update(raw,'2026-10-13T12:00:00Z','UTC');shadow=nav.roots().workspace.shadow;link=shadow.querySelector(`[data-ref-id="${refs[0].id}"]`);
  check(!link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0})),'delegated-click-cancelled-synchronously');
  check(dispatches.length===1&&dispatches[0].targetKey==='owner-plan'&&dispatches[0].planRevision===8,'single-owner-plan-dto');
  check(events.length===0,'dispatch-does-not-prematurely-enter-reading');
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  check(dispatches.length===1&&events.length===0&&shadow.querySelector('.navigation-feedback')?.textContent.includes('打开结果未确认'),'lost-ack-visible-without-retry-or-reading');
  // Feedback repaints the list. Retired callbacks must stay blocked; the
  // modifier-key contract below applies to the current connected link.
  const retired=link;link=shadow.querySelector(`[data-ref-id="${refs[0].id}"]`);
  check(link!==retired&&link.isConnected&&!retired.isConnected,'feedback-replaces-link');
  nav.setNativeNavigationPending(true);
  check(!retired.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true,button:0}))&&dispatches.length===1,'retired-modifier-blocked-without-rpc');
  // Observe defaultAllowed before the test-only outer listener suppresses navigation.
  let defaultAllowed=null;link.addEventListener('click',event=>{defaultAllowed=!event.defaultPrevented;event.preventDefault();},{once:true});
  link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true,button:0}));
  check(defaultAllowed&&dispatches.length===1,'pending-modified-click-no-rpc');
  check(!link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}))&&dispatches.length===1,'pending-primary-click-still-blocked');
  nav.setNativeNavigationPending(false);
  currentPlan={plan:{mode:'href',target,disposition:'new-tab-preserve-current',planRevision:9}};
  nav.update(raw,'2026-10-13T12:00:00Z','UTC');link=nav.roots().workspace.shadow.querySelector(`[data-ref-id="${refs[0].id}"]`);
  check(link.target==='_blank'&&link.rel.includes('noopener'),'draft-preserving-default-target');
  link.addEventListener('click',event=>{defaultAllowed=!event.defaultPrevented;event.preventDefault();},{once:true});link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  check(defaultAllowed&&dispatches.length===1,'href-plan-browser-default-only');
  currentPlan={plan:{mode:'href',target,disposition:'same-tab',planRevision:10}};
  nav.update(raw,'2026-10-13T12:00:00Z','UTC');check(nav.roots().workspace.shadow.querySelector(`[data-ref-id="${refs[0].id}"]`).target==='_top','same-tab-never-navigates-extension-frame');
  nav.present({kind:'search-known',themeId:null});check(nav.roots().workspace.shadow.querySelector('input[type=search]'),'forwarded-search-uses-existing-workspace-renderer');
  const prior=events.length;nav.present({kind:'show-working-set'});check(events.length===prior&&nav.roots().workspace.shadow.querySelector('.working-set'),'forwarded-intent-does-not-echo');
  nav.stop();check(root.children.length===0,'stop-removes-only-owned-root');
  nav=make('sidebar');nav.update(raw,'2026-10-13T12:00:00Z','UTC');check(nav.roots().workspace===null&&root.children.length===1,'sidebar-only-one-root');
  shadow=nav.roots().sidebar.shadow;shadow.querySelector('[aria-label="查找已知项目与聊天"]').click();check(events.at(-1).kind==='search-known','sidebar-search-requests-other-surface');
  shadow.querySelector('[aria-label="当前工作集"]').click();check(events.at(-1).kind==='show-working-set','sidebar-working-set-requests-other-surface');
  check(!shadow.querySelector('.workspace'),'sidebar-does-not-render-hidden-workspace-copy');
  nav.invalidate();check(root.children.length===0,'invalidation-clears-frame-private-dom');nav.stop();
  return checks;
 });
 assert.equal(result.length,24);assert.deepEqual(errors,[]);
 // Exercise actual Enter/Space activation through delayed pages, not .click().
 for(const kind of ['search','workingSet']){
  await page.evaluate(async kind=>{
   const {createNavigation}=await import('/src/navigation/navigation.mjs');
   const empty=()=>({items:[],total:0,offset:0,limit:24,hasMore:false});
   const dto={protocol:'vaiwl-free-frame/1',role:'workspace',scope:'scopeA',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:empty(),entries:{noProject:{...empty(),inventoryTotal:0},unknown:{...empty(),inventoryTotal:0}},selection:null};
   const pending=[],calls=[];const nav=createNavigation({document,surface:{role:'workspace',root:document.querySelector('#mount')},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onProjectionRequest:q=>{calls.push(q);return new Promise(r=>pending.push(r));}});
   const complete=()=>{const q=calls.at(-1)[kind],items=Array.from({length:Math.min(24,50-q.offset)},(_,i)=>({id:'ref'+(q.offset+i),nativeTitle:'Item '+(q.offset+i),displayTitle:'Item '+(q.offset+i),nativeUrl:'https://chatgpt.com/c/ref'+(q.offset+i),membership:'NONE',projectId:null,segment:0}));pending.shift()({...dto,[kind]:{...q,items,total:50,hasMore:q.offset+items.length<50,...(kind==='workingSet'?{currentRefId:null}:{})}});};
   nav.updateFrameProjection(dto);nav.present({kind:kind==='search'?'search-known':'show-working-set'});window.pagerCase={nav,complete,calls};complete();
  },kind);
  const label=kind==='search'?'显示更多查找结果':'显示更多工作集窗口',pager=page.getByRole('button',{name:label,exact:true});
  await pager.waitFor();await pager.focus();await page.keyboard.press('Enter');
  assert.equal(await pager.getAttribute('aria-disabled'),'true');assert.equal(await pager.evaluate(n=>n.getRootNode().activeElement===n),true);
  await page.keyboard.press('Enter');await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>pagerCase.calls.length),2);
  await page.evaluate(()=>pagerCase.complete());await page.waitForFunction(label=>{const s=pagerCase.nav.roots().workspace.shadow,n=s.querySelector('[aria-label="'+label+'"]');return n&&n.getAttribute('aria-disabled')!=='true'&&s.activeElement===n;},label);
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(kind=>pagerCase.calls.at(-1)[kind].offset,kind),48);
  const back=kind==='search'?'关闭已知查找':'返回主题视图';await page.getByRole('button',{name:back,exact:true}).focus();await page.evaluate(()=>pagerCase.complete());
  await page.waitForFunction(()=>pagerCase.nav.roots().workspace.shadow.querySelector('[data-ref-id="ref48"]'));
  assert.equal(await page.getByRole('button',{name:back,exact:true}).evaluate(n=>n.getRootNode().activeElement===n),true);await page.evaluate(()=>pagerCase.nav.stop());
 }
 // Synthetic composition events exercise actual DOM handlers, not a physical IME claim.
 await page.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs'),calls=[];
  const empty=()=>({items:[],total:0,offset:0,limit:24,hasMore:false});
  const dto={protocol:'vaiwl-free-frame/1',role:'workspace',scope:'IME',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:empty(),entries:{noProject:{...empty(),inventoryTotal:0},unknown:{...empty(),inventoryTotal:0}},selection:null};
  const nav=createNavigation({document,surface:{role:'workspace',root:document.querySelector('#mount')},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onProjectionRequest:q=>{calls.push(q);return null;}});
  nav.updateFrameProjection(dto);nav.present({kind:'search-known'});
  const input=nav.roots().workspace.shadow.querySelector('input'),preedit='a'.repeat(199)+'中文';input.focus();
  input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,composed:true}));input.value=preedit;
  input.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,isComposing:true,data:'中文'}));
  if(input.value!==preedit||calls.length!==1)throw Error('IME preedit changed or queried');
  nav.updateFrameProjection({...dto,search:{...empty(),query:'',projectId:null}});if(nav.roots().workspace.shadow.querySelector('input')!==input)throw Error('IME input replaced');
  input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,composed:true,data:'中文'}));
  input.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,isComposing:false}));
  if(calls.length!==2||calls.at(-1).search.query!==preedit.slice(0,200))throw Error('IME committed query missing or duplicated');
  await new Promise(resolve=>setTimeout(resolve,0));
  if(nav.roots().workspace.shadow.querySelector('input')?.value!==preedit.slice(0,200)||calls.length!==2)throw Error('old deferred query replaced committed IME');
  nav.present({kind:'show-workspace'});const count=calls.length;
  input.value='old input';input.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true}));input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,composed:true}));
  if(calls.length!==count)throw Error('detached IME input queried');nav.stop();
 });
 // Returning from a short special view must retain the main workspace position.
 await page.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs');
  const empty=()=>({items:[],total:0,offset:0,limit:5,hasMore:false});
  const groups=Array.from({length:12},(_,g)=>({id:'G'+g,name:'Group '+g,nativeName:'Group '+g,lists:{current:{...empty(),items:Array.from({length:17},(_,i)=>({id:'R'+g+'_'+i,nativeTitle:'Row '+i,displayTitle:'Row '+i,nativeUrl:'https://chatgpt.com/c/R'+g+'_'+i,membership:'PROJECT',projectId:'G'+g,segment:0})),total:17,limit:17},old:empty(),unknown:empty()}}));
  const dto={protocol:'vaiwl-free-frame/1',role:'workspace',scope:'scroll',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:{...empty(),items:groups,total:12,limit:24},entries:{noProject:{...empty(),inventoryTotal:0},unknown:{...empty(),inventoryTotal:0}},selection:null};
  let releaseMain,holdMain=false;const nav=createNavigation({document,surface:{role:'workspace',root:document.querySelector('#mount')},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onProjectionRequest:q=>q.search?{...dto,groups:{...dto.groups,items:[],total:0},search:{...q.search,items:[],total:0,hasMore:false}}:holdMain?new Promise(resolve=>{releaseMain=()=>resolve(dto);}):dto});
  const paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  nav.updateFrameProjection(dto);nav.showWorkspace();await paint();let scroller=nav.roots().workspace.scroller;scroller.scrollTop=900;await paint();const original=scroller.scrollTop;if(original<500)throw Error('fixture workspace not scrollable');
  // The owner hides the real workspace frame during native reading. Its VIEW
  // can still refresh before the four-grid presentation and frame resize arrive.
  const hostMount=document.querySelector('#mount');nav.enterReading();hostMount.style.display='none';await paint();
  nav.updateFrameProjection(dto);nav.showWorkspace();await paint();hostMount.style.display='block';await paint();
  if(nav.roots().workspace.scroller.scrollTop!==original||nav.view().scroll!==original)throw Error('hidden reading refresh lost workspace return position: '+nav.roots().workspace.scroller.scrollTop+' / '+nav.view().scroll+' expected '+original);
  nav.present({kind:'search-known'});await paint();if(nav.roots().workspace.scroller.scrollTop!==0)throw Error('fixture search not short');
  holdMain=true;nav.enterReading();nav.showWorkspace();await paint();if(nav.view().scroll!==original)throw Error('pending main VIEW overwrote saved scroll');releaseMain();await paint();if(nav.roots().workspace.scroller.scrollTop!==original)throw Error('special view lost main workspace scroll: '+nav.roots().workspace.scroller.scrollTop+' expected '+original);
  // Recorded J1 shape: restore 144, initial height 422 clamps to 129,
  // then height 380 permits 144. Reproduce that transient clamp at larger scale.
  const mount=document.querySelector('#mount'),extent=nav.roots().workspace.scroller.scrollHeight;
  mount.style.height=(extent-100)+'px';nav.restoreFrameView({segment:0,oldOpen:[],sidebarOpen:[],capacities:[],scroll:original,sidebarScroll:0,sidebarVisible:true});nav.updateFrameProjection(dto);await paint();
  if(nav.roots().workspace.scroller.scrollTop>=original||nav.view().scroll!==original)throw Error('transient frame clamp overwrote restored intent');
  mount.style.height='900px';await paint();if(nav.roots().workspace.scroller.scrollTop!==original)throw Error('settled frame did not restore saved scroll');
  const restored=nav.roots().workspace.scroller;restored.dispatchEvent(new WheelEvent('wheel',{bubbles:true,composed:true}));restored.scrollTop=200;await paint();
  mount.style.height='800px';await paint();if(nav.roots().workspace.scroller.scrollTop!==200)throw Error('restoration overrode subsequent user scroll');nav.stop();
 });
 // Native reading can hide a long search/workset without closing that page.
 // A hidden VIEW refresh must preserve its own position until visible resize.
 for(const kind of ['search','workingSet'])await page.evaluate(async kind=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs');
  const empty=()=>({items:[],total:0,offset:0,limit:24,hasMore:false});
  const base={protocol:'vaiwl-free-frame/1',role:'workspace',scope:'special-scroll',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:empty(),entries:{noProject:{...empty(),inventoryTotal:0},unknown:{...empty(),inventoryTotal:0}},selection:null};
  const rows=Array.from({length:24},(_,i)=>({id:'special'+i,nativeTitle:'Known '+i,displayTitle:'Known '+i,nativeUrl:'https://chatgpt.com/c/special'+i,membership:'UNKNOWN',projectId:null,segment:null}));
  let latest;const mount=document.querySelector('#mount'),paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  mount.style.height='400px';
  const nav=createNavigation({document,surface:{role:'workspace',root:mount},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onProjectionRequest:q=>latest={...base,[kind]:{...q[kind],items:rows,total:24,hasMore:false,...(kind==='workingSet'?{currentRefId:null}:{})}}});
  nav.updateFrameProjection(base);nav.present({kind:kind==='search'?'search-known':'show-working-set'});await paint();
  nav.roots().workspace.scroller.scrollTop=320;await paint();
  if(nav.roots().workspace.scroller.scrollTop!==320)throw Error(kind+' fixture not scrollable');
  nav.enterReading();mount.style.display='none';await paint();nav.updateFrameProjection(latest);nav.workspaceEntered();await paint();mount.style.display='block';await paint();
  if(nav.roots().workspace.scroller.scrollTop!==320)throw Error(kind+' hidden return lost position: '+nav.roots().workspace.scroller.scrollTop);
  if(nav.view().scroll!==0)throw Error(kind+' overwrote main workspace position');
  const scroller=nav.roots().workspace.scroller;scroller.dispatchEvent(new WheelEvent('wheel',{bubbles:true,composed:true}));scroller.scrollTop=100;await paint();mount.style.height='450px';await paint();
  if(nav.roots().workspace.scroller.scrollTop!==100)throw Error(kind+' restoration overrode user scroll');
  nav.stop();mount.style.height='800px';
 },kind);
 // Sidebar uses the same durable restoration contract as workspace. A hidden
 // or initially taller frame must not save a browser-clamped zero as user intent.
 await page.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs'),empty=()=>({items:[],total:0,offset:0,limit:5,hasMore:false});
  const mount=document.querySelector('#mount');mount.style.height='1600px';
  const groups=Array.from({length:20},(_,i)=>({id:'S'+i,name:'Sidebar '+i,nativeName:'Sidebar '+i,lists:{current:{...empty(),items:[{id:'ref'+i,nativeTitle:'Member '+i,displayTitle:'Member '+i,nativeUrl:'https://chatgpt.com/c/ref'+i,projectId:'S'+i,membership:'PROJECT',segment:0}],total:1},old:empty(),unknown:empty()}}));
  const dto={protocol:'vaiwl-free-frame/1',role:'sidebar',scope:'sidebar-scroll',current:{nativeUrl:'https://chatgpt.com/c/ref19',projectId:'S19',refId:'ref19'},completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:{...empty(),items:groups,total:20,limit:24},entries:{noProject:{...empty(),inventoryTotal:0},unknown:{...empty(),inventoryTotal:0}},selection:null};
  let route='https://chatgpt.com/c/ref19';const saved=[],nav=createNavigation({document,surface:{role:'sidebar',root:mount},adapter:{currentURL:()=>route,isCurrent:()=>false,status(){}},onViewChange:view=>saved.push(view.sidebarScroll)});
  const paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),list=()=>nav.roots().sidebar.shadow.querySelector('.themes');
  nav.restoreFrameView({segment:0,oldOpen:[],sidebarOpen:[],capacities:[],scroll:0,sidebarScroll:240,sidebarVisible:true});nav.updateFrameProjection(dto);await paint();
  if(list().scrollTop!==0||nav.view().sidebarScroll!==240||saved.some(value=>value!==240))throw Error('sidebar initial clamp overwrote durable scroll intent');
  mount.style.height='360px';await paint();if(list().scrollTop!==240)throw Error('settled sidebar did not restore durable position');
  mount.style.display='none';nav.updateFrameProjection(dto);await paint();if(nav.view().sidebarScroll!==240)throw Error('hidden sidebar repaint overwrote durable position');
  mount.style.display='block';await paint();if(list().scrollTop!==240)throw Error('visible sidebar did not recover position');
  list().dispatchEvent(new WheelEvent('wheel',{bubbles:true,composed:true}));list().scrollTop=80;await paint();mount.style.height='340px';await paint();
  if(list().scrollTop!==80||nav.view().sidebarScroll!==80)throw Error('sidebar restoration overrode subsequent user scroll');
  const fold=()=>nav.roots().sidebar.shadow.querySelector('[aria-label="'+(nav.view().sidebarVisible?'隐藏项目导航':'显示项目导航')+'"]').click();
  fold();await paint();nav.updateFrameProjection(dto);await paint();
  if(nav.view().sidebarScroll!==80)throw Error('collapsed sidebar background refresh erased user scroll');
  fold();await paint();
  if(list().scrollTop!==80)throw Error('expanded sidebar did not restore user scroll');

  nav.restoreFrameView({segment:0,oldOpen:[],sidebarOpen:[],capacities:[],scroll:0,sidebarScroll:180,sidebarVisible:false});nav.updateFrameProjection(dto);await paint();
  const expand=nav.roots().sidebar.shadow.querySelector('[aria-label="显示项目导航"]');
  expand.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,pointerId:7}));
  expand.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,composed:true,pointerId:7}));expand.click();await paint();
  if(list().scrollTop!==180||nav.view().sidebarScroll!==180)throw Error('first expansion erased durable folded sidebar position');
  route='https://chatgpt.com/c/ref0';nav.updateFrameProjection({...dto,current:{nativeUrl:route,projectId:'S0',refId:'ref0'}});await paint();if(list().scrollTop>=80)throw Error('current navigation did not reveal the new current row');
  nav.updateFrameProjection({...dto,current:undefined,scope:'other-sidebar-scope'});await paint();if(nav.view().sidebarScroll!==0||list().scrollTop!==0)throw Error('sidebar position leaked to another scope');
  nav.stop();mount.style.height='800px';
 });
 // Horizon changes keep keyboard focus without replaying a pending choice.
 await page.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs');const empty=()=>({items:[],total:0,offset:0,limit:5,hasMore:false});let settle,calls=0;
  const nav=createNavigation({document,surface:{role:'workspace',root:document.querySelector('#mount')},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onHorizonRequest:()=>{calls++;return new Promise(r=>settle=r);},onProjectionRequest:()=>null});
  nav.updateFrameProjection({protocol:'vaiwl-free-frame/1',role:'workspace',scope:'horizon-focus',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:empty(),entries:{noProject:{...empty(),inventoryTotal:0},unknown:{...empty(),inventoryTotal:0}},selection:null});
  const shadow=nav.roots().workspace.shadow;shadow.querySelector('[aria-label="工作空间设置"]').click();let select=shadow.querySelector('select');select.focus();select.value='14';select.dispatchEvent(new Event('change',{bubbles:true}));
  if(shadow.activeElement!==shadow.querySelector('select'))throw Error('pending horizon lost keyboard focus');
  select=shadow.querySelector('select');select.value='60';select.dispatchEvent(new Event('change',{bubbles:true}));if(calls!==1||select.value!=='30')throw Error('pending horizon accepted another choice');
  settle({ok:false});await Promise.resolve();await Promise.resolve();if(shadow.activeElement!==shadow.querySelector('select'))throw Error('settled horizon lost keyboard focus');
  select=shadow.querySelector('select');select.value='7';select.dispatchEvent(new Event('change',{bubbles:true}));const outside=document.createElement('button');document.body.append(outside);outside.focus();settle({ok:false});await Promise.resolve();await Promise.resolve();if(document.activeElement!==outside)throw Error('horizon stole user focus');outside.remove();nav.stop();
 });
 // Hidden candidate panels must not acknowledge a clamped scroll restoration.
 await page.evaluate(async()=>{
  const {createFreeFrameCandidates}=await import('/src/host/free-frame-candidates.mjs');
  const {createFrameCandidateMigration}=await import('/src/host/frame-candidate-migration.mjs');
  const container=document.createElement('div');document.body.append(container);container.style.display='none';
  const ui=createFreeFrameCandidates({document,container,onActivate:()=>{throw Error('unexpected activation');}});
  ui.update(Array.from({length:32},(_,i)=>({renderKey:'candidate:c'+i,nativeTitle:'Candidate '+i,titleState:'exact',available:true,reason:null})),{offset:32,total:64,nextOffset:null});
  let revealed=0;const migration=createFrameCandidateMigration({restoreCandidates:p=>ui.restorePosition(p),reveal:()=>{revealed++;return true;}});
  migration.offer({id:'migration-hidden',projectId:'project-1',presentation:{offset:32,scrollTop:137,focused:false},ready:true,focusAllowed:false});
  if(migration.apply()!==false||revealed!==0)throw Error('hidden restoration acknowledged before layout');
  container.style.display='block';if(migration.apply()!==true||revealed!==1)throw Error('visible restoration did not complete');
  const list=container.firstElementChild.shadowRoot.querySelector('ul');if(list.scrollTop!==137)throw Error('candidate position lost');
  // An ordinary data refresh can arrive while the owned panel has no layout.
  container.style.display='none';
  ui.update(Array.from({length:32},(_,i)=>({renderKey:'candidate:c'+i,nativeTitle:'Updated '+i,titleState:'exact',available:true,reason:null})),{offset:32,total:64,nextOffset:null});
  container.style.display='block';
  ui.update(Array.from({length:32},(_,i)=>({renderKey:'candidate:c'+i,nativeTitle:'Updated again '+i,titleState:'exact',available:true,reason:null})),{offset:32,total:64,nextOffset:null});
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  if(container.firstElementChild.shadowRoot.querySelector('ul').scrollTop!==137)throw Error('hidden same-page refresh discarded confirmed scroll');
  ui.stop();container.remove();
 });
 // Real owned-panel DOM: shrinking pages and keyboard continuity share the same flow.
 await page.evaluate(async()=>{
  const {createFreeFrameSnippets}=await import('/src/host/free-frame-snippets.mjs');
  const root=document.createElement('div');document.body.append(root);let total=25,hold=false,settle=null;const calls=[];
  const row=i=>({id:'snippet'+i,refId:'11111111-1111-4111-8111-111111111111',preview:'Preview '+i,title:'Chat',nativeUrl:location.origin+'/c/11111111-1111-4111-8111-111111111111'});
  const result=offset=>({ok:true,workspaceRevision:1,snippets:{offset,limit:12,total,items:Array.from({length:Math.min(12,Math.max(0,total-offset))},(_,i)=>row(offset+i))}});
  const ui=createFreeFrameSnippets({document,container:root,parentOrigin:location.origin,currentRef:{id:'11111111-1111-4111-8111-111111111111',nativeUrl:location.origin+'/c/11111111-1111-4111-8111-111111111111'},request:async m=>{calls.push(m);if(m.type!=='HOST_UI_SNIPPET_LIST')throw Error('unexpected mutation');return hold?new Promise(r=>settle=()=>r(result(m.offset))):result(m.offset);},onClose(){}});
  globalThis.snippetPanelProbe={root,ui,calls,setTotal:n=>total=n,hold:()=>hold=true,release:()=>{hold=false;settle();}};await ui.open();
 });
 const snippetPanel=page.locator('[data-vaiwl-snippets]');
 await snippetPanel.getByRole('button',{name:'下一页',exact:true}).click();
 await snippetPanel.getByText('Preview 12',{exact:true}).waitFor();
 await page.evaluate(()=>{snippetPanelProbe.setTotal(1);snippetPanelProbe.ui.invalidate();});
 await snippetPanel.getByText('Preview 0',{exact:true}).waitFor();
 assert.equal(await snippetPanel.getByRole('button',{name:'上一页',exact:true}).isDisabled(),true);
 await page.evaluate(()=>{snippetPanelProbe.setTotal(25);snippetPanelProbe.ui.invalidate();});
 await snippetPanel.getByText('共 25 个片段',{exact:true}).waitFor();
 await page.evaluate(()=>snippetPanelProbe.hold());
 await snippetPanel.getByRole('button',{name:'下一页',exact:true}).click();
 assert.equal(await snippetPanel.getByRole('button',{name:'下一页',exact:true}).evaluate(n=>document.activeElement===n),true,'pending snippet pagination must preserve keyboard focus');
 const pendingSnippetCalls=await page.evaluate(()=>snippetPanelProbe.calls.length);
 await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>snippetPanelProbe.calls.length),pendingSnippetCalls,'pending keyboard activation must not issue another read');
 await page.evaluate(()=>snippetPanelProbe.release());
 await snippetPanel.getByText('Preview 12',{exact:true}).waitFor();
 assert.equal(await snippetPanel.getByRole('button',{name:'下一页',exact:true}).evaluate(n=>document.activeElement===n),true,'completed snippet pagination must preserve keyboard focus');
 await page.evaluate(()=>snippetPanelProbe.hold());
 await snippetPanel.getByRole('button',{name:'下一页',exact:true}).click();
 await page.evaluate(()=>{const outside=document.createElement('button');outside.id='snippet-external-focus';document.body.append(outside);outside.focus();snippetPanelProbe.release();});
 await snippetPanel.getByText('Preview 24',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement.id),'snippet-external-focus','page reply must not steal external focus');
 await page.evaluate(()=>document.getElementById('snippet-external-focus').remove());
 await snippetPanel.getByRole('button',{name:'返回工作空间',exact:true}).click();
 assert.equal(await snippetPanel.count(),0);
 await page.evaluate(()=>{if(snippetPanelProbe.calls.some(m=>m.type!=='HOST_UI_SNIPPET_LIST'))throw Error('paging wrote assets');snippetPanelProbe.ui.stop();snippetPanelProbe.root.remove();delete globalThis.snippetPanelProbe;});
 // Current project expansion is derived; explicit choices survive frame return.
 await page.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs');
  const empty=()=>({items:[],total:0,offset:0,limit:5,hasMore:false});let url='',saved;
  const make=()=>createNavigation({document,surface:{role:'sidebar',root:document.querySelector('#mount')},adapter:{currentURL:()=>url,isCurrent:()=>false,status(){}},onViewChange:v=>{saved=v;},onProjectionRequest:()=>null});
  let nav=make();const route=id=>{url='https://chatgpt.com/c/'+id;nav.updateFrameProjection({protocol:'vaiwl-free-frame/1',role:'sidebar',scope:'A',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:{...empty(),items:['P1','P2'].map(id=>({id,name:id,nativeName:id,lists:{current:empty(),old:empty(),unknown:empty()}})),total:2},entries:{noProject:{...empty(),inventoryTotal:0},unknown:{...empty(),inventoryTotal:0}},selection:null,current:{nativeUrl:url,refId:id,projectId:id}});};
  window.sidebarCase={route,remount(){const {freeSession,...layout}=saved;nav.stop();nav=make();nav.restoreFrameView(layout);route('P2');},stop:()=>nav.stop()};route('P1');route('P2');
 });
 assert.equal(await page.getByRole('button',{name:'侧栏项目 P1',exact:true}).getAttribute('aria-expanded'),'false');
 assert.equal(await page.getByRole('button',{name:'侧栏项目 P2',exact:true}).getAttribute('aria-expanded'),'true');
 await page.getByRole('button',{name:'侧栏项目 P2',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'侧栏项目 P2',exact:true}).getAttribute('aria-expanded'),'false');
 await page.evaluate(()=>sidebarCase.remount());
 assert.equal(await page.getByRole('button',{name:'侧栏项目 P2',exact:true}).getAttribute('aria-expanded'),'false');
 await page.evaluate(()=>sidebarCase.stop());
 assert.deepEqual(errors,[]);
});

// Product layout regression through the formal renderer. These are fixture
// records, not evidence of account inventory or personal-use acceptance.
test('approved v2.7 sparse workspace, unknown inventory and native actions',{timeout:30000},async t=>{
 const root=resolve('.'),server=http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/frame'){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><body style="margin:0;height:900px"><div id="mount" style="height:100%"></div>');return;}if(!/^\/src\/(navigation|data|b1|host)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('path');res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(root,'.'+path)));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;t.after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));});browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();await page.setViewportSize({width:1150,height:900});await page.goto(origin+'/frame');
 await page.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs'),p=(items=[],total=items.length,offset=0,limit=5)=>({items,total,offset,limit,hasMore:offset+items.length<total});
  const ref=(id,title,segment,membership='PROJECT')=>({id,nativeTitle:title,displayTitle:title,nativeUrl:'https://chatgpt.com/c/'+id,available:true,membership,projectId:membership==='PROJECT'?'P1':null,segment,freshness:'last-known',membershipFreshness:'last-known'});
  const unknown=Array.from({length:48},(_,i)=>ref('U'+i,i===0?'已入列的新聊天':'已知聊天 '+i,null,'UNKNOWN'));
  const group={id:'P1',name:'一个已知项目：原生标题很长时也应完整呈现',nativeName:'一个已知项目：原生标题很长时也应完整呈现',segment:0,freshness:'last-known',lists:{current:p([ref('C1','当前窗口',0)]),old:p([ref('C2','旧窗口',2)]),unknown:p([ref('C3','时间未定窗口',null)])}};
  const dto={protocol:'vaiwl-free-frame/1',role:'workspace',scope:'A',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:true,maxSegment:2},groups:p([group],1,0,24),entries:{noProject:{...p(),inventoryTotal:0},unknown:{...p(unknown.slice(0,5),48),inventoryTotal:48}},selection:null,current:{nativeUrl:group.lists.current.items[0].nativeUrl,refId:'C1',projectId:'P1'}};
  let nav;const adapter={currentURL:()=>dto.current.nativeUrl,status(){},nativeHref:u=>u,navigationPlan:r=>({plan:{mode:'href',target:{kind:'resolved',entity:'conversation',nativeId:r.id,navigationURL:r.nativeUrl},disposition:'same-tab'}})};
  nav=createNavigation({document,surface:{role:'workspace',root:document.querySelector('#mount')},adapter,onProjectionRequest:q=>{const next=structuredClone(dto);for(const w of q.rowWindows??[])if(w.groupId===null&&w.list==='unknown')next.entries.unknown={...p(unknown.slice(w.rowOffset,w.rowOffset+w.rowLimit),48,w.rowOffset,w.rowLimit),inventoryTotal:48};if(q.list==='unknown'&&q.groupId==null)next.selection={groupId:null,list:'unknown',...p(unknown.slice(q.rowOffset,q.rowOffset+q.rowLimit),48,q.rowOffset,q.rowLimit)};return next;}});nav.updateFrameProjection(dto);
  globalThis.productCase={nav,dto,group,read(){const s=nav.roots().workspace.shadow,c=s.querySelector('.card'),w=s.querySelector('.workspace');return {cards:s.querySelectorAll('.card').length,width:c?.getBoundingClientRect().width,scroll:w.scrollWidth,viewport:w.clientWidth,text:s.textContent,stale:s.querySelectorAll('[data-freshness="last-known"]').length,labels:s.querySelectorAll('.freshness-label').length,selected:s.querySelectorAll('[aria-current="page"]').length,unknown:s.querySelector('[data-free-list="unknown"]')?.className,whiteSpace:c?getComputedStyle(c.querySelector('.theme-name')).whiteSpace:null};}};
 });
 let state=await page.evaluate(()=>productCase.read());assert.equal(state.cards,1);assert(state.width<=356.1);assert.equal(state.labels,0);assert(state.stale>=3);assert(!state.text.includes('上次确认'));assert.equal(state.whiteSpace,'normal');assert.equal(state.selected,1);assert(!state.unknown.includes('search'));
 assert.equal(await page.getByRole('button',{name:'较近的30日',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'旧窗口',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'其他已知聊天',exact:true}).getAttribute('aria-expanded'),'true');await page.getByRole('link',{name:'已入列的新聊天',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'已入列的新聊天',exact:true}).getAttribute('href'),'https://chatgpt.com/c/U0');
 await page.getByRole('button',{name:'显示更多其他已知聊天',exact:true}).click();await page.waitForFunction(()=>productCase.nav.roots().workspace.shadow.querySelectorAll('[data-free-list="unknown"] [data-ref-id]').length===17);
 await page.getByRole('button',{name:'展开旧窗口 一个已知项目：原生标题很长时也应完整呈现',exact:true}).click();await page.getByRole('link',{name:'旧窗口',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>productCase.nav.roots().workspace.shadow.querySelectorAll('[data-free-list="unknown"] [data-ref-id]').length),17);
 await page.screenshot({path:resolve(tmpdir(),'vaiwl-v27-formal-desktop.png')});
 await page.setViewportSize({width:360,height:800});await page.waitForTimeout(50);state=await page.evaluate(()=>productCase.read());assert(state.width<=state.viewport);assert(state.scroll<=state.viewport+1);await page.screenshot({path:resolve(tmpdir(),'vaiwl-v27-formal-narrow.png')});
 // Exact layout choices survive a repaint; settings provides the same actions
 // when the native sidebar cannot safely be replaced.
 await page.evaluate(()=>productCase.nav.updateFrameProjection(productCase.dto));assert.equal(await page.getByRole('button',{name:'其他已知聊天',exact:true}).getAttribute('aria-expanded'),'true');
 await page.getByRole('button',{name:'工作空间设置',exact:true}).click();assert.equal(await page.getByRole('button',{name:'查找已知项目与聊天',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'当前工作集',exact:true}).count(),1);
 await page.evaluate(()=>{const c=productCase;c.nav.invalidate();const empty={items:[],total:0,offset:0,limit:5,hasMore:false};c.nav.updateFrameProjection({...c.dto,current:undefined,groups:{...empty,limit:24},entries:{noProject:{...empty,inventoryTotal:0},unknown:{...empty,inventoryTotal:0}}});});await page.getByText('这个区间还没有活跃主题',{exact:true}).waitFor();await page.evaluate(()=>productCase.nav.stop());
});
