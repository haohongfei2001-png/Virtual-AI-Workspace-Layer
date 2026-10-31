import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,reduceCommand,placementId} from '../../src/data/state.mjs';
import {digest,stable} from '../../src/data/hash.mjs';
import {emptyOverlay,validateOverlay,reduceProCommand,legacyResolutionPlan,sealProposal,exclusionKey} from '../../src/pro/domain/index.mjs';
import {planLegacyMigration,verifyMigrationPlan,assertOverlayReader} from '../../src/pro/migration/legacy.mjs';
import {replayOverlayJournal,exportOverlayBackup,importOverlayBackup,previewBackupRestore} from '../../src/pro/migration/recovery.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner,FIXTURE_SCOPE} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';

const clone=v=>structuredClone(v);
function deepFreeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
function legacy(){
  let s=emptyState(FIXTURE_SCOPE);
  s=reduceCommand(s,{type:'INGEST',batch:{schema:'vaiwl-internal-evidence-v1',refs:['c_alpha','c_beta','c_gamma'].map(id=>({id,nativeTitle:'原生 '+id,nativeUrl:'https://fixture.test/c/'+id,projectId:null,available:true})),sources:[],events:[],coverage:[]}},'evidence');
  for(const [id,name,order,icon] of [['legacy_a','旧研究主题',7,'◇'],['legacy_b','另一主题',-2,'○']])s=reduceCommand(s,{type:'CREATE_WORKSPACE',id,name,order,icon});
  s=reduceCommand(s,{type:'UPDATE_WORKSPACE',id:'legacy_a',name:'研究主题'});
  s=reduceCommand(s,{type:'PLACE',workspaceId:'legacy_a',refId:'c_alpha',order:9,locked:true});
  s=reduceCommand(s,{type:'PLACE',workspaceId:'legacy_b',refId:'c_alpha',order:4,locked:true});
  s=reduceCommand(s,{type:'PLACE',workspaceId:'legacy_a',refId:'c_beta',order:15,locked:false});
  s=reduceCommand(s,{type:'PLACE',workspaceId:'legacy_b',refId:'c_gamma',order:18,excluded:true,locked:true});
  s=reduceCommand(s,{type:'SET_TITLE',refId:'c_alpha',title:'旧派生名称'});
  s=reduceCommand(s,{type:'SET_TITLE',refId:'c_alpha',title:'人工派生名'});
  s=reduceCommand(s,{type:'SET_PREFERENCE',id:'workingSet',value:{refs:['c_alpha','c_beta'],current:'c_alpha'}});
  s=reduceCommand(s,{type:'SET_PREFERENCE',id:'savedSnippets',value:[{id:'snippet_one',refId:'c_beta',messageId:'m_one',branchId:'b_one',text:'已选择的人工片段',bodyHash:digest('selected')}]});
  return s;
}
function domainContext(s){const refs=['c_alpha','c_beta','c_gamma'].map(id=>({id,nativeTitle:id,nativeUrl:null,membership:{state:'NONE',evidenceId:'e_'+id,revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['fixture']}));const expected={scopeKey:s.scopeKey,authorizationEpoch:1,sourceGeneration:{fixture:1},nativeFields:{c_alpha:1,c_beta:1,c_gamma:1},overlayRevision:s.revision,targets:{},constraintRevision:s.revision,policyVersion:'migration-test',evidenceDigest:digest('e')};return {actor:'human',operationId:'resolve_legacy',snapshot:{references:refs,versions:expected},expected};}
async function orderedFixture(){
  const factory=new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,fixtureOnly:true}),controller=await createProController(owner);
  await controller.dispatch({type:'CREATE_TOPIC',name:'Riftlet 首击可靠性'});
  const topicId=Object.keys(controller.getState().topics)[0],snapshot=controller.getSnapshot(),beforeNative=await owner.native.read(owner.scope);
  const p=sealProposal({id:'fixture_automated_proposal',fingerprint:digest('fixture target/evidence'),versions:snapshot.versions,evidenceIds:['membership_c_beta'],model:null,summary:'隔离自动收录测试',rationale:['固定匿名样本'],qualityBand:'eligible-auto',kind:'existing-topic',refId:'c_beta',topicId,role:'primary'});
  await owner.registerProposals(owner.grant(),[p],snapshot.versions);await controller.refresh();
  const command={type:'APPLY_LOW_RISK_PROPOSAL',proposalId:p.id,planHash:p.planHash},expected=controller.getSnapshot().versions,ticket=owner.automationTicket(command,expected,{firstRun:false,qualityGate:{existingTopic:true}});
  const automatic=await owner.ports.commit.commit(owner.grant(),{operationId:'automatic_commit',expected,command:{actor:'automation',ticket,command}},new AbortController().signal);assert.equal(automatic.ok,true,automatic.reason);await controller.refresh();
  await controller.dispatch({type:'SET_DERIVED_TITLE',refId:'c_beta',title:'人工核对完成'});
  const raw=await owner.raw(),afterNative=await owner.native.read(owner.scope);assert.equal(digest(beforeNative),digest(afterNative));
  return {factory,owner,controller,raw,topicId,checkpoint:{state:emptyOverlay(owner.scope.key),sequence:0}};
}

test('legacy migration preserves IDs, aliases, icon, ordering and per-field protection',()=>{
  const old=deepFreeze(legacy()),original=digest(old),{state,report}=planLegacyMigration(old,{humanRefs:['c_alpha']});
  assert.deepEqual(Object.keys(state.topics),Object.keys(old.workspaces));assert.equal(state.topics.legacy_a.name,'研究主题');assert.deepEqual(state.topics.legacy_a.aliases,['旧研究主题']);assert.equal(state.topics.legacy_a.icon,old.workspaces.legacy_a.icon);
  assert.deepEqual([state.topics.legacy_a.nameControl.mode,state.topics.legacy_a.nameControl.locked],['human',true]);assert.deepEqual([state.topics.legacy_a.membershipControl.mode,state.topics.legacy_a.membershipControl.locked],['automatic',false]);
  assert.deepEqual(state.presentation.topicOrder.order,{legacy_a:7,legacy_b:-2});for(const p of Object.values(old.placements))assert.equal(state.presentation.placementOrder.order[p.id],p.order);
  assert.equal(state.titles.c_alpha.conversationId,'c_alpha');assert.equal(state.titles.c_alpha.title,'人工派生名');assert.deepEqual(state.titles.c_alpha.aliases,['旧派生名称']);assert.equal(state.titles.c_alpha.control.locked,true);
  assert.equal(state.placements[placementId('legacy_a','c_beta')].role,'primary');assert.equal(state.placements[placementId('legacy_a','c_beta')].control.locked,false);
  assert.equal(state.constraints[exclusionKey('legacy_b','c_gamma')].kind,'exclude-topic');assert.ok(!state.placements[placementId('legacy_b','c_gamma')]);assert.deepEqual(report.retainedPlacementIds.sort(),Object.keys(old.placements).sort());assert.equal(digest(old),original);
});
test('multiple old human placements remain unresolved with every original row and lock',()=>{
  const old=legacy(),{state}=planLegacyMigration(old),resolution=state.legacyResolutions.c_alpha;
  assert.equal(resolution.status,'primary-resolution-required');assert.equal(resolution.chosenPrimary,null);assert.deepEqual(resolution.preservedPlacements,resolution.originalPlacementIds.map(id=>old.placements[id]));assert.equal(resolution.preservedAssetDigest,digest(resolution.preservedPlacements));
  for(const id of resolution.originalPlacementIds){assert.equal(state.placements[id].state,'revalidation-needed');assert.equal(state.placements[id].control.locked,true);assert.equal(state.placements[id].control.mode,'human');}
  assert.equal(Object.values(state.placements).filter(p=>p.conversationId==='c_alpha'&&p.state==='included'&&p.role==='primary').length,0);
});
test('explicit legacy primary and explicit no-primary resolve without dropping assets',()=>{
  const initial=planLegacyMigration(legacy()).state;
  for(const choice of ['legacy_b',null]){
    const context=domainContext(initial),p=legacyResolutionPlan(initial,'c_alpha',choice,context),next=reduceProCommand(initial,{type:'RESOLVE_LEGACY_PRIMARY',refId:'c_alpha',chosenPrimary:choice,preservedAssetDigest:p.preservedAssetDigest,planHash:p.planHash},context);
    assert.equal(next.legacyResolutions.c_alpha.status,'resolved');assert.equal(next.legacyResolutions.c_alpha.chosenPrimary,choice);assert.equal(Object.values(next.placements).filter(p=>p.conversationId==='c_alpha'&&p.role==='primary'&&p.state==='included').length,choice===null?0:1);
    for(const id of initial.legacyResolutions.c_alpha.originalPlacementIds){assert.equal(next.placements[id].control.locked,true);assert.equal(next.placements[id].state,'included');}assert.deepEqual(next.legacyResolutions.c_alpha.preservedPlacements,initial.legacyResolutions.c_alpha.preservedPlacements);
  }
  assert.equal(initial.legacyResolutions.c_alpha.status,'primary-resolution-required');
});
test('verified legacy primary intent is honored; unknown topic cannot become the primary',()=>{
  const old=legacy(),plan=planLegacyMigration(old,{explicitPrimary:{c_alpha:'legacy_b'}});assert.equal(plan.state.legacyResolutions.c_alpha,undefined);assert.equal(plan.state.placements[placementId('legacy_b','c_alpha')].role,'primary');assert.equal(plan.state.placements[placementId('legacy_a','c_alpha')].role,'related');assert.throws(()=>planLegacyMigration(old,{explicitPrimary:{c_alpha:'not_a_member'}}),/legacy-explicit-primary-invalid/);
});
test('work sets, selected snippets and human refs remain in original shared assets with digest',()=>{
  const old=deepFreeze(legacy()),before=stable(old),humanRefs=deepFreeze(['c_alpha','c_beta']),plan=planLegacyMigration(old,{humanRefs});assert.equal(stable(old),before);assert.deepEqual(old.preferences.workingSet.value,{refs:['c_alpha','c_beta'],current:'c_alpha'});assert.equal(old.preferences.savedSnippets.value[0].text,'已选择的人工片段');assert.equal(plan.report.sharedAssetsDigest,digest({refs:old.refs,preferences:old.preferences,humanRefs}));assert.equal(plan.report.sharedAssetsAction,'leave-original-shared-assets-untouched');assert.ok(!('preferences' in plan.state));assert.equal(plan.state.scopeKey,FIXTURE_SCOPE.key);
});
test('migration verifies source and target hashes and refuses an older reader',()=>{
  const old=legacy(),plan=planLegacyMigration(old);assert.equal(verifyMigrationPlan(old,plan),true);const changed=clone(old);changed.workspaces.legacy_a.name='later';assert.throws(()=>verifyMigrationPlan(changed,plan),/stale-migration-plan/);const bad=clone(plan);bad.state.topics.legacy_a.name='corrupt';assert.throws(()=>verifyMigrationPlan(old,bad),/stale-migration-plan/);assert.equal(assertOverlayReader('vaiwl-pro-overlay/1'),true);assert.throws(()=>assertOverlayReader('legacy-reader'),/pro-reader-incompatible/);
});
test('a resigned migration target cannot cross the source scope',()=>{const old=legacy(),plan=planLegacyMigration(old);plan.state.scopeKey='other';for(const t of Object.values(plan.state.topics))t.scopeKey='other';plan.report.targetDigest=digest(plan.state);plan.report.planHash=digest({sourceDigest:plan.report.sourceDigest,targetDigest:plan.report.targetDigest,sharedAssetsDigest:plan.report.sharedAssetsDigest});assert.throws(()=>verifyMigrationPlan(old,plan),/migration-scope-mismatch/);});
test('corrupt legacy refs and injected preserved permission fields cannot enter the overlay',()=>{
  const orphan=legacy();delete orphan.refs.c_alpha;assert.throws(()=>planLegacyMigration(orphan),/orphan-placement|orphan-title/);const poisoned=legacy();poisoned.placements[placementId('legacy_a','c_alpha')].grant={approved:true};assert.throws(()=>planLegacyMigration(poisoned),/invalid-schema/);
});
test('same-IDB fixture resolves ambiguous migration through current human receipt',async()=>{
  const factory=new MockIDBFactory(),migrated=planLegacyMigration(legacy()).state,owner=await createFixtureOwner({indexedDB:factory,fixtureOnly:true,initialOverlay:migrated}),controller=await createProController(owner);
  try{const plan=controller.previewLegacyPrimary('c_alpha',null);await controller.dispatch({type:'RESOLVE_LEGACY_PRIMARY',refId:'c_alpha',chosenPrimary:null,preservedAssetDigest:plan.preservedAssetDigest,planHash:plan.planHash});const state=controller.getState();assert.equal(state.legacyResolutions.c_alpha.status,'resolved');assert.equal(state.legacyResolutions.c_alpha.chosenPrimary,null);assert.ok(Object.values(state.placements).filter(p=>p.conversationId==='c_alpha').every(p=>p.role==='related'&&p.control.locked));assert.equal(factory.databasesMap.size,1);}finally{controller.destroy();}
});
test('actual human, proposal-registration, machine and human records replay in original order',async()=>{
  const f=await orderedFixture();try{assert.deepEqual(f.raw.records.map(r=>r.transaction.actor),['human','system','automation','human']);const records=clone(f.raw.records).reverse(),before=digest(records),restored=replayOverlayJournal(f.checkpoint,records);assert.equal(digest(restored.state),digest(f.controller.getState()));assert.equal(restored.sequence,4);assert.equal(restored.state.placements[placementId(f.topicId,'c_beta')].control.mode,'automatic');assert.equal(restored.state.titles.c_beta.control.mode,'human');assert.equal(digest(records),before);assert.equal(f.factory.databasesMap.size,1);}finally{f.controller.destroy();}
});
test('corrupt patch, cross-scope and non-overlay effects reject without mutating checkpoint',async()=>{
  const f=await orderedFixture();try{const original=digest(f.checkpoint);for(const mutate of [rows=>{rows[0].transaction.patch[0].after.name='tampered';},rows=>{rows[0].transaction.base.scopeKey='other';},rows=>{rows[0].transaction.patch[0].kind='native-title';},rows=>{rows[1].transaction.patch[0].kind='topic';}]){const rows=clone(f.raw.records);mutate(rows);assert.throws(()=>replayOverlayJournal(f.checkpoint,rows));assert.equal(digest(f.checkpoint),original);}}finally{f.controller.destroy();}
});
test('journal gaps and stale, backward or jumping overlay revisions are rejected',async()=>{
  const f=await orderedFixture();try{for(const mutate of [rows=>rows.splice(1,1),rows=>{rows[2].transaction.base.overlayRevision=0;},rows=>{rows[2].transaction.resultRevision=0;},rows=>{rows[3].transaction.resultRevision+=2;}]){const rows=clone(f.raw.records);mutate(rows);assert.throws(()=>replayOverlayJournal(f.checkpoint,rows),/journal-sequence-gap|journal-base-revision-conflict|journal-result-revision-conflict/);}}finally{f.controller.destroy();}
});
test('duplicate journal sequence is corruption, not an ignored alternate history',async()=>{
  const f=await orderedFixture();try{const rows=clone(f.raw.records),duplicate=clone(rows[0]);duplicate.transaction.operationId='conflicting_duplicate';rows.push(duplicate);assert.throws(()=>replayOverlayJournal(f.checkpoint,rows),/journal-duplicate-sequence/);}finally{f.controller.destroy();}
});
test('invalid checkpoint sequence is rejected even when its overlay is valid',()=>{
  for(const sequence of [-1,NaN,1.5,undefined])assert.throws(()=>replayOverlayJournal({state:emptyOverlay(FIXTURE_SCOPE.key),sequence},[]),/invalid-revision|invalid-checkpoint/);
});
test('backup preserves accepted assets and exclusions, excludes proposals and has no authority material',async()=>{
  const f=await orderedFixture();try{const state=f.controller.getState(),before=digest(state),backup=exportOverlayBackup(state,{legacyAssetsDigest:digest('shared')});assert.ok(Object.keys(state.proposals).length);assert.deepEqual(backup.state.proposals,{});for(const table of ['topics','placements','titles','constraints','series','redirects','tombstones'])assert.deepEqual(backup.state[table],state[table]);assert.equal(digest(state),before);assert.deepEqual(Object.keys(backup).sort(),['checksum','format','legacyAssetsDigest','scopeKey','state']);const imported=importOverlayBackup(backup,{scopeKey:state.scopeKey});assert.equal(imported.needsRevalidation,true);assert.equal(imported.processingMode,'off');assert.deepEqual(imported.jobs,[]);assert.ok(!('grant' in imported));assert.ok(!('key' in imported));}finally{f.controller.destroy();}
});
test('backup rejects checksum, cross-scope, recomputed permission injection and machine proposals',()=>{
  const migrated=planLegacyMigration(legacy()).state,backup=exportOverlayBackup(migrated),bad=clone(backup);bad.state.topics.legacy_a.name='corrupt';assert.throws(()=>importOverlayBackup(bad,{scopeKey:migrated.scopeKey}),/invalid-pro-backup/);assert.throws(()=>importOverlayBackup(backup,{scopeKey:'other'}),/invalid-pro-backup/);
  for(const modify of [b=>{b.grant={approved:true};},b=>{b.state.apiKey='do-not-import';},b=>{b.state.legacyResolutions.c_alpha.preservedPlacements[0].consent={mode:'cloud'};}]){const v=clone(backup);modify(v);const {checksum,...payload}=v;v.checksum=digest(payload);assert.throws(()=>importOverlayBackup(v,{scopeKey:migrated.scopeKey}),/invalid-schema|invalid-record|legacy-preserved/);}
  const machine=clone(backup),proposal=sealProposal({id:'queued_machine',fingerprint:digest('proposal'),versions:domainContext(migrated).expected,evidenceIds:['e_c_beta'],model:null,summary:'未确认建议',rationale:['片段元数据'],qualityBand:'review',kind:'derived-title',refId:'c_beta',title:'建议名称'});machine.state.proposals[proposal.id]={proposal,state:'awaiting-review',missingEvidence:[],appliedOperationId:null};const {checksum,...payload}=machine;machine.checksum=digest(payload);assert.throws(()=>importOverlayBackup(machine,{scopeKey:migrated.scopeKey}),/backup-machine-work-denied/);
});
test('legacyAssetsDigest is a hash or null, never a second unvalidated payload',()=>{
  const state=emptyOverlay(FIXTURE_SCOPE.key);assert.throws(()=>exportOverlayBackup(state,{legacyAssetsDigest:{grant:{ok:true}}}),/invalid-digest/);const valid=exportOverlayBackup(state),bad={...valid,legacyAssetsDigest:{key:'secret'}};const {checksum,...payload}=bad;bad.checksum=digest(payload);assert.throws(()=>importOverlayBackup(bad,{scopeKey:state.scopeKey}),/invalid-digest/);
});
test('restore preview cannot replace residual hard constraints in an otherwise empty view',()=>{
  const current=emptyOverlay(FIXTURE_SCOPE.key);current.constraints.processing={kind:'exclude-ai-processing',refId:'c_alpha',revision:1,operationId:'human_exclude'};current.revision=1;validateOverlay(current);const backup=exportOverlayBackup(emptyOverlay(FIXTURE_SCOPE.key)),before=digest(current);assert.throws(()=>previewBackupRestore(current,backup),/restore-requires-empty-target-or-explicit-merge/);assert.equal(digest(current),before);
});
test('restore is data-only and a live owner grant is required; restored processing stays off',async()=>{
  const backup=exportOverlayBackup(planLegacyMigration(legacy()).state),before=digest(backup),factory=new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,fixtureOnly:true}),controller=await createProController(owner);
  try{const preview=previewBackupRestore(controller.getState(),backup);assert.equal(preview.needsRevalidation,true);assert.ok(preview.patch.length>0);owner.revoke();await assert.rejects(()=>owner.restoreBackup(backup,controller.getSnapshot().versions),/stale-semantic-grant/);await owner.confirm();await controller.refresh();await controller.restoreBackup(backup);assert.equal(controller.getState().titles.c_alpha.title,'人工派生名');assert.equal(controller.getStatus().processingMode,'off');assert.equal(digest(backup),before);assert.equal(factory.databasesMap.size,1);}finally{controller.destroy();}
});
