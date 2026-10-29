import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
// Actual packaged MV3, fresh disposable profiles, loopback native fixtures only.
// This does not certify real ChatGPT, physical IME, or existing user data.
const source=resolve(process.env.VAIWL_SOURCE??fileURLToPath(new URL('../../',import.meta.url)));
process.chdir(source);
const from=p=>import(pathToFileURL(join(source,p)).href,p.endsWith('.json')?{with:{type:'json'}}:undefined);
const {packageHost,verifyHost}=await from('extension/package.mjs');
const {observedHomeHTML,materializePartitionedSidebar,materializeFlatHomeBranch}=await from('tests/host/fixtures/observed-host-replay.mjs');
const {observedProjectHTML}=await from('tests/host/fixtures/observed-project.mjs');
const {createHistoricalNetworkGuard,historicalNetworkGuardArgs}=await from('tests/host/historical-network-guard.mjs');
const {default:partition}=await from('tests/host/fixtures/observed-sidebar-project-details-20261026.json');
const P='g-p-11111111111111111111111111111111',C='33333333-3333-4333-8333-333333333333';
const selected=process.argv[2]??'all';
const cases=selected==='all'?['native-root-replacement','worker-twice','cosmetic-native-island','native-island-evolution','extension-disable']:selected.split(',');
assert(cases.length>0&&cases.every(name=>['native-root-replacement','worker-twice','cosmetic-native-island','native-island-evolution','extension-disable','exit-hit'].includes(name)),'unsupported-terminal-case');
const output=resolve(process.env.VAIWL_PROBE_OUTPUT??join(tmpdir(),'vaiwl-terminal-delivery-mv3.json'));
const report={source,startedAt:new Date().toISOString(),browser:'NOT_RUN',realChatGPT:'NOT_RUN',evidence:'PACKAGED_MV3_SYNTHETIC_HOST',cases:[]};
// One immutable package and one loopback origin for the complete suite. Each
// case gets a fresh profile; no case inherits private or worker state.
const suiteDir=await mkdtemp(join(tmpdir(),'vaiwl-terminal-suite-'));
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(req.url.startsWith('/g/')?observedProjectHTML(P,C):observedHomeHTML(C));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
const built=packageHost(join(suiteDir,'package'),{offlineOrigin:origin,browserLocal:true});report.build=built;
const manifestBytes=await readFile(join(built.unpacked,'build-manifest.json'));
const buildManifest=JSON.parse(manifestBytes),hash=value=>createHash('sha256').update(value).digest('hex');
report.sourceHashes=buildManifest.sourceHashes;report.buildManifestHash=hash(manifestBytes);
try{
for(const name of cases){
 let context,page,popup;
 const r={name,status:'RUNNING'};report.cases.push(r);
 try{
  const dir=await mkdtemp(join(tmpdir(),'vaiwl-terminal-probe-'));r.directory=dir;
  r.build=built;
  context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1400,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
  report.browser=context.browser().version();
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
  const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
  page=await context.newPage();
  r.browserErrors=[];page.on('pageerror',e=>r.browserErrors.push(e.message));
  await page.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",()=>{('+materializePartitionedSidebar.toString()+')('+JSON.stringify(partition.sidebarStructure.rows)+');if(document.querySelector(".home-composer-anchor"))('+materializeFlatHomeBranch.toString()+')();},{once:true});'});
  if(['cosmetic-native-island','native-island-evolution'].includes(name))await page.addInitScript(()=>{if(window!==window.top)return;document.addEventListener('DOMContentLoaded',()=>{const n=document.createElement('section');n.id='cosmetic-native-island';n.style.cssText='height:24px;width:100%;background:rgb(248,248,248)';document.querySelector('[role=main]').append(n);},{once:true});});
  await page.goto(origin+(name==='worker-twice'?'/g/'+P+'/project':'/'));
  const workspace=()=>page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]');
  const visible=()=>{const n=document.querySelector('[data-va-owned][id$="_workspace"]');return !!n&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility==='visible'&&n.getBoundingClientRect().height>=96;};
  await workspace().locator('.workspace').waitFor({timeout:15000});await page.waitForFunction(visible,null,{timeout:15000});
  popup=await context.newPage();await popup.goto('chrome-extension://'+id+'/status.html');await page.bringToFront();
  const status=()=>popup.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true}),frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});return {documentId:frame.documentId,status:await chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_STATUS'},{documentId:frame.documentId}),local:await chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'})};});
  const sample=async()=>({visible:await page.evaluate(visible),status:await status(),mounts:await page.locator('[data-va-owned][id$="_workspace"]').evaluateAll(ns=>ns.map(n=>({id:n.id,rect:n.getBoundingClientRect().toJSON(),display:getComputedStyle(n).display}))),draft:await page.locator('textarea').inputValue()});
  r.before=await sample();
  if(name==='native-root-replacement'){
   r.replacement=await page.evaluate(()=>{
    const old=document.querySelector('[data-va-flow-root]'),next=old.cloneNode(true),editor=old.querySelector('textarea'),draft=editor?.value;
    for(const n of [...next.querySelectorAll('[data-va-owned]')])n.remove();
    for(const n of [next,...next.querySelectorAll('*')])for(const a of [...n.attributes])if(a.name.startsWith('data-va-'))n.removeAttribute(a.name);
    if(next.querySelector('textarea'))next.querySelector('textarea').value=draft;
    old.replaceWith(next);return {sameURL:true,nativeRootReplaced:!old.isConnected,newNativeEditor:!!next.querySelector('textarea'),draft};
   });
   try{await page.waitForFunction(visible,null,{timeout:6000});r.recovered=true;}catch{r.recovered=false;}
   r.after=await sample();
   r.status=r.recovered&&r.after.status.documentId===r.before.status.documentId&&r.after.draft===r.before.draft&&r.after.status.local.mode===r.before.status.local.mode&&r.after.mounts.length===1&&r.before.mounts.length===1&&r.after.mounts[0].id!==r.before.mounts[0].id?'PASS':'FAIL_PRODUCT';
  }else if(name==='worker-twice'){
   const unlocked=await popup.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'}));assert.equal(unlocked.ok,true);
   await page.waitForFunction(visible,null,{timeout:15000});
   const lifecycle=await context.newCDPSession(page),versions=[];lifecycle.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await lifecycle.send('ServiceWorker.enable');
   r.recoveries=[];
   for(let i=0;i<2;i++){
    const until=Date.now()+6000;let running;
    while(Date.now()<until){running=versions.filter(x=>x.scriptURL==='chrome-extension://'+id+'/extension/worker.mjs').at(-1);if(running?.runningStatus==='running')break;await new Promise(r=>setTimeout(r,25));}
    assert(running?.runningStatus==='running','running worker required');
    const oldFrame=await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle();
    await lifecycle.send('ServiceWorker.stopWorker',{versionId:running.versionId});
    await popup.evaluate(()=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}));
    const native=page.getByRole('button',{name:'返回原生阅读',exact:true});if(await native.isVisible())await native.click();
    const back=page.getByRole('button',{name:'返回工作空间',exact:true});let clicked=false;
    try{await back.waitFor({state:'visible',timeout:6000});await back.click();clicked=true;await page.waitForFunction(visible,null,{timeout:6000});}catch{}
    const entry={iteration:i+1,clicked,oldFrameRetired:await oldFrame.evaluate(n=>!n.isConnected),after:await sample()};r.recoveries.push(entry);
    if(!entry.after.visible)break;
   }
   r.status=r.recoveries.length===2&&r.recoveries.every(x=>x.oldFrameRetired&&x.after.visible&&x.after.status.local.mode==='personal'&&x.after.status.documentId===r.before.status.documentId&&x.after.draft===r.before.draft)&&new Set(r.recoveries.map(x=>x.after.mounts[0]?.id)).size===2?'PASS':'FAIL_PRODUCT';
  }else if(name==='cosmetic-native-island'){
   await page.locator('#cosmetic-native-island').evaluate(n=>n.style.boxShadow='inset 0 0 1px rgba(0,0,0,.15)');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   r.after=await sample();r.status=r.after.visible&&r.after.draft===r.before.draft&&r.after.mounts[0]?.id===r.before.mounts[0]?.id?'PASS':'FAIL_PRODUCT';
  }else if(name==='native-island-evolution'){
   const frame=await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle();
   r.evolution=[];
   for(const mutation of ['cosmetic-class','text-node-replacement','ordinary-children','natural-height','cssom-decoration']){
    await page.locator('#cosmetic-native-island').evaluate((n,kind)=>{
     if(kind==='cosmetic-class')n.className='native-island-current';
     if(kind==='text-node-replacement'){n.replaceChildren(document.createTextNode('Native status'));n.firstChild.replaceWith(document.createTextNode('Native status updated'));}
     if(kind==='ordinary-children'){const span=document.createElement('span');span.textContent=' · ready';n.append(span);}
     if(kind==='natural-height')n.style.height='48px';
     if(kind==='cssom-decoration'){const style=document.createElement('style');document.head.append(style);style.sheet.insertRule('#cosmetic-native-island { box-shadow: inset 0 0 1px rgba(0,0,0,.15) }');}
    },mutation);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const after=await sample();
    r.evolution.push({mutation,sameFrame:await frame.evaluate(n=>n.isConnected&&n===document.querySelector('iframe[src$="/workspace.html"]')),after});
   }
   r.status=r.evolution.every(e=>e.sameFrame&&e.after.visible&&e.after.draft===r.before.draft)?'PASS':'FAIL_PRODUCT';
  }else if(name==='extension-disable'){
   // A separate throwaway control extension exercises Chrome's real disable
   // API. It exists only in this new profile and never accesses host content.
   const controlPath=join(dir,'disable-control');await mkdir(controlPath);
   await writeFile(join(controlPath,'manifest.json'),JSON.stringify({manifest_version:3,name:'VAIWL isolated disable control',version:'1.0',permissions:['management']}));
   await writeFile(join(controlPath,'control.html'),'<!doctype html><title>Isolated lifecycle control</title>');
   const control=await cdp.send('Extensions.loadUnpacked',{path:controlPath});
   const controlPage=await context.newPage();await controlPage.goto('chrome-extension://'+control.id+'/control.html');await page.bringToFront();
   r.disabled=await controlPage.evaluate(async target=>{await chrome.management.setEnabled(target,false);return !(await chrome.management.get(target)).enabled;},id);
   await page.waitForFunction(()=>!document.querySelector('[data-va-owned]'),null,{timeout:6000});
   r.native=await page.locator('textarea').evaluate(n=>{const b=n.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {connected:n.isConnected,visible:getComputedStyle(n).visibility==='visible'&&b.width>0&&b.height>0,hit:hit===n,draft:n.value,owned:document.querySelectorAll('[data-va-owned]').length,flowMarkers:[...document.querySelectorAll('*')].reduce((count,e)=>count+[...e.attributes].filter(a=>a.name.startsWith('data-va-flow-')).length,0)};});
   await page.locator('textarea').fill('DISABLE_NATIVE_DRAFT');
   r.native.editable=await page.locator('textarea').inputValue()==='DISABLE_NATIVE_DRAFT';
   r.status=r.disabled&&r.native.connected&&r.native.visible&&r.native.hit&&r.native.editable&&r.native.draft===r.before.draft&&r.native.owned===0&&r.native.flowMarkers===0?'PASS':'FAIL_PRODUCT';
   await controlPage.close();
  }else if(name==='exit-hit'){
   r.hitChecks=[];
   for(const width of [1400,1000,720,600,420]){
    await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    r.hitChecks.push(await page.locator('button[aria-label="返回原生阅读"]').evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2),p=n.parentElement;return {width:innerWidth,button:b.toJSON(),parent:p.getBoundingClientRect().toJSON(),display:getComputedStyle(p).display,hit:hit===n,hitTag:hit?.tagName};})));
   }
   r.status=r.hitChecks.every(xs=>xs.length===1&&xs[0].hit)?'PASS':'FAIL_PRODUCT_OR_UNSUPPORTED_GEOMETRY';
  }
  r.screenshot=join(dir,'final.png');await page.screenshot({path:r.screenshot});
  r.verification=verifyHost(built.unpacked).status;
  assert.equal(r.verification,'OFFLINE_HOST_RECONSTRUCTION');
  assert.deepEqual(r.browserErrors,[]);
 }catch(e){r.status='ERROR';r.error=e.stack;}
 finally{await context?.close();await writeFile(output,JSON.stringify(report,null,2)+'\n');}
}
}finally{await guard.close();await new Promise(resolve=>server.close(resolve));}
report.sourceUnchanged=(await Promise.all(Object.entries(report.sourceHashes).map(async([path,expected])=>hash(await readFile(path))===expected))).every(Boolean);
report.packageUnchanged=hash(await readFile(join(built.unpacked,'build-manifest.json')))===report.buildManifestHash&&verifyHost(built.unpacked).status==='OFFLINE_HOST_RECONSTRUCTION';
report.networkGuard=guard.snapshot();
report.finishedAt=new Date().toISOString();
report.status=report.cases.every(entry=>entry.status==='PASS')&&report.sourceUnchanged&&report.packageUnchanged?'PASS_TERMINAL_DELIVERY_MV3':'FAIL';
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,browser:report.browser,cases:report.cases.map(r=>({name:r.name,status:r.status,error:r.error,recovered:r.recovered,recoveries:r.recoveries?.map(x=>({iteration:x.iteration,visible:x.after.visible,mode:x.after.status.local.mode,oldFrameRetired:x.oldFrameRetired}))}))}));
process.exitCode=report.status==='PASS_TERMINAL_DELIVERY_MV3'?0:1;
