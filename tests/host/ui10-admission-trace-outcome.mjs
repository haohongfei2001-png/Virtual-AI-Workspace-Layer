import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {UI10_ADMISSION_TRACE_KIND,UI10_ADMISSION_TRACE_PATHS} from './ui10-admission-trace.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
/** Start no diagnostic for a late, unrelated, unstable or unfinished failure. */
export function eligibleUi10AdmissionFailure(r,sha){
 const p=r?.failureProgress;
 return /^[a-f0-9]{40}$/.test(sha??'')&&r?.sourceCommit===sha&&r.kind==='PACKAGED_MV3_NATIVE_UI10_POPULATED_RECONSTRUCTION'&&r.status==='FAIL_OR_BLOCKED'&&r.finalized===true&&r.fixtureStable===true&&r.productSourceStable===true&&r.realChatGPT==='NOT_RUN'&&r.packageVerification?.status==='OFFLINE_HOST_RECONSTRUCTION'&&p?.phase==='evidence-admission'&&p.timedOut===false&&p.deadlineMs===1320000&&Number.isInteger(p.index)&&p.index>=0&&p.index<5&&Number.isFinite(p.elapsedMs)&&p.elapsedMs>=0&&p.elapsedMs<180000&&r.visits?.length===p.index&&Array.isArray(r.checks)&&r.checks.length===0&&typeof r.error==='string'&&r.error.startsWith('Error: ui10-admission-deadline:60000000-0000-4000-8000-00000000000'+p.index+'\n');
}
export function assertUi10AdmissionTraceOutcome(r,{exitCode,sourceCommit}={}){
 assert.equal(exitCode,2);assert.match(sourceCommit??'',/^[a-f0-9]{40}$/);assert.equal(r.sourceCommit,sourceCommit);assert.equal(r.kind,UI10_ADMISSION_TRACE_KIND);assert.equal(r.status,'DIAGNOSTIC_ONLY');assert.equal(r.diagnosticOnly,true);assert.equal(r.acceptance,'NOT_ESTABLISHED');assert.equal(r.formalReportSuperseded,false);assert.equal(r.realChatGPT,'NOT_RUN');assert.equal(r.fullV27Acceptance,'NOT_ESTABLISHED');assert.equal(r.visitLimit,5);assert(r.visits.length<=5);assert.equal(r.checks.length,0);assert.equal(r.finalized,true);assert.equal(r.progress.deadlineMs,165000);assert.equal(r.progress.timedOut,false);assert.equal(r.cleanupOK,true);assert.equal(r.fixtureStable,true);assert.equal(r.productSourceStable,true);assert.equal(r.tracePackageVerified,true);assert.equal(r.packageVerification.status,'OFFLINE_HOST_RECONSTRUCTION');
 assert(['BOUND_REACHED','OBSERVED_FAILURE'].includes(r.diagnosticOutcome));if(r.diagnosticOutcome==='BOUND_REACHED')assert.equal(r.visits.length,5);else assert(r.visits.length<5);
 const t=r.workerTrace;assert.equal(t?.kind,UI10_ADMISSION_TRACE_KIND);assert(Array.isArray(t.events)&&t.events.length>0&&t.events.length<=512);assert(Number.isSafeInteger(t.dropped)&&t.dropped>=0);assert.equal(typeof t.proofOverflow,'boolean');assert(Number.isFinite(t.timeOrigin));
 assert.equal(r.tracePackage.kind,UI10_ADMISSION_TRACE_KIND);assert.equal(r.tracePackage.limit,512);assert.deepEqual(r.tracePackage.changes.map(c=>c.path).sort(),[...UI10_ADMISSION_TRACE_PATHS,'extension/worker.mjs','extension/classic-runtime.js'].sort());for(const c of r.tracePackage.changes){assert.match(c.originalSha256,/^[a-f0-9]{64}$/);assert.match(c.instrumentedSha256,/^[a-f0-9]{64}$/);}
 return {status:'DIAGNOSTIC_ONLY',acceptance:'NOT_ESTABLISHED',formalReportSuperseded:false,outcome:r.diagnosticOutcome,traceTruncated:t.dropped>0||t.proofOverflow};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,path,sha,other,exit]=process.argv.slice(2),bytes=await readFile(path),r=JSON.parse(bytes);
 if(mode==='eligible'){if(!eligibleUi10AdmissionFailure(r,sha)){console.log('No early admission diagnostic: formal result is ineligible.');process.exitCode=3;}else{await writeFile(other,JSON.stringify({sha256:hash(bytes),sourceCommit:sha}));console.log('One bounded copy-only diagnostic permitted; formal failure retained.');}}
 else if(mode==='verify'){const original=await readFile(other),receipt=JSON.parse(await readFile(other+'.trace-binding'));assert.equal(receipt.sourceCommit,sha);assert.equal(receipt.sha256,hash(original));assert(eligibleUi10AdmissionFailure(JSON.parse(original),sha));console.log(JSON.stringify(assertUi10AdmissionTraceOutcome(r,{exitCode:Number(exit),sourceCommit:sha})));}
 else throw Error('ui10-trace-outcome-mode');
}
