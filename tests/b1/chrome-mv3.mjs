/** Actual Chrome MV3 B1 fixture. All pages and account labels synthetic;
 * NEVER uses the user's Chrome profile or visits ChatGPT.
 */
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const base=resolve(import.meta.dirname,'../..');
const work=process.env.B1_WORKDIR;
if(!work||!resolve(work).startsWith('/tmp/vaiwl-b1-'))throw Error('dedicated temp dir required');
const {chromium}=await import(pathToFileURL(join(work,'tools/node_modules/playwright/index.mjs')).href);
const html=readFileSync(join(base,'experiments/b1/fixture/host.html'),'utf8');
const extension=join(work,'built-extension');
const report={schema:'VAIWL_B1_CHROME_FIXTURE_V1',level:'REAL_CHROME_SYNTHETIC_ONLY',
  environment:{},results:[],pageErrors:[],externalRequests:[],startedAt:new Date().toISOString()};
const out=join(work,'chrome-b1.json'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer((req,res)=>{
 if(req.method==='GET'&&/^\/b1-fixture\/[AB]\.html$/.test(req.url)){
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);
 }else{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let context,cdp,extensionId;
const save=()=>writeFileSync(out,JSON.stringify(report,null,2));
async function record(id,fn){
 const start=performance.now(),item={id,level:report.level};
 try{Object.assign(item,await fn());item.status='PASS';}
 catch(e){item.status='FAIL';item.error=e.message;item.stack=(e.stack||'').split('\n').slice(0,3).join(' | ');}
 item.elapsedMs=Math.round(performance.now()-start);report.results.push(item);save();console.log(JSON.stringify(item));
}
const label=async p=>{
 const raw=await p.locator('[data-b1-result]').textContent();
 try{return JSON.parse(raw);}catch{return {raw};}
};
async function action(p,name){
 const l=p.locator('[data-b1-result]'),previous=Number(await l.getAttribute('data-done')||0);
 await p.locator('[data-b1-action="'+name+'"]').click();
 await p.waitForFunction(old=>Number(document.querySelector('[data-b1-result]')?.dataset.done||0)>old,previous,{timeout:4000});
 return label(p);
}
async function open(pageName='A'){
 const p=await context.newPage();
 p.on('pageerror',e=>report.pageErrors.push(String(e.message)));
 await p.route('**/*',route=>{
  if(route.request().url().startsWith(origin+'/'))return route.continue();
  report.externalRequests.push(route.request().url);return route.abort();
 });
 await p.goto(origin+'/b1-fixture/'+pageName+'.html');
 await p.locator('[data-b1-probe]').waitFor({timeout:4000});
 await p.waitForFunction(()=>document.querySelector('[data-b1-result]')?.textContent.includes('"BOUND"'),null,{timeout:4000});
 return p;
}
try{
 context=await chromium.launchPersistentContext(
   mkdtempSync(join(work,'profile-')),{
     executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
     headless:true,ignoreDefaultArgs:['--disable-extensions'],
     args:['--enable-unsafe-extension-debugging'],
     timezoneId:'Asia/Shanghai'
   });
 cdp=await context.browser().newBrowserCDPSession();
 report.environment.browser=(await cdp.send('Browser.getVersion')).product;
 report.environment.chromeVersion=report.environment.browser;
 report.environment.node=process.version;
 extensionId=(await cdp.send('Extensions.loadUnpacked',{path:extension})).id;
 report.extensionIdLength=extensionId.length;
 save();
 let a,b;
 await record('B01-real-MV3-content-and-service-worker',async()=>{
  a=await open('A');const v=await label(a);assert.equal(v.ok,true);
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+extensionId+'/'));
  assert(worker,'MV3 worker actually started');
  return {documentIdPresent:!!v.documentId,hasLease:!!v.leaseId,realWorker:true};
 });
 await record('B02-real-IDB-upsert-get-CAS-and-idempotency',async()=>{
  let v=await action(a,'PUT');assert.equal(v.ok,true);assert.equal(v.record.revision,1);
  v=await action(a,'GET');assert.equal(v.record.revision,1);
  v=await action(a,'PUT');assert.equal(v.record.revision,2);
  v=await action(a,'PUT_FIXED');assert(v.ok&&!v.replayed);
  v=await action(a,'PUT_FIXED');assert(v.ok&&v.replayed);
  v=await action(a,'PUT_CONFLICT');assert.equal(v.reason,'operation-replay-conflict');
  const list=await action(a,'LIST');assert(list.ok&&list.records.length===2);
  return {recordRevision:2,replayDetected:true,conflictingOperationRejected:true};
 });
 await record('B03-C09-document-handoff-before-old-lease-expires',async()=>{
  const started=performance.now();
  await a.goto(origin+'/b1-fixture/B.html');
  await a.locator('[data-b1-probe]').waitFor({timeout:4000});
  await a.waitForFunction(()=>document.querySelector('[data-b1-result]')?.textContent.includes('"BOUND"'),null,{timeout:4000});
  const elapsed=Math.round(performance.now()-started),v=await label(a);
  assert(v.ok,'browser-current document must replace previous document without lease delay');
  const list=await action(a,'LIST');
  assert(list.ok);assert.equal(list.records.length,0,'A records not visible to B');
  return {elapsedMs:elapsed,oldLeaseExpiryMs:20000,isolatedScope:true};
 });
 await record('B04-switch-back-A-persistent-scoped-reference',async()=>{
  await a.goto(origin+'/b1-fixture/A.html');
  await a.locator('[data-b1-probe]').waitFor({timeout:4000});
  await a.waitForFunction(()=>document.querySelector('[data-b1-result]')?.textContent.includes('"BOUND"'));
  const v=await action(a,'GET');assert.equal(v.record?.revision,2);
  return {scopeRestoredWithoutLeakingB:true,persistedRevision:v.record.revision};
 });
 await record('B05-second-tab-CAS-conflict-and-scope-isolation',async()=>{
  b=await open('A');
  const v=await action(b,'PUT');
  assert.equal(v.reason,'revision-conflict');
  const read=await action(b,'GET');assert.equal(read.record.revision,2);
  return {secondTabGetsSameScopeRecord:true,staleRevisionRejected:true};
 });
 await record('B05B-real-two-tab-atomic-create-CAS',async()=>{
  const raceTab=await open('A');
  try{
   const outcomes=await Promise.all([action(a,'RACE'),action(raceTab,'RACE')]);
   assert.equal(outcomes.filter(x=>x.ok).length,1);
   assert.equal(outcomes.filter(x=>x.reason==='revision-conflict').length,1);
   return {atomicWinners:1,conflicts:1};
  }finally{await raceTab.close();}
 });
 await record('B06-SPA-history-update-revokes-lease',async()=>{
  await b.evaluate(()=>history.pushState({synthetic:true},'', '/b1-fixture/B.html'));
  await b.waitForFunction(()=>document.querySelector('[data-b1-result]')?.textContent.includes('route-revoked'),null,{timeout:1500});
  const v=await action(b,'CHECK');assert(!v.ok);
  return {revoked:true,hostHistory:await b.evaluate(()=>history.state)};
 });
 await record('B07-native-fixture-nodes-and-events-unchanged',async()=>{
  const result=await a.evaluate(()=>{
   const native=document.querySelector('#native-main'),draft=document.querySelector('#synthetic-draft');
   const original=draft;draft.value='未发送的合成文字';
   document.querySelector('#synthetic-tool').click();
   return {same:document.querySelector('#synthetic-draft')===original,
    draft:draft.value,result:document.querySelector('#native-result').textContent};
  });
  assert.equal(result.same,true);assert.equal(result.result,'tool-used');
  assert.equal(result.draft,'未发送的合成文字');
  return result;
 });
 await record('B08-real-worker-stop-rebind-and-IDB-recovery',async()=>{
  const session=await context.newCDPSession(a);
  await session.send('ServiceWorker.enable');
  await session.send('ServiceWorker.stopAllWorkers');
  await sleep(230);
  await session.detach();
  const v=await action(a,'BIND');assert.equal(v.ok,true);
  const ref=await action(a,'GET');assert.equal(ref.record.revision,2);
  const replay=await action(a,'PUT_FIXED');assert(replay.ok&&replay.replayed);
  return {persisted:true,revision:ref.record.revision,workerRebound:true,operationReplaySurvivedRestart:true};
 });
 await record('B09-page-origin-cannot-enumerate-extension-DB',async()=>{
  const names=await a.evaluate(async()=>await indexedDB.databases());
  assert(!names.some(d=>d.name==='vaiwl-b1-v1'));
  return {pageDBCount:names.length,extensionDBVisibleToPage:false};
 });
 await record('B10-synthetic-only-permission-and-requests',async()=>{
  assert.equal(report.externalRequests.length,0);
  assert.equal(report.pageErrors.length,0);
  const manifest=JSON.parse(readFileSync(join(extension,'manifest.json')));
  assert.deepEqual(manifest.host_permissions,['http://127.0.0.1/*']);
  return {realChatGPTRequests:0,pageErrors:0};
 });
 if(a)await a.close();if(b)await b.close();
}catch(e){report.fatal=String(e.stack||e);console.error(e);}
finally{
 if(context)await context.close();
 await new Promise(resolve=>server.close(resolve));
 report.endedAt=new Date().toISOString();
 report.counts={pass:report.results.filter(x=>x.status==='PASS').length,
  fail:report.results.filter(x=>x.status==='FAIL').length};
 save();console.log('B1_CHROME_RESULT '+JSON.stringify(report.counts));
}
if(report.fatal||report.counts.fail)process.exitCode=1;
