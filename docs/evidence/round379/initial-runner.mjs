/** Narrow unmodified production-package MV3 partial-baseline recovery. Offline J2 only. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {nativeBrowserArgs,endpointFromActivePort} from './native-visibility-browser.mjs';
import {cleanupIsolatedBrowser,cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {J2_C} from './fixtures/j2-send.mjs';
import {j2JourneyProfile} from './j2-journey-profile.mjs';
import {packageHost} from '../../extension/package.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const runner=new URL(import.meta.url),runnerHash=hash(await readFile(runner));
const fixturePaths=['tests/host/fixtures/server.mjs','tests/host/fixtures/j2-send.mjs','tests/host/fixtures/native.mjs','tests/host/fixtures/legacy.html','tests/host/fixtures/native.css','tests/host/j2-journey-profile.mjs','tests/host/historical-network-guard.mjs','tests/host/native-visibility-browser.mjs','tests/host/isolated-browser-cleanup.mjs'];
const fixtureHashes=Object.fromEntries(await Promise.all(fixturePaths.map(async path=>[path,hash(await readFile(path))])));
const report={requirement:'B2 native preparation baseline recovery',evidence:'S_OFFLINE_PACKAGED_MV3_PARTIAL_BASELINE_SEGMENT',profile:'LEGACY_J2_OFFLINE',realChatGPT:'NOT_RUN',fullJ2:'NOT_ESTABLISHED',release:'NOT_RELEASE_READY',status:'NOT_RUN',workerDebuggerAttached:false,productionTimersModified:false,productionInstrumentation:false,fixtureHashes,limitations:['Offline reconstructed native app only','Authenticated detail responses do not independently identify worker reader ownership; final ACK may come from firstSend','No automatic dormancy, first home-send, transport-error or complete J2 acceptance'],results:[]};
let server,guard,child,socket,profileDir,seq=0,ready=false;const pending=new Map(),events=[],contexts=[];let eventOverflow=false;
function command(method,params={},sessionId,timeoutMs=6000){
 if(!ready)return Promise.reject(Error('CDP-not-ready'));
 const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP-command-deadline:'+method));},timeoutMs);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});
}
const evaluate=async(sessionId,expression,contextId,timeoutMs=6000)=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId?{contextId}:{})},sessionId,timeoutMs);if(r.exceptionDetails)throw Error('page-evaluation-failed');return r.result.value;};
async function poll(read,label,ms=15000){const deadline=performance.now()+ms;while(performance.now()<deadline){const value=await read();if(value&&performance.now()<deadline)return value;await sleep(50);}throw Error('probe-timeout:'+label);}
try{
 server=await createHostFixtureServer({journey:'J2'});server.setConversationMetadataPartial(J2_C,true);guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});const dir=await mkdtemp('/private/tmp/vaiwl-prepared-baseline-');profileDir=join(dir,'profile');await mkdir(profileDir);
 const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineFirstSend:true}),manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes);report.sourceHashes=manifest.sourceHashes;report.buildManifestHash=hash(manifestBytes);report.runnerHash=runnerHash;report.package=built;report.fixture=server.manifest;
 report.loadedPackageChanges=[];for(const [path,expected] of Object.entries(manifest.files))assert.equal(hash(await readFile(join(built.unpacked,path))),expected);
 child=spawn(process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',nativeBrowserArgs(profileDir,{headed:false,historicalNetworkGuard:guard.config}),{stdio:['ignore','ignore','pipe']});let launchError;child.on('error',e=>{launchError=e;});child.stderr.resume();
 const endpoint=await poll(async()=>{if(launchError)throw launchError;if(child.exitCode!==null)throw Error('chrome-exited');try{return endpointFromActivePort(await readFile(join(profileDir,'DevToolsActivePort'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return null;}},'browser');
 socket=new WebSocket(endpoint);socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const q=pending.get(m.id);if(q){pending.delete(m.id);clearTimeout(q.timer);if(m.error)q.reject(Error(m.error.message));else q.resolve(m.result);}}else if(m.method==='Runtime.executionContextCreated'){contexts.push({sessionId:m.sessionId,...m.params.context});}else if(m.method?.startsWith('Target.')){if(events.length<512)events.push({at:performance.now(),method:m.method,params:m.params});else eventOverflow=true;}});
 socket.addEventListener('close',()=>{ready=false;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('CDP-closed'));}pending.clear();});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP-connect-deadline')),6000);socket.addEventListener('open',()=>{clearTimeout(timer);ready=true;resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP-connect-error'));},{once:true});});
 report.browser=await command('Browser.getVersion');await command('Target.setDiscoverTargets',{discover:true});const {id}=await command('Extensions.loadUnpacked',{path:built.unpacked}),prefix='chrome-extension://'+id+'/';report.extensionId=id;
 const worker=await poll(async()=>{const matches=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='service_worker'&&t.url===prefix+'extension/worker.mjs');assert(matches.length<=1);return matches[0];},'exact-worker');assert.equal(worker.attached,false);report.initialWorker={targetId:worker.targetId,attached:worker.attached};
 const {targetId}=await command('Target.createTarget',{url:server.origin+'/c/'+J2_C});const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 const click=async selector=>{const point=await evaluate(sessionId,`(()=>{const nodes=document.querySelectorAll(${JSON.stringify(selector)});if(nodes.length!==1)throw Error('ambiguous-click');const r=nodes[0].getBoundingClientRect();if(!r.width||!r.height)throw Error('hidden-click');return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);};
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===2||document.querySelectorAll('[aria-label=\"返回工作空间\"]').length===1"),'authorized-presentation');
 if(await evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length")!==2)await click('[aria-label="返回工作空间"]');
 await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===2"),'initial-workspace');
 await evaluate(sessionId,"globalThis.baselineOriginal={document,editor:document.querySelector('#prompt-textarea'),reading:document.querySelector('#reading'),messages:[...document.querySelectorAll('#reading [data-message-id]')],frames:[...document.querySelectorAll('[data-va-owned] iframe')]};baselineOriginal.ids=baselineOriginal.messages.map(n=>n.dataset.messageId);true");
 await click('#prompt-textarea');await poll(()=>evaluate(sessionId,"document.querySelectorAll('[data-va-owned]:popover-open').length===0"),'native-reading');
 const detailPath='/backend-api/conversation/'+J2_C,detailCount=()=>server.snapshot().requests[detailPath]??0;
 await poll(()=>server.snapshot().j2DetailResponses.partial>0,'initial-authenticated-partial-response');
 assert.equal(server.snapshot().actions['send-intent']??0,0);assert.equal(server.snapshot().j2.rows.length,1);
 const invariant=()=>evaluate(sessionId,"({sameDocument:document===baselineOriginal.document,sameEditor:document.querySelector('#prompt-textarea')===baselineOriginal.editor,sameReading:document.querySelector('#reading')===baselineOriginal.reading,sameMessages:baselineOriginal.messages.length===document.querySelectorAll('#reading [data-message-id]').length&&baselineOriginal.messages.every((n,i)=>document.querySelectorAll('#reading [data-message-id]')[i]===n&&n.dataset.messageId===baselineOriginal.ids[i]),sameFrames:baselineOriginal.frames.length===2&&baselineOriginal.frames.every((n,i)=>document.querySelectorAll('[data-va-owned] iframe')[i]===n),open:document.querySelectorAll('[data-va-owned]:popover-open').length})");
 const checkInvariant=async()=>{const v=await invariant();assert.deepEqual(v,{sameDocument:true,sameEditor:true,sameReading:true,sameMessages:true,sameFrames:true,open:0});return v;};
 report.beforeRecovery=await checkInvariant();
 // This is the production one-second explicit-prepare interval, not a lease,
 // timeout or retry-budget override. No new DOM observation is manufactured.
 await sleep(1100);const before=server.snapshot(),beforeDetails=detailCount();assert(beforeDetails>=1&&beforeDetails<3,'initial partial exhausted per-proof read allowance');
 server.setConversationMetadataPartial(J2_C,false);const recoveryAt=Date.now();await click('#prompt-textarea');
 await poll(()=>server.snapshot().j2DetailResponses.full>before.j2DetailResponses.full,'same-body-explicit-prepare-reread',6000);assert.equal(server.snapshot().j2DetailResponses.full,before.j2DetailResponses.full+1);assert.equal(server.snapshot().j2DetailResponses.partial,before.j2DetailResponses.partial);assert.equal(detailCount(),beforeDetails+1,'one explicit prepare produces one bounded detail read');
 report.afterRecovery=await checkInvariant();const after=server.snapshot();
 for(const path of ['/api/auth/session','/backend-api/accounts/check/v4-2023-04-27'])assert.equal(after.requests[path]??0,before.requests[path]??0,'no additional authentication request during recovery');
 report.results.push({name:'unchanged-native-body-explicit-prepare-retries-authenticated-partial',status:'PASS',initialReads:beforeDetails,recoveryReads:detailCount()-beforeDetails,recoveryAt,responsesBefore:before.j2DetailResponses,responsesAfter:after.j2DetailResponses});
 // A native mode button and genuine native submit are the sole send path.
 const modeSelector=await evaluate(sessionId,"(()=>{const buttons=[...document.querySelectorAll('#j2-controls button')];const index=buttons.findIndex(b=>b.textContent==='J2 mode success');if(index<0)throw Error('missing-success-control');return '#j2-controls button:nth-child('+(index+1)+')';})()");
 await click(modeSelector);await poll(()=>evaluate(sessionId,"document.querySelector('#j2-controls').dataset.mode==='success'"),'native-success-mode');
 await click('#prompt-textarea');await command('Input.insertText',{text:'OFFLINE_PREPARED_BASELINE_SEND'},sessionId);await click('#composer button[type="submit"]');
 const native=await poll(()=>server.snapshot().j2.rows.find(r=>r.kind==='success'),'one-native-success');assert.equal(server.snapshot().actions['send-intent'],1);assert.equal(server.snapshot().j2.actions.filter(a=>a.kind==='success').length,1);
 const workspace=await poll(async()=>{const targets=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url===prefix+'workspace.html');assert(targets.length<=1);return targets[0];},'workspace-readonly-oracle');
 const attached=await command('Target.attachToTarget',{targetId:workspace.targetId,flatten:true});
 try{
  const scope=j2JourneyProfile('LEGACY').scope;
  const read=()=>evaluate(attached.sessionId,`(async()=>{const list=await indexedDB.databases();if(!list.some(db=>db.name==='vaiwl-b1-v1'))return null;const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));const {FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs'));const base=new ScopeRepository({indexedDB});try{return await new FreeEvidenceRepository({baseRepository:base}).read(${JSON.stringify(scope)});}finally{base.close();}})()`);
  const evidence=await poll(async()=>{const value=await read();return value&&Object.values(value.hints).length?value:null;},'exact-original-ACK',10000),hints=Object.values(evidence.hints);
  assert.equal(hints.length,1);const anchor=hints[0];assert.equal(anchor.conversationId,J2_C);assert.equal(anchor.messageId,native.id);assert.equal(anchor.hintType,'observed-self-send');assert.equal(anchor.revoked,false);assert.equal(evidence.sources[anchor.sourceId].revoked,false);assert.equal(Object.hasOwn(anchor,'sentAt'),false);assert.equal(anchor.actorVerified,true);assert.equal(Object.keys(evidence.events).length,0);
  const repeated=await read();assert.deepEqual(repeated,evidence,'read-only oracle cannot renew original anchor');report.anchor=anchor;
 }finally{await command('Target.detachFromTarget',{sessionId:attached.sessionId});}
 const workers=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='service_worker'&&t.url===prefix+'extension/worker.mjs');assert.equal(workers.length,1);assert.equal(workers[0].targetId,worker.targetId);assert.equal(workers[0].attached,false);
 report.results.push({name:'one-real-native-send-produces-exact-authenticated-observed-anchor',status:'PASS',messageId:native.id});report.native=server.snapshot();
 for(const [path,expected] of Object.entries(manifest.files))assert.equal(hash(await readFile(join(built.unpacked,path))),expected);
 report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;assert.equal(report.sourceChangedDuringRun,false);assert.equal(report.buildManifestUnchanged,true);report.status='PASS_NARROW_PARTIAL_BASELINE_SEGMENT';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;
 // Failure diagnostics stay inside this owned loopback profile; never attach worker.
 if(ready)try{const targets=(await command('Target.getTargets')).targetInfos;report.failureTargets=targets.map(t=>({type:t.type,url:t.url,attached:t.attached}));const host=targets.find(t=>t.type==='page'&&t.url.startsWith(server.origin));if(host){const attached=await command('Target.attachToTarget',{targetId:host.targetId,flatten:true});try{report.failureHost=await evaluate(attached.sessionId,"({readyState:document.readyState,state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,owned:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length,frames:[...document.querySelectorAll('[data-va-owned] iframe')].map(f=>({src:f.src,connected:f.isConnected})),returnCount:document.querySelectorAll('[aria-label=\"返回工作空间\"]').length})");}finally{await command('Target.detachFromTarget',{sessionId:attached.sessionId});}}}catch(diagnostic){report.diagnosticError=String(diagnostic.message);}
}
finally{
 report.networkGuard=guard?.snapshot();
 report.nativeSnapshot=server?.snapshot();
 try{report.fixtureChangedDuringRun=(await Promise.all(Object.entries(fixtureHashes).map(async([path,expected])=>hash(await readFile(path))!==expected))).some(Boolean);assert.equal(report.fixtureChangedDuringRun,false);if(report.package){const manifest=JSON.parse(await readFile(join(report.package.unpacked,'build-manifest.json')));for(const [path,expected]of Object.entries(manifest.files))assert.equal(hash(await readFile(join(report.package.unpacked,path))),expected);report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([path,expected])=>hash(await readFile(path))!==expected))).some(Boolean);assert.equal(report.sourceChangedDuringRun,false);assert.equal(hash(await readFile(join(report.package.unpacked,'build-manifest.json'))),report.buildManifestHash);report.buildManifestUnchanged=true;}}catch(error){report.status='FAIL';report.integrityError=error.message;process.exitCode=1;}
 const cleaned=await cleanupOwnedResources(report,[['socket',async()=>{if(socket){socket.close();ready=false;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('probe-cleanup'));}pending.clear();}}],['browser',async()=>{if(child)await cleanupIsolatedBrowser({child,profileDir});}],['server',()=>server?.close()],['networkGuard',()=>guard?.close()]]);
 if(cleaned===false)process.exitCode=1;
 report.runnerChangedDuringRun=hash(await readFile(runner))!==runnerHash;if(report.runnerChangedDuringRun){report.status='FAIL';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/prepared-baseline-package-mv3.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,results:report.results,error:report.error}));
