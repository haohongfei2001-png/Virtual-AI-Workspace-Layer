import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createJointObservationFixture} from './joint-observation-fixture.mjs';
import {createHostSendCandidates} from '../../src/runtime/host-send-candidates.mjs';
import {currentObservation} from '../../src/host/current-observation-batch.mjs';
import {parseConversationMetadata} from '../../src/host/conversation-metadata.mjs';

// L: real observation/send owners and parser, explicit offline authority,
// MockIDB and synthetic metadata transport. No adapter, shared GET budget or ACK claim.
async function fixture(t){
 let sends,wall=Date.parse('2026-10-14T00:00:00Z'),partial=true,count=1,reads=0;
 const outputs=[];
 const h=await createJointObservationFixture({indexedDB:new MockIDBFactory(),after:f=>t.after(f),initialMessages:['m1'],onNativeDelta:proof=>sends.observe(proof)});
 const reader={read:proof=>h.observations.withCurrent(proof,context=>{
  reads++;const mapping={};for(let i=1;i<=count;i++)mapping['n'+i]={id:'n'+i,parent:i===1?null:'n'+(i-1),message:{id:'m'+i,author:{role:'user',id:'self'}}};
  const metadata=parseConversationMetadata({conversationId:'C',principalId:'self',payload:JSON.stringify({id:'C',mapping})});
  if(partial){metadata.state='partial';metadata.gaps=[{reason:'missing-parent'}];}
  return {state:metadata.state,conversationId:'C',bodyEpoch:context.bodyEpoch,metadata};
 })};
 sends=createHostSendCandidates({observations:h.observations,reader,enabled:true,now:()=>wall,onCandidate:c=>outputs.push(c)});t.after(()=>sends.stop());
 const publish=async()=>{
  const surface=h.surface(),body={...surface,kind:'current-object',payload:{conversationId:'C',messageIds:Array.from({length:count},(_,i)=>'m'+(i+1)),association:'explicit-body-id',regionEpoch:1,evidence:{profileId:'surface',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['current-body-explicit-id','current-body-message-ids'],receiptId:null}}};
  const ack=await h.ingest(currentObservation(body,surface.payload));assert.equal(ack.state,'accepted');return ack;
 };
 return {h,sends,outputs,publish,get reads(){return reads;},full(){partial=false;},append(){count++;},tick(ms){wall+=ms;h.tick(ms);}};
}
const intent=intentId=>({intentId,kind:'send',isComposing:false});
test('same-body combined retry preserves proof and native facts; rejected early intent cannot become correlated',async t=>{
 const f=await fixture(t),first=await f.publish();assert.equal(f.reads,1);
 const native=await f.h.native.read(f.h.scope);
 assert.equal(await f.sends.intent(first.bodyProofId,intent('too-early')),null);
 f.full();f.tick(999);const throttled=await f.publish();assert.equal(throttled.bodyProofId,first.bodyProofId);assert.equal(f.reads,1);
 f.tick(1);const ready=await f.publish();assert.equal(f.reads,2);assert.equal(ready.bodyProofId,first.bodyProofId);assert.equal(ready.bodyEpoch,first.bodyEpoch);
 assert.deepEqual(await f.h.native.read(f.h.scope),native);
 assert.equal(await f.sends.pendingIntent(ready.bodyProofId,'too-early'),null);
 f.append();await f.publish();assert.deepEqual(f.outputs,[],'new baseline cannot resurrect the consumed early gesture');
 const current=await f.publish();assert.equal((await f.sends.intent(current.bodyProofId,intent('later'))).stage,'intent');
 f.append();await f.publish();assert.equal(f.outputs.length,1);assert.equal(f.outputs[0].intentId,'later');assert.equal(f.outputs[0].messageId,'m3');assert.equal(f.outputs[0].stage,'correlated');
 assert.equal((await f.h.free.read(f.h.scope)).revision,0,'candidate-only, no synthetic ACK');
});
test('same-proof partial retries retain the one-second and three-read ceiling across new combined sequences',async t=>{
 const f=await fixture(t),first=await f.publish();
 for(let i=0;i<5;i++){const ack=await f.publish();assert.equal(ack.bodyProofId,first.bodyProofId);}assert.equal(f.reads,1);
 f.tick(1000);await f.publish();assert.equal(f.reads,2);
 f.tick(1000);await f.publish();assert.equal(f.reads,3);
 f.full();f.tick(1000);const last=await f.publish();assert.equal(last.bodyProofId,first.bodyProofId);assert.equal(f.reads,3);
 assert.equal(await f.sends.intent(last.bodyProofId,intent('budget-exhausted')),null);assert.deepEqual(f.outputs,[]);
});
