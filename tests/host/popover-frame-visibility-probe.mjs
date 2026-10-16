/** Diagnostic only: actual packaged frames, trusted native controls, isolated headless. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex'),scriptHash=hash(await readFile(new URL(import.meta.url)));
const dir=await mkdtemp('/private/tmp/vaiwl-popover-visibility-'),server=await createVariantHostFixtureServer({profile:'MODERN'}),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const report={status:'NOT_RUN',evidence:'DIAGNOSTIC_ONLY_REAL_HEADLESS_MV3_POPOVER_FRAME_VISIBILITY',realChatGPT:'NOT_RUN',sourceHashes:manifest.sourceHashes,scriptHash,fixture:server.manifest,samples:[],errors:[]};
let handle,guard,page,frames=[],phase='launch';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
 const {browser,context}=handle;report.browser=browser.version();report.browserPrecondition=handle.diagnostic;
 await context.route('**/*',route=>route.request().url().startsWith(server.origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 await context.addInitScript(()=>{
  if(location.protocol!=='chrome-extension:'||!chrome.runtime?.sendMessage)return;
  const state=globalThis.popoverVisibilityProbe={document:crypto.randomUUID(),views:0,pending:0,visibility:[],intersections:[],visibilityIntersections:[],trackVisibility:{entryIsVisibleSupported:'isVisible' in IntersectionObserverEntry.prototype,constructed:false,error:null}};
  document.addEventListener('visibilitychange',event=>{if(state.visibility.length<32)state.visibility.push({state:document.visibilityState,trusted:event.isTrusted});});
  const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){const view=args[0]?.type==='HOST_UI_VIEW';if(view){state.views++;state.pending++;}const result=send(...args);if(view&&result?.then)result.then(()=>state.pending--,()=>state.pending--);return result;};
  const observe=()=>{const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(state.intersections.length<64)state.intersections.push({ratio:entry.intersectionRatio,isIntersecting:entry.isIntersecting,visibility:document.visibilityState});},{threshold:[0,0.01,0.5,1]});observer.observe(document.documentElement);
   try{const tracked=new IntersectionObserver(entries=>{for(const entry of entries)if(state.visibilityIntersections.length<64)state.visibilityIntersections.push({ratio:entry.intersectionRatio,isIntersecting:entry.isIntersecting,isVisible:typeof entry.isVisible==='boolean'?entry.isVisible:null,visibility:document.visibilityState});},{trackVisibility:true,delay:100,threshold:[0,1]});tracked.observe(document.documentElement);state.trackVisibility.constructed=true;}catch(error){state.trackVisibility.error=error.name;}
  };
  if(document.documentElement)observe();else document.addEventListener('DOMContentLoaded',observe,{once:true});
 });
 const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');await page.bringToFront();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:20000});
 frames=['workspace','sidebar'].map(role=>({role,frame:page.frames().find(frame=>frame.url()===`chrome-extension://${id}/${role}.html`)}));assert(frames.every(row=>row.frame));
 for(const {frame}of frames)await frame.waitForFunction(()=>globalThis.popoverVisibilityProbe?.intersections.length>0&&popoverVisibilityProbe.views>0,null,{timeout:15000});
 await page.evaluate(()=>{globalThis.popoverProbeOriginal={document,editor:document.querySelector('textarea')};});
 async function sample(stage){
  await pause(500);const row={stage,native:await page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus(),open:document.querySelectorAll('[data-va-owned]:popover-open').length,sameDocument:document===popoverProbeOriginal.document,sameEditor:document.querySelector('textarea')===popoverProbeOriginal.editor})),frames:[]};
  for(const {role,frame}of frames){assert(!frame.isDetached());row.frames.push({role,...await frame.evaluate(()=>({documentVisibility:document.visibilityState,focused:document.hasFocus(),...structuredClone(popoverVisibilityProbe),latestIntersection:popoverVisibilityProbe.intersections.at(-1),latestVisibilityIntersection:popoverVisibilityProbe.visibilityIntersections.at(-1)??null}))});}report.samples.push(row);
 }
 phase='initial-open';await sample(phase);
 phase='trusted-native-textarea';await page.locator('textarea').click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:5000});await sample('closed');
 phase='trusted-workspace-return';await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:5000});await sample('reopened');
 for(const row of report.samples){assert(row.native.sameDocument&&row.native.sameEditor);for(const f of row.frames)assert.equal(f.document,report.samples[0].frames.find(x=>x.role===f.role).document);}
 assert.equal(report.samples[1].native.open,0);assert.equal(report.samples[2].native.open,2);assert.equal(server.snapshot().actions['send-intent']??0,0);assert.equal(report.errors.length,0);report.status='PASS_DIAGNOSTIC';
}catch(error){report.status='FAIL';report.failedPhase=phase;report.error=error.stack??String(error);process.exitCode=1;}
finally{
 report.networkGuard=guard?.snapshot();const clean=await cleanupOwnedResources(report,[['package',()=>verifyHost(built.unpacked)],['source',async()=>{report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([path,expected])=>hash(await readFile(path))!==expected))).some(Boolean)||hash(await readFile(new URL(import.meta.url)))!==scriptHash;assert(!report.sourceChangedDuringRun);}],['browser',()=>handle?.close()],['guard',()=>guard?.close()],['fixture',()=>server.close()],['temporary-directory',async()=>{await rm(dir,{recursive:true,force:true});report.temporaryDirectoryRemoved=true;}]]);report.cleanupComplete=clean;if(!clean)process.exitCode=1;
 await writeFile(process.argv[2]??'/private/tmp/popover-frame-visibility-probe.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,failedPhase:report.failedPhase,error:report.error}));
