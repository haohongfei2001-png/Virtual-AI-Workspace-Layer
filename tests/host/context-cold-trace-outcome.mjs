import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const coldTraceNotObserved='BOOTSTRAP_RECEIPT_NOT_OBSERVED';
/** Only the positively evidenced pre-listener diagnostic race, never general timeout acceptance. */
export function assertColdTraceMissingReceipt(r){
 assert.equal(r.startupMode,'COLD_IMMEDIATE_AFTER_LOAD_UNPACKED');
 assert.equal(r.evidence,'REAL_HEADLESS_INSTRUMENTED_PACKAGE_COPY_OFFLINE_C2');
 assert.equal(r.realChatGPT,'NOT_RUN');assert.equal(r.release,'NOT_RELEASE_READY');
 assert.equal(r.instrumentation?.kind,'PASSIVE_OFFLINE_PACKAGE_COPY');assert.equal(r.instrumentation.authorityChanged,false);assert.equal(r.instrumentation.originalPackageUntouched,true);
 assert.equal(r.originalPackageVerification?.status,'OFFLINE_HOST_RECONSTRUCTION');
 assert.equal(r.errorName,'TimeoutError');assert.match(r.error,/page.waitForFunction: Timeout 20000ms exceeded/);assert.match(r.error,/waitMounted/);
 assert.deepEqual(r.results,[]);assert.deepEqual(r.errors,[]);assert.deepEqual(r.diagnosticErrors,[]);
 assert.equal(r.sourceChangedDuringRun,false);assert.equal(r.scriptChangedDuringRun,false);assert.equal(r.inspectionChangedDuringRun,false);assert(!r.cleanupErrors?.length);
 assert.equal(r.failure?.owned,0);assert.equal(r.failure.open,0);assert.equal(r.failure.returns,0);assert.equal(r.failure.nativeReading,true);assert.equal(r.failure.nativeComposer,true);
 assert.equal(r.diagnostics?.coldDropped,0);const trace=r.diagnostics.cold;assert.equal(trace?.length,6);
 assert.deepEqual(trace.map(t=>t.stage),['listeners-registered','incoming','incoming-result','incoming','verify-enter','incoming-result']);
 for(let i=0;i<trace.length;i++){assert.equal(trace[i].seq,i);assert(Number.isFinite(trace[i].at));if(i)assert(trace[i].at>=trace[i-1].at);}
 assert.equal(trace[1].type,'HOST_HELLO');assert.equal(trace[2].type,'HOST_HELLO');assert.equal(trace[2].ok,true);
 assert.equal(trace[3].type,'HOST_REFRESH');assert.equal(trace[4].hasReceipt,false);assert.equal(trace[4].aborted,false);
 assert.equal(trace[5].type,'HOST_REFRESH');assert.equal(trace[5].state,'ambiguous');assert.equal(trace[5].reason,'current-context-unproven');assert.equal(trace[5].ok,true);
 assert.equal(typeof trace[1].documentId,'string');assert(trace[1].documentId.length>0);assert.equal(trace[3].documentId,trace[1].documentId);assert.equal(trace[4].documentId,trace[1].documentId);
 assert.equal(r.requestTimeline?.length,1);const request=r.requestTimeline[0];assert.equal(request.event,'native-request');assert(Number.isFinite(request.at)&&request.at<trace[0].at);
 assert.match(request.path,/^\/backend-api\/conversation\/[0-9a-f-]+$/);assert.equal(r.native?.nativeRequests?.length,1);assert.equal(r.native.nativeRequests[0].path,request.path);assert.equal(r.native.requests[request.path],1);assert.equal(r.native.pendingResponses,0);assert.deepEqual(r.native.actions,{});
 assert.equal(r.native.requests['/api/auth/session']??0,0);assert.equal(r.native.requests['/backend-api/accounts/check/v4-2023-04-27']??0,0);
 const inspection=r.failureInspection,worker=inspection?.worker;
 assert(inspection&&!Object.hasOwn(inspection,'error'));assert(worker&&!Object.hasOwn(worker,'error'));assert.equal(worker.truncated,false);
 const functions=worker.functions;assert(Array.isArray(functions)&&functions.length>0);
 const keys=['documents','requests','closedRequests'],owners=functions.filter(f=>f&&keys.some(k=>Object.hasOwn(f,k)));
 assert(owners.length>0);assert(owners.some(f=>f.active===true));
 for(const owner of owners){assert.equal(owner.active,true);assert(!Object.hasOwn(owner,'error'));assert(keys.every(k=>owner[k]?.size===0&&owner[k]?.truncated===false&&Array.isArray(owner[k]?.rows)&&owner[k].rows.length===0));}

 return {classification:coldTraceNotObserved,packageAcceptance:'NOT_ESTABLISHED',immediateColdSupport:'NOT_ESTABLISHED_BY_DIAGNOSTIC_COPY',missingReceiptSafety:'NO_PRIVATE_SURFACE_NATIVE_PRESENT',originalFailureRetained:true};
}
export function admitColdTraceDiagnostic(r,exitCode){
 if(exitCode===0){assert.equal(r.status,'PASS');assert.equal(r.evidence,'REAL_HEADLESS_INSTRUMENTED_PACKAGE_COPY_OFFLINE_C2');assert.equal(r.sourceChangedDuringRun,false);assert.equal(r.scriptChangedDuringRun,false);assert.equal(r.inspectionChangedDuringRun,false);assert(!r.cleanupErrors?.length);assert.equal(r.realChatGPT,'NOT_RUN');assert.equal(r.release,'NOT_RELEASE_READY');assert.deepEqual(r.errors,[]);assert.equal(r.workerExternalNetworkBlocked,true);assert.equal(r.results?.length,1);assert.equal(r.results[0].name,'C2-native-request-authenticated-roster-second-context-to-native-Free-UI');assert.equal(r.results[0].status,'PASS');assert.equal(r.results[0].scopeCount,1);return;}
 assert.equal(exitCode,2);assert.equal(r.status,coldTraceNotObserved);assert.equal(r.originalFailureStatus,'FAIL');assert.deepEqual(r.diagnosticOutcome,assertColdTraceMissingReceipt(r));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=JSON.parse(await readFile(process.argv[2],'utf8'));admitColdTraceDiagnostic(r,Number(process.argv[3]));}
