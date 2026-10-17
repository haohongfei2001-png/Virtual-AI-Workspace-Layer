import test from 'node:test';
import assert from 'node:assert/strict';
import * as repository from '../../src/data/native-repository.mjs';
import * as partitions from '../../src/data/native-partitions.mjs';
import * as index from '../../src/data/native-version-index.mjs';
import * as facts from '../../src/data/native-facts.mjs';
import * as hashes from '../../src/data/hash.mjs';
import * as mock from '../b23/mock-idb.mjs';
import * as contracts from '../b23/contracts.mjs';

/** Portable contracts for tests/free/native-current-gc-independent.test.mjs.
 * Strict relative imports; in-memory MockIDB only. No alternate production
 * implementation, environment switch, browser or formal 10k run.
 */
const candidate={...repository,...partitions,...index,...facts,...hashes,...mock,...contracts};
const now='2026-10-13T00:00:00Z',gate={channel:'synthetic',sourceId:'independent',generation:'one'};
const rootKey=candidate.emptyNativeFacts(candidate.A).scopeKey;
async function raw(h,key=rootKey,store='native_states'){
 const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),q=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
}
async function put(h,row,store='native_states'){
 const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
}
async function all(h){
 const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations']),out={};for(const name of ['native_states','native_operations']){out[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){out[name].push(q.result.value);q.result.continue();}};}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});
}
function request(revision,ids=['R'],first=false){
 return {operationId:'review_'+revision,expectedRevision:revision-1,batch:{scopeKey:rootKey,sourceRevision:revision,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:first?[{id:'P',nativeName:'Original project',nativeUrl:'https://fixture.test/project/P',availability:'available'}]:[],refs:ids.map(id=>({id,nativeTitle:id+' revision '+revision,nativeUrl:'https://fixture.test/c/'+id,availability:'available'})),membership:ids.map(id=>({id,state:id==='R'?'PROJECT':'NONE',projectId:id==='R'?'P':null})),inventory:{projects:'partial',conversations:'partial',cursor:null}}};
}
const makeOwner=(M,h,source=gate)=>new M.NativeRepository({baseRepository:h.base,observationGate:()=>source,clock:()=>now});
async function write(M,h,ids=['R']){const n=await h.native.version(M.A)+1;const q=request(n,ids);const r=await h.native.apply(M.A,q);assert.equal(r.ok,true,JSON.stringify(r));return q;}
async function setup(M,indexed){
 const h=await M.harness(new M.MockIDBFactory(),{seed:false});h.native=makeOwner(M,h);
 assert.equal((await h.native.apply(M.A,request(1,['R','U'],true))).ok,true);
 if(indexed)assert.equal((await h.native.migrateVersionIndex(M.A,{operationId:'review_migrate',expectedRevision:1})).ok,true);
 await write(M,h);return h;
}
const piece=(M,id,version)=>M.nativePartitionKey(rootKey,'refs',id,version);
async function historyScenario(M,indexed,mode){
 const h=await setup(M,indexed);try{
  const original=await raw(h),revision=original.payload.revision;
  const complete={revision,projects:[],refs:['R']},empty={revision,projects:[],refs:[]};
  const histories={empty:[],missing:[{revision:1,projects:['P'],refs:['U']}],sparse:[{revision:1,projects:[],refs:['U']},complete],duplicates:[complete,complete,empty],incompleteFirst:[empty,complete]};
  original.payload.changes=histories[mode];const old=M.nativeRecord(rootKey,original.payload);await put(h,old);
  assert.deepEqual((await h.native.header(M.A)).manifest.changes,old.payload.changes);
  const before=await all(h),q=await write(M,h,['U']);
  assert.deepEqual(await raw(h,M.nativeCheckpointKey(rootKey)),{...old,key:M.nativeCheckpointKey(rootKey)});
  if(mode!=='incompleteFirst')assert.equal(await raw(h,piece(M,'R',1)),undefined,'complete current hints or absent-hint fallback must retire the old piece');
  // Duplicate incomplete first hints are an existing conservative-GC limit.
  // Require live-data safety here, without freezing that leak as a feature.
  assert.deepEqual((await raw(h)).payload.changes,[{revision:revision+1,projects:[],refs:['U']}]);
  const firstState=await all(h);
  for(const receipt of before.native_operations.filter(r=>r.key!==rootKey))assert(firstState.native_operations.some(row=>JSON.stringify(row)===JSON.stringify(receipt)));
  assert.equal((await h.native.apply(M.A,q)).replayed,true);assert.deepEqual(await all(h),firstState);
  const facts=await h.native.read(M.A);assert.equal(facts.refs.R.nativeTitle,'R revision '+revision);assert.equal(facts.membership.R.projectId,'P');assert.equal(facts.projects.P.nativeName,'Original project');
  await write(M,h,['R']);assert.equal(await raw(h,piece(M,'U',1)),undefined);
  const final=await h.native.read(M.A);assert.equal(final.refs.R.nativeTitle,'R revision '+(revision+2));assert.equal(final.refs.U.nativeTitle,'U revision '+(revision+1));assert.equal(final.membership.R.projectId,'P');
 }finally{h.close();}
}
for(const indexed of [false,true])for(const mode of ['empty','missing','sparse','duplicates','incompleteFirst'])test(`${indexed?'indexed':'partitioned'} ${mode}: exact checkpoint, live facts, replay and precise current GC work list`,async()=>{
 await historyScenario(candidate,indexed,mode);
});

for(const indexed of [false,true])test(`${indexed?'indexed':'partitioned'} accepts a legacy 64-row root and publishes a schema-valid single current row`,async()=>{
 const M=candidate,h=await setup(M,indexed);try{
  const old=await raw(h),revision=old.payload.revision;
  old.payload.changes=[...Array.from({length:63},()=>({revision:1,projects:[],refs:[]})),{revision,projects:[],refs:['R']}];
  const legacy=M.nativeRecord(rootKey,old.payload);await put(h,legacy);
  assert.deepEqual((await h.native.header(M.A)).manifest.changes,legacy.payload.changes);
  await write(M,h,['U']);const root=await raw(h);
  assert.deepEqual(root.payload.changes,[{revision:revision+1,projects:[],refs:['U']}]);
  assert.deepEqual(await raw(h,M.nativeCheckpointKey(rootKey)),{...legacy,key:M.nativeCheckpointKey(rootKey)});
  if(indexed)M.validateNativeIndexRoot(root.payload,M.A);else M.validateNativeManifest(root.payload,M.A);
  assert.equal(await raw(h,piece(M,'R',1)),undefined);assert(await raw(h,piece(M,'R',revision)));assert(await raw(h,piece(M,'U',1)));
  const f=await h.native.read(M.A);assert.equal(f.refs.R.nativeTitle,'R revision '+revision);assert.equal(f.refs.U.nativeTitle,'U revision '+(revision+1));assert.equal(f.membership.R.projectId,'P');
 }finally{h.close();}
});

for(const indexed of [false,true])for(const checkpoint of [false,true])test(`${indexed?'indexed':'partitioned'} stale-history bytes ${checkpoint?'checkpoint':'root'} still fail verification after caching`,async()=>{
 const M=candidate,h=await setup(M,indexed);try{
  const key=checkpoint?M.nativeCheckpointKey(rootKey):rootKey;
  await h.native.header(M.A);const old=await raw(h,key);old.payload.changes.unshift({revision:1,projects:[],refs:['altered']});await put(h,old);
  const before=await all(h),n=(await raw(h)).payload.revision+1,r=await h.native.apply(M.A,request(n));
  if(checkpoint){assert.equal(r.ok,true);assert(await raw(h,piece(M,'R',1)),'unverified checkpoint cannot authorize GC');}
  else{assert.equal(r.ok,false);assert.equal(r.reason,'corrupt-native-record');assert.deepEqual(await all(h),before);}
 }finally{h.close();}
});

for(const indexed of [false,true])test(`${indexed?'indexed':'partitioned'} repair validates current shadow, clears hints and subsequently fully reconciles`,async()=>{
 const M=candidate,h=await setup(M,indexed);try{
  const before=await raw(h),checkpoint=await raw(h,M.nativeCheckpointKey(rootKey));assert.equal(before.payload.changes.length,1);
  const broken={...before,checksum:'0'.repeat(64)};await put(h,broken);const hash=M.digest(broken),r=await h.native.recover(M.A,{operationId:'independent_repair',damagedHash:hash});assert.equal(r.ok,true);
  const repaired=await raw(h);assert.equal(repaired.payload.revision,before.payload.revision+1);assert.deepEqual(repaired.payload.changes,[]);assert.equal(repaired.payload.sources.independent.revoked,true);assert.deepEqual(await raw(h,M.nativeCheckpointKey(rootKey)),checkpoint);
  const snapshot=await all(h);assert.equal((await h.native.recover(M.A,{operationId:'independent_repair',damagedHash:hash})).replayed,true);assert.deepEqual(await all(h),snapshot);
  const denied=await h.native.apply(M.A,request(repaired.payload.revision+1));assert.equal(denied.reason,'native-source-invalidated');assert.deepEqual(await all(h),snapshot);
  h.native=makeOwner(M,h,{...gate,sourceId:'newly_authorized'});await write(M,h);assert.equal(await raw(h,piece(M,'R',1)),undefined);assert(await raw(h,piece(M,'R',before.payload.revision)));assert(await raw(h,piece(M,'U',1)));assert.equal((await h.native.read(M.A)).membership.R.projectId,'P');
 }finally{h.close();}
});

test('legacy root with 10001 existing refs: first partitioning preserves every pointer and the existing hint bound (pure writer boundary, not a 10k owner run)',()=>{
 function run(M){
  const current=M.emptyNativeFacts(M.A);current.revision=1;
  for(let i=0;i<10001;i++)current.refs['T'+i]={id:'T'+i};
  const next={...current,revision:2},records=[],deletes=[];
  const store={put:row=>records.push(row),delete:key=>deletes.push(key),get(){throw Error('first partitioning cannot GC a partition checkpoint');}};
  const root=M.saveNativePieces(store,M.A,current,next,null,{kind:'INVALIDATE_NATIVE_SOURCE'});
  assert.equal(Object.keys(root.refs).length,10001);assert.equal(root.refs.T10000,2);assert.equal(root.changes[0].refs.length,10000);assert.equal(root.changes[0].refs.includes('T10000'),false);assert(records.some(r=>r.key===piece(M,'T10000',2)));assert.equal(deletes.length,0);
  // These are deliberately metadata-only rows, not full-facts or audit evidence.
  return {root,records,deletes};
 }
 run(candidate);
});

test('over-limit ordinary observation is rejected atomically before any truncated work list can publish',async()=>{
 const M=candidate,h=await setup(M,false);try{
  const n=await h.native.version(M.A)+1,q=request(n);q.batch.refs=Array.from({length:5001},(_,i)=>({id:'X'+i,nativeTitle:'x',nativeUrl:'https://fixture.test/c/X'+i,availability:'available'}));
  const before=await all(h),r=await h.native.apply(M.A,q);assert.equal(r.ok,false);assert.equal(r.reason,'invalid-native-batch');assert.deepEqual(await all(h),before);
 }finally{h.close();}
});
