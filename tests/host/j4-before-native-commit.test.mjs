import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {packageHost} from '../../extension/package.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {J4_NATIVE_STORES,locateJ4BeforeNativeCommit,locateJ4NativeTransactionEntry,pauseJ4BeforeNativeCommit,assertJ4NativePauseFacts,assertJ4NativeCommitRollback,readJ4NativeRawBrowser} from './j4-before-native-commit.mjs';
const dir=await mkdtemp(join(tmpdir(),'j4-before-native-node-'));after(()=>rm(dir,{recursive:true,force:true}));
const packageRoot=packageHost(join(dir,'package'),{offlineOrigin:'http://127.0.0.1:43210',offlineContext:true}).unpacked;
const source=await readFile(join(packageRoot,'extension/classic-runtime.js'),'utf8');
const facts=()=>({fingerprint:'a'.repeat(64),payloadDigest:'b'.repeat(64),operationId:'target-native',scopeKey:'["chatgpt","account","team"]',expectedRevision:5,nativeRevision:6,mode:'readwrite',stores:J4_NATIVE_STORES.filter(n=>!['b23_views','operations'].includes(n)),channel:'host-dom',hasAdmission:true,hasContinuation:true,continuationOperationId:'target-native',evidenceOperationId:'target-evidence',state:'pending-evidence'});
function fixture({sourceOverride=source,moved=false,wrongFacts=false,exception=false,queuedPatch={},holdEntryResume=false}={}){
 const cdp=new EventEmitter(),calls=[],location={scriptId:'runtime',...locateJ4BeforeNativeCommit(source)},entryLocation={scriptId:'runtime',lineNumber:locateJ4NativeTransactionEntry(source).lineNumber,columnNumber:locateJ4NativeTransactionEntry(source).columnNumber};
 let entryRemoved=false;const receive=m=>cdp.emit('Target.receivedMessageFromTarget',{sessionId:'session',message:JSON.stringify(m)});
 cdp.send=async(method,params={})=>{calls.push({method,params});if(method==='Target.getTargets')return {targetInfos:[{type:'service_worker',url:'chrome-extension://ext/extension/worker.mjs',targetId:'worker'}]};if(method==='Target.attachToTarget')return {sessionId:'session'};
 if(method==='Target.sendMessageToTarget'){const r=JSON.parse(params.message);queueMicrotask(()=>{
 if(r.method==='Debugger.enable')receive({method:'Debugger.scriptParsed',params:{scriptId:'runtime',url:'chrome-extension://ext/extension/classic-runtime.js'}});
 if(r.method==='Debugger.pause')receive({method:'Debugger.paused',params:{hitBreakpoints:[],callFrames:[]}});
 if(r.method==='Debugger.removeBreakpoint')entryRemoved=true;
 if(r.method==='Debugger.resume'&&!(entryRemoved&&holdEntryResume))receive({method:'Debugger.resumed',params:{}});
 const result=r.method==='Debugger.getScriptSource'?{scriptSource:sourceOverride}:r.method==='Debugger.getPossibleBreakpoints'?{locations:[r.params.start.lineNumber===entryLocation.lineNumber?entryLocation:location]}:r.method==='Debugger.setBreakpoint'?{breakpointId:r.params.location.lineNumber===entryLocation.lineNumber?'entry':'native',actualLocation:moved?{...location,columnNumber:999}:r.params.location}:r.method==='Debugger.evaluateOnCallFrame'?exception?{exceptionDetails:{text:'side effect'}}:{result:{value:wrongFacts?{...facts(),hasContinuation:false}:r.params.expression.includes('mode:transaction')?{...facts(),...queuedPatch}:Object.fromEntries(Object.entries(facts()).filter(([key])=>!['mode','stores'].includes(key)))}}:{};receive({id:r.id,result});});}return {};};
 return {cdp,calls,resumed:()=>receive({method:'Debugger.resumed',params:{}}),entry:()=>receive({method:'Debugger.paused',params:{hitBreakpoints:['entry'],callFrames:[{callFrameId:'entryFrame',location:entryLocation}]}}),hit:(breakpoint='native')=>receive({method:'Debugger.paused',params:{hitBreakpoints:[breakpoint],callFrames:[{callFrameId:'frame',location}]}})};
}
test('classic boundary follows queued operation/directory writes and precedes callback return',()=>{
 const at=locateJ4BeforeNativeCommit(source),lines=source.split('\n');assert(lines[at.lineNumber].includes('result ='));assert.equal(lines[at.lineNumber-1].trim(),'check();');assert(lines.slice(at.lineNumber-8,at.lineNumber).join('\n').includes('continuationMarkerKey'));
 assert.throws(()=>locateJ4BeforeNativeCommit(source.replaceAll('result = { ok: true, replayed: false, revision: next.revision, operationId };','other = null;')),/boundary-required/);
 assert.throws(()=>locateJ4BeforeNativeCommit(source+'\n'+source),/boundary-required/);
});
test('real packaged bytes and exact pause required; facts read has side-effect rejection enabled',async()=>{
 const f=fixture(),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot,expectedTargetId:'worker'});await p.verifyControl();f.entry();await p.waitEntry();await p.resumeEntry();f.hit();const hit=await p.wait();assert.deepEqual(hit.facts,facts());
 const evalCall=f.calls.filter(x=>x.method==='Target.sendMessageToTarget').map(x=>JSON.parse(x.params.message)).find(x=>x.method==='Debugger.evaluateOnCallFrame');assert.equal(evalCall.params.throwOnSideEffect,true);assert.equal(evalCall.params.returnByValue,true);assert(!evalCall.params.expression.includes('.abort('));
 await p.close();assert.equal(f.cdp.listenerCount('Target.receivedMessageFromTarget'),0);assert(f.calls.some(x=>x.method==='Target.detachFromTarget'));
});
for(const [name,options,pattern]of [['different executed source',{sourceOverride:source+'\n'},/source-mismatch/],['moved breakpoint',{moved:true},/breakpoint-moved/]])test('reject '+name,async()=>{const f=fixture(options);await assert.rejects(pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot}),pattern);assert.equal(f.cdp.listenerCount('Target.receivedMessageFromTarget'),0);});
for(const options of [{wrongFacts:true},{exception:true}])test('reject nonmixed or unreadable paused facts '+JSON.stringify(options),async()=>{const f=fixture(options),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot});try{f.entry();await assert.rejects(p.waitEntry());}finally{await p.close();}});
function rollback(){const before={version:4,rows:Object.fromEntries(J4_NATIVE_STORES.map(name=>[name,[{key:'untouched-'+name,value:{payload:{kept:true}}}]]))};return {before,after:structuredClone(before),facts:facts(),workerStopped:true,nativeAcceptsBefore:2,nativeAcceptsAfter:2,assetsBefore:{humanRefs:['original']},assetsAfter:{humanRefs:['original']}};}
test('eight-store exact rollback plus native/evidence absence and independent assets is accepted',()=>{assert.equal(assertJ4NativeCommitRollback(rollback()).eightStoresUnchanged,true);});
for(const name of J4_NATIVE_STORES)test('reject changed raw store '+name,()=>{const f=rollback();f.after.rows[name][0].value.payload.kept=false;assert.throws(()=>assertJ4NativeCommitRollback(f),/rollback-mismatch/);});
for(const kind of ['native','evidence'])test('receipt already pending/committed is not before-native '+kind,()=>{const f=rollback(),key=JSON.stringify(kind==='native'?[f.facts.scopeKey,f.facts.operationId]:[freeEvidenceKey(f.facts.scopeKey),f.facts.evidenceOperationId]);f.before.rows.native_operations.push({key,value:null});f.after=structuredClone(f.before);assert.throws(()=>assertJ4NativeCommitRollback(f),/must-be-absent/);});
for(const [key,value]of [['workerStopped',false],['nativeAcceptsAfter',3],['assetsAfter',{humanRefs:[]}],['after',{version:4,rows:{}}]])test('rollback guard '+key,()=>{const f=rollback();f[key]=value;assert.throws(()=>assertJ4NativeCommitRollback(f));});
test('facts reject missing Shared stores, wrong epoch revision and completed continuation',()=>{for(const patch of [{stores:['native_states','native_operations']},{nativeRevision:7},{state:'complete'},{channel:'synthetic'},{continuationOperationId:'other'}])assert.throws(()=>assertJ4NativePauseFacts({...facts(),...patch}));});

function rawIDB({listing=[{name:'vaiwl-b1-v1',version:4}],mode='success',version=4,stores=J4_NATIVE_STORES,txFailure=false}={}){
 const calls={opens:[],closes:0,aborts:0,transactions:[]};
 const db={name:'vaiwl-b1-v1',version,objectStoreNames:stores,close(){calls.closes++;},transaction(names,access){calls.transactions.push({names,access});const tx={objectStore(name){return {openCursor(){const q={};queueMicrotask(()=>{q.result=null;q.onsuccess?.();});return q;}};}};queueMicrotask(()=>txFailure?tx.onabort?.():tx.oncomplete?.());return tx;}};
 const indexedDB={databases:async()=>listing,open(name,version){calls.opens.push({name,version});const q={result:db,transaction:{abort(){calls.aborts++;}}};queueMicrotask(()=>{
 if(mode==='upgrade'){q.onupgradeneeded();q.error=Error('aborted');q.onerror();}
 else if(mode==='blocked'){q.onblocked();queueMicrotask(()=>q.onsuccess());}
 else if(mode==='error'){q.error=Error('open-error');q.onerror();}
 else q.onsuccess();});return q;}};
 return {indexedDB,calls};
}
test('raw browser oracle uses existing same-version open and only one readonly eight-store transaction',async()=>{
 const f=rawIDB(),value=await readJ4NativeRawBrowser({indexedDB:f.indexedDB,expectedVersion:4});assert.equal(value.version,4);assert.deepEqual(Object.keys(value.rows).sort(),J4_NATIVE_STORES);assert.deepEqual(f.calls.opens,[{name:'vaiwl-b1-v1',version:4}]);assert.deepEqual(f.calls.transactions,[{names:J4_NATIVE_STORES,access:'readonly'}]);assert.equal(f.calls.closes,1);
});
for(const listing of [[],[{name:'unrelated',version:4}],[{name:'vaiwl-b1-v1',version:3}],[{name:'vaiwl-b1-v1',version:5}]])test('missing or wrong-version database never invokes open '+JSON.stringify(listing),async()=>{
 const f=rawIDB({listing});await assert.rejects(readJ4NativeRawBrowser({indexedDB:f.indexedDB,expectedVersion:4}),/existing-version-required/);assert.deepEqual(f.calls.opens,[]);assert.deepEqual(f.calls.transactions,[]);
});
test('database removed between enumeration and open: abort upgrade, close and reject without transaction',async()=>{
 const f=rawIDB({mode:'upgrade'});await assert.rejects(readJ4NativeRawBrowser({indexedDB:f.indexedDB,expectedVersion:4}),/unexpected-upgrade/);assert.equal(f.calls.aborts,1);assert.equal(f.calls.closes,1);assert.deepEqual(f.calls.transactions,[]);
});
test('blocked open rejects and closes a subsequent success handle',async()=>{const f=rawIDB({mode:'blocked'});await assert.rejects(readJ4NativeRawBrowser({indexedDB:f.indexedDB,expectedVersion:4}),/open-blocked/);await new Promise(r=>setImmediate(r));assert.equal(f.calls.closes,1);assert.deepEqual(f.calls.transactions,[]);});
for(const [options,pattern]of [[{mode:'error'},/open-error/],[{version:5},/open-version-mismatch/],[{stores:['native_states']},/eight-stores-required/],[{txFailure:true},/snapshot-aborted/]])test('raw snapshot failure cleanup '+JSON.stringify(options),async()=>{const f=rawIDB(options);await assert.rejects(readJ4NativeRawBrowser({indexedDB:f.indexedDB,expectedVersion:4}),pattern);assert.equal(f.calls.closes,options.mode==='error'?0:1);});


test('before-native mode explicitly excludes every other interruption, preparation and diagnostic mode',async()=>{
 const {j4BeforeNativeCommitScenario,j4CodecScenario}=await import('./j4-package-journey.mjs');assert.equal(j4BeforeNativeCommitScenario({}),false);assert.equal(j4BeforeNativeCommitScenario({FREE_J4_BEFORE_NATIVE_COMMIT:'1'}),true);assert.equal(j4CodecScenario({}),null);
 for(const key of ['FREE_J4_CODEC_ROUNDTRIP','FREE_J4_CODEC_BEFORE_EVIDENCE','FREE_J4_AFTER_EVIDENCE','FREE_J4_SCOPE_TRACE','FREE_J4_READ_BUDGET_TRACE','FREE_J4_LIFECYCLE_ORDER_TRACE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY'])assert.throws(()=>j4BeforeNativeCommitScenario({FREE_J4_BEFORE_NATIVE_COMMIT:'1',[key]:'1'}),/exclusive-journey/);
});
test('integration keeps one mixed send, reads raw after confirmed stop and completes the original later journey',async()=>{
 const joint=await readFile(new URL('./j4-joint-interruption.mjs',import.meta.url),'utf8'),runner=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');
 assert.equal(joint.split("fill('J4 explicit native mixed send')").length-1,1);
 const stopped=joint.indexOf("'worker-stopped');workerStopped=true"),raw=joint.indexOf('rawAfter=await readJ4NativeRawSnapshot'),rollback=joint.indexOf('rollback=assertJ4NativeCommitRollback'),reload=joint.indexOf("await a.reload();await a.locator('[data-message-id=",raw);
 assert(stopped>0&&raw>stopped&&rollback>raw&&reload>rollback);
 for(const token of ['if(beforeNativeCommit){uncommittedFacts=hit.facts','J4-recovered-native-operation-not-unique','stopped.pending.length,0','stopped.ref.nativeTitle,before.ref.nativeTitle','const recoveredEvidenceReceipt=codecRoundTrip&&!afterEvidence','assert.deepEqual(await assets(team),teamAssets)'])assert(joint.includes(token),token);
 assert(runner.includes("'j4-before-native-commit.mjs'"));assert(runner.includes('runJ4JointInterruption({beforeNativeCommit,'));assert(runner.indexOf('report.evidenceRecovery=await runJ4EvidenceRecovery')>runner.indexOf('await runJ4JointInterruption'));assert(runner.includes("await cdp.send('Extensions.uninstall',{id})"));
});


test('both pauses must identify the same operation, fingerprint and continuation',async()=>{
 for(const queuedPatch of [{fingerprint:'c'.repeat(64)},{payloadDigest:'d'.repeat(64)},{operationId:'other',continuationOperationId:'other'},{expectedRevision:6,nativeRevision:7}]){
 const f=fixture({queuedPatch}),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot});try{f.entry();await p.waitEntry();await p.resumeEntry();f.hit();await assert.rejects(p.wait(),/entry-operation-changed/);}finally{await p.close();}}
});
test('queued pause cannot substitute for missing transaction-entry baseline',async()=>{const f=fixture(),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot});try{f.hit();await assert.rejects(p.wait(),/entry-baseline-required/);await assert.rejects(p.waitEntry(),/entry-unrelated-pause/);}finally{await p.close();}});
test('raw enumeration deadline never opens a late database',async()=>{let resolve,opens=0;const indexedDB={databases:()=>new Promise(r=>resolve=r),open(){opens++;}};await assert.rejects(readJ4NativeRawBrowser({indexedDB,expectedVersion:4,timeoutMs:10}),/snapshot-deadline/);resolve([{name:'vaiwl-b1-v1',version:4}]);await new Promise(r=>setImmediate(r));assert.equal(opens,0);});
test('blocked readonly transaction aborts and closes at snapshot deadline',async()=>{const f=rawIDB();let aborted=0;const oldOpen=f.indexedDB.open;f.indexedDB.open=(...args)=>{const q=oldOpen(...args);q.result.transaction=()=>({abort(){aborted++;},objectStore:()=>({openCursor:()=>({})})});return q;};await assert.rejects(readJ4NativeRawBrowser({indexedDB:f.indexedDB,expectedVersion:4,timeoutMs:10}),/snapshot-deadline/);assert.equal(aborted,1);assert(f.calls.closes>0);});
test('integration retains trigger-entry-stop raw snapshots and never overwrites initial baseline',async()=>{const s=await readFile(new URL('./j4-joint-interruption.mjs',import.meta.url),'utf8');assert.equal(s.split('rawBefore=await').length-1,1);assert(s.includes('before:rawEntry,after:rawAfter'));assert(s.includes('triggerBefore:rawBefore,transactionEntry:rawEntry,after:rawAfter'));const entry=s.indexOf('entryFacts=await pause.waitEntry()'),read=s.indexOf('rawEntry=await',entry),resume=s.indexOf('await pause.resumeEntry()',read),queued=s.indexOf('const hit=await pause.wait()',resume);assert(entry>0&&read>entry&&resume>read&&queued>resume);assert(s.includes('pause.remainingMs()-100'));});


test('resume response before resumed event cannot expose the stale entry pause to wait',async()=>{
 const f=fixture({holdEntryResume:true}),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot});try{
  f.entry();await p.waitEntry();let settled=false;const resumed=p.resumeEntry().then(()=>{settled=true;});await new Promise(r=>setImmediate(r));
  assert.equal(settled,false);await assert.rejects(p.wait(),/entry-not-resumed/);assert.equal(p.diagnostics().entryResumed,false);
  f.resumed();f.hit();await resumed;const result=await p.wait();assert.equal(result.facts.operationId,facts().operationId);assert.equal(p.diagnostics().entryResumed,true);
 }finally{await p.close();}
});
test('an immediate new unrelated pause after resumed still fails the exact breakpoint oracle',async()=>{
 const f=fixture({holdEntryResume:true}),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot});try{
  f.entry();await p.waitEntry();const resumed=p.resumeEntry();await new Promise(r=>setImmediate(r));f.resumed();f.hit('other');await resumed;await assert.rejects(p.wait(),/unrelated-pause/);
 }finally{await p.close();}
});
test('transport failure while awaiting actual resumed event rejects without a new wait budget',async()=>{
 const f=fixture({holdEntryResume:true}),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot});try{f.entry();await p.waitEntry();const resumed=p.resumeEntry();await new Promise(r=>setImmediate(r));f.cdp.emit('transportClosed',{reason:'original-transport-deadline'});await assert.rejects(resumed,/original-transport-deadline/);assert.equal(p.diagnostics().entryResumed,false);}finally{await p.close();}
});

test('entry and queued expressions read the actual packaged receipt binding despite outer name collision',async()=>{
 const {runInNewContext}=await import('node:vm'),f=fixture(),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot});
 try{f.entry();await p.waitEntry();await p.resumeEntry();f.hit();await p.wait();
  const at=locateJ4BeforeNativeCommit(source),receipt=source.split('\n').slice(at.lineNumber-15,at.lineNumber).join('\n').match(/operations\.put\(record\(operationKey, \{ fingerprint: ([$A-Z_a-z][$\w]*), revision: next\.revision/);assert(receipt,'actual renamed receipt required for collision regression');
  const value=facts(),env={operationId:value.operationId,expectedRevision:value.expectedRevision,normalized:{key:value.scopeKey},fingerprint:()=>false,[receipt[1]]:value.fingerprint,command:{channel:value.channel,admission:{},continuation:{payloadDigest:value.payloadDigest,operationId:value.operationId,evidence:{operationId:value.evidenceOperationId},state:value.state,nativeRevision:value.nativeRevision}},transaction:{mode:'readwrite',objectStoreNames:value.stores}};
  const calls=f.calls.filter(x=>x.method==='Target.sendMessageToTarget').map(x=>JSON.parse(x.params.message)).filter(x=>x.method==='Debugger.evaluateOnCallFrame');assert.equal(calls.length,2);
  for(const call of calls){const read=runInNewContext(call.params.expression,env);assert.equal(read.fingerprint,value.fingerprint);assert.equal(read.payloadDigest,value.payloadDigest);}
 }finally{await p.close();}
});

test('packaged fingerprint binding accepts renamed identifiers and refuses missing, ambiguous or computed bindings',async()=>{
 const {j4NativeFactExpressions}=await import('./j4-before-native-commit.mjs'),actual=j4NativeFactExpressions(source);assert(actual.binding!=='fingerprint');
 const renamed=source.replaceAll(actual.binding,'otherLocalDigest');assert.equal(j4NativeFactExpressions(renamed).binding,'otherLocalDigest');
 const declaration=source.split('\n').find(line=>line.includes('const '+actual.binding+' = command.kind === "OBSERVE_NATIVE_LIFECYCLE"'));
 const receipt=source.split('\n').find(line=>line.includes('operations.put(record(operationKey, { fingerprint: '+actual.binding+', revision: next.revision'));
 assert(declaration&&receipt);
 for(const invalid of [source.replace(declaration,''),source.replace(declaration,declaration+'\n'+declaration),source.replace(receipt,receipt+'\n'+receipt),source.replace(receipt,receipt.replace('fingerprint: '+actual.binding,'fingerprint: outerValue')),source.replace(receipt,receipt.replace('fingerprint: '+actual.binding,'fingerprint: '+actual.binding+'()'))])assert.throws(()=>j4NativeFactExpressions(invalid),/J4-native-fingerprint/);
});
