import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),scriptPath=fileURLToPath(import.meta.url),scriptHash=hash(await readFile(scriptPath));
const paths=['src/host/surface-discovery.mjs','src/host/bounded-handle-registry.mjs','src/host/contract.mjs','src/host/url-policy.mjs','src/b1/identity.mjs'];
const sources=new Map(await Promise.all(paths.map(async p=>[p,await readFile(p,'utf8')]))),sourceHashes=Object.fromEntries([...sources].map(([p,s])=>[p,hash(s)]));
const server=await createHostFixtureServer(),report={evidence:'WEB_MECHANISM_ONLY_REAL_HEADLESS_CHROME',scope:'Actual DOM TreeWalker and bounded registry mechanism; not MV3, authenticated production profile, end-to-end 100k performance or latency-budget acceptance',realChatGPT:'NOT_RUN',scriptHash,sourceHashes,results:[],blockedExternal:[]};let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext();await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==server.origin){report.blockedExternal.push(u.origin);return r.abort();}const source=sources.get(u.pathname.slice(1));return source!==undefined?r.fulfill({contentType:'text/javascript',body:source}):r.continue();});
 const page=await context.newPage();await page.goto(server.url);report.externalBlocked=await page.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.externalBlocked);
 report.results=await page.evaluate(async()=>{
  const {createSurfaceDiscovery}=await import('/src/host/surface-discovery.mjs'),{createURLPolicy}=await import('/src/host/url-policy.mjs');
  document.querySelector('aside section[aria-label="Projects"]').replaceChildren();const root=document.querySelector('aside nav[aria-label="Chat history"]');
  const check=(ok,why)=>{if(!ok)throw Error(why);},results=[];let time=0;
  function populate(size,duplicate=false){const fragment=document.createDocumentFragment();for(let i=0;i<size;i++){const a=document.createElement('a');a.href='/c/'+(duplicate&&i===size-1?'c0':'c'+i);a.textContent='Native '+i;fragment.append(a);}root.replaceChildren(fragment);}
  const make=()=>createSurfaceDiscovery({document,binding:{documentToken:'local-browser',routeEpoch:1},urlPolicy:createURLPolicy({origin:location.origin,profile:{conversationId:id=>id}}),elapsedNow:()=>time});
  const target=id=>({entity:'conversation',nativeId:id,navigationURL:location.origin+'/c/'+id});
  const originalWalker=document.createTreeWalker;let visits=0;document.createTreeWalker=function(...args){const w=originalWalker.apply(this,args);return {nextNode(){visits++;return w.nextNode();}};};
  function scan(d,cursor=null){const before=visits,p=d.scanPage(cursor),stats=d.handleStats();check(visits-before<=259,'unbounded-tree-visits');check(p.payload.candidates.length<=256,'unbounded-candidates');check(p.payload.detachedHandles.length<=512,'unbounded-detached');check(stats.records<=2048,'registry-capacity');return p;}
  function drain(d,p){let total=p.payload.candidates.length,pages=1;while(p.cursor){p=scan(d,p.cursor);total+=p.payload.candidates.length;check(++pages<1000,'nonterminal-pages');}return {total,pages};}
  try{
   populate(100000);const d=make(),first=scan(d),pin=first.payload.candidates[0].target.liveHandle,original=root.firstElementChild;check(d.retainHandles('visible',[pin],30000),'retain-failed');const second=scan(d,first.cursor),old=second.payload.candidates[0].target.liveHandle;
   const all=drain(d,second);check(all.total+256===100000,'missing-loaded-controls');let stats=d.handleStats();check(stats.records===2048&&stats.pinned===1&&stats.owners===1&&!stats.lookupComplete,'wrong-final-cap');check(d.getNode(pin)===original,'pin-lost-during-churn');check(d.getNode(old)===null,'old-unpinned-revived');check(d.resolveLoadedTargets([target('c0'),target('c99999')]).every(x=>x===null),'partial-cache-false-unique');
   results.push({name:'actual-100k-DOM-paging-bounded-records-and-pinned-original-control',status:'PASS',controls:100000,pages:all.pages+1,stats});
   time=30000;check(d.handleStats().pinned===0&&d.handleStats().owners===0,'expired-pin-retained');check(!d.retainHandles('expired',[pin],30000),'expired-deadline-accepted');
   // Force later capacity pressure after expiration using only the original first 2049 controls.
   while(root.children.length>2049)root.lastElementChild.remove();drain(d,scan(d));check(d.getNode(pin)===null,'expired-original-survived-pressure');d.stop();
   results.push({name:'elapsed-expiry-releases-retention-and-capacity-churn-invalidates-old-handle',status:'PASS'});
   populate(2049,true);const duplicates=make(),start=scan(duplicates),firstDuplicate=start.payload.candidates[0].target.liveHandle;drain(duplicates,start);check(duplicates.getNode(firstDuplicate)===null,'duplicate-not-evicted');check(duplicates.resolveLoadedTargets([target('c0')])[0]===null,'surviving-duplicate-false-unique');
   const refreshed=scan(duplicates).payload.candidates[0].target.liveHandle;check(refreshed.id!==firstDuplicate.id,'same-node-old-handle-reused');check(duplicates.getNode(refreshed)===root.firstElementChild,'new-handle-wrong-node');check(duplicates.retainHandles('plan',[refreshed],time+1000),'second-retain-failed');duplicates.invalidate();check(duplicates.getNode(refreshed)===null&&duplicates.handleStats().pinned===0,'invalidate-kept-pin');check(duplicates.handleStats().lookupComplete,'invalidate-not-reset');duplicates.stop();
   results.push({name:'evicted-duplicate-remains-ambiguous-original-revisit-is-fresh-and-invalidate-fences-pin',status:'PASS'});
  }finally{document.createTreeWalker=originalWalker;}
  return results;
 });
 report.browserVersion=browser.version();report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await browser?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(paths.map(async p=>hash(await readFile(p))!==sourceHashes[p]))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(scriptPath))!==scriptHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun){report.status='FAIL';report.error=(report.error??'')+' source-or-script-changed';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/free-surface-handle-retention-browser.json',JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
