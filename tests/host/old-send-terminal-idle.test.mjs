import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostOldSendTerminal} from '../../src/runtime/host-old-send-terminal.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(){
 const c={tabId:1,browserDocumentId:'doc',documentToken:'d',producerToken:'p',routeEpoch:1,conversationId:'C',messageIds:[],scope:{key:'scope',accountId:'self',organizationId:'team'},guard:()=>true,signal:new AbortController().signal};
 const handshake={verify:async()=>true},observations={withCurrent:async(_,fn)=>fn(c)},calls={reads:0,settles:0};
 const options={origin:'http://127.0.0.1:1234',handshake,observations,sendCandidates:{pendingIntent:async()=>true,settle:async(_,value)=>{calls.settles++;return value;}},readOperation:async()=>{calls.reads++;return {operationId:'op',messageId:'new',conversationId:'C',acceptanceState:'failed'};},readBudget:{reserve:async()=>({windowStartedAt:1000})},now:()=>1000,elapsedNow:()=>1000};
 const owner=createHostOldSendTerminal(options),message={type:'HOST_OLD_SEND_OPERATION',documentToken:'d',producerToken:'p',routeEpoch:1,bodyProofId:'proof',intentId:'i',operationId:'op',messageId:'new',observedAt:new Date(1000).toISOString()},sender={tab:{id:1},documentId:'doc'},event={tabId:1,browserDocumentId:'doc',requestId:'request',operationId:'op',messageId:'new',startedAt:1000,stage:'failed'};
 return {owner,handshake,observations,calls,message,sender,event};
}
test('terminal idle remains false for early browser event and unresolved operation',async()=>{
 for(const early of [true,false]){const f=fixture();assert.equal(f.owner.isIdle(),true);
 if(early)await f.owner.terminal(f.event);else await f.owner.intent(f.message,f.sender);
 await f.owner.drain();assert.equal(f.owner.isIdle(),false);assert.equal(f.calls.reads,0);
 if(early)await f.owner.intent(f.message,f.sender);else await f.owner.terminal(f.event);
 await f.owner.drain();assert.equal(f.calls.settles,1);assert.equal(f.owner.isIdle(),true);f.owner.stop();assert.equal(f.owner.isIdle(),false);}
});
for(const operation of ['intent','accepted','observe'])test('terminal idle covers empty-map async '+operation+' window',async()=>{
 const f=fixture(),gate=deferred();
 if(operation==='intent')f.handshake.verify=()=>gate.promise;else f.observations.withCurrent=async(_,fn)=>{await gate.promise;throw Error('denied');};
 const work=operation==='intent'?f.owner.intent(f.message,f.sender):operation==='accepted'?f.owner.intentAccepted('proof','i'):f.owner.observe('proof');
 assert.equal(f.owner.isIdle(),false);await drain();assert.equal(f.owner.isIdle(),false);
 gate.resolve(false);await work;assert.equal(f.owner.isIdle(),true);assert.equal(f.calls.reads,0);f.owner.stop();
});
test('accepted correlation retained after settlement prevents unsafe early idle and is not deleted by checks',async()=>{
 const f=fixture();await f.owner.intentAccepted('proof','i');assert.equal(f.owner.isIdle(),false);
 await f.owner.intent(f.message,f.sender);await f.owner.terminal(f.event);await f.owner.drain();
 assert.equal(f.calls.settles,1);for(let i=0;i<10;i++)assert.equal(f.owner.isIdle(),false);
 assert.equal(f.calls.reads,1);f.owner.invalidateTab(1);assert.equal(f.owner.isIdle(),true);f.owner.stop();
});
test('queued terminal read remains busy after associated records are invalidated',async()=>{
 const f=fixture(),gate=deferred();await f.owner.intent(f.message,f.sender);await f.owner.drain();
 f.observations.withCurrent=async(_,fn)=>{await gate.promise;throw Error('revoked');};
 const work=f.owner.terminal(f.event);await drain();f.owner.invalidateTab(1);assert.equal(f.owner.isIdle(),false);
 gate.resolve();await work;assert.equal(f.owner.isIdle(),true);assert.equal(f.calls.reads,0);f.owner.stop();
});
