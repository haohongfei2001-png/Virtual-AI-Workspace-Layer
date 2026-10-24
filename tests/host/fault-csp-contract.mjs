import assert from 'node:assert/strict';
/** CANDIDATE ONLY: admitted booleans must be backed by actual browser evidence. */
export function assertCanonicalCspObservation(r){
 assert.equal(r.evidence,'ACTUAL_PACKAGED_MV3_CSP_DUAL_BRANCH');
 assert.equal(r.fullFAULT,'NOT_ESTABLISHED');assert.equal(r.fullSYS07,'NOT_ESTABLISHED');assert.equal(r.realAccount,'NOT_RUN');
 for(const k of ['sourcesStable','packageVerified','cleanupOK','workerNetworkBlocked','pagePolicyUnchanged','frameSourceNone','nativeEditorSame','nativeDraftSame','nativeSelectionSame','nativeActionWorked'])assert.equal(r[k],true,k);
 assert(r.mainProbePolicyViolations>0);assert.equal(r.mainProbeRequests,0);
 assert.equal(r.pageProjectionLeaks,0);assert.equal(r.pageMessageLeaks,0);assert.equal(r.captureDropped,0);assert.equal(r.captureUnsupported,0);
 assert(r.pageDOMScannedValues>0);assert(r.observationMs>=1000);assert.equal(r.finalScanPerformed,true);assert.equal(r.exactControlMessageSchemas,true);assert(r.packageFrameAttempts<=2,'single bounded role pair, no remount retries');assert.equal(r.boundedRetryStable,true);assert(r.packageFrameAttemptsBeforeContinuation>0);assert.equal(r.packageFrameAttemptsAfterContinuation,r.packageFrameAttemptsBeforeContinuation);assert.equal(r.packageFrameAttempts,r.packageFrameAttemptsAfterContinuation);
 if(r.branch==='PACKAGE_BLOCKED'){
  assert.equal(r.status,'PASS_NARROW_CSP_BLOCKED_NATIVE_PRESERVED');
  assert.equal(r.noCspPositiveControl,true);assert(r.packageFrameAttempts>0);assert(r.packageFramePolicyViolations>0);
  assert.equal(r.loadedPrivateFrames,0);assert.equal(r.successfulPrivateViews,0);assert.equal(r.nativeRetainedBeforeCorrectiveToggle,true);
  assert.equal(r.boundedRetryStable,true);
 }else{
  assert.equal(r.branch,'ISOLATED_AUTHENTICATED');assert.equal(r.status,'PASS_NARROW_CSP_ISOLATED_AUTHENTICATED_SURFACES');
  assert.equal(r.loadedPrivateFrames,2);assert.equal(r.packageFramePolicyViolations,0);
  assert.equal(r.bothNativeCloseControlsExercised,true);assert.equal(r.sameAuthenticatedGrantsBeforeClose,true);assertAuthenticatedCspProof(r);
 }
 return true;
}

export function assertAuthenticatedCspProof(r){
  assert.deepEqual(r.frames.map(f=>f.role).sort(),['sidebar','workspace']);
  for(const f of r.frames){
   for(const k of ['actualBrowserContextMatched','joinSucceeded','viewSucceeded','scopeMatchesIndependentOracle','grantUnexpired','nativeProjectionRendered','privateDetectorPositive','ownGrantReadSucceeded','postNegativeOwnGrantReadSucceeded'])assert.equal(f[k],true,k);
   assert.equal(f.urlRole,f.role);assert(f.privateScannedValues>0);
  }
  assert.equal(r.distinctRoleGrants,true);assert.equal(r.distinctUIDocuments,true);assert.equal(r.sameActualParent,true);assert.equal(r.sameMount,true);
  assert.equal(r.foreignProbePreservedNativeFocus,true);assert.equal(r.foreignSenderDenied,true);assert.equal(r.foreignSenderReturnedPrivateFields,false);
  assert(r.extensionPageMessagesObserved>0);assert.equal(r.exactControlMessageSchemas,true);
 for(const k of ['pageProjectionLeaks','pageMessageLeaks','captureDropped','captureUnsupported'])assert.equal(r[k],0,k);assert(r.pageDOMScannedValues>0);return true;
}
