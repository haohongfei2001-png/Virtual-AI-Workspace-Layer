/** Independent report admission, not a replacement for actual browser observations. */
import assert from 'node:assert/strict';
const stores=['refs','operations','b23_states','b23_operations','b23_checkpoints','b23_views','native_states','native_operations'].sort();
export function assertCleanPrivacyScan(scan,{nonempty=false}={}){
 assert(scan&&Number.isSafeInteger(scan.values)&&scan.values>=0,'privacy scan missing');
 if(nonempty)assert(scan.values>0,'vacuous privacy scan');
 assert.equal(scan.unsupported,0);assert.deepEqual(scan.hits,{token:0,cookie:0,body:0,draft:0});
}
function database(value){
 assert.equal(value?.databases?.length,1);assert.deepEqual([...value.databases[0].stores].sort(),stores);
 const counts=value.databases[0].counts;assert.deepEqual(Object.keys(counts).sort(),stores);
 assert(Object.values(counts).every(n=>Number.isSafeInteger(n)&&n>=0));assert(Object.values(counts).some(n=>n>0));
 assertCleanPrivacyScan(value.scan,{nonempty:true});
}
export function assertPrivacyReport(report){
 assert.equal(report.status,'PASS');assert.equal(report.realAccount,'NOT_RUN');assert.equal(report.fullSYS07,'NOT_ESTABLISHED');
 assert.equal(report.sourceChangedDuringRun,false);assert(report.cleanup?.length>=3);assert(report.cleanup.every(v=>v==='fulfilled'));
 assert.equal(report.networkGuard?.mode,'DISPOSABLE_CHROME_REJECT_PROXY');assert.equal(report.networkGuard.closed,true);
 for(const hashes of [report.sourceHashes,report.evidenceHashes]){assert(Object.keys(hashes??{}).length>0);assert(Object.values(hashes).every(v=>/^[a-f0-9]{64}$/.test(v)));}
 if(report.evidence==='REAL_HEADLESS_PRODUCTION_PACKAGE_OFFLINE_PRIVACY'){
  assert.equal(report.sys07,'PARTIAL_MAIN_AUTH_METADATA_FAILURE');assert.equal(report.fallbackAuth,'NOT_EXERCISED_BY_THIS_JOURNEY');
  const c=report.checks;assert.equal(c.authenticatedFailure.armed,false);assert.equal(c.authenticatedFailure.authenticatedFailures,1);
  assert.deepEqual(c.failureTerminal,{operation:'HOST_UI_CALIBRATION_ENTRY',started:1,finished:1,state:'unavailable'});
  assert.equal(c.nativeDraftRetained,true);assert.equal(c.nativeBodyPresent,true);database(c.rawIDB);
  const roles=c.mountedRoles;assert(Array.isArray(roles)&&roles.includes('workspace')&&roles.length<=2&&new Set(roles).size===roles.length&&roles.every(r=>['workspace','sidebar'].includes(r)),'invalid-mounted-ui-roles');
  assert.equal(c.surfaces.length,roles.length);c.surfaces.forEach(s=>assertCleanPrivacyScan(s,{nonempty:true}));
  assert.deepEqual(c.uiMessageCoverage,roles.map(()=>'EXISTING_FRAME_OBSERVED'));
  assert.equal(c.observers.length,roles.length+2);for(const o of c.observers){assertCleanPrivacyScan(o.messages);assertCleanPrivacyScan(o.logs);}
  assertCleanPrivacyScan(c.nativeConsole);assert(c.war.allowedCount>2);assert.deepEqual(c.war.privateDenied,[true,true,true]);assertCleanPrivacyScan(c.war.scan,{nonempty:true});
  assert.equal(c.workerNetworkBoundary.blocked,true);assert.equal(c.workerNetworkBoundary.secondLoopbackHits,0);
 }else{
  assert.equal(report.evidence,'REAL_HEADLESS_PACKAGED_MV3_OFFLINE_ISOLATED_AUTH_PRIVACY');
  assert.deepEqual(report.cases.map(c=>c.mode),['success','malformed-accounts']);
  for(const c of report.cases){
   assert(c.workerAuthAborted>0&&c.isolatedSession>0&&c.isolatedAccounts>0);assert.equal(c.nativeDraftRetained,true);database(c.rawIDB);
   assert.equal(c.mountedFramesStable,true,'mounted-ui-changed-during-privacy-observation');const success=c.mode==='success',roles=c.mountedRoles;assert(Array.isArray(roles)&&new Set(roles).size===roles.length&&roles.every(r=>['workspace','sidebar'].includes(r)));if(success)assert(roles.includes('workspace')&&roles.length<=2);else assert.equal(roles.length,0);assert.equal(c.extensionDOM.length,roles.length);c.extensionDOM.forEach(s=>assertCleanPrivacyScan(s,{nonempty:true}));
   assertCleanPrivacyScan(c.pageConsole);assertCleanPrivacyScan(c.workerObserved.messages,{nonempty:true});assertCleanPrivacyScan(c.workerObserved.logs);
   assert.equal(c.workerObserved.counts.identityMalformedFailure,0);assert(c.delta.dispatchReplies>0);
   assert.equal(c.delta[success?'identitySuccess':'identityFailure'],1);assert.equal(c.delta[success?'identityFailure':'identitySuccess'],0);
   assert.equal(c.terminal,success?'NATIVE_PROJECTION_WITH_REAL_ISOLATED_IDENTITY_RESULT':'OPAQUE_FAILED_IDENTITY_RESULT_AND_NATIVE_ONLY');
   if(!success){assert.equal(c.malformedResponses,1);assert.equal(c.authenticatedAccounts,true);}
  }
 }
 return true;
}
