import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf} from '../../simulator/data.mjs';
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};}
async function harness(read=async()=>({status:'unsupported'})){
 let frame={documentId:'entry_document',documentLifecycle:'active',url:'https://vaiwl-hf.test/hf/A/c/T0'},seq=0,leaseId;const calls=[];
 const sender={id:'entry_extension',tab:{id:1},frameId:0,...frame};
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:sender.id,getFrame:async()=>frame,calibrationSourceFor:()=>({channel:'synthetic',read:input=>{calls.push(input);return read(input);}})});
 const send=(type,extra={})=>service.broker.handle({v:1,type,clientId:'entry_client',seq:++seq,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 const bind=async()=>{const bound=await send('BIND');assert.equal(bound.ok,true);leaseId=bound.leaseId;};
 await bind();assert.equal((await send('B23_FREE_HEADER')).ok,true);await service.runtime.bindings.get(leaseId).foregroundCalibration;
 return {service,calls,send,bind,entry:()=>service.runtime.bindings.get(leaseId),changeAccount:account=>frame={...frame,url:`https://vaiwl-hf.test/hf/${account}/c/T0`},calibrate:(kind,objectIds,extra={})=>send('B23_FREE_CALIBRATE',{kind,objectIds,...extra}),settle:async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));await service.runtime.bindings.get(leaseId)?.runtime?.calibration.running;},close:()=>service.close()};
}
test('same binding foreground entry recalibrates after first HEADER, while subsequent HEADER stays read-only',async()=>{
 const h=await harness();try{assert.equal(h.calls.length,1);assert.equal((await h.send('B23_FREE_HEADER')).ok,true);await h.settle();assert.equal(h.calls.length,1);
  assert.equal((await h.calibrate('foreground',['inventory'])).status,'scheduled');await h.settle();assert.equal(h.calls.length,2);assert.equal(h.calls[1].trigger,'recent');assert.equal(h.calls[1].objectId,'inventory');
 }finally{h.close();}
});
test('history entry preserves requested native IDs and coalesces identical rapid repeats',async()=>{
 const h=await harness();try{const ids=['T42','T43','T42'];assert.equal((await h.calibrate('history',ids)).status,'scheduled');assert.equal((await h.calibrate('history',ids)).status,'coalesced');await h.settle();assert.deepEqual(h.calls.filter(c=>c.trigger==='history').map(c=>c.objectId),['T42','T43']);
  assert.equal((await h.calibrate('current',['T44'])).status,'scheduled');await h.settle();assert.equal(h.calls.at(-1).objectId,'T44');assert.equal(h.calls.at(-1).trigger,'current');
 }finally{h.close();}
});
test('entry envelope rejects injected authority, unsupported trigger, empty/overlarge IDs and malformed tokens',async()=>{
 const h=await harness();try{const variants=[['history',['T1'],{scope:scopeOf('B')}],['history',['T1'],{source:{channel:'synthetic'}}],['expiry',['T1'],{}],['history',[],{}],['history',Array.from({length:65},(_,i)=>'T'+i),{}],['history',['bad id'],{}]];
  for(const [kind,ids,extra] of variants)assert.equal((await h.calibrate(kind,ids,extra)).reason,'invalid-request');await h.settle();assert.equal(h.calls.length,1);
 }finally{h.close();}
});
test('changed account rejects old lease entry; newly bound scope obtains its own targets',async()=>{
 const h=await harness();try{h.changeAccount('B');assert.equal((await h.calibrate('history',['T1'])).ok,false);assert.equal(h.calls.length,1);await h.bind();assert.equal((await h.calibrate('history',['T2'])).status,'scheduled');await h.settle();assert.equal(h.calls.at(-1).scope.accountId,'B');assert.equal(h.calls.at(-1).objectId,'T2');}finally{h.close();}
});
test('silent account switch cancels late entry source result before persistent write or change publication',async()=>{
 const started=deferred(),reply=deferred();const h=await harness(input=>input.trigger==='history'?(started.resolve(),reply.promise):{status:'unsupported'});const notices=[];h.service.subscribe(x=>notices.push(x));
 try{assert.equal((await h.calibrate('history',['T7'])).status,'scheduled');await started.promise;const entry=h.entry(),running=entry.runtime.calibration.running;h.changeAccount('B');reply.resolve({evidenceBatch:{sources:[],events:[],hints:[],coverage:[]}});await running;
  assert.equal((await h.service.evidence.read(scopeOf('A'))).revision,0);assert.equal(entry.controller.signal.aborted,true);assert.deepEqual(notices,[]);
 }finally{h.close();}
});

test('rapid different history ranges retain new IDs rather than dropping the second entry',async()=>{
 const h=await harness();try{
  assert.equal((await h.calibrate('history',['T50','T51'])).status,'scheduled');await h.settle();
  assert.equal((await h.calibrate('history',['T51','T52'])).status,'scheduled');await h.settle();
  assert.deepEqual(h.calls.filter(c=>c.trigger==='history').map(c=>c.objectId),['T50','T51','T52']);
 }finally{h.close();}
});
