import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {proRootKey,proOperationKey,proHistoryKey,proRecoveryHeadKey,proRecord,validateProRoot,validateProJournalChain} from '../../src/pro/integration/storage-registry.mjs';
import {digest} from '../../src/data/hash.mjs';
import {planTransaction,previewUndo} from '../../src/pro/domain/index.mjs';

async function edit(db,store,key,fn){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store),q=s.get(key);q.onsuccess=()=>{const row=fn(q.result);if(row===null)s.delete(key);else s.put(row);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function get(db,store,key){return new Promise((resolve,reject)=>{const tx=db.transaction(store),q=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}
async function fixture(name,total=512){
  const factory=new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,databaseName:'history_'+name,fixtureOnly:true}),controller=await createProController(owner);
  const first=await controller.dispatch({type:'CREATE_TOPIC',name:'旧操作及完整 inverse 必须永久保留'}),db=await owner.base.open(),initial=await owner.raw(),expected=controller.getSnapshot().versions,key=proRootKey(owner.scope.key);
  // A lawful synthetic persisted /1 root at the exact old limit. Every row
  // uses the real registered proposal-registration codec and is validated as
  // one complete chain before the actual store performs rollover and edits.
  const records=[...initial.records];
  for(let i=2;i<=total;i++){
    const operationId='history_seed_'+i,transaction={operationId,actor:'system',provenance:'proposal-registration',base:structuredClone(expected),planHash:digest(['history_seed',i]),resultRevision:initial.state.revision,
      proposalId:null,inverse:[],patch:[],inverseHash:digest({inverse:[],readSet:[]}),readSet:[],status:'applied'};
    records.push({format:'vaiwl-pro-journal/1',scopeKey:key,targetScopeKey:owner.scope.key,sequence:i,fingerprint:digest({seed:i}),transaction});
  }
  const current=(await get(db,'b23_states',key)).payload,root=validateProRoot({...current,sequence:total,operationIds:records.map(r=>r.transaction.operationId)},owner.scope.key);validateProJournalChain(root,records);
  await new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states','b23_operations'],'readwrite');tx.objectStore('b23_states').put(proRecord(key,root));for(const row of records.slice(1))tx.objectStore('b23_operations').put(proRecord(proOperationKey(owner.scope.key,row.transaction.operationId),row));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  return {factory,owner,controller,db,key,records,expected,first,total};
}
async function next(f,id='after_rollover',command={type:'SET_DERIVED_TITLE',refId:'c_beta',title:'跨越旧容量上限后仍可编辑'}){
  const data=await f.owner.raw(),snapshot={...f.controller.getSnapshot(),versions:{...f.expected,overlayRevision:data.state.revision}};
  const expected=snapshot.versions,fingerprint={command,expected};
  const request={operationId:id,expected,fingerprint,execute(state){const plan=planTransaction(state,command,{actor:'human',operationId:id,snapshot,expected,mode:'pro-default-none',operations:{}});return {state:plan.state,transaction:{operationId:id,actor:'human',provenance:'explicit-user-command',base:expected,planHash:plan.planHash,resultRevision:plan.state.revision,proposalId:null,
    inverse:plan.inverse,patch:plan.patch,inverseHash:plan.inverseHash,readSet:plan.readSet,status:'applied'}};}};
  const result=await f.owner.store.transact(f.owner.grant(),request);return {result,request};
}

test('operation 10,001 rolls to lossless bounded history and keeps oldest receipt, inverse, assets and newest editing',async()=>{
  const f=await fixture('old_limit',10000);try{
    const firstOriginal=await get(f.db,'b23_operations',proOperationKey(f.owner.scope.key,f.first.operationId));
    const {result}=await next(f);assert.equal(result.ok,true,result.reason);
    const current=await f.owner.raw(),root=await get(f.db,'b23_states',f.key);
    assert.equal(current.sequence,10001);assert.equal(current.records.length,1);assert.equal(root.payload.format,'vaiwl-pro-root/2');assert.equal(root.payload.history.sequence,10000);
    assert.equal(Object.keys(current.state.topics).length,1);assert.equal(current.state.titles.c_beta.title,'跨越旧容量上限后仍可编辑');
    assert.deepEqual(await get(f.db,'b23_operations',proOperationKey(f.owner.scope.key,f.first.operationId)),firstOriginal);
    const oldest=await f.owner.store.getOperation(f.owner.grant(),f.first.operationId);assert.deepEqual(oldest.transaction,f.records[0].transaction);
    const replay=await f.owner.store.transact(f.owner.grant(),{operationId:f.first.operationId,expected:f.records[0].transaction.base,fingerprint:{actor:'human',command:{type:'CREATE_TOPIC',name:'旧操作及完整 inverse 必须永久保留'},expected:f.records[0].transaction.base},execute(){throw Error('must-not-execute');}});
    assert.equal(replay.ok,true,replay.reason);assert.equal(replay.replayed,true);
    const last=await f.owner.store.readHistory(f.owner.grant(),{offset:9999,limit:10});assert.deepEqual(last.records.map(r=>r.sequence),[2,1]);assert.equal(last.total,10001);assert.equal(last.hasMore,false);
    const edge=await f.owner.store.readHistory(f.owner.grant(),{offset:0,limit:3});assert.deepEqual(edge.records.map(r=>r.sequence),[10001,10000,9999]);assert.equal(edge.hasMore,true);
    const visible=await f.owner.store.readHistory(f.owner.grant(),{offset:0,limit:1,visibleOnly:true});assert.equal(visible.total,2);assert.deepEqual(visible.records.map(r=>r.sequence),[10001]);assert.equal(visible.hasMore,true);
    const oldVisible=await f.owner.store.readHistory(f.owner.grant(),{offset:1,limit:1,visibleOnly:true});assert.equal(oldVisible.total,2);assert.deepEqual(oldVisible.records.map(r=>r.sequence),[1]);assert.equal(oldVisible.hasMore,false);
    assert.equal((await next(f,'second_edit',{type:'SET_TITLE_DISPLAY',refId:'c_beta',displayPreference:'native'})).result.ok,true);
    assert.equal((await f.owner.raw()).records.length,2);
  }finally{f.controller.destroy();}
});

test('an archived operation supports complete atomic undo and does not erase a later independent title',async()=>{
  const f=await fixture('undo');try{
    assert.equal((await next(f)).result.ok,true);const before=await f.owner.raw(),old=await f.owner.store.getOperation(f.owner.grant(),f.first.operationId),preview=previewUndo(before.state,old.transaction);assert.equal(preview.state,'ready');
    const expected={...f.expected,overlayRevision:before.state.revision},snapshot={...f.controller.getSnapshot(),versions:expected},id='undo_archived';
    const result=await f.owner.store.transact(f.owner.grant(),{operationId:id,expected,historyOperationIds:[f.first.operationId],fingerprint:{undo:f.first.operationId},execute(state,rows){
      const operations=Object.fromEntries(rows.filter(r=>r.transaction.actor!=='system').map(r=>[r.transaction.operationId,r.transaction]));
      const command={type:'UNDO_TRANSACTION',targetOperationId:f.first.operationId,reviewedInverseHash:preview.inverseHash},plan=planTransaction(state,command,{actor:'human',operationId:id,snapshot,expected,mode:'pro-default-none',operations});
      return {state:plan.state,undoneOperationId:f.first.operationId,transaction:{operationId:id,actor:'human',provenance:'explicit-user-command',base:expected,planHash:plan.planHash,resultRevision:plan.state.revision,proposalId:null,inverse:plan.inverse,patch:plan.patch,inverseHash:plan.inverseHash,readSet:plan.readSet,status:'applied'}};
    }});assert.equal(result.ok,true,result.reason);const after=await f.owner.raw();assert.equal(Object.keys(after.state.topics).length,0);assert(after.state.titles.c_beta);
    const archived=await f.owner.store.getOperation(f.owner.grant(),f.first.operationId);assert.equal(archived.transaction.status,'undone');assert.deepEqual(archived.transaction.inverse,old.transaction.inverse);
  }finally{f.controller.destroy();}
});

test('rollover is atomic under quota, concurrent CAS and grant invalidation; old root remains usable',async()=>{
  const f=await fixture('atomic');try{
    const root=await get(f.db,'b23_states',f.key);f.factory.failNextPut=true;const failed=await next(f,'quota');assert.equal(failed.result.ok,false);assert.match(failed.result.reason,/Quota/);assert.deepEqual(await get(f.db,'b23_states',f.key),root);assert.equal(await get(f.db,'b23_checkpoints',proHistoryKey(f.owner.scope.key,1)),undefined);
    const [a,b]=await Promise.all([next(f,'race_a'),next(f,'race_b')]);assert.equal([a,b].filter(v=>v.result.ok).length,1);assert.equal((await f.owner.raw()).sequence,513);
    const archive=await get(f.db,'b23_checkpoints',proHistoryKey(f.owner.scope.key,1));assert.equal(archive.payload.operationIds.length,512);
    const before=await f.owner.raw();await assert.rejects(()=>f.owner.store.readHistory({},{}),/grant/);assert.deepEqual(await f.owner.raw(),before);
  }finally{f.controller.destroy();}
});

test('archived receipt changes, missing archive, future codec and orphan log never become valid replay or undo',async()=>{
  for(const kind of ['receipt','missing','future','orphan']){const f=await fixture('corrupt_'+kind);try{
    assert.equal((await next(f)).result.ok,true);
    if(kind==='receipt')await edit(f.db,'b23_operations',proOperationKey(f.owner.scope.key,f.first.operationId),row=>{row.payload.fingerprint=digest('changed');row.checksum=digest(row.payload);return row;});
    if(kind==='missing')await edit(f.db,'b23_checkpoints',proHistoryKey(f.owner.scope.key,1),()=>null);
    if(kind==='future')await edit(f.db,'b23_checkpoints',proHistoryKey(f.owner.scope.key,1),row=>{row.payload.format='future-history/2';row.checksum=digest(row.payload);return row;});
    if(kind==='orphan')await edit(f.db,'b23_operations',proOperationKey(f.owner.scope.key,'orphan'),()=>{const row=structuredClone(f.records[0]);row.transaction.operationId='orphan';return proRecord(proOperationKey(f.owner.scope.key,'orphan'),row);});
    await assert.rejects(()=>f.owner.store.getOperation(f.owner.grant(),kind==='orphan'?'orphan':f.first.operationId),/history|orphan/);
  }finally{f.controller.destroy();}}
});

test('segmented missing-root recovery proves the last successor without replaying archived data or permissions',async()=>{
  const f=await fixture('recovery');try{
    assert.equal((await next(f)).result.ok,true);const original=await f.owner.raw(),expected={...f.expected,overlayRevision:original.state.revision};
    await edit(f.db,'b23_states',f.key,()=>null);await assert.rejects(()=>f.owner.raw(),/missing-root/);
    const preview=await f.owner.store.previewRecovery(f.owner.grant(),{expected});assert.equal(preview.sequence,513);
    const result=await f.owner.store.recover(f.owner.grant(),{operationId:'repair_segmented',expected,planHash:preview.planHash});assert.equal(result.ok,true,result.reason);assert.equal(result.value.processingMode,'off');assert.deepEqual(await f.owner.raw(),original);
    assert.equal((await f.owner.store.getOperation(f.owner.grant(),f.first.operationId)).transaction.operationId,f.first.operationId);
    assert.equal((await next(f,'post_recovery',{type:'SET_TITLE_DISPLAY',refId:'c_beta',displayPreference:'native'})).result.ok,true);
  }finally{f.controller.destroy();}
});

test('segmented recovery refuses an absent final suffix, altered checkpoint or unproved new archive',async()=>{
  for(const kind of ['last','checkpoint']){const f=await fixture('recovery_bad_'+kind);try{
    assert.equal((await next(f)).result.ok,true);const current=await f.owner.raw(),expected={...f.expected,overlayRevision:current.state.revision};await edit(f.db,'b23_states',f.key,()=>null);
    if(kind==='last')await edit(f.db,'b23_operations',proOperationKey(f.owner.scope.key,'after_rollover'),()=>null);
    else await edit(f.db,'b23_checkpoints',f.key,row=>{Object.values(row.payload.state.topics)[0].name='a different checkpoint';row.checksum=digest(row.payload);return row;});
    await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected}),/high-water|history|conflict/);
  }finally{f.controller.destroy();}}
});

test('a segmented repaired checkpoint cannot hide a lost human successor after repair',async()=>{
  const f=await fixture('repaired_suffix_loss');try{
    assert.equal((await next(f)).result.ok,true);let current=await f.owner.raw(),expected={...f.expected,overlayRevision:current.state.revision};await edit(f.db,'b23_states',f.key,()=>null);
    const preview=await f.owner.store.previewRecovery(f.owner.grant(),{expected});assert.equal((await f.owner.store.recover(f.owner.grant(),{operationId:'repair_segmented_first',expected,planHash:preview.planHash})).ok,true);
    assert.equal((await next(f,'new_after_segmented_repair',{type:'SET_TITLE_DISPLAY',refId:'c_beta',displayPreference:'native'})).result.ok,true);
    await edit(f.db,'b23_states',f.key,()=>null);await edit(f.db,'b23_operations',proOperationKey(f.owner.scope.key,'new_after_segmented_repair'),()=>null);
    await assert.rejects(()=>f.owner.store.previewRecovery(f.owner.grant(),{expected:{...expected,overlayRevision:0,constraintRevision:0}}),/high-water|incomplete-history/);
    assert(await get(f.db,'b23_checkpoints',proHistoryKey(f.owner.scope.key,1)));
  }finally{f.controller.destroy();}
});

test('the first rollover after a full-chain repair retains reader3 and atomically advances the current high-water',async()=>{
  const f=await fixture('repair_then_rollover');try{
    // The valid synthetic /1 root proves all 512 retained receipts. Repairing
    // its missing checkpoint exercises /3 before the first history segment.
    await edit(f.db,'b23_checkpoints',f.key,()=>null);const expected=f.expected,preview=await f.owner.store.previewRecovery(f.owner.grant(),{expected});
    assert.equal((await f.owner.store.recover(f.owner.grant(),{operationId:'repair_before_archive',expected,planHash:preview.planHash})).ok,true);
    const rootBefore=await get(f.db,'b23_states',f.key),headKey=proRecoveryHeadKey(f.owner.scope.key),headBefore=await get(f.db,'b23_states',headKey);assert.equal(rootBefore.payload.minimumReader,'vaiwl-pro-storage/3');
    f.factory.failNextPut=true;assert.equal((await next(f,'rollover_after_repair')).result.ok,false);assert.deepEqual(await get(f.db,'b23_states',f.key),rootBefore);assert.deepEqual(await get(f.db,'b23_states',headKey),headBefore);
    assert.equal((await next(f,'rollover_after_repair')).result.ok,true);const root=await get(f.db,'b23_states',f.key),head=await get(f.db,'b23_states',headKey);
    assert.equal(root.payload.format,'vaiwl-pro-root/2');assert.equal(root.payload.minimumReader,'vaiwl-pro-storage/3');assert.equal(root.payload.history.sequence,512);assert.deepEqual(head.payload.current,{sequence:513,overlayRevision:root.payload.state.revision,checksum:root.checksum});
    assert.equal((await f.owner.store.getOperation(f.owner.grant(),f.first.operationId)).transaction.operationId,f.first.operationId);
  }finally{f.controller.destroy();}
});

test('a retained immutable history page prevents reinitialization after root, checkpoint and journals are missing',async()=>{
  const f=await fixture('archive_witness');try{
    assert.equal((await next(f)).result.ok,true);
    await new Promise((resolve,reject)=>{const tx=f.db.transaction(['b23_states','b23_checkpoints','b23_operations'],'readwrite');tx.objectStore('b23_states').delete(f.key);tx.objectStore('b23_checkpoints').delete(f.key);for(const id of [...f.records.map(r=>r.transaction.operationId),'after_rollover'])tx.objectStore('b23_operations').delete(proOperationKey(f.owner.scope.key,id));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
    await assert.rejects(()=>f.owner.raw(),/missing-root-with-history/);
    assert(await get(f.db,'b23_checkpoints',proHistoryKey(f.owner.scope.key,1)));
  }finally{f.controller.destroy();}
});
