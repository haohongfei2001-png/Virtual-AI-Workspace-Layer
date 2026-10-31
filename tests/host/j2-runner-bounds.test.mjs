import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {j2Within,j2Poll,j2ExternalProbe,createJ2Progress,j2EvidenceStatus} from './j2-runner-bounds.mjs';
const never=()=>new Promise(()=>{});
test('poll deadline includes a never-resolving observation',async()=>{
 const start=Date.now();let calls=0;
 await assert.rejects(j2Poll(()=>{calls++;return never();},20),/J2-observation-timeout/);
 assert.equal(calls,1);assert(Date.now()-start<300);
});
test('poll retries ordinary rejected reads within one deadline and returns actual value',async()=>{
 let calls=0;assert.equal(await j2Poll(()=>{if(++calls<3)throw Error('not-ready');return 'ready';},100,{interval:1}),'ready');assert.equal(calls,3);
});
test('one diagnostic deadline does not prevent the next final evidence phase',async()=>{
 const outcomes=[];for(const [stage,fn]of [['stuck',never],['write-evidence',()=>42]])try{outcomes.push(await j2Within(stage,fn,10));}catch(error){outcomes.push(error.message);}
 assert.deepEqual(outcomes,['J2-deadline:stuck',42]);
});
test('late deadline task rejection remains handled',async()=>{
 let reject;const pending=new Promise((_,no)=>{reject=no;});await assert.rejects(j2Within('late',()=>pending,5),/J2-deadline:late/);reject(Error('late-result'));await new Promise(resolve=>setTimeout(resolve,0));
});
test('worker external probe distinguishes actual refusal, success and hung or abort-only transport',async()=>{
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=fetch=>new AsyncFunction('fetch','AbortController','setTimeout','clearTimeout',`return (${j2ExternalProbe.toString()})(10);`)(fetch,AbortController,setTimeout,clearTimeout);
 assert.equal(await run(()=>Promise.reject(Error('CSP'))),'BLOCKED');
 assert.equal(await run(()=>Promise.resolve({ok:true})),'REACHABLE');
 assert.equal(await run(never),'TIMEOUT');
 assert.equal(await run((_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))),'TIMEOUT');
});
test('progress records only validated stage and timestamp in order',async()=>{
 const rows=[],progress=createJ2Progress({append:async row=>rows.push(JSON.parse(row)),now:()=>123});
 await Promise.all([progress('launch'),progress('observe-anchor')]);assert.deepEqual(rows,[{stage:'launch',at:123},{stage:'observe-anchor',at:123}]);
 assert.throws(()=>progress('Bearer secret'),/invalid-j2-progress-stage/);
});
test('failed progress persistence does not poison later progress writes',async()=>{
 let calls=0;const rows=[],progress=createJ2Progress({append:async row=>{if(++calls===1)throw Error('write-failure');rows.push(JSON.parse(row));},now:()=>123});
 await assert.rejects(progress('first'),/write-failure/);await progress('final');assert.deepEqual(rows,[{stage:'final',at:123}]);
});
test('runner keeps original observation and real-clock acceptance waits with bounded teardown',async()=>{
 const source=await readFile(new URL('./j2-package-journey.mjs',import.meta.url),'utf8');
 for(const token of ['timeout=25000','assert.equal(report.steps.length,8)','await sleep(31000)','Date.parse(anchor.calibrationDueAt)','j2ExternalProbe','createJ2Progress','j2Within(stage,fn','failure-dom'])assert(source.includes(token),token);
});
for(const stage of ['source-hashes','context-close','server-close','server-snapshot','report-write'])test('necessary evidence failure cannot retain full PASS: '+stage,()=>{
 const input={status:'PASS_OFFLINE_J2_JOURNEY',sourceChangedDuringRun:false,diagnosticErrors:[{stage,error:'secondary'}]};
 assert.deepEqual(j2EvidenceStatus(input),{status:'INCOMPLETE_EVIDENCE',diagnosticsStatus:'INCOMPLETE'});assert.equal(input.status,'PASS_OFFLINE_J2_JOURNEY','decision does not mutate original evidence');
});
test('missing or changed source verification cannot retain PASS even without a captured exception',()=>{
 for(const value of [undefined,null,'false'])assert.equal(j2EvidenceStatus({status:'PASS_OFFLINE_J2_JOURNEY',sourceChangedDuringRun:value}).status,'INCOMPLETE_EVIDENCE');
 assert.equal(j2EvidenceStatus({status:'PASS_OFFLINE_J2_JOURNEY',sourceChangedDuringRun:true}).status,'SOURCE_CHANGED');
 assert.equal(j2EvidenceStatus({status:'PASS_OFFLINE_J2_JOURNEY',sourceChangedDuringRun:false}).status,'PASS_OFFLINE_J2_JOURNEY');
});
test('ordinary missing trace qualifies diagnostic evidence without fabricating a product failure',()=>{
 assert.deepEqual(j2EvidenceStatus({status:'PASS_OFFLINE_J2_JOURNEY',sourceChangedDuringRun:false,diagnosticErrors:[{stage:'observation-trace',error:'worker stopped'}]}),{status:'PASS_WITH_INCOMPLETE_DIAGNOSTICS',diagnosticsStatus:'INCOMPLETE'});
});
test('secondary evidence failure never overwrites original journey failure or error',()=>{
 const input={status:'FAIL',error:'original assertion',diagnosticErrors:[{stage:'source-hashes',error:'secondary'}]};Object.assign(input,j2EvidenceStatus(input));assert.equal(input.status,'FAIL');assert.equal(input.error,'original assertion');
});
