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
 const sources=['frame-window-retention-package-browser.mjs','fixtures/host-scale-server.mjs','fixtures/host-scale-world.mjs','fixtures/native.mjs','fixtures/native.css','fixtures/legacy.html','fixtures/host-scale-surfaces.mjs','fixtures/host-scale-member-progress.mjs','fixtures/host-scale-cleanup.mjs','native-visibility-browser.mjs','historical-network-guard.mjs'];
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
  const cdp=await context.browser().newBrowserCDPSession();extensionId=(await cdp.send('Extensions.loadUnpacked',{path:built.unpacked})).id;
  page=await context.newPage();await page.setViewportSize({width:1440,height:900});page.on('pageerror',e=>report.errors.push(e.message));
  report.phase='initial';await page.goto(server.url);await waitHostScaleSurfaces(page,{extensionId});
  await page.locator('textarea').focus();
  const project='g-p-00000000000000000000000000000001',path='/g/'+project+'/project';
  await page.locator(`aside section[aria-label="Projects"] a[href="${path}"]`).click();await page.waitForURL(server.origin+path);
  await page.waitForFunction(()=>document.querySelectorAll('#reading nav[aria-label="Project conversations"] a').length===80);
  await page.evaluate(()=>{globalThis.paginationEditor=document.querySelector('textarea');globalThis.paginationDocument=document;paginationEditor.value='preserved pagination draft';});
  report.phase='native-member-progress';report.memberProgress=await waitHostScaleMemberProgress({page,extensionId,url:server.origin+path,projectId:project,id:'60000000-0000-4000-8000-000000000062',deadline:performance.now()+30000});
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();const [workspace]=await waitHostScaleSurfaces(page,{extensionId});
  const started=performance.now();report.phase='expand-project';
  const projectList=workspace.locator(`.card[data-theme-id="${project}"] .members`),unknown=workspace.locator('section[data-free-list="unknown"]');
  const ids=loc=>loc.locator('a[data-ref-id]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-ref-id')));
  async function waitRows(selector,count){await workspace.waitForFunction(({selector,count})=>{const roots=[document];for(let i=0;i<roots.length;i++)for(const n of roots[i].querySelectorAll('*'))if(n.shadowRoot)roots.push(n.shadowRoot);const list=roots.map(r=>r.querySelector(selector)).find(Boolean);return list?.querySelectorAll('a[data-ref-id]').length===count;},{selector,count},{timeout:6000});}
  await projectList.getByRole('button',{name:'显示更多待核对窗口',exact:true}).click();await waitRows(`.card[data-theme-id="${project}"] .members`,17);const first=await ids(projectList);
  report.phase='expand-unknown';await unknown.getByRole('button',{name:'显示更多归属待核对',exact:true}).click();await waitRows('section[data-free-list="unknown"]',17);assert.deepEqual(await ids(projectList),first);const second=await ids(unknown);
  assert.equal(new Set(first).size,17);assert.equal(new Set(second).size,17);assert(!first.some(id=>second.includes(id)));
  report.phase='reading-return';await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await waitHostScaleSurfaces(page,{extensionId});
  assert.deepEqual(await ids(projectList),first);assert.deepEqual(await ids(unknown),second);
  assert(await page.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved pagination draft'));assert.equal(page.url(),server.origin+path);assert.deepEqual(report.errors,[]);
  report.status='PASS_OFFLINE_MV3_WINDOW_RETENTION';report.acceptance='PARTIAL_S_NOT_FREE_ACCEPTED';report.journey={projectRows:first.length,unknownRows:second.length,readingReturn:true,originalDocumentEditorDraft:true,elapsedMs:performance.now()-started};report.scaleAcceptance='NOT_RUN_1K_FIXTURE_FUNCTIONAL_SUBCHAIN_ONLY';

 }catch(error){report.status=context?'FAIL':'NOT_RUN_STARTUP';report.error=error.stack;report.failure=await hostScaleFailureFacts(page).catch(e=>({error:e.message}));process.exitCode=1;}
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
