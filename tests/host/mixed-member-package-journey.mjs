/** Opt-in, partial mapping only. MIXED_MEMBER_RUN=1 node this-file report.json.
 * No database seeds, injected observations, native writes, or full F1 certification. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {hostScaleScenario,hostScaleRows} from './fixtures/host-scale-world.mjs';
import {createHostScaleServer} from './fixtures/host-scale-server.mjs';
import {cleanupHostScaleRun} from './fixtures/host-scale-cleanup.mjs';
import {waitHostScaleSurfaces,hostScaleFailureFacts} from './fixtures/host-scale-surfaces.mjs';
import {hostScaleMemberReadingVisible} from './fixtures/host-scale-member-progress.mjs';
import {auditMixedMemberIndex} from './mixed-member-index-oracle.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const output=process.argv[2]??join(tmpdir(),'vaiwl-mixed-member.json');
const report={status:'NOT_RUN',coverage:'FIRST_PROJECT_80_OF_800_NATIVE_PROJECT_MEMBERS_ONLY',acceptance:'NOT_FULL_F1_NOT_FREE_ACCEPTED_NOT_LIVE_VERIFIED',memberAndReturnBudgetMs:30000,rpcBudgetMs:6000,rpc:[],rpcDropped:0,errors:[]};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(process.env.MIXED_MEMBER_RUN!=='1')await writeFile(output,JSON.stringify(report,null,2)+'\n');
else{
 let context,server,directory,page,manifest,manifestPath,manifestHash,extensionId;
 const dependencies=['mixed-member-package-journey.mjs','mixed-member-index-oracle.mjs','fixtures/host-scale-world.mjs','fixtures/host-scale-server.mjs','fixtures/host-scale-surfaces.mjs','fixtures/host-scale-member-progress.mjs','fixtures/host-scale-cleanup.mjs','isolated-browser-cleanup.mjs','fixtures/legacy.html','fixtures/native.mjs','fixtures/native.css'];
 report.fixtureHashes=Object.fromEntries(await Promise.all(dependencies.map(async path=>[path,hash(await readFile(new URL(path,import.meta.url)))])));
 try{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
  const scenario=hostScaleScenario({size:1000,distribution:'project-mixed',cpuRate:1}),rows=[...hostScaleRows(scenario)],projectId=rows[0].project,projectPath='/g/'+projectId+'/project',members=rows.filter(row=>row.project===projectId);
  assert.equal(members.length,80);report.scenario=scenario;
  server=await createHostScaleServer(scenario);directory=await mkdtemp(join(tmpdir(),'vaiwl-mixed-member-'));
  const built=packageHost(join(directory,'package'),{offlineOrigin:server.origin});
  assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
  manifestPath=join(built.unpacked,'build-manifest.json');const bytes=await readFile(manifestPath);manifest=JSON.parse(bytes);manifestHash=hash(bytes);report.sourceHashes=manifest.sourceHashes;
  const permissions=JSON.parse(await readFile(join(built.unpacked,'manifest.json')));
  assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*']);
  assert.equal(permissions.content_security_policy.extension_pages,`script-src 'self'; object-src 'none'; connect-src ${server.origin}`);
  report.workerNetworkBoundary='PACKAGED_EXACT_ORIGIN_CONNECT_SRC';
  context=await chromium.launchPersistentContext(join(directory,'profile'),{headless:true,viewport:{width:1440,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
  context.setDefaultTimeout(6000);
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===server.origin||url.protocol==='chrome-extension:'?route.continue():route.abort();});
  await context.addInitScript(()=>{
   if(location.protocol!=='chrome-extension:'||!chrome.runtime?.sendMessage)return;
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   chrome.runtime.sendMessage=function(...args){const start=performance.now(),result=send(...args),type=args[0]?.type;
    if(type?.startsWith('HOST_UI_')&&result?.then)result.then(value=>console.log('MIXED_MEMBER_RPC '+JSON.stringify({type,elapsedMs:performance.now()-start,state:value?.state,ok:value?.ok,reason:value?.reason})),()=>console.log('MIXED_MEMBER_RPC '+JSON.stringify({type,elapsedMs:performance.now()-start,rejected:true})));
    return result;
   };
  });
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{const text=message.text();if(text.startsWith('MIXED_MEMBER_RPC ')){if(report.rpc.length<4096)report.rpc.push(JSON.parse(text.slice(17)));else report.rpcDropped++;}});
  const cdp=await context.browser().newBrowserCDPSession();({id:extensionId}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));
  report.phase='empty-cache-initial-surface';await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:30000});await waitHostScaleSurfaces(page,{extensionId,timeout:30000});
  assert.equal(await page.locator('nav[aria-label="Chat history"] a').count(),1000);
  const nativeTextarea=await page.locator('textarea').elementHandle();
  report.phase='natural-project-entry-and-exact-membership';const start=performance.now(),deadline=start+30000;
  const remaining=()=>{const ms=deadline-performance.now();if(ms<=0)throw Error('mixed-member-return-deadline');return ms;};
  const bounded=async operation=>{let timer;try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('mixed-member-return-deadline')),remaining());})]);}finally{clearTimeout(timer);}};
  await page.locator('textarea').focus({timeout:remaining()});
  await page.locator(`aside section[aria-label="Projects"] a[href="${projectPath}"]`).click({timeout:remaining()});
  await page.waitForURL(server.origin+projectPath,{timeout:remaining()});
  await page.waitForFunction(()=>document.querySelectorAll('#reading nav[aria-label="Project conversations"] a').length===80,null,{timeout:remaining()});
  const nativeRows=await bounded(()=>page.locator('#reading nav[aria-label="Project conversations"] a').evaluateAll(nodes=>nodes.map(node=>({href:node.getAttribute('href'),title:node.textContent}))));
  assert.deepEqual(nativeRows,members.map(row=>({href:'/c/'+row.id,title:row.title})));
  let attempts=0;
  while(true){
   remaining();assert(await bounded(()=>page.evaluate(hostScaleMemberReadingVisible,{url:server.origin+projectPath,projectId})),'native member evidence must remain visible');
   const frames=page.frames().filter(frame=>!frame.isDetached()&&frame.url()===`chrome-extension://${extensionId}/workspace.html`);assert(frames.length<=1,'ambiguous workspace');
   if(frames[0]){
    try{report.audit=await bounded(()=>frames[0].evaluate(auditMixedMemberIndex,{size:1000,distribution:'project-mixed'}));attempts++;}
    catch(error){if(!frames[0].isDetached())throw error;}
    if(report.audit?.status==='PASS_PARTIAL_MIXED_MAPPING'&&!frames[0].isDetached()&&page.frames().includes(frames[0]))break;
    if(report.audit?.status?.startsWith('FAIL'))throw Error(report.audit.status);
   }
   await new Promise(resolve=>setTimeout(resolve,Math.min(100,remaining())));
  }
  report.auditAttempts=attempts;remaining();assert(await bounded(()=>page.evaluate(hostScaleMemberReadingVisible,{url:server.origin+projectPath,projectId})),'native reading changed before return');report.phase='return-within-original-deadline';
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click({timeout:remaining()});
  const [workspace,sidebar]=await waitHostScaleSurfaces(page,{extensionId,deadline});remaining();report.memberAndReturnElapsedMs=performance.now()-start;
  assert(await nativeTextarea.evaluate(node=>node.isConnected&&node===document.querySelector('textarea')),'native composer identity changed');
  assert.equal(await workspace.locator(`[data-theme-id="${projectId}"] .theme-name`).innerText(),'原生项目 0');
  report.phase='existing-free-search-native-names-and-targets';
  await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
  const search=workspace.getByRole('searchbox',{name:'已知聊天查找输入'});report.uiRows=[];
  for(const row of [members[0],members.at(-1),rows[100]]){
   await search.fill(row.title);const link=workspace.locator(`.search-results a[data-ref-id="${row.id}"]`);await link.waitFor();
   assert.equal(await link.locator('.window-title').innerText(),row.title);
   assert.equal(await link.getAttribute('href'),server.origin+'/c/'+row.id);assert.notEqual(await link.getAttribute('aria-disabled'),'true');report.uiRows.push({id:row.id,nativeName:true,nativeTarget:true});
  }
  assert.equal(page.url(),server.origin+projectPath,'search must not navigate native page');
  report.afterAudit=await workspace.evaluate(auditMixedMemberIndex,{size:1000,distribution:'project-mixed'});assert.equal(report.afterAudit.status,'PASS_PARTIAL_MIXED_MAPPING');
  assert.equal(report.rpcDropped,0);assert(report.rpc.length>0);assert.equal(report.rpc.filter(row=>row.elapsedMs>6000||row.rejected).length,0,'RPC exceeds original six-second budget or rejects');
  assert.deepEqual(server.snapshot().actions,{navigate:1},'only one user native Project navigation is permitted');
  assert.deepEqual(report.errors,[]);report.status='PASS_PARTIAL_MIXED_MEMBER_JOURNEY';
 }catch(error){report.status='FAIL';report.error=error.stack;report.failure=await hostScaleFailureFacts(page);process.exitCode=1;}
 finally{
  const clean=await cleanupHostScaleRun({report,context,server,directory,verify:async()=>{
   report.sourceChangedDuringRun=manifest?(await Promise.all(Object.entries(manifest.sourceHashes).map(async([path,digest])=>hash(await readFile(path))!==digest))).some(Boolean):null;
   report.fixtureChangedDuringRun=(await Promise.all(Object.entries(report.fixtureHashes).map(async([path,digest])=>hash(await readFile(new URL(path,import.meta.url)))!==digest))).some(Boolean);
   report.manifestChangedDuringRun=manifestPath?hash(await readFile(manifestPath))!==manifestHash:null;
   if(report.sourceChangedDuringRun||report.fixtureChangedDuringRun||report.manifestChangedDuringRun){report.status='SOURCE_CHANGED';process.exitCode=1;}
  }});if(!clean)process.exitCode=1;await writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
}
console.log(JSON.stringify({status:report.status,error:report.error,report:output}));
