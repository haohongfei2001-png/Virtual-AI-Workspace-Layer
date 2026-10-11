/** Native IndexedDB race/corruption checks. Run at loopback, never import mock-IDB. */
import { harness, A } from './contracts.mjs';
import { digest } from '../../src/data/hash.mjs';
import { FIXTURE_NOW } from '../../simulator/data.mjs';
const assert=(ok,message='native-incremental-assertion')=>{if(!ok)throw Error(message);};
const view={segment:2,oldOpen:[],sidebarOpen:[],capacities:[],scroll:150,sidebarVisible:true};
async function row(h,store,transform){
 const db=await h.base.open(),key=h.base.scopeOrThrow(A).key;
 return new Promise((resolve,reject)=>{const tx=db.transaction(store,transform?'readwrite':'readonly'),s=tx.objectStore(store),r=s.get(key);let value;
 r.onsuccess=()=>{value=r.result;if(transform){value=transform(value);s.put(value);}};
 tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);});
}
function intercept(db,store,action,onComplete=false){
 const original=db.transaction.bind(db);
 db.transaction=(names,mode)=>{const tx=original(names,mode),objectStore=tx.objectStore.bind(tx);
 if(onComplete&&mode==='readwrite')tx.addEventListener('complete',action,{once:true});
 tx.objectStore=name=>{const s=objectStore(name);if(name===store){const put=s.put.bind(s);s.put=value=>{const request=put(value);if(!onComplete)action(tx,request);return request;};}return s;};return tx;};
 return ()=>{db.transaction=original;};
}
const cases=[
 ['NATIVE-command-revoke-after-put-rolls-back',async h=>{
  const abort=new AbortController(),restore=intercept(await h.base.open(),'b23_states',()=>abort.abort());let result;
  try{result=await h.command({type:'SET_TITLE',refId:'T0',title:'must-not-commit'},{signal:abort.signal});}finally{restore();}
  assert(!result.ok&&result.reason==='stale-binding',JSON.stringify(result));assert((await h.repo.read(A)).state.revision===1);return result;
 }],
 ['NATIVE-command-revoke-after-commit-does-not-report-success',async h=>{
  let allowed=true;const restore=intercept(await h.base.open(),'b23_states',()=>{allowed=false;},true);let result;
  try{result=await h.command({type:'SET_TITLE',refId:'T0',title:'committed-before-revoke'},{guard:()=>allowed});}finally{restore();}
  assert(!result.ok&&result.reason==='stale-after-commit'&&result.committed);assert((await h.repo.read(A)).state.identities.T0.title==='committed-before-revoke');return result;
 }],
 ['NATIVE-view-revoke-after-put-rolls-back',async h=>{
  const abort=new AbortController(),restore=intercept(await h.base.open(),'b23_views',()=>abort.abort());let result;
  try{result=await h.repo.saveView(A,view,0,{signal:abort.signal});}finally{restore();}
  assert(!result.ok&&(await h.repo.read(A)).view===null);return result;
 }],
 ['NATIVE-actual-transaction-abort-never-reports-success',async h=>{
  const restore=intercept(await h.base.open(),'b23_states',(tx,request)=>request.addEventListener('success',()=>tx.abort(),{once:true}));let result;
  try{result=await h.command({type:'SET_TITLE',refId:'T0',title:'aborted-write'});}finally{restore();}
  assert(!result.ok);assert((await h.repo.read(A)).state.revision===1);return result;
 }],
 ...[false,true].map(validChecksum=>['NATIVE-corrupt-view-'+(validChecksum?'schema':'checksum')+'-isolated',async h=>{
  await h.command({type:'SET_TITLE',refId:'T0',title:'intact-human'});assert((await h.repo.saveView(A,view,0)).ok);
  const damaged=await row(h,'b23_views',r=>{if(validChecksum){r.payload.value.segment=-1;r.checksum=digest(r.payload);}else r.checksum='invalid';return r;});
  const data=await h.repo.snapshot(A,FIXTURE_NOW,'UTC');assert(data.diagnostics.view==='CORRUPT_VIEW'&&data.view===null);assert(data.refs.length===604&&data.groups.length===120&&data.refs.find(r=>r.id==='T0').displayTitle==='intact-human');
  assert((await h.command({type:'SET_TITLE',refId:'T1',title:'still-editable'})).ok);assert(!(await h.repo.saveView(A,view,0)).ok);assert(JSON.stringify(await row(h,'b23_views'))===JSON.stringify(damaged));
  return {diagnostic:data.diagnostics,refs:data.refs.length,groups:data.groups.length,damagedRecordPreserved:true};
 }]),
 ['NATIVE-recovery-does-not-resurrect-evidence-or-receipts',async h=>{
  await h.command({type:'SET_TITLE',refId:'T0',title:'checkpoint-human'});
  const request={operationId:'native_lost_edit',expectedRevision:2,command:{type:'SET_TITLE',refId:'T1',title:'discarded-human'}};
  assert((await h.repo.command(A,request)).ok);await h.command({type:'REVOKE_SOURCE',sourceId:'fixture_v1'});
  const highWater=(await h.repo.read(A)).state.revision;await row(h,'b23_states',r=>({...r,checksum:'corrupt',payload:{...r.payload,revision:0}}));
  const status=await h.repo.recoveryStatus(A);assert(status.corrupt&&status.recoverable);
  const recovery=await h.repo.recover(A,{operationId:'native_recovery',damagedHash:status.damagedHash});assert(recovery.ok&&recovery.revision>highWater);
  const data=await h.repo.snapshot(A,FIXTURE_NOW,'UTC');assert(data.groups.every(w=>w.segment===null));assert(data.refs.find(r=>r.id==='T0').displayTitle==='checkpoint-human');
  const replay=await h.repo.command(A,request);assert(!replay.ok&&replay.reason==='operation-invalidated-by-recovery',JSON.stringify(replay));
  const logs=await h.repo.history(A);assert(logs.filter(l=>l.type!=='RECOVER').every(l=>l.invalidatedBy==='native_recovery'));
  return {recovery,replay,highWater,allEvidenceInactive:true};
 }],
 ['NATIVE-recovery-revoke-after-put-remains-corrupt',async h=>{
  await h.command({type:'SET_TITLE',refId:'T0',title:'checkpoint'});await row(h,'b23_states',r=>({...r,checksum:'corrupt'}));const status=await h.repo.recoveryStatus(A);
  const abort=new AbortController(),restore=intercept(await h.base.open(),'b23_states',()=>abort.abort());let result;
  try{result=await h.repo.recover(A,{operationId:'native_abort_recovery',damagedHash:status.damagedHash},{signal:abort.signal});}finally{restore();}
  assert(!result.ok&&(await h.repo.recoveryStatus(A)).corrupt);return result;
 }],
];
export async function runNativeIncrementalCases(factory){
 const results=[];for(const [name,run] of cases){let h;try{h=await harness(factory);results.push({name,status:'PASS',actual:await run(h)});}catch(e){results.push({name,status:'FAIL',error:e.message,stack:e.stack});}finally{h?.close();}}return results;
}
