import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import {digest} from '../../src/data/hash.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {DATABASE_VERSION} from '../../src/data/schema.mjs';

export const J4_NATIVE_STORES=Object.freeze(['b23_checkpoints','b23_operations','b23_states','b23_views','native_operations','native_states','operations','refs']);
// Unmodified classic bundle only. The callback has queued the native receipt,
// directory and Shared writes, but has not returned to the IDB event loop.
export function locateJ4BeforeNativeCommit(source){
 const lines=source.split('\n'),matches=[];
 for(let i=0;i<lines.length;i++)if(lines[i].includes('result = { ok: true, replayed: false, revision: next.revision, operationId };')&&lines[i-1]?.trim()==='check();'){
  const preceding=lines.slice(Math.max(0,i-15),i).join('\n');
  if(preceding.includes('operations.put(record(operationKey,')&&preceding.includes('continuationMarkerKey(normalized.key)'))matches.push(i);
 }
 assert.equal(matches.length,1,'J4-native-queued-write-boundary-required');const lineNumber=matches[0];
 return {lineNumber,columnNumber:lines[lineNumber].indexOf('result =')};
}
export const J4_NATIVE_PAUSE_EXPRESSION='({operationId,expectedRevision,scopeKey:normalized.key,mode:transaction.mode,stores:Array.from(transaction.objectStoreNames),channel:command.channel,hasAdmission:!!command.admission,hasContinuation:!!command.continuation,continuationOperationId:command.continuation?.operationId,evidenceOperationId:command.continuation?.evidence?.operationId,state:command.continuation?.state,nativeRevision:command.continuation?.nativeRevision})';
export function assertJ4NativePauseFacts(f){
 assert(f&&typeof f==='object');assert.equal(f.mode,'readwrite');assert.equal(f.channel,'host-dom');assert.equal(f.hasAdmission,true);assert.equal(f.hasContinuation,true);assert.equal(f.state,'pending-evidence');
 for(const key of ['operationId','scopeKey','evidenceOperationId'])assert.equal(typeof f[key],'string',key);
 assert(f.operationId&&f.scopeKey&&f.evidenceOperationId);assert.equal(f.continuationOperationId,f.operationId);assert(Number.isSafeInteger(f.expectedRevision)&&f.expectedRevision>=0);assert.equal(f.nativeRevision,f.expectedRevision+1);
 assert.deepEqual([...f.stores].sort(),J4_NATIVE_STORES.filter(n=>!['b23_views','operations'].includes(n)));
 return f;
}
export async function pauseJ4BeforeNativeCommit(cdp,id,{packageRoot,expectedTargetId=null}={}){
 assert.equal(typeof packageRoot,'string','J4-native-package-root-required');
 const compiled=compileClassicWorker(packageRoot),source=await readFile(join(packageRoot,'extension/classic-runtime.js'),'utf8');
 assert.equal(source,compiled.runtime,'J4-native-build-mismatch');assert.equal(await readFile(join(packageRoot,'extension/worker.mjs'),'utf8'),compiled.entry,'J4-native-entry-mismatch');
 assert.deepEqual(JSON.parse(await readFile(join(packageRoot,'manifest.json'),'utf8')).background,{service_worker:'extension/worker.mjs'});
 const at=locateJ4BeforeNativeCommit(source),{targetInfos}=await cdp.send('Target.getTargets'),targets=targetInfos.filter(t=>t.type==='service_worker'&&t.url===`chrome-extension://${id}/extension/worker.mjs`);
 assert.equal(targets.length,1,'J4-native-unique-worker-required');const targetId=targets[0].targetId;if(expectedTargetId!==null)assert.equal(targetId,expectedTargetId);
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:false});let serial=0,paused=null,failure=null,closed=false,installed,location;const requests=new Map(),scripts=[];
 const receive=e=>{if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id){const p=requests.get(m.id);if(p){requests.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Debugger.scriptParsed')scripts.push(m.params);else if(m.method==='Debugger.paused')paused=m.params;else if(m.method==='Debugger.resumed')paused=null;else if(m.method==='Inspector.detached')fail('J4-native-inspector-detached');};
 const fail=reason=>{failure=reason;for(const p of requests.values())p.reject(Error(reason));requests.clear();};
 const detached=e=>{if(e.sessionId===sessionId)fail('J4-native-target-detached');},transport=e=>fail(e.reason??'J4-native-transport-closed');
 cdp.on('Target.receivedMessageFromTarget',receive);cdp.on('Target.detachedFromTarget',detached);cdp.on('transportClosed',transport);
 const send=(method,params={})=>new Promise((resolve,reject)=>{if(failure||closed)return reject(Error(failure??'J4-native-closed'));const n=++serial;requests.set(n,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:n,method,params})}).catch(error=>{requests.delete(n);reject(error);});});
 const close=async()=>{if(closed)return;closed=true;cdp.off('Target.receivedMessageFromTarget',receive);cdp.off('Target.detachedFromTarget',detached);cdp.off('transportClosed',transport);fail('J4-native-closed');try{await cdp.send('Target.detachFromTarget',{sessionId});}catch{}};
 const poll=async predicate=>{const end=Date.now()+20000;while(Date.now()<end){if(failure)throw Error(failure);if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw Error('J4-native-pause-timeout');};
 try{
  await send('Debugger.enable');await send('Debugger.setSkipAllPauses',{skip:false});await send('Debugger.setBreakpointsActive',{active:true});
  const matches=scripts.filter(s=>s.url===`chrome-extension://${id}/extension/classic-runtime.js`);assert.equal(matches.length,1,'J4-native-script-required');const scriptId=matches[0].scriptId;
  assert.equal((await send('Debugger.getScriptSource',{scriptId})).scriptSource,source,'J4-native-executed-source-mismatch');
  location={scriptId,...at};const {locations}=await send('Debugger.getPossibleBreakpoints',{start:location,end:{scriptId,lineNumber:at.lineNumber+1,columnNumber:0},restrictToFunction:true});
  assert(locations.some(l=>l.scriptId===scriptId&&l.lineNumber===at.lineNumber&&l.columnNumber===at.columnNumber),'J4-native-executable-boundary-required');
  installed=await send('Debugger.setBreakpoint',{location});assert.deepEqual(installed.actualLocation,location,'J4-native-breakpoint-moved');
 }catch(error){await close();throw error;}
 return {targetId,close,diagnostics:()=>({targetId,location,failure,paused:!!paused,boundary:'QUEUED_NATIVE_WRITES_BEFORE_CALLBACK_RETURN'}),
  async verifyControl(){await send('Debugger.pause');await poll(()=>paused!==null);assert.equal(paused.hitBreakpoints?.length??0,0);await send('Debugger.resume');await poll(()=>paused===null);},
  async wait(){await poll(()=>paused!==null);assert(paused.hitBreakpoints?.includes(installed.breakpointId),'J4-native-unrelated-pause');assert.deepEqual(paused.callFrames?.[0]?.location,location,'J4-native-wrong-callsite');
   const result=await send('Debugger.evaluateOnCallFrame',{callFrameId:paused.callFrames[0].callFrameId,expression:J4_NATIVE_PAUSE_EXPRESSION,returnByValue:true,throwOnSideEffect:true,silent:true});
   assert(!result.exceptionDetails,'J4-native-readonly-facts-failed');return {boundary:'QUEUED_NATIVE_WRITES_BEFORE_CALLBACK_RETURN',facts:assertJ4NativePauseFacts(result.result?.value)};
  }};
}
// Call only before the trigger or AFTER confirmed worker termination. Reading
// while the write callback is paused would wait on its transaction lock.
export async function readJ4NativeRawBrowser({expectedVersion,indexedDB=globalThis.indexedDB}={}){
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1||typeof indexedDB?.databases!=='function')throw Error('J4-native-existing-database-required');
 const existing=(await indexedDB.databases()).filter(row=>row.name==='vaiwl-b1-v1');
 if(existing.length!==1||existing[0].version!==expectedVersion)throw Error('J4-native-existing-version-required');
 let db;
 try{db=await new Promise((resolve,reject)=>{
  const q=indexedDB.open('vaiwl-b1-v1',expectedVersion);let settled=false;
  const fail=error=>{if(!settled){settled=true;reject(error);}};
  q.onupgradeneeded=()=>{try{q.transaction.abort();}catch{}q.result?.close();fail(Error('J4-native-unexpected-upgrade'));};
  q.onblocked=()=>fail(Error('J4-native-open-blocked'));
  q.onerror=()=>fail(q.error??Error('J4-native-open-failed'));
  q.onsuccess=()=>{if(settled){q.result.close();return;}if(q.result.name!=='vaiwl-b1-v1'||q.result.version!==expectedVersion){q.result.close();fail(Error('J4-native-open-version-mismatch'));return;}settled=true;resolve(q.result);};
 });
 const names=[...db.objectStoreNames].sort(),expected=['b23_checkpoints','b23_operations','b23_states','b23_views','native_operations','native_states','operations','refs'];if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('J4-native-eight-stores-required');
 return await new Promise((resolve,reject)=>{const tx=db.transaction(names,'readonly'),rows={};for(const name of names){rows[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const cursor=q.result;if(cursor){rows[name].push({key:cursor.key,value:cursor.value});cursor.continue();}};}tx.oncomplete=()=>resolve({version:db.version,rows});tx.onabort=()=>reject(tx.error??Error('J4-native-snapshot-aborted'));});
 }finally{db?.close();}
}
export async function readJ4NativeRawSnapshot(page){return page.evaluate(readJ4NativeRawBrowser,{expectedVersion:DATABASE_VERSION});}
export function assertJ4NativeCommitRollback({before,after,facts,workerStopped,nativeAcceptsBefore,nativeAcceptsAfter,assetsBefore,assetsAfter}){
 assertJ4NativePauseFacts(facts);assert.equal(workerStopped,true,'J4-native-real-stop-required');assert(Number.isSafeInteger(nativeAcceptsBefore)&&nativeAcceptsBefore>=0);assert.equal(nativeAcceptsAfter,nativeAcceptsBefore,'J4-native-send-replayed');
 assert(before&&after&&Number.isSafeInteger(before.version));assert.equal(after.version,before.version);assert.deepEqual(Object.keys(before.rows).sort(),J4_NATIVE_STORES);assert.deepEqual(Object.keys(after.rows).sort(),J4_NATIVE_STORES);
 const nativeKey=JSON.stringify([facts.scopeKey,facts.operationId]),evidenceKey=JSON.stringify([freeEvidenceKey(facts.scopeKey),facts.evidenceOperationId]);
 for(const snapshot of [before,after]){for(const name of J4_NATIVE_STORES)assert(Array.isArray(snapshot.rows[name]));assert(!snapshot.rows.native_operations.some(row=>row.key===nativeKey||row.key===evidenceKey),'J4-native-uncommitted-receipts-must-be-absent');}
 assert.deepEqual(after.rows,before.rows,'J4-native-eight-store-rollback-mismatch');assert(assetsBefore!==undefined);assert.deepEqual(assetsAfter,assetsBefore,'J4-native-Pro-assets-changed');
 return {workerStopped:true,eightStoresUnchanged:true,nativeReceiptAbsent:true,evidenceReceiptAbsent:true,allTablesDigest:digest(before.rows),assetDigest:digest(assetsBefore),nativeAccepts:nativeAcceptsAfter};
}
