/** Fixed worker provider -> current reader -> pure ACK admission; no real account/network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {prepareSendAckAdmission} from '../../src/runtime/send-ack-admission.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {digest} from '../../src/data/hash.mjs';
const C='33333333-3333-4333-8333-333333333333',NOW=Date.parse('2026-10-15T00:00:00Z');
const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1','self']),organizationId:'context_'+digest(['chatgpt-context-v1','self','personal'])});
const profile={id:'offline_ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}};
function fixture(t,{principal='self',account='personal',status='fixture-accepted',mutateResult,mutateAcceptance,mutateOnDetail,transport='isolated-fixed-fetch'}={}){
 let wall=NOW,valid=true;const calls=[],abort=new AbortController();
 // Deliberately do not make this mock guard compare every field: the reader must
 // independently pin its readback provenance across separate withCurrent calls.
 const context={scope,conversationId:C,messageIds:['m'],bodyEpoch:1,documentToken:'document',producerToken:'producer',routeEpoch:1,providerProfile:profile.providerProfile,providerTransport:transport,signal:abort.signal,guard:()=>valid};
 const actual=createSessionProvider({origin:'http://127.0.0.1:3210',now:()=>wall,profile:{currentConversationReadEnabled:true,sendAckProfile:profile},fetch:async(url)=>{
  const path=new URL(url).pathname;calls.push(path);
  const body=path==='/api/auth/session'?{user:{id:principal},expires:new Date(NOW+60000).toISOString(),accessToken:'PRIVATE_TOKEN_NEVER_COPY'}:path==='/backend-api/accounts/check/v4-2023-04-27'?{accounts:{[account]:{account:{account_id:account,structure:'personal'}}}}:{conversation_id:C,mapping:{n:{id:'n',parent:null,message:{id:'m',author:{role:'user',id:'self'},status,create_time:1700000000,content:{parts:['PRIVATE_BODY_NEVER_COPY']}}}}};
  if(path.startsWith('/backend-api/conversation/'))mutateOnDetail?.({context,abort,revoke:()=>{valid=false;}});
  const response=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;
 }});
 const provider={readCurrentConversation:async args=>{const result=await actual.readCurrentConversation(args);mutateResult?.(result);return result;},acceptanceFor:result=>{const value=actual.acceptanceFor(result);return mutateAcceptance?mutateAcceptance(value):value;}};
 const reader=createCurrentMetadataReader({enabled:true,provider,now:()=>wall,observations:{withCurrent:async(proof,work)=>{assert.equal(proof,'proof');return work(context);}}});
 t.after(()=>reader.stop());
 const input=({profile,readback,context:current})=>({profile,readback,context:{proofId:'proof',conversationId:current.conversationId,bodyEpoch:current.bodyEpoch,scopeKey:current.scope.key,principalKey:current.scope.accountId,contextKey:current.scope.organizationId,providerProfile:current.providerProfile,providerTransport:current.providerTransport},candidate:{protocol:'vaiwl-send-candidate/1',intentId:'intent',conversationId:C,messageId:'m',operationId:null,stage:'correlated',observedAt:new Date(NOW-1000).toISOString()},intentAt:new Date(NOW-1000).toISOString(),observedAt:new Date(wall).toISOString()});
 return {reader,context,calls,input,abort,read:()=>reader.read('proof'),admit:value=>reader.withReadback(value,'proof','m',args=>prepareSendAckAdmission(input(args))),tick:ms=>{wall+=ms;},revoke:()=>{valid=false;}};
}
for(const transport of ['isolated-fixed-fetch','worker-fixed-fetch'])test(transport+' principal obtains independent worker ACK proof through real provider',async t=>{
 const f=fixture(t,{transport}),value=await f.read();assert.deepEqual(f.calls,['/api/auth/session','/backend-api/accounts/check/v4-2023-04-27','/backend-api/conversation/'+C]);
 const admission=await f.reader.withReadback(value,'proof','m',args=>{assert.equal(args.context.providerTransport,transport);assert.equal(args.readback.transport,'worker-fixed-fetch');assert.equal(args.context.scope,scope);return prepareSendAckAdmission(f.input(args));});
 assert.equal(admission.messageId,'m');assert.equal(admission.actorVerified,true);assert.equal(admission.actorScopeKey,scope.key);assert.equal(admission.ackWitness.kind,'authenticated-message-readback');assert.equal(admission.ackWitness.profileId,profile.id);assert.equal(admission.firstObservedAt,new Date(NOW).toISOString());assert.equal(Object.hasOwn(admission,'sentAt'),false);assert.equal(f.context.providerTransport,transport);assert(!JSON.stringify({value,admission}).includes('PRIVATE_'));
});
test('calibration with real accepted message never grants live ACK capability',async t=>{
 const f=fixture(t),value=await f.reader.readCalibration('proof',{isCurrent:()=>true,signal:new AbortController().signal});assert.equal(f.calls.length,3);await assert.rejects(f.admit(value),/unavailable-send-readback/);
});
for(const field of ['transport','principalKey','contextKey','providerProfile'])test('forged worker result '+field+' is rejected before capability exists',async t=>{
 const f=fixture(t,{mutateResult:value=>{value[field]=field==='transport'?'isolated-fixed-fetch':'foreign';}});await assert.rejects(f.read());assert.equal(f.calls.length,3);
});
for(const field of ['transport','principalKey','contextKey','providerProfile','expiresAt'])test('acceptance '+field+' cannot borrow worker result provenance',async t=>{
 const f=fixture(t,{mutateAcceptance:value=>({...value,[field]:field==='transport'?'isolated-fixed-fetch':field==='expiresAt'?new Date(NOW+59000).toISOString():'foreign'})});await assert.rejects(f.read());assert.equal(f.calls.length,3);
});
test('pure admission rejects forged isolated readback even for isolated principal',async t=>{
 const f=fixture(t),value=await f.read();await f.reader.withReadback(value,'proof','m',args=>{const input=f.input(args);input.readback={...input.readback,transport:'isolated-fixed-fetch'};assert.throws(()=>prepareSendAckAdmission(input),/invalid-send-ack-admission/);});
});
test('cloned metadata and different proof cannot acquire private readback association',async t=>{
 const f=fixture(t),value=await f.read();await assert.rejects(f.admit(structuredClone(value)),/unavailable-send-readback/);await assert.rejects(f.reader.withReadback(value,'other-proof','m',()=>assert.fail()),/unavailable-send-readback/);
});
for(const [field,next]of [['providerTransport','worker-fixed-fetch'],['providerTransport','unknown'],['providerProfile','foreign'],['bodyEpoch',2],['routeEpoch',2],['documentToken','new-document'],['producerToken','new-producer'],['conversationId','different'],['messageIds',[]],['scope',{...scope,accountId:'principal_'+'f'.repeat(64)}],['scope',{...scope,organizationId:'context_'+'e'.repeat(64)}],['scope',{...scope,key:'other-scope'}]])test('readback rejects changed current '+field+' '+JSON.stringify(next),async t=>{
 const f=fixture(t),value=await f.read();f.context[field]=next;await assert.rejects(f.admit(value),/stale-send-readback/);
});
for(const action of ['revoke','abort','stop','expire'])test(action+' invalidates original readback',async t=>{
 const f=fixture(t),value=await f.read();if(action==='revoke')f.revoke();if(action==='abort')f.abort.abort();if(action==='stop')f.reader.stop();if(action==='expire')f.tick(60000);await assert.rejects(f.admit(value));
});
for(const action of ['transport','body','revoke','abort','stop','expire'])test('post-callback '+action+' invalidates readback return',async t=>{
 const f=fixture(t),value=await f.read();await assert.rejects(f.reader.withReadback(value,'proof','m',async args=>{const admission=prepareSendAckAdmission(f.input(args));await Promise.resolve();if(action==='transport')f.context.providerTransport='worker-fixed-fetch';if(action==='body')f.context.bodyEpoch++;if(action==='revoke')f.revoke();if(action==='abort')f.abort.abort();if(action==='stop')f.reader.stop();if(action==='expire')f.tick(60000);return admission;}),/stale-send-readback/);
});
for(const [label,options,count]of [['principal',{principal:'other'},1],['context',{account:'other'},2],['revoked body',{mutateOnDetail:state=>state.revoke()},3],['aborted body',{mutateOnDetail:state=>state.abort.abort()},3]])test('during-read '+label+' prevents capability',async t=>{const f=fixture(t,options);await assert.rejects(f.read());assert.equal(f.calls.length,count);});
test('message presence without accepted ACK state stays pending',async t=>{const f=fixture(t,{status:'pending'}),value=await f.read();assert.equal(value.metadata.messages.length,1);await assert.rejects(f.admit(value),/pending-send-ack/);});
