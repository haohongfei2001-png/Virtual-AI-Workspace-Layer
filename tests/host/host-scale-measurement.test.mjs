import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {measureAtAdmittedScale} from './fixtures/host-scale-measurement.mjs';
const complete=()=>({status:'PASS_INDEX_AUDIT_ONLY',revision:12,requestedRefs:1000,distinctRefs:1000,distinctProjects:1,missingRefs:0,unexpectedRefs:0,duplicateRefs:0,projectMembership:1000,nativeNoneObserved:0,unknownMembership:0,wrongProjectMembership:0,wrongNoneMembership:0});
test('measurement starts only after complete audit and needs matching post-audit',async()=>{
 const order=[],sample={nativeSearchFirstScreenMs:20};const report=await measureAtAdmittedScale({audit:async()=>{order.push('audit');return complete();},measure:async()=>{order.push('measure');return sample;}});
 assert.deepEqual(order,['audit','measure','audit']);assert.equal(report.status,'MEASURED_AT_STABLE_ADMITTED_INDEX');assert.equal(report.revision,12);assert.equal(report.samples,sample);assert.equal(report.performanceAcceptance,'NOT_ESTABLISHED');
});
test('partial, unstable, missing-index or failed membership audit never starts timers/actions',async()=>{
 for(const status of ['FAIL_INDEX_CARDINALITY','UNSTABLE_REVISION','NOT_RUN_INDEX_ABSENT','FAIL_PROJECT_MEMBERSHIP']){
  let calls=0;const report=await measureAtAdmittedScale({audit:async()=>{calls++;return {...complete(),status};},measure:()=>assert.fail('must not measure before admission')});
  assert.equal(report.status,'NOT_RUN_INDEX_NOT_READY');assert.equal(report.samples,null);assert.equal(calls,1);
 }
});
test('changed revision invalidates even an otherwise identical post-audit',async()=>{
 let calls=0;const report=await measureAtAdmittedScale({audit:async()=>({...complete(),revision:++calls===1?12:13}),measure:async()=>({latency:20})});
 assert.equal(report.status,'INVALIDATED_INDEX_CHANGED');assert.equal(report.samples,null);assert.deepEqual(report.diagnosticSamples,{latency:20});
});
test('changed set cardinality or member distribution also invalidates samples',async()=>{
 for(const changed of [{distinctRefs:999,missingRefs:1},{projectMembership:999,unknownMembership:1},{status:'UNSTABLE_REVISION'}]){
  let calls=0;const report=await measureAtAdmittedScale({audit:async()=>({...complete(),...(++calls===2?changed:{})}),measure:async()=>({latency:20})});assert.equal(report.status,'INVALIDATED_INDEX_CHANGED');assert.equal(report.samples,null);
 }
});
test('measurement action failure still performs post-audit and cannot leave valid timing',async()=>{
 let calls=0;const report=await measureAtAdmittedScale({audit:async()=>{calls++;return complete();},measure:async()=>{throw Error('native target detached');}});
 assert.equal(calls,2);assert.equal(report.status,'FAIL_MEASUREMENT_ACTION');assert.equal(report.samples,null);assert.match(report.error,/native target detached/);
});
test('post-audit failure retains only diagnostic samples',async()=>{
 let calls=0;const report=await measureAtAdmittedScale({audit:async()=>{if(++calls===2)throw Error('frame replaced');return complete();},measure:async()=>({latency:20})});assert.equal(report.status,'INVALIDATED_INDEX_CHANGED');assert.equal(report.after.status,'FAIL_INDEX_AUDIT');assert.equal(report.samples,null);
});
test('runner collects native project membership before gated timing and separates cold ingestion',async()=>{
 const source=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');assert(source.includes('report.ingestion.push('));assert(!source.includes('report.samples.push('));
 assert(source.indexOf('report.nativeProjectMembersRendered=')<source.indexOf('report.measurement=await measureAtAdmittedScale'));
 assert(source.indexOf('report.measurement=await measureAtAdmittedScale')<source.indexOf('const localSearchStarted=performance.now()'));
 assert(source.includes('BEFORE_AND_AFTER_MEASUREMENT_SAME_REVISION_REQUIRED'));assert(!source.includes('worker.evaluate'));
});

test('measured callback is existing Host local search/pagination; native tail navigation is ingestion',async()=>{
 const source=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8'),callback=source.slice(source.indexOf('report.measurement=await measureAtAdmittedScale'),source.indexOf('report.indexAudit=report.measurement'));
 assert(source.indexOf('report.ingestionNativeTailReachability=')<source.indexOf('report.measurement=await measureAtAdmittedScale'));
 for(const forbidden of ['nativeTailLink.click','waitForURL','page.goto','history.pushState','chrome.runtime.sendMessage','tailLink.click'])assert(!callback.includes(forbidden));
 assert(callback.includes('await localSearch.fill(tail.title)'));assert(callback.includes('await next.click()'));assert(callback.includes('返回前页查找结果'));assert(callback.includes('HOST_LOCAL_SEARCH_AND_PAGINATION_SINGLE_SAMPLES_NOT_P95'));assert(callback.includes('assert.equal(page.url(),nativeRouteBeforeMeasurement'));
});

test('runner applies independent native-name oracle to exact tail and both full pages',async()=>{
 const source=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');assert.equal((source.match(/checkHostScaleSearchPage\(\{/g)??[]).length,3);assert(source.includes('excludedIds:firstPage'));assert.equal((source.match(/expectedCount:24/g)??[]).length,2);assert(source.includes("title:node.querySelector('.window-title')?.textContent"));assert(source.includes('NOT_FULL_SEARCH_COVERAGE_OR_ORDER_CERTIFICATION'));
});
