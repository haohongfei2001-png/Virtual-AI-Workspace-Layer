import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {FreeEvidenceRepository,freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {emptyFreeEvidence} from '../../src/data/free-evidence.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {persistentSeed,syntheticEvidenceGate} from '../../simulator/persistent-seed.mjs';
import {digest} from '../../src/data/hash.mjs';
const A=scopeOf('A'),B=scopeOf('B'),now='2026-10-13T12:00:00Z';
const gate=()=>({channel:'synthetic',sourceId:'evidence_fixture',generation:'first'});
function check(value,message='free-evidence-contract-failed'){if(!value)throw Error(message);}
async function rejects(action,part){try{await action();throw Error('expected-rejection');}catch(error){check(error.message.includes(part),error.message);}}
export function evidenceRequest(operationId='observe',expectedRevision=0){
 const witness={sourceId:'evidence_fixture',generation:'first',sourceRevision:1,observedAt:now};
 return {operationId,expectedRevision,batch:{sources:[{id:witness.sourceId,generation:witness.generation,sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',channel:'synthetic'}],events:[{...witness,id:'send',conversationId:'T0',messageId:'m',branchId:'b',actorVerified:true,actorScopeKey:emptyFreeEvidence(A).scopeKey,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:now}],hints:[],coverage:[]}};
}
export async function evidenceHarness(factory){
 const name='free_evidence_'+crypto.randomUUID().replaceAll('-',''),base=new ScopeRepository({indexedDB:factory,databaseName:name});
 const otherBase=new ScopeRepository({indexedDB:factory,databaseName:name});
 await base.open();await otherBase.open();
 const make=baseRepository=>new FreeEvidenceRepository({baseRepository,observationGate:gate,clock:()=>now});
 return {factory,base,otherBase,repo:make(base),other:make(otherBase),close(){base.close();otherBase.close();}};
}
export const freeEvidenceCases=[
 ['same database preserves native and Pro roots; scope isolation persists after reopen',async h=>{
  const native=new NativeRepository({baseRepository:h.base}),legacy=new WorkspaceRepository({baseRepository:h.base,evidenceGate:syntheticEvidenceGate});
  check((await legacy.initialize(A,persistentSeed(A,'https://vaiwl-hf.test'))).ok);const before=digest((await legacy.read(A)).state);
  check((await h.repo.apply(A,evidenceRequest())).ok);h.close();check((await h.repo.read(A)).events.send.sentAt===now);check((await h.repo.read(B)).revision===0);
  check((await native.read(A)).revision===0);check(digest((await legacy.read(A)).state)===before);
 }],
 ['two connections CAS, duplicate receipt and changed replay',async h=>{
  const results=await Promise.all([h.repo.apply(A,evidenceRequest('one')),h.other.apply(A,evidenceRequest('two'))]);
  check(results.filter(r=>r.ok).length===1);check(results.filter(r=>r.reason==='revision-conflict').length===1);
  const winner=results[0].ok?'one':'two';check((await h.other.apply(A,evidenceRequest(winner))).replayed);
  const changed=evidenceRequest(winner);changed.batch.events[0].messageId='different';check((await h.repo.apply(A,changed)).reason==='operation-replay-conflict');
 }],
 ['privileged gate rejects page claims and mismatched source; revocation cannot replay grant',async h=>{
  await rejects(()=>new FreeEvidenceRepository({baseRepository:h.base}).apply(A,evidenceRequest()),'untrusted-free-evidence-source');
  const wrong=evidenceRequest();wrong.batch.events[0].sourceId='other';await rejects(()=>h.repo.apply(A,wrong),'gate-mismatch');
  check((await h.repo.apply(A,evidenceRequest())).ok);check((await h.repo.invalidate(A,{sourceId:'evidence_fixture',operationId:'revoke',expectedRevision:1})).ok);
  h.close();check((await h.repo.read(A)).sources.evidence_fixture.revoked);check((await h.repo.apply(A,evidenceRequest('late',2))).reason==='revoked-free-source-replay');
 }],
 ['abort before publication rolls back both root and receipt',async h=>{
  const controller=new AbortController();let checks=0;const result=await h.repo.apply(A,evidenceRequest(),{signal:controller.signal,guard:()=>{if(++checks===5)controller.abort();return !controller.signal.aborted;}});
  check(!result.ok);check((await h.repo.read(A)).revision===0);check((await h.repo.apply(A,evidenceRequest())).ok);
 }],
 ['missing root with commit marker is corruption, never an empty new account',async h=>{
  check((await h.repo.apply(A,evidenceRequest())).ok);const db=await h.base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');tx.objectStore('native_states').delete(freeEvidenceKey(emptyFreeEvidence(A).scopeKey));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  await rejects(()=>h.repo.read(A),'missing-free-evidence-root');check((await h.repo.apply(A,evidenceRequest('overwrite'))).reason==='missing-free-evidence-root');
 }],
];
export async function runFreeEvidenceContracts(factory=globalThis.indexedDB){
 const results=[];for(const [name,action] of freeEvidenceCases){const h=await evidenceHarness(factory);try{await action(h);results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}finally{h.close();}}
 return results;
}
