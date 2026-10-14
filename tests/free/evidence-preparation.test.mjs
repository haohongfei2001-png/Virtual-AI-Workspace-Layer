import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {evidenceHarness,evidenceRequest} from './evidence-contracts.mjs';
import {scopeOf} from '../../simulator/data.mjs';
const A=scopeOf('A');
test('another connection changes evidence after preparation; stale candidate cannot overwrite new facts',async t=>{
 const h=await evidenceHarness(new MockIDBFactory());t.after(()=>h.close());
 assert((await h.repo.apply(A,evidenceRequest())).ok);
 assert.deepEqual(await h.repo.prepareRefDirectory(A,{expectedRevision:1}),{ok:true,prepared:true});
 const next=evidenceRequest('second',1);next.batch.events[0].id='second_send';next.batch.events[0].messageId='second_message';next.batch.events[0].conversationId='T1';
 assert((await h.other.apply(A,next)).ok);
 const facts=await h.other.read(A);
 assert.deepEqual(await h.repo.migrateRefDirectory(A,{operationId:'stale',expectedRevision:1}),{ok:false,reason:'revision-conflict'});
 assert((await h.repo.migrateRefDirectory(A,{operationId:'current',expectedRevision:2})).ok);
 assert.deepEqual(await h.other.read(A),{...facts,revision:3});
 assert.equal((await h.repo.read(A)).events.second_send.conversationId,'T1');
});
