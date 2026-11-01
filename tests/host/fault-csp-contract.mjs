import assert from 'node:assert/strict';
/** Fixed fixture scope, never inferred from whichever frames happened to load. */
export function expectedCspRoles(r){
 const roles=r.expectedRoles??['workspace','sidebar'];
 assert(Array.isArray(roles));
 if(roles.length===1){assert.deepEqual(roles,['workspace']);assert.equal(r.sidebarCoverage,'NOT_RUN_NO_COMMON_NATIVE_NAV');}
 else assert.deepEqual(roles,['workspace','sidebar']);
 return roles;
}
/** CANDIDATE ONLY: admitted booleans must be backed by actual browser evidence. */
export function assertCanonicalCspObservation(r){
 const roles=expectedCspRoles(r);
 if(r.expectedRoles){
  assert.deepEqual(Object.keys(r.packageFrameAttemptsByRole??{}).sort(),['sidebar','workspace']);
  let total=0;for(const role of ['workspace','sidebar']){const count=r.packageFrameAttemptsByRole[role];assert(Number.isInteger(count)&&count>=0&&count<=1);if(!roles.includes(role))assert.equal(count,0);total+=count;}assert.equal(total,r.packageFrameAttempts);
 }
 assert.equal(r.evidence,'ACTUAL_PACKAGED_MV3_CSP_DUAL_BRANCH');
 assert.equal(r.fullFAULT,'NOT_ESTABLISHED');assert.equal(r.fullSYS07,'NOT_ESTABLISHED');assert.equal(r.realAccount,'NOT_RUN');
 for(const k of ['sourcesStable','packageVerified','cleanupOK','workerNetworkBlocked','pagePolicyUnchanged','frameSourceNone','nativeEditorSame','nativeDraftSame','nativeSelectionSame','nativeActionWorked'])assert.equal(r[k],true,k);
 assert(r.mainProbePolicyViolations>0);assert.equal(r.mainProbeRequests,0);
 assert.equal(r.pageProjectionLeaks,0);assert.equal(r.pageMessageLeaks,0);assert.equal(r.captureDropped,0);assert.equal(r.captureUnsupported,0);
 assert(r.pageDOMScannedValues>0);assert(r.observationMs>=1000);assert.equal(r.finalScanPerformed,true);assert.equal(r.exactControlMessageSchemas,true);assert(r.packageFrameAttempts<=roles.length,'one attempt per declared role, no remount retries');assert.equal(r.boundedRetryStable,true);assert(r.packageFrameAttemptsBeforeContinuation>0);assert.equal(r.packageFrameAttemptsAfterContinuation,r.packageFrameAttemptsBeforeContinuation);assert.equal(r.packageFrameAttempts,r.packageFrameAttemptsAfterContinuation);
 if(r.branch==='PACKAGE_BLOCKED'){
  assert.equal(r.status,'PASS_NARROW_CSP_BLOCKED_NATIVE_PRESERVED');
  assert.equal(r.noCspPositiveControl,true);assert(r.packageFrameAttempts>0);assert(r.packageFramePolicyViolations>0);
  assert.equal(r.loadedPrivateFrames,0);assert.equal(r.successfulPrivateViews,0);assert.equal(r.nativeRetainedBeforeCorrectiveToggle,true);
  assert.equal(r.boundedRetryStable,true);
 }else{
  assert.equal(r.branch,'ISOLATED_AUTHENTICATED');assert.equal(r.status,'PASS_NARROW_CSP_ISOLATED_AUTHENTICATED_SURFACES');
  assert.equal(r.loadedPrivateFrames,roles.length);assert.equal(r.packageFramePolicyViolations,0);
  if(roles.length===2)assert.equal(r.bothNativeCloseControlsExercised,true);
  else{assert.equal(r.bothNativeCloseControlsExercised,false);assert.deepEqual(r.nativeCloseRolesExercised,roles);}
  assert.equal(r.sameAuthenticatedGrantsBeforeClose,true);assertAuthenticatedCspProof(r);
 }
 return true;
}

export function assertAuthenticatedCspProof(r){
  const roles=expectedCspRoles(r);
  assert.deepEqual(r.frames.map(f=>f.role).sort(),[...roles].sort());
  for(const f of r.frames){
   for(const k of ['actualBrowserContextMatched','joinSucceeded','viewSucceeded','scopeMatchesIndependentOracle','grantUnexpired','nativeProjectionRendered','privateDetectorPositive','ownGrantReadSucceeded','postNegativeOwnGrantReadSucceeded'])assert.equal(f[k],true,k);
   assert.equal(f.urlRole,f.role);assert(f.privateScannedValues>0);
  }
  for(const key of ['distinctRoleGrants','distinctUIDocuments','sameActualParent','sameMount'])assert.equal(r[key],roles.length===2?true:'NOT_APPLICABLE_SINGLE_ROLE',key);
  assert.equal(r.foreignProbePreservedNativeFocus,true);assert.equal(r.foreignSenderDenied,true);assert.equal(r.foreignSenderReturnedPrivateFields,false);
  assert(r.extensionPageMessagesObserved>0);assert.equal(r.exactControlMessageSchemas,true);
 for(const k of ['pageProjectionLeaks','pageMessageLeaks','captureDropped','captureUnsupported'])assert.equal(r[k],0,k);assert(r.pageDOMScannedValues>0);return true;
}
