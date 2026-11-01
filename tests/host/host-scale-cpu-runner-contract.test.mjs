import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {collectScaleCPUPhaseTrace} from './host-scale-trace.mjs';
const runner=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');
// Execute the actual runner's diagnostic-only block with controlled handles.
// No browser import, target creation, source mutation or full runner execution.
const start=runner.indexOf('   if(cpuProfileEnabled){\n'),end=runner.indexOf('   report.nativeMemberProgress=',start);
assert(start>=0&&end>start);
const block=runner.slice(start,end),close=runner.match(/^ const closeCPUTransport=.*$/m)?.[0],cleanup=runner.match(/^  if\(cpuProfileEnabled\)\{try\{await Promise\.allSettled\(cpuProfiles.*$/m)?.[0];
assert(close&&cleanup);
const execute=new Function('env',`return (async()=>{
 const {report,nativeCPUPageSession,connectJ4Debugger,browserHandle,startHostScaleCPUProfile,startHostScalePageCPUProfile,server,projectPath,id,context,collectScaleCPUPhaseTrace}=env;
 const cpuProfileEnabled=true,cpuTraceEnabled=env.cpuTraceEnabled===true,cpuProfiles=[];let cpuTransport,cpuProfilesFinished;
 ${close}
 ${block}
 return {finished:cpuProfilesFinished,finish:async()=>{${cleanup}}};
})();`);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture({rejectWorker=false,closeThrows=false}={}){
 const states=['WORKER','NATIVE_PAGE'].map(kind=>{const d=deferred(),report={kind:`DIAGNOSTIC_ONLY_HOST_SCALE_${kind}_CPU`,status:'CAPTURED',acceptance:'NOT_ESTABLISHED'};let finishCalls=0;return {report,resolve:()=>d.resolve(report),handle:{finished:d.promise,finish:async()=>{finishCalls++;d.resolve(report);return report;}},finishCalls:()=>finishCalls};});
 const calls=[],report={status:'FAIL',error:'original-failure',phase:'visible-native-member-progress'},transport={close:()=>{calls.push('close');if(closeThrows)throw Error('close failed');}},projectPath='/g/g-p-00000000000000000000000000000001/project',id='a'.repeat(32);
 const env={report,context:{serviceWorkers:()=>[]},collectScaleCPUPhaseTrace,nativeCPUPageSession:{send:async method=>{calls.push(method);return {targetInfo:{targetId:'exact-native-page'}};}},connectJ4Debugger:async endpoint=>{calls.push(endpoint);return transport;},browserHandle:{debugEndpoint:'owned-browser'},startHostScaleCPUProfile:async options=>{calls.push({worker:options});if(rejectWorker)throw Error('worker-start-failed');return states[0].handle;},startHostScalePageCPUProfile:async options=>{calls.push({page:options});return states[1].handle;},server:{origin:'http://127.0.0.1:41234'},projectPath,id};
 return {env,states,calls,report,transport};
}
for(const first of [0,1])test('runner keeps shared transport until both actual finished promises settle; first='+first,async()=>{
 const f=fixture(),h=await execute(f.env),unchanged={status:f.report.status,error:f.report.error,phase:f.report.phase};
 assert.deepEqual(f.calls.find(c=>c?.worker).worker,{transport:f.transport,extensionId:f.env.id});
 assert.deepEqual(f.calls.find(c=>c?.page).page,{transport:f.transport,targetId:'exact-native-page',expectedURL:f.env.server.origin+f.env.projectPath});
 f.states[first].resolve();await Promise.resolve();await Promise.resolve();assert(!f.calls.includes('close'));
 f.states[1-first].resolve();await h.finished;assert.equal(f.calls.filter(x=>x==='close').length,1);
 assert.equal(f.report.workerCPUProfile,f.states[0].report);assert.equal(f.report.nativePageCPUProfile,f.states[1].report);assert.deepEqual(f.report.cpuProfileCleanup,{status:'SUCCEEDED'});
 await h.finish();assert.equal(f.calls.filter(x=>x==='close').length,1);assert.deepEqual({status:f.report.status,error:f.report.error,phase:f.report.phase},unchanged);
});
test('runner starts both setups before either setup promise settles',async()=>{
 const f=fixture(),worker=deferred(),page=deferred();let entered=0;
 f.env.startHostScaleCPUProfile=()=>{entered++;return worker.promise;};f.env.startHostScalePageCPUProfile=()=>{entered++;return page.promise;};
 const started=execute(f.env);await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,2);assert(!f.calls.includes('close'));
 worker.resolve(f.states[0].handle);page.resolve(f.states[1].handle);const h=await started;await h.finish();assert.equal(f.calls.filter(x=>x==='close').length,1);assert(f.states.every(s=>s.finishCalls()===1));
});
test('runner failed worker setup cannot close successfully started native sampling early',async()=>{
 const f=fixture({rejectWorker:true}),h=await execute(f.env);assert(!f.calls.includes('close'));assert.equal(f.report.workerCPUProfile.status,'UNAVAILABLE');
 f.states[1].resolve();await h.finished;assert.equal(f.report.nativePageCPUProfile.status,'CAPTURED');assert.equal(f.calls.filter(x=>x==='close').length,1);assert.equal(f.report.status,'FAIL');
});
test('runner explicit cleanup finishes both profiles then closes transport once',async()=>{
 const f=fixture(),h=await execute(f.env);await h.finish();assert(f.states.every(s=>s.finishCalls()===1));assert.equal(f.calls.filter(x=>x==='close').length,1);assert.equal(f.report.status,'FAIL');
});
test('runner close error is diagnostic cleanup failure and never replaces original failure',async()=>{
 const f=fixture({closeThrows:true}),h=await execute(f.env);await h.finish();assert.equal(f.report.cpuProfileCleanup.status,'UNAVAILABLE');assert.equal(f.report.error,'original-failure');assert.equal(f.report.status,'FAIL');assert.equal(f.calls.filter(x=>x==='close').length,1);
});
test('runner cannot start profiles when exact native page identity lookup fails',async()=>{
 const f=fixture();f.env.nativeCPUPageSession.send=async()=>{throw Error('target unavailable');};const h=await execute(f.env);await h.finish();assert.equal(f.report.workerCPUProfile.status,'UNAVAILABLE');assert.equal(f.report.nativePageCPUProfile.status,'UNAVAILABLE');assert(!f.calls.length);assert.equal(f.report.error,'original-failure');
});
test('runner diagnostic preserves formal 30-second and output guards, original fixture hashes and browser count',()=>{
 assert.match(runner,/memberReturnDeadline=performance\.now\(\)\+30000/);
 assert.match(runner,/if\(\(cpuProfileEnabled\|\|traceEnabled/);
 assert.match(runner,/throw Error\('diagnostic-progress-run-cannot-produce-scale-timing'\)/);
 assert.match(runner,/NOT_RUN_DIAGNOSTIC_WORKER_AND_NATIVE_PAGE_CPU/);
 assert.match(runner,/if\(cpuProfileEnabled&&tab===1\)nativeCPUPageSession=session/);
 assert.match(block,/setTimeout\(\(\)=>reject\(Error\('native-target-info-timeout'\)\),1500\)/);
 assert.doesNotMatch(block,/newPage|goto|navigate|createTarget|Target\.setAutoAttach|Runtime\./);
 assert.equal((runner.match(/await launchNativeVisibilityBrowser\(/g)??[]).length,1);
 for(const file of ['host-scale-cpu-profile.mjs','j4-debugger-transport.mjs','host-scale-package-browser.mjs','fixtures/host-scale-server.mjs','fixtures/host-scale-world.mjs','fixtures/legacy.html','fixtures/native.mjs','fixtures/native.css'])assert(runner.includes(`'${file}'`),file);
 for(const field of ['sourceChangedDuringRun','fixtureChangedDuringRun','manifestChangedDuringRun'])assert(runner.includes(`report.${field}`),field);
});
test('combined runner opts both profiles into clock bounds without changing exact page identity',async()=>{
 const f=fixture();f.env.cpuTraceEnabled=true;const h=await execute(f.env);assert.equal(f.calls.find(c=>c?.worker).worker.clockAlignment,true);assert.equal(f.calls.find(c=>c?.page).page.clockAlignment,true);assert.equal(f.calls.find(c=>c?.page).page.expectedURL,f.env.server.origin+f.env.projectPath);await h.finish();assert.equal(f.report.status,'FAIL');assert.equal(f.report.timingUse,'DIAGNOSTIC_ONLY_INSTRUMENTED_WORKER_AND_NATIVE_PAGE_CPU_SAMPLING');
});
test('only explicit CPU plus through-return trace may combine; old independent modes remain available',()=>{
 const source=runner.slice(runner.indexOf(" const cpuProfileEnabled="),runner.indexOf(' if(traceEnabled)report.traceRange='));
 const check=new Function('env','distribution',`const process={env},report={},scenario={distribution};${source}return report;`);
 for(const env of [{},{FREE_HOST_SCALE_CPU_PROFILE:'1'},{FREE_HOST_SCALE_TRACE:'1'},{FREE_HOST_SCALE_TRACE:'1',FREE_HOST_SCALE_TRACE_RETURN:'1'}])assert.equal(check(env,'single-project').diagnosticClock,undefined);
 const combo={FREE_HOST_SCALE_CPU_PROFILE:'1',FREE_HOST_SCALE_CPU_TRACE:'1',FREE_HOST_SCALE_TRACE:'1',FREE_HOST_SCALE_TRACE_RETURN:'1'};
 assert.equal(check(combo,'single-project').diagnosticClock.kind,'COMMAND_BOUNDS_AND_RECORDED_STAGE_CORRELATION_ONLY');
 for(const key of Object.keys(combo))assert.throws(()=>check({...combo,[key]:'0'},'single-project'),/cpu-/);
 for(const key of ['FREE_HOST_SCALE_PROGRESS','FREE_HOST_SCALE_ADMISSION_OBSERVE','FREE_HOST_SCALE_ADMISSION_PREPARE'])assert.throws(()=>check({...combo,[key]:'1'},'single-project'),/cpu-profile-requires/);
 assert.throws(()=>check(combo,'project-mixed'),/cpu-profile-requires/);
});
test('combined synthetic completion remains FAIL while old standalone trace statuses stay unchanged',()=>{
 const expression=runner.match(/report\.status=(!cpuProfileEnabled&&traceThroughReturn[^;]+);/)[1],status=new Function('cpuProfileEnabled','traceThroughReturn','traceEnabled','error','context',`return ${expression};`);
 for(const error of [{message:'diagnostic-progress-run-cannot-produce-scale-timing'},{message:'host-scale-member-deadline'}])assert.equal(status(true,true,true,error,{}),'FAIL');
 assert.equal(status(false,true,true,{message:'diagnostic-progress-run-cannot-produce-scale-timing'},{}),'DIAGNOSTIC_ONLY_RETURN_COMPLETE');
 assert.equal(status(false,false,true,{message:'diagnostic-initial-ingestion-complete'},{}),'DIAGNOSTIC_ONLY_INGESTION_COMPLETE');
 assert.equal(status(false,false,false,{message:'host-scale-member-deadline'},{}),'FAIL');
});
test('audit failure alignment preserves original stage snapshot and only maps its runner clock',()=>{
 const source=runner.slice(runner.indexOf('if(error.memberProgressDiagnostic){'),runner.indexOf("const {hostScaleFailureProgress}=await import",runner.indexOf('if(error.memberProgressDiagnostic){')));
 const run=new Function('cpuTraceEnabled','error','performance','Date',`const report={};${source}return report;`),original=Object.freeze({stage:'audit',stageStarted:123,inFlight:true,auditAttempts:2,stageElapsedMs:77}),error={memberProgressDiagnostic:original},clock={timeOrigin:1000,now:()=>200};
 const combined=run(true,error,clock,{now:()=>900});assert.equal(combined.nativeMemberProgressDiagnostic,original);assert.equal(combined.nativeMemberProgressClock.stage,'audit');assert.equal(combined.nativeMemberProgressClock.stageStartedEpochMs,1123);assert.equal(combined.nativeMemberProgressClock.observedEpochMs,1200);assert.equal(combined.nativeMemberProgressClock.observedWallTimeMs,900);assert.equal(original.stageStarted,123);
 assert.equal(run(false,error,clock,{now:()=>900}).nativeMemberProgressClock,undefined);
});
for(const first of [0,1])test('CPU phase snapshot follows both finished and close; cleanup awaits its completion; first='+first,async()=>{
 const f=fixture(),snapshot=deferred();f.env.cpuTraceEnabled=true;f.report.trace={events:[],bytes:0,dropped:0};let request;
 f.env.collectScaleCPUPhaseTrace=options=>{request=options;f.calls.push('snapshot');return snapshot.promise;};
 const h=await execute(f.env);f.states[first].resolve();await new Promise(resolve=>setImmediate(resolve));assert(!f.calls.includes('snapshot'));assert(!f.calls.includes('close'));
 f.states[1-first].resolve();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.calls.slice(-2),['close','snapshot']);assert.equal(request.trace,f.report.trace);assert.equal(request.profiles,f.report);assert.equal(request.timeout,1000);assert.equal(request.context,f.env.context);
 let finished=false,cleaned=false;h.finished.then(()=>{finished=true;});const cleaning=h.finish().then(()=>{cleaned=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.equal(cleaned,false);
 const captured={status:'CAPTURED',kind:'synthetic-test-only'};snapshot.resolve(captured);await cleaning;assert.equal(finished,true);assert.equal(cleaned,true);assert.equal(f.report.cpuPhaseTrace,captured);assert.equal(f.calls.filter(v=>v==='snapshot').length,1);assert.equal(f.calls.filter(v=>v==='close').length,1);assert.equal(f.report.error,'original-failure');assert.equal(f.report.status,'FAIL');
});
for(const failure of ['throw','reject'])test('CPU phase snapshot '+failure+' never masks original failure or blocks cleanup',async()=>{
 const f=fixture();f.env.cpuTraceEnabled=true;f.env.collectScaleCPUPhaseTrace=()=>{f.calls.push('snapshot');if(failure==='throw')throw Error('private failure');return Promise.reject(Error('private failure'));};
 const h=await execute(f.env);await h.finish();assert.equal(f.report.cpuPhaseTrace.status,'UNAVAILABLE');assert.equal(f.report.cpuPhaseTrace.reason,'snapshot-failed');assert.equal(f.report.status,'FAIL');assert.equal(f.report.error,'original-failure');assert.equal(f.report.cpuProfileCleanup.status,'SUCCEEDED');assert.deepEqual(f.calls.slice(-2),['close','snapshot']);assert(!JSON.stringify(f.report).includes('private failure'));
});
test('rejected finished promise still waits for peer before close and snapshot',async()=>{
 const f=fixture(),failed=deferred();f.env.cpuTraceEnabled=true;f.env.startHostScaleCPUProfile=async()=>({finished:failed.promise,finish:async()=>{}});f.env.collectScaleCPUPhaseTrace=async()=>{f.calls.push('snapshot');return {status:'UNAVAILABLE'};};
 const h=await execute(f.env);failed.reject(Error('failed-finished'));await new Promise(resolve=>setImmediate(resolve));assert(!f.calls.includes('close'));assert(!f.calls.includes('snapshot'));f.states[1].resolve();await h.finished;assert.deepEqual(f.calls.slice(-2),['close','snapshot']);assert.equal(f.report.workerCPUProfile.status,'UNAVAILABLE');assert.equal(f.report.error,'original-failure');await h.finish();
});
test('close failure stays distinct even when CPU phase snapshot is captured',async()=>{
 const f=fixture({closeThrows:true});f.env.cpuTraceEnabled=true;f.env.collectScaleCPUPhaseTrace=async()=>({status:'CAPTURED'});const h=await execute(f.env);await h.finish();assert.equal(f.report.cpuProfileCleanup.status,'UNAVAILABLE');assert.equal(f.report.cpuPhaseTrace.status,'CAPTURED');assert.equal(f.report.status,'FAIL');assert.equal(f.report.error,'original-failure');
});
test('CPU phase capture stays diagnostic-only and precedes unchanged final trace collection and browser cleanup',()=>{
 assert(block.includes('if(cpuTraceEnabled)try{report.cpuPhaseTrace=await collectScaleCPUPhaseTrace'));
 assert(block.indexOf('closeCPUTransport();')<block.indexOf('report.cpuPhaseTrace=await collectScaleCPUPhaseTrace'));
 assert(runner.indexOf('await cpuProfilesFinished;')<runner.indexOf('report.workerTrace=await collectScaleWorkerTrace'));
 assert(runner.indexOf('report.workerTrace=await collectScaleWorkerTrace')<runner.indexOf('const cleaned=await cleanupHostScaleRun'));
 assert(!runner.includes('profile.finish())).finally'));
});
