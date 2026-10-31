/** UNIT authority/IDB doubles, real Free read pipeline and production Pro owner.
 * These are not live ChatGPT, browser durability or real account evidence.
 * No fixture Pro owner or serialized grant is composed into the tested owner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createFreeReadService} from '../../src/runtime/free-read-service.mjs';
import {createFreeViewOwner} from '../../src/runtime/free-view-owner.mjs';
import {createProductionProService} from '../../src/pro/integration/production-owner.mjs';
import {createSameDatabaseStore} from '../../src/pro/integration/same-db-store.mjs';

const NOW=Date.parse('2026-10-31T12:00:00.000Z');
const REF='11111111-1111-4111-8111-111111111111',UNKNOWN='22222222-2222-4222-8222-222222222222';
const unavailable={ok:false,reason:'pro-request-unavailable'};
const drain=async()=>{for(let i=0;i<150;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(t,extra={}){
  const indexedDB=new MockIDBFactory(),scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'unit_A',organizationId:'personal'});
  const base=new ScopeRepository({indexedDB,databaseName:'production_owner_'+crypto.randomUUID()});
  let wall=NOW,current=true,gateAt=Infinity,opens=0;const blocked=deferred();
  const native=new NativeRepository({baseRepository:base,clock:()=>new Date(wall).toISOString(),observationGate:()=>({channel:'synthetic',sourceId:'unit_native',generation:'one'})});
  const seed=await native.apply(scope,{operationId:'unit_seed',expectedRevision:0,batch:{scopeKey:scope.key,sourceRevision:1,observedAt:new Date(wall).toISOString(),validUntil:new Date(wall+60000).toISOString(),projects:[],refs:[REF,UNKNOWN].map((id,i)=>({id,nativeTitle:i?'Unknown membership':'Positive none',nativeUrl:'https://chatgpt.com/c/'+id,availability:'available'})),membership:[{id:REF,state:'NONE',projectId:null},{id:UNKNOWN,state:'UNKNOWN',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}});
  assert.equal(seed.ok,true,seed.reason);
  const workspaces=new WorkspaceRepository({baseRepository:base,clock:()=>new Date(wall).toISOString()}),evidence=new FreeEvidenceRepository({baseRepository:base});
  const readService=createFreeReadService({repository:base,workspaces,native,evidence,clock:()=>new Date(wall).toISOString()});
  const viewOwner=createFreeViewOwner({readService,scope,guard:()=>current,clock:()=>new Date(wall).toISOString()});
  await viewOwner.refresh();
  const c={scope,scopeGrantId:'scope_A',role:'workspace',binding:'binding_A',parentFrame:{tabId:1,documentId:'parent_A',actualURL:'https://chatgpt.com/'},isCurrent:()=>current};
  const notifications=[];
  const ui={withScope:async(args,work)=>{if(args.grantId!=='grant_A'||args.mountId!=='mount_A'||args.sender.documentId!=='ui_A'||args.sender.tab.id!==1||!current)throw Error('unit-authority-denied');return work(c);},notifyScope:key=>{notifications.push(key);}};
  const repository={open:async()=>{if(++opens===gateAt)await blocked.promise;return base.open();}};
  const service=createProductionProService({ui,repository,workspaceRepository:workspaces,readService,views:{resolveProView(){const currentView=viewOwner.current();return {current:currentView,isCurrent:()=>viewOwner.current()===currentView};}},now:()=>wall,...extra});
  const sender={id:'extension_unit',documentId:'ui_A',frameId:2,tab:{id:1},url:'chrome-extension://extension_unit/workspace.html'};
  const request=(action,payload,extra={})=>service.handle({v:1,type:'HOST_UI_PRO',grantId:'grant_A',mountId:'mount_A',action,payload,...extra},sender);
  const page=()=>request('view',{op:'page',mode:'pro-default-none',selectedProjectIds:[],segment:0,offset:0,limit:8,rowLimit:5});
  const mode=value=>request('background',{op:'mode',mode:value,selectedProjectIds:[]});
  const readStore=createSameDatabaseStore({connection:()=>base.open(),enabled:true,verifyGrant:()=>({kind:'verified-scope',key:scope.key,serverIdentity:'established',persistence:'same-idb'}),verifyInputFence(){throw Error('read-only-test-helper');}});
  t.after(()=>{service.stop();viewOwner.stop();base.close();});
  return {service,base,native,workspaces,readService,viewOwner,scope,c,indexedDB,notifications,request,page,mode,raw:()=>readStore.read({}),
    async ready(){assert.equal((await mode('pro-default-none')).ok,true);const result=await page();assert.equal(result.ok,true,JSON.stringify(result));return result.value.versions;},
    wall:value=>wall=value,revoke(){current=false;},gateNextCommit(){gateAt=opens+2;return {release:()=>blocked.resolve(),wait:async()=>{await drain();assert.equal(opens,gateAt);}};}};
}

test('production composition uses current Free admitted NONE, bounded public DTO and disables providers',async t=>{
  const f=await fixture(t),expected=await f.ready(),page=await f.page();
  assert.equal(page.value.display.scopeKey,f.scope.key);
  assert.equal(page.value.status.cloudBudget,0);
  assert.equal(page.value.status.modelAvailability,'unavailable');
  assert.equal(page.value.status.processingMode,'off');
  assert.equal(page.value.status.positiveNone,'available');
  const encoded=JSON.stringify(page);assert(encoded.length<65536);assert(!encoded.includes('scope_A'));assert(!encoded.includes('nativeRoot'));assert(!encoded.includes('free_membership_'));
  assert.deepEqual(Object.keys(expected).sort(),['authorizationEpoch','overlayRevision','reviewId','scopeKey']);
  assert.equal((await f.request('evidence',{op:'suggest',expected})).ok,false);
  assert.equal((await f.request('background',{op:'processing',mode:'local'})).ok,true);
  const suggestion=await f.request('evidence',{op:'suggest',expected:(await f.page()).value.versions});
  assert.equal(suggestion.ok,true);assert.equal(suggestion.value.state,'unavailable');
  assert.equal((await f.raw()).state.revision,0);
});

test('invalid UI grant and caller-provided authority never create Pro assets',async t=>{
  const f=await fixture(t),expected=await f.ready();
  assert.deepEqual(await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'forged'},expected,operationId:'forged'},{grantId:'invented'}),unavailable);
  assert.deepEqual(await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'forged',grant:{scopeKey:f.scope.key}},expected,operationId:'forged'}),unavailable);
  assert.equal((await f.raw()).state.revision,0);
});

test('same operation replay returns original receipt, changed payload conflicts and never duplicates',async t=>{
  const f=await fixture(t),expected=await f.ready(),p={op:'dispatch',command:{type:'CREATE_TOPIC',name:'Manual'},expected,operationId:'topic_once'};
  const first=await f.request('commit',p);assert.equal(first.ok,true);assert.equal(first.value.replayed,false);
  const second=await f.request('commit',p);assert.equal(second.ok,true);assert.equal(second.value.replayed,true);
  assert.deepEqual(await f.request('commit',{...p,command:{type:'CREATE_TOPIC',name:'Changed'}}),unavailable);
  const data=await f.raw();assert.equal(data.state.revision,1);assert.equal(data.records.length,1);assert.equal(Object.values(data.state.topics)[0].name,'Manual');
  assert(f.notifications.filter(key=>key===f.scope.key).length>=2);
});

test('old review cannot authorize a second operation or a changed public revision',async t=>{
  const f=await fixture(t),expected=await f.ready();
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'First'},expected,operationId:'first'})).ok,true);
  assert.deepEqual(await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Stale'},expected,operationId:'second'}),unavailable);
  const next=(await f.page()).value.versions;next.overlayRevision=0;
  assert.deepEqual(await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Tampered'},expected:next,operationId:'third'}),unavailable);
  assert.equal((await f.raw()).state.revision,1);
});

test('concurrent CAS writers produce one complete operation',async t=>{
  const f=await fixture(t),expected=await f.ready();
  const results=await Promise.all(['one','two'].map(name=>f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name},expected,operationId:name})));
  assert.equal(results.filter(r=>r.ok).length,1);const data=await f.raw();assert.equal(data.state.revision,1);assert.equal(data.records.length,1);assert.equal(Object.keys(data.state.topics).length,1);
});

test('cached positive membership expiring before owner construction cannot authorize writes',async t=>{
  const f=await fixture(t),expected=await f.ready();f.wall(NOW+60001);
  assert.deepEqual(await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Too late'},expected,operationId:'expired'}),unavailable);
  assert.equal((await f.raw()).state.revision,0);
  await f.viewOwner.refresh();
  const page=await f.page();assert.equal(page.ok,true);assert.equal(page.value.status.positiveNone,'unavailable','fresh Free evaluation keeps expired membership UNKNOWN');
});

test('switching to Free while a commit awaits DB aborts the in-flight policy generation',async t=>{
  const f=await fixture(t),expected=await f.ready(),gate=f.gateNextCommit();
  const pending=f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Racing native switch'},expected,operationId:'mode_race'});
  await gate.wait();assert.equal((await f.mode('native')).ok,true);gate.release();
  assert.deepEqual(await pending,unavailable);assert.equal((await f.raw()).state.revision,0);
});

test('revoking scope while a commit awaits DB leaves no operation, root or partial asset',async t=>{
  const f=await fixture(t),expected=await f.ready(),gate=f.gateNextCommit();
  const pending=f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Revoked'},expected,operationId:'revoke_race'});
  await gate.wait();f.revoke();f.service.revokeTab(1);gate.release();assert.deepEqual(await pending,unavailable);await drain();
  const raw=await f.raw();assert.equal(raw.state.revision,0);assert.equal(raw.records.length,0);
});

test('quota failure does not retain partial topic and explicit retry is one durable operation',async t=>{
  const f=await fixture(t),expected=await f.ready(),p={op:'dispatch',command:{type:'CREATE_TOPIC',name:'Atomic'},expected,operationId:'quota_retry'};
  f.indexedDB.failNextPut=true;assert.deepEqual(await f.request('commit',p),unavailable);assert.equal((await f.raw()).state.revision,0);
  assert.equal((await f.request('commit',p)).ok,true);assert.equal((await f.raw()).records.length,1);
});

test('backup cannot derive authorization from a scope object or persisted bytes',async t=>{
  const f=await fixture(t);await f.ready();
  await assert.rejects(f.service.backupRepository.exportBackup(f.scope,{guard:()=>true,signal:new AbortController().signal}),/pro-backup-current-owner-required/);
  assert.equal((await f.raw()).state.revision,0);
});

test('same operation reconciliation survives a new live UI epoch without replaying work',async t=>{
  const f=await fixture(t),expected=await f.ready(),p={op:'dispatch',command:{type:'CREATE_TOPIC',name:'Survives'},expected,operationId:'survives'};
  assert.equal((await f.request('commit',p)).ok,true);f.c.scopeGrantId='scope_A_new';
  const replay=await f.request('commit',p);assert.equal(replay.ok,true);assert.equal(replay.value.replayed,true);
  assert.equal((await f.raw()).records.length,1);
});

test('UNKNOWN cannot be placed by production manual commands while positive NONE can',async t=>{
  const f=await fixture(t),expected=await f.ready();
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Verified input'},expected,operationId:'topic'})).ok,true);
  const topicId=Object.keys((await f.raw()).state.topics)[0],review=(await f.page()).value.versions;
  assert.deepEqual(await f.request('commit',{op:'dispatch',command:{type:'SET_PLACEMENT',refId:UNKNOWN,topicId,role:'primary'},expected:review,operationId:'unknown'}),unavailable);
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'SET_PLACEMENT',refId:REF,topicId,role:'primary'},expected:review,operationId:'positive'})).ok,true);
  const raw=await f.raw();assert.equal(raw.state.revision,2);assert.equal(Object.values(raw.state.placements)[0].conversationId,REF);
});

test('reviewed Series receipt survives consumed preview and supports atomic inverse',async t=>{
  const f=await fixture(t),expected=await f.ready();
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Series topic'},expected,operationId:'series_topic'})).ok,true);
  const topicId=Object.keys((await f.raw()).state.topics)[0];
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'SET_PLACEMENT',refId:REF,topicId,role:'primary'},expected:(await f.page()).value.versions,operationId:'series_member'})).ok,true);
  const review=(await f.page()).value.versions;
  const preview=await f.request('commit',{op:'preview',kind:'series',input:{topicId,title:'Reading order',entries:[REF],edges:[],labels:[]},expected:review});
  assert.equal(preview.ok,true,JSON.stringify(preview));
  const apply={op:'apply-structure',previewId:preview.value.previewId,expected:review,operationId:'series_apply'};
  const first=await f.request('commit',apply);assert.equal(first.ok,true,JSON.stringify(first));
  assert.equal((await f.request('commit',apply)).value.replayed,true);
  assert.deepEqual(await f.request('commit',{...apply,operationId:'stolen_review'}),unavailable);
  const before=await f.raw();assert.equal(Object.keys(before.state.series).length,1);assert.equal(before.records.length,3);
  const undo=await f.request('commit',{op:'preview',kind:'undo',input:{operationId:'series_apply'},expected:(await f.page()).value.versions});assert.equal(undo.ok,true);
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'UNDO_TRANSACTION',targetOperationId:'series_apply',reviewedInverseHash:undo.value.inverseHash},expected:(await f.page()).value.versions,operationId:'series_undo'})).ok,true);
  const after=await f.raw();assert.equal(Object.keys(after.state.series).length,0);assert.equal(Object.keys(after.state.topics).length,1);assert.equal(Object.keys(after.state.placements).length,1);
});

test('unloaded native href yields explicit new-tab link without changing reading context',async t=>{
  let plan={mode:'href',target:{kind:'resolved',entity:'conversation',nativeId:REF,navigationURL:'https://chatgpt.com/c/'+REF,liveHandle:null},disposition:'new-tab-preserve-current',planRevision:1};
  const f=await fixture(t,{prepareNavigation:async()=>[{refId:REF,plan,targetKey:'target'}]});await f.ready();
  const open=await f.request('navigation',{op:'open',refId:REF,options:{}});assert.equal(open.ok,true,JSON.stringify(open));
  assert.equal(open.value.state,'native-link');assert.equal(open.value.nativeLink.url,'https://chatgpt.com/c/'+REF);
  assert.equal((await f.request('background',{op:'status'})).value.status.launchContext,null);
  plan={...plan,disposition:'same-tab'};assert.deepEqual(await f.request('navigation',{op:'open',refId:REF,options:{}}),unavailable);
  plan={...plan,disposition:'new-tab-preserve-current',target:{...plan.target,nativeId:UNKNOWN}};assert.deepEqual(await f.request('navigation',{op:'open',refId:REF,options:{}}),unavailable);
});

test('blocked native dispatch cannot leave a fabricated entered-chat context',async t=>{
  const plan={mode:'same-target',target:{kind:'resolved',entity:'conversation',nativeId:REF,navigationURL:'https://chatgpt.com/c/'+REF,liveHandle:null},bodyProofId:'proof_A',planRevision:1};
  const registrations=[],f=await fixture(t,{prepareNavigation:async()=>[{refId:REF,plan,targetKey:'target'}],currentNavigation:{register:args=>registrations.push(args),handle:async()=>({ok:true,state:'blocked'})}});await f.ready();
  const response=await f.request('navigation',{op:'open',refId:REF,options:{}});assert.equal(response.ok,true);assert.equal(response.value.state,'blocked');assert.equal(registrations.length,1);
  assert.equal((await f.request('background',{op:'status'})).value.status.launchContext,null);
});

test('explicit legacy upgrade is previewed, preserves shared IDs and reconciles durable receipt',async t=>{
  const f=await fixture(t);
  assert.equal((await f.workspaces.command(f.scope,{operationId:'legacy_create',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'legacy_topic',name:'Retained human work'}})).ok,true);
  await f.viewOwner.refresh();const expected=await f.ready();
  const preview=await f.request('commit',{op:'preview',kind:'legacy-upgrade',input:{},expected});
  assert.equal(preview.ok,true,JSON.stringify(preview));assert.equal(preview.value.kind,'pro-preview');assert.match(preview.value.summary,/1 个主题/);
  assert.equal((await f.raw()).state.revision,0,'preview must not create overlay assets');
  const p={op:'apply-structure',previewId:preview.value.previewId,expected,operationId:'legacy_upgrade'};
  const applied=await f.request('commit',p);assert.equal(applied.ok,true,JSON.stringify(applied));
  assert.equal((await f.raw()).state.topics.legacy_topic.name,'Retained human work');
  assert.equal((await f.workspaces.read(f.scope)).state.workspaces.legacy_topic.name,'Retained human work');
  await f.viewOwner.refresh();
  const replay=await f.request('commit',p);assert.equal(replay.ok,true,JSON.stringify(replay));assert.equal(replay.value.replayed,true);
  assert.equal((await f.raw()).records.length,1);
  const again=await f.request('commit',{op:'preview',kind:'legacy-upgrade',input:{},expected:(await f.page()).value.versions});
  assert.equal(again.ok,true);assert.equal(again.value.state,'unavailable');assert.match(again.value.message,/已有 Pro/);
});

test('empty legacy upgrade reports no assets and cannot turn preview into a write',async t=>{
  const f=await fixture(t),expected=await f.ready();
  const preview=await f.request('commit',{op:'preview',kind:'legacy-upgrade',input:{},expected});
  assert.equal(preview.ok,true);assert.equal(preview.value.state,'unavailable');assert.match(preview.value.message,/没有需要升级/);
  assert.equal((await f.raw()).state.revision,0);assert.equal((await f.workspaces.read(f.scope)).state.revision,0);
});

test('four-grid return uses live UI authority even when Free replaces its cached view',async t=>{
  const plan={mode:'same-target',target:{kind:'resolved',entity:'conversation',nativeId:REF,navigationURL:'https://chatgpt.com/c/'+REF,liveHandle:null},bodyProofId:'proof_A',planRevision:1};
  const shown=[],f=await fixture(t,{prepareNavigation:async()=>[{refId:REF,plan,targetKey:'target'}],currentNavigation:{register(){},handle:async()=>({ok:true,state:'already-current'})},presentSurface:async x=>{shown.push(x);return {ok:true};}});await f.ready();
  assert.equal((await f.request('navigation',{op:'open',refId:REF,options:{}})).ok,true);
  f.viewOwner.invalidate();
  const returned=await f.request('navigation',{op:'return'});assert.equal(returned.ok,true);assert.equal(returned.value.anchor.refId,REF);assert.equal(shown.length,1);assert.equal(shown[0].mode,'workspace');
  f.revoke();assert.deepEqual(await f.request('navigation',{op:'return'}),unavailable);assert.equal(shown.length,1,'no presentation after live UI authority is withdrawn');
});
