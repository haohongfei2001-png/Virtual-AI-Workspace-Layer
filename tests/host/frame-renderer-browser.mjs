import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';

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
  // Observe defaultAllowed before the test-only outer listener suppresses navigation.
  let defaultAllowed=null;link.addEventListener('click',event=>{defaultAllowed=!event.defaultPrevented;event.preventDefault();},{once:true});
  link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true,button:0}));
  check(defaultAllowed&&dispatches.length===1,'modified-click-no-rpc');
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
 assert.equal(result.length,21);assert.deepEqual(errors,[]);
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
  const back=kind==='search'?'关闭派生查找':'返回主题视图';await page.getByRole('button',{name:back,exact:true}).focus();await page.evaluate(()=>pagerCase.complete());
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
 // Current project expansion is derived; explicit choices survive frame return.
 await page.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs');
  const empty=()=>({items:[],total:0,offset:0,limit:5,hasMore:false});let url='',saved;
  const make=()=>createNavigation({document,surface:{role:'sidebar',root:document.querySelector('#mount')},adapter:{currentURL:()=>url,isCurrent:()=>false,status(){}},onViewChange:v=>{saved=v;},onProjectionRequest:()=>null});
  let nav=make();const route=id=>{url='https://chatgpt.com/c/'+id;nav.updateFrameProjection({protocol:'vaiwl-free-frame/1',role:'sidebar',scope:'A',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:{...empty(),items:['P1','P2'].map(id=>({id,name:id,nativeName:id,lists:{current:empty(),old:empty(),unknown:empty()}})),total:2},entries:{noProject:{...empty(),inventoryTotal:0},unknown:{...empty(),inventoryTotal:0}},selection:null,current:{nativeUrl:url,refId:id,projectId:id}});};
  window.sidebarCase={route,remount(){const {freeSession,...layout}=saved;nav.stop();nav=make();nav.restoreFrameView(layout);route('P2');},stop:()=>nav.stop()};route('P1');route('P2');
 });
 assert.equal(await page.getByRole('button',{name:'侧栏主题 P1',exact:true}).getAttribute('aria-expanded'),'false');
 assert.equal(await page.getByRole('button',{name:'侧栏主题 P2',exact:true}).getAttribute('aria-expanded'),'true');
 await page.getByRole('button',{name:'侧栏主题 P2',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'侧栏主题 P2',exact:true}).getAttribute('aria-expanded'),'false');
 await page.evaluate(()=>sidebarCase.remount());
 assert.equal(await page.getByRole('button',{name:'侧栏主题 P2',exact:true}).getAttribute('aria-expanded'),'false');
 await page.evaluate(()=>sidebarCase.stop());
 assert.deepEqual(errors,[]);
});
