import {enterPartialNativeHistory,preparePartialHistoryUnmount,returnPartialSearchWorkspace} from './partial-native-surface.mjs';
/** Actual packaged MV3 against PARTIAL reconstruction, never live ChatGPT. */
import assert from 'node:assert/strict';
import {tmpdir,platform} from 'node:os';
import {j2ExternalProbe} from './j2-runner-bounds.mjs';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {partialScope,partialPageIds,partialUnion,assertPartialObserved,assertPartialPaging} from './partial-paging-oracle.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const server=await createVariantHostFixtureServer({profile:'PARTIAL',variant:'conflict',partialWindowed:true}),dir=await mkdtemp(join(tmpdir(),'vaiwl-partial-package-')),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});
const info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),scriptHash=hash(await readFile(new URL(import.meta.url))),manifestHash=hash(await readFile(join(built.unpacked,'build-manifest.json')));
const fixtureFiles=['partial-native-surface.mjs','partial-paging-oracle.mjs','expected/partial.mjs','j2-runner-bounds.mjs','fixtures/server.mjs','fixtures/native.mjs','fixtures/variants-server.mjs','fixtures/variants-native.mjs','fixtures/native.css','fixtures/legacy.html'];
const fixtureHashes=Object.fromEntries(await Promise.all(fixtureFiles.map(async file=>[file,hash(await readFile(new URL(file,import.meta.url)))])));
const ids=['77777777-7777-4777-8777-000000001000','77777777-7777-4777-8777-000000000999'];
const report={evidence:'REAL_HEADLESS_PACKAGED_MV3_PARTIAL_RECONSTRUCTION',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',package:built,sourceHashes:info.sourceHashes,scriptHash,fixtureHashes,buildManifestHash:manifestHash,paging:{worldSize:1000,coverage:'non-atomic-observed-scan',pages:[],requestOffsets:[]},results:[],errors:[],transport:[]};let context,page;
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');report.workerExternalNetwork=await worker.evaluate(j2ExternalProbe,1500);assert.equal(report.workerExternalNetwork,'BLOCKED');page=await context.newPage();page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/backend-api/conversations'&&url.searchParams.has('offset'))report.paging.requestOffsets.push(Number(url.searchParams.get('offset')));});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',message=>{const text=message.text();if(text.startsWith('VAIWL_TRANSPORT ')){try{report.transport.push(JSON.parse(text.slice(16)));}catch{}}});await page.goto(server.origin+'/c/'+ids[0]);
 const workspace=async(timeout=15000)=>{await page.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_workspace"]')?.matches(':popover-open'),{},{timeout});const frame=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(frame);return frame;};
 const traceFrame=async frame=>frame.evaluate(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async packet=>{try{const result=await send(packet);console.log('VAIWL_TRANSPORT '+JSON.stringify({role:location.pathname,type:packet.type??packet.kind,state:result?.state,ok:result?.ok,reason:result?.reason}));return result;}catch(error){console.log('VAIWL_TRANSPORT '+JSON.stringify({role:location.pathname,type:packet.type??packet.kind,reason:'transport-rejected'}));throw error;}};});
 let frame=await workspace();for(const ui of page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id)))await traceFrame(ui);assert.equal(await page.locator('aside nav[aria-label="Chat history"] a').count(),25);assert.equal(await page.locator(`aside nav[aria-label="Chat history"] a[href="/c/${ids[0]}"]`).count(),0);
 let current=frame.locator('[data-free-list="unknown"], [aria-label="当前聊天"][data-current-membership="UNKNOWN"]').getByRole('link',{name:'Archive conversation 1000',exact:true});await current.waitFor({timeout:15000});assert.equal(await current.getAttribute('aria-current'),'page');assert.equal(await frame.locator('[data-free-list="noProject"]').getByRole('link',{name:'Archive conversation 1000',exact:true}).count(),0);
 report.results.push({name:'deep-link-outside-initial-25-uses-native-title-UNKNOWN-and-current',status:'PASS'});
 await page.locator('textarea').fill('PARTIAL_NATIVE_UNSENT_DRAFT');await page.locator('#composer input[type=file]').setInputFiles({name:'partial-draft.txt',mimeType:'text/plain',buffer:Buffer.from('PARTIAL native unsent attachment')});await page.evaluate(()=>{globalThis.partialOriginalEditor=document.querySelector('textarea');globalThis.partialOriginalFileInput=document.querySelector('#composer input[type=file]');globalThis.partialOriginalFile=partialOriginalFileInput.files[0];globalThis.partialOriginalDocument=document;});await page.getByRole('button',{name:'返回工作空间',exact:true}).click();frame=await workspace();
 // Read-only diagnostics use independently derived fixture keys, never grant or write authority.
 const scope=partialScope;
 const observed=async()=>{
  const value=await frame.evaluate(async scope=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs')),{freeProjection}=await import(chrome.runtime.getURL('src/data/free-projection.mjs'));const base=new ScopeRepository({indexedDB});try{const repo=new NativeRepository({baseRepository:base}),facts=await repo.read(scope),foreign=await repo.read({...scope,organizationId:'context_unobserved_partial_peer'});return {ids:Object.keys(facts.refs).sort(),titles:Object.fromEntries(Object.entries(facts.refs).map(([id,r])=>[id,r.nativeTitle])),scopeKey:facts.scopeKey,foreignIds:Object.keys(foreign.refs),rawMemberships:Object.fromEntries(Object.entries(facts.membership).map(([id,m])=>[id,m.state])),projectedMemberships:Object.fromEntries(freeProjection(facts,{scope:base.scopeOrThrow(scope),now:new Date().toISOString()}).refs.map(r=>[r.id,r.membership])),inventories:Object.values(facts.sources).map(s=>s.inventory.conversations)};}finally{base.close();}},scope);
  return {...value,filePreserved:await page.evaluate(()=>document===partialOriginalDocument&&document.querySelector('#composer input[type=file]')===partialOriginalFileInput&&partialOriginalFileInput.files.length===1&&partialOriginalFileInput.files[0]===partialOriginalFile),draftPreserved:await page.evaluate(()=>document.querySelector('textarea')===partialOriginalEditor&&partialOriginalEditor.value==='PARTIAL_NATIVE_UNSENT_DRAFT')};
 };
 const waitObserved=async(offset,options={})=>{const end=Date.now()+15000;let value;do{value=await observed();report.paging.lastObserved=value;if(JSON.stringify(value.ids)===JSON.stringify(partialUnion(offset,options))&&(!options.refreshed||value.titles[ids[0]]==='Archive conversation 1000 refreshed')){assertPartialObserved(value,offset,options);return value;}await page.waitForTimeout(50);}while(Date.now()<end);assertPartialObserved(value,offset,options);throw Error('partial-observed-admission-timeout');};
 await waitObserved(0);
 for(const offset of [25,50]){
  const nativeEntry=await enterPartialNativeHistory(page);
  const nav=page.locator('aside nav[aria-label="Chat history"]');await nav.hover();
  // Real wheel input drives the native scroll handler, its ordinary GET and replacement.
  // Reset to top first because replacement can retain the old bottom position.
  await page.mouse.wheel(0,-2000);await page.waitForFunction(()=>document.querySelector('aside nav[aria-label="Chat history"]').scrollTop===0);
  const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/backend-api/conversations'&&new URL(r.url()).searchParams.get('offset')===String(offset));
  await page.mouse.wheel(0,2000);const response=await responsePromise,data=await response.json(),request=response.request();
  await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('aside nav[aria-label="Chat history"] a')].map(a=>a.pathname.slice(3)))===JSON.stringify(expected),partialPageIds(offset));
  const nativeIds=await nav.locator('a').evaluateAll(nodes=>nodes.map(a=>new URL(a.href).pathname.slice(3)));
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();frame=await workspace();
  const row={nativeEntry,offset,limit:Number(new URL(request.url()).searchParams.get('limit')),method:request.method(),status:response.status(),context:(await request.allHeaders())['chatgpt-account-id'],windowed:data.windowed,nativeIds,observed:await waitObserved(offset)};report.paging.pages.push(row);
  report.results.push({name:offset===25?'native-scroll-25-overlap-window-replacement-preserves-observed-union':'native-scroll-50-window-replacement-preserves-scoped-unique-union',status:'PASS'});
 }
 report.paging.unmountPreparation=await preparePartialHistoryUnmount(page);
 assert.deepEqual(report.paging.requestOffsets,[25,50]);assert.deepEqual(server.snapshot().partialPageRequests,[25,50]);
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();frame=await workspace();
 const surfaceState=()=>page.evaluate(()=>({state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,surfaces:[...document.querySelectorAll('[data-va-owned][popover]')].map(n=>({role:n.id.endsWith('_workspace')?'workspace':'sidebar',open:n.matches(':popover-open'),visibility:getComputedStyle(n).visibility})),history:{visibility:getComputedStyle(document.querySelector('aside nav[aria-label="Chat history"]')).visibility,height:document.querySelector('aside nav[aria-label="Chat history"]').getBoundingClientRect().height},returnVisible:[...document.querySelectorAll('button[aria-label="返回工作空间"]')].some(n=>n.getClientRects().length>0)}));
 const originalHistory=await page.locator('aside nav[aria-label="Chat history"]').elementHandle();
 report.paging.unmountBefore=await surfaceState();
 // DOM virtualization probe only: remove exposed native history rows, without
 // changing accounts, backing facts, current route, or adapter-owned UI.
 await page.locator('aside nav[aria-label="Chat history"]').evaluate(nav=>{nav.querySelectorAll('a').forEach(a=>a.remove());});
 // Emptying this fixed pure-history root does not introduce an unknown
 // control. Sidebar may remain valid; workspace must not depend on that role.
 await page.waitForFunction(()=>document.querySelector('[data-va-owned][id$="_workspace"]')?.matches(':popover-open')&&document.querySelectorAll('aside nav[aria-label="Chat history"] a').length===0,null,{timeout:15000});
 report.paging.unmountAfter=await surfaceState();
 const sidebarOpen=report.paging.unmountAfter.surfaces.find(s=>s.role==='sidebar')?.open;assert.equal(typeof sidebarOpen,'boolean');
 assert.equal(report.paging.unmountAfter.surfaces.find(s=>s.role==='workspace')?.visibility,'visible');
 assert.equal(report.paging.unmountAfter.history.visibility,sidebarOpen?'hidden':'visible');
 assert.equal(await originalHistory.evaluate(n=>n.isConnected&&n===document.querySelector('aside nav[aria-label="Chat history"]')),true);
 assert.deepEqual(await originalHistory.evaluate(n=>[...n.children].map(c=>c.tagName)),['H2']);await originalHistory.dispose();
 report.paging.unmountTransition={workspaceRetained:true,sidebarOpen,nativeHistoryVisible:!sidebarOpen,pureHistoryEmpty:true};
 // A real visible title mutation provides an observable accepted update after
 // removal; the current chat must remain reachable from its reading identity.
 await page.locator('main h1').evaluate(node=>{node.textContent='Archive conversation 1000 refreshed';});
 await waitObserved(50,{refreshed:true});report.paging.unmountTransition.renamedAdmitted=true;
 frame=await workspace();report.paging.unmountTransition.workspaceStillVisible=true;
 current=frame.locator('[data-free-list="unknown"], [aria-label="当前聊天"][data-current-membership="UNKNOWN"]').getByRole('link',{name:'Archive conversation 1000 refreshed',exact:true});await current.waitFor({timeout:15000});assert.equal(await current.getAttribute('aria-current'),'page');
 assert.equal(await page.evaluate(()=>document.querySelector('textarea')===partialOriginalEditor&&partialOriginalEditor.value==='PARTIAL_NATIVE_UNSENT_DRAFT'),true);
 report.paging.afterUnmount=await waitObserved(50);
 report.results.push({name:'native-history-unmount-retains-reading-bound-current-and-editor',status:'PASS'});
 // Use the fixture's ordinary native search UI to navigate, not history.pushState
 // or a privileged extension command.
 await page.locator('#search-button').click();await page.locator('#search-dialog input').fill('Archive conversation 999');const nativeResult=page.locator('#search-dialog').getByRole('link',{name:'Archive conversation 999',exact:true});await nativeResult.waitFor();const oldFrames=page.frames().filter(f=>f.url().startsWith('chrome-extension://'+id));await nativeResult.click();await page.waitForURL('**/c/'+ids[1]);
 const searchDeadline=Date.now()+15000,searchRemaining=()=>{const ms=searchDeadline-Date.now();if(ms<=0)throw Error('partial-search-return-deadline');return ms;};
 report.paging.searchTransition=await returnPartialSearchWorkspace(page,{workspaceURL:`chrome-extension://${id}/workspace.html`,conversationId:ids[1],oldFrames,deadlineAt:searchDeadline});
 frame=await workspace(searchRemaining());report.paging.searchTransition.workspaceReentered=true;await frame.locator('[data-free-list="unknown"], [aria-label="当前聊天"][data-current-membership="UNKNOWN"]').getByRole('link',{name:'Archive conversation 999',exact:true}).waitFor({timeout:searchRemaining()});assert(oldFrames.every(f=>f.isDetached()));
 assert.equal(await frame.getByRole('link',{name:'Archive conversation 999',exact:true}).getAttribute('aria-current'),'page');assert.equal(await frame.locator(`[data-ref-id="${ids[0]}"][aria-current="page"]`).count(),0);
 assert.equal(await page.evaluate(()=>document.querySelector('textarea')===partialOriginalEditor&&partialOriginalEditor.value==='PARTIAL_NATIVE_UNSENT_DRAFT'),true);
 report.results.push({name:'native-search-SPA-second-unloaded-chat-does-not-reuse-old-current',status:'PASS'});
 report.paging.afterSearch=await waitObserved(50,{searched:true});report.paging.serverRequestOffsets=server.snapshot().partialPageRequests;assertPartialPaging(report.paging);
 assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;try{report.pages=await Promise.all(context.pages().map(async p=>({url:p.url(),frames:await Promise.all(p.frames().map(async f=>({url:f.url(),body:await f.locator('body').innerText().catch(()=>null),rows:await f.locator('[data-ref-id]').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-ref-id'),current:n.getAttribute('aria-current'),text:n.textContent}))).catch(()=>[])}))),body:await p.locator('body').innerText()})));}catch{}process.exitCode=1;}
finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([path,hash])=>createHash('sha256').update(await readFile(path)).digest('hex')!==hash))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(new URL(import.meta.url)))!==scriptHash;report.fixtureChangedDuringRun=(await Promise.all(Object.entries(fixtureHashes).map(async([file,value])=>hash(await readFile(new URL(file,import.meta.url)))!==value))).some(Boolean);report.buildManifestUnchanged=hash(await readFile(join(built.unpacked,'build-manifest.json')))===manifestHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun||report.fixtureChangedDuringRun||!report.buildManifestUnchanged){report.status='SOURCE_CHANGED';process.exitCode=1;}await writeFile(process.argv[2]??join(tmpdir(),'free-partial-package-mv3.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
