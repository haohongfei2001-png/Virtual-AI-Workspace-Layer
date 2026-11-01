import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostObservationOwner} from '../../src/runtime/host-observation-owner.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';

// Unit boundary tests: handshake, scope provider, browser frame lookup and
// repository are explicit mocks, not Chrome or transactional IDB certification.
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
 let elapsed=0,serial=0,pending=null,authorized=true,yields=0,sends=0;const timers=new Map(),calls={page:0,apply:0,scopes:[]};
 const scopeFor=id=>normalizedScope({verified:true,provider:'chatgpt',accountId:id,organizationId:'personal'});
 let scope=scopeFor('A'),grant={id:'grant_A',scopeEpoch:1,expiresAt:new Date(60000).toISOString()};
 const actual={documentId:'A',url:'https://chatgpt.com/c/33333333-3333-4333-8333-333333333333',documentLifecycle:'active'};
 const sender={tab:{id:1,incognito:false},frameId:0,documentId:'A'};
 const profile={id:'test',revision:1,currentBody:{rootSelector:'main',conversationIdAttribute:'data-conversation-id',messageSelector:'[data-message-id]',messageIdAttribute:'data-message-id'},sendIntent:{formSelector:'#composer',editorSelector:'#editor',sendButtonSelector:'#send',enterSends:false},urlPolicy:createURLPolicy()};
 const proposal={protocol:'vaiwl-host-observation/1',documentToken:'doc',producerToken:'producer',routeEpoch:1,localSeq:1,profileId:'test',profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[],membershipClaims:[],coverageClaims:[],detachedHandles:[]}};
 const handshake={verify:async()=>authorized,isBound:()=>true,matchesFrame:(_p,s,f)=>f?.documentId===s.documentId&&f.url===actual.url&&f.documentLifecycle==='active'};
 const dependencies={foregroundReadPending:key=>{yields++;return key===pending;},onSendIntent:async()=>{sends++;},makeId:()=>'proof',handshake,authority:{peek:()=>({state:'verified',grant}),scopeFor:()=>scope},getFrame:async()=>actual,profiles:new Map([['test',profile]]),now:()=>1000+elapsed,elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>timers.delete(id)};
 const page={revision:0,facts:{projects:{},refs:{},membership:{},sources:{}}};
 const repository={page:async(_s,_q,options)=>{calls.page++;assert.equal(options.guard(),true);return page;},apply:async(s,request,options)=>{calls.apply++;calls.scopes.push(s.key);assert.equal(options.guard(),true);assert.ok(owner.gate(s,request));return {ok:true};}};
 let owner;const start=()=>owner=createHostObservationOwner(dependencies);
 const advance=async ms=>{elapsed+=ms;for(const [id,t]of [...timers])if(t.at<=elapsed){timers.delete(id);t.fn();}await drain();};
 return {setPending:s=>pending=s,setAuthorized:b=>authorized=b,get yieldCalls(){return yields;},get sends(){return sends;},dependencies,repository,page,proposal,sender,calls,start,advance,scopeFor,setScope:(s,g)=>{scope=s;grant=g;},get grant(){return grant;},get scope(){return scope;}};
}

test('verified pure surface yields without reads writes or sequence admission, then same proposal accepts',async()=>{
 const f=fixture(),owner=f.start();f.setPending(f.scope.key);
 for(let i=0;i<2;i++)assert.deepEqual(await owner.ingest(f.proposal,f.sender,f.repository),{state:'retry-after',localSeq:1,delayMs:50});
 assert.equal(f.calls.page,0);assert.equal(f.calls.apply,0);
 f.setPending(null);assert.equal((await owner.ingest(f.proposal,f.sender,f.repository)).state,'accepted');assert.equal(f.calls.page,1);assert.equal(f.calls.apply,1);
 assert.equal((await owner.ingest(f.proposal,f.sender,f.repository)).state,'duplicate');assert.equal(f.calls.apply,1);
});
test('wrong authorization rejects before scheduling callback',async()=>{
 const f=fixture(),owner=f.start();f.setPending(f.scope.key);f.setAuthorized(false);
 assert.equal((await owner.ingest(f.proposal,f.sender,f.repository)).state,'rejected');assert.equal(f.yieldCalls,0);assert.equal(f.calls.page,0);assert.equal(f.calls.apply,0);
});
test('another scope foreground window does not suppress this native observation',async()=>{
 const f=fixture(),owner=f.start();f.setPending(f.scopeFor('B').key);
 assert.equal((await owner.ingest(f.proposal,f.sender,f.repository)).state,'accepted');assert.equal(f.calls.apply,1);
});
test('current body and send causality bypass background scheduling without native writes',async()=>{
 const f=fixture(),owner=f.start();f.setPending(f.scope.key);
 const C='33333333-3333-4333-8333-333333333333';
 const evidence=fieldPaths=>({profileId:'test',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths,receiptId:null});
 const body={...f.proposal,kind:'current-object',payload:{conversationId:C,messageIds:['m1'],association:'explicit-body-id',regionEpoch:1,evidence:evidence(['current-body-explicit-id','current-body-message-ids'])}};
 const accepted=await owner.ingest(body,f.sender,f.repository);assert.equal(accepted.state,'accepted',JSON.stringify(accepted));assert.equal(accepted.bodyProofId,'proof');
 const send={...f.proposal,localSeq:2,bodyProofId:accepted.bodyProofId,kind:'send-candidate',payload:{intentId:'intent_2',conversationId:C,messageId:null,operationId:null,stage:'intent',observedAt:new Date(1000).toISOString(),evidence:evidence(['native-send-intent'])}};
 const result=await owner.ingest(send,f.sender,f.repository);assert.equal(result.state,'accepted',JSON.stringify(result));assert.equal(f.sends,1);assert.equal(f.yieldCalls,0);assert.equal(f.calls.page,0);assert.equal(f.calls.apply,0);
});

test('notification classification is owner-derived: surface background, combined current observation immediate',async()=>{
 for(const combined of [false,true]){
  const f=fixture(),notices=[];f.dependencies.onAccepted=(scope,publication)=>notices.push({scope:scope.key,...publication});const owner=f.start();
  let proposal=f.proposal;
  if(combined){f.setPending(f.scope.key);proposal={...proposal,protocol:'vaiwl-host-observation/2',kind:'current-observation',payload:{surface:proposal.payload,body:{conversationId:'33333333-3333-4333-8333-333333333333',messageIds:['m1'],association:'explicit-body-id',regionEpoch:1,evidence:{profileId:'test',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['current-body-explicit-id','current-body-message-ids'],receiptId:null}}}};}
  assert.equal((await owner.ingest(proposal,f.sender,f.repository)).state,'accepted');
  assert.deepEqual(notices,[{scope:f.scope.key,background:!combined}]);
  assert.equal((await owner.ingest(proposal,f.sender,f.repository)).state,'duplicate');assert.equal(notices.length,1);
  assert.equal((await owner.ingest({...proposal,background:!combined,localSeq:2},f.sender,f.repository)).state,'rejected');assert.equal(notices.length,1,'page cannot supply internal notification classification');owner.stop();
 }
});
