import test from 'node:test';
import assert from 'node:assert/strict';
import {VerifiedRecordCache} from '../../src/data/verified-record-cache.mjs';
import {digest} from '../../src/data/hash.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {evidenceHarness,evidenceRequest} from './evidence-contracts.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
const row=payload=>({key:'root',payload,checksum:digest(payload)});
const verify=(payload,record)=>{assert.equal(digest(payload),record.checksum,'checksum');assert.equal(payload.valid,true,'schema');};
function payload(){return {valid:true,refs:{a:1,b:2},projects:{p:1},empty:{},four:{},five:{}};}
for(const budget of [{},{maxChars:1}])test(`counts share the sole full-byte enumeration cold/warm/oversize ${JSON.stringify(budget)}`,()=>{
 const cache=new VerifiedRecordCache(budget),record=row(payload());let enumerations=0,calls=0;
 record.payload.refs=new Proxy(record.payload.refs,{ownKeys(target){enumerations++;return Reflect.ownKeys(target);}});
 // Isolate encoder enumerations from the verifier's independent hash traversal.
 const check=()=>calls++;
 for(let read=0;read<2;read++){
  enumerations=0;const result=cache.readWithCounts(record,'A',check,['refs']);
  assert.equal(result.counts.refs,2);assert.equal(enumerations,1,'counting adds no second key enumeration, even on a cold or uncached read');
 }
 assert.equal(calls,budget.maxChars===1?2:1);
 cache.readWithCounts(record,'A',check,['projects','empty','four','five']);enumerations=0;
 const result=cache.readWithCounts(record,'A',check,['refs']);assert.equal(result.counts.refs,2);assert.equal(enumerations,1,'prior requested fields do not affect current traversal counts');
});
test('returned counts and payload mutations cannot contaminate verified derived counts',()=>{
 const cache=new VerifiedRecordCache(),record=row(payload()),result=cache.readWithCounts(record,'A',verify,['refs']);result.counts.refs=999;
 assert.equal(cache.readWithCounts(structuredClone(record),'A',verify,['refs']).counts.refs,2);
 result.payload.refs.c=3;assert.throws(()=>cache.readWithCounts(record,'A',verify,['refs']),/checksum/);
 record.checksum=digest(record.payload);assert.equal(cache.readWithCounts(record,'A',verify,['refs']).counts.refs,3);
 const invalid=row({...record.payload,valid:false});assert.throws(()=>cache.readWithCounts(invalid,'A',verify,['refs']),/schema/);
});
test('bad checksum and different scope context independently validate before returning counts',()=>{
 const cache=new VerifiedRecordCache(),record=row(payload());let calls=0;const check=(...args)=>{calls++;verify(...args);};
 cache.readWithCounts(record,'A',check,['refs']);assert.throws(()=>cache.readWithCounts({...record,checksum:'bad'},'A',check,['refs']),/checksum/);
 cache.readWithCounts(record,'B',check,['refs']);assert.equal(calls,3);cache.readWithCounts(record,'B',check,['refs']);assert.equal(calls,3);
});
for(const budget of [{maxEntries:0},{maxChars:1},{maxEntries:1}])test(`count cache respects entry/character budget ${JSON.stringify(budget)}`,()=>{
 const cache=new VerifiedRecordCache(budget),record=row(payload());let calls=0;const check=(...args)=>{calls++;verify(...args);};
 cache.readWithCounts(record,'A',check,['refs']);if(budget.maxEntries===1)cache.readWithCounts({...record,key:'other'},'A',check,['refs']);
 const before=calls;assert.equal(cache.readWithCounts(record,'A',check,['refs']).counts.refs,2);assert.equal(calls,before+1);
});
test('count fields reject malformed requests and absent/non-map tables',()=>{
 const cache=new VerifiedRecordCache(),record=row({...payload(),scalar:1,nil:null,list:[]});
 for(const fields of [null,{},[''],[1],['x'.repeat(65)],['a','b','c','d','e']])assert.throws(()=>cache.readWithCounts(record,'A',verify,fields),/invalid-cache-count-fields/);
 for(const field of ['missing','scalar','nil','list','toString'])assert.throws(()=>cache.readWithCounts(record,'A',verify,[field]),/invalid-cache-count-table/);
 assert.equal(cache.readWithCounts(record,'A',verify,['empty']).counts.empty,0);
});
test('invalid count tables cannot mask original checksum or schema failure',()=>{
 for(const invalid of [null,[],1,'text',false]){
  const cache=new VerifiedRecordCache(),record=row({...payload(),refs:invalid});let calls=0;
  for(const reason of ['corrupt-native-record','corrupt-free-evidence-record','original-schema-failure']){
   assert.throws(()=>cache.readWithCounts(record,'A',()=>{calls++;throw Error(reason);},['refs']),error=>error.message===reason);
  }
  assert.equal(calls,3,'original verifier runs before missing-count rejection');
  assert.throws(()=>cache.readWithCounts(record,'A',()=>{calls++;},['refs']),/invalid-cache-count-table/);
  assert.equal(calls,4);
 }
});
async function replaceRoot(base,key,payload){const db=await base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');tx.objectStore('native_states').put({key,payload,checksum:digest(payload)});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
for(const legacy of [false,true])test(`evidence explicit IDs keep total and offset pagination metadata (${legacy?'v1':'v2'})`,async()=>{
 const h=await evidenceHarness(new MockIDBFactory()),scope=scopeOf('A');try{
 const empty=await h.repo.page(scope,{ids:[]});assert.equal(empty.total,0);assert.equal(empty.nextOffset,0);
 const request=evidenceRequest();request.batch.events.push({...request.batch.events[0],id:'send2',conversationId:'T1',messageId:'m2'});const applied=await h.repo.apply(scope,request);assert.equal(applied.ok,true,JSON.stringify(applied));
 if(legacy){const all=await h.repo.read(scope);all.format='vaiwl-free-evidence-v1';await replaceRoot(h.base,freeEvidenceKey(all.scopeKey),all);}
 const offset=await h.repo.page(scope,{offset:1,limit:1}),explicit=await h.repo.page(scope,{ids:['T1'],offset:1,limit:1});assert.equal(explicit.total,2);assert.equal(explicit.nextOffset,offset.nextOffset);assert.deepEqual(explicit.evidence,offset.evidence);
 const none=await h.repo.page(scope,{ids:[],limit:1});assert.equal(none.total,2);assert.equal(none.nextOffset,1);
 }finally{h.close();}
});
for(const legacy of [false,true])test(`native explicit IDs preserve project dependencies and combined total (${legacy?'v1':'v2'})`,async()=>{
 const h=await evidenceHarness(new MockIDBFactory()),scope=normalizedScope(scopeOf('A')),now='2026-10-13T00:00:00Z',native=new NativeRepository({baseRepository:h.base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'first',generation:'one'})});try{
 const empty=await native.page(scope,{ids:{projects:[],refs:[]}});assert.equal(empty.total,0);
 assert.equal((await native.apply(scope,{operationId:'seed',expectedRevision:0,batch:{scopeKey:scope.key,sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[{id:'P',nativeName:'项目',nativeUrl:'https://vaiwl-hf.test/hf/A/project/P',availability:'available'}],refs:[{id:'R',nativeTitle:'聊天',nativeUrl:'https://vaiwl-hf.test/hf/A/c/R',availability:'available'}],membership:[{id:'R',state:'PROJECT',projectId:'P'}],inventory:{projects:'partial',conversations:'partial',cursor:null}}})).ok,true);
 if(legacy){const all=await native.read(scope);all.format='vaiwl-native-facts-v1';await replaceRoot(h.base,scope.key,all);}
 const offset=await native.page(scope,{offset:1,limit:1}),explicit=await native.page(scope,{ids:{projects:[],refs:['R']},offset:1,limit:1});assert.equal(explicit.total,2);assert.equal(explicit.nextOffset,2);assert.deepEqual(explicit.facts,offset.facts);assert.equal(explicit.facts.projects.P.nativeName,'项目');assert.deepEqual(explicit.selectedProjects,[]);
 }finally{h.close();}
});

test('native and evidence explicit pages preserve corrupt-root errors for malformed count maps',async()=>{
 const h=await evidenceHarness(new MockIDBFactory()),scope=normalizedScope(scopeOf('A')),native=new NativeRepository({baseRepository:h.base});
 try{
  const db=await h.base.open(),evidenceKey=freeEvidenceKey(scope.key);
  assert.equal((await h.repo.apply(scope,evidenceRequest())).ok,true);
  const manifest=(await h.repo.header(scope)).manifest;
  for(const invalid of [null,[],1]){
   await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states');
    store.put({key:scope.key,payload:{format:'vaiwl-native-partitions-v1',scopeKey:scope.key,revision:1,projects:invalid,refs:{}},checksum:'bad'});
    store.put({key:evidenceKey,payload:{...manifest,refVersions:invalid},checksum:'bad'});
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
   });
   await assert.rejects(native.page(scope,{ids:{projects:[],refs:[]}}),error=>error.message==='corrupt-native-record');
   await assert.rejects(h.repo.page(scope,{ids:[]}),error=>error.message==='corrupt-free-evidence-record');
  }
 }finally{h.close();}
});
