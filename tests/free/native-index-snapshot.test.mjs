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
