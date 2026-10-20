import {observeWindowScroll} from './window-scroll-observer.mjs';
/** Opt-in S: actual MV3 buttons, application-owned offline world, no DB seeds. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createHostScaleServer} from './fixtures/host-scale-server.mjs';
import {waitHostScaleSurfaces,hostScaleFailureFacts} from './fixtures/host-scale-surfaces.mjs';
import {waitHostScaleMemberProgress} from './fixtures/host-scale-member-progress.mjs';
import {cleanupHostScaleRun} from './fixtures/host-scale-cleanup.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
const output=process.argv[2]??join(tmpdir(),'vaiwl-frame-window-retention.json');
const report={status:'NOT_RUN',acceptance:'NOT_ESTABLISHED',realChatGPT:'NOT_RUN',pages:[],errors:[]};
if(process.env.FREE_WINDOW_RETENTION_RUN!=='1'){await writeFile(output,JSON.stringify(report));}
else{
 let server,context,browserHandle,networkGuard,directory,manifest,manifestPath,manifestHash,page,extensionId,browserLaunchAttempted=false;
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const sources=['window-scroll-observer.mjs','frame-window-retention-package-browser.mjs','fixtures/host-scale-server.mjs','fixtures/host-scale-world.mjs','fixtures/native.mjs','fixtures/native.css','fixtures/legacy.html','fixtures/host-scale-surfaces.mjs','fixtures/host-scale-member-progress.mjs','fixtures/host-scale-cleanup.mjs','native-visibility-browser.mjs','historical-network-guard.mjs'];
 report.fixtureSourceHashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
 try{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
  server=await createHostScaleServer({size:1000,distribution:'project-mixed',cpuRate:1,longTitles:false});
  directory=await mkdtemp(join(tmpdir(),'vaiwl-window-retention-'));const built=packageHost(join(directory,'package'),{offlineOrigin:server.origin});
  assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
  manifestPath=join(built.unpacked,'build-manifest.json');const bytes=await readFile(manifestPath);manifest=JSON.parse(bytes);manifestHash=hash(bytes);report.sourceHashes=manifest.sourceHashes;
  const permissions=JSON.parse(await readFile(join(built.unpacked,'manifest.json')));assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*']);assert.equal(permissions.content_security_policy.extension_pages,`script-src 'self'; object-src 'none'; connect-src ${server.origin}`);
  networkGuard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});browserLaunchAttempted=true;
  browserHandle=await launchNativeVisibilityBrowser({chromium,profileDir:join(directory,'profile'),headed:false,historicalNetworkGuard:networkGuard.config,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  context=browserHandle.context;context.setDefaultTimeout(6000);report.browserPrecondition=browserHandle.diagnostic;
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===server.origin||u.protocol==='chrome-extension:'?route.continue():route.abort();});
  // Bounded transport observation of this synthetic fixture only; no payload
  // rewriting, private profile, native response body or timing changes.
  report.trace=[];report.traceDropped=0;
  await context.exposeBinding('observeWindowReturn',({frame},entry)=>{if(report.trace.length<400)report.trace.push({phase:report.phase,frame:frame.url(),...entry});else report.traceDropped++;});
  await context.addInitScript(()=>{
   if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;
   // Capture the actual composed click path: the earlier locator snapshot may
   // have been replaced before activation. Observe only, never cancel/replay.
   document.addEventListener('click',event=>{
    const node=event.composedPath().find(value=>value?.matches?.('.search-results a[data-ref-id]'));
    if(!node)return;
    const entry={type:'SEARCH_LINK_CLICK',delegated:node.hasAttribute('data-native-plan-control'),ariaDisabled:node.getAttribute('aria-disabled'),target:node.getAttribute('target'),connected:node.isConnected,button:event.button,modified:event.metaKey||event.ctrlKey||event.shiftKey||event.altKey};
    setTimeout(()=>{void globalThis.observeWindowReturn({...entry,defaultPrevented:event.defaultPrevented}).catch(()=>{});},0);
   },true);
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   chrome.runtime.sendMessage=function(...args){const m=args[0],tracked=['HOST_UI_VIEW','HOST_UI_RESUME','HOST_UI_SAVE_VIEW','HOST_UI_DISPATCH_CURRENT','HOST_UI_DISPATCH_NATIVE','HOST_UI_PRESENT'].includes(m?.type),pending=send(...args);
    if(tracked&&pending?.then)pending.then(r=>{const p=r?.page;globalThis.observeWindowReturn({type:m.type,query:m.query,expectedQuery:m.expectedQuery,capacities:m.view?.capacities,scroll:m.view?.scroll,ok:r?.ok,state:r?.state,reason:r?.reason,presentation:p?.presentation??r?.presentation,resume:r?.resume,counts:p?{search:!!p.search,workingSet:!!p.workingSet,groups:p.groups?.items.map(g=>({id:g.id,unknown:g.lists.unknown.items.length})),unknown:p.entries?.unknown.items.length,selection:p.selection?{groupId:p.selection.groupId,list:p.selection.list,limit:p.selection.limit}:null}:null});},()=>{});
    return pending;
   };
  });
  const cdp=await context.browser().newBrowserCDPSession();extensionId=(await cdp.send('Extensions.loadUnpacked',{path:built.unpacked})).id;
  page=await context.newPage();await page.setViewportSize({width:1440,height:900});page.on('pageerror',e=>report.errors.push(e.message));
  report.phase='initial';await page.goto(server.url);await waitHostScaleSurfaces(page,{extensionId});
  await page.locator('textarea').focus();
  const project='g-p-00000000000000000000000000000001',path='/g/'+project+'/project';
  await page.locator(`aside section[aria-label="Projects"] a[href="${path}"]`).click();await page.waitForURL(server.origin+path);
  await page.waitForFunction(()=>document.querySelectorAll('#reading nav[aria-label="Project conversations"] a').length===80);
  await page.evaluate(()=>{globalThis.paginationEditor=document.querySelector('textarea');globalThis.paginationDocument=document;paginationEditor.value='preserved pagination draft';});
  report.phase='native-member-progress';report.memberProgress=await waitHostScaleMemberProgress({page,extensionId,url:server.origin+path,projectId:project,id:'60000000-0000-4000-8000-000000000062',deadline:performance.now()+30000});
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();let [workspace]=await waitHostScaleSurfaces(page,{extensionId});
  const started=performance.now();report.phase='expand-project';
  let projectList=workspace.locator(`.card[data-theme-id="${project}"] .members`),unknown=workspace.locator('section[data-free-list="unknown"]');
  const ids=loc=>loc.locator('a[data-ref-id]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-ref-id')));
  async function waitRows(selector,count){await workspace.waitForFunction(({selector,count})=>{const roots=[document];for(let i=0;i<roots.length;i++)for(const n of roots[i].querySelectorAll('*'))if(n.shadowRoot)roots.push(n.shadowRoot);const list=roots.map(r=>r.querySelector(selector)).find(Boolean);return list?.querySelectorAll('a[data-ref-id]').length===count;},{selector,count},{timeout:6000});}
  await projectList.getByRole('button',{name:'显示更多待核对窗口',exact:true}).click();await waitRows(`.card[data-theme-id="${project}"] .members`,17);const first=await ids(projectList);
  report.phase='expand-unknown';await unknown.getByRole('button',{name:'显示更多归属待核对',exact:true}).click();await waitRows('section[data-free-list="unknown"]',17);assert.deepEqual(await ids(projectList),first);const second=await ids(unknown);
  assert.equal(new Set(first).size,17);assert.equal(new Set(second).size,17);assert(!first.some(id=>second.includes(id)));
  report.phase='reading-return';await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await waitHostScaleSurfaces(page,{extensionId});
  assert.deepEqual(await ids(projectList),first);assert.deepEqual(await ids(unknown),second);
  // Use the real search surface and its issued native link, then the one return.
  // Reading refreshes must not overwrite the expanded card descriptors with
  // special-page defaults; the returned rows are read again from the owner.
  assert(await page.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved pagination draft'));assert.equal(page.url(),server.origin+path);
  const originalPage=page;
  // A separate local document starts at the target; neither journey clears a
  // native draft to obtain an easier navigation plan.
  report.phase='search-native-return';page=await context.newPage();await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/c/'+first[0]);[workspace]=await waitHostScaleSurfaces(page,{extensionId});
  await page.evaluate(()=>{globalThis.paginationEditor=document.querySelector('textarea');globalThis.paginationDocument=document;paginationEditor.value='preserved search draft';});
  projectList=workspace.locator(`.card[data-theme-id="${project}"] .members`);unknown=workspace.locator('section[data-free-list="unknown"]');
  await projectList.getByRole('button',{name:'显示更多待核对窗口',exact:true}).click();await waitRows(`.card[data-theme-id="${project}"] .members`,17);
  await unknown.getByRole('button',{name:'显示更多归属待核对',exact:true}).click();await waitRows('section[data-free-list="unknown"]',17);
  const title=await projectList.locator('a[data-ref-id]').first().locator('.window-title').innerText();
  const scrollProbe=await workspace.evaluate(observeWindowScroll);report.scrollProbe=scrollProbe;const mainScroll=scrollProbe.after?.top;assert(scrollProbe.after?.connected&&mainScroll>0,'actual main workspace must be scrollable');assert.equal(mainScroll,scrollProbe.assigned.top,'current viewport must preserve the single scroll gesture');report.mainScrollBeforeSearch=mainScroll;
  const sidebar=page.frames().find(f=>f.url()===`chrome-extension://${extensionId}/sidebar.html`);assert(sidebar);
  await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
  await workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).fill(title);
  const result=workspace.locator(`.search-results a[data-ref-id="${first[0]}"]`);await result.waitFor();
  const target=await result.getAttribute('href');assert.equal(target,page.url());const pageCount=context.pages().length;
  // Same URL alone does not establish a same-target plan. Record the issued
  // control without waiting for a different plan or repeating the gesture.
  report.searchClick={pageCount,control:await result.evaluate(node=>({delegated:node.hasAttribute('data-native-plan-control'),planControl:node.getAttribute('data-native-plan-control'),ariaDisabled:node.getAttribute('aria-disabled'),target:node.getAttribute('target')}))};
  await result.click();
  await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await waitHostScaleSurfaces(page,{extensionId});
  await waitRows(`.card[data-theme-id="${project}"] .members`,17);await waitRows('section[data-free-list="unknown"]',17);
  assert.deepEqual(await ids(projectList),first);assert.deepEqual(await ids(unknown),second);
  assert.equal(context.pages().length,pageCount);assert(await originalPage.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved pagination draft'));
  report.mainScrollAfterSearch=await workspace.locator('.workspace').evaluate(n=>n.scrollTop);assert.equal(report.mainScrollAfterSearch,mainScroll,'search/read/return retains main scroll');
  report.searchReturn={alreadyCurrentOriginalTarget:true,uniqueReturn:true,projectRows:17,unknownRows:17,originalProjectDraftPreserved:true};
  assert(await page.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved search draft'));assert.equal(page.url(),target);assert.deepEqual(report.errors,[]);
  // Different-target native SPA navigation must also retain the same bounded
  // presentation state across a fresh binding/frame. Keep both prior drafts.
  const currentDraftPage=page;report.phase='search-different-target-return';page=await context.newPage();await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/c/'+first[0]);[workspace]=await waitHostScaleSurfaces(page,{extensionId});
  await page.evaluate(()=>{globalThis.paginationEditor=document.querySelector('textarea');globalThis.paginationDocument=document;});
  assert.equal(await page.locator('textarea').inputValue(),'');
  projectList=workspace.locator(`.card[data-theme-id="${project}"] .members`);unknown=workspace.locator('section[data-free-list="unknown"]');
  await projectList.getByRole('button',{name:'显示更多待核对窗口',exact:true}).click();await waitRows(`.card[data-theme-id="${project}"] .members`,17);
  await unknown.getByRole('button',{name:'显示更多归属待核对',exact:true}).click();await waitRows('section[data-free-list="unknown"]',17);
  const otherTitle=await projectList.locator(`a[data-ref-id="${first[1]}"] .window-title`).innerText();
  const otherSidebar=page.frames().find(f=>f.url()===`chrome-extension://${extensionId}/sidebar.html`);assert(otherSidebar);
  await otherSidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
  await workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).fill(otherTitle);
  const otherResult=workspace.locator(`.search-results a[data-ref-id="${first[1]}"]`);await otherResult.waitFor();
  const otherTarget=await otherResult.getAttribute('href');assert(otherTarget);assert.notEqual(otherTarget,page.url());
  const nativeBefore=server.snapshot().actions.navigate??0,pagesBefore=context.pages().length,previousFrame=workspace;
  await otherResult.click();await page.waitForURL(otherTarget);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();[workspace]=await waitHostScaleSurfaces(page,{extensionId});
  projectList=workspace.locator(`.card[data-theme-id="${project}"] .members`);unknown=workspace.locator('section[data-free-list="unknown"]');
  await waitRows(`.card[data-theme-id="${project}"] .members`,17);await waitRows('section[data-free-list="unknown"]',17);
  assert.deepEqual(await ids(projectList),first);assert.deepEqual(await ids(unknown),second);assert.equal(context.pages().length,pagesBefore);assert.equal(server.snapshot().actions.navigate,nativeBefore+1);
  assert(await page.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value===''));
  assert(await currentDraftPage.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved search draft'));
  assert(await originalPage.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved pagination draft'));
  assert.notEqual(workspace,previousFrame);assert.equal(previousFrame.isDetached(),true);
  report.differentTargetReturn={nativeTargetOnce:true,uniqueReturn:true,projectRows:17,unknownRows:17,newFrame:workspace!==previousFrame,oldFrameDetached:previousFrame.isDetached(),originalDocumentsEditorsDrafts:true};
  report.status='PASS_OFFLINE_MV3_WINDOW_RETENTION';report.acceptance='PARTIAL_S_NOT_FREE_ACCEPTED';report.journey={projectRows:first.length,unknownRows:second.length,readingReturn:true,originalDocumentEditorDraft:true,elapsedMs:performance.now()-started};report.scaleAcceptance='NOT_RUN_1K_FIXTURE_FUNCTIONAL_SUBCHAIN_ONLY';

 }catch(error){report.status=context?'FAIL':'NOT_RUN_STARTUP';report.error=error.stack;report.pagesAtFailure=context?.pages().length??null;report.failure=await hostScaleFailureFacts(page).catch(e=>({error:e.message}));process.exitCode=1;}
 finally{
  const clean=await cleanupHostScaleRun({report,context,browserHandle,browserLaunchAttempted,networkGuard,server,directory,verify:async()=>{
   report.sourceChangedDuringRun=manifest?(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean):null;
   report.fixtureChangedDuringRun=(await Promise.all(Object.entries(report.fixtureSourceHashes).map(async([p,h])=>hash(await readFile(new URL(p,import.meta.url)))!==h))).some(Boolean);
   report.manifestChangedDuringRun=manifestPath?hash(await readFile(manifestPath))!==manifestHash:null;
   if(report.sourceChangedDuringRun||report.fixtureChangedDuringRun||report.manifestChangedDuringRun){report.status='SOURCE_CHANGED';process.exitCode=1;}
  }});if(!clean)process.exitCode=1;await writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({status:report.status,error:report.error,output}));
}
