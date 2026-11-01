import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {scopeOf} from '../../simulator/data.mjs';import {emptyNativeFacts} from '../../src/data/native-facts.mjs';import {NATIVE_PARTITION_FORMAT} from '../../src/data/native-partitions.mjs';
const scope=scopeOf('A'),scopeKey=emptyNativeFacts(scope).scopeKey,url=new URL('../../src/data/native-version-index.mjs',import.meta.url);let nonce=0;
async function measured(){let source=await readFile(url,'utf8');source=source.replace('import {VerifiedRecordCache}', 'import {VerifiedRecordCache as BaseCache}');source='let oldReads=0;class VerifiedRecordCache extends BaseCache{read(row,...args){if(row.payload?.revision===1)oldReads++;return super.read(row,...args);}}\n'+source+'\nexport const readCount=()=>oldReads;\n//'+nonce++;source=source.replace(/from '([^']+)'/g,(all,p)=>p.startsWith('.')?`from '${new URL(p,url).href}'`:all);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
function seed(api){return api.buildNativeVersionIndex({format:NATIVE_PARTITION_FORMAT,scopeKey,revision:1,sources:{},projects:{},refs:{R:1},units:100,changes:[]},scope);}
function snapshot(api,row,root){if(api.snapshotNativeIndexPiece)return api.snapshotNativeIndexPiece(row,root,'refs',row.payload.bucket);const copy=structuredClone(row);api.verifyNativeIndexPiece(copy,root,'refs',copy.payload.bucket);return copy;}
test('reader snapshot removes second old-bucket byte traversal without changing output',async t=>{
 const api=await measured(),built=seed(api),raw=structuredClone(built.records[0]),before=api.readCount(),record=snapshot(api,raw,built.root);assert.equal(api.readCount()-before,1,'new storage read still traverses bytes');
 const atUpdate=api.readCount(),next=api.updateNativeVersionIndex(built.root,scope,2,{projects:{},refs:{R:2}},[record]);
 const repeated=api.readCount()-atUpdate;t.diagnostic(JSON.stringify({oldBucketTraversalsDuringUpdate:repeated}));assert.equal(repeated,0);
 const plain=api.updateNativeVersionIndex(built.root,scope,2,{projects:{},refs:{R:2}},[raw]);assert.equal(api.readCount()-atUpdate,1,'ordinary caller input stays fully checked');assert.deepEqual(next,plain);
});
test('snapshot freezes every mutable field and cloning cannot transfer validation proof',async()=>{
 const api=await measured(),built=seed(api),raw=structuredClone(built.records[0]),record=snapshot(api,raw,built.root);
 for(const object of [record,record.payload,record.payload.versions,record.payload.ordinals])assert(Object.isFrozen(object));
 for(const change of [()=>record.key='bad',()=>record.checksum='bad',()=>record.payload.versions.R=2,()=>record.payload.ordinals[0]=99])assert.throws(change,TypeError);
 raw.payload.versions.R=99;assert.equal(record.payload.versions.R,1);
 const clone=structuredClone(record);clone.payload.versions.R=99;assert.throws(()=>api.updateNativeVersionIndex(built.root,scope,2,{projects:{},refs:{R:2}},[clone]));
});
for(const field of ['scopeKey','count','revision'])test('snapshot proof refuses changed context '+field,async()=>{
 const api=await measured(),built=seed(api),record=snapshot(api,built.records[0],built.root),root=structuredClone(built.root),bucket=record.payload.bucket;
 if(field==='scopeKey')root.scopeKey='foreign';else root.refs[bucket][field]++;
 assert.throws(()=>api.updateNativeVersionIndex(root,scope,2,{projects:{},refs:{R:2}},[record]));
});
test('context getters cannot certify bytes against a later different count',async()=>{
 const api=await measured(),built=seed(api),row=built.records[0],bucket=row.payload.bucket;let reads=0;
 const pointer={revision:1,get count(){return ++reads===1?1:2;}};
 const record=snapshot(api,row,{...built.root,refs:{[bucket]:pointer}});assert.equal(reads,1);
 const wrong={...built.root,refs:{[bucket]:{revision:1,count:2}}};
 assert.throws(()=>api.updateNativeVersionIndex(wrong,scope,2,{projects:{},refs:{R:2}},[record]));
});

test('full materialization reuses only its private immutable root and piece proofs',async()=>{
 const api=await measured(),built=seed(api),root=api.snapshotNativeIndexRoot(built.root,scope),record=snapshot(api,built.records[0],root);
 const before=api.readCount(),result=api.materializeNativeVersionIndex(root,scope,[record]);
 assert.equal(api.readCount()-before,0,'the fresh reader already traversed these exact immutable bytes');
 assert.deepEqual(result.refs,{R:1});
 const fresh=structuredClone(record),freshBefore=api.readCount();api.materializeNativeVersionIndex(root,scope,[fresh]);assert.equal(api.readCount()-freshBefore,1,'a fresh storage object still traverses all bytes');
 const mutableBefore=api.readCount();api.materializeNativeVersionIndex(built.root,scope,[record]);assert.equal(api.readCount()-mutableBefore,1,'mutable caller roots keep their original validation path');
 const accessor=structuredClone(built.root),pointer=accessor.refs[record.payload.bucket];let counts=0;Object.defineProperty(pointer,'count',{enumerable:true,get(){counts++;return 1;}});const accessorBefore=api.readCount();api.materializeNativeVersionIndex(accessor,scope,[record]);assert.equal(api.readCount()-accessorBefore,1,'accessor roots never take the immutable shortcut');assert(counts>0);
});
test('external freeze and prototype changes cannot forge full-reader proof',async()=>{
 const api=await measured(),built=seed(api),root=api.snapshotNativeIndexRoot(built.root,scope),record=snapshot(api,built.records[0],root);
 const frozen=structuredClone(record);for(const object of [frozen.payload.versions,frozen.payload.ordinals,frozen.payload,frozen])Object.freeze(object);
 const before=api.readCount();api.materializeNativeVersionIndex(root,scope,[frozen]);assert.equal(api.readCount()-before,1);
 for(const field of ['payload','versions']){const changed=structuredClone(record);Object.setPrototypeOf(field==='payload'?changed.payload:changed.payload.versions,{unexpected:true});assert.throws(()=>api.materializeNativeVersionIndex(root,scope,[changed]),'fallback must not sanitize an external prototype');}
 const altered=structuredClone(record);altered.payload.versions.R=99;assert.throws(()=>api.materializeNativeVersionIndex(root,scope,[altered]));
});
test('undefined from an unproved scope getter cannot impersonate the missing WeakMap sentinel',async()=>{
 const api=await measured(),built=seed(api),root=api.snapshotNativeIndexRoot(built.root,scope),record=snapshot(api,built.records[0],root);let reads=0;
 const external={...built.root,get scopeKey(){return ++reads===3?undefined:scopeKey;}};
 const before=api.readCount();assert.equal(api.verifyNativeIndexPiece(record,external,'refs',record.payload.bucket),record.payload);assert.equal(api.readCount()-before,1,'unproved getter roots must still traverse the complete record');
});
for(const field of ['scopeKey','kind','bucket','revision','count'])test('full-reader proof remains bound to '+field,async()=>{
 const api=await measured(),built=seed(api),originalRoot=api.snapshotNativeIndexRoot(built.root,scope),record=snapshot(api,built.records[0],originalRoot),changed=structuredClone(built.root),bucket=record.payload.bucket;
 let selectedScope=scope,kind='refs',selectedBucket=bucket;
 if(field==='scopeKey'){selectedScope=scopeOf('B');changed.scopeKey=emptyNativeFacts(selectedScope).scopeKey;}
 else if(field==='kind'){kind='projects';changed.projects=changed.refs;changed.refs={};}
 else if(field==='bucket'){selectedBucket=bucket==='00'?'01':'00';changed.refs={[selectedBucket]:changed.refs[bucket]};}
 else if(field==='revision'){changed.revision=2;changed.refs[bucket].revision=2;}
 else changed.refs[bucket].count++;
 const root=api.snapshotNativeIndexRoot(changed,selectedScope);
 assert.throws(()=>api.verifyNativeIndexPiece(record,root,kind,selectedBucket));assert.throws(()=>api.materializeNativeVersionIndex(root,selectedScope,[record]));
});
test('private bucket proofs never replace whole-directory ordinal, missing or extra-record checks',async()=>{
 const api=await measured();let other='S';while(api.nativeIndexBucket(other)===api.nativeIndexBucket('R'))other+='S';
 const built=api.buildNativeVersionIndex({format:NATIVE_PARTITION_FORMAT,scopeKey,revision:1,sources:{},projects:{},refs:{R:1,[other]:1},units:100,changes:[]},scope),root=api.snapshotNativeIndexRoot(built.root,scope);
 const {nativeRecord}=await import('../../src/data/native-partitions.mjs');
 const records=built.records.map(row=>{const payload=structuredClone(row.payload);payload.ordinals[0]=0;return snapshot(api,nativeRecord(row.key,payload),root);});
 assert.throws(()=>api.materializeNativeVersionIndex(root,scope,records),/invalid-native-index-order/);
 const valid=built.records.map(row=>snapshot(api,row,root));assert.throws(()=>api.materializeNativeVersionIndex(root,scope,valid.slice(1)));assert.throws(()=>api.materializeNativeVersionIndex(root,scope,[...valid,valid[0]]),/duplicate-native-index-record/);
});
