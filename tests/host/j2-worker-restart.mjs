import assert from 'node:assert/strict';
/** Runner-only explicit navigation recovery. No authority or clock manipulation. */
export function assertJ2ReloadPrecondition(facts){
 assert.equal(facts.editorCount,1,'J2-reload-requires-one-native-editor');
 assert.equal(facts.draft,'','J2-reload-requires-empty-native-draft');
 assert.equal(facts.selectedFiles,0,'J2-reload-requires-no-selected-files');
}
export async function restartJ2Worker({cdp,poll,within,scriptURL,readPrecondition,reload,record}){
 const versions=[];let stage='enable';
 const listener=event=>{for(const value of event.versions)versions.push({...value});};
 cdp.on('ServiceWorker.workerVersionUpdated',listener);
 try{
  await within('worker-cdp-enable',()=>cdp.send('ServiceWorker.enable'));
  const running=await poll(()=>{
   const latest=new Map();for(const v of versions)latest.set(v.versionId,v);
   const candidates=[...latest.values()].filter(v=>v.scriptURL===scriptURL&&v.runningStatus==='running');
   assert(candidates.length<=1,'ambiguous-running-worker-version');return candidates[0];
  });
  const stopRequestedIndex=versions.length;stage='stop';
  await within('worker-cdp-stop',()=>cdp.send('ServiceWorker.stopWorker',{versionId:running.versionId}));
  const stopped=await poll(()=>{const index=versions.findIndex((v,i)=>i>=stopRequestedIndex&&v.versionId===running.versionId&&v.runningStatus==='stopped');return index<0?null:{index,version:versions[index]};});
  stage='reload-precondition';const precondition=await readPrecondition();assertJ2ReloadPrecondition(precondition);
  stage='native-reload';await reload();
  stage='new-running';const restarted=await poll(()=>{const index=versions.findIndex((v,i)=>i>stopped.index&&v.versionId===running.versionId&&v.scriptURL===scriptURL&&v.runningStatus==='running');return index<0?null:{index,version:versions[index]};});
  const evidence={mode:'EXPLICIT_SAME_CONVERSATION_NATIVE_RELOAD_AFTER_CONFIRMED_STOP',spontaneousRecovery:'NOT_ESTABLISHED',precondition,versionId:running.versionId,stopRequestedIndex,stoppedIndex:stopped.index,restartedIndex:restarted.index,versions};record({...evidence,status:'PASS'});return evidence;
 }catch(error){record({status:'FAIL',stage,versions});throw error;}
 finally{cdp.off('ServiceWorker.workerVersionUpdated',listener);}
}
