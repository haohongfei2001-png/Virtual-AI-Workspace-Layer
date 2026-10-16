import {pauseJ4BeforeNativeCommit,readJ4NativeRawSnapshot,assertJ4NativeCommitRollback} from './j4-before-native-commit.mjs';
import {modernExpectedWorld} from './expected/modern.mjs';
import {connectJ4Debugger} from './j4-debugger-transport.mjs';
import {ensureJ4Workspace} from './j4-evidence-interruption.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
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
// Diagnostics are projections, never authority. Unknown objects/getters cannot
// escape into the report, and one broken field cannot suppress the others.
const diagnosticGet=(value,key)=>{try{return value?.[key];}catch{return null;}};
const diagnosticText=value=>typeof value==='string'?value.slice(0,160):null;
const diagnosticError=value=>{const name=diagnosticGet(value,'name');return ['Error','TypeError','RangeError','SyntaxError','TimeoutError','AssertionError'].includes(name)?name:'Error';};
const diagnosticContext=value=>['account-host-team','account-host-personal'].includes(value)?value:value==null?null:'other-context';
const diagnosticPath=value=>{if(typeof value!=='string'||value.length>512)return 'other-path';return /^\/(?:backend-api\/conversation|c)\/[0-9a-f-]{36}$/i.test(value)||value==='/native/route'?value:'other-path';};
const diagnosticKeys=new Set('truncated at stage status expectedURL expectedCurrentRef expectedScope previousGrantPresent reason freshExpectedGrant readinessError document documentError requestsError requestTraceError nativeRequestCount nativeRequests nativeRequestsTruncated browserRequests events dropped errors phase path context failure name sameDocument sameEditor draftLength conversationId readingVisibility messageNodes native nativeError frames framesError url detached getterError readError grantPresent scope currentRef readyState rpc type routeEpoch ok state hasGrant grantExpiresAt visibility focused ownedPopovers returnButtonPresent'.split(' '));
export function boundJ4Diagnostic(value){
 // Reserve space for the root truncation marker. Charge serialized UTF-8,
 // including keys, punctuation and nulls, after every field normalization.
 const budget={nodes:1024,bytes:16384-32},encoder=new TextEncoder();let truncated=false;
 const charge=n=>{if(n>budget.bytes){truncated=true;return false;}budget.bytes-=n;return true;};
 const scalar=v=>charge(encoder.encode(JSON.stringify(v)).length)?v:undefined;
 const visit=(v,depth=0)=>{
  if(--budget.nodes<0||depth>7){truncated=true;return undefined;}
  if(v===null||typeof v==='boolean')return scalar(v);
  if(typeof v==='number')return scalar(Number.isSafeInteger(v)&&v>=0?v:null);
  if(typeof v==='string'){if(v.length>160)truncated=true;return scalar(v.slice(0,160));}
  if(typeof v!=='object')return scalar(null);
  if(!charge(2))return undefined;
  if(Array.isArray(v)){
   const out=[],length=diagnosticGet(v,'length');if(length>64)truncated=true;
   for(let i=0;i<Math.min(length,64);i++){if(i&&!charge(1))break;const item=visit(diagnosticGet(v,i),depth+1);if(item===undefined)break;out.push(item);}return out;
  }
  const out={};for(const key of diagnosticKeys){let item=diagnosticGet(v,key);if(item===undefined)continue;
   if(key==='context')item=diagnosticContext(item);
   else if(key==='path')item=diagnosticPath(item);
   else if(['currentRef','expectedCurrentRef','conversationId'].includes(key))item=typeof item==='string'&&/^[0-9a-f-]{36}$/i.test(item)?item:null;
   if(!charge(encoder.encode(JSON.stringify(key)).length+1+(Object.keys(out).length?1:0)))break;
   const projected=visit(item,depth+1);if(projected===undefined)break;out[key]=projected;
  }return out;
 };
 try{const result=visit(value);if(result&&typeof result==='object'&&!Array.isArray(result)){if(truncated)result.truncated=true;return result;}return result??{truncated:true};}
 catch{return {truncated:true,stage:'diagnostic-projection-failed'};}
}
// Passive listeners on the existing page only; no request is started or changed.
export function observeJ4PeerRequests(page,origin){
 const events=[],errors=[],listeners=[];let dropped=0;
 const error=(stage,e)=>{if(errors.length<8)errors.push({stage,name:diagnosticError(e)});};
 const record=(phase,request,response=null)=>{try{const url=new URL(request.url());if(url.origin!==origin||!/^\/(?:backend-api\/conversation\/|native\/route$)/.test(url.pathname))return;const row={at:Date.now(),phase,path:diagnosticPath(url.pathname),context:diagnosticContext(diagnosticGet(request.headers(),'chatgpt-account-id'))};if(response){const status=response.status();row.status=Number.isInteger(status)&&status>=100&&status<=599?status:null;}if(phase==='failed')row.failure=(typeof diagnosticGet(request.failure(),'errorText')==='string'&&/^net::ERR_[A-Z_]{1,64}$/.test(diagnosticGet(request.failure(),'errorText'))?diagnosticGet(request.failure(),'errorText'):null);if(events.length===64){events.shift();dropped++;}events.push(row);}catch(e){error(phase,e);}};
 for(const [event,listener]of [['request',r=>record('request',r)],['response',r=>{try{record('response',r.request(),r);}catch(e){error('response-request',e);}}],['requestfailed',r=>record('failed',r)]]){try{page.on(event,listener);listeners.push([event,listener]);}catch(e){error('attach-'+event,e);}}
 return {snapshot:()=>boundJ4Diagnostic({events,dropped,errors}),close(){for(const [event,listener]of listeners.splice(0)){try{page.off(event,listener);}catch(e){error('detach-'+event,e);}}}};
}
// Observe the failed native hop without issuing requests, changing presentation,
// or accepting cached scope as authority. Keep the original failure unchanged.
export async function j4PeerHopFacts({page,id,server,requestStart,path,scopeKey,previousGrant,error=null,requestTrace=null}){
 const facts={stage:'joint-peer-native-hop-state',status:error?'FAIL':'OBSERVED',expectedURL:server.origin+path,expectedCurrentRef:path.split('/').at(-1),expectedScope:scopeKey,previousGrantPresent:typeof previousGrant==='string',...(error?{reason:diagnosticText(diagnosticGet(error,'message'))}:{})};
 try{Object.assign(facts,await j4ReadinessFacts(page,id));facts.freshExpectedGrant=!!await currentJ4Grant(page,id,scopeKey,{previousGrant,expectedCurrentRef:facts.expectedCurrentRef});}catch(failure){facts.readinessError=diagnosticError(failure);}
 try{facts.document=await page.evaluate(()=>{const reading=document.querySelector('#reading'),editor=document.querySelector('textarea');return {sameDocument:document===globalThis.j4PeerDocument,sameEditor:editor===globalThis.j4PeerEditor,draftLength:editor?.value?.length??null,conversationId:reading?.getAttribute('data-conversation-id')??null,readingVisibility:reading?getComputedStyle(reading).visibility:null,messageNodes:reading?.querySelectorAll('[data-message-id]').length??0};});}catch(failure){facts.documentError=diagnosticError(failure);}
 try{const rows=server.snapshot().nativeRequests.slice(requestStart);facts.nativeRequestCount=rows.length;facts.nativeRequests=rows.slice(-64).map(({path,context})=>({path,context}));facts.nativeRequestsTruncated=rows.length>64;}catch(failure){facts.requestsError=diagnosticError(failure);}
 if(requestTrace)try{facts.browserRequests=requestTrace.snapshot();}catch(failure){facts.requestTraceError=diagnosticError(failure);}
 try{return boundJ4Diagnostic(facts);}catch{return {stage:'diagnostic-projection-failed'};}
}
export async function recoverJ4PeerByNativeNavigation({page,id,scopeKey,server,assets,scope,preserved,onHop=()=>{}}){
 const originalURL=page.url(),paths=['/c/'+J4_SEND_C,'/c/33333333-3333-4333-8333-333333333333'];
 assert.equal(originalURL,server.origin+paths[1]);
 const before=await page.evaluate(()=>{globalThis.j4PeerDocument=document;globalThis.j4PeerEditor=document.querySelector('textarea');return {draft:j4PeerEditor.value};});
 const requestStart=server.snapshot().nativeRequests.length;let previousGrant=(await currentJ4Grant(page,id,scopeKey))?.grant??null;
 for(const path of paths){
  await page.locator('textarea').click();
  const expectedCurrentRef=path.split('/').at(-1);
  let link=page.locator('aside nav[aria-label="Chat history"] a[href="'+path+'"]');
  if(path===paths[1]){
   const expected=modernExpectedWorld.conversations.find(row=>row.id===expectedCurrentRef);assert(expected);
   await page.locator('#search-button').click();await page.locator('#search-dialog input').fill(expected.title);
   link=page.locator('#search-dialog a[href="'+path+'"]');
  }
  previousGrant=(await currentJ4Grant(page,id,scopeKey))?.grant??previousGrant;
  const hopRequestStart=server.snapshot().nativeRequests.length,requestTrace=observeJ4PeerRequests(page,server.origin);
  try{
   await link.click();
   await page.waitForURL(server.origin+path);
   assert.equal(await waitJ4PeerScope(page,id,scopeKey,{previousGrant,expectedCurrentRef}),scopeKey);
  }catch(error){
   requestTrace.close();
   try{await onHop(await j4PeerHopFacts({page,id,server,requestStart:hopRequestStart,path,scopeKey,previousGrant,error,requestTrace}));}catch{}
   throw error;
  }finally{requestTrace.close();}
  const current=await currentJ4Grant(page,id,scopeKey,{previousGrant,expectedCurrentRef});assert(current,'J4-peer-new-route-grant-required');previousGrant=current.grant;
  const state=await page.evaluate(()=>({sameDocument:document===j4PeerDocument,sameEditor:document.querySelector('textarea')===j4PeerEditor,draft:j4PeerEditor.value}));
  assert(state.sameDocument&&state.sameEditor);assert.equal(state.draft,before.draft);
  try{await onHop({stage:'joint-peer-native-hop',status:'PASS',nativeURL:page.url(),currentRef:expectedCurrentRef,newGrant:true,scope:scopeKey,sameDocument:true,sameEditor:true,draftPreserved:true});}catch{}
 }
 assert.equal(page.url(),originalURL);
 const requests=server.snapshot().nativeRequests.slice(requestStart);
 for(const path of paths)assert(requests.some(r=>r.path==='/backend-api/conversation/'+path.split('/').at(-1)&&r.context==='account-host-team'),'J4-peer-new-native-context-request-required');
 assert.deepEqual(await assets(scope),preserved);
 return {originalURL,finalURL:page.url(),sameDocument:true,sameEditor:true,draftPreserved:true,actualNativeRoutes:paths,context:'team',assetDigest:preserved.hash};
}
export async function j4ReadinessFacts(page,id){
 const facts={at:Date.now(),frames:[]};
 try{facts.native=await page.evaluate(()=>({url:location.href,readyState:document.readyState,visibility:document.visibilityState,focused:document.hasFocus(),state:document.documentElement.dataset.vaiwlState??null,reason:document.documentElement.dataset.vaiwlReason??null,ownedPopovers:document.querySelectorAll('[data-va-owned]:popover-open').length,returnButtonPresent:!!document.querySelector('[aria-label="返回工作空间"]')}));}catch(error){facts.nativeError=diagnosticError(error);}
 let frames=[];try{frames=page.frames();}catch(error){facts.framesError=diagnosticError(error);}
 for(const f of frames.slice(0,16)){
  let item;try{item={url:f.url(),detached:f.isDetached()};}catch(error){facts.frames.push({getterError:diagnosticError(error)});continue;}facts.frames.push(item);
  if(item.url!==`chrome-extension://${id}/workspace.html`||item.detached)continue;
  try{Object.assign(item,await f.evaluate(()=>({grantPresent:typeof globalThis.j4Grant==='string'&&!!globalThis.j4Grant,scope:globalThis.j4LastScope??null,currentRef:globalThis.j4LastCurrentRef??null,readyState:document.readyState,rpc:globalThis.j4RpcTrace??[]})));}catch(error){item.readError=diagnosticError(error);}
 }
 try{return boundJ4Diagnostic(facts);}catch{return {stage:'diagnostic-projection-failed'};}
}
export async function waitJ4GrantWithDiagnostic(page,id,scopeKey,options,diagnostic){
 try{return await waitJ4Grant(page,id,scopeKey,options);}
 catch(error){try{await diagnostic({stage:'joint-current-frame-grant-failed',expectedScope:scopeKey,...await j4ReadinessFacts(page,id)});}catch{}throw error;}
}
// Debugger only suspends an existing production call. No JS evaluation, owner
// hooks, serialized grants, database writes or package edits establish authority.
export function locateClassicJointBoundaries(source,{afterEvidence=false}={}){
 const lines=source.split('\n');
 const unique=(text,label)=>{const found=lines.flatMap((line,i)=>line.includes(text)?[i]:[]);assert.equal(found.length,1,'J4-classic-'+label+'-unique-anchor-required');return found[0];};
 const method=afterEvidence?'markContinuationComplete':'applyContinuation',owner=unique(afterEvidence?'const completed = await nativeRepository.markContinuationComplete(':'result = await evidenceRepository.applyContinuation(','owner-call');
 const entry=unique(afterEvidence?'markContinuationComplete(scope, input, options = {}) {':'async applyContinuation(scope, request, options = {}) {','repository-entry')+1;
 assert(lines[entry].includes(afterEvidence?'return this.#markContinuation(scope, input, options, "complete");':'const normalized = this.base.scopeOrThrow(scope)'), 'J4-classic-repository-first-statement-required');
 return {owner,ownerColumn:lines[owner].indexOf(method+'('),entry,entryColumn:afterEvidence?lines[entry].indexOf('return this.#markContinuation'):0,entryLastColumn:lines[entry].indexOf(afterEvidence?'#markContinuation':'.scopeOrThrow(')};
}
export async function pauseJointDrain(cdp,id,{packageRoot,expectedTargetId=null,afterEvidence=false}={}){
 assert.equal(typeof packageRoot,'string','J4-classic-package-root-required');
 const compiled=compileClassicWorker(packageRoot),entry=await readFile(join(packageRoot,'extension/worker.mjs'),'utf8'),runtime=await readFile(join(packageRoot,'extension/classic-runtime.js'),'utf8');
 assert.equal(entry,compiled.entry,'J4-classic-entry-build-mismatch');assert.equal(runtime,compiled.runtime,'J4-classic-runtime-build-mismatch');
 assert.deepEqual(JSON.parse(await readFile(join(packageRoot,'manifest.json'),'utf8')).background,{service_worker:'extension/worker.mjs'},'J4-classic-background-required');
 return pauseJointDrainCore(cdp,id,{expectedTargetId,afterEvidence,classicSource:runtime});
}
// Explicit Node unit-fixture adapter only. Formal browser callers never use this
// ESM source oracle; it retains the independent real-V8 original-boundary tests.
export function pauseJointDrainModuleFixture(cdp,id,options={}){return pauseJointDrainCore(cdp,id,options);}
async function pauseJointDrainCore(cdp,id,{expectedTargetId=null,afterEvidence=false,classicSource=null}={}){
 await cdp.send('Target.setDiscoverTargets',{discover:true});
 const {targetInfos}=await cdp.send('Target.getTargets'),matches=targetInfos.filter(t=>t.type==='service_worker'&&t.url===`chrome-extension://${id}/extension/worker.mjs`);assert.equal(matches.length,1,'J4-unique-worker-target-required');const target=matches[0];if(expectedTargetId!==null)assert.equal(target.targetId,expectedTargetId,'J4-worker-lifecycle-target-mismatch');
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let sequence=0,paused=null;const requests=new Map(),scripts=[],resolutions=[],lifecycle=[];let detached=false,failure=null;const trace=(method,detail={})=>{lifecycle.push({at:Date.now(),method,...detail});if(lifecycle.length>32)lifecycle.shift();};
 const detach=e=>{if(e.sessionId!==sessionId)return;detached=true;failure='J4-debug-target-detached';trace('Target.detachedFromTarget',{targetId:e.targetId});for(const pending of requests.values())pending.reject(Error('J4-debug-target-detached'));requests.clear();};
 const transportClose=e=>{detached=true;failure=e.reason??'J4-debug-transport-closed';trace('transportClosed',e);for(const pending of requests.values())pending.reject(Error(failure));requests.clear();};
 const destroyed=e=>{if(e.targetId===target.targetId){detached=true;failure='J4-debug-target-destroyed';trace('Target.targetDestroyed',{targetId:e.targetId});}};
 cdp.on('Target.targetDestroyed',destroyed);cdp.on('Target.detachedFromTarget',detach);cdp.on('transportClosed',transportClose);
 const cleanup=()=>{cdp.off('Target.targetDestroyed',destroyed);cdp.off('Target.receivedMessageFromTarget',receive);cdp.off('Target.detachedFromTarget',detach);cdp.off('transportClosed',transportClose);};
 const receive=e=>{if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id){const pending=requests.get(m.id);if(pending){requests.delete(m.id);m.error?pending.reject(Error(m.error.message)):pending.resolve(m.result);}}else if(m.method==='Debugger.paused'){paused=m.params;trace(m.method,{hitBreakpoints:m.params.hitBreakpoints});}else if(m.method==='Debugger.resumed'){paused=null;trace(m.method);}else if(m.method==='Inspector.detached'){detached=true;failure='J4-debug-inspector-detached';trace(m.method,{reason:m.params.reason});}else if(m.method==='Runtime.executionContextsCleared')trace(m.method);else if(m.method==='Debugger.scriptParsed'&&(classicSource?['/extension/classic-runtime.js']:['/src/runtime/host-continuation-owner.mjs','/src/data/free-evidence-repository.mjs','/src/data/native-repository.mjs']).some(path=>m.params.url.endsWith(path)))scripts.push({scriptId:m.params.scriptId,url:m.params.url});else if(m.method==='Debugger.breakpointResolved')resolutions.push(m.params);};
 cdp.on('Target.receivedMessageFromTarget',receive);
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++sequence;requests.set(n,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:n,method,params})}).catch(reject);});
 let result,location,lineNumber,repositoryBoundary;
 try{
  await send('Debugger.enable');
  await send('Debugger.setSkipAllPauses',{skip:false});
  await send('Debugger.setBreakpointsActive',{active:true});
  const url=`chrome-extension://${id}/`+(classicSource?'extension/classic-runtime.js':'src/runtime/host-continuation-owner.mjs'),matches=scripts.filter(s=>s.url===url);
  assert.equal(matches.length,1,'J4-production-drain-script-required');
  const scriptId=matches[0].scriptId,{scriptSource}=await send('Debugger.getScriptSource',{scriptId});
  const source=classicSource??await readFile(new URL('../../src/runtime/host-continuation-owner.mjs',import.meta.url),'utf8');
  assert.equal(scriptSource,source,'J4-production-drain-source-mismatch');
  const classic=classicSource?locateClassicJointBoundaries(classicSource,{afterEvidence}):null,lines=source.split('\n'),method=afterEvidence?'markContinuationComplete':'applyContinuation';lineNumber=classic?.owner??lines.findIndex(l=>l.includes(afterEvidence?'const completed=await nativeRepository.markContinuationComplete(':'result=await evidenceRepository.applyContinuation('));assert(lineNumber>=0);
  const columnNumber=lines[lineNumber].indexOf(method+'('),possible=await send('Debugger.getPossibleBreakpoints',{start:{scriptId,lineNumber,columnNumber},end:{scriptId,lineNumber,columnNumber:columnNumber+method.length},restrictToFunction:true});
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
  if(!afterEvidence){
  const repositoryURL=classicSource?url:`chrome-extension://${id}/src/data/free-evidence-repository.mjs`,repositoryScripts=scripts.filter(s=>s.url===repositoryURL);assert.equal(repositoryScripts.length,1,'J4-evidence-repository-script-required');
  const repositoryScriptId=repositoryScripts[0].scriptId,{scriptSource:repositorySource}=await send('Debugger.getScriptSource',{scriptId:repositoryScriptId});
  assert.equal(repositorySource,classicSource??await readFile(new URL('../../src/data/free-evidence-repository.mjs',import.meta.url),'utf8'),'J4-evidence-repository-source-mismatch');
  const repositoryLines=repositorySource.split('\n'),entryLine=classic?.entry??(repositoryLines.findIndex(l=>l.trim()==='async applyContinuation(scope,request,options={}){')+1);assert(entryLine>0,'J4-evidence-repository-entry-required');
  const entryLocations=await send('Debugger.getPossibleBreakpoints',{start:{scriptId:repositoryScriptId,lineNumber:entryLine,columnNumber:0},end:{scriptId:repositoryScriptId,lineNumber:entryLine+1,columnNumber:0},restrictToFunction:true});
  const entryLocation=entryLocations.locations?.filter(l=>l.scriptId===repositoryScriptId&&l.lineNumber===entryLine).sort((a,b)=>a.columnNumber-b.columnNumber)[0];assert(entryLocation&&entryLocation.columnNumber<=repositoryLines[entryLine].indexOf('.scopeOrThrow('),'J4-evidence-repository-entry-unresolved');
  const exactEntry={scriptId:repositoryScriptId,lineNumber:entryLine,columnNumber:entryLocation.columnNumber},installed=await send('Debugger.setBreakpoint',{location:exactEntry});assert.deepEqual(installed.actualLocation,exactEntry,'J4-evidence-repository-breakpoint-moved');repositoryBoundary={kind:'evidence-repository-continuation-entry',breakpointId:installed.breakpointId,location:exactEntry};
  }else{
   // Some Chromium builds do not pause on the async owner's callsite. The
   // actual synchronous completion method is the same durable boundary.
   const repositoryURL=classicSource?url:`chrome-extension://${id}/src/data/native-repository.mjs`,matches=scripts.filter(s=>s.url===repositoryURL);assert.equal(matches.length,1,'J4-native-repository-script-required');
   const scriptId=matches[0].scriptId,{scriptSource}=await send('Debugger.getScriptSource',{scriptId});
   assert.equal(scriptSource,classicSource??await readFile(new URL('../../src/data/native-repository.mjs',import.meta.url),'utf8'),'J4-native-repository-source-mismatch');
   const lines=scriptSource.split('\n'),lineNumber=classic?.entry??lines.findIndex(line=>line.includes('markContinuationComplete(scope,input,options={}){return this.#markContinuation('));assert(lineNumber>=0,'J4-native-completion-entry-required');
   const columnNumber=lines[lineNumber].indexOf('return this.#markContinuation'),possible=await send('Debugger.getPossibleBreakpoints',{start:{scriptId,lineNumber,columnNumber},end:{scriptId,lineNumber:lineNumber+1,columnNumber:0},restrictToFunction:true});
   const entry=possible.locations?.filter(p=>p.scriptId===scriptId&&p.lineNumber===lineNumber&&p.columnNumber>=columnNumber&&p.columnNumber<=lines[lineNumber].indexOf('#markContinuation')).sort((a,b)=>a.columnNumber-b.columnNumber)[0];assert(entry,'J4-native-completion-entry-unresolved');
   const exact={scriptId,lineNumber,columnNumber:entry.columnNumber},installed=await send('Debugger.setBreakpoint',{location:exact});assert.deepEqual(installed.actualLocation,exact,'J4-native-completion-breakpoint-moved');repositoryBoundary={kind:'native-repository-completion-entry',breakpointId:installed.breakpointId,location:exact};
  }
 }catch(error){cleanup();try{await cdp.send('Target.detachFromTarget',{sessionId});}catch{}throw error;}
 return {targetId:target.targetId,breakpoint:result.breakpointId,lineNumber,diagnostics:()=>structuredClone({targetId:target.targetId,lineNumber,locations:[result.actualLocation],repositoryBoundary,transport:'independent-flattened-CDP',lifecycle,detached,failure,scripts,resolutions,paused:paused?{reason:paused.reason,hitBreakpoints:paused.hitBreakpoints,frames:paused.callFrames?.map(f=>({functionName:f.functionName,url:f.url,location:f.location}))}:null}),verifyControl:async()=>{
  // Real pause/resume events establish control; no evaluation or business hook.
  await send('Debugger.pause');
  await poll(()=>{if(failure)throw Error(failure);return paused;},'debugger-control-paused');
  assert(!paused.hitBreakpoints?.length,'J4-debug-control-unexpected-breakpoint');trace('controlPauseVerified');
  await send('Debugger.resume');
  await poll(()=>{if(failure)throw Error(failure);return paused===null;},'debugger-control-resumed');trace('controlResumeVerified');
 },wait:async()=>{const hit=await poll(()=>{if(failure)throw Error(failure);return paused;},'production-joint-drain-breakpoint');const boundary=repositoryBoundary&&hit.hitBreakpoints?.includes(repositoryBoundary.breakpointId)?repositoryBoundary:hit.hitBreakpoints?.includes(result.breakpointId)?{kind:afterEvidence?'continuation-owner-complete-call':'continuation-owner-call',location:result.actualLocation}:null;assert(boundary,'J4-production-drain-unrelated-pause');assert.deepEqual(hit.callFrames?.[0]?.location,boundary.location,'J4-production-drain-wrong-callsite');return {...hit,boundary:boundary.kind};},async close(){cleanup();try{await cdp.send('Target.detachFromTarget',{sessionId});}catch{}}};
}
export async function runJ4JointInterruption({a,b,id,server,cdp,debugEndpoint,packageRoot,context,inspector,assets,preserved,personal,team,scopeOf,mounted,record,diagnostic=()=>{},afterEvidence=false,codecRoundTrip=null,beforeNativeCommit=false}){
 assert(!(beforeNativeCommit&&(afterEvidence||codecRoundTrip)),'J4-before-native-exclusive-boundary');
 const key=s=>JSON.stringify([s.provider,s.accountId,s.organizationId]),teamAssets=await assets(team);
 async function captureDrain(stage,pause){
  const facts={stage,at:Date.now(),breakpoint:pause.diagnostics(),nativeAccepts:server.snapshot().interruption.accepts,authenticatedReads:server.snapshot().interruption.reads,nativeRequests:server.snapshot().nativeRequests.slice(-64)};
  try{facts.presentation=await j4ReadinessFacts(a,id);}catch(error){facts.presentationError=error.message;}
  try{facts.durable=await inspect();}catch(error){facts.durableError=error.message;}
  try{const page=await inspector();facts.budget=await page.evaluate(async({scope,origin})=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs')),base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readonly'),q=tx.objectStore('b23_views').get('host-read-budget:'+digest([scope.accountId,scope.organizationId,origin]));tx.oncomplete=()=>resolve(q.result?{checksumValid:q.result.checksum===digest(q.result.payload),...q.result.payload}:null);tx.onabort=()=>reject(tx.error);});}finally{base.close();}},{scope:personal,origin:server.origin});}catch(error){facts.budgetError=error.message;}
  diagnostic(facts);
 }

 async function inspect(scope=personal){const page=await inspector();await a.bringToFront();return page.evaluate(async({scope,c})=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs')),{FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs'));const base=new ScopeRepository({indexedDB});try{const native=new NativeRepository({baseRepository:base}),facts=await native.read(scope),pending=await native.listContinuations(scope),evidence=await new FreeEvidenceRepository({baseRepository:base}).read(scope),db=await base.open(),receipts=await new Promise((resolve,reject)=>{const tx=db.transaction('native_operations','readonly'),q=tx.objectStore('native_operations').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.payload?.continuation?.scopeKey===base.scopeOrThrow(scope).key).map(r=>r.payload));tx.onabort=()=>reject(tx.error);});return {ref:facts.refs[c],nativeSources:facts.sources,pending,evidence,receipts};}finally{base.close();}},{scope,c:J4_SEND_C});}
 async function evidenceReceipt(pending,{requireAbsent=false}={}){
  const page=await inspector();return page.evaluate(async({scope,pending,requireAbsent})=>{
   const [{ScopeRepository},{freeEvidenceKey},{digest},{continuationEvidenceFingerprint}]=await Promise.all([import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs')),import(chrome.runtime.getURL('src/data/hash.mjs')),import(chrome.runtime.getURL('src/data/native-observation-continuation.mjs'))]);
   const base=new ScopeRepository({indexedDB});try{
    const normalized=base.scopeOrThrow(scope),key=JSON.stringify([freeEvidenceKey(normalized.key),pending.evidence.operationId]),db=await base.open();
    const row=await new Promise((resolve,reject)=>{const tx=db.transaction('native_operations','readonly'),q=tx.objectStore('native_operations').get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
    if(requireAbsent){if(row!==undefined)throw Error('J4-before-evidence-receipt-must-be-absent');return null;}
    if(!row||row.key!==key||row.checksum!==digest(row.payload)||row.payload.kind!=='OBSERVE_HOST_CONTINUATION'||row.payload.operationId!==pending.evidence.operationId||row.payload.fingerprint!==continuationEvidenceFingerprint(pending,normalized)||!Number.isSafeInteger(row.payload.revision)||row.payload.revision<1)throw Error('J4-committed-evidence-receipt-required');
    return row;
   }finally{base.close();}
  },{scope:personal,pending,requireAbsent});
 }
 async function budgetWindow(){const page=await inspector();const budget=await page.evaluate(async({scope,origin})=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs')),base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readonly'),q=tx.objectStore('b23_views').get('host-read-budget:'+digest([scope.accountId,scope.organizationId,origin]));tx.oncomplete=()=>resolve(q.result?.payload?.startedAt??0);tx.onabort=()=>reject(tx.error);});}finally{base.close();}},{scope:personal,origin:server.origin});const waited=Math.max(0,budget+30001-Date.now());if(waited)await new Promise(r=>setTimeout(r,waited));return waited;}
 const waitedForFormalBudgetMs=await budgetWindow();await a.bringToFront();await a.locator('#model-button').click();await a.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();await a.locator(`aside nav[aria-label="Chat history"] a[href="/c/${J4_SEND_C}"]`).click();await a.waitForURL(server.origin+'/c/'+J4_SEND_C);await a.locator('[data-message-id="j4_original_old"]').first().waitFor();
 const before=await poll(async()=>{const v=await inspect();return v.ref?.nativeTitle==='Membership not loaded'?v:null;},'original-current-native-title');assert.equal(before.pending.length,0);const acceptsBefore=server.snapshot().interruption.accepts;assert.equal(acceptsBefore,1);
 const lifecycle=await context.newCDPSession(await inspector()),versions=[];lifecycle.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await lifecycle.send('ServiceWorker.enable');const running=await poll(()=>versions.find(v=>v.scriptURL===`chrome-extension://${id}/extension/worker.mjs`&&v.runningStatus==='running'),'worker-running');
 const {grant:oldGrant}=await waitJ4GrantWithDiagnostic(a,id,key(personal),{},facts=>diagnostic({...facts,requests:server.snapshot().nativeRequests.slice(-64),nativeAccepts:server.snapshot().interruption.accepts}));assert(running.targetId,'J4-worker-lifecycle-target-required');const debuggerCDP=await connectJ4Debugger(debugEndpoint);let pause;try{pause=beforeNativeCommit?await pauseJ4BeforeNativeCommit(debuggerCDP,id,{packageRoot,expectedTargetId:running.targetId}):await pauseJointDrain(debuggerCDP,id,{packageRoot,expectedTargetId:running.targetId,afterEvidence});await pause.verifyControl();}catch(error){if(pause){diagnostic({stage:'joint-debugger-control-failed',reason:error.message,breakpoint:pause.diagnostics()});await pause.close();}debuggerCDP.close();throw error;}let sent,pending,traceBoundary,committedHints,committedReceipt,uncommittedFacts,rawBefore,rawAfter,workerStopped=false;
 try{
  await captureDrain('joint-before-native-send',pause);
  if(beforeNativeCommit)rawBefore=await readJ4NativeRawSnapshot(await inspector());
  await a.bringToFront();await a.locator('#j4-rename-on-send').check();await a.locator('textarea').fill('J4 explicit native mixed send');await a.locator('button[type="submit"]').click();await a.locator('#composer output').getByText('J4 native send accepted',{exact:true}).waitFor();const hit=await pause.wait();traceBoundary=hit.boundary;
  const accepted=server.snapshot().interruption;assert.equal(accepted.accepts,acceptsBefore+1);assert.equal(accepted.title,J4_MIXED_TITLE);assert.equal(accepted.held,false);sent=accepted.rows.at(-1);assert.equal(await a.locator('h1').textContent(),J4_MIXED_TITLE);
  if(beforeNativeCommit){uncommittedFacts=hit.facts;assert.equal(uncommittedFacts.scopeKey,key(personal));}
  else {const durable=await inspect();pending=durable.pending.find(r=>r.nativeWitness&&r.evidence.batch.hints.some(h=>h.messageId===sent.id));assert(pending,'SYS01_REAL_PACKAGE_NATIVE_PENDING_ATOMIC');assert.equal(pending.state,'pending-evidence');assert.equal(durable.ref.nativeTitle,J4_MIXED_TITLE);committedHints=Object.values(durable.evidence.hints).filter(h=>h.messageId===sent.id);assert.equal(committedHints.length,afterEvidence?1:0);if(afterEvidence){committedReceipt=await evidenceReceipt(pending);assert(committedReceipt.payload.revision<=durable.evidence.revision);const original=pending.evidence.batch.hints.find(h=>h.messageId===sent.id);assert.equal(committedHints[0].firstObservedAt,original.firstObservedAt);assert.deepEqual(committedHints[0].ackWitness,original.ackWitness);}assert.notEqual(pending.nativeWitness.profileId,pending.admission.profileId);assert.deepEqual(await assets(personal),preserved);
  record('same-J4-native-send-renames-current-C-and-authenticated-ACK-commits-real-joint-pending',{messageId:sent.id,nativeTitle:durable.ref.nativeTitle,nativeOperationId:pending.operationId,payloadDigest:pending.payloadDigest,nativeWitness:pending.nativeWitness,ackAdmission:pending.admission,pauseBoundary:afterEvidence?'UNMODIFIED_PRODUCTION_AFTER_EVIDENCE_BEFORE_COMPLETE':'UNMODIFIED_PRODUCTION_DRAIN_BEFORE_EVIDENCE_APPLY',breakpointBoundary:traceBoundary,waitedForFormalBudgetMs});}
  const stopIndex=versions.length;await lifecycle.send('ServiceWorker.stopWorker',{versionId:running.versionId});await poll(()=>versions.slice(stopIndex).some(v=>v.versionId===running.versionId&&v.runningStatus==='stopped'),'worker-stopped');workerStopped=true;
 }catch(error){if(beforeNativeCommit)diagnostic({stage:'before-native-interruption-failed',reason:error.message,breakpoint:pause.diagnostics()});else await captureDrain('joint-interruption-failed',pause);throw error;}finally{await pause.close();debuggerCDP.close();}
 if(beforeNativeCommit){
  rawAfter=await readJ4NativeRawSnapshot(await inspector());
  let rollback;try{rollback=assertJ4NativeCommitRollback({before:rawBefore,after:rawAfter,facts:uncommittedFacts,workerStopped,nativeAcceptsBefore:acceptsBefore+1,nativeAcceptsAfter:server.snapshot().interruption.accepts,assetsBefore:preserved,assetsAfter:await assets(personal)});}
  catch(error){diagnostic({stage:'before-native-rollback-oracle-failed',facts:uncommittedFacts,workerStopped,before:rawBefore,after:rawAfter});throw error;}
  record('same-J4-real-worker-stop-aborts-queued-native-Shared-and-continuation-writes',{...rollback,breakpointBoundary:traceBoundary,nativeOperationId:uncommittedFacts.operationId,messageId:sent.id});
  const stopped=await inspect();assert.equal(stopped.ref.nativeTitle,before.ref.nativeTitle);assert.equal(stopped.pending.length,0);assert.equal(Object.values(stopped.evidence.hints).filter(h=>h.messageId===sent.id).length,0);
 }else {const durableStopped=await inspect();assert(durableStopped.pending.some(r=>r.operationId===pending.operationId&&r.payloadDigest===pending.payloadDigest));assert.equal(durableStopped.ref.nativeTitle,J4_MIXED_TITLE);if(afterEvidence){assert.deepEqual(Object.values(durableStopped.evidence.hints).filter(h=>h.messageId===sent.id),committedHints);assert.deepEqual(await evidenceReceipt(pending),committedReceipt);}assert.equal(server.snapshot().interruption.accepts,acceptsBefore+1);
 }
 if(codecRoundTrip){if(!afterEvidence)await evidenceReceipt(pending,{requireAbsent:true});await codecRoundTrip({pending,committedReceipt:committedReceipt??null,afterEvidence});if(!afterEvidence)await evidenceReceipt(pending,{requireAbsent:true});}
 await a.bringToFront();await a.reload();await a.locator('[data-message-id="'+sent.id+'"]').first().waitFor();await poll(()=>versions.some(v=>v.scriptURL===`chrome-extension://${id}/extension/worker.mjs`&&v.runningStatus==='running'&&versions.indexOf(v)>versions.findLastIndex(r=>r.runningStatus==='stopped')),'worker-restarted');const {grant:freshGrant}=await waitJ4GrantWithDiagnostic(a,id,key(personal),{previousGrant:oldGrant},diagnostic);assert.notEqual(freshGrant,oldGrant);let recovered;try{recovered=await poll(async()=>{const v=await inspect(),matches=beforeNativeCommit?v.receipts.filter(r=>r.continuation?.evidence?.batch?.hints?.some(h=>h.messageId===sent.id)):v.receipts.filter(r=>r.operationId===pending.operationId);assert(matches.length<=1,'J4-recovered-native-operation-not-unique');const receipt=matches[0];return receipt?.continuation?.state==='complete'?{...v,receipt}:null;},'same-joint-operation-complete-after-worker-restart');}catch(error){await captureDrain('joint-recovery-failed',pause);diagnostic({stage:'joint-recovery-expected-operation',operationId:pending?.operationId??uncommittedFacts?.operationId,payloadDigest:pending?.payloadDigest,originalNativeWitness:pending?.nativeWitness,originalACKAdmission:pending?.admission,workerVersions:versions.slice(-16)});throw error;}if(beforeNativeCommit){pending=recovered.receipt.continuation;assert(pending.nativeWitness);assert.notEqual(pending.nativeWitness.profileId,pending.admission.profileId);assert.equal(pending.scopeKey,key(personal));}
 const hints=Object.values(recovered.evidence.hints).filter(h=>h.messageId===sent.id);assert.equal(hints.length,1);if(afterEvidence){assert.deepEqual(hints,committedHints);assert.deepEqual(await evidenceReceipt(pending),committedReceipt);assert.equal(recovered.receipt.continuation.evidenceRevision,committedReceipt.payload.revision);}const recoveredEvidenceReceipt=(beforeNativeCommit||codecRoundTrip&&!afterEvidence)?await evidenceReceipt(pending):null;if(recoveredEvidenceReceipt)assert.equal(recovered.receipt.continuation.evidenceRevision,recoveredEvidenceReceipt.payload.revision);const original=pending.evidence.batch.hints.find(h=>h.messageId===sent.id);assert.equal(hints[0].firstObservedAt,original.firstObservedAt);assert.deepEqual(hints[0].ackWitness,original.ackWitness);assert.equal(recovered.ref.nativeTitle,J4_MIXED_TITLE);assert(!recovered.pending.some(r=>r.operationId===pending.operationId));assert.deepEqual(await assets(personal),preserved);assert.equal(server.snapshot().interruption.accepts,acceptsBefore+1);
 record(beforeNativeCommit?'same-J4-new-grant-reobserves-uncommitted-native-and-one-ACK-without-send-replay':'same-J4-real-worker-stop-recovers-native-title-and-one-original-ACK-without-send-replay',{nativeOperationId:pending.operationId,eventKey:hints[0].eventKey,firstObservedAt:hints[0].firstObservedAt,workerStopConfirmed:true,evidenceCommittedBeforeStop:afterEvidence,originalACKUnchanged:afterEvidence?true:null,evidenceReceipt:committedReceipt??recoveredEvidenceReceipt??null,continuationState:recovered.receipt.continuation.state,assetDigest:preserved.hash});
 await budgetWindow();const readsBefore=server.snapshot().interruption.reads.filter(r=>r.authenticatedWorker&&r.finishedAt!==null).length;await a.bringToFront();await a.reload();await a.locator('[data-message-id="'+sent.id+'"]').first().waitFor();await poll(()=>server.snapshot().interruption.reads.filter(r=>r.authenticatedWorker&&r.finishedAt!==null).length>readsBefore,'second-authenticated-read');await poll(async()=>{const v=await inspect();return v.receipts.find(r=>r.operationId===pending.operationId)?.continuation?.state==='complete';},'idempotent-terminal');const repeated=await inspect();if(recoveredEvidenceReceipt)assert.deepEqual(await evidenceReceipt(pending),recoveredEvidenceReceipt);if(afterEvidence)assert.deepEqual(await evidenceReceipt(pending),committedReceipt);assert.deepEqual(Object.values(repeated.evidence.hints).filter(h=>h.messageId===sent.id),hints);assert.equal(server.snapshot().interruption.accepts,acceptsBefore+1);assert.equal(Object.values((await inspect(team)).evidence.hints).filter(h=>h.messageId===sent.id).length,0);assert.deepEqual(await assets(team),teamAssets);
 record('same-J4-joint-recovery-second-load-is-idempotent-and-peer-context-isolated',{nativeOperationId:pending.operationId,nativeAccepts:acceptsBefore+1});
 await a.bringToFront();await a.locator('#model-button').click();await a.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();await a.locator('aside nav[aria-label="Chat history"] a[href="/c/33333333-3333-4333-8333-333333333333"]').click();await a.waitForURL(server.origin+'/c/33333333-3333-4333-8333-333333333333');await ensureJ4Workspace(a,mounted);assert.equal(await scopeOf(a),key(personal));await b.bringToFront();let foregroundRecovered=false;
 if(codecRoundTrip){
  // Package disable/replacement invalidates old content worlds; SPA navigation
  // cannot reinject them. Native preferences are shared across fixture tabs,
  // so reselect Team through its native menu before the native reload.
  // Require an empty draft and no files; this is not auto recovery.
  assert.equal(await b.locator('textarea').inputValue(),'','codec-peer-reload-requires-empty-fixture-draft');
  assert.equal(await b.locator('input[type="file"]').evaluateAll(nodes=>nodes.reduce((n,node)=>n+(node.files?.length??0),0)),0,'codec-peer-reload-requires-no-files');
  const originalURL=b.url();await b.locator('#account-button').click();const navigation=b.waitForNavigation();await b.locator('#native-dialog').getByRole('button',{name:'Switch to Team',exact:true}).click();await navigation;await waitJ4GrantWithDiagnostic(b,id,key(team),{expectedCurrentRef:originalURL.split('/').at(-1)},diagnostic);assert.equal(b.url(),originalURL);assert.deepEqual(await assets(team),teamAssets);
  record('codec-peer-explicit-empty-draft-native-context-switch-establishes-fresh-team-context',{nativeContextAction:'Switch to Team',nativeURL:originalURL,draftWasEmpty:true,selectedFiles:0,assetDigest:teamAssets.hash,automaticReattachment:'NOT_ESTABLISHED'});
  // Restore the shared native preference explicitly, retaining B's live Team
  // document. Later A reloads must be authenticated as Personal, not inferred
  // from the scope cached by its previous document.
  await a.bringToFront();
  assert.equal(await a.locator('textarea').inputValue(),'','codec-primary-switch-requires-empty-fixture-draft');
  assert.equal(await a.locator('input[type="file"]').evaluateAll(nodes=>nodes.reduce((n,node)=>n+(node.files?.length??0),0)),0,'codec-primary-switch-requires-no-files');
  const primaryURL=a.url(),{grant:previousPrimaryGrant}=await waitJ4Grant(a,id,key(personal));
  await a.locator('#account-button').click();const primaryNavigation=a.waitForNavigation();await a.locator('#native-dialog').getByRole('button',{name:'Switch to Personal',exact:true}).click();await primaryNavigation;
  await waitJ4GrantWithDiagnostic(a,id,key(personal),{previousGrant:previousPrimaryGrant,expectedCurrentRef:primaryURL.split('/').at(-1)},diagnostic);assert.equal(a.url(),primaryURL);assert.deepEqual(await assets(personal),preserved);
  record('codec-native-personal-preference-restored-with-fresh-primary-grant',{nativeContextAction:'Switch to Personal',nativeURL:primaryURL,draftWasEmpty:true,selectedFiles:0,assetDigest:preserved.hash});
  await b.bringToFront();

 }

 try{assert.equal(await waitJ4PeerScope(b,id,key(team)),key(team));foregroundRecovered=true;}
 catch(error){try{diagnostic({stage:'joint-peer-scope-after-real-worker-stop',status:'FAIL',reason:error.message,...await j4ReadinessFacts(b,id)});}catch{}if(error.message!=='J4-peer-current-scope-timeout')throw error;}
 if(!foregroundRecovered){const recovery=await recoverJ4PeerByNativeNavigation({page:b,id,scopeKey:key(team),server,assets,scope:team,preserved:teamAssets,onHop:diagnostic});record('peer-real-native-navigation-establishes-new-C2-after-worker-memory-loss',{...recovery,automaticForegroundRecovery:'NOT_ESTABLISHED',foregroundFailure:'J4-peer-current-scope-timeout',authority:'NEW_NATIVE_REQUEST_AND_FRESH_AUTHENTICATION'});}
 await a.bringToFront();assert.equal(await waitJ4PeerScope(a,id,key(personal)),key(personal));assert.deepEqual(await assets(personal),preserved);
}
