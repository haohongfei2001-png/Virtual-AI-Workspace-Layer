import {createScaleTracePackage,verifyScaleTracePackage,appendScaleTrace,collectScaleWorkerTrace} from './host-scale-trace.mjs';
import {createHostScaleProgressSampler} from './fixtures/host-scale-progress-sampler.mjs';
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
import {readHostScaleNativeTail} from './fixtures/host-scale-native-tail.mjs';
import {checkHostScaleSearchPage} from './fixtures/host-scale-ui-oracle.mjs';
import {measureAtAdmittedScale} from './fixtures/host-scale-measurement.mjs';
import {waitHostScaleSurfaces,hostScaleFailureFacts} from './fixtures/host-scale-surfaces.mjs';
import {observeCurrentFrame} from './observe-current-frame.mjs';
import {waitHostScaleMemberProgress} from './fixtures/host-scale-member-progress.mjs';
const output=process.argv[2]??join(tmpdir(),'vaiwl-host-scale.json');
if(process.env.HOST_SCALE_RUN!=='1'){
 const plan=hostScalePlan();await writeFile(output,JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({status:plan.status,report:output,scenarios:plan.scenarios.length}));
}else{
 const scenario=hostScaleScenario({size:Number(process.env.HOST_SCALE_SIZE??1000),distribution:process.env.HOST_SCALE_DISTRIBUTION??'project-mixed',cpuRate:Number(process.env.HOST_SCALE_CPU_RATE??1)});
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const report={sourceCommit:process.env.FREE_SOURCE_COMMIT??null,requirement:'SYS-04 / original F1',status:'NOT_RUN',acceptance:'NOT_ESTABLISHED',realChatGPT:'NOT_RUN',scenario,expected:hostScaleExpected(scenario),remaining:[...HOST_SCALE_GAPS],ingestion:[],errors:[],rpc:[],rpcTraceDropped:0};
 const traceEnabled=process.env.FREE_HOST_SCALE_TRACE==='1',traceThroughReturn=traceEnabled&&process.env.FREE_HOST_SCALE_TRACE_RETURN==='1';
 if(traceEnabled)report.traceRange=traceThroughReturn?'through-native-return':'initial-ingestion';
 let server,context,manifest,manifestPath,manifestHash,directory,activePage,loadedExtensionId,tracePackage;
 const sourceFiles=['host-scale-package-browser.mjs','host-scale-trace.mjs','isolated-browser-cleanup.mjs','observe-current-frame.mjs','fixtures/host-scale-cleanup.mjs','fixtures/host-scale-audit.mjs','fixtures/host-scale-member-progress.mjs','fixtures/host-scale-surfaces.mjs','fixtures/host-scale-progress.mjs','fixtures/host-scale-progress-sampler.mjs','fixtures/host-scale-measurement.mjs','fixtures/host-scale-ui-oracle.mjs','fixtures/host-scale-native-tail.mjs','fixtures/host-scale-world.mjs','fixtures/host-scale-plan.mjs','fixtures/host-scale-server.mjs','fixtures/legacy.html','fixtures/native.mjs','fixtures/native.css'];
 report.fixtureSourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
 try{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
  const {createHostScaleServer}=await import('./fixtures/host-scale-server.mjs');
  const {packageHost,verifyHost}=await import('../../extension/package.mjs');
  server=await createHostScaleServer(scenario);
  directory=await mkdtemp(join(tmpdir(),'vaiwl-host-scale-'));const built=packageHost(join(directory,'package'),{offlineOrigin:server.origin});
  report.package=built;assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
  if(traceEnabled){tracePackage=await createScaleTracePackage(built.unpacked,join(directory,'instrumented-package'));await verifyScaleTracePackage(tracePackage);report.instrumentation=tracePackage;report.trace={events:[],bytes:0,dropped:0};report.timingUse='DIAGNOSTIC_ONLY_INSTRUMENTED_PACKAGE';}
  manifestPath=join(built.unpacked,'build-manifest.json');const bytes=await readFile(manifestPath);manifest=JSON.parse(bytes);manifestHash=hash(bytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=manifestHash;
  const permissions=JSON.parse(await readFile(join(built.unpacked,'manifest.json')));assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*']);assert.equal(permissions.content_security_policy.extension_pages,`script-src 'self'; object-src 'none'; connect-src ${server.origin}`);report.workerNetworkPolicy='PACKAGED_EXACT_ORIGIN_CONNECT_SRC';
  context=await chromium.launchPersistentContext(join(directory,'profile'),{headless:true,viewport:{width:1440,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
  context.setDefaultTimeout(15000);
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===server.origin||url.protocol==='chrome-extension:'?route.continue():route.abort();});
  await context.addInitScript(()=>{
   if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   chrome.runtime.sendMessage=function(...args){const started=performance.now(),requestAt=Date.now(),result=send(...args);
    // Diagnostic observation cannot change the original call or Promise.
    const log=(prefix,value)=>{try{console.log(prefix+JSON.stringify(value));}catch{}};
    try{const type=args[0]?.type;
     if(typeof type==='string'&&type.startsWith('HOST_UI_')&&result?.then)result.then(r=>{try{log('HOST_SCALE_RPC ',{role:location.pathname,type,requestAt,at:Date.now(),elapsedMs:performance.now()-started,state:r?.state,ok:r?.ok,reason:r?.reason,groupCount:r?.page?.groups?.items?.length});}catch{}},()=>log('HOST_SCALE_RPC ',{role:location.pathname,type,requestAt,at:Date.now(),elapsedMs:performance.now()-started,rejected:true}));
    }catch{}
    return result;
   };
  });
  const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:tracePackage?.unpacked??built.unpacked});loadedExtensionId=id;report.browserVersion=context.browser().version();
  await context.addInitScript(({extensionId,nativeOrigin})=>{
   if(location.origin!==nativeOrigin)return;
   addEventListener('message',event=>{try{
    if(event.origin!==`chrome-extension://${extensionId}`||!event.source)return;
    let directChild=false;for(let i=0;i<Math.min(window.length,16);i++)if(window[i]===event.source){directChild=true;break;}if(!directChild)return;
    const data=event.data;if(!data||Object.keys(data).sort().join(',')!=='role,type'||!['workspace','sidebar'].includes(data.role)||!['VAIWL_UI_SUSPEND','VAIWL_UI_EXIT'].includes(data.type))return;
    console.log('HOST_SCALE_LIFECYCLE '+JSON.stringify({role:`/${data.role}.html`,type:data.type,at:Date.now()}));
   }catch{}});
  },{extensionId:id,nativeOrigin:server.origin});
  const surfaces=(page,{deadline=null}={})=>{const sampled=(traceEnabled||process.env.FREE_HOST_SCALE_PROGRESS==='1')&&report.phase==='tab-0-initial-surfaces';
   let sampler;if(sampled){report.nativeIndexSamples=[];report.timingUse=traceEnabled?'DIAGNOSTIC_ONLY_INSTRUMENTED_PACKAGE':'DIAGNOSTIC_ONLY_PROGRESS_SAMPLING';sampler=createHostScaleProgressSampler({page,extensionId:id,records:report.nativeIndexSamples});}
   return waitHostScaleSurfaces(page,{extensionId:id,timeout:30000,deadline,onObservation:value=>{report.surfaceWait??=[];report.surfaceWait.push({phase:report.phase,...value});if(report.surfaceWait.length>16)report.surfaceWait.shift();sampler?.observe({remainingMs:value.remainingMs,preparing:report.rpc.some(row=>row.tab===0&&row.state==='preparing')});}}).finally(()=>sampler?.stop());};
  const pages=[],ingestionStarted=performance.now();
  for(let tab=0;tab<2;tab++){
   const page=await context.newPage();activePage=page;report.phase=`tab-${tab}-native-navigation`;pages.push(page);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',message=>{const text=message.text();if(text.startsWith('HOST_SCALE_LIFECYCLE ')){try{const value=JSON.parse(text.slice(21));if(['/workspace.html','/sidebar.html'].includes(value.role)&&['VAIWL_UI_SUSPEND','VAIWL_UI_EXIT'].includes(value.type)&&Number.isSafeInteger(value.at)&&value.at>=0){report.uiLifecycle??=[];if(report.uiLifecycle.length<128)report.uiLifecycle.push({tab,role:value.role,type:value.type,at:value.at});else report.uiLifecycleDropped=(report.uiLifecycleDropped??0)+1;}}catch{}return;}if(traceEnabled&&text.startsWith('HOST_SCALE_TRACE ')){try{appendScaleTrace(report.trace,{...JSON.parse(text.slice(17)),realmOrdinal:tab+1});}catch{report.trace.dropped++;}return;}if(text.startsWith('HOST_SCALE_RPC ')){if(report.rpc.length<4096)report.rpc.push({tab,...JSON.parse(text.slice(15))});else report.rpcTraceDropped++;}});
   const session=await context.newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:scenario.cpuRate});
   const start=performance.now();await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:60000});report.phase=`tab-${tab}-initial-surfaces`;const frames=await surfaces(page);
   report.ingestion.push({scaleBasis:'NATIVE_WORLD_NOT_PROVEN_ADMITTED_AT_SAMPLE',tab,coldProfile:tab===0,initialSurfacesMs:performance.now()-start,nativeHistoryLinks:await page.locator('nav[aria-label="Chat history"] a').count(),surfaces:frames.map(f=>f.url())});
   assert.equal(report.ingestion.at(-1).nativeHistoryLinks,scenario.size);
   const layout=await hostScaleFailureFacts(page);report.ingestion.at(-1).nativeGeometry=layout.nativeDOM?.geometry??null;
   assert(layout.nativeDOM?.geometry?.history?.height>0,'native scale history must have positive height');
   assert(layout.nativeDOM?.geometry?.projects?.height>0&&layout.nativeDOM.geometry.projects.height<=270,'native scale project region must be independently scrollable within 30vh');
  }
  if(traceEnabled&&!traceThroughReturn){report.measurement={status:'NOT_RUN_DIAGNOSTIC_INGESTION_OBSERVATION',samples:null,acceptance:'NOT_ESTABLISHED'};throw Error('diagnostic-initial-ingestion-complete');}
  const page=pages[1];
  report.phase='native-tail-ingestion';
  // Native tail navigation is ingestion/reachability, never the admitted-index sample.
  const tail=await readHostScaleNativeTail(page,{id:report.expected.last,size:scenario.size,longTitles:scenario.longTitles});
  await page.locator('#search-button').click();await page.locator('#search-dialog input').fill(tail.title);
  const nativeTailLink=page.locator('#search-dialog .results').getByRole('link',{name:tail.title,exact:true});await nativeTailLink.waitFor();await nativeTailLink.click();
  await page.waitForURL(server.origin+'/c/'+tail.id);await page.waitForFunction(title=>document.querySelector('h1')?.textContent===title,tail.title);
  assert.equal(await page.locator('#reading').getAttribute('data-conversation-id'),tail.id);report.ingestionNativeTailReachability='PASS';
  // This separate single-project scenario keeps native reading visible for
  // bounded observation before returning. Immediate return remains partial/UNKNOWN.
  // The same original 30s budget covers this prerequisite and return surfaces.
  let memberReturnDeadline=null;
  const memberReturnRemaining=()=>{const value=memberReturnDeadline-performance.now();if(!(value>0))throw Error('host-scale-member-return-deadline');return value;};
  if(scenario.distribution==='single-project'){
   report.phase='native-project-members-ingestion';memberReturnDeadline=performance.now()+30000;
   await page.locator('textarea').focus({timeout:memberReturnRemaining()});
   const projectPath='/g/g-p-00000000000000000000000000000001/project';
   await page.locator(`aside section[aria-label="Projects"] a[href="${projectPath}"]`).click({timeout:memberReturnRemaining()});await page.waitForURL(server.origin+projectPath,{timeout:memberReturnRemaining()});
   await page.waitForFunction(size=>document.querySelectorAll('#reading nav[aria-label="Project conversations"] a').length===size,scenario.size,{timeout:memberReturnRemaining()});
   report.nativeProjectMembersRendered=await page.locator('#reading nav[aria-label="Project conversations"] a').count();
   report.phase='visible-native-member-progress';
   report.nativeMemberProgress=await waitHostScaleMemberProgress({page,extensionId:id,url:server.origin+projectPath,projectId:projectPath.split('/')[2],id:tail.id,deadline:memberReturnDeadline});
   report.nativeMemberProgress.scenario='VISIBLE_NATIVE_READING_BEFORE_RETURN_NOT_IMMEDIATE_RETURN';
   // Tail progress is not completeness: the unchanged full ID audit follows.
  }
  report.phase='return-workspace-local-search';
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click(memberReturnDeadline===null?{}:{timeout:memberReturnRemaining()});
  const [workspace,sidebar]=await surfaces(page,{deadline:memberReturnDeadline});
  await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
  const localSearch=workspace.getByRole('searchbox',{name:'已知聊天查找输入'});await localSearch.waitFor();
  const nativeRouteBeforeMeasurement=page.url();
  // Dynamic module import belongs in an existing extension page, not an MV3 worker.
  const auditFrameURL=`chrome-extension://${id}/workspace.html`;
  const currentAuditFrame=()=>{const frames=page.frames().filter(frame=>frame.url()===auditFrameURL&&!frame.isDetached());return frames.length===1?frames[0]:null;};
  const audit=async()=>{
   report.phase=report.measurementStarted?'post-measurement-audit':'pre-measurement-audit';
   const auditFrame=await observeCurrentFrame(currentAuditFrame,frame=>frame.evaluate(()=>document.readyState!=='loading'),{parentAlive:()=>!page.isClosed(),timeout:15000});
   const snapshot=await auditFrame.evaluate(auditHostScaleIndex,{size:scenario.size,distribution:scenario.distribution,requireProjectMembership:scenario.distribution==='single-project',limit:500});
   assert(!page.isClosed()&&!auditFrame.isDetached()&&currentAuditFrame()===auditFrame,'audit frame changed; snapshot not accepted');return snapshot;
  };
  report.ingestionObservationMs=performance.now()-ingestionStarted;
  report.indexAuditRealm=auditFrameURL;
  if((traceEnabled||process.env.FREE_HOST_SCALE_PROGRESS==='1')){report.measurement={status:'NOT_RUN_DIAGNOSTIC_INGESTION_OBSERVATION',samples:null,acceptance:'NOT_ESTABLISHED'};throw Error('diagnostic-progress-run-cannot-produce-scale-timing');}
  report.measurement=await measureAtAdmittedScale({audit,measure:async()=>{
   report.phase='local-search-pagination-measurement';report.measurementStarted=true;
   // Actual existing local-search/pagination UI, no native navigation or injected RPC.
   assert(currentAuditFrame()===workspace&&!workspace.isDetached(),'local search frame replaced before timing');
   const results=workspace.locator('.search-results');
   const localSearchStarted=performance.now();await localSearch.fill(tail.title);
   await results.getByRole('link',{name:tail.title,exact:true}).waitFor();const localExactTailSearchMs=performance.now()-localSearchStarted;
   const readRows=()=>results.locator('a[data-ref-id]').evaluateAll(nodes=>nodes.map(node=>({id:node.getAttribute('data-ref-id'),title:node.querySelector('.window-title')?.textContent})));
   assert.deepEqual(checkHostScaleSearchPage({rows:await readRows(),size:scenario.size,query:tail.title,longTitles:scenario.longTitles,expectedCount:1}),[tail.id]);
   const broadSearchStarted=performance.now();await localSearch.fill('原生压力聊天');
   const next=results.getByRole('button',{name:'显示更多查找结果',exact:true});await next.waitFor();
   const firstRows=await readRows(),localBroadSearchFirstScreenMs=performance.now()-broadSearchStarted;
   const firstPage=checkHostScaleSearchPage({rows:firstRows,size:scenario.size,query:'原生压力聊天',longTitles:scenario.longTitles,expectedCount:24});
   const pageStarted=performance.now();await next.click();await results.getByRole('button',{name:'返回前页查找结果',exact:true}).waitFor();
   const secondRows=await readRows(),localNextPageMs=performance.now()-pageStarted;
   const secondPage=checkHostScaleSearchPage({rows:secondRows,size:scenario.size,query:'原生压力聊天',longTitles:scenario.longTitles,expectedCount:24,excludedIds:firstPage});
   assert.equal(page.url(),nativeRouteBeforeMeasurement,'local search must not change native route');
   assert(currentAuditFrame()===workspace&&!workspace.isDetached(),'local search frame replaced during timing');
   return {localExactTailSearchMs,localBroadSearchFirstScreenMs,localNextPageMs,firstPageRefs:firstPage.length,secondPageRefs:secondPage.length,kind:'HOST_LOCAL_SEARCH_AND_PAGINATION_SINGLE_SAMPLES_NOT_P95',coverage:'TWO_CORRECT_PAGES_NOT_FULL_SEARCH_COVERAGE_OR_ORDER_CERTIFICATION',timing:'PLAYWRIGHT_WALL_CLOCK_INCLUDING_AUTOMATION_OVERHEAD'};
  }});
  report.indexAudit=report.measurement.after??report.measurement.before;
  report.indexAuditTiming='BEFORE_AND_AFTER_MEASUREMENT_SAME_REVISION_REQUIRED';
  report.nativeNoneTruth=report.expected.nativeNone;report.admittedNone=report.indexAudit.nativeNoneObserved;report.admittedUnknown=report.indexAudit.unknownMembership;
  report.firstSchemaPreparing=report.rpc.some(r=>r.state==='preparing')?'OBSERVED_NOT_CERTIFIED':'NOT_OBSERVED';
  report.rpcObservation=report.rpc.length?{scope:'INGESTION_AND_MEASUREMENT_DIAGNOSTIC',count:report.rpc.length,maxMs:Math.max(...report.rpc.map(r=>r.elapsedMs)),over6000:report.rpc.filter(r=>r.elapsedMs>6000).length}: 'NOT_OBSERVED';
  assert.equal(report.measurement.status,'MEASURED_AT_STABLE_ADMITTED_INDEX','scale measurement not established: '+report.measurement.status);
  assert.deepEqual(report.errors,[]);report.status='PARTIAL_SYS04_NOT_ACCEPTED';process.exitCode=2;
 }catch(error){const {hostScaleFailureProgress}=await import('./fixtures/host-scale-progress.mjs');report.nativeIndexProgress=await hostScaleFailureProgress(activePage,loadedExtensionId).catch(()=>({status:'DIAGNOSTIC_UNAVAILABLE',acceptance:'NOT_ESTABLISHED'}));report.status=traceThroughReturn&&error.message==='diagnostic-progress-run-cannot-produce-scale-timing'?'DIAGNOSTIC_ONLY_RETURN_COMPLETE':traceEnabled&&error.message==='diagnostic-initial-ingestion-complete'?'DIAGNOSTIC_ONLY_INGESTION_COMPLETE':context?'FAIL':'NOT_RUN_BROWSER_OR_PACKAGE_STARTUP';report.error=error.stack;report.failure={phase:report.phase,rpcCount:report.rpc.length,rpcTail:report.rpc.slice(-16),facts:await hostScaleFailureFacts(activePage).catch(failure=>({captureError:failure.message}))};process.exitCode=1;}
 finally{
  if(traceEnabled){report.workerTrace=await collectScaleWorkerTrace(context,loadedExtensionId).catch(()=>({status:'UNAVAILABLE'}));if(report.trace){const rows=[...report.trace.events,...(report.workerTrace.events??[]).map(row=>({...row,realmOrdinal:0}))].sort((a,b)=>a.at-b.at);report.trace.events=[];report.trace.bytes=0;for(const row of rows)appendScaleTrace(report.trace,row);}if(report.workerTrace.events)delete report.workerTrace.events;}
  const cleaned=await cleanupHostScaleRun({report,context,server,directory,verify:async()=>{
  if(tracePackage){await verifyScaleTracePackage(tracePackage);assert.equal((await import('../../extension/package.mjs')).verifyHost(report.package.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');}
  report.sourceChangedDuringRun=manifest?(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean):null;
  report.fixtureChangedDuringRun=(await Promise.all(Object.entries(report.fixtureSourceHashes).map(async([p,h])=>hash(await readFile(new URL(p,import.meta.url)))!==h))).some(Boolean);
  report.manifestChangedDuringRun=manifestPath?hash(await readFile(manifestPath))!==manifestHash:null;
  if(report.sourceChangedDuringRun||report.fixtureChangedDuringRun||report.manifestChangedDuringRun){report.status='SOURCE_CHANGED';process.exitCode=1;}
  }});if(!cleaned)process.exitCode=1;
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({status:report.status,error:report.error,report:output}));
}
