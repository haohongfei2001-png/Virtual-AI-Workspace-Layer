import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditHostScaleIndex} from './fixtures/host-scale-audit.mjs';
const id=i=>'60000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),pid='g-p-00000000000000000000000000000001';
function reader({count=1000,membership=null,change=false,duplicate=false,unexpected=false,dependency=false}={}){
 let versions=0;const calls=[];
 return {calls,version:async()=>++versions>1&&change?8:7,page:async options=>{
  calls.push(options);assert.equal(options.revision,7);assert(options.limit<=5000);assert.deepEqual(Object.keys(options).sort(),['limit','offset','revision']);
  const total=count+1,selectedProjects=options.offset===0?[pid]:[],start=Math.max(0,options.offset-1),end=Math.min(count,options.offset+options.limit-1),selectedRefs=Array.from({length:Math.max(0,end-start)},(_,i)=>id(start+i));
  if(duplicate&&options.offset>0)selectedRefs[0]=id(0);if(unexpected&&end===count)selectedRefs[selectedRefs.length-1]=id(1001);
  return {revision:7,offset:options.offset,total,nextOffset:Math.min(total,options.offset+options.limit),selectedProjects,selectedRefs,facts:{projects:dependency||selectedProjects.length?{[pid]:{id:pid}}:{},refs:Object.fromEntries(selectedRefs.map(id=>[id,{id}])),membership:membership?Object.fromEntries(selectedRefs.map(id=>[id,membership])):{}}};
 }};
}
test('frozen-revision pages prove exact 1k ID set while dependency projects count once',async()=>{
 const source=reader({dependency:true}),report=await auditHostScaleIndex({size:1000,distribution:'project-mixed',limit:250},source);
 assert.equal(report.status,'PASS_INDEX_AUDIT_ONLY');assert.equal(report.distinctRefs,1000);assert.equal(report.distinctProjects,1);assert.equal(report.pages,5);assert.equal(report.unknownMembership,1000);assert.equal(report.nativeNoneObserved,0);assert.equal(report.performanceAcceptance,'NOT_ESTABLISHED');
});
test('native-sized world cannot hide a 25-ref admitted index',async()=>{
 const report=await auditHostScaleIndex({size:1000,distribution:'none-heavy'},reader({count:25}));assert.equal(report.status,'FAIL_INDEX_CARDINALITY');assert.equal(report.missingRefs,975);assert.equal(report.unknownMembership,25);
});
test('same cardinality with foreign IDs or duplicate page entries fails exact-set audit',async()=>{
 for(const options of [{unexpected:true},{duplicate:true}]){const report=await auditHostScaleIndex({size:1000,distribution:'project-mixed'},reader(options));assert.notEqual(report.status,'PASS_INDEX_AUDIT_ONLY');assert(report.unexpectedRefs||report.duplicateRefs);}
});
test('revision changes at final check or during page read are explicitly unstable',async()=>{
 assert.equal((await auditHostScaleIndex({size:1000,distribution:'project-mixed'},reader({change:true}))).status,'UNSTABLE_REVISION');
 const source=reader();source.page=async()=>{throw Error('snapshot-revision-changed');};assert.equal((await auditHostScaleIndex({size:1000,distribution:'project-mixed'},source)).status,'UNSTABLE_REVISION');
});
test('single-project requires every actual member claim and exact project identity',async()=>{
 const input={size:1000,distribution:'single-project',requireProjectMembership:true};
 assert.equal((await auditHostScaleIndex(input,reader())).status,'FAIL_PROJECT_MEMBERSHIP');
 assert.equal((await auditHostScaleIndex(input,reader({membership:{state:'PROJECT',projectId:pid}}))).status,'PASS_INDEX_AUDIT_ONLY');
 assert.equal((await auditHostScaleIndex(input,reader({membership:{state:'PROJECT',projectId:'wrong-project'}}))).status,'FAIL_PROJECT_MEMBERSHIP');
 assert.equal((await auditHostScaleIndex(input,reader({membership:{state:'NONE'}}))).status,'FAIL_PROJECT_MEMBERSHIP');
});
test('invalid paging rejects; browser adapter cannot upgrade schema or open write transactions',async()=>{
 await assert.rejects(auditHostScaleIndex({size:1000,distribution:'single-project',limit:5001},reader()),/invalid-host-scale-audit/);
 const source=await readFile(new URL('./fixtures/host-scale-audit.mjs',import.meta.url),'utf8');assert(source.includes('audit-refuses-write-transaction'));assert(source.includes('audit-refuses-schema-upgrade'));assert(!source.includes('.count('));assert(!source.includes('observationGate:'));assert(!source.includes('hostObservationGate:'));assert(source.includes("database.transaction(names,'readonly')"));
});

test('audit is evaluated only in the current exact extension frame and binds each batched key independently',async()=>{
 const runner=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8'),audit=await readFile(new URL('./fixtures/host-scale-audit.mjs',import.meta.url),'utf8');
 assert(!runner.includes('worker.evaluate'));assert(!runner.includes('serviceWorkers()'));assert(runner.includes('auditFrame.evaluate(auditHostScaleIndex'));
 assert(runner.includes('frame.url()===auditFrameURL&&!frame.isDetached()'));assert(runner.includes('currentAuditFrame()===auditFrame'));
 assert(audit.includes('for(const storedKey of keys)'));assert(audit.includes('store.getAllKeys(range,512)'));assert(audit.includes('IDBKeyRange.lowerBound(keys.at(-1),true)'));assert(audit.includes('store.get(storedKey)'));assert(audit.includes('payload?.scopeKey===storedKey'));assert(!audit.includes('payload?.scopeKey===cursor.key'));
});
