import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {historicalSource,OLD_HOST_COMMIT} from './historical-package.mjs';
import {createJointObservationFixture} from './joint-observation-fixture.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {digest} from '../../src/data/hash.mjs';
import {validateNativeContinuation} from '../../src/data/native-observation-continuation.mjs';
async function databaseContents(base){const db=await base.open(),names=[...db.objectStoreNames];return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readonly'),contents={};for(const name of names){contents[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const cursor=q.result;if(cursor){contents[name].push({key:cursor.key,value:cursor.value});cursor.continue();}};}tx.oncomplete=()=>resolve(contents);tx.onabort=()=>reject(tx.error);});}
// L/D only: exact archived product modules and current production owner/repositories,
// using MockIDB. No installed-extension downgrade, browser durability or MV3 claim.
for(const afterEvidence of [false,true])test('SYS03 L/D actual archived Host v1 rejects v2 '+(afterEvidence?'after committed Evidence before completion':'before Evidence')+' without mutating storage',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'vaiwl-sys03-archived-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const archived=join(directory,'source'),receipt=await historicalSource(fileURLToPath(new URL('../..',import.meta.url)),OLD_HOST_COMMIT,archived);
 assert.equal(receipt.commit,OLD_HOST_COMMIT);assert.match(receipt.archiveHash,/^[a-f0-9]{64}$/);
 const [{validateNativeContinuation:validateArchived},{NativeRepository:ArchivedNativeRepository}]=await Promise.all(['src/data/native-observation-continuation.mjs','src/data/native-repository.mjs'].map(path=>import(pathToFileURL(join(archived,path)).href)));
 const h=await createJointObservationFixture({indexedDB:new MockIDBFactory(),after:fn=>t.after(fn)});h.disableDrain();assert.equal((await h.ingest(h.surface())).state,'accepted');
 const pending=await h.native.listContinuations(h.scope);assert.equal(pending.length,1);assert.equal(pending[0].format,'vaiwl-native-continuation-v2');assert.equal(pending[0].state,'pending-evidence');assert.equal(validateNativeContinuation(pending[0],h.scope),pending[0]);
 if(afterEvidence){
  const complete=h.native.markContinuationComplete.bind(h.native);h.native.markContinuationComplete=async()=>{throw Error('TEST_ONLY_COMPLETION_INTERRUPTED');};
  try{assert.equal((await h.recover()).state,'pending');}finally{h.native.markContinuationComplete=complete;}
  assert.deepEqual(await h.native.listContinuations(h.scope),pending,'completion interruption preserves exact original v2 pending');
 }
 const evidenceBefore=await h.free.read(h.scope);assert.equal(evidenceBefore.revision,afterEvidence?1:0);assert.equal(Object.keys(evidenceBefore.hints).length,afterEvidence?1:0);
 const before=await databaseContents(h.base),copy=structuredClone(pending[0]),old=new ArchivedNativeRepository({baseRepository:h.base});
 const receiptKey=JSON.stringify([freeEvidenceKey(h.scope.key),pending[0].evidence.operationId]),evidenceReceipt=before.native_operations.find(row=>row.key===receiptKey)?.value;
 if(afterEvidence){assert(evidenceReceipt,'real evidence operation receipt persisted');assert.equal(evidenceReceipt.payload.kind,'OBSERVE_HOST_CONTINUATION');assert.equal(evidenceReceipt.checksum,digest(evidenceReceipt.payload));}else assert.equal(evidenceReceipt,undefined);
 assert.throws(()=>validateArchived(copy,h.scope),/invalid-native-continuation/);assert.deepEqual(copy,pending[0],'old codec cannot rewrite caller pending data');
 await assert.rejects(old.listContinuations(h.scope),/invalid-native-continuation/);
 assert.deepEqual(await databaseContents(h.base),before,'all durable tables unchanged after actual old reader refusal');
 assert.deepEqual(await h.native.listContinuations(h.scope),pending,'current reader still sees original authenticated v2 witnesses');
 assert.deepEqual(await h.free.read(h.scope),evidenceBefore,'failed old list cannot apply or revoke committed evidence');
 // These are actual archived readwrite entry points, not validation-only calls.
 // Explicit offline guard permits reaching the codec check; it grants no live authority.
 const terminalInput={operationId:pending[0].operationId,expectedPayloadDigest:pending[0].payloadDigest};
 for(const method of ['markContinuationComplete','markContinuationNeedsRevalidation']){
  const input={...terminalInput,...(method==='markContinuationComplete'?{evidenceRevision:afterEvidence?evidenceBefore.revision:1}:{})},originalInput=structuredClone(input);
  assert.deepEqual(await old[method](h.scope,input,{guard:()=>true}),{ok:false,reason:'invalid-native-continuation-schema'},method+' refuses the actual v2 pending record');
  assert.deepEqual(input,originalInput,method+' preserves caller input');
  const after=await databaseContents(h.base);
  assert.deepEqual(after,before,method+' leaves every durable table unchanged');
  assert.equal(JSON.stringify(after),JSON.stringify(before),method+' preserves serialized stored values');
  assert.deepEqual(after.native_operations.find(row=>row.key===receiptKey)?.value,evidenceReceipt,method+' preserves the original evidence receipt or its absence');
  assert.deepEqual(await h.native.listContinuations(h.scope),pending,method+' leaves the original v2 witnesses recoverable');
  assert.deepEqual(await h.free.read(h.scope),evidenceBefore,method+' cannot apply or revoke evidence');
 }
 h.base.close();assert.equal((await h.recover()).state,'complete');assert.deepEqual(await h.native.listContinuations(h.scope),[]);
 const evidence=await h.free.read(h.scope);
 if(afterEvidence){assert.deepEqual(evidence,evidenceBefore,'current recovery reuses durable evidence without another revision or anchor');const after=await databaseContents(h.base);assert.deepEqual(after.native_operations.find(row=>row.key===receiptKey)?.value,evidenceReceipt,'current completion preserves exact prior evidence receipt');}assert.equal(evidence.revision,1);assert.equal(Object.keys(evidence.hints).length,1);
 const expected=pending[0].evidence.batch.hints[0],actual=Object.values(evidence.hints)[0];for(const [key,value]of Object.entries(expected))assert.deepEqual(actual[key],value,'recovered anchor '+key);
 assert.equal((await h.recover()).state,'idle');assert.deepEqual(await h.free.read(h.scope),evidence,'current recovery remains exactly once');
 t.diagnostic(JSON.stringify({evidence:'L_D_ARCHIVED_MODULE_MOCK_IDB',afterEvidence,evidenceReceiptReused:afterEvidence,historicalCommit:receipt.commit,archiveHash:receipt.archiveHash,historicalValidator:'REJECTED_V2',historicalRepository:'REJECTED_V2',historicalTerminalWriters:{markContinuationComplete:'REJECTED_V2',markContinuationNeedsRevalidation:'REJECTED_V2'},allHistoricalWriters:'NOT_ESTABLISHED',storageUnchanged:true,currentRecovery:'COMPLETE_ONCE',actualMV3:'NOT_RUN'}));
});
