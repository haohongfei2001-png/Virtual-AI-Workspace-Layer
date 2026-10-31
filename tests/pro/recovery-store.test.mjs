import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {createSameDatabaseStore} from '../../src/pro/integration/same-db-store.mjs';
import {proRootKey,proOperationKey,proRecoveryKey,proRetentionDecision} from '../../src/pro/integration/storage-registry.mjs';
import {digest,stable} from '../../src/data/hash.mjs';

async function edit(db,store,key,fn){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store),q=s.get(key);q.onsuccess=()=>{const row=fn(q.result);if(row===null)s.delete(key);else s.put(row);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function rows(db){const names=['b23_states','b23_checkpoints','b23_operations','native_states','native_operations'];return new Promise(resolve=>{const out={},tx=db.transaction(names);for(const name of names){out[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){out[name].push(q.result.value);q.result.continue();}};}tx.oncomplete=()=>resolve(out);});}
async function fixture(name){
 const factory=new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,databaseName:'recovery_'+name,fixtureOnly:true}),controller=await createProController(owner);
 await controller.dispatch({type:'CREATE_TOPIC',name:'必须保留的主题'});await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'人工名称'});
 const topicId=Object.keys(controller.getState().topics)[0];await controller.dispatch({type:'EXCLUDE_TOPIC',refId:'c_gamma',topicId});
 const expected=controller.getSnapshot().versions,original=await owner.store.read(owner.grant()),db=await owner.base.open();return {factory,owner,controller,expected,original,db,key:proRootKey(owner.scope.key)};
}
async function request(f,id='repair_once'){const preview=await f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected});return {operationId:id,expected:f.expected,planHash:preview.planHash,requestFingerprint:{kind:'explicit-recovery',review:digest(f.expected),id}};}

test('explicit missing-root recovery reconstructs all assets, retains original evidence and exact operation receipt',async()=>{
 const f=await fixture('missing');try{
 const beforeAll=await rows(f.db);await edit(f.db,'b23_states',f.key,()=>null);const damaged=await rows(f.db);
 await assert.rejects(()=>f.owner.store.read(f.owner.grant()),/missing-root-with-history/);
 const preview=await f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected});assert.equal(preview.sequence,3);assert.equal(preview.counts.topics,1);assert.equal(preview.counts.titles,1);assert.equal(preview.counts.constraints,1);assert.equal(preview.state,undefined);assert.equal(preview.records,undefined);assert.deepEqual(await rows(f.db),damaged);
 const input=await request(f),result=await f.owner.store.recover(f.owner.grant(),input);assert.equal(result.ok,true,result.reason);assert.equal(result.value.processingMode,'off');assert.equal(result.replayed,false);
 assert.deepEqual(await f.owner.store.read(f.owner.grant()),f.original);const repaired=await rows(f.db),quarantine=repaired.b23_states.find(r=>r.key===proRecoveryKey(f.owner.scope.key));
 assert.equal(quarantine.payload.original.root,null);assert.deepEqual(quarantine.payload.original.checkpoint,damaged.b23_checkpoints.find(r=>r.key===f.key));assert.equal(proRetentionDecision(quarantine.key).action,'retain');
 assert.deepEqual(repaired.b23_operations,beforeAll.b23_operations);assert.deepEqual(repaired.native_states,beforeAll.native_states);assert.deepEqual(repaired.native_operations,beforeAll.native_operations);
 const retry=await f.owner.store.recover(f.owner.grant(),input);assert.equal(retry.ok,true);assert.equal(retry.replayed,true);assert.deepEqual(await rows(f.db),repaired);
 const replay=await f.owner.store.reconcileRecovery(f.owner.grant(),{operationId:input.operationId,requestFingerprint:input.requestFingerprint});assert.equal(replay.replayed,true);assert.deepEqual(replay.value,result.value);
 const conflict=await f.owner.store.reconcileRecovery(f.owner.grant(),{operationId:input.operationId,requestFingerprint:{changed:true}});assert.equal(conflict.reason,'operation-replay-conflict');assert.deepEqual(await rows(f.db),repaired);
 const changed=await f.owner.store.recover(f.owner.grant(),{...input,requestFingerprint:{changed:true}});assert.equal(changed.reason,'operation-replay-conflict');assert.deepEqual(await rows(f.db),repaired);
 }finally{f.controller.destroy();}
});

test('damaged known-codec root is preserved exactly while replay restores human lock and exclusion state',async()=>{
 const f=await fixture('checksum');try{await edit(f.db,'b23_states',f.key,row=>({...row,checksum:'0'.repeat(64)}));const damaged=await rows(f.db),input=await request(f);assert.equal((await f.owner.store.recover(f.owner.grant(),input)).ok,true);
 const after=await rows(f.db),quarantine=after.b23_states.find(r=>r.key===proRecoveryKey(f.owner.scope.key));assert.deepEqual(quarantine.payload.original.root,damaged.b23_states.find(r=>r.key===f.key));assert.deepEqual((await f.owner.store.read(f.owner.grant())).state,f.original.state);
 }finally{f.controller.destroy();}
});

test('missing first, middle or final journal, and missing root plus checkpoint, never become a shorter successful recovery',async()=>{
 for(const index of [0,1,2,'checkpoint']){const f=await fixture('gap_'+index);try{
 await edit(f.db,'b23_states',f.key,()=>null);
 if(index==='checkpoint')await edit(f.db,'b23_checkpoints',f.key,()=>null);else await edit(f.db,'b23_operations',proOperationKey(f.owner.scope.key,f.original.records[index].transaction.operationId),()=>null);
 const before=await rows(f.db);await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected}),/incomplete-history|high-water-unproven/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}}
});

test('future codec, corrupt or cross-scope logs including a broken scope index, and inconsistent checkpoint fail closed',async()=>{
 for(const kind of ['future-root','wrong-scope-root','future-checkpoint','future-log','checksum','wrong-scope-index','bad-checkpoint','missing-inverse']){const f=await fixture(kind);try{
 if(kind==='future-root')await edit(f.db,'b23_states',f.key,row=>{row.payload.minimumReader='vaiwl-pro-overlay/2';row.checksum=digest(row.payload);return row;});
 else if(kind==='wrong-scope-root')await edit(f.db,'b23_states',f.key,row=>{row.payload.state.scopeKey='foreign-scope';row.checksum='0'.repeat(64);return row;});
 else {await edit(f.db,'b23_states',f.key,()=>null);
  if(['future-checkpoint','bad-checkpoint'].includes(kind))await edit(f.db,'b23_checkpoints',f.key,row=>{if(kind==='future-checkpoint')row.payload.minimumReader='vaiwl-pro-overlay/2';else Object.values(row.payload.state.topics)[0].name='不属于历史的合法形状';row.checksum=digest(row.payload);return row;});
  else await edit(f.db,'b23_operations',proOperationKey(f.owner.scope.key,f.original.records[0].transaction.operationId),row=>{if(kind==='future-log')row.payload.format='vaiwl-pro-journal/2';if(kind==='wrong-scope-index')row.payload.scopeKey='other';if(kind==='missing-inverse'){row.payload.transaction.inverse=[];row.payload.transaction.inverseHash=digest({inverse:[],readSet:row.payload.transaction.readSet});}row.checksum=kind==='checksum'?'0'.repeat(64):digest(row.payload);return row;});
 }
 const before=await rows(f.db);await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected}),/incompatible|corrupt|journal|checkpoint-history-conflict|cross-scope/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}}
});

test('a valid root and contradictory replay cannot silently choose history and erase a retained asset',async()=>{
 const f=await fixture('conflict');try{await edit(f.db,'b23_states',f.key,row=>{Object.values(row.payload.state.topics)[0].name='原根中的不同人工名称';row.checksum=digest(row.payload);return row;});const before=await rows(f.db);await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected}),/root-history-conflict/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});

test('a higher rejected root index cannot be ignored even when its journal index is also malformed',async()=>{
 const f=await fixture('higher');try{await edit(f.db,'b23_states',f.key,row=>{row.payload.sequence+=1;row.checksum='0'.repeat(64);return row;});const before=await rows(f.db);await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected}),/incomplete-history/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});

test('preview source CAS, changed raw root CAS and withdrawn live grant cannot authorize recovery',async()=>{
 const f=await fixture('fences');try{const grant=f.owner.grant();await edit(f.db,'b23_states',f.key,()=>null);const before=await rows(f.db);
 const wrong={...f.expected,nativeFields:{...f.expected.nativeFields,nativeRoot:f.expected.nativeFields.nativeRoot+1}};await assert.rejects(()=>f.owner.store.previewRecovery(grant,{expected:wrong}),/activity-revision-conflict/);assert.deepEqual(await rows(f.db),before);
 const input=await request(f);await edit(f.db,'b23_states',f.key,()=>({...before.b23_checkpoints.find(r=>r.key===f.key),checksum:'0'.repeat(64)}));const changed=await rows(f.db);
 const stale=await f.owner.store.recover(grant,input);assert.equal(stale.ok,false);assert.match(stale.reason,/plan-changed/);assert.deepEqual(await rows(f.db),changed);
 f.owner.revoke();const denied=await f.owner.store.recover(grant,input);assert.equal(denied.ok,false);assert.match(denied.reason,/grant/);assert.deepEqual(await rows(f.db),changed);
 }finally{f.controller.destroy();}
});

test('abort after the immutable quarantine write and quota failure roll back root, checkpoint and evidence together',async()=>{
 for(const reason of ['signal','quota','grant']){const f=await fixture('abort_'+reason);try{await edit(f.db,'b23_states',f.key,()=>null);const input=await request(f),before=await rows(f.db),abort=new AbortController(),grant=f.owner.grant();
 const originalTransaction=f.db.transaction.bind(f.db);if(reason==='quota')f.factory.failNextPut=true;else f.db.transaction=(...args)=>{const tx=originalTransaction(...args),originalStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const s=originalStore(name);if(name==='b23_states'&&args[1]==='readwrite'){const add=s.add.bind(s);s.add=row=>{const q=add(row);if(row.key===proRecoveryKey(f.owner.scope.key))q.onsuccess=()=>{if(reason==='signal')abort.abort();else f.owner.revoke();};return q;};}return s;};return tx;};
 const result=await f.owner.store.recover(grant,input,abort.signal);f.db.transaction=originalTransaction;assert.equal(result.ok,false);assert.match(result.reason,/aborted|Quota|grant/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}}
});

test('quarantine is immutable, a new damaged root does not overwrite prior evidence, and another scope cannot replay it',async()=>{
 const f=await fixture('immutable');try{await edit(f.db,'b23_states',f.key,()=>null);const input=await request(f);assert.equal((await f.owner.store.recover(f.owner.grant(),input)).ok,true);await edit(f.db,'b23_states',f.key,()=>null);const before=await rows(f.db);
 await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected}),/quarantine-occupied/);const again=await f.owner.store.recover(f.owner.grant(),{...input,operationId:'new_repair'});assert.equal(again.reason,'pro-recovery-quarantine-occupied');assert.deepEqual(await rows(f.db),before);
 const other=createSameDatabaseStore({enabled:true,connection:()=>f.db,verifyGrant:()=>({...f.owner.capabilities.scope,key:'other-scope'}),verifyInputFence(){throw Error('must-not-run');}});assert.equal(await other.reconcileRecovery({}, {operationId:input.operationId,requestFingerprint:input.requestFingerprint}),null);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});

test('healthy root refuses unnecessary repair and recovery does not initialize an empty namespace',async()=>{
 const f=await fixture('healthy');try{const before=await rows(f.db);await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected}),/not-needed/);assert.deepEqual(await rows(f.db),before);
 const other=createSameDatabaseStore({enabled:true,connection:()=>f.db,verifyGrant:()=>({...f.owner.capabilities.scope,key:'empty-scope'}),verifyInputFence(){throw Error('must-not-run');}});await assert.rejects(()=>other.previewRecovery({}, {expected:{...f.expected,scopeKey:'empty-scope'}}),/no-history/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});

test('async source fence is rejected with zero queued recovery changes and no unhandled rejection',async()=>{
 const f=await fixture('async');try{await edit(f.db,'b23_states',f.key,()=>null);const before=await rows(f.db),store=createSameDatabaseStore({enabled:true,connection:()=>f.db,verifyGrant:()=>f.owner.capabilities.scope,verifyInputFence:()=>runInNewContext('Promise.reject(new Error("private foreign-realm failure"))')});await assert.rejects(()=>store.previewRecovery({}, {expected:f.expected}),/async-pro-input-fence-denied/);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(await rows(f.db),before);
 const input=await request(f);let entered=false;const late=createSameDatabaseStore({enabled:true,connection:()=>f.db,verifyGrant:()=>f.owner.capabilities.scope,verifyInputFence(tx,scope,expected,check,ready){ready();entered=true;return runInNewContext('Promise.reject(new Error("foreign failure after repair writes queued"))');}});
 const result=await late.recover({},input);assert.equal(entered,true);assert.equal(result.reason,'async-pro-input-fence-denied');await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});

test('retained recovery evidence prevents an all-root-and-history-loss scope from being silently initialized',async()=>{
 const f=await fixture('quarantine_witness');try{await edit(f.db,'b23_states',f.key,()=>null);const input=await request(f);assert.equal((await f.owner.store.recover(f.owner.grant(),input)).ok,true);
 await edit(f.db,'b23_states',f.key,()=>null);await edit(f.db,'b23_checkpoints',f.key,()=>null);for(const row of f.original.records)await edit(f.db,'b23_operations',proOperationKey(f.owner.scope.key,row.transaction.operationId),()=>null);
 const before=await rows(f.db);await assert.rejects(()=>f.owner.store.read(f.owner.grant()),/missing-root-with-history/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});

test('concurrent same repair commits once and another operation cannot replace its immutable evidence',async()=>{
 const f=await fixture('concurrent');try{await edit(f.db,'b23_states',f.key,()=>null);const input=await request(f),grant=f.owner.grant();
 const both=await Promise.all([f.owner.store.recover(grant,input),f.owner.store.recover(grant,input)]);assert.equal(both.filter(r=>r.ok&&!r.replayed).length,1);assert.equal(both.filter(r=>r.ok&&r.replayed).length,1);
 const before=await rows(f.db),different=await f.owner.store.recover(grant,{...input,operationId:'different_repair'});assert.equal(different.reason,'pro-recovery-quarantine-occupied');assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});
