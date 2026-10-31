import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
import {scopeOf} from '../../simulator/data.mjs';import {emptyNativeFacts} from '../../src/data/native-facts.mjs';import {nativeRecord,NATIVE_PARTITION_FORMAT} from '../../src/data/native-partitions.mjs';
const scope=scopeOf('A'),key=emptyNativeFacts(scope).scopeKey,url=new URL('../../src/data/native-version-index.mjs',import.meta.url),baseline='1bcc4edf9e636ae03dd84e323f6c94b8a7573086';let sequence=0;
async function measured(old=false){let source=old?execFileSync('git',['show',baseline+':src/data/native-version-index.mjs'],{encoding:'utf8'}):await readFile(url,'utf8');assert(source.includes('import {digest,stable}'));source=source.replace('import {digest,stable}','import {digest as originalDigest,stable}');source+='\nlet calls=0;const digest=value=>{calls++;return originalDigest(value);};export const routingCount=()=>calls;\n// '+sequence++;source=source.replace(/from '([^']+)'/g,(all,p)=>p.startsWith('.')?`from '${new URL(p,url).href}'`:all);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
const manifest=(revision=1)=>({format:NATIVE_PARTITION_FORMAT,scopeKey:key,revision,sources:{},projects:{P:1},refs:Object.fromEntries(Array.from({length:512},(_,i)=>['native_'+i,1])),units:102400,changes:[]});
const readAll=(api,b)=>{for(const row of b.records)api.verifyNativeIndexPiece(structuredClone(row),b.root,row.payload.kind,row.payload.bucket);};
function selected(api,b,updates){const keys=new Set(Object.keys(updates.refs).map(id=>{const bucket=api.nativeIndexBucket(id);return api.nativeIndexKey(key,'refs',bucket,b.root.refs[bucket].revision);}));return b.records.filter(row=>keys.has(row.key));}
test('constructed native buckets preserve exact old bytes while avoiding first-read duplicate routing',async t=>{
 const old=await measured(true),current=await measured(process.env.NATIVE_CONSTRUCTION_BASELINE==='1'),a=old.buildNativeVersionIndex(manifest(),scope),b=current.buildNativeVersionIndex(manifest(),scope);assert.deepEqual(b,a);
 const oldBefore=old.routingCount(),before=current.routingCount();readAll(old,a);readAll(current,b);const oldReads=old.routingCount()-oldBefore,newReads=current.routingCount()-before;
 const updates={projects:{},refs:{native_0:2,native_1:2}},nextA=old.updateNativeVersionIndex(a.root,scope,2,updates,selected(old,a,updates)),nextB=current.updateNativeVersionIndex(b.root,scope,2,updates,selected(current,b,updates));assert.deepEqual(nextB,nextA);
 const priorOld=old.routingCount(),priorNew=current.routingCount();readAll(old,nextA);readAll(current,nextB);const oldUpdateReads=old.routingCount()-priorOld,newUpdateReads=current.routingCount()-priorNew;
 t.diagnostic(JSON.stringify({oldFirstReadRouting:oldReads,newFirstReadRouting:newReads,oldUpdatedReadRouting:oldUpdateReads,newUpdatedReadRouting:newUpdateReads}));assert.equal(oldReads,513);assert.equal(newReads,0);assert(oldUpdateReads>0);assert.equal(newUpdateReads,0);
 assert.deepEqual(current.materializeNativeVersionIndex(b.root,scope,b.records),manifest());
});
for(const cold of [false,true])for(const fault of ['bytes','checksum','ordinal','duplicate-ordinal','count','scope','kind','routing','version'])test((cold?'cold':'constructed warm')+' rejects '+fault,async()=>{
 const api=await measured(),b=api.buildNativeVersionIndex(manifest(),scope),root=structuredClone(b.root);let row=structuredClone(b.records.find(r=>r.payload.kind==='refs'&&r.payload.ordinals.length>1));const bucket=row.payload.bucket,keys=Object.keys(row.payload.versions);
 if(fault==='bytes')row.payload.versions[keys[0]]=2;if(fault==='checksum')row.checksum='0'.repeat(64);if(fault==='ordinal')row.payload.ordinals[0]=100000;if(fault==='duplicate-ordinal')row.payload.ordinals[1]=row.payload.ordinals[0];if(fault==='count')root.refs[bucket].count++;if(fault==='scope')row.payload.scopeKey='foreign';if(fault==='kind')row.payload.kind='projects';if(fault==='version')row.payload.versions[keys[0]]=2;
 if(fault==='routing'){let id='wrong';while(api.nativeIndexBucket(id)===bucket)id+='x';row.payload.versions[id]=1;delete row.payload.versions[keys[0]];}
 if(!['bytes','checksum'].includes(fault))row=nativeRecord(row.key,row.payload);
 const reader=cold?await measured():api;assert.throws(()=>reader.verifyNativeIndexPiece(row,root,'refs',bucket));
});
test('cold genuine reads still fully route; corrupted checksum is not blessed by construction',async()=>{const maker=await measured(),b=maker.buildNativeVersionIndex(manifest(),scope),reader=await measured(),row=structuredClone(b.records.find(r=>r.payload.kind==='refs'));assert.equal(reader.verifyNativeIndexPiece(row,b.root,'refs',row.payload.bucket),row.payload);assert.equal(reader.routingCount(),Object.keys(row.payload.versions).length);const changed=structuredClone(row);changed.payload.ordinals[0]++;assert.throws(()=>reader.verifyNativeIndexPiece(changed,b.root,'refs',row.payload.bucket));});
test('construction cache eviction falls back to complete validation without losing corrupt-byte refusal',async()=>{
 const api=await measured(),first=api.buildNativeVersionIndex(manifest(),scope),row=structuredClone(first.records.find(r=>r.payload.kind==='refs'));
 for(let revision=2;revision<=5;revision++)api.buildNativeVersionIndex(manifest(revision),scope);
 const before=api.routingCount();api.verifyNativeIndexPiece(row,first.root,'refs',row.payload.bucket);assert.equal(api.routingCount()-before,Object.keys(row.payload.versions).length);
 row.payload.ordinals[0]=100000;assert.throws(()=>api.verifyNativeIndexPiece(nativeRecord(row.key,row.payload),first.root,'refs',row.payload.bucket));
});
test('accessor cannot replace verified old routing before a constructed bucket is certified',async()=>{
 const api=await measured(),b=api.buildNativeVersionIndex(manifest(),scope),row=structuredClone(b.records.find(r=>r.payload.kind==='refs'&&r.payload.ordinals.length>1)),bucket=row.payload.bucket;
 api.verifyNativeIndexPiece(row,b.root,'refs',bucket);
 const original=row.payload.versions,keys=Object.keys(original),bad={...original};let foreign='getter_wrong';while(api.nativeIndexBucket(foreign)===bucket)foreign+='x';delete bad[keys[0]];bad[foreign]=1;let reads=0;
 Object.defineProperty(row.payload,'versions',{enumerable:true,get(){return ++reads===1?original:bad;}});
 // A verified plain snapshot may accept the first legal value; it must never
 // certify a later accessor's unverified route. Verify in an independent cache.
 const next=api.updateNativeVersionIndex(b.root,scope,2,{projects:{},refs:{[keys[0]]:2}},[row]),cold=await measured();
 for(const record of next.records){assert(!Object.hasOwn(record.payload.versions,foreign));cold.verifyNativeIndexPiece(record,next.root,'refs',record.payload.bucket);}
 assert.deepEqual(Object.keys(next.records[0].payload.versions),keys);
});

test('wrong-route accessor snapshot is fully verified before construction',async()=>{
 const api=await measured(),b=api.buildNativeVersionIndex(manifest(),scope),row=structuredClone(b.records.find(r=>r.payload.kind==='refs')),bucket=row.payload.bucket,original=row.payload.versions,keys=Object.keys(original),bad={...original};
 let foreign='bad_snapshot';while(api.nativeIndexBucket(foreign)===bucket)foreign+='x';delete bad[keys[0]];bad[foreign]=1;
 Object.defineProperty(row.payload,'versions',{enumerable:true,get:()=>bad});
 assert.throws(()=>api.updateNativeVersionIndex(b.root,scope,2,{projects:{},refs:{[keys[0]]:2}},[row]));
});
