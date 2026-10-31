import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {digest} from '../../src/data/hash.mjs';

async function setup(options={}) {const factory=options.indexedDB??new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,fixtureOnly:true,...options});return {factory,owner,controller:await createProController(owner)};}
async function request(owner,command,id) {const expected=(await owner.readPrivate()).snapshot.versions;return {operationId:id,expected,command:{actor:'human',intent:owner.humanIntent(command,expected),command}};}
const freshTopic=()=>({type:'CREATE_TOPIC',name:'人工测试主题'});

test('forged grants and serialized human receipts do not convey commit authority',async()=>{
 const {owner,controller}=await setup();try{
  const r=await request(owner,freshTopic(),'forgery');
  assert.equal((await owner.ports.commit.commit(structuredClone(owner.grant()),r)).ok,false);
  r.command.intent=structuredClone(r.command.intent);
  assert.equal((await owner.ports.commit.commit(owner.grant(),r)).ok,false);
  assert.equal((await owner.raw()).sequence,0);
 }finally{controller.destroy();}
});

test('a receipt binds command and expected read set; exact operation replay is idempotent',async()=>{
 const {owner,controller}=await setup();try{
  const r=await request(owner,freshTopic(),'one_action');
  const forged={...r,command:{...r.command,command:{type:'CREATE_TOPIC',name:'偷偷替换'}}};
  assert.match((await owner.ports.commit.commit(owner.grant(),forged)).reason,/intent/);
  const first=await owner.ports.commit.commit(owner.grant(),r),second=await owner.ports.commit.commit(owner.grant(),r);
  assert(first.ok&&second.ok&&second.replayed);assert.deepEqual(second.value,first.value);
  assert.equal((await owner.raw()).sequence,1);
  const changed=await request(owner,{type:'CREATE_TOPIC',name:'另一主题'},'one_action');
  assert.equal((await owner.ports.commit.commit(owner.grant(),changed)).reason,'operation-replay-conflict');
 }finally{controller.destroy();}
});

test('two writers and one receipt cannot turn one user decision into two transactions',async()=>{
 const {owner,controller}=await setup();try{
  const r=await request(owner,freshTopic(),'parallel_a');
  const result=await Promise.all([owner.ports.commit.commit(owner.grant(),r),owner.ports.commit.commit(owner.grant(),{...r,operationId:'parallel_b'})]);
  assert.equal(result.filter(x=>x.ok).length,1);assert.equal((await owner.raw()).sequence,1);
 }finally{controller.destroy();}
});

test('two connections to the same shared DB serialize overlay CAS without lost updates',async()=>{
 const factory=new MockIDBFactory(),a=await setup({indexedDB:factory,databaseName:'two_owners'}),b=await setup({indexedDB:factory,databaseName:'two_owners'});
 try{
  const ar=await request(a.owner,{type:'CREATE_TOPIC',name:'来自 A'},'writer_a'),br=await request(b.owner,{type:'CREATE_TOPIC',name:'来自 B'},'writer_b');
  const result=await Promise.all([a.owner.ports.commit.commit(a.owner.grant(),ar),b.owner.ports.commit.commit(b.owner.grant(),br)]);
  assert.equal(result.filter(x=>x.ok).length,1);assert.equal((await a.owner.raw()).sequence,1);assert.equal(factory.databasesMap.size,1);
 }finally{a.controller.destroy();b.controller.destroy();}
});

test('shared native root fence is checked inside the Pro write transaction',async()=>{
 const factory=new MockIDBFactory(),a=await setup({indexedDB:factory,databaseName:'native_fence'}),b=await setup({indexedDB:factory,databaseName:'native_fence'});
 try{
  const stale=await request(a.owner,freshTopic(),'stale_native');
  await b.owner.updateNative('c_beta',{membership:'PROJECT',projectId:'p_alpha'});
  const result=await a.owner.ports.commit.commit(a.owner.grant(),stale);
  assert.equal(result.ok,false);assert.match(result.reason,/revision|stale|changed/);assert.equal((await a.owner.raw()).sequence,0);
 }finally{a.controller.destroy();b.controller.destroy();}
});

test('quota failure aborts checkpoint, state and journal as one unit',async()=>{
 const {factory,owner,controller}=await setup();try{
  await controller.dispatch(freshTopic());const before=await owner.raw();
  factory.failNextPut=true;
  await assert.rejects(controller.dispatch({type:'CREATE_TOPIC',name:'配额失败'}),/Quota/);
  assert.deepEqual(await owner.raw(),before);
 }finally{controller.destroy();}
});

test('revocation immediately clears cached private views and rejects previously issued actions',async()=>{
 const {owner,controller}=await setup();try{
  await controller.dispatch(freshTopic());const r=await request(owner,{type:'CREATE_TOPIC',name:'迟到操作'},'late_action'),grant=owner.grant();
  const before=await owner.raw();owner.revoke();
  assert.equal(controller.getSnapshot().authorized,false);assert.equal(controller.getSnapshot().references.length,0);assert.equal(Object.keys(controller.getState().topics).length,0);assert.equal(controller.getView(),null);
  assert.equal((await owner.ports.commit.commit(grant,r)).ok,false);
  await owner.confirm();assert.deepEqual(await owner.raw(),before);
 }finally{controller.destroy();}
});

test('Browser-Local is memory preview only: no persistence, mutation, durable work or paid budget',async()=>{
 const {factory,owner,controller}=await setup({memoryOnly:true});try{
  assert.equal(factory.databasesMap.size,0);assert.equal(owner.status().persistence,'memory');
  await assert.rejects(controller.dispatch(freshTopic()),/session-preview-only/);
  assert.equal((await owner.ports.background.enqueue(owner.grant(),{id:'job',state:'queued'})).reason,'session-durable-job-denied');
  assert.equal((await owner.ports.background.reserveBudget(owner.grant(),{})).reason,'cloud-budget-zero');
 }finally{controller.destroy();}
});

test('UNKNOWN cannot be promoted by a human placement or included in AI evidence',async()=>{
 const {owner,controller}=await setup();try{
  await controller.dispatch(freshTopic());const id=Object.keys(controller.getState().topics)[0],before=digest(controller.getState());
  await assert.rejects(controller.dispatch({type:'SET_PLACEMENT',refId:'c_unknown',topicId:id,role:'primary'}));assert.equal(digest(controller.getState()),before);
  const result=await controller.suggest({refIds:['c_unknown']});assert.equal(result.proposals.length,0);
 }finally{controller.destroy();}
});

test('NONE to Project preserves assets, suspends default Pro projection and retains native Project reachability',async()=>{
 const {owner,controller}=await setup();try{
  await controller.dispatch(freshTopic());const id=Object.keys(controller.getState().topics)[0];
  await controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId:id,role:'primary'});
  await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_alpha',title:'只有 Pro 使用'});const before=digest(controller.getState());
  await owner.updateNative('c_alpha',{membership:'PROJECT',projectId:'p_alpha'});await controller.refresh();
  assert.equal(digest(controller.getState()),before);assert.equal(JSON.stringify(controller.getView().overlay).includes('只有 Pro 使用'),false);
  await controller.setMode('native');const view=controller.getView();assert.equal(view.overlay,undefined);assert.equal(JSON.stringify(view.native).includes('只有 Pro 使用'),false);assert(JSON.stringify(view.native).includes('c_alpha'));
  await controller.setMode('pro-cross-project',{selectedProjectIds:['p_alpha']});assert(JSON.stringify(controller.getView()).includes('只有 Pro 使用'));
 }finally{controller.destroy();}
});

test('entitlement loss preserves export and undo while new edits stop; native switch retains data',async()=>{
 const {owner,controller}=await setup();try{
  const op=await controller.dispatch(freshTopic()),before=digest(controller.getState());owner.setEntitlement('free');
  await assert.rejects(controller.dispatch({type:'CREATE_TOPIC',name:'不准新建'}),/entitlement/);assert(controller.exportBackup().checksum);
  await controller.setMode('native');assert.equal(digest(controller.getState()),before);
  const preview=await controller.previewUndo(op.operationId);await controller.undo(op.operationId,preview.inverseHash);assert.equal(Object.keys(controller.getState().topics).length,0);
 }finally{controller.destroy();}
});

test('restart invalidates original authority, does not replay consent and does not auto run suggestions',async()=>{
 const {owner,controller}=await setup();try{
  await controller.dispatch(freshTopic());const before=await owner.raw(),grant=owner.grant(),r=await request(owner,{type:'CREATE_TOPIC',name:'旧进程'},'old_process');
  await controller.restart();assert.equal(owner.status().processingMode,'off');assert.equal((await owner.ports.commit.commit(grant,r)).ok,false);assert.deepEqual(await owner.raw(),before);
  await assert.rejects(controller.suggest(),/consent/);assert.deepEqual(await owner.raw(),before);
 }finally{controller.destroy();}
});
