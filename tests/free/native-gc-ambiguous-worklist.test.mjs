import test from 'node:test';
import assert from 'node:assert/strict';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {NativeRepository,validateNativeRootRecord} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {nativeRecord,nativePartitionKey,nativeRecoveryKey,nativeCheckpointKey} from '../../src/data/native-partitions.mjs';
import {buildNativeVersionIndex,nativeIndexKey,nativeIndexBucket} from '../../src/data/native-version-index.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';

// Real NativeRepository owner over the existing serial MockIDB only. These
// bounded fixtures are not browser durability, timing or formal 10k evidence.
const scope={verified:true,provider:'hf_synthetic_only',accountId:'A',organizationId:'fixture_org'};
const scopeKey=emptyNativeFacts(scope).scopeKey;
const now='2026-10-13T00:00:00Z',gate={channel:'synthetic',sourceId:'ambiguous_gc',generation:'one'};
const piece=(kind,id,revision)=>nativePartitionKey(scopeKey,kind,id,revision);
function request(n,{projects=n<=3?['P']:[],refs=n===1?['R','U','N']:n<=3?['R']:['U']}={}){
 if(n===1)projects=[...projects,'Q'];
 return {operationId:'ambiguous_'+n,expectedRevision:n-1,batch:{scopeKey,sourceRevision:n,observedAt:now,validUntil:'2026-10-14T00:00:00Z',
  projects:projects.map(id=>({id,nativeName:id+' revision '+n,nativeUrl:'https://fixture.test/project/'+id,availability:'available'})),
  refs:refs.map(id=>({id,nativeTitle:id+' revision '+n,nativeUrl:'https://fixture.test/c/'+id,availability:'available'})),
  membership:refs.map(id=>({id,state:id==='R'?'PROJECT':'NONE',projectId:id==='R'?'P':null})),inventory:{projects:'partial',conversations:'partial',cursor:null}}};
}
async function raw(h,key=scopeKey,name='native_states'){
 const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(name),q=tx.objectStore(name).get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
}
async function put(h,...rows){
 const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');for(const row of rows)tx.objectStore('native_states').put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
}
async function state(h){
 const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations']),out={};for(const name of ['native_states','native_operations']){out[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){out[name].push(q.result.value);q.result.continue();}};}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});
}
async function write(h,n,options){const result=await h.native.apply(scope,request(n),options);assert.equal(result.ok,true,JSON.stringify(result));return result;}
async function setup(indexed){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'ambiguous_'+crypto.randomUUID().replaceAll('-','')});
 const h={base,native:new NativeRepository({baseRepository:base,observationGate:()=>gate,clock:()=>now}),close:()=>base.close()};
 await write(h,1);
 if(indexed){const old=(await raw(h)).payload,built=buildNativeVersionIndex(old,scope);await put(h,...built.records,nativeRecord(scopeKey,built.root),nativeRecord(nativeRecoveryKey(scopeKey),built.root));}
 await write(h,2);return h;
}
const empty=()=>({revision:2,projects:[],refs:[]});
const complete=()=>({revision:2,projects:['P'],refs:['R']});
const old=()=>({revision:1,projects:['Q'],refs:['N']});
const histories={
 'incomplete-first':()=>[empty(),complete()],
 'all-incomplete':()=>[empty(),empty()],
 'split-project-ref':()=>[{revision:2,projects:['P'],refs:[]},{revision:2,projects:[],refs:['R']}],
 'complete-first':()=>[complete(),empty()],
 'complete-duplicate':()=>[complete(),complete()],
 'legacy64-ambiguous':()=>[empty(),...Array.from({length:62},old),complete()],
 'legacy64-unique':()=>[...Array.from({length:63},old),complete()],
 'missing-current':()=>[old()],
 'empty-history':()=>[],
 'unique-current':()=>[complete()]
};
async function installHistory(h,kind){
 const root=await raw(h);root.payload.changes=histories[kind]();const record=nativeRecord(scopeKey,root.payload);
 // The entire old envelope remains schema-valid and checksum-valid; production
 // owner reads it normally. Only the optional GC metadata has been changed.
 validateNativeRootRecord(record,scope);await put(h,record);assert.deepEqual((await h.native.header(scope)).manifest.changes,record.payload.changes);return record;
}
function instrument(db,{afterGet=null,beforeDelete=null,beforePut=null}={}){
 const original=db.transaction.bind(db),reads=[],deletes=[];
 db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='native_states'&&args[1]==='readwrite'){
  const get=store.get.bind(store),del=store.delete.bind(store),put=store.put.bind(store);
  store.get=key=>{reads.push(key);const q=get(key);if(afterGet){let callback;Object.defineProperty(q,'onsuccess',{get:()=>callback,set:fn=>{callback=event=>{afterGet(key,q,tx);fn(event);};},configurable:true});}return q;};
  store.delete=key=>{deletes.push(key);beforeDelete?.(key,tx);return del(key);};
  store.put=row=>{beforePut?.(row,tx);return put(row);};
 }return store;};return tx;};return {reads,deletes,restore:()=>{db.transaction=original;}};
}
async function verifyLive(h,n){
 const current=(await h.native.header(scope)).manifest,checkpoint=validateNativeRootRecord({...await raw(h,nativeCheckpointKey(scopeKey)),key:scopeKey},scope);
 // header materializes the current directory; retain prior versions separately
 // through their original expected pieces, including untouched dependencies.
 for(const kind of ['projects','refs'])for(const [id,version] of Object.entries(current[kind]))assert(await raw(h,piece(kind,id,version)),'missing current '+kind+'/'+id+'@'+version);
 const facts=await h.native.read(scope);assert.equal(facts.revision,n);assert.equal(facts.projects.P.nativeName,'P revision '+Math.min(n,3));assert.equal(facts.projects.Q.nativeName,'Q revision 1');assert.equal(facts.refs.R.nativeTitle,'R revision '+Math.min(n,3));assert.equal(facts.refs.N.nativeTitle,'N revision 1');assert.equal(facts.refs.U.nativeTitle,'U revision '+(n===4?4:1));assert.equal(facts.membership.R.projectId,'P');assert.equal(facts.membership.N.state,'NONE');assert.equal(checkpoint.revision,n-1);
 for(const kind of ['projects','refs'])assert(await raw(h,piece(kind,kind==='projects'?'P':'R',n-1)),'missing retained prior version');
 for(const [kind,id] of [['projects','Q'],['refs','U'],['refs','N']])assert(await raw(h,piece(kind,id,1)),'missing untouched prior/live piece '+id);
}
for(const indexed of [false,true])for(const kind of Object.keys(histories))test(`${indexed?'indexed':'partitioned'} ${kind}: retire only superseded pieces across owner revisions 1..4`,async()=>{
 const h=await setup(indexed);let probe;
 try{
  const prior=await installHistory(h,kind),before=await state(h);probe=instrument(await h.base.open());await write(h,3);probe.restore();
  const checkpoint=await raw(h,nativeCheckpointKey(scopeKey));assert.deepEqual(checkpoint,{...prior,key:nativeCheckpointKey(scopeKey)},'checkpoint must copy exact prior envelope');
  await verifyLive(h,3);const after3=await state(h),stillOld3=['projects','refs'].filter(k=>after3.native_states.some(r=>r.key===piece(k,k==='projects'?'P':'R',1)));
  for(const receipt of before.native_operations.filter(r=>r.key!==scopeKey))assert(after3.native_operations.some(row=>JSON.stringify(row)===JSON.stringify(receipt)),'prior receipt was changed');
  assert.equal((await h.native.apply(scope,request(3))).replayed,true);assert.deepEqual(await state(h),after3,'replay changes storage');
  await write(h,4);await verifyLive(h,4);const stillOld4=[];for(const kind of ['projects','refs'])if(await raw(h,piece(kind,kind==='projects'?'P':'R',1)))stillOld4.push(kind);
  assert.deepEqual({atRevision3:stillOld3,atRevision4:stillOld4},{atRevision3:[],atRevision4:[]},'schema-valid ambiguous current metadata permanently strands old pieces after their only checkpoint is replaced');
  if(indexed&&['complete-first','complete-duplicate'].includes(kind))assert(probe.reads.includes(nativeIndexKey(scopeKey,'projects',nativeIndexBucket('Q'),1)),'ambiguous current hints must use full older checkpoint reconciliation, even if the first row happens to be complete');
 }finally{probe?.restore();h.close();}
});
for(const indexed of [false,true])for(const defect of ['checksum','storage-key','schema'])test(`${indexed?'indexed':'partitioned'} ambiguous hint with corrupt checkpoint ${defect} grants no GC authority`,async()=>{
 const h=await setup(indexed);try{
  await installHistory(h,'incomplete-first');const checkpoint=await raw(h,nativeCheckpointKey(scopeKey));
  if(defect==='checksum')checkpoint.checksum='0'.repeat(64);
  if(defect==='schema'){checkpoint.payload.changes=[{revision:0,projects:[],refs:[]}];checkpoint.checksum=nativeRecord(checkpoint.key,checkpoint.payload).checksum;}
  if(defect==='storage-key'){
   // A get interception returns the wrong physical identity, while the bytes
   // still match a valid root and the real checkpoint remains untouched.
   const db=await h.base.open(),probe=instrument(db,{afterGet(key,q){if(key===nativeCheckpointKey(scopeKey))q.result={...q.result,key:scopeKey};}});
   try{await write(h,3);}finally{probe.restore();}
  }else{await put(h,checkpoint);await write(h,3);}
  for(const kind of ['projects','refs'])assert(await raw(h,piece(kind,kind==='projects'?'P':'R',1)),'corrupt checkpoint authorized delete');await verifyLive(h,3);
 }finally{h.close();}
});
test('indexed ambiguous hint with corrupt old bucket retains its native piece and directory record',async()=>{
 const h=await setup(true);try{
  await installHistory(h,'incomplete-first');const key=nativeIndexKey(scopeKey,'refs',nativeIndexBucket('R'),1),bucket=await raw(h,key);bucket.checksum='0'.repeat(64);await put(h,bucket);await write(h,3);
  assert(await raw(h,piece('refs','R',1)));assert.deepEqual(await raw(h,key),bucket);await verifyLive(h,3);
 }finally{h.close();}
});
for(const indexed of [false,true])for(const mode of ['signal-at-checkpoint','quota-before-current-root-put'])test(`${indexed?'indexed':'partitioned'} ambiguous fallback ${mode} preserves owner atomicity`,async()=>{
 const h=await setup(indexed);let probe;try{
  await installHistory(h,'incomplete-first');const before=await state(h),controller=new AbortController();let allowed=true,hit=false;
  probe=instrument(await h.base.open(),{
   afterGet(key){if(key===nativeCheckpointKey(scopeKey)&&mode.endsWith('at-checkpoint')){hit=true;if(mode.startsWith('signal'))controller.abort();else allowed=false;}},
   beforePut(row){if(mode==='quota-before-current-root-put'&&row.key===scopeKey){hit=true;throw new DOMException('injected','QuotaExceededError');}}
  });
  const result=await h.native.apply(scope,request(3),{guard:()=>allowed,signal:controller.signal});probe.restore();assert.equal(hit,true);assert.equal(result.ok,false,JSON.stringify(result));assert.notEqual(result.committed,true,'guard loss within checkpoint callback must abort before commit');assert.deepEqual(await state(h),before,'failed owner operation changes native pieces, roots or receipts');
 }finally{probe?.restore();h.close();}
});
