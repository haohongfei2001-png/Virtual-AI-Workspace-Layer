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
const output=process.argv[2]??join(tmpdir(),'vaiwl-frame-pagination.json');
const report={status:'NOT_RUN',acceptance:'NOT_ESTABLISHED',realChatGPT:'NOT_RUN',pages:[],errors:[]};
if(process.env.FREE_PAGINATION_RUN!=='1'){await writeFile(output,JSON.stringify(report));}
else{
 let server,context,browserHandle,networkGuard,directory,manifest,manifestPath,manifestHash,page,extensionId,browserLaunchAttempted=false;
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const sources=['frame-pagination-package-browser.mjs','fixtures/host-scale-server.mjs','fixtures/host-scale-world.mjs','fixtures/native.mjs','fixtures/native.css','fixtures/legacy.html','fixtures/host-scale-surfaces.mjs','fixtures/host-scale-member-progress.mjs','fixtures/host-scale-cleanup.mjs','native-visibility-browser.mjs','historical-network-guard.mjs'];
 report.fixtureSourceHashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
 try{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
  server=await createHostScaleServer({size:1000,distribution:'project-mixed',cpuRate:1,longTitles:true});
  directory=await mkdtemp(join(tmpdir(),'vaiwl-pagination-'));const built=packageHost(join(directory,'package'),{offlineOrigin:server.origin});
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
  const allSeen=new Set(),partitions={};
  // Independent expected ID/title/URL arithmetic; no projection or fixture-generator import.
  function inspect(rows){const ids=[];for(const row of rows){const m=/^60000000-0000-4000-8000-([0-9a-f]{12})$/.exec(row.id),i=m?parseInt(m[1],16):-1;assert(i>=0&&i<1000);assert.equal(row.title,'原生压力聊天 '+String(i).padStart(6,'0')+' · 长中文标题与 English mixed 内容用于尾部原名检索及实际可达验证，不代表真实聊天。');assert.equal(row.href,server.origin+'/c/'+row.id);ids.push(row.id);allSeen.add(row.id);}assert.equal(new Set(ids).size,ids.length);return ids;}
  for(const kind of ['project','unknown']){
   report.phase='paginate-'+kind;
   const list=workspace.locator(kind==='project'?`.card[data-theme-id="${project}"] .members`:'section[data-free-list="unknown"]');
   const moreName=kind==='project'?'显示更多已知聊天':'显示更多其他已知聊天';
   const read=()=>list.locator('a[data-ref-id]').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-ref-id'),title:n.querySelector('.window-title')?.textContent,href:n.getAttribute('href')})));
   await list.waitFor();if(kind==='unknown')await list.getByRole('button',{name:'其他已知聊天',exact:true}).click();let prior=inspect(await read());const renderedPages=[prior],seen=new Set(prior),deadline=performance.now()+90000;
   for(let click=0;click<240;click++){
    const more=list.getByRole('button',{name:moreName,exact:true});if(!await more.count())break;
    assert(performance.now()<deadline,'pagination deadline');
    const signature=await list.evaluate(node=>JSON.stringify({ids:[...node.querySelectorAll('a[data-ref-id]')].map(n=>n.getAttribute('data-ref-id')),buttons:[...node.querySelectorAll('button.more')].map(n=>[n.textContent,n.getAttribute('aria-label')])}));
    await more.click();
    await workspace.waitForFunction(({signature,kind,project})=>{
     const roots=[document];for(let i=0;i<roots.length;i++)for(const node of roots[i].querySelectorAll('*'))if(node.shadowRoot)roots.push(node.shadowRoot);
     const selector=kind==='project'?`.card[data-theme-id="${project}"] .members`:'section[data-free-list="unknown"]';
     const list=roots.map(root=>root.querySelector(selector)).find(Boolean);
     return list&&JSON.stringify({ids:[...list.querySelectorAll('a[data-ref-id]')].map(n=>n.getAttribute('data-ref-id')),buttons:[...list.querySelectorAll('button.more')].map(n=>[n.textContent,n.getAttribute('aria-label')])})!==signature;
    },{signature,kind,project},{timeout:6000});
    const rows=await read(),ids=inspect(rows),before=seen.size;for(const id of ids)seen.add(id);
    report.pages.push({kind,click,count:ids.length,first:ids[0],last:ids.at(-1),unique:seen.size});
    assert(ids.length>0,'pagination cannot advance to an empty page');renderedPages.push(ids);prior=ids;
   }
   assert.equal(await list.getByRole('button',{name:moreName,exact:true}).count(),0,'bounded traversal must exhaust more');
   const previous=list.getByRole('button',{name:kind==='project'?'返回前页 原生项目 0':'返回前页其他已知聊天',exact:true});
   assert.equal(await previous.count(),1,'completed multi-page list must retain previous navigation');
   const last=JSON.stringify(prior);await previous.click();
   await workspace.waitForFunction(({kind,project,last})=>{
    const roots=[document];for(let i=0;i<roots.length;i++)for(const n of roots[i].querySelectorAll('*'))if(n.shadowRoot)roots.push(n.shadowRoot);
    const selector=kind==='project'?`.card[data-theme-id="${project}"] .members`:'section[data-free-list="unknown"]';
    const list=roots.map(r=>r.querySelector(selector)).find(Boolean);return list&&JSON.stringify([...list.querySelectorAll('a[data-ref-id]')].map(n=>n.getAttribute('data-ref-id')))!==last;
   },{kind,project,last},{timeout:6000});
   const back=inspect(await read());assert(renderedPages.some(ids=>JSON.stringify(ids)===JSON.stringify(back)),'previous button returns an actually seen page');
   report[kind]={unique:seen.size,previousPageVerified:true};partitions[kind]=seen;
  }
  assert(partitions.project.size>5&&partitions.unknown.size>5,'both Project and UNKNOWN scenarios must be established');
  assert.equal([...partitions.project].filter(id=>partitions.unknown.has(id)).length,0,'rendered membership partitions must not overlap');
  assert.equal(allSeen.size,1000,'actual rendered Project/UNKNOWN union must reach every native fixture conversation');
  assert(await page.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved pagination draft'));assert.equal(page.url(),server.origin+path);assert.deepEqual(report.errors,[]);
  report.status='PASS_OFFLINE_MV3_PAGINATION_SUBCHAIN';report.totalUnique=allSeen.size;report.acceptance='PARTIAL_S_NOT_FREE_ACCEPTED';
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
