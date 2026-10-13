import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiGrants} from '../../src/host/ui-grants.mjs';
function fixture(options={}){
 let time=1000,id=0;const uiURL='chrome-extension://fixture/ui.html';
 const parent={id:'fixture',tab:{id:1,incognito:false},frameId:0,documentId:'parent',documentLifecycle:'active',url:'https://chatgpt.com/c/fixture'};
 const ui={...parent,frameId:2,documentId:'ui',url:uiURL};
 const frames=new Map([[0,{documentId:'parent',documentLifecycle:'active',url:parent.url,parentFrameId:-1}],[2,{documentId:'ui',documentLifecycle:'active',url:uiURL,parentFrameId:0}]]);
 let scope={id:'scope_grant',scopeKey:'scope_A',scopeEpoch:1,expiresAt:new Date(60000).toISOString()};
 const owner=createUiGrants({extensionId:'fixture',uiURL,getFrame:async({frameId})=>frames.get(frameId),peekScope:()=>scope?{state:'verified',grant:scope}:{state:'unverified'},now:()=>time,makeId:()=>`grant_${++id}`,...options});
 const handle={id:'mount',documentToken:'document_token',regionEpoch:1};owner.registerMount({handle,parent});
 const challenge={nonce:'nonce'};
 const confirm=(nonce=challenge.nonce,extra={})=>owner.confirmParent({sender:parent,mountId:handle.id,documentToken:handle.documentToken,regionEpoch:1,nonce,role:'workspace',...extra});
 const join=(nonce=challenge.nonce,extra={})=>owner.joinUI({sender:ui,nonce,role:'workspace',...extra});
 const pair=async()=>{assert.equal(await join(),null);return confirm();};
 return {challenge,owner,parent,ui,frames,handle,confirm,join,pair,scope,setScope:value=>{scope=value;},tick:value=>{time+=value;}};
}
test('both channel orders issue exact frozen grant; neither channel alone authorizes',async()=>{
 for(const order of ['ui','parent']){const f=fixture();const first=order==='ui'?f.join:f.confirm,second=order==='ui'?f.confirm:f.join;assert.equal(await first(),null);await assert.rejects(f.owner.validate({sender:f.ui,grantId:'nonce',mountId:'mount'}),/ui-grant-expired/);const grant=await second();assert.deepEqual(grant,{id:'grant_1',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope_grant',role:'workspace',expiresAt:new Date(21000).toISOString()});assert.ok(Object.isFrozen(grant));assert.equal(await f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}),grant);}
});
test('scope expiration bounds lease and validation never renews it',async()=>{const f=fixture();f.setScope({...f.scope,expiresAt:new Date(2000).toISOString()});const grant=await f.pair();assert.equal(Date.parse(grant.expiresAt),2000);f.tick(1000);await assert.rejects(f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}),/ui-grant-expired/);});
test('sender extension, frame, active document and private partition are mandatory',async()=>{
 for(const patch of [{id:'page'},{frameId:0},{documentLifecycle:'cached'},{documentId:''},{tab:{id:1,incognito:true}},{url:'chrome-extension://fixture/other.html'}]){const f=fixture();assert.throws(()=>f.join(f.challenge.nonce,{sender:{...f.ui,...patch}}),/invalid-ui-sender/);}
});
test('parent channel rejects mount, token, region and document forgery',()=>{for(const patch of [{mountId:'other'},{documentToken:'forged'},{regionEpoch:2},{sender:{...fixture().parent,documentId:'other'}}]){const f=fixture();assert.throws(()=>f.confirm(f.challenge.nonce,patch),/ui-mount-revoked|ui-mount-mismatch/);}});
test('actual UI parent relation and current document are independently checked',async()=>{for(const patch of [{parentFrameId:9},{documentId:'replacement'},{documentLifecycle:'cached'},{url:'chrome-extension://fixture/other.html'}]){const f=fixture();await f.join();f.frames.set(2,{...f.frames.get(2),...patch});await assert.rejects(f.confirm(),/stale-ui-document/);}});
test('same nonce replay, duplicate channel, role conflict and expired pairing fail closed',async()=>{
 let f=fixture();await f.pair();assert.throws(()=>f.join(),/ui-join-replayed/);
 f=fixture();await f.join();assert.throws(()=>f.join(),/ui-join-conflict/);assert.throws(()=>f.confirm(),/ui-join-replayed/);
 f=fixture();await f.join();assert.throws(()=>f.confirm(f.challenge.nonce,{role:'sidebar'}),/ui-join-replayed/);
 f=fixture();await f.join();f.tick(20000);assert.throws(()=>f.confirm(),/ui-join-replayed/);
});
test('scope epoch, scope key and grant replacement revoke existing authority',async()=>{for(const patch of [{scopeEpoch:2},{scopeKey:'scope_B'},{id:'new_scope_grant'}]){const f=fixture();const grant=await f.pair();f.setScope({...f.scope,...patch});await assert.rejects(f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}),/ui-scope-changed/);}});
test('scope loss denies pairing and grant validation',async()=>{const f=fixture();await f.join();f.setScope(null);assert.throws(()=>f.confirm(),/ui-scope-unverified/);});
test('revoke mount, parent document, UI document and all immediately invalidate grants',async()=>{for(const revoke of [f=>f.owner.revokeMount('mount'),f=>f.owner.revokeDocument('parent'),f=>f.owner.revokeDocument('ui'),f=>f.owner.revokeAll()]){const f=fixture();const grant=await f.pair();revoke(f);await assert.rejects(f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}),/ui-grant-expired/);assert.throws(()=>f.confirm(),/ui-mount-revoked|ui-join-replayed/);}});
test('pending async browser check cannot publish after revoke or scope change',async()=>{for(const change of [f=>f.owner.revokeMount('mount'),f=>f.setScope({...f.scope,scopeEpoch:2})]){let release;const held=new Promise(resolve=>{release=resolve;});let f;f=fixture({getFrame:async({frameId})=>{await held;return f.frames.get(frameId);}});await f.join();const pending=f.confirm();change(f);release();await assert.rejects(pending,/ui-mount-revoked|ui-scope-changed/);}});
test('anonymous capacity is finite and expired keys cannot rejoin',async()=>{const f=fixture({maxEntries:1});await f.join();assert.throws(()=>f.join('different'),/ui-grant-capacity/);f.tick(30000);assert.throws(()=>f.join(),/ui-join-replayed/);});
test('copied caller mount and sender objects cannot mutate recorded binding',async()=>{const f=fixture();await f.join();f.ui.documentId='mutated';f.handle.documentToken='mutated';const grant=await f.confirm(f.challenge.nonce,{documentToken:'document_token'});assert.equal(grant.uiDocumentId,'ui');});

test('UI document revocation during pairing cannot publish a late grant',async()=>{let release;const held=new Promise(resolve=>{release=resolve;});let f;f=fixture({getFrame:async({frameId})=>{await held;return f.frames.get(frameId);}});await f.join();const pending=f.confirm();f.owner.revokeDocument('ui');release();await assert.rejects(pending,/ui-join-expired/);});
test('conflicting role burns nonce instead of allowing later retry',async()=>{const f=fixture();await f.join();assert.throws(()=>f.confirm(f.challenge.nonce,{role:'sidebar'}),/ui-join-replayed/);assert.throws(()=>f.confirm(),/ui-join-replayed/);});
test('4000 renewals reuse one join entry; lease stays bounded by current scope expiry',async()=>{
 const f=fixture({maxEntries:1});f.setScope({...f.scope,expiresAt:new Date(10000000).toISOString()});let grant=await f.pair();
 for(let i=0;i<4000;i++){f.tick(1000);grant=await f.owner.renew({sender:f.ui,grantId:grant.id,mountId:'mount'});assert.equal(Date.parse(grant.expiresAt),21000+(i+1)*1000);}
 assert.throws(()=>f.join(),/ui-join-replayed/);
 f.setScope({...f.scope,expiresAt:new Date(4003000).toISOString()});grant=await f.owner.renew({sender:f.ui,grantId:grant.id,mountId:'mount'});assert.equal(Date.parse(grant.expiresAt),4003000);
});
test('renew refuses expired, revoked, wrong document and changed scope grants',async()=>{
 for(const change of [f=>f.tick(20000),f=>f.owner.revokeMount('mount'),f=>{f.frames.get(2).documentId='replacement';},f=>f.setScope({...f.scope,scopeEpoch:2})]){
  const f=fixture(),grant=await f.pair();change(f);await assert.rejects(f.owner.renew({sender:f.ui,grantId:grant.id,mountId:'mount'}),/ui-grant-expired|stale-ui-document|ui-scope-changed/);
 }
});
test('revoked mount releases paired join capacity; old parent mount and grant cannot revive',async()=>{
 const f=fixture({maxEntries:1}),old=await f.pair();f.owner.revokeMount('mount');
 f.owner.registerMount({handle:{id:'new_mount',documentToken:'new_token',regionEpoch:2},parent:f.parent});
 assert.throws(()=>f.confirm(),/ui-mount-revoked/);
 await assert.rejects(f.owner.renew({sender:f.ui,grantId:old.id,mountId:'mount'}),/ui-grant-expired/);
 await f.join('fresh_key');const grant=await f.confirm('fresh_key',{mountId:'new_mount',documentToken:'new_token',regionEpoch:2});assert.equal(grant.mountId,'new_mount');
});
test('renew waiting for actual browser checks cannot publish after mount revocation',async()=>{
 let hold=false,release;const held=new Promise(resolve=>{release=resolve;});let f;f=fixture({getFrame:async({frameId})=>{if(hold)await held;return f.frames.get(frameId);}});
 const grant=await f.pair();hold=true;const pending=f.owner.renew({sender:f.ui,grantId:grant.id,mountId:'mount'});f.owner.revokeMount('mount');release();await assert.rejects(pending,/ui-grant-revoked|ui-mount-revoked/);
});
test('expired UI-only nonce flood is reclaimed without evicting successfully paired replay protection',async()=>{
 const f=fixture({maxEntries:4});f.setScope({...f.scope,expiresAt:new Date(10000000).toISOString()});await f.pair();
 for(let cycle=0;cycle<100;cycle++){
  for(let i=0;i<3;i++)assert.equal(await f.join(`anonymous_${cycle}_${i}`),null);
  assert.throws(()=>f.join(`overflow_${cycle}`),/ui-grant-capacity/);f.tick(20001);
 }
 // The original consumed key survives many expiration/reclamation cycles.
 assert.throws(()=>f.join(),/ui-join-replayed/);
 assert.equal(await f.join('legitimate_fresh'),null);
 assert.equal((await f.confirm('legitimate_fresh')).role,'workspace');
});
test('expired parent-confirmed pending is never evicted for anonymous WAR traffic',async()=>{
 const f=fixture({maxEntries:1});await f.confirm();f.tick(20001);
 assert.throws(()=>f.join('other_key'),/ui-grant-capacity/);
 assert.throws(()=>f.join(),/ui-join-replayed/);
});
