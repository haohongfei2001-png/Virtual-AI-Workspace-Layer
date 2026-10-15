import {connectJ4Debugger} from './j4-debugger-transport.mjs';
import {ensureJ4Workspace} from './j4-evidence-interruption.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {J4_SEND_C,J4_MIXED_TITLE} from './fixtures/j4-interruption.mjs';
const poll=async(read,label)=>{const end=Date.now()+20000;let last;while(Date.now()<end){last=await read();if(last)return last;await new Promise(r=>setTimeout(r,50));}throw Error('J4-joint-timeout:'+label);};
// Read only the currently attached extension frame. A prior frame's cached grant
// cannot establish readiness after route replacement or worker restart.
export async function currentJ4Grant(page,id,scopeKey,{previousGrant=null,expectedCurrentRef=null}={}){
 const url=`chrome-extension://${id}/workspace.html`,frame=page.frames().find(f=>!f.isDetached()&&f.url()===url);
 if(!frame)return null;
 let value;
 try{value=await frame.evaluate(()=>({grant:globalThis.j4Grant??null,scope:globalThis.j4LastScope??null,currentRef:globalThis.j4LastCurrentRef??null}));}
 catch(error){if(frame.isDetached()||!page.frames().includes(frame)||/Execution context was destroyed/.test(error.message))return null;throw error;}
 if(frame.isDetached()||frame.url()!==url||!page.frames().includes(frame)||typeof value?.grant!=='string'||!value.grant||value.grant===previousGrant||value.scope!==scopeKey||(expectedCurrentRef!==null&&value.currentRef!==expectedCurrentRef))return null;
 return {frame,grant:value.grant};
}
export function waitJ4Grant(page,id,scopeKey,options){return poll(()=>currentJ4Grant(page,id,scopeKey,options),'current-authorized-frame-grant');}
// A background peer may have surrendered its frame after the real worker stop.
// Foregrounding is a real browser action; this read only waits for its current proof.
export async function waitJ4PeerScope(page,id,scopeKey,{previousGrant=null,expectedCurrentRef=null,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const expectedURL=page.url(),deadline=now()+15000;
 while(now()<deadline){
  assert.equal(page.url(),expectedURL,'J4-peer-native-URL-changed');
  const current=await currentJ4Grant(page,id,scopeKey,{previousGrant,expectedCurrentRef});
  assert.equal(page.url(),expectedURL,'J4-peer-native-URL-changed');
  if(current&&now()<deadline)return scopeKey;
  if(now()<deadline)await sleep(Math.min(50,deadline-now()));
 }
 throw Error('J4-peer-current-scope-timeout');
}
export async function recoverJ4PeerByNativeNavigation({page,id,scopeKey,server,assets,scope,preserved}){
 const originalURL=page.url(),paths=['/c/'+J4_SEND_C,'/c/33333333-3333-4333-8333-333333333333'];
 assert.equal(originalURL,server.origin+paths[1]);
 const before=await page.evaluate(()=>{globalThis.j4PeerDocument=document;globalThis.j4PeerEditor=document.querySelector('textarea');return {draft:j4PeerEditor.value};});
 const requestStart=server.snapshot().nativeRequests.length;let previousGrant=(await currentJ4Grant(page,id,scopeKey))?.grant??null;
 for(const path of paths){
  await page.locator('textarea').click();
  previousGrant=(await currentJ4Grant(page,id,scopeKey))?.grant??previousGrant;
  const expectedCurrentRef=path.split('/').at(-1);
  await page.locator('aside nav[aria-label="Chat history"] a[href="'+path+'"]').click();
  await page.waitForURL(server.origin+path);
  assert.equal(await waitJ4PeerScope(page,id,scopeKey,{previousGrant,expectedCurrentRef}),scopeKey);
  const current=await currentJ4Grant(page,id,scopeKey,{previousGrant,expectedCurrentRef});assert(current,'J4-peer-new-route-grant-required');previousGrant=current.grant;
  const state=await page.evaluate(()=>({sameDocument:document===j4PeerDocument,sameEditor:document.querySelector('textarea')===j4PeerEditor,draft:j4PeerEditor.value}));
  assert(state.sameDocument&&state.sameEditor);assert.equal(state.draft,before.draft);
 }
 assert.equal(page.url(),originalURL);
 const requests=server.snapshot().nativeRequests.slice(requestStart);
 for(const path of paths)assert(requests.some(r=>r.path==='/backend-api/conversation/'+path.split('/').at(-1)&&r.context==='account-host-team'),'J4-peer-new-native-context-request-required');
 assert.deepEqual(await assets(scope),preserved);
 return {originalURL,finalURL:page.url(),sameDocument:true,sameEditor:true,draftPreserved:true,actualNativeRoutes:paths,context:'team',assetDigest:preserved.hash};
}
export async function j4ReadinessFacts(page,id){
 const facts={at:Date.now(),frames:[]};
 try{facts.native=await page.evaluate(()=>({url:location.href,readyState:document.readyState,visibility:document.visibilityState,focused:document.hasFocus(),state:document.documentElement.dataset.vaiwlState??null,reason:document.documentElement.dataset.vaiwlReason??null,ownedPopovers:document.querySelectorAll('[data-va-owned]:popover-open').length,returnButtonPresent:!!document.querySelector('[aria-label="返回工作空间"]')}));}catch(error){facts.nativeError=error.name;}
 for(const f of page.frames()){
  const item={url:f.url(),detached:f.isDetached()};facts.frames.push(item);
  if(item.url!==`chrome-extension://${id}/workspace.html`||item.detached)continue;
  try{Object.assign(item,await f.evaluate(()=>({grantPresent:typeof globalThis.j4Grant==='string'&&!!globalThis.j4Grant,scope:globalThis.j4LastScope??null,readyState:document.readyState,rpc:globalThis.j4RpcTrace??[]})));}catch(error){item.readError=error.name;}
 }
 return facts;
}
export async function waitJ4GrantWithDiagnostic(page,id,scopeKey,options,diagnostic){
 try{return await waitJ4Grant(page,id,scopeKey,options);}
 catch(error){try{await diagnostic({stage:'joint-current-frame-grant-failed',expectedScope:scopeKey,...await j4ReadinessFacts(page,id)});}catch{}throw error;}
}
// Debugger only suspends an existing production call. No JS evaluation, owner
// hooks, serialized grants, database writes or package edits establish authority.
export async function pauseJointDrain(cdp,id,{expectedTargetId=null}={}){
 await cdp.send('Target.setDiscoverTargets',{discover:true});
 const {targetInfos}=await cdp.send('Target.getTargets'),matches=targetInfos.filter(t=>t.type==='service_worker'&&t.url===`chrome-extension://${id}/extension/worker.mjs`);assert.equal(matches.length,1,'J4-unique-worker-target-required');const target=matches[0];if(expectedTargetId!==null)assert.equal(target.targetId,expectedTargetId,'J4-worker-lifecycle-target-mismatch');
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let sequence=0,paused=null;const requests=new Map(),scripts=[],resolutions=[],lifecycle=[];let detached=false,failure=null;const trace=(method,detail={})=>{lifecycle.push({at:Date.now(),method,...detail});if(lifecycle.length>32)lifecycle.shift();};
 const detach=e=>{if(e.sessionId!==sessionId)return;detached=true;failure='J4-debug-target-detached';trace('Target.detachedFromTarget',{targetId:e.targetId});for(const pending of requests.values())pending.reject(Error('J4-debug-target-detached'));requests.clear();};
 const transportClose=e=>{detached=true;failure=e.reason??'J4-debug-transport-closed';trace('transportClosed',e);for(const pending of requests.values())pending.reject(Error(failure));requests.clear();};
 const destroyed=e=>{if(e.targetId===target.targetId){detached=true;failure='J4-debug-target-destroyed';trace('Target.targetDestroyed',{targetId:e.targetId});}};
 cdp.on('Target.targetDestroyed',destroyed);cdp.on('Target.detachedFromTarget',detach);cdp.on('transportClosed',transportClose);
 const cleanup=()=>{cdp.off('Target.targetDestroyed',destroyed);cdp.off('Target.receivedMessageFromTarget',receive);cdp.off('Target.detachedFromTarget',detach);cdp.off('transportClosed',transportClose);};
 const receive=e=>{if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id){const pending=requests.get(m.id);if(pending){requests.delete(m.id);m.error?pending.reject(Error(m.error.message)):pending.resolve(m.result);}}else if(m.method==='Debugger.paused'){paused=m.params;trace(m.method,{hitBreakpoints:m.params.hitBreakpoints});}else if(m.method==='Debugger.resumed'){paused=null;trace(m.method);}else if(m.method==='Inspector.detached'){detached=true;failure='J4-debug-inspector-detached';trace(m.method,{reason:m.params.reason});}else if(m.method==='Runtime.executionContextsCleared')trace(m.method);else if(m.method==='Debugger.scriptParsed'&&['/src/runtime/host-continuation-owner.mjs','/src/data/free-evidence-repository.mjs'].some(path=>m.params.url.endsWith(path)))scripts.push({scriptId:m.params.scriptId,url:m.params.url});else if(m.method==='Debugger.breakpointResolved')resolutions.push(m.params);};
 cdp.on('Target.receivedMessageFromTarget',receive);
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++sequence;requests.set(n,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:n,method,params})}).catch(reject);});
 let result,location,lineNumber,repositoryBoundary;
 try{
  await send('Debugger.enable');
  await send('Debugger.setSkipAllPauses',{skip:false});
  await send('Debugger.setBreakpointsActive',{active:true});
  const url=`chrome-extension://${id}/src/runtime/host-continuation-owner.mjs`,matches=scripts.filter(s=>s.url===url);
  assert.equal(matches.length,1,'J4-production-drain-script-required');
  const scriptId=matches[0].scriptId,{scriptSource}=await send('Debugger.getScriptSource',{scriptId});
  const source=await readFile(new URL('../../src/runtime/host-continuation-owner.mjs',import.meta.url),'utf8');
  assert.equal(scriptSource,source,'J4-production-drain-source-mismatch');
  const lines=source.split('\n');lineNumber=lines.findIndex(l=>l.includes('result=await evidenceRepository.applyContinuation('));assert(lineNumber>=0);
  const columnNumber=lines[lineNumber].indexOf('applyContinuation('),possible=await send('Debugger.getPossibleBreakpoints',{start:{scriptId,lineNumber,columnNumber},end:{scriptId,lineNumber,columnNumber:columnNumber+'applyContinuation'.length},restrictToFunction:true});
  location=possible.locations?.find(p=>p.type==='call'&&p.scriptId===scriptId&&p.lineNumber===lineNumber&&p.columnNumber===columnNumber);
  assert(location,'J4-production-drain-breakpoint-unresolved');
  // Pause unconditionally at the actual call, after verifyCurrent. A conditional
  // breakpoint can silently skip on evaluation failure. The durable assertions
  // below independently require this to be the real mixed pending operation.
  result=await send('Debugger.setBreakpoint',{location:{scriptId,lineNumber,columnNumber}});
  assert.deepEqual(result.actualLocation,{scriptId,lineNumber,columnNumber},'J4-production-drain-breakpoint-moved');
  // The actual evidence writer has one continuation entry. Stop on its first
  // synchronous statement, before scope/gate lookup and before mutate opens IDB.
  // Keep the owner callsite as a diagnostic control; neither creates data.
  const repositoryURL=`chrome-extension://${id}/src/data/free-evidence-repository.mjs`,repositoryScripts=scripts.filter(s=>s.url===repositoryURL);assert.equal(repositoryScripts.length,1,'J4-evidence-repository-script-required');
  const repositoryScriptId=repositoryScripts[0].scriptId,{scriptSource:repositorySource}=await send('Debugger.getScriptSource',{scriptId:repositoryScriptId});
  assert.equal(repositorySource,await readFile(new URL('../../src/data/free-evidence-repository.mjs',import.meta.url),'utf8'),'J4-evidence-repository-source-mismatch');
  const repositoryLines=repositorySource.split('\n'),entryLine=repositoryLines.findIndex(l=>l.trim()==='async applyContinuation(scope,request,options={}){')+1;assert(entryLine>0,'J4-evidence-repository-entry-required');
  const entryLocations=await send('Debugger.getPossibleBreakpoints',{start:{scriptId:repositoryScriptId,lineNumber:entryLine,columnNumber:0},end:{scriptId:repositoryScriptId,lineNumber:entryLine+1,columnNumber:0},restrictToFunction:true});
  const entryLocation=entryLocations.locations?.filter(l=>l.scriptId===repositoryScriptId&&l.lineNumber===entryLine).sort((a,b)=>a.columnNumber-b.columnNumber)[0];assert(entryLocation&&entryLocation.columnNumber<=repositoryLines[entryLine].indexOf('.scopeOrThrow('),'J4-evidence-repository-entry-unresolved');
  const exactEntry={scriptId:repositoryScriptId,lineNumber:entryLine,columnNumber:entryLocation.columnNumber},installed=await send('Debugger.setBreakpoint',{location:exactEntry});assert.deepEqual(installed.actualLocation,exactEntry,'J4-evidence-repository-breakpoint-moved');repositoryBoundary={kind:'evidence-repository-continuation-entry',breakpointId:installed.breakpointId,location:exactEntry};
 }catch(error){cleanup();try{await cdp.send('Target.detachFromTarget',{sessionId});}catch{}throw error;}
 return {targetId:target.targetId,breakpoint:result.breakpointId,lineNumber,diagnostics:()=>structuredClone({targetId:target.targetId,lineNumber,locations:[result.actualLocation],repositoryBoundary,transport:'independent-flattened-CDP',lifecycle,detached,failure,scripts,resolutions,paused:paused?{reason:paused.reason,hitBreakpoints:paused.hitBreakpoints,frames:paused.callFrames?.map(f=>({functionName:f.functionName,url:f.url,location:f.location}))}:null}),verifyControl:async()=>{
  // Real pause/resume events establish control; no evaluation or business hook.
  await send('Debugger.pause');
  await poll(()=>{if(failure)throw Error(failure);return paused;},'debugger-control-paused');
  assert(!paused.hitBreakpoints?.length,'J4-debug-control-unexpected-breakpoint');trace('controlPauseVerified');
  await send('Debugger.resume');
  await poll(()=>{if(failure)throw Error(failure);return paused===null;},'debugger-control-resumed');trace('controlResumeVerified');
 },wait:async()=>{const hit=await poll(()=>{if(failure)throw Error(failure);return paused;},'production-joint-drain-breakpoint');const boundary=hit.hitBreakpoints?.includes(repositoryBoundary.breakpointId)?repositoryBoundary:hit.hitBreakpoints?.includes(result.breakpointId)?{kind:'continuation-owner-call',location:result.actualLocation}:null;assert(boundary,'J4-production-drain-unrelated-pause');assert.deepEqual(hit.callFrames?.[0]?.location,boundary.location,'J4-production-drain-wrong-callsite');return {...hit,boundary:boundary.kind};},async close(){cleanup();try{await cdp.send('Target.detachFromTarget',{sessionId});}catch{}}};
}
export async function runJ4JointInterruption({a,b,id,server,cdp,debugEndpoint,context,inspector,assets,preserved,personal,team,scopeOf,mounted,record,diagnostic=()=>{}}){
 const key=s=>JSON.stringify([s.provider,s.accountId,s.organizationId]),teamAssets=await assets(team);
 async function captureDrain(stage,pause){
  const facts={stage,at:Date.now(),breakpoint:pause.diagnostics(),nativeAccepts:server.snapshot().interruption.accepts,authenticatedReads:server.snapshot().interruption.reads,nativeRequests:server.snapshot().nativeRequests.slice(-64)};
  try{facts.presentation=await j4ReadinessFacts(a,id);}catch(error){facts.presentationError=error.message;}
  try{facts.durable=await inspect();}catch(error){facts.durableError=error.message;}
  try{const page=await inspector();facts.budget=await page.evaluate(async({scope,origin})=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs')),base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readonly'),q=tx.objectStore('b23_views').get('host-read-budget:'+digest([scope.accountId,scope.organizationId,origin]));tx.oncomplete=()=>resolve(q.result?{checksumValid:q.result.checksum===digest(q.result.payload),...q.result.payload}:null);tx.onabort=()=>reject(tx.error);});}finally{base.close();}},{scope:personal,origin:server.origin});}catch(error){facts.budgetError=error.message;}
  diagnostic(facts);
 }

 async function inspect(scope=personal){const page=await inspector();await a.bringToFront();return page.evaluate(async({scope,c})=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs')),{FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs'));const base=new ScopeRepository({indexedDB});try{const native=new NativeRepository({baseRepository:base}),facts=await native.read(scope),pending=await native.listContinuations(scope),evidence=await new FreeEvidenceRepository({baseRepository:base}).read(scope),db=await base.open(),receipts=await new Promise((resolve,reject)=>{const tx=db.transaction('native_operations','readonly'),q=tx.objectStore('native_operations').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.payload?.continuation?.scopeKey===base.scopeOrThrow(scope).key).map(r=>r.payload));tx.onabort=()=>reject(tx.error);});return {ref:facts.refs[c],nativeSources:facts.sources,pending,evidence,receipts};}finally{base.close();}},{scope,c:J4_SEND_C});}
 async function budgetWindow(){const page=await inspector();const budget=await page.evaluate(async({scope,origin})=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs')),base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readonly'),q=tx.objectStore('b23_views').get('host-read-budget:'+digest([scope.accountId,scope.organizationId,origin]));tx.oncomplete=()=>resolve(q.result?.payload?.startedAt??0);tx.onabort=()=>reject(tx.error);});}finally{base.close();}},{scope:personal,origin:server.origin});const waited=Math.max(0,budget+30001-Date.now());if(waited)await new Promise(r=>setTimeout(r,waited));return waited;}
 const waitedForFormalBudgetMs=await budgetWindow();await a.bringToFront();await a.locator('#model-button').click();await a.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();await a.locator(`aside nav[aria-label="Chat history"] a[href="/c/${J4_SEND_C}"]`).click();await a.waitForURL(server.origin+'/c/'+J4_SEND_C);await a.locator('[data-message-id="j4_original_old"]').first().waitFor();
 const before=await poll(async()=>{const v=await inspect();return v.ref?.nativeTitle==='Membership not loaded'?v:null;},'original-current-native-title');assert.equal(before.pending.length,0);const acceptsBefore=server.snapshot().interruption.accepts;assert.equal(acceptsBefore,1);
 const lifecycle=await context.newCDPSession(await inspector()),versions=[];lifecycle.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await lifecycle.send('ServiceWorker.enable');const running=await poll(()=>versions.find(v=>v.scriptURL===`chrome-extension://${id}/extension/worker.mjs`&&v.runningStatus==='running'),'worker-running');
 const {grant:oldGrant}=await waitJ4GrantWithDiagnostic(a,id,key(personal),{},facts=>diagnostic({...facts,requests:server.snapshot().nativeRequests.slice(-64),nativeAccepts:server.snapshot().interruption.accepts}));assert(running.targetId,'J4-worker-lifecycle-target-required');const debuggerCDP=await connectJ4Debugger(debugEndpoint);let pause;try{pause=await pauseJointDrain(debuggerCDP,id,{expectedTargetId:running.targetId});await pause.verifyControl();}catch(error){if(pause){diagnostic({stage:'joint-debugger-control-failed',reason:error.message,breakpoint:pause.diagnostics()});await pause.close();}debuggerCDP.close();throw error;}let sent,pending,traceBoundary;
 try{
  await captureDrain('joint-before-native-send',pause);
  await a.bringToFront();await a.locator('#j4-rename-on-send').check();await a.locator('textarea').fill('J4 explicit native mixed send');await a.locator('button[type="submit"]').click();await a.locator('#composer output').getByText('J4 native send accepted',{exact:true}).waitFor();const hit=await pause.wait();traceBoundary=hit.boundary;
  const accepted=server.snapshot().interruption;assert.equal(accepted.accepts,acceptsBefore+1);assert.equal(accepted.title,J4_MIXED_TITLE);assert.equal(accepted.held,false);sent=accepted.rows.at(-1);assert.equal(await a.locator('h1').textContent(),J4_MIXED_TITLE);
  const durable=await inspect();pending=durable.pending.find(r=>r.nativeWitness&&r.evidence.batch.hints.some(h=>h.messageId===sent.id));assert(pending,'SYS01_REAL_PACKAGE_NATIVE_PENDING_ATOMIC');assert.equal(pending.state,'pending-evidence');assert.equal(durable.ref.nativeTitle,J4_MIXED_TITLE);assert.equal(Object.values(durable.evidence.hints).filter(h=>h.messageId===sent.id).length,0);assert.notEqual(pending.nativeWitness.profileId,pending.admission.profileId);assert.deepEqual(await assets(personal),preserved);
  record('same-J4-native-send-renames-current-C-and-authenticated-ACK-commits-real-joint-pending',{messageId:sent.id,nativeTitle:durable.ref.nativeTitle,nativeOperationId:pending.operationId,payloadDigest:pending.payloadDigest,nativeWitness:pending.nativeWitness,ackAdmission:pending.admission,pauseBoundary:'UNMODIFIED_PRODUCTION_DRAIN_BEFORE_EVIDENCE_APPLY',breakpointBoundary:traceBoundary,waitedForFormalBudgetMs});
  const stopIndex=versions.length;await lifecycle.send('ServiceWorker.stopWorker',{versionId:running.versionId});await poll(()=>versions.slice(stopIndex).some(v=>v.versionId===running.versionId&&v.runningStatus==='stopped'),'worker-stopped');
 }catch(error){await captureDrain('joint-interruption-failed',pause);throw error;}finally{await pause.close();debuggerCDP.close();}
 const durableStopped=await inspect();assert(durableStopped.pending.some(r=>r.operationId===pending.operationId&&r.payloadDigest===pending.payloadDigest));assert.equal(durableStopped.ref.nativeTitle,J4_MIXED_TITLE);assert.equal(server.snapshot().interruption.accepts,acceptsBefore+1);
 await a.bringToFront();await a.reload();await a.locator('[data-message-id="'+sent.id+'"]').first().waitFor();await poll(()=>versions.some(v=>v.scriptURL===`chrome-extension://${id}/extension/worker.mjs`&&v.runningStatus==='running'&&versions.indexOf(v)>versions.findLastIndex(r=>r.runningStatus==='stopped')),'worker-restarted');const {grant:freshGrant}=await waitJ4GrantWithDiagnostic(a,id,key(personal),{previousGrant:oldGrant},diagnostic);assert.notEqual(freshGrant,oldGrant);let recovered;try{recovered=await poll(async()=>{const v=await inspect(),receipt=v.receipts.find(r=>r.operationId===pending.operationId);return receipt?.continuation?.state==='complete'?{...v,receipt}:null;},'same-joint-operation-complete-after-worker-restart');}catch(error){await captureDrain('joint-recovery-failed',pause);diagnostic({stage:'joint-recovery-expected-operation',operationId:pending.operationId,payloadDigest:pending.payloadDigest,originalNativeWitness:pending.nativeWitness,originalACKAdmission:pending.admission,workerVersions:versions.slice(-16)});throw error;}const hints=Object.values(recovered.evidence.hints).filter(h=>h.messageId===sent.id);assert.equal(hints.length,1);const original=pending.evidence.batch.hints.find(h=>h.messageId===sent.id);assert.equal(hints[0].firstObservedAt,original.firstObservedAt);assert.deepEqual(hints[0].ackWitness,original.ackWitness);assert.equal(recovered.ref.nativeTitle,J4_MIXED_TITLE);assert(!recovered.pending.some(r=>r.operationId===pending.operationId));assert.deepEqual(await assets(personal),preserved);assert.equal(server.snapshot().interruption.accepts,acceptsBefore+1);
 record('same-J4-real-worker-stop-recovers-native-title-and-one-original-ACK-without-send-replay',{nativeOperationId:pending.operationId,eventKey:hints[0].eventKey,firstObservedAt:hints[0].firstObservedAt,workerStopConfirmed:true,continuationState:recovered.receipt.continuation.state,assetDigest:preserved.hash});
 await budgetWindow();const readsBefore=server.snapshot().interruption.reads.filter(r=>r.authenticatedWorker&&r.finishedAt!==null).length;await a.bringToFront();await a.reload();await a.locator('[data-message-id="'+sent.id+'"]').first().waitFor();await poll(()=>server.snapshot().interruption.reads.filter(r=>r.authenticatedWorker&&r.finishedAt!==null).length>readsBefore,'second-authenticated-read');await poll(async()=>{const v=await inspect();return v.receipts.find(r=>r.operationId===pending.operationId)?.continuation?.state==='complete';},'idempotent-terminal');const repeated=await inspect();assert.deepEqual(Object.values(repeated.evidence.hints).filter(h=>h.messageId===sent.id),hints);assert.equal(server.snapshot().interruption.accepts,acceptsBefore+1);assert.equal(Object.values((await inspect(team)).evidence.hints).filter(h=>h.messageId===sent.id).length,0);assert.deepEqual(await assets(team),teamAssets);
 record('same-J4-joint-recovery-second-load-is-idempotent-and-peer-context-isolated',{nativeOperationId:pending.operationId,nativeAccepts:acceptsBefore+1});
 await a.bringToFront();await a.locator('#model-button').click();await a.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();await a.locator('aside nav[aria-label="Chat history"] a[href="/c/33333333-3333-4333-8333-333333333333"]').click();await a.waitForURL(server.origin+'/c/33333333-3333-4333-8333-333333333333');await ensureJ4Workspace(a,mounted);assert.equal(await scopeOf(a),key(personal));await b.bringToFront();let foregroundRecovered=false;
 try{assert.equal(await waitJ4PeerScope(b,id,key(team)),key(team));foregroundRecovered=true;}
 catch(error){try{diagnostic({stage:'joint-peer-scope-after-real-worker-stop',status:'FAIL',reason:error.message,...await j4ReadinessFacts(b,id)});}catch{}if(error.message!=='J4-peer-current-scope-timeout')throw error;}
 if(!foregroundRecovered){const recovery=await recoverJ4PeerByNativeNavigation({page:b,id,scopeKey:key(team),server,assets,scope:team,preserved:teamAssets});record('peer-real-native-navigation-establishes-new-C2-after-worker-memory-loss',{...recovery,automaticForegroundRecovery:'NOT_ESTABLISHED',foregroundFailure:'J4-peer-current-scope-timeout',authority:'NEW_NATIVE_REQUEST_AND_FRESH_AUTHENTICATION'});}
 await a.bringToFront();assert.equal(await waitJ4PeerScope(a,id,key(personal)),key(personal));assert.deepEqual(await assets(personal),preserved);
}
