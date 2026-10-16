/** Bounded L diagnosis: unchanged production files, actual binding/provider/owners/repositories.
 * DOM/frame and HTTP are explicit offline fixtures; MockIDB is not browser durability.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fixture,C} from './evidence-revalidation-fixture.mjs';
import {digest} from '../../src/data/hash.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {projectFreeActivity} from '../../src/data/free-activity.mjs';
import {createFreeViewSession} from '../../src/data/free-time-policy.mjs';

const traces=[];
if(process.env.VAIWL_INITIAL_ACK_TRACE_PATH)test.after(()=>writeFileSync(process.env.VAIWL_INITIAL_ACK_TRACE_PATH,JSON.stringify(traces,null,2)+'\n'));
async function operation(h,key){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_operations'),q=tx.objectStore('native_operations').get(key);tx.oncomplete=()=>{if(q.result)assert.equal(q.result.checksum,digest(q.result.payload));resolve(q.result??null);};tx.onabort=()=>reject(tx.error);});}
async function setup(t){
 const h=await fixture(t,{history:true});
 const initial=await h.read();
 assert.equal(Object.keys(initial.sources).length,1);
 assert(Object.values(initial.sources).every(s=>s.codecVersion===2));
 assert.deepEqual(Object.values(initial.events).map(e=>e.messageId),['m1']);
 assert.deepEqual(initial.hints,{});
 const w=(await h.workspace.read(h.scope)).state;
 assert.equal((await h.workspace.command(h.scope,{operationId:'human_workspace_sentinel',expectedRevision:w.revision,command:{type:'CREATE_WORKSPACE',id:'preserved_workspace',name:'Human preservation sentinel'}})).ok,true);
 const apply=h.evidence.applyContinuation.bind(h.evidence),attempts=[];
 h.evidence.applyContinuation=async(scope,request)=>{attempts.push(structuredClone(request));return {ok:false,reason:'fixture-interruption-before-first-evidence-apply'};};
 await h.intent('genuine_first_send_m2');h.add('m2');h.setTime('m2','unavailable');
 const reads=h.calls.length;assert.equal((await h.observe('Genuine joint native title')).state,'accepted');
 assert.equal(h.calls.length-reads,3);
 const [pending]=await h.service.nativeRepository.listContinuations(h.scope);
 assert.equal(pending.state,'pending-evidence');assert.equal(pending.format,'vaiwl-native-continuation-v2');
 const evidence=await h.read(),native=await h.service.nativeRepository.read(h.scope),assets=(await h.workspace.read(h.scope)).state;
 assert.deepEqual(evidence,initial,'pending ACK did not persist source and invalid time did not create m2 history');
 assert.equal(evidence.sources[pending.admission.sourceId],undefined);
 assert.deepEqual(Object.values(evidence.events).map(e=>e.messageId),['m1']);
 assert.equal(pending.evidence.batch.hints[0].messageId,'m2');
 assert.equal(native.sources[pending.nativeWitness.sourceId].revoked,false);
 assert.equal(native.sources[pending.nativeWitness.sourceId].sourceRevision,pending.nativeWitness.sourceRevision);
 assert.equal(native.sources[pending.nativeWitness.sourceId].admission.semanticFingerprint,pending.nativeWitness.semanticFingerprint);
 assert.equal(attempts.length,1);
 assert.equal(await operation(h,JSON.stringify([freeEvidenceKey(h.scope.key),pending.evidence.operationId])),null);
 return {h,pending,evidence,native,assets,restore:()=>h.evidence.applyContinuation=apply};
}
async function projected(h,scope=h.scope){const stored=await h.evidence.read(scope),state=(await h.workspace.read(scope)).state,evidence=h.service.readService.activityEvidence(scope,state,stored),snapshot={scope:scope.key,refs:[{id:C,scope:scope.key}],projects:[],noProject:[{id:C}],unknown:[]};return {evidence,decision:projectFreeActivity(snapshot,evidence,createFreeViewSession({now:h.now(),timeZone:'UTC'}),h.now()).refs[0].activityDecision};}
for(const repair of [false,true])test('original never-persisted first ACK resumes with fresh grant; unrelated evidence repair='+repair,async t=>{
 const {h,pending,evidence,native,assets,restore}=await setup(t),scope=h.scope;
 const nativeReceiptBefore=await operation(h,JSON.stringify([scope.key,pending.operationId]));
 const before=repair?await h.recover():evidence;
 assert.deepEqual(await h.service.nativeRepository.read(scope),native);
 assert.deepEqual(await operation(h,JSON.stringify([scope.key,pending.operationId])),nativeReceiptBefore,'evidence repair did not restore or rewrite original pending receipt');
 assert.deepEqual((await h.workspace.read(scope)).state,assets);
 assert.equal(before.sources[pending.admission.sourceId],undefined);
 restore();h.tick(120000);const reads=h.calls.length;await h.restart();
 const after=await h.read(),receipt=await operation(h,JSON.stringify([scope.key,pending.operationId])),terminal=receipt.payload.continuation;
 assert.equal(terminal.state,'complete');
 for(const k of ['operationId','nativeRevision','admission','payloadDigest','nativeWitness'])assert.deepEqual(terminal[k],pending[k]);
 assert.equal(terminal.evidenceOperationId,pending.evidence.operationId);
 const anchor=after.hints[pending.evidence.batch.hints[0].id],source=after.sources[pending.admission.sourceId];
 for(const [k,v]of Object.entries(pending.evidence.batch.hints[0]))assert.deepEqual(anchor[k],v);
 for(const [k,v]of Object.entries(pending.evidence.batch.sources[0]))assert.deepEqual(source[k],v);
 assert.equal(source.revoked,false);assert.equal(source.generation,'profile_1');assert.equal(anchor.messageId,'m2');
 assert.equal(after.revision,before.revision+1);
 for(const [id,row]of Object.entries(before.events))assert.deepEqual(after.events[id],row);
 for(const [id,row]of Object.entries(before.sources))assert.deepEqual(after.sources[id],row);
 assert.deepEqual(await h.service.nativeRepository.read(scope),native);
 assert.deepEqual((await h.workspace.read(scope)).state,assets);
 assert.deepEqual(await h.service.nativeRepository.listContinuations(scope),[]);
 assert.equal(h.calls.length-reads,2,'fresh grant uses existing session/account GETs; no conversation refetch in drain');
 const result=await projected(h);assert.deepEqual(Object.values(result.evidence.hints).map(r=>r.messageId),['m2']);
 assert.equal(result.decision.reason,'observed-self-send');assert.equal(result.decision.candidateTime,pending.evidence.batch.hints[0].firstObservedAt);
 if(repair)assert.deepEqual(result.evidence.events,{},'unrelated restored history remains revoked');
 const replayBefore=await h.read();const reads2=h.calls.length;await h.restart();assert.deepEqual(await h.read(),replayBefore);assert.equal(h.calls.length-reads2,2);
 traces.push({case:repair?'unrelated-evidence-repair':'ordinary-restart',initialEvidence:evidence,pending,nativeWitnessSource:native.sources[pending.nativeWitness.sourceId],afterRecovery:before,terminal,afterResume:after,activity:result.decision,refreshGETs:2,conversationGETsOnResume:0,nativeRootUnchanged:true,humanAssetsUnchanged:true,receiptBefore:nativeReceiptBefore.payload,receiptAfter:receipt.payload});
});

for(const changed of ['native-source-revoked','ack-profile-changed','native-profile-changed'])test('original missing ACK is not authority after '+changed,async t=>{
 const {h,pending,native,assets,restore}=await setup(t);await h.recover();
 if(changed==='native-source-revoked')assert.equal((await h.service.nativeRepository.invalidate(h.scope,{operationId:'actual_native_source_revocation',expectedRevision:native.revision,sourceId:pending.nativeWitness.sourceId})).ok,true);
 else if(changed==='ack-profile-changed')h.ack.revision++;
 else h.surface.revision++;
 const before=await h.read();restore();const reads=h.calls.length;await h.restart();
 const after=await h.read(),terminal=(await operation(h,JSON.stringify([h.scope.key,pending.operationId]))).payload.continuation;
 assert.equal(terminal.state,'needs-revalidation');assert.equal(terminal.reason,changed==='native-source-revoked'?'source-revoked':'profile-changed');
 for(const k of ['operationId','nativeRevision','admission','payloadDigest','nativeWitness'])assert.deepEqual(terminal[k],pending[k]);
 assert.deepEqual(after,before);assert.equal(after.sources[pending.admission.sourceId],undefined);
 assert.deepEqual((await h.workspace.read(h.scope)).state,assets);assert.equal(h.calls.length-reads,2);
 traces.push({case:changed,terminal,evidenceRevision:after.revision,ackSourcePersisted:false,refreshGETs:2});
});

test('another authenticated scope cannot drain original pending, and original scope can resume later',async t=>{
 const {h,pending,native,assets,restore}=await setup(t),scope=h.scope;await h.recover();const before=await h.evidence.read(scope),opBefore=await operation(h,JSON.stringify([scope.key,pending.operationId]));
 restore();h.setPrincipal('other');await h.restart();assert.notEqual(h.scope.key,scope.key);
 assert.deepEqual(await h.service.nativeRepository.listContinuations(h.scope),[]);
 assert.equal((await h.evidence.read(h.scope)).revision,0);
 assert.deepEqual(await h.evidence.read(scope),before);assert.deepEqual(await operation(h,JSON.stringify([scope.key,pending.operationId])),opBefore);
 assert.deepEqual(await h.service.nativeRepository.read(scope),native);assert.deepEqual((await h.workspace.read(scope)).state,assets);
 const otherScope=h.scope;h.setPrincipal('self');await h.restart();assert.equal(h.scope.key,scope.key);
 assert.equal((await operation(h,JSON.stringify([scope.key,pending.operationId]))).payload.continuation.state,'complete');
 assert.equal((await h.evidence.read(otherScope)).revision,0);
 traces.push({case:'scope-isolation',originalScope:scope.key,otherScope:otherScope.key,originalOperation:pending.operationId,otherEvidenceRevision:0,originalCompletedOnlyAfterOriginalFreshGrant:true});
});

test('serialized operation/digest labels cannot authorize the absent first ACK source',async t=>{
 const {h,pending,restore}=await setup(t);await h.recover();const before=await h.read(),opBefore=await operation(h,JSON.stringify([h.scope.key,pending.operationId]));restore();
 const request={operationId:pending.evidence.operationId,expectedRevision:before.revision,nativeOperationId:pending.operationId,payloadDigest:pending.payloadDigest};
 await assert.rejects(h.evidence.applyContinuation(h.scope,request,{guard:()=>true}),/untrusted-native-continuation/);
 assert.deepEqual(await h.read(),before);assert.deepEqual(await operation(h,JSON.stringify([h.scope.key,pending.operationId])),opBefore);
 await h.restart();assert.equal((await operation(h,JSON.stringify([h.scope.key,pending.operationId]))).payload.continuation.state,'complete');
 traces.push({case:'operation-isolation',forgedRequestRejected:'untrusted-native-continuation',originalOperation:pending.operationId,completedThroughFreshOwner:true});
});

test('actually persisted ACK predecessor is revoked by the same repair and old pending stays unavailable',async t=>{
 const h=await fixture(t,{history:true});
 await h.intent('prior_genuine_m2');h.add('m2');h.setTime('m2','unavailable');assert.equal((await h.observe()).state,'accepted');
 const prior=await h.read();assert.equal(Object.values(prior.hints).length,1);
 const apply=h.evidence.applyContinuation.bind(h.evidence);h.evidence.applyContinuation=async()=>({ok:false,reason:'fixture-interruption-before-evidence-apply'});
 await h.intent('pending_genuine_m3');h.add('m3');h.setTime('m3','unavailable');assert.equal((await h.observe('Second joint title')).state,'accepted');
 const [pending]=await h.service.nativeRepository.listContinuations(h.scope);assert.equal(pending.state,'pending-evidence');
 assert.equal((await h.read()).sources[pending.admission.sourceId].revoked,false);
 const restored=await h.recover();h.evidence.applyContinuation=apply;await h.restart();
 const terminal=(await operation(h,JSON.stringify([h.scope.key,pending.operationId]))).payload.continuation;
 assert.equal(terminal.state,'needs-revalidation');assert.equal(terminal.reason,'source-revoked');
 assert.deepEqual(await h.read(),restored);assert.equal(Object.values(restored.hints).some(r=>r.messageId==='m3'),false);
 for(const k of ['operationId','nativeRevision','admission','payloadDigest','nativeWitness'])assert.deepEqual(terminal[k],pending[k]);
 const result=await projected(h);assert.deepEqual(result.evidence.hints,{});assert.equal(result.decision.basis,'undated');
 traces.push({case:'persisted-ACK-predecessor-control',terminal,restoredSource:restored.sources[pending.admission.sourceId],activity:result.decision});
});
