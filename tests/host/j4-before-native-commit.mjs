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
export function locateJ4NativeTransactionEntry(source){
 const queued=locateJ4BeforeNativeCommit(source),lines=source.split('\n');
 const owners=lines.slice(0,queued.lineNumber).map((line,index)=>({line,index})).filter(x=>x.line.includes('async mutate(scope, { operationId, expectedRevision }, command, reduce, options)'));
 assert(owners.length,'J4-native-mutate-owner-required');const start=owners.at(-1).index;
 const hits=lines.slice(start,queued.lineNumber).map((line,index)=>({line,lineNumber:start+index})).filter(x=>x.line.includes('const transaction = db.transaction(["native_states", "native_operations",'));
 assert.equal(hits.length,1,'J4-native-transaction-entry-required');return {lineNumber:hits[0].lineNumber,columnNumber:hits[0].line.indexOf('const transaction'),lastColumn:hits[0].line.indexOf('db.transaction')+3};
}
export const J4_NATIVE_ENTRY_EXPRESSION='({operationId,expectedRevision,scopeKey:normalized.key,fingerprint,payloadDigest:command.continuation?.payloadDigest,channel:command.channel,hasAdmission:!!command.admission,hasContinuation:!!command.continuation,continuationOperationId:command.continuation?.operationId,evidenceOperationId:command.continuation?.evidence?.operationId,state:command.continuation?.state,nativeRevision:command.continuation?.nativeRevision})';
export function assertJ4NativeEntryFacts(f){
 assert(f&&typeof f==='object');assert.equal(f.channel,'host-dom');assert.equal(f.hasAdmission,true);assert.equal(f.hasContinuation,true);assert.equal(f.state,'pending-evidence');
 for(const key of ['operationId','scopeKey','evidenceOperationId'])assert(typeof f[key]==='string'&&f[key],key);
 for(const key of ['fingerprint','payloadDigest'])assert(/^[a-f0-9]{64}$/.test(f[key]??''),key);
 assert.equal(f.continuationOperationId,f.operationId);assert(Number.isSafeInteger(f.expectedRevision)&&f.expectedRevision>=0);assert.equal(f.nativeRevision,f.expectedRevision+1);return f;
}
export const J4_NATIVE_PAUSE_EXPRESSION='({operationId,expectedRevision,scopeKey:normalized.key,fingerprint,payloadDigest:command.continuation?.payloadDigest,mode:transaction.mode,stores:Array.from(transaction.objectStoreNames),channel:command.channel,hasAdmission:!!command.admission,hasContinuation:!!command.continuation,continuationOperationId:command.continuation?.operationId,evidenceOperationId:command.continuation?.evidence?.operationId,state:command.continuation?.state,nativeRevision:command.continuation?.nativeRevision})';
/** Resolve the local identifier from the verified generated mutate/receipt pair.
 * Bundler renaming is expected; arbitrary expressions and ambiguity are not.
 * This recognizes only the two known compiled declaration shapes, not JS in
 * general. A future compiler shape must fail closed and be reviewed explicitly. */
export function j4NativeFactExpressions(source){
 const queued=locateJ4BeforeNativeCommit(source),entry=locateJ4NativeTransactionEntry(source),lines=source.split('\n');
 const start=lines.slice(0,entry.lineNumber).map((line,index)=>({line,index})).filter(x=>x.line.includes('async mutate(scope, { operationId, expectedRevision }, command, reduce, options)')).at(-1)?.index;
 assert(Number.isInteger(start),'J4-native-fingerprint-owner-required');
 const before=lines.slice(start,entry.lineNumber).join('\n'),body=lines.slice(start,queued.lineNumber+1).join('\n');
 const declarations=[...before.matchAll(/const ([$A-Z_a-z][$\w]*) = (?:command\.kind === "OBSERVE_NATIVE_LIFECYCLE" \? nativeLifecycleSemantic\(command\.lifecycle\) : )?digest\(\{ command, expectedRevision \}\), db = await this\.base\.open\(\);/g)];
 const receipts=[...body.matchAll(/operations\.put\(record\(operationKey, \{ fingerprint(?:: ([$A-Z_a-z][$\w]*))?, revision: next\.revision, operationId[ ,]/g)];
 assert.equal(declarations.length,1,'J4-native-fingerprint-declaration-required');assert.equal(receipts.length,1,'J4-native-fingerprint-receipt-required');
 const binding=declarations[0][1];assert.equal(receipts[0][1]??'fingerprint',binding,'J4-native-fingerprint-binding-conflict');
 const bind=expression=>expression.replace(',fingerprint,',',fingerprint:'+binding+',');
 return Object.freeze({binding,entry:bind(J4_NATIVE_ENTRY_EXPRESSION),queued:bind(J4_NATIVE_PAUSE_EXPRESSION)});
}
export function assertJ4NativePauseFacts(f){
 assertJ4NativeEntryFacts(f);assert.equal(f.mode,'readwrite');assert.equal(f.channel,'host-dom');assert.equal(f.hasAdmission,true);assert.equal(f.hasContinuation,true);assert.equal(f.state,'pending-evidence');
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
 const expressions=j4NativeFactExpressions(source),deadline=Date.now()+20000,entryAt=locateJ4NativeTransactionEntry(source),at=locateJ4BeforeNativeCommit(source),{targetInfos}=await cdp.send('Target.getTargets'),targets=targetInfos.filter(t=>t.type==='service_worker'&&t.url===`chrome-extension://${id}/extension/worker.mjs`);
 assert.equal(targets.length,1,'J4-native-unique-worker-required');const targetId=targets[0].targetId;if(expectedTargetId!==null)assert.equal(targetId,expectedTargetId);
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:false});let serial=0,paused=null,failure=null,closed=false,installed,location,entryInstalled,entryLocation,entryFacts,resumedCount=0,entryResumed=false;const requests=new Map(),scripts=[];
 const receive=e=>{if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id){const p=requests.get(m.id);if(p){requests.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Debugger.scriptParsed')scripts.push(m.params);else if(m.method==='Debugger.paused')paused=m.params;else if(m.method==='Debugger.resumed'){resumedCount++;paused=null;}else if(m.method==='Inspector.detached')fail('J4-native-inspector-detached');};
 const fail=reason=>{failure=reason;for(const p of requests.values())p.reject(Error(reason));requests.clear();};
 const detached=e=>{if(e.sessionId===sessionId)fail('J4-native-target-detached');},transport=e=>fail(e.reason??'J4-native-transport-closed');
 cdp.on('Target.receivedMessageFromTarget',receive);cdp.on('Target.detachedFromTarget',detached);cdp.on('transportClosed',transport);
 const send=(method,params={})=>new Promise((resolve,reject)=>{if(failure||closed)return reject(Error(failure??'J4-native-closed'));const n=++serial;requests.set(n,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:n,method,params})}).catch(error=>{requests.delete(n);reject(error);});});
 const close=async()=>{if(closed)return;closed=true;cdp.off('Target.receivedMessageFromTarget',receive);cdp.off('Target.detachedFromTarget',detached);cdp.off('transportClosed',transport);fail('J4-native-closed');try{await cdp.send('Target.detachFromTarget',{sessionId});}catch{}};
 const poll=async predicate=>{while(Date.now()<deadline){if(failure)throw Error(failure);if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw Error('J4-native-pause-timeout');};
 try{
  await send('Debugger.enable');await send('Debugger.setSkipAllPauses',{skip:false});await send('Debugger.setBreakpointsActive',{active:true});
  const matches=scripts.filter(s=>s.url===`chrome-extension://${id}/extension/classic-runtime.js`);assert.equal(matches.length,1,'J4-native-script-required');const scriptId=matches[0].scriptId;
  assert.equal((await send('Debugger.getScriptSource',{scriptId})).scriptSource,source,'J4-native-executed-source-mismatch');
  location={scriptId,...at};const {locations}=await send('Debugger.getPossibleBreakpoints',{start:location,end:{scriptId,lineNumber:at.lineNumber+1,columnNumber:0},restrictToFunction:true});
  assert(locations.some(l=>l.scriptId===scriptId&&l.lineNumber===at.lineNumber&&l.columnNumber===at.columnNumber),'J4-native-executable-boundary-required');
  installed=await send('Debugger.setBreakpoint',{location});assert.deepEqual(installed.actualLocation,location,'J4-native-breakpoint-moved');
  entryLocation={scriptId,lineNumber:entryAt.lineNumber,columnNumber:entryAt.columnNumber};const possible=await send('Debugger.getPossibleBreakpoints',{start:entryLocation,end:{scriptId,lineNumber:entryAt.lineNumber+1,columnNumber:0},restrictToFunction:true});
  const executable=possible.locations.filter(l=>l.scriptId===scriptId&&l.lineNumber===entryAt.lineNumber&&l.columnNumber>=entryAt.columnNumber&&l.columnNumber<=entryAt.lastColumn).sort((a,b)=>a.columnNumber-b.columnNumber)[0];assert(executable,'J4-native-entry-executable-required');entryLocation={scriptId,lineNumber:entryAt.lineNumber,columnNumber:executable.columnNumber};
  entryInstalled=await send('Debugger.setBreakpoint',{location:entryLocation});assert.deepEqual(entryInstalled.actualLocation,entryLocation,'J4-native-entry-breakpoint-moved');
 }catch(error){await close();throw error;}
 return {targetId,close,diagnostics:()=>({targetId,location,entryLocation,entryObserved:!!entryFacts,entryResumed,resumedCount,failure,paused:!!paused,pauseLocation:paused?.callFrames?.[0]?.location??null,hitBreakpoints:paused?.hitBreakpoints??[],boundary:'QUEUED_NATIVE_WRITES_BEFORE_CALLBACK_RETURN'}),
  async verifyControl(){await send('Debugger.pause');await poll(()=>paused!==null);assert.equal(paused.hitBreakpoints?.length??0,0);await send('Debugger.resume');await poll(()=>paused===null);},
  async waitEntry(){assert(!entryFacts,'J4-native-entry-already-read');await poll(()=>paused!==null);assert(paused.hitBreakpoints?.includes(entryInstalled.breakpointId),'J4-native-entry-unrelated-pause');assert.deepEqual(paused.callFrames?.[0]?.location,entryLocation,'J4-native-entry-wrong-callsite');
   const result=await send('Debugger.evaluateOnCallFrame',{callFrameId:paused.callFrames[0].callFrameId,expression:expressions.entry,returnByValue:true,throwOnSideEffect:true,silent:true});assert(!result.exceptionDetails,'J4-native-entry-facts-failed');entryFacts=assertJ4NativeEntryFacts(result.result?.value);return structuredClone(entryFacts);
  },
  remainingMs(){return Math.max(0,deadline-Date.now());},
  async resumeEntry(){assert(entryFacts&&paused?.hitBreakpoints?.includes(entryInstalled.breakpointId),'J4-native-entry-not-paused');await send('Debugger.removeBreakpoint',{breakpointId:entryInstalled.breakpointId});const priorResumed=resumedCount;await send('Debugger.resume');await poll(()=>resumedCount>priorResumed);entryResumed=true;},
  async wait(){assert(entryFacts,'J4-native-entry-baseline-required');assert(entryResumed,'J4-native-entry-not-resumed');await poll(()=>paused!==null);assert(paused.hitBreakpoints?.includes(installed.breakpointId),'J4-native-unrelated-pause');assert.deepEqual(paused.callFrames?.[0]?.location,location,'J4-native-wrong-callsite');
   const result=await send('Debugger.evaluateOnCallFrame',{callFrameId:paused.callFrames[0].callFrameId,expression:expressions.queued,returnByValue:true,throwOnSideEffect:true,silent:true});
   assert(!result.exceptionDetails,'J4-native-readonly-facts-failed');const facts=assertJ4NativePauseFacts(result.result?.value);for(const key of Object.keys(entryFacts))assert.deepEqual(facts[key],entryFacts[key],'J4-native-entry-operation-changed:'+key);return {boundary:'QUEUED_NATIVE_WRITES_BEFORE_CALLBACK_RETURN',facts};
  }};
}
// Read before the trigger, at verified pre-transaction entry, or after stop. Reading
// while the write callback is paused would wait on its transaction lock.
export async function readJ4NativeRawBrowser({expectedVersion,indexedDB=globalThis.indexedDB,timeoutMs=1500}={}){
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1||typeof indexedDB?.databases!=='function')throw Error('J4-native-existing-database-required');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>1500)throw Error('J4-native-snapshot-budget-invalid');
 let expired=false,db,tx,timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;try{tx?.abort();}catch{}db?.close();reject(Error('J4-native-snapshot-deadline'));},timeoutMs);});
 const work=async()=>{const existing=(await indexedDB.databases()).filter(row=>row.name==='vaiwl-b1-v1');
 if(existing.length!==1||existing[0].version!==expectedVersion)throw Error('J4-native-existing-version-required');
 if(expired)throw Error('J4-native-snapshot-deadline');
 try{db=await new Promise((resolve,reject)=>{
  const q=indexedDB.open('vaiwl-b1-v1',expectedVersion);let settled=false;
  const fail=error=>{if(!settled){settled=true;reject(error);}};
  q.onupgradeneeded=()=>{try{q.transaction.abort();}catch{}q.result?.close();fail(Error('J4-native-unexpected-upgrade'));};
  q.onblocked=()=>fail(Error('J4-native-open-blocked'));
  q.onerror=()=>fail(q.error??Error('J4-native-open-failed'));
  q.onsuccess=()=>{if(settled||expired){q.result.close();return;}if(q.result.name!=='vaiwl-b1-v1'||q.result.version!==expectedVersion){q.result.close();fail(Error('J4-native-open-version-mismatch'));return;}settled=true;resolve(q.result);};
 });
 const names=[...db.objectStoreNames].sort(),expected=['b23_checkpoints','b23_operations','b23_states','b23_views','native_operations','native_states','operations','refs'];if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('J4-native-eight-stores-required');
 if(expired)throw Error('J4-native-snapshot-deadline');
 return await new Promise((resolve,reject)=>{tx=db.transaction(names,'readonly');const rows={};for(const name of names){rows[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const cursor=q.result;if(cursor){rows[name].push({key:cursor.key,value:cursor.value});cursor.continue();}};}tx.oncomplete=()=>resolve({version:db.version,rows});tx.onabort=()=>reject(tx.error??Error('J4-native-snapshot-aborted'));});
 }finally{db?.close();}
 };try{return await Promise.race([work(),timeout]);}finally{clearTimeout(timer);}
}
export async function readJ4NativeRawSnapshot(page,{timeoutMs=1500}={}){let timer;try{return await Promise.race([page.evaluate(readJ4NativeRawBrowser,{expectedVersion:DATABASE_VERSION,timeoutMs}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('J4-native-snapshot-transport-deadline')),timeoutMs+100);})]);}finally{clearTimeout(timer);}}
export function assertJ4NativeCommitRollback({before,after,facts,workerStopped,nativeAcceptsBefore,nativeAcceptsAfter,assetsBefore,assetsAfter}){
 assertJ4NativePauseFacts(facts);assert.equal(workerStopped,true,'J4-native-real-stop-required');assert(Number.isSafeInteger(nativeAcceptsBefore)&&nativeAcceptsBefore>=0);assert.equal(nativeAcceptsAfter,nativeAcceptsBefore,'J4-native-send-replayed');
 assert(before&&after&&Number.isSafeInteger(before.version));assert.equal(after.version,before.version);assert.deepEqual(Object.keys(before.rows).sort(),J4_NATIVE_STORES);assert.deepEqual(Object.keys(after.rows).sort(),J4_NATIVE_STORES);
 const nativeKey=JSON.stringify([facts.scopeKey,facts.operationId]),evidenceKey=JSON.stringify([freeEvidenceKey(facts.scopeKey),facts.evidenceOperationId]);
 for(const snapshot of [before,after]){for(const name of J4_NATIVE_STORES)assert(Array.isArray(snapshot.rows[name]));assert(!snapshot.rows.native_operations.some(row=>row.key===nativeKey||row.key===evidenceKey),'J4-native-uncommitted-receipts-must-be-absent');}
 assert.deepEqual(after.rows,before.rows,'J4-native-eight-store-rollback-mismatch');assert(assetsBefore!==undefined);assert.deepEqual(assetsAfter,assetsBefore,'J4-native-Pro-assets-changed');
 return {workerStopped:true,eightStoresUnchanged:true,nativeReceiptAbsent:true,evidenceReceiptAbsent:true,allTablesDigest:digest(before.rows),assetDigest:digest(assetsBefore),nativeAccepts:nativeAcceptsAfter};
}
