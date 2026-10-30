import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const workflow=await readFile(new URL('../../.github/workflows/free-offline-host.yml',import.meta.url),'utf8');
test('reports receive the same trusted event commit as the default checkout',()=>assert.match(workflow,/env:\n  FREE_SOURCE_COMMIT: \$\{\{ github\.sha \}\}/));
const jobs=Object.fromEntries([...workflow.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].filter(x=>['node-contracts','offline-journeys','offline-durability-compat','offline-j4-lifecycle'].includes(x[1])).map(x=>[x[1],x[2]]));
test('one Node suite and three independent free browser jobs retain exact event SHA and mandatory outcomes',()=>{assert.deepEqual(Object.keys(jobs),['node-contracts','offline-journeys','offline-durability-compat','offline-j4-lifecycle']);assert.equal((workflow.match(/node --test --test-concurrency=2/g)??[]).length,1);for(const body of Object.values(jobs)){assert.match(body,/runs-on: ubuntu-latest/);assert.match(body,/github.event.repository.private == false/);assert.match(body,/persist-credentials: false/);assert.doesNotMatch(body,/continue-on-error|^\s+ref:|^\s+needs:|upload-artifact|actions\/cache/m);}assert.match(workflow,/permissions:\n  contents: read/);});
test('browser partition neither deletes nor duplicates any pre-existing actual slice',()=>{const expected=['Document-flow native protection and continuous packaged product journey','Bounded send queue overflow and fresh native ACK recovery','Populated approved navigation renderer contracts','Recovery deadlines at real IndexedDB final request boundaries','Foreground expired document transport with genuine live C2 receipt','Reject stale foreground transport without a fresh handshake','Failure-only existing 10k worker and native page CPU diagnostic (not acceptance)','C2 stale native failure preserves newer receipt with exact guard mutation','C2 dormant scope denial and fresh native GET recovery','Reject permanent-stop dormant recovery mutation','Actual packaged C2 conversation slice','C2 immediate-load cold-start regression (separate result)','C2 cold passive diagnostic copy (not package acceptance)','Separate cold safety boundary and genuine native navigation recovery','Continuous J1 candidate journey (partial coverage only)','Continuous J3 explicit historical activity slice','Actual packaged homepage first-send causal slice','Continuous J2 authenticated ACK and original-time journey','Real native visibility startup prerequisite','J4 native visibility startup prerequisite','J2 and J4 prerequisites (partial coverage only)','Continuous J4 context assets and lifecycle slice','J4 failure-only full lifecycle diagnostic (not acceptance)','Real browser and IDB guard mutation counterexamples','Genuine joint native and ACK IDB cut with designated mutation','Record unestablished existing-source pending repair probe (not acceptance)','Native IndexedDB pending capacity and transaction fault slice','Actual archived Host to current Host asset update','Same-schema installed Host lifecycle codec rollback','Actual historical Pro schema compatibility with isolated network guard','Isolated visibility proposal experiment (not production)','Formal Host 10k single-project membership sample','Native token stream with authenticated ACK and title (narrow SYS05)','Separate instrumented native stream work diagnostic (not performance acceptance)','Existing conversation immediate retry after native failure','Existing conversation immediate retry after native cancellation','Packaged profile layout theme and viewport subcontracts','Layout mechanism regressions (not MV3 acceptance)','Passive local extension status (isolated MV3)','Temporary native navigation (isolated MV3, no authentication)','Temporary Project navigation (isolated MV3, no authentication)','Challenge status remains fail closed (isolated MV3)','Packaged native snippet save search locate and removal'];const actual=[...((jobs['offline-journeys']??'')+(jobs['offline-durability-compat']??'')+(jobs['offline-j4-lifecycle']??'')).matchAll(/^      - name: (.+)$/gm)].map(x=>x[1]).filter(n=>!n.startsWith('Install locked')&&!n.startsWith('Publish bounded'));assert.deepEqual(actual.sort(),expected.sort());assert.equal(actual.length,new Set(actual).size);for(const body of [jobs['offline-journeys'],jobs['offline-durability-compat'],jobs['offline-j4-lifecycle']])assert.match(body,/Publish bounded text evidence to logs only/);assert.doesNotMatch(jobs['offline-journeys'],/steps.native_visibility/);assert.match(jobs['offline-durability-compat'],/id: native_visibility/);});

test('next Host scale baseline is explicit 10k single-project only and cannot satisfy full performance acceptance',()=>{const body=jobs['offline-durability-compat'];assert.match(body,/HOST_SCALE_RUN=1 HOST_SCALE_SIZE=10000 HOST_SCALE_DISTRIBUTION=single-project HOST_SCALE_CPU_RATE=1/);assert.match(body,/r.sourceCommit!==process.env.GITHUB_SHA/);assert.match(body,/MEASURED_AT_STABLE_ADMITTED_INDEX/);assert.match(body,/PARTIAL_SYS04_NOT_ACCEPTED/);assert.match(body,/host-scale-10k-project host-scale-10k-cpu-diagnostic visibility-probe; do/);assert.doesNotMatch(body,/HOST_SCALE_SIZE=(1000|100000)\b/);});
const formalScale=jobs['offline-durability-compat'].split('      - name: Formal Host 10k single-project membership sample')[1].split('      - name: Failure-only existing 10k worker and native page CPU diagnostic')[0];
test('explicit user deferral disables scale invocation without weakening retained acceptance',()=>{
 assert.match(workflow,/FREE_SCALE_ACCEPTANCE: DEFERRED/);
 assert(formalScale.includes("if: ${{ !cancelled() && env.FREE_SCALE_ACCEPTANCE != 'DEFERRED' }}"));
 assert.match(jobs['offline-durability-compat'],/skipped 10k\/100k is not PASS or release readiness/);
});
test('formal single-project timing gate excludes temporary progress observation',()=>{const body=formalScale;assert.doesNotMatch(body,/FREE_HOST_SCALE_PROGRESS=1/);assert.match(body,/HOST_SCALE_RUN=1 HOST_SCALE_SIZE=10000\b/);assert.match(body,/r\.measurement\?\.status!=='MEASURED_AT_STABLE_ADMITTED_INDEX'/);assert.doesNotMatch(body,/r\.measurement\?\.status.*NOT_RUN_DIAGNOSTIC/);});
test('formal scale run excludes completed temporary instrumentation and retains strict measurement gate',()=>{const body=jobs['offline-durability-compat'];assert.doesNotMatch(formalScale,/FREE_HOST_SCALE_TRACE=1/);assert.doesNotMatch(body,/FREE_HOST_SCALE_PROGRESS=1/);assert.match(body,/Formal Host 10k single-project membership sample/);assert.match(body,/test "\$result" -eq 2/);assert.match(body,/r\.measurement\?\.status!=='MEASURED_AT_STABLE_ADMITTED_INDEX'/);assert.doesNotMatch(body,/continue-on-error:\s*true/);});

test('one uninstrumented native stream candidate keeps exact SHA and narrow acceptance',()=>{const body=jobs['offline-durability-compat'];assert.equal((body.match(/node tests\/host\/sys05-stream-package-journey.mjs/g)??[]).length,3);assert.match(body,/sys05-stream.json" --execute-browser/);assert.equal((body.match(/--observe-work/g)??[]).length,1);assert.match(body,/PASS_NARROW_OFFLINE_SYS05_CORRECTNESS/);assert.match(body,/NARROW_UNINSTRUMENTED_BROWSER_OBSERVED/);assert.match(body,/r.fullSYS05!=='NOT_ESTABLISHED'/);assert.match(body,/r.workInstrumentation!==false/);assert.match(body,/historical-pro sys05-stream sys05-work host-scale-10k-project host-scale-10k-cpu-diagnostic visibility-probe; do/);});

test('separate work diagnostic cannot replace original stream correctness or certify F1',()=>{const body=jobs['offline-durability-compat'];assert.match(body,/sys05-work.json" --execute-browser --observe-work/);assert.match(body,/PASS_NARROW_DIAGNOSTIC_SYS05_SLICE/);assert.match(body,/NARROW_INSTRUMENTED_BROWSER_OBSERVED/);assert.match(body,/r.workInstrumentation!==true/);assert.match(body,/r.F1!=='DIAGNOSTIC_ONLY_NOT_ACCEPTED'/);assert.match(body,/sys05-stream.json" --execute-browser\n/);});

test('single-project sample requires every admitted reference to have native project membership before and after timing',()=>{const body=formalScale;assert.match(body,/r.scenario.distribution!=='single-project'/);assert.match(body,/r.measurement\?\.before\?\.projectMembership!==10000\b/);assert.match(body,/r.measurement\?\.after\?\.projectMembership!==10000\b/);assert.equal((body.match(/node tests\/host\/host-scale-package-browser.mjs/g)??[]).length,1);});


test('withdrawn development probe stays machine-readable NOT_RUN without altering original acceptance gates',()=>{
 const body=jobs['offline-durability-compat'];
 assert.equal((body.match(/node tests\/host\/existing-source-pending-repair-journey.mjs/g)??[]).length,1);
 assert.match(body,/existing-source-pending-repair.json"\n/);
 assert.doesNotMatch(body,/existing-source-pending-repair.json" --execute-browser/);
 for(const marker of ["r.status!=='NOT_RUN'","r.S!=='NOT_RUN'","r.fullSYS02!=='NOT_ESTABLISHED'","r.fullJ4!=='NOT_ESTABLISHED'","r.release!=='NOT_RELEASE_READY'","r.sourceCommit!==process.env.GITHUB_SHA","r.scopeFeasibility!=='NOT_ESTABLISHED_NORMAL_SURFACE_CAN_INVALIDATE_NATIVE_WITNESS'","r.steps.length!==0"])
  assert(body.includes(marker),marker);
 assert.match(body,/joint-observation-mutant existing-source-pending-repair sys02-pending-idb/);
 assert.match(body,/Record unestablished existing-source pending repair probe \(not acceptance\)/);
 assert.match(jobs['offline-j4-lifecycle'],/Continuous J4 context assets and lifecycle slice/);assert.doesNotMatch(body,/j4-package-journey/);
 assert.match(body,/Native IndexedDB pending capacity and transaction fault slice/);
});


test('J4 diagnostic runs only after formal failure and cannot replace or forgive it',()=>{
 const body=jobs['offline-j4-lifecycle'],formal=body.split('      - name: Continuous J4 context assets and lifecycle slice')[1].split('      - name: J4 failure-only')[0],diagnostic=body.split('      - name: J4 failure-only')[1].split('      - name: Publish bounded')[0];
 assert.match(formal,/id: j4_journey/);assert.match(formal,/r.status!=='PARTIAL_J4_NOT_ACCEPTED'/);assert.doesNotMatch(formal,/TRACE=1|continue-on-error/);
 assert(diagnostic.includes("if: ${{ !cancelled() && steps.j4_journey.outcome == 'failure' }}"));
 assert.match(diagnostic,/FREE_J4_LIFECYCLE_ORDER_TRACE=1/);assert.match(diagnostic,/DIAGNOSTIC_ONLY_J4_LIFECYCLE_ORDER/);assert.match(diagnostic,/r.sourceCommit!==process.env.GITHUB_SHA/);
 assert.doesNotMatch(body,/FREE_J4_SCOPE_TRACE|continue-on-error|upload-artifact|actions\/cache/);assert.match(body,/j4-journey j4-lifecycle-trace; do/);
});

 test('stale native failure requires normal proof and precise old-guard mutation on identical sources',()=>{const body=jobs['offline-journeys'];assert.match(body,/context-stale-mutant.json" oldguard-mutant/);for(const marker of ['PASS_NARROW_OFFLINE_STALE_NATIVE_TERMINAL','RESTORE_OLD_TERMINAL_GUARD','new-projection-survives-old-503','new-projection-revoked-by-stale-terminal',"['sourceHashes','fixtureHashes','nativeOrder']",'context-stale context-stale-mutant j1'])assert(body.includes(marker),marker);assert.doesNotMatch(body,/continue-on-error/);});


test('10k CPU sampling runs separately only after formal failure and cannot substitute diagnostic evidence',()=>{
 const body=jobs['offline-durability-compat'],diagnostic=body.split('      - name: Failure-only existing 10k worker and native page CPU diagnostic')[1].split('      - name: Isolated visibility proposal')[0];
 assert.match(formalScale,/id: formal_host_10k/);assert.match(formalScale,/test "\$result" -eq 2/);assert.doesNotMatch(formalScale,/FREE_HOST_SCALE_CPU_PROFILE|NOT_RUN_DIAGNOSTIC|continue-on-error/);
 assert(diagnostic.includes("if: ${{ !cancelled() && env.FREE_SCALE_ACCEPTANCE != 'DEFERRED' && steps.formal_host_10k.outcome == 'failure' }}"));
 assert.match(diagnostic,/FREE_HOST_SCALE_CPU_PROFILE=1 FREE_HOST_SCALE_CPU_TRACE=1 FREE_HOST_SCALE_TRACE=1 FREE_HOST_SCALE_TRACE_RETURN=1 HOST_SCALE_RUN=1 HOST_SCALE_SIZE=10000 HOST_SCALE_DISTRIBUTION=single-project HOST_SCALE_CPU_RATE=1/);assert.match(diagnostic,/test "\$result" -eq 1/);
 for(const marker of ["r.status!=='FAIL'","r.cleanupErrors?.length","r.temporaryDirectoryRemoved!==true","r.sourceCommit!==process.env.GITHUB_SHA","r.acceptance!=='NOT_ESTABLISHED'","r.measurement?.status!=='NOT_RUN_DIAGNOSTIC_WORKER_AND_NATIVE_PAGE_CPU'","r.workerCPUProfile?.kind!=='DIAGNOSTIC_ONLY_HOST_SCALE_WORKER_CPU'","r.workerCPUProfile?.status!=='CAPTURED'","r.workerCPUProfile?.acceptance!=='NOT_ESTABLISHED'","!r.workerCPUProfile.profile?.samples?.length","r.nativePageCPUProfile?.kind!=='DIAGNOSTIC_ONLY_HOST_SCALE_NATIVE_PAGE_CPU'","r.nativePageCPUProfile?.status!=='CAPTURED'","r.nativePageCPUProfile?.acceptance!=='NOT_ESTABLISHED'","!r.nativePageCPUProfile.profile?.samples?.length","r.cpuProfileCleanup?.status!=='SUCCEEDED'","r.sourceChangedDuringRun!==false","r.fixtureChangedDuringRun!==false","r.manifestChangedDuringRun!==false"])assert(diagnostic.includes(marker),marker);
 assert.equal((body.match(/node tests\/host\/host-scale-package-browser.mjs/g)??[]).length,2);
 assert.doesNotMatch(body,/continue-on-error|upload-artifact|actions\/cache/);
});
test('only failure-only dual CPU step opts into through-return clocks and both package hash closures',()=>{
 const diagnostic=jobs['offline-durability-compat'].split('      - name: Failure-only existing 10k worker and native page CPU diagnostic')[1].split('      - name: Isolated visibility proposal')[0];
 assert.equal((workflow.match(/FREE_HOST_SCALE_CPU_TRACE=1/g)??[]).length,1);assert.equal((workflow.match(/FREE_HOST_SCALE_TRACE=1/g)??[]).length,1);
 assert.doesNotMatch(formalScale,/FREE_HOST_SCALE_CPU_TRACE|FREE_HOST_SCALE_TRACE|NOT_RUN_DIAGNOSTIC/);
 for(const marker of ["r.instrumentation?.clockAlignment!==true","r.instrumentedPackageUnchanged!==true","!r.instrumentation.buildManifestSha256","r.workerTrace?.status!=='RAM_SNAPSHOT'","!r.trace?.events?.length","!r.trace.events.every(e=>Number.isFinite(e.clockEpochMs))",'COMMAND_BOUNDS_AND_RECORDED_STAGE_CORRELATION_ONLY','RUNNER_CDP_COMMAND_BOUNDS_NOT_ACTUAL_SAMPLE_INSTANTS','UNMAPPED_CDP_MICROSECONDS',"['startRequested','startAcknowledged','stopRequested','stopAcknowledged']"])assert(diagnostic.includes(marker),marker);
 assert(diagnostic.includes("if: ${{ !cancelled() && env.FREE_SCALE_ACCEPTANCE != 'DEFERRED' && steps.formal_host_10k.outcome == 'failure' }}"));assert(diagnostic.includes("r.status!=='FAIL'"));assert.doesNotMatch(diagnostic,/DIAGNOSTIC_ONLY_RETURN_COMPLETE|continue-on-error/);
});
test('actual combined workflow gate rejects missing CPU, clock, source, cleanup or bounded trace evidence',()=>{
 const script=workflow.match(/^          node -e "(const r=require\(process\.env\.RUNNER_TEMP\+'\/host-scale-10k-cpu-diagnostic\.json'\);[^\n]+)"$/m)?.[1];assert(script);
 const stamp=()=>({wallTimeMs:1000,timeOriginMs:900,monotonicMs:100,epochMs:1000}),cpu=kind=>({kind:`DIAGNOSTIC_ONLY_HOST_SCALE_${kind}_CPU`,status:'CAPTURED',acceptance:'NOT_ESTABLISHED',profile:{samples:[1]},clockCorrelation:{kind:'RUNNER_CDP_COMMAND_BOUNDS_NOT_ACTUAL_SAMPLE_INSTANTS',profileClock:'UNMAPPED_CDP_MICROSECONDS',...Object.fromEntries(['startRequested','startAcknowledged','stopRequested','stopAcknowledged'].map(k=>[k,stamp()]))}});
 const valid={status:'FAIL',cleanupErrors:[],temporaryDirectoryRemoved:true,sourceCommit:'expected',acceptance:'NOT_ESTABLISHED',measurement:{status:'NOT_RUN_DIAGNOSTIC_WORKER_AND_NATIVE_PAGE_CPU'},workerCPUProfile:cpu('WORKER'),nativePageCPUProfile:cpu('NATIVE_PAGE'),cpuProfileCleanup:{status:'SUCCEEDED'},instrumentation:{clockAlignment:true,buildManifestSha256:'a'.repeat(64),limit:1024,maxBytes:131072},instrumentedPackageUnchanged:true,workerTrace:{status:'RAM_SNAPSHOT',producerDropped:0},trace:{events:[{clockEpochMs:1000}],bytes:64,dropped:0},diagnosticClock:{kind:'COMMAND_BOUNDS_AND_RECORDED_STAGE_CORRELATION_ONLY'},sourceChangedDuringRun:false,fixtureChangedDuringRun:false,manifestChangedDuringRun:false};
 const phaseRows=[{kind:'native-start',realm:'worker',realmOrdinal:0,at:1000,clockEpochMs:1000},{kind:'pass-start',realm:'content',realmOrdinal:2,at:1000,clockEpochMs:1000}];
 valid.cpuPhaseTrace={kind:'DIAGNOSTIC_ONLY_CPU_PHASE_TRACE',acceptance:'NOT_ESTABLISHED',status:'CAPTURED',limit:1024,maxBytes:131072,timeoutMs:1000,snapshotBoundary:'CONTENT_COPY_THEN_ONE_EXISTING_WORKER_READ_NOT_ATOMIC',coverageMeaning:'RECORDED_EVENT_RANGE_INTERSECTION_ONLY_NOT_CONTINUOUS_OR_SYNCHRONIZED',dropDisclosure:'SOURCE_COUNTERS_AND_RETAINED_ROW_COUNTERS_NOT_A_COMPLETE_LOSS_COUNT',snapshotClock:{requested:stamp(),completed:stamp()},content:{status:'RAM_SNAPSHOT',bytes:64,dropped:0},worker:{status:'RAM_SNAPSHOT',bytes:64,dropped:0,producerDropped:0},events:phaseRows,bytes:128,dropped:0,profileRanges:Object.fromEntries([['workerCPUProfile','worker',0],['nativePageCPUProfile','content',2]].map(([key,realm,realmOrdinal])=>[key,{realm,realmOrdinal,retainedEvents:1,commandRangeEpochMs:{first:1000,last:1000},retainedEventRangeEpochMs:{first:1000,last:1000},intersectsCommandBounds:true}]))};
 const rejected=Symbol('gate-rejected'),run=new Function('require','process','console',script),check=r=>run(()=>r,{env:{RUNNER_TEMP:'/synthetic',GITHUB_SHA:'expected'},exit:code=>{assert.equal(code,1);throw rejected;}},{log:()=>{}});check(valid);
 // A disjoint range is valid disclosed evidence, never a fabricated coverage claim.
 const disjoint=structuredClone(valid);disjoint.cpuPhaseTrace.events[1].clockEpochMs=2000;Object.assign(disjoint.cpuPhaseTrace.profileRanges.nativePageCPUProfile,{retainedEventRangeEpochMs:{first:2000,last:2000},intersectsCommandBounds:false});check(disjoint);
 for(const mutate of [r=>delete r.cpuPhaseTrace,r=>r.cpuPhaseTrace.status='UNAVAILABLE',r=>r.cpuPhaseTrace.events=[],r=>r.cpuPhaseTrace.events=r.cpuPhaseTrace.events.filter(e=>e.realm==='worker'),r=>{r.cpuPhaseTrace.snapshotClock.requested.monotonicMs--;r.cpuPhaseTrace.snapshotClock.requested.epochMs--;},r=>r.cpuPhaseTrace.limit=2048,r=>r.cpuPhaseTrace.bytes=131073,r=>delete r.cpuPhaseTrace.content.dropped,r=>delete r.cpuPhaseTrace.worker.producerDropped,r=>r.cpuPhaseTrace.worker.status='UNAVAILABLE',r=>delete r.cpuPhaseTrace.snapshotClock,r=>r.cpuPhaseTrace.snapshotClock.completed.epochMs=999,r=>{r.cpuPhaseTrace.snapshotClock.completed.monotonicMs+=1001;r.cpuPhaseTrace.snapshotClock.completed.epochMs+=1001;},r=>delete r.cpuPhaseTrace.profileRanges.nativePageCPUProfile,r=>r.cpuPhaseTrace.profileRanges.nativePageCPUProfile.realmOrdinal=1,r=>r.cpuPhaseTrace.profileRanges.workerCPUProfile.intersectsCommandBounds=false,r=>r.cpuPhaseTrace.events[0].clockEpochMs=1100,r=>r.cpuPhaseTrace.coverageMeaning='COMPLETE_CONTINUOUS_COVERAGE',r=>r.cpuPhaseTrace.snapshotBoundary='ATOMIC',r=>r.status='DIAGNOSTIC_ONLY_RETURN_COMPLETE',r=>r.workerCPUProfile.status='UNAVAILABLE',r=>r.nativePageCPUProfile.status='UNAVAILABLE',r=>r.nativePageCPUProfile.acceptance='ACCEPTED',r=>r.nativePageCPUProfile.profile.samples=[],r=>r.cpuProfileCleanup.status='UNAVAILABLE',r=>r.cleanupErrors=['failed'],r=>r.temporaryDirectoryRemoved=false,r=>r.sourceChangedDuringRun=true,r=>r.fixtureChangedDuringRun=true,r=>r.manifestChangedDuringRun=true,r=>r.sourceCommit='other',r=>r.instrumentedPackageUnchanged=false,r=>r.instrumentation.clockAlignment=false,r=>r.instrumentation.buildManifestSha256='',r=>r.instrumentation.limit=2048,r=>r.instrumentation.maxBytes=262144,r=>r.trace.dropped=undefined,r=>r.workerTrace.producerDropped=undefined,r=>r.trace.bytes=131073,r=>r.trace.events=Array.from({length:1025},()=>({clockEpochMs:1000})),r=>r.trace.events=[{}],r=>r.workerTrace.status='UNAVAILABLE',r=>r.workerCPUProfile.clockCorrelation.profileClock='ASSUMED_EPOCH',r=>r.nativePageCPUProfile.clockCorrelation.startRequested=undefined,r=>r.nativePageCPUProfile.clockCorrelation.stopAcknowledged.epochMs=999]){
  const copy=structuredClone(valid);mutate(copy);assert.throws(()=>check(copy),e=>e===rejected);
 }
});

test('snippet journey runs in existing isolated job and publishes only its text result',()=>{assert.match(jobs['offline-journeys'],/node tests\/host\/snippets-package-mv3-browser\.mjs "\$RUNNER_TEMP\/snippets-package\.json"/);assert.match(jobs['offline-journeys'],/ui10-matrix visible-actions frame-window-retention frame-focus-return local-status observed-project-layout temporary-navigation temporary-project-navigation challenge-status preauthorization snippets-package snippets-startup-trace; do/);});
test('temporary Project journey shares existing runner and text evidence without uploads',()=>{assert.match(jobs['offline-journeys'],/node tests\/host\/temporary-project-mv3-browser\.mjs "\$RUNNER_TEMP\/temporary-project-navigation\.json"/);assert.match(jobs['offline-journeys'],/node tests\/host\/temporary-project-list-browser\.mjs/);assert.doesNotMatch(workflow,/actions\/(?:upload-artifact|cache)/);});

test("preauthorization observation shares existing challenge job without new profile sharing or uploads",()=>{assert.match(jobs["offline-journeys"],/node tests\/host\/preauthorization-package-browser\.mjs "\$RUNNER_TEMP\/preauthorization\.json"/);assert.match(jobs["offline-journeys"],/challenge-status preauthorization snippets-package snippets-startup-trace; do/);});

test('observed Project actual package and masked-data checks share existing isolated runner',()=>{assert.match(jobs['offline-journeys'],/node tests\/host\/observed-project-mv3-browser\.mjs "\$RUNNER_TEMP\/observed-project-layout\.json"/);assert.match(jobs['offline-journeys'],/node tests\/host\/observed-project-masked-browser\.mjs/);assert.doesNotMatch(workflow,/actions\/(?:upload-artifact|cache)/);});

// Evaluate the actual restricted conditions, so a diagnostic filter cannot
// silently remove push coverage or expose a paid/private/unrelated-branch run.
const allowedEvent={repository:'haohongfei2001-png/Virtual-AI-Workspace-Layer',event:{repository:{private:false}},ref:'refs/heads/codex/vaiwl-free-first-20261013',event_name:'push'};
const condition=(expression,github,inputs={})=>new Function('github','inputs','cancelled','return ('+expression.replace(/^\$\{\{\s*|\s*\}\}$/g,'')+');')(github,inputs,()=>false);
const jobAllowed=(name,event,inputs)=>condition(jobs[name].match(/^    if: (.+)$/m)[1],event,inputs);
const journeySteps=[...jobs['offline-journeys'].matchAll(/^      - name: ([^\n]+)\n([\s\S]*?)(?=^      - name:|$(?![\s\S]))/gm)].map(m=>({name:m[1],body:m[2],expression:m[2].match(/^        if: (.+)$/m)?.[1]}));
test('normal push retains all four jobs and every existing journey step',()=>{
 for(const name of Object.keys(jobs))assert.equal(jobAllowed(name,allowedEvent,{}),true,name);
 for(const step of journeySteps)if(step.expression)assert.equal(condition(step.expression,allowedEvent,{}),true,step.name);
});
test('manual startup diagnostic selects one existing runner and one browser command only',()=>{
 const event={...allowedEvent,event_name:'workflow_dispatch'},input={diagnostic:'temporary-project-startup'};
 assert.deepEqual(Object.keys(jobs).filter(name=>jobAllowed(name,event,input)),['offline-journeys']);
 const selected=journeySteps.filter(s=>!s.expression||condition(s.expression,event,input));
 const browserCommands=selected.flatMap(s=>[...s.body.matchAll(/node tests\/host\/([^\s]+\.mjs)/g)].map(m=>m[1]));
 assert.deepEqual(browserCommands,['temporary-project-mv3-browser.mjs']);
 assert(selected.some(s=>s.name==='Publish bounded text evidence to logs only'));
 assert.match(workflow,/workflow_dispatch is diagnostic only, never full CI/);
 assert.match(workflow,/group: free-offline-host-\$\{\{ github.event_name \}\}-\$\{\{ github.ref \}\}/);
});
test('diagnostic rejects unknown input, private repositories, other repos and other branches',()=>{
 const event={...allowedEvent,event_name:'workflow_dispatch'},input={diagnostic:'temporary-project-startup'};
 for(const [e,i]of [[event,{}],[event,{diagnostic:'arbitrary-command'}],[{...event,event:{repository:{private:true}}},input],[{...event,repository:'other/repo'},input],[{...event,ref:'refs/heads/main'},input]])assert.equal(Object.keys(jobs).filter(name=>jobAllowed(name,e,i)).length,0);
});
test('manual transport diagnostic runs the unchanged expiry command and gate without unrelated matrix work',()=>{
 const event={...allowedEvent,event_name:'workflow_dispatch'},input={diagnostic:'transport-expiry'};
 assert.deepEqual(Object.keys(jobs).filter(name=>jobAllowed(name,event,input)),['offline-journeys']);
 const selected=journeySteps.filter(s=>!s.expression||condition(s.expression,event,input));
 const commands=selected.flatMap(s=>[...s.body.matchAll(/node tests\/host\/([^\n]+)/g)].map(m=>m[1]));
 assert.deepEqual(commands,['context-replacement-package-browser.mjs "$RUNNER_TEMP/context-transport-expiry.json" transport-expiry']);
 assert(selected.some(s=>s.name==='Publish bounded text evidence to logs only'));
 const expiry=selected.find(s=>s.name==='Foreground expired document transport with genuine live C2 receipt');
 for(const marker of ["r.status!=='PASS_NARROW_OFFLINE_TRANSPORT_EXPIRY'",'r.nativeRequestStarts.length!==1',"r.foregroundRecovery?.sameWorker!==true",'r.sourceChangedDuringRun!==false'])assert(expiry.body.includes(marker));
 for(const e of [{...event,event:{repository:{private:true}}},{...event,repository:'other/repo'},{...event,ref:'refs/heads/main'}])assert.equal(Object.keys(jobs).filter(name=>jobAllowed(name,e,input)).length,0);
});

test('existing SYS05 diagnostic requires actual peer backpressure and undelivered-fragment recovery without claiming overflow',()=>{
 const body=jobs['offline-durability-compat'];assert.match(body,/sys05-work.json" --execute-browser --observe-work --backpressure --gap-recovery/);
 const script=workflow.match(/^          node -e "(const r=require\(process\.env\.RUNNER_TEMP\+'\/sys05-work\.json'\);[^\n]+)"$/m)?.[1];assert(script);
 const rejected=Symbol('rejected'),run=new Function('require','process',script),check=value=>run(()=>value,{env:{GITHUB_SHA:'expected'},exit:()=>{throw rejected;}});
 const valid={status:'PASS_NARROW_DIAGNOSTIC_SYS05_SLICE',S:'NARROW_INSTRUMENTED_BROWSER_OBSERVED',sourceCommit:'expected',fullSYS05:'NOT_ESTABLISHED',workInstrumentation:true,F1:'DIAGNOSTIC_ONLY_NOT_ACCEPTED',backpressureRequested:true,backpressureVerdict:'PASS_NARROW_REAL_OWNER_CONTENTION',directoryGapRequested:true,gapRecovery:'PASS_NARROW_UNDELIVERED_FRAGMENT_RETURN_RESCAN',queueOverflow:'NOT_RUN'};check(valid);
 for(const key of Object.keys(valid)){const value={...valid};delete value[key];assert.throws(()=>check(value),e=>e===rejected);}
});

test('manual popup geometry diagnostic selects only the existing native navigation journey',()=>{
 const event={...allowedEvent,event_name:'workflow_dispatch'},input={diagnostic:'temporary-navigation-appearance'};
 assert.deepEqual(Object.keys(jobs).filter(name=>jobAllowed(name,event,input)),['offline-journeys']);
 const selected=journeySteps.filter(s=>!s.expression||condition(s.expression,event,input));
 assert.deepEqual(selected.flatMap(s=>[...s.body.matchAll(/node tests\/host\/([^\s]+\.mjs)/g)].map(m=>m[1])),['temporary-navigation-package-browser.mjs']);
 for(const e of [{...event,event:{repository:{private:true}}},{...event,repository:'other/repo'},{...event,ref:'refs/heads/main'}])assert.equal(Object.keys(jobs).filter(name=>jobAllowed(name,e,input)).length,0);
 assert(selected.some(s=>s.name==='Publish bounded text evidence to logs only'));
});

test('startup trace cannot turn the original snippet failure green and is bounded',()=>{assert.match(jobs['offline-journeys'],/original_result=\$\?/);assert.match(jobs['offline-journeys'],/timeout 60s node tests\/host\/snippets-package-mv3-browser.mjs/);assert.match(jobs['offline-journeys'],/exit "\$original_result"/);});

test('existing window journey includes real cancellation subchain without a duplicate runner',()=>{assert.equal((workflow.match(/FREE_WINDOW_RETENTION_RUN=1 FREE_NAVIGATION_CANCEL_RUN=1 FREE_PANEL_CANCEL_RUN=1 node tests\/host\/frame-window-retention-package-browser\.mjs/g)??[]).length,1);});


test('cloud profile matrices retain private-repo denial and bounded concurrency',()=>{
 const all=Object.fromEntries([...workflow.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].map(m=>[m[1],m[2]]));
 for(const name of ['cloud-journey-matrix','cloud-ui-controls']){const body=all[name];assert(body);assert.match(body,/github\.event\.repository\.private == false/);assert.match(body,/github\.event_name == 'push'/);assert.match(body,/max-parallel: 3/);assert.match(body,/timeout-minutes: 15/);assert.match(body,/persist-credentials: false/);assert.doesNotMatch(body,/continue-on-error|upload-artifact|actions\/cache|secrets\./);}
 assert.match(all['cloud-journey-matrix'],/FREE_CHROME_HEADED=1 xvfb-run -a node tests\/host\/j1-j4-offline-matrix\.mjs/);
 assert.match(all['cloud-ui-controls'],/FREE_UI10_INTERACTIONS=1/);assert.match(all['cloud-ui-controls'],/PASS_CONTROL_SUBMATRIX_ONLY/);assert.match(all['cloud-ui-controls'],/r.fullV27Acceptance!=='NOT_ESTABLISHED'/);
});
test('new overflow slice cannot replace the original diagnostic or manufacture full acceptance',()=>{
 const body=jobs['offline-durability-compat'];assert.equal((body.match(/--queue-overflow/g)??[]).length,1);assert.match(body,/PASS_BOUNDED_SEND_INTENT_OVERFLOW_AND_FRESH_ACK/);assert.match(body,/r.results.length!==52/);assert.match(body,/recoverydeadline-browser.mjs/);assert.match(body,/r.sourcesStable!==true/);
});

test('supplementary gates stay finite and do not promote idle non-observation to acceptance',()=>{
 const body=workflow.split('  cloud-supplementary-gates:')[1];assert(body);assert.match(body,/github.event.repository.private == false/);assert.match(body,/github.event_name == 'push'/);assert.match(body,/max-parallel: 3/);assert.match(body,/timeout-minutes: \$\{\{ matrix\.gate == 'populated-native' && 25 \|\| 15 \}\}/);assert.match(body,/persist-credentials: false/);assert.doesNotMatch(body,/continue-on-error|upload-artifact|actions\/cache|secrets\./);
 for(const gate of ['privacy-main','privacy-isolated','idle-draft-active','idle-safe-empty-reading','populated-native','existing-source-repair'])assert(body.includes(gate));
 assert.match(body,/NATURAL_IDLE_NOT_OBSERVED/);assert.match(body,/naturalWorkerSleep==='PASS'/);assert.match(body,/Number.isFinite\(r.observation\?\.elapsedMs\)/);assert.match(body,/Finite observation only/);
 assert.match(body,/existing-source-pending-repair-journey.mjs.*--execute-browser/);assert.match(body,/fault-package-matrix-browser.mjs/);
});

test('only populated-native gets the evidence-backed longer finite job window',()=>{
 const body=workflow.split('  cloud-supplementary-gates:')[1];
 const match=body.match(/timeout-minutes: \$\{\{ matrix\.gate == '([^']+)' && (\d+) \|\| (\d+) \}\}/);
 assert(match);assert.equal(match[1],'populated-native');assert.equal(Number(match[2]),25);assert.equal(Number(match[3]),15);
 const gates=body.match(/gate: \[([^\]]+)\]/)[1].split(',').map(v=>v.trim());assert.equal(gates.filter(g=>g===match[1]).length,1);
 for(const gate of [...gates,'populated-native-extra','other'])assert.equal(gate===match[1]?Number(match[2]):Number(match[3]),gate==='populated-native'?25:15);
});

test('six bounded evidence-reconciliation gates require exact source and narrow statuses',()=>{
 const body=workflow.split('  cloud-supplementary-gates:')[1];
 for(const name of ['native-entry-safety','page-command-native-fetch','non-atomic-terminal','mixed-role','mixed-role-alt','membership-after-message'])assert(body.includes(name));
 for(const entry of ['native-entry-safety-package-browser.mjs','page-command-native-fetch-package-browser.mjs','non-atomic-terminal-idb-browser.mjs','evidence-order-package-browser.mjs'])assert(body.includes(entry));
 for(const status of ['PASS_LEGACY_SUBSCENARIOS_ONLY','PASS_NARROW_PACKAGED_PAGE_COMMAND_AND_NO_TAP_CONTINUITY','PASS_D_SCOPED','PASS_SCOPED_OFFLINE_D_S'])assert(body.includes(status));
 assert(body.includes('r.status!==expected||r.sourceCommit!==process.env.GITHUB_SHA'));
 assert(body.includes('FREE_EVIDENCE_SCENARIO="$SELECTED_GATE"'));
 assert.match(body,/timeout-minutes: \$\{\{ matrix\.gate == 'populated-native' && 25 \|\| 15 \}\}/);
 assert.doesNotMatch(body,/continue-on-error|upload-artifact|actions\/cache|secrets\./);
});


test('supplementary scheduling retains previous coverage and adds one combined local asset gate',()=>{
 const body=workflow.split('  cloud-supplementary-gates:')[1],gates=body.match(/gate: \[([^\]]+)\]/)[1].split(',').map(v=>v.trim());
 const original=['fault-auth-failure','fault-unsafe-reading','fault-forged-scope','fault-csp','fault-iframe-destroy','fault-stale-response','fault-rate-limit','fault-corrupt','fault-unknown-protocol','privacy-main','privacy-isolated','idle-draft-active','idle-safe-empty-reading','populated-native','visual-components','existing-source-repair','native-entry-safety','page-command-native-fetch','non-atomic-terminal','mixed-role','mixed-role-alt','membership-after-message'];
 const priority=['fault-unknown-protocol','local-assets','native-entry-safety','populated-native','existing-source-repair','membership-after-message'];
 const expected=priority.concat(original.filter(g=>!priority.includes(g)));
 const check=value=>{assert.deepEqual(value,expected);assert.deepEqual([...value].sort(),[...original,'local-assets'].sort());assert.equal(new Set(value).size,23);};check(gates);
 const wrongPriority=[...gates];[wrongPriority[0],wrongPriority[1]]=[wrongPriority[1],wrongPriority[0]];
 const wrongRemainder=[...gates];[wrongRemainder[5],wrongRemainder[6]]=[wrongRemainder[6],wrongRemainder[5]];
 for(const mutant of [gates.slice(1),[...gates,gates[0]],wrongPriority,wrongRemainder])assert.throws(()=>check(mutant));
 assert.match(body,/fail-fast: false/);assert.match(body,/max-parallel: 3/);
 const assets=body.split('            local-assets)')[1].split('              ;;')[0];
 assert(assets.includes('node tests/host/backup-package-mv3-browser.mjs "$RUNNER_TEMP/local-backup.json"'));
 assert(assets.includes('node tests/host/recovery-package-mv3-browser.mjs "$report"'));
 assert.match(assets,/scopeTupleLength!==4/);assert.match(assets,/workerNetworkBlocked!==true/);assert.match(assets,/guardClosed!==true/);
 assert.doesNotMatch(assets,/set \+e|\|\| true|--retry|rerun/);
});


test('J4 diagnostic preserves formal command and executes only its independent case after failure or success',()=>{
 const body=workflow.split('  cloud-journey-matrix:')[1].split('  cloud-ui-controls:')[0];
 const original=['j1-legacy','j1-modern','j2-legacy','j2-modern','j3-legacy','j3-modern','partial-reachability','j4-before-evidence-reenable','j4-before-native','j4-after-evidence','j4-codec-before-evidence','j4-codec-after-evidence'];
 const expression=body.match(/^        case: \$\{\{ (.+) \}\}$/m)[1],cases=new Function('github','fromJSON','return '+expression)(allowedEvent,JSON.parse);assert.deepEqual(cases,['j4-before-native',...original.filter(c=>c!=='j4-before-native')]);assert.equal(new Set(cases).size,12);
 assert(body.includes('run: FREE_CHROME_HEADED=1 xvfb-run -a node tests/host/j1-j4-offline-matrix.mjs "$RUNNER_TEMP/cloud-matrix" --execute-browser --cases=${{ matrix.case }}'));
 const step=body.split('      - name: Independent first re-enable owner trace')[1].split('      - name: Preserve exact scoped result')[0];
 assert(step.includes("if: ${{ !cancelled() && matrix.case == 'j4-before-native' }}"));
 const run=(cancelled,value)=>!cancelled&&value==='j4-before-native';
 for(const value of original){assert.equal(run(false,value),value==='j4-before-native');assert.equal(run(true,value),false);}
 assert(step.includes('FREE_J4_REENABLE_OWNER_TRACE=1 timeout 180s xvfb-run -a node tests/host/j4-package-journey.mjs "$RUNNER_TEMP/j4-reenable-owner-trace.json"'));
 assert(step.includes('test "$result" -eq 2'));assert(step.includes('node tests/host/j4-reenable-trace-outcome.mjs "$RUNNER_TEMP/j4-reenable-owner-trace.json" "$result" "$GITHUB_SHA"'));
 assert.doesNotMatch(step,/cloud-matrix|continue-on-error|success\(\)|rerun/);assert.match(body,/if: \$\{\{ always\(\) \}\}/);
 assert(body.includes('test ! -f "$RUNNER_TEMP/j4-reenable-owner-trace.json" || cat "$RUNNER_TEMP/j4-reenable-owner-trace.json"'));
});

test('explicit J4 dispatch schedules one existing case without other runners or extra trace replay',()=>{
 const all=Object.fromEntries([...workflow.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].filter(m=>/^    runs-on:/m.test(m[2])).map(m=>[m[1],m[2]]));
 const event={...allowedEvent,event_name:'workflow_dispatch'},input={diagnostic:'j4-codec-after-evidence'};
 const selected=(github,inputs)=>Object.keys(all).filter(name=>condition(all[name].match(/^    if: (.+)$/m)[1],github,inputs));
 assert.deepEqual(selected(event,input),['cloud-journey-matrix']);
 for(const [github,inputs] of [[event,{}],[event,{diagnostic:'j4-before-native'}],[event,{diagnostic:'arbitrary-command'}],[{...event,event:{repository:{private:true}}},input],[{...event,repository:'other/repo'},input],[{...event,ref:'refs/heads/main'},input],[{...event,event_name:'pull_request'},input]])assert.deepEqual(selected(github,inputs),[]);
 const body=all['cloud-journey-matrix'],expression=body.match(/^        case: \$\{\{ (.+) \}\}$/m)[1];
 const cases=new Function('github','fromJSON','return '+expression)(event,JSON.parse);assert.deepEqual(cases,['j4-codec-after-evidence']);assert(!expression.includes('inputs.'));
 const trace=body.split('      - name: Independent first re-enable owner trace')[1].split('      - name: Preserve exact scoped result')[0];
 const traceCondition=trace.match(/^        if: (.+)$/m)[1].replace(/^\$\{\{\s*|\s*\}\}$/g,'');
 assert.equal(new Function('matrix','cancelled','return '+traceCondition)({case:cases[0]},()=>false),false);
 assert(body.includes('--execute-browser --cases=${{ matrix.case }}'));assert(body.includes('workflow_dispatch is one scoped diagnostic, never full CI'));
 assert.doesNotMatch(body,/continue-on-error|upload-artifact|actions\/cache|secrets\./);
});


test('unknown-protocol copy diagnostic never replaces the formal fault report',()=>{
 const body=workflow.split('  cloud-supplementary-gates:')[1];
 const step=body.split('      - name: Independent unknown-protocol consumption trace')[1].split('      - name: Preserve exact supplementary result')[0];
 assert(step.includes("if: ${{ !cancelled() && matrix.gate == 'fault-unknown-protocol' && steps.formal_supplementary.outcome == 'failure' }}"));
 assert(step.includes('FREE_FAULT_UNKNOWN_TRACE=1 timeout 180s node tests/host/fault-package-matrix-browser.mjs "$RUNNER_TEMP/fault-unknown-trace.json" unknown-protocol'));
 assert(step.includes('test "$result" -eq 2'));assert(step.includes('node tests/host/fault-unknown-trace-outcome.mjs "$RUNNER_TEMP/fault-unknown-trace.json" "$result" "$GITHUB_SHA"'));
 assert.doesNotMatch(step,/supplementary.json|continue-on-error|success\(\)|rerun/);
 assert(body.includes('fault-*) node tests/host/fault-package-matrix-browser.mjs "$report" "${SELECTED_GATE#fault-}" ;;'));
 assert(body.includes('test ! -f "$RUNNER_TEMP/fault-unknown-trace.json" || cat "$RUNNER_TEMP/fault-unknown-trace.json"'));
});
