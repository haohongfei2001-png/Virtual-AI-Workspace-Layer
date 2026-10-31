import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {createRemoteProController} from '../../src/pro/ui/remote-controller.mjs';
import {projectPublicPage,projectPublicPanel,projectPublicPreview,projectPublicOperationReview,publicVersions,publicStatus} from '../../src/pro/integration/public-frame-dto.mjs';
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
test('damage recovery preview and explicit apply require no fabricated page versions',async t=>{
 const f=await fixture(t);f.remote.clear();const held=f.holdNext(),pending=f.remote.recoveryPreview();held.resolve({ok:true,value:{kind:'pro-preview',protocol:'vaiwl-pro-public/1',previewId:'repair_review',proposal:false,conflicts:[],summary:'可复核的事务记录'}});
 const plan=await pending;assert.deepEqual(f.calls.at(-1).payload,{op:'recovery-preview'});
 const next=f.holdNext(),apply=f.remote.recoveryApply(plan);next.resolve({ok:true,value:{kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied'}});await apply;
 assert.equal(f.calls.at(-1).payload.op,'recovery-apply');assert.equal(f.calls.at(-1).payload.previewId,'repair_review');assert.equal(typeof f.calls.at(-1).payload.operationId,'string');assert(!Object.hasOwn(f.calls.at(-1).payload,'expected'));
});
test('large operation review carries only its opaque worker preview and frozen public version identity',async t=>{
 const f=await fixture(t);await f.remote.dispatch({type:'CREATE_TOPIC',name:'核对主题'});const input=await f.owner.readPrivate(),operation=input.records.at(-1).transaction,expected=f.remote.getSnapshot().versions;
 const held=f.holdNext(),begin=f.remote.beginOperationReview(operation.operationId,{expected});held.resolve({ok:true,value:projectPublicPreview({preview:{state:'ready'},previewId:'opaque_operation_review'})});const review=await begin;
 assert.deepEqual(f.calls.at(-1).payload,{op:'preview',kind:'undo-review',input:{operationId:operation.operationId},expected});assert(!Object.hasOwn(review,'inverseHash'));
 const dto=projectPublicOperationReview({...input,operation,previewId:review.previewId}),pageHold=f.holdNext(),pending=f.remote.loadOperationReview(review,{offset:0,limit:24});pageHold.resolve({ok:true,value:dto});const page=await pending;
 assert.equal(page.operationId,operation.operationId);assert.deepEqual(f.calls.at(-1).payload,{op:'operation-review',previewId:review.previewId,offset:0,limit:24,expected});assert(!Object.hasOwn(page,'inverse'));assert(!Object.hasOwn(page,'patch'));
});
test('operation-review pages cannot cross preview, operation, cursor or current version identities',async t=>{
 const f=await fixture(t);await f.remote.dispatch({type:'CREATE_TOPIC',name:'页面身份'});const input=await f.owner.readPrivate(),operation=input.records.at(-1).transaction,review={previewId:'r',operationId:operation.operationId,expected:f.remote.getSnapshot().versions},base=projectPublicOperationReview({...input,operation,previewId:'r'});
 for(const mutate of [x=>{x.previewId='another_review';},x=>{x.operationId='another_operation';},x=>{x.versions.reviewId='0'.repeat(64);},x=>{x.versions.authorizationEpoch++;}]){const dto=structuredClone(base);mutate(dto);const held=f.holdNext(),pending=f.remote.loadOperationReview(review);held.resolve({ok:true,value:dto});await assert.rejects(pending,/operation-review/);}
 const held=f.holdNext(),pending=f.remote.loadOperationReview(review);await f.remote.refresh({force:true});held.resolve({ok:true,value:base});await assert.rejects(pending,/stale-pro-operation-review/);
});
test('lost structure and repair replies reuse one intent ID on explicit retry and never issue a second write',async t=>{
 const f=await fixture(t),base=projectPublicPage({...await f.owner.readPrivate(),view:f.local.getView(),status:f.local.getStatus()}),saved=new Map(),calls=[];let made=0,writes=0,drop=true,authority='current_scope';
 const remote=createRemoteProController({getIntentEpoch:()=>authority,makeOperationId:()=>`stable_${++made}`,request:async(action,payload)=>{
  calls.push({action,payload});if(action==='view')return {ok:true,value:base};if(action!=='commit')throw Error('unexpected action');const prior=saved.has(payload.operationId);if(!prior){writes++;saved.set(payload.operationId,payload);}
  if(drop){drop=false;return {ok:false,reason:'simulated-lost-reply'};}return {ok:true,value:{kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied',replayed:prior}};
 }});t.after(()=>remote.destroy());await remote.refresh();const review={previewId:'structure_review',expected:remote.getSnapshot().versions};
 await assert.rejects(remote.applyStructure(review),/unavailable/);assert.equal(writes,1);assert.equal(calls.filter(c=>c.action==='commit').length,1);
 await remote.applyStructure(structuredClone(review));assert.equal(writes,1);assert.equal(made,1);assert.equal(calls.filter(c=>c.action==='commit').length,2);
 await remote.applyStructure(review);assert.equal(calls.filter(c=>c.action==='commit').length,2);
 const repair={previewId:'repair_review'};drop=true;await assert.rejects(remote.recoveryApply(repair),/unavailable/);assert.equal(writes,2);remote.clear();await remote.recoveryApply(repair);assert.equal(writes,2);assert.equal(made,2);
 authority='different_scope';await assert.rejects(remote.recoveryApply(repair),/stale-pro-reviewed-intent/);assert.equal(writes,2);
});
test('concurrent reviewed confirmations share one pending request and immutable review fingerprint',async t=>{
 const f=await fixture(t),base=projectPublicPage({...await f.owner.readPrivate(),view:f.local.getView(),status:f.local.getStatus()}),pending=deferred();let commits=0;
 const remote=createRemoteProController({request:async(action)=>{if(action==='view')return {ok:true,value:base};commits++;return pending.promise;}});t.after(()=>remote.destroy());await remote.refresh();const review={previewId:'one_review',expected:remote.getSnapshot().versions};
 const first=remote.applyStructure(review),second=remote.applyStructure(review);assert.equal(commits,1);pending.resolve({ok:true,value:{kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied'}});await Promise.all([first,second]);
 const forged={...review,expected:{...review.expected,reviewId:'0'.repeat(64)}};await assert.rejects(remote.applyStructure(forged),/stale-pro-reviewed-intent/);assert.equal(commits,1);
});
test('direct dialog retries retain the exact command and frozen review intent after a lost receipt',async t=>{
 const f=await fixture(t);let base=projectPublicPage({...await f.owner.readPrivate(),view:f.local.getView(),status:f.local.getStatus()}),made=0,writes=0,drop=true;const saved=new Set(),calls=[];
 const remote=createRemoteProController({makeOperationId:()=>`direct_${++made}`,request:async(action,payload)=>{if(action==='view')return {ok:true,value:base};calls.push(payload);const replayed=saved.has(payload.operationId);if(!replayed){writes++;saved.add(payload.operationId);}if(drop){drop=false;throw Error('reply-lost-after-commit');}return {ok:true,value:{kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied',replayed}};}});t.after(()=>remote.destroy());await remote.refresh();const expected=remote.getSnapshot().versions;
 await assert.rejects(remote.dispatch({type:'CREATE_TOPIC',name:'同一份确认'},{expected}),/reply-lost/);assert.equal(calls.length,1);assert.equal(writes,1);
 await remote.dispatch({name:'同一份确认',type:'CREATE_TOPIC'},{expected:structuredClone(expected)});assert.equal(calls.length,2);assert.equal(calls[0].operationId,calls[1].operationId);assert.equal(writes,1);assert.equal(made,1);
 await remote.dispatch({type:'CREATE_TOPIC',name:'同一份确认'},{expected});assert.equal(calls.length,2);
 await f.local.dispatch({type:'CREATE_TOPIC',name:'新审阅版本'});base=projectPublicPage({...await f.owner.readPrivate(),view:f.local.getView(),status:f.local.getStatus()});await remote.refresh({force:true});await remote.dispatch({type:'CREATE_TOPIC',name:'同一份确认'});assert.equal(made,2);assert.equal(writes,2);
});
test('bounded settings and unresolved-history paging replace the window instead of accumulating visited assets',async t=>{
 const f=await fixture(t);await f.local.dispatch({type:'CREATE_TOPIC',name:'模板'});await f.remote.refresh({force:true});const input=await f.owner.readPrivate(),template=Object.values(input.state.topics)[0];input.state.topics={};
 for(let i=0;i<132;i++){const id='paged_'+i;input.state.topics[id]={...structuredClone(template),id,name:'候选 '+i};}
 for(const offset of [0,24,120]){const held=f.holdNext(),pending=f.remote.loadPanel('settings',null,{offset,limit:24});held.resolve({ok:true,value:projectPublicPanel({...input,status:f.local.getStatus(),kind:'settings',offset,limit:24})});const result=await pending;assert.equal(result.page.offset,offset);assert(Object.keys(f.remote.getState().topics).length<=25);if(offset)assert(!Object.hasOwn(f.remote.getState().topics,'paged_0'));}
 for(let i=0;i<32;i++){const id='legacy_'+i;input.state.legacyResolutions[id]={refId:id,status:'primary-resolution-required',candidates:[],preservedPlacements:[]};input.snapshot.references.push({id,nativeTitle:'旧整理 '+i,available:true,membership:{state:'NONE',evidenceId:'e_'+i,revision:1}});}
 const held=f.holdNext(),pending=f.remote.loadPanel('legacy-resolutions',null,{offset:24,limit:24});held.resolve({ok:true,value:projectPublicPanel({...input,status:f.local.getStatus(),kind:'legacy-resolutions',offset:24,limit:24})});assert.equal((await pending).page.count,8);assert.equal(Object.keys(f.remote.getState().legacyResolutions).length,8);assert(!Object.hasOwn(f.remote.getState().topics,'paged_120'));
 const late=f.holdNext(),old=f.remote.loadPanel('legacy-resolutions',null,{offset:0,limit:24});await f.remote.refresh({force:true});late.resolve({ok:true,value:projectPublicPanel({...input,status:f.local.getStatus(),kind:'legacy-resolutions'})});assert.equal(await old,null);assert.deepEqual(f.remote.getState().legacyResolutions,{});
});
test('a committed mutation waits for the notification refresh that superseded its own page before follow-up reads',{timeout:10000},async t=>{
 const f=await fixture(t),pages=[],started=[deferred(),deferred()];let holdPages=false,settled=false;
 const remote=createRemoteProController({request:async(action,payload)=>{
  if(action==='commit'){await f.local.dispatch(payload.command,{operationId:payload.operationId});holdPages=true;return {ok:true,value:{kind:'pro-result',protocol:'vaiwl-pro-public/1',state:'applied'}};}
  const input={...await f.owner.readPrivate(),view:f.local.getView(),status:f.local.getStatus()};
  if(payload.op==='page'){const value=projectPublicPage(input);if(!holdPages)return {ok:true,value};const held=deferred(),index=pages.length;pages.push({held,value});started[index]?.resolve();return held.promise;}
  return {ok:true,value:projectPublicPanel({...input,...payload})};
 }});t.after(()=>remote.destroy());await remote.refresh();const write=remote.dispatch({type:'CREATE_TOPIC',name:'保留后续核对'}).then(value=>{settled=true;return value;});
 await started[0].promise;const notification=remote.refresh({force:true});await started[1].promise;pages[0].held.resolve({ok:true,value:pages[0].value});await new Promise(resolve=>setImmediate(resolve));const settledBeforeNotification=settled;
 pages[1].held.resolve({ok:true,value:pages[1].value});await Promise.all([write,notification]);assert.equal(settledBeforeNotification,false,'write facade must not start a follow-up panel on a superseded page');
 const panel=await remote.loadPanel('legacy-resolutions',null,{offset:0,limit:24});assert.equal(panel.panel,'legacy-resolutions');assert.deepEqual(panel.versions,remote.getSnapshot().versions);
});
