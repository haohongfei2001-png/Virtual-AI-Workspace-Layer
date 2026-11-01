import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {createBackup} from '../../src/data/backup.mjs';
import {planFreeReplica,assembleFreeReplica,freeReplicaRequests} from '../../src/data/free-replica.mjs';
const refId='backup_only';
test('undo restored human assets preserves known UNKNOWN identity in warm and cold projection',async()=>{
 const scope=scopeOf('A'),frame={documentId:'removal_document',documentLifecycle:'active',url:'https://vaiwl-hf.test/hf/A/c/T0'},sender={id:'removal_extension',tab:{id:1},frameId:0,...frame},service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:sender.id,getFrame:async()=>frame});let seq=0,leaseId;
 const call=(type,extra={})=>service.broker.handle({v:1,type,clientId:'removal_client',seq:++seq,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 const header=async()=>{const r=await call('B23_FREE_HEADER');assert.equal(r.ok,true,JSON.stringify(r));return r.header;};
 const read=async(prior,head)=>{const plan=planFreeReplica(prior,head),pages=[];for(const ids of freeReplicaRequests(plan,5000)){const r=await call('B23_FREE_PAGE',{revision:head.revision,offset:0,limit:5000,ids,now:FIXTURE_NOW,viewSession:head.viewSession});assert.equal(r.ok,true,JSON.stringify(r));pages.push(r.page);}return assembleFreeReplica(prior,head,pages,plan);};
 try{
  leaseId=(await call('BIND')).leaseId;await header();assert.equal((await service.workspaces.migratePartitioned(scope)).ok,true);
  const backupState=emptyState(scope);backupState.refs[refId]={id:refId,nativeUrl:'https://vaiwl-hf.test/hf/A/c/'+refId,projectId:null,nativeTitle:'backup ref',available:true};const bundle=createBackup(backupState),preview=await service.workspaces.previewRestore(scope,bundle);
  const restored=await service.workspaces.restoreBackup(scope,{operationId:'restore_reference',bundle,expectedRevision:preview.expectedRevision,planHash:preview.planHash});assert.equal(restored.ok,true,JSON.stringify(restored));
  const before=await header(),prior=await read(null,before);assert.equal(before.manifest.refVersions[refId],0);assert.equal(prior.refs.get(refId).membership,'UNKNOWN');
  const undo=await service.workspaces.undo(scope,{operationId:'undo_restore_reference',expectedRevision:before.workspaceRevision,targetOperationId:'restore_reference'});assert.equal(undo.ok,true,JSON.stringify(undo));
  const after=await header(),plan=planFreeReplica(prior,after);assert.equal(Object.hasOwn(after.manifest.refVersions,refId),true);assert.deepEqual(plan.projects,[]);assert.deepEqual(plan.refs,[]);assert.equal(plan.full,false);
  const cold=await read(null,after),warm=assembleFreeReplica(prior,after,[],plan);assert.equal(cold.refs.has(refId),true);assert.deepEqual(warm.snapshot.refs.map(({id,membership,projectId})=>({id,membership,projectId})),cold.snapshot.refs.map(({id,membership,projectId})=>({id,membership,projectId})));
  assert.equal(plan.rebuild,false,'undoing human assets does not remove known reference identity');assert.equal(cold.refs.get(refId).membership,'UNKNOWN');assert.equal(cold.refs.get(refId).nativeTitle,null);
 }finally{service.close();}
});
test('omitted entries count as existing inventory; removing only a tombstone forces rebuild',()=>{
 const header={scope:'scope',revision:1,evidenceRevision:'e',manifest:{projectVersions:{P:1},refVersions:{R:1,GONE:1},activityVersions:{}},inventoryComplete:false};
 const prior={header,projects:new Map([['P',{}]]),refs:new Map([['R',{membership:'NONE'}]]),omittedProjects:new Set(),omittedRefs:new Set(['GONE'])};
 const unchanged=planFreeReplica(prior,header);assert.equal(unchanged.rebuild,false);assert.deepEqual(unchanged.refs,[]);
 const next={...header,revision:2,manifest:{...header.manifest,refVersions:{R:1}}},plan=planFreeReplica(prior,next);assert.equal(plan.rebuild,true);assert.deepEqual(plan.refs,[]);
});
test('same-sized reference replacement still requests the new row and bypasses empty-plan reuse',()=>{
 const header={scope:'scope',revision:1,evidenceRevision:'e',manifest:{projectVersions:{},refVersions:{R:1},activityVersions:{}}};
 const prior={header,projects:new Map(),refs:new Map([['R',{membership:'NONE'}]]),omittedProjects:new Set(),omittedRefs:new Set()};
 const plan=planFreeReplica(prior,{...header,revision:2,manifest:{...header.manifest,refVersions:{NEW:2}}});assert.equal(plan.full,false);assert.deepEqual(plan.refs,['NEW']);assert.equal(freeReplicaRequests(plan).length,1);
});

test('authoritative removal of a visible reference still rebuilds a zero-page replica',()=>{
 const header={scope:'scope',revision:1,evidenceRevision:'e',manifest:{projectVersions:{},refVersions:{R:1,GONE:1},activityVersions:{}},inventoryComplete:false};
 const prior={header,projects:new Map(),refs:new Map([['R',{membership:'NONE'}],['GONE',{membership:'UNKNOWN'}]]),omittedProjects:new Set(),omittedRefs:new Set()};
 const next={...header,revision:2,manifest:{...header.manifest,refVersions:{R:1}}},plan=planFreeReplica(prior,next);
 assert.equal(plan.rebuild,true);assert.equal(plan.full,false);assert.deepEqual(freeReplicaRequests(plan),[]);
});
