/** Production worker + production frame composition in one real MV3 package.
 * Host identity and data are an explicit loopback reconstruction. No fixture
 * owner is imported into the package, no grant is injected, no model is called. */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from '../host/fixtures/server.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from '../host/historical-network-guard.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {reduceCommand} from '../../src/data/state.mjs';
import {createBackup} from '../../src/data/backup.mjs';
import {digest} from '../../src/data/hash.mjs';
import {observeUnforcedWorker} from './unforced-worker.mjs';

const C='33333333-3333-4333-8333-333333333333',unknown='44444444-4444-4444-8444-444444444444';
const NAME='Unified manual topic',CHILD='Unified split topic',TITLE='Unified retained title',SERIES='Unified work series',CORRECTION='Explicit correction topic';
const LEGACY='Retained legacy topic',LEGACY_RELATED='Retained legacy related',LEGACY_EXCLUDED='Retained legacy excluded',LEGACY_TITLE='Retained legacy title';
const executablePath=process.env.FREE_CHROME_EXECUTABLE??process.env.PRO_CHROMIUM_EXECUTABLE;
if(!executablePath)throw Error('isolated-full-Chromium-required-no-skip');
const directory=await mkdtemp(join(tmpdir(),'vaiwl-unified-mv3-'));
const output=resolve(process.argv[2]??join(directory,'report.json'));await mkdir(dirname(output),{recursive:true});
const sourceSHA=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceStatus=()=>execFileSync('git',['status','--porcelain','--untracked-files=all','--','src','extension','tests','.github/workflows/vaiwl-unified-r1.yml'],{encoding:'utf8'}).trim();
const sourceStatusBefore=sourceStatus();
if(process.env.VAIWL_SOURCE_COMMIT&&sourceSHA!==process.env.VAIWL_SOURCE_COMMIT)throw Error('unified-browser-source-sha-mismatch');
if(process.env.CI==='true'&&sourceStatusBefore)throw Error('unified-browser-CI-source-must-match-commit');
const report={format:'vaiwl-unified-mv3/1',sourceSHA,sourceStatusBefore,sourceMatchesCommit:sourceStatusBefore==='',debuggerAttached:process.env.VAIWL_DEBUG_MV3==='1',evidenceClass:'PACKAGED_MV3_SYNTHETIC_HOST',
 status:'RUNNING',realChatGPT:'NOT_RUN',personalMac:'NOT_RUN',actualPAIA:'NOT_RUN',naturalWorkerSleep:'NOT_RUN',
 modelCalls:0,cloudBudget:0,releaseStatus:'NOT_RELEASE_READY',directory,checks:[],errors:[],screenshots:[],
 limits:['Explicit fixture identity is not real ChatGPT authorization.','Forced worker stop is not natural idle suspension.',
  'A passive synthetic extension is a coexistence regression, not actual PAIA acceptance.','Only disposable profiles and synthetic assets are used.']};
let server,guard,context,cdp,page,extensionId,built,manifest,control,idleProbe;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHashes=async()=>Object.fromEntries(await Promise.all(Object.keys(manifest?.sourceHashes??{}).sort().map(async path=>[path,hash(await readFile(path))])));
const check=(name,detail={})=>{report.checks.push({name,status:'PASS',...detail});console.log('PASS '+name);};
const workspaceURL=()=>`chrome-extension://${extensionId}/workspace.html`;
const frame=p=>p.frames().find(f=>f.url()===workspaceURL());
async function ready(p=page){
 await p.frameLocator(`iframe[src="${workspaceURL()}"]`).getByRole('button',{name:'Free',exact:true}).waitFor({timeout:20000});
 const f=frame(p);assert(f,'packaged workspace frame must exist');return f;
}
async function workspace(p=page){
 const back=p.getByRole('button',{name:'返回工作空间',exact:true});
 const current=p.frameLocator(`iframe[src="${workspaceURL()}"]`).getByRole('button',{name:'Free',exact:true});
 if(!await current.isVisible())await Promise.race([current.waitFor({timeout:20000}),back.waitFor({timeout:20000})]);
 if(await back.isVisible())await back.click();
 return ready(p);
}
async function pro(p=page){const f=await workspace(p);await auditRpc(f);await f.getByRole('button',{name:'Pro',exact:true}).click();await f.getByRole('button',{name:'新建主题',exact:true}).waitFor({timeout:10000});return f;}
async function freeReady(p=page){const f=await workspace(p);await f.getByText('Ordinary conversation',{exact:true}).first().waitFor();return f;}
async function closeDialog(f){const close=f.getByRole('button',{name:'关闭',exact:true});if(await close.isVisible())await close.click();}
async function screenshot(name){const path=join(dirname(output),name+'.png');await page.screenshot({path,fullPage:true});report.screenshots.push(path);}
async function launch(profile){
 const c=await chromium.launchPersistentContext(profile,{executablePath,headless:true,viewport:{width:1400,height:960},
  ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 await c.route('**/*',route=>{const url=route.request().url();return url.startsWith(server.origin+'/')||url.startsWith('chrome-extension://')?route.continue():route.abort();});
 c.on('page',p=>p.on('pageerror',error=>report.errors.push(error.message)));
 return c;
}
async function loadExtension(){cdp=await context.browser().newBrowserCDPSession();const installed=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});if(extensionId)assert.equal(installed.id,extensionId);extensionId=installed.id;}
async function debugWorker(){
 if(process.env.VAIWL_DEBUG_MV3!=='1')return;
 const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url===`chrome-extension://${extensionId}/extension/worker.mjs`);
 if(!target)return;const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId});let id=0;
 const send=(method,params={})=>cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:++id,method,params})});
 cdp.on('Target.receivedMessageFromTarget',({sessionId:incoming,message})=>{if(incoming!==sessionId)return;const value=JSON.parse(message);if(value.method==='Debugger.paused'){
  const description=value.params.data?.description??'';if(!/Promise\.prototype\.then|pro-request-aborted|stale-navigation-delivery/.test(description))console.log('DEBUG worker exception '+JSON.stringify({reason:value.params.reason,description,frames:value.params.callFrames?.slice(0,5).map(f=>({function:f.functionName,line:f.location.lineNumber}))}));void send('Debugger.resume');
 }});
 await send('Debugger.enable');await send('Debugger.setPauseOnExceptions',{state:'all'});
}
async function createTopic(f,name){await f.getByRole('button',{name:'新建主题',exact:true}).click();await f.getByRole('textbox',{name:'主题名称',exact:true}).fill(name);await f.getByRole('button',{name:'创建主题',exact:true}).click();await f.getByRole('heading',{name,exact:true}).waitFor();}
async function settings(f,name=NAME){await f.getByRole('button',{name:'主题设置：'+name,exact:true}).click();await f.getByRole('dialog',{name:'主题设置',exact:true}).waitFor();}
async function editReference(f,title=TITLE){await f.getByRole('button',{name:'名称与主题：'+title,exact:true}).first().click();await f.getByRole('dialog',{name:'名称与主题',exact:true}).waitFor();}
async function previewSplit(f){await settings(f);await f.getByRole('button',{name:'拆分主题',exact:true}).click();await f.getByRole('textbox',{name:'新主题 1 名称',exact:true}).fill(CHILD);await f.getByRole('combobox',{name:/^Ordinary conversation(?: · 已锁定)?$/}).selectOption('0');await f.getByRole('button',{name:'预览拆分',exact:true}).click();await f.getByRole('dialog',{name:'确认拆分',exact:true}).waitFor();}
async function establishNativeNone(){await page.getByRole('button',{name:'Move to project',exact:true}).click();await page.locator('#move-dialog[open]').waitFor();assert.equal(await page.locator('#move-dialog').getByRole('radio',{name:'No project',exact:true}).isChecked(),true);await page.locator('#move-dialog').getByRole('button',{name:'Close',exact:true}).click();}
async function assertDraft(){assert.equal(await page.evaluate(()=>globalThis.unifiedEditor===document.querySelector('textarea')&&unifiedEditor.value==='UNIFIED_UNSENT_DRAFT'),true);}
async function openBackup(f){
 await f.getByRole('button',{name:'Free',exact:true}).click();const settings=f.getByRole('button',{name:'工作空间设置',exact:true});
 if(await settings.getAttribute('aria-expanded')!=='true')await settings.click();
 await f.getByRole('button',{name:'备份与导入',exact:true}).click();await f.getByLabel('人工资产备份',{exact:true}).waitFor();
}
async function downloadBackup(f){
 await openBackup(f);await f.getByRole('button',{name:'导出备份',exact:true}).click();const link=f.getByRole('link',{name:'下载备份',exact:true});await link.waitFor();
 const pending=page.waitForEvent('download');await link.click();const download=await pending,bytes=await readFile(await download.path());
 await f.getByRole('button',{name:'返回工作空间',exact:true}).click();return {bytes,bundle:JSON.parse(bytes)};
}
// Test-only fault injection into this disposable extension origin. Production
// has no corruption or raw-storage API. All recovery uses the real UI/owner.
async function proStorage({removeRoot=false}={}){
 const worker=context.serviceWorkers().find(w=>w.url()===`chrome-extension://${extensionId}/extension/worker.mjs`);assert(worker);
 return worker.evaluate(async removeRoot=>{
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('vaiwl-b1-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction(['b23_states','b23_checkpoints','b23_operations'],removeRoot?'readwrite':'readonly'),values={};let failure;
   for(const store of ['b23_states','b23_checkpoints','b23_operations']){
    const q=tx.objectStore(store).getAll();q.onsuccess=()=>{
     values[store]=q.result;
     if(removeRoot&&store==='b23_states'){
      const roots=q.result.filter(row=>row.payload?.format==='vaiwl-pro-root/1');
      if(roots.length!==1){failure=Error('test-needs-exactly-one-pro-root');tx.abort();return;}
      tx.objectStore(store).delete(roots[0].key);
     }
    };
   }
   tx.oncomplete=()=>{
    const roots=values.b23_states.filter(row=>row.payload?.format==='vaiwl-pro-root/1');
    resolve({roots,quarantine:values.b23_states.filter(row=>row.payload?.format==='vaiwl-pro-recovery/1'),
     otherStates:values.b23_states.filter(row=>!row.payload?.format?.startsWith('vaiwl-pro-')),
     checkpoints:values.b23_checkpoints.filter(row=>row.payload?.format==='vaiwl-pro-root/1').length,
     journalCount:values.b23_operations.length,removed:removeRoot});
   };
   tx.onerror=()=>reject(tx.error??failure??Error('test-storage-read'));tx.onabort=()=>reject(failure??tx.error??Error('test-storage-abort'));
  });}finally{db.close();}
 },removeRoot);
}
async function auditRpc(f){
 await f.evaluate(()=>{
  if(globalThis.unifiedRpcAudit)return;globalThis.unifiedRpcAudit=[];
  const send=chrome.runtime.sendMessage.bind(chrome.runtime),privateKeys=new Set(['grant','scopeGrantId','metadataEvidence','evidencePack','providerPayload','executionTicket','privateIndex','completeIndex','references']);
  const containsPrivate=value=>value&&typeof value==='object'&&Object.entries(value).some(([key,item])=>privateKeys.has(key)||containsPrivate(item));
  chrome.runtime.sendMessage=async message=>{const result=await send(message);if(message?.type==='HOST_UI_PRO')unifiedRpcAudit.push({action:message.action,op:message.payload?.op,ok:result?.ok===true,reason:result?.reason??null,kind:result?.value?.kind??null,bytes:new TextEncoder().encode(JSON.stringify(result)).length,privateKeys:containsPrivate(result?.value)});return result;};
 });
}
async function verifyRpc(f){const rows=await f.evaluate(()=>globalThis.unifiedRpcAudit??[]);assert(rows.length>0);assert(rows.every(r=>r.bytes<=65536&&!r.privateKeys));report.rpcAudit=rows;}
async function installLifecycleController(){
 const dir=join(directory,'test-controller');await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'manifest.json'),JSON.stringify({manifest_version:3,name:'Isolated VAIWL target lifecycle probe',version:'1.0.0',permissions:['management'],
  content_scripts:[{matches:['http://127.0.0.1/*'],js:['coexist.js'],run_at:'document_start'}],
  content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; connect-src 'none'"}}));
 await writeFile(join(dir,'index.html'),'<script src="controller.js"></script>');
 await writeFile(join(dir,'controller.js'),`const target=${JSON.stringify(extensionId)};globalThis.setTargetEnabled=async enabled=>{await chrome.management.setEnabled(target,enabled);const value=await chrome.management.get(target);return {id:value.id,enabled:value.enabled};};`);
 await writeFile(join(dir,'coexist.js'),"document.addEventListener('input',event=>{if(event.target?.tagName==='TEXTAREA')document.documentElement.dataset.syntheticCoexistInput=String(Number(document.documentElement.dataset.syntheticCoexistInput??0)+1);},true);");
 const value=await cdp.send('Extensions.loadUnpacked',{path:dir});control=await context.newPage();await control.goto(`chrome-extension://${value.id}/index.html`);
}
async function privateProjectionAbsent(p){
 for(const f of p.frames().filter(f=>f.url().startsWith(`chrome-extension://${extensionId}/`))){
  try{if(await f.evaluate(title=>{const walk=root=>[...root.querySelectorAll('*')].some(n=>n.textContent?.includes(title)||n.shadowRoot&&walk(n.shadowRoot));return walk(document);},NAME))return false;}catch{}
 }
 return true;
}
try{
 server=await createHostFixtureServer({partitionedSidebar:true});guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 built=packageHost(join(directory,'package'),{offlineOrigin:server.origin,proR1:true});manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
 report.package={...built};report.fixture=server.manifest;report.sourceHashesBefore=await sourceHashes();
 assert(Object.hasOwn(manifest.files,'src/pro/integration/same-db-store.mjs'),'actual production Pro storage must be in package');
 assert(!Object.keys(manifest.files).some(path=>path.includes('fixture-owner')),'fixture authority must not be packaged');
 context=await launch(join(directory,'profile'));report.browser=context.browser().version();await loadExtension();await installLifecycleController();
 page=await context.newPage();await page.goto(server.origin+'/c/'+C);await ready();
 // Obtain positive NONE from the native source's real selected-menu semantics,
 // through the fixture's normal UI. A route or missing badge is not evidence.
 await establishNativeNone();
 let f=await workspace();await f.getByText('Ordinary conversation',{exact:true}).first().waitFor();
 assert.equal(await f.getByRole('heading',{name:NAME,exact:true}).count(),0);check('Free original-name projection is usable before Pro activation');
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.locator('textarea').fill('UNIFIED_UNSENT_DRAFT');await page.evaluate(()=>{globalThis.unifiedEditor=document.querySelector('textarea');});
 assert(Number(await page.evaluate(()=>document.documentElement.dataset.syntheticCoexistInput??0))>0);f=await workspace();await auditRpc(f);f=await pro();
 await createTopic(f,NAME);await settings(f);await f.getByRole('button',{name:'收录聊天',exact:true}).click();
 await f.getByRole('combobox',{name:'聊天',exact:true}).selectOption(C);await f.getByRole('button',{name:'收录',exact:true}).click();await f.getByRole('button',{name:'名称与主题：Ordinary conversation',exact:true}).first().waitFor();
 await editReference(f,'Ordinary conversation');await f.getByRole('textbox',{name:'整理标题',exact:true}).fill(TITLE);await f.getByRole('button',{name:'保存整理标题',exact:true}).click();await f.getByRole('button',{name:TITLE,exact:true}).first().waitFor();
 await editReference(f);await f.getByRole('button',{name:'解除名称锁',exact:true}).waitFor();await closeDialog(f);await assertDraft();
 check('manual topic, positive-NONE primary placement, derived title and name lock use production RPC');
 await createTopic(f,CORRECTION);await editReference(f);await f.getByRole('combobox',{name:'主主题',exact:true}).selectOption({label:CORRECTION});await f.getByRole('button',{name:'设为主主题',exact:true}).click();
 await editReference(f);await f.getByRole('button',{name:'解除排除：'+NAME,exact:true}).click();await f.getByRole('button',{name:'确认',exact:true}).click();
 await editReference(f);await f.getByRole('combobox',{name:'主主题',exact:true}).selectOption({label:NAME});await f.getByRole('button',{name:'设为主主题',exact:true}).click();
 await editReference(f);await f.getByRole('button',{name:'解除排除：'+CORRECTION,exact:true}).waitFor();assert.equal(await f.getByRole('combobox',{name:'主主题',exact:true}).locator('option:checked').textContent(),NAME);
 await f.getByRole('button',{name:'不参与 AI 整理',exact:true}).click();await f.getByRole('button',{name:'确认',exact:true}).click();await editReference(f);await f.getByRole('button',{name:'允许参与 AI 整理',exact:true}).waitFor();await closeDialog(f);
 check('explicit primary correction persists source exclusion and per-reference processing exclusion');
 // UNKNOWN is never silently converted into eligible NONE by the Pro frame.
 await settings(f);await f.getByRole('button',{name:'收录聊天',exact:true}).click();assert.equal(await f.getByRole('combobox',{name:'聊天',exact:true}).locator(`option[value="${unknown}"]`).count(),0);await closeDialog(f);
 check('UNKNOWN reference excluded from manual collection choices');
 await createTopic(f,'Undo this whole topic');await f.getByRole('button',{name:'整理记录',exact:true}).click();await f.getByRole('button',{name:'检查撤销',exact:true}).first().click();await f.getByRole('button',{name:'确认撤销',exact:true}).click();
 await f.getByRole('heading',{name:'Undo this whole topic',exact:true}).waitFor({state:'hidden'});check('whole-operation undo removes exactly the reviewed topic');
 // Actual split + merge previews and commits, then a user-confirmed Series.
 await previewSplit(f);assert.equal(await f.getByRole('button',{name:'确认应用',exact:true}).count(),0);await closeDialog(f);await editReference(f);await f.getByRole('button',{name:'解除关系锁',exact:true}).click();check('locked relationship blocks structural application until explicitly unlocked');
 await previewSplit(f);assert.equal(await f.getByRole('heading',{name:CHILD,exact:true}).count(),0);await f.getByRole('button',{name:'确认应用',exact:true}).click();await f.getByRole('heading',{name:CHILD,exact:true}).waitFor();
 await settings(f);await f.getByRole('button',{name:'合并主题',exact:true}).click();await f.getByRole('checkbox',{name:'合并「'+CHILD+'」',exact:true}).check();await f.getByRole('button',{name:'预览合并',exact:true}).click();await f.getByRole('dialog',{name:'确认合并',exact:true}).waitFor();await f.getByRole('button',{name:'确认应用',exact:true}).click();await f.getByRole('heading',{name:CHILD,exact:true}).waitFor({state:'hidden'});
 await settings(f);await f.getByRole('button',{name:'查看与编辑工作线',exact:true}).click();await f.getByRole('button',{name:'建立工作线',exact:true}).click();await f.getByRole('textbox',{name:'工作线名称',exact:true}).fill(SERIES);await f.getByRole('button',{name:'预览工作线',exact:true}).click();await f.getByRole('button',{name:'确认应用',exact:true}).click();
 check('split, merge and Series preview-confirm execute through the same production worker');
 await f.getByRole('button',{name:'Free',exact:true}).click();await f.getByText('Ordinary conversation',{exact:true}).first().waitFor();assert.equal(await f.getByRole('button',{name:TITLE,exact:true}).count(),0);await assertDraft();
 f=await pro();await f.getByRole('button',{name:TITLE,exact:true}).first().waitFor();await assertDraft();check('Free and Pro switch preserves assets, original Free titles and the exact native draft node');
 await debugWorker();const pagesBeforeNavigation=context.pages().length;await f.getByRole('button',{name:TITLE,exact:true}).first().click();await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();assert.equal(page.url(),server.origin+'/c/'+C);assert.equal(context.pages().length,pagesBeforeNavigation);await assertDraft();
 f=await workspace();await f.getByRole('button',{name:TITLE,exact:true}).first().waitFor();await assertDraft();check('Pro current-row navigation uses native reading and four-grid return without replacing the draft');
 await screenshot('unified-pro-workspace');await verifyRpc(f);check('actual frame replies are bounded and contain no private Pro capabilities');
 const beforeDamage=await proStorage({removeRoot:true});assert(beforeDamage.roots[0].payload.sequence>0);assert.equal((await proStorage()).roots.length,0);
 await f.getByRole('button',{name:'Free',exact:true}).click();await f.getByText('Ordinary conversation',{exact:true}).first().waitFor();await f.getByRole('button',{name:'Pro',exact:true}).click();
 await f.getByText('整理暂不可用，Free 仍可使用。',{exact:true}).waitFor();assert.equal(await f.getByRole('heading',{name:NAME,exact:true}).isVisible(),false);await assertDraft();
 await f.getByRole('button',{name:'检查 Pro 数据恢复',exact:true}).click();await f.getByRole('button',{name:'检查恢复记录',exact:true}).click();await f.getByRole('button',{name:'确认恢复 Pro 数据',exact:true}).waitFor();
 assert.equal((await proStorage()).roots.length,0,'recovery review must not write the missing root');await f.getByRole('button',{name:'确认恢复 Pro 数据',exact:true}).click();await f.getByText('恢复操作已确认，请重新打开 Pro 核对资料。',{exact:true}).waitFor();await f.getByRole('dialog',{name:'检查 Pro 数据恢复',exact:true}).getByRole('button',{name:'完成',exact:true}).click();
 const afterRepair=await proStorage();assert.equal(afterRepair.roots.length,1);assert.deepEqual(afterRepair.roots[0].payload.state,beforeDamage.roots[0].payload.state);assert.deepEqual(afterRepair.otherStates,beforeDamage.otherStates);assert.equal(afterRepair.journalCount,beforeDamage.journalCount);assert.equal(afterRepair.quarantine.length,1);assert.equal(afterRepair.quarantine[0].payload.original.root,null);
 f=await pro();await f.getByRole('heading',{name:NAME,exact:true}).waitFor();await f.getByRole('button',{name:TITLE,exact:true}).first().waitFor();await assertDraft();
 report.recovery={injection:'TEST_ONLY_CDP_DELETE_CURRENT_PRO_ROOT',previewWroteRoot:false,retainedOverlayDigest:digest(afterRepair.roots[0].payload.state),retainedJournalRows:afterRepair.journalCount,quarantineRecords:afterRepair.quarantine.length};
 check('missing Pro root fails closed; reviewed production recovery restores the entire journal-backed overlay without changing Free assets');
 const exported=await downloadBackup(f),backupBytes=exported.bytes,bundle=exported.bundle;assert.equal(bundle.format,'vaiwl-unified-assets');assert(bundle.pro&&bundle.free);assert.equal(JSON.stringify(bundle).includes('accessToken'),false);report.backup={format:bundle.format,bytes:backupBytes.length,sha256:hash(backupBytes)};
 f=await pro();check('one composite backup downloads Free and Pro assets without authority or billing');
 const peer=await context.newPage();await peer.goto(server.origin+'/c/'+C);await freeReady(peer);const peerFrame=await pro(peer);await peerFrame.getByRole('heading',{name:NAME,exact:true}).waitFor();check('second tab sees persisted same-scope assets through a separate live UI grant');await peer.close();
 // Stop an actual MV3 worker. No mock service lifecycle and no injection of a
 // replacement grant; the packaged host must perform its normal fresh join.
 const events=[],pageCDP=await context.newCDPSession(page);pageCDP.on('ServiceWorker.workerVersionUpdated',e=>events.push(...(e.versions??[])));await pageCDP.send('ServiceWorker.enable');
 const until=Date.now()+10000;while(!events.some(v=>v.scriptURL===`chrome-extension://${extensionId}/extension/worker.mjs`&&v.runningStatus==='running')&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,30));
 const version=events.find(v=>v.scriptURL===`chrome-extension://${extensionId}/extension/worker.mjs`&&v.runningStatus==='running');assert(version,'actual running MV3 worker required');const oldFrame=f;
 await pageCDP.send('ServiceWorker.stopWorker',{versionId:version.versionId});
 await page.waitForFunction(()=>document.querySelector('iframe[src$="/workspace.html"]')?.isConnected,null,{timeout:20000});
 const deadline=Date.now()+25000;while(frame(page)===oldFrame&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));assert.notEqual(frame(page),oldFrame,'fresh frame must replace expired worker grant');
 f=await pro();await f.getByRole('heading',{name:NAME,exact:true}).waitFor();await assertDraft();check('forced MV3 worker termination recovers data through fresh frame authorization');await pageCDP.detach();
 // Restart the actual browser process, retaining only its disposable disk DB.
 await context.close();context=null;context=await launch(join(directory,'profile'));await loadExtension();page=await context.newPage();await page.goto(server.origin+'/c/'+C);await freeReady();f=await pro();await f.getByRole('heading',{name:NAME,exact:true}).waitFor();await f.getByRole('button',{name:TITLE,exact:true}).first().waitFor();check('whole browser-process restart retains DB4 Pro assets');
 // A new server principal must receive another scope; cached local assets are
 // not permission to open the previous account. This is an offline source test.
 server.setPrincipal('different-offline-principal');await page.reload();await freeReady();f=await pro();assert.equal(await f.getByRole('heading',{name:NAME,exact:true}).count(),0);await createTopic(f,'Other account only');
 server.setPrincipal('user-host-fixture');await page.reload();await freeReady();f=await pro();await f.getByRole('heading',{name:NAME,exact:true}).waitFor();assert.equal(await f.getByRole('heading',{name:'Other account only',exact:true}).count(),0);check('verified offline principal switch cannot mix Pro namespaces');
 // Controller is a separate test-only extension. Product permissions remain
 // unchanged; disabling/uninstalling here affects only this disposable profile.
 await installLifecycleController();await page.bringToFront();await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.locator('textarea').fill('UNIFIED_UNSENT_DRAFT');await page.evaluate(()=>{globalThis.unifiedEditor=document.querySelector('textarea');});await workspace();assert.equal(await privateProjectionAbsent(page),false,'private-data detector needs a positive control before actual disable');
 const disabled=await control.evaluate(()=>setTargetEnabled(false));assert.equal(disabled.enabled,false);
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-va-owned]')].every(n=>!n.matches(':popover-open')),null,{timeout:15000});assert(await privateProjectionAbsent(page));await assertDraft();await page.locator('textarea').fill('UNIFIED_NATIVE_AFTER_DISABLE');await page.getByRole('button',{name:'Tools',exact:true}).click();await page.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();check('actual extension disable retires private UI and restores native draft and tools');
 const enabled=await control.evaluate(()=>setTargetEnabled(true));assert.equal(enabled.enabled,true);await page.reload();await freeReady();f=await pro();await f.getByRole('heading',{name:NAME,exact:true}).waitFor();check('same extension ID reenable retains user assets');
 await cdp.send('Extensions.uninstall',{id:extensionId});await page.waitForFunction(()=>[...document.querySelectorAll('[data-va-owned]')].every(n=>!n.matches(':popover-open')),null,{timeout:15000});assert(await privateProjectionAbsent(page));await page.locator('textarea').fill('UNIFIED_NATIVE_AFTER_UNINSTALL');await page.getByRole('button',{name:'Tools',exact:true}).click();await page.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();check('actual uninstall returns the same document to native input and controls');
 // Restore the downloaded bundle through the existing production chunked UI
 // into another blank installation, not by directly writing IndexedDB.
 await context.close();context=null;context=await launch(join(directory,'restore-profile'));await loadExtension();page=await context.newPage();await page.goto(server.origin+'/c/'+C);f=await ready();await openBackup(f);
 await f.getByLabel('选择备份 JSON 文件',{exact:true}).setInputFiles({name:'unified-synthetic-backup.json',mimeType:'application/json',buffer:backupBytes});await f.getByRole('button',{name:'确认恢复',exact:true}).waitFor();await f.getByRole('button',{name:'确认恢复',exact:true}).click();f=await pro();await f.getByRole('heading',{name:NAME,exact:true}).waitFor();
 // A data backup carries no positive membership authority. Reacquire current
 // NONE from the native source before expecting the restored organized row.
 await establishNativeNone();f=await pro();await f.getByRole('button',{name:TITLE,exact:true}).first().waitFor();check('downloaded composite backup restores actual assets through a blank installation UI with fresh native membership evidence');
 // Free v2.7 has no exposed virtual-workspace creation control. Import a
 // synthetic old data-only file through its real backup UI, then upgrade through
 // the production Pro review. This file grants no source or account authority.
 let legacyState=structuredClone(bundle.free.payload);legacyState.refs[C]??={id:C,nativeUrl:server.origin+'/c/'+C,projectId:null,nativeTitle:'Ordinary conversation',available:true};
 for(const [id,name]of [['legacy_main',LEGACY],['legacy_related',LEGACY_RELATED],['legacy_excluded',LEGACY_EXCLUDED]]){
  legacyState=reduceCommand(legacyState,{type:'CREATE_WORKSPACE',id,name});legacyState=reduceCommand(legacyState,{type:'PLACE',workspaceId:id,refId:C,excluded:id==='legacy_excluded',order:7,locked:true});
 }
 legacyState=reduceCommand(legacyState,{type:'SET_TITLE',refId:C,title:LEGACY_TITLE});const legacyFile=createBackup(legacyState),legacyBytes=Buffer.from(JSON.stringify(legacyFile));
 await context.close();context=null;context=await launch(join(directory,'legacy-upgrade-profile'));await loadExtension();page=await context.newPage();await page.goto(server.origin+'/c/'+C);await freeReady();await establishNativeNone();f=await workspace();await openBackup(f);
 await f.getByLabel('选择备份 JSON 文件',{exact:true}).setInputFiles({name:'synthetic-free-legacy-assets.json',mimeType:'application/json',buffer:legacyBytes});await f.getByRole('button',{name:'确认恢复',exact:true}).waitFor();await f.getByRole('button',{name:'确认恢复',exact:true}).click();
 f=await workspace();const importedLegacy=(await downloadBackup(f)).bundle.free;f=await pro();
 assert.equal(await f.getByRole('heading',{name:LEGACY,exact:true}).count(),0);await f.getByRole('button',{name:'整理设置',exact:true}).click();await f.getByRole('button',{name:'检查旧版整理升级',exact:true}).click();await f.getByRole('button',{name:'检查可升级资料',exact:true}).click();await f.getByRole('button',{name:'确认升级',exact:true}).waitFor();assert.equal(await f.getByRole('heading',{name:LEGACY,exact:true}).count(),0);await f.getByRole('button',{name:'确认升级',exact:true}).click();
 await f.getByRole('heading',{name:LEGACY,exact:true}).waitFor();await f.getByRole('heading',{name:LEGACY_RELATED,exact:true}).waitFor();await f.getByRole('heading',{name:LEGACY_EXCLUDED,exact:true}).waitFor();
 await f.getByRole('button',{name:'整理设置',exact:true}).click();await f.getByRole('button',{name:'核对：Ordinary conversation',exact:true}).click();await f.getByRole('combobox',{name:'主主题',exact:true}).selectOption('legacy_main');await f.getByRole('button',{name:'预览选择',exact:true}).click();await f.getByRole('button',{name:'确认选择',exact:true}).click();
 await f.getByRole('button',{name:LEGACY_TITLE,exact:true}).first().waitFor();await editReference(f,LEGACY_TITLE);await f.getByRole('button',{name:'解除名称锁',exact:true}).waitFor();await f.getByRole('button',{name:'解除排除：'+LEGACY_EXCLUDED,exact:true}).waitFor();assert.equal(await f.getByRole('combobox',{name:'主主题',exact:true}).locator('option:checked').textContent(),LEGACY);await closeDialog(f);
 const migrated=await downloadBackup(f);for(const key of ['refs','workspaces','placements','identities','preferences'])assert.deepEqual(migrated.bundle.free.payload[key],importedLegacy.payload[key],key+' legacy assets must be retained');
 assert.equal(migrated.bundle.pro.state.topics.legacy_main.name,LEGACY);assert.equal(migrated.bundle.pro.state.legacyResolutions[C].status,'resolved');assert.equal(migrated.bundle.pro.state.legacyResolutions[C].chosenPrimary,'legacy_main');
 report.legacyUpgrade={inputFormat:legacyFile.format,inputSHA256:hash(legacyBytes),source:'SYNTHETIC_DATA_ONLY_FILE_THROUGH_FREE_BACKUP_UI',topics:3,relationships:3,explicitPrimary:true,freeAssetsRetained:true};
 check('legacy Free file imports and upgrades through production UI, preserving original IDs, locks, exclusion and explicit ambiguous-primary review');
 // Reuse the same on-disk assets with no host tabs and no Playwright worker
 // attachment during one raw-CDP observation. Lack of a stop stays explicit.
 await context.close();context=null;
 idleProbe=await observeUnforcedWorker({chromium,executablePath,profileDir:join(directory,'legacy-upgrade-profile'),packagePath:built.unpacked,extensionId,networkGuard:guard.config});
 context=idleProbe.context;cdp=await context.browser().newBrowserCDPSession();report.unforcedWorkerObservation=idleProbe.report;report.naturalWorkerSleep=idleProbe.report.naturalWorkerSleep;
 await context.route('**/*',route=>{const url=route.request().url();return url.startsWith(server.origin+'/')||url.startsWith('chrome-extension://')?route.continue():route.abort();});
 context.on('page',p=>p.on('pageerror',error=>report.errors.push(error.message)));page=await context.newPage();await page.goto(server.origin+'/c/'+C);await freeReady();f=await pro();await f.getByRole('heading',{name:LEGACY,exact:true}).waitFor();
 await establishNativeNone();f=await pro();await f.getByRole('button',{name:LEGACY_TITLE,exact:true}).first().waitFor();
 const awakened=(await cdp.send('Target.getTargets')).targetInfos.find(target=>target.type==='service_worker'&&target.url===`chrome-extension://${extensionId}/extension/worker.mjs`);assert(awakened);
 if(idleProbe.report.initialWorkerDestroyed){assert.notEqual(awakened.targetId,idleProbe.report.initialWorkerId);idleProbe.report.recovery='PASS_NEW_WORKER_FRESH_UI_RETAINED_ASSETS';idleProbe.report.status='UNFORCED_TARGET_DESTRUCTION_RECOVERY_PASS';}
 else idleProbe.report.recovery='ASSETS_VERIFIED_NO_STOP_OBSERVED';
 idleProbe.report.recoveredWorkerId=awakened.targetId;
 check('persisted assets and fresh host authorization remain correct after the finite unattached-worker observation',{observation:idleProbe.report.status,naturalWorkerSleep:idleProbe.report.naturalWorkerSleep});
 assert.equal(server.snapshot().actions['send-intent']??0,0);assert.equal(server.snapshot().actions['create-project']??0,0);assert.equal(server.snapshot().actions['new-project-chat']??0,0);report.nativeActions=server.snapshot().actions;
 assert.deepEqual(report.errors,[]);report.verification=verifyHost(built.unpacked);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;if(page&&!page.isClosed())try{report.failure={url:page.url(),frames:page.frames().map(f=>f.url()),host:await page.evaluate(()=>({startup:document.documentElement.dataset.vaiwlStartup,state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason})),rpc:await frame(page)?.evaluate(()=>globalThis.unifiedRpcAudit??[])};await screenshot('unified-failure');}catch{}}
finally{
 report.sourceStatusAfter=sourceStatus();report.sourceMatchesCommit=report.sourceMatchesCommit&&report.sourceStatusAfter==='';
 if(manifest){report.sourceHashesAfter=await sourceHashes();report.sourcesStable=JSON.stringify(report.sourceHashesBefore)===JSON.stringify(report.sourceHashesAfter);if(!report.sourcesStable){report.status='FAIL';report.sourceChangedDuringRun=true;process.exitCode=1;}}
 try{await context?.close();await idleProbe?.close();await guard?.close();await server?.close();report.cleanup=true;}catch(error){report.cleanup=false;report.cleanupError=String(error);report.status='FAIL';process.exitCode=1;}
 report.networkGuard=guard?.snapshot();await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,output}));
}
