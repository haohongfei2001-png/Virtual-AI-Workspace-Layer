import {startHostScaleCPUProfile,startHostScalePageCPUProfile} from './host-scale-cpu-profile.mjs';
import {connectJ4Debugger} from './j4-debugger-transport.mjs';
import {checkHostScaleProjectCard} from './fixtures/host-scale-project-card-oracle.mjs';
import {prepareHostScaleAdmission} from './fixtures/host-scale-admission-preparation.mjs';
import {observeHostScaleAdmission} from './fixtures/host-scale-admission-observation.mjs';
import {hostScaleFailureProgress} from './fixtures/host-scale-progress.mjs';
import {createScaleTracePackage,verifyScaleTracePackage,appendScaleTrace,collectScaleWorkerTrace,collectScaleCPUPhaseTrace} from './host-scale-trace.mjs';
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
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
const output=process.argv[2]??join(tmpdir(),'vaiwl-host-scale.json');
if(process.env.HOST_SCALE_RUN!=='1'){
 const plan=hostScalePlan();await writeFile(output,JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({status:plan.status,report:output,scenarios:plan.scenarios.length}));
}else{
 const scenario=hostScaleScenario({size:Number(process.env.HOST_SCALE_SIZE??1000),distribution:process.env.HOST_SCALE_DISTRIBUTION??'project-mixed',cpuRate:Number(process.env.HOST_SCALE_CPU_RATE??1)});
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const report={sourceCommit:process.env.FREE_SOURCE_COMMIT??null,requirement:'SYS-04 / original F1',status:'NOT_RUN',acceptance:'NOT_ESTABLISHED',realChatGPT:'NOT_RUN',scenario,expected:hostScaleExpected(scenario),remaining:[...HOST_SCALE_GAPS],ingestion:[],errors:[],rpc:[],rpcTraceDropped:0};
 const cpuProfileEnabled=process.env.FREE_HOST_SCALE_CPU_PROFILE==='1',cpuTraceEnabled=process.env.FREE_HOST_SCALE_CPU_TRACE==='1';
 const traceEnabled=process.env.FREE_HOST_SCALE_TRACE==='1',traceThroughReturn=traceEnabled&&process.env.FREE_HOST_SCALE_TRACE_RETURN==='1';
 if(cpuTraceEnabled&&(!cpuProfileEnabled||!traceThroughReturn))throw Error('cpu-trace-requires-explicit-through-return-cpu-diagnostic');
 if(cpuProfileEnabled&&(scenario.distribution!=='single-project'||traceEnabled&&!cpuTraceEnabled||['FREE_HOST_SCALE_PROGRESS','FREE_HOST_SCALE_ADMISSION_OBSERVE','FREE_HOST_SCALE_ADMISSION_PREPARE'].some(k=>process.env[k]==='1')))throw Error('cpu-profile-requires-unprepared-single-project');
 if(cpuTraceEnabled)report.diagnosticClock={kind:'COMMAND_BOUNDS_AND_RECORDED_STAGE_CORRELATION_ONLY',runnerTimeOriginMs:performance.timeOrigin,wallTimeMs:Date.now(),epochMs:performance.timeOrigin+performance.now(),cpuClock:'CDP_COMMAND_BOUNDS_NOT_ACTUAL_SAMPLE_INSTANTS',traceClock:'PER_REALM_TIME_ORIGIN_PLUS_NOW',crossRealmClock:'CORRELATION_ONLY_NOT_PROVEN_SYNCHRONIZED',stageClock:'ORIGINAL_RUNNER_STAGE_PLUS_TIME_ORIGIN'};
 if(traceEnabled)report.traceRange=traceThroughReturn?'through-native-return':'initial-ingestion';
 let server,context,browserHandle,browserLaunchAttempted=false,networkGuard,manifest,manifestPath,manifestHash,directory,activePage,loadedExtensionId,tracePackage,cpuTransport,nativeCPUPageSession,cpuProfilesFinished;
 const cpuProfiles=[];
 const closeCPUTransport=()=>{try{cpuTransport?.close();report.cpuProfileCleanup={status:'SUCCEEDED'};}catch{report.cpuProfileCleanup={status:'UNAVAILABLE',reason:'transport-close-failed'};}};
 const sourceFiles=['host-scale-cpu-profile.mjs','j4-debugger-transport.mjs','host-scale-package-browser.mjs','native-visibility-browser.mjs','historical-network-guard.mjs','host-scale-trace.mjs','isolated-browser-cleanup.mjs','observe-current-frame.mjs','fixtures/host-scale-cleanup.mjs','fixtures/host-scale-project-card-oracle.mjs','fixtures/host-scale-audit.mjs','fixtures/host-scale-member-progress.mjs','fixtures/host-scale-surfaces.mjs','fixtures/host-scale-progress.mjs','fixtures/host-scale-admission-observation.mjs','fixtures/host-scale-admission-preparation.mjs','fixtures/host-scale-progress-sampler.mjs','fixtures/host-scale-measurement.mjs','fixtures/host-scale-ui-oracle.mjs','fixtures/host-scale-native-tail.mjs','fixtures/host-scale-world.mjs','fixtures/host-scale-plan.mjs','fixtures/host-scale-server.mjs','fixtures/legacy.html','fixtures/native.mjs','fixtures/native.css'];
 report.fixtureSourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
 try{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
  const {createHostScaleServer}=await import('./fixtures/host-scale-server.mjs');
  const {packageHost,verifyHost}=await import('../../extension/package.mjs');
  server=await createHostScaleServer(scenario);
  directory=await mkdtemp(join(tmpdir(),'vaiwl-host-scale-'));const built=packageHost(join(directory,'package'),{offlineOrigin:server.origin});
  report.package=built;assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
  if(traceEnabled){tracePackage=await createScaleTracePackage(built.unpacked,join(directory,'instrumented-package'),cpuTraceEnabled?{clockAlignment:true}:{});await verifyScaleTracePackage(tracePackage);report.instrumentation=tracePackage;report.trace={events:[],bytes:0,dropped:0};report.timingUse='DIAGNOSTIC_ONLY_INSTRUMENTED_PACKAGE';}
  manifestPath=join(built.unpacked,'build-manifest.json');const bytes=await readFile(manifestPath);manifest=JSON.parse(bytes);manifestHash=hash(bytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=manifestHash;
  const permissions=JSON.parse(await readFile(join(built.unpacked,'manifest.json')));assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*']);assert.equal(permissions.content_security_policy.extension_pages,`script-src 'self'; object-src 'none'; connect-src ${server.origin}`);report.workerNetworkPolicy='PACKAGED_EXACT_ORIGIN_CONNECT_SRC';
  networkGuard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
  browserLaunchAttempted=true;
  browserHandle=await launchNativeVisibilityBrowser({chromium,profileDir:join(directory,'profile'),headed:false,historicalNetworkGuard:networkGuard.config,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium')});
  context=browserHandle.context;report.browserPrecondition=browserHandle.diagnostic;
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
   globalThis.hostScaleVisibilityEvents=[];
   for(const type of ['focus','blur','visibilitychange'])addEventListener(type,event=>{const rows=globalThis.hostScaleVisibilityEvents;if(rows.length===32)rows.shift();rows.push({type,trusted:event.isTrusted,visibility:document.visibilityState,focused:document.hasFocus(),at:Date.now()});});
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
   const page=await context.newPage();await page.setViewportSize({width:1440,height:900});await page.bringToFront();activePage=page;report.phase=`tab-${tab}-native-navigation`;pages.push(page);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',message=>{const text=message.text();if(text.startsWith('HOST_SCALE_LIFECYCLE ')){try{const value=JSON.parse(text.slice(21));if(['/workspace.html','/sidebar.html'].includes(value.role)&&['VAIWL_UI_SUSPEND','VAIWL_UI_EXIT'].includes(value.type)&&Number.isSafeInteger(value.at)&&value.at>=0){report.uiLifecycle??=[];if(report.uiLifecycle.length<128)report.uiLifecycle.push({tab,role:value.role,type:value.type,at:value.at});else report.uiLifecycleDropped=(report.uiLifecycleDropped??0)+1;}}catch{}return;}if(traceEnabled&&text.startsWith('HOST_SCALE_TRACE ')){try{appendScaleTrace(report.trace,{...JSON.parse(text.slice(17)),realmOrdinal:tab+1});}catch{report.trace.dropped++;}return;}if(text.startsWith('HOST_SCALE_RPC ')){if(report.rpc.length<4096)report.rpc.push({tab,...JSON.parse(text.slice(15))});else report.rpcTraceDropped++;}});
   const session=await context.newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:scenario.cpuRate});
   if(cpuProfileEnabled&&tab===1)nativeCPUPageSession=session;
   const start=performance.now();await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:60000});report.phase=`tab-${tab}-initial-surfaces`;const frames=await surfaces(page);
   report.ingestion.push({scaleBasis:'NATIVE_WORLD_NOT_PROVEN_ADMITTED_AT_SAMPLE',tab,coldProfile:tab===0,initialSurfacesMs:performance.now()-start,nativeHistoryLinks:await page.locator('nav[aria-label="Chat history"] a').count(),surfaces:frames.map(f=>f.url())});
   assert.equal(report.ingestion.at(-1).nativeHistoryLinks,scenario.size);
   const layout=await hostScaleFailureFacts(page);report.ingestion.at(-1).nativeGeometry=layout.nativeDOM?.geometry??null;
   assert(layout.nativeDOM?.geometry?.history?.height>0,'native scale history must have positive height');
   assert(layout.nativeDOM?.geometry?.projects?.height>0&&layout.nativeDOM.geometry.projects.height<=270,'native scale project region must be independently scrollable within 30vh');
  }
  if(traceEnabled&&!traceThroughReturn){report.measurement={status:'NOT_RUN_DIAGNOSTIC_INGESTION_OBSERVATION',samples:null,acceptance:'NOT_ESTABLISHED'};throw Error('diagnostic-initial-ingestion-complete');}
  const page=pages[1];
  const visibilitySnapshot=()=>Promise.all(pages.map((value,tab)=>value.evaluate(tab=>({tab,visibility:document.visibilityState,focused:document.hasFocus(),events:globalThis.hostScaleVisibilityEvents??[]}),tab)));
  report.nativeVisibilityBeforeMember=await visibilitySnapshot();
  assert.equal(report.nativeVisibilityBeforeMember[0].visibility,'hidden','native background peer must really be hidden');
  assert.equal(report.nativeVisibilityBeforeMember[0].focused,false);
  assert.equal(report.nativeVisibilityBeforeMember[1].visibility,'visible');
  assert.equal(report.nativeVisibilityBeforeMember[1].focused,true);
  assert(report.nativeVisibilityBeforeMember[0].events.some(event=>event.type==='visibilitychange'&&event.visibility==='hidden'&&event.trusted),'background transition must be native');
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
   report.nativeProjectName=await page.locator('h1').textContent();
   await page.evaluate(()=>{globalThis.scaleProjectEditor=document.querySelector('textarea');globalThis.scaleProjectDocument=document;});
   report.nativeProjectMembersRendered=await page.locator('#reading nav[aria-label="Project conversations"] a').count();
   report.phase='visible-native-member-progress';
   report.nativeVisibilityAtMember=await visibilitySnapshot();
   assert.equal(report.nativeVisibilityAtMember[0].visibility,'hidden');assert.equal(report.nativeVisibilityAtMember[0].focused,false);
   assert.equal(report.nativeVisibilityAtMember[1].visibility,'visible');assert.equal(report.nativeVisibilityAtMember[1].focused,true);memberReturnRemaining();
   if(cpuProfileEnabled){
    report.timingUse=cpuTraceEnabled?'DIAGNOSTIC_ONLY_INSTRUMENTED_WORKER_AND_NATIVE_PAGE_CPU_SAMPLING':'DIAGNOSTIC_ONLY_WORKER_AND_NATIVE_PAGE_CPU_SAMPLING';
    const unavailable=kind=>({kind:`DIAGNOSTIC_ONLY_HOST_SCALE_${kind}_CPU`,acceptance:'NOT_ESTABLISHED',status:'UNAVAILABLE',reason:'setup-failed'});
    report.workerCPUProfile=unavailable('WORKER');report.nativePageCPUProfile=unavailable('NATIVE_PAGE');
    if(cpuTraceEnabled)report.cpuPhaseTrace={status:'UNAVAILABLE',acceptance:'NOT_ESTABLISHED',reason:'profiles-not-finished'};
    try{
     // This is the same page session used above, not a URL-selected or new page.
     let timer,targetInfo;
     try{({targetInfo}=await Promise.race([nativeCPUPageSession.send('Target.getTargetInfo'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native-target-info-timeout')),1500);})]));}finally{clearTimeout(timer);}
     cpuTransport=await connectJ4Debugger(browserHandle.debugEndpoint);
     const starts=await Promise.allSettled([
      startHostScaleCPUProfile({transport:cpuTransport,extensionId:id,...cpuTraceEnabled?{clockAlignment:true}:{}}),
      startHostScalePageCPUProfile({transport:cpuTransport,targetId:targetInfo?.targetId,expectedURL:server.origin+projectPath,...cpuTraceEnabled?{clockAlignment:true}:{}}),
     ]);
     for(const [index,key]of ['workerCPUProfile','nativePageCPUProfile'].entries())if(starts[index].status==='fulfilled')cpuProfiles.push({key,profile:starts[index].value});
     // Each helper owns only its session. Never let the first result close the peer.
     cpuProfilesFinished=Promise.allSettled(cpuProfiles.map(async({key,profile})=>{report[key]=await profile.finished;})).then(async()=>{
      closeCPUTransport();
      if(cpuTraceEnabled)try{report.cpuPhaseTrace=await collectScaleCPUPhaseTrace({trace:report.trace,context,extensionId:id,profiles:report,timeout:1000});}catch{report.cpuPhaseTrace={status:'UNAVAILABLE',acceptance:'NOT_ESTABLISHED',reason:'snapshot-failed'};}
     });
    }catch{closeCPUTransport();}
   }
   report.nativeMemberProgress=await waitHostScaleMemberProgress({page,extensionId:id,url:server.origin+projectPath,projectId:projectPath.split('/')[2],id:tail.id,size:scenario.size,distribution:scenario.distribution,deadline:memberReturnDeadline});
   report.nativeMemberProgress.scenario='VISIBLE_NATIVE_READING_BEFORE_RETURN_NOT_IMMEDIATE_RETURN';
   // Full same-revision reading audit precedes return; the unchanged post-return audit follows.
  }
  report.phase='return-workspace-local-search';
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click(memberReturnDeadline===null?{}:{timeout:memberReturnRemaining()});
  const [workspace,sidebar]=await surfaces(page,{deadline:memberReturnDeadline});
  if(scenario.distribution==='single-project'){
   report.phase='project-card-member-rendering';const projectId='g-p-00000000000000000000000000000001';
   const card=workspace.locator(`.card[data-theme-id="${projectId}"]`);
   await card.locator('.theme-name').waitFor({timeout:memberReturnRemaining()});
   const readCard=()=>card.evaluate(node=>({name:node.querySelector('.theme-name')?.textContent,createHref:node.querySelector('.card-head a[aria-label^="打开项目以新建聊天"]')?.getAttribute('href'),rows:[...node.querySelectorAll('.members a[data-ref-id]')].map(row=>({id:row.getAttribute('data-ref-id'),title:row.querySelector('.window-title')?.textContent,href:row.getAttribute('href')}))}));
   await card.locator('.members a[data-ref-id]').nth(4).waitFor({timeout:memberReturnRemaining()});
   const first=await readCard();assert.equal(first.name,report.nativeProjectName);assert.equal(first.rows.length,5);
   const firstIds=checkHostScaleProjectCard({card:first,expectedProjectId:projectId,size:scenario.size,nativeOrigin:server.origin,longTitles:scenario.longTitles});
   await card.getByRole('button',{name:'显示更多待核对窗口',exact:true}).click({timeout:memberReturnRemaining()});
   await card.locator('.members a[data-ref-id]').nth(16).waitFor({timeout:memberReturnRemaining()});
   const expanded=await readCard();assert.equal(expanded.rows.length,17);
   const expandedIds=checkHostScaleProjectCard({card:expanded,expectedProjectId:projectId,size:scenario.size,nativeOrigin:server.origin,longTitles:scenario.longTitles,previousIds:firstIds});
   assert.equal(page.url(),server.origin+'/g/'+projectId+'/project');
   assert(await page.evaluate(()=>document===scaleProjectDocument&&document.querySelector('textarea')===scaleProjectEditor));memberReturnRemaining();
   report.projectCardMembers={status:'PASS_RENDERED_MEMBER_SAMPLE',nativeName:first.name,firstMember:first.rows[0],firstIds,expandedIds,nativeRouteAndEditorUnchanged:true,membershipAcceptance:'REQUIRES_FOLLOWING_FULL_PROJECT_AUDIT',activity:'UNDATED_NOT_MEMBERSHIP_UNKNOWN'};
  }
  await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
  const localSearch=workspace.getByRole('searchbox',{name:'已知聊天查找输入'});await localSearch.waitFor();
  const nativeRouteBeforeMeasurement=page.url();
  // Dynamic module import belongs in an existing extension page, not an MV3 worker.
  const auditFrameURL=`chrome-extension://${id}/workspace.html`;
  const currentAuditFrame=()=>{const frames=page.frames().filter(frame=>frame.url()===auditFrameURL&&!frame.isDetached());return frames.length===1?frames[0]:null;};
  const audit=async({signal,remainingMs}={})=>{
   report.phase=report.measurementStarted?'post-measurement-audit':'pre-measurement-audit';
   const deadline=Number.isFinite(remainingMs)?performance.now()+remainingMs:null;
   const remaining=()=>{if(signal?.aborted)throw Error('request-timeout');const ms=deadline===null?null:deadline-performance.now();if(ms!==null&&ms<=0)throw Error('request-timeout');return ms;};
   const auditFrame=await observeCurrentFrame(currentAuditFrame,frame=>frame.evaluate(()=>document.readyState!=='loading'),{parentAlive:()=>!page.isClosed()&&!signal?.aborted,timeout:Math.min(15000,remaining()??15000)});
   const budget=remaining();
   const snapshot=await auditFrame.evaluate(auditHostScaleIndex,{size:scenario.size,distribution:scenario.distribution,requireProjectMembership:scenario.distribution==='single-project',limit:500,...(budget===null?{}:{timeoutMs:budget})});
   remaining();
   assert(!page.isClosed()&&!auditFrame.isDetached()&&currentAuditFrame()===auditFrame,'audit frame changed; snapshot not accepted');return snapshot;
  };
  report.ingestionObservationMs=performance.now()-ingestionStarted;
  report.indexAuditRealm=auditFrameURL;
  if(process.env.FREE_HOST_SCALE_ADMISSION_OBSERVE==='1'){
   report.timingUse='DIAGNOSTIC_ONLY_EXTENDED_ADMISSION_OBSERVATION';
   report.admissionObservation=await observeHostScaleAdmission({read:()=>hostScaleFailureProgress(page,id,{timeout:1000})});
   report.diagnosticIndexAudit=await audit();
  }
  if((cpuProfileEnabled||traceEnabled||process.env.FREE_HOST_SCALE_PROGRESS==='1'||process.env.FREE_HOST_SCALE_ADMISSION_OBSERVE==='1')){report.measurement={status:'NOT_RUN_DIAGNOSTIC_INGESTION_OBSERVATION',samples:null,acceptance:'NOT_ESTABLISHED'};throw Error('diagnostic-progress-run-cannot-produce-scale-timing');}
  if(process.env.FREE_HOST_SCALE_ADMISSION_PREPARE==='1'){
   report.admissionPath='EXPLICIT_BOUNDED_PREPARATION_NOT_IMMEDIATE_INDEX';
   report.immediateIndexAudit=await audit();
   report.admissionPreparation=await prepareHostScaleAdmission({initialAudit:report.immediateIndexAudit,
    read:({remainingMs})=>hostScaleFailureProgress(page,id,{timeout:Math.min(1000,remainingMs)}),audit});
   if(!report.admissionPreparation.ready){
    report.indexAudit=report.admissionPreparation.finalAudit??report.immediateIndexAudit;
    report.measurement={status:'NOT_RUN_ADMISSION_PREPARATION_INCOMPLETE',samples:null,acceptance:'NOT_ESTABLISHED'};
    throw Error('host-scale-admission-preparation-'+report.admissionPreparation.status);
   }
  }
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
  if(scenario.distribution==='single-project'){
   report.phase='project-card-native-navigation-closure';const targetId=report.projectCardMembers.firstIds[0];
   const target=report.projectCardMembers.firstMember;
   const navigationDeadline=performance.now()+15000,remaining=()=>{const value=navigationDeadline-performance.now();assert(value>0,'project-card-navigation-deadline');return value;};
   await workspace.getByRole('button',{name:'关闭派生查找',exact:true}).click({timeout:remaining()});
   const member=workspace.locator(`.card .members a[data-ref-id="${targetId}"]`);await member.waitFor({timeout:remaining()});
   assert.equal(await member.getAttribute('href'),server.origin+'/c/'+targetId);
   const delegated=await member.getAttribute('data-native-plan-control')!==null;
   assert.notEqual(await member.getAttribute('aria-disabled'),'true');
   let nativePage=page;
   try{
   if(delegated)await member.click({timeout:remaining()});
   else{
    assert.equal(await member.getAttribute('target'),'_blank');
    [nativePage]=await Promise.all([context.waitForEvent('page',{timeout:remaining()}),member.click({timeout:remaining()})]);
    nativePage.on('pageerror',error=>report.errors.push(error.message));assert.notEqual(nativePage,page);
   }
   await nativePage.waitForURL(server.origin+'/c/'+targetId,{timeout:remaining()});
   await nativePage.waitForFunction(({id,title})=>document.querySelector('#reading')?.getAttribute('data-conversation-id')===id&&document.querySelector('h1')?.textContent===title,{id:targetId,title:target.title},{timeout:remaining()});
   assert(await page.evaluate(()=>document===scaleProjectDocument&&document.querySelector('textarea')===scaleProjectEditor));
   if(!delegated)assert.equal(page.url(),nativeRouteBeforeMeasurement);
   await nativePage.locator('textarea').focus({timeout:remaining()});
   await nativePage.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:remaining()});
   const back=nativePage.getByRole('button',{name:'返回工作空间',exact:true});await back.waitFor({timeout:remaining()});assert.equal(await back.count(),1);await back.click({timeout:remaining()});
   await nativePage.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:remaining()});remaining();
   assert(await page.evaluate(()=>document===scaleProjectDocument&&document.querySelector('textarea')===scaleProjectEditor));assert.equal(nativePage.url(),server.origin+'/c/'+targetId);
   report.projectCardNavigation={status:'PASS_NATIVE_MEMBER_AND_UNIQUE_RETURN',mode:delegated?'NATIVE_CONTROL':'HREF_NEW_TAB_PRESERVE_CURRENT',targetId,nativeTitle:target.title,originalDocumentAndEditorPreserved:true,measurement:'SEPARATE_CORRECTNESS_AFTER_STABLE_INDEX_TIMING'};
   if(nativePage!==page)await nativePage.close();
   }catch(error){
    report.projectCardNavigationFailure={mode:delegated?'NATIVE_CONTROL':'HREF_NEW_TAB_PRESERVE_CURRENT',targetId,facts:await hostScaleFailureFacts(nativePage)};
    report.projectCardNavigationFailure.budgets=await workspace.evaluate(async()=>{
     const info=(await indexedDB.databases()).find(row=>row.name==='vaiwl-b1-v1');if(!info)return [];
     const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(info.name,info.version);q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('diagnostic-refuses-upgrade'));};q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});
     try{return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readonly'),q=tx.objectStore('b23_views').openCursor(),rows=[];q.onsuccess=()=>{const c=q.result;if(!c)return;if(typeof c.key==='string'&&c.key.startsWith('host-read-budget:')){const p=c.value.payload;rows.push({requests:p.requests,startedAt:p.startedAt,lastAt:p.lastAt,ageMs:Date.now()-p.startedAt});}c.continue();};tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
    }).catch(error=>({unavailable:error.message}));throw error;
   }
  }
  assert.deepEqual(report.errors,[]);report.status='PARTIAL_SYS04_NOT_ACCEPTED';process.exitCode=2;
 }catch(error){if(error.memberProgressDiagnostic){report.nativeMemberProgressDiagnostic=error.memberProgressDiagnostic;if(cpuTraceEnabled)report.nativeMemberProgressClock={stage:error.memberProgressDiagnostic.stage,stageStartedEpochMs:performance.timeOrigin+error.memberProgressDiagnostic.stageStarted,observedWallTimeMs:Date.now(),observedEpochMs:performance.timeOrigin+performance.now(),interpretation:'ORIGINAL_RUNNER_STAGE_NOT_EXCLUSIVE_CPU_OR_IDB_TIME'};}const {hostScaleFailureProgress}=await import('./fixtures/host-scale-progress.mjs');report.nativeIndexProgress=await hostScaleFailureProgress(activePage,loadedExtensionId).catch(()=>({status:'DIAGNOSTIC_UNAVAILABLE',acceptance:'NOT_ESTABLISHED'}));report.status=!cpuProfileEnabled&&traceThroughReturn&&error.message==='diagnostic-progress-run-cannot-produce-scale-timing'?'DIAGNOSTIC_ONLY_RETURN_COMPLETE':traceEnabled&&error.message==='diagnostic-initial-ingestion-complete'?'DIAGNOSTIC_ONLY_INGESTION_COMPLETE':context?'FAIL':'NOT_RUN_BROWSER_OR_PACKAGE_STARTUP';report.error=error.stack;report.failure={phase:report.phase,rpcCount:report.rpc.length,rpcTail:report.rpc.slice(-16),facts:await hostScaleFailureFacts(activePage).catch(failure=>({captureError:failure.message}))};process.exitCode=1;}
 finally{
  if(cpuProfileEnabled){try{await Promise.allSettled(cpuProfiles.map(({profile})=>profile.finish()));await cpuProfilesFinished;}catch{report.cpuProfileCleanup={status:'UNAVAILABLE',reason:'profile-cleanup-failed'};}finally{if(!cpuProfilesFinished)closeCPUTransport();}}
  if(cpuProfileEnabled){report.acceptance='NOT_ESTABLISHED';report.measurement={status:'NOT_RUN_DIAGNOSTIC_WORKER_AND_NATIVE_PAGE_CPU',samples:null,acceptance:'NOT_ESTABLISHED'};}
  if(traceEnabled){report.workerTrace=await collectScaleWorkerTrace(context,loadedExtensionId).catch(()=>({status:'UNAVAILABLE'}));if(report.trace){const rows=[...report.trace.events,...(report.workerTrace.events??[]).map(row=>({...row,realmOrdinal:0}))].sort((a,b)=>a.at-b.at);report.trace.events=[];report.trace.bytes=0;for(const row of rows)appendScaleTrace(report.trace,row);}if(report.workerTrace.events)delete report.workerTrace.events;}
  const cleaned=await cleanupHostScaleRun({report,context,browserHandle,browserLaunchAttempted,networkGuard,server,directory,verify:async()=>{
  if(tracePackage){await verifyScaleTracePackage(tracePackage);assert.equal((await import('../../extension/package.mjs')).verifyHost(report.package.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');if(cpuTraceEnabled)report.instrumentedPackageUnchanged=true;}
  report.sourceChangedDuringRun=manifest?(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean):null;
  report.fixtureChangedDuringRun=(await Promise.all(Object.entries(report.fixtureSourceHashes).map(async([p,h])=>hash(await readFile(new URL(p,import.meta.url)))!==h))).some(Boolean);
  report.manifestChangedDuringRun=manifestPath?hash(await readFile(manifestPath))!==manifestHash:null;
  if(report.sourceChangedDuringRun||report.fixtureChangedDuringRun||report.manifestChangedDuringRun){report.status='SOURCE_CHANGED';process.exitCode=1;}
  }});if(!cleaned)process.exitCode=1;
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({status:report.status,error:report.error,report:output}));
}
