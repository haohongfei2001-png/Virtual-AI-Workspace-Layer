import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
import {emptyState,reduceCommand,placementId,changes,undoChanges} from '../../src/data/state.mjs';
import {createBackup,parseBackup} from '../../src/data/backup.mjs';

for(const partitioned of [false,true])test(`undo human backup restore retains scoped UNKNOWN and reverses only human assets (${partitioned?'partitioned':'monolithic'})`,async()=>{
 const scope=scopeOf('A'),refId='human_backup_anchor',frame={documentId:'known_anchor_document',documentLifecycle:'active',url:'https://vaiwl-hf.test/hf/A/c/T0'},sender={id:'known_anchor_extension',tab:{id:1},frameId:0,...frame};
 // A fresh database and explicit broker preview/restore model the human restore;
 // the backup supplies no source grant, native title evidence, or membership proof.
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:sender.id,getFrame:async()=>frame});let seq=0,leaseId;
 const call=async(type,extra={})=>{const r=await service.broker.handle({v:1,type,clientId:'known_anchor_client',seq:++seq,...(type==='BIND'?{}:{leaseId}),...extra},sender);assert.equal(r.ok,true,JSON.stringify(r));return r;};
 const header=async()=>(await call('B23_FREE_HEADER')).header;
 const page=async h=>(await call('B23_FREE_PAGE',{revision:h.revision,offset:0,limit:5000,ids:{projects:[],refs:[refId]},now:FIXTURE_NOW,viewSession:h.viewSession})).page;
 try{
  leaseId=(await call('BIND')).leaseId;await header();
  if(partitioned)assert.equal((await service.workspaces.migratePartitioned(scope)).ok,true);
  const baseline=(await service.workspaces.read(scope)).state;
  assert.equal(await service.repository.get(scope,refId),null);
  let state=emptyState(scope);state.refs[refId]={id:refId,nativeUrl:'https://vaiwl-hf.test/hf/A/c/'+refId,projectId:null,nativeTitle:'Unverified backup title',available:true};
  state=reduceCommand(state,{type:'INGEST',batch:{schema:'vaiwl-internal-evidence-v1',refs:[],sources:[{id:'backup_source',channel:'synthetic',observedAt:FIXTURE_NOW,description:'Backup evidence must not import'}],events:[{id:'backup_event',sourceId:'backup_source',conversationId:refId,messageId:'backup_message',branchId:'backup_branch',role:'user',kind:'new-send',sendState:'committed',sentAt:FIXTURE_NOW,precision:'millisecond',observedAt:FIXTURE_NOW}],coverage:[]}},'evidence');
  for(const command of [{type:'CREATE_WORKSPACE',id:'restored_workspace',name:'Restored manual workspace'},{type:'SET_TITLE',refId,title:'Restored manual title'},{type:'PLACE',workspaceId:'restored_workspace',refId},{type:'SET_PREFERENCE',id:'workingSet',value:{refs:[refId],current:refId}}])state=reduceCommand(state,command);
  const bundle=createBackup(state),{preview}=await call('B23_PREVIEW_RESTORE',{bundle});assert.equal(preview.evidenceImported,false);
  assert.deepEqual(bundle.payload.sources,{});assert.deepEqual(bundle.payload.events,{});assert.equal(bundle.payload.channel,'none');assert.throws(()=>parseBackup({...bundle,nativeGrant:{allow:true}},scope),/invalid-schema/,'a backup cannot carry execution grants');
  const restored=await call('B23_RESTORE_BACKUP',{operationId:'human_restore_anchor',expectedRevision:preview.expectedRevision,bundle,planHash:preview.planHash});
  const restoredState=(await service.workspaces.read(scope)).state;
  assert.equal(restoredState.identities[refId].title,'Restored manual title');assert.ok(restoredState.workspaces.restored_workspace);assert.ok(restoredState.placements[placementId('restored_workspace',refId)]);assert.deepEqual(restoredState.preferences.workingSet.value,{refs:[refId],current:refId});
  for(const table of ['sources','events','coverage'])assert.deepEqual(restoredState[table],baseline[table],'restore does not grant evidence authority');
  const later=await call('B23_COMMAND',{operationId:'unrelated_later_asset',expectedRevision:restored.revision,command:{type:'CREATE_WORKSPACE',id:'unrelated_later_workspace',name:'Keep later human work'}});
  const before=await header(),beforeRow=(await page(before)).refs.find(r=>r.id===refId);
  assert.equal(beforeRow.membership,'UNKNOWN');assert.equal(beforeRow.nativeTitle,null);assert.equal(beforeRow.displayTitle,'名称暂不可用');
  const undoRequest={operationId:'human_undo_restore_anchor',expectedRevision:before.workspaceRevision,targetOperationId:'human_restore_anchor'};
  const undone=await call('B23_UNDO',undoRequest),replayed=await call('B23_UNDO',undoRequest);assert.equal(replayed.replayed,true);assert.equal(replayed.revision,undone.revision);
  const finalState=(await service.workspaces.read(scope)).state;assert.equal(finalState.identities[refId],undefined);assert.equal(finalState.workspaces.restored_workspace,undefined);assert.equal(finalState.placements[placementId('restored_workspace',refId)],undefined);assert.deepEqual(finalState.preferences.workingSet,baseline.preferences.workingSet);assert.equal(finalState.workspaces.unrelated_later_workspace.name,'Keep later human work');
  for(const table of ['sources','events','coverage'])assert.deepEqual(finalState[table],baseline[table],'undo does not resurrect or revoke unrelated sources');
  const anchor=(await call('GET_REF',{conversationId:refId})).record;assert.equal(anchor.conversationId,refId);
  assert.equal(await service.repository.get(scopeOf('B'),refId),null,'the retained anchor cannot cross scope');
  const after=await header(),afterPage=await page(after),row=afterPage.refs.find(r=>r.id===refId);
  assert.deepEqual({listed:Object.hasOwn(after.manifest.refVersions,refId),membership:row?.membership??null,nativeTitle:row?.nativeTitle??null,displayTitle:row?.displayTitle??null,projectId:row?.projectId??null},
   {listed:true,membership:'UNKNOWN',nativeTitle:null,displayTitle:'名称暂不可用',projectId:null},'undoing human assets is not native deletion or explicit reference revocation; expose only the known scoped placeholder');
 }finally{service.close();}
});

for(const field of ['nativeTitle','available'])test(`retaining a restored reference does not bypass later ${field} conflict`,()=>{
 const scope=scopeOf('A'),before=emptyState(scope),after=structuredClone(before);after.revision=1;after.refs.ref={id:'ref',nativeUrl:'https://vaiwl-hf.test/hf/A/c/ref',projectId:null,nativeTitle:'Original known title',available:true};
 const operation={type:'RESTORE_BACKUP',actor:'human',patch:changes(before,after),undoneBy:null},current=structuredClone(after);current.revision=2;current.refs.ref[field]=field==='nativeTitle'?'Later observed title':false;
 const unchanged=structuredClone(current);assert.throws(()=>undoChanges(current,operation),/undo-conflict/);assert.deepEqual(current,unchanged);
});
