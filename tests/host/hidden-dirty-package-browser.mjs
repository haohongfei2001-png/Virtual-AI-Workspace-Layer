/** Offline native DOM publication + real browser tab visibility; no fake hints. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {legacyExpectedWorld as expected} from './expected/legacy.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),script=new URL(import.meta.url),scriptHash=hash(await readFile(script));
const server=await createHostFixtureServer(),dir=await mkdtemp('/private/tmp/vaiwl-hidden-dirty-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const report={status:'NOT_RUN',evidence:'REAL_HEADLESS_PACKAGED_MV3_HIDDEN_DIRTY',fixtureMutation:'OFFLINE_NATIVE_DOM_PROJECT_RENAMES_NOT_REAL_ACCOUNT_WRITES',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',sourceHashes:build.sourceHashes,scriptHash,publications:[],errors:[]};
let handle,guard,page,workspace,sidebar,phase='launch';
async function wait(check,label,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,25));}throw Error(label);}
const audit=()=>structuredClone(globalThis.hiddenDirtyProbe);
try{
 guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
 const {context,browser}=handle;report.browser=browser.version();
 await context.route('**/*',route=>route.request().url().startsWith(server.origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 await context.addInitScript(()=>{
  if(location.protocol!=='chrome-extension:'||!chrome.runtime?.sendMessage)return;
  const p=globalThis.hiddenDirtyProbe={document:crypto.randomUUID(),views:[],pending:0,renewals:0,nextRenewAt:0,visibility:[],hints:[]};
  document.addEventListener('visibilitychange',e=>{if(p.visibility.length<32)p.visibility.push({state:document.visibilityState,trusted:e.isTrusted,at:Date.now()});});
  const send=chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage=function(...args){const m=args[0],view=m?.type==='HOST_UI_VIEW';let row;if(view){row={at:Date.now(),visibility:document.visibilityState,query:structuredClone(m.query)};if(p.views.length<160)p.views.push(row);p.pending++;}const result=send(...args);if(result?.then)result.then(r=>{if(r?.ok&&r.grant)p.nextRenewAt=Date.now()+Math.min(10000,(Date.parse(r.grant.expiresAt)-Date.now())/2);if(m?.type==='HOST_UI_RENEW'&&r?.ok)p.renewals++;if(view){p.pending--;Object.assign(row,{state:r?.state,scope:r?.page?.scope,revision:r?.page?.revision});}},()=>{if(view)p.pending--;});return result;};
  const connect=chrome.runtime.connect.bind(chrome.runtime);chrome.runtime.connect=function(...args){const port=connect(...args);port.onMessage.addListener(m=>{if(p.hints.length<160)p.hints.push({at:Date.now(),type:m?.type,visibility:document.visibilityState});});return port;};
 });
 const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{timeout:15000});
 async function activate(target){await worker.evaluate(async url=>{const tabs=await chrome.tabs.query({}),tab=tabs.find(t=>t.url===url);if(!tab)throw Error('missing-fixture-tab');await chrome.tabs.update(tab.id,{active:true});},target.url());await target.waitForFunction(()=>document.visibilityState==='visible',null,{timeout:2000});}
 async function mounted(target){await target.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});return target.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);}
 page=await context.newPage();await page.goto(server.url);await activate(page);workspace=await mounted(page);sidebar=page.frames().find(f=>f.url()===`chrome-extension://${id}/sidebar.html`);assert(workspace&&sidebar);await workspace.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:15000});
 await page.locator('textarea').fill('HIDDEN_DIRTY_NATIVE_DRAFT');await page.evaluate(()=>{hiddenDirtyOriginal={document,editor:document.querySelector('textarea')};});await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
 const second=await context.newPage();await second.goto(server.origin+'/g/'+expected.projects[0].id+'/project');await activate(second);const secondFrame=await mounted(second);assert(secondFrame);await secondFrame.getByText('First project conversation',{exact:true}).first().waitFor({timeout:15000});
 // Read-only IDB oracle witnesses actual commits from the native adapter.
 async function facts(){return secondFrame.evaluate(async project=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs'));const base=new ScopeRepository({indexedDB});try{const db=await base.open(),rows=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});const root=rows.find(r=>r.key===r.payload?.scopeKey&&Object.values(r.payload?.sources??{}).some(s=>s.channel==='host-dom'));if(!root)return null;const [provider,accountId,organizationId]=JSON.parse(root.key),value=await new NativeRepository({baseRepository:base}).read({verified:true,provider,accountId,organizationId});return {scope:root.key,name:value.projects[project]?.nativeName,revision:value.revision};}finally{base.close();}},expected.projects[0].id);}
 await activate(page);await workspace.getByText('Ordinary conversation',{exact:true}).waitFor();
 phase='settled-renewal-window';await wait(async()=>{const values=await Promise.all([workspace.evaluate(audit),sidebar.evaluate(audit)]);return values.every(p=>p.pending===0&&p.views.at(-1)?.state==='ready'&&p.nextRenewAt-Date.now()>6500);},phase,15000);
 await activate(second);await page.waitForFunction(()=>document.visibilityState==='hidden',null,{timeout:2000});for(const f of [workspace,sidebar])await f.waitForFunction(()=>document.visibilityState==='hidden'&&hiddenDirtyProbe.pending===0,null,{timeout:2000});
 report.before={workspace:await workspace.evaluate(audit),sidebar:await sidebar.evaluate(audit),facts:await facts(),at:Date.now()};
 assert.equal(report.before.workspace.views.at(-1).scope,report.before.facts.scope);assert.equal(report.before.sidebar.views.at(-1).scope,report.before.facts.scope);
 phase='hidden-native-publications';
 for(let i=1;i<=3;i++){
  const title='Hidden native publication '+i;await second.evaluate(title=>{document.querySelector('main > header > h1').textContent=title;document.querySelector('#reading > h2').textContent=title;},title);
  await wait(async()=> (await facts())?.name===title,'native-publication-'+i);
  const current=await facts();report.publications.push({title,...current,at:Date.now()});
 }
 await wait(async()=>{const a=await workspace.evaluate(audit),b=await sidebar.evaluate(audit);return a.hints.length>report.before.workspace.hints.length&&b.hints.length>report.before.sidebar.hints.length;},'real-hints-arrive',2000);
 report.hidden={workspace:await workspace.evaluate(audit),sidebar:await sidebar.evaluate(audit),at:Date.now()};
 for(const role of ['workspace','sidebar']){const before=report.before[role],after=report.hidden[role];assert.equal(after.document,before.document);assert.equal(after.views.length,before.views.length,role+' hidden VIEW count');assert.equal(after.renewals,before.renewals,role+' renewal confound');assert(after.nextRenewAt>report.hidden.at,'publication check must precede renewal');assert(after.hints.length>before.hints.length);}
 phase='real-foreground-fresh-view';await activate(page);await workspace.waitForFunction(count=>document.visibilityState==='visible'&&hiddenDirtyProbe.views.length>count&&hiddenDirtyProbe.views.at(-1).state==='ready',report.hidden.workspace.views.length,{timeout:6000});
 await workspace.getByRole('link',{name:'打开项目以新建聊天 Hidden native publication 3',exact:true}).waitFor({timeout:6000});
 report.after={workspace:await workspace.evaluate(audit),sidebar:await sidebar.evaluate(audit)};assert.equal(report.after.workspace.views.at(-1).scope,report.before.facts.scope);assert.equal(report.after.workspace.document,report.before.workspace.document);assert(!workspace.isDetached()&&!sidebar.isDetached());
 assert.deepEqual(report.after.workspace.visibility.slice(-2).map(v=>[v.state,v.trusted]),[['hidden',true],['visible',true]]);
 assert(await page.evaluate(()=>hiddenDirtyOriginal.document===document&&hiddenDirtyOriginal.editor===document.querySelector('textarea')&&hiddenDirtyOriginal.editor.value==='HIDDEN_DIRTY_NATIVE_DRAFT'));
 assert.equal(server.snapshot().actions['send-intent']??0,0);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.failedPhase=phase;report.error=String(error.stack??error);process.exitCode=1;try{report.failureAudits={workspace:await workspace?.evaluate(audit),sidebar:await sidebar?.evaluate(audit)};report.screenshot=join(dir,'failure.png');await page?.screenshot({path:report.screenshot});}catch{}}
finally{
 report.networkGuard=guard?.snapshot();const clean=await cleanupOwnedResources(report,[['browser',()=>handle?.close()],['guard',()=>guard?.close()],['fixture',()=>server.close()],['package',()=>verifyHost(built.unpacked)],['source',async()=>{report.sourceChangedDuringRun=(await Promise.all(Object.entries(build.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean)||hash(await readFile(script))!==scriptHash;assert(!report.sourceChangedDuringRun);}]]);if(!clean)process.exitCode=1;
 await writeFile(process.argv[2]??'/private/tmp/hidden-dirty-package.json',JSON.stringify(report,null,2)+'\n');
}console.log(JSON.stringify({status:report.status,phase:report.failedPhase,error:report.error}));
