import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {planTransaction,topicIdForOperation} from '../../src/pro/domain/index.mjs';
import {checkActivityVersionFence} from '../../src/data/activity-version-fence.mjs';
import {createSameDatabaseStore,proRootKey,proOperationKey} from '../../src/pro/integration/same-db-store.mjs';

// Internal owner/reducer boundary tests, not an alternate UI commit authority.
// Uses the real owner grant and native version fence with the actual same-IDB
// adapter. MockIDB snapshots on get/put exactly where these assertions rely on it.
const TABLES=['b23_states','b23_checkpoints','b23_operations','native_states','native_operations'];
async function persisted(db){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(TABLES,'readonly'),rows=Object.fromEntries(TABLES.map(name=>[name,[]]));
    for(const name of TABLES){const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{if(q.result){rows[name].push(q.result.value);q.result.continue();}};}
    tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error??Error('fixture-read-aborted'));
  });
}
const assertUnchanged=(actual,expected)=>{for(const name of TABLES)assert.deepEqual(actual[name],expected[name],`${name} must not change`);};
const row=(data,table,key)=>data[table].find(value=>value.key===key);
async function run(f,command,operationId,transform=value=>value){
  const current=await f.owner.readPrivate(),expected=current.snapshot.versions;
  const context={actor:'human',operationId,snapshot:current.snapshot,expected,mode:'pro-default-none'};
  const request={operationId,expected,fingerprint:{command,expected},execute(input,logs){
    const plan=planTransaction(input,command,context),transaction={operationId,actor:'human',provenance:'explicit-user-command',base:expected,
      planHash:plan.planHash,resultRevision:plan.state.revision,proposalId:null,inverse:plan.inverse,patch:plan.patch,
      inverseHash:plan.inverseHash,readSet:plan.readSet,status:'applied'};
    return transform({state:plan.state,transaction},input,logs);
  }};
  return {request,result:await (f.store??f.owner.store).transact(f.owner.grant(),request)};
}
async function fixture(name){
  const factory=new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,databaseName:`store_boundary_${name}`,fixtureOnly:true});
  const f={factory,owner,db:await owner.base.open(),topicId:topicIdForOperation('seed_topic')};
  const seeded=await run(f,{type:'CREATE_TOPIC',name:'已持久化的原主题'},'seed_topic');assert.equal(seeded.result.ok,true,seeded.result.reason);
  return f;
}

test('same-IDB read and replay results are detached from persistent root, checkpoint and journal',async()=>{
  const f=await fixture('read');
  try{
    const committed=await run(f,{type:'SET_TOPIC_NAME',topicId:f.topicId,name:'已提交的新名称'},'rename_topic');
    assert.equal(committed.result.ok,true);
    const before=await persisted(f.db),first=await f.owner.store.read(f.owner.grant()),second=await f.owner.store.read(f.owner.grant());
    assert.notEqual(first.state,second.state);assert.notEqual(first.state.topics[f.topicId],second.state.topics[f.topicId]);
    first.state.topics[f.topicId].name='调用方篡改';first.state.topics[f.topicId].aliases.push('调用方插入');
    first.state.topics[f.topicId].nameControl.locked=false;first.records[0].transaction.patch[0].after.name='修改旧日志';first.records.pop();
    assert.deepEqual(await f.owner.store.read(f.owner.grant()),second);assertUnchanged(await persisted(f.db),before);

    committed.result.value.patch[0].after.name='修改初次返回值';committed.result.value.base.authorizationEpoch=0;
    const replay=await f.owner.store.transact(f.owner.grant(),committed.request);
    assert.equal(replay.ok,true);assert.equal(replay.replayed,true);assert.equal(replay.value.patch[0].after.name,'已提交的新名称');
    replay.value.patch[0].after.name='修改重放返回值';replay.value.inverse[0].restoreValue.name='修改inverse';
    assertUnchanged(await persisted(f.db),before);assert.deepEqual(await f.owner.store.read(f.owner.grant()),second);
    assert.equal(f.factory.databasesMap.size,1);
  }finally{f.owner.stop();}
});

test('execute input/log mutations preserve checkpoint; retained output mutations after put and commit cannot change DB',async()=>{
  const f=await fixture('execute');
  try{
    const before=await persisted(f.db),rootKey=proRootKey(f.owner.scope.key),originalRoot=row(before,'b23_states',rootKey);
    let retained,expectedResult,microtaskRan=false;
    const committed=await run(f,{type:'SET_TOPIC_NAME',topicId:f.topicId,name:'真正提交的名称'},'output_isolation',(value,input,logs)=>{
      retained=value;expectedResult=structuredClone(value);
      // These objects are supplied to the reducer, never its checkpoint root.
      input.topics[f.topicId].name='修改execute输入';logs[0].transaction.status='undone';logs[0].transaction.patch[0].after.name='修改execute日志输入';
      queueMicrotask(()=>{
        microtaskRan=true;retained.state.topics[f.topicId].name='put之后的微任务修改';
        retained.transaction.patch[0].after.name='微任务修改日志';retained.transaction.inverse[0].restoreValue.name='微任务修改inverse';
      });
      return value;
    });
    assert.equal(committed.result.ok,true,committed.result.reason);assert.equal(microtaskRan,true);
    const actual=await f.owner.store.read(f.owner.grant()),after=await persisted(f.db);
    assert.deepEqual(actual.state,expectedResult.state);assert.deepEqual(committed.result.value,expectedResult.transaction);
    assert.deepEqual(actual.records.at(-1).transaction,expectedResult.transaction);
    assert.deepEqual(row(after,'b23_checkpoints',rootKey),originalRoot);
    assert.deepEqual(row(after,'b23_operations',proOperationKey(f.owner.scope.key,'seed_topic')),row(before,'b23_operations',proOperationKey(f.owner.scope.key,'seed_topic')));
    retained.state.topics[f.topicId].aliases.push('提交完成后修改');retained.transaction.status='undone';
    committed.result.value.patch[0].after.name='提交完成后修改响应';
    assertUnchanged(await persisted(f.db),after);assert.deepEqual(await f.owner.store.read(f.owner.grant()),actual);
    assert.deepEqual(after.native_states,before.native_states);assert.deepEqual(after.native_operations,before.native_operations);
  }finally{f.owner.stop();}
});

test('a synchronous verifier cannot mutate captured reducer output or inject an undo after validation',async()=>{
  const f=await fixture('verifier');
  try{
    let retained,expectedResult,touched=false;
    const before=await persisted(f.db),rootKey=proRootKey(f.owner.scope.key);
    f.store=createSameDatabaseStore({enabled:true,connection:()=>f.db,
      verifyGrant(grant){
        if(grant!==f.owner.grant())throw Error('invalid-fixture-grant');
        if(retained&&!touched){
          touched=true;retained.state.topics[f.topicId].name='guard副作用';retained.state.revision=999;
          retained.transaction.operationId='changed_in_verifier';retained.transaction.patch[0].after.name='guard修改日志';
          retained.undoneOperationId='seed_topic';
        }
        return f.owner.capabilities.scope;
      },
      verifyInputFence(tx,_scope,expected,check,ready,fail){checkActivityVersionFence(tx,f.owner.scope,
        {nativeRevision:expected.nativeFields.nativeRoot,evidenceRevision:expected.nativeFields.evidenceRoot},check,ready,fail);}
    });
    const committed=await run(f,{type:'SET_TOPIC_NAME',topicId:f.topicId,name:'校验后应提交的原值'},'guard_isolation',value=>{
      retained=value;expectedResult=structuredClone(value);return value;
    });
    assert.equal(touched,true);assert.equal(committed.result.ok,true,committed.result.reason);
    const actual=await f.owner.store.read(f.owner.grant()),after=await persisted(f.db);
    assert.deepEqual(actual.state,expectedResult.state);assert.deepEqual(actual.records.at(-1).transaction,expectedResult.transaction);
    assert.deepEqual(committed.result.value,expectedResult.transaction,'the response must describe the exact committed journal transaction');
    assert.deepEqual(row(after,'b23_checkpoints',rootKey),row(before,'b23_states',rootKey));
    assert.deepEqual(row(after,'b23_operations',proOperationKey(f.owner.scope.key,'seed_topic')),row(before,'b23_operations',proOperationKey(f.owner.scope.key,'seed_topic')));
    assert.equal(actual.records[0].transaction.status,'applied','a verifier cannot add an undo target after the reducer returned');
  }finally{f.owner.stop();}
});

test('malformed reducer state, cross-scope state and mismatched operation all reject with zero writes',async()=>{
  const f=await fixture('invalid');
  try{
    let getterCalls=0;
    const cases=[
      ['extra-field',value=>{value.state.grant={approved:true};return value;},/invalid-schema/],
      ['bad-revision',value=>{value.state.revision=-1;return value;},/invalid-revision/],
      ['cross-scope',value=>{value.state.scopeKey='other-scope';return value;},/invalid-pro-plan|pro-cross-scope-state|topic-identity/],
      ['getter',value=>{Object.defineProperty(value.state.topics[f.topicId],'name',{enumerable:true,get(){getterCalls++;return '不可调用的getter';}});return value;},/unsafe-property/],
      ['wrong-operation',value=>{value.transaction.operationId='other-operation';return value;},/invalid-pro-plan/],
      ['missing-state',value=>{delete value.state;return value;},/state|scopeKey|invalid/],
    ];
    const before=await persisted(f.db),logicalBefore=await f.owner.store.read(f.owner.grant());
    for(const [name,mutate,reason] of cases){
      const operationId='invalid_'+name.replaceAll('-','_');
      const rejected=await run(f,{type:'SET_TOPIC_NAME',topicId:f.topicId,name:'不可提交的状态'},operationId,mutate);
      assert.equal(rejected.result.ok,false,name);assert.match(rejected.result.reason,reason,name);
      assertUnchanged(await persisted(f.db),before);assert.deepEqual(await f.owner.store.read(f.owner.grant()),logicalBefore);
    }
    assert.equal(getterCalls,0,'output shape validation must reject accessors without evaluating them');
  }finally{f.owner.stop();}
});

test('async and thenable reducers are refused before any root/checkpoint/journal write',async()=>{
  const f=await fixture('async');
  try{
    const before=await persisted(f.db),logicalBefore=await f.owner.store.read(f.owner.grant());let resolved,thenInvoked=false;
    const asynchronous=await run(f,{type:'SET_TOPIC_NAME',topicId:f.topicId,name:'异步不得提交'},'async_reducer',value=>{
      resolved=Promise.resolve().then(()=>value);return resolved;
    });
    await resolved;assert.equal(asynchronous.result.ok,false);assert.equal(asynchronous.result.reason,'async-pro-reducer-denied');
    assertUnchanged(await persisted(f.db),before);
    const thenable=await run(f,{type:'SET_TOPIC_NAME',topicId:f.topicId,name:'thenable不得提交'},'thenable_reducer',value=>({...value,then(){thenInvoked=true;}}));
    assert.equal(thenable.result.ok,false);assert.equal(thenable.result.reason,'async-pro-reducer-denied');assert.equal(thenInvoked,false);
    assertUnchanged(await persisted(f.db),before);assert.deepEqual(await f.owner.store.read(f.owner.grant()),logicalBefore);
  }finally{f.owner.stop();}
});
