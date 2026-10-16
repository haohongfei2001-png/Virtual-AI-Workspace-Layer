import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSendCorrelator} from '../../src/host/send-correlator.mjs';
import {parseConversationMetadata} from '../../src/host/conversation-metadata.mjs';
import {digest} from '../../src/data/hash.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {assertJ4BeforeNativeRecovery,j4FixtureLineage} from './j4-before-native-recovery.mjs';

test('real parser and correlator restart cannot reconstruct accepted local intent or ACK from existing message',()=>{
 const binding={scopeKey:'scope',documentToken:'doc',producerToken:'producer',routeEpoch:1,bodyEpoch:1,conversationId:'c1'},node=(id,parent)=>({id,parent,message:{id,author:{role:'user',id:'principal'},create_time:100,status:'fixture-accepted',content:{parts:['fixture']}}});
 const parse=mapping=>parseConversationMetadata({conversationId:'c1',principalId:'principal',payload:JSON.stringify({conversation_id:'c1',mapping})}),initial=parse({a:node('a',null)}),accepted=parse({a:node('a',null),b:node('b','a')});
 const original=createSendCorrelator({now:()=>1000});original.bind(binding);assert.deepEqual(original.observe(initial),[]);assert(original.intent({intentId:'one',kind:'send',isComposing:false}));assert.equal(original.observe(accepted)[0].messageId,'b');original.stop();
 const reopened=createSendCorrelator({now:()=>1100});reopened.bind({...binding,documentToken:'new-doc',producerToken:'new-producer'});assert.equal(reopened.pendingIntent('one'),null);assert.deepEqual(reopened.observe(accepted),[]);assert.deepEqual(reopened.observe(accepted),[]);assert.equal(reopened.pendingIntent('one'),null);
});
function fixture(){
 const sent={id:'accepted-message',author:'independent-native-author',at:'2026-10-17T00:00:00.123Z'},scope={provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1',sent.author]),organizationId:'context-team'},scopeKey=JSON.stringify([scope.provider,scope.accountId,scope.organizationId]),conversationId='conversation';
 const event={id:'historical-event',conversationId,messageId:sent.id,actorVerified:true,actorScopeKey:scopeKey,role:'user',kind:'new-send',sendState:'committed',sentAt:sent.at,precision:'millisecond',revoked:false,branchId:'lineage_'+'a'.repeat(64),sourceId:'history-source',generation:'one',observedAt:'2026-10-17T00:00:01.000Z'};
 return {sent,scope,conversationId,expectedLineage:'lineage_'+'a'.repeat(64),title:'Original native title',facts:{scopeKey,operationId:'aborted-native',evidenceOperationId:'aborted-evidence'},state:{ref:{id:conversationId,nativeTitle:'Original native title',availability:'available',sourceId:'native'},nativeSources:{native:{revoked:false,channel:'host-dom'}},evidence:{scopeKey,events:{event},hints:{},sources:{'history-source':{revoked:false,channel:'host-evidence',codecVersion:2,profileId:'offline-original-send-v1',generation:'one'}}},pending:[],receipts:[]},raw:{rows:{native_operations:[]}},nativeAccepts:2,expectedAccepts:2};
}
test('original strict event with independently expected author/time and no aborted receipts is a valid reobservation',()=>{const f=fixture(),event=assertJ4BeforeNativeRecovery(f);assert.deepEqual(event,f.state.evidence.events.event);assert.notEqual(event,f.state.evidence.events.event);assertJ4BeforeNativeRecovery({...f,priorEvent:event});});
for(const [key,value]of [['actorVerified',false],['actorScopeKey','other'],['role','assistant'],['kind','edit'],['sendState','pending'],['sentAt','2026-10-17T01:00:00.123Z'],['precision','second'],['revoked',true],['branchId',null],['branchId','lineage_'+'b'.repeat(64)],['generation','other']])test('strict event rejects '+key,()=>{const f=fixture();f.state.evidence.events.event[key]=value;assert.throws(()=>assertJ4BeforeNativeRecovery(f));});
for(const [label,mutate]of [
 ['different author',f=>f.sent.author='other'],['unknown original time',f=>f.sent.at=null],['wrong native title',f=>f.state.ref.nativeTitle='stale'],['revoked native source',f=>f.state.nativeSources.native.revoked=true],['duplicate event',f=>f.state.evidence.events.other={...f.state.evidence.events.event}],['no event',f=>f.state.evidence.events={}],['fabricated local hint',f=>f.state.evidence.hints.x={messageId:f.sent.id}],['pending revived',f=>f.state.pending.push({})],['old native receipt',f=>f.raw.rows.native_operations.push({key:JSON.stringify([f.facts.scopeKey,f.facts.operationId])})],['old evidence receipt',f=>f.raw.rows.native_operations.push({key:JSON.stringify([freeEvidenceKey(f.facts.scopeKey),f.facts.evidenceOperationId])})],['other continuation for same message',f=>f.state.receipts.push({continuation:{evidence:{batch:{hints:[{messageId:f.sent.id}]}}}})],['send replay',f=>f.nativeAccepts++],['revoked evidence source',f=>f.state.evidence.sources['history-source'].revoked=true],['wrong historical profile',f=>f.state.evidence.sources['history-source'].profileId='other']
])test('reobservation rejects '+label,()=>{const f=fixture();mutate(f);assert.throws(()=>assertJ4BeforeNativeRecovery(f));});
test('second authenticated read must preserve the whole original event including observation time',()=>{const f=fixture(),prior=assertJ4BeforeNativeRecovery(f);f.state.evidence.events.event.observedAt='2026-10-17T00:00:02.000Z';assert.throws(()=>assertJ4BeforeNativeRecovery({...f,priorEvent:prior}),/changed-on-reopen/);});
test('integration gives only before-native the strict event oracle, retaining submitted continuation recovery',async()=>{
 const s=await readFile(new URL('./j4-joint-interruption.mjs',import.meta.url),'utf8'),runner=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');
 assert.equal(s.split('assertJ4BeforeNativeRecovery({').length-1,2);assert(s.includes('priorEvent:event'));assert(s.includes("noOriginalTimeProfile:'NOT_COVERED'"));assert(s.includes('previousGrant:freshGrant'));assert(s.includes("v.receipts.filter(r=>r.operationId===pending.operationId)"));assert(s.includes("'same-joint-operation-complete-after-worker-restart'"));assert(s.includes('assert.deepEqual(await evidenceReceipt(pending),committedReceipt)'));assert(s.includes('Object.values(peer.evidence.events).filter(e=>e.messageId===sent.id).length,0'));assert(runner.includes("'j4-before-native-recovery.mjs'"));
});


test('independent fixture lineage is the root-to-target chain, excluding newer leaves',()=>{
 const rows=[{id:'root',parent:null},{id:'parent',parent:'root'},{id:'target',parent:'parent'},{id:'later',parent:'target'}];
 // Literal independently calculated SHA256 for canonical [conversation, chain].
 assert.equal(j4FixtureLineage(rows,'conversation','target'),'lineage_6b6db580591921b4d229cde3139ca986e6af70dd812b6c6c46bde7789109132a');
 assert.equal(j4FixtureLineage([...rows].reverse(),'conversation','target'),'lineage_6b6db580591921b4d229cde3139ca986e6af70dd812b6c6c46bde7789109132a');
 for(const malformed of [[{id:'target',parent:'missing'}],[{id:'target',parent:'target'}],[{id:'target',parent:null},{id:'target',parent:null}]])assert.throws(()=>j4FixtureLineage(malformed,'conversation','target'));
});
