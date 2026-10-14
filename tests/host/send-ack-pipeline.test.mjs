import {createHostContinuationOwner} from '../../src/runtime/host-continuation-owner.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostSendAckOwner} from '../../src/runtime/host-send-ack-owner.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness} from '../b23/contracts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {createHostSendCandidates} from '../../src/runtime/host-send-candidates.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {digest} from '../../src/data/hash.mjs';
const C='11111111-1111-4111-8111-111111111111';
function fixture(consume=null){
 let wall=Date.parse('2026-10-14T00:00:00Z'),proof='p1',added=false,accepted=false,valid=true,author='self';
 const commits=[],requests=[],principal='principal_'+digest(['chatgpt-principal-v1','self']),account='context_'+digest(['chatgpt-context-v1','self','personal']);
 const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:principal,organizationId:account});
 const profile={id:'offline_session',currentConversationReadEnabled:true,sendAckProfile:{id:'offline_ack',revision:1,providerProfile:'offline_session',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}}};
 const provider=createSessionProvider({profile,now:()=>wall,fetch:async(url,options)=>{
  requests.push({url,method:options.method});
  const body=url.endsWith('/api/auth/session')?{user:{id:'self'},expires:'2026-10-14T01:00:00Z',accessToken:'FIXTURE_SECRET'}:url.includes('/accounts/check/')?{accounts:{personal:{account:{account_id:'personal',structure:'personal'}}}}:{id:C,mapping:{n1:{id:'n1',parent:null,message:{id:'m1',author:{id:'self',role:'user'}}},...(added?{n2:{id:'n2',parent:'n1',message:{id:'m2',author:{id:author,role:'user'},...(accepted?{status:'fixture-accepted'}:{}),content:{parts:['PRIVATE_FIXTURE_BODY']}}}}:{})}};
  const response=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;
 }});
 const observations={isCurrentProof:p=>valid&&p===proof,isCurrentProducer:p=>valid&&p==='producer',async withCurrent(p,work){
  if(!valid||p!==proof)throw Error('stale-body-proof');let active=true;const controller=new AbortController();const guard=()=>active&&valid&&p===proof;
  try{const result=await work({scope,documentToken:'document',producerToken:'producer',routeEpoch:1,bodyEpoch:1,conversationId:C,messageIds:added?['m1','m2']:['m1'],providerProfile:profile.id,providerTransport:'worker-fixed-fetch',signal:controller.signal,guard});if(!guard())throw Error('stale-body-proof');return result;}finally{active=false;controller.abort();}
 }};
 const reader=createCurrentMetadataReader({observations,provider,enabled:true,now:()=>wall});
 const service=createHostSendCandidates({observations,reader,enabled:true,now:()=>wall,onAcknowledged:async({admission,guard})=>{guard();await Promise.resolve();guard();if(consume)await consume({admission,context:{scope,conversationId:C,providerProfile:profile.id,signal:new AbortController().signal},guard});commits.push(admission);}});
 return {service,commits,requests,scope,profile,next(){proof='p2';added=true;return proof;},accept(){accepted=true;},otherAuthor(){author='other';},tick(){wall+=1000;},revoke(){valid=false;}};
}
const send={intentId:'send1',kind:'send',isComposing:false};
test('fixed authenticated provider through reader and correlator confirms delayed ACK exactly once',async()=>{
 const f=fixture();await f.service.observe('p1');await f.service.intent('p1',send);const p=f.next();await f.service.observe(p);assert.equal(f.commits.length,0);assert.equal(f.requests.length,6);
 f.accept();f.tick();await f.service.observe(p);assert.equal(f.commits.length,1);assert.equal(f.requests.length,9);assert.equal(f.commits[0].messageId,'m2');assert.equal(f.commits[0].ackWitness.profileId,'offline_ack');assert.equal(f.commits[0].candidateInterval.from,'2026-10-14T00:00:00.000Z');assert.equal(f.commits[0].candidateInterval.through,'2026-10-14T00:00:01.000Z');assert(!/FIXTURE_SECRET|PRIVATE_FIXTURE_BODY/.test(JSON.stringify(f.commits)));
 f.tick();await f.service.observe(p);assert.equal(f.commits.length,1);assert.equal(f.requests.length,9);assert(f.requests.every(r=>r.method==='GET'));
});
test('authenticated other-author readback cannot complete a pending self intent',async()=>{const f=fixture();await f.service.observe('p1');await f.service.intent('p1',send);const p=f.next();await f.service.observe(p);f.accept();f.otherAuthor();f.tick();await f.service.observe(p);assert.equal(f.commits.length,0);});
test('revoked current proof blocks late accepted readback without another fetch',async()=>{const f=fixture();await f.service.observe('p1');await f.service.intent('p1',send);const p=f.next();await f.service.observe(p);f.accept();f.tick();f.revoke();await assert.rejects(f.service.observe(p));assert.equal(f.requests.length,6);assert.equal(f.commits.length,0);});

test('offline authenticated ACK persists native source and pending continuation atomically in MOCK_IDB',async t=>{
 const h=await harness(new MockIDBFactory(),{seed:false});t.after(()=>h.close());let owner;const f=fixture(input=>owner.consume(input));const native=new NativeRepository({baseRepository:h.base,workspaceRepository:h.repo,hostObservationGate:(scope,request)=>owner.gate(scope,request),clock:()=> '2026-10-14T00:00:01.000Z'});
 owner=createHostSendAckOwner({nativeRepository:()=>native,profileFor:id=>id===f.profile.sendAckProfile.id?f.profile.sendAckProfile:null,now:()=>Date.parse('2026-10-14T00:00:01Z')});
 await f.service.observe('p1');await f.service.intent('p1',send);const p=f.next();await f.service.observe(p);assert.deepEqual(await native.listContinuations(f.scope),[]);f.accept();f.tick();await f.service.observe(p);const rows=await native.listContinuations(f.scope);assert.equal(rows.length,1);assert.equal(rows[0].state,'pending-evidence');assert.equal(rows[0].evidence.batch.hints[0].messageId,'m2');assert.equal(rows[0].admission.profileId,'offline_ack');assert.equal((await native.read(f.scope)).revision,1);assert.equal(f.commits.length,1);
 f.tick();await f.service.observe(p);assert.deepEqual(await native.listContinuations(f.scope),rows);
 let drainer;const evidence=new FreeEvidenceRepository({baseRepository:h.base,clock:()=> '2026-10-14T00:00:01.000Z',hostObservationGate:(scope,request)=>drainer.admission(scope,request)});
 drainer=createHostContinuationOwner({nativeRepository:native,evidenceRepository:evidence,profileFor:id=>id===f.profile.sendAckProfile.id?f.profile.sendAckProfile:null});
 const args={scope:f.scope,guard:()=>true,profileId:f.profile.sendAckProfile.id,profileVersion:1};
 const drained=await drainer.drain(args);assert.equal(drained.state,'complete',JSON.stringify(drained));assert.deepEqual(await native.listContinuations(f.scope),[]);
 const state=await evidence.read(f.scope);assert.equal(Object.keys(state.hints).length,1);assert.equal(Object.values(state.hints)[0].messageId,'m2');assert.equal((await drainer.drain(args)).state,'idle');assert.deepEqual(await evidence.read(f.scope),state);
});
