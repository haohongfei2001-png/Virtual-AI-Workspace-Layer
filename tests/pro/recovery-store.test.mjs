import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {createSameDatabaseStore} from '../../src/pro/integration/same-db-store.mjs';
import {proRootKey,proOperationKey,proRecoveryKey,proRecoveryHeadKey,proRecoveryReceiptKey,proRetentionDecision} from '../../src/pro/integration/storage-registry.mjs';
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

test('repeated corruption appends immutable evidence, preserves new edits and replays every exact old repair',async()=>{
 const f=await fixture('immutable');try{
 await edit(f.db,'b23_states',f.key,()=>null);const first=await request(f),one=await f.owner.store.recover(f.owner.grant(),first);assert.equal(one.ok,true,one.reason);
 const legacy=(await rows(f.db)).b23_states.find(row=>row.key===proRecoveryKey(f.owner.scope.key));
 // No intervening edit: the prior explicit repair itself must prove the
 // checkpoint high-water, instead of requiring a nonexistent fourth journal.
 await edit(f.db,'b23_states',f.key,()=>null);const second=await request(f,'repair_twice');assert.notEqual(second.planHash,first.planHash);
 const two=await f.owner.store.recover(f.owner.grant(),second);assert.equal(two.ok,true,two.reason);assert.deepEqual(await f.owner.store.read(f.owner.grant()),f.original);
 const afterTwo=await rows(f.db),secondRow=afterTwo.b23_states.find(row=>row.key===proRecoveryReceiptKey(f.owner.scope.key,second.operationId));
 assert.deepEqual(afterTwo.b23_states.find(row=>row.key===legacy.key),legacy);assert.equal(secondRow.payload.format,'vaiwl-pro-recovery/2');assert.equal(secondRow.payload.previous.checksum,legacy.checksum);assert.equal(proRetentionDecision(secondRow.key).action,'retain');
 assert.equal(afterTwo.b23_states.find(row=>row.key===proRecoveryHeadKey(f.owner.scope.key)).payload.latest.number,2);
 await f.controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'多次恢复后仍可继续人工编辑'});f.expected=f.controller.getSnapshot().versions;const updated=await f.owner.store.read(f.owner.grant());
 await edit(f.db,'b23_states',f.key,row=>({...row,checksum:'0'.repeat(64)}));const third=await request(f,'repair_third'),three=await f.owner.store.recover(f.owner.grant(),third);assert.equal(three.ok,true,three.reason);assert.deepEqual(await f.owner.store.read(f.owner.grant()),updated);
 const final=await rows(f.db);assert.deepEqual(final.b23_states.find(row=>row.key===legacy.key),legacy);assert.deepEqual(final.b23_states.find(row=>row.key===secondRow.key),secondRow);assert.equal(final.b23_states.find(row=>row.key===proRecoveryHeadKey(f.owner.scope.key)).payload.latest.number,3);
 for(const [input,written] of [[first,one],[second,two],[third,three]]){const replay=await f.owner.store.reconcileRecovery(f.owner.grant(),{operationId:input.operationId,requestFingerprint:input.requestFingerprint});assert.equal(replay.replayed,true);assert.deepEqual(replay.value,written.value);assert.equal((await f.owner.store.recover(f.owner.grant(),input)).replayed,true);}
 const conflict=await f.owner.store.reconcileRecovery(f.owner.grant(),{operationId:first.operationId,requestFingerprint:{changed:true}});assert.equal(conflict.reason,'operation-replay-conflict');
 const other=createSameDatabaseStore({enabled:true,connection:()=>f.db,verifyGrant:()=>({...f.owner.capabilities.scope,key:'other-scope'}),verifyInputFence(){throw Error('must-not-run');}});assert.equal(await other.reconcileRecovery({}, {operationId:first.operationId,requestFingerprint:first.requestFingerprint}),null);assert.deepEqual(await rows(f.db),final);
 }finally{f.controller.destroy();}
});

test('a headless legacy quarantine cannot prove a missing successor; its next normal write upgrades the writer fence',async()=>{
 const f=await fixture('legacy_repair');try{
 await edit(f.db,'b23_states',f.key,()=>null);const first=await request(f);assert.equal((await f.owner.store.recover(f.owner.grant(),first)).ok,true);
 // Lawful old /1 persisted fixture: the old repair wrote a /1 reader root and
 // checksum-bound receipt, with no high-water head. It cannot certify that an
 // older writer never committed a later, now-missing successor.
 await edit(f.db,'b23_states',f.key,row=>{row.payload.minimumReader='vaiwl-pro-overlay/1';row.checksum=digest(row.payload);return row;});
 const legacyRoot=(await rows(f.db)).b23_states.find(row=>row.key===f.key);await edit(f.db,'b23_checkpoints',f.key,()=>structuredClone(legacyRoot));
 await edit(f.db,'b23_states',proRecoveryKey(f.owner.scope.key),row=>{const p=row.payload;p.repairedChecksum=legacyRoot.checksum;p.receipt.planHash=digest({format:'vaiwl-pro-recovery/1',scopeKey:f.owner.scope.key,expected:f.expected,root:p.original.root,checkpoint:p.original.checkpoint,journalDigest:p.journalDigest,repairedChecksum:legacyRoot.checksum});row.checksum=digest(p);return row;});
 const original=(await rows(f.db)).b23_states.find(row=>row.key===proRecoveryKey(f.owner.scope.key));await edit(f.db,'b23_states',proRecoveryHeadKey(f.owner.scope.key),()=>null);await edit(f.db,'b23_states',f.key,()=>null);
 await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected}),/high-water-unproven/);
 await edit(f.db,'b23_states',f.key,()=>legacyRoot);await f.controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'旧版恢复后的新人工编辑'});f.expected=f.controller.getSnapshot().versions;const latest=await f.owner.raw();
 const upgraded=await rows(f.db),head=upgraded.b23_states.find(row=>row.key===proRecoveryHeadKey(f.owner.scope.key));assert.equal(head.payload.current.sequence,latest.sequence);assert.equal(upgraded.b23_states.find(row=>row.key===f.key).payload.minimumReader,'vaiwl-pro-storage/3');
 await edit(f.db,'b23_states',f.key,()=>null);const second=await request(f,'legacy_next'),result=await f.owner.store.recover(f.owner.grant(),second);assert.equal(result.ok,true,result.reason);assert.deepEqual((await rows(f.db)).b23_states.find(row=>row.key===original.key),original);assert.deepEqual(await f.owner.store.read(f.owner.grant()),latest);
 assert.equal((await f.owner.store.reconcileRecovery(f.owner.grant(),{operationId:first.operationId,requestFingerprint:first.requestFingerprint})).replayed,true);
 }finally{f.controller.destroy();}
});

test('repair then human edit then missing root and final journal cannot roll back to the earlier repaired checkpoint',async()=>{
 const f=await fixture('lost_post_repair_edit');try{
 await edit(f.db,'b23_states',f.key,()=>null);const first=await request(f);assert.equal((await f.owner.store.recover(f.owner.grant(),first)).ok,true);
 await f.controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'最新人工资产不得因旧修复凭据而丢失'});const latest=await f.owner.raw(),last=latest.records.at(-1),head=(await rows(f.db)).b23_states.find(row=>row.key===proRecoveryHeadKey(f.owner.scope.key));assert.equal(head.payload.current.sequence,latest.sequence);
 await edit(f.db,'b23_states',f.key,()=>null);await edit(f.db,'b23_operations',proOperationKey(f.owner.scope.key,last.transaction.operationId),()=>null);const damaged=await rows(f.db);
 // A restarted owner cannot derive the lost overlay revision from an absent
 // root. The durable marker, not this caller vector, must detect lost history.
 const expected={...f.expected,overlayRevision:0,constraintRevision:0};await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected}),/high-water|incomplete-history/);assert.deepEqual(await rows(f.db),damaged);
 assert.equal((await f.owner.store.reconcileRecovery(f.owner.grant(),{operationId:first.operationId,requestFingerprint:first.requestFingerprint})).replayed,true);assert.deepEqual(await rows(f.db),damaged);
 }finally{f.controller.destroy();}
});

test('missing, rolled-back or corrupt recovery history is not replaced by a shorter repair sequence',async()=>{
 for(const kind of ['head-missing','head-rollback','receipt-missing','receipt-corrupt']){const f=await fixture('history_'+kind);try{
 await edit(f.db,'b23_states',f.key,()=>null);const first=await request(f);assert.equal((await f.owner.store.recover(f.owner.grant(),first)).ok,true);const headOne=(await rows(f.db)).b23_states.find(row=>row.key===proRecoveryHeadKey(f.owner.scope.key));
 await edit(f.db,'b23_states',f.key,()=>null);const second=await request(f,'second');assert.equal((await f.owner.store.recover(f.owner.grant(),second)).ok,true);await edit(f.db,'b23_states',f.key,()=>null);
 if(kind==='head-missing')await edit(f.db,'b23_states',headOne.key,()=>null);
 else if(kind==='head-rollback')await edit(f.db,'b23_states',headOne.key,()=>headOne);
 else await edit(f.db,'b23_states',proRecoveryReceiptKey(f.owner.scope.key,second.operationId),row=>kind==='receipt-missing'?null:{...row,checksum:'0'.repeat(64)});
 const before=await rows(f.db);await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected}),/pro-recovery-(?:head|history|receipt|quarantine)/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}}
});

test('quota failure while appending a later repair keeps the previous head and every original receipt',async()=>{
 const f=await fixture('append_quota');try{
 await edit(f.db,'b23_states',f.key,()=>null);const first=await request(f);assert.equal((await f.owner.store.recover(f.owner.grant(),first)).ok,true);await edit(f.db,'b23_states',f.key,()=>null);
 const second=await request(f,'second_quota'),before=await rows(f.db);f.factory.failNextPut=true;const rejected=await f.owner.store.recover(f.owner.grant(),second);assert.equal(rejected.ok,false);assert.match(rejected.reason,/Quota/);assert.deepEqual(await rows(f.db),before);
 assert.equal((await f.owner.store.recover(f.owner.grant(),second)).ok,true);assert.deepEqual(await f.owner.store.read(f.owner.grant()),f.original);
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

test('an appended recovery receipt alone also prevents silent empty reinitialization',async()=>{
 const f=await fixture('appended_witness');try{
 await edit(f.db,'b23_states',f.key,()=>null);const first=await request(f);assert.equal((await f.owner.store.recover(f.owner.grant(),first)).ok,true);await edit(f.db,'b23_states',f.key,()=>null);const second=await request(f,'surviving_appended_receipt');assert.equal((await f.owner.store.recover(f.owner.grant(),second)).ok,true);
 for(const key of [f.key,proRecoveryKey(f.owner.scope.key),proRecoveryHeadKey(f.owner.scope.key)])await edit(f.db,'b23_states',key,()=>null);
 await edit(f.db,'b23_checkpoints',f.key,()=>null);for(const row of f.original.records)await edit(f.db,'b23_operations',proOperationKey(f.owner.scope.key,row.transaction.operationId),()=>null);
 const before=await rows(f.db);assert(before.b23_states.some(row=>row.key===proRecoveryReceiptKey(f.owner.scope.key,second.operationId)));
 await assert.rejects(()=>f.owner.store.read(f.owner.grant()),/missing-root-with-history/);await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:f.expected}),/recovery-head-missing/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});

test('concurrent same repair commits once and another operation cannot replace its immutable evidence',async()=>{
 const f=await fixture('concurrent');try{await edit(f.db,'b23_states',f.key,()=>null);const input=await request(f),grant=f.owner.grant();
 const both=await Promise.all([f.owner.store.recover(grant,input),f.owner.store.recover(grant,input)]);assert.equal(both.filter(r=>r.ok&&!r.replayed).length,1);assert.equal(both.filter(r=>r.ok&&r.replayed).length,1);
 const before=await rows(f.db),different=await f.owner.store.recover(grant,{...input,operationId:'different_repair'});assert.equal(different.reason,'pro-recovery-not-needed');assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});
