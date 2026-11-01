/** Real authority, observation owner, fixed provider and reader; only browser/network are doubles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {createHostObservationOwner} from '../../src/runtime/host-observation-owner.mjs';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
const C='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+C,NOW=Date.parse('2026-10-15T00:00:00Z');
async function fixture(t,transport='isolated-fixed-fetch'){
 let serial=0,source=transport;
 const frame={tabId:1,frameId:0,documentId:'doc',actualURL:url,documentLifecycle:'active',incognito:false};
 const authority=createScopeAuthority({provider:{read:async()=>({principalId:'self',contexts:[{id:'personal',kind:'personal'}],providerProfile:'chatgpt-session-v1',transport:source,expiresAt:new Date(NOW+60000).toISOString()})},profile:{id:'binding',singlePersonalDefault:true},now:()=>NOW,makeId:()=>`receipt_${++serial}`});
 assert.equal((await authority.refresh(frame,'bind')).state,'verified');
 const profile={id:'surface',revision:1,currentBody:{rootSelector:'main',conversationIdAttribute:'data-id',messageSelector:'article',messageIdAttribute:'data-id'},urlPolicy:{parse:()=>({kind:'conversation',conversationId:C,navigationURL:url})}};
 const owner=createHostObservationOwner({authority,handshake:{verify:async()=>true,isBound:()=>true,matchesFrame:()=>true},getFrame:async()=>({url,documentId:'doc',documentLifecycle:'active'}),profiles:new Map([[profile.id,profile]]),now:()=>NOW,makeId:()=> 'proof'});
 const proposal={protocol:'vaiwl-host-observation/1',documentToken:'document',producerToken:'producer',routeEpoch:1,localSeq:1,profileId:'surface',profileVersion:1,bodyProofId:null,kind:'current-object',payload:{conversationId:C,messageIds:['m'],association:'explicit-body-id',regionEpoch:1,evidence:{profileId:'surface',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['current-body-explicit-id','current-body-message-ids'],receiptId:null}}};
 assert.equal((await owner.ingest(proposal,{tab:{id:1,incognito:false},documentId:'doc'},{})).state,'accepted');
 const ack={id:'offline_ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['accepted']}};
 const provider=createSessionProvider({now:()=>NOW,profile:{currentConversationReadEnabled:true,sendAckProfile:ack},fetch:async requestURL=>{
  const path=new URL(requestURL).pathname,body=path==='/api/auth/session'?{user:{id:'self'},expires:new Date(NOW+60000).toISOString(),accessToken:'OFFLINE_SECRET'}:path.includes('/accounts/check/')?{accounts:{personal:{account:{account_id:'personal',structure:'personal'}}}}:{conversation_id:C,mapping:{n:{id:'n',parent:null,message:{id:'m',author:{role:'user',id:'self'},status:'accepted'}}}};
  const response=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:requestURL});return response;
 }});
 const reader=createCurrentMetadataReader({observations:owner,provider,enabled:true,now:()=>NOW});t.after(()=>{reader.stop();owner.stop();authority.invalidateAll();});
 return {owner,reader,async renew(next){source=next;const before=authority.peek(frame).grant,result=await authority.revalidate(frame,undefined,{force:true});assert.equal(result.state,'verified');assert.equal(result.grant.id,before.id);assert.equal(result.grant.scopeEpoch,before.scopeEpoch);assert.notEqual(result.grant.principal.id,before.principal.id);assert.equal(result.grant.principal.transport,next);},read:()=>reader.read('proof')};
}
for(const from of ['isolated-fixed-fetch','worker-fixed-fetch'])for(const sampleIntermediate of [false,true])test(`${from} ABA rejects old in-flight observation (intermediate guard sampled=${sampleIntermediate})`,async t=>{
 const f=await fixture(t,from),other=from==='isolated-fixed-fetch'?'worker-fixed-fetch':'isolated-fixed-fetch';
 await assert.rejects(f.owner.withCurrent('proof',async context=>{await f.renew(other);if(sampleIntermediate)assert.equal(context.guard(),false);await f.renew(from);return 'old-work';}),/stale-body-proof/);
 assert.equal(await f.owner.withCurrent('proof',context=>context.providerTransport),from,'fresh work must use the restored source');
});
test('same-source repeated receipt renewal keeps observation valid',async t=>{
 const f=await fixture(t);assert.equal(await f.owner.withCurrent('proof',async context=>{await f.renew('isolated-fixed-fetch');await f.renew('isolated-fixed-fetch');assert.equal(context.guard(),true);return 'fresh';}),'fresh');
});
for(const from of ['isolated-fixed-fetch','worker-fixed-fetch'])test(from+' saved metadata capability cannot survive source ABA between read and withReadback',async t=>{
 const f=await fixture(t,from),value=await f.read(),other=from==='isolated-fixed-fetch'?'worker-fixed-fetch':'isolated-fixed-fetch';await f.renew(other);await f.renew(from);let called=false;
 await assert.rejects(f.reader.withReadback(value,'proof','m',()=>{called=true;return 'old-ack';}));assert.equal(called,false,'stale capability must fail before caller can commit');
 const fresh=await f.read();assert.equal(await f.reader.withReadback(fresh,'proof','m',()=> 'fresh-ack'),'fresh-ack');
});
test('metadata readback rejects source ABA during its async callback',async t=>{
 const f=await fixture(t),value=await f.read();await assert.rejects(f.reader.withReadback(value,'proof','m',async()=>{await f.renew('worker-fixed-fetch');await f.renew('isolated-fixed-fetch');return 'old-ack';}));
});
test('same-source repeated receipt renewal preserves saved metadata capability',async t=>{
 const f=await fixture(t),value=await f.read();await f.renew('isolated-fixed-fetch');await f.renew('isolated-fixed-fetch');assert.equal(await f.reader.withReadback(value,'proof','m',()=> 'valid-ack'),'valid-ack');
});
