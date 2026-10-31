import test from 'node:test';
import assert from 'node:assert/strict';
import * as index from '../../src/data/native-version-index.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {NATIVE_PARTITION_FORMAT,nativeRecord} from '../../src/data/native-partitions.mjs';
const scope=scopeOf('A'),scopeKey=emptyNativeFacts(scope).scopeKey;
const select=()=>{assert.equal(typeof index.selectNativeVersionIndexPage,'function','production selector must exist');return index.selectNativeVersionIndexPage;};
function build(projects=['P0','P1'],refs=['R0','R1','R2']){return index.buildNativeVersionIndex({format:NATIVE_PARTITION_FORMAT,scopeKey,revision:1,sources:{},projects:Object.fromEntries(projects.map(id=>[id,1])),refs:Object.fromEntries(refs.map(id=>[id,1])),units:100,changes:[]},scope);}
function oracle(b,offset,limit){const m=index.materializeNativeVersionIndex(b.root,scope,b.records),p=Object.keys(m.projects),r=Object.keys(m.refs);return {projects:p.slice(offset,offset+limit),refs:r.slice(Math.max(0,offset-p.length),Math.max(0,offset+limit-p.length))};}
for(const [label,projects,refs]of [['ordinary',['P0','P1'],['R0','R1','R2']],['empty',[],[]],['numeric',['20','3','01','4294967295'],['10','2','00','R','4294967294']]])test('selection matches full materialization for '+label,()=>{
 const fn=select(),b=build(projects,refs);b.records.reverse();for(const [offset,limit]of [[0,1],[1,3],[2,2],[4,5000],[5,1],[100,1]])assert.deepEqual(fn(b.root,scope,b.records,offset,limit),oracle(b,offset,limit),JSON.stringify({offset,limit}));
});
test('new integer-style IDs with later stored ordinals still obey Object.keys order',()=>{
 const fn=select(),b=build(['P'],['R','20']),next=index.updateNativeVersionIndex(b.root,scope,2,{projects:{},refs:{'2':2}},b.records.filter(r=>r.payload.kind==='refs'&&r.payload.bucket===index.nativeIndexBucket('2')));
 const records=new Map(b.records.map(r=>[r.key,r]));for(const r of next.records)records.set(r.key,r);
 const needed=new Set(['projects','refs'].flatMap(kind=>Object.entries(next.root[kind]).map(([bucket,p])=>index.nativeIndexKey(scopeKey,kind,bucket,p.revision))));const current={root:next.root,records:[...records.values()].filter(r=>needed.has(r.key))};
 for(let offset=0;offset<5;offset++)assert.deepEqual(fn(current.root,scope,current.records,offset,1),oracle(current,offset,1));
});
for(const [offset,limit]of [[-1,1],[0,0],[0,5001],[0,1.5],[1.5,1],[NaN,1],[Infinity,1],[0,Infinity]])test('invalid page bounds '+offset+'/'+limit,()=>{const fn=select(),b=build();assert.throws(()=>fn(b.root,scope,b.records,offset,limit));});
for(const fault of ['missing-record','extra-record','duplicate-record','checksum','scope','count','cross-bucket-ordinal','ordinal-gap'])test('whole-index validation rejects '+fault+' even outside selected page',()=>{
 const fn=select(),b=build(['P'],Array.from({length:80},(_,i)=>'R'+i));b.root=structuredClone(b.root);b.records=structuredClone(b.records);
 const refs=b.records.filter(r=>r.payload.kind==='refs'),a=refs[0],other=refs.find(r=>r.payload.bucket!==a.payload.bucket);assert(other);
 if(fault==='missing-record')b.records.splice(b.records.indexOf(other),1);
 if(fault==='extra-record')b.records.push({...other,key:other.key+'extra'});
 if(fault==='duplicate-record')b.records.push(structuredClone(other));
 if(fault==='checksum')other.checksum='0'.repeat(64);
 if(fault==='scope')b.root.scopeKey=emptyNativeFacts(scopeOf('B')).scopeKey;
 if(fault==='count')b.root.refs[other.payload.bucket].count++;
 if(fault==='cross-bucket-ordinal'||fault==='ordinal-gap'){other.payload.ordinals[0]=fault==='cross-bucket-ordinal'?a.payload.ordinals[0]:99999;Object.assign(other,nativeRecord(other.key,other.payload));}
 assert.throws(()=>index.materializeNativeVersionIndex(b.root,scope,b.records),'old oracle must reject actual corruption');
 assert.throws(()=>fn(b.root,scope,b.records,0,1),'selected Project cannot bypass corrupt unselected refs');
});
test('aggregate expanded manifest size remains bounded despite small valid indexed root',()=>{
 const fn=select(),ids=(prefix,count)=>Array.from({length:count},(_,i)=>prefix+i.toString().padStart(6,'0')+'x'.repeat(121));
 // Each kind is valid separately; together their expanded maps exceed 16 MiB.
 const p=build(ids('P',65000),[]),r=build([],ids('R',65000)),b={root:{...p.root,refs:r.root.refs},records:[...p.records,...r.records]};
 index.validateNativeIndexRoot(b.root,scope);
 assert.throws(()=>index.materializeNativeVersionIndex(b.root,scope,b.records),/native-manifest-too-large/);
 assert.throws(()=>fn(b.root,scope,b.records,0,1),/native-manifest-too-large/);
});
