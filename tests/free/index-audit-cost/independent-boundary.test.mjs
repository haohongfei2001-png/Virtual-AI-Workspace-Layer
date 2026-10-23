/** Independent review. Place in tests/free/index-audit-cost, or set VAIWL_REVIEW_REPO. */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
const repo=process.env.VAIWL_REVIEW_REPO??fileURLToPath(new URL('../../../',import.meta.url));
const {A,B,scopeKey,variant,cleanup}=await import(pathToFileURL(join(repo,'tests/free/index-audit-cost/fixture.mjs')));
const {NATIVE_PARTITION_FORMAT,nativeRecord}=await import(pathToFileURL(join(repo,'src/data/native-partitions.mjs')));
const {emptyNativeFacts}=await import(pathToFileURL(join(repo,'src/data/native-facts.mjs')));
const api=await variant('candidate'),index=api.index;after(cleanup);
const manifest=(projects={P:1},refs={X:1},revision=1)=>({format:NATIVE_PARTITION_FORMAT,scopeKey,revision,sources:{},projects,refs,units:100,changes:[]});
function input(m=manifest()){const built=index.buildNativeVersionIndex(m,A),root=index.snapshotNativeIndexRoot(built.root,A),records=built.records.map(row=>index.snapshotNativeIndexPiece(row,root,row.payload.kind,row.payload.bucket));return {built,root,records};}
function oracle(root,records,options){const full=index.materializeNativeVersionIndex(root,A,records),projects=Object.keys(full.projects),refs=Object.keys(full.refs);return {projects:projects.slice(options.offset,options.offset+options.limit),refs:refs.slice(Math.max(0,options.offset-projects.length),Math.max(0,options.offset+options.limit-projects.length))};}
function frozenClone(row){const clone=structuredClone(row);for(const obj of [clone.payload.versions,clone.payload.ordinals,clone.payload,clone])Object.freeze(obj);return clone;}

test('only private proofs enter optimized selection; ordinary and frozen clones invoke original materializer',()=>{
 const {built,root,records}=input();assert.equal(index.hasNativeIndexSnapshotProof(root,records),true);
 const before=api.cost.materializeCalls;assert.deepEqual(api.selectNativeIndexPage(root,A,records),{projects:['P'],refs:['X']});assert.equal(api.cost.materializeCalls,before);
 for(const [r,rows] of [[built.root,records],[root,structuredClone(records)],[root,records.map(frozenClone)],[Object.freeze(structuredClone(root)),records]]){
  assert.equal(index.hasNativeIndexSnapshotProof(r,rows),false);const at=api.cost.materializeCalls;
  assert.deepEqual(api.selectNativeIndexPage(r,A,rows),{projects:['P'],refs:['X']});assert.equal(api.cost.materializeCalls,at+1);
 }
});
for(const field of ['scope','kind','bucket','revision','count'])test('proof query rejects changed '+field+' without blessing records',()=>{
 const {root,records}=input(manifest({}, {X:1})),changed=structuredClone(root),bucket=records[0].payload.bucket;let scope=A;
 if(field==='scope'){scope=B;changed.scopeKey=emptyNativeFacts(B).scopeKey;}
 if(field==='kind'){changed.projects=changed.refs;changed.refs={};}
 if(field==='bucket')changed.refs={[bucket==='00'?'01':'00']:changed.refs[bucket]};
 if(field==='revision'){changed.revision=2;changed.refs[bucket].revision=2;}
 if(field==='count')changed.refs[bucket].count++;
 const next=index.snapshotNativeIndexRoot(changed,scope);assert.equal(index.hasNativeIndexSnapshotProof(next,records),false);
 assert.throws(()=>api.selectNativeIndexPage(next,scope,records));
});
test('private proof remains data-only: requested foreign scope is still rejected',()=>{const {root,records}=input();assert.equal(index.hasNativeIndexSnapshotProof(root,records),true);assert.throws(()=>api.selectNativeIndexPage(root,B,records));});
test('unchanged pointer may be reused under a newer private root revision',()=>{const {root,records}=input(),next=structuredClone(root);next.revision=2;const captured=index.snapshotNativeIndexRoot(next,A);assert.equal(index.hasNativeIndexSnapshotProof(captured,records),true);const at=api.cost.materializeCalls;assert.deepEqual(api.selectNativeIndexPage(captured,A,records),{projects:['P'],refs:['X']});assert.equal(api.cost.materializeCalls,at);});
for(const mode of ['missing','duplicate','global-ordinal'])test('private proof does not replace complete-inventory '+mode+' checks',()=>{
 let y='Y';while(index.nativeIndexBucket(y)===index.nativeIndexBucket('X'))y+='Y';let {built,root,records}=input(manifest({}, {X:1,[y]:1}));
 if(mode==='missing')records=records.slice(1);if(mode==='duplicate')records=[...records,records[0]];
 if(mode==='global-ordinal')records=built.records.map(row=>{row.payload.ordinals=[0];const revised=nativeRecord(row.key,row.payload);return index.snapshotNativeIndexPiece(revised,root,'refs',row.payload.bucket);});
 assert.equal(index.hasNativeIndexSnapshotProof(root,records),true);assert.throws(()=>api.selectNativeIndexPage(root,A,records,{offset:0,limit:1}));
});
for(const field of ['payload','versions'])test('external '+field+' prototype retains old rejection',()=>{const {root,built}=input(manifest({}, {X:1})),row=structuredClone(built.records[0]);Object.setPrototypeOf(field==='payload'?row.payload:row.payload.versions,{unexpected:true});assert.throws(()=>api.selectNativeIndexPage(root,A,[row]),/non-json-object/);});
for(const id of ['X','3'])for(const field of ['version','versions'])test('external changing '+field+' retains old rejection for '+id,()=>{
 const {root,built}=input(manifest({}, {[id]:1}));
 const make=()=>{const row=structuredClone(built.records[0]);let reads=0;if(field==='version')Object.defineProperty(row.payload.versions,id,{enumerable:true,get:()=>++reads===1?1:'invalid'});else Object.defineProperty(row.payload,'versions',{enumerable:true,get:()=>++reads===1?{[id]:1}:{'with"quote':1}});return row;};
 assert.throws(()=>index.materializeNativeVersionIndex(root,A,[make()]));assert.throws(()=>api.selectNativeIndexPage(root,A,[make()]));
});
test('external iterator is consumed once before any proof decision',()=>{const {root,records}=input();let calls=0;const iterable={[Symbol.iterator](){calls++;return (calls===1?records:[])[Symbol.iterator]();}};assert.deepEqual(api.selectNativeIndexPage(root,A,iterable),{projects:['P'],refs:['X']});assert.equal(calls,1);});
test('caller supplied every method cannot forge array proof',()=>{const {root,records}=input(),rows=structuredClone(records);rows.every=()=>true;rows[0].payload.versions[Object.keys(rows[0].payload.versions)[0]]=2;assert.throws(()=>api.selectNativeIndexPage(root,A,rows),/corrupt-native-record/);});

test('1440 private-snapshot differential cases preserve numeric order and extreme version/offset values',()=>{
 let seed=572081;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
 for(let trial=0;trial<120;trial++){
  const names=[...(trial%3?[]:['0','2','10','4294967294']),'4294967295','01','000','-0','_','A','toJSON','valueOf',...Array.from({length:40},(_,i)=>'X'+i+'_'.repeat(i))];
  const table=()=>Object.fromEntries(shuffle([...names]).slice(0,random(names.length+1)).map((key,i)=>[key,[1,9,10,99,100,Number.MAX_SAFE_INTEGER][i%6]]));
  const built=index.buildNativeVersionIndex(manifest(table(),table(),Number.MAX_SAFE_INTEGER),A);
  for(const kind of ['projects','refs']){const rows=built.records.filter(row=>row.payload.kind===kind),count=rows.reduce((n,row)=>n+row.payload.ordinals.length,0),ordinals=shuffle(Array.from({length:count},(_,i)=>i));for(const row of rows){row.payload.ordinals=row.payload.ordinals.map(()=>ordinals.pop());Object.assign(row,nativeRecord(row.key,row.payload));}built.root[kind]=Object.fromEntries(shuffle(Object.entries(built.root[kind])));}
  const root=index.snapshotNativeIndexRoot(built.root,A),records=shuffle(built.records).map(row=>index.snapshotNativeIndexPiece(row,root,row.payload.kind,row.payload.bucket));
  assert.equal(index.hasNativeIndexSnapshotProof(root,records),true);
  const numeric=records.some(row=>Object.keys(row.payload.versions).some(key=>/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<4294967295));
  for(let page=0;page<12;page++){const options={offset:[0,1,random(120),Number.MAX_SAFE_INTEGER][random(4)],limit:[1,2,17,5000][random(4)]},expected=oracle(root,records,options),at=api.cost.materializeCalls;assert.deepEqual(api.selectNativeIndexPage(root,A,records,options),expected);assert.equal(api.cost.materializeCalls-at,numeric?1:0);}
 }
});

test('optimized private-snapshot path keeps exact 16MiB JSON limit with both maps and maximum versions',()=>{
 const entries=(prefix,count)=>Object.fromEntries(Array.from({length:count},(_,i)=>[prefix+i.toString(16).padStart(5,'0')+'x'.repeat(90),Number.MAX_SAFE_INTEGER]));
 const built=index.buildNativeVersionIndex(manifest(entries('P',200),entries('R',1000),Number.MAX_SAFE_INTEGER),A),full=index.materializeNativeVersionIndex(built.root,A,built.records),limit=16*1024*1024;
 const changes=Array.from({length:13},()=>({revision:1,projects:[],refs:[]}));full.changes=changes;built.root.changes=changes;
 let remaining=limit-JSON.stringify(full).length;for(const row of changes){const count=Math.min(10000,Math.floor((remaining+1)/131));if(count){row.refs=Array(count).fill('x'.repeat(128));remaining-=count*131-1;}}
 const last=changes.findLast(row=>row.refs.length);if(remaining>=4)last.refs.push('y'.repeat(remaining-3));else if(remaining){last.refs[0]='x'.repeat(128-(4-remaining));last.refs.push('y');}
 assert.equal(JSON.stringify(full).length,limit);assert(JSON.stringify(built.root).length<limit);
 let root=index.snapshotNativeIndexRoot(built.root,A),records=built.records.map(row=>index.snapshotNativeIndexPiece(row,root,row.payload.kind,row.payload.bucket));
 const at=api.cost.materializeCalls;assert.deepEqual(api.selectNativeIndexPage(root,A,records,{offset:0,limit:1}),{projects:[Object.keys(full.projects)[0]],refs:[]});assert.equal(api.cost.materializeCalls,at);
 const growable=changes.find(row=>row.refs.some(key=>key.length<128));assert(growable);growable.refs[growable.refs.findIndex(key=>key.length<128)]+='z';
 assert.equal(JSON.stringify(full).length,limit+1);root=index.snapshotNativeIndexRoot(built.root,A);assert.equal(index.hasNativeIndexSnapshotProof(root,records),true);
 assert.throws(()=>api.selectNativeIndexPage(root,A,records,{offset:0,limit:1}),/native-manifest-too-large/);assert.equal(api.cost.materializeCalls,at);
});
