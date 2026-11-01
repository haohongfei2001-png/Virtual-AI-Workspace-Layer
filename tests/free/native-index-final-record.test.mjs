import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {scopeOf} from '../../simulator/data.mjs';import {emptyNativeFacts} from '../../src/data/native-facts.mjs';import {nativeRecord,NATIVE_PARTITION_FORMAT} from '../../src/data/native-partitions.mjs';
const scope=scopeOf('A'),scopeKey=emptyNativeFacts(scope).scopeKey,url=new URL('../../src/data/native-version-index.mjs',import.meta.url);let nonce=0;
async function measured(){let source=await readFile(url,'utf8');source=source.replace('digest,stable','digest,stable as baseStable');source+='\nlet finalEncodings=0;function stable(value){if(value?.format===NATIVE_INDEX_FORMAT&&value.revision===2)finalEncodings++;return baseStable(value);}export const count=()=>finalEncodings;\n//'+nonce++;source=source.replace(/from '([^']+)'/g,(all,p)=>p.startsWith('.')?`from '${new URL(p,url).href}'`:all);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
function seed(api){return api.buildNativeVersionIndex({format:NATIVE_PARTITION_FORMAT,scopeKey,revision:1,sources:{},projects:{},refs:{R:1},units:100,changes:[]},scope);}
function oldPath(api,b,metadata){const result=api.updateNativeVersionIndex(b.root,scope,2,{projects:{},refs:{R:2}},b.records);Object.assign(result.root,metadata);api.validateNativeIndexRoot(result.root,scope);return {...result,rootRecord:nativeRecord(scopeKey,result.root)};}
const metadata=()=>({sources:{},units:110,changes:[{revision:2,projects:[],refs:['R']}]});
function finalPath(api,b,m){return api.buildNativeIndexUpdateRecord?api.buildNativeIndexUpdateRecord(b.root,scope,2,{projects:{},refs:{R:2}},b.records,m):oldPath(api,b,m);}
test('final metadata and root checksum use one canonical encoding, identical to former writer output',async()=>{
 const api=await measured(),b=seed(api),m=metadata(),result=finalPath(api,b,m);assert.equal(api.count(),1,'final root must be canonically encoded once');
 assert.deepEqual(result,oldPath(api,b,m));assert.deepEqual(result.rootRecord,nativeRecord(scopeKey,result.root));
 m.changes[0].refs.push('unrelated');assert.deepEqual(result.root.changes[0].refs,['R']);
});
for(const [name,change] of [['units',m=>m.units=-1],['changes',m=>m.changes[0].revision=3],['source',m=>m.sources.bad={}],['extra',m=>m.checksum='caller-hash']])test('final record rejects malformed '+name,async()=>{
 const api=await measured(),b=seed(api),m=metadata();change(m);assert.throws(()=>finalPath(api,b,m));
});
test('metadata getter is captured once and cannot change the checksummed final root',async()=>{
 const api=await measured(),b=seed(api);let reads=0;const m={...metadata(),get units(){return ++reads===1?110:-1;}};
 const result=finalPath(api,b,m);assert.equal(reads,1);assert.equal(result.root.units,110);assert.deepEqual(result.rootRecord,nativeRecord(scopeKey,result.root));
});
test('final record retains aggregate manifest size bound for individually valid change rows',async()=>{
 const api=await measured(),b=seed(api),m=metadata();
 m.changes=Array.from({length:64},()=>({revision:1,projects:[],refs:Array(10000).fill('R'.repeat(32))}));
 assert.throws(()=>finalPath(api,b,m),{message:'native-manifest-too-large'});
});
