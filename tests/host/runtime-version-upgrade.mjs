/** Actual original BrowserLocal packages, same ID, one real reload, new docs.
 * All host responses are local synthetic fixtures; browser-wide egress denied. */
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rename,mkdir,symlink,readdir,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dir=await mkdtemp(join(tmpdir(),'vaiwl-runtime-version-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const OLD='5593e02eb81b1fc8fda3a12dc945d0280cf67d60',BASELINE='653ab73e1a5fcc51857a3ae87fcdfe9bf9fc515b';
const baseline=process.argv.includes('--baseline'),reportPath=process.argv.find(a=>a.endsWith('.json'))??join(dir,'report.json');
async function historicalPackage(ref,name){
 const source=join(dir,name+'-source');await mkdir(source);
 const archive=execFileSync('git',['archive',ref,'extension','src','simulator'],{cwd:root,maxBuffer:64*1024*1024});
 execFileSync('tar',['-xf','-','-C',source],{input:archive});
 await symlink(await realpath(join(root,'extension/tooling/node_modules')),join(source,'extension/tooling/node_modules'),'dir');
 const {packageHost:pack}=await import(pathToFileURL(join(source,'extension/package.mjs')));return pack(join(dir,name+'-package'),{browserLocal:true});
}
const old=await historicalPackage(OLD,'old'),next=baseline?await historicalPackage(BASELINE,'baseline'):packageHost(join(dir,'new-package'),{browserLocal:true});
const fingerprint=async folder=>/\bbuild="([a-f0-9]{64})"/.exec(await readFile(join(folder,'content.js'),'utf8'))?.[1];
const oldBuild=await fingerprint(old.unpacked),nextBuild=await fingerprint(next.unpacked);
assert.equal(oldBuild,'e287d27625cbeadbfdb3bf4410fe16011e0ae73c68bdf436b1071a38b50279cf');
if(baseline){assert.equal(nextBuild,'26a6145413a9db5acdfdc57e7643bea119c33fd5623216d1b437727ec2eaea30');assert.equal(next.archiveSha256,'d4a7a553293f8ddac70bcdb961b165059ce3ea61763eba0f285840cb993685c8');}
const info=JSON.parse(await readFile(join(next.unpacked,'build-manifest.json'),'utf8'));
const report={status:'RUNNING',sourceCommit:process.env.FREE_SOURCE_COMMIT??null,realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',kind:'ORIGINAL_BROWSERLOCAL_SAME_ID_SINGLE_RELOAD',baseline,oldCommit:OLD,oldBuild,nextBuild,archiveSha256:next.archiveSha256,sourceHashes:info.sourceHashes,runnerHash:sha(await readFile(new URL(import.meta.url))),cases:[],extraInventory:'2752 SYNTHETIC UNREFERENCED SENTINELS; NOT THE MAC FILE LIST'};
const P='g-p-11111111111111111111111111111111',C='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/g/'+P+'/project';
async function fileCount(path){let n=0;for(const e of await readdir(path,{withFileTypes:true}))n+=e.isDirectory()?await fileCount(join(path,e.name)):1;return n;}
try{
 for(const mode of ['clean-overlay','retained-atomic']){
  const work=join(dir,mode),slot=join(work,'registered');await mkdir(work);await cp(old.unpacked,slot,{recursive:true});
  if(mode==='retained-atomic'){await mkdir(join(slot,'historical'));for(let i=0;i<2752;i++)await writeFile(join(slot,'historical','candidate-'+i+'.mjs'),"throw Error('HISTORICAL_SENTINEL_EXECUTED');\n");}
  const row={mode,oldFiles:await fileCount(slot),reloadCalls:0,results:{},workerEvents:[],errors:[]};report.cases.push(row);
  assert.equal(row.oldFiles,mode==='retained-atomic'?2957:205);
  const guard=await createHistoricalNetworkGuard({fixtureOrigin:'http://127.0.0.1:48173'});let context;
  try{
   context=await chromium.launchPersistentContext(join(work,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??chromium.executablePath(),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
   await context.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedProjectHTML(P,C)}):r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
   context.on('serviceworker',w=>{row.workerEvents.push('created');w.on('close',()=>row.workerEvents.push('closed'));});
   const manager=await context.newPage();await manager.goto('chrome://extensions/');
   // CDP loadUnpacked alone bypasses the UI toggle. A subsequent ordinary reload
   // correctly disables an unpacked extension if this fresh profile stays OFF.
   await manager.evaluate(()=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true}));
   const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:slot}),documents=[];
   const inspect=async label=>{
    const page=await context.newPage(),session=await context.newCDPSession(page),scripts=[];
    page.on('pageerror',e=>{if(row.errors.length<12)row.errors.push({phase:label,message:e.message.slice(0,250)});});
    session.on('Debugger.scriptParsed',s=>{if(s.url===`chrome-extension://${id}/content.js`||s.url===`chrome-extension://${id}/extension/content-entry.mjs`)scripts.push({id:s.scriptId,path:s.url.slice(('chrome-extension://'+id+'/').length)});});await session.send('Debugger.enable');
    await page.goto(url);await page.waitForFunction(()=>['loaded','module-load-failed'].includes(document.documentElement.dataset.vaiwlBoot),null,{timeout:15000});
    const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/status.html`);await page.bringToFront();
    // Reload this background extension document after selecting the fixture.
    // Await the HTML's own module URL; do not execute a second popup instance.
    await popup.reload();await popup.evaluate(()=>import(chrome.runtime.getURL('extension/status.mjs')));
    const got=await popup.evaluate(async()=>{
     const [tab]=await chrome.tabs.query({active:true,currentWindow:true}),before=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});
     const boot=await chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_BOOT'},{documentId:before.documentId}),after=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});
     return {boot,tabId:tab.id,documentId:before.documentId,url:before.url,documentStable:before.documentId===after.documentId&&before.url===after.url&&after.documentLifecycle==='active',registeredBuild:chrome.runtime.getManifest().version_name??null};
    });
    assert(got.documentStable);assert.equal(got.url,url);assert(!documents.includes(got.documentId));documents.push(got.documentId);
    got.loadedScripts=[];for(const script of scripts){const {scriptSource}=await session.send('Debugger.getScriptSource',{scriptId:script.id});got.loadedScripts.push({path:script.path,sha256:sha(scriptSource)});}
    assert.equal(got.loadedScripts.filter(s=>s.path==='content.js').length,1,'one static injection per new document');
    got.summary=await popup.evaluate(()=>Object.fromEntries(['runtime-build','boot-stage','status-code','mount-stage'].map(id=>[id,document.getElementById(id)?.textContent??null])));
    got.unlockDisabled=await popup.getByRole('button',{name:'确认当前账号与工作空间，解锁本地空间',exact:true}).isDisabled();
    got.structureButtonCount=await popup.locator('#read-sidebar-structure').count();
    const final=await popup.evaluate(async tabId=>{const [active]=await chrome.tabs.query({active:true,currentWindow:true});return {activeTabId:active.id,...await chrome.webNavigation.getFrame({tabId,frameId:0})};},got.tabId);
    assert.equal(final.activeTabId,got.tabId);assert.equal(final.documentId,got.documentId);assert.equal(final.url,url);assert.equal(final.documentLifecycle,'active');
    got.documentHash=sha(got.documentId);got.summaryDocumentStable=true;delete got.documentId;delete got.tabId;delete got.url;
    if(label!=='old'){assert.equal(got.summary['runtime-build'],'运行指纹：'+got.boot.build);for(const [key,prefix]of Object.entries({'boot-stage':'启动阶段：','status-code':'本次状态码：','mount-stage':'挂载诊断：'}))assert(got.summary[key]?.startsWith(prefix)&&got.summary[key].length>prefix.length);}
    row.results[label]=got;return {page,popup};
   };
   await inspect('old');assert.equal(row.results.old.boot.build,oldBuild);
   if(mode==='retained-atomic'){const stage=join(work,'staged');await cp(slot,stage,{recursive:true});await cp(next.unpacked,stage,{recursive:true,force:true});await rename(slot,join(work,'old-held'));await rename(stage,slot);}else await cp(next.unpacked,slot,{recursive:true,force:true});
   row.updatedFiles=await fileCount(slot);assert.equal(row.updatedFiles,next.files+(mode==='retained-atomic'?2752:0));
   await inspect('overwrittenWithoutReload');const stale=row.results.overwrittenWithoutReload;
   assert.equal(stale.boot.build,oldBuild);assert.deepEqual(stale.loadedScripts.find(s=>s.path==='content.js'),{path:'content.js',sha256:sha(await readFile(join(old.unpacked,'content.js')))});
   if(baseline){assert.match(stale.summary['status-code'],/^本次状态码：(ready|connecting)$/);assert.equal(stale.unlockDisabled,false);row.baselineDefectReproduced=true;}
   else{assert.match(stale.summary['status-code'],/runtime-build-mismatch/);assert.equal(stale.boot.stage,'module-load-failed');assert(stale.unlockDisabled);assert.equal(stale.structureButtonCount,0);assert.doesNotMatch(stale.summary['mount-stage'],/show-returned/);}
   const prior=context.serviceWorkers().find(w=>w.url()===`chrome-extension://${id}/extension/worker.mjs`);assert(prior);
   const closed=new Promise(resolve=>prior.once('close',()=>resolve(true)));row.reloadCalls++;try{await prior.evaluate(()=>chrome.runtime.reload());}catch(e){if(!/closed|destroyed|Target/.test(e.message))throw e;}
   let timer;try{row.oldWorkerClosed=await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),3000);})]);}finally{clearTimeout(timer);}assert(row.oldWorkerClosed);
   // Browser's reload event must complete before creating the new document.
   await manager.waitForFunction(async id=>(await chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true})).some(e=>e.id===id&&e.state==='ENABLED'&&!e.disableReasons.reloading),id,{timeout:15000});
   await inspect('reloadedNewDocument');const current=row.results.reloadedNewDocument;
   assert.equal(current.boot.build,nextBuild);assert.equal(current.boot.stage,'module-loaded');assert.deepEqual(current.loadedScripts.find(s=>s.path==='content.js'),{path:'content.js',sha256:sha(await readFile(join(next.unpacked,'content.js')))});
   if(!baseline){assert.equal(current.registeredBuild,nextBuild);assert.equal(current.loadedScripts.length,1);assert.match(current.summary['status-code'],/^本次状态码：(ready|connecting)$/);}
   row.sameId=true;row.status='PASS';assert.equal(row.reloadCalls,1);assert(!row.errors.some(e=>e.message.includes('HISTORICAL_SENTINEL_EXECUTED')));
   row.browserVersion=context.browser().version();
  }finally{try{await context?.close();}finally{await guard.close();row.networkGuard=guard.snapshot();}}
 }
 if(!baseline){verifyHost(next.unpacked);for(const [path,hash]of Object.entries(info.sourceHashes))assert.equal(sha(await readFile(join(root,path))),hash,'source drift '+path);}
 assert.equal(sha(await readFile(new URL(import.meta.url))),report.runnerHash,'runner changed during verification');
 report.status=baseline?'BASELINE_DEFECT_REPRODUCED':'PASS_RUNTIME_VERSION_UPGRADE';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;}
finally{await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,oldBuild,nextBuild,cases:report.cases.map(c=>({mode:c.mode,status:c.status,reloadCalls:c.reloadCalls,oldFiles:c.oldFiles,updatedFiles:c.updatedFiles})),report:reportPath}));}
