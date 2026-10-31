import test from 'node:test';import assert from 'node:assert/strict';
import {createHostSendAckOwner} from '../../../src/runtime/host-send-ack-owner.mjs';
import {normalizedScope} from '../../../src/b1/identity.mjs';
function fixture(){
 let wall=1000,valid=true;const profile={id:'ack',revision:1,providerProfile:'session'},scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'self',organizationId:'personal'}),signal=new AbortController().signal;
 const input={admission:{conversationId:'C',messageId:'M',actorScopeKey:scope.key,actorVerified:true,firstObservedAt:new Date(1000).toISOString(),candidateInterval:{from:new Date(0).toISOString(),through:new Date(1000).toISOString()},clockBasis:'local-bounded',ackWitness:{kind:'authenticated-message-readback',profileId:'ack',profileVersion:1,semanticFingerprint:'a'.repeat(64)}},context:{scope,conversationId:'C',providerProfile:'session',signal},guard(){if(!valid)throw Error('revoked');}};
 let owner;const requests=[],repo={async page(){return {revision:0,evidence:{sources:{},hints:{}}};},async apply(s,r,options){assert(owner.gate(s,r));assert.equal(owner.gate(s,structuredClone(r)),null);assert.equal(options.guard(),true);requests.push(r);return {ok:true};}};
 owner=createHostSendAckOwner({evidenceRepository:()=>repo,profileFor:()=>profile,now:()=>wall});return {owner,input,profile,repo,requests,tick(value){wall=value;},revoke(){valid=false;}};
}
// The independent oracle is message identity, never a production hash formula.
// currentLeaf is an adversarial caller-context field: it must have no effect.
test('ACT-06/11 current leaf cannot change durable event key',async()=>{
 const f=fixture();f.input.context.currentLeaf='user-node';await f.owner.consume(f.input);
 f.input.context.currentLeaf='assistant-node';await f.owner.consume(f.input);
 assert.equal(f.requests.length,2);assert.equal(f.requests[0].batch.hints[0].eventKey,f.requests[1].batch.hints[0].eventKey);
 assert.equal(f.requests[0].batch.hints[0].messageId,'M');
});
