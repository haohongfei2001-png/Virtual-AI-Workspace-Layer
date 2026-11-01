import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {scopeOf} from '../../simulator/data.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {partitionRecord,PARTITION_FORMAT} from '../../src/data/partitioned.mjs';
const sourceURL=new URL('../../src/data/shared-ref-directory.mjs',import.meta.url),scope=scopeOf('A');
let sequence=0;
async function instrumented(){
 let source=process.env.SHARED_CONSTRUCTION_BASELINE==='1'?execFileSync('git',['show','5a7ac14:src/data/shared-ref-directory.mjs'],{encoding:'utf8'}):await readFile(sourceURL,'utf8');
 assert(source.includes("import {stable,digest} from './hash.mjs';"));
 source=source.replace("import {stable,digest} from './hash.mjs';","import {stable,digest as originalDigest} from './hash.mjs';\nlet routingCalls=0;const digest=value=>{routingCalls++;return originalDigest(value);};export const routingCount=()=>routingCalls;");
 source=source.replace(/from '([^']+)'/g,(whole,path)=>path.startsWith('.')?`from '${new URL(path,sourceURL).href}'`:whole);
 return import('data:text/javascript;base64,'+Buffer.from(source+'\n// isolated '+sequence++).toString('base64'));
}
function manifest(n=512){const s=emptyState(scope);return {format:PARTITION_FORMAT,generation:'construction_probe',scopeKey:s.scopeKey,revision:4,channel:s.channel,sources:s.sources,workspaces:s.workspaces,preferences:s.preferences,refVersions:Object.fromEntries(Array.from({length:n},(_,i)=>['construction_'+i,1])),humanRefs:[],units:1,changes:[]};}
function touched(api,b,updates){const names=new Set(Object.keys(updates).map(api.sharedRefBucket));return b.records.filter(row=>names.has(row.payload.bucket));}
function merge(b,next){const changed=new Set(next.records.map(row=>row.payload.bucket));return [...b.records.filter(row=>!changed.has(row.payload.bucket)&&next.root.refDirectory[row.payload.bucket]),...next.records];}
test('construction routes each incoming ref once; warm fresh clones do not reroute untouched members',async t=>{
 const api=await instrumented(),m=manifest(),b=api.buildSharedRefDirectory(m,scope),buildCalls=api.routingCount();
 const updates=Object.fromEntries(Object.keys(m.refVersions).slice(0,64).map(id=>[id,5])),records=structuredClone(touched(api,b,updates)),before=api.routingCount();
 const next=api.updateSharedRefDirectory(b.root,scope,5,updates,records),updateCalls=api.routingCount()-before;
 t.diagnostic(JSON.stringify({refs:512,updates:64,buildRoutingCalls:buildCalls,updateRoutingCalls:updateCalls}));
 assert.equal(buildCalls,512,'construction must reuse validated routing');assert.equal(updateCalls,64,'new buckets must not reroute all old members');
 assert.deepEqual(api.materializeSharedRefDirectory(next.root,scope,merge(b,next)).refVersions,{...m.refVersions,...updates});
});
test('default materialization and delete/reinsert keep insertion ordinal semantics',async()=>{
 const api=await instrumented(),m=manifest(40),b=api.buildSharedRefDirectory(m,scope),original=structuredClone(b);assert.deepEqual(api.materializeSharedRefDirectory(b.root,scope,structuredClone(b.records)),m);
 const id=Object.keys(m.refVersions)[7],removed=api.updateSharedRefDirectory(b.root,scope,5,{[id]:null},touched(api,b,{[id]:null}));const records=merge(b,removed);
 const next=api.updateSharedRefDirectory(removed.root,scope,6,{[id]:6},touched(api,{records},{[id]:6}));
 assert.equal(removed.root.nextOrdinal,b.root.nextOrdinal);assert.equal(next.root.nextOrdinal,b.root.nextOrdinal+1);
 assert.deepEqual(Object.keys(api.materializeSharedRefDirectory(next.root,scope,merge({records},next)).refVersions),[...Object.keys(m.refVersions).filter(x=>x!==id),id]);assert.deepEqual(b,original);
});
for(const fault of ['unresigned-bytes','checksum','version','ordinal-ceiling','ordinal-duplicate','scope','generation','bucket','route','units','pointer-revision'])test('fresh cold record rejects '+fault,async()=>{
 const maker=await instrumented(),b=maker.buildSharedRefDirectory(manifest(),scope),root=structuredClone(b.root);let row=structuredClone(b.records.find(row=>row.payload.ordinals.length>1));const bucket=row.payload.bucket,keys=Object.keys(row.payload.versions);
 if(fault==='unresigned-bytes')row.payload.versions[keys[0]]=2;
 if(fault==='checksum')row.checksum='0'.repeat(64);
 if(fault==='version')row.payload.versions[keys[0]]=5;
 if(fault==='ordinal-ceiling')row.payload.ordinals[0]=root.nextOrdinal;
 if(fault==='ordinal-duplicate')row.payload.ordinals[1]=row.payload.ordinals[0];
 if(fault==='scope')row.payload.scopeKey='foreign';
 if(fault==='generation')row.payload.generation='foreign';
 if(fault==='bucket')row.payload.bucket=bucket==='00'?'01':'00';
 if(fault==='route'){let id='wrong_route';while(maker.sharedRefBucket(id)===bucket)id+='x';row.payload.versions[id]=row.payload.versions[keys[0]];delete row.payload.versions[keys[0]];root.refDirectory[bucket].units=Object.entries(row.payload.versions).reduce((n,[k,v])=>n+JSON.stringify(k).length+1+String(v).length,0);}
 if(fault==='units')root.refDirectory[bucket].units++;
 if(fault==='pointer-revision')root.refDirectory[bucket].revision++;
 if(!['unresigned-bytes','checksum'].includes(fault))row=partitionRecord(row.key,row.payload);
 const reader=await instrumented();assert.throws(()=>reader.verifySharedDirectoryPiece(row,root,bucket));
});
test('cold genuine fresh bytes route every member then cached reads still bind mutated bytes',async()=>{
 const maker=await instrumented(),b=maker.buildSharedRefDirectory(manifest(),scope),row=structuredClone(b.records.find(row=>row.payload.ordinals.length>1)),reader=await instrumented(),bucket=row.payload.bucket;
 assert.equal(reader.verifySharedDirectoryPiece(row,b.root,bucket),row.payload);assert.equal(reader.routingCount(),Object.keys(row.payload.versions).length);
 const clone=structuredClone(row);assert.equal(reader.verifySharedDirectoryPiece(clone,b.root,bucket),clone.payload);
 clone.payload.ordinals[0]=b.root.nextOrdinal;assert.throws(()=>reader.verifySharedDirectoryPiece(clone,b.root,bucket));
});
