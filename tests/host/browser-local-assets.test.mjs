/** Actual Host composition and repositories; MOCK_IDB and explicit browser frames. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-partitions.mjs';
import {BACKUP_CHUNK_BYTES,encodeBackupChunk} from '../../src/host/backup-transfer.mjs';
import {j4AssetBackup} from './fixtures/j4-assets.mjs';

const url='https://chatgpt.com/';
async function fixture(t,personal=true){
 let id=0,opens=0;const frames=new Map(),factory=new MockIDBFactory(),open=factory.open.bind(factory);
 factory.open=(...args)=>{opens++;return open(...args);};
 const base=new ScopeRepository({indexedDB:factory,databaseName:'local-assets'}),workspaces=new WorkspaceRepository({baseRepository:base});
 const service=createHostBindingService({extensionId:'ext',uiURL:'chrome-extension://ext/ui.html',getFrame:async({tabId,frameId})=>frames.get(`${tabId}:${frameId}`),allowedURL:u=>u.startsWith(url),profile:{id:'browser-local-session'},provider:{read(){assert.fail('local assets cannot read server identity');}},repository:base,workspaceRepository:workspaces,freeEvidenceRepository:new FreeEvidenceRepository({baseRepository:base}),surfaceProfiles:new Map([['fixture',{id:'fixture',revision:1,urlPolicy:createURLPolicy()}]]),makeId:()=>`local_assets_${++id}`});
 t.after(()=>{service.stop();base.close();});
 const sender={id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:'parent',documentLifecycle:'active',url};
 frames.set('1:0',{documentId:'parent',url,documentLifecycle:'active',parentFrameId:-1});
 const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender);assert.equal(hello.ok,true);
 const {documentToken,producerToken,routeEpoch}=hello.binding,packet={documentToken,producerToken,routeEpoch};
 const frame={tabId:1,frameId:0,documentId:'parent',incognito:false,documentLifecycle:'active',actualURL:url};
 if(personal)await service.authority.bindPersonal(frame,'explicit_fixture_personal');
 assert.equal((await service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,...packet},sender)).state,'verified');
 const scope=service.authority.scopeFor(frame);assert.equal(scope.storage,personal?'personal':'session');
 assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...packet,mountId:'mount',regionEpoch:1},sender)).ok,true);
 const ui={...sender,frameId:2,documentId:'ui',url:'chrome-extension://ext/ui.html'};
 frames.set('1:2',{documentId:'ui',url:ui.url,documentLifecycle:'active',parentFrameId:0});
 const [joined,confirmed]=await Promise.all([service.handle({v:1,type:'HOST_UI_JOIN',nonce:'nonce',role:'workspace'},ui),service.handle({v:1,type:'HOST_UI_CONFIRM',...packet,mountId:'mount',regionEpoch:1,nonce:'nonce',role:'workspace'},sender)]);assert(joined.ok&&confirmed.ok);
 const request=(type,extra={})=>service.handle({v:1,type,grantId:joined.grant.id,mountId:'mount',...extra},ui);
 return {base,workspaces,service,scope,frames,get opens(){return opens;},request,backup:(action,extra)=>request('HOST_UI_BACKUP_'+action,extra),recovery:()=>request('HOST_UI_RECOVERY_STATUS')};
}
async function upload(f,bundle){
 const bytes=new TextEncoder().encode(JSON.stringify(bundle)),info=await f.backup('UPLOAD',{byteLength:bytes.length});assert.equal(info.ok,true,JSON.stringify(info));
 for(let index=0;index<info.chunkCount;index++)assert.equal((await f.backup('CHUNK',{transferId:info.transferId,index,data:encodeBackupChunk(bytes.subarray(index*BACKUP_CHUNK_BYTES,(index+1)*BACKUP_CHUNK_BYTES))})).ok,true);
 return info;
}
test('confirmed local personal UI exports and explicitly restores through the existing guarded repository',async t=>{
 const f=await fixture(t),before=(await f.workspaces.read(f.scope)).state;
 const info=await upload(f,j4AssetBackup(f.scope,'https://chatgpt.com')),preview=await f.backup('PREVIEW',{transferId:info.transferId});assert.equal(preview.ok,true,JSON.stringify(preview));
 assert.deepEqual((await f.workspaces.read(f.scope)).state,before,'preview must not persist');
 assert.equal((await f.backup('RESTORE',{transferId:info.transferId,planId:preview.planId,operationId:'explicit_restore'})).ok,true);
 assert.equal((await f.workspaces.read(f.scope)).state.workspaces.j4_manual.name,'J4 retained manual workspace');
 const exported=await f.backup('EXPORT');assert.equal(exported.ok,true,JSON.stringify(exported));assert.equal((await f.backup('READ',{transferId:exported.transferId,index:0})).ok,true);
 assert.equal((await f.backup('CLOSE',{transferId:exported.transferId})).ok,true);
});
test('unconfirmed local RAM UI cannot allocate backup transfers or recovery plans or open persistent IDB',async t=>{
 const f=await fixture(t,false);assert.equal(f.opens,0);
 for(const operation of [()=>f.backup('EXPORT'),()=>f.backup('UPLOAD',{byteLength:20}),()=>f.recovery(),()=>f.request('HOST_UI_SNIPPET_LIST',{offset:0,limit:12}),()=>f.request('HOST_UI_SNIPPET',{action:'remove',id:'j4_snippet',operationId:'unconfirmed_remove',expectedRevision:0})])assert.equal((await operation()).ok,false);
 assert.equal(f.opens,0);assert.equal(f.service.isIdle(),true);
});
test('confirmed local recovery reports all healthy stores without a repair or write',async t=>{
 const f=await fixture(t),r=await f.recovery();assert.equal(r.ok,true,JSON.stringify(r));
 for(const kind of ['workspace','native','evidence'])assert.deepEqual(r.plans[kind],{corrupt:false,recoverable:false,planId:null});
 assert.equal((await f.workspaces.read(f.scope)).state.revision,0);
});
for(const kind of ['native','evidence'])test('local '+kind+' corruption reaches the existing recovery oracle through the scope router',async t=>{
 const f=await fixture(t),db=await f.base.open(),key=kind==='native'?f.scope.key:freeEvidenceKey(f.scope.key);
 await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');tx.objectStore('native_states').put({key,payload:{syntheticDamaged:true},checksum:'invalid'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const r=await f.recovery();assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(r.plans[kind],{corrupt:true,recoverable:false,planId:null});
 const row=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});assert.equal(row.checksum,'invalid','diagnosis must not repair damage');
});
test('revoked local parent cannot read an allocated export or obtain recovery plans',async t=>{
 const f=await fixture(t),info=await f.backup('EXPORT');assert.equal(info.ok,true);
 f.frames.set('1:0',{documentId:'replacement',url,documentLifecycle:'active',parentFrameId:-1});f.service.invalidate({tabId:1});
 assert.equal((await f.backup('READ',{transferId:info.transferId,index:0})).ok,false);assert.equal((await f.recovery()).ok,false);
});
test('confirmed local existing snippets use the actual prepared view and human CAS without a native selection source',async t=>{
 const f=await fixture(t),info=await upload(f,j4AssetBackup(f.scope,'https://chatgpt.com')),preview=await f.backup('PREVIEW',{transferId:info.transferId});assert.equal(preview.ok,true);
 assert.equal((await f.backup('RESTORE',{transferId:info.transferId,planId:preview.planId,operationId:'existing_snippets'})).ok,true);
 let view;for(let n=0;n<30;n++){view=await f.request('HOST_UI_VIEW',{query:{}});if(view.state!=='preparing')break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(view.state,'ready',JSON.stringify(view));
 const before=(await f.workspaces.read(f.scope)).state,list=await f.request('HOST_UI_SNIPPET_LIST',{offset:0,limit:12});assert.equal(list.ok,true,JSON.stringify(list));assert.equal(list.nativeSelectionAvailable,false);assert.equal(list.snippets.items[0].preview,'J4 retained human snippet');
 const action=(kind,extra={})=>f.request('HOST_UI_SNIPPET',{action:kind,id:'j4_snippet',operationId:'local_'+kind,expectedRevision:list.workspaceRevision,...extra});
 assert.equal((await action('save')).ok,false);assert.equal((await action('locate')).ok,false);assert.equal((await action('remove',{expectedRevision:list.workspaceRevision+1})).ok,false);assert.deepEqual((await f.workspaces.read(f.scope)).state,before);
 assert.equal((await action('remove')).ok,true);const after=(await f.workspaces.read(f.scope)).state;assert.deepEqual(after.preferences.savedSnippets.value,[]);for(const name of ['identities','placements','workspaces','refs'])assert.deepEqual(after[name],before[name]);assert.deepEqual(after.preferences.workingSet,before.preferences.workingSet);
 f.service.invalidate({tabId:1});assert.equal((await f.request('HOST_UI_SNIPPET_LIST',{offset:0,limit:12})).ok,false);
});
