/** UI-11 single unforced observation and conditional recovery. Never proves idle causality. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {installJ4GrantObserver} from './j4-grant-observer.mjs';
import {assessIdleObservation,assessIdleRecovery,assessIdleScenario,IDLE_EVIDENCE_DEPENDENCIES,idleEvidenceCommit,validateIdleEvidence,finishIdleObservationDeadline} from './natural-worker-idle-oracle.mjs';
import {createHash} from 'node:crypto';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {nativeBrowserArgs,endpointFromActivePort} from './native-visibility-browser.mjs';
import {cleanupIsolatedBrowser,cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {packageHost} from '../../extension/package.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const runner=new URL(import.meta.url),runnerHash=hash(await readFile(runner));
const dependencyHashes=async()=>Object.fromEntries(await Promise.all(IDLE_EVIDENCE_DEPENDENCIES.map(async path=>[path,hash(await readFile(new URL(path,import.meta.url)))])));
const scenario=process.argv[3]??'draft-active',expectedDraft=scenario==='draft-active'?'NATURAL_IDLE_LOCAL_DRAFT':'';
const report={scenario,observationCompleted:false,requirement:'UI-11',evidence:'S_ISOLATED_UNFORCED_WORKER_OBSERVATION_CONDITIONAL_RECOVERY',profile:'LEGACY_OFFLINE',realChatGPT:'NOT_RUN',naturalWorkerSleep:'NOT_ESTABLISHED',status:'NOT_RUN',windowMs:60000,forcedWorkerStop:false,workerDebuggerAttached:false,productionTimersModified:false,pageFrozen:false,observationCount:1,results:[]};
let server,guard,child,socket,profileDir,seq=0,ready=false;const pending=new Map(),events=[];let eventOverflow=false;const bootstrapLogs=[];
function command(method,params={},sessionId){
 if(!ready)return Promise.reject(Error('CDP-not-ready'));
 const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP-command-deadline:'+method));},6000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});
}
const evaluate=async(sessionId,expression)=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error('page-evaluation-failed');return r.result.value;};
async function poll(read,label,ms=15000){const deadline=performance.now()+ms;while(performance.now()<deadline){const value=await read();if(value&&performance.now()<deadline)return value;await sleep(50);}throw Error('probe-timeout:'+label);}
const nativeExpression=`({editorFocused:document.activeElement===idleOriginal.editor,interactiveFocused:!!document.activeElement?.closest?.('input,textarea,select,button,[contenteditable],[role=\"textbox\"]'),openModalCount:document.querySelectorAll('dialog[open],[aria-modal=\"true\"]').length,fileCount:document.querySelector('main > form#composer input[type=file]')?.files?.length,editorCount:document.querySelectorAll('main > form#composer textarea,main > form#composer [contenteditable]').length,activeRiskCount:document.querySelectorAll('main [data-native-upload=active],main [data-native-generation=active],main [data-native-voice=active],main [data-native-canvas=active]').length,sameDocument:document===idleOriginal.document,sameEditor:document.querySelector('textarea')===idleOriginal.editor,editorConnected:idleOriginal.editor.isConnected,editorEnabled:!idleOriginal.editor.disabled&&!idleOriginal.editor.readOnly,draft:idleOriginal.editor.value,originalFramesConnected:idleOriginal.frames.map(f=>f.isConnected),open:document.querySelectorAll('[data-va-owned]:popover-open').length,returnCount:document.querySelectorAll('[aria-label="返回工作空间"]').length})`;
async function discoverFrames(prefix,excluded=[]){
 const targets=(await command('Target.getTargets')).targetInfos;
 const rows=['workspace','sidebar'].map(role=>{const matches=targets.filter(t=>t.type==='iframe'&&t.url===prefix+role+'.html'&&!excluded.includes(t.targetId));assert(matches.length<=1,'duplicate exact UI frame');return matches[0]?{role,...matches[0]}:null;});
 return rows.every(Boolean)?rows:null;
}
async function observeFrames(frames){
 return Promise.all(frames.map(async frame=>{
  assert.equal(frame.type,'iframe','passive observer never attaches a worker');
  const {sessionId}=await command('Target.attachToTarget',{targetId:frame.targetId,flatten:true});
  await evaluate(sessionId,`if(!globalThis.idleObserverInstalled){(${installJ4GrantObserver.toString()})();globalThis.idleObserverInstalled=true;}true`);
  return {...frame,sessionId};
 }));
}
async function frameEvidence(frame,after=0){
 return poll(async()=>{
  const raw=await evaluate(frame.sessionId,'({freshness:globalThis.j4Freshness,scope:globalThis.j4LastScope,currentRef:globalThis.j4LastCurrentRef,now:Date.now()})'),f=raw?.freshness;
  if(!f?.grantId||f.viewGrantId!==f.grantId||!raw.scope||!(f.expiresAt>raw.now)||!(f.viewRequestedAt>=after)||!(f.viewRequestedAt>=f.grantReceivedAt))return null;
  return {role:frame.role,targetId:frame.targetId,grantDigest:hash(f.grantId),viewGrantDigest:hash(f.viewGrantId),grantRequestedAt:f.grantRequestedAt,grantReceivedAt:f.grantReceivedAt,viewRequestedAt:f.viewRequestedAt,viewReceivedAt:f.viewReceivedAt,expiresAt:f.expiresAt,scope:raw.scope,currentRef:raw.currentRef??null};
 },'actual-current-grant-and-VIEW-'+frame.role,30000);
}
async function detachFrames(frames){for(const frame of frames)await command('Target.detachFromTarget',{sessionId:frame.sessionId});}
async function nativeClick(sessionId,selector){
 const point=await evaluate(sessionId,`(()=>{const all=[...document.querySelectorAll(${JSON.stringify(selector)})];if(all.length!==1)return null;const node=all[0],r=node.getBoundingClientRect();if(r.width<=0||r.height<=0)return null;const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return hit&&(hit===node||node.contains(hit))?{x,y}:null;})()`);
 assert(point,'one visible native target must receive genuine browser input');
 const at=Date.now();await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);return at;
}
const nativeReturn=sessionId=>nativeClick(sessionId,'[aria-label="返回工作空间"]');
async function clearNativeEditor(sessionId){
 const modifiers=process.platform==='darwin'?4:2;
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers},sessionId);
 await command('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers},sessionId);
 for(const type of ['keyDown','keyUp'])await command('Input.dispatchKeyEvent',{type,key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);
}
try{
 report.sourceCommit=idleEvidenceCommit(process.env);report.sourceCommitStatus=report.sourceCommit?'BOUND':'NOT_PROVIDED';
 report.evidenceDependencyHashes=await dependencyHashes();
 assert(['draft-active','safe-empty-reading'].includes(scenario),'invalid-idle-scenario');
 server=await createHostFixtureServer();guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});const dir=await mkdtemp(join(tmpdir(),'vaiwl-natural-idle-'));profileDir=join(dir,'profile');await mkdir(profileDir);
 const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=hash(manifestBytes);report.runnerHash=runnerHash;report.package=built;report.fixture=server.manifest;
 child=spawn(process.env.FREE_CHROME_EXECUTABLE??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),nativeBrowserArgs(profileDir,{headed:false,historicalNetworkGuard:guard.config}),{stdio:['ignore','ignore','pipe']});let launchError,launchStderr='';child.on('error',e=>{launchError=e;});child.stderr.on('data',value=>{launchStderr=(launchStderr+value.toString()).slice(-4000);report.browserLaunchStderr=launchStderr;});
 const endpoint=await poll(async()=>{if(launchError)throw launchError;if(child.exitCode!==null)throw Error('chrome-exited:'+child.exitCode+':'+launchStderr);try{return endpointFromActivePort(await readFile(join(profileDir,'DevToolsActivePort'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return null;}},'browser');
 socket=new WebSocket(endpoint);socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const q=pending.get(m.id);if(q){pending.delete(m.id);clearTimeout(q.timer);if(m.error)q.reject(Error(m.error.message));else q.resolve(m.result);}}else if(m.method==='Log.entryAdded'||m.method==='Runtime.exceptionThrown'){if(bootstrapLogs.length<16)bootstrapLogs.push({sessionId:m.sessionId,method:m.method,level:m.params?.entry?.level??null,text:String(m.params?.entry?.text??m.params?.exceptionDetails?.text??'').slice(0,400),exception:String(m.params?.exceptionDetails?.exception?.description??'').slice(0,800),url:String(m.params?.entry?.url??m.params?.exceptionDetails?.url??'').slice(0,240)});}else if(m.method?.startsWith('Target.')){if(events.length<512)events.push({at:performance.now(),method:m.method,params:m.params});else eventOverflow=true;}});
 socket.addEventListener('close',()=>{ready=false;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('CDP-closed'));}pending.clear();});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP-connect-deadline')),6000);socket.addEventListener('open',()=>{clearTimeout(timer);ready=true;resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP-connect-error'));},{once:true});});
 report.browser=await command('Browser.getVersion');await command('Target.setDiscoverTargets',{discover:true});const {id}=await command('Extensions.loadUnpacked',{path:built.unpacked}),prefix='chrome-extension://'+id+'/';report.extensionId=id;
 const worker=await poll(async()=>{const matches=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='service_worker'&&t.url===prefix+'extension/worker.mjs');assert(matches.length<=1);return matches[0];},'exact-worker');assert.equal(worker.attached,false);report.initialWorker={targetId:worker.targetId,attached:worker.attached};
 // Activate the new native tab before fixture navigation. Attaching a debugger
 // does not itself make a headless target visible; hidden discovery is deferred.
 const {targetId}=await command('Target.createTarget',{url:'about:blank',background:false});let {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 await command('Target.activateTarget',{targetId});await command('Page.bringToFront',{},sessionId);
 const bootstrapFacts=()=>evaluate(sessionId,`({url:location.href,readyState:document.readyState,visibility:document.visibilityState,focused:document.hasFocus(),state:document.documentElement.dataset.vaiwlState??null,reason:document.documentElement.dataset.vaiwlReason??null,open:document.querySelectorAll('[data-va-owned]:popover-open').length,owned:document.querySelectorAll('[data-va-owned]').length,frames:[...document.querySelectorAll('[data-va-owned] iframe')].map(f=>({src:f.src,connected:f.isConnected})),editorCount:document.querySelectorAll('#prompt-textarea').length,readingCount:document.querySelectorAll('#reading').length})`);
 const bootstrapDeadline=performance.now()+15000;
 try{
  const navigation=await command('Page.navigate',{url:server.url},sessionId);assert(!navigation.errorText,'fixture-navigation-failed:'+navigation.errorText);
  await poll(async()=>{report.bootstrap=await bootstrapFacts();return report.bootstrap.url===server.url&&report.bootstrap.readyState==='complete'&&report.bootstrap.visibility==='visible';},'visible-native-fixture',Math.max(1,bootstrapDeadline-performance.now()));
  await poll(async()=>{report.bootstrap=await bootstrapFacts();return report.bootstrap.open===2;},'dual-surfaces',Math.max(1,bootstrapDeadline-performance.now()));
 }catch(error){
  try{report.bootstrap=await bootstrapFacts();}catch(diagnosticError){report.bootstrapDiagnosticError=String(diagnosticError);}
  // This diagnostic branch cannot produce an accepted idle observation. Attach
  // exact UI iframe targets only after bootstrap failure; never attach a worker.
  report.bootstrapFrames=[];
  try{
   const frames=await discoverFrames(prefix);
   for(const frame of frames??[]){
    const row={role:frame.role,targetId:frame.targetId,type:frame.type};report.bootstrapFrames.push(row);let diagnosticSession;
    try{
     assert.equal(frame.type,'iframe');({sessionId:diagnosticSession}=await command('Target.attachToTarget',{targetId:frame.targetId,flatten:true}));
     await command('Runtime.enable',{},diagnosticSession);await command('Log.enable',{},diagnosticSession);
     row.frameTree=await command('Page.getFrameTree',{},diagnosticSession);
     row.document=await evaluate(diagnosticSession,`({url:location.href,readyState:document.readyState,visibility:document.visibilityState,runtimePresent:typeof chrome?.runtime?.sendMessage==='function',mainChildren:document.querySelector('main')?.childNodes.length??null,scripts:[...document.scripts].map(s=>({src:s.src,type:s.type})),resources:performance.getEntriesByType('resource').slice(-32).map(r=>({name:r.name,initiator:r.initiatorType,duration:r.duration,responseStatus:r.responseStatus??null}))})`);
    }catch(diagnosticError){row.error=String(diagnosticError);}finally{if(diagnosticSession)try{await command('Target.detachFromTarget',{sessionId:diagnosticSession});}catch(detachError){row.detachError=String(detachError);}}
   }
  }catch(diagnosticError){report.bootstrapFrameDiagnosticError=String(diagnosticError);}
  report.bootstrapFrameLogs=bootstrapLogs;report.bootstrapDiagnosticOnly=true;
  report.bootstrapFixtureRequests=server.snapshot().requests;report.bootstrapFixtureActions=server.snapshot().actions;throw error;
 }
 report.initialSurfaces=await evaluate(sessionId,"({open:document.querySelectorAll('[data-va-owned]:popover-open').length,frames:[...document.querySelectorAll('[data-va-owned] iframe')].map(n=>n.src)})");assert.equal(report.initialSurfaces.frames.length,2);
 const initialFrameSessions=await observeFrames(await poll(()=>discoverFrames(prefix),'initial-exact-UI-frames'));
 report.initialFrames=await Promise.all(initialFrameSessions.map(frame=>frameEvidence(frame)));await detachFrames(initialFrameSessions);
 report.passiveObserver='FRAME_RPC_RESPONSES_ONLY_NO_REQUESTS_OR_WORKER_ATTACHMENT';
 report.externalRejected=await evaluate(sessionId,"fetch('https://example.com/').then(()=>false,()=>true)");assert(report.externalRejected);assert(guard.snapshot().denied>0);
 await evaluate(sessionId,"globalThis.idleOriginal={document,editor:document.querySelector('textarea'),frames:[...document.querySelectorAll('[data-va-owned] iframe')]};true");
 if(scenario==='draft-active'){
  await evaluate(sessionId,'idleOriginal.editor.focus();true');await command('Input.insertText',{text:expectedDraft},sessionId);
 }else{
  await nativeClick(sessionId,'#prompt-textarea');await command('Input.insertText',{text:'NATURAL_IDLE_CLEAR_ME'},sessionId);await clearNativeEditor(sessionId);
  await poll(()=>evaluate(sessionId,"idleOriginal.editor.value===''") ,'native-editor-cleared');
 }
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===0"),'native-reading');
 if(scenario==='safe-empty-reading')await nativeClick(sessionId,'#reading > p');
 report.precondition=assessIdleScenario(scenario,await evaluate(sessionId,nativeExpression));
 await command('Target.detachFromTarget',{sessionId});sessionId=null;
 const initialTargets=(await command('Target.getTargets')).targetInfos.filter(t=>t.url.startsWith(prefix));
 assert(initialTargets.some(t=>t.targetId===worker.targetId),'original worker must exist at window start');
 for(const t of initialTargets)assert.equal(t.attached,false);
 report.initialExtensionTargets=initialTargets;
 const started=performance.now(),startEvent=events.length;
 report.observationTiming={startedMonotonicMs:started,startedWallTime:Date.now(),deadlineMonotonicMs:started+report.windowMs};
 // Discovery events only during this window: no target polling, debugger or page commands.
 await sleep(report.windowMs);
 report.observationTiming.firstWakeMonotonicMs=performance.now();report.observationTiming.firstWakeElapsedMs=report.observationTiming.firstWakeMonotonicMs-started;
 const ended=await finishIdleObservationDeadline(started,report.windowMs,{now:()=>performance.now(),sleep});
 const elapsedMs=ended-started,windowEvents=events.slice(startEvent);
 Object.assign(report.observationTiming,{endedMonotonicMs:ended,endedWallTime:Date.now(),elapsedMs});
 // Persist raw duration and event evidence before the independent oracle can fail.
 report.observation={elapsedMs,validation:'PENDING',hostSessionDetached:true,targetEvents:windowEvents.map(e=>({at:e.at-started,method:e.method,targetId:e.params.targetId??e.params.targetInfo?.targetId,type:e.params.targetInfo?.type??null}))};
 assert.equal(eventOverflow,false,'bounded event log overflow invalidates observation');
 assert(!windowEvents.some(e=>e.params.targetInfo?.url?.startsWith(prefix)&&e.params.targetInfo.attached),'extension target attached during observation');
 const observation=assessIdleObservation({windowMs:report.windowMs,elapsedMs,initialWorkerId:worker.targetId,prefix,initialTargets,events:windowEvents.map(e=>({...e,at:e.at-started})),eventOverflow,hostSessionDetached:true,forcedWorkerStop:report.forcedWorkerStop,workerDebuggerAttached:report.workerDebuggerAttached,productionTimersModified:report.productionTimersModified,pageFrozen:report.pageFrozen});
 report.observation={...report.observation,...observation,validation:'VALID'};report.observationCompleted=true;
 ({sessionId}=await command('Target.attachToTarget',{targetId,flatten:true}));report.native=await evaluate(sessionId,nativeExpression);assert.equal(report.native.sameDocument,true);assert.equal(report.native.sameEditor,true);assert.equal(report.native.draft,expectedDraft);assert.equal(report.native.open,0);assert.equal(report.native.returnCount,1);
 report.status=observation.status;report.naturalWorkerSleep=observation.naturalWorkerSleep;process.exitCode=2;
 if(observation.initialWorkerDestroyed){
  // Only real lifecycle recovery and browser input: no synthetic runtime request,
  // no worker debugger, forced stop, reloading, timer suppression or retry window.
  let observed,privateFramesCleared;
  if(scenario==='safe-empty-reading'){
   observed=await observeFrames(await poll(()=>discoverFrames(prefix),'dormant-UI-frames'));
   privateFramesCleared=Object.fromEntries(await Promise.all(observed.map(async frame=>[frame.role,await evaluate(frame.sessionId,"document.querySelector('main')?.childNodes.length===0")])));
   assert.deepEqual(privateFramesCleared,{workspace:true,sidebar:true});report.privateFramesCleared=privateFramesCleared;
  }
  const reentryAt=await nativeReturn(sessionId);
  if(!observed)observed=await observeFrames(await poll(()=>discoverFrames(prefix,report.initialFrames.map(f=>f.targetId)),'replacement-UI-frames',30000));
  await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===2"),'native-return-opens-dual-surfaces');
  report.recoveredFrames=await Promise.all(observed.map(frame=>frameEvidence(frame,reentryAt)));
  const newWorker=await poll(async()=>{const matches=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='service_worker'&&t.url===prefix+'extension/worker.mjs');assert(matches.length<=1);return matches[0]?.targetId!==worker.targetId?matches[0]:null;},'replacement-worker');
  report.nativeAfterRecovery=await evaluate(sessionId,nativeExpression);
  report.recovery=assessIdleRecovery({scenario,privateFramesCleared,observation,initialWorkerId:worker.targetId,newWorker,prefix,initialFrames:report.initialFrames,recoveredFrames:report.recoveredFrames,reentryAt,checkedAt:Date.now(),native:report.nativeAfterRecovery});
  report.recovery.newWorkerId=newWorker.targetId;report.recovery.reentryAt=reentryAt;report.status=report.recovery.status;report.results.push({name:'unforced-target-destruction-fresh-grant-actual-view-native-draft-preserved',status:'PASS'});process.exitCode=0;await detachFrames(observed);
  if(scenario==='safe-empty-reading'){await nativeClick(sessionId,'#prompt-textarea');await command('Input.insertText',{text:'NATURAL_IDLE_RECOVERED_INPUT'},sessionId);report.nativeUsabilityAfterRecovery=await evaluate(sessionId,nativeExpression);assert.equal(report.nativeUsabilityAfterRecovery.sameEditor,true);assert.equal(report.nativeUsabilityAfterRecovery.sameDocument,true);assert.equal(report.nativeUsabilityAfterRecovery.draft,'NATURAL_IDLE_RECOVERED_INPUT');assert.equal(report.nativeUsabilityAfterRecovery.editorFocused,true);}
 }
 report.nativeActions=server.snapshot().actions;assert.deepEqual(report.nativeActions,{});
 report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;assert.equal(report.sourceChangedDuringRun,false);assert.equal(report.buildManifestUnchanged,true);
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 report.networkGuard=guard?.snapshot();
 const cleaned=await cleanupOwnedResources(report,[['socket',async()=>{if(socket){socket.close();ready=false;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('probe-cleanup'));}pending.clear();}}],['browser',async()=>{if(child)await cleanupIsolatedBrowser({child,profileDir});}],['server',()=>server?.close()],['networkGuard',()=>guard?.close()]]);
 if(cleaned===false)process.exitCode=1;
 try{
  report.evidenceDependencyHashesAfter=await dependencyHashes();
  const profileRemoved=!profileDir||await access(profileDir).then(()=>false,error=>{if(error.code==='ENOENT')return true;throw error;});
  report.cleanup={completed:cleaned===true,errors:report.cleanupErrors??[],pendingCommands:pending.size,browserStopped:!child||!child.pid||child.exitCode!==null||child.signalCode!=null,networkGuardClosed:!guard||guard.snapshot().closed===true,profileRemoved};
  report.evidenceBinding=validateIdleEvidence({before:report.evidenceDependencyHashes,after:report.evidenceDependencyHashesAfter,sourceCommit:report.sourceCommit,cleanup:report.cleanup});
 }catch(error){report.statusBeforeEvidenceCheck=report.status;report.status='FAIL_EVIDENCE';report.evidenceBindingError=error.stack;process.exitCode=1;}
 report.runnerChangedDuringRun=hash(await readFile(runner))!==runnerHash;if(report.runnerChangedDuringRun){report.status='FAIL';process.exitCode=1;}await writeFile(process.argv[2]??join(tmpdir(),'natural-worker-idle-probe.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({scenario:report.scenario,status:report.status,naturalWorkerSleep:report.naturalWorkerSleep,observation:report.observation,native:report.native,error:report.error}));
