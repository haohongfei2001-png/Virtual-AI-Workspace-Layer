import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {readCurrentWindowScroll} from './window-scroll-observer.mjs';

// Browser focusability is the oracle: a DOM double that permits disabled.focus()
// would hide this regression. Projections are synthetic; this is not MV3/G/U.
const out=process.argv[2];assert(out,'output-json-required');
const report={kind:'WEB_MECHANISM_ONLY',realChatGPT:'NOT_RUN',MV3:'NOT_RUN',checks:[],errors:[],sourceHashes:{}};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
report.observerHash=hash(await readFile(new URL('./window-scroll-observer.mjs',import.meta.url)));
const started=performance.now();let browser;
const server=http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(path==='/host'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><textarea id="native">UNSENT LOCAL FIXTURE</textarea><iframe src="/frame" style="width:900px;height:800px"></iframe>');return;}
 if(path==='/frame'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><body style="margin:0"><main id="mount" style="height:750px"></main>');return;}
 if(!/^\/src\/(navigation|data|b1|host)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('not-allowed');
 const bytes=await readFile(resolve('.'+path));report.sourceHashes[path.slice(1)]=hash(bytes);res.setHeader('Content-Type','text/javascript');res.end(bytes);
}catch{res.writeHead(404);res.end();}});
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),args:['--disable-background-networking']});
 report.browser=browser.version();const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin+'/host');const frame=page.frames().find(f=>f.url()===origin+'/frame');assert(frame);
 await frame.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs');
  const p=()=>({items:[],total:0,offset:0,limit:5,hasMore:false});
  globalThis.setup=({H=30,maxSegment=0}={})=>{
   globalThis.nav?.stop();
   globalThis.dto={protocol:'vaiwl-free-frame/1',role:'workspace',scope:'scopeA',completeSnapshot:false,segment:0,viewSession:{H,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:maxSegment>0,maxSegment},groups:{...p(),limit:24},entries:{noProject:{...p(),inventoryTotal:0},unknown:{...p(),inventoryTotal:0}},selection:null};
   globalThis.nav=createNavigation({document,surface:{role:'workspace',root:document.querySelector('#mount')},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onProjectionRequest:()=>null});nav.updateFrameProjection(dto);
  };
  globalThis.focusResult=()=>{const s=nav.roots().workspace.shadow,n=s.activeElement;return {workspace:n===s.querySelector('.workspace'),label:n?.getAttribute('aria-label')??null,disabled:n?.disabled===true,connected:n?.isConnected===true};};
 });
 for(const {H,mode,key} of [{H:30,mode:'search-known',key:'Enter'},{H:30,mode:'search-known',key:'Space'},{H:30,mode:'show-working-set',key:'Enter'},{H:14,mode:'search-known',key:'Enter'}]){
  await frame.evaluate(options=>{setup(options);nav.present({kind:options.mode});},{H,mode});
  const close=frame.getByRole('button',{name:mode==='search-known'?'关闭已知查找':'返回主题视图',exact:true});await close.focus();await close.press(key);
  const result=await frame.evaluate(()=>focusResult());
  await frame.evaluate(()=>nav.updateFrameProjection(dto));const afterRefresh=await frame.evaluate(()=>focusResult());
  report.checks.push({H,mode,key,...result,afterRefresh});
  // Continue collecting all cases, retaining the original failures together.
  if(result.workspace){await page.keyboard.press('Tab');assert.equal(await frame.evaluate(()=>{const n=nav.roots().workspace.shadow.activeElement;return !!n&&n.isConnected&&!n.disabled;}),true);}
 }
 // A matched focus key can itself become disabled at the end of history.
 await frame.evaluate(()=>setup({H:30,maxSegment:1}));await frame.getByRole('button',{name:'较早的30日',exact:true}).focus();
 await frame.evaluate(()=>nav.updateFrameProjection({...dto,segment:1,navigation:{hasNewer:true,hasOlder:false,maxSegment:1}}));
 report.checks.push({mode:'focused-history-control-became-disabled',...await frame.evaluate(()=>focusResult())});
 // Existing enabled history focus and background/native focus must survive.
 await frame.evaluate(()=>setup({H:30,maxSegment:1}));await frame.getByRole('button',{name:'较早的30日',exact:true}).focus();await frame.evaluate(()=>nav.updateFrameProjection(dto));
 const retained=await frame.evaluate(()=>focusResult());assert.equal(retained.label,'较早的30日');assert.equal(retained.disabled,false);
 await page.locator('#native').focus();await frame.evaluate(()=>nav.updateFrameProjection(dto));assert.equal(await page.locator('#native').evaluate(n=>document.activeElement===n&&n.value==='UNSENT LOCAL FIXTURE'),true);
 report.enabledFocusRetained=true;report.nativeFocusAndDraftRetained=true;assert.deepEqual(report.errors,[]);
 // Finishing a sidebar expansion retires its final "show more" button.
 // Focus must stay in the owning sidebar instead of falling into the document.
 await frame.evaluate(()=>{
  nav.stop();dto.role='sidebar';
  const item=i=>({id:'unknown_'+i,nativeTitle:'Native '+i,displayTitle:'Native '+i,nativeUrl:'https://chatgpt.com/c/unknown_'+i,available:true,membership:'UNKNOWN',projectId:null,segment:null});
  dto.entries.unknown={items:Array.from({length:5},(_,i)=>item(i)),total:6,offset:0,limit:5,hasMore:true,inventoryTotal:6};
  globalThis.sidebarFinal={...dto,entries:{...dto.entries,unknown:{items:Array.from({length:6},(_,i)=>item(i)),total:6,offset:0,limit:17,hasMore:false,inventoryTotal:6}}};
 });
 await frame.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs');
  nav=createNavigation({document,surface:{role:'sidebar',root:document.querySelector('#mount')},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onProjectionRequest:()=>sidebarFinal});nav.updateFrameProjection(dto);
 });
 await frame.getByRole('button',{name:'其他已知聊天',exact:true}).click();
 await frame.getByRole('button',{name:'显示更多其他已知聊天',exact:true}).focus();
 await frame.getByRole('button',{name:'显示更多其他已知聊天',exact:true}).press('Enter');
 await frame.waitForFunction(()=>!nav.roots().sidebar.shadow.querySelector('[aria-label="显示更多其他已知聊天"]'));
 report.sidebarFinalExpansion=await frame.evaluate(()=>{const shadow=nav.roots().sidebar.shadow;return {focusWithin:!!shadow.activeElement,focusedNavigation:shadow.activeElement===shadow.querySelector('.themes'),rows:shadow.querySelectorAll('[data-ref-id]').length};});
 await frame.evaluate(()=>nav.updateFrameProjection(sidebarFinal));
 report.sidebarUpdateRetainsFocus=await frame.evaluate(()=>{const shadow=nav.roots().sidebar.shadow;return shadow.activeElement===shadow.querySelector('.themes');});
 await page.keyboard.press('Tab');
 report.sidebarDisclosureTab=await frame.evaluate(()=>nav.roots().sidebar.shadow.activeElement?.getAttribute('aria-label'));
 assert.equal(report.sidebarDisclosureTab,'其他已知聊天');
 await page.keyboard.press('Tab');
 report.sidebarNextTab=await frame.evaluate(()=>nav.roots().sidebar.shadow.activeElement?.getAttribute('data-ref-id'));
 // A row can also disappear from this sidebar after a same-scope update.
 await frame.evaluate(()=>nav.updateFrameProjection({...sidebarFinal,entries:{...sidebarFinal.entries,unknown:{items:[],total:0,offset:0,limit:17,hasMore:false,inventoryTotal:0}}}));
 report.sidebarRetiredRow=await frame.evaluate(()=>{const shadow=nav.roots().sidebar.shadow;return shadow.activeElement===shadow.querySelector('.themes');});
 await page.locator('#native').focus();await frame.evaluate(()=>nav.updateFrameProjection(sidebarFinal));
 assert.equal(await page.locator('#native').evaluate(n=>document.activeElement===n&&n.value==='UNSENT LOCAL FIXTURE'),true);
 // Reproduce the observer's two-operation race in a controlled order: resolve
 // the old element, let the actual renderer replace it, then evaluate the old
 // handle. A disconnected element's zero is not the current viewport's scroll.
 await frame.evaluate(async()=>{
  setup();
  const items=Array.from({length:40},(_,i)=>({id:'unknown_'+i,scope:'scopeA',nativeTitle:'Native '+i,displayTitle:'Native '+i,nativeUrl:'https://chatgpt.com/c/unknown_'+i,available:true,membership:'UNKNOWN',projectId:null,segment:null}));
  dto.entries.unknown={items,total:40,offset:0,limit:40,hasMore:false,inventoryTotal:40};nav.updateFrameProjection(dto);
  nav.roots().workspace.scroller.scrollTop=150;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 });
 const before=await frame.evaluate(readCurrentWindowScroll);assert.equal(before.top,150);
 const retired=await frame.locator('.workspace').elementHandle();assert(retired);
 await frame.evaluate(()=>nav.updateFrameProjection(dto));
 const stale=await retired.evaluate(n=>({top:n.scrollTop,connected:n.isConnected,height:n.clientHeight}));
 assert.deepEqual(stale,{top:0,connected:false,height:0});
 const current=await frame.evaluate(readCurrentWindowScroll);assert.equal(current.top,150);assert(current.connected&&current.height>0);
 await frame.evaluate(()=>{nav.roots().workspace.scroller.scrollTop=0;});
 const lost=await frame.evaluate(readCurrentWindowScroll);assert.equal(lost.top,0);assert.notEqual(lost.top,before.top,'actual loss must remain a failure of the original equality');
 report.scrollObserver={before,stale,current,realLoss:lost,scope:'CONTROLLED_ELEMENT_RESOLUTION_RENDER_EVALUATION_ORDER_ONLY'};
 await retired.dispose();
 report.ok=report.sidebarRetiredRow&&report.sidebarFinalExpansion.focusedNavigation&&report.sidebarUpdateRetainsFocus&&report.sidebarNextTab==='unknown_0'&&report.checks.length===5&&report.checks.every(c=>c.workspace&&!c.disabled&&c.connected&&(!c.afterRefresh||c.afterRefresh.workspace));if(!report.ok)process.exitCode=1;
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{
 await browser?.close();if(server.listening)await new Promise(r=>server.close(r));
 report.sourceStable=true;for(const [path,digest]of Object.entries(report.sourceHashes))if(hash(await readFile(path))!==digest)report.sourceStable=false;
 report.testHash=hash(await readFile('tests/host/frame-focus-return-browser.mjs'));if(!report.sourceStable){report.ok=false;process.exitCode=1;}
 report.observerStable=report.observerHash===hash(await readFile(new URL('./window-scroll-observer.mjs',import.meta.url)));if(!report.observerStable){report.ok=false;process.exitCode=1;}
 report.elapsedMs=performance.now()-started;await writeFile(out,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report));
