import {createHash} from 'node:crypto';
import {digest} from '../../src/data/hash.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
const C='33333333-3333-4333-8333-333333333333',origin='https://chatgpt.com';
const dir=await mkdtemp(join(tmpdir(),'vaiwl-observed-mv3-')),built=packageHost(join(dir,'package'),{observedChatGPTContext:true});
// All browser traffic is locally fulfilled or aborted. A rejecting loopback
// proxy is a second barrier, including worker traffic missed by routing.
const proxy=createServer((_req,res)=>{res.writeHead(403);res.end();});proxy.on('connect',(_req,socket)=>socket.destroy());await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const started=performance.now(),buildInfo=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const report={sourceHashes:buildInfo.sourceHashes,status:'RUNNING',evidence:'ISOLATED_PACKAGED_MV3_SYNTHETIC_ORIGIN',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',requests:[],checks:{},package:built};let context,worker,page;
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1000,height:700},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Users/hhf/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',`--proxy-server=http://127.0.0.1:${proxy.address().port}`]});
 await context.route('**/*',async r=>{
  const req=r.request(),u=new URL(req.url());if(u.protocol==='chrome-extension:')return r.continue();if(u.origin!==origin)return r.abort();report.requests.push({path:u.pathname,method:req.method()});
  const json=value=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  if(u.pathname==='/c/'+C)return r.fulfill({contentType:'text/html',body:observedDesktopHTML(C)});
  if(u.pathname==='/api/auth/session')return json({user:{id:'user-host-fixture'},expires:new Date(Date.now()+3600000).toISOString(),accessToken:'fixture-only-token'});
  if(u.pathname==='/backend-api/accounts/check/v4-2023-04-27')return json({accounts:{'account-host-personal':{account:{account_id:'account-host-personal',structure:'personal',plan_type:'free'}},'account-host-team':{account:{account_id:'account-host-team',structure:'workspace',plan_type:'team'}}},account_order:['account-host-personal','account-host-team']});
  if(u.pathname==='/backend-api/conversations/'+C)return json({conversation_id:C,messages:[]});return r.abort();
 });
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'))??await context.waitForEvent('serviceworker');
 await worker.evaluate(()=>{globalThis.observedFixtureTrace=[];chrome.runtime.onMessage.addListener(m=>{if(observedFixtureTrace.length<150)observedFixtureTrace.push({message:m.type,kind:m.proposal?.kind,profile:m.proposal?.profileId});});for(const event of ['onSendHeaders','onCompleted','onErrorOccurred'])chrome.webRequest[event].addListener(d=>{observedFixtureTrace.push({event,path:new URL(d.url).pathname,tabId:d.tabId,documentId:!!d.documentId,status:d.statusCode});},{urls:['https://chatgpt.com/*']});});
 page=await context.newPage();await page.goto(origin+'/c/'+C);
 assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);report.checks.noScopeBeforeNativeRequest=true;
 await page.evaluate(async c=>{await fetch('/backend-api/conversations/'+c+'?num_turns=10&include_has_versions=true',{headers:{'ChatGPT-Account-Id':'account-host-team'}});},C);
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000});
 const workspace=page.frames().find(f=>f.url()==='chrome-extension://'+id+'/workspace.html');assert(workspace);await workspace.getByText('Native A',{exact:true}).waitFor({timeout:10000});
 const scopes=await workspace.evaluate(async()=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));const repo=new ScopeRepository({indexedDB});try{const db=await repo.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});}finally{repo.close();}});
 assert.deepEqual(scopes,[JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-team'])])]);report.checks.canonicalSecondContext=true;
 report.checks.nativeRequestToScopeAndDualFrame=true;report.checks.nativeTitleVisible=true;
 assert.equal(report.requests.filter(r=>r.path==='/backend-api/conversations/'+C).length,1);report.checks.noAutomaticDetailReads=true;
 assert.equal(await page.locator('textarea').inputValue(),'fixture draft');report.checks.draftPreserved=true;
 report.link=await workspace.locator('a[data-ref-id]').filter({hasText:'Native A'}).evaluate(a=>({href:a.getAttribute('href'),target:a.getAttribute('target'),disabled:a.getAttribute('aria-disabled')}));
 await workspace.locator('a[data-ref-id]').filter({hasText:'Native A'}).click();
 const back=page.getByRole('button',{name:'返回工作空间',exact:true});await back.waitFor({timeout:10000});assert.equal(await back.count(),1);await back.click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:10000});report.checks.readingAndUniqueReturn=true;
 const sidebar=page.frames().find(f=>f.url()==='chrome-extension://'+id+'/sidebar.html');await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
 await workspace.getByRole('searchbox',{name:'已知聊天查找输入'}).fill('Native A');await workspace.locator('a[data-ref-id]').filter({hasText:'Native A'}).waitFor({timeout:10000});report.checks.knownSearch=true;
 assert.equal(await page.locator('textarea').inputValue(),'fixture draft');assert.equal(report.requests.filter(r=>r.path==='/backend-api/conversations/'+C).length,1);
 // C2-only cold recovery must wait for fresh native context. This is not J4
 // automatic foreground recovery and must never be counted as that gate.
 const oldFrames=page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id+'/'));
 const versions=[],lifecycle=await context.newCDPSession(page);lifecycle.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...(e.versions??[])));
 await lifecycle.send('ServiceWorker.enable');
 const waitVersion=async(predicate)=>{const end=performance.now()+10000;while(performance.now()<end){const v=versions.find(predicate);if(v)return v;await new Promise(r=>setTimeout(r,25));}throw Error('observed-worker-version-timeout');};
 const running=await waitVersion(v=>v.scriptURL==='chrome-extension://'+id+'/extension/worker.mjs'&&v.runningStatus==='running');const start=versions.length;
 await lifecycle.send('ServiceWorker.stopWorker',{versionId:running.versionId});await waitVersion((v,i)=>i>=start&&v.versionId===running.versionId&&v.runningStatus==='stopped');
 await page.waitForFunction(()=>document.querySelectorAll('iframe[src^="chrome-extension:"]').length===0,null,{timeout:12000});
 assert(oldFrames.every(f=>f.isDetached()));assert.equal(await page.locator('textarea').inputValue(),'fixture draft');assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);
 report.checks.coldWorkerClearsOldPrivateFrames=true;
 assert.equal(report.requests.filter(r=>r.path==='/backend-api/conversations/'+C).length,1);report.checks.noSyntheticContextRecovery=true;
 await page.evaluate(async c=>{await fetch('/backend-api/conversations/'+c+'?num_turns=10&include_has_versions=true',{headers:{'ChatGPT-Account-Id':'account-host-team'}});},C);
 await page.waitForFunction(()=>document.querySelectorAll('iframe[src^="chrome-extension:"]').length===2,null,{timeout:12000});
 const replacement=page.frames().find(f=>f.url()==='chrome-extension://'+id+'/workspace.html');assert(replacement&&!oldFrames.includes(replacement));
 await replacement.getByText('Native A',{exact:true}).waitFor({state:'attached',timeout:10000});assert.equal(await page.locator('textarea').inputValue(),'fixture draft');
 report.checks.freshNativeContextRebinds=true;report.recoveryQualification='C2_FRESH_REQUEST_ONLY_NOT_J4';
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack);process.exitCode=1;}
finally{
 try{report.trace=await worker?.evaluate(()=>globalThis.observedFixtureTrace);}catch{}
 try{report.pageCount=context.pages().length;report.ui=await Promise.all((page?.frames()??[]).filter(f=>f.url().startsWith('chrome-extension://')).map(async f=>({role:new URL(f.url()).pathname,text:await f.evaluate(()=>[...document.querySelectorAll('*')].filter(n=>n.shadowRoot).flatMap(n=>[...n.shadowRoot.children].filter(c=>c.tagName!=='STYLE').map(c=>c.textContent)).join('\n'))})));report.page=await page?.evaluate(()=>({state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,owned:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length}));}catch{}
 try{await context?.close();}finally{await new Promise(r=>proxy.close(r));}
 report.durationMs=performance.now()-started;report.sourceChangedDuringRun=(await Promise.all(Object.entries(buildInfo.sourceHashes).map(async([path,sha])=>createHash('sha256').update(await readFile(path)).digest('hex')!==sha))).some(Boolean);assert.equal(report.sourceChangedDuringRun,false);
 report.packageVerification=verifyHost(built.unpacked);await writeFile(process.argv[2]??join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
