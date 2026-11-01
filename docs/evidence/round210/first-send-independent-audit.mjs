import {createSharedHostReadBudget} from '../../../src/runtime/shared-host-read-budget.mjs';
import {ScopeRepository} from '../../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../../../tests/b23/mock-idb.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createHostFirstSend} from '../../../src/runtime/host-first-send.mjs';
import {digest} from '../../../src/data/hash.mjs';import {normalizedScope} from '../../../src/b1/identity.mjs';
function fixture(options={}){const principalKey='principal_'+digest(['chatgpt-principal-v1','user']),contextKey='context_'+digest(['chatgpt-context-v1','user','account']),scope=normalizedScope({verified:true,provider:'chatgpt',accountId:principalKey,organizationId:contextKey}),accepted=[];let wall=1000,elapsed=1000,valid=true,home=true;
 const context={tabId:1,browserDocumentId:'doc',scopeGrantId:'grant-new',scopeEpoch:2,scope,providerProfile:'chatgpt-session-v1',providerTransport:'worker-fixed-fetch',documentToken:'docToken',producerToken:'producer',routeEpoch:2,conversationId:'newC',messageIds:['message'],bodyEpoch:1,guard:()=>valid,signal:new AbortController().signal};
 const mapping={operationId:'op',messageId:'message',conversationId:'newC',acceptanceState:'accepted'},readback={proofId:'proof',conversationId:'newC',bodyEpoch:1,principalKey,contextKey,providerProfile:'chatgpt-session-v1',transport:'worker-fixed-fetch',expiresAt:new Date(60000).toISOString(),message:{messageId:'message',mappingNodeId:'node',role:'user',authorPrincipalKey:principalKey,lineage:{kind:'derived',nodeIds:['node'],fingerprint:digest(['newC',['node']])},acceptanceState:'fixture-accepted'}},ackProfile={id:'ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}};
 const owner=createHostFirstSend({origin:'http://127.0.0.1:1',readBudget:createSharedHostReadBudget({repository:new ScopeRepository({indexedDB:options.indexedDB??new MockIDBFactory()}),now:()=>wall}),handshake:options.handshake??{capture:()=>valid&&home?{tabId:1,documentId:'doc',url:'http://127.0.0.1:1/'}:null,captureDeparture:()=>valid?{tabId:1,documentId:'doc',url:'http://127.0.0.1:1/',expiresAt:new Date(60000).toISOString()}:null,matchesCapture:()=>valid,verify:async()=>valid,matchesFrame:()=>valid},authority:{scopeFor:()=>scope,peek:()=>({state:'verified',grant:{id:'grant'}})},getFrame:async()=>({url:'http://127.0.0.1:1/',documentId:'doc',documentLifecycle:'active'}),observations:{withCurrent:async(p,fn)=>fn(context)},reader:{read:async()=>({}),withReadback:async(v,p,m,fn)=>fn({profile:ackProfile,readback,guard:()=>{if(!valid)throw Error();}})},readOperation:options.readOperation??(async()=>mapping),onAcknowledged:async x=>{x.guard();accepted.push(x.admission);},now:()=>wall,elapsedNow:()=>elapsed});
 const message={type:'HOST_FIRST_SEND_INTENT',documentToken:'docToken',producerToken:'producer',routeEpoch:1,intentId:'intent',operationId:'op',messageId:'message',observedAt:new Date(1000).toISOString()},sender={tab:{id:1,incognito:false}},submit={tabId:1,browserDocumentId:'doc',requestId:'request',operationId:'op',messageId:'message',startedAt:1000};
 return {owner,message,sender,submit,accepted,context,mapping,readback,time:(w,e)=>{wall=w;elapsed=e;},invalidate:()=>valid=false,leaveHome:()=>home=false};
}
test('audit: completed POST arriving while intent verification awaits is not lost',async()=>{
 const f=fixture();const accepting=f.owner.intent(f.message,f.sender);
 f.owner.submit(f.submit);
 assert.deepEqual(await accepting,{ok:true});
 f.owner.navigate({navigatedAt:1000,tabId:1,browserDocumentId:'doc',url:'http://127.0.0.1:1/c/newC'});await f.owner.observe('proof');assert.equal(f.accepted.length,1);
});

test('audit: first-send readbacks obey scope-wide 12 request budget',async()=>{
 let reads=0;const f=fixture({readOperation:async({operationId})=>{reads++;return {operationId,messageId:'m'+operationId,conversationId:'oldC',acceptanceState:'accepted'};}});
 for(let n=0;n<13;n++){
  const operationId='op'+n,messageId='m'+operationId;
  assert.equal((await f.owner.intent({...f.message,intentId:'intent'+n,operationId,messageId},f.sender)).ok,true);
  assert.equal(f.owner.submit({...f.submit,operationId,messageId,requestId:'req'+n}),true);
 }
 f.owner.navigate({navigatedAt:1000,tabId:1,browserDocumentId:'doc',url:'http://127.0.0.1:1/c/newC'});await f.owner.observe('proof');assert.ok(reads<=12,`mapping reads = ${reads}`);
});

test('audit: completion and navigation before intent delivery retain exact correlation',async()=>{const f=fixture();f.owner.submit(f.submit);f.owner.navigate({navigatedAt:1000,tabId:1,browserDocumentId:'doc',url:'http://127.0.0.1:1/c/newC'});assert.deepEqual(await f.owner.intent(f.message,f.sender),{ok:true});await f.owner.observe('proof');assert.equal(f.accepted.length,1);});
for(const mode of ['revoke','second-hop','grant-change','epoch-change'])test('audit: '+mode+' cannot resume pending ACK',async()=>{const f=fixture();await f.owner.intent(f.message,f.sender);f.owner.submit(f.submit);f.owner.navigate({navigatedAt:1000,tabId:1,browserDocumentId:'doc',url:'http://127.0.0.1:1/c/newC'});f.mapping.conversationId='other';await f.owner.observe('proof');if(mode==='revoke')f.owner.invalidateTab(1);if(mode==='second-hop')f.owner.navigate({navigatedAt:1000,tabId:1,browserDocumentId:'doc',url:'http://127.0.0.1:1/c/newC'});if(mode==='grant-change')f.context.scopeGrantId='new-grant';if(mode==='epoch-change')f.context.scopeEpoch++;f.mapping.conversationId='newC';await f.owner.observe('proof');assert.equal(f.accepted.length,0);});
test('audit: independent owner reconstruction preserves aggregate GET ceiling',async()=>{let calls=0;const indexedDB=new MockIDBFactory();for(let batch=0;batch<2;batch++){const f=fixture({indexedDB,readOperation:async({operationId})=>{calls++;return{operationId,messageId:'m'+operationId,conversationId:'elsewhere',acceptanceState:'accepted'};}});for(let i=0;i<8;i++){const operationId=`op_${batch}_${i}`,messageId='m'+operationId;assert.equal((await f.owner.intent({...f.message,intentId:operationId,operationId,messageId},f.sender)).ok,true);f.owner.submit({...f.submit,operationId,messageId,requestId:operationId});}f.owner.navigate({navigatedAt:1000,tabId:1,browserDocumentId:'doc',url:'http://127.0.0.1:1/c/newC'});await f.owner.observe('proof');f.owner.stop();}assert.equal(calls,12);});
import {createHostDocumentHandshake} from '../../../src/b1/host-document-handshake.mjs';
for(const mode of ['success','revoke','second-hop','forged-token','wrong-document','expired'])test('audit real handshake delayed IPC '+mode,async()=>{
 let seq=0;const origin='http://127.0.0.1:1';const h=createHostDocumentHandshake({extensionId:'ext',getFrame:async()=>({documentId:'doc',url:origin+'/',documentLifecycle:'active'}),allowedURL:u=>u.startsWith(origin+'/'),now:()=>1000,elapsedNow:()=>1000,makeId:()=> 'token'+(++seq)});
 const sender={id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:'doc',documentLifecycle:'active',url:origin+'/'};
 const bound=await h.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender);assert.equal(bound.ok,true);
 const f=fixture({handshake:h});Object.assign(f.message,{documentToken:bound.binding.documentToken,producerToken:bound.binding.producerToken,routeEpoch:bound.binding.routeEpoch});
 f.owner.submit(f.submit);assert.equal(f.owner.navigate({navigatedAt:1000,tabId:1,browserDocumentId:'doc',url:origin+'/c/newC'}),true);h.invalidate({tabId:1});
 if(mode==='revoke')f.owner.invalidateTab(1);if(mode==='second-hop')f.owner.navigate({navigatedAt:1000,tabId:1,browserDocumentId:'doc',url:origin+'/c/other'});if(mode==='forged-token')f.message.producerToken='forged';if(mode==='wrong-document')sender.documentId='doc-other';if(mode==='expired')f.time(31000,31000);
 const result=await f.owner.intent(f.message,sender);await f.owner.observe('proof');assert.equal(result.ok,mode==='success');assert.equal(f.accepted.length,mode==='success'?1:0);
});
test('audit: submillisecond POST begins in same Date.now tick as departure',async()=>{const f=fixture();f.owner.submit({...f.submit,startedAt:1000.5});f.owner.navigate({navigatedAt:1000.8,tabId:1,browserDocumentId:'doc',url:'http://127.0.0.1:1/c/newC'});f.leaveHome();await f.owner.intent(f.message,f.sender);await f.owner.observe('proof');assert.equal(f.accepted.length,1);});
