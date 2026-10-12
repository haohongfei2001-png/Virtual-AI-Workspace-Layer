import test from 'node:test';
import assert from 'node:assert/strict';
import {PartitionedState,headerState,checkManifest,PARTITION_FORMAT} from '../../src/data/partitioned.mjs';
import {digest,stable} from '../../src/data/hash.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {scopeOf} from '../../simulator/data.mjs';
const scope=normalizedScope(scopeOf('A'));
function fixture(){return {format:PARTITION_FORMAT,generation:'one',scopeKey:scope.key,revision:1,channel:'synthetic',sources:{},workspaces:{W:{id:'W',name:'汉字😀 "\\\n\ud800',aliases:['é','\u2028'],icon:'book',order:0,locked:true,owner:'human'}},preferences:{},refVersions:{},humanRefs:[],units:0,changes:[]};}
function save(manifest=fixture(),change=()=>{}){
 const writes=[],tx={objectStore:store=>({put:row=>writes.push({store,row:structuredClone(row)})})},state=headerState(manifest);state.revision=2;change(state);
 const next=new PartitionedState({}).saveMutation(tx,{manifest,pieces:new Map()},null,state,[]);
 return {next,writes};
}
test('saveMutation publishes canonical digest root and exact prior checkpoint without mutating inputs',()=>{
 const before=fixture(),copy=structuredClone(before),{next,writes}=save(before,state=>{state.workspaces=structuredClone(state.workspaces);state.workspaces.W.name='新名字😀';});
 assert.deepEqual(before,copy);assert.equal(writes.length,2);
 const checkpoint=writes.find(x=>x.store==='b23_checkpoints').row,root=writes.find(x=>x.store==='b23_states').row;
 assert.deepEqual(checkpoint.payload,copy);assert.equal(checkpoint.checksum,digest(copy));assert.equal(root.checksum,digest(next));assert.deepEqual(root.payload,next);assert.equal(root.key,scope.key);assert.equal(root.payload.revision,2);assert.equal(checkpoint.payload.revision,1);
});
test('Unicode/escape code units and insertion order produce identical canonical root checksums',()=>{
 const first=fixture(),second=Object.fromEntries(Object.entries(first).reverse());second.workspaces={W:Object.fromEntries(Object.entries(first.workspaces.W).reverse())};
 const a=save(first),b=save(second);assert.equal(stable(a.next).length,JSON.stringify(a.next).length);assert.equal(digest(a.next),digest(b.next));assert.equal(a.writes[1].row.checksum,b.writes[1].row.checksum);
});
test('saveMutation retains exact aggregate 128Mi boundary and rejects overflow',()=>{
 const value=fixture();value.units=128*1024*1024;assert.equal(save(value).next.units,value.units);value.units++;assert.throws(()=>save(value),/invalid-partition-manifest/);
});
for(const version of [0,-1,1.5,3])test(`saveMutation rejects invalid reference version ${version}`,()=>{const value=fixture();value.refVersions.R=version;assert.throws(()=>save(value),/invalid-partition-version/);});
test('scope validation remains contextual and malformed root schema is rejected',()=>{
 const value=fixture();assert.throws(()=>checkManifest(value,normalizedScope(scopeOf('B')).key),/invalid-partition-manifest/);value.unexpected=true;assert.throws(()=>save(value),/invalid-schema/);
});
test('saveMutation rejects over100k reference inventory',()=>{
 const value=fixture();value.refVersions=Object.fromEntries(Array.from({length:100001},(_,i)=>['R'+i,1]));assert.throws(()=>save(value),/partition-capacity/);
});
test('saveMutation rejects manifest exceeding16Mi even when individual change arrays and IDs are valid',()=>{
 const value=fixture(),refs=Array(20000).fill('r'.repeat(128));value.changes=Array.from({length:7},()=>({revision:1,refs}));assert(JSON.stringify(value).length>16*1024*1024);assert.throws(()=>save(value),/state-too-large/);
});
for(const invalid of [undefined,NaN,Infinity,()=>{},Symbol('x'),1n])test(`saveMutation rejects nonJSON nested metadata ${typeof invalid}:${String(invalid)}`,()=>{
 const value=fixture();value.workspaces.W.extra=[invalid];assert.throws(()=>save(value),/non-json|invalid|BigInt/);
});
test('saveMutation rejects cyclic nested metadata and cyclic changes arrays',()=>{
 const value=fixture();value.workspaces.W.extra=[];value.workspaces.W.extra.push(value.workspaces.W.extra);assert.throws(()=>save(value));
 const changes=fixture();changes.changes=[{revision:1,refs:[]}];changes.changes[0].refs.push(changes.changes[0].refs);assert.throws(()=>save(changes),/invalid-id/);
});
function sizedManifest(target){
 const value=fixture();value.changes=Array.from({length:7},()=>({revision:1,refs:Array(20000).fill('r')}));
 // Include the empty revision-2 change record saveMutation appends, then grow
 // only valid ASCII IDs. No metadata field or schema constraint is bypassed.
 const projected={...value,revision:2,changes:[...value.changes,{revision:2,refs:[]}]};
 let remaining=target-JSON.stringify(projected).length;
 for(const change of value.changes)for(let index=0;index<change.refs.length&&remaining>0;index++){
  const growth=Math.min(127,remaining);change.refs[index]='r'.repeat(1+growth);remaining-=growth;
 }
 assert.equal(remaining,0);assert.equal(JSON.stringify(projected).length,target);return value;
}
test('saveMutation accepts exactly16Mi canonical root and rejects one additional code unit',()=>{
 const boundary=16*1024*1024,accepted=save(sizedManifest(boundary));
 assert.equal(stable(accepted.next).length,boundary);assert.equal(accepted.writes.find(x=>x.store==='b23_states').row.checksum,digest(accepted.next));
 assert.throws(()=>save(sizedManifest(boundary+1)),/state-too-large/);
});
test('valid shared aliases array is serialized at every occurrence without being mistaken for a cycle',()=>{
 const value=fixture(),aliases=['共同😀','quote"\\'];value.workspaces.W.aliases=aliases;value.workspaces.X={...value.workspaces.W,id:'X',name:'Second',aliases};
 const result=save(value);assert.equal(result.writes.find(x=>x.store==='b23_states').row.checksum,digest(result.next));assert.deepEqual(result.next.workspaces.W.aliases,result.next.workspaces.X.aliases);
});
