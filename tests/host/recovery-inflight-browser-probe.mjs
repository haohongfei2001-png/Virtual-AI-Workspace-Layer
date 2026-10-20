import assert from 'node:assert/strict';
import {j2Within} from './j2-runner-bounds.mjs';

/** Isolated fixture only. Hold a real readonly IDB transaction, never authority. */
export async function verifyRecoveryParentClose({page,frame,probe,worker,readStores}){
 const before=await readStores();let released=false;
 try{
 await j2Within('recovery-observer-install',()=>worker.evaluate(url=>{
  const original=IDBObjectStore.prototype.get;
  const state={operationId:null,entered:0,aborted:false,completed:false,parentRemoved:false};
  const message=m=>{if(m?.type==='HOST_UI_RECOVER'&&m.kind==='native')state.operationId=m.operationId;};
  let tabId=null;
  const removed=id=>{if(id===tabId)state.parentRemoved=true;};
  globalThis.recoveryCloseProbe={state,cleanup(){IDBObjectStore.prototype.get=original;chrome.runtime.onMessage.removeListener(message);chrome.tabs.onRemoved.removeListener(removed);}};
  IDBObjectStore.prototype.get=function(key){
   const request=original.call(this,key);
   if(this.name==='native_operations'&&this.transaction.mode==='readwrite'&&typeof key==='string'){
    let pair;try{pair=JSON.parse(key);}catch{}
    if(state.operationId&&Array.isArray(pair)&&pair[1]===state.operationId){
     state.entered++;this.transaction.addEventListener('abort',()=>{state.aborted=true;});
     this.transaction.addEventListener('complete',()=>{state.completed=true;});
    }
   }
   return request;
  };
  chrome.runtime.onMessage.addListener(message);chrome.tabs.onRemoved.addListener(removed);
  return chrome.tabs.query({url}).then(tabs=>{if(tabs.length!==1)throw Error('recovery-parent-not-unique');tabId=tabs[0].id;});
 },page.url()),1500);
  const started=performance.now();
  const remaining=()=>{const value=4000-(performance.now()-started);if(value<=0)throw Error('recovery-inflight-original-boundary-timeout');return value;};
  const bounded=async(stage,task)=>{const value=await j2Within(stage,task,remaining());remaining();return value;};
  await bounded('recovery-barrier-install',()=>probe.evaluate(async()=>{
   const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));
   const base=new ScopeRepository({indexedDB}),db=await base.open();
   const tx=db.transaction(['native_states','native_operations'],'readonly');
   let held=true,expired=false;
   const timer=setTimeout(()=>{expired=true;held=false;},4000);
   const done=new Promise(resolve=>{
    const finish=()=>{clearTimeout(timer);base.close();resolve();};
    tx.addEventListener('complete',finish);tx.addEventListener('abort',finish);
   });
   const keep=()=>{if(!held)return;tx.objectStore('native_states').get('offline-recovery-barrier').onsuccess=keep;};keep();
   globalThis.recoveryReadBarrier={release:async()=>{held=false;await done;return {expired};}};
  }));
  const wait=async predicate=>{
   while(performance.now()-started<4000){
    const state=await bounded('recovery-observation',()=>worker.evaluate(()=>globalThis.recoveryCloseProbe.state));
    if(predicate(state))return state;
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   throw Error('recovery-inflight-original-boundary-timeout');
  };
  await bounded('recovery-click',()=>frame.getByRole('button',{name:'修复项目与聊天索引',exact:true}).click({timeout:remaining()}));
  await wait(s=>s.entered===1); // Actual recover receipt read queued in worker IDB.
  await bounded('recovery-parent-close',()=>page.close());
  await wait(s=>s.parentRemoved);
  const barrier=await bounded('recovery-barrier-release',()=>probe.evaluate(()=>globalThis.recoveryReadBarrier.release()));released=true;
  assert.equal(barrier.expired,false,'parent close must precede barrier deadline');
  const state=await wait(s=>s.aborted||s.completed);
  assert.equal(state.entered,1);assert.equal(state.aborted,true);assert.equal(state.completed,false);
  const after=await readStores();
  assert.deepEqual(after.stores,before.stores,'pre-commit parent loss cannot change any persisted row');
  assert.equal(after.pro,before.pro);
  return {boundary:'REAL_IDB_QUEUED_RECOVERY_BEFORE_FIRST_READ',parentRemoved:true,aborted:true,committed:false,storesUnchanged:true,proUnchanged:true,elapsedMs:performance.now()-started};
 }finally{
  try{if(!released)await j2Within('recovery-barrier-cleanup',()=>probe.evaluate(()=>globalThis.recoveryReadBarrier?.release()),1500);}
  finally{await j2Within('recovery-observer-cleanup',()=>worker.evaluate(()=>{globalThis.recoveryCloseProbe?.cleanup();delete globalThis.recoveryCloseProbe;}),1500);}
 }
}
