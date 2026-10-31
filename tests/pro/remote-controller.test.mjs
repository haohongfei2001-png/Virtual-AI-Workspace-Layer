import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {createRemoteProController} from '../../src/pro/ui/remote-controller.mjs';
import {projectPublicPage,projectPublicPanel,projectPublicPreview,publicVersions,publicStatus} from '../../src/pro/integration/public-frame-dto.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

async function fixture(t){
 const owner=await createFixtureOwner({fixtureOnly:true,indexedDB:new MockIDBFactory()}),local=await createProController(owner),calls=[],modes=[];let live=true,hold=null;
 async function request(action,payload){calls.push({action,payload});if(hold){const p=hold;hold=null;return p.promise;}
  const current=await owner.readPrivate(),base={...current,view:local.getView(),status:local.getStatus()};let value;
  if(action==='view'&&payload.op==='page')value=projectPublicPage({...base,query:payload});
  else if(action==='view'&&payload.op==='panel')value=projectPublicPanel({...base,...payload});
  else if(action==='background'&&payload.op==='mode'){await local.setMode(payload.mode,{selectedProjectIds:payload.selectedProjectIds});value={kind:'pro-status',protocol:'vaiwl-pro-public/1',status:publicStatus(local.getStatus())};}
  else if(action==='background'&&payload.op==='status')value={kind:'pro-status',protocol:'vaiwl-pro-public/1',status:publicStatus(local.getStatus())};
  else if(action==='commit'&&payload.op==='dispatch'){
   if(payload.expected.reviewId!==publicVersions(current.snapshot.versions).reviewId)return {ok:false};
   await local.dispatch(payload.command,{expected:current.snapshot.versions,operationId:payload.operationId});value={kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied',operationId:payload.operationId};
  }else if(action==='commit'&&payload.op==='preview')value=projectPublicPreview({preview:await local.previewUndo(payload.input.operationId),previewId:'preview_1'});
  else throw Error('unexpected '+action+':'+payload.op);
  return {ok:true,value};
 }
 const remote=createRemoteProController({request,isCurrent:()=>live,onMode:m=>modes.push(m)});t.after(()=>{remote.destroy();local.destroy();});await remote.refresh();return {owner,local,remote,calls,modes,setLive(v){live=v;},holdNext(){hold=deferred();return hold;},request};
}
test('remote manual command sends public review hash and restores its bounded refreshed page',async t=>{
 const f=await fixture(t);const expected=f.remote.getSnapshot().versions;
 await f.remote.dispatch({type:'CREATE_TOPIC',name:'远程人工主题'});
 assert(Object.values(f.remote.getState().topics).some(t=>t.name==='远程人工主题'));
 const command=f.calls.find(c=>c.action==='commit');assert.deepEqual(command.payload.expected,expected);assert(!('nativeFields' in command.payload.expected));assert(!('intent' in command.payload));assert.equal(f.remote.getProjection().groups.length,1);
});
test('stale dialog review hash rejects atomically and does not overwrite a newer title',async t=>{
 const f=await fixture(t),old=f.remote.getSnapshot().versions;await f.local.dispatch({type:'CREATE_TOPIC',name:'另一个标签的更改'});
 await assert.rejects(f.remote.dispatch({type:'CREATE_TOPIC',name:'不得写入'},{expected:old}),/unavailable/);
 assert(!Object.values(f.local.getState().topics).some(t=>t.name==='不得写入'));
});
test('late page and panel replies after revocation never repopulate the frame',async t=>{
 const f=await fixture(t),data=projectPublicPage({...await f.owner.readPrivate(),view:f.local.getView(),status:f.local.getStatus()}),held=f.holdNext(),refresh=f.remote.refresh({force:true});
 f.setLive(false);f.remote.destroy();held.resolve({ok:true,value:data});await assert.rejects(refresh,/unavailable/);assert.equal(f.remote.getSnapshot().authorized,false);assert.deepEqual(f.remote.getSnapshot().references,[]);assert.deepEqual(f.remote.getState().topics,{});
});
test('cross-scope panel is rejected without replacing the currently visible model',async t=>{
 const f=await fixture(t),input={...await f.owner.readPrivate(),status:f.local.getStatus(),kind:'reference',id:'c_alpha'},panel=projectPublicPanel(input),held=f.holdNext(),pending=f.remote.loadPanel('reference','c_alpha');
 panel.versions.scopeKey='another_scope';panel.display.scopeKey='another_scope';held.resolve({ok:true,value:panel});await assert.rejects(pending,/panel/);assert.notEqual(f.remote.getSnapshot().versions.scopeKey,'another_scope');
});
test('Free mode switching issues only a bounded mode mutation and keeps manual assets',async t=>{
 const f=await fixture(t);await f.remote.dispatch({type:'CREATE_TOPIC',name:'切换后保留'});const count=f.calls.length;await f.remote.setMode('native');
 assert.equal(f.calls.length,count+1);assert.equal(f.calls.at(-1).action,'background');assert.equal(f.remote.getStatus().mode,'native');
 await f.remote.setMode('pro-default-none');assert(Object.values(f.remote.getState().topics).some(t=>t.name==='切换后保留'));assert.equal(f.modes.at(-1),'pro-default-none');
});
test('a panel from before a completed refresh cannot restore the old same-scope title',async t=>{
 const f=await fixture(t);await f.local.dispatch({type:'SET_DERIVED_TITLE',refId:'c_alpha',title:'旧标题'});await f.remote.refresh({force:true});
 const old=projectPublicPanel({...await f.owner.readPrivate(),status:f.local.getStatus(),kind:'reference',id:'c_alpha'}),held=f.holdNext(),pending=f.remote.loadPanel('reference','c_alpha');
 await f.local.dispatch({type:'SET_DERIVED_TITLE',refId:'c_alpha',title:'更新后的标题'});await f.remote.refresh({force:true});
 held.resolve({ok:true,value:old});assert.equal(await pending,null);assert.equal(f.remote.getState().titles.c_alpha.title,'更新后的标题');
});
test('same-scope mismatched review or authorization epoch cannot be merged into an open panel',async t=>{
 const f=await fixture(t);
 for(const field of ['reviewId','authorizationEpoch']){
  const panel=projectPublicPanel({...await f.owner.readPrivate(),status:f.local.getStatus(),kind:'reference',id:'c_alpha'}),held=f.holdNext(),pending=f.remote.loadPanel('reference','c_alpha');
  panel.versions[field]=field==='reviewId'?'0'.repeat(64):panel.versions.authorizationEpoch+1;
  held.resolve({ok:true,value:panel});await assert.rejects(pending,/panel/);
 }
});
test('a delayed native status cannot override an explicit later Pro switch',async t=>{
 const f=await fixture(t);await f.remote.setMode('native');
 const old={kind:'pro-status',protocol:'vaiwl-pro-public/1',status:publicStatus(f.local.getStatus())},held=f.holdNext(),sync=f.remote.synchronizeMode();
 await f.remote.setMode('pro-default-none');held.resolve({ok:true,value:old});await sync;
 assert.equal(f.remote.getStatus().mode,'pro-default-none');assert.equal(f.modes.at(-1),'pro-default-none');
});
test('a native href reply stays an explicit user link without refreshing the source into reading mode',async t=>{
 const f=await fixture(t),held=f.holdNext(),refId='12345678-1234-1234-1234-123456789abc',count=f.calls.length,pending=f.remote.open(refId);
 held.resolve({ok:true,value:{kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'native-link',nativeLink:{refId,url:'https://chatgpt.com/c/'+refId,disposition:'new-tab-preserve-current'}}});
 const result=await pending;assert.equal(result.state,'native-link');assert.equal(f.calls.length,count+1);assert.equal(f.remote.getStatus().launchContext,null);
});
test('bounded Series edit transmits only one edit with its frozen review hash',async t=>{
 const f=await fixture(t),expected=f.remote.getSnapshot().versions,held=f.holdNext(),input={seriesId:'series',change:{kind:'rename',title:'新的名称'}},pending=f.remote.previewSeriesEdit(input,{expected});
 held.resolve({ok:true,value:{kind:'manual-series-plan',protocol:'vaiwl-pro-public/1',previewId:'preview_series',proposal:false,conflicts:[],summary:''}});
 const result=await pending;assert.deepEqual(f.calls.at(-1),{action:'commit',payload:{op:'preview',kind:'series-edit',input,expected}});assert.deepEqual(result.expected,expected);assert(!Object.hasOwn(result,'entries'));
});
test('Free to Pro resume retains mode, segment and independent page cursors without replaying processing consent',async t=>{
 const f=await fixture(t);await f.remote.setMode('pro-cross-project',{selectedProjectIds:['p_beta']});await f.remote.setSegment(2);await f.remote.setPage(16);await f.remote.setInventoryPage('pending',15);
 await f.remote.setMode('native');const before=f.calls.length;await f.remote.resumePro();
 const calls=f.calls.slice(before),page=calls.find(c=>c.action==='view'&&c.payload.op==='page');
 assert.equal(page.payload.mode,'pro-cross-project');assert.deepEqual(page.payload.selectedProjectIds,['p_beta']);assert.equal(page.payload.segment,2);assert.equal(page.payload.offset,16);assert.equal(page.payload.inventoryOffsets.pending,15);
 assert(!calls.some(c=>c.payload.op==='processing'));assert.equal(f.remote.getStatus().mode,'pro-cross-project');
});
test('clearing a revoked view discards retained Pro cursors before the next explicit resume',async t=>{
 const f=await fixture(t);await f.remote.setSegment(3);await f.remote.setPage(24);await f.remote.setMode('native');f.remote.clear();const before=f.calls.length;await f.remote.resumePro();
 const page=f.calls.slice(before).find(c=>c.action==='view'&&c.payload.op==='page');assert.equal(page.payload.segment,0);assert.equal(page.payload.offset,0);assert.deepEqual(page.payload.selectedProjectIds,[]);
});
