import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {FIXTURE_NOW} from '../../simulator/data.mjs';
test('Delayed MV3-style notification refresh does not request another calibration; explicit send still can',{timeout:5000},async()=>{
 let calls=0,seq=0,leaseId,notifications=0,complete;const refreshed=new Promise(r=>complete=r);
 const frame={documentId:'loop_document',documentLifecycle:'active',url:'https://vaiwl-hf.test/hf/A/c/T0'},sender={id:'loop_extension',tab:{id:1},frameId:0,...frame};
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:sender.id,getFrame:async()=>frame,calibrationSourceFor:()=>({channel:'synthetic',read:async()=>({evidenceBatch:{sources:[{id:'free_fixture_sends',generation:'fixture_v1',channel:'synthetic',sourceRevision:++calls,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z'}],events:[],hints:[],coverage:[]}})})});
 const send=type=>service.broker.handle({v:1,type,clientId:'loop_client',seq:++seq,...(type==='BIND'?{}:{leaseId})},sender);
 try{
  leaseId=(await send('BIND')).leaseId;
  const unsubscribe=service.subscribe(message=>{notifications++;if(notifications===1)setTimeout(async()=>{try{const target=await service.broker.notificationTarget(message.leaseId);assert.equal(target.documentId,frame.documentId);complete(await send('B23_FREE_HEADER'));}catch(e){complete({ok:false,reason:e.message});}},1);});
  assert.equal((await send('B23_FREE_HEADER')).ok,true);assert.equal((await refreshed).ok,true);
  await service.runtime.bindings.get(leaseId).runtime.calibration.running;
  assert.equal(calls,1,'durable page reread is not a calibration trigger');assert.equal(notifications,1);
  unsubscribe();await service.runtime.notify(leaseId,'send',{objectIds:['T0']});assert.equal(calls,2,'explicit send still calibrates');
  service.broker.invalidate({tabId:1});assert.equal(await service.broker.notificationTarget(leaseId),null,'revoked lease cannot receive a queued update');
 }finally{service.close();}
});
