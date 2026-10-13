import test from 'node:test';
import assert from 'node:assert/strict';
import {parseConversationMetadata} from '../../src/host/conversation-metadata.mjs';
const node=(id,parent=null,patch={})=>({id,parent,message:{id:'m_'+id,author:{role:'user',id:'principal'},create_time:1700000000,content:{parts:['SECRET_BODY']},...patch}});
const parse=(mapping,extra={})=>parseConversationMetadata({conversationId:'c1',principalId:'principal',payload:JSON.stringify({conversation_id:'c1',mapping,...extra})});
test('candidate metadata contains no body, sentAt or author verification; role alone is not self match',()=>{
 const result=parse({a:node('a'),b:node('b','a',{author:{role:'user'}}),c:node('c','b',{author:{role:'assistant',id:'principal'}})});
 assert.equal(result.state,'candidate');assert.equal(result.coverage,'observed-only');assert.deepEqual(result.messages.map(m=>m.selfMatchCandidate),[true,false,false]);assert.equal(result.messages[0].rawCreateTime,1700000000);assert.equal(result.messages[0].precisionCandidate,'unknown');assert(!/SECRET_BODY|sentAt|actorVerified|current_node/.test(JSON.stringify(result)));
});
test('appending assistant leaf and changing current node never change prior root-to-message lineage',()=>{
 const mapping={a:node('a'),b:node('b','a')},before=parse(mapping,{current_node:'b'});mapping.c=node('c','b',{author:{role:'assistant'}});const after=parse(mapping,{current_node:'c'});
 assert.deepEqual(after.messages.slice(0,2),before.messages);assert.deepEqual(after.messages[1].lineage.nodeIds,['a','b']);assert.equal(after.messages[1].lineage.kind,'derived');
});
test('missing parents and cyclic ancestry are partial, with no invented lineage',()=>{
 for(const mapping of [{a:node('a','absent')},{a:node('a','b'),b:node('b','a')}]){const result=parse(mapping);assert.equal(result.state,'partial');assert(result.messages.every(m=>m.lineage===null));assert(result.gaps.some(g=>['missing-parent','lineage-cycle'].includes(g.reason)));}
});
test('same message with conflicting original time is excluded instead of choosing newer timestamp',()=>{
 const result=parse({a:node('a',null,{id:'same',create_time:1}),b:node('b',null,{id:'same',create_time:2})});assert.equal(result.state,'partial');assert.equal(result.messages.length,0);assert(result.gaps.some(g=>g.reason==='message-semantic-conflict'));
});
test('wrong outer conversation is rejected and message-scoped foreign metadata cannot inherit self attribution',()=>{
 assert.throws(()=>parse({}, {conversation_id:'other'}),/conversation-identity-conflict/);assert.throws(()=>parse({}, {id:'other'}),/conversation-identity-conflict/);
 const result=parse({a:node('a',null,{conversation_id:'other'})});assert.equal(result.messages.length,0);assert(result.gaps.some(g=>g.reason==='message-conversation-conflict'));
 const source=parse({a:node('a')}),copy=parseConversationMetadata({conversationId:'c2',principalId:'principal',payload:JSON.stringify({conversation_id:'c2',mapping:{a:node('a')}})});assert.notEqual(source.messages[0].lineage.fingerprint,copy.messages[0].lineage.fingerprint);assert.equal(copy.messages[0].actorVerified,undefined);assert.equal(copy.messages[0].kind,undefined);
});
test('object payload, getters and malformed input are rejected without invoking accessor or toJSON',()=>{
 let reads=0;const payload={get mapping(){reads++;return {};},toJSON(){reads++;return {};}};assert.throws(()=>parseConversationMetadata({conversationId:'c1',principalId:'principal',payload}),/invalid-conversation-json/);assert.equal(reads,0);
 assert.throws(()=>parseConversationMetadata({conversationId:'c1',principalId:'principal',get payload(){reads++;return '{}';}}),/metadata-accessor/);assert.equal(reads,0);
 assert.throws(()=>parseConversationMetadata({conversationId:'c1',principalId:null,payload:'{'}),/invalid-conversation-json/);
});
test('256 message and 10000 mapping node budgets return explicit partial coverage',()=>{
 const mapping=Object.fromEntries(Array.from({length:257},(_,i)=>['n'+i,node('n'+i)])),messages=parse(mapping);assert.equal(messages.messages.length,256);assert(messages.gaps.some(g=>g.reason==='message-limit'));assert.equal(messages.state,'partial');
 const nodes=parse(Object.fromEntries(Array.from({length:10001},(_,i)=>['n'+i,{id:'n'+i,parent:null,message:null}])));assert(nodes.gaps.some(g=>g.reason==='node-limit'));assert.equal(nodes.coverage,'observed-only');
});
test('raw UTF8 8MiB boundary accepts exact and rejects over before parsing',()=>{
 const prefix='{"conversation_id":"c1","mapping":{},"content":"',suffix='"}',size=8*1024*1024;
 const at=prefix+'x'.repeat(size-prefix.length-suffix.length)+suffix;
 assert.equal(parseConversationMetadata({conversationId:'c1',principalId:null,payload:at}).state,'candidate');
 const over=prefix+'界'.repeat(Math.ceil(size/3))+suffix;const result=parseConversationMetadata({conversationId:'c1',principalId:null,payload:over});assert.equal(result.state,'partial');assert.deepEqual(result.gaps,[{reason:'byte-limit'}]);assert.equal(result.messages.length,0);
});
test('structural depth is bounded while opaque message content is skipped',()=>{
 let deep={};for(let i=0;i<34;i++)deep={nested:deep};const result=parse({a:node('a')},{extra:deep});assert.equal(result.state,'partial');assert(result.gaps.some(g=>g.reason==='depth-limit'));
 const content=parse({a:node('a',null,{content:deep})});assert.equal(content.state,'candidate');assert(!JSON.stringify(content).includes('nested'));
});
test('explicit ISO precision remains a candidate and unsupported time types are not coerced',()=>{
 const result=parse({a:node('a',null,{create_time:'2026-10-14T00:00:00Z'}),b:node('b',null,{create_time:'2026-10-14T00:00:00.123Z'}),c:node('c',null,{create_time:{sentAt:1}})});assert.deepEqual(result.messages.map(m=>m.precisionCandidate),['second','millisecond','unknown']);assert.equal(result.messages[2].rawCreateTime,null);assert(result.messages.every(m=>m.sentAt===undefined));
});
test('unknown huge scalar arrays and wide objects hit shared visited/pending budget',()=>{
 for(const extra of [Array(100001).fill(0),Object.fromEntries(Array.from({length:10001},(_,i)=>['v'+i,0]))]){
  const result=parse({a:node('a')},{unknown:extra});assert.equal(result.state,'partial');assert.deepEqual(result.gaps,[{reason:'node-limit'}]);assert.equal(result.messages.length,0);
 }
 // Individual collections fit, but their combined traversal cannot exceed budget.
 const result=parse({}, {unknown:[Array(6000).fill(0),Array(6000).fill(0)]});assert.deepEqual(result.gaps,[{reason:'node-limit'}]);
});
test('private or invalid time text is omitted and reported instead of copied into candidates',()=>{
 for(const time of ['PRIVATE_BODY_IN_TIME','2026-02-30T00:00:00Z','2026-10-14T24:00:00Z','yesterday','2026-10-14']){const result=parse({a:node('a',null,{create_time:time})});assert.equal(result.state,'partial');assert.equal(result.messages[0].rawCreateTime,null);assert.equal(result.messages[0].precisionCandidate,'unknown');assert(result.gaps.some(g=>g.reason==='invalid-create-time'));assert(!JSON.stringify(result).includes(time));}
 const valid=parse({a:node('a',null,{create_time:'2026-10-14T01:02:03.456+08:00'})});assert.equal(valid.messages[0].rawCreateTime,'2026-10-14T01:02:03.456+08:00');
});
