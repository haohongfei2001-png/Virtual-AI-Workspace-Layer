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
import {emptyState,reduceCommand} from '../../src/data/state.mjs';
import {createBackup} from '../../src/data/backup.mjs';
import {createFreeReadService} from '../../src/runtime/free-read-service.mjs';
import {createFreeViewOwner} from '../../src/runtime/free-view-owner.mjs';
import {createProductionProService} from '../../src/pro/integration/production-owner.mjs';
import {createSameDatabaseStore} from '../../src/pro/integration/same-db-store.mjs';
import {proRootKey,proRecoveryKey} from '../../src/pro/integration/storage-registry.mjs';

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

test('migrated ambiguous relationships remain reachable beyond 24 and after resolving the first page under live authority',async t=>{
  const f=await fixture(t),ids=Array.from({length:32},(_,i)=>'33333333-3333-4333-8333-'+String(i+1).padStart(12,'0'));
  const refs=ids.map((id,i)=>({id,nativeTitle:'Legacy conversation '+(i+1),nativeUrl:'https://chatgpt.com/c/'+id,projectId:null,available:true}));
  // Import real Free assets, then invoke the production upgrade route. Native
  // membership is supplied separately through the test's explicit source gate;
  // restored asset bytes do not establish positive NONE or a Pro grant.
  let legacy=reduceCommand(emptyState(f.scope),{type:'INGEST',batch:{schema:'vaiwl-internal-evidence-v1',refs,sources:[],events:[],coverage:[]}},'evidence');
  for(const id of ['legacy_a','legacy_b'])legacy=reduceCommand(legacy,{type:'CREATE_WORKSPACE',id,name:id},'human');
  for(const [i,refId] of ids.entries())for(const workspaceId of ['legacy_a','legacy_b'])legacy=reduceCommand(legacy,{type:'PLACE',refId,workspaceId,order:i,locked:true},'human');
  const bundle=createBackup(legacy),importPlan=await f.workspaces.previewRestore(f.scope,bundle);
  assert.equal((await f.workspaces.restoreBackup(f.scope,{operationId:'ambiguous_import',bundle,...importPlan})).ok,true);
  const observed=await f.native.apply(f.scope,{operationId:'ambiguous_native',expectedRevision:(await f.native.read(f.scope)).revision,batch:{scopeKey:f.scope.key,sourceRevision:2,observedAt:new Date(NOW).toISOString(),validUntil:new Date(NOW+60000).toISOString(),projects:[],refs:refs.map(({id,nativeTitle,nativeUrl})=>({id,nativeTitle,nativeUrl,availability:'available'})),membership:ids.map(id=>({id,state:'NONE',projectId:null})),inventory:{projects:'partial',conversations:'partial',cursor:null}}});
  assert.equal(observed.ok,true,observed.reason);
  await f.viewOwner.refresh();const expected=await f.ready(),upgrade=await f.request('commit',{op:'preview',kind:'legacy-upgrade',input:{},expected});
  assert.equal(upgrade.ok,true,JSON.stringify(upgrade));
  assert.equal((await f.request('commit',{op:'apply-structure',previewId:upgrade.value.previewId,expected,operationId:'ambiguous_upgrade'})).ok,true);
  await f.viewOwner.refresh();
  const panelRequest={op:'panel',kind:'legacy-resolutions',id:null,offset:0,limit:24};
  const panel=async offset=>{const reply=await f.request('view',{...panelRequest,offset});assert.equal(reply.ok,true,JSON.stringify(reply));return reply.value;};
  assert.deepEqual(await f.request('view',panelRequest,{grantId:'invented'}),unavailable,'the new listing does not bypass UI authority');
  const first=await panel(0),second=await panel(24),firstIds=Object.keys(first.display.legacyResolutions),laterIds=Object.keys(second.display.legacyResolutions);
  assert.equal(first.display.scopeKey,f.scope.key);assert.equal(first.page.total,32);assert.equal(first.page.count,24);assert.equal(first.page.hasMore,true);
  assert.equal(second.page.total,32);assert.equal(second.page.offset,24);assert.equal(second.page.count,8);assert.equal(second.page.hasMore,false);
  assert.deepEqual([...firstIds,...laterIds].sort(),[...ids].sort(),'all imported unresolved references are reachable without omission or duplication');
  for(const row of [...Object.values(first.display.legacyResolutions),...Object.values(second.display.legacyResolutions)]){
    assert.equal(row.status,'primary-resolution-required');assert.deepEqual(row.candidates,[]);assert.deepEqual(row.preservedPlacements,[]);
  }
  assert.equal(Object.keys(first.display.topics).length,0);assert(new TextEncoder().encode(JSON.stringify(first)).length<=65536);
  const detail=await f.request('view',{op:'panel',kind:'reference',id:firstIds[0],offset:0,limit:100});assert.equal(detail.ok,true);
  assert.deepEqual(detail.value.display.legacyResolutions[firstIds[0]].candidates.sort(),['legacy_a','legacy_b'],'selected detail retains the full protected candidate set');
  const previewFor=async refId=>{const review=(await panel(0)).versions,reply=await f.request('commit',{op:'preview',kind:'legacy-primary',input:{refId,chosenPrimary:'legacy_a'},expected:review});assert.equal(reply.ok,true,JSON.stringify(reply));return reply.value;};
  const commandFor=(refId,plan)=>({type:'RESOLVE_LEGACY_PRIMARY',refId,chosenPrimary:plan.chosenPrimary,preservedAssetDigest:plan.preservedAssetDigest,planHash:plan.planHash});
  const retired=await previewFor(firstIds[0]),beforeEpoch=await f.raw();f.c.scopeGrantId='scope_A_ambiguous_replaced';
  assert.deepEqual(await f.request('commit',{op:'dispatch',command:commandFor(firstIds[0],retired),expected:retired.expected,operationId:'retired_legacy_resolution'}),unavailable);
  assert.deepEqual(await f.raw(),beforeEpoch,'replaced grant cannot apply a previously reviewed relationship');
  assert.notEqual((await panel(0)).versions.authorizationEpoch,retired.expected.authorizationEpoch);
  for(const [i,refId] of firstIds.entries()){
    const plan=await previewFor(refId),applied=await f.request('commit',{op:'dispatch',command:commandFor(refId,plan),expected:plan.expected,operationId:'resolve_legacy_'+i});
    assert.equal(applied.ok,true,JSON.stringify(applied));
  }
  const remaining=await panel(0),staleCursor=await panel(24);
  assert.equal(remaining.page.total,8);assert.equal(remaining.page.count,8);assert.equal(remaining.page.hasMore,false);
  assert.deepEqual(Object.keys(remaining.display.legacyResolutions).sort(),[...laterIds].sort(),'resolved rows are filtered before pagination');
  assert.equal(staleCursor.page.offset,0);assert.deepEqual(staleCursor.display.legacyResolutions,remaining.display.legacyResolutions,'a previous later-page cursor clamps to reachable remaining rows');
  const saved=await f.raw();assert.equal(Object.values(saved.state.legacyResolutions).filter(r=>r.status==='resolved').length,24);assert.equal(saved.records.length,25);
  assert.equal(Object.keys((await f.workspaces.read(f.scope)).state.placements).length,64,'original Free placements are not consumed by Pro resolution');
  const pending=await previewFor(laterIds[0]);f.revoke();f.service.revokeTab(1);
  assert.deepEqual(await f.request('view',{...panelRequest,offset:24}),unavailable,'stored unresolved rows are not authorization after revocation');
  assert.deepEqual(await f.request('commit',{op:'dispatch',command:commandFor(laterIds[0],pending),expected:pending.expected,operationId:'revoked_legacy_resolution'}),unavailable);
  assert.deepEqual(await f.raw(),saved,'revocation leaves remaining data and operation history unchanged');
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

async function removeProRoot(f){
  const db=await f.base.open();
  await new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states'],'readwrite');tx.objectStore('b23_states').delete(proRootKey(f.scope.key));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
}
async function repairRow(f){
  const db=await f.base.open();
  return new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states'],'readonly'),q=tx.objectStore('b23_states').get(proRecoveryKey(f.scope.key));tx.oncomplete=()=>resolve(q.result??null);tx.onabort=()=>reject(tx.error);});
}

test('damaged Pro root uses explicit production recovery without exposing private replay bytes',async t=>{
  const f=await fixture(t),expected=await f.ready();
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Retained after repair'},expected,operationId:'repair_topic'})).ok,true);
  const before=await f.raw();await removeProRoot(f);
  assert.equal((await f.page()).ok,false,'normal owner never treats missing root plus history as empty');
  const preview=await f.request('commit',{op:'recovery-preview'});assert.equal(preview.ok,true,JSON.stringify(preview));
  assert.equal(preview.value.kind,'pro-preview');assert.match(preview.value.summary,/1 个主题/);assert.equal(await repairRow(f),null,'preview is read-only');
  const publicBytes=JSON.stringify(preview);for(const privateKey of ['scope_A','nativeRoot','transaction','journalDigest','repairedChecksum','inverseHash','planHash'])assert(!publicBytes.includes(privateKey),privateKey);
  const apply={op:'recovery-apply',previewId:preview.value.previewId,operationId:'explicit_repair'};
  const recovered=await f.request('commit',apply);assert.equal(recovered.ok,true,JSON.stringify(recovered));assert.equal(recovered.value.replayed,false);
  assert.deepEqual(await f.raw(),before,'repair retains exact assets and operation history');
  assert.equal((await repairRow(f)).payload.original.root,null,'rejected original root state is retained');
  assert.equal((await f.request('background',{op:'status'})).value.status.processingMode,'off');
  f.c.scopeGrantId='scope_A_after_repair';
  const replay=await f.request('commit',apply);assert.equal(replay.ok,true);assert.equal(replay.value.replayed,true,'new live epoch can reconcile the original receipt');
  assert.deepEqual(await f.request('commit',{...apply,previewId:'invented_review'}),unavailable,'same operation with changed review is rejected');
  assert.deepEqual(await f.raw(),before);
});

test('recovery review cannot cross authority generations or apply after a Free source change',async t=>{
  const f=await fixture(t),expected=await f.ready();
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Protected repair'},expected,operationId:'protected_repair_topic'})).ok,true);
  await removeProRoot(f);
  const oldPreview=await f.request('commit',{op:'recovery-preview'});assert.equal(oldPreview.ok,true);
  f.c.scopeGrantId='scope_A_replaced';
  assert.deepEqual(await f.request('commit',{op:'recovery-apply',previewId:oldPreview.value.previewId,operationId:'retired_review'}),unavailable);
  const preview=await f.request('commit',{op:'recovery-preview'});assert.equal(preview.ok,true);
  assert.equal((await f.workspaces.command(f.scope,{operationId:'shared_change',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'changed_free',name:'Changed during repair review'}})).ok,true);
  // The cached Free view still looks identical. Only the existing same-IDB
  // source fence can detect this committed shared-root change.
  assert.deepEqual(await f.request('commit',{op:'recovery-apply',previewId:preview.value.previewId,operationId:'stale_source_repair'}),unavailable);
  assert.equal(await repairRow(f),null);await assert.rejects(f.raw(),/pro-missing-root-with-history/);
});

test('recovery checks do not fabricate data for an empty or healthy workspace',async t=>{
  const f=await fixture(t),expected=await f.ready();
  const empty=await f.request('commit',{op:'recovery-preview'});assert.equal(empty.ok,true);assert.equal(empty.value.state,'unavailable');
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Healthy'},expected,operationId:'healthy_topic'})).ok,true);
  const before=await f.raw(),healthy=await f.request('commit',{op:'recovery-preview'});assert.equal(healthy.ok,true);assert.equal(healthy.value.state,'unavailable');
  assert.equal(await repairRow(f),null);assert.deepEqual(await f.raw(),before);
  f.revoke();assert.deepEqual(await f.request('commit',{op:'recovery-preview'}),unavailable);
});

test('large operation requires every current review page before one atomic durable undo',async t=>{
  const f=await fixture(t);let legacy=emptyState(f.scope);
  // Test data enter through the existing Free data-only backup path. No Pro
  // grant, synthetic Pro owner or bypass of its transaction store is used.
  for(let i=0;i<201;i++)legacy=reduceCommand(legacy,{type:'CREATE_WORKSPACE',id:'legacy_'+i,name:'Saved topic '+i},'human');
  const bundle=createBackup(legacy),importPlan=await f.workspaces.previewRestore(f.scope,bundle);
  assert.equal((await f.workspaces.restoreBackup(f.scope,{operationId:'legacy_bulk_import',bundle,...importPlan})).ok,true);
  await f.viewOwner.refresh();const review=await f.ready(),upgrade=await f.request('commit',{op:'preview',kind:'legacy-upgrade',input:{},expected:review});
  assert.equal(upgrade.ok,true);
  assert.equal((await f.request('commit',{op:'apply-structure',previewId:upgrade.value.previewId,expected:review,operationId:'large_upgrade'})).ok,true);
  await f.viewOwner.refresh();const expected=(await f.page()).value.versions,before=await f.raw(),target=before.records.find(r=>r.transaction.operationId==='large_upgrade').transaction;
  assert(target.patch.length>200);assert.equal(Object.keys(before.state.topics).length,201);
  assert.deepEqual(await f.request('commit',{op:'preview',kind:'undo',input:{operationId:'large_upgrade'},expected}),unavailable);
  assert.deepEqual(await f.request('commit',{op:'dispatch',command:{type:'UNDO_TRANSACTION',targetOperationId:'large_upgrade',reviewedInverseHash:target.inverseHash},expected,operationId:'bypass_review'}),unavailable);
  const reviewed=await f.request('commit',{op:'preview',kind:'undo-review',input:{operationId:'large_upgrade'},expected});assert.equal(reviewed.ok,true,JSON.stringify(reviewed));
  assert.equal(reviewed.value.state,'ready');assert(!Object.hasOwn(reviewed.value,'inverseHash'));
  const request={op:'apply-structure',previewId:reviewed.value.previewId,expected,operationId:'large_atomic_undo'};
  assert.deepEqual(await f.request('commit',request),unavailable,'confirmation before complete review is refused');
  const pageRequest={op:'operation-review',previewId:reviewed.value.previewId,expected,offset:0,limit:37};
  assert.deepEqual(await f.request('view',{...pageRequest,offset:37}),unavailable,'skipping the first review window is refused');
  const seen=[];let offset=0;
  do{
    const reply=await f.request('view',{...pageRequest,offset});assert.equal(reply.ok,true,JSON.stringify(reply));
    assert.equal(reply.value.kind,'pro-operation-page');assert.equal(reply.value.operationId,'large_upgrade');assert.deepEqual(reply.value.versions,expected);assert.equal(reply.value.page.total,target.patch.length);
    assert(new TextEncoder().encode(JSON.stringify(reply)).length<=65536);for(const key of ['inverse','restoreValue','before','after','nativeRoot','scopeGrantId'])assert(!JSON.stringify(reply).includes('"'+key+'"'));
    seen.push(...reply.value.changes.map(x=>x.kind+':'+x.key));offset+=reply.value.page.count;
    if(reply.value.page.hasMore)assert.deepEqual(await f.request('commit',request),unavailable,'partial review never authorizes partial or complete undo');
  }while(offset<target.patch.length);
  assert.equal(new Set(seen).size,target.patch.length);assert.deepEqual(await f.raw(),before,'review pages never write data');
  const undo=await f.request('commit',request);assert.equal(undo.ok,true,JSON.stringify(undo));assert.equal(undo.value.replayed,false);
  const after=await f.raw();assert.equal(after.state.revision,before.state.revision+1);assert.equal(Object.keys(after.state.topics).length,0);assert.equal(after.records.length,before.records.length+1);
  assert.equal(after.records.find(r=>r.transaction.operationId==='large_upgrade').transaction.status,'undone');assert.equal(Object.keys((await f.workspaces.read(f.scope)).state.workspaces).length,201,'original Free human assets retained');
  assert.equal((await f.request('commit',request)).value.replayed,true);assert.deepEqual(await f.raw(),after);
});

test('operation review cannot cross a changed source or authorization epoch',async t=>{
  const f=await fixture(t),initial=await f.ready();
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Current-only review'},expected:initial,operationId:'review_source'})).ok,true);
  const expected=(await f.page()).value.versions,review=await f.request('commit',{op:'preview',kind:'undo-review',input:{operationId:'review_source'},expected});assert.equal(review.ok,true);
  f.c.scopeGrantId='scope_A_review_replaced';
  assert.deepEqual(await f.request('view',{op:'operation-review',previewId:review.value.previewId,offset:0,limit:24,expected}),unavailable);
  assert.deepEqual(await f.request('commit',{op:'apply-structure',previewId:review.value.previewId,operationId:'retired_undo',expected}),unavailable);
  assert.equal((await f.raw()).state.revision,1);
  const fresh=(await f.page()).value.versions,next=await f.request('commit',{op:'preview',kind:'undo-review',input:{operationId:'review_source'},expected:fresh});assert.equal(next.ok,true);
  assert.equal((await f.workspaces.command(f.scope,{operationId:'review_free_change',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'review_new_free',name:'New shared source'}})).ok,true);
  await f.viewOwner.refresh();
  assert.deepEqual(await f.request('view',{op:'operation-review',previewId:next.value.previewId,offset:0,limit:24,expected:fresh}),unavailable);
  assert.deepEqual(await f.request('commit',{op:'apply-structure',previewId:next.value.previewId,operationId:'changed_source_undo',expected:fresh}),unavailable);
  assert.equal((await f.raw()).state.revision,1);
});

test('changing the selected Pro scope retires a completed review even when data versions stay equal',async t=>{
  const f=await fixture(t),projects=['project_A','project_B'];
  f.wall(NOW+1);
  const nativeRevision=(await f.native.read(f.scope)).revision;
  const observed=await f.native.apply(f.scope,{operationId:'unit_projects',expectedRevision:nativeRevision,batch:{scopeKey:f.scope.key,sourceRevision:2,observedAt:new Date(NOW+1).toISOString(),validUntil:new Date(NOW+60000).toISOString(),projects:projects.map(id=>({id,nativeName:id,nativeUrl:'https://chatgpt.com/g/'+id,availability:'available'})),refs:[],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}}});assert.equal(observed.ok,true,observed.reason);
  await f.viewOwner.refresh();let expected=await f.ready();
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Scoped review'},expected,operationId:'scope_review_topic'})).ok,true);
  const select=selectedProjectIds=>f.request('background',{op:'mode',mode:'pro-cross-project',selectedProjectIds});
  assert.equal((await select(['project_A'])).ok,true);
  const page=await f.request('view',{op:'page',mode:'pro-cross-project',selectedProjectIds:['project_A'],segment:0,offset:0,limit:8,rowLimit:5});assert.equal(page.ok,true);expected=page.value.versions;
  const preview=await f.request('commit',{op:'preview',kind:'undo-review',input:{operationId:'scope_review_topic'},expected});assert.equal(preview.ok,true);
  const window=await f.request('view',{op:'operation-review',previewId:preview.value.previewId,offset:0,limit:100,expected});assert.equal(window.ok,true);assert.equal(window.value.page.hasMore,false);
  assert.equal((await select(['project_B'])).ok,true);
  const other=await f.request('view',{op:'page',mode:'pro-cross-project',selectedProjectIds:['project_B'],segment:0,offset:0,limit:8,rowLimit:5});assert.equal(other.ok,true);assert.deepEqual(other.value.versions,expected,'selection changes do not fabricate storage revisions');
  assert.deepEqual(await f.request('commit',{op:'apply-structure',previewId:preview.value.previewId,operationId:'old_selection_undo',expected}),unavailable);
  assert.equal((await f.raw()).state.revision,1);assert.equal(Object.keys((await f.raw()).state.topics).length,1);
});

test('project picker reaches admitted projects beyond 100 while preserving selection and retiring old reviews',async t=>{
  const f=await fixture(t),projects=Array.from({length:132},(_,i)=>'project_'+String(i).padStart(3,'0')),unadmitted='project_not_available';
  const observed=await f.native.apply(f.scope,{operationId:'many_native_projects',expectedRevision:(await f.native.read(f.scope)).revision,batch:{scopeKey:f.scope.key,sourceRevision:2,observedAt:new Date(NOW).toISOString(),validUntil:new Date(NOW+60000).toISOString(),projects:[...projects.map(id=>({id,nativeName:'Native '+id,nativeUrl:'https://chatgpt.com/g/'+id,availability:'available'})),{id:unadmitted,nativeName:'Unavailable project',nativeUrl:'https://chatgpt.com/g/'+unadmitted,availability:'unavailable'}],refs:[],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}}});
  assert.equal(observed.ok,true,observed.reason);
  await f.viewOwner.refresh();const initial=await f.ready();
  assert.equal(f.viewOwner.current().snapshot.projects.length,132,'the real Free prepared snapshot admits every available project');
  assert(!f.viewOwner.current().snapshot.projects.some(p=>p.id===unadmitted),'raw native storage presence is not admission');
  assert.equal((await f.page()).value.view.native.groups.items.length,1,'the separate native card window is deliberately smaller than the picker');
  assert.equal((await f.request('commit',{op:'dispatch',command:{type:'CREATE_TOPIC',name:'Preserved review target'},expected:initial,operationId:'picker_review_target'})).ok,true);
  const before=await f.raw(),panelRequest={op:'panel',kind:'project-choices',id:null,offset:0,limit:24};
  const panel=async offset=>{const reply=await f.request('view',{...panelRequest,offset});assert.equal(reply.ok,true,JSON.stringify(reply));return reply.value;};
  assert.deepEqual(await f.request('view',panelRequest,{grantId:'invented'}),unavailable);
  const seen=[];let last;
  for(let offset=0;offset<projects.length;offset+=24){
    const page=await panel(offset);assert.equal(page.page.total,132);assert.equal(page.page.offset,offset);assert.equal(page.page.count,page.projects.length);assert(page.projects.length<=24);
    assert(new TextEncoder().encode(JSON.stringify(page)).length<=65536);assert.equal(Object.keys(page.display.topics).length,0);assert.equal(page.items.length,0);
    seen.push(...page.projects.map(p=>p.id));last=page;
  }
  assert.deepEqual([...seen].sort(),[...projects].sort(),'all admitted project choices are reachable exactly once');
  assert.equal(last.page.offset,120);assert.equal(last.page.count,12);assert.equal(last.page.hasMore,false);
  const earlier=seen[0],later=last.projects.at(-1).id;
  const select=selectedProjectIds=>f.request('background',{op:'mode',mode:'pro-cross-project',selectedProjectIds});
  const pageFor=selectedProjectIds=>f.request('view',{op:'page',mode:'pro-cross-project',selectedProjectIds,segment:0,offset:0,limit:8,rowLimit:5});
  assert.equal((await select([earlier])).ok,true);
  const current=await pageFor([earlier]);assert.equal(current.ok,true);const expected=current.value.versions;
  const preview=await f.request('commit',{op:'preview',kind:'undo-review',input:{operationId:'picker_review_target'},expected});assert.equal(preview.ok,true);
  const reviewed=await f.request('view',{op:'operation-review',previewId:preview.value.previewId,offset:0,limit:24,expected});assert.equal(reviewed.ok,true);assert.equal(reviewed.value.page.hasMore,false);
  const picked=await select([earlier,later]);assert.equal(picked.ok,true,JSON.stringify(picked));assert.deepEqual(picked.value.status.selectedProjectIds,[earlier,later]);
  assert.deepEqual((await panel(0)).status.selectedProjectIds,[earlier,later],'reading another choice window does not drop the off-page selection');
  const changed=await pageFor([earlier,later]);assert.equal(changed.ok,true);assert.deepEqual(changed.value.versions,expected,'selection changes do not fabricate data revisions');
  assert.deepEqual(await f.request('commit',{op:'apply-structure',previewId:preview.value.previewId,operationId:'old_picker_review',expected}),unavailable,'changed explicit scope retires the completed earlier review');
  for(const id of ['forged_native_project',unadmitted])assert.deepEqual(await select([earlier,id]),unavailable,'unknown or unadmitted native projects cannot enter the scope');
  assert.deepEqual((await f.request('background',{op:'status'})).value.status.selectedProjectIds,[earlier,later],'failed selection leaves the current explicit selection intact');
  assert.deepEqual(await f.raw(),before,'paging, selecting and refused old/forged requests do not write overlay assets or operation history');
  assert.equal((await f.workspaces.read(f.scope)).state.revision,0,'the picker does not mutate Free assets');
});
