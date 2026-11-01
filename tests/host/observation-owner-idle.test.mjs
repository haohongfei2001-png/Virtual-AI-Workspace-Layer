import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostObservationOwner} from '../../src/runtime/host-observation-owner.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';

// Unit boundary tests: handshake, scope provider, browser frame lookup and
// repository are explicit mocks, not Chrome or transactional IDB certification.
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
function fixture(){
 let elapsed=0,serial=0;const timers=new Map(),calls={page:0,apply:0,scopes:[]};
 const scopeFor=id=>normalizedScope({verified:true,provider:'chatgpt',accountId:id,organizationId:'personal'});
 let scope=scopeFor('A'),grant={id:'grant_A',scopeEpoch:1,expiresAt:new Date(60000).toISOString()};
 const actual={documentId:'A',url:'https://chatgpt.com/',documentLifecycle:'active'};
 const sender={tab:{id:1,incognito:false},frameId:0,documentId:'A'};
 const profile={id:'test',revision:1,urlPolicy:createURLPolicy()};
 const proposal={protocol:'vaiwl-host-observation/1',documentToken:'doc',producerToken:'producer',routeEpoch:1,localSeq:1,profileId:'test',profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[],membershipClaims:[],coverageClaims:[],detachedHandles:[]}};
 const handshake={verify:async()=>true,isBound:()=>true,matchesFrame:(_p,s,f)=>f?.documentId===s.documentId&&f.url===actual.url&&f.documentLifecycle==='active'};
 const dependencies={handshake,authority:{peek:()=>({state:'verified',grant}),scopeFor:()=>scope},getFrame:async()=>actual,profiles:new Map([['test',profile]]),now:()=>1000+elapsed,elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>timers.delete(id)};
 const page={revision:0,facts:{projects:{},sources:{}}};
 const repository={page:async(_s,_q,options)=>{calls.page++;assert.equal(options.guard(),true);return page;},apply:async(s,request,options)=>{calls.apply++;calls.scopes.push(s.key);assert.equal(options.guard(),true);assert.ok(owner.gate(s,request));return {ok:true};}};
 let owner;const start=()=>owner=createHostObservationOwner(dependencies);
 const advance=async ms=>{elapsed+=ms;for(const [id,t]of [...timers])if(t.at<=elapsed){timers.delete(id);t.fn();}await drain();};
 return {dependencies,repository,page,proposal,sender,calls,start,advance,scopeFor,setScope:(s,g)=>{scope=s;grant=g;},get grant(){return grant;},get scope(){return scope;}};
}
for(const stage of ['verify','page','apply'])for(const outcome of ['resolve','reject'])test('observation '+stage+' work remains nonidle after deadline '+outcome,async()=>{
 const f=fixture(),g=deferred();let entered=false;if(stage==='verify')f.dependencies.handshake.verify=()=>{entered=true;return g.promise;};else f.repository[stage]=()=>{entered=true;return g.promise;};const owner=f.start(),p=owner.ingest(f.proposal,f.sender,f.repository);await drain();assert.equal(entered,true);assert.equal(owner.isIdle(),false);await f.advance(6000);assert.equal((await p).state,'rejected');owner.invalidateDocument('A');assert.equal(owner.isIdle(),false);g[outcome](outcome==='reject'?Error('late'):stage==='verify'?true:stage==='page'?f.page:{ok:true});await drain();assert.equal(owner.isIdle(),true);
});
test('observation stopped owner cannot become idle after late persistence',async()=>{const f=fixture(),g=deferred();f.repository.apply=()=>g.promise;const owner=f.start(),p=owner.ingest(f.proposal,f.sender,f.repository);await drain();owner.stop();assert.equal(owner.isIdle(),false);g.resolve({ok:true});await p;assert.equal(owner.isIdle(),false);});
for(const outcome of ['resolve','reject'])test('current body callback survives outer timeout in idle accounting '+outcome,async()=>{
 const f=fixture(),id='11111111-1111-4111-8111-111111111111',g=deferred();
 f.dependencies.profiles.get('test').currentBody={rootSelector:'main',conversationIdAttribute:'data-id',messageSelector:'article',messageIdAttribute:'data-id'};
 f.dependencies.getFrame=async()=>({documentId:'A',url:'https://chatgpt.com/c/'+id,documentLifecycle:'active'});f.dependencies.handshake.matchesFrame=()=>true;
 f.setScope(f.scope,{...f.grant,principal:{providerProfile:'test',transport:'worker-fixed-fetch'}});
 const owner=f.start(),body={...f.proposal,kind:'current-object',payload:{conversationId:id,messageIds:['m'],association:'explicit-body-id',regionEpoch:1,evidence:{profileId:'test',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['current-body-explicit-id','current-body-message-ids'],receiptId:null}}};
 const ack=await owner.ingest(body,f.sender,f.repository);assert.equal(ack.state,'accepted');let entered=false;const p=owner.withCurrent(ack.bodyProofId,()=>{entered=true;return g.promise;}),checked=assert.rejects(p,/request-timeout/);await drain();assert.equal(entered,true);assert.equal(owner.isIdle(),false);await f.advance(6000);await checked;owner.invalidateDocument('A');assert.equal(owner.isIdle(),false);g[outcome](outcome==='reject'?Error('late-read'):{});await drain();assert.equal(owner.isIdle(),true);
});
