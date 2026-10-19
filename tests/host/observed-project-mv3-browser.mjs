/** Actual packaged worker/content/frames. Synthetic loopback Project context only;
 * no real Project identity, membership, J4 or release claim. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {digest} from '../../src/data/hash.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
const P='g-p-11111111111111111111111111111111',Q='g-p-22222222222222222222222222222222',C='33333333-3333-4333-8333-333333333333',B='44444444-4444-4444-8444-444444444444';
const hash=x=>createHash('sha256').update(x).digest('hex'),testPaths=[fileURLToPath(import.meta.url),...['./fixtures/observed-project.mjs','./fixtures/observed-desktop.mjs','./historical-network-guard.mjs'].map(p=>fileURLToPath(new URL(p,import.meta.url)))];
const testHashes=Object.fromEntries(await Promise.all(testPaths.map(async p=>[p,hash(await readFile(p))]))),requests=[];
let mode='valid',held=null;
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;requests.push({path,method:req.method});
 const json=value=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(path==='/api/auth/session')return json({user:{id:'user-host-fixture'},expires:new Date(Date.now()+3600000).toISOString(),accessToken:'fixture-only-token'});
 if(path==='/backend-api/accounts/check/v4-2023-04-27')return json({accounts:{'account-host-personal':{account:{account_id:'account-host-personal',structure:'personal',plan_type:'free'}},'account-host-team':{account:{account_id:'account-host-team',structure:'workspace',plan_type:'team'}}},account_order:['account-host-personal','account-host-team']});
 if(path==='/backend-api/projects/'+P){if(mode==='old-document'){held=()=>json({});return;}return json({});}
 if(path==='/g/'+P+'/project'){
  let html=observedProjectHTML(P,C).replace('id="project-panel"','id="project-panel" data-vaiwl-fixture-project-id="'+(mode==='wrong-project'?Q:P)+'"'+(mode==='hidden-association'?' hidden':''));
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;
 }
 if(path==='/c/'+B){res.writeHead(200,{'Content-Type':'text/html'});res.end(observedDesktopHTML(B));return;}
 res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
const dir=await mkdtemp(join(tmpdir(),'vaiwl-observed-project-mv3-')),built=packageHost(join(dir,'package'),{offlineOrigin:origin,offlineContext:true,offlineProjectContext:true,offlineObservedProjectLayout:true});
const manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),info=JSON.parse(manifestBytes),start=performance.now();
const report={status:'RUNNING',evidence:'ISOLATED_PACKAGED_MV3_OFFLINE_PROJECT_LAYOUT',realChatGPT:'NOT_RUN',projectIdentity:'SYNTHETIC_LOOPBACK_ASSOCIATION_ONLY',membership:'UNKNOWN',release:'NOT_RELEASE_READY',sourceHashes:info.sourceHashes,testHashes,buildManifestHash:hash(manifestBytes),checks:{},requests,package:built};
let context,page,worker,id,statusPage;
const projectRequest=(p,account='account-host-team')=>p.evaluate(async({P,account})=>{await fetch('/backend-api/projects/'+P,{headers:{'ChatGPT-Account-Id':account}});},{P,account});
const until=async(fn,timeout=10000)=>{const end=performance.now()+timeout;while(performance.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('project-observation-deadline');};
const localState=()=>statusPage.evaluate(async()=>{const {readActiveLocalStatus}=await import(chrome.runtime.getURL('src/host/local-status.mjs'));return readActiveLocalStatus({tabs:chrome.tabs});});
const noFrames=async p=>assert.equal(await p.locator('iframe[src^="chrome-extension:"]').count(),0);
const opened=async()=>page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
const draft=async()=>assert.deepEqual(await page.evaluate(()=>({same:document.querySelector('#draft')===globalThis.originalDraft,text:document.querySelector('#draft').value})),{same:true,text:'fixture draft'});
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:785,height:1193},executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Users/hhf/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));
 worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'))??await context.waitForEvent('serviceworker');
 await worker.evaluate(()=>{globalThis.projectMessageTrace=[];chrome.runtime.onMessage.addListener(m=>{if(projectMessageTrace.length<256)projectMessageTrace.push({type:m.type??m.kind,rows:m.payload?.candidates?.map(x=>({id:x.target?.nativeId,title:x.nativeTitle})),profile:m.profileId});});});
 statusPage=await context.newPage();await statusPage.goto('chrome-extension://'+id+'/status.html');
 // Missing/incorrect DOM association cannot select a Project context. Allow the
 // original six-second association deadline to expire, never extend it.
 for(mode of ['wrong-project','hidden-association']){
  const p=await context.newPage();await p.goto(origin+'/g/'+P+'/project');await p.bringToFront();await until(async()=>(await localState())==='waiting');const before=requests.length;await projectRequest(p);
  await p.waitForTimeout(6200);await noFrames(p);assert.equal(requests.slice(before).filter(r=>r.path==='/backend-api/accounts/check/v4-2023-04-27').length,0);
  report.checks[mode+'-rejects']=true;await p.close();
 }
 mode='old-document';const stale=await context.newPage();await stale.goto(origin+'/g/'+P+'/project');
 const pending=projectRequest(stale).catch(()=>{});await assert.doesNotReject(async()=>{const end=performance.now()+3000;while(!held&&performance.now()<end)await new Promise(r=>setTimeout(r,10));assert(held);});
 await stale.goto(origin+'/g/'+P+'/project');held();held=null;await pending;await stale.waitForTimeout(6200);await noFrames(stale);report.checks.oldDocumentCannotBindReplacement=true;await stale.close();
 mode='valid';page=await context.newPage();await page.goto(origin+'/g/'+P+'/project');
 await page.evaluate(()=>{globalThis.originalDraft=document.querySelector('#draft');});
 // Complete content startup observed independently in the private worker.
 await page.bringToFront();await until(async()=>(await localState())==='waiting');await noFrames(page);report.checks.noScopeFromProjectRouteOrFixtureAttribute=true;
 const rosterBefore=requests.filter(r=>r.path==='/backend-api/accounts/check/v4-2023-04-27').length;await projectRequest(page,'account-not-in-roster');await until(()=>requests.filter(r=>r.path==='/backend-api/accounts/check/v4-2023-04-27').length>rosterBefore);await until(async()=>(await localState())==='waiting');await noFrames(page);report.checks.unlistedAccountCannotMount=true;
 await projectRequest(page);await opened();
 const workspace=page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]'),sidebar=page.frameLocator('iframe[src="chrome-extension://'+id+'/sidebar.html"]');
 await workspace.locator('[data-free-list="unknown"]').getByRole('link',{name:'Native B',exact:true}).waitFor({timeout:10000});
 const frame=page.frames().find(f=>f.url()==='chrome-extension://'+id+'/workspace.html');assert(frame);
 const facts=await frame.evaluate(async()=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs')),base=new ScopeRepository({indexedDB});try{const db=await base.open(),keys=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});const rows=[];for(const key of keys){const [provider,accountId,organizationId]=JSON.parse(key),s=await new NativeRepository({baseRepository:base}).read({verified:true,provider,accountId,organizationId});rows.push({key,projects:s.projects,refs:s.refs,membership:s.membership});}return rows;}finally{base.close();}});
 assert.equal(facts.length,1);assert.equal(facts[0].key,JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-team'])]));
 assert.deepEqual(Object.keys(facts[0].projects),[]);assert.deepEqual(Object.keys(facts[0].membership),[]);assert.deepEqual(Object.keys(facts[0].refs).sort(),[C,B].sort());
 assert.equal(facts[0].refs[B].nativeTitle,'Native B');assert.equal(facts[0].refs[C].nativeTitle,'Native A');report.checks.correctScopeNoProjectOrMembershipUpgrade=true;
 assert.equal(await page.locator('#project-panel').evaluate(n=>getComputedStyle(n).visibility),'hidden');
 for(const selector of ['#project-title','#draft','#model','#project-tabs'])assert(await page.locator(selector).isVisible());await draft();report.checks.nativeRegionsProtected=true;
 await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();await workspace.getByRole('searchbox',{name:'已知聊天查找输入'}).fill('Native B');
 const link=workspace.getByRole('link',{name:'Native B',exact:true});await link.waitFor();
 const newPage=context.waitForEvent('page');await link.click();const chat=await newPage;await chat.waitForURL(origin+'/c/'+B);assert.equal(await chat.evaluate(()=>opener),null);await chat.close();await draft();report.checks.searchAndSafeNativeOpen=true;
 const back=page.getByRole('button',{name:'返回工作空间',exact:true});
 if(await back.isVisible())await back.click();await opened();
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await back.waitFor();assert.equal(await back.count(),1);assert.equal(await page.locator('#project-panel').evaluate(n=>getComputedStyle(n).visibility),'visible');await back.click();await opened();
 await page.locator('#draft').focus();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0);await back.waitFor();assert.equal(await back.count(),1);await draft();await back.click();await opened();report.checks.nativeReadingInputAndUniqueReturn=true;
 await page.evaluate(()=>{document.querySelector('#project-panel').style.minHeight='2000px';document.querySelector('#project-scroll').scrollTop=300;});
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0);assert.equal(await back.count(),0);assert.equal(await page.locator('#project-panel').evaluate(n=>getComputedStyle(n).visibility),'visible');
 await page.evaluate(()=>{document.querySelector('#project-scroll').scrollTop=0;});await back.waitFor();assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);await back.click();await opened();await draft();report.checks.scrollSuspendsAndExplicitReturnRecovers=true;
 // A real worker loss revokes the old frame authority. No fresh native GET is
 // supplied: C2-only must wait safely instead of reusing the old receipt.
 const oldFrames=page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id+'/')),versions=[],lifecycle=await context.newCDPSession(page);
 lifecycle.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...(e.versions??[])));await lifecycle.send('ServiceWorker.enable');
 const waitVersion=async check=>{const end=performance.now()+10000;while(performance.now()<end){const v=versions.find(check);if(v)return v;await new Promise(r=>setTimeout(r,25));}throw Error('project-worker-version-timeout');};
 const running=await waitVersion(v=>v.scriptURL==='chrome-extension://'+id+'/extension/worker.mjs'&&v.runningStatus==='running'),index=versions.length;await lifecycle.send('ServiceWorker.stopWorker',{versionId:running.versionId});await waitVersion((v,i)=>i>=index&&v.versionId===running.versionId&&v.runningStatus==='stopped');
 await page.waitForFunction(()=>!document.querySelector('iframe[src^="chrome-extension:"]'),null,{timeout:12000});assert(oldFrames.every(f=>f.isDetached()));await draft();assert.equal(await back.count(),0);assert.equal(await page.locator('#project-panel').evaluate(n=>getComputedStyle(n).visibility),'visible');
 await page.bringToFront();await until(async()=>(await localState())==='waiting');await noFrames(page);report.checks.workerLossRevokesFramesAndRestoresNative=true;report.recoveryQualification='C2_WAIT_WITHOUT_NEW_CONTEXT_NOT_J4';
 assert.equal(requests.filter(r=>r.path.startsWith('/backend-api/conversation')).length,0);report.checks.noAutomaticConversationBodyRead=true;report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack);process.exitCode=1;try{report.page=await page?.evaluate(()=>({path:location.pathname,owned:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length}));report.trace=await worker?.evaluate(()=>globalThis.projectMessageTrace);report.ui=await Promise.all(page.frames().filter(f=>f.url().startsWith('chrome-extension:')).map(async f=>({url:f.url(),text:await f.locator('body').innerText(),shadow:await f.evaluate(()=>[...document.querySelectorAll('*')].filter(n=>n.shadowRoot).map(n=>[...n.shadowRoot.children].filter(c=>c.tagName!=='STYLE').map(c=>c.textContent).join('\n')))})));}catch{}}
finally{
 report.browserVersion=context?.browser().version();await context?.close();await guard.close();server.closeAllConnections();await new Promise(r=>server.close(r));report.networkGuard=guard.snapshot();report.durationMs=performance.now()-start;
 report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.testChangedDuringRun=(await Promise.all(Object.entries(testHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;
 if(report.sourceChangedDuringRun||report.testChangedDuringRun||!report.buildManifestUnchanged){report.status='SOURCE_CHANGED';process.exitCode=1;}
 report.packageVerification=verifyHost(built.unpacked);await writeFile(process.argv[2]??join(dir,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,durationMs:report.durationMs,error:report.error}));
}
