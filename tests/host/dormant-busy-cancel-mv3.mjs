import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import {createPreparedDormancyProbe} from './prepared-dormancy-probe.mjs';
/** Instrumented MV3 close/wake probe. Test-only isolated session handle; no worker debugger or timer override. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {nativeBrowserArgs,endpointFromActivePort} from './native-visibility-browser.mjs';
import {cleanupIsolatedBrowser,cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {packageHost} from '../../extension/package.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const partialJoin=process.env.FREE_BUSY_PARTIAL_JOIN==='1',idleDiagnostics=process.env.FREE_BUSY_IDLE_DIAGNOSTICS==='1';
const runStarted=performance.now();
const runner=new URL(import.meta.url),runnerHash=hash(await readFile(runner));
const report={requirement:'UI-11',evidence:'S_INSTRUMENTED_MV3_REAL_HTTP_BUSY_CANCEL',profile:'LEGACY_OFFLINE',realChatGPT:'NOT_RUN',naturalWorkerSleep:'NOT_ESTABLISHED',status:'NOT_RUN',partialJoin,idleDiagnostics,forcedWorkerStop:false,workerDebuggerAttached:false,productionTimersModified:false,results:[]};
let server,guard,child,socket,profileDir,seq=0,ready=false;const pending=new Map(),events=[],contexts=[];let eventOverflow=false,primaryDiagnostics=null;
function command(method,params={},sessionId,timeoutMs=6000){
 if(!ready)return Promise.reject(Error('CDP-not-ready'));
 const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP-command-deadline:'+method));},timeoutMs);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});
}
const evaluate=async(sessionId,expression,contextId,timeoutMs=6000)=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId?{contextId}:{})},sessionId,timeoutMs);if(r.exceptionDetails)throw Error('page-evaluation-failed');return r.result.value;};
async function poll(read,label,ms=15000){const deadline=performance.now()+ms;while(performance.now()<deadline){const value=await read();if(value&&performance.now()<deadline)return value;await sleep(50);}throw Error('probe-timeout:'+label);}
try{
 server=await createHostFixtureServer({journey:'J3'});guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});const dir=await mkdtemp('/private/tmp/vaiwl-busy-cancel-');profileDir=join(dir,'profile');await mkdir(profileDir);
 const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineFirstSend:true}),manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=hash(manifestBytes);report.runnerHash=runnerHash;report.package=built;report.fixture=server.manifest;
 // Test-only runtime reply gate; actual worker requests and guards stay untouched.
 const entryPath=join(built.unpacked,'extension/content-entry.mjs'),entry=await readFile(entryPath,'utf8'),anchor=' void session.start();';
 const runtimeAnchor='const session=createHostContentSession({document,runtime:chrome.runtime,origin:HOST_CONFIG.origin';assert.equal(entry.split(runtimeAnchor).length,2);assert.equal(entry.split(anchor).length,2);
 const probeCode=`const busyProbe={armed:false,gated:false,released:false,log:[],release:null,confirmFault:false};
 const runtimeProbe=new Proxy(chrome.runtime,{get(target,key){if(key==='sendMessage')return async message=>{const result=await chrome.runtime.sendMessage(message);if(['HOST_HELLO','HOST_UI_CONFIRM','HOST_UI_IDLE_CHECK','HOST_UI_IDLE_RELEASE','HOST_DOCUMENT_RENEW','HOST_REFRESH'].includes(message.type))busyProbe.log.push({type:message.type,ok:result?.ok===true,state:result?.state??null,reason:result?.reason??null,producer:message.producerToken??result?.binding?.producerToken??null,role:message.role??null,grant:result?.grant?.id??null,...result?.fixtureIdleDiagnostic?{fixtureIdleDiagnostic:result.fixtureIdleDiagnostic}:{}});if(${partialJoin}&&message.type==='HOST_UI_CONFIRM'&&message.role==='sidebar'&&busyProbe.released&&!busyProbe.confirmFault){busyProbe.confirmFault=true;return {ok:false,reason:'fixture-parent-confirm-loss'};}if(message.type==='HOST_UI_IDLE_CHECK'&&result?.ok===true&&busyProbe.armed){busyProbe.armed=false;busyProbe.gated=true;await new Promise(resolve=>busyProbe.release=()=>{busyProbe.released=true;resolve();});}return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 `;
 const instrumented=entry.replace(' const session=createHostContentSession(',probeCode+' const session=createHostContentSession(').replace(runtimeAnchor,'const session=createHostContentSession({document,runtime:runtimeProbe,origin:HOST_CONFIG.origin').replace(anchor,' globalThis.__vaiwlIdleProbeSession=Object.freeze({prepareIdle:()=>!!session.prepareIdle(),workerIdle:async()=>busyProbe.lastIdle=await runtimeProbe.sendMessage({v:1,type:"FIXTURE_WORKER_IDLE"}),attempt:('+createPreparedDormancyProbe.toString()+')(session),arm:()=>{busyProbe.armed=true;},release:()=>busyProbe.release?.(),snapshot:()=>({lastIdle:busyProbe.lastIdle??null,gated:busyProbe.gated,released:busyProbe.released,confirmFault:busyProbe.confirmFault,log:busyProbe.log.slice()})});\n'+anchor);
 await writeFile(entryPath,instrumented);report.instrumentation={path:'extension/content-entry.mjs',before:hash(entry),after:hash(instrumented),patch:'Expose existing one-shot prepared close and hold one successful real preflight reply; record actual RPC results. No forged worker work, idle guards or timer replacement',originalArchiveIsInstrumented:false,productionAutomaticEntry:false};
 // Optional synthetic-profile diagnostics. Preserve the guard expression and
 // evaluate it exactly once; collect only counts/owner-idle booleans on refusal.
 const diagnosticHashes={};
 if(idleDiagnostics){
  const patches=[['src/runtime/host-binding-service.mjs',
   'return Object.freeze({isIdle,oldSendTerminal',
   'return Object.freeze({fixtureIdleSnapshot:()=>({requests:activity.requests,background:activity.background,refreshes:refreshAttempts.size,owners:Object.fromEntries(Object.entries({authority,contextRecovery,continuations,observations,ingestionPasses,currentMetadata,sendCandidates,firstSend,oldSendTerminal,backup,recovery,views,ui}).map(([name,owner])=>[name,owner===null||owner.isIdle?.()===true])),views:views?.fixtureIdleSnapshot?.(),ui:ui?.fixtureIdleSnapshot?.()}),isIdle,oldSendTerminal'],
   ['src/runtime/host-view-service.mjs',
   'return Object.freeze({isIdle,handle,resume',
   'return Object.freeze({fixtureIdleSnapshot:()=>({stopped,scopeWork,refreshes,reads,entries:[...views.values()].map(entry=>({pending:!!entry.pending,autoReading:!!entry.autoReading,retry:entry.retryTimer!=null,defer:entry.deferPreparation!=null}))}),isIdle,handle,resume'],
   ['src/runtime/host-ui-owner.mjs',
   'return Object.freeze({isIdle:()=>activeWork',
   'return Object.freeze({fixtureIdleSnapshot:()=>({activeWork,inFlight:inFlight.size,pending:pending.size}),isIdle:()=>activeWork'],
   ['src/runtime/host-binding-service.mjs',
   'return quiet()&&ownersIdle(true)&&quiet();',
   `const allowed=quiet()&&ownersIdle(true)&&quiet();globalThis.__vaiwlFixtureIdle=allowed?null:{requests:activity.requests,background:activity.background,refreshes:refreshAttempts.size,owners:Object.fromEntries(Object.entries({authority,contextRecovery,continuations,observations,ingestionPasses,currentMetadata,sendCandidates,firstSend,oldSendTerminal,backup,recovery,views}).map(([name,owner])=>[name,owner===null||owner.isIdle?.()===true]))};return allowed;`],
   ['src/runtime/host-ui-owner.mjs',
   "if(!quiet()||releaseGuard()!==true||!quiet())return {ok:false,reason:'ui-release-busy'};check();",
   "globalThis.__vaiwlFixtureIdle=null;if(!quiet()||releaseGuard()!==true||!quiet())return {ok:false,reason:'ui-release-busy',fixtureIdleDiagnostic:{ui:{activeWork,inFlight:inFlight.size,pending:pending.size},binding:globalThis.__vaiwlFixtureIdle}};check();"]];
  for(const [path,from,to]of patches){const target=join(built.unpacked,path),original=await readFile(target,'utf8');assert.equal(original.split(from).length,2);const patched=original.replace(from,to);await writeFile(target,patched);diagnosticHashes[path]=hash(patched);}
  report.instrumentation.idleDiagnostics='Only counts and owner booleans on real busy rejection; original guard expression and result unchanged, no worker debugger, no idle override';
 }
 // Frame-created and parent-confirmed are not read-complete. Observe queued
 // resume writes and real frame RPCs too, without cancelling or flushing them.
 const frameClientPath='src/host/free-frame-client.mjs',frameClientFile=join(built.unpacked,frameClientPath),frameClientSource=await readFile(frameClientFile,'utf8');
 const frameAnchor="return Object.freeze({start:()=>lifecycle.start(),stop:()=>lifecycle.stop('frame-view-stopped')});";assert.equal(frameClientSource.split(frameAnchor).length,2);
 const framePatched=frameClientSource.replace(frameAnchor,"return Object.freeze({fixturePrepared:()=>!closed&&grantCurrent()&&!activeRead&&!bootstrapping&&resumeTimer===null&&!resumeWriting&&!resumeQueued&&!dispatchPending&&!queuedDispatchView&&!calibrationPending&&!horizonPending&&(!dirty||!backgroundRefreshAllowed()),start:()=>lifecycle.start(),stop:()=>lifecycle.stop('frame-view-stopped')});");await writeFile(frameClientFile,framePatched);diagnosticHashes[frameClientPath]=hash(framePatched);
 for(const role of ['workspace','sidebar']){
  const path='extension/'+role+'.mjs',file=join(built.unpacked,path),source=await readFile(file,'utf8');assert.equal(source.split('document,runtime:chrome.runtime,role:').length,2);
  const patch='let fixturePending=0,fixtureState=null;const fixtureRuntime=new Proxy(chrome.runtime,{get(target,key){if(key==="sendMessage")return async message=>{fixturePending++;try{return await chrome.runtime.sendMessage(message);}finally{fixturePending--;}};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});\n';
  const result=source.replace('const client=',patch+'const client=').replace('document,runtime:chrome.runtime,role:','document,runtime:fixtureRuntime,onState:value=>fixtureState=value.state,role:')+'\nglobalThis.__vaiwlFixtureFrameReady=()=>fixtureState==="ready"&&fixturePending===0&&client.fixturePrepared();\n'+(partialJoin&&role==='sidebar'?'globalThis.__vaiwlFixtureStop=()=>client.stop();\n':'');
  await writeFile(file,result);diagnosticHashes[path]=hash(result);
 }
 if(partialJoin)report.instrumentation.partialFault='Discard one real parent CONFIRM reply after busy cancellation; stop the actual sidebar client after worker work drains. No grants or successful release forged.';
 // Test-only synchronous readiness snapshot: not a close request or permit.
 // It observes the actual service without attaching a debugger or adding work.
 const runtimePath='src/runtime/host-worker-runtime.mjs',runtimeFile=join(built.unpacked,runtimePath),runtimeOriginal=await readFile(runtimeFile,'utf8');
 const messageAnchor='const message=(value,sender,reply)=>{if(!active)return;';assert.equal(runtimeOriginal.split(messageAnchor).length,2);
 const runtimeInstrumented=runtimeOriginal.replace(messageAnchor,messageAnchor+"if(value?.type==='FIXTURE_WORKER_IDLE'&&sender.id===chrome.runtime.id){reply({idle:service.isIdle()===true,diagnostic:service.fixtureIdleSnapshot?.()??null});return;}");await writeFile(runtimeFile,runtimeInstrumented);diagnosticHashes[runtimePath]=hash(runtimeInstrumented);
 const compiled=compileClassicWorker(built.unpacked);await writeFile(join(built.unpacked,'extension/classic-runtime.js'),compiled.runtime);diagnosticHashes['extension/classic-runtime.js']=hash(compiled.runtime);assert.equal(hash(compiled.entry),manifest.files['extension/worker.mjs']);
 report.instrumentation.modifiedHashes=diagnosticHashes;
 report.instrumentation.workerReadiness='Test-only isIdle snapshot before unique close and before partial frame stop; does not close, authorize, pause work, or override final atomic release';
 const changed=[];for(const [path,expected] of Object.entries(manifest.files))if(hash(await readFile(join(built.unpacked,path)))!==expected)changed.push(path);
 assert.deepEqual(changed.sort(),['extension/content-entry.mjs',...Object.keys(diagnosticHashes)].sort());report.loadedPackageChanges=changed;
 child=spawn(process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',nativeBrowserArgs(profileDir,{headed:false,historicalNetworkGuard:guard.config}),{stdio:['ignore','ignore','pipe']});let launchError;child.on('error',e=>{launchError=e;});child.stderr.on('data',value=>{report.browserStderr=((report.browserStderr??'')+value.toString()).slice(-4000);});
 const endpoint=await poll(async()=>{if(launchError)throw launchError;if(child.exitCode!==null)throw Error('chrome-exited');try{return endpointFromActivePort(await readFile(join(profileDir,'DevToolsActivePort'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return null;}},'browser');
 socket=new WebSocket(endpoint);socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const q=pending.get(m.id);if(q){pending.delete(m.id);clearTimeout(q.timer);if(m.error)q.reject(Error(m.error.message));else q.resolve(m.result);}}else if(m.method==='Runtime.executionContextCreated'){contexts.push({sessionId:m.sessionId,...m.params.context});}else if(m.method?.startsWith('Target.')){if(events.length<512)events.push({at:performance.now(),method:m.method,params:m.params});else eventOverflow=true;}});
 socket.addEventListener('close',()=>{ready=false;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('CDP-closed'));}pending.clear();});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP-connect-deadline')),6000);socket.addEventListener('open',()=>{clearTimeout(timer);ready=true;resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP-connect-error'));},{once:true});});
 report.browser=await command('Browser.getVersion');await command('Target.setDiscoverTargets',{discover:true});const {id}=await command('Extensions.loadUnpacked',{path:built.unpacked}),prefix='chrome-extension://'+id+'/';report.extensionId=id;
 const worker=await poll(async()=>{const matches=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='service_worker'&&t.url===prefix+'extension/worker.mjs');assert(matches.length<=1);return matches[0];},'exact-worker');assert.equal(worker.attached,false);report.initialWorker={targetId:worker.targetId,attached:worker.attached};
 const {targetId}=await command('Target.createTarget',{url:server.url});let {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});const topFrameId=(await command('Page.getFrameTree',{},sessionId)).frameTree.frame.id;await command('Runtime.enable',{},sessionId);
 // Native focus can legitimately start in reading mode. Explicitly enter the
 // workspace with a trusted click instead of requiring automatic takeover.
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===2||document.querySelectorAll('[aria-label=\"返回工作空间\"]').length===1"),'initial-authorized-presentation');
 const initialOpen=await evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length");report.initialPresentation=initialOpen===2?'workspace':'native-reading';
 if(initialOpen!==2){const point=await evaluate(sessionId,"(()=>{const r=document.querySelector('[aria-label=\"返回工作空间\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);}
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===2"),'dual-surfaces-after-user-entry');
 report.initialSurfaces=await evaluate(sessionId,"({open:document.querySelectorAll('[data-va-owned]:popover-open').length,frames:[...document.querySelectorAll('[data-va-owned] iframe')].map(n=>n.src)})");assert.equal(report.initialSurfaces.frames.length,2);
 report.externalRejected=await evaluate(sessionId,"fetch('https://example.com/').then(()=>false,()=>true)");assert(report.externalRejected);assert(guard.snapshot().denied>0);
 await evaluate(sessionId,"globalThis.idleOriginal={document,editor:document.querySelector('textarea'),frames:[...document.querySelectorAll('[data-va-owned] iframe')]};idleOriginal.editor.focus();true");await command('Input.insertText',{text:'NATURAL_IDLE_LOCAL_DRAFT'},sessionId);
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===0"),'native-reading');const isolated=await poll(async()=>{const matches=[];for(const c of contexts.filter(c=>c.sessionId===sessionId&&c.auxData?.isDefault===false&&c.auxData.frameId===topFrameId)){try{if(await evaluate(sessionId,`window===window.top&&chrome.runtime.id===${JSON.stringify(id)}&&typeof globalThis.__vaiwlIdleProbeSession==='object'`,c.id))matches.push(c);}catch{}}assert(matches.length<=1);return matches[0]??null;},'isolated-session');
 assert.equal(await evaluate(sessionId,"typeof globalThis.__vaiwlIdleProbeSession"),'undefined');
 primaryDiagnostics=()=>evaluate(sessionId,"({closeDone:globalThis.busyCloseDone??null,closeResult:globalThis.busyCloseResult??null,prepared:__vaiwlIdleProbeSession.prepareIdle(),rpc:__vaiwlIdleProbeSession.snapshot()})",isolated.id);
 await poll(()=>evaluate(sessionId,"!!__vaiwlIdleProbeSession.prepareIdle()",isolated.id),'content-ready-to-close');
 // Prewarm a second authorized home tab before the first close budget starts.
 const second=await command('Target.createTarget',{url:server.url,background:true});report.busyTarget=second.targetId;
 const secondSession=await command('Target.attachToTarget',{targetId:second.targetId,flatten:true});await command('Runtime.enable',{},secondSession.sessionId);
 // The production adapter intentionally defers directory scans while hidden.
 // Foreground this owned headless tab before requiring prepared/idle state;
 // pointer dispatch to a background target does not change its visibility.
 await command('Page.bringToFront',{},secondSession.sessionId);
 report.secondPreparationVisibility=await evaluate(secondSession.sessionId,'document.visibilityState');assert.equal(report.secondPreparationVisibility,'visible');
 const secondTop=(await command('Page.getFrameTree',{},secondSession.sessionId)).frameTree.frame.id;
 await poll(()=>evaluate(secondSession.sessionId,"document.querySelectorAll('[data-va-owned] iframe').length===2"),'second-authorized-frames');
 const secondEditor=await evaluate(secondSession.sessionId,"(()=>{const r=document.querySelector('textarea').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...secondEditor},secondSession.sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...secondEditor},secondSession.sessionId);
 const secondIsolated=await poll(async()=>{for(const c of contexts.filter(c=>c.sessionId===secondSession.sessionId&&c.auxData?.isDefault===false&&c.auxData.frameId===secondTop)){try{if(await evaluate(secondSession.sessionId,'typeof __vaiwlIdleProbeSession===\'object\'&&__vaiwlIdleProbeSession.prepareIdle()',c.id))return c;}catch{}}return null;},'second-prepared-reading');
 await poll(()=>evaluate(secondSession.sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===0"),'second-reading');
 await poll(async()=>{
  const first=await evaluate(sessionId,'__vaiwlIdleProbeSession.snapshot()',isolated.id),second=await evaluate(secondSession.sessionId,'__vaiwlIdleProbeSession.snapshot()',secondIsolated.id);
  return [first,second].every(value=>['workspace','sidebar'].every(role=>value.log.some(x=>x.type==='HOST_UI_CONFIRM'&&x.ok&&x.role===role)));
 },'both-tabs-parent-confirmed',6000);
 const frameSessions=[];
 try{
  const targets=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&['workspace','sidebar'].some(role=>t.url===prefix+role+'.html'));assert.equal(targets.length,4);
  for(const target of targets)frameSessions.push((await command('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId);
  await poll(async()=>{const values=await Promise.all(frameSessions.map(id=>evaluate(id,'globalThis.__vaiwlFixtureFrameReady?.()===true')));return values.every(Boolean);},'four-frame-reads-and-resume-writes-drained',6000);
 }finally{for(const id of frameSessions)await command('Target.detachFromTarget',{sessionId:id});}
 await poll(()=>evaluate(sessionId,'__vaiwlIdleProbeSession.workerIdle().then(value=>value.idle)',isolated.id),'worker-initial-work-drained',6000);
 await poll(()=>evaluate(sessionId,'__vaiwlIdleProbeSession.prepareIdle()',isolated.id),'first-still-ready');
 report.preparationMs=performance.now()-runStarted;
 const closeStarted=performance.now();
 const before=await evaluate(sessionId,'__vaiwlIdleProbeSession.snapshot()',isolated.id);report.before=before;
 const detailPath='/backend-api/conversation/33333333-3333-4333-8333-333333333333';const detailBefore=server.snapshot().requests[detailPath]??0;
 server.holdConversationDetails();
 await evaluate(sessionId,'__vaiwlIdleProbeSession.arm();globalThis.busyCloseDone=false;globalThis.busyCloseObservationPending=false;true',isolated.id);
 // Poll only readiness until the one attempt starts. Its Promise survives driver
 // observations; a refusal is terminal and never obtains another close attempt.
 await poll(()=>evaluate(sessionId,`(()=>{
  if(globalThis.busyCloseDone)throw Error('preflight-close-refused');
  if(__vaiwlIdleProbeSession.snapshot().gated)return true;
  if(!globalThis.busyCloseObservationPending){
   globalThis.busyCloseObservationPending=true;
   globalThis.busyClosePromise=__vaiwlIdleProbeSession.attempt().then(value=>{if(value!==null){globalThis.busyCloseResult=value.entered;globalThis.busyCloseDone=true;}}).finally(()=>{globalThis.busyCloseObservationPending=false;});
  }
  return false;
 })()`,isolated.id),'successful-preflight-gated',5000);
 const navigationPoint=await evaluate(secondSession.sessionId,"(()=>{const r=document.querySelector('nav[aria-label=\"Chat history\"] a[href=\"/c/33333333-3333-4333-8333-333333333333\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...navigationPoint},secondSession.sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...navigationPoint},secondSession.sessionId);
 await poll(()=>((server.snapshot().requests[detailPath]??0)>detailBefore),'actual-second-tab-detail-request',4000);report.heldRequest={path:detailPath,before:detailBefore,after:server.snapshot().requests[detailPath],mechanism:'fixture holds actual HTTP response; worker guards unchanged'};
 await evaluate(sessionId,'__vaiwlIdleProbeSession.release();true',isolated.id);
 await poll(()=>evaluate(sessionId,'busyCloseDone',isolated.id),'close-cancelled-after-real-busy',6000);
 report.closeAttemptDriverMs=performance.now()-closeStarted;
 report.closeResult=await evaluate(sessionId,'busyCloseResult',isolated.id);report.rpc=await evaluate(sessionId,'__vaiwlIdleProbeSession.snapshot()',isolated.id);
 assert.equal(report.closeResult,false,'busy close must not claim successful release');
 const post=report.rpc.log.slice(before.log.length);assert(post.some(x=>x.type==='HOST_UI_IDLE_RELEASE'&&!x.ok&&x.reason==='ui-release-busy'),'real worker must return exact busy');
 server.releaseConversationDetails();
 await poll(async()=>{const value=await evaluate(sessionId,'__vaiwlIdleProbeSession.snapshot()',isolated.id);return value.log.slice(before.log.length).filter(x=>x.type==='HOST_UI_CONFIRM'&&x.ok).length===2;},'two-new-parent-confirmations',6000);
 if(partialJoin){
  assert.equal((await evaluate(sessionId,'__vaiwlIdleProbeSession.snapshot()',isolated.id)).confirmFault,true);
  await poll(()=>evaluate(secondSession.sessionId,'__vaiwlIdleProbeSession.prepareIdle()',secondIsolated.id),'second-navigation-ingestion-drained',6000);
  // Cancellation renews the adapter's ingestion pass. Directory traversal is
  // intentionally deferred while this tab is hidden; model the user returning
  // before testing foreground failure/recovery, without cancelling that work.
  await command('Page.bringToFront',{},sessionId);
  report.partialPreparationVisibility=await evaluate(sessionId,'document.visibilityState');assert.equal(report.partialPreparationVisibility,'visible');
  await poll(()=>evaluate(sessionId,'__vaiwlIdleProbeSession.workerIdle().then(value=>value.idle)',isolated.id),'partial-worker-drained',6000);
  const target=await poll(async()=>{
   const targets=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url===prefix+'sidebar.html');
   const matches=[];report.sidebarParents=[];
   for(const target of targets){const attached=await command('Target.attachToTarget',{targetId:target.targetId,flatten:true});try{
    const {frameTree}=await command('Page.getFrameTree',{},attached.sessionId);
    const owned=frameTree.frame.parentId===topFrameId;report.sidebarParents.push({primaryParent:owned,hasParent:!!frameTree.frame.parentId});if(owned)matches.push(target);
   }finally{await command('Target.detachFromTarget',{sessionId:attached.sessionId});}}
   assert(matches.length<=1);return matches[0]??null;
  },'partial-owned-sidebar',6000);
  const attached=await command('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  try{await evaluate(attached.sessionId,'__vaiwlFixtureStop();true');}finally{try{await command('Target.detachFromTarget',{sessionId:attached.sessionId});}catch{}}
  await poll(async()=>{const value=await evaluate(sessionId,'__vaiwlIdleProbeSession.snapshot()',isolated.id);return value.log.slice(before.log.length).filter(x=>x.type==='HOST_UI_CONFIRM'&&x.ok).length===4;},'partial-fresh-parent-confirmations',6000);
 }
 report.rpc=await evaluate(sessionId,'__vaiwlIdleProbeSession.snapshot()',isolated.id);const final=report.rpc.log.slice(before.log.length),oldConfirms=before.log.filter(x=>x.type==='HOST_UI_CONFIRM'&&x.ok),newConfirms=final.filter(x=>x.type==='HOST_UI_CONFIRM'&&x.ok);
 assert.equal(final.filter(x=>x.type==='HOST_HELLO').length,partialJoin?1:0);assert(final.some(x=>x.type==='HOST_DOCUMENT_RENEW'&&x.ok));assert(final.some(x=>x.type==='HOST_REFRESH'&&x.state==='verified'));assert.equal(newConfirms.length,partialJoin?4:2);
 const producer=before.log.find(x=>x.type==='HOST_HELLO'&&x.ok).producer;if(!partialJoin)assert(final.filter(x=>x.producer).every(x=>x.producer===producer),'same producer throughout cancellation');else {const release=final.findIndex(x=>x.type==='HOST_UI_IDLE_RELEASE'&&x.ok),hello=final.findIndex(x=>x.type==='HOST_HELLO');assert(release>=0&&hello>release);assert.equal(final[release].producer,producer);assert.equal(final[hello].ok,true);assert.notEqual(final[hello].producer,producer);
  const renewed=final[hello].producer,refresh=final.findIndex((x,i)=>i>hello&&x.type==='HOST_REFRESH'&&x.producer===renewed&&x.state==='verified');assert(refresh>hello);
  const joined=final.filter((x,i)=>i>refresh&&x.type==='HOST_UI_CONFIRM'&&x.ok&&x.producer===renewed);assert.deepEqual(joined.map(x=>x.role).sort(),['sidebar','workspace']);
  const partialGrants=final.slice(0,hello).filter(x=>x.type==='HOST_UI_CONFIRM').map(x=>x.grant);for(const grant of joined)assert(!partialGrants.includes(grant.grant));
 }
 for(const grant of newConfirms)assert(!oldConfirms.some(old=>old.grant===grant.grant),'new JOIN grants must replace old grants');
 report.native=await evaluate(sessionId,"({allOldFramesDetached:idleOriginal.frames.every(f=>!f.isConnected),sameDocument:document===idleOriginal.document,sameEditor:document.querySelector('textarea')===idleOriginal.editor,draft:idleOriginal.editor.value,sameFrames:idleOriginal.frames.every(f=>f.isConnected&&[...document.querySelectorAll('[data-va-owned] iframe')].includes(f)),open:document.querySelectorAll('[data-va-owned]:popover-open').length,returnCount:document.querySelectorAll('[aria-label=\"返回工作空间\"]').length})");
 assert.equal(report.native.sameDocument,true);assert.equal(report.native.sameEditor,true);assert.equal(report.native.sameFrames,!partialJoin);if(partialJoin)assert.equal(report.native.allOldFramesDetached,true);assert.equal(report.native.draft,'NATURAL_IDLE_LOCAL_DRAFT');assert.equal(report.native.open,0);assert.equal(report.native.returnCount,1);
 const point=await evaluate(sessionId,"(()=>{const r=document.querySelector('[aria-label=\"返回工作空间\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===2"),'trusted-return-dual-surfaces',6000);
 const workers=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='service_worker'&&t.url===prefix+'extension/worker.mjs');assert.equal(workers.length,1);assert.equal(workers[0].attached,false);
 report.nativeActions=server.snapshot().actions;assert.deepEqual(report.nativeActions,{navigate:1});report.results.push({name:partialJoin?'real-http-busy-partial-join-release-before-new-producer-and-trusted-return':'real-http-busy-cancel-same-producer-fresh-grants-and-trusted-return',status:'PASS'});report.status='PASS';
 assert.equal(hash(await readFile(entryPath)),report.instrumentation.after);for(const [path,expected] of Object.entries(manifest.files))assert.equal(hash(await readFile(join(built.unpacked,path))),path==='extension/content-entry.mjs'?report.instrumentation.after:diagnosticHashes[path]??expected);

 report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;assert.equal(report.sourceChangedDuringRun,false);assert.equal(report.buildManifestUnchanged,true);
}catch(error){report.status='FAIL';report.error=error.stack;report.fixtureSnapshot=server?.snapshot();process.exitCode=1;
 if(primaryDiagnostics)try{report.failurePreflight=await primaryDiagnostics();}catch{report.failurePreflight={state:'unavailable'};}
 // Failure diagnostics stay inside this owned loopback profile; never attach worker.
 if(ready)try{const targets=(await command('Target.getTargets')).targetInfos;report.failureTargets=targets.map(t=>({type:t.type,url:t.url,attached:t.attached}));const host=targets.find(t=>t.type==='page'&&t.url.startsWith(server.origin));if(host){const attached=await command('Target.attachToTarget',{targetId:host.targetId,flatten:true});try{report.failureHost=await evaluate(attached.sessionId,"({readyState:document.readyState,state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,owned:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length,frames:[...document.querySelectorAll('[data-va-owned] iframe')].map(f=>({src:f.src,connected:f.isConnected})),returnCount:document.querySelectorAll('[aria-label=\"返回工作空间\"]').length})");}finally{await command('Target.detachFromTarget',{sessionId:attached.sessionId});}}}catch(diagnostic){report.diagnosticError=String(diagnostic.message);}
}
finally{
 report.elapsedBeforeCleanupMs=performance.now()-runStarted;
 report.networkGuard=guard?.snapshot();
 const cleaned=await cleanupOwnedResources(report,[['socket',async()=>{if(socket){socket.close();ready=false;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('probe-cleanup'));}pending.clear();}}],['browser',async()=>{if(child)await cleanupIsolatedBrowser({child,profileDir});}],['server',()=>{server?.releaseConversationDetails();return server?.close();}],['networkGuard',()=>guard?.close()]]);
 if(cleaned===false)process.exitCode=1;
 report.runnerChangedDuringRun=hash(await readFile(runner))!==runnerHash;if(report.runnerChangedDuringRun){report.status='FAIL';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/dormant-busy-cancel-mv3.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,naturalWorkerSleep:report.naturalWorkerSleep,observation:report.observation,native:report.native,error:report.error}));
