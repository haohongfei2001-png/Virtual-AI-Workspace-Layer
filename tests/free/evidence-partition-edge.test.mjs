import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {evidenceHarness,evidenceRequest} from './evidence-contracts.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {evidencePieceKey,evidenceIndexKey,freeEvidenceKey} from '../../src/data/free-evidence-partitions.mjs';
import {digest} from '../../src/data/hash.mjs';
const scope=scopeOf('A');
function revised(operationId='second') {const request=evidenceRequest(operationId,1);request.batch.sources[0].sourceRevision=2;request.batch.events[0].sourceRevision=2;return request;}

test('MOCK_IDB global immutable event ID cannot be relocated into another evidence partition',async()=>{
 const h=await evidenceHarness(new MockIDBFactory());try{
  assert.equal((await h.repo.apply(scope,evidenceRequest())).ok,true);const before=await h.repo.read(scope);
  const changed=revised();changed.batch.events[0].conversationId='another';
  const result=await h.repo.apply(scope,changed);assert.equal(result.ok,false);assert.equal(result.reason,'immutable-free-evidence-conflict');assert.deepEqual(await h.repo.read(scope),before);
 }finally{h.close();}
});

test('MOCK_IDB same hint event key cannot be reassigned across conversation partitions under a new row ID',async()=>{
 const h=await evidenceHarness(new MockIDBFactory());try{
  const first=evidenceRequest();first.batch.events=[];first.batch.hints=[{id:'h',sourceId:'evidence_fixture',generation:'first',sourceRevision:1,observedAt:'2026-10-13T12:00:00Z',validUntil:'2026-10-13T12:05:00Z',conversationId:'one',eventKey:'same_send',hintType:'local-confirmed-send',candidateInterval:null,actorVerified:true,actorScopeKey:evidenceRequest().batch.events[0].actorScopeKey}];
  assert.equal((await h.repo.apply(scope,first)).ok,true);
  const second=structuredClone(first);second.operationId='reassign';second.expectedRevision=1;second.batch.sources[0].sourceRevision=2;Object.assign(second.batch.hints[0],{id:'new_hint_id',conversationId:'two',sourceRevision:2});
  const result=await h.repo.apply(scope,second);assert.equal(result.ok,false);assert.equal(result.reason,'free-hint-event-conflict');
  const facts=await h.repo.read(scope);assert.equal(Object.keys(facts.hints).length,1);assert.equal(facts.hints.h.conversationId,'one');
 }finally{h.close();}
});

test('MOCK_IDB damaged evidence piece refuses root recovery and keeps raw records for diagnosis',async()=>{
 const h=await evidenceHarness(new MockIDBFactory());try{
  assert.equal((await h.repo.apply(scope,evidenceRequest())).ok,true);const header=await h.repo.header(scope),facts=await h.repo.read(scope),db=await h.base.open(),rootKey=freeEvidenceKey(facts.scopeKey),pieceKey=evidencePieceKey(facts.scopeKey,'T0',header.manifest.refVersions.T0);
  const damagedHash=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),r=store.get(rootKey);let hash;r.onsuccess=()=>{const row={...r.result,checksum:'broken'};hash=digest(row);store.put(row);store.delete(pieceKey);};tx.oncomplete=()=>resolve(hash);tx.onabort=()=>reject(tx.error);});
  const result=await h.repo.recover(scope,{operationId:'recover',damagedHash});assert.equal(result.ok,false);assert.match(result.reason,/corrupt|missing|invalid/);await assert.rejects(h.repo.read(scope),/corrupt/);
  const raw=await new Promise(resolve=>{const tx=db.transaction('native_states'),r=tx.objectStore('native_states').get(rootKey);r.onsuccess=()=>resolve(r.result);});assert.equal(digest(raw),damagedHash);
 }finally{h.close();}
});

for(const withIndependentRef of [false,true])test(`MOCK_IDB overlarge single-ref evidence rejects atomically (${withIndependentRef?'mixed refs':'one ref'})`,async()=>{
 const h=await evidenceHarness(new MockIDBFactory());try{
  assert.equal((await h.repo.apply(scope,evidenceRequest())).ok,true);const before=await h.repo.read(scope),request=revised('oversized');
  const from='2026-10-13T11:00:00Z',through='2026-10-13T11:01:00Z',gaps=Array.from({length:1000},()=>({from,through}));
  request.batch.events=withIndependentRef?[{...request.batch.events[0],id:'independent',messageId:'independent_message',conversationId:'independent_ref'}]:[];
  request.batch.coverage=Array.from({length:260},(_,i)=>({id:'coverage_'+i,sourceId:'evidence_fixture',generation:'first',sourceRevision:2,observedAt:'2026-10-13T12:00:00Z',conversationId:'large_ref',from,through,completeness:'partial',branches:'observed',gaps}));
  const failed=await h.repo.apply(scope,request);assert.equal(failed.ok,false);assert.match(failed.reason,/too-large/);
  assert.deepEqual(await h.repo.read(scope),before,'root/source/other ref must all roll back');
  const repaired=structuredClone(request);repaired.batch.coverage=[];
  const retried=await h.repo.apply(scope,repaired);assert.equal(retried.ok,true,JSON.stringify(retried));assert.equal(retried.replayed,false,'failed transaction must leave no receipt');
 }finally{h.close();}
});

test('MOCK_IDB missing known index shard cannot turn immutable event ID into a new cross-ref event',async()=>{
 const h=await evidenceHarness(new MockIDBFactory());try{
  assert.equal((await h.repo.apply(scope,evidenceRequest())).ok,true);const before=await h.repo.read(scope),header=await h.repo.header(scope),group='events_'+digest('send').slice(0,2),version=header.manifest.indexVersions[group];
  assert(Number.isSafeInteger(version));const db=await h.base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');tx.objectStore('native_states').delete(evidenceIndexKey(before.scopeKey,group,version));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  const attempt=revised('missing_index');attempt.batch.events[0].conversationId='different_ref';
  const denied=await h.repo.apply(scope,attempt);assert.equal(denied.ok,false);assert.match(denied.reason,/index|corrupt/);
  const after=await h.repo.read(scope);assert.deepEqual(after,before);assert.equal(after.events.send.conversationId,'T0');assert.equal((await h.repo.header(scope)).revision,header.revision);
 }finally{h.close();}
});
