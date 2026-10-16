import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {packageHost} from '../../extension/package.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {J4_NATIVE_STORES,locateJ4BeforeNativeCommit,pauseJ4BeforeNativeCommit,assertJ4NativePauseFacts,assertJ4NativeCommitRollback,readJ4NativeRawBrowser} from './j4-before-native-commit.mjs';
const dir=await mkdtemp(join(tmpdir(),'j4-before-native-node-'));after(()=>rm(dir,{recursive:true,force:true}));
const packageRoot=packageHost(join(dir,'package'),{offlineOrigin:'http://127.0.0.1:43210',offlineContext:true}).unpacked;
const source=await readFile(join(packageRoot,'extension/classic-runtime.js'),'utf8');
const facts=()=>({operationId:'target-native',scopeKey:'["chatgpt","account","team"]',expectedRevision:5,nativeRevision:6,mode:'readwrite',stores:J4_NATIVE_STORES.filter(n=>!['b23_views','operations'].includes(n)),channel:'host-dom',hasAdmission:true,hasContinuation:true,continuationOperationId:'target-native',evidenceOperationId:'target-evidence',state:'pending-evidence'});
function fixture({sourceOverride=source,moved=false,wrongFacts=false,exception=false}={}){
 const cdp=new EventEmitter(),calls=[],location={scriptId:'runtime',...locateJ4BeforeNativeCommit(source)};
 const receive=m=>cdp.emit('Target.receivedMessageFromTarget',{sessionId:'session',message:JSON.stringify(m)});
 cdp.send=async(method,params={})=>{calls.push({method,params});if(method==='Target.getTargets')return {targetInfos:[{type:'service_worker',url:'chrome-extension://ext/extension/worker.mjs',targetId:'worker'}]};if(method==='Target.attachToTarget')return {sessionId:'session'};
 if(method==='Target.sendMessageToTarget'){const r=JSON.parse(params.message);queueMicrotask(()=>{
 if(r.method==='Debugger.enable')receive({method:'Debugger.scriptParsed',params:{scriptId:'runtime',url:'chrome-extension://ext/extension/classic-runtime.js'}});
 if(r.method==='Debugger.pause')receive({method:'Debugger.paused',params:{hitBreakpoints:[],callFrames:[]}});
 if(r.method==='Debugger.resume')receive({method:'Debugger.resumed',params:{}});
 const result=r.method==='Debugger.getScriptSource'?{scriptSource:sourceOverride}:r.method==='Debugger.getPossibleBreakpoints'?{locations:[location]}:r.method==='Debugger.setBreakpoint'?{breakpointId:'native',actualLocation:moved?{...location,columnNumber:999}:location}:r.method==='Debugger.evaluateOnCallFrame'?exception?{exceptionDetails:{text:'side effect'}}:{result:{value:wrongFacts?{...facts(),hasContinuation:false}:facts()}}:{};receive({id:r.id,result});});}return {};};
 return {cdp,calls,hit:()=>receive({method:'Debugger.paused',params:{hitBreakpoints:['native'],callFrames:[{callFrameId:'frame',location}]}})};
}
test('classic boundary follows queued operation/directory writes and precedes callback return',()=>{
 const at=locateJ4BeforeNativeCommit(source),lines=source.split('\n');assert(lines[at.lineNumber].includes('result ='));assert.equal(lines[at.lineNumber-1].trim(),'check();');assert(lines.slice(at.lineNumber-8,at.lineNumber).join('\n').includes('continuationMarkerKey'));
 assert.throws(()=>locateJ4BeforeNativeCommit(source.replaceAll('result = { ok: true, replayed: false, revision: next.revision, operationId };','other = null;')),/boundary-required/);
 assert.throws(()=>locateJ4BeforeNativeCommit(source+'\n'+source),/boundary-required/);
});
test('real packaged bytes and exact pause required; facts read has side-effect rejection enabled',async()=>{
 const f=fixture(),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot,expectedTargetId:'worker'});await p.verifyControl();f.hit();const hit=await p.wait();assert.deepEqual(hit.facts,facts());
 const evalCall=f.calls.filter(x=>x.method==='Target.sendMessageToTarget').map(x=>JSON.parse(x.params.message)).find(x=>x.method==='Debugger.evaluateOnCallFrame');assert.equal(evalCall.params.throwOnSideEffect,true);assert.equal(evalCall.params.returnByValue,true);assert(!evalCall.params.expression.includes('.abort('));
 await p.close();assert.equal(f.cdp.listenerCount('Target.receivedMessageFromTarget'),0);assert(f.calls.some(x=>x.method==='Target.detachFromTarget'));
});
for(const [name,options,pattern]of [['different executed source',{sourceOverride:source+'\n'},/source-mismatch/],['moved breakpoint',{moved:true},/breakpoint-moved/]])test('reject '+name,async()=>{const f=fixture(options);await assert.rejects(pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot}),pattern);assert.equal(f.cdp.listenerCount('Target.receivedMessageFromTarget'),0);});
for(const options of [{wrongFacts:true},{exception:true}])test('reject nonmixed or unreadable paused facts '+JSON.stringify(options),async()=>{const f=fixture(options),p=await pauseJ4BeforeNativeCommit(f.cdp,'ext',{packageRoot});try{f.hit();await assert.rejects(p.wait());}finally{await p.close();}});
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
