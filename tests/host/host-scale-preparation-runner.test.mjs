import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {measureAtAdmittedScale} from './fixtures/host-scale-measurement.mjs';
const source=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');
const gateStart=source.indexOf("  if((traceEnabled||process.env.FREE_HOST_SCALE_PROGRESS");
const measureStart=source.indexOf('  report.measurement=await measureAtAdmittedScale');
assert(gateStart>=0&&measureStart>gateStart);
const branch=source.slice(gateStart,measureStart);
const complete=revision=>({status:'PASS_INDEX_AUDIT_ONLY',revision,requestedRefs:1000,distinctRefs:1000,distinctProjects:1,missingRefs:0,unexpectedRefs:0,duplicateRefs:0,projectMembership:1000,nativeNoneObserved:0,unknownMembership:0,wrongProjectMembership:0,wrongNoneMembership:0});
async function execute({env={},traceEnabled=false,audits=[complete(12),complete(12)],prepared={ready:true,status:'READY_AFTER_PREPARATION',finalAudit:complete(12)}}={}){
 const calls=[],report={},context={process:{env},traceEnabled,report,page:{},id:'test-extension',Math,
  audit:async()=>{calls.push('audit');assert(audits.length,'unexpected audit');return audits.shift();},
  prepareHostScaleAdmission:async options=>{calls.push('prepare');context.initialAudit=options.initialAudit;assert.equal(options.audit,context.audit);return prepared;},
  hostScaleFailureProgress:()=>assert.fail('preparation stub must not fabricate progress'),
  measureAtAdmittedScale,measure:async()=>{calls.push('measure');return {localExactTailSearchMs:1};}};
 let error;try{await vm.runInNewContext('(async()=>{'+branch+'report.measurement=await measureAtAdmittedScale({audit,measure});})()',context);}catch(value){error=value;}
 return {calls,report,initialAudit:context.initialAudit,error};
}
test('preparation is explicit opt-in and ordinary run retains immediate full measurement gate',async()=>{
 for(const value of [undefined,'0','true']){const result=await execute({env:{FREE_HOST_SCALE_ADMISSION_PREPARE:value}});assert.equal(result.error,undefined);assert.deepEqual(result.calls,['audit','measure','audit']);assert.equal(result.report.immediateIndexAudit,undefined);assert.equal(result.report.admissionPreparation,undefined);assert.equal(result.report.measurement.status,'MEASURED_AT_STABLE_ADMITTED_INDEX');}
});
test('opt-in preserves separate immediate failed audit rather than relabeling it ready',async()=>{
 const initial={...complete(2),status:'FAIL_INDEX_CARDINALITY',distinctRefs:500,missingRefs:500};const result=await execute({env:{FREE_HOST_SCALE_ADMISSION_PREPARE:'1'},audits:[initial,complete(12),complete(12)]});
 assert.equal(result.error,undefined);assert.deepEqual(result.calls,['audit','prepare','audit','measure','audit']);assert.equal(result.report.immediateIndexAudit,initial);assert.equal(result.initialAudit,initial);assert.equal(initial.status,'FAIL_INDEX_CARDINALITY');assert.equal(result.report.admissionPath,'EXPLICIT_BOUNDED_PREPARATION_NOT_IMMEDIATE_INDEX');assert.equal(result.report.measurement.status,'MEASURED_AT_STABLE_ADMITTED_INDEX');
});
test('incomplete preparation emits no samples and never enters measurement',async()=>{
 const initial={...complete(2),status:'FAIL_INDEX_CARDINALITY'},final={...initial,revision:3};for(const finalAudit of [null,final]){const result=await execute({env:{FREE_HOST_SCALE_ADMISSION_PREPARE:'1'},audits:[initial],prepared:{ready:false,status:'TIMED_OUT',finalAudit}});assert.match(result.error?.message??'',/host-scale-admission-preparation-TIMED_OUT/);assert.deepEqual(result.calls,['audit','prepare']);assert.equal(result.report.indexAudit,finalAudit??initial);assert.equal(result.report.measurement.samples,null);assert.equal(result.report.measurement.acceptance,'NOT_ESTABLISHED');}
});
test('each diagnostic mode exits before opt-in preparation and measurement',async()=>{
 for(const mode of ['trace','FREE_HOST_SCALE_PROGRESS','FREE_HOST_SCALE_ADMISSION_OBSERVE']){const result=await execute({traceEnabled:mode==='trace',env:{FREE_HOST_SCALE_ADMISSION_PREPARE:'1',...(mode==='trace'?{}:{[mode]:'1'})},audits:[]});assert.match(result.error?.message??'',/diagnostic-progress-run-cannot-produce-scale-timing/);assert.deepEqual(result.calls,[]);assert.equal(result.report.measurement.samples,null);assert.equal(result.report.measurement.acceptance,'NOT_ESTABLISHED');assert.equal(result.report.admissionPreparation,undefined);}
});
test('prepared readiness cannot bypass fresh admission or stable post-measurement audit',async()=>{
 const initial=complete(2),failed={...complete(12),status:'FAIL_PROJECT_MEMBERSHIP'};
 const denied=await execute({env:{FREE_HOST_SCALE_ADMISSION_PREPARE:'1'},audits:[initial,failed]});assert.deepEqual(denied.calls,['audit','prepare','audit']);assert.equal(denied.report.measurement.samples,null);assert.equal(denied.report.measurement.status,'NOT_RUN_INDEX_NOT_READY');
 const changed=await execute({env:{FREE_HOST_SCALE_ADMISSION_PREPARE:'1'},audits:[initial,complete(12),complete(13)]});assert.deepEqual(changed.calls,['audit','prepare','audit','measure','audit']);assert.equal(changed.report.measurement.status,'INVALIDATED_INDEX_CHANGED');assert.equal(changed.report.measurement.samples,null);
});
test('runner hashes preparation and its audit dependencies before and after execution',()=>{
 const array=source.match(/const sourceFiles=(\[[^;]+\]);/)?.[1];assert(array);const files=vm.runInNewContext(array);for(const path of ['host-scale-package-browser.mjs','fixtures/host-scale-admission-preparation.mjs','fixtures/host-scale-admission-observation.mjs','fixtures/host-scale-audit.mjs','fixtures/host-scale-measurement.mjs'])assert(files.includes(path),path);
 assert(source.includes('report.fixtureSourceHashes=Object.fromEntries'));assert(source.includes('Object.entries(report.fixtureSourceHashes)'));assert(source.includes('report.sourceChangedDuringRun||report.fixtureChangedDuringRun||report.manifestChangedDuringRun'));assert(source.includes("report.status='SOURCE_CHANGED'"));
 const gate=source.slice(measureStart);assert(gate.includes("assert.equal(report.measurement.status,'MEASURED_AT_STABLE_ADMITTED_INDEX'"));assert(gate.includes("report.status='PARTIAL_SYS04_NOT_ACCEPTED'"));
});
