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
test('mock document A→B→A cannot admit A observations into B scope',async()=>{
 const f=fixture();let reads=0;
 // verify represents first/last A reads; the owner independently sees B.
 f.dependencies.handshake.verify=async()=>{reads++;return true;};
 f.dependencies.getFrame=async()=>({documentId:'B',url:'https://chatgpt.com/',documentLifecycle:'active'});
 f.setScope(f.scopeFor('B'),{...f.grant,id:'grant_B',scopeEpoch:2});
 const result=await f.start().ingest(f.proposal,f.sender,f.repository);
 assert.equal(result.reason,'host-frame-conflict');assert.equal(reads,1);assert.equal(f.calls.page,0);assert.equal(f.calls.apply,0);
});
test('mock duplicate ACK is scoped to scope key, grant ID and epoch',async()=>{
 for(const change of ['scope','grant','epoch']){
  const f=fixture(),owner=f.start();const first=await owner.ingest(f.proposal,f.sender,f.repository);assert.equal(first.state,'accepted');
  assert.equal((await owner.ingest(f.proposal,f.sender,f.repository)).state,'duplicate');
  const nextScope=change==='scope'?f.scopeFor('B'):f.scope,nextGrant={...f.grant,...(change==='grant'?{id:'grant_B'}:{}),...(change==='epoch'?{scopeEpoch:2}:{})};
  f.setScope(nextScope,nextGrant);const next=await owner.ingest(f.proposal,f.sender,f.repository);
  assert.equal(next.state,'rejected',change);assert.equal(next.reason,'host-producer-scope-changed');assert.equal(f.calls.apply,1);
  const renewed=await owner.ingest({...f.proposal,producerToken:'new_producer'},f.sender,f.repository);assert.equal(renewed.state,'accepted');assert.equal(f.calls.scopes[1],nextScope.key);
 }
});
for(const phase of ['getFrame','page','apply'])test(`mock permanent ${phase} settles at 6 seconds; late completion cannot retain admission`,async()=>{
 const f=fixture(),held=deferred();let options,request,capturedScope;
 if(phase==='getFrame')f.dependencies.getFrame=()=>held.promise;
 else f.repository[phase]=async(s,...args)=>{capturedScope=s;options=args.at(-1);if(phase==='apply')request=args[0];return held.promise;};
 const owner=f.start();let settled=false;
 const pending=owner.ingest(f.proposal,f.sender,f.repository).then(v=>{settled=true;return v;});await drain();
 assert.equal((await owner.ingest(f.proposal,f.sender,f.repository)).state,'retry-after');
 await f.advance(5999);assert.equal(settled,false);await f.advance(1);
 assert.equal((await pending).reason,'host-observation-timeout');
 if(options){assert.equal(options.guard(),false);assert.equal(options.signal.aborted,true);}
 if(request)assert.equal(owner.gate(capturedScope,request),null);
 // A second attempt reaches its dependency instead of being stuck behind busy.
 const fresh=owner.ingest({...f.proposal,localSeq:2},f.sender,f.repository);await drain();
 held.resolve(phase==='getFrame'?{documentId:'A',url:'https://chatgpt.com/',documentLifecycle:'active'}:phase==='page'?f.page:{ok:true});
 assert.equal((await fresh).state,'accepted');await drain();
 assert.equal((await owner.ingest({...f.proposal,localSeq:2},f.sender,f.repository)).state,'duplicate');
});
