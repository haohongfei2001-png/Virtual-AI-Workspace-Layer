import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {j4CodecScenario,j4Status} from './j4-package-journey.mjs';
test('before-evidence codec is explicit, unprepared and cannot silently alter default or after-evidence mode',()=>{
 assert.equal(j4CodecScenario({}),null);assert.equal(j4CodecScenario({FREE_J4_CODEC_BEFORE_EVIDENCE:'1'}),'BEFORE_EVIDENCE');assert.equal(j4CodecScenario({FREE_J4_CODEC_ROUNDTRIP:'1',FREE_J4_AFTER_EVIDENCE:'1'}),'AFTER_EVIDENCE');assert.throws(()=>j4CodecScenario({FREE_J4_CODEC_ROUNDTRIP:'1'}),/requires-after-evidence/);
 for(const key of ['FREE_J4_CODEC_ROUNDTRIP','FREE_J4_AFTER_EVIDENCE','FREE_J4_SCOPE_TRACE','FREE_J4_READ_BUDGET_TRACE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY'])assert.throws(()=>j4CodecScenario({FREE_J4_CODEC_BEFORE_EVIDENCE:'1',[key]:'1'}),/requires-default-unprepared/);
 assert.equal(j4Status([{status:'PASS'}]),'PARTIAL_J4_NOT_ACCEPTED');
});
test('codec before-evidence requires absence both before replacement and after restoration, then one stable genuine receipt',async()=>{
 const joint=await readFile(new URL('./j4-joint-interruption.mjs',import.meta.url),'utf8');
 assert(joint.includes("if(codecRoundTrip){if(!afterEvidence)await evidenceReceipt(pending,{requireAbsent:true});await codecRoundTrip({pending,committedReceipt:committedReceipt??null,afterEvidence});if(!afterEvidence)await evidenceReceipt(pending,{requireAbsent:true});}"));
 for(const token of ["row!==undefined)throw Error('J4-before-evidence-receipt-must-be-absent')",'const recoveredEvidenceReceipt=(beforeNativeCommit||codecRoundTrip&&!afterEvidence)?await evidenceReceipt(pending):null','assert.equal(recovered.receipt.continuation.evidenceRevision,recoveredEvidenceReceipt.payload.revision)','if(recoveredEvidenceReceipt)assert.deepEqual(await evidenceReceipt(pending),recoveredEvidenceReceipt)','assert.equal(hints.length,1)','assert.equal(hints[0].firstObservedAt,original.firstObservedAt)','assert.deepEqual(hints[0].ackWitness,original.ackWitness)','assert.notEqual(freshGrant,oldGrant)','assert.equal(server.snapshot().interruption.accepts,acceptsBefore+1)','assert.deepEqual(await assets(team),teamAssets)'])assert(joint.includes(token),token);
});
test('historical codec retains full eight-table equality and all old-owner write fences for both boundaries',async()=>{
 const codec=await readFile(new URL('./j4-codec-roundtrip.mjs',import.meta.url),'utf8');
 for(const token of ['if(afterEvidence)assert(committedReceipt);else assert.equal(committedReceipt,null)','store.get(evidenceKey)','evidence:evidence.result??null',"'codec-probe-eight-stores-required'",'allTablesDigest:digest(rows)','JSON.stringify(before)!==JSON.stringify(after)',"[['open',()=>base.open()],['listContinuations',()=>old.listContinuations(scope)],['invalidate',()=>old.invalidate", "refusals[name]!=='VersionError'",'before.evidence!==null','evidenceReceiptAbsent:!afterEvidence&&!before.evidencePresent','assert.deepEqual(await assets(scope),preserved)','assert.equal(await directoryDigest(slot),currentDigest)'])assert(codec.includes(token),token);
});
