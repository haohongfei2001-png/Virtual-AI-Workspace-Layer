/** Opt-in packaged production Host, fresh profile, native application-owned world.
 * Default invocation is a cheap NOT_RUN plan; never silently launches 100k.
 * HOST_SCALE_RUN=1 HOST_SCALE_SIZE=1000 HOST_SCALE_DISTRIBUTION=project-mixed
 * HOST_SCALE_CPU_RATE=1 node tests/host/host-scale-package-browser.mjs report.json
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {hostScaleScenario,hostScaleExpected} from './fixtures/host-scale-world.mjs';
import {hostScalePlan,HOST_SCALE_GAPS} from './fixtures/host-scale-plan.mjs';
import {cleanupHostScaleRun} from './fixtures/host-scale-cleanup.mjs';
import {auditHostScaleIndex} from './fixtures/host-scale-audit.mjs';
import {observeCurrentFrame} from './observe-current-frame.mjs';
const output=process.argv[2]??join(tmpdir(),'vaiwl-host-scale.json');
if(process.env.HOST_SCALE_RUN!=='1'){
 const plan=hostScalePlan();await writeFile(output,JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({status:plan.status,report:output,scenarios:plan.scenarios.length}));
}else{
 const scenario=hostScaleScenario({size:Number(process.env.HOST_SCALE_SIZE??1000),distribution:process.env.HOST_SCALE_DISTRIBUTION??'project-mixed',cpuRate:Number(process.env.HOST_SCALE_CPU_RATE??1)});
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const report={requirement:'SYS-04 / original F1',status:'NOT_RUN',acceptance:'NOT_ESTABLISHED',realChatGPT:'NOT_RUN',scenario,expected:hostScaleExpected(scenario),remaining:[...HOST_SCALE_GAPS],samples:[],errors:[],rpc:[],rpcTraceDropped:0};
 let server,context,manifest,manifestPath,manifestHash,directory;
 const sourceFiles=['host-scale-package-browser.mjs','isolated-browser-cleanup.mjs','observe-current-frame.mjs','fixtures/host-scale-cleanup.mjs','fixtures/host-scale-audit.mjs','fixtures/host-scale-world.mjs','fixtures/host-scale-plan.mjs','fixtures/host-scale-server.mjs','fixtures/legacy.html','fixtures/native.mjs','fixtures/native.css'];
 report.fixtureSourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
 try{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
  const {createHostScaleServer}=await import('./fixtures/host-scale-server.mjs');
  const {packageHost,verifyHost}=await import('../../extension/package.mjs');
  server=await createHostScaleServer(scenario);
  directory=await mkdtemp(join(tmpdir(),'vaiwl-host-scale-'));const built=packageHost(join(directory,'package'),{offlineOrigin:server.origin});
  report.package=built;assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
  manifestPath=join(built.unpacked,'build-manifest.json');const bytes=await readFile(manifestPath);manifest=JSON.parse(bytes);manifestHash=hash(bytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=manifestHash;
  const permissions=JSON.parse(await readFile(join(built.unpacked,'manifest.json')));assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*']);assert.equal(permissions.content_security_policy.extension_pages,`script-src 'self'; object-src 'none'; connect-src ${server.origin}`);report.workerNetworkPolicy='PACKAGED_EXACT_ORIGIN_CONNECT_SRC';
  context=await chromium.launchPersistentContext(join(directory,'profile'),{headless:true,viewport:{width:1440,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
  context.setDefaultTimeout(15000);
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===server.origin||url.protocol==='chrome-extension:'?route.continue():route.abort();});
  await context.addInitScript(()=>{
   if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   chrome.runtime.sendMessage=function(...args){const started=performance.now(),result=send(...args),type=args[0]?.type;
    if(type?.startsWith('HOST_UI_')&&result?.then)result.then(r=>console.log('HOST_SCALE_RPC '+JSON.stringify({role:location.pathname,type,elapsedMs:performance.now()-started,state:r?.state,ok:r?.ok,reason:r?.reason,groupCount:r?.page?.groups?.items?.length})),()=>console.log('HOST_SCALE_RPC '+JSON.stringify({role:location.pathname,type,elapsedMs:performance.now()-started,rejected:true})));
    return result;
   };
  });
  const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});report.browserVersion=context.browser().version();
  const surfaces=async page=>{
   await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:30000});
   const frames=['workspace','sidebar'].map(role=>page.frames().find(f=>f.url()===`chrome-extension://${id}/${role}.html`));assert(frames.every(Boolean),'both production surfaces must exist');
   // Waiting for DOM is not a replacement/extension of the production 6s RPC deadline.
   await frames[0].locator('.workspace').waitFor({timeout:30000});return frames;
  };
  const pages=[];
  for(let tab=0;tab<2;tab++){
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',message=>{const text=message.text();if(text.startsWith('HOST_SCALE_RPC ')){if(report.rpc.length<4096)report.rpc.push({tab,...JSON.parse(text.slice(15))});else report.rpcTraceDropped++;}});
   const session=await context.newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:scenario.cpuRate});
   const start=performance.now();await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:60000});const frames=await surfaces(page);
   report.samples.push({scaleBasis:'NATIVE_WORLD_NOT_PROVEN_ADMITTED_AT_SAMPLE',tab,coldProfile:tab===0,initialSurfacesMs:performance.now()-start,nativeHistoryLinks:await page.locator('nav[aria-label="Chat history"] a').count(),surfaces:frames.map(f=>f.url())});
   assert.equal(report.samples.at(-1).nativeHistoryLinks,scenario.size);
  }
  // Tail reachability uses native search and its original handler, never a synthetic resolver.
  const page=pages[1],tail={id:report.expected.last,title:await page.locator('nav[aria-label="Chat history"] a').last().innerText()};
  await page.locator('textarea').focus();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0);
  await page.locator('#search-button').click();const searchStart=performance.now();await page.locator('#search-dialog input').fill(tail.title);
  const tailLink=page.locator('#search-dialog .results').getByRole('link',{name:tail.title,exact:true});await tailLink.waitFor();report.nativeSearchFirstScreenMs=performance.now()-searchStart;
  const navigationStart=performance.now();await tailLink.click();await page.waitForURL(server.origin+'/c/'+tail.id);await page.waitForFunction(title=>document.querySelector('h1')?.textContent===title,tail.title);report.nativeTailNavigationMs=performance.now()-navigationStart;
  assert.equal(await page.locator('#reading').getAttribute('data-conversation-id'),tail.id);
  report.nativeTailReachability='PASS';report.firstSchemaPreparing=report.rpc.some(r=>r.state==='preparing')?'OBSERVED_NOT_CERTIFIED':'NOT_OBSERVED';
  report.rpcObservation=report.rpc.length?{count:report.rpc.length,maxMs:Math.max(...report.rpc.map(r=>r.elapsedMs)),over6000:report.rpc.filter(r=>r.elapsedMs>6000).length}: 'NOT_OBSERVED';
  // Post-measurement diagnostic only: never count native DOM as admitted Host refs.
  if(scenario.distribution==='single-project'){
   await page.locator('textarea').focus();
   const projectPath='/g/g-p-00000000000000000000000000000001/project';
   await page.locator(`aside section[aria-label="Projects"] a[href="${projectPath}"]`).click();await page.waitForURL(server.origin+projectPath);
   await page.waitForFunction(size=>document.querySelectorAll('#reading nav[aria-label="Project conversations"] a').length===size,scenario.size);
   report.nativeProjectMembersRendered=await page.locator('#reading nav[aria-label="Project conversations"] a').count();
  }
  // Dynamic module import belongs in an existing extension page, not an MV3 worker.
  const auditFrameURL=`chrome-extension://${id}/workspace.html`;
  const currentAuditFrame=()=>{const frames=page.frames().filter(frame=>frame.url()===auditFrameURL&&!frame.isDetached());return frames.length===1?frames[0]:null;};
  const auditFrame=await observeCurrentFrame(currentAuditFrame,frame=>frame.evaluate(()=>document.readyState!=='loading'),{parentAlive:()=>!page.isClosed(),timeout:15000});
  report.indexAudit=await auditFrame.evaluate(auditHostScaleIndex,{size:scenario.size,distribution:scenario.distribution,requireProjectMembership:scenario.distribution==='single-project',limit:500});
  assert(!page.isClosed()&&!auditFrame.isDetached()&&currentAuditFrame()===auditFrame,'audit frame changed; snapshot not accepted');
  report.indexAuditRealm=auditFrameURL;
  report.indexAuditTiming='POST_MEASUREMENT_SINGLE_REVISION_SNAPSHOT_NO_INGESTION_COMPLETION_ASSUMED';
  report.nativeNoneTruth=report.expected.nativeNone;report.admittedNone=report.indexAudit.nativeNoneObserved;report.admittedUnknown=report.indexAudit.unknownMembership;
  assert.equal(report.indexAudit.status,'PASS_INDEX_AUDIT_ONLY','native world size is not admitted Host index/membership evidence');
  assert.deepEqual(report.errors,[]);report.status='PARTIAL_SYS04_NOT_ACCEPTED';process.exitCode=2;
 }catch(error){report.status=context?'FAIL':'NOT_RUN_BROWSER_OR_PACKAGE_STARTUP';report.error=error.stack;process.exitCode=1;}
 finally{
  const cleaned=await cleanupHostScaleRun({report,context,server,directory,verify:async()=>{
  report.sourceChangedDuringRun=manifest?(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean):null;
  report.fixtureChangedDuringRun=(await Promise.all(Object.entries(report.fixtureSourceHashes).map(async([p,h])=>hash(await readFile(new URL(p,import.meta.url)))!==h))).some(Boolean);
  report.manifestChangedDuringRun=manifestPath?hash(await readFile(manifestPath))!==manifestHash:null;
  if(report.sourceChangedDuringRun||report.fixtureChangedDuringRun||report.manifestChangedDuringRun){report.status='SOURCE_CHANGED';process.exitCode=1;}
  }});if(!cleaned)process.exitCode=1;
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({status:report.status,error:report.error,report:output}));
}
