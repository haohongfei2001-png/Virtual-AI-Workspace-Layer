import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scopeOf} from '../../simulator/data.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {nativeRecord,NATIVE_PARTITION_FORMAT} from '../../src/data/native-partitions.mjs';
import {manifest_PARTITION_FORMAT,manifest_partitionRecord} from '../../src/data/partition-manifest.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {captureJSONSnapshot} from '../../src/data/capture-json-snapshot.mjs';
const scope=scopeOf('A'),scopeKey=emptyNativeFacts(scope).scopeKey;let nonce=0;
async function measured(name){
 const url=new URL('../../src/data/'+name+'.mjs',import.meta.url);let source=await readFile(url,'utf8');
 source=source.replace('import {VerifiedRecordCache}','import {VerifiedRecordCache as BaseCache}');
 source='let byteTraversals=0;class VerifiedRecordCache extends BaseCache{read(row,...args){if(row.payload?.format?.includes("index")||row.payload?.format?.includes("directory"))byteTraversals++;return super.read(row,...args);}}\n'+source;
 source=source.replace(/\bstable(?=[,}])/,'stable as originalStable');
 source+='\nlet encodings=0;function stable(value){if(value?.format?.includes("index")||value?.format?.includes("directory"))encodings++;return originalStable(value);}export const encodingCount=()=>encodings;export const byteTraversalCount=()=>byteTraversals;\n//'+nonce++;
 source=source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?`from '${new URL(path,url).href}'`:all);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
function native(api){return api.buildNativeVersionIndex({format:NATIVE_PARTITION_FORMAT,scopeKey,revision:1,sources:{},projects:{},refs:{R:1},units:100,changes:[{revision:1,projects:[],refs:['R']}]},scope).root;}
function shared(api){const state=emptyState(scope);return api.buildSharedRefDirectory({format:manifest_PARTITION_FORMAT,generation:'one',scopeKey,revision:1,channel:state.channel,sources:state.sources,workspaces:state.workspaces,preferences:state.preferences,refVersions:{R:1},humanRefs:[],units:100,changes:[{revision:1,refs:['R']}]},scope).root;}
const profiles=[
 {name:'native',file:'native-version-index',build:native,record:nativeRecord,validate:'validateNativeIndexRoot',snapshot:'snapshotNativeIndexRoot',reader:'createNativeIndexRootRecordReader'},
 {name:'shared',file:'shared-ref-directory',build:shared,record:manifest_partitionRecord,validate:'validateSharedDirectoryRoot',snapshot:'snapshotSharedDirectoryRoot',reader:'createSharedDirectoryRootRecordReader'},
];
for(const p of profiles){
 test(p.name+' root proof eliminates repeated encoding only for its deeply frozen captured object',async()=>{
  const api=await measured(p.file),raw=p.build(api),capture=api[p.snapshot]??((value,s)=>api[p.validate](structuredClone(value),s));
  const snapshot=capture(raw,scope),count=api.encodingCount(),traversals=api.byteTraversalCount();
  assert.equal(capture(snapshot,scope),snapshot,'private captured proof survives writer and retention handoffs');
  for(let i=0;i<20;i++)api[p.validate](snapshot,scope);
  assert.equal(api.encodingCount(),count,'one immutable verified root must not be fully encoded again for readers, writer and retention');
  assert.equal(api.byteTraversalCount(),traversals,'private proof must bypass strictJSON too, not just the schema cache');
  assert.throws(()=>capture(snapshot,scopeOf('B')));
  const frozen=value=>{if(value&&typeof value==='object'){assert(Object.isFrozen(value));for(const key of Object.keys(value))frozen(value[key]);}};frozen(snapshot);
  assert.notEqual(snapshot,raw);assert.equal(Object.isFrozen(raw),false,'capturing must not freeze the caller input');
  raw.changes[0].refs.push('later');assert.deepEqual(snapshot.changes[0].refs,['R']);
  assert.throws(()=>snapshot.changes[0].refs.push('changed'),TypeError);
  assert.throws(()=>api[p.validate](snapshot,scopeOf('B')));
  const clone=structuredClone(snapshot);clone.units=-1;assert.throws(()=>api[p.validate](clone,scope),'cloning cannot carry private proof');
  const forged=structuredClone(snapshot);forged.units=-1;Object.freeze(forged);assert.throws(()=>api[p.validate](forged,scope),'freezing alone cannot create proof');
 });
 test(p.name+' root storage reader checks every fresh byte and checksum before certifying its snapshot',async()=>{
  const api=await measured(p.file);assert.equal(typeof api[p.reader],'function');
  const read=api[p.reader](),raw=p.record(scopeKey,p.build(api)),first=read(raw,scope),fresh=structuredClone(raw),before=api.byteTraversalCount(),second=read(fresh,scope);
  assert.equal(api.byteTraversalCount(),before+1,'every fresh storage read must compare every byte even with a warm checksum');
  assert.deepEqual(first,second);assert.notEqual(first,second);assert.notEqual(second,fresh.payload);assert(Object.isFrozen(second));
  for(const mutate of [row=>row.payload.units++,row=>row.checksum='0'.repeat(64),row=>{row.payload.changes[0].refs[0]='changed';},row=>{row.payload.units=-1;Object.assign(row,p.record(scopeKey,row.payload));}]){
   const invalid=structuredClone(raw);mutate(invalid);assert.throws(()=>read(invalid,scope));
  }
  assert.throws(()=>read(structuredClone(raw),scopeOf('B')));
  const traversals=api.byteTraversalCount(),encodings=api.encodingCount();api[p.validate](first,scope);api[p.validate](second,scope);
  assert.equal(api.byteTraversalCount(),traversals);assert.equal(api.encodingCount(),encodings);
  raw.payload.changes[0].refs.push('after-read');assert.deepEqual(first.changes[0].refs,['R']);
 });
 test(p.name+' snapshot validates the captured getter value, not an earlier mutable observation',async()=>{
  const api=await measured(p.file),raw=p.build(api),capture=api[p.snapshot];assert.equal(typeof capture,'function');
  let reads=0;const input={...raw,get units(){return ++reads===1?100:-1;}};
  const snapshot=capture(input,scope);assert.equal(reads,1);assert.equal(snapshot.units,100);api[p.validate](snapshot,scope);
 });
 test(p.name+' proof remains scope-normalized and cannot transfer through serialization or caller freezing',async()=>{
  const api=await measured(p.file),snapshot=api[p.snapshot](p.build(api),scope);
  assert.equal(api[p.validate](snapshot,{...scope,key:'caller-forged-key'}),snapshot,'scope key is recomputed from the normalized identity');
  assert.throws(()=>api[p.validate](snapshot,{...scope,verified:false,key:scopeKey}));
  const metrics=()=>api.encodingCount()+api.byteTraversalCount();
  for(const clone of [structuredClone(snapshot),JSON.parse(JSON.stringify(snapshot)),Object.freeze(structuredClone(snapshot))]){
   const before=metrics();assert.equal(api[p.validate](clone,scope),clone);assert(metrics()>before,'a new identity must take full validation despite byte equality or freezing');
  }
 });
 test(p.name+' storage reader captures original envelope and nested getter values exactly once',async()=>{
  const api=await measured(p.file),read=api[p.reader](),raw=p.record(scopeKey,p.build(api));
  let keys=0,checksums=0,payloads=0,units=0;
  const payload={...raw.payload,get units(){return ++units===1?100:-1;}},row={get key(){return ++keys===1?scopeKey:'wrong';},get checksum(){return ++checksums===1?raw.checksum:'bad';},get payload(){payloads++;return payload;}};
  const snapshot=read(row,scope);assert.deepEqual([keys,checksums,payloads,units],[1,1,1,1]);assert.equal(snapshot.units,100);
  let rejectedReads=0;const invalid={...raw.payload,get units(){return ++rejectedReads===1?-1:100;}};
  assert.throws(()=>api[p.snapshot](invalid,scope));assert.equal(rejectedReads,1,'capture must precede all schema observations');
 });
 test(p.name+' storage reader enforces exact current or explicitly requested alias keys',async()=>{
  const api=await measured(p.file),read=api[p.reader](),raw=p.record(scopeKey,p.build(api)),alias=JSON.stringify([scopeKey,'checkpoint']);
  read(raw,scope);
  assert.throws(()=>read({...raw,key:'wrong'},scope));
  assert.throws(()=>read({...raw,key:alias},scope));
  const snapshot=read({...raw,key:alias},scope,alias);assert.deepEqual(snapshot,raw.payload);
  assert.throws(()=>read({...raw,key:scopeKey},scope,alias));
  for(const key of [null,0,{},'',true])assert.throws(()=>read({...raw,key},scope,key));
  assert.throws(()=>read({...raw,key:alias},scopeOf('B'),alias),'a matching physical alias does not certify another scope');
 });
 test(p.name+' warm readers reject correctly checksummed malformed roots without poisoning valid proof',async()=>{
  const api=await measured(p.file),read=api[p.reader](),root=p.build(api),valid=p.record(scopeKey,root);read(valid,scope);
  const faults=[value=>value.units=-1,value=>value.units=128*1024*1024+1,value=>value.revision=0,value=>value.changes[0].revision=2,value=>value.changes[0].refs[0]='__proto__',value=>value.sources.invalid={},value=>value.extra=true,value=>value.scopeKey='foreign'];
  if(p.name==='native')faults.push(value=>value.refs[Object.keys(value.refs)[0]].count=100001,value=>value.refs[Object.keys(value.refs)[0]].revision=2);
  else faults.push(value=>value.nextOrdinal=0,value=>value.refDirectory[Object.keys(value.refDirectory)[0]].count=100001,value=>value.refDirectory[Object.keys(value.refDirectory)[0]].units=0,value=>value.humanRefs=['R','R']);
  for(const mutate of faults){
   const changed=structuredClone(root);mutate(changed);assert.throws(()=>read(p.record(scopeKey,changed),scope));
   assert.deepEqual(read(structuredClone(valid),scope),root);
  }
 });
 test(p.name+' root capture preserves strict prototype, JSON and cycle rejection',async()=>{
  const api=await measured(p.file),root=p.build(api),read=api[p.reader](),record=p.record(scopeKey,root);
  for(const mutate of [value=>Object.setPrototypeOf(value,{custom:true}),value=>Object.setPrototypeOf(value.changes[0],{custom:true}),value=>value.changes[0].refs[0]=undefined,value=>delete value.changes[0].refs[0],value=>value.changes[0].refs.push(value.changes),value=>value.units=Infinity]){
   const invalid=structuredClone(root);mutate(invalid);
   assert.throws(()=>api[p.snapshot](invalid,scope));assert.throws(()=>read({...record,payload:invalid},scope));
  }
  let getterReads=0,jsonCalls=0;
  const unsupported=Object.assign(Object.create({toJSON(){jsonCalls++;return root.changes[0];}}),root.changes[0]);
  const input={...root,get changes(){getterReads++;return [unsupported];}};
  assert.throws(()=>api[p.snapshot](input,scope),/non-json-object/);assert.equal(getterReads,1);assert.equal(jsonCalls,0);
  assert.deepEqual(read(structuredClone(record),scope),root);
 });
}
test('strict JSON capture preserves order, shared data, null prototypes and own __proto__ without evaluating iterators',()=>{
 let iterations=0;const source=Object.create(null),shared={value:1};
 Object.defineProperty(source,'__proto__',{enumerable:true,value:shared});source.second=shared;source.list=[1,2];
 source.list[Symbol.iterator]=()=>{iterations++;throw Error('not-used');};
 const copy=captureJSONSnapshot(source);
 assert.equal(Object.getPrototypeOf(copy),null);assert.deepEqual(Object.keys(copy),['__proto__','second','list']);
 assert.equal(copy.__proto__,copy.second);assert.notEqual(copy.second,shared);assert.deepEqual(copy.list,[1,2]);assert.equal(iterations,0);
});
test('final native writer root is independently captured and privately proved without a second final encoding',async()=>{
 const api=await measured('native-version-index'),old=native(api),metadata={sources:{},units:101,changes:[{revision:2,projects:[],refs:[]}]};
 const built=api.buildNativeIndexUpdateRecord(old,scope,2,{projects:{},refs:{}},[],metadata),before=api.encodingCount();
 for(let i=0;i<20;i++)api.validateNativeIndexRoot(built.root,scope);
 assert.equal(api.encodingCount(),before);assert.equal(built.rootRecord.payload,built.root);
 assert(Object.isFrozen(built.root));assert(Object.isFrozen(built.root.refs[Object.keys(built.root.refs)[0]]));
 assert.equal(Object.isFrozen(old.refs[Object.keys(old.refs)[0]]),false,'final capture must not freeze reused caller pointers');
 old.refs[Object.keys(old.refs)[0]].count=99;metadata.changes[0].refs.push('later');
 assert.equal(built.root.refs[Object.keys(built.root.refs)[0]].count,1);assert.deepEqual(built.root.changes[0].refs,[]);
 assert.deepEqual(built.rootRecord,nativeRecord(scopeKey,built.root));
});
