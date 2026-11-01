/** Collector verification only: disposable headless MV3, existing fixture, no account. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {collectFrameAttribution,mountBreakpointLine} from '../../tools/frame-attribution/collector.mjs';

const C='33333333-3333-4333-8333-333333333333';
const D='44444444-4444-4444-8444-444444444444';
const writer=`new MutationObserver(()=>{
 for(const frame of document.querySelectorAll('[data-va-owned]>iframe')){
  if(!frame.hasAttribute('srcdoc')) frame.setAttribute('srcdoc','');
 }
}).observe(document.body,{childList:true,subtree:true});`;
const dir=await mkdtemp(join(tmpdir(),'vaiwl-attribution-verified-'));
const report={status:'RUNNING',scope:'COLLECTOR_ISOLATED_HEADLESS_ONLY',realAccount:'NOT_RUN',cases:[]};
let mode='none',context;const requests=[];
const server=createServer((req,res)=>{
 requests.push(req.url);res.writeHead(200,{'Content-Type':req.url==='/writer.js'?'text/javascript':'text/html','Cache-Control':'no-store'});
 res.end(req.url==='/writer.js'?writer:observedDesktopHTML(req.url.endsWith(D)?D:C)+(mode==='page'?'<script src="/writer.js"></script>':''));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
const built=packageHost(join(dir,'package'),{offlineOrigin:origin,browserLocal:true});

// Match the documented readEvents envelope. Only this isolated test adapter
// owns a CDP connection; the collector itself knows no ports/processes/profiles.
function bufferedCdp(session,{emptyUrls=false,truncated=false,invalidateOnce=false}={}){
 let sequence=0,queue=[],reads=0,invalidated=false;const waiters=new Set(),handlers=[],errors=[],trace=[];
 const updated=()=>trace.push({event:'DOM.documentUpdated'});session.on('DOM.documentUpdated',updated);handlers.push(['DOM.documentUpdated',updated]);
 for(const method of ['Debugger.scriptParsed','Debugger.paused']){
  const handler=params=>{
   if(emptyUrls&&method==='Debugger.paused')params={...params,callFrames:params.callFrames.map(f=>({...f,url:''}))};
   queue.push({sequence:++sequence,source:{tabId:1},method,params});
   for(const wake of waiters)wake();
  };session.on(method,handler);handlers.push([method,handler]);
 }
 return {
  async send(method,params){trace.push({send:method,nodeId:params?.nodeId});try{
   if(invalidateOnce&&!invalidated&&method==='DOMDebugger.setDOMBreakpoint'){
    invalidated=true;await session.send('DOM.disable');await session.send('DOM.enable');trace.push({fixtureOnly:'invalidate-frontend-ids'});
   }
   const result=await session.send(method,params);trace.push({reply:method,nodeId:result?.nodeId});return result;
  }catch(error){errors.push({method,error:error.message});throw error;}},
  errors,trace,
  async readEvents(options={}){
   reads++;const after=options.afterSequence??sequence;
   if(!queue.some(e=>e.sequence>after)&&options.timeoutMs){
    await new Promise(resolve=>{const done=()=>{clearTimeout(timer);waiters.delete(done);resolve();};const timer=setTimeout(done,options.timeoutMs);waiters.add(done);});
   }
   const all=queue.filter(e=>e.sequence>after&&options.methods.includes(e.method)),events=all.slice(0,options.limit),hasMore=all.length>events.length;
   const cursor=hasMore?events.at(-1).sequence:sequence;
   queue=queue.filter(e=>e.sequence>cursor);
   return {cursor,events,hasMore,truncated:truncated&&reads===2};
  },
  close(){for(const [method,handler]of handlers)session.off(method,handler);}
 };
}
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1000,height:900},
  executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Users/hhf/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing':'/usr/bin/chromium'),
  ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const browserCdp=await context.browser().newBrowserCDPSession();
 const installed=await browserCdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const extensionOrigin=`chrome-extension://${installed.id}`;
 const mountLine=mountBreakpointLine(await readFile(join(built.unpacked,'src/navigation/mount-surface.mjs'),'utf8'));
 const writerPath=join(dir,'fixture-writer');await mkdir(writerPath);
 await writeFile(join(writerPath,'manifest.json'),JSON.stringify({manifest_version:3,name:'Isolated attribution fixture',version:'1.0',content_scripts:[{matches:[origin+'/*'],js:['writer.js'],run_at:'document_end',world:'ISOLATED'}]}));
 await writeFile(join(writerPath,'writer.js'),`if(location.pathname==='/c/${D}') {\n`+writer+'\n}');
 const otherExtension=await browserCdp.send('Extensions.loadUnpacked',{path:writerPath});
 for(const scenario of process.env.VAIWL_ATTRIBUTION_CASE?[process.env.VAIWL_ATTRIBUTION_CASE]:['page','page-empty-url-truncated','page-node-invalidated','extension','none']){
  mode='none';const page=await context.newPage();await page.goto(origin+'/c/'+C);
  await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);
  const session=await context.newCDPSession(page),adapter=bufferedCdp(session,{emptyUrls:scenario.includes('empty'),truncated:scenario.includes('truncated'),invalidateOnce:scenario.includes('invalidated')});
  mode=scenario.startsWith('page')?'page':'none';
  const result=await collectFrameAttribution({cdp:adapter,reload:()=>scenario==='extension'?page.goto(origin+'/c/'+D,{waitUntil:'commit',timeout:10000}):page.reload({waitUntil:'commit',timeout:10000}),extensionOrigin,mountLine,observationMs:scenario==='none'?2500:10000});
  report.cases.push({scenario,result,adapterErrors:adapter.errors,trace:adapter.trace});await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));
  assert.equal(result.armed,2,JSON.stringify(result));
  if(scenario.includes('invalidated'))assert.equal(result.nodeRebindings,1);
  if(scenario==='none')assert.equal(result.state,'DEADLINE');
  else {assert.equal(result.state,'WRITER_OBSERVED',JSON.stringify(result));assert.equal(result.writes[0].stack[0].source,scenario==='extension'?`chrome-extension://${otherExtension.id}/writer.js`:origin+'/writer.js');}
  assert.equal(result.cleanup.debugger,'DONE');
  assert(['DONE','DOM_ALREADY_INACTIVE'].includes(result.cleanup.dom));
  assert.equal(await page.evaluate(()=>!!document.querySelector('[contenteditable],textarea')),true);
  assert.equal(await page.evaluate(()=>document.querySelector('[contenteditable],textarea').textContent), 'fixture draft');
  if(scenario==='none'){
   let timer;
   try{await Promise.race([page.evaluate(()=>document.querySelector('[data-va-owned]>iframe').setAttribute('srcdoc','')),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cleanup-left-page-paused')),1500);})]);}
   finally{clearTimeout(timer);}
  }
  adapter.close();await session.detach();await page.close();
 }
 assert(requests.every(p=>!p.startsWith('/api/')&&!p.startsWith('/backend-api/')));
 verifyHost(built.unpacked);report.packageUnmodified=true;
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await context?.close();await new Promise(r=>server.close(r));await guard.close();await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({...report,report:join(dir,'report.json')}));
