import test from 'node:test';
import assert from 'node:assert/strict';
import {createJ2LifecycleDiagnostics} from './j2-lifecycle-diagnostics.mjs';

const never=()=>new Promise(()=>{}),extensionId='fixture-extension';
async function boundedCheckpoint(diagnostics,label){
 let timer;
 try{
  const result=await Promise.race([diagnostics.checkpoint(label).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),150);})]);
  assert.equal(result,true,'passive diagnostics must settle within their own deadline so final evidence can be written');
 }finally{clearTimeout(timer);}
}
function fixture(kind){
 let workerCalls=0,pageCalls=0;
 const worker={url:()=>`chrome-extension://${extensionId}/extension/worker.mjs`,evaluate:()=>{
  workerCalls++;
  if(kind==='worker-install'||kind==='worker-trace'&&workerCalls>1)return never();
  return Promise.resolve([]);
 }};
 const context={on(){},off(){},serviceWorkers:()=>[worker]};
 const page={frames:()=>[],evaluate:()=>{pageCalls++;return kind==='page'?never():Promise.resolve({url:'/c/fixture'});}};
 const diagnostics=createJ2LifecycleDiagnostics({context,page,extensionId,timeoutMs:10});
 return {diagnostics,counts:()=>({workerCalls,pageCalls})};
}
for(const kind of ['worker-install','worker-trace','page'])test('never-resolving '+kind+' diagnostics cannot block checkpoint or final evidence',async t=>{
 const f=fixture(kind);t.after(()=>f.diagnostics.stop());
 await boundedCheckpoint(f.diagnostics,'before-final');
 await boundedCheckpoint(f.diagnostics,'final');
 const summary=f.diagnostics.summary();
 assert.equal(summary.status,'INCOMPLETE');assert(summary.errors.length>0);
 assert.deepEqual(summary.snapshots.map(row=>row.label),['before-final','final']);
 assert.doesNotThrow(()=>JSON.stringify({status:'FAIL_PRODUCT_OR_UNKNOWN',lifecycle:summary}));
 assert(f.counts().workerCalls>0);assert(f.counts().pageCalls>0,'worker timeout must leave independent page diagnostics reachable');
});
