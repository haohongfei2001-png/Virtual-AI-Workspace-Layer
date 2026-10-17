/** UI-11 observation only. No worker debugger, forced exit, frozen page or timer overrides. */
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
const runner=new URL(import.meta.url),runnerHash=hash(await readFile(runner));
const report={requirement:'UI-11',evidence:'S_READ_ONLY_NATIVE_IDLE_OBSERVATION_NOT_RECOVERY_ACCEPTANCE',profile:'LEGACY_OFFLINE',realChatGPT:'NOT_RUN',naturalWorkerSleep:'NOT_ESTABLISHED',status:'NOT_RUN',windowMs:60000,forcedWorkerStop:false,workerDebuggerAttached:false,productionTimersModified:false,results:[]};
let server,guard,child,socket,profileDir,seq=0,ready=false;const pending=new Map(),events=[];let eventOverflow=false;
function command(method,params={},sessionId){
 if(!ready)return Promise.reject(Error('CDP-not-ready'));
 const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP-command-deadline:'+method));},6000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});
}
const evaluate=async(sessionId,expression)=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error('page-evaluation-failed');return r.result.value;};
async function poll(read,label,ms=15000){const deadline=performance.now()+ms;while(performance.now()<deadline){const value=await read();if(value&&performance.now()<deadline)return value;await sleep(50);}throw Error('probe-timeout:'+label);}
try{
 server=await createHostFixtureServer();guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});const dir=await mkdtemp('/private/tmp/vaiwl-natural-idle-');profileDir=join(dir,'profile');await mkdir(profileDir);
 const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=hash(manifestBytes);report.runnerHash=runnerHash;report.package=built;report.fixture=server.manifest;
 child=spawn(process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',nativeBrowserArgs(profileDir,{headed:false,historicalNetworkGuard:guard.config}),{stdio:['ignore','ignore','pipe']});let launchError;child.on('error',e=>{launchError=e;});child.stderr.resume();
 const endpoint=await poll(async()=>{if(launchError)throw launchError;if(child.exitCode!==null)throw Error('chrome-exited');try{return endpointFromActivePort(await readFile(join(profileDir,'DevToolsActivePort'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return null;}},'browser');
 socket=new WebSocket(endpoint);socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const q=pending.get(m.id);if(q){pending.delete(m.id);clearTimeout(q.timer);if(m.error)q.reject(Error(m.error.message));else q.resolve(m.result);}}else if(m.method?.startsWith('Target.')){if(events.length<512)events.push({at:performance.now(),method:m.method,params:m.params});else eventOverflow=true;}});
 socket.addEventListener('close',()=>{ready=false;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('CDP-closed'));}pending.clear();});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP-connect-deadline')),6000);socket.addEventListener('open',()=>{clearTimeout(timer);ready=true;resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP-connect-error'));},{once:true});});
 report.browser=await command('Browser.getVersion');await command('Target.setDiscoverTargets',{discover:true});const {id}=await command('Extensions.loadUnpacked',{path:built.unpacked}),prefix='chrome-extension://'+id+'/';report.extensionId=id;
 const worker=await poll(async()=>{const matches=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='service_worker'&&t.url===prefix+'extension/worker.mjs');assert(matches.length<=1);return matches[0];},'exact-worker');assert.equal(worker.attached,false);report.initialWorker={targetId:worker.targetId,attached:worker.attached};
 const {targetId}=await command('Target.createTarget',{url:server.url});let {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===2"),'dual-surfaces');
 report.initialSurfaces=await evaluate(sessionId,"({open:document.querySelectorAll('[data-va-owned]:popover-open').length,frames:[...document.querySelectorAll('[data-va-owned] iframe')].map(n=>n.src)})");assert.equal(report.initialSurfaces.frames.length,2);
 report.externalRejected=await evaluate(sessionId,"fetch('https://example.com/').then(()=>false,()=>true)");assert(report.externalRejected);assert(guard.snapshot().denied>0);
 await evaluate(sessionId,"globalThis.idleOriginal={document,editor:document.querySelector('textarea'),frames:[...document.querySelectorAll('[data-va-owned] iframe')]};idleOriginal.editor.focus();true");await command('Input.insertText',{text:'NATURAL_IDLE_LOCAL_DRAFT'},sessionId);
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===0"),'native-reading');await command('Target.detachFromTarget',{sessionId});sessionId=null;
 const initialTargets=(await command('Target.getTargets')).targetInfos.filter(t=>t.url.startsWith(prefix));
 assert(initialTargets.some(t=>t.targetId===worker.targetId),'original worker must exist at window start');
 for(const t of initialTargets)assert.equal(t.attached,false);
 report.initialExtensionTargets=initialTargets;
 const started=performance.now(),startEvent=events.length;
 // Discovery events only during this window: no target polling, debugger or page commands.
 await sleep(report.windowMs);
 const elapsedMs=performance.now()-started,windowEvents=events.slice(startEvent);
 assert.equal(eventOverflow,false,'bounded event log overflow invalidates observation');
 assert(!windowEvents.some(e=>e.params.targetInfo?.url?.startsWith(prefix)&&e.params.targetInfo.attached),'extension target attached during observation');
 const stopped=windowEvents.some(e=>e.method==='Target.targetDestroyed'&&e.params.targetId===worker.targetId);
 const extensionTargets=new Map(initialTargets.map(t=>[t.targetId,{type:t.type,url:t.url,attached:t.attached}]));
 for(const e of windowEvents){const t=e.params.targetInfo;if(t?.url?.startsWith(prefix))extensionTargets.set(t.targetId,{type:t.type,url:t.url,attached:t.attached});}
 report.observation={elapsedMs,initialWorkerDestroyed:stopped,extensionTargets:[...extensionTargets.values()],targetEvents:events.slice(startEvent).filter(e=>e.method==='Target.targetDestroyed'||e.method==='Target.targetCreated'||e.method==='Target.targetCrashed').map(e=>({at:e.at-started,method:e.method,targetId:e.params.targetId??e.params.targetInfo?.targetId,type:e.params.targetInfo?.type??null})),hostSessionDetached:true};
 ({sessionId}=await command('Target.attachToTarget',{targetId,flatten:true}));report.native=await evaluate(sessionId,"({sameDocument:document===idleOriginal.document,sameEditor:document.querySelector('textarea')===idleOriginal.editor,draft:idleOriginal.editor.value,originalFramesConnected:idleOriginal.frames.map(f=>f.isConnected),open:document.querySelectorAll('[data-va-owned]:popover-open').length,returnCount:document.querySelectorAll('[aria-label=\"返回工作空间\"]').length})");assert.equal(report.native.sameDocument,true);assert.equal(report.native.sameEditor,true);assert.equal(report.native.draft,'NATURAL_IDLE_LOCAL_DRAFT');assert.equal(report.native.open,0);
 report.status=stopped?'UNFORCED_TARGET_DESTRUCTION_RECOVERY_NOT_TESTED':'NATURAL_IDLE_NOT_OBSERVED';report.naturalWorkerSleep=stopped?'NOT_ESTABLISHED':'NOT_ESTABLISHED';report.nativeActions=server.snapshot().actions;assert.deepEqual(report.nativeActions,{});process.exitCode=2;
 report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;assert.equal(report.sourceChangedDuringRun,false);assert.equal(report.buildManifestUnchanged,true);
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 report.networkGuard=guard?.snapshot();
 const cleaned=await cleanupOwnedResources(report,[['socket',async()=>{if(socket){socket.close();ready=false;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('probe-cleanup'));}pending.clear();}}],['browser',async()=>{if(child)await cleanupIsolatedBrowser({child,profileDir});}],['server',()=>server?.close()],['networkGuard',()=>guard?.close()]]);
 if(cleaned===false)process.exitCode=1;
 report.runnerChangedDuringRun=hash(await readFile(runner))!==runnerHash;if(report.runnerChangedDuringRun){report.status='FAIL';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/natural-worker-idle-probe.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,naturalWorkerSleep:report.naturalWorkerSleep,observation:report.observation,native:report.native,error:report.error}));
