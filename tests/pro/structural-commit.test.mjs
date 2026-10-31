import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {placementId,topicIdForOperation} from '../../src/pro/domain/index.mjs';
import {proRootKey,proOperationKey} from '../../src/pro/integration/same-db-store.mjs';

// Explicit offline durability-boundary evidence: the real fixture owner,
// receipt verifier, domain planner and same-database adapter over MockIDB.
// This does not establish physical disk, browser crash or MV3 durability.
const TABLES=['b23_states','b23_checkpoints','b23_operations','native_states','native_operations'];
const clone=value=>structuredClone(value);
async function persistence(db){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(TABLES,'readonly'),result=Object.fromEntries(TABLES.map(name=>[name,[]]));
    for(const name of TABLES){const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const cursor=q.result;if(cursor){result[name].push(cursor.value);cursor.continue();}};}
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error??Error('fixture-read-aborted'));
  });
}
function unchanged(actual,expected){for(const name of TABLES)assert.deepEqual(actual[name],expected[name],`${name} must remain byte-equivalent data`);}
function row(data,table,key){return data[table].find(value=>value.key===key);}
async function fixture(kind){
  const factory=new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,databaseName:`structural_${kind}`,fixtureOnly:true}),controller=await createProController(owner);
  const a=topicIdForOperation('seed_topic_a'),b=topicIdForOperation('seed_topic_b'),c=topicIdForOperation('seed_topic_c');
  for(const suffix of ['a','b','c'])await controller.dispatch({type:'CREATE_TOPIC',name:`结构主题 ${suffix}`},{operationId:`seed_topic_${suffix}`});
  await controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId:a,role:'primary'});
  const betaTopic=kind==='split'?a:b;
  await controller.dispatch({type:'SET_PLACEMENT',refId:'c_beta',topicId:betaTopic,role:'primary'});
  await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'保留的人工标题'});
  const series=controller.previewSeries({topicId:betaTopic,title:'保留的工作线',entries:['c_beta'],edges:[],labels:[{refId:'c_beta',sequence:[2],source:'human-confirmed'}]});
  await controller.applyStructure(series);
  if(kind==='split')await controller.dispatch({type:'SET_LOCK',target:{kind:'placement',topicId:a,refId:'c_beta'},locked:false});
  const db=await owner.base.open();
  return {factory,owner,controller,db,a,b,c,close:()=>controller.destroy()};
}
async function intentRequest(f,command,operationId){
  const current=await f.owner.readPrivate(),expected=current.snapshot.versions;
  return {operationId,expected,command:{actor:'human',intent:f.owner.humanIntent(command,expected),command}};
}
const commit=(f,request)=>f.owner.ports.commit.commit(f.owner.grant(),request,new AbortController().signal);

function failJournalAfterRoot(db,rootKey,operationId){
  const original=db.transaction,events=[],staged={};
  db.transaction=function(stores,mode){
    const tx=original.call(this,stores,mode),objectStore=tx.objectStore.bind(tx);
    tx.objectStore=name=>{
      const store=objectStore(name);
      if(mode!=='readwrite')return store;
      const put=store.put.bind(store);
      if(name==='b23_operations'){
        store.put=value=>value.payload?.transaction?.operationId!==operationId?put(value):tx.enqueue(()=>{
          // These reads are confined to the test double's transaction-local
          // copies. They prove both preceding put actions actually ran.
          staged.root=clone(tx.local.get('b23_states').rows.get(rootKey));
          staged.checkpoint=clone(tx.local.get('b23_checkpoints').rows.get(rootKey));
          events.push('journal-put-failed');
          throw Object.assign(Error('QuotaExceededError'),{name:'QuotaExceededError'});
        });
      }else if(name==='b23_states'||name==='b23_checkpoints'){
        store.put=value=>{const q=put(value);if(value.key===rootKey)q.onsuccess=()=>events.push(name==='b23_states'?'root-put-succeeded':'checkpoint-put-succeeded');return q;};
      }
      return store;
    };
    return tx;
  };
  return {events,staged,restore(){db.transaction=original;}};
}

async function structuralFailure(kind){
  const f=await fixture(kind);
  try{
    const preview=kind==='split'?f.controller.previewSplit({retainId:f.a,children:[{draftKey:'beta',name:'独立修复线',members:['c_beta']}]}):f.controller.previewMerge({keepId:f.a,sourceIds:[f.b]});
    assert.deepEqual(preview.conflicts,[]);assert.ok(preview.proposal);
    await f.owner.registerProposals(f.owner.grant(),[preview.proposal],preview.proposal.versions);
    await f.controller.refresh();
    const command={type:'ACCEPT_PROPOSAL',proposalId:preview.proposal.id,planHash:preview.proposal.planHash};
    const failedId=`${kind}_failed_journal`,request=await intentRequest(f,command,failedId),before=await persistence(f.db),logicalBefore=await f.owner.raw();
    const rootKey=proRootKey(f.owner.scope.key),beforeRoot=row(before,'b23_states',rootKey),hook=failJournalAfterRoot(f.db,rootKey,failedId);
    let failed;
    try{failed=await commit(f,request);}finally{hook.restore();}
    assert.equal(failed.ok,false);assert.equal(failed.reason,'QuotaExceededError');
    assert.deepEqual(hook.events,['checkpoint-put-succeeded','root-put-succeeded','journal-put-failed']);
    assert.equal(hook.staged.root.payload.sequence,beforeRoot.payload.sequence+1);
    assert.equal(hook.staged.root.payload.state.proposals[preview.proposal.id].appliedOperationId,failedId);
    assert.deepEqual(hook.staged.checkpoint,beforeRoot);
    const after=await persistence(f.db);unchanged(after,before);assert.deepEqual(await f.owner.raw(),logicalBefore);
    assert.equal(row(after,'b23_operations',proOperationKey(f.owner.scope.key,failedId)),undefined);
    if(kind==='split'){
      const destination=preview.preview.destinations[0].to;
      assert.ok(hook.staged.root.payload.state.placements[placementId(destination,'c_beta')]);
      assert.equal(logicalBefore.state.topics[destination],undefined);
    }else assert.equal(hook.staged.root.payload.state.redirects[f.b].toTopicId,f.a);

    // The failed commit consumed its receipt for that ID. A new operation must
    // obtain a new reviewed intent, even though the database revision rolled back.
    const reused=await commit(f,{...request,operationId:`${kind}_reused_receipt`});
    assert.equal(reused.ok,false);assert.equal(reused.reason,'invalid-intent-or-ticket');
    unchanged(await persistence(f.db),before);
    const retryId=`${kind}_fresh_intent_retry`,retryRequest=await intentRequest(f,command,retryId);
    assert.notEqual(retryRequest.command.intent,request.command.intent);
    const retried=await commit(f,retryRequest);assert.equal(retried.ok,true,retried.reason);
    const accepted=await f.owner.raw();
    assert.equal(accepted.sequence,logicalBefore.sequence+1);assert.equal(accepted.records.length,logicalBefore.records.length+1);
    assert.equal(accepted.state.proposals[preview.proposal.id].appliedOperationId,retryId);
    assert.equal(accepted.records.filter(r=>r.transaction.operationId===retryId).length,1);
    assert.equal(accepted.records.some(r=>r.transaction.operationId===failedId),false);
    const acceptedPersistence=await persistence(f.db);
    assert.deepEqual(acceptedPersistence.native_states,before.native_states);assert.deepEqual(acceptedPersistence.native_operations,before.native_operations);
    assert.deepEqual(row(acceptedPersistence,'b23_checkpoints',rootKey),beforeRoot);
    assert.equal(f.factory.databasesMap.size,1);
    if(kind==='split'){
      const destination=preview.preview.destinations[0].to;
      assert.ok(accepted.state.placements[placementId(destination,'c_beta')]);assert.equal(accepted.state.placements[placementId(f.a,'c_beta')],undefined);
      assert.equal(Object.values(accepted.state.series)[0].topicId,destination);
    }else{
      assert.equal(accepted.state.topics[f.b].lifecycle,'redirected');assert.equal(accepted.state.redirects[f.b].toTopicId,f.a);
      assert.ok(accepted.state.placements[placementId(f.a,'c_beta')]);assert.equal(Object.values(accepted.state.series)[0].topicId,f.a);
    }
    assert.equal(accepted.state.titles.c_beta.title,'保留的人工标题');
  }finally{f.close();}
}

test('A16 split journal failure after root put rolls back root/checkpoint/journal; fresh intent retries',()=>structuralFailure('split'));
test('A16 merge journal failure after root put rolls back root/checkpoint/journal; fresh intent retries',()=>structuralFailure('merge'));

test('G04 one committed merge -> changed member -> zero-write inverse conflict -> separately replanned compensation',async()=>{
  const f=await fixture('merge');
  try{
    const preview=f.controller.previewMerge({keepId:f.a,sourceIds:[f.b]}),merged=await f.controller.applyStructure(preview);
    assert.equal(f.controller.getState().redirects[f.b].toTopicId,f.a);
    // Change an actual row from this merge's write set, then create a new member.
    await f.controller.dispatch({type:'MOVE_PRIMARY',refId:'c_alpha',from:f.a,to:f.c});
    await f.controller.dispatch({type:'SET_PLACEMENT',refId:'c_gamma',topicId:f.a,role:'primary'});
    const beforeUndo=await persistence(f.db),beforeState=f.controller.getState(),conflict=await f.controller.previewUndo(merged.operationId);
    assert.equal(conflict.state,'conflict');
    assert.ok(conflict.conflicts.some(x=>x.kind==='placement'&&x.key===placementId(f.a,'c_alpha')));
    assert.ok(conflict.conflicts.some(x=>x.kind==='topic-membership-set'));
    await assert.rejects(f.controller.undo(merged.operationId,conflict.inverseHash),/undo-conflict/);
    unchanged(await persistence(f.db),beforeUndo);assert.deepEqual(f.controller.getState(),beforeState);

    // Restoring every old row would duplicate c_alpha's new primary (and bypass
    // its new hard exclusion). That is an invalid new plan, not partial success.
    const everyKey=merged.inverse.map(({kind,key})=>({kind,key}));
    assert.throws(()=>f.controller.previewCompensation(merged.operationId,{restoreKeys:everyKey}),/multiple-primary|include-exclude-conflict/);
    unchanged(await persistence(f.db),beforeUndo);

    // Explicitly restore only B and its old member. A's changed/new members
    // remain outside this compensation. Its Series follows B in the same commit.
    const seriesId=Object.values(f.controller.getState().series)[0].id;
    const restoreKeys=[{kind:'topic',key:f.b},{kind:'redirect',key:f.b},{kind:'placement',key:placementId(f.a,'c_beta')},
      {kind:'placement',key:placementId(f.b,'c_beta')},{kind:'series',key:seriesId}];
    const stale=f.controller.previewCompensation(merged.operationId,{restoreKeys});
    await f.controller.dispatch({type:'SET_PLACEMENT',refId:'c_delta',topicId:f.a,role:'primary'});
    const beforeStale=await persistence(f.db),latest=f.controller.getState();
    await assert.rejects(f.controller.dispatch({type:'APPLY_COMPENSATION_PLAN',plan:stale},{expected:stale.expected}),/overlay-revision-conflict|stale-read-set|stale-compensation/);
    unchanged(await persistence(f.db),beforeStale);

    const fresh=f.controller.previewCompensation(merged.operationId,{restoreKeys});
    assert.notEqual(fresh.planHash,stale.planHash);assert.deepEqual(fresh.expected,f.controller.getSnapshot().versions);
    const previous=await f.owner.raw(),compensated=await f.controller.dispatch({type:'APPLY_COMPENSATION_PLAN',plan:fresh},{expected:fresh.expected});
    assert.notEqual(compensated.operationId,merged.operationId);
    const final=f.controller.getState(),finalRaw=await f.owner.raw(),operations=f.controller.getOperations();
    assert.equal(finalRaw.sequence,previous.sequence+1);assert.equal(finalRaw.records.length,previous.records.length+1);
    assert.equal(final.revision,latest.revision+1);
    for(const refId of ['c_gamma','c_delta'])assert.deepEqual(final.placements[placementId(f.a,refId)],latest.placements[placementId(f.a,refId)]);
    assert.deepEqual(final.placements[placementId(f.c,'c_alpha')],latest.placements[placementId(f.c,'c_alpha')]);
    assert.deepEqual(final.constraints,latest.constraints);
    assert.equal(final.placements[placementId(f.a,'c_alpha')],undefined);
    assert.equal(final.placements[placementId(f.a,'c_beta')],undefined);assert.equal(final.placements[placementId(f.b,'c_beta')].role,'primary');
    assert.equal(final.topics[f.b].lifecycle,'active');assert.equal(final.redirects[f.b],undefined);assert.equal(final.series[seriesId].topicId,f.b);
    assert.equal(operations.find(op=>op.operationId===merged.operationId).status,'applied');
    assert.equal(final.proposals[preview.proposal.id].state,'applied');
    assert.equal(operations.find(op=>op.operationId===compensated.operationId).status,'applied');
    assert.deepEqual(compensated.patch.map(({kind,key})=>`${kind}:${key}`).sort(),restoreKeys.map(({kind,key})=>`${kind}:${key}`).sort());
    const finalPersistence=await persistence(f.db);
    assert.deepEqual(finalPersistence.native_states,beforeUndo.native_states);assert.deepEqual(finalPersistence.native_operations,beforeUndo.native_operations);
    assert.equal(f.factory.databasesMap.size,1);
  }finally{f.close();}
});
