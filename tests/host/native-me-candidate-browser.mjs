/** Actual packed MV3 candidate; disposable headless profiles; all HTTP replies synthetic. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {buildHost} from '../../extension/build.mjs';
import {buildProbe} from '../../tools/native-me-probe/build.mjs';
import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
const output=process.argv[2]??join(tmpdir(),'vaiwl-native-me-candidate-browser.json');
const accountsSchema=process.argv[3]==='accounts-schema',accountsStructure=process.argv[3]==='accounts-structure';
const modes=accountsStructure?['structure-mixed']:accountsSchema?['schema-invalid','schema-valid']:process.argv[3]==='legacy-receiver'?['legacy-receiver']:process.argv[3]==='lifecycle'?['foreground-start','hidden-inflight']:['consistent','accounts-challenge','shared-deadline','route-changed'];
const started=performance.now(),directory=await mkdtemp(join(tmpdir(),'vaiwl-me-chain-mv3-'));
const hash=v=>createHash('sha256').update(v).digest('hex');
const report={kind:'PACKAGED_HEADLESS_MV3_SYNTHETIC_HTTPS_RESPONSES',realProfile:'NOT_RUN',livePermissionConsumed:false,release:'NOT_RELEASE_READY',results:[],status:'RUNNING',runnerHash:hash(await readFile(new URL(import.meta.url)))};
let server,guard,handle,control,receipt,bundle;
function protocol(endpoint){
 const socket=new WebSocket(endpoint),pending=new Map();let sequence=0;
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});
 return {ready:new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});}),send:(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('isolated-protocol-timeout:'+method));},8000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));}),close(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('isolated-protocol-closed'));}pending.clear();socket.close();}};
}
try{
 server=await createHostFixtureServer();guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 const base=join(directory,'base');bundle=join(directory,'candidate');buildHost(base,{observedChatGPTContext:true,temporaryReadOnly:true});receipt=buildProbe(base,bundle,0,{candidateChain:!accountsSchema&&!accountsStructure,accountsSchema,accountsStructure});const baseInfo=JSON.parse(await readFile(join(base,'build-manifest.json')));report.sourceHashes={...baseInfo.sourceHashes,...receipt.sourceHashes};report.baseReceiptSha256=receipt.baseReceiptSha256;report.overlayReceiptSha256=hash(await readFile(join(bundle,'native-me-probe-manifest.json')));
 for(const mode of modes){
  report.mode=mode;const runStarted=performance.now(),requests=[],unexpected=[],errors=[];let releaseAccounts,accountSeen;
  const observedAccounts=new Promise(r=>accountSeen=r);
  handle=await launchNativeVisibilityBrowser({chromium,profileDir:join(directory,'profile-'+mode),headed:false,historicalNetworkGuard:guard.config,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {context,browser}=handle;report.browserVersion=browser.version();context.setDefaultTimeout(8000);
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.protocol==='chrome-extension:')return route.continue();
   if(u.href==='https://chatgpt.com/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Offline candidate fixture</title><aside><nav aria-label="Chat history"></nav></aside><main><textarea id="prompt-textarea">UNSENT_FIXTURE_DRAFT</textarea></main>'});
   if(u.origin!=='https://chatgpt.com'||!['/backend-api/me','/backend-api/accounts/check/v4-2023-04-27'].includes(u.pathname)){unexpected.push(u.pathname);return route.abort();}
   requests.push(u.pathname);assert.equal(route.request().method(),'GET');
   if(u.pathname.endsWith('/me'))return route.fulfill({contentType:'application/json',body:JSON.stringify({id:'fixture-private-subject',email:'PRIVATE_SENTINEL'})});
   accountSeen();
   if(mode==='accounts-challenge')return route.fulfill({status:403,headers:{'content-type':'text/html','cf-mitigated':'challenge'},body:'offline challenge fixture'});
   if(mode==='shared-deadline'||mode==='route-changed'||mode==='hidden-inflight')await new Promise(r=>releaseAccounts=r);
   if(accountsStructure){const v={account:{id:'fixture-private-space',structure:'personal'},can_access_with_session:true,name:'PRIVATE_SENTINEL'};return route.fulfill({contentType:'application/json',body:JSON.stringify({accounts:{'fixture-private-space':v,default:structuredClone(v),'fixture-private-other':{account:{account_id:null,structure:'workspace',is_deactivated:true},can_access_with_session:false}}})});}
   try{await route.fulfill({contentType:'application/json',body:JSON.stringify({accounts:{[mode==='schema-invalid'?'default':'fixture-private-space']:{account:{account_id:'fixture-private-space',structure:'personal'}}}})});}catch{ /* Aborted synthetic request after deadline/navigation. */ }
  });
  const loadedBundle=mode==='legacy-receiver'?join(directory,'legacy'):bundle;
  if(mode==='legacy-receiver')buildProbe(base,loadedBundle,0);
  const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:loadedBundle});
  // Reproduce an in-place unpacked update without reloading the extension.
  // Popup files update while Chrome retains the registered content-script source.
  if(mode==='legacy-receiver')await cp(bundle,loadedBundle,{recursive:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://chatgpt.com/');
  let other;
  const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');
  control=protocol(handle.debugEndpoint);await control.ready;let session,target;
  async function open(){await worker.evaluate(()=>chrome.action.openPopup());const matches=(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.url===`chrome-extension://${id}/native-me-probe.html`);assert.equal(matches.length,1);target=matches[0].targetId;session=(await control.send('Target.attachToTarget',{targetId:target,flatten:true})).sessionId;}
  async function evaluate(expression){const r=await control.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??'popup-evaluate');return r.result.value;}
  async function click(selector){const box=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await control.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box},session);await control.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box},session);}
  async function waitResult(readPending=false){const deadline=performance.now()+8000;while(performance.now()<deadline){const text=await evaluate('document.querySelector("#result").textContent');try{const r=JSON.parse(text);if(r.state==='finished'||r.state.endsWith('-no-request'))return r;if(readPending&&r.state==='no-result')await click('#read');}catch{}await new Promise(r=>setTimeout(r,25));}throw Error('candidate-result-observation-timeout');}
  await open();await evaluate("localStorage.setItem('vaiwl-native-me-probe-20261019-consumed','consumed')");assert.equal(requests.length,0);
  if(accountsSchema||accountsStructure)await evaluate("localStorage.setItem('vaiwl-native-me-candidate-20261019-consumed','consumed')");
  if(accountsStructure)await evaluate("localStorage.setItem('vaiwl-accounts-schema-20261019-consumed','consumed')");
  if(mode==='foreground-start'||mode==='hidden-inflight'){
   const ready=await evaluate("(async()=>{const [t]=await chrome.tabs.query({active:true,currentWindow:true});return chrome.tabs.sendMessage(t.id,{type:'VAIWL_ME_CANDIDATE_READY'},{frameId:0});})()");assert.equal(ready.ready,true);assert.equal(ready.spent,false);
   await control.send('Target.closeTarget',{targetId:target});
   other=await context.newPage();await other.bringToFront();await page.waitForFunction(()=>document.visibilityState==='hidden');
   await page.bringToFront();await page.waitForFunction(()=>document.visibilityState==='visible');await open();
  }
  await click('#run');
  if(mode==='route-changed'){await withRequestDeadline(()=>observedAccounts,{timeoutMs:8000});await page.evaluate(()=>{history.pushState({},'', '/c/11111111-1111-4111-8111-111111111111');dispatchEvent(new PopStateEvent('popstate'));});}
  if(mode==='hidden-inflight'){await withRequestDeadline(()=>observedAccounts,{timeoutMs:8000});await other.bringToFront();await page.waitForFunction(()=>document.visibilityState==='hidden');await page.bringToFront();await open();await click('#read');}
  const result=await waitResult(mode==='hidden-inflight');releaseAccounts?.();
  if(mode==='legacy-receiver'){
   assert.equal(result.state,'legacy-receiver-reload-required-no-request');assert.equal(requests.length,0);
   assert.equal(await evaluate("localStorage.getItem('vaiwl-native-me-candidate-20261019-consumed')"),null);
   assert.equal(await evaluate("localStorage.getItem('vaiwl-native-me-probe-20261019-consumed')"),'consumed');
   assert.equal(await evaluate('document.querySelector("#run").disabled'),false);
   assert.equal(await page.locator('textarea').inputValue(),'UNSENT_FIXTURE_DRAFT');assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
   const databases=await worker.evaluate(async()=> (await indexedDB.databases()).length);assert.equal(databases,0);
   report.results.push({mode,result,requestCount:0,oldMarkerPreserved:true,candidateMarkerAbsent:true,databaseCount:databases,draftPreserved:true,elapsedMs:performance.now()-runStarted});
   control.close();control=null;await handle.close();handle=null;continue;
  }
  assert.equal(result.state,'finished');
  const consistent=mode==='consistent'||mode==='foreground-start';
  const expected=accountsStructure?'accounts-schema:account-id':accountsSchema?(mode==='schema-valid'?'accounts-schema-valid-not-authorized':'accounts-schema:default-canonical-missing'):consistent?'candidate-consistent-not-authorized':mode==='accounts-challenge'?'session-challenged':mode==='shared-deadline'?'request-timeout':'document-changed';assert.equal(result.reason,expected);
  if(accountsSchema||accountsStructure){assert.deepEqual(Object.keys(result).sort(),accountsStructure?['reason','state','structure']:['reason','state']);assert.deepEqual(requests,['/backend-api/accounts/check/v4-2023-04-27']);assert.equal(await evaluate("localStorage.getItem('vaiwl-native-me-candidate-20261019-consumed')"),'consumed');}else{assert.equal(result.samePrincipal,consistent);assert.equal(requests.length,consistent?3:2);assert.equal(result.identityEnabled,false);}assert(!JSON.stringify(result).includes('fixture-private'));assert(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
  if(accountsStructure){assert.equal(result.structure.entryCount,3);assert.deepEqual(result.structure.groups.ordinary.account_id,{missing:1,null:1});assert.deepEqual(result.structure.groups.ordinary.id,{'valid-string':1,missing:1});assert.equal(result.structure.defaultAlias.id.wholeEntryEqual,'equal');assert.equal(await evaluate("localStorage.getItem('vaiwl-accounts-schema-20261019-consumed')"),'consumed');}
  const expectedRequests=requests.length;
  assert.equal(await evaluate("localStorage.getItem('vaiwl-native-me-probe-20261019-consumed')"),'consumed');assert.equal(await evaluate('document.querySelector("#run").disabled'),true);
  const databases=await worker.evaluate(async()=> (await indexedDB.databases()).length);assert.equal(databases,0);
  await control.send('Target.closeTarget',{targetId:target});await open();assert.equal(await evaluate('document.querySelector("#run").disabled'),true);
  await click('#read');assert.deepEqual(await waitResult(),result);assert.equal(requests.length,expectedRequests);
  assert.equal(await page.locator('textarea').inputValue(),'UNSENT_FIXTURE_DRAFT');assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  report.results.push({mode,result,requestCount:requests.length,oldMarkerPreserved:true,reopenDisabled:true,readDidNotRequest:true,databaseCount:databases,draftPreserved:true,elapsedMs:performance.now()-runStarted});
  control.close();control=null;await handle.close();handle=null;
 }
 report.status='PASS_PACKAGED_OFFLINE_CANDIDATE';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 control?.close();await handle?.close();await guard?.close();await server?.close();report.networkGuard=guard?.snapshot();report.elapsedMs=performance.now()-started;
 report.sourceStable=true;for(const [path,expected]of Object.entries(report.sourceHashes??{}))if(hash(await readFile(path))!==expected)report.sourceStable=false;
 report.packageStable=true;for(const [path,expected]of Object.entries(receipt?.files??{}))if(hash(await readFile(join(bundle,path)))!==expected)report.packageStable=false;
 report.runnerStable=hash(await readFile(new URL(import.meta.url)))===report.runnerHash;if(!report.sourceStable||!report.runnerStable||!report.packageStable){report.status='FAIL_SOURCE_DRIFT';process.exitCode=1;}
 await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,results:report.results,elapsedMs:report.elapsedMs,output}));
}
