import {createHash} from 'node:crypto';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {TRACE_RECORDER,TRACE_PATHS,instrumentScaleSource,createScaleTracePackage,verifyScaleTracePackage,appendScaleTrace,collectScaleWorkerTrace} from './host-scale-trace.mjs';
const root=process.env.VAIWL_SOURCE_ROOT??fileURLToPath(new URL('../../',import.meta.url));
test('all real production anchors match once and instrumented modules parse',async()=>{const dir=await mkdtemp(join(tmpdir(),'scale-trace-check-'));try{for(const path of TRACE_PATHS){const source=await readFile(join(root,path),'utf8'),out=instrumentScaleSource(path,source);const file=join(dir,path.split('/').at(-1));await writeFile(file,out);execFileSync(process.execPath,['--check',file]);assert(out.includes('Date.now()'));assert.throws(()=>instrumentScaleSource(path,out),/anchor-mismatch/);}assert.throws(()=>instrumentScaleSource('other',''),/unknown/);}finally{await rm(dir,{recursive:true,force:true});}});
test('recorder has enum-only strings, numeric bounds, bounded bytes and count with drops',()=>{const context=vm.createContext({TextEncoder,Date});vm.runInContext(TRACE_RECORDER.replace('__SCALE_REALM__','worker').replace('__SCALE_CONSOLE__','')+`;for(let i=0;i<2000;i++)__scaleEmit('native-start',{producer:i,expectedRevision:i,refsCount:50,grant:'SECRET',format:'SECRET',error:'SECRET',elapsed:Infinity});`,context);const s=context.__vaiwlScaleTrace;assert(s.events.length<=1024);assert(s.bytes<=131072);assert(s.dropped>0);assert.equal(s.events.at(-1).producer,1999);assert(!JSON.stringify(s).includes('SECRET'));assert.equal(s.events.at(-1).error,'other');assert.equal(s.events.at(-1).elapsed,undefined);});
test('recorder exceptions never escape into production control flow',()=>{const context=vm.createContext({TextEncoder,Date});vm.runInContext(`Object.defineProperty(globalThis,'__vaiwlScaleTrace',{get(){throw Error('blocked')}});`+TRACE_RECORDER.replace('__SCALE_REALM__','worker').replace('__SCALE_CONSOLE__','')+`;__scaleEmit('pass-complete');__scaleOrdinal();`,context);});
test('report boundary rejects unknown keys, nonfinite numbers, unsafe enums and preserves latest bounded events',()=>{const target={events:[],bytes:0,dropped:0};for(const row of [{kind:'pass-complete',at:1,grant:'SECRET'},{kind:'pass-complete',at:1,error:'SECRET'},{kind:'pass-complete',at:1,refsCount:Infinity},{kind:'other',at:1}])appendScaleTrace(target,row);assert.equal(target.events.length,0);assert.equal(target.dropped,4);for(let i=0;i<2000;i++)appendScaleTrace(target,{kind:'native-root',at:i,format:'VERSION_INDEX',refsCount:i,realm:'worker'});assert(target.events.length<=1024);assert(target.bytes<=131072);assert.equal(target.events.at(-1).at,1999);});
test('copy preserves verified package, detects changed and unchanged file tampering',async()=>{const {buildHost}=await import(join(root,'extension/build.mjs'));const dir=await mkdtemp(join(tmpdir(),'scale-trace-package-'));try{const original=join(dir,'original');buildHost(original,{offlineOrigin:'http://127.0.0.1:3210'});const before=await readFile(join(original,TRACE_PATHS[0]));const trace=await createScaleTracePackage(original,join(dir,'copy'));assert(await verifyScaleTracePackage(trace));assert.deepEqual(await readFile(join(original,TRACE_PATHS[0])),before);const file=join(trace.unpacked,TRACE_PATHS[0]);await writeFile(file,'tampered');await assert.rejects(verifyScaleTracePackage(trace),/package-changed/);}finally{await rm(dir,{recursive:true,force:true});}});
test('worker snapshot only touches unique existing exact worker, bounded and no warmup',async()=>{let calls=0;const worker={url:()=> 'chrome-extension://id/extension/worker.mjs',evaluate:async()=>{calls++;return {status:'RAM_SNAPSHOT',events:[{kind:'view-run',at:2,producer:1}],dropped:0,producers:1};}};assert.equal((await collectScaleWorkerTrace({serviceWorkers:()=>[]},'id')).status,'NO_UNIQUE_EXISTING_WORKER');assert.equal((await collectScaleWorkerTrace({serviceWorkers:()=>[worker,worker]},'id')).status,'NO_UNIQUE_EXISTING_WORKER');assert.equal(calls,0);assert.equal((await collectScaleWorkerTrace({serviceWorkers:()=>[worker]},'id')).events.length,1);worker.evaluate=()=>new Promise(()=>{});assert.equal((await collectScaleWorkerTrace({serviceWorkers:()=>[worker]},'id',{timeout:5})).status,'UNAVAILABLE');});
test('runner opt-in selects verified copy, retains original deadlines and cannot produce timing samples',async()=>{const s=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');assert(s.includes("FREE_HOST_SCALE_TRACE==='1'"));assert(s.includes('path:tracePackage?.unpacked??built.unpacked'));assert(s.includes('timeout:30000'));assert(s.includes("status:'NOT_RUN_DIAGNOSTIC_INGESTION_OBSERVATION',samples:null"));assert(s.indexOf('diagnostic-progress-run-cannot-produce-scale-timing')<s.indexOf('report.measurement=await measureAtAdmittedScale'));assert(s.includes('verifyScaleTracePackage(tracePackage)'));});
test('actual instrumented drained hook distinguishes pending last ACK and dedup or empty completion',async()=>{const out=instrumentScaleSource(TRACE_PATHS[2],await readFile(join(root,TRACE_PATHS[2]),'utf8'));const hook=out.match(/if\(!surfaceParts.length&&!surfaceScanning\)__scaleEmit\("pass-drained",\{[^;]+;/)?.[0];assert(hook);for(const [surfaceParts,surfaceScanning,expected]of [[[],false,1],[[],true,0],[[{}],false,0]]){const events=[];vm.runInNewContext(hook,{surfaceParts,surfaceScanning,__scaleEmit:(...x)=>events.push(x),__scalePass:1,surfacePage:4,__scaleFragments:2,__scaleCandidates:50});assert.equal(events.length,expected);if(expected){assert.equal(events[0][0],'pass-drained');assert.equal(events[0][1].fragments,2);assert.equal(events[0][1].ok,undefined);}}});
test('actual instrumented view removal records stop without retaining mount identity',async()=>{const out=instrumentScaleSource(TRACE_PATHS[1],await readFile(join(root,TRACE_PATHS[1]),'utf8'));const hook=out.match(/__scaleEmit\("view-stop",\{[^;]+;/)?.[0];assert(hook);const events=[];vm.runInNewContext(hook,{entry:{prepareGeneration:3,pending:true,error:'snapshot-revision-changed',scopeKey:'PRIVATE'},__scaleError:x=>x,__scaleEmit:(...x)=>events.push(x)});assert.equal(events.length,1);assert.equal(events[0][1].generation,3);assert.equal(events[0][1].pending,true);assert(!JSON.stringify(events).includes('PRIVATE'));});
test('diagnostic ends after both initial surfaces before unrelated native tail actions',async()=>{const s=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8'),at=s.indexOf("throw Error('diagnostic-initial-ingestion-complete')");assert(at>s.indexOf('for(let tab=0;tab<2;tab++)'));assert(at<s.indexOf("report.phase='native-tail-ingestion'"));assert(s.slice(at-220,at).includes('if(traceEnabled&&!traceThroughReturn)'));assert(s.includes("?'DIAGNOSTIC_ONLY_INGESTION_COMPLETE':context?'FAIL'"));});
const recorder=TRACE_RECORDER.replace('__SCALE_REALM__','worker').replace('__SCALE_CONSOLE__','');
async function actual(index){return instrumentScaleSource(TRACE_PATHS[index],await readFile(join(root,TRACE_PATHS[index]),'utf8'));}
test('missing native phases survive both producer and report as null; unsafe values do not',()=>{const context=vm.createContext({TextEncoder,Date,performance});vm.runInContext(recorder+`;__scaleEmit('native-abort',{txMs:1,rootMs:null,saveMs:null,reduceMs:null,sharedMs:null,publishMs:null,queuedMs:null,scanMs:Infinity});`,context);const row=context.__vaiwlScaleTrace.events[0],target={events:[],bytes:0,dropped:0};appendScaleTrace(target,row);assert.equal(target.events.length,1);assert.equal(row.rootMs,null);assert.equal(row.queuedMs,null);assert.equal(row.scanMs,undefined);appendScaleTrace(target,{kind:'native-abort',at:1,producer:null});assert.equal(target.dropped,1);});
test('actual scan and hash/split hooks call once, preserve values and thrown object',async()=>{const out=await actual(2);const scan=out.slice(out.indexOf('let found=null;'),out.indexOf('const payload=found?'));const split=out.slice(out.indexOf('const __scaleSplitStats='),out.indexOf('\n     if(!surfaceScanning){',out.indexOf('const __scaleSplitStats=')));for(const throwing of [false,true]){const error=Error('private');let calls=0;const c=vm.createContext({TextEncoder,Date,performance,page:true,surfaceCursor:7,__scaleStats:null,discovery:{scanPage(x){calls++;assert.equal(x,7);if(throwing)throw error;return {payload:8};}}});vm.runInContext(recorder,c);if(throwing)assert.throws(()=>vm.runInContext(scan,c),x=>x===error);else assert.equal(vm.runInContext(scan+'found.payload',c),8);assert.equal(calls,1);
 let keys=0,splits=0;const d=vm.createContext({TextEncoder,Date,performance,__scaleStats:null,source:{payload:{detachedHandles:[1]}},surfaceKey:null,surfacePageKey:0,surfaceAccepted:new Map(),surfaceFailed:new Map(),publicationKey(){keys++;return 'key';},splitSurfacePayload(){splits++;if(throwing)throw error;return [1];},surfaceParts:[]});vm.runInContext(recorder,d);if(throwing)assert.throws(()=>vm.runInContext(split,d),x=>x===error);else{vm.runInContext(split,d);assert.deepEqual(d.surfaceParts,[1]);}assert.equal(keys,1);assert.equal(splits,1);}});
test('actual emit await preserves one call and late ACK updates captured old pass only',async()=>{const out=await actual(2),start=out.indexOf('let ack;const __scaleEmitStart='),end=out.indexOf('\n   if(run!==generation)return;',start),hook=out.slice(start,end);let resolve,calls=0;const c=vm.createContext({TextEncoder,Date,performance,p:{},track:async work=>await work(),finish:x=>x,emit:()=>{calls++;return new Promise(r=>resolve=r);}});vm.runInContext(recorder+`;globalThis.old=__scalePassStats(1);globalThis.newPass=__scalePassStats(2);globalThis.__scaleSendStats=old;`,c);const pending=vm.runInContext('(async()=>{'+hook+'return ack;})()',c);c.__scaleStats=c.newPass;const ack={state:'accepted'};resolve(ack);assert.equal(await pending,ack);assert.equal(calls,1);assert.equal(c.old.emitCount,1);assert.equal(c.newPass.emitCount,0);
 const error=Error('private');c.emit=()=>{calls++;throw error;};assert.equal(await vm.runInContext('(async()=>{'+hook+'})()',c),'host-observation-ack-unknown');assert.equal(c.old.emitCount,2);assert.equal(calls,2);});
test('actual intermediate summaries cap at eight per pass while totals keep growing',async()=>{const out=await actual(2);const start=out.indexOf('if(__scaleSendStats){'),end=out.indexOf('if(ack?.localSeq!==p.localSeq)',start),hook=out.slice(start,end);const c=vm.createContext({TextEncoder,Date,performance,ack:{state:'accepted'}});vm.runInContext(recorder+`;const __scaleSendStats=__scalePassStats(1);for(let i=1;i<=1000;i++){__scaleSendStats.emitCount=i;${hook}}globalThis.totals=__scaleSendStats;`,c);assert.equal(c.__vaiwlScaleTrace.events.length,8);assert.equal(c.totals.accepted,1000);assert.equal(c.totals.samples,8);});
test('actual first migration hook calls original once and preserves prior commit on failure',async()=>{const out=await actual(0);const start=out.indexOf('const __scaleMigration='),end=out.indexOf('\n      }\n      return result;',start),hook=out.slice(start,end);for(const throwing of [false,true]){let calls=0,fences=0;const result={ok:true,revision:1},receiver={migrateVersionIndex:async()=>{calls++;if(throwing)throw Error('private');return {ok:true,revision:2};}};const c=vm.createContext({TextEncoder,Date,performance,receiver,result,normalized:{key:'private'},request:{operationId:'private'},options:{},digest:()=>'',fence:()=>{fences++;}});vm.runInContext(recorder,c);assert.equal(await vm.runInContext('(async function(){'+hook+'return result;}).call(receiver)',c),result);assert.equal(calls,1);assert.equal(fences,1);assert.deepEqual(Array.from(c.__vaiwlScaleTrace.events,x=>x.kind),['migration-start','migration-end']);assert.equal(c.__vaiwlScaleTrace.events[1].ok,!throwing);assert(!JSON.stringify(c.__vaiwlScaleTrace).includes('private'));}});
test('actual preparation deadline hook only observes existing terminal branch',async()=>{const out=await actual(1);const hook=out.match(/__scaleEmit\('view-terminal',\{[^;]+;/)?.[0];assert(hook);const events=[];vm.runInNewContext(hook,{__scaleEmit:(...x)=>events.push(x),__scaleProducer:2,generation:4,retries:0,elapsedNow:()=>30000,started:0,__scaleWaitCount:600,__scaleWaitFirst:50,__scaleWaitLast:29950});assert.equal(events[0][1].error,'read-budget-exhausted');assert.equal(events[0][1].elapsed,30000);assert.equal(events[0][1].attempt,1);});
test('actual pass lifecycle excludes body, clears idle/new start and dirty cancellation, and cannot relabel old producer',async()=>{const out=await actual(2),capture=out.match(/const __scaleSendStats=p.kind==="surface-delta"\?__scaleStats:null;/)[0],terminal=out.slice(out.indexOf('  if(entry.terminal)return;'),out.indexOf('\n  try{track(()=>entry.notify')),reset=out.slice(out.indexOf('if(surfaceEpoch!==surfaceSnapshotEpoch){'),out.indexOf('dirty=false;const run=generation;')),beginClear='__scaleStats=null;__scaleStatsOwner=null;pass=entry;';assert(out.includes(beginClear));
 const old={producer:1,emitCount:3},owner={terminal:false};const c=vm.createContext({TextEncoder,Date,performance,__scaleStats:old,__scaleStatsOwner:owner,entry:owner,phase:'end',p:{kind:'current-observation'}});vm.runInContext(recorder,c);assert.equal(vm.runInContext('(()=>{'+capture+'return __scaleSendStats;})()',c),null);vm.runInContext('(()=>{'+terminal+'})()',c);assert.equal(c.__scaleStats,null);assert.equal(c.__vaiwlScaleTrace.events.length,1);
 c.__scaleStats=old;c.__scaleStatsOwner=owner;c.entry={terminal:false};vm.runInContext(beginClear,c);assert.equal(vm.runInContext('(()=>{'+capture+'return __scaleSendStats;})()',c),null);c.phase='cancel';vm.runInContext('(()=>{'+terminal+'})()',c);assert.equal(c.__vaiwlScaleTrace.events.length,1,'begin registration failure must not emit old stats');
 Object.assign(c,{__scaleStats:{producer:2},__scaleStatsOwner:{},surfaceEpoch:2,surfaceSnapshotEpoch:1,pass:{},surfaceParts:[{}],surfaceScanning:true,surfaceCursor:{}});vm.runInContext(reset,c);assert.equal(c.__scaleStats,null);assert.equal(c.__scaleStatsOwner,null);assert.equal(c.__vaiwlScaleTrace.events.length,2);assert.equal(c.__vaiwlScaleTrace.events[1].producer,2);assert.equal(c.__vaiwlScaleTrace.events[1].ok,false);
 assert(out.includes("function stop(){idleRevision++;finishPass('cancel');__scaleStats=null;__scaleStatsOwner=null;"));
});
test('native terminal and phase offsets share monotonic clock despite wall clock jump',async()=>{const out=await actual(0),hook=out.match(/__scaleEmit\("native-commit",\{[^;]+;/)[0];let t=20;const c=vm.createContext({TextEncoder,Date:{now:()=>1},performance:{now:()=>t},__scaleStages:{queuedMs:5},__scaleMono:10,__scaleProducer:1,result:{revision:2,ok:true},expectedRevision:1});vm.runInContext(recorder+hook,c);assert.equal(c.__vaiwlScaleTrace.events[0].elapsed,10);assert.equal(c.__vaiwlScaleTrace.events[0].at,1);assert.equal(c.__vaiwlScaleTrace.events[0].elapsed-c.__vaiwlScaleTrace.events[0].queuedMs,5);});

test('return trace stays opt-in and exits before admitted-scale measurement with no samples',async()=>{
 const s=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');
 assert(s.includes("traceThroughReturn=traceEnabled&&process.env.FREE_HOST_SCALE_TRACE_RETURN==='1'"));
 const initial=s.split('\n').find(line=>line.includes("throw Error('diagnostic-initial-ingestion-complete')"));
 const guard=s.split('\n').find(line=>line.includes("throw Error('diagnostic-progress-run-cannot-produce-scale-timing')"));
 assert(initial&&guard);assert(s.indexOf(initial)<s.indexOf("report.phase='native-tail-ingestion'"));assert(s.indexOf(guard)>s.indexOf("report.phase='return-workspace-local-search'"));assert(s.indexOf(guard)<s.indexOf('report.measurement=await measureAtAdmittedScale'));
 for(const through of [false,true]){
  const report={},context=vm.createContext({cpuProfileEnabled:false,traceEnabled:true,traceThroughReturn:through,report,process:{env:{}}});
  if(!through)assert.throws(()=>vm.runInContext(initial,context),/diagnostic-initial-ingestion-complete/);
  else {vm.runInContext(initial,context);assert.equal(report.measurement,undefined);assert.throws(()=>vm.runInContext(guard,context),/diagnostic-progress-run-cannot-produce-scale-timing/);}
  assert.equal(report.measurement.samples,null);assert.equal(report.measurement.acceptance,'NOT_ESTABLISHED');
 }
 assert(s.includes("traceThroughReturn&&error.message==='diagnostic-progress-run-cannot-produce-scale-timing'?'DIAGNOSTIC_ONLY_RETURN_COMPLETE'"));
});

async function windowHarness(instrumented,{maxViews=2}={}){
 const source=await readFile(join(root,TRACE_PATHS[1]),'utf8'),out=instrumented?instrumentScaleSource(TRACE_PATHS[1],source):source;
 const code=out.slice(out.indexOf('const views=new Map()'),out.indexOf(' const resumeKey='));
 let time=0;const c=vm.createContext({TextEncoder,Date,performance,elapsedNow:()=>time,maxViews});
 vm.runInContext((instrumented?recorder:'')+code+';globalThis.api={views,readWindows,liveWindow,reserveRead,releaseRead};',c);
 return {api:c.api,time:value=>time=value,events:()=>c.__vaiwlScaleTrace?.events??[]};
}
const windowEntry=(scope='PRIVATE_SCOPE',generation=1)=>({scopeKey:scope,prepareGeneration:generation,pending:true,awaitingDelivery:true,isCurrent:()=>true});
test('instrumented scope window shares exact identity and stale generation or identity release never mutates it',async()=>{
 for(const instrumented of [false,true]){
  const h=await windowHarness(instrumented),a=windowEntry(),b=windowEntry();h.api.views.set('PRIVATE_MOUNT_A',a);h.api.views.set('PRIVATE_MOUNT_B',b);h.api.reserveRead(a);const window=a.readWindow;h.time(40);h.api.reserveRead(b);
  assert.equal(a.readWindow,b.readWindow);assert.equal(window.until,1000);assert.equal(window.active,true);
  a.prepareGeneration=2;h.api.releaseRead(a,window,1);assert.equal(window.active,true);assert.equal(a.awaitingDelivery,true);
  const stale={active:true};h.api.releaseRead(a,stale,2);assert.equal(stale.active,true);assert.equal(window.active,true);
  h.api.releaseRead(a,window,2);assert.equal(window.active,true);assert.equal(a.awaitingDelivery,false);assert.equal(a.readWindow,null);
  h.api.releaseRead(b,window,1);assert.equal(window.active,false);assert.equal(b.readWindow,null);
  if(instrumented){const events=h.events();assert.deepEqual(Array.from(events,e=>e.kind),['window-reserve','window-reserve','window-release','window-release','window-release','window-release','window-expire']);assert.equal(events[0].window,events[1].window);assert.equal(events[1].shared,true);assert.equal(events[2].ok,false);assert.equal(events[2].generation,1);assert.equal(events[3].ok,false);assert.equal(events[4].ok,true);assert(!JSON.stringify(events).includes('PRIVATE'));}
 }
});
for(const [mode,code]of [['deadline',2],['rollback',1],['nonfinite',1],['no-reader',3]])test('instrumented window '+mode+' expiry preserves original result and blocks reuse',async()=>{
 for(const instrumented of [false,true]){
  const h=await windowHarness(instrumented),entry=windowEntry();h.api.views.set('mount',entry);h.api.reserveRead(entry);const window=entry.readWindow;
  if(mode==='deadline')h.time(1000);else if(mode==='rollback')h.time(-1);else if(mode==='nonfinite')h.time(NaN);else entry.isCurrent=()=>false;
  assert.equal(h.api.liveWindow(entry.scopeKey),false);assert.equal(window.active,false);h.time(1001);h.api.reserveRead(entry);assert.equal(entry.readWindow,window);assert.equal(window.active,false);
  if(instrumented){const expired=h.events().find(e=>e.kind==='window-expire'),refused=h.events().find(e=>e.kind==='window-refused');assert.equal(expired.refusal,code);assert.equal(refused.refusal,1);assert.equal(expired.window,refused.window);}
 }
});
test('instrumented window used/cap/nonfinite refusal preserves original no-reservation behavior',async()=>{
 for(const instrumented of [false,true]){
  const h=await windowHarness(instrumented,{maxViews:1}),a=windowEntry(),b=windowEntry('PRIVATE_OTHER');h.api.views.set('a',a);h.api.views.set('b',b);h.api.reserveRead(a);h.api.reserveRead(b);assert.equal(b.readWindow,undefined);assert.equal(h.api.readWindows.size,1);
  if(instrumented)assert.equal(h.events().at(-1).refusal,2);
  const fresh=await windowHarness(instrumented),e=windowEntry();fresh.time(Infinity);fresh.api.reserveRead(e);assert.equal(e.readWindow,undefined);assert.equal(fresh.api.readWindows.size,0);if(instrumented)assert.equal(fresh.events().at(-1).refusal,3);
 }
});
test('instrumented revision restart emits only changed-version booleans and calls original begin once',async()=>{
 const source=await readFile(join(root,TRACE_PATHS[1]),'utf8');
 for(const changed of ['none','freshness','native','workspace','evidence','view'])for(const instrumented of [false,true]){
  const out=instrumented?instrumentScaleSource(TRACE_PATHS[1],source):source,hook=out.split('\n').find(line=>line.includes('if(freshnessChanged||version.nativeRevision'));
  assert(hook);let calls=0;const entry={readWindow:{},prepareGeneration:7,scopeKey:'PRIVATE'},version={nativeRevision:1,revision:2,evidenceRevision:3,viewRevision:4},value={revision:1,workspaceRevision:2,evidenceRevision:3,viewRevision:4};
  if(changed!=='none'&&changed!=='freshness')version[{native:'nativeRevision',workspace:'revision',evidence:'evidenceRevision',view:'viewRevision'}[changed]]++;
  const c=vm.createContext({TextEncoder,Date,performance,entry,version,value,freshnessChanged:changed==='freshness',__scaleWindow:()=>8,begin:arg=>{assert.equal(arg,entry);calls++;}});
  const result=vm.runInContext((instrumented?recorder:'')+'(()=>{'+hook+'return null;})()',c);assert.equal(calls,changed==='none'?0:1);assert.equal(result?.state??null,changed==='none'?null:'preparing');
  if(instrumented&&changed!=='none'){const row=c.__vaiwlScaleTrace.events[0];assert.equal(row.kind,'view-version-restart');for(const key of ['native','workspace','evidence','view','freshness'])assert.equal(row[key+'Changed'],key===changed);assert.equal(row.generation,7);assert(!JSON.stringify(row).includes('PRIVATE'));}
 }
});
test('window diagnostic recorder and report enforce fixed numeric/boolean fields without scope identity',()=>{
 const c=vm.createContext({TextEncoder,Date,performance});vm.runInContext(recorder+`;__scaleEmit('window-release',{window:3,generation:9,ok:false,scope:'PRIVATE_SCOPE',mountId:'PRIVATE_MOUNT',grant:'PRIVATE_GRANT'});`,c);
 const row=c.__vaiwlScaleTrace.events[0],target={events:[],bytes:0,dropped:0};appendScaleTrace(target,row);assert.equal(target.events.length,1);assert.equal(row.window,3);assert.equal(row.generation,9);assert.equal(row.ok,false);assert(!JSON.stringify(target).includes('PRIVATE'));
 for(const patch of [{scope:'PRIVATE'},{window:'PRIVATE'},{generation:Infinity},{refusal:'used'}])appendScaleTrace(target,{...row,...patch});assert.equal(target.events.length,1);assert.equal(target.dropped,4);
});

async function replicaHarness(instrumented,{failure=null,holdHeader=false,fast=false}={}){
 const source=await readFile(join(root,TRACE_PATHS[3]),'utf8'),out=instrumented?instrumentScaleSource(TRACE_PATHS[3],source):source;
 let time=0,resolveHeader,refreshes=0;const calls=[],error=Error('PRIVATE_FAILURE'),snapshot={scope:'PRIVATE_SCOPE',groups:[]},index={};
 const step=(name,ms,value)=>{calls.push(name);time+=ms;if(failure===name)throw error;return value;};
 const header={revision:1,workspaceRevision:2,evidenceRevision:3,viewRevision:4,viewSession:{H:30,T:1,Z:'UTC',policyRevision:0}};
 const c=vm.createContext({TextEncoder,Date,performance:{now:()=>time},AbortController,setTimeout,clearTimeout,Intl,
  normalizedScope:()=>({key:'PRIVATE_SCOPE'}),instant:()=>1,
  createReadRecoveryBudget:()=>({begin(){},check(){},complete(){}}),withRequestDeadline:work=>work(),
  loadFreeHeader:async({load})=>load(),loadFreePages:async({load})=>{if(failure==='pages')return step('pages',20);return [await load({refs:['PRIVATE_REF']})];},
  planFreeReplica:()=>({full:!fast||refreshes++===0,rebuild:false,projects:[],refs:[]}),freeReplicaRequests:()=>[{}],
  assembleFreeReplicaAsync:async()=>step('assemble',30,{snapshot}),freeNavigationSnapshot:()=>step('snapshot',40,snapshot),
  currentIndexAsync:async()=>step('index',50,index),rebindPreparedFreeSnapshot:()=>step('compatible',5,snapshot),
  readService:{freeHeader:async()=>{step('header',10);if(holdHeader)await new Promise(r=>resolveHeader=r);return header;},freePage:async()=>step('pages',20,{scope:'PRIVATE_SCOPE'}),version:async()=>step('version',60,{nativeRevision:1,revision:2,evidenceRevision:3,viewRevision:4})}});
 vm.runInContext(out.replace(/^import .*;\n/gm,'').replace('export function createFreeViewOwner','function createFreeViewOwner')+';globalThis.owner=createFreeViewOwner({readService,scope:{},timeZone:"UTC"});',c);
 return {owner:c.owner,calls,error,index,snapshot,release:()=>resolveHeader?.(),events:()=>c.__vaiwlScaleTrace?.events??[]};
}
test('replica instrumentation preserves exact calls and published values; offsets are cumulative',async()=>{
 for(const instrumented of [false,true]){const h=await replicaHarness(instrumented),result=await h.owner.refresh();assert.equal(result.snapshot,h.snapshot);assert.equal(result.index,h.index);assert.deepEqual(h.calls,['header','pages','assemble','snapshot','index','version']);if(instrumented){const [row]=h.events();assert.equal(h.events().length,1);assert.equal(row.kind,'replica-terminal');assert.equal(row.ok,true);for(const [key,value]of Object.entries({headerMs:10,pagesMs:30,assembleMs:60,snapshotMs:100,indexMs:150,versionMs:210,elapsed:210}))assert.equal(row[key],value);assert(!JSON.stringify(row).includes('PRIVATE'));}h.owner.stop();}
});
for(const failure of ['header','pages','assemble','snapshot','index','version'])test('replica '+failure+' error preserves identity and emits one incomplete terminal',async()=>{
 for(const instrumented of [false,true]){const h=await replicaHarness(instrumented,{failure});await assert.rejects(h.owner.refresh(),e=>e===h.error);assert.equal(h.owner.current(),null);if(instrumented){assert.equal(h.events().length,1);const row=h.events()[0];assert.equal(row.ok,false);assert.equal(row[failure==='header'?'headerMs':failure+'Ms'],null);assert.equal(row.versionMs,null);assert(!JSON.stringify(row).includes('PRIVATE'));}h.owner.stop();}
});
test('cancelled replica emits once and late header cannot refill terminal stages or publish',async()=>{
 for(const instrumented of [false,true]){const h=await replicaHarness(instrumented,{holdHeader:true}),promise=h.owner.refresh();await Promise.resolve();h.owner.stop();await assert.rejects(promise,/stale-free-view/);const before=JSON.stringify(h.events());h.release();for(let i=0;i<20;i++)await Promise.resolve();assert.equal(h.owner.current(),null);assert.deepEqual(h.calls,['header']);assert.equal(JSON.stringify(h.events()),before);if(instrumented){assert.equal(h.events().length,1);assert.equal(h.events()[0].headerMs,null);assert.equal(h.events()[0].ok,false);}}
});
test('compatible replica path leaves unused assemble/index stages null',async()=>{
 const h=await replicaHarness(true,{fast:true});await h.owner.refresh();await h.owner.refresh();const row=h.events()[1];assert.equal(row.ok,true);assert.equal(row.assembleMs,null);assert.equal(row.indexMs,null);assert.equal(row.snapshotMs,35);assert.equal(row.versionMs,95);assert.equal(h.events().length,2);h.owner.stop();
});
test('replica trace strong anchors reject missing or duplicate phase and fixed schema rejects unsafe phase values',async()=>{
 const source=await readFile(join(root,TRACE_PATHS[3]),'utf8'),anchor='   const header=reply.header,plan=planFreeReplica(replica,header);';
 for(const replacement of ['',anchor+anchor])assert.throws(()=>instrumentScaleSource(TRACE_PATHS[3],source.replace(anchor,replacement)),/anchor-mismatch/);
 const c=vm.createContext({TextEncoder,Date,performance});vm.runInContext(recorder+`;__scaleEmit('replica-terminal',{headerMs:null,pagesMs:2,assembleMs:Infinity,snapshotMs:-1,indexMs:'PRIVATE',versionMs:1e16,body:'PRIVATE',ok:false});`,c);const target={events:[],bytes:0,dropped:0};appendScaleTrace(target,c.__vaiwlScaleTrace.events[0]);assert.equal(target.events.length,1);assert.equal(target.events[0].headerMs,null);assert.equal(target.events[0].pagesMs,2);for(const key of ['assembleMs','snapshotMs','indexMs','versionMs','body'])assert.equal(target.events[0][key],undefined);for(const value of ['PRIVATE',Infinity,-1])appendScaleTrace(target,{kind:'replica-terminal',at:1,headerMs:value});assert.equal(target.dropped,3);
});

async function pageHarness(instrumented,{failure=null,hold=false,explicit=true}={}){
 const source=await readFile(join(root,TRACE_PATHS[4]),'utf8'),out=instrumented?instrumentScaleSource(TRACE_PATHS[4],source):source;
 const start=out.indexOf('      freePage:')+'      freePage:'.length,end=out.indexOf('      freeSnapshot:',start),hook=out.slice(start,end).trim().replace(/,$/,'');
 let time=0,release,queryReads=0;const calls=[],error=Error('PRIVATE_FAILURE'),controller=new AbortController();
 const step=(name,ms,value)=>{calls.push(name);time+=ms;if(failure===name)throw error;return value;};
 const refs=[{id:'PRIVATE_C'}],projects=[{id:'PRIVATE_P',nativeName:'PRIVATE_TITLE'}],facts={sources:{},projects:{},refs:{},membership:{}},page={facts,selectedProjects:['PRIVATE_P'],selectedRefs:['PRIVATE_C'],revision:1,offset:0,total:1,nextOffset:null};
 const state={scopeKey:'PRIVATE_SCOPE',refs:{},sources:{},events:{},coverage:{},revision:2},stored={sources:{},events:{},hints:{},coverage:{},revision:3};
 const c=vm.createContext({TextEncoder,Date,performance:{now:()=>time},
  native:{page:async(scope,query,options)=>{step('native',10);if(hold)await new Promise((resolve,reject)=>{release=resolve;options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});return page;}},
  workspaceContext:async()=>step('context',20,{state}),evidence:{page:async()=>step('evidence',30,{evidence:stored})},
  freeProjection:()=>step('projection',20,{scope:'PRIVATE_SCOPE'}),activityEvidence:()=>step('activity-evidence',0,{}),
  projectFreeActivity:()=>step('activity',30,{refs,projects}),deadlines:()=>step('dto',5,[])});
 vm.runInContext((instrumented?recorder:'')+'globalThis.run='+hook+';',c);
 const query={get ids(){queryReads++;return explicit?{projects:['PRIVATE_P'],refs:['PRIVATE_C']}:null;},now:'PRIVATE_NOW',viewSession:{}};
 return {run:()=>c.run('PRIVATE_SCOPE',query,{signal:controller.signal}),calls,error,refs,projects,page,release:()=>release?.(),abort:()=>controller.abort(error),events:()=>c.__vaiwlScaleTrace?.events??[],reads:()=>queryReads};
}
for(const explicit of [false,true])test('freePage trace preserves DTO shape, identities, call order and selected counts explicit='+explicit,async()=>{
 const original=await pageHarness(false,{explicit}),traced=await pageHarness(true,{explicit}),a=await original.run(),b=await traced.run();assert.deepEqual(JSON.parse(JSON.stringify(b)),JSON.parse(JSON.stringify(a)));assert.equal(b.refs,traced.refs);assert.deepEqual(traced.calls,original.calls);assert.equal(traced.reads(),original.reads());
 const row=traced.events()[0];assert.equal(traced.events().length,1);assert.equal(row.kind,'page-terminal');assert.equal(row.ok,true);assert.equal(row.selectedProjectsCount,1);assert.equal(row.selectedRefsCount,1);assert.equal(row.pageReadsMs,60);assert.equal(row.pageProjectionMs,115);assert.equal(row.elapsed,115);assert(!JSON.stringify(row).includes('PRIVATE'));
});
for(const explicit of [false,true])for(const failure of ['native','context','evidence','projection','activity-evidence','activity','dto'])test('freePage '+failure+' rejection identity and original settlement order survive instrumentation explicit='+explicit,async()=>{
 const runs=[];for(const instrumented of [false,true]){const h=await pageHarness(instrumented,{failure,explicit});await assert.rejects(h.run(),e=>e===h.error);runs.push(h);if(instrumented){assert.equal(h.events().length,1);const row=h.events()[0];assert.equal(row.ok,false);assert.equal(row.pageProjectionMs,null);if(['native','context','evidence'].includes(failure)){assert.equal(row.pageReadsMs,null);assert.equal(row.selectedRefsCount,undefined);}if(failure==='native')assert.equal(h.reads(),0);assert(!JSON.stringify(row).includes('PRIVATE'));}}assert.deepEqual(runs[1].calls,runs[0].calls);assert.equal(runs[1].reads(),runs[0].reads());
});
for(const explicit of [false,true])test('freePage cancelled native await keeps original abort identity and emits a single incomplete terminal explicit='+explicit,async()=>{
 for(const instrumented of [false,true]){const h=await pageHarness(instrumented,{hold:true,explicit}),pending=h.run();h.abort();await assert.rejects(pending,e=>e===h.error);const before=JSON.stringify(h.events());h.release();for(let i=0;i<10;i++)await Promise.resolve();assert.equal(JSON.stringify(h.events()),before);assert.deepEqual(h.calls,['native']);if(instrumented){assert.equal(h.events().length,1);assert.equal(h.events()[0].pageReadsMs,null);assert.equal(h.events()[0].ok,false);}}
});
test('freePage observation cannot invoke selected array accessors or precede native validation',async()=>{
 const source=await actual(4),prefix=source.slice(source.indexOf('      freePage:'),source.indexOf('        const page=await native.page(scope,query,options)'));
 assert(!prefix.includes('query.'));assert(!prefix.includes('getOwnPropertyDescriptor(query'));
 for(const explicit of [false,true]){const counts=[];for(const instrumented of [false,true]){const h=await pageHarness(instrumented,{explicit});let reads=0;Object.defineProperty(h.page,'selectedRefs',{get(){reads++;return ['PRIVATE_C'];}});await h.run();counts.push(reads);if(instrumented)assert.equal(h.events()[0].selectedRefsCount,undefined);}assert.equal(counts[1],counts[0]);assert(counts[0]>0);}
});
test('freePage anchors and report boundary reject altered instrumentation and unsafe page fields',async()=>{
 const source=await readFile(join(root,TRACE_PATHS[4]),'utf8'),anchor='        const {state}=context,knownState=';for(const replacement of ['',anchor+anchor])assert.throws(()=>instrumentScaleSource(TRACE_PATHS[4],source.replace(anchor,replacement)),/anchor-mismatch/);
 const c=vm.createContext({TextEncoder,Date,performance});vm.runInContext(recorder+`;__scaleEmit('page-terminal',{pageReadsMs:null,pageProjectionMs:Infinity,selectedRefsCount:5,selectedProjectsCount:1,query:'PRIVATE',scope:'PRIVATE'});`,c);const target={events:[],bytes:0,dropped:0};appendScaleTrace(target,c.__vaiwlScaleTrace.events[0]);assert.equal(target.events.length,1);assert.equal(target.events[0].pageReadsMs,null);assert.equal(target.events[0].selectedRefsCount,5);assert.equal(target.events[0].pageProjectionMs,undefined);assert(!JSON.stringify(target).includes('PRIVATE'));for(const value of ['PRIVATE',null,Infinity,-1])appendScaleTrace(target,{kind:'page-terminal',at:1,selectedRefsCount:value});assert.equal(target.dropped,4);
});

test('classic trace rebuild follows instrumented source and rejects stale or forged generated files',async()=>{
 const {buildHost}=await import(join(root,'extension/build.mjs')),dir=await mkdtemp(join(tmpdir(),'classic-trace-rebuild-'));
 try{
  const original=join(dir,'original');buildHost(original,{offlineOrigin:'http://127.0.0.1:3210'});
  const trace=await createScaleTracePackage(original,join(dir,'copy')),compiled=compileClassicWorker(trace.unpacked);
  for(const [path,expected]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){
   assert.equal(await readFile(join(trace.unpacked,path),'utf8'),expected);assert(trace.changes.some(row=>row.path===path));
   const file=join(trace.unpacked,path),row=trace.changes.find(row=>row.path===path),saved=row.instrumentedSha256;
   await writeFile(file,expected+'\n/* altered */');await assert.rejects(verifyScaleTracePackage(trace),/package-changed/);
   row.instrumentedSha256=createHash('sha256').update(expected+'\n/* altered */').digest('hex');await assert.rejects(verifyScaleTracePackage(trace),/worker-build-mismatch/);
   await writeFile(file,expected);row.instrumentedSha256=saved;
  }
  const sourcePath='src/runtime/free-read-service.mjs',file=join(trace.unpacked,sourcePath),modified=await readFile(file,'utf8')+'\nglobalThis.__classicTraceSourceSentinel="CLASSIC_TRACE_SOURCE_SENTINEL";';
  assert.notEqual(await readFile(join(trace.unpacked,'extension/classic-runtime.js'),'utf8'),await readFile(join(original,'extension/classic-runtime.js'),'utf8'));
  await writeFile(file,modified);trace.changes.find(row=>row.path===sourcePath).instrumentedSha256=createHash('sha256').update(modified).digest('hex');
  const changed=compileClassicWorker(trace.unpacked);assert.notEqual(changed.runtime,compiled.runtime);assert(changed.runtime.includes('CLASSIC_TRACE_SOURCE_SENTINEL'));
  await assert.rejects(verifyScaleTracePackage(trace),/worker-build-mismatch/);
  const missing={...trace,changes:trace.changes.filter(row=>row.path!=='extension/classic-runtime.js')};await assert.rejects(verifyScaleTracePackage(missing),/manifest-missing-generated/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('publication cause anchors reject omission and duplication',async()=>{
 for(const [index,anchor]of [[2,'  requestScan(owned);'],[2,'  if(surfaceChanged)requestScan();else schedule();'],[2,"failedKey.delete('current-object');requestScan(true);return true;"],[2,'     if(!surfaceScanning){for(const cache'],[5,'   let result;'],[5,'   if(!result.ok)return result.reason']]){
  const source=await readFile(join(root,TRACE_PATHS[index]),'utf8');for(const replacement of ['',anchor+anchor])assert.throws(()=>instrumentScaleSource(TRACE_PATHS[index],source.replace(anchor,replacement)),/anchor-mismatch/);
 }
});
test('actual page decision distinguishes equal facts from detached forced publication without exposing keys',async()=>{
 const out=await actual(2),hook=out.match(/try\{__scaleEmit\("surface-page-decision",\{[^\n]+?catch\{\}/)[0];
 for(const [equal,detached,published]of [[true,0,false],[true,1,true],[false,0,true]]){
  const c=vm.createContext({TextEncoder,Date,performance,__scaleAdapter:3,__scaleStats:{producer:4},surfacePageKey:7,surfaceKey:'PRIVATE_KEY',surfaceAccepted:new Map([[7,equal?'PRIVATE_KEY':'OTHER_PRIVATE']]),source:{payload:{detachedHandles:Array(detached).fill('PRIVATE_HANDLE')}},surfaceParts:published?[{private:'PRIVATE_PAYLOAD'}]:[]});
  vm.runInContext(recorder+hook,c);const row=c.__vaiwlScaleTrace.events[0];assert.equal(row.equalAcceptedKey,equal);assert.equal(row.detachedCount,detached);assert.equal(row.publishDecision,published);assert.equal(row.pageOrdinal,7);assert(!JSON.stringify(row).includes('PRIVATE'));assert.equal(c.surfaceParts.length,published?1:0);
 }
});
test('actual scan cause callsites preserve request count and argument',async()=>{
 const out=await actual(2);
 for(const [name,tail]of [['renewalCause','requestScan(true);return true;'],['toggleCause','requestScan(owned);'],['mutationCause','requestScan();'],['initialCause','requestScan(true);']]){
  const re=new RegExp("__scaleEmit\\('scan-cause',\\{adapterOrdinal:__scaleAdapter,"+name+"[^;]+;"),emit=out.match(re)?.[0];assert(emit);assert(out.includes(emit+tail));
  let calls=0,arg;const c=vm.createContext({TextEncoder,Date,performance,__scaleAdapter:3,owned:true,requestScan:value=>{calls++;arg=value;}});vm.runInContext(recorder+'(()=>{'+emit+tail+'})()',c);assert.equal(calls,1);assert.equal(arg,name==='mutationCause'?undefined:true);assert.equal(c.__vaiwlScaleTrace.events[0][name],true);
 }
});
test('owner publication and result report only existing semantic flags and numbers',async()=>{
 const out=await actual(5),before=out.match(/const __scalePublication=__scaleOrdinal\(\);[^\n]+?let result;/)[0],after=out.match(/try\{__scaleEmit\("owner-result",[^\n]+?catch\{\}/)[0];
 for(const changed of [false,true]){const c=vm.createContext({TextEncoder,Date,performance,previous:changed?{}:undefined,nativeChanged:changed,revalidating:!changed,combined:changed?{private:'PRIVATE'}:null,batch:{projects:[{id:'PRIVATE'}],refs:[{title:'PRIVATE'}],membership:[]}});vm.runInContext(recorder+before+'result={ok:true,revision:123,private:"PRIVATE"};'+after,c);const [a,b]=c.__vaiwlScaleTrace.events;assert.equal(a.nativeChanged,changed);assert.equal(a.revalidating,!changed);assert.equal(a.combined,changed);assert.equal(a.refsCount,1);assert.equal(a.projectsCount,1);assert.equal(a.membershipCount,0);assert.equal(b.revision,123);assert.equal(a.producer,b.producer);assert(!JSON.stringify(c.__vaiwlScaleTrace).includes('PRIVATE'));const target={events:[],bytes:0,dropped:0};appendScaleTrace(target,a);appendScaleTrace(target,b);assert.equal(target.events.length,2);}
});
test('adapter lifecycle uses anonymous distinct starts and does not invent stop reasons',async()=>{
 const out=await actual(2),start=out.match(/__scaleAdapter=__scaleOrdinal\(\);__scaleEmit\("adapter-start",[^;]+;/)[0],stop=out.match(/__scaleEmit\('adapter-stop',\{[^;]+;/)[0];const c=vm.createContext({TextEncoder,Date,performance,__scaleAdapter:0,stopped:true});vm.runInContext(recorder+stop,c);c.stopped=false;vm.runInContext(start+stop+start,c);const rows=c.__vaiwlScaleTrace.events;assert.equal(rows[0].wasLive,false);assert.equal(rows[2].wasLive,true);assert.equal(rows[1].adapterOrdinal,rows[2].adapterOrdinal);assert.notEqual(rows[1].adapterOrdinal,rows[3].adapterOrdinal);assert(rows.every(row=>Number.isFinite(row.at)));assert(rows.every(row=>!Object.hasOwn(row,'reason')));
});
