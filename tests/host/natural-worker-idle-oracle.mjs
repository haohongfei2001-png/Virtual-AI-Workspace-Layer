/** Independent evidence checks. Target destruction does not establish idle causality. */
import assert from 'node:assert/strict';
const finite = value => Number.isFinite(value);
function checkedRoles(roles){assert(Array.isArray(roles)&&roles.length>=1&&roles.length<=2&&roles[0]==='workspace'&&(roles.length===1||roles[1]==='sidebar'),'invalid fixed fixture roles');return roles;}
/** Late passive observation is incomplete evidence, not a failed idle cycle.
 * Never downgrade a negative RPC, absent renderer or failed frame lifecycle. */
export function idleBaselineUnobserved(rows,expectedRoles){
 checkedRoles(expectedRoles);
 return Array.isArray(rows)&&rows.length===expectedRoles.length&&rows.every((row,index)=>{
  if(row.role!==expectedRoles[index]||row.lifecycle!=='render-ready'||row.rendererVisible!==true||row.matchingViewObserved!==false||!Array.isArray(row.observedRPCs))return false;
  const trace=row.observedRPCs,renew=r=>r.type==='HOST_UI_RENEW'&&r.ok===true&&r.hasGrant===true&&r.reason==null;
  if(trace.every(renew))return true;
  // Passive attachment can miss JOIN and see VIEW before any grant. A later
  // same-grant renewal does not cause another VIEW. Keep this explicit lack
  // of baseline out of product failures, without accepting an idle cycle.
  const firstRenew=trace.findIndex(renew),views=trace.filter(r=>r.type==='HOST_UI_VIEW');
  if(row.grantObserved!==true||firstRenew<1||views.length===0||trace.slice(firstRenew).some(r=>r.type==='HOST_UI_VIEW'))return false;
  const auxiliary=new Set(['HOST_UI_VIEW_RECEIPT','HOST_UI_SAVE_VIEW','HOST_UI_CANDIDATES','HOST_UI_NAVIGATION_PLANS','HOST_UI_SURFACE_STATE_GET']);
  return trace.every(r=>r.ok===true&&r.reason==null&&(renew(r)||r.hasGrant===false&&(r.type==='HOST_UI_VIEW'?r.state==='ready':auxiliary.has(r.type)&&r.state==null)));
 });
}
export function assessIdleObservation(value) {
 const {windowMs,elapsedMs,initialWorkerId,prefix,initialTargets,events}=value;
 assert.equal(windowMs,60000,'exactly one fixed 60 s observation');
 assert(finite(elapsedMs)&&elapsedMs>=windowMs&&elapsedMs<=90000,'invalid observation duration');
 for(const key of ['forcedWorkerStop','workerDebuggerAttached','productionTimersModified','pageFrozen','eventOverflow'])assert.equal(value[key],false,key);
 assert.equal(value.hostSessionDetached,true,'host debugger must be detached');
 assert(typeof initialWorkerId==='string'&&initialWorkerId.length>0);
 assert(typeof prefix==='string'&&prefix.startsWith('chrome-extension://'));
 assert(Array.isArray(initialTargets)&&initialTargets.length>0);
 const workers=initialTargets.filter(t=>t.type==='service_worker'&&t.url===prefix+'extension/worker.mjs');
 assert.equal(workers.length,1,'exactly one original worker');assert.equal(workers[0].targetId,initialWorkerId);
 for(const target of initialTargets){assert(target.url.startsWith(prefix));assert.equal(target.attached,false,'extension debugger attached at start');}
 assert(Array.isArray(events)&&events.length<=512);
 for(const event of events){
  assert(finite(event.at)&&event.at>=0&&event.at<=elapsedMs,'event outside observation');
  const target=event.params?.targetInfo;
  if(target?.url?.startsWith(prefix))assert(target.attached!==true&&event.method!=='Target.attachedToTarget','extension debugger attached during observation');
 }
 const destroyed=events.some(e=>e.method==='Target.targetDestroyed'&&e.params.targetId===initialWorkerId);
 const crashSignal=events.some(e=>e.method==='Target.targetCrashed'&&e.params.targetId===initialWorkerId);
 return {initialWorkerDestroyed:destroyed,crashSignal,naturalWorkerSleep:destroyed?'NOT_ESTABLISHED':'NOT_OBSERVED',cause:crashSignal?'TARGET_CRASH_SIGNAL':destroyed?'UNATTRIBUTED_TARGET_DESTRUCTION':'NO_TARGET_DESTRUCTION',status:destroyed?'UNFORCED_TARGET_DESTRUCTION_RECOVERY_PENDING':'NATURAL_IDLE_NOT_OBSERVED'};
}
export function assessIdleRecovery({scenario='draft-active',expectedRoles=['workspace','sidebar'],privateFramesCleared,observation,initialWorkerId,newWorker,prefix,initialFrames,recoveredFrames,reentryAt,checkedAt,native}) {
 const roles=checkedRoles(expectedRoles),count=roles.length;
 assert(['draft-active','safe-empty-reading'].includes(scenario));
 assert.equal(observation.initialWorkerDestroyed,true,'cannot claim recovery without observed destruction');
 assert.equal(observation.naturalWorkerSleep,'NOT_ESTABLISHED','target destruction does not prove natural idle');
 assert(newWorker&&newWorker.targetId!==initialWorkerId&&typeof newWorker.targetId==='string');
 assert.equal(newWorker.type,'service_worker');assert.equal(newWorker.url,prefix+'extension/worker.mjs');assert.equal(newWorker.attached,false);
 assert(finite(reentryAt)&&finite(checkedAt)&&checkedAt>=reentryAt);
 assert.equal(initialFrames.length,count);assert.equal(recoveredFrames.length,count);
 assert.equal(new Set(initialFrames.map(f=>f.targetId)).size,count);assert.equal(new Set(recoveredFrames.map(f=>f.targetId)).size,count);
 assert.deepEqual(initialFrames.map(f=>f.role).sort(),[...roles].sort());assert.deepEqual(recoveredFrames.map(f=>f.role).sort(),[...roles].sort());
 for(const frame of recoveredFrames){
  const prior=initialFrames.find(f=>f.role===frame.role);
  assert(typeof frame.targetId==='string');
  if(scenario==='draft-active')assert.notEqual(frame.targetId,prior.targetId,'old frame reused outside safe dormancy');
  else assert.equal(privateFramesCleared?.[frame.role],true,'safe dormancy must clear private projection before reentry');
  assert(/^[a-f0-9]{64}$/.test(frame.grantDigest)&&frame.grantDigest!==prior.grantDigest,'old or missing grant reused');
  assert.equal(frame.viewGrantDigest,frame.grantDigest,'actual VIEW must use current grant');
  assert(typeof frame.scope==='string'&&frame.scope.length>0&&frame.scope===prior.scope,'scope changed');assert.equal(frame.currentRef,prior.currentRef);
  for(const key of ['grantRequestedAt','grantReceivedAt','viewRequestedAt','viewReceivedAt','expiresAt'])assert(finite(frame[key]),'missing actual grant/VIEW timestamp');
  assert(frame.grantReceivedAt>=frame.grantRequestedAt&&frame.grantReceivedAt<=checkedAt);
  if(scenario==='safe-empty-reading')assert(frame.grantRequestedAt>=reentryAt,'dormant grant must follow genuine reentry');
  assert(frame.viewRequestedAt>=reentryAt&&frame.viewRequestedAt>=frame.grantReceivedAt,'VIEW predates user reentry/current grant');
  assert(frame.viewReceivedAt>=frame.viewRequestedAt&&frame.viewReceivedAt<=checkedAt&&frame.expiresAt>checkedAt,'stale/expired VIEW');
 }
 for(const key of ['sameDocument','sameEditor','editorConnected','editorEnabled'])assert.equal(native[key],true,key);
 assert.equal(native.draft,scenario==='draft-active'?'NATURAL_IDLE_LOCAL_DRAFT':'');assert.equal(native.open,count,'recovery must reopen every supported fixture surface');assert.equal(native.returnCount,0,'workspace presentation removes the reading-only return control');
 if(scenario==='draft-active')assert.deepEqual(native.originalFramesConnected,roles.map(()=>false),'old private frame survived recovery');
 else assert(native.originalFramesConnected.length===count&&native.originalFramesConnected.every(value=>typeof value==='boolean'));
 return {status:'UNFORCED_TARGET_DESTRUCTION_RECOVERY_PASS',naturalWorkerSleep:'NOT_ESTABLISHED',cause:observation.cause,actualFreshViews:count,nativePreserved:true};
}

/** Necessary visible preconditions, not a fabricated private readiness token. */
export function assessIdleScenario(scenario,value){
 assert(['draft-active','safe-empty-reading'].includes(scenario));
 assert.equal(value.open,0);assert.equal(value.returnCount,1);
 assert.equal(value.sameDocument,true);assert.equal(value.sameEditor,true);
 if(scenario==='draft-active'){assert.equal(value.draft,'NATURAL_IDLE_LOCAL_DRAFT');assert.equal(value.editorFocused,true);return {scenario,automaticDormancyEligible:false,reason:'ACTIVE_DRAFT_AND_EDITOR_FOCUS'};}
 assert.equal(value.draft,'');assert.equal(value.interactiveFocused,false);assert.equal(value.openModalCount,0);assert.equal(value.fileCount,0);assert.equal(value.activeRiskCount,0);assert.equal(value.editorCount,1);
 return {scenario,visibleSafetyPreconditions:true,automaticDormancyEligible:'NOT_ESTABLISHED',reason:'EMPTY_READING_AFTER_OPEN_TO_CLOSED_TRANSITION_INTERNAL_QUIET_NOT_FORCED'};
}

export const IDLE_EVIDENCE_DEPENDENCIES=Object.freeze([
 'natural-worker-idle-probe.mjs','natural-worker-idle-oracle.mjs','natural-worker-idle-bootstrap.mjs','j4-grant-observer.mjs','j3-journey-profile.mjs','expected/modern.mjs','../../src/data/hash.mjs',
 'historical-network-guard.mjs','native-visibility-browser.mjs','isolated-browser-cleanup.mjs',
 'fixtures/server.mjs','fixtures/legacy.html','fixtures/native.mjs','fixtures/native.css','expected/legacy.mjs',
 'fixtures/j2-send.mjs','fixtures/first-send.mjs','fixtures/j1-candidate-page.mjs','fixtures/variants-server.mjs',
 'fixtures/native-current-refresh.mjs','fixtures/j2-modern.mjs','fixtures/j3-modern.mjs',
 'fixtures/ui10-conversation-title.mjs','fixtures/j4-interruption.mjs','../../extension/package.mjs',
]);
export function idleEvidenceCommit(env){
 const value=env.FREE_SOURCE_COMMIT??env.GITHUB_SHA??null;
 assert(value===null||typeof value==='string'&&/^[a-f0-9]{40}$/i.test(value),'invalid source commit');return value;
}
export function validateIdleEvidence({before,after,sourceCommit,cleanup}){
 assert(sourceCommit===null||typeof sourceCommit==='string'&&/^[a-f0-9]{40}$/i.test(sourceCommit));
 assert.deepEqual(Object.keys(before??{}).sort(),[...IDLE_EVIDENCE_DEPENDENCIES].sort(),'missing evidence dependency');
 assert.deepEqual(Object.keys(after??{}).sort(),Object.keys(before).sort(),'evidence dependency set changed');
 for(const path of IDLE_EVIDENCE_DEPENDENCIES){assert(/^[a-f0-9]{64}$/.test(before[path]),'invalid dependency hash');assert.equal(after[path],before[path],'evidence dependency changed: '+path);}
 assert.equal(cleanup?.completed,true,'cleanup incomplete');assert.deepEqual(cleanup.errors,[],'cleanup errors');
 assert.equal(cleanup.pendingCommands,0);assert.equal(cleanup.browserStopped,true);assert.equal(cleanup.networkGuardClosed,true);assert.equal(cleanup.profileRemoved,true);
 return {dependenciesUnchanged:true,cleanupVerified:true,sourceCommitBound:sourceCommit!==null};
}

/** Finish the same observation window if a coarse timer wakes fractionally early.
 * Never inspects worker state and never starts another observation interval. */
export async function finishIdleObservationDeadline(started,windowMs,{now,sleep}){
 assert(Number.isFinite(started));assert.equal(windowMs,60000);
 const deadline=started+windowMs;let current=now();
 assert(Number.isFinite(current)&&current>=started,'invalid observation clock');
 while(current<deadline){
  await sleep(Math.max(1,Math.ceil(deadline-current)));
  const next=now();assert(Number.isFinite(next)&&next>=current,'observation clock regressed');current=next;
 }
 return current;
}

/** Mount completion is distinct from presentation: normal native surrender may
 * leave authorized frames in reading mode with the production return control. */
export function idleBootstrapAction(facts,prefix,expectedRoles=['workspace','sidebar']){
 const roles=checkedRoles(expectedRoles),count=roles.length;
 if(facts?.rootPresent===false||facts?.readyState!=='complete'||facts.visibility!=='visible')return 'WAIT';
 assert(Number.isSafeInteger(facts.returnCount)&&facts.returnCount>=0&&facts.returnCount<=1,'duplicate bootstrap return');
 const frames=facts.frames;
 if(!Array.isArray(frames)||frames.length!==count||!frames.every(frame=>frame.connected===true)||new Set(frames.map(f=>f.src)).size!==count||!roles.every(role=>frames.some(f=>f.src===prefix+role+'.html')))return 'WAIT';
 if(facts.open===count)return 'READY';
 if(facts.open===0&&facts.returnCount===1&&facts.returnVisible===true)return 'NATIVE_RETURN_ONCE';
 return 'WAIT';
}
