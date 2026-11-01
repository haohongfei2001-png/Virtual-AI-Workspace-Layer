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

async function dump(h){const db=await h.base.open();return new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),out={};for(const name of names){out[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const c=q.result;if(c){out[name].push(c.value);c.continue();}};}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});}
for(const resigned of [false,true])test('prepared pure build cannot conceal later '+(resigned?'resigned':'unsigned')+' index mutation',async t=>{
 const {freeEvidenceKey,evidenceIndexKey,evidenceRecord}=await import('../../src/data/free-evidence-partitions.mjs');
 const h=await evidenceHarness(new MockIDBFactory());t.after(()=>h.close());assert((await h.repo.apply(A,evidenceRequest())).ok);
 assert.deepEqual(await h.repo.prepareRefDirectory(A,{expectedRevision:1}),{ok:true,prepared:true});
 const db=await h.base.open(),scope=h.base.scopeOrThrow(A);
 await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),q=store.get(freeEvidenceKey(scope.key));q.onsuccess=()=>{const p=q.result.payload,group=Object.keys(p.indexVersions)[0],key=evidenceIndexKey(scope.key,group,p.indexVersions[group]),r=store.get(key);r.onsuccess=()=>{const row=r.result;row.payload.refs[Object.keys(row.payload.refs)[0]]='T1';store.put(resigned?evidenceRecord(key,row.payload):row);};};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const before=await dump(h),result=await h.repo.migrateRefDirectory(A,{operationId:'no_publish',expectedRevision:1});
 assert.equal(result.ok,false);assert.equal(result.reason,resigned?'free-evidence-index-checksum-mismatch':'corrupt-free-evidence-record');assert.deepEqual(await dump(h),before);
});
