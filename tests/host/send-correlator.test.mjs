import test from 'node:test';import assert from 'node:assert/strict';
import {createSendCorrelator} from '../../src/host/send-correlator.mjs';
import {parseConversationMetadata,parseConversationMessageListMetadata} from '../../src/host/conversation-metadata.mjs';
const binding={scopeKey:'scopeA',documentToken:'docA',producerToken:'producerA',routeEpoch:1,bodyEpoch:1,conversationId:'c1'};
const node=(id,parent=null,patch={})=>({id,parent,message:{id:'m_'+id,author:{role:'user',id:'principal'},content:{parts:['PRIVATE_BODY']},...patch}});
const metadata=mapping=>parseConversationMetadata({conversationId:'c1',principalId:'principal',payload:JSON.stringify({conversation_id:'c1',mapping})});
function fixture(){let time=1000;const c=createSendCorrelator({now:()=>time});c.bind(binding);c.observe(metadata({a:node('a')}));return {c,advance:ms=>time+=ms,intent:(id='i1')=>c.intent({intentId:id,kind:'send',isComposing:false})};}
test('real parser baseline plus one new self-match produces only candidate once, no body/ACK/time proof',()=>{const h=fixture();assert.equal(h.intent().stage,'intent');const batch=metadata({a:node('a'),b:node('b','a')});const rows=h.c.observe(batch);assert.equal(rows.length,1);assert.equal(rows[0].stage,'correlated');assert.equal(rows[0].messageId,'m_b');assert(!/PRIVATE_BODY|sentAt|actorVerified|native-ack|principal|scopeA/.test(JSON.stringify(rows)));assert.deepEqual(h.c.observe(batch),[]);assert.equal(h.intent(),null);});
test('IME/newline/stop/upload/regenerate are not send intent; no baseline does not correlate',()=>{const h=fixture();for(const kind of ['newline','stop','upload','regenerate'])assert.equal(h.c.intent({intentId:'i',kind,isComposing:false}),null);assert.equal(h.c.intent({intentId:'i',kind:'send',isComposing:true}),null);h.c.invalidate();h.c.bind(binding);assert.equal(h.intent(),null);});
test('role alone, foreign author and assistant cannot self-correlate',()=>{for(const author of [{role:'user'},{role:'user',id:'other'},{role:'assistant',id:'principal'}]){const h=fixture();h.intent();assert.deepEqual(h.c.observe(metadata({a:node('a'),b:node('b','a',{author})})),[]);}});
test('partial/gaps/missing lineage discard intents and next complete data only establishes baseline',()=>{const h=fixture();h.intent();assert.deepEqual(h.c.observe(metadata({b:node('b','missing')})),[]);assert.equal(h.intent('i2'),null);assert.deepEqual(h.c.observe(metadata({a:node('a'),b:node('b','a')})),[]);});
test('edited existing message and branch movement do not become new sends',()=>{const h=fixture();h.intent();assert.deepEqual(h.c.observe(metadata({a:node('a',null,{create_time:2})})),[]);assert.deepEqual(h.c.observe(metadata({root:node('root'),a:node('a','root'),b:node('b','a')})),[]);});
test('two concurrent intents or two new user messages are ambiguous and consumed without output',()=>{for(const manyIntents of [true,false]){const h=fixture();h.intent();if(manyIntents)h.intent('i2');const mapping={a:node('a'),b:node('b','a')};if(!manyIntents)mapping.c=node('c','b');assert.deepEqual(h.c.observe(metadata(mapping)),[]);assert.deepEqual(h.c.observe(metadata({...mapping,d:node('d','b')})),[]);}});
test('exact correlation window expiry and clock rollback cannot move observation anchor',()=>{const h=fixture();h.intent();h.advance(30000);assert.deepEqual(h.c.observe(metadata({a:node('a'),b:node('b','a')})),[]);h.advance(-1);assert.throws(()=>h.intent('i2'),/send-clock-invalid/);assert.equal(h.intent('i3'),null);});
for(const field of Object.keys(binding))test('changed binding invalidates old intent: '+field,()=>{const h=fixture();h.intent();h.c.bind({...binding,[field]:typeof binding[field]==='number'?2:'different'});assert.equal(h.intent('i2'),null);assert.deepEqual(h.c.observe(metadata({a:node('a'),b:node('b','a')})),[]);});
test('failure/cancel remove candidate; ACK stage forbidden; stop permanent',()=>{for(const stage of ['failed','cancelled']){const h=fixture();h.intent();assert.equal(h.c.settle({intentId:'i1',stage:'native-ack'}),null);assert.equal(h.c.settle({intentId:'i1',stage}).stage,stage);assert.deepEqual(h.c.observe(metadata({a:node('a'),b:node('b','a')})),[]);h.c.stop();assert.throws(()=>h.c.bind(binding),/stopped/);assert.equal(h.intent('i2'),null);}});
test('pending and replay capacities are bounded without evicting replay protection',()=>{const h=fixture();for(let i=0;i<32;i++)assert(h.intent('i'+i));assert.equal(h.intent('overflow'),null);for(let i=0;i<32;i++)h.c.settle({intentId:'i'+i,stage:'cancelled'});h.c.observe(metadata({a:node('a')}));for(let i=32;i<255;i++){assert(h.intent('i'+i));h.c.settle({intentId:'i'+i,stage:'cancelled'});}assert.equal(h.intent('new'),null);assert.equal(h.intent('i0'),null);});

test('new-ID sibling edit/branch is not an append send candidate',()=>{const h=fixture();h.intent();assert.deepEqual(h.c.observe(metadata({a:node('a'),b:node('b')})),[]);});
test('metadata edit consumes old intent before a later append',()=>{const h=fixture();h.intent();h.c.observe(metadata({a:node('a',null,{create_time:2})}));assert.deepEqual(h.c.observe(metadata({a:node('a',null,{create_time:2}),b:node('b','a')})),[]);});

test('real flat-list parser retires pending legacy intent and cannot authorize a send',()=>{
 const h=fixture();assert(h.intent());
 const flat=parseConversationMessageListMetadata({conversationId:'c1',principalId:'principal',payload:JSON.stringify({conversation_id:'c1',messages:[node('a').message,node('b').message],current_node:'m_b'})});
 assert.deepEqual(h.c.observe(flat),[]);assert.equal(h.c.pendingIntent('i1'),null);assert.equal(h.intent('i2'),null);
 assert.deepEqual(h.c.observe(metadata({a:node('a'),b:node('b','a')})),[]);
 assert.equal(h.c.pendingIntent('i1'),null);assert.equal(h.intent('i1'),null);
});

 test('overflow cannot turn a surviving old intent into an unambiguous send',()=>{
 const h=fixture();for(let i=0;i<32;i++)assert(h.intent('i'+i));
 assert.equal(h.intent('overflow'),null);
 for(let i=0;i<31;i++)h.c.settle({intentId:'i'+i,stage:'cancelled'});
 assert.deepEqual(h.c.observe(metadata({a:node('a'),b:node('b','a')})),[]);
 assert.equal(h.c.pendingIntent('i31'),null);
 assert.equal(h.intent('overflow'),null);
 assert(h.intent('fresh'));
 assert.equal(h.c.observe(metadata({a:node('a'),b:node('b','a'),c:node('c','b')}))[0]?.intentId,'fresh');
 });
