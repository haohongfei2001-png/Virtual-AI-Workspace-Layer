/** TEST ONLY: portable SYS02 cases for native extension-origin IndexedDB.
 * Admissions are explicit offline fixtures, never live or product authority.
 * No fake IDB import; the caller supplies browser indexedDB or a labelled mock.
 * Injection aborts a real transaction after its first successful put request;
 * this does NOT simulate physical disk exhaustion or prove OS quota behavior.
 */
import {harness,A,B} from '../b23/contracts.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {continuationSemanticFingerprint} from '../../src/data/native-observation-continuation.mjs';
import {digest} from '../../src/data/hash.mjs';
import {createJointObservationFixture} from './joint-observation-fixture.mjs';
import {nativeCheckpointKey,nativeRecoveryKey,nativePartitionKey} from '../../src/data/native-partitions.mjs';
import {continuationDirectoryKey} from '../../src/data/native-observation-continuation.mjs';
import {persistentSeed} from '../../simulator/persistent-seed.mjs';

function assert(value,message='SYS02 assertion failed'){if(!value)throw Error(message);}
assert.equal=(actual,expected,message)=>assert(Object.is(actual,expected),message??`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
assert.deepEqual=(actual,expected,message)=>assert(digest(actual)===digest(expected),message??'SYS02 data changed unexpectedly');
assert.rejects=async(promise,pattern)=>{try{await promise;}catch(error){assert(pattern.test(error.message),error.message);return;}throw Error('SYS02 expected rejection missing');};
async function injectAbortAfterPut(h){
 const db=await h.base.open(),original=db.transaction.bind(db);let fired=false;
 db.transaction=(...args)=>{const tx=original(...args);if(args[1]!=='readwrite'||fired)return tx;
  const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name),put=store.put.bind(store);
   store.put=value=>{const request=put(value);if(!fired){fired=true;db.transaction=original;
    const abort=()=>{h.sys02InjectedAbort=(h.sys02InjectedAbort??0)+1;tx.abort();};
    if(typeof request.addEventListener==='function')request.addEventListener('success',abort,{once:true});else request.onsuccess=abort;
   }return request;};return store;};return tx;};
 return ()=>{db.transaction=original;};
}
export function createSys02PendingCases(indexedDB){
 const cases=[];function test(name,run){cases.push({name,async run(){const cleanup=[];try{return await run({after:fn=>cleanup.push(fn)});}finally{for(const fn of cleanup.reverse())await fn();}}});}
const NOW='2026-10-13T12:00:00Z';
// Explicit offline owner admissions; no live account certification.
async function setup(t){
 const h=await harness(indexedDB,{seed:false}),gates=new WeakMap();t.after(()=>h.close());
 const native=new NativeRepository({baseRepository:h.base,workspaceRepository:h.repo,clock:()=>NOW,hostObservationGate:(scope,request)=>scope.key===h.base.scopeOrThrow(A).key?gates.get(request):undefined});
 function make(operationId='native_ack',expectedRevision=0){
  const scopeKey=h.base.scopeOrThrow(A).key,sourceId='host_ack',generation='generation_one';
  const request={operationId,expectedRevision,batch:{scopeKey,sourceRevision:expectedRevision+1,observedAt:NOW,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id:'continuation_ref',nativeTitle:'Native title',nativeUrl:'https://vaiwl-hf.test/hf/A/c/continuation_ref',availability:'available'}],membership:[{id:'continuation_ref',state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}};
  const batch={sources:[{id:sourceId,generation,sourceRevision:1,observedAt:NOW,validUntil:'2026-10-14T00:00:00Z',channel:'host-evidence',codecVersion:1,profileId:'profile_one',profileVersion:1}],events:[],coverage:[],hints:[{id:'anchor_one',sourceId,generation,sourceRevision:1,observedAt:NOW,conversationId:'continuation_ref',eventKey:'ref_message',hintType:'observed-self-send',anchorVersion:1,messageId:'message_one',firstObservedAt:NOW,candidateInterval:{from:'2026-10-13T11:59:59Z',through:NOW},clockBasis:'local-bounded',calibrationDueAt:'2026-10-13T12:01:00Z',actorVerified:true,actorScopeKey:scopeKey,ackWitness:{kind:'authenticated-message-readback',profileId:'profile_one',profileVersion:1,semanticFingerprint:digest(['continuation_ref','message_one'])}}]};
  const admission={profileId:'profile_one',profileVersion:1,evidenceClass:'surface',semanticFingerprint:digest(request.batch),acceptedAt:NOW};
  const gate={channel:'host-dom',sourceId,generation,guard:()=>true,admission,continuation:{evidenceOperationId:'evidence_ack',expectedEvidenceRevision:0,batch},continuationAdmission:{...admission,evidenceClass:'observed-self-send',semanticFingerprint:continuationSemanticFingerprint(batch)}};
  gates.set(request,gate);return {request,gate};
 }
 return {...h,native,make,gates};
}

// Evidence level is assigned by the caller; these same cases run on real IDB.
// Owner v2 cases below reuse the actual joint-owner fixture; capacity cases use
// the same explicit offline admission shape as native-continuation-repository.
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
async function rows(h,name){const db=await h.base.open();return new Promise((resolve,reject)=>{const out=[],tx=db.transaction(name),q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){out.push(q.result.value);q.result.continue();}};tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});}
async function snapshot(h){const db=await h.base.open(),out={};for(const name of db.objectStoreNames)out[name]=await rows(h,name);return out;}
async function damage(h,name,key){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite'),store=tx.objectStore(name),q=store.get(key);q.onsuccess=()=>{assert(q.result,'fault target must exist');store.put({...q.result,checksum:'damaged-SYS02'});};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function joint(t){const h=await createJointObservationFixture({indexedDB:indexedDB,after:fn=>t.after(fn)});h.disableDrain();assert.equal((await h.ingest(h.surface())).state,'accepted');assert.equal((await h.native.listContinuations(h.scope)).length,1);return h;}
function customize(h,index,revision,hints=1){const x=h.make('queued_'+index,revision),batch=x.gate.continuation.batch,template=batch.hints[0];batch.hints=Array.from({length:hints},(_,i)=>({...structuredClone(template),id:'anchor_'+index+'_'+i,eventKey:'event_'+index+'_'+i,messageId:'message_'+index+'_'+i}));x.gate.continuation.evidenceOperationId='evidence_'+index;x.gate.continuationAdmission.semanticFingerprint=continuationSemanticFingerprint(batch);return x;}

for(const kind of ['count','bytes'])test('SYS02 IDB '+kind+' capacity rejects atomically with acknowledged queue and Pro assets intact',async t=>{
 const h=await setup(t),seed=persistentSeed(A,'https://vaiwl-hf.test');
 // One real old-format human asset is enough; avoid a 604-ref fixture per write.
 for(const table of ['refs','identities'])seed[table]={T0:seed[table].T0};
 for(const table of ['events','coverage'])seed[table]=Object.fromEntries(Object.entries(seed[table]).filter(([,row])=>row.conversationId==='T0'));
 seed.workspaces={W0:seed.workspaces.W0};seed.placements=Object.fromEntries(Object.entries(seed.placements).filter(([,row])=>row.refId==='T0'&&row.workspaceId==='W0'));
 assert((await h.repo.initialize(A,seed)).ok);
 assert((await h.command({type:'SET_TITLE',refId:'T0',title:'Human title'})).ok);
 assert((await h.command({type:'SET_PREFERENCE',id:'workingSet',value:{refs:['T0'],current:'T0'}})).ok);
 assert((await h.command({type:'SET_PREFERENCE',id:'savedSnippets',value:[{id:'manual',refId:'T0',messageId:'m0',branchId:'root',text:'Human snippet',bodyHash:digest('synthetic')}]})).ok);
 const proBefore=(await h.repo.read(A)).state;let count=0,total=0,rejected;
 // Production limits, not a lowered fixture budget. Byte case reaches 1 MiB
 // well below 256 records; count case reaches exactly 256 small records.
 for(let i=0;i<=256;i++){
  const {request}=customize(h,i,count,kind==='bytes'?40:1),before=await snapshot(h),result=await h.native.apply(A,request);
  if(!result.ok){assert.equal(result.reason,'invalid-native-continuation-directory-capacity');assert.deepEqual(await snapshot(h),before,'SYS02_CAPACITY_ATOMIC');rejected=request;break;}
  count++;
 }
 assert(rejected,'SYS02_CAPACITY_MUST_BACKPRESSURE');
 const pending=await h.native.listContinuations(A);assert.equal(pending.length,count);total=pending.reduce((sum,row)=>sum+bytes(row),0);
 if(kind==='count')assert.equal(count,256);else {assert(count<256);assert(total<=1048576);assert(total+bytes(pending.at(-1))>1048576);}
 for(const row of pending)assert.equal(row.state,'pending-evidence');
 const proAfter=(await h.repo.read(A)).state;for(const table of ['workspaces','identities','placements','preferences'])assert.deepEqual(proAfter[table],proBefore[table]);assert.deepEqual(proAfter.refs.T0,proBefore.refs.T0);
 h.base.close();assert.deepEqual(await h.native.listContinuations(A),pending);assert.deepEqual(await h.native.listContinuations(B),[]);
 const directory=(await rows(h,'native_operations')).find(r=>r.key===continuationDirectoryKey(h.base.scopeOrThrow(A).key));assert.equal(Object.keys(directory.payload.entries).length,count);
 // A confirmed terminal transition frees capacity without dropping another row.
 const first=pending[0];assert((await h.native.markContinuationNeedsRevalidation(A,{operationId:first.operationId,expectedPayloadDigest:first.payloadDigest},{guard:()=>true,currentProfile:()=>({id:'profile_one',revision:2})})).ok);
 // needs-revalidation is still a retained target, so count remains bounded;
 // only a byte-limited queue necessarily gains room from this transition.
 if(kind==='bytes'){assert((await h.native.apply(A,rejected)).ok);assert.equal((await h.native.listContinuations(A)).length,count+1);}else{const retained=await snapshot(h);assert.equal((await h.native.apply(A,rejected)).reason,'invalid-native-continuation-directory-capacity');assert.deepEqual(await snapshot(h),retained);}
});

test('SYS02 IDB joint v2 pending survives native checkpoint GC and expiry without evidence replay',async t=>{
 const h=await joint(t),pending=await h.native.listContinuations(h.scope),old=(await h.native.read(h.scope)).revision;
 h.disableAck();for(let i=0;i<5;i++)assert.equal((await h.ingest(h.surface('Replacement '+i))).state,'accepted');
 const stateRows=await rows(h,'native_states');assert(!stateRows.some(row=>row.key===nativePartitionKey(h.scope.key,'refs','C',old)),'SYS02_GC_MUST_ACTUALLY_RUN');
 h.tick(365*86400000);h.base.close();assert.deepEqual(await h.native.listContinuations(h.scope),pending,'SYS02_PENDING_GC_PROTECTED');assert.equal((await h.free.read(h.scope)).revision,0);
 assert.equal((await h.recover()).state,'needs-revalidation');const [summary]=await h.native.listContinuations(h.scope);assert.deepEqual(summary.targets,['C']);assert.equal(summary.payloadDigest,pending[0].payloadDigest);assert.equal(summary.evidence,undefined);assert.equal((await h.free.read(h.scope)).revision,0);
});

for(const cut of ['evidence','completion'])test('SYS02 IDB injected transaction abort during '+cut+' preserves acknowledged v2 payload and retry is exact once',async t=>{
 const h=await joint(t),pending=await h.native.listContinuations(h.scope),before=await snapshot(h),complete=h.native.markContinuationComplete.bind(h.native);
 if(cut==='completion')h.native.markContinuationComplete=async(...args)=>{await injectAbortAfterPut(h);return complete(...args);};else await injectAbortAfterPut(h);
 assert.equal((await h.recover()).state,'pending');assert.equal(h.sys02InjectedAbort,1,'SYS02_TEST_ABORT_MUST_FIRE');assert.deepEqual(await h.native.listContinuations(h.scope),pending,'SYS02_QUOTA_PENDING_PRESERVED');
 if(cut==='evidence')assert.deepEqual(await snapshot(h),before);
 else assert.equal((await h.free.read(h.scope)).revision,1);
 h.native.markContinuationComplete=complete;h.base.close();assert.equal((await h.recover()).state,'complete');const after=await h.free.read(h.scope);assert.equal(Object.keys(after.hints).length,1);assert.equal(Object.values(after.hints)[0].firstObservedAt,pending[0].evidence.batch.hints[0].firstObservedAt);assert.equal((await h.recover()).state,'idle');assert.deepEqual(await h.free.read(h.scope),after);
});

for(const target of ['root','piece','checkpoint'])test('SYS02 IDB corrupt '+target+' while joint v2 queued never loses acknowledged payload',async t=>{
 const h=await joint(t),pending=await h.native.listContinuations(h.scope);
 let key=h.scope.key;
 if(target==='piece'){const root=(await rows(h,'native_states')).find(r=>r.key===key);key=nativePartitionKey(h.scope.key,'refs','C',root.payload.refs.C);}
 if(target==='checkpoint'){h.disableAck();await h.ingest(h.surface('Checkpoint retained'));key=nativeCheckpointKey(h.scope.key);}
 await damage(h,'native_states',key);const before=await snapshot(h);
 if(target==='checkpoint'){
  assert.equal((await h.ingest(h.surface('After corrupt checkpoint'))).state,'accepted');assert.deepEqual(await h.native.listContinuations(h.scope),pending,'SYS02_BAD_CHECKPOINT_CANNOT_DROP_PENDING');
 }else if(target==='piece'){
  await assert.rejects(h.native.read(h.scope),/corrupt-native-record/);
  assert.equal((await h.recover()).state,'complete');
  assert.equal(Object.values((await h.free.read(h.scope)).hints)[0].messageId,pending[0].evidence.batch.hints[0].messageId);
  await assert.rejects(h.native.read(h.scope),/corrupt-native-record/);
 }else{
  assert.equal((await h.recover()).state,'pending');assert.deepEqual(await snapshot(h),before,'SYS02_CORRUPT_ROOT_NO_MUTATION');
  // Queue bytes remain directly verifiable even if root validation blocks its reader.
  const receipt=(await rows(h,'native_operations')).find(r=>r.payload?.continuation?.operationId===pending[0].operationId);assert.deepEqual(receipt.payload.continuation,pending[0]);
 }
 assert.equal((await h.free.read(h.scope)).revision,target==='piece'?1:0);
});

test('SYS02 IDB native injected transaction abort after earlier acknowledged work rolls back and retries without dropping queue',async t=>{
 const h=await joint(t),pending=await h.native.listContinuations(h.scope);h.disableAck();const before=await snapshot(h),proposal=h.surface('Later independent title');
 await injectAbortAfterPut(h);assert.equal((await h.ingest(proposal)).state,'rejected');assert.equal(h.sys02InjectedAbort,1,'SYS02_TEST_ABORT_MUST_FIRE');assert.deepEqual(await snapshot(h),before);
 assert.equal((await h.ingest(h.surface('Later independent title'))).state,'accepted');assert.deepEqual(await h.native.listContinuations(h.scope),pending);
});

test('SYS02 IDB actual CAS conflict leaves earlier pending and rejected operation retryable',async t=>{
 const h=await setup(t),first=customize(h,0,0);assert((await h.native.apply(A,first.request)).ok);const before=await snapshot(h),stale=customize(h,1,0);
 assert.equal((await h.native.apply(A,stale.request)).reason,'revision-conflict');assert.deepEqual(await snapshot(h),before);
 const retry=customize(h,1,1);assert((await h.native.apply(A,retry.request)).ok);assert.equal((await h.native.listContinuations(A)).length,2);
});

for(const shadowCorrupt of [false,true])test('SYS02 IDB explicit root recovery '+(shadowCorrupt?'refuses damaged shadow':'retains pending then defers revoked authority'),async t=>{
 const h=await joint(t),pending=await h.native.listContinuations(h.scope);await damage(h,'native_states',h.scope.key);
 if(shadowCorrupt)await damage(h,'native_states',nativeRecoveryKey(h.scope.key));
 const before=await snapshot(h),damaged=before.native_states.find(row=>row.key===h.scope.key),result=await h.native.recover(h.scope,{operationId:'sys02_recovery',damagedHash:digest(damaged)});
 if(shadowCorrupt){assert.equal(result.ok,false);assert.deepEqual(await snapshot(h),before);}
 else {assert.equal(result.ok,true);assert.deepEqual(await h.native.listContinuations(h.scope),pending);assert.equal((await h.recover()).state,'needs-revalidation');const [summary]=await h.native.listContinuations(h.scope);assert.deepEqual(summary.targets,['C']);assert.equal(summary.payloadDigest,pending[0].payloadDigest);}
 assert.equal((await h.free.read(h.scope)).revision,0);
});

test('SYS02 IDB oversized single continuation cannot disturb previously acknowledged queue',async t=>{
 const h=await setup(t),first=customize(h,0,0);assert((await h.native.apply(A,first.request)).ok);const before=await snapshot(h),oversized=customize(h,1,1,100);
 await assert.rejects(h.native.apply(A,oversized.request),/invalid-native-continuation-record-capacity/);assert.deepEqual(await snapshot(h),before);
});
return cases;
}
