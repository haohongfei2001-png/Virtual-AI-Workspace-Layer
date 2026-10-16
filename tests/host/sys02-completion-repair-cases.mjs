/** Portable SYS02 cases. Caller supplies IndexedDB; explicit offline owner
 * authority is provided by the existing joint fixture. Transaction abort is
 * injected after a successful put, not a physical quota/crash simulation. */
import {createJointObservationFixture} from './joint-observation-fixture.mjs';
import {freeRecoveryStatus} from '../../src/data/free-recovery-status.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {digest} from '../../src/data/hash.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const equal=(a,b,message)=>check(digest(a)===digest(b),message);
async function row(h,store,key){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),request=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(request.result??null);tx.onabort=()=>reject(tx.error);});}
async function abortNextWrite(h){
 const db=await h.base.open(),original=db.transaction.bind(db);let fired=0;
 db.transaction=(...args)=>{const tx=original(...args);if(args[1]!=='readwrite'||fired)return tx;const objectStore=tx.objectStore.bind(tx);
  tx.objectStore=name=>{const store=objectStore(name),put=store.put.bind(store);store.put=value=>{const request=put(value);if(!fired){fired++;db.transaction=original;const abort=()=>tx.abort();if(request.addEventListener)request.addEventListener('success',abort,{once:true});else request.onsuccess=abort;}return request;};return store;};return tx;
 };
 return {fired:()=>fired,restore:()=>{db.transaction=original;}};
}
async function corruptEvidenceChecksum(h){const db=await h.base.open(),key=freeEvidenceKey(h.scope.key),before=await row(h,'native_states',key);check(before,'root exists before fault');await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states');store.put({...before,checksum:'completion-repair-checksum-fault'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});const after=await row(h,'native_states',key);equal(after.payload,before.payload,'fault must not alter evidence payload');check(after.checksum!==before.checksum,'fault must change checksum');}
export function createSys02CompletionRepairCases(indexedDB){
 return [false,true].map(repair=>({name:'SYS02 completion abort then '+(repair?'Evidence repair retires pending despite durable receipt':'ordinary restart completes exactly once'),async run(){
  const cleanup=[];const h=await createJointObservationFixture({indexedDB,after:fn=>cleanup.push(fn)});let injection;
  try{
   const other=normalizedScope({verified:true,provider:'chatgpt',accountId:'other_principal',organizationId:'other_context'});
   const workspace=new WorkspaceRepository({baseRepository:h.base});
   const workspaceBefore=await workspace.read(h.scope);
   // Same shared repository and schema as the actual owner fixture.
   check((await workspace.command(h.scope,{operationId:'completion_human_asset',expectedRevision:workspaceBefore.state.revision,command:{type:'CREATE_WORKSPACE',id:'human_workspace',name:'Human preserved workspace'}})).ok,'human asset setup');
   const humanWorkspace=(await workspace.read(h.scope)).state.workspaces.human_workspace;
   const otherBefore={native:await h.native.read(other),evidence:await h.free.read(other)};
   h.disableDrain();check((await h.ingest(h.surface())).state==='accepted','joint observation accepted');
   const pending=await h.native.listContinuations(h.scope);check(pending.length===1&&pending[0].state==='pending-evidence','genuine pending v2 exists');const original=pending[0];
   const complete=h.native.markContinuationComplete.bind(h.native);
   h.native.markContinuationComplete=async(...args)=>{injection=await abortNextWrite(h);return complete(...args);};
   const cut=await h.recover();check(cut.state==='pending','completion cut remains pending');check(injection?.fired()===1,'actual write abort must fire');injection.restore();h.native.markContinuationComplete=complete;
   equal(await h.native.listContinuations(h.scope),pending,'completion abort preserves original continuation');
   const committed=await h.free.read(h.scope),nativeBefore=await h.native.read(h.scope),assets=(await workspace.read(h.scope)).state;
   equal(assets.workspaces.human_workspace,humanWorkspace,'native ingest preserves human workspace');
   check(committed.revision===1,'Evidence committed before completion interruption');check(Object.keys(committed.hints).length===1,'one committed ACK anchor');
   for(const [key,value]of Object.entries(original.evidence.batch.hints[0]))equal(Object.values(committed.hints)[0][key],value,'original anchor field committed: '+key);
   const receiptKey=JSON.stringify([freeEvidenceKey(h.scope.key),original.evidence.operationId]),receipt=await row(h,'native_operations',receiptKey);
   check(receipt?.payload.kind==='OBSERVE_HOST_CONTINUATION','real continuation receipt persisted');check(receipt.checksum===digest(receipt.payload),'receipt checksum valid');
   let restored=committed;
   if(repair){await corruptEvidenceChecksum(h);const status=await freeRecoveryStatus(h.free,h.scope,'evidence');check(status.recoverable===true,'checksum repair is available');check((await h.free.recover(h.scope,{operationId:'completion_evidence_repair',damagedHash:status.damagedHash})).ok,'actual Evidence repair succeeds');restored=await h.free.read(h.scope);check(restored.sources[original.admission.sourceId].revoked===true,'repair revokes the committed ACK source');for(const table of ['events','hints','coverage'])equal(restored[table],committed[table],'repair retains old '+table+' bytes');}
   equal(await h.native.read(h.scope),nativeBefore,'repair does not change native witness');equal(await row(h,'native_operations',receiptKey),receipt,'repair preserves prior receipt bytes');equal(await h.native.listContinuations(h.scope),pending,'repair cannot complete pending');
   h.base.close();const resumed=await h.recover();check(resumed.state===(repair?'needs-revalidation':'complete'),'fresh owner terminal result');if(repair)check(resumed.reason==='source-revoked','retirement identifies revoked ACK source, not changed native witness');
   equal(await h.free.read(h.scope),restored,'receipt cannot replay or mutate Evidence');equal(await h.native.read(h.scope),nativeBefore,'completion bookkeeping leaves native facts intact');
   const operation=await row(h,'native_operations',JSON.stringify([h.scope.key,original.operationId])),terminal=operation.payload.continuation;
   check(terminal.state===(repair?'needs-revalidation':'complete'),'durable terminal state');for(const key of ['operationId','payloadDigest','nativeWitness','admission'])equal(terminal[key],original[key],'terminal preserves '+key);check(terminal.evidence===undefined,'terminal retires replay payload');
   if(repair){check(terminal.reason==='source-revoked','durable retirement reason');equal(terminal.targets,['C'],'target remains reachable for revalidation');}
   check((await h.recover()).state==='idle','second drain does not replay terminal');equal(await h.free.read(h.scope),restored,'repeat drain unchanged');equal(await row(h,'native_operations',receiptKey),receipt,'old receipt not rewritten');
   equal((await workspace.read(h.scope)).state,assets,'human asset state unchanged');equal({native:await h.native.read(other),evidence:await h.free.read(other)},otherBefore,'other scope isolated');
   return {status:'PASS',repair,transactionAbortCount:injection.fired(),terminal:terminal.state,reason:terminal.reason??null,authority:'EXPLICIT_OFFLINE_FIXTURE',physicalCrash:'NOT_TESTED'};
  }finally{injection?.restore();for(const fn of cleanup.reverse())await fn();}
 }}));
}
