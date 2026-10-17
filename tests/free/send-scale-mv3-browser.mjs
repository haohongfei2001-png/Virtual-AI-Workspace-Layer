/** Installed MV3 worker + extension-origin IDB, synthetic host and real input sends only. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageSynthetic,verifyUnpacked} from '../../simulator/package.mjs';
import {createServer} from '../../simulator/server.mjs';
import {seedFreeScale} from './scale-seed.mjs';
const scale=Number(process.env.FREE_SEND_SCALE??1000),distribution=process.env.FREE_SEND_DISTRIBUTION??'project-mixed',longTitles=process.env.FREE_SEND_LONG_TITLES==='1';
if(![1000,10000,100000].includes(scale)||!['none-heavy','project-mixed','single-project'].includes(distribution))throw Error('invalid-mv3-scale-scenario');
const directory=await mkdtemp(join(tmpdir(),'vaiwl-scale-mv3-')),artifact=process.env.FREE_MV3_PACKAGE?null:packageSynthetic(join(directory,'package')),extension=process.env.FREE_MV3_PACKAGE??artifact.unpacked;
const packageBefore=verifyUnpacked(extension),manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.content_scripts[0].matches,['http://127.0.0.1/hf/*']);assert(!JSON.stringify(manifest).includes('chatgpt.com'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),files=['tests/free/send-scale-mv3-browser.mjs','tests/free/scale-seed.mjs'],sourceHashes={};for(const path of files)sourceHashes[path]=hash(await readFile(path));
const receipt=process.argv[2]??'/private/tmp/free-send-scale-mv3.json',server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const report={evidence:'REAL_HEADLESS_CHROME_MV3_SYNTHETIC_SCALE_TWO_TABS',realChatGPT:'NOT_RUN',headless:true,requestedScale:scale,seedSize:scale===100000?99998:scale,distribution,longTitles,scope:'synthetic account A in one extension-origin database',otherScope:'synthetic account B remains uninitialized',sourceHashes,artifact:artifact??{unpacked:extension,verification:packageBefore},sourceManifestSha256:hash(await readFile(join(extension,'verification/source-manifest.json'))),results:[],pageErrors:[],limits:{initialActiveMs:30000,sendObservationMs:6500,targetMs:1000},counts:'NOT_INSTRUMENTED: installed worker untouched'};
let context,a,b,probe;const openedTabs=[];
const save=()=>writeFile(receipt,JSON.stringify(report,null,2)+'\n');
const ready=page=>page.waitForFunction(()=>document.documentElement.dataset.vaiwlHfState==='ACTIVE',null,{timeout:30000});
async function inspect(id,messageId){return probe.evaluate(async({id,messageId})=>{
 const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{WorkspaceRepository}=await import('/src/data/repository.mjs'),{NativeRepository}=await import('/src/data/native-repository.mjs'),{FreeEvidenceRepository}=await import('/src/data/free-evidence-repository.mjs'),{scopeOf}=await import('/simulator/data.mjs');
 const base=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'}),scope=scopeOf('A'),native=new NativeRepository({baseRepository:base}),workspace=new WorkspaceRepository({baseRepository:base}),evidence=new FreeEvidenceRepository({baseRepository:base});
 try{const header=await native.header(scope),other=await native.header(scopeOf('B')),page=await native.page(scope,{ids:{projects:[],refs:[id]}}),shared=await workspace.partitioned.partialContext(scope,[id],{boundedDirectory:true}),activity=(await evidence.page(scope,{ids:[id]})).evidence;return {extensionId:chrome.runtime.id,count:Object.keys(header.manifest.refs).length,scope:page.facts.scopeKey,membership:page.facts.membership[id]?.state,nativeTitle:page.facts.refs[id]?.nativeTitle,sharedEvents:Object.values(shared.state.events).filter(row=>row.messageId===messageId).length,storedHints:Object.values(activity.hints).filter(row=>row.conversationId===id).length,otherRevision:other.revision,otherCount:Object.keys(other.manifest?.refs??{}).length};}finally{base.close();}
 },{id,messageId});}
async function openTab(){const p=await context.newPage();openedTabs.push(p);p.on('pageerror',e=>report.pageErrors.push(e.message));await p.goto(origin+'/hf/A/c/T0?mode=mv3');await p.bringToFront();const started=performance.now();await ready(p);await p.evaluate(()=>{globalThis.scaleMv3Events=[];document.addEventListener('hf:synthetic-send',event=>scaleMv3Events.push({...event.detail,at:performance.now()}));});return {page:p,initialActiveMs:performance.now()-started};}
async function send(page,kind){
 if(kind!=='existing'){await page.getByRole('link',{name:'新聊天',exact:true}).click();await ready(page);}
 const composer=page.getByRole('textbox',{name:'消息输入',exact:true});await composer.fill('MV3真实合成发送 '+kind);
 const previous=await page.evaluate(()=>{globalThis.scaleMv3Input=HF.getView().input;return scaleMv3Events.length;});
 await page.getByRole('button',{name:'发送消息',exact:true}).click();assert.equal(await composer.inputValue(),'');await composer.fill('MV3发送后保留草稿 '+kind);
 await page.waitForFunction(index=>{
  const event=scaleMv3Events[index];if(!event||document.documentElement.dataset.vaiwlHfState!=='ACTIVE')return false;
  const shadows=[...document.querySelectorAll('[data-vaiwl-owned]')].map(node=>node.shadowRoot).filter(Boolean);
  const row=shadows.flatMap(root=>[...root.querySelectorAll('[data-ref-id]')]).find(node=>node.dataset.refId===event.conversationId&&node.textContent.includes(event.nativeTitle));
  if(!row)return false;globalThis.scaleMv3ObservedAt??=performance.now();return true;
 },previous,{timeout:6500});
 const result=await page.evaluate(({previous,kind})=>{const e=scaleMv3Events[previous],at=scaleMv3ObservedAt;delete globalThis.scaleMv3ObservedAt;return {kind,id:e.conversationId,messageId:e.messageId,nativeTitle:e.nativeTitle,eventToDOMMs:at-e.at,events:scaleMv3Events.length-previous,draftPreserved:HF.getView().input===scaleMv3Input&&HF.getView().input.value==='MV3发送后保留草稿 '+kind};},{previous,kind});
 const stored=await inspect(result.id,result.messageId);assert.equal(result.events,1);assert(result.draftPreserved);assert.equal(stored.sharedEvents,1);assert.equal(stored.storedHints,1);assert.equal(stored.membership,'NONE');assert.equal(stored.nativeTitle,result.nativeTitle);assert.equal(stored.otherRevision,0);assert.equal(stored.otherCount,0);
 result.persisted=stored;result.timingStatus=result.eventToDOMMs<=1000?'PASS':'FAIL';report.results.push(result);await save();return result;
}
try{
 context=await chromium.launchPersistentContext(join(directory,'profile'),{executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],timezoneId:'Asia/Shanghai'});context.setDefaultTimeout(15000);
 await context.route('**/*',route=>(route.request().url().startsWith(origin+'/')||route.request().url().startsWith('chrome-extension://'))?route.continue():route.abort());
 const cdp=await context.browser().newBrowserCDPSession();report.browser=(await cdp.send('Browser.getVersion')).product;report.extensionId=(await cdp.send('Extensions.loadUnpacked',{path:extension})).id;
 probe=await context.newPage();await probe.goto(`chrome-extension://${report.extensionId}/README.txt`);report.seed=await probe.evaluate(seedFreeScale,{size:report.seedSize,distribution,longTitles,origin});await probe.evaluate(()=>freeScaleSeed.service.close());
 const first=await openTab();a=first.page;report.tabAInitialActiveMs=first.initialActiveMs;await send(a,'existing');await send(a,'new-none-A');
 const held=await a.evaluate(()=>({url:location.href,id:HF.getView().ref.id,draft:HF.getView().input.value}));
 const second=await openTab();b=second.page;report.tabBInitialActiveMs=second.initialActiveMs;const last=await send(b,'new-none-B');assert.equal(last.persisted.count,report.seedSize+2);
 await a.bringToFront();await ready(a);const retained=await a.evaluate(()=>({url:location.href,id:HF.getView().ref.id,draft:HF.getView().input.value,same:HF.getView().input===scaleMv3Input}));assert(retained.same);assert.deepEqual({url:retained.url,id:retained.id,draft:retained.draft},held);report.tabAHeldDraftPreserved=true;
 report.sourceChangedDuringRun=false;for(const [path,digest]of Object.entries(sourceHashes))if(hash(await readFile(path))!==digest)report.sourceChangedDuringRun=true;assert.equal(report.sourceChangedDuringRun,false);assert.deepEqual(verifyUnpacked(extension),packageBefore);assert.deepEqual(report.pageErrors,[]);
 report.timingStatus=report.results.every(row=>row.timingStatus==='PASS')?'PASS':'FAIL';await save();
}catch(error){report.failure=error.stack??error.message;report.diagnostics=[];for(const [index,page]of openedTabs.entries())if(page&&!page.isClosed())report.diagnostics.push({tab:index===0?'A':'B',...await page.evaluate(()=>({url:location.href,state:document.documentElement.dataset.vaiwlHfState,reason:document.documentElement.dataset.vaiwlHfReason,events:globalThis.scaleMv3Events??[],draft:globalThis.HF?.getView()?.input?.value})).catch(()=>({unavailable:true}))});await save();throw error;}finally{await save();await context?.close();await new Promise(resolve=>server.close(resolve));}
