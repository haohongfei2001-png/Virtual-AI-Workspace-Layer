import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {admissionTraceRecorder,admissionContentTraceRecorder,createUi10AdmissionContentCollector,instrumentUi10AdmissionSource,createUi10AdmissionTracePackage,verifyUi10AdmissionTracePackage,checkUi10AdmissionTracePackage,UI10_ADMISSION_TRACE_PATHS,UI10_ADMISSION_TRACE_KIND,UI10_CONTENT_TRACE_KIND} from './ui10-admission-trace.mjs';
import {eligibleUi10AdmissionFailure,assertUi10AdmissionTraceOutcome} from './ui10-admission-trace-outcome.mjs';
import {ui10NativeRows} from './fixtures/ui10-populated-native.mjs';
const origin='http://127.0.0.1:1234',sha='a'.repeat(40);
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'ui10-admission-'));t.after(()=>rm(dir,{recursive:true,force:true}));const source=join(dir,'source');buildHost(source,{offlineOrigin:origin,offlineHistory:true});const trace=await createUi10AdmissionTracePackage(source,join(dir,'copy'),origin);return {source,trace};}
test('diagnostic is an exact offline package copy, strict anchors and original untouched',async t=>{
 const {source,trace}=await setup(t);assert.equal(trace.changes.length,6);assert(await verifyUi10AdmissionTracePackage(trace));assert.equal(verifyHost(source).status,'OFFLINE_HOST_RECONSTRUCTION');
 delete globalThis.__vaiwlUi10ContentTrace;t.after(()=>delete globalThis.__vaiwlUi10ContentTrace);const adapter=await import(pathToFileURL(join(trace.unpacked,'src/host/chatgpt-adapter.mjs')));assert.equal(typeof adapter.createChatGPTAdapter,'function');
 for(const path of UI10_ADMISSION_TRACE_PATHS){const original=await readFile(join(source,path),'utf8');assert(!original.includes('__ua'));assert.throws(()=>instrumentUi10AdmissionSource(path,'wrong',origin),/anchor/);assert.throws(()=>instrumentUi10AdmissionSource(path,original+'__ua',origin),/already/);}
 await writeFile(join(trace.unpacked,'extra.txt'),'extra');await assert.rejects(verifyUi10AdmissionTracePackage(trace),/files/);await rm(join(trace.unpacked,'extra.txt'));await writeFile(join(trace.unpacked,UI10_ADMISSION_TRACE_PATHS[1]),'bad');await assert.rejects(verifyUi10AdmissionTracePackage(trace),/hash/);assert.deepEqual(await checkUi10AdmissionTracePackage(trace),{verified:false,error:'ui10-trace-package-verification-failed'});
});
test('only fixed fixture IDs/routes and opaque proof ordinals are associated, overflow is explicit',()=>{
 const context=vm.createContext({performance:{now:()=>2,timeOrigin:1},URL}),ids=ui10NativeRows().map(r=>r.id);vm.runInContext(admissionTraceRecorder(origin),context);const trace=context.__vaiwlUi10AdmissionTrace;
 assert.equal(trace.visit(ids[4]),4);assert.equal(trace.visit(ids[63]),63);assert.equal(trace.visit('60000000-0000-4000-8000-000000000040'),null);assert.equal(trace.visit('private-id'),null);assert.equal(trace.route(origin+'/c/'+ids[4]),4);assert.equal(trace.route('https://chatgpt.com/c/'+ids[4]),null);
 assert.equal(trace.proof('secret-proof'),1);assert.equal(trace.proof('secret-proof'),1);for(let i=0;i<130;i++)trace.proof('secret-'+i);assert.equal(trace.proofOverflow,true);
 trace.emit('ingest-result',{attempt:1,proof:1,visit:4,reason:'PRIVATE-error',raw:'PRIVATE-body',account:'PRIVATE-account'});for(let i=0;i<512;i++)trace.emit('reader-start',{attempt:i});
 const out=JSON.parse(JSON.stringify(trace));assert.equal(out.events.length,512);assert.equal(out.dropped,1);assert.equal(out.events[0].reason,'other');assert(!JSON.stringify(out).includes('secret'));assert(!JSON.stringify(out).includes('PRIVATE'));assert(!JSON.stringify(out).includes(ids[4]));
});
test('instrumented reader preserves original no-fetch and provider-error behavior with exact call association',async t=>{
 const {source,trace}=await setup(t);delete globalThis.__vaiwlUi10AdmissionTrace;t.after(()=>delete globalThis.__vaiwlUi10AdmissionTrace);const results=[];
 for(const root of [source,trace.unpacked]){const {createCurrentMetadataReader}=await import(pathToFileURL(join(root,'src/runtime/current-metadata-reader.mjs')));const outputs=[];
 for(const wanted of [[],['message-private']]){let calls=0;const abort=new AbortController(),ctx={conversationId:ui10NativeRows()[4].id,bodyEpoch:1,messageIds:wanted,guard:()=>true,signal:abort.signal,scope:{accountId:'principal_'+'a'.repeat(64),organizationId:'context_'+'b'.repeat(64)},providerProfile:'fixture',providerTransport:'worker-fixed-fetch'};
 const reader=createCurrentMetadataReader({enabled:true,observations:{withCurrent:async(p,fn)=>fn(ctx)},provider:{readCurrentConversation:async()=>{calls++;throw Error('read-budget-exhausted');}}});let result;try{result=await reader.read('private-proof');}catch(e){result=e.message;}outputs.push({result,calls,idle:reader.isIdle()});await assert.rejects(reader.read(''),/invalid-body-proof/);reader.stop();}
 results.push(outputs);}
 assert.deepEqual(results[0],results[1]);assert.equal(results[0][0].calls,0);assert.equal(results[0][1].calls,1);const events=globalThis.__vaiwlUi10AdmissionTrace.events,provider=events.find(e=>e.phase==='provider-enter'),failure=events.find(e=>e.phase==='reader-error');assert.equal(provider.visit,4);assert.equal(provider.attempt,failure.attempt);assert.equal(failure.reason,'read-budget-exhausted');assert(events.some(e=>e.phase==='reader-rejected'&&e.reason==='invalid-body-proof'));assert(!JSON.stringify(events).includes('private'));
});
test('instrumented entry preserves no-proof, wrong-role and thrown-reader outcomes',async t=>{
 const {source,trace}=await setup(t);delete globalThis.__vaiwlUi10AdmissionTrace;t.after(()=>delete globalThis.__vaiwlUi10AdmissionTrace);const runs=[];
 for(const root of [source,trace.unpacked]){const {createHostEntryCalibration}=await import(pathToFileURL(join(root,'src/runtime/host-entry-calibration.mjs')));const results=[];
 for(const mode of ['no-proof','wrong-role','throw','ok']){let calls=0;const ctx={role:mode==='wrong-role'?'sidebar':'workspace',parentFrame:{actualURL:origin+'/c/'+ui10NativeRows()[4].id},isCurrent:()=>true};const service=createHostEntryCalibration({ui:{withScope:async(_,fn)=>fn(ctx)},observations:{currentProofForParent:()=>mode==='no-proof'?null:'private-proof'},reader:{readCalibration:async()=>{calls++;if(mode==='throw')throw Error('current-metadata-busy');}},elapsedNow:()=>0});results.push({result:await service.handle({v:1,type:'HOST_UI_CALIBRATION_ENTRY',grantId:'grant',mountId:'mount',kind:'foreground'},{}),calls});service.stop();}runs.push(results);}
 assert.deepEqual(runs[0],runs[1]);const events=globalThis.__vaiwlUi10AdmissionTrace.events;assert(events.some(e=>e.phase==='entry-proof'&&e.proofFound===false));assert(events.some(e=>e.phase==='entry-error'&&e.reason==='current-metadata-busy'&&e.visit===4));assert(!JSON.stringify(events).includes('private-proof'));
});
const formal=(index=4)=>({sourceCommit:sha,kind:'PACKAGED_MV3_NATIVE_UI10_POPULATED_RECONSTRUCTION',status:'FAIL_OR_BLOCKED',finalized:true,fixtureStable:true,productSourceStable:true,realChatGPT:'NOT_RUN',packageVerification:{status:'OFFLINE_HOST_RECONSTRUCTION'},failureProgress:{phase:'evidence-admission',index,timedOut:false,deadlineMs:1320000,elapsedMs:63000},visits:Array.from({length:index},()=>({})),checks:[],error:'Error: ui10-admission-deadline:'+ui10NativeRows()[index].id+'\nstack'});
test('early exact failure permits one diagnostic; late, unrelated or unstable failure does not',()=>{
 assert(eligibleUi10AdmissionFailure(formal(),sha));assert(eligibleUi10AdmissionFailure(formal(0),sha));assert(eligibleUi10AdmissionFailure(formal(5),sha),'sixth visit has direct diagnostic coverage');assert.equal(eligibleUi10AdmissionFailure(formal(6),sha),false,'seventh visit stays outside the bound');
 for(const change of [r=>r.sourceCommit='b'.repeat(40),r=>r.failureProgress.index=6,r=>r.failureProgress.phase='visual-cell',r=>r.failureProgress.timedOut=true,r=>r.status='FAIL_SOURCE_CHANGED',r=>r.finalized=false,r=>r.fixtureStable=false,r=>r.productSourceStable=false,r=>r.visits.push({}),r=>r.error='other failure',r=>r.failureProgress.elapsedMs=180000]){const r=formal();change(r);assert.equal(eligibleUi10AdmissionFailure(r,sha),false);}
 assert.equal(eligibleUi10AdmissionFailure({},sha),false);assert.throws(()=>assertUi10AdmissionTraceOutcome({status:'PASS'},{exitCode:0,sourceCommit:sha}));
});
test('runner keeps full formal visits, deadline, budget pacing; diagnostic is opt-in and nonzero',async()=>{
 const s=await readFile(new URL('./ui10-populated-package-browser.mjs',import.meta.url),'utf8');for(const literal of ["FREE_UI10_ADMISSION_TRACE==='1'",'for(const row of server.ui10History.rows)','Date.now()+6000','assert.equal(events.length,64)','await paceNativeRead();await native();','traceEnabled&&report.visits.length===6','process.exitCode=intact?2:1','verifyHost(built.unpacked)','checkUi10AdmissionTracePackage(trace)'])assert(s.includes(literal),literal);
});

test('reader success-continuation stop is recorded without changing original settlement; shared promise is unchanged',async t=>{
 const {source,trace}=await setup(t);delete globalThis.__vaiwlUi10AdmissionTrace;t.after(()=>delete globalThis.__vaiwlUi10AdmissionTrace);
 for(const root of [source,trace.unpacked]){const {createCurrentMetadataReader}=await import(pathToFileURL(join(root,'src/runtime/current-metadata-reader.mjs')));let release,reader;
 const ctx={conversationId:ui10NativeRows()[4].id,bodyEpoch:1,messageIds:[],guard:()=>true,signal:new AbortController().signal};
 reader=createCurrentMetadataReader({enabled:true,provider:{readCurrentConversation(){assert.fail('empty body fetch');}},observations:{withCurrent:async(p,fn)=>{const value=await fn(ctx);await new Promise(resolve=>release=resolve);reader.stop();return value;}}});
 const a=reader.read('private-proof'),shared=reader.read('private-proof');assert.equal(a,shared);await assert.rejects(reader.read('other-proof'),/current-metadata-busy/);for(let i=0;i<20&&!release;i++)await Promise.resolve();assert(release);release();await assert.rejects(a,/current-metadata-stopped/);}
 const events=globalThis.__vaiwlUi10AdmissionTrace.events;assert(events.some(e=>e.outcome==='shared'));const context=events.find(e=>e.phase==='reader-context'),failure=events.find(e=>e.phase==='reader-error');assert.equal(failure.reason,'current-metadata-stopped');assert.equal(failure.attempt,context.attempt);assert.equal(failure.visit,4);
});
test('CI adds no rerun for successful or late formal runs and preserves original output',async()=>{
 const s=await readFile(new URL('../../.github/workflows/free-offline-host.yml',import.meta.url),'utf8'),block=s.match(/name: First-(?:five|six) admission trace[\s\S]*?(?=\n\s*- name:)/)?.[0];assert(block);
 for(const literal of ["matrix.gate == 'populated-native'","steps.formal_supplementary.outcome == 'failure'",'ui10-admission-trace-outcome.mjs eligible','timeout 180s','test "$result" -eq 2','ui10-admission-trace-outcome.mjs verify'])assert(block.includes(literal),literal);
 assert(!block.includes('continue-on-error'));assert(!block.includes('upload-artifact'));
});
function diagnostic(){return {sourceCommit:sha,kind:UI10_ADMISSION_TRACE_KIND,status:'DIAGNOSTIC_ONLY',diagnosticOnly:true,acceptance:'NOT_ESTABLISHED',formalReportSuperseded:false,realChatGPT:'NOT_RUN',fullV27Acceptance:'NOT_ESTABLISHED',visitLimit:6,visits:[{},{},{},{},{},{}],checks:[],finalized:true,progress:{deadlineMs:165000,timedOut:false},cleanupOK:true,fixtureStable:true,productSourceStable:true,tracePackageVerified:true,packageVerification:{status:'OFFLINE_HOST_RECONSTRUCTION'},diagnosticOutcome:'BOUND_REACHED',workerTrace:{kind:UI10_ADMISSION_TRACE_KIND,events:[{phase:'reader-start'}],dropped:0,proofOverflow:false,timeOrigin:1},contentTraces:[{kind:UI10_CONTENT_TRACE_KIND,events:[{phase:'body-candidate'}],dropped:0,timeOrigin:2}],workerLifecycle:{created:1,closed:0,live:1,initialTimeOrigin:1,sameTimeOrigin:true},tracePackage:{kind:UI10_ADMISSION_TRACE_KIND,limit:512,changes:[...UI10_ADMISSION_TRACE_PATHS,'extension/worker.mjs','extension/classic-runtime.js'].map(path=>({path,originalSha256:'a'.repeat(64),instrumentedSha256:'b'.repeat(64)}))}};}
test('diagnostic outcome cannot become a pass or hide timeout, cleanup, source or collection failures',()=>{
 const options={exitCode:2,sourceCommit:sha};assert.equal(assertUi10AdmissionTraceOutcome(diagnostic(),options).status,'DIAGNOSTIC_ONLY');
 const sixthFailure=diagnostic();sixthFailure.diagnosticOutcome='OBSERVED_FAILURE';sixthFailure.visits.pop();assert.equal(assertUi10AdmissionTraceOutcome(sixthFailure,options).outcome,'OBSERVED_FAILURE');sixthFailure.visits.push({});assert.throws(()=>assertUi10AdmissionTraceOutcome(sixthFailure,options));
 for(const change of [r=>r.status='PASS',r=>r.sourceCommit='b'.repeat(40),r=>r.visitLimit=5,r=>r.visits.push({}),r=>r.checks.push({status:'PASS'}),r=>r.progress.timedOut=true,r=>r.finalized=false,r=>r.cleanupOK=false,r=>r.fixtureStable=false,r=>r.tracePackageVerified=false,r=>r.productSourceStable=false,r=>r.formalReportSuperseded=true,r=>r.workerTrace.events=[],r=>r.contentTraces=[],r=>r.contentTraces[0].events=[],r=>r.contentTraces[0].kind='other',r=>r.workerLifecycle.sameTimeOrigin=false,r=>r.tracePackage.changes.pop()]){const r=diagnostic();change(r);assert.throws(()=>assertUi10AdmissionTraceOutcome(r,options));}
 for(const exitCode of [0,1,124])assert.throws(()=>assertUi10AdmissionTraceOutcome(diagnostic(),{...options,exitCode}));const truncated=diagnostic();truncated.workerTrace.dropped=1;assert.equal(assertUi10AdmissionTraceOutcome(truncated,options).traceTruncated,true);const restarted=diagnostic();restarted.workerLifecycle.created=2;restarted.workerLifecycle.closed=1;assert.equal(assertUi10AdmissionTraceOutcome(restarted,options).traceIncomplete,true);const contentDropped=diagnostic();contentDropped.contentTraces[0].dropped=1;assert.equal(assertUi10AdmissionTraceOutcome(contentDropped,options).traceTruncated,true);
});
test('CI outcome binds original report bytes; changing them cannot validate a diagnostic',async t=>{
 const {execFileSync}=await import('node:child_process'),dir=await mkdtemp(join(tmpdir(),'ui10-outcome-'));t.after(()=>rm(dir,{recursive:true,force:true}));const original=join(dir,'formal.json'),trace=join(dir,'trace.json'),script=new URL('./ui10-admission-trace-outcome.mjs',import.meta.url).pathname;
 await writeFile(original,JSON.stringify(formal(5)));await writeFile(trace,JSON.stringify(diagnostic()));execFileSync(process.execPath,[script,'eligible',original,sha,original+'.trace-binding']);execFileSync(process.execPath,[script,'verify',trace,sha,original,'2']);
 await writeFile(original,JSON.stringify(formal(5))+'\n');assert.throws(()=>execFileSync(process.execPath,[script,'verify',trace,sha,original,'2'],{stdio:'pipe'}));
});

test('content trace contains bounded fixed metadata, never body, message IDs or capabilities',()=>{
 const ids=ui10NativeRows().map(r=>r.id),location={href:origin+'/c/'+ids[5]},context=vm.createContext({performance:{now:()=>2,timeOrigin:1},URL,location});vm.runInContext(admissionContentTraceRecorder(origin),context);const trace=context.__vaiwlUi10ContentTrace;
 trace.emit('body-candidate',{visit:5,localSeq:1,routeEpoch:2,wanted:1,association:'explicit-body-id',body:'PRIVATE-body',messageIds:['PRIVATE-message'],proofId:'PRIVATE-proof'});
 trace.emit('proposal-ack',{visit:5,outcome:'accepted',proofFound:true,bodyEpoch:1,reason:'PRIVATE-error'});
 trace.emit('unrecognized',{body:'PRIVATE-body'});for(let i=0;i<511;i++)trace.emit('body-masked-skip');
 assert.equal(trace.route(origin+'/c/'+ids[5]),5);assert.equal(trace.route('https://chatgpt.com/c/'+ids[5]),null);assert.equal(trace.route(origin+'/'),null);
 const out=JSON.parse(JSON.stringify(trace));assert.equal(out.kind,UI10_CONTENT_TRACE_KIND);assert.equal(out.events.length,512);assert.equal(out.dropped,1);assert.equal(out.events[0].visit,5);assert.equal(out.events[0].wanted,1);assert.equal(out.events[1].reason,'other');assert(!JSON.stringify(out).includes('PRIVATE'));assert(!JSON.stringify(out).includes(ids[5]));
 assert.throws(()=>admissionContentTraceRecorder('https://chatgpt.com'),/origin/);
});
test('adapter trace preserves guarded body reads, no-op scans and synchronous revocation',async()=>{
 const source=await readFile(new URL('../../src/host/chatgpt-adapter.mjs',import.meta.url),'utf8'),instrumented=instrumentUi10AdmissionSource('src/host/chatgpt-adapter.mjs',source,origin),id=ui10NativeRows()[5].id;
 const bodyFunction=value=>{const start=value.indexOf(' function bodyProposal(){'),end=value.indexOf('\n function intentProposal(',start);assert(start>=0&&end>start);return value.slice(start,end);};
 const scenarios=[{masked:true,wanted:false,allow:true,scans:0,probes:0,accepted:false},{masked:true,wanted:true,allow:false,scans:0,probes:1,accepted:false},{masked:true,wanted:true,allow:true,scans:1,probes:1,accepted:true},{masked:false,wanted:true,allow:true,scans:1,probes:0,accepted:true},{masked:true,wanted:true,allow:true,revoke:true,scans:1,probes:1,accepted:false}];
 for(const scenario of scenarios){const runs=[];
  for(const value of [source,instrumented]){let scans=0,syncs=0,probes=0,context;context=vm.createContext({performance:{now:()=>2,timeOrigin:1},URL,location:{href:origin+'/c/'+id},document:{location:{href:origin+'/c/'+id}},url:origin+'/c/'+id,generation:0,bodyWanted:scenario.wanted,live:()=>true,syncRoute:()=>syncs++,binding:{documentToken:'PRIVATE-document',producerToken:'PRIVATE-producer'},profile:{id:'fixture',revision:'1'},withNativeReading:work=>{probes++;return scenario.allow?work():null;},bodyDiscovery:{isPresentationMasked:()=>scenario.masked,scan:()=>{scans++;if(scenario.revoke)context.generation++;return {conversationId:id,association:'explicit-body-id',messageIds:['PRIVATE-message']};}}});
   if(value===instrumented)vm.runInContext(admissionContentTraceRecorder(origin),context);vm.runInContext('let seq=0;const epoch=7;'+bodyFunction(value),context);const result=vm.runInContext('bodyProposal()',context);
   runs.push(JSON.parse(JSON.stringify({result,scans,syncs,probes,bodyWanted:context.bodyWanted,seq:vm.runInContext('seq',context)})));
   if(value===instrumented){const events=JSON.parse(JSON.stringify(context.__vaiwlUi10ContentTrace.events));assert.equal(events.at(-1).phase,scenario.accepted?'body-candidate':scenario.wanted?'body-source-unavailable':'body-masked-skip');assert(events.every(e=>e.visit===5));if(scenario.revoke)assert.equal(events.at(-1).sameGeneration,false);assert(!JSON.stringify(events).includes('PRIVATE'));}
  }
  assert.deepEqual(runs[0],runs[1]);assert.equal(runs[0].scans,scenario.scans);assert.equal(runs[0].probes,scenario.probes);assert.equal(runs[0].seq,scenario.accepted?1:0);
 }
});
test('content collector reads only root isolated contexts on the fixed loopback page and detaches',async()=>{
 const {EventEmitter}=await import('node:events'),extensionId='a'.repeat(32),session=new EventEmitter(),calls=[];let detached=0,url=origin+'/';
 session.send=async(method,params)=>{calls.push({method,params});if(method==='Runtime.enable'){for(const context of [{id:1,auxData:{frameId:'root',isDefault:true}},{id:2,auxData:{frameId:'root',isDefault:false}},{id:3,auxData:{frameId:'child',isDefault:false}},{id:4,auxData:{frameId:'root',isDefault:false}}])session.emit('Runtime.executionContextCreated',{context});return {};}
  if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'root'}}};if(method==='Runtime.evaluate'){assert(params.expression.includes('globalThis.chrome?.runtime?.id==='+JSON.stringify(extensionId)));assert(!params.expression.includes('document'));return {result:{value:params.contextId===2?JSON.stringify({kind:UI10_CONTENT_TRACE_KIND,events:[],dropped:0,timeOrigin:1}):null}};}assert.fail(method);};session.detach=async()=>detached++;
 const collector=await createUi10AdmissionContentCollector({context:{newCDPSession:async()=>session},page:{url:()=>url},origin,extensionId});const values=await collector.capture();assert.equal(values.length,1);assert.deepEqual(calls.filter(c=>c.method==='Runtime.evaluate').map(c=>c.params.contextId),[2,4]);
 url='https://chatgpt.com/';await assert.rejects(collector.capture(),/unavailable/);url=origin+'/';for(let id=10;id<80;id++)session.emit('Runtime.executionContextCreated',{context:{id,auxData:{frameId:'root',isDefault:false}}});const beforeOverflow=calls.length;await assert.rejects(collector.capture(),/unavailable/);assert.equal(calls.length,beforeOverflow);await collector.close();await collector.close();assert.equal(detached,1);assert.equal(session.listenerCount('Runtime.executionContextCreated'),0);await assert.rejects(collector.capture(),/unavailable/);
});
