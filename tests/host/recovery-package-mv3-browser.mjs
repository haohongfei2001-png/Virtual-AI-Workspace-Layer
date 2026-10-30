import {verifyRecoveryRetirement} from './recovery-retirement-browser-probe.mjs';
import {verifyRecoveryParentClose} from './recovery-inflight-browser-probe.mjs';
/** Actual packaged flow/renderer/IDB. Only disposable synthetic assets and damage. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import {j4AssetBackup,J4_REF} from './fixtures/j4-assets.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';

const mode=process.argv[3]??'browser-local';assert(['browser-local','c3'].includes(mode));
const local=mode==='browser-local',hash=value=>createHash('sha256').update(value).digest('hex');
const script='tests/host/recovery-package-mv3-browser.mjs';
const paths=[script,'tests/host/recovery-inflight-browser-probe.mjs','tests/host/recovery-retirement-browser-probe.mjs','tests/host/j2-runner-bounds.mjs','tests/host/fixtures/server.mjs','tests/host/fixtures/legacy.html','tests/host/fixtures/native.mjs','tests/host/fixtures/native.css','tests/host/fixtures/observed-desktop.mjs','tests/host/fixtures/j4-assets.mjs','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs'];
const hashes=async names=>Object.fromEntries(await Promise.all(names.map(async path=>[path,hash(await readFile(path))])));
const requests=[];
async function fixture(){
 if(!local)return createHostFixtureServer({partitionedSidebar:true});
 const native=createServer((request,response)=>{
  requests.push({method:request.method,path:request.url});
  response.writeHead(request.url==='/c/'+J4_REF?200:404,{'Content-Type':'text/html','Cache-Control':'no-store'});
  response.end(request.url==='/c/'+J4_REF?observedDesktopHTML(J4_REF):'');
 });
 await new Promise(resolve=>native.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+native.address().port;
 return {origin,url:origin+'/c/'+J4_REF,snapshot:()=>({actions:{},requests:[...requests]}),close:()=>new Promise((resolve,reject)=>native.close(error=>error?reject(error):resolve()))};
}
const dir=await mkdtemp(join(tmpdir(),'vaiwl-recovery-package-'));
const report={status:'NOT_RUN',evidence:'REAL_HEADLESS_PACKAGED_MV3_OFFLINE_RECOVERY',backend:'document-flow',authorityMode:local?'BROWSER_LOCAL':'EXPLICIT_OFFLINE_C3',fixtureAuthority:'TEST_ONLY_EXPLICIT_LOCAL_CONFIRMATION_UI_ASSET_IMPORT_AND_EXACT_IDB_ROOT_DAMAGE',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',sourceCommit:process.env.FREE_SOURCE_COMMIT??process.env.GITHUB_SHA??null,artifactDirectory:dir,testHashes:await hashes(paths),results:[],errors:[],screenshots:[],limitations:['Synthetic assets and isolated IDB only; original installation and real ChatGPT recovery are NOT_RUN.','Cross-sender consumed repair packet denial does not establish parent-close causality; the separate original-sender queued transaction probe does.','Retirement probe uses synthetic UI authority on real IDB and does not establish browser grant delivery.']};
report.scriptHash=report.testHashes[script];report.probeScriptHash=report.testHashes['tests/host/recovery-inflight-browser-probe.mjs'];report.deadlineScriptHash=report.testHashes['tests/host/j2-runner-bounds.mjs'];report.retirementScriptHash=report.testHashes['tests/host/recovery-retirement-browser-probe.mjs'];
let server,guard,handle,context,id,page,peer,probe,workspace,built,manifestBytes,manifest,scope;
async function screenshot(name,target=page){const path=join(dir,name+'.png');await target.screenshot({path});report.screenshots.push({name,path});}
async function ready(target){
 await target.waitForFunction(id=>{
  const frames=[...document.querySelectorAll('iframe')].filter(node=>node.src==='chrome-extension://'+id+'/workspace.html');
  if(frames.length!==1)return false;
  const node=frames[0],owner=node.parentElement,box=node.getBoundingClientRect();
  return owner?.hasAttribute('data-va-owned')&&!owner.hasAttribute('popover')&&node.checkVisibility()&&box.width>=160&&box.height>=96;
 },id,{timeout:15000});
 const frame=target.frames().find(value=>value.url()==='chrome-extension://'+id+'/workspace.html');assert(frame);
 return frame;
}
async function unlock(target){
 await target.bringToFront();
 if(local){
  const result=await probe.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}));assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal((await probe.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}))).mode,'personal');
  const descriptor=await probe.evaluate(async()=> (await chrome.storage.local.get('vaiwl-browser-local-personal-v1'))['vaiwl-browser-local-personal-v1']);
  assert.equal(typeof descriptor?.spaceId,'string');
  if(scope)assert.equal(descriptor.spaceId,scope.spaceId,'reconfirmation must retain the same personal namespace');
 }
 return ready(target);
}
async function openDocument(){
 const target=await context.newPage();target.on('pageerror',error=>report.errors.push(error.message));await target.goto(server.url);await ready(target);
 return {page:target,frame:await unlock(target)};
}
async function settingsAction(frame,label){
 const button=frame.getByRole('button',{name:'工作空间设置',exact:true});
 await button.waitFor({timeout:15000});if(await button.getAttribute('aria-expanded')!=='true')await button.click();
 await frame.getByRole('button',{name:label,exact:true}).click();
}
async function openRecovery(frame){await settingsAction(frame,'本地数据恢复');await frame.getByRole('region',{name:'本地数据恢复',exact:true}).waitFor({timeout:10000});}
async function store(mode){return probe.evaluate(async({mode,scope,ref})=>{
 const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{WorkspaceRepository}=await import(chrome.runtime.getURL('src/data/repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
 const base=new ScopeRepository({indexedDB});try{
  const db=await base.open(),repository=new WorkspaceRepository({baseRepository:base});
  if(mode==='seed'){
   const state=(await repository.read(scope)).state;if(!state.refs[ref])throw Error('missing-imported-human-ref');
   const result=await repository.command(scope,{operationId:'fixture_recovery_pro',expectedRevision:state.revision,command:{type:'SET_TITLE',refId:ref,title:'SYNTHETIC_PRO_KEEP'}});if(!result.ok)throw Error('synthetic-title-command-failed');
  }
  if(mode==='damage')await new Promise((resolve,reject)=>{
   const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),request=store.get(scope.key);
   request.onsuccess=()=>{const root=request.result;if(!root||root.key!==scope.key||root.payload?.scopeKey!==scope.key){tx.abort();return;}store.put({...root,checksum:'0'.repeat(64)});};
   tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error??Error('missing-exact-fixture-native-root'));
  });
  const state=(await repository.read(scope)).state;
  const stores=await new Promise((resolve,reject)=>{
   const names=[...db.objectStoreNames],tx=db.transaction(names),out={};
   for(const name of names){const request=tx.objectStore(name).getAll();request.onsuccess=()=>out[name]=Object.fromEntries(request.result.map(row=>[row.key,digest(row)]));}
   tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);
  });
  return {stores,title:state.identities[ref]?.title??null,pro:digest({identities:state.identities,placements:state.placements,workspaces:state.workspaces,preferences:state.preferences,refs:state.refs}),counts:{identities:Object.keys(state.identities).length,workspaces:Object.keys(state.workspaces).length,placements:Object.keys(state.placements).length,workingSet:state.preferences.workingSet?.value?.refs?.length??0,snippets:state.preferences.savedSnippets?.value?.length??0,humanRefs:state.refs[ref]?1:0},native:mode==='facts'?await new NativeRepository({baseRepository:base}).read(scope):null};
 }finally{base.close();}
},{mode,scope,ref:J4_REF});}
async function draft(){assert.equal(await page.evaluate(()=>document.querySelector('textarea')===globalThis.recoveryOriginalEditor&&recoveryOriginalEditor.value==='RECOVERY_NATIVE_UNSENT_DRAFT'&&recoveryOriginalEditor.selectionStart===2&&recoveryOriginalEditor.selectionEnd===7),true);}
try{
 server=await fixture();guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,...(local?{browserLocal:true}:{})});report.package=built;
 manifestBytes=await readFile(join(built.unpacked,'build-manifest.json'));manifest=JSON.parse(manifestBytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=hash(manifestBytes);
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??chromium.executablePath(),profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});context=handle.context;report.browserPrecondition=handle.diagnostic;
 await context.route('**/*',route=>route.request().url().startsWith(server.origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 report.browserVersion=handle.browser.version();
 const cdp=await handle.browser.newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));
 const worker=context.serviceWorkers().find(value=>value.url().startsWith('chrome-extension://'+id+'/'))??await context.waitForEvent('serviceworker',{predicate:value=>value.url().startsWith('chrome-extension://'+id+'/'),timeout:15000});
 report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.invalid/',{signal:AbortSignal.timeout(1500)});return false;}catch{return true;}});assert.equal(report.workerNetworkBlocked,true);
 probe=await context.newPage();await probe.goto('chrome-extension://'+id+'/status.html');
 ({page,frame:workspace}=await openDocument());report.viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));report.viewports=[report.viewport];
 await workspace.getByRole('button',{name:'工作空间设置',exact:true}).waitFor({timeout:15000});
 scope=await probe.evaluate(async local=>{
  const {normalizedScope}=await import(chrome.runtime.getURL('src/b1/identity.mjs'));
  if(local){const descriptor=(await chrome.storage.local.get('vaiwl-browser-local-personal-v1'))['vaiwl-browser-local-personal-v1'];return normalizedScope({kind:'browser-local',storage:'personal',spaceId:descriptor?.spaceId});}
  const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),base=new ScopeRepository({indexedDB});try{
   const db=await base.open(),rows=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),request=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);});
   const roots=rows.filter(row=>row.key===row.payload?.scopeKey&&JSON.parse(row.key).length===3);if(roots.length!==1)throw Error('ambiguous-fixture-scope');
   const [provider,accountId,organizationId]=JSON.parse(roots[0].key);return normalizedScope({verified:true,provider,accountId,organizationId});
  }finally{base.close();}
 },local);assert(scope);report.scopeKind=local?scope.kind:'authenticated-offline';report.scopeTupleLength=JSON.parse(scope.key).length;assert.equal(report.scopeTupleLength,local?4:3);
 await probe.waitForFunction(async scope=>{
  const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),base=new ScopeRepository({indexedDB});try{const db=await base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),request=tx.objectStore('native_states').get(scope.key);tx.oncomplete=()=>resolve(request.result?.payload?.scopeKey===scope.key);tx.onabort=()=>reject(tx.error);});}finally{base.close();}
 },scope,{timeout:15000});
 // Same production file-preview/confirmation path; no forged grant or raw asset put.
 const empty=await store('read');await settingsAction(workspace,'备份与导入');
 await workspace.getByLabel('选择备份 JSON 文件',{exact:true}).setInputFiles({name:'recovery-synthetic-human-assets.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(j4AssetBackup(scope,server.origin)))});
 await workspace.getByText('请核对摘要。只有点击“确认恢复”才会修改本地人工资产。',{exact:true}).waitFor({timeout:10000});assert.equal((await store('read')).pro,empty.pro);
 await workspace.getByRole('button',{name:'确认恢复',exact:true}).click();await workspace.getByRole('button',{name:'工作空间设置',exact:true}).waitFor({timeout:15000});
 const initial=await store('seed');assert.equal(initial.title,'SYNTHETIC_PRO_KEEP');for(const count of Object.values(initial.counts))assert(count>0);report.manualAssetCounts=initial.counts;
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.locator('textarea').fill('RECOVERY_NATIVE_UNSENT_DRAFT');
 await page.evaluate(()=>{globalThis.recoveryOriginalEditor=document.querySelector('textarea');recoveryOriginalEditor.setSelectionRange(2,7);});await draft();
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();workspace=await ready(page);
 const before=await store('read');await openRecovery(workspace);await workspace.getByText('选择需要修复的本地记录。',{exact:true}).waitFor({timeout:10000});
 assert.equal(await workspace.getByRole('heading',{name:'恢复本地工作空间',exact:true}).evaluate(node=>node.getRootNode().activeElement===node),true);
 assert.equal(await workspace.getByText('未发现损坏。',{exact:true}).count(),3);assert.deepEqual((await store('read')).stores,before.stores);await draft();await screenshot('healthy-readonly');
 report.results.push({name:'healthy-recovery-status-is-readonly-across-all-IDB-stores',status:'PASS'});
 await workspace.getByRole('button',{name:'返回工作空间',exact:true}).click();await workspace.getByRole('button',{name:'工作空间设置',exact:true}).waitFor({timeout:15000});
 // Establish the real search origin before damage. Returning from the peer
 // legitimately performs a guarded foreground read and can open recovery
 // before a retired settings button could be clicked.
 await settingsAction(workspace,'查找已知项目与聊天');await workspace.getByRole('button',{name:'关闭已知查找',exact:true}).waitFor({timeout:10000});
 // A second real granted workspace replaces the obsolete mandatory sidebar.
 // Its independently issued plan must be invalidated after the first UI repairs.
 const opened=await openDocument();peer=opened.page;const peerFrame=opened.frame;await peerFrame.getByRole('button',{name:'工作空间设置',exact:true}).waitFor({timeout:15000});
 await openRecovery(peerFrame);await peerFrame.getByText('选择需要修复的本地记录。',{exact:true}).waitFor({timeout:10000});
 assert.equal(await peerFrame.getByText('未发现损坏。',{exact:true}).count(),3);
 await peerFrame.getByRole('button',{name:'返回工作空间',exact:true}).click();await peerFrame.getByRole('button',{name:'工作空间设置',exact:true}).waitFor({timeout:15000});
 const known=await store('facts');assert(Object.keys(known.native.refs).length>0);const damaged=await store('damage');
 await openRecovery(peerFrame);await peerFrame.getByRole('button',{name:'修复项目与聊天索引',exact:true}).waitFor({timeout:15000});
 await page.bringToFront();
 await workspace.getByRole('button',{name:'修复项目与聊天索引',exact:true}).waitFor({timeout:15000});assert.deepEqual((await store('read')).stores,damaged.stores);await draft();await screenshot('native-root-explicit-repair');
 report.results.push({name:'damaged-native-root-shows-explicit-recovery-without-auto-write',status:'PASS'});
 await workspace.evaluate(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{if(message.type==='HOST_UI_RECOVER')globalThis.testLastRepair=structuredClone(message);const result=await send(message);(globalThis.testRecoveryTrace??=[]).push({type:message.type,ok:result?.ok,state:result?.state,reason:result?.reason});return result;};});
 await workspace.getByRole('button',{name:'修复项目与聊天索引',exact:true}).click();await workspace.getByRole('button',{name:'关闭已知查找',exact:true}).waitFor({timeout:15000});await draft();
 const repaired=await store('facts');assert.equal(repaired.pro,initial.pro);assert.equal(repaired.title,'SYNTHETIC_PRO_KEEP');assert.deepEqual(repaired.native.refs,known.native.refs);assert(Object.keys(repaired.native.sources).length>0);assert(Object.values(repaired.native.sources).every(source=>source.revoked===true));
 await workspace.getByRole('button',{name:'关闭已知查找',exact:true}).click();
 const unknown=workspace.locator('[data-free-list="unknown"]');
 for(const ref of Object.values(repaired.native.refs)){
  const link=unknown.locator('a[data-ref-id="'+ref.id+'"]'),deadline=performance.now()+6000,observation={refId:ref.id,budgetMs:6000,samples:0,first:null,last:null,firstEnabled:null};(report.unknownControlReadiness??=[]).push(observation);
  // Rows are published before their asynchronous native plan. Observe the
  // first usable row, never wait for an expected URL to replace a wrong plan.
  while(performance.now()<deadline){
   const sample=await link.evaluateAll(nodes=>{if(nodes.length!==1)return {count:nodes.length};const n=nodes[0],r=n.getBoundingClientRect(),s=getComputedStyle(n);return {count:1,at:performance.timeOrigin+performance.now(),ownerDocument:n.ownerDocument===document,connected:n.isConnected,visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility==='visible',href:n.getAttribute('href'),ariaDisabled:n.getAttribute('aria-disabled'),reason:n.getAttribute('data-navigation-reason')};});
   observation.samples++;observation.first??=sample;observation.last=sample;assert(sample.count<=1,'repaired UNKNOWN row must remain unique');
   if(sample.count===1&&sample.ownerDocument&&sample.connected&&sample.visible&&sample.ariaDisabled!=='true'){observation.firstEnabled=sample;break;}
   await new Promise(resolve=>setTimeout(resolve,Math.min(10,Math.max(0,deadline-performance.now()))));
  }
  assert(observation.firstEnabled,'repaired UNKNOWN link must become usable within six seconds');assert.equal(observation.firstEnabled.href,ref.nativeUrl);assert.equal(await link.getAttribute('href'),ref.nativeUrl);assert.notEqual(await link.getAttribute('aria-disabled'),'true');assert(!((await link.textContent())??'').includes('SYNTHETIC_PRO_KEEP'));
 }
 assert.equal(await workspace.getByText('SYNTHETIC_PRO_KEEP',{exact:true}).count(),0);await draft();await screenshot('repaired-unknown-native-links');
 report.results.push({name:'explicit-repair-revokes-sources-retains-facts-Pro-draft-and-UNKNOWN-native-links',status:'PASS',oldTitleRestoration:'not authorized; old source remains revoked'});
 await peer.bringToFront();await peerFrame.waitForFunction(()=>document.querySelector('[data-vaiwl-frame-recovery]')?.textContent?.split('未发现损坏。').length===4,null,{timeout:10000});
 assert.equal(await peerFrame.getByText('未发现损坏。',{exact:true}).count(),3);assert.equal(await peerFrame.getByRole('button',{name:'修复项目与聊天索引',exact:true}).count(),0);
 report.results.push({name:'peer-frame-recovery-panel-rechecks-readonly-and-removes-stale-repair-plan',status:'PASS',peer:'SECOND_REAL_GRANTED_WORKSPACE_SAME_PERSONAL_SCOPE'});
 await peer.close();peer=null;await page.bringToFront();await draft();
 const stale=await workspace.evaluate(()=>globalThis.testLastRepair);assert(stale);await page.close();const settled=await store('read');const rejected=await probe.evaluate(packet=>chrome.runtime.sendMessage(packet),stale);
 assert.equal(rejected.ok,false);assert.deepEqual((await store('read')).stores,settled.stores);
 report.results.push({name:'closed-parent-old-repair-packet-from-unpaired-extension-page-cannot-write',status:'PASS',parentCloseCausality:'NOT_ESTABLISHED_CONSUMED_PLAN_AND_DIFFERENT_SENDER',inFlightAbort:'Separate original-sender queued transaction probe below.'});
 ({page,frame:workspace}=await openDocument());await workspace.getByRole('button',{name:'工作空间设置',exact:true}).waitFor({timeout:15000});
 await store('damage');await openRecovery(workspace);await workspace.getByRole('button',{name:'修复项目与聊天索引',exact:true}).waitFor({timeout:15000});
 const currentWorker=context.serviceWorkers().find(value=>value.url().startsWith('chrome-extension://'+id+'/'));assert(currentWorker);
 const withdrawal=await verifyRecoveryParentClose({page,frame:workspace,probe,worker:currentWorker,readStores:()=>store('read')});
 report.results.push({name:'parent-close-aborts-queued-real-IDB-repair-before-commit',status:'PASS',instrumentation:'TEST_ONLY_READONLY_BARRIER_AND_TRANSACTION_EVENT_OBSERVER',...withdrawal});
 ({page,frame:workspace}=await openDocument());await workspace.getByRole('button',{name:'修复项目与聊天索引',exact:true}).waitFor({timeout:15000});
 assert.equal((await store('read')).pro,initial.pro);report.results.push({name:'new-document-still-offers-explicit-repair-with-Pro-preserved-no-auto-replay',status:'PASS'});
 assert.equal(server.snapshot().actions['send-intent']??0,0);assert.equal(server.snapshot().actions['create-project']??0,0);
 if(local){assert(requests.every(request=>request.method==='GET'));assert.equal(requests.filter(request=>/^\/(backend-api|api)\//.test(request.path)).length,0);}
 assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.retirementBoundary=await verifyRecoveryRetirement(probe);assert.equal(report.results.length,7);report.status='PASS';
}catch(error){
 report.status='FAIL';report.error=error.stack;process.exitCode=1;
 try{report.failureFacts={pages:context?.pages().map(target=>({url:target.url(),frames:target.frames().map(frame=>({url:frame.url(),detached:frame.isDetached()}))})),assets:scope?await store('read'):null};if(page&&!page.isClosed())await screenshot('failure');}catch(failure){report.inspectFailure=failure.message;}
}finally{
 report.cleanupOK=await cleanupOwnedResources(report,[['browser',()=>handle?.close()],['fixture',()=>server?.close()],['network-guard',()=>guard?.close()]]);report.guardClosed=guard?.snapshot().closed===true;
 report.sourceChangedDuringRun=manifest?(await Promise.all(Object.entries(manifest.sourceHashes).map(async([path,value])=>hash(await readFile(path))!==value))).some(Boolean):null;
 report.buildManifestUnchanged=!!built&&hash(await readFile(join(built.unpacked,'build-manifest.json')))===hash(manifestBytes);report.runnerChangedDuringRun=JSON.stringify(await hashes(paths))!==JSON.stringify(report.testHashes);
 if(!report.cleanupOK||!report.guardClosed||report.sourceChangedDuringRun!==false||!report.buildManifestUnchanged||report.runnerChangedDuringRun){report.originalError=report.error;report.status='FAIL';report.error??='source-package-or-cleanup-failed';process.exitCode=1;}
 await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,error:report.error,authorityMode:report.authorityMode,results:report.results}));
