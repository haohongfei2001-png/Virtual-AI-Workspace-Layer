import {verifyBackupRetirement} from './backup-retirement-browser-probe.mjs';
/** Actual current flow, packaged renderer and IDB. Only disposable synthetic assets. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {digest} from '../../src/data/hash.mjs';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import {j4AssetBackup,J4_REF} from './fixtures/j4-assets.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';

const mode=process.argv[3]??'browser-local';assert(['browser-local','c3'].includes(mode));
const local=mode==='browser-local',hash=x=>createHash('sha256').update(x).digest('hex');
const paths=['tests/host/backup-package-mv3-browser.mjs','tests/host/backup-retirement-browser-probe.mjs','tests/host/fixtures/server.mjs','tests/host/fixtures/legacy.html','tests/host/fixtures/native.mjs','tests/host/fixtures/native.css','tests/host/fixtures/observed-desktop.mjs','tests/host/fixtures/j4-assets.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs'];
const hashes=async names=>Object.fromEntries(await Promise.all(names.map(async p=>[p,hash(await readFile(p))])));
const requests=[];
async function fixture(){
 if(!local)return createHostFixtureServer({partitionedSidebar:true});
 const native=createServer((req,res)=>{requests.push(req.url);res.writeHead(req.url==='/c/'+J4_REF?200:404,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(req.url==='/c/'+J4_REF?observedDesktopHTML(J4_REF):'');});
 await new Promise(resolve=>native.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+native.address().port;
 return {origin,url:origin+'/c/'+J4_REF,snapshot:()=>({actions:{},requests:[...requests]}),close:()=>new Promise((resolve,reject)=>native.close(error=>error?reject(error):resolve()))};
}
const dir=await mkdtemp(join(tmpdir(),'vaiwl-backup-package-'));
const report={evidence:'REAL_HEADLESS_PACKAGED_MV3_OFFLINE_BACKUP',backend:'document-flow',authorityMode:local?'BROWSER_LOCAL':'EXPLICIT_OFFLINE_C3',fixtureAuthority:'TEST_ONLY_EXPLICIT_LOCAL_CONFIRMATION_AND_UI_ASSET_IMPORT',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',sourceCommit:process.env.FREE_SOURCE_COMMIT??process.env.GITHUB_SHA??null,artifactDirectory:dir,testHashes:await hashes(paths),results:[],errors:[],screenshots:[],limits:['Synthetic assets only; original installation backup and private data recovery are NOT_RUN.','Late packet denial also has a retired transfer and a different sender; parent-close causality is NOT_ESTABLISHED.']};
let server,guard,context,page,probe,workspace,built,manifestBytes,manifest,scope;
async function store(change){return probe.evaluate(async({scope,change,ref})=>{
 const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{WorkspaceRepository}=await import(chrome.runtime.getURL('src/data/repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
 const base=new ScopeRepository({indexedDB});try{
  const db=await base.open(),repository=new WorkspaceRepository({baseRepository:base});
  if(change==='seed'||change==='newer'){
   const state=(await repository.read(scope)).state;if(!state.refs[ref])throw Error('missing-imported-human-ref');
   const result=await repository.command(scope,{operationId:'fixture_backup_title_'+change,expectedRevision:state.revision,command:{type:'SET_TITLE',refId:ref,title:change==='seed'?'SYNTHETIC_PRO_OLD':'SYNTHETIC_PRO_NEWER'}});if(!result.ok)throw Error('synthetic-title-command-failed');
  }
  const state=(await repository.read(scope)).state,stores=await new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),out={};for(const name of names){const q=tx.objectStore(name).getAll();q.onsuccess=()=>out[name]=Object.fromEntries(q.result.map(r=>[r.key,digest(r)]));}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});
  return {stores,identities:state.identities,manualWithoutSnippets:digest({identities:state.identities,workspaces:state.workspaces,placements:state.placements,workingSet:state.preferences.workingSet??null,refs:state.refs}),manual:digest({identities:state.identities,workspaces:state.workspaces,placements:state.placements,workingSet:state.preferences.workingSet??null,savedSnippets:state.preferences.savedSnippets??null,refs:state.refs}),counts:{identities:Object.keys(state.identities).length,workspaces:Object.keys(state.workspaces).length,placements:Object.keys(state.placements).length,workingSet:state.preferences.workingSet?.value?.refs?.length??0,snippets:state.preferences.savedSnippets?.value?.length??0,humanRefs:state.refs[ref]?1:0},title:state.identities[ref]?.title??null};
 }finally{base.close();}
},{scope,change,ref:J4_REF});}
async function openBackup(){const settings=workspace.getByRole('button',{name:'工作空间设置',exact:true});if(await settings.getAttribute('aria-expanded')!=='true')await settings.click();await workspace.getByRole('button',{name:'备份与导入',exact:true}).click();await workspace.getByLabel('选择备份 JSON 文件',{exact:true}).waitFor();}
async function preview(bundle,name){await workspace.getByLabel('选择备份 JSON 文件',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});await workspace.getByText('请核对摘要。只有点击“确认恢复”才会修改本地人工资产。',{exact:true}).waitFor();}
async function confirmRestore(){await workspace.getByRole('button',{name:'确认恢复',exact:true}).click();await workspace.getByRole('button',{name:'工作空间设置',exact:true}).waitFor();await workspace.waitForFunction(()=>{const visit=root=>{for(const n of root.querySelectorAll('*'))if(n.shadowRoot){if(n.shadowRoot.activeElement?.classList.contains('workspace'))return true;if(visit(n.shadowRoot))return true;}return false;};return visit(document);});}
async function screenshot(name){const path=join(dir,name+'.png');await page.screenshot({path});report.screenshots.push({name,path});}
try{
 server=await fixture();guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,...(local?{browserLocal:true}:{})});report.package=built;manifestBytes=await readFile(join(built.unpacked,'build-manifest.json'));manifest=JSON.parse(manifestBytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=hash(manifestBytes);
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,acceptDownloads:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??chromium.executablePath(),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 report.browserVersion=context.browser().version();report.viewport={width:1440,height:1000};
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith('chrome-extension://'+id+'/'),timeout:15000});
 report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.invalid/',{signal:AbortSignal.timeout(1500)});return false;}catch{return true;}});assert.equal(report.workerNetworkBlocked,true);
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(server.url);
 const ready=async()=>{
  await page.waitForFunction(id=>{const nodes=[...document.querySelectorAll('iframe')].filter(n=>n.src==='chrome-extension://'+id+'/workspace.html'),n=nodes[0],r=n?.getBoundingClientRect();return nodes.length===1&&n.parentElement.hasAttribute('data-va-owned')&&!n.parentElement.hasAttribute('popover')&&r.width>160&&r.height>96&&getComputedStyle(n).visibility==='visible';},id,{timeout:15000});
  const frame=page.frames().find(f=>f.url()==='chrome-extension://'+id+'/workspace.html');await frame.getByRole('button',{name:'工作空间设置',exact:true}).waitFor({timeout:15000});return frame;
 };
 workspace=await ready();probe=await context.newPage();await probe.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();
 if(local){
  await workspace.getByRole('button',{name:'工作空间设置',exact:true}).click();
  for(const name of ['已保存片段','备份与导入','本地数据恢复'])assert.equal(await workspace.getByRole('button',{name,exact:true}).isDisabled(),true);
  await workspace.getByText('请在浏览器工具栏打开 VAIWL，确认本地空间后再管理片段、备份或恢复。',{exact:true}).waitFor();
  assert.equal(await workspace.getByLabel('选择备份 JSON 文件',{exact:true}).count(),0);assert.deepEqual(await probe.evaluate(()=>indexedDB.databases()),[]);await screenshot('unconfirmed-local-asset-guidance');
  report.unconfirmedLocalSpace={disabledAssetControls:3,persistentDatabases:0,backupInputAbsent:true};
  await workspace.getByRole('button',{name:'关闭设置',exact:true}).click();
  const unlock=await probe.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}));assert.equal(unlock.ok,true);assert.equal((await probe.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}))).mode,'personal');workspace=await ready();
 }
 await probe.waitForFunction(async local=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));const base=new ScopeRepository({indexedDB});try{const db=await base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.some(r=>r.key===r.payload?.scopeKey&&(local?JSON.parse(r.key)[0]==='vaiwl-local-v1'&&JSON.parse(r.key)[2]==='personal':JSON.parse(r.key).length===3)));tx.onabort=()=>reject(tx.error);});}finally{base.close();}},local,{timeout:15000});
 scope=await probe.evaluate(async local=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{normalizedScope}=await import(chrome.runtime.getURL('src/b1/identity.mjs'));const base=new ScopeRepository({indexedDB});try{const db=await base.open(),rows=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);}),roots=rows.filter(r=>r.key===r.payload?.scopeKey&&(local?JSON.parse(r.key)[0]==='vaiwl-local-v1'&&JSON.parse(r.key)[2]==='personal':JSON.parse(r.key).length===3));if(roots.length!==1)throw Error('ambiguous-fixture-scope');const parts=JSON.parse(roots[0].key);return normalizedScope(local?{kind:'browser-local',storage:parts[2],spaceId:parts[3]}:{verified:true,provider:parts[0],accountId:parts[1],organizationId:parts[2]});}finally{base.close();}},local);
 assert(scope);report.scopeKind=local?scope.kind:'authenticated-offline';report.scopeTupleLength=JSON.parse(scope.key).length;assert.equal(report.scopeTupleLength,local?4:3);
 // Fixture assets enter through the same production preview/confirm UI.
 const empty=await store('read');await openBackup();await preview(j4AssetBackup(scope,server.origin),'initial-synthetic-assets.json');assert.equal((await store('read')).manual,empty.manual);await confirmRestore();
 const initial=await store('seed');assert.equal(initial.title,'SYNTHETIC_PRO_OLD');for(const n of Object.values(initial.counts))assert(n>0);report.results.push({name:'explicit-ui-import-retains-six-human-asset-kinds',status:'PASS',counts:initial.counts});
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.locator('textarea').fill('RECOVERY_NATIVE_UNSENT_DRAFT');await page.evaluate(()=>{globalThis.recoveryOriginalEditor=document.querySelector('textarea');recoveryOriginalEditor.setSelectionRange(2,7);});
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();workspace=await ready();
 const draft=async()=>assert.equal(await page.evaluate(()=>document.querySelector('textarea')===recoveryOriginalEditor&&recoveryOriginalEditor.value==='RECOVERY_NATIVE_UNSENT_DRAFT'&&recoveryOriginalEditor.selectionStart===2&&recoveryOriginalEditor.selectionEnd===7),true);
 const before=await store('read');await openBackup();
 await workspace.evaluate(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{if(message.type==='HOST_UI_BACKUP_READ')globalThis.testLastBackupRead=structuredClone(message);return send(message);};});
 await workspace.getByRole('button',{name:'导出备份',exact:true}).click();const link=workspace.getByRole('link',{name:'下载备份',exact:true});await link.waitFor();await screenshot('backup-download-ready');
 const downloadPromise=page.waitForEvent('download');await link.click();const download=await downloadPromise,raw=await readFile(await download.path(),'utf8'),bundle=JSON.parse(raw);
 assert.equal(bundle.format,'vaiwl-assets');assert.equal(bundle.payload.channel,'none');for(const key of ['sources','events','coverage'])assert.deepEqual(bundle.payload[key],{});assert.equal(bundle.payload.scopeKey,scope.key);assert(Object.values(bundle.payload.identities).some(r=>r.title==='SYNTHETIC_PRO_OLD'));assert.deepEqual((await store('read')).stores,before.stores);await draft();report.results.push({name:'real-download-preserves-manual-assets-excludes-evidence-and-authority',status:'PASS'});
 const newer=await store('newer');assert.equal(newer.title,'SYNTHETIC_PRO_NEWER');await preview(bundle,'same-scope.json');assert.deepEqual((await store('read')).stores,newer.stores);await screenshot('backup-preview');await confirmRestore();
 const restored=await store('read');assert.deepEqual(restored.identities,newer.identities);assert.equal(restored.manual,newer.manual);await draft();report.results.push({name:'explicit-preview-then-restore-keeps-newer-human-assets-and-native-draft',status:'PASS'});
 await openBackup();
 for(const kind of ['foreign','corrupt']){
  const bad=structuredClone(bundle);if(kind==='foreign'){const parts=JSON.parse(bad.payload.scopeKey);parts[local?3:1]='foreign_fixture_space';bad.payload.scopeKey=JSON.stringify(parts);bad.checksum=digest(bad.payload);}else bad.checksum='0'.repeat(64);
  const unchanged=await store('read');await workspace.getByLabel('选择备份 JSON 文件',{exact:true}).setInputFiles({name:kind+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await workspace.getByRole('alert').waitFor();assert.deepEqual((await store('read')).stores,unchanged.stores);await draft();await screenshot('backup-'+kind+'-rejected');report.results.push({name:kind+'-backup-rejected-without-any-IDB-write',status:'PASS'});
 }
 assert.equal(server.snapshot().actions['send-intent']??0,0);assert.equal(server.snapshot().actions['create-project']??0,0);if(local)assert.equal(requests.filter(p=>p.startsWith('/backend-api/')||p.startsWith('/api/')).length,0);
 if(local){
  await workspace.getByRole('button',{name:'返回工作空间',exact:true}).click();await workspace.getByRole('button',{name:'工作空间设置',exact:true}).waitFor();
  const beforeList=await store('read');
  await workspace.evaluate(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{const result=await send(message);if(message.type==='HOST_UI_SNIPPET_LIST')globalThis.testLastLocalSnippetList={packet:structuredClone(message),workspaceRevision:result.workspaceRevision,nativeSelectionAvailable:result.nativeSelectionAvailable};return result;};});
  await workspace.getByRole('button',{name:'工作空间设置',exact:true}).click();await workspace.getByRole('button',{name:'已保存片段',exact:true}).click();
  await workspace.getByText('J4 retained human snippet',{exact:true}).waitFor();await workspace.getByText('可查看与管理已保存片段。当前页面暂不支持新建或定位片段。',{exact:true}).waitFor();
  for(const name of ['保存当前选区','定位片段'])assert.equal(await workspace.getByRole('button',{name,exact:true}).isDisabled(),true);
  const listed=await store('read');assert.equal(listed.manual,beforeList.manual);await draft();await screenshot('existing-local-snippet');
  const rejectedActions=await workspace.evaluate(async ref=>{
   const {packet,workspaceRevision,nativeSelectionAvailable}=testLastLocalSnippetList;if(nativeSelectionAvailable!==false)throw Error('native-source-not-restricted');const results=[];
   for(const action of ['save','locate']){const result=await chrome.runtime.sendMessage({v:1,type:'HOST_UI_SNIPPET',grantId:packet.grantId,mountId:packet.mountId,operationId:'fixture_rejected_'+action,expectedRevision:workspaceRevision,action,id:action==='save'?ref:'j4_snippet'});results.push({action,ok:result.ok});}
   return results;
  },J4_REF);assert.deepEqual(rejectedActions,[{action:'save',ok:false},{action:'locate',ok:false}]);assert.deepEqual((await store('read')).stores,listed.stores);
  await workspace.getByRole('button',{name:'删除片段',exact:true}).click();await workspace.getByText('暂无已保存片段。',{exact:true}).waitFor();
  const removed=await store('read');assert.equal(removed.counts.snippets,0);assert.equal(removed.manualWithoutSnippets,listed.manualWithoutSnippets);await draft();await screenshot('existing-local-snippet-removed');
  report.existingLocalSnippets={status:'PASS',scopeTupleLength:4,previewReadOnly:true,nativeSelectionAvailable:false,nativeActionsRejected:rejectedActions,explicitRemoveOnly:true,otherManualAssetsUnchanged:true,nativeDraftAndSelectionUnchanged:true};
  await workspace.getByRole('button',{name:'返回工作空间',exact:true}).click();await workspace.getByRole('button',{name:'工作空间设置',exact:true}).waitFor();
 }
 const stale=await workspace.evaluate(()=>globalThis.testLastBackupRead);assert(stale);await page.close();const settled=await store('read');const rejected=await probe.evaluate(packet=>chrome.runtime.sendMessage(packet),stale);assert.equal(rejected.ok,false);assert.equal(rejected.data,undefined);assert.deepEqual((await store('read')).stores,settled.stores);report.results.push({name:'late-backup-packet-from-another-document-cannot-read-retired-transfer',status:'PASS',parentCloseCausality:'NOT_ESTABLISHED'});
 report.retirementBoundary=await verifyBackupRetirement(probe);
 assert.equal(report.results.length,6);assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;try{report.failureFacts={pages:context?.pages().map(p=>({url:p.url(),frames:p.frames().map(f=>({url:f.url(),detached:f.isDetached()}))})),assets:scope?await store('read'):null};if(page&&!page.isClosed())await screenshot('failure');}catch(e){report.inspectFailure=String(e.message);}process.exitCode=1;}
finally{
 report.cleanupOK=await cleanupOwnedResources(report,[['browser',()=>context?.close()],['fixture',()=>server?.close()],['network-guard',()=>guard?.close()]]);report.guardClosed=guard?.snapshot().closed===true;
 report.sourceChangedDuringRun=manifest?(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean):null;
 report.buildManifestUnchanged=!!built&&hash(await readFile(join(built.unpacked,'build-manifest.json')))===hash(manifestBytes);report.runnerChangedDuringRun=JSON.stringify(await hashes(paths))!==JSON.stringify(report.testHashes);
 if(!report.cleanupOK||!report.guardClosed||report.sourceChangedDuringRun!==false||!report.buildManifestUnchanged||report.runnerChangedDuringRun){report.originalError=report.error;report.status='FAIL';report.error??='source-package-or-cleanup-failed';process.exitCode=1;}
 await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,error:report.error,authorityMode:report.authorityMode,results:report.results}));
