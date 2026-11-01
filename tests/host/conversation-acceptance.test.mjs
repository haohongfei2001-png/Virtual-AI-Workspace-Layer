import test from 'node:test';
import assert from 'node:assert/strict';
import {extractConversationAcceptance} from '../../src/host/conversation-acceptance.mjs';
import {digest} from '../../src/data/hash.mjs';
const profile=()=>({id:'offline_ack',revision:1,providerProfile:'fixed_provider',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}});
const payload=()=>({id:'C',mapping:{N:{id:'N',parent:null,message:{id:'M',author:{role:'user',id:'self'},status:'fixture-accepted',content:{parts:['private body']}}}}});
function extract(value=payload(),extra={}){return extractConversationAcceptance({conversationId:'C',payload:JSON.stringify(value),principalId:'self',profile:profile(),...extra});}
test('explicit accepted self message produces only frozen minimized fields',()=>{
 const result=extract();assert.equal(result.length,1);assert.deepEqual(result[0],{messageId:'M',mappingNodeId:'N',role:'user',authorPrincipalKey:'principal_'+digest(['chatgpt-principal-v1','self']),lineage:{kind:'derived',nodeIds:['N'],fingerprint:digest(['C',['N']])},acceptanceState:'fixture-accepted'});
 assert(Object.isFrozen(result)&&Object.isFrozen(result[0])&&Object.isFrozen(result[0].lineage)&&Object.isFrozen(result[0].lineage.nodeIds));assert(!JSON.stringify(result).includes('private body'));
});
for(const [name,mutate] of [['absent status',m=>delete m.status],['generic status',m=>m.status='accepted'],['other author',m=>m.author.id='other'],['assistant',m=>m.author.role='assistant'],['missing author',m=>delete m.author]])test(name+' cannot establish acceptance',()=>{const p=payload();mutate(p.mapping.N.message);assert.deepEqual(extract(p),[]);});
test('partial lineage and duplicate conflicting messages fail closed',()=>{const p=payload();p.mapping.N.parent='missing';assert.deepEqual(extract(p),[]);const q=payload();q.mapping.X={...structuredClone(q.mapping.N),id:'X'};q.mapping.X.message.status='failed';assert.deepEqual(extract(q),[]);});
test('conversation mismatch, malformed JSON, unconfigured profile and caller metadata reject',()=>{assert.throws(()=>extract(payload(),{conversationId:'other'}));assert.throws(()=>extract(payload(),{payload:'{'}));assert.throws(()=>extract(payload(),{profile:{}}));assert.throws(()=>extract(payload(),{metadata:{state:'candidate'}}));assert.deepEqual(extract(payload(),{principalId:null}),[]);});
test('input accessor is never evaluated',()=>{let calls=0;const x={conversationId:'C',principalId:'self',profile:profile()};Object.defineProperty(x,'payload',{get(){calls++;return '{}';}});assert.throws(()=>extractConversationAcceptance(x));assert.equal(calls,0);});
