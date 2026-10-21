/** Fixed observation gates. Passing these gates is narrower than FAULT acceptance. */
import assert from 'node:assert/strict';
import {assertCanonicalCspObservation} from './fault-csp-contract.mjs';
import {faultExpectedWorld} from './expected/fault.mjs';
export const faultCases=Object.freeze(Object.keys(faultExpectedWorld.cases));
export function assertFaultObservation(c){
 assert(faultCases.includes(c.fault));assert.equal(c.packagedMV3,true);assert.equal(c.triggerObserved,true);
 assert.equal(c.nativeEditorRetained,true);assert.equal(c.nativeSendRetained,true);assert.equal(c.workerNetworkBlocked,true);
 assert.equal(c.pageFallbackProjection,false);assert.equal(c.sourceChanged,false);assert.equal(c.cleanupOK,true);
 assert.equal(c.packageVerified,true);assert.equal(c.guardClosed,true);
 assert(Number.isFinite(c.observationMs)&&c.observationMs>=1000);
 switch(c.fault){
  case 'auth-failure':assert(c.session401>0);assert.equal(c.privateFrames,0);assert.equal(c.persistedNativeStates,0);break;
  case 'unsafe-reading':assert.equal(c.composerInsideReading,true);assert.equal(c.unsafeWorkspaceMountedBeforeToggle,false);assert.equal(c.unsafeWorkspaceOpenBeforeToggle,false);assert.equal(c.workspaceOpen,false);break;
  case 'forged-scope':assert(c.forgedMessages>0);assert.equal(c.forgedScopePersisted,false);assert.equal(c.legitimateProjection,true);break;
  case 'csp':assert.equal(c.cspPackagePolicy,c.cspProof?.branch);assertCanonicalCspObservation({...c.cspProof,evidence:'ACTUAL_PACKAGED_MV3_CSP_DUAL_BRANCH',fullFAULT:'NOT_ESTABLISHED',fullSYS07:'NOT_ESTABLISHED',realAccount:'NOT_RUN',sourcesStable:!c.sourceChanged,packageVerified:c.packageVerified,cleanupOK:c.cleanupOK,workerNetworkBlocked:c.workerNetworkBlocked,pagePolicyUnchanged:c.pagePolicyUnchanged,frameSourceNone:c.frameSourceNone,mainProbePolicyViolations:c.mainProbePolicyViolations,mainProbeRequests:c.mainProbeRequests,packageFramePolicyViolations:c.packageFramePolicyViolations,loadedPrivateFrames:c.privateFrames,observationMs:c.observationMs});break;
  case 'iframe-destroy':assert(c.removedOwnedFrames>0);assert.equal(c.privateFrames,0);assert.equal(c.staleGrantRevocation,'NOT_ESTABLISHED_NO_PRIOR_JOIN');break;
  case 'stale-response':assert.equal(c.heldNativeRoute,true);assert.equal(c.freshRouteBeforeRelease,true);assert.equal(c.releasedResponses,1);assert.equal(c.lateNativeRouteReplacedCurrent,true);assert.equal(c.projectionMatchesActualNativeRoute,true);assert.equal(c.oldWorkerEpochRejection,'NOT_ESTABLISHED_NATIVE_ROUTE_FIXTURE');break;
  default:
   assert.equal(c.fixture?.faultNativeBody,true);assert.deepEqual(c.nativeMessageIds,['msg-self']);assert.equal(c.metadataReadEnabled,true);assert(c.nativeMetadataResponses>0);assert(c.workerMetadataResponses>0);assert.equal(c.calibrationTerminal,'unavailable');
   assert(c.workerMetadataResponses<=3);assert.equal(c.workerRequestsStableAfterTerminal,true);
   if(c.fault==='rate-limit')assert.equal(c.metadataStatus,429);
   if(c.fault==='corrupt')assert.equal(c.invalidJSON,true);
   if(c.fault==='unknown-protocol')assert.equal(c.unknownSchema,true);
 }
 return true;
}
export function assertFaultPackageReport(r){
 assert.equal(r.evidence,'ACTUAL_PACKAGED_MV3_DESIGNATED_FAULT_OBSERVATIONS');assert.equal(r.status,'PASS_NARROW_PACKAGED_FAULT_OBSERVATIONS');assert.equal(r.realChatGPT,'NOT_RUN');assert.equal(r.fullFAULT,'NOT_ESTABLISHED');
 assert.deepEqual(r.results.map(c=>c.fault),r.requestedCases);assert(r.requestedCases.length>0);assert.equal(new Set(r.requestedCases).size,r.requestedCases.length);
 r.results.forEach(c=>{assert.equal(c.status,'PASS_NARROW_OBSERVATION');assertFaultObservation(c);});return true;
}
