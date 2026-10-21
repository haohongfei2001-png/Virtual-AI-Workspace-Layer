import {harness,A,B} from '../b23/contracts.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts,validateNativeFacts} from '../../src/data/native-facts.mjs';
import {freeProjection} from '../../src/data/free-projection.mjs';
import {nativeRecord,nativeRecoveryKey,nativePartitionKey} from '../../src/data/native-partitions.mjs';
import {NATIVE_LIFECYCLE_PARTITIONS,NATIVE_LIFECYCLE_INDEX,lifecycleKind} from '../../src/data/native-lifecycle.mjs';
import {freeRecoveryStatus} from '../../src/data/free-recovery-status.mjs';
import {createFreeReadService} from '../../src/runtime/free-read-service.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {planFreeReplica,assembleFreeReplica,freeReplicaRequests} from '../../src/data/free-replica.mjs';
import {digest} from '../../src/data/hash.mjs';
const now='2026-10-13T00:00:00Z',key=emptyNativeFacts(A).scopeKey;
const assert=(value,message='assertion-failed')=>{if(!value)throw Error(message);};
const eq=(a,b,message)=>assert(JSON.stringify(a)===JSON.stringify(b),message??`expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
const rejects=async work=>{let failed=false;try{await work();}catch{failed=true;}assert(failed,'expected rejection');};
export async function lifecycleHarness(factory){
 const h=await harness(factory),admissions=new WeakMap();let active=true;
 const native=new NativeRepository({baseRepository:h.base,workspaceRepository:h.repo,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'fixture',generation:'one'}),lifecycleGate:(scope,request)=>admissions.get(request)?.scopeKey===scope.key?admissions.get(request):null});
 const db=await h.base.open();
 const readRow=(name,k)=>new Promise((resolve,reject)=>{const tx=db.transaction(name),q=tx.objectStore(name).get(k);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});
 const put=(name,...rows)=>new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');for(const row of rows)tx.objectStore(name).put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const deleteRow=(name,k)=>new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).delete(k);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 async function change(state='deletion-confirmed',id='T0',kind='refs',options={}){
  const facts=await native.read(A),prior=facts[lifecycleKind(kind)]?.[id],operationId=options.operationId??`${state}_${kind}_${id}_${facts.revision}`;
  const request={operationId,expectedRevision:facts.revision,change:{kind,id,state,expectedVersion:prior?.version??0,fenceId:state==='existence-confirmed'?prior?.fenceId:null,fenceVersion:state==='existence-confirmed'?prior?.fenceVersion:null,resultFingerprint:digest(operationId),profileId:'fixture-lifecycle-v1',profileVersion:1,...options.change}};
  admissions.set(request,{scopeKey:key,purpose:'native-lifecycle',guard:()=>active});
  return {request,result:await native.applyLifecycle(A,request,options.guard?{guard:options.guard}:{})};
 }
 async function observe(revision,ids=['T0'],project=false){return native.apply(A,{operationId:'observe_'+revision,expectedRevision:revision,batch:{scopeKey:key,sourceRevision:revision+1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:project?[{id:'P',nativeName:'Project',nativeUrl:'https://fixture.test/p/P',availability:'available'}]:[],refs:ids.map(id=>({id,nativeTitle:'Chat '+id,nativeUrl:'https://fixture.test/c/'+id,availability:'available'})),membership:ids.map(id=>({id,state:project?'PROJECT':'NONE',projectId:project?'P':null})),inventory:{projects:'partial',conversations:'partial',cursor:null}}});}
 const readService=createFreeReadService({repository:h.base,workspaces:h.repo,native,evidence:new FreeEvidenceRepository({baseRepository:h.base}),clock:()=>now});
 async function replica(prior=null){const header=await readService.freeHeader(A,{},now),plan=planFreeReplica(prior,header),pages=[];for(const request of freeReplicaRequests(plan))pages.push(await readService.freePage(A,{ids:request,revision:header.revision,limit:1000,now,viewSession:header.viewSession},{}));return {replica:assembleFreeReplica(prior,header,pages,plan),plan,pages};}
 return {...h,native,readService,readRow,put,deleteRow,change,observe,replica,revoke:()=>{active=false;},admissions};
}
export const lifecycleCases=[
 ['delete-before-first-observation survives available, reopen, index migration and shared fallback',async h=>{
  const before=(await h.repo.read(A)).state;
  assert((await h.change()).result.ok);eq((await h.native.header(A)).storageFormat,NATIVE_LIFECYCLE_PARTITIONS);
  const page=await h.native.page(A,{ids:{projects:[],refs:['T0']}});eq(Object.keys(page.facts.refs),[]);assert(page.facts.refLifecycle.T0);
  eq(freeProjection(page.facts,{scope:A,now,knownState:before}).refs.some(r=>r.id==='T0'),false);
  assert((await h.observe(1)).ok);h.close();
  assert((await h.native.migrateVersionIndex(A,{operationId:'index',expectedRevision:2})).ok);
  eq((await h.native.header(A)).storageFormat,NATIVE_LIFECYCLE_INDEX);eq((await h.native.snapshot(A,{knownState:before})).refs.some(r=>r.id==='T0'),false);
  assert((await h.observe(3)).ok);eq((await h.native.read(A)).refLifecycle.T0.state,'deletion-confirmed');
  eq((await h.repo.read(A)).state.identities,before.identities);eq((await h.repo.read(A)).state.workspaces,before.workspaces);eq((await h.native.read(B)).revision,0);
 }],
 ['existing index upgrades atomically and publishes deletion to an existing UI replica',async h=>{
  assert((await h.observe(0,['T0','T1'],true)).ok);const first=await h.replica();assert(first.replica.refs.has('T0'));
  const result=await h.change();assert(result.result.ok,JSON.stringify(result));
  eq((await h.native.header(A)).storageFormat,NATIVE_LIFECYCLE_INDEX);
  const second=await h.replica(first.replica);assert(second.plan.refs.includes('T0'));assert(!second.replica.refs.has('T0'));assert(second.replica.omittedRefs.has('T0'));assert(second.replica.refs.has('T1'));
  const page=await h.native.page(A,{offset:0,limit:5});eq(page.total,3,'fence is not an inventory object');
  const projected=await h.native.snapshot(A);eq(projected.refs.map(r=>r.id),['T1']);
 }],
 ['project deletion preserves conversations as UNKNOWN, human assets and activity',async h=>{
  assert((await h.observe(0,['T0','T1'],true)).ok);const first=await h.replica(),before=(await h.repo.read(A)).state;
  assert((await h.change('deletion-confirmed','P','projects')).result.ok);
  const second=await h.replica(first.replica);assert(!second.replica.projects.has('P'));assert(second.plan.refs.includes('T0'));
  for(const id of ['T0','T1'])eq(second.replica.refs.get(id).membership,'UNKNOWN');
  const after=(await h.repo.read(A)).state;for(const table of ['workspaces','identities','placements','events','coverage'])eq(after[table],before[table],table+' preserved');
  const facts=await h.native.read(A);eq(facts.refLifecycle,{});eq(facts.membership.T0.state,'PROJECT');
 }],
 ['shared-only deletion invalidates a cached fallback without inventing a native row',async h=>{
  const first=await h.replica();assert(first.replica.refs.has('T0'));assert((await h.change()).result.ok);
  const second=await h.replica(first.replica);assert(second.plan.refs.includes('T0'));assert(!second.replica.refs.has('T0'));eq(Object.keys((await h.native.read(A)).refs),[]);
 }],
 ['same result is idempotent and D1 R1 D2 rejects delayed R1 and ordinary reappearance',async h=>{
  assert((await h.observe(0)).ok);const d1=await h.change();assert(d1.result.ok);
  const fingerprint=d1.request.change.resultFingerprint;
  const duplicate=await h.change('deletion-confirmed','T0','refs',{operationId:'same-result',change:{resultFingerprint:fingerprint,expectedVersion:0}});assert(duplicate.result.replayed);eq(await h.native.version(A),2);
  const r1=await h.change('existence-confirmed');assert(r1.result.ok);eq((await h.native.snapshot(A)).refs.length,1);
  const d2=await h.change();assert(d2.result.ok);
  const late=await h.change('existence-confirmed','T0','refs',{operationId:'late_r1',change:r1.request.change});assert(late.result.replayed);eq((await h.native.read(A)).refLifecycle.T0.state,'deletion-confirmed');
  assert((await h.observe(4)).ok);eq((await h.native.snapshot(A)).refs.length,0);eq((await h.native.read(A)).refLifecycle.T0.fenceId,d2.request.change.resultFingerprint);
 }],
 ['owner admission is object-specific, scope-specific and revoked without mutation',async h=>{
  const done=await h.change();assert(done.result.ok);const before=await h.native.read(A);
  await rejects(()=>h.native.applyLifecycle(A,structuredClone(done.request)));await rejects(()=>h.native.applyLifecycle(B,done.request));
  h.revoke();await rejects(()=>h.native.applyLifecycle(A,done.request));eq(await h.native.read(A),before);
 }],
 ...[false,true].map(indexed=>[(indexed?'indexed':'partition')+' same-revision old shadow cannot erase lifecycle; exact shadow repairs with fences',async h=>{
  assert((await h.observe(0)).ok);if(indexed)assert((await h.native.migrateVersionIndex(A,{operationId:'index-before-delete',expectedRevision:1})).ok);const old=await h.readRow('native_states',key);
  assert((await h.change()).result.ok);const root=await h.readRow('native_states',key),shadow=await h.readRow('native_states',nativeRecoveryKey(key)),damaged={...root,checksum:'0'.repeat(64)};
  await h.put('native_states',damaged,nativeRecord(nativeRecoveryKey(key),{...old.payload,revision:root.payload.revision}));
  const status=await freeRecoveryStatus(h.native,A,'native');eq(status.recoverable,false);eq(status.recoveryReason,'native-lifecycle-root-conflict');
  eq((await h.native.recover(A,{operationId:'old-shadow',damagedHash:digest(damaged)})).reason,'native-lifecycle-root-conflict');
  await h.put('native_states',shadow);assert((await h.native.recover(A,{operationId:'exact-shadow',damagedHash:digest(damaged)})).ok);
  const facts=await h.native.read(A);eq(facts.refLifecycle.T0.state,'deletion-confirmed');eq(facts.sources.fixture.revoked,true);
 }]),
 ['same-codec mismatched shadow, missing lifecycle piece and forged old codec fail closed',async h=>{
  assert((await h.change()).result.ok);const root=await h.readRow('native_states',key),damaged={...root,checksum:'0'.repeat(64)};
  await h.put('native_states',damaged,nativeRecord(nativeRecoveryKey(key),{...root.payload,refLifecycle:{}}));
  eq((await h.native.recover(A,{operationId:'mismatched-shadow',damagedHash:digest(damaged)})).reason,'native-lifecycle-root-conflict');
  await h.put('native_states',root,nativeRecord(nativeRecoveryKey(key),root.payload));
  const facts=await h.native.read(A);await rejects(()=>validateNativeFacts({...facts,format:'vaiwl-native-facts-v2'},A));
  await h.deleteRow('native_states',nativePartitionKey(key,'refLifecycle','T0',1));await rejects(()=>h.native.read(A));await rejects(()=>h.native.page(A,{ids:{projects:[],refs:['T0']}}));
 }],
 ['consumed results survive generic receipt removal, source revocation and repeated piece GC',async h=>{
  assert((await h.observe(0)).ok);const d1=await h.change(),r1=await h.change('existence-confirmed');assert(r1.result.ok);
  await h.deleteRow('native_operations',JSON.stringify([key,d1.request.operationId]));
  const replay=await h.change('deletion-confirmed','T0','refs',{operationId:'new-envelope-old-result',change:{...d1.request.change,expectedVersion:r1.result.revision}});
  assert(replay.result.replayed);eq((await h.native.read(A)).refLifecycle.T0.state,'existence-confirmed');
  const d2=await h.change();assert(d2.result.ok);await h.deleteRow('native_operations',JSON.stringify([key,r1.request.operationId]));
  const retagged=await h.change('existence-confirmed','T0','refs',{operationId:'retag-old-restore',change:{resultFingerprint:r1.request.change.resultFingerprint}});eq(retagged.result.reason,'native-lifecycle-result-conflict');
  assert((await h.native.migrateVersionIndex(A,{operationId:'index-fences',expectedRevision:d2.result.revision})).ok);
  for(let i=0;i<5;i++){const revision=await h.native.version(A);assert((await h.observe(revision,['T0','NEW'+i])).ok);}
  const revision=await h.native.version(A);assert((await h.native.invalidate(A,{operationId:'revoke-fixture',expectedRevision:revision,sourceId:'fixture'})).ok);
  const facts=await h.native.read(A);eq(facts.refLifecycle.T0.fenceId,d2.request.change.resultFingerprint);eq(facts.refLifecycle.T0.results.length,3);
  const shared=(await h.repo.read(A)).state;assert(!(await h.native.snapshot(A,{knownState:shared})).refs.some(r=>r.id==='T0'));
 }],
 ['manual backup restore cannot revive deleted shared references',async h=>{
  const bundle=await h.repo.exportBackup(A);assert((await h.change()).result.ok);
  const preview=await h.repo.previewRestore(A,bundle);assert((await h.repo.restoreBackup(A,{operationId:'restore-human',expectedRevision:preview.expectedRevision,bundle,planHash:preview.planHash})).ok);
  const shared=(await h.repo.read(A)).state;assert(shared.refs.T0);assert(shared.workspaces.W0);
  eq((await h.native.snapshot(A,{knownState:shared})).refs.some(r=>r.id==='T0'),false);
 }],
];
export async function runLifecycleCases(factory){const results=[];for(const [name,run] of lifecycleCases){const h=await lifecycleHarness(factory);try{await run(h);results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}finally{h.close();}}return results;}
