/** Narrow actual MV3 stale native terminal regression; not J4 acceptance. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {j2JourneyProfile} from './j2-journey-profile.mjs';
import {j2Within,j2Poll,j2ExternalProbe} from './j2-runner-bounds.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
const mutant=process.argv[3]==='oldguard-mutant';
const hash=v=>createHash('sha256').update(v).digest('hex');
const paths=['tests/host/context-stale-request-package-browser.mjs','tests/host/fixtures/variants-server.mjs','tests/host/fixtures/variants-native.mjs','tests/host/fixtures/native-current-refresh.mjs','tests/host/fixtures/native.mjs','tests/host/expected/modern.mjs','tests/host/j2-journey-profile.mjs','tests/host/j2-runner-bounds.mjs','tests/host/isolated-browser-cleanup.mjs'];
const fixtureHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const server=await createVariantHostFixtureServer({profile:'MODERN',nativeCurrentRefresh:true,nativeStaleRefresh:true}),dir=await mkdtemp(join(tmpdir(),'vaiwl-context-stale-request-')),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));
let mutantBytes;
const mutationPath='src/runtime/browser-request-context.mjs';
if(mutant){
 const path=join(built.unpacked,mutationPath),original=await readFile(path,'utf8'),anchor="if(r.accepted&&(!r.document.receipt||r.epoch===r.document.epoch)&&documents.get(key(r))===r.document)";
 assert.equal(original.split(anchor).length,2);mutantBytes=original.replace(anchor,"if(r.accepted&&documents.get(key(r))===r.document)");await writeFile(path,mutantBytes);
 // The package executes its compiled classic worker, so rebuild that same artifact.
 const {compileClassicWorker}=await import('../../extension/classic-worker-build.mjs');
 const compiled=compileClassicWorker(built.unpacked);await writeFile(join(built.unpacked,'extension/worker.mjs'),compiled.entry);await writeFile(join(built.unpacked,'extension/classic-runtime.js'),compiled.runtime);
}
const C='33333333-3333-4333-8333-333333333333',scope=j2JourneyProfile('MODERN').scope,scopeKey=JSON.stringify([scope.provider,scope.accountId,scope.organizationId]);
const report={status:'NOT_RUN',evidence:'OFFLINE_C2_RECEIPT_REPLACEMENT_NARROW',startupMode:'WORKER_READY_PRECONDITION_NOT_COLD_ACCEPTANCE',realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',sourceHashes:manifest.sourceHashes,fixtureHashes,fixture:server.manifest,results:[],requests:[],errors:[]};let context,page,id;
report.evidence='OFFLINE_C2_STALE_NATIVE_HTTP_FAILURE_NARROW';report.mutation=mutant?'RESTORE_OLD_TERMINAL_GUARD':null;
const mutatedHashes=mutant?Object.fromEntries(await Promise.all([mutationPath,'extension/worker.mjs','extension/classic-runtime.js'].map(async p=>[p,hash(await readFile(join(built.unpacked,p)))]))):{};
async function verifyPackage(){if(!mutant){assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');return;}for(const [path,expected]of Object.entries(manifest.files))assert.equal(hash(await readFile(join(built.unpacked,path))),mutatedHashes[path]??expected);}
report.mutatedHashes=mutatedHashes;
const poll=fn=>j2Poll(fn,15000),within=(name,fn,ms=5000)=>j2Within(name,fn,ms);
const frame=()=>page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);
const step=(name,detail={})=>report.results.push({name,status:'PASS',...detail});
async function continuity(){assert.deepEqual(await page.evaluate(()=>({sameDocument:document===replacementDocument,sameEditor:document.querySelector('textarea')===replacementEditor,draft:replacementEditor.value,start:replacementEditor.selectionStart,end:replacementEditor.selectionEnd,pagehides:replacementPagehides})),{sameDocument:true,sameEditor:true,draft:'UNSENT_CONTEXT_REPLACEMENT',start:3,end:8,pagehides:0});assert.equal(page.url(),server.origin+'/c/'+C);}
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{timeout:25000,headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(15000);
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await within('browser-cdp',()=>context.browser().newBrowserCDPSession());({id}=await within('load',()=>cdp.send('Extensions.loadUnpacked',{path:built.unpacked}),15000));
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith(`chrome-extension://${id}/`),timeout:15000});assert.equal(await within('worker-ready',()=>worker.evaluate(()=>chrome.runtime.id)),id);assert.equal(await within('network-refusal',()=>worker.evaluate(j2ExternalProbe,1500),3000),'BLOCKED');
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',response=>{const request=response.request();if(request.url()===server.origin+'/backend-api/conversation/'+C)report.requests.push({at:Date.now(),status:response.status(),method:request.method(),resourceType:request.resourceType()});});
 await page.goto(server.origin+'/c/'+C);await page.waitForFunction(()=>{const n=document.querySelector('[data-va-owned][id$="_workspace"]');if(!n||n.hasAttribute('popover'))return false;const box=n.getBoundingClientRect(),style=getComputedStyle(n);return style.display!=='none'&&style.visibility==='visible'&&box.width>=160&&box.height>=96&&!!n.querySelector('iframe');});let initial=await poll(()=>frame());await initial.getByText('Ordinary conversation',{exact:true}).waitFor();
 await page.locator('textarea').fill('UNSENT_CONTEXT_REPLACEMENT');await page.evaluate(()=>{globalThis.replacementDocument=document;globalThis.replacementEditor=document.querySelector('textarea');replacementEditor.setSelectionRange(3,8);globalThis.replacementPagehides=0;addEventListener('pagehide',()=>replacementPagehides++);});
 await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();await continuity();assert.equal(await page.locator('[data-va-owned][id$="_workspace"]:visible').count(),0);step('initial-team-projection-native-reading-and-unsent-draft');
 const oldFrame=frame();assert(oldFrame);assert.equal(report.requests.length,1);
 report.phase='old-native-get-held';await page.getByRole('button',{name:'Refresh current conversation',exact:true}).click();
 await poll(()=>server.snapshot().staleRefreshEvents.some(e=>e.ordinal===2&&e.stage==='request'));
 report.phase='new-native-get-ready';await page.getByRole('button',{name:'Refresh current conversation again',exact:true}).click();
 await poll(()=>report.requests.length===2&&report.requests.at(-1).status===200);
 await poll(()=>oldFrame.isDetached()&&frame()&&frame()!==oldFrame);const renewed=frame();
 await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();await continuity();step('new-native-200-replaces-seed-while-old-GET-held');
 assert.equal(server.releaseNativeStaleRefresh(),true);await poll(()=>report.requests.length===3&&report.requests.at(-1).status===503);
 await poll(()=>page.locator('#native-current-refresh').getAttribute('data-completed').then(v=>v==='1'));
 report.phase='new-projection-survives-old-503';
 // Post-terminal bounded observation, not a delay asserted to prove preparation.
 const until=Date.now()+2000;while(Date.now()<until){assert.equal(renewed.isDetached(),false,'new-projection-revoked-by-stale-terminal');assert.equal(frame(),renewed,'new-projection-replaced-by-stale-terminal');await continuity();await new Promise(resolve=>setTimeout(resolve,50));}
 assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);step('new-projection-survives-stale-native-503');
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await page.waitForFunction(()=>{const n=document.querySelector('[data-va-owned][id$="_workspace"]');if(!n||n.hasAttribute('popover'))return false;const box=n.getBoundingClientRect(),style=getComputedStyle(n);return style.display!=='none'&&style.visibility==='visible'&&box.width>=160&&box.height>=96&&!!n.querySelector('iframe');});await renewed.getByText('Ordinary conversation',{exact:true}).waitFor();
 const scopes=await within('scope-oracle',()=>renewed.evaluate(async()=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});}finally{base.close();}}));assert.deepEqual(scopes,[scopeKey]);await continuity();step('new-projection-same-nonfirst-team-no-personal-writes');
 assert.equal(report.requests.length,3);assert.deepEqual(report.requests.map(r=>r.status),[200,200,503]);report.nativeOrder=server.snapshot().staleRefreshEvents;assert.deepEqual(report.errors,[]);await verifyPackage();report.status='PASS_NARROW_OFFLINE_STALE_NATIVE_TERMINAL';report.browserVersion=context.browser().version();
}catch(error){report.status=context?'FAIL':'NOT_RUN_BROWSER_STARTUP';report.error=error.stack;process.exitCode=1;try{report.failure=await within('failure-dom',()=>page?.evaluate(()=>({state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,frames:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length,returns:document.querySelectorAll('[aria-label="返回工作空间"]').length})));}catch(error){report.diagnosticError=String(error);}}
finally{report.nativeOrder=server.snapshot().staleRefreshEvents;const clean=await cleanupOwnedResources(report,[['package-integrity',verifyPackage],['context-close',()=>within('context-close',()=>context?.close(),10000)],['server-close',()=>within('server-close',()=>server.close())],['source-integrity',async()=>{report.sourceChangedDuringRun=(await Promise.all(Object.entries({...manifest.sourceHashes,...fixtureHashes}).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);assert.equal(report.sourceChangedDuringRun,false);}]]);if(!clean)process.exitCode=1;await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error,results:report.results,requests:report.requests}));
