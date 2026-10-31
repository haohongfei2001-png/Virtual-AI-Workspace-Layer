import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner,FIXTURE_SCOPE} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {digest,stable} from '../../src/data/hash.mjs';
import {createCompositeBackupRepository,parseCompositeBackup,previewOverlayMerge} from '../../src/pro/integration/composite-backup.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const clone=x=>structuredClone(x);
async function fixture(name,{seed=false,scope=FIXTURE_SCOPE}={}){
 const factory=new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,databaseName:'composite_'+name,fixtureOnly:true,scope}),controller=await createProController(owner),workspace=new WorkspaceRepository({baseRepository:owner.base,evidenceGate:()=> 'synthetic'});let restored=0;
 const composite=createCompositeBackupRepository({workspaceRepository:workspace,resolvePro:async(s,o)=>{if(s.key!==owner.scope.key||o.guard&&o.guard()!==true)throw Error('scope-denied');const data=await owner.readPrivate();return {store:owner.store,grant:owner.grant(),versions:data.snapshot.versions};},onRestored:()=>{restored++;}});
 const f={factory,owner,controller,workspace,composite,scope:owner.scope,db:await owner.base.open(),restored:()=>restored};
 if(seed){assert.equal((await workspace.command(f.scope,{operationId:'free_topic',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'free_legacy',name:'原有人工工作区'}})).ok,true);
  await controller.dispatch({type:'CREATE_TOPIC',name:'Pro 人工主题'});await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'保留派生标题'});}
 return f;
}
async function rows(db){const names=['b23_states','b23_operations','b23_checkpoints','native_states','native_operations','refs'];return new Promise(resolve=>{const tx=db.transaction(names),out={};for(const n of names){out[n]=[];const q=tx.objectStore(n).openCursor();q.onsuccess=()=>{if(q.result){out[n].push(q.result.value);q.result.continue();}};}tx.oncomplete=()=>resolve(out);});}
async function plan(target,bundle,id='restore_unified'){const p=await target.composite.previewRestore(target.scope,bundle);return {bundle,operationId:id,planHash:p.planHash,expectedRevision:p.expectedRevision};}

test('one data-only compound backup restores Free and Pro in the same DB4 transaction and replays once',async()=>{
 const a=await fixture('source',{seed:true}),b=await fixture('target');try{
 const bundle=await a.composite.exportBackup(a.scope),nativeBefore=(await rows(b.db)).native_states;
 assert.equal(bundle.format,'vaiwl-unified-assets');assert.equal(bundle.pro.legacyAssetsDigest,bundle.free.checksum);assert.deepEqual(parseCompositeBackup(bundle,a.scope),bundle);
 assert(!['grant','ticket','jobs','ledger','credential','authorization'].some(key=>Object.hasOwn(bundle,key)));
 const request=await plan(b,bundle),result=await b.composite.restoreBackup(b.scope,request);assert.equal(result.ok,true,result.reason);
 assert.equal((await b.workspace.read(b.scope)).state.workspaces.free_legacy.name,'原有人工工作区');assert.equal((await b.owner.store.read(b.owner.grant())).state.titles.c_beta.title,'保留派生标题');assert.deepEqual((await rows(b.db)).native_states,nativeBefore);assert.equal(b.restored(),1);assert.equal(b.db.version,4);assert.equal(b.factory.databasesMap.size,1);
 const before=await rows(b.db),replay=await b.composite.restoreBackup(b.scope,request);assert.equal(replay.ok,true,replay.reason);assert.equal(replay.replayed,true);assert.deepEqual(await rows(b.db),before);assert.equal(b.restored(),1);
 }finally{a.controller.destroy();b.controller.destroy();}
});

test('quota failure at Pro write rolls back Free, Pro, checkpoints and both journals',async()=>{
 const a=await fixture('quota_source',{seed:true}),b=await fixture('quota_target');try{
 const bundle=await a.composite.exportBackup(a.scope),request=await plan(b,bundle),before=await rows(b.db);b.factory.failNextPut=true;
 const result=await b.composite.restoreBackup(b.scope,request);assert.equal(result.ok,false);assert.match(result.reason,/Quota/);assert.deepEqual(await rows(b.db),before);assert.equal(b.restored(),0);
 }finally{a.controller.destroy();b.controller.destroy();}
});

test('Free CAS failure after queued Pro writes aborts the complete restore',async()=>{
 const a=await fixture('cas_source',{seed:true}),b=await fixture('cas_target');try{
 const bundle=await a.composite.exportBackup(a.scope),request=await plan(b,bundle);
 const mutate=b.workspace.mutate.bind(b.workspace);
 // Inject only one competing call, without recursively intercepting command().
 b.workspace.mutate=async(s,params)=>{b.workspace.mutate=mutate;await b.workspace.command(s,{operationId:'parallel_free_write',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'keep_current',name:'并发人工作品'}});return mutate(s,params);};
 const result=await b.composite.restoreBackup(b.scope,request);assert.equal(result.ok,false);assert.match(result.reason,/revision-conflict/);
 assert.equal((await b.workspace.read(b.scope)).state.workspaces.keep_current.name,'并发人工作品');assert.equal((await b.workspace.read(b.scope)).state.workspaces.free_legacy,undefined);const pro=await b.owner.store.read(b.owner.grant());assert.equal(pro.sequence,0);assert.equal(Object.keys(pro.state.topics).length,0);
 }finally{a.controller.destroy();b.controller.destroy();}
});

test('nonempty target safely merges disjoint assets and refuses differing human rows or constraints',async()=>{
 const a=await fixture('merge_source',{seed:true}),b=await fixture('merge_target');try{
 await b.controller.dispatch({type:'CREATE_TOPIC',name:'目标已有主题'});const kept=clone((await b.owner.store.read(b.owner.grant())).state.topics),bundle=await a.composite.exportBackup(a.scope),request=await plan(b,bundle);assert.equal((await b.composite.restoreBackup(b.scope,request)).ok,true);
 const current=(await b.owner.store.read(b.owner.grant())).state;for(const [key,row] of Object.entries(kept))assert.deepEqual(current.topics[key],row);
 const collision=clone(bundle),topic=Object.values(collision.pro.state.topics)[0];topic.name='试图覆盖原有人工作品';const {checksum:unused,...proPayload}=collision.pro;collision.pro.checksum=digest(proPayload);const {checksum:unused2,...payload}=collision;collision.checksum=digest(payload);const before=await rows(b.db);
 const dry=previewOverlayMerge(current,collision.pro);assert.equal(dry.state,null);assert(dry.conflicts.some(c=>c.kind==='topic'));await assert.rejects(()=>b.composite.previewRestore(b.scope,collision),/explicit-conflict/);assert.deepEqual(await rows(b.db),before);
 }finally{a.controller.destroy();b.controller.destroy();}
});

test('composite backup rejects cross-scope, mismatched pairs and recomputed authority injection',async()=>{
 const a=await fixture('invalid',{seed:true});try{const bundle=await a.composite.exportBackup(a.scope),other=normalizedScope({verified:true,provider:'p',accountId:'b',organizationId:'o'});assert.throws(()=>parseCompositeBackup(bundle,other),/invalid-unified/);
 for(const change of [b=>{b.grant={allowed:true};},b=>{b.minimumReader='vaiwl-unified-r2/1';},b=>{b.pro.legacyAssetsDigest=digest('different');const {checksum,...payload}=b.pro;b.pro.checksum=digest(payload);}]){const bad=clone(bundle);change(bad);const {checksum,...payload}=bad;bad.checksum=digest(payload);assert.throws(()=>parseCompositeBackup(bad,a.scope));}
 }finally{a.controller.destroy();}
});

test('revoked owner and stale preview cannot restore assets; Free legacy bundle remains supported',async()=>{
 const a=await fixture('guard_source',{seed:true}),b=await fixture('guard_target');try{const bundle=await a.composite.exportBackup(a.scope),request=await plan(b,bundle),before=await rows(b.db);b.owner.revoke();await assert.rejects(()=>b.composite.restoreBackup(b.scope,request));assert.deepEqual(await rows(b.db),before);await b.owner.confirm();
 await b.controller.refresh();await b.controller.dispatch({type:'CREATE_TOPIC',name:'预览后的修改'});const after=await rows(b.db);const result=await b.composite.restoreBackup(b.scope,request);assert.equal(result.ok,false);assert.match(result.reason,/preview-changed/);assert.deepEqual(await rows(b.db),after);
 const free=await a.workspace.exportBackup(a.scope),legacyPlan=await b.composite.previewRestore(b.scope,free);const legacy=await b.composite.restoreBackup(b.scope,{operationId:'legacy_free_import',expectedRevision:legacyPlan.expectedRevision,bundle:free,planHash:legacyPlan.planHash});assert.equal(legacy.ok,true);assert.equal(Object.keys((await b.owner.store.read(b.owner.grant())).state.topics).length,1);
 }finally{a.controller.destroy();b.controller.destroy();}
});

test('explicit legacy migration preserves old IDs and all shared assets, with rollback and downgrade reads',async()=>{
 const f=await fixture('migration');try{
 await f.workspace.command(f.scope,{operationId:'old_topic',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'stable_old_id',name:'旧人工主题'}});
 const before=(await f.workspace.read(f.scope)).state,p=await f.composite.previewLegacyMigration(f.scope);assert.deepEqual(p.retainedTopicIds,['stable_old_id']);const request={operationId:'explicit_migrate',planHash:p.planHash,expectedRevision:p.expectedRevision};
 f.factory.failNextPut=true;assert.equal((await f.composite.migrateLegacy(f.scope,request)).ok,false);assert.deepEqual((await f.workspace.read(f.scope)).state,before);assert.equal((await f.owner.store.read(f.owner.grant())).sequence,0);
 const result=await f.composite.migrateLegacy(f.scope,request);assert.equal(result.ok,true,result.reason);const after=(await f.workspace.read(f.scope)).state;assert.deepEqual({...after,revision:before.revision},before);assert.equal((await f.owner.store.read(f.owner.grant())).state.topics.stable_old_id.name,'旧人工主题');
 // Same DB4 legacy Free reader ignores the Pro namespace and remains usable.
 const legacyReader=new WorkspaceRepository({baseRepository:f.owner.base});assert.deepEqual((await legacyReader.read(f.scope)).state,after);assert.equal((await legacyReader.history(f.scope)).some(x=>x.type==='PRO_LEGACY_MIGRATION'),true);assert.equal((await legacyReader.exportBackup(f.scope)).format,'vaiwl-assets');
 }finally{f.controller.destroy();}
});

async function populateShared(f,id,name,refId){
 let revision=(await f.workspace.read(f.scope)).state.revision;
 let result=await f.workspace.command(f.scope,{operationId:id+'_create',expectedRevision:revision++,command:{type:'CREATE_WORKSPACE',id,name}});assert.equal(result.ok,true,result.reason);
 result=await f.workspace.ingest(f.scope,{operationId:id+'_ref',expectedRevision:revision++,batch:{schema:'vaiwl-internal-evidence-v1',refs:[{id:refId,nativeTitle:'原生 '+refId,nativeUrl:'https://fixture.test/c/'+refId,projectId:null,available:true}],sources:[],events:[],coverage:[]}});assert.equal(result.ok,true,result.reason);
 result=await f.workspace.command(f.scope,{operationId:id+'_placement',expectedRevision:revision++,command:{type:'PLACE',workspaceId:id,refId,order:7,locked:true}});assert.equal(result.ok,true,result.reason);
 result=await f.workspace.command(f.scope,{operationId:id+'_title',expectedRevision:revision++,command:{type:'SET_TITLE',refId,title:'人工 '+refId}});assert.equal(result.ok,true,result.reason);
}
async function formatShared(f,format){
 const moved=await f.workspace.migratePartitioned(f.scope);assert.equal(moved.ok,true,moved.reason);
 if(format==='directory'){const revision=(await f.workspace.read(f.scope)).state.revision,result=await f.workspace.migrateSharedDirectory(f.scope,{operationId:'shared_directory',expectedRevision:revision});assert.equal(result.ok,true,result.reason);}
}
for(const format of ['partitioned','directory'])test('composite restore preserves existing '+format+' reference pieces and native provenance',async()=>{
 const a=await fixture('format_source_'+format),b=await fixture('format_target_'+format);try{
 await populateShared(a,'from_backup','备份工作区','c_beta');await populateShared(b,'existing_target','目标原有工作区','c_gamma');await a.controller.dispatch({type:'CREATE_TOPIC',name:'备份 Pro 主题'});
 await formatShared(a,format);await formatShared(b,format);const existing=(await b.workspace.read(b.scope)).state,beforeNative=(await rows(b.db)).native_states;
 const bundle=await a.composite.exportBackup(a.scope),request=await plan(b,bundle),result=await b.composite.restoreBackup(b.scope,request);assert.equal(result.ok,true,result.reason);
 const next=(await b.workspace.read(b.scope)).state;assert.deepEqual(next.workspaces.existing_target,existing.workspaces.existing_target);assert.deepEqual(next.identities.c_gamma,existing.identities.c_gamma);assert.equal(next.workspaces.from_backup.name,'备份工作区');assert.equal(next.identities.c_beta.title,'人工 c_beta');assert.equal(Object.keys((await b.owner.store.read(b.owner.grant())).state.topics).length,1);assert.deepEqual((await rows(b.db)).native_states,beforeNative);
 }finally{a.controller.destroy();b.controller.destroy();}
});
for(const format of ['partitioned','directory'])test('explicit '+format+' legacy migration preserves all references, IDs, aliases and placements',async()=>{
 const f=await fixture('migration_'+format);try{await populateShared(f,'legacy_persist','旧工作区','c_beta');await formatShared(f,format);
 const before=(await f.workspace.read(f.scope)).state,p=await f.composite.previewLegacyMigration(f.scope),result=await f.composite.migrateLegacy(f.scope,{operationId:'migrate_'+format,planHash:p.planHash,expectedRevision:p.expectedRevision});assert.equal(result.ok,true,result.reason);
 assert.deepEqual({...((await f.workspace.read(f.scope)).state),revision:before.revision},before);const overlay=(await f.owner.store.read(f.owner.grant())).state;assert.equal(overlay.topics.legacy_persist.name,'旧工作区');assert.equal(overlay.titles.c_beta.title,'人工 c_beta');assert.equal(Object.values(overlay.placements)[0].conversationId,'c_beta');
 }finally{f.controller.destroy();}
});

test('migration needs explicit empty overlay and exact migration receipt does not rerun',async()=>{
 const f=await fixture('migration_policy');try{
 await populateShared(f,'legacy_only','旧主题','c_beta');const preview=await f.composite.previewLegacyMigration(f.scope),request={operationId:'migration_once',planHash:preview.planHash,expectedRevision:preview.expectedRevision};assert.equal((await f.composite.migrateLegacy(f.scope,request)).ok,true);const before=await rows(f.db);
 const replay=await f.composite.migrateLegacy(f.scope,request);assert.equal(replay.ok,true,replay.reason);assert.equal(replay.replayed,true);assert.deepEqual(await rows(f.db),before);
 await assert.rejects(()=>f.composite.previewLegacyMigration(f.scope),/requires-empty-overlay/);assert.deepEqual(await rows(f.db),before);
 }finally{f.controller.destroy();}
});
test('restored topic undo preview detects later members before any inverse write',async()=>{
 const a=await fixture('restore_dependency_source',{seed:true}),b=await fixture('restore_dependency_target');try{
 const bundle=await a.composite.exportBackup(a.scope),request=await plan(b,bundle,'restore_with_dependencies');assert.equal((await b.composite.restoreBackup(b.scope,request)).ok,true);
 await b.controller.refresh();const topicId=Object.keys(b.controller.getState().topics)[0];assert.equal((await b.controller.previewUndo(request.operationId)).state,'ready');
 await b.controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId,role:'primary'});const before=await rows(b.db),preview=await b.controller.previewUndo(request.operationId);
 assert.equal(preview.state,'conflict');assert(preview.conflicts.some(c=>c.kind==='topic-membership-set'&&c.key===topicId));
 await assert.rejects(()=>b.controller.undo(request.operationId,preview.inverseHash),/undo-conflict/);assert.deepEqual(await rows(b.db),before);
 }finally{a.controller.destroy();b.controller.destroy();}
});
test('legacy upgrade uses an opaque worker request fingerprint and pauses once after successful commit',async()=>{
 const f=await fixture('migration_worker_receipt');try{
 await populateShared(f,'legacy_review','受审旧主题','c_beta');const preview=await f.composite.previewLegacyMigration(f.scope);
 assert.deepEqual(preview.legacyCounts,{topics:1,placements:1,titles:1,ambiguous:0});
 const requestFingerprint={kind:'legacy-upgrade',previewId:'worker_review',review:{scopeKey:f.scope.key,overlayRevision:0,reviewId:digest('original-review')}},request={operationId:'migration_worker',planHash:preview.planHash,expectedRevision:preview.expectedRevision,requestFingerprint};
 assert.equal((await f.composite.migrateLegacy(f.scope,request)).ok,true);assert.equal(f.restored(),1);
 const raw=await f.owner.store.read(f.owner.grant()),record=raw.records.find(r=>r.transaction.operationId===request.operationId);assert.equal(record.fingerprint,digest(requestFingerprint));
 const before=await rows(f.db),replay=await f.composite.migrateLegacy(f.scope,request);assert.equal(replay.ok,true);assert.equal(replay.replayed,true);assert.equal(f.restored(),1);assert.deepEqual(await rows(f.db),before);
 const changed=await f.composite.migrateLegacy(f.scope,{...request,requestFingerprint:{...requestFingerprint,previewId:'another_review'}});assert.equal(changed.ok,false);assert.match(changed.reason,/replay-conflict/);assert.deepEqual(await rows(f.db),before);
 await assert.rejects(()=>f.composite.migrateLegacy(f.scope,{...request,requestFingerprint:{bad:undefined}}),/invalid-record/);
 }finally{f.controller.destroy();}
});
