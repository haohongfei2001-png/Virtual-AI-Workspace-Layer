/** D when caller supplies native IndexedDB; L when supplied MockIDB.
 * Real HELLO/REFRESH/owner chain with explicit synthetic HTTP/document facts.
 * A test-only pre-apply block models the durable cut, NOT a browser crash.
 */
import {fixture} from './initial-ack-idb-fixture.mjs';
import {digest} from '../../src/data/hash.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const equal=(a,b,m)=>check(digest(a)===digest(b),m);
async function receipt(h,key){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_operations','readonly'),q=tx.objectStore('native_operations').get(key);tx.oncomplete=()=>{try{if(q.result)check(q.result.checksum===digest(q.result.payload),'receipt checksum');resolve(q.result??null);}catch(e){reject(e);}};tx.onabort=()=>reject(tx.error);});}
export function createInitialAckRepairCases(indexedDB){
 return ['unchanged','native-source-revoked','ack-profile-changed'].map(change=>({name:'Initial absent ACK source after unrelated repair: '+change,async run(){
  const cleanup=[],databaseName='initial_ack_repair_'+crypto.randomUUID();let h,restore;
  try{
   h=await fixture({after:f=>cleanup.push(f)},{history:true,storage:indexedDB,databaseName});
   const initial=await h.read();check(Object.values(initial.sources).length===1&&Object.values(initial.sources)[0].codecVersion===2,'only original history source exists');equal(initial.hints,{},'no initial ACK');
   const workspace=(await h.workspace.read(h.scope)).state;
   check((await h.workspace.command(h.scope,{operationId:'initial_ack_human',expectedRevision:workspace.revision,command:{type:'CREATE_WORKSPACE',id:'human_workspace',name:'Preserved human workspace'}})).ok,'human workspace creation');
   const originalApply=h.evidence.applyContinuation.bind(h.evidence);let blocked=0;
   h.evidence.applyContinuation=async()=>{blocked++;return {ok:false,reason:'test-only-before-first-evidence-apply'};};restore=()=>{h.evidence.applyContinuation=originalApply;};
   await h.intent('first_ack_m2');h.add('m2');h.setTime('m2','unavailable');check((await h.observe('Native joint title')).state==='accepted','real owner accepts observation');
   const pendings=await h.service.nativeRepository.listContinuations(h.scope);check(pendings.length===1,'one native pending');const pending=pendings[0];check(pending.state==='pending-evidence'&&pending.format==='vaiwl-native-continuation-v2','joint pending v2');check(blocked===1,'first evidence apply blocked exactly once');
   equal(await h.read(),initial,'no source or ACK persisted before cut');check(initial.sources[pending.admission.sourceId]===undefined,'initial ACK source absent');
   const native=await h.service.nativeRepository.read(h.scope),assets=(await h.workspace.read(h.scope)).state,nativeKey=JSON.stringify([h.scope.key,pending.operationId]),evidenceKey=JSON.stringify([freeEvidenceKey(h.scope.key),pending.evidence.operationId]);
   const originalReceipt=await receipt(h,nativeKey);check(originalReceipt!==null,'durable native receipt');check(await receipt(h,evidenceKey)===null,'no evidence receipt');
   const repaired=await h.recover();check(repaired.sources[pending.admission.sourceId]===undefined,'repair cannot invent never-persisted ACK source');
   equal(await receipt(h,nativeKey),originalReceipt,'repair preserves native pending record values');equal(await h.service.nativeRepository.read(h.scope),native,'repair leaves native witness unchanged');equal((await h.workspace.read(h.scope)).state,assets,'repair preserves human workspace');
   for(const s of Object.values(repaired.sources))check(s.revoked===true,'old history source revoked');
   if(change==='native-source-revoked')check((await h.service.nativeRepository.invalidate(h.scope,{operationId:'initial_ack_native_revoke',expectedRevision:native.revision,sourceId:pending.nativeWitness.sourceId})).ok,'native revocation');
   if(change==='ack-profile-changed')h.ack.revision++;
   const expectedNative=await h.service.nativeRepository.read(h.scope);restore();h.tick(120000);const reads=h.calls.length;await h.restart();
   check(h.calls.length-reads===2,'fresh HELLO/REFRESH performs session/accounts only, not metadata replay');
   const after=await h.read(),terminal=(await receipt(h,nativeKey)).payload.continuation;
   for(const key of ['operationId','nativeRevision','admission','payloadDigest','nativeWitness'])equal(terminal[key],pending[key],'terminal retains '+key);
   if(change==='unchanged'){
    check(terminal.state==='complete','same original pending completes');check(terminal.evidenceOperationId===pending.evidence.operationId,'same evidence operation');
    const original=pending.evidence.batch.hints[0],anchor=after.hints[original.id],source=after.sources[pending.admission.sourceId];
    check(Object.keys(after.hints).length===1,'exactly one original ACK');equal(anchor,{...original,revoked:false},'original anchor including witness and time values');equal(source,{...pending.evidence.batch.sources[0],revoked:false},'source values including original validity');
    check(after.revision===repaired.revision+1,'one evidence CAS');check(await receipt(h,evidenceKey)!==null,'genuine evidence receipt committed');
    for(const [id,row]of Object.entries(repaired.sources))equal(after.sources[id],row,'old source stays revoked');equal(after.events,repaired.events,'old historical events unchanged');
   }else{
    check(terminal.state==='needs-revalidation','changed authority retires pending');check(terminal.reason===(change==='native-source-revoked'?'source-revoked':'profile-changed'),'correct retirement cause');equal(after,repaired,'retirement writes no ACK');check(await receipt(h,evidenceKey)===null,'retirement cannot invent evidence receipt');
   }
   equal(await h.service.nativeRepository.read(h.scope),expectedNative,'drain does not replay native delta');equal((await h.workspace.read(h.scope)).state,assets,'human workspace retained');
   const terminalBefore=await receipt(h,nativeKey);const readCount=h.calls.length;await h.restart();check(h.calls.length-readCount===2,'second fresh authorization only');equal(await h.read(),after,'repeat evidence record identity');equal(await receipt(h,nativeKey),terminalBefore,'repeat terminal record identity');
   return {status:'PASS',case:change,terminal:terminal.state,reason:terminal.reason??null,initialACKSourceAbsent:true,freshGrant:'REAL_HELLO_REFRESH_WITH_SYNTHETIC_FRAME_AND_HTTP',originalAnchorPreserved:change==='unchanged',nativeDeltaReplayed:false,humanWorkspacePreserved:true,refreshGETs:2,metadataGETsOnResume:0,injection:'TEST_ONLY_BLOCK_FIRST_CONTINUATION_APPLY_AND_CHECKSUM_FAULT',coverage:'NATIVE_IDB_IF_BROWSER; NOT_HOST_S_OR_J4'};
  }finally{
   const failures=[];try{restore?.();}catch(error){failures.push(error);}
   for(const fn of cleanup.reverse())try{await fn();}catch(error){failures.push(error);}
   try{await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(databaseName);r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('initial ACK case database cleanup blocked'));});}catch(error){failures.push(error);}
   if(failures.length)throw new AggregateError(failures,'initial ACK case cleanup failed');
  }
 }}));
}
