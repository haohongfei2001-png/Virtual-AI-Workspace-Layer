import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir,platform} from 'node:os';
import {assertPrivacyReport} from './privacy-report-contract.mjs';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {createPrivacyScanner} from './privacy-scan.mjs';
const evidencePaths=['tests/host/isolated-auth-privacy-browser.mjs','tests/host/privacy-report-contract.mjs','tests/host/privacy-scan.mjs','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs','tests/host/fixtures/server.mjs'];
const hashes=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const evidenceHashes=await hashes(evidencePaths),server=await createHostFixtureServer({journey:'J3'}),dir=await mkdtemp(join(tmpdir(),'vaiwl-isolated-auth-privacy-'));
const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
const secrets={...server.privacySentinels(),draft:'ISOLATED_PRIVACY_NATIVE_DRAFT_286'};
const report={sourceCommit:process.env.GITHUB_SHA??null,fullSYS07:'NOT_ESTABLISHED',credentialUse:'Fixture token used only in restricted authentication RAM; fallback accounts verification may use an isolated-world short-lived closure, never MAIN or UI.',status:'NOT_RUN',evidence:'REAL_HEADLESS_PACKAGED_MV3_OFFLINE_ISOLATED_AUTH_PRIVACY',sourceHashes:build.sourceHashes,evidenceHashes,realAccount:'NOT_RUN',firstPartyServiceWorker:'NOT_VERIFIED',G:'NOT_VERIFIED',coverage:'Worker passive inbound runtime messages, outgoing tabs messages/replies and console from before either navigation; page console from before navigation; extension DOM and all raw IDB after terminal outcomes. Does not claim complete UI reply or content-world console history.',cases:[]};
let handle,phase='launch',activeCase=null;
function install(factory,secrets){
 const messages=factory(secrets),logs=factory(secrets),counts={received:0,identitySuccess:0,identityFailure:0,identityMalformedFailure:0,dispatch:0,dispatchReplies:0,console:0,errors:0};
 globalThis.__isolatedPrivacy={messages,logs,counts};
 chrome.runtime.onMessage.addListener(message=>{counts.received++;messages.scan(message);if(message?.type==='HOST_IDENTITY_RESULT'){if(message.ok===true)counts.identitySuccess++;else if(message.ok===false){counts.identityFailure++;if(Object.keys(message).sort().join(',')!==['type','challenge','documentToken','producerToken','routeEpoch','authorityEpoch','ok'].sort().join(','))counts.identityMalformedFailure++;}}});
 const original=chrome.tabs.sendMessage.bind(chrome.tabs);chrome.tabs.sendMessage=function(...args){counts.dispatch++;messages.scan(args);const result=original(...args);if(result?.then)result.then(reply=>{counts.dispatchReplies++;messages.scan(reply);},error=>{counts.dispatchReplies++;messages.scan({name:error?.name,message:error?.message});});return result;};
 for(const method of ['log','info','warn','error','debug']){const original=console[method].bind(console);console[method]=function(...args){counts.console++;logs.scan(args);return original(...args);};}
 addEventListener('error',event=>{counts.errors++;logs.scan({message:event.message,stack:event.error?.stack});});addEventListener('unhandledrejection',event=>{counts.errors++;logs.scan({message:event.reason?.message,stack:event.reason?.stack});});
}
const observe=()=>({counts:{...__isolatedPrivacy.counts},messages:__isolatedPrivacy.messages.snapshot(),logs:__isolatedPrivacy.logs.snapshot()});
const clean=(scan,nonempty=false)=>{assert(scan);if(nonempty)assert(scan.values>0);assert.equal(scan.unsupported,0);assert.deepEqual(scan.hits,{token:0,cookie:0,body:0,draft:0});};
function realm(realm,fn,args){return realm.evaluate(`(${fn.toString()})(${JSON.stringify(args)},(${createPrivacyScanner.toString()}))`);}
async function scanDatabase(worker){return realm(worker,async(secrets,factory)=>{const scanner=factory(secrets),databases=[];for(const item of await indexedDB.databases()){const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(item.name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('database-open'));});try{const stores=[...db.objectStoreNames],counts={};await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readonly');for(const name of stores){counts[name]=0;const request=tx.objectStore(name).openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){counts[name]++;scanner.scan({key:cursor.key,value:cursor.value});cursor.continue();}};}tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error('database-scan'));});databases.push({stores,counts});}finally{db.close();}}return {databases,scan:scanner.snapshot()};},secrets);}
async function until(check){const deadline=Date.now()+20000;while(Date.now()<deadline){if(await check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('terminal-observation-timeout');}
try{
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
 const {context,browser}=handle;
 await context.route('**/*',async route=>{const request=route.request(),url=request.url();
  if(url===server.origin+'/api/auth/session'){if(request.serviceWorker()){if(activeCase)activeCase.workerAuthAborted++;return route.abort('failed');}if(activeCase)activeCase.isolatedSession++;}
  if(url===server.origin+'/backend-api/accounts/check/v4-2023-04-27'&&!request.serviceWorker()){
   if(activeCase)activeCase.isolatedAccounts++;
   if(activeCase?.mode==='malformed-accounts'){const headers=await request.allHeaders();activeCase.authenticatedAccounts=headers.authorization==='Bearer '+secrets.token&&(headers.cookie??'').includes('host_fixture_session='+secrets.cookie);activeCase.malformedResponses++;return route.fulfill({status:200,contentType:'application/json',body:'{"invalid":"'+secrets.body+'"'});}
  }
  return url.startsWith(server.origin+'/')||url.startsWith('chrome-extension://')?route.continue():route.abort();
 });
 const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith(`chrome-extension://${id}/`),timeout:15000});
 await worker.evaluate(`(${install.toString()})((${createPrivacyScanner.toString()}),${JSON.stringify(secrets)})`);
 for(const mode of ['success','malformed-accounts']){
  phase=mode+'-navigation';activeCase={mode,workerAuthAborted:0,isolatedSession:0,isolatedAccounts:0,malformedResponses:0};report.cases.push(activeCase);
  const before=await worker.evaluate(observe),page=await context.newPage(),logs=createPrivacyScanner(secrets),tasks=[];let logIncomplete=false;
  page.on('console',message=>{tasks.push(Promise.all(message.args().map(arg=>arg.jsonValue())).then(values=>logs.scan(values),()=>{logIncomplete=true;}));});page.on('pageerror',error=>logs.scan({name:error.name,message:error.message,stack:error.stack}));
  await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');
  phase=mode+'-terminal';
  if(mode==='success'){
   await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000});
   const workspace=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(workspace);await workspace.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:20000});
   await until(async()=>{const data=await worker.evaluate(observe);return data.counts.identitySuccess>before.counts.identitySuccess&&data.counts.dispatchReplies>before.counts.dispatchReplies;});
   activeCase.terminal='NATIVE_PROJECTION_WITH_REAL_ISOLATED_IDENTITY_RESULT';
   await page.locator('textarea').fill(secrets.draft);await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
  }else{
   await until(async()=>{const data=await worker.evaluate(observe);return data.counts.identityFailure===before.counts.identityFailure+1&&data.counts.dispatchReplies>before.counts.dispatchReplies;});
   assert.equal(activeCase.malformedResponses,1);assert.equal(activeCase.authenticatedAccounts,true);
   await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]').length===0&&!!document.querySelector('textarea'),null,{timeout:10000});
   await page.locator('textarea').fill(secrets.draft);activeCase.terminal='OPAQUE_FAILED_IDENTITY_RESULT_AND_NATIVE_ONLY';
  }
  assert(activeCase.workerAuthAborted>0);assert(activeCase.isolatedSession>0);assert(activeCase.isolatedAccounts>0);
  assert.equal(await page.locator('textarea').evaluate((node,draft)=>node.value===draft,secrets.draft),true);activeCase.nativeDraftRetained=true;
  phase=mode+'-raw-scans';
  const data=await scanDatabase(worker);assert.equal(data.databases.length,1);assert.deepEqual(data.databases[0].stores.sort(),['refs','operations','b23_states','b23_operations','b23_checkpoints','b23_views','native_states','native_operations'].sort());assert(Object.values(data.databases[0].counts).reduce((sum,n)=>sum+n,0)>0);clean(data.scan,true);activeCase.rawIDB=data;
  const frames=page.frames().filter(frame=>frame.url().startsWith(`chrome-extension://${id}/`));assert.equal(frames.length,mode==='success'?2:0);activeCase.extensionDOM=[];
  for(const frame of frames){const scanned=await realm(frame,(secrets,factory)=>{const scanner=factory(secrets);function walk(root){scanner.scan(root.textContent??'');for(const node of root.querySelectorAll('*')){for(const attr of node.attributes)scanner.scan(attr.value);if('value'in node)scanner.scan(node.value);if(node.shadowRoot)walk(node.shadowRoot);}}walk(document);return scanner.snapshot();},secrets);clean(scanned,true);activeCase.extensionDOM.push(scanned);}
  await Promise.all(tasks);assert.equal(logIncomplete,false);activeCase.pageConsole=logs.snapshot();clean(activeCase.pageConsole);
  const after=await worker.evaluate(observe);clean(after.messages,true);clean(after.logs);assert.equal(after.counts.identityMalformedFailure,0);activeCase.workerObserved=after;activeCase.delta=Object.fromEntries(Object.entries(after.counts).map(([key,value])=>[key,value-before.counts[key]]));
  assert.equal(mode==='success'?activeCase.delta.identitySuccess:activeCase.delta.identityFailure,1);
  assert.equal(mode==='success'?activeCase.delta.identityFailure:activeCase.delta.identitySuccess,0);
  await page.close();activeCase=null;
 }
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.failedPhase=phase;report.errorClass=/^[A-Za-z]+Error$/.test(error?.name)?error.name:'Error';const line=/isolated-auth-privacy-browser\.mjs:(\d+):(\d+)/.exec(error?.stack??'');if(line)report.failureLocation={line:Number(line[1]),column:Number(line[2])};process.exitCode=1;}
finally{
 report.cleanup=(await Promise.allSettled([handle?.close(),server.close(),guard.close()])).map(item=>item.status);
 report.sourceChangedDuringRun=(await Promise.all(Object.entries({...build.sourceHashes,...evidenceHashes}).map(async([path,digest])=>createHash('sha256').update(await readFile(path)).digest('hex')!==digest))).some(Boolean);
 if(report.sourceChangedDuringRun||report.cleanup.includes('rejected')){report.originalFailedPhase=report.failedPhase??null;report.status='FAIL';report.failedPhase='source-or-cleanup';process.exitCode=1;}
 report.networkGuard=guard.snapshot();if(report.status==='PASS'){try{assertPrivacyReport(report);}catch{report.status='FAIL';report.failedPhase='report-contract';process.exitCode=1;}}await writeFile(process.argv[2]??join(tmpdir(),'free-isolated-auth-privacy.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,phase:report.failedPhase}));
