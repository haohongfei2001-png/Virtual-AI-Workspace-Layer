import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {platform} from 'node:os';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';

// Real input + real frame client/renderer, with an explicit runtime fixture.
// This checks scheduling, not MV3 authorization or a real account source.
test('ready native Project click retains its plan across a background hint',{timeout:30000},async t=>{
 const root=resolve('.'),server=http.createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/frame'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><body style="margin:0;height:800px"><div id="mount" style="height:100%"></div></body></html>');return;}
  if(!/^\/src\/[a-z0-9/-]+\.mjs$/.test(path))throw Error('not-found');
  res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(resolve(root,'.'+path)));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 t.after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium')});
 const context=await browser.newContext({viewport:{width:1280,height:800}}),origin=`http://127.0.0.1:${server.address().port}`;
 const blocked=[];await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();blocked.push(r.request().url());return r.abort();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/frame');
 await page.evaluate(async()=>{
  const {createFreeFrameClient}=await import('/src/host/free-frame-client.mjs'),{createNavigation}=await import('/src/navigation/navigation.mjs');
  const messages=new Set(),disconnects=new Set(),projectId='g-p-11111111111111111111111111111111',url=location.origin+'/g/'+projectId+'/project';
  const empty=()=>({items:[],total:0,offset:0,limit:5,hasMore:false});
  const control={id:'project-handle',documentToken:'document',routeEpoch:1,regionEpoch:1,controlKind:'project'};
  const response=()=>({ok:true,state:'ready',page:{protocol:'vaiwl-free-frame/1',role:'workspace',scope:'fixture',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:{items:[{id:projectId,name:'Native Project',nativeName:'Native Project',nativeUrl:url,available:true,segment:0,lists:{current:empty(),old:empty(),unknown:empty()}}],total:1,offset:0,limit:8,hasMore:false},entries:{noProject:empty(),unknown:empty()},selection:null},navigation:[{projectId,targetKey:'project-plan',plan:{mode:'native-control',planRevision:1,control,target:{kind:'resolved',entity:'project',nativeId:projectId,navigationURL:url,liveHandle:control}}}]});
  const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(Date.now()+20000).toISOString()});
  globalThis.pointerFixture={views:0,dispatches:0,ready:0,holdRead:false,holdDispatch:true,events:[],response};const f=pointerFixture;
  const runtime={connect:()=>({onMessage:{addListener:fn=>messages.add(fn),removeListener:fn=>messages.delete(fn)},onDisconnect:{addListener:fn=>disconnects.add(fn),removeListener:fn=>disconnects.delete(fn)},disconnect(){}}),async sendMessage(m){
   if(m.type==='HOST_UI_VIEW'){f.views++;if(f.holdRead)return new Promise(r=>{f.resolveRead=()=>r(response());});return response();}
   if(m.type==='HOST_UI_DISPATCH_NATIVE'){f.dispatches++;if(f.holdDispatch)return new Promise(r=>{f.resolveDispatch=()=>r({ok:true,state:'dispatched'});});return {ok:true,state:'dispatched'};}
   if(m.type==='HOST_UI_JOIN'||m.type==='HOST_UI_RENEW')return {ok:true,grant:grant()};
   return {ok:true};
  }};
  f.hint=()=>{for(const fn of messages)fn({type:'VAIWL_UI_DATA_CHANGED'});};
  f.client=createFreeFrameClient({document,runtime,role:'workspace',parentOrigin:location.origin,privateRoot:document.querySelector('#mount'),navigationFactory:options=>{f.nav=createNavigation(options);return f.nav;},onState:s=>{if(s.state==='ready')f.ready++;}});
  await f.client.start();
  document.addEventListener('pointerdown',e=>f.events.push({type:'down',trusted:e.isTrusted}),true);
  document.addEventListener('click',e=>f.events.push({type:'click',trusted:e.isTrusted,prevented:e.defaultPrevented}),false);
 });
 await page.waitForFunction(()=>pointerFixture.ready>0);await page.evaluate(()=>{pointerFixture.nav.showWorkspace();if(pointerFixture.nav.showTimePolicyNotice({id:'paint-during-pointer',expiresAt:new Date(Date.now()+5000).toISOString()})!==true)throw Error('local-paint-notice-not-created');});
 const link=()=>page.getByRole('link',{name:'打开项目以新建聊天 Native Project',exact:true});
 await link().waitFor();await link().scrollIntoViewIfNeeded();const box=await link().boundingBox();assert(box);
 const before=await page.evaluate(()=>pointerFixture.views);
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.evaluate(()=>{pointerFixture.nav.clearTimePolicyNotice();for(let i=0;i<20;i++)pointerFixture.hint();});
 assert.deepEqual(await page.evaluate(()=>({views:pointerFixture.views,dispatches:pointerFixture.dispatches})),{views:before,dispatches:0});
 await page.mouse.up();await page.waitForFunction(()=>pointerFixture.dispatches===1);
 assert.equal(await page.evaluate(()=>pointerFixture.views),before);
 await page.evaluate(()=>pointerFixture.resolveDispatch());await page.waitForFunction(n=>pointerFixture.views===n+1&&pointerFixture.ready>=2,before);
 assert.equal(await page.evaluate(()=>pointerFixture.dispatches),1);
 const events=await page.evaluate(()=>pointerFixture.events);assert(events.some(e=>e.type==='down'&&e.trusted));assert(events.some(e=>e.type==='click'&&e.trusted&&e.prevented));
 // Already-running VIEW remains a hard gate. Raw mouse input exercises the
 // disabled target itself; no force click or automatic retry is used.
 await page.evaluate(()=>{pointerFixture.nav.showWorkspace();pointerFixture.holdRead=true;pointerFixture.hint();});
 await link().waitFor();assert.equal(await link().getAttribute('aria-disabled'),'true');const pendingBox=await link().boundingBox();assert(pendingBox);
 await page.mouse.click(pendingBox.x+pendingBox.width/2,pendingBox.y+pendingBox.height/2);
 assert.equal(await page.evaluate(()=>pointerFixture.dispatches),1);
 await page.evaluate(()=>{pointerFixture.holdRead=false;pointerFixture.resolveRead();});await page.waitForFunction(()=>pointerFixture.ready>=3);
 assert.equal(await page.evaluate(()=>pointerFixture.dispatches),1,'ready does not replay the blocked click');
 await page.evaluate(()=>pointerFixture.client.stop());assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
});
