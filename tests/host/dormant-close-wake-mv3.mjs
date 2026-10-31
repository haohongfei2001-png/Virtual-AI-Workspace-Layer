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
const automatic=process.env.FREE_AUTOMATIC_DORMANCY==='1';
const expectedDraft=automatic?'':'NATURAL_IDLE_LOCAL_DRAFT';
const runner=new URL(import.meta.url),runnerHash=hash(await readFile(runner));
const report={requirement:'UI-11',evidence:automatic?'S_INSTRUMENTED_MV3_AUTOMATIC_CLOSE_WAKE':'S_INSTRUMENTED_MV3_EXPLICIT_CLOSE_WAKE',automaticDormancy:automatic,profile:'LEGACY_OFFLINE',realChatGPT:'NOT_RUN',naturalWorkerSleep:'NOT_ESTABLISHED',status:'NOT_RUN',windowMs:60000,forcedWorkerStop:false,workerDebuggerAttached:false,productionTimersModified:false,results:[]};
let server,guard,child,socket,profileDir,seq=0,ready=false;const pending=new Map(),events=[],contexts=[];let eventOverflow=false;
function command(method,params={},sessionId,timeoutMs=6000){
 if(!ready)return Promise.reject(Error('CDP-not-ready'));
 const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP-command-deadline:'+method));},timeoutMs);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});
}
const evaluate=async(sessionId,expression,contextId,timeoutMs=6000)=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId?{contextId}:{})},sessionId,timeoutMs);if(r.exceptionDetails)throw Error('page-evaluation-failed');return r.result.value;};
async function poll(read,label,ms=15000){const deadline=performance.now()+ms;while(performance.now()<deadline){const value=await read();if(value&&performance.now()<deadline)return value;await sleep(50);}throw Error('probe-timeout:'+label);}
try{
 server=await createHostFixtureServer();guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});const dir=await mkdtemp('/private/tmp/vaiwl-natural-idle-');profileDir=join(dir,'profile');await mkdir(profileDir);
 const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,...(automatic?{offlineFirstSend:true}: {})}),manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=hash(manifestBytes);report.runnerHash=runnerHash;report.package=built;report.fixture=server.manifest;
 // A single test-only API exposure in the extension's isolated world. No timer,
 // grant, producer, body, adapter or controller behavior is replaced.
 const entryPath=join(built.unpacked,'extension/content-entry.mjs'),entry=await readFile(entryPath,'utf8'),anchor=' void session.start();';
 assert.equal(entry.split(anchor).length,2);const probe=automatic?' globalThis.__vaiwlIdleProbeSession=Object.freeze({prepareIdle:()=>!!session.prepareIdle()});\n':' globalThis.__vaiwlIdleProbeSession=Object.freeze({prepareIdle:()=>!!session.prepareIdle(),enterDormant:()=>session.enterDormant()});\n';const instrumented=entry.replace(anchor,probe+anchor);
 await writeFile(entryPath,instrumented);report.instrumentation={path:'extension/content-entry.mjs',before:hash(entry),after:hash(instrumented),patch:automatic?'Expose only read-only boolean readiness in isolated world':'Expose only boolean readiness and explicit close in isolated world',originalArchiveIsInstrumented:false,productionAutomaticEntry:automatic};
 const changed=[];for(const [path,expected] of Object.entries(manifest.files))if(hash(await readFile(join(built.unpacked,path)))!==expected)changed.push(path);
 assert.deepEqual(changed,['extension/content-entry.mjs']);report.loadedPackageChanges=changed;
 child=spawn(process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',nativeBrowserArgs(profileDir,{headed:false,historicalNetworkGuard:guard.config}),{stdio:['ignore','ignore','pipe']});let launchError;child.on('error',e=>{launchError=e;});child.stderr.resume();
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
 await evaluate(sessionId,"globalThis.idleOriginal={document,editor:document.querySelector('textarea'),frames:[...document.querySelectorAll('[data-va-owned] iframe')]};true");
 if(automatic){
  const point=await evaluate(sessionId,"(()=>{const r=idleOriginal.editor.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
 }else await evaluate(sessionId,"idleOriginal.editor.focus();true");
 await command('Input.insertText',{text:'NATURAL_IDLE_LOCAL_DRAFT'},sessionId);
 if(automatic){
  // Only the owned fixture draft is edited. The deletion is a real browser
  // input event; no session close method or product clock is invoked.
  await evaluate(sessionId,"idleOriginal.editor.select();true");
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,nativeVirtualKeyCode:8},sessionId);
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,nativeVirtualKeyCode:8},sessionId);
  const point=await evaluate(sessionId,"(()=>{const r=document.querySelector('main h1').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
  report.automaticNativePreparation=await evaluate(sessionId,"({draftEmpty:idleOriginal.editor.value==='',nativeNonControlFocus:document.activeElement!==idleOriginal.editor&&!document.activeElement.closest('input,textarea,button,a,select,[contenteditable],iframe,[data-va-owned]')})");
  assert.deepEqual(report.automaticNativePreparation,{draftEmpty:true,nativeNonControlFocus:true});
 }
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===0"),'native-reading');const isolated=await poll(async()=>{const matches=[];for(const c of contexts.filter(c=>c.sessionId===sessionId&&c.auxData?.isDefault===false&&c.auxData.frameId===topFrameId)){try{if(await evaluate(sessionId,`window===window.top&&chrome.runtime.id===${JSON.stringify(id)}&&typeof globalThis.__vaiwlIdleProbeSession==='object'`,c.id))matches.push(c);}catch{}}assert(matches.length<=1);return matches[0]??null;},'isolated-session');
 assert.equal(await evaluate(sessionId,"typeof globalThis.__vaiwlIdleProbeSession"),'undefined');
 if(automatic){
  assert.deepEqual(await evaluate(sessionId,"Object.keys(__vaiwlIdleProbeSession)",isolated.id),['prepareIdle']);
  report.closeAttempts=[];
  report.clearedViews=[];
  for(const role of ['workspace','sidebar']){
   const target=await poll(async()=>{const matches=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url===prefix+role+'.html');assert(matches.length<=1);return matches[0];},'automatic-clear-target-'+role);
   const attached=await command('Target.attachToTarget',{targetId:target.targetId,flatten:true});
   try{await poll(()=>evaluate(attached.sessionId,"document.querySelector('main')?.childElementCount===0"),'automatic-private-root-clear-'+role);report.clearedViews.push({role,children:0});}finally{await command('Target.detachFromTarget',{sessionId:attached.sessionId});}
  }
  // Empty original frames prove clearing, not worker release by themselves.
  // The detached observation and fresh return below must also succeed.
  report.results.push({name:'automatic-original-frame-private-roots-cleared',status:'PASS'});
 }else{
 await poll(()=>evaluate(sessionId,"!!__vaiwlIdleProbeSession.prepareIdle()",isolated.id),'content-ready-to-close');
 report.closeAttempts=[];
 // Read-only preflight may see a transient worker view still in flight. Retry
 // explicit test close within one bounded observation window, never force idle.
 report.closeResult=await poll(async()=>{const result=await evaluate(sessionId,"__vaiwlIdleProbeSession.enterDormant()",isolated.id,10000);report.closeAttempts.push({ok:result===true});return result;},'explicit-close-with-worker-preflight',6000);
 assert.equal(report.closeResult,true,'explicit close must reach actual worker release');
 report.results.push({name:'actual-content-frame-ack-worker-release',status:'PASS'});
 }
 await command('Target.detachFromTarget',{sessionId});sessionId=null;
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
 if(automatic)assert.equal(stopped,true,'automatic close must permit original worker destruction in the unchanged detached window');
 const extensionTargets=new Map(initialTargets.map(t=>[t.targetId,{type:t.type,url:t.url,attached:t.attached}]));
 for(const e of windowEvents){const t=e.params.targetInfo;if(t?.url?.startsWith(prefix))extensionTargets.set(t.targetId,{type:t.type,url:t.url,attached:t.attached});}
 report.observation={elapsedMs,initialWorkerDestroyed:stopped,extensionTargets:[...extensionTargets.values()],targetEvents:events.slice(startEvent).filter(e=>e.method==='Target.targetDestroyed'||e.method==='Target.targetCreated'||e.method==='Target.targetCrashed').map(e=>({at:e.at-started,method:e.method,targetId:e.params.targetId??e.params.targetInfo?.targetId,type:e.params.targetInfo?.type??null})),hostSessionDetached:true};
 ({sessionId}=await command('Target.attachToTarget',{targetId,flatten:true}));report.native=await evaluate(sessionId,"({sameDocument:document===idleOriginal.document,sameEditor:document.querySelector('textarea')===idleOriginal.editor,draft:idleOriginal.editor.value,originalFramesConnected:idleOriginal.frames.map(f=>f.isConnected),open:document.querySelectorAll('[data-va-owned]:popover-open').length,returnCount:document.querySelectorAll('[aria-label=\"返回工作空间\"]').length})");assert.equal(report.native.sameDocument,true);assert.equal(report.native.sameEditor,true);assert.equal(report.native.draft,expectedDraft);assert.equal(report.native.open,0);
 assert.equal(report.native.returnCount,1);assert.deepEqual(report.native.originalFramesConnected,[true,true]);
 const point=await evaluate(sessionId,"(()=>{const r=document.querySelector('[aria-label=\"返回工作空间\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===2"),'fresh-wake-dual-surfaces');
 report.wake=await evaluate(sessionId,"({sameFrames:idleOriginal.frames.every(f=>f.isConnected&&[...document.querySelectorAll('[data-va-owned] iframe')].includes(f)),sameEditor:idleOriginal.editor===document.querySelector('textarea'),draft:idleOriginal.editor.value,open:document.querySelectorAll('[data-va-owned]:popover-open').length})");
 assert.equal(report.wake.sameFrames,true);assert.equal(report.wake.sameEditor,true);assert.equal(report.wake.draft,expectedDraft);report.results.push({name:'trusted-return-original-frames-fresh-wake',status:'PASS'});
 const afterTargets=(await command('Target.getTargets')).targetInfos;
 const workers=afterTargets.filter(t=>t.type==='service_worker'&&t.url===prefix+'extension/worker.mjs');assert.equal(workers.length,1);assert.equal(workers[0].attached,false);if(stopped)assert.notEqual(workers[0].targetId,worker.targetId);report.recoveredWorker={targetId:workers[0].targetId,newTarget:workers[0].targetId!==worker.targetId};
 assert(!windowEvents.some(e=>e.method==='Target.targetCrashed'&&e.params.targetId===worker.targetId),'worker crash is not idle');
 report.restoredViews=[];
 for(const role of ['workspace','sidebar']){
  const target=await poll(async()=>{const all=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url===prefix+role+'.html');assert(all.length<=1);return all[0];},'restored-'+role);
  const attached=await command('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  try{const restored=await poll(()=>evaluate(attached.sessionId,"(()=>{const root=document.querySelector('main');if(!root)return null;let found=false,shadowRoots=0;function walk(parent){for(const node of parent.querySelectorAll('*')){if(node.shadowRoot){shadowRoots++;walk(node.shadowRoot);}if(['STYLE','SCRIPT'].includes(node.tagName))continue;for(const child of node.childNodes)if(child.nodeType===Node.TEXT_NODE&&child.textContent.includes('Research')&&node.getClientRects().length)found=true;}}walk(root);return found?{children:root.childElementCount,shadowRoots,fixtureTitleVisible:true}:null;})()"),'restored-fixture-view-'+role);report.restoredViews.push({role,...restored});}finally{await command('Target.detachFromTarget',{sessionId:attached.sessionId});}
 }
 report.results.push({name:'new-worker-and-fresh-fixture-views',status:'PASS'});
 report.status=stopped?'UNFORCED_WORKER_DESTRUCTION_AND_WAKE_OBSERVED':'CLOSE_WAKE_PASS_NATURAL_IDLE_NOT_OBSERVED';report.naturalWorkerSleep='NOT_ESTABLISHED';report.nativeActions=server.snapshot().actions;assert.deepEqual(report.nativeActions,{});process.exitCode=2;
 assert.equal(hash(await readFile(entryPath)),report.instrumentation.after);for(const [path,expected] of Object.entries(manifest.files))assert.equal(hash(await readFile(join(built.unpacked,path))),path==='extension/content-entry.mjs'?report.instrumentation.after:expected);

 report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;assert.equal(report.sourceChangedDuringRun,false);assert.equal(report.buildManifestUnchanged,true);
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;
 // Failure diagnostics stay inside this owned loopback profile; never attach worker.
 if(ready)try{const targets=(await command('Target.getTargets')).targetInfos;report.failureTargets=targets.map(t=>({type:t.type,url:t.url,attached:t.attached}));const host=targets.find(t=>t.type==='page'&&t.url.startsWith(server.origin));if(host){const attached=await command('Target.attachToTarget',{targetId:host.targetId,flatten:true});try{report.failureHost=await evaluate(attached.sessionId,"({readyState:document.readyState,state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,owned:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length,frames:[...document.querySelectorAll('[data-va-owned] iframe')].map(f=>({src:f.src,connected:f.isConnected})),returnCount:document.querySelectorAll('[aria-label=\"返回工作空间\"]').length})");}finally{await command('Target.detachFromTarget',{sessionId:attached.sessionId});}}}catch(diagnostic){report.diagnosticError=String(diagnostic.message);}
}
finally{
 report.networkGuard=guard?.snapshot();
 const cleaned=await cleanupOwnedResources(report,[['socket',async()=>{if(socket){socket.close();ready=false;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('probe-cleanup'));}pending.clear();}}],['browser',async()=>{if(child)await cleanupIsolatedBrowser({child,profileDir});}],['server',()=>server?.close()],['networkGuard',()=>guard?.close()]]);
 if(cleaned===false)process.exitCode=1;
 report.runnerChangedDuringRun=hash(await readFile(runner))!==runnerHash;if(report.runnerChangedDuringRun){report.status='FAIL';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/dormant-close-wake-mv3.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,naturalWorkerSleep:report.naturalWorkerSleep,observation:report.observation,native:report.native,error:report.error}));
