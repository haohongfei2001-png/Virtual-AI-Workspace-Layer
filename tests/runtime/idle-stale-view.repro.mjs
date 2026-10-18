/** L integration: actual binding/UI/view owners and repositories; synthetic browser, provider and MockIDB. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const NOW='2026-10-14T00:00:00Z',url='https://chatgpt.com/';
const drain=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,clock){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'idle-stale-view'});
 const workspaces=new WorkspaceRepository({baseRepository:base,clock:()=>NOW});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>NOW});
 let id=0,localSeq=0;
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'document',documentLifecycle:'active',url};
 const uiURLs={workspace:'chrome-extension://extension/workspace.html',sidebar:'chrome-extension://extension/sidebar.html'};
 const children=Object.fromEntries(Object.entries(uiURLs).map(([role,url],i)=>[role,{...sender,frameId:i+1,documentId:'ui_'+role,url}]));
 const profile={id:'read-binding-reconstruction',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:value=>value,projectId:({container})=>container}})};
 const service=createHostBindingService({
  ...clock,extensionId:'extension',uiURLs,
  getContexts:async({documentIds})=>Object.values(children).filter(c=>documentIds.includes(c.documentId)).map(c=>({contextType:'TAB',documentId:c.documentId,frameId:c.frameId,tabId:1,incognito:false,documentUrl:c.url,documentOrigin:'chrome-extension://extension'})),
  getFrame:async()=>({documentId:'document',documentLifecycle:'active',url}),allowedURL:value=>value===url,
  repository:base,workspaceRepository:workspaces,freeEvidenceRepository:evidence,
  provider:{read:async()=>({principalId:'fixture-principal',expiresAt:'2026-10-14T01:00:00Z',contexts:[{id:'personal',kind:'personal'}],providerProfile:'explicit-test-provider',transport:'worker-fixed-fetch'})},
  profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),
  // Independent fake elapsed clock isolates scheduler cleanup from wall-clock authorization expiry.
  now:()=>Date.parse(NOW),makeId:()=>`token_${++id}`
 });
 t.after(()=>{service.stop();base.close();});
 let auth,scopeKey;const grants={};
 async function bind(){
  const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender);assert.equal(hello.ok,true);
  const {documentToken,producerToken,routeEpoch}=hello.binding;auth={documentToken,producerToken,routeEpoch};
  const result=await service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,...auth},sender);assert.equal(result.state,'verified');scopeKey=result.scopeKey;
 }
 async function observe(){
  const evidence={profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
  const result=await service.handle({protocol:'vaiwl-host-observation/1',...auth,localSeq:++localSeq,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{
   candidates:[{renderKey:'conversation:c1',entity:'conversation',nativeTitle:'Synthetic conversation',titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:'c1',navigationURL:'https://chatgpt.com/c/c1',liveHandle:null},evidence}],
   membershipClaims:[{conversationId:'c1',asserted:'UNKNOWN',projectId:null,reason:'not-observed',evidence}],coverageClaims:[],detachedHandles:[]
  }},sender);assert.equal(result.state,'accepted');
 }
 async function mount(){
  assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...auth,mountId:'mount',regionEpoch:1},sender)).ok,true);
  for(const role of ['workspace','sidebar']){
   const joined=service.handle({v:1,type:'HOST_UI_JOIN',nonce:'nonce_'+role,role},children[role]);
   const confirm=await service.handle({v:1,type:'HOST_UI_CONFIRM',...auth,mountId:'mount',regionEpoch:1,nonce:'nonce_'+role,role},sender);assert.equal(confirm.ok,true);
   const result=await joined;assert.equal(result.ok,true);grants[role]=result.grant;
  }
 }
 const listeners=new Set(),port={name:'vaiwl-ui',sender:children.workspace,onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){for(const f of [...listeners])f();},postMessage(){}};
 assert.equal(service.connectPort(port),true);
 return {service,bind,observe,mount,sender,children,get auth(){return auth;},get scopeKey(){return scopeKey;},disconnectWorkspace:()=>port.disconnect(),
  view:(role='workspace')=>service.handle({v:1,type:'HOST_UI_VIEW',grantId:grants[role].id,mountId:'mount',query:{}},children[role])};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fakeClock(){let time=0,id=0;const timers=new Map();return {elapsedNow:()=>time,schedule(fn,ms){const key=++id;timers.set(key,{at:time+ms,fn});return key;},cancel:key=>timers.delete(key),async advance(ms){time+=ms;for(const [key,timer]of [...timers])if(timer.at<=time){timers.delete(key);timer.fn();}await drain();},timers};}
for(const revokeChild of [false,true])test('actual binding service: '+(revokeChild?'revoked':'live')+' preparing owner after raw read settles',async t=>{
 const clock=fakeClock(),h=await fixture(t,clock);t.after(()=>h.service.stop());await h.bind();await h.observe();await h.mount();
 const native=h.service.nativeRepository,original=native.page.bind(native),gate=deferred();let entered=0;
 native.page=async(...args)=>{entered++;await gate.promise;return original(...args);};t.after(()=>gate.resolve());
 assert.equal((await h.view()).state,'preparing');for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,1);
 const auth=()=>h.auth;
 const idle=()=>h.service.handle({v:1,type:'HOST_UI_IDLE_CHECK',...auth(),mountId:'mount'},h.sender);
 assert.deepEqual(await idle(),{ok:false,reason:'ui-release-busy'});
 if(revokeChild)h.disconnectWorkspace();
 gate.resolve();for(let i=0;i<50;i++)await drain();
 assert.equal(h.service.ui.isIdle(),true,'UI owner drained');assert.equal(h.service.observations.isIdle(),true,'observation owner drained');assert.equal(h.service.continuations.isIdle(),true,'continuation owner drained');assert.equal(h.service.authority.isIdle(),true,'authority drained');
 await clock.advance(30001);
 const result=await idle();console.log(JSON.stringify({revokeChild,viewsIdle:h.service.views.isIdle(),serviceIdle:h.service.isIdle(),idleCheck:result,rawPageCalls:entered}));
 assert.equal(h.service.views.isIdle(),true,'invalidated preparation with no underlying read must not retain global busy forever');
 assert.deepEqual(result,{ok:true});
});

for(const outcome of ['resolve','reject'])test('revocation retains underlying read after deadline until '+outcome,async t=>{
 const clock=fakeClock(),h=await fixture(t,clock);t.after(()=>h.service.stop());await h.bind();await h.observe();await h.mount();
 let resolve,reject,entered=false;const gate=new Promise((a,b)=>{resolve=a;reject=b;});t.after(()=>resolve());
 const native=h.service.nativeRepository,original=native.page.bind(native);native.page=async(...args)=>{entered=true;await gate;return original(...args);};
 assert.equal((await h.view()).state,'preparing');for(let i=0;i<50&&!entered;i++)await drain();assert(entered);
 h.disconnectWorkspace();await clock.advance(6000);
 assert.equal(h.service.views.isIdle(),false,'actual raw read still outstanding despite deadline and revoked grant');
 if(outcome==='resolve')resolve();else reject(Error('late-read'));
 for(let i=0;i<50;i++)await drain();
 assert.equal(h.service.views.isIdle(),true,'completed stale read must retire preparation');
 assert.equal((await h.view()).ok,false,'old revoked UI grant stays denied');
});

test('old revoked read settling cannot retire a fresh same-mount generation',async t=>{
 const clock=fakeClock(),h=await fixture(t,clock);t.after(()=>h.service.stop());await h.bind();await h.observe();await h.mount();
 const gates=[deferred(),deferred()];let calls=0;const native=h.service.nativeRepository,original=native.page.bind(native);native.page=async(...args)=>{const gate=gates[calls++];await gate.promise;return original(...args);};t.after(()=>gates.forEach(g=>g.resolve()));
 assert.equal((await h.view()).state,'preparing');for(let i=0;i<50&&calls<1;i++)await drain();assert.equal(calls,1);
 h.disconnectWorkspace();
 assert.equal((await h.view('sidebar')).state,'preparing');for(let i=0;i<50&&calls<2;i++)await drain();assert.equal(calls,2);
 gates[0].resolve();for(let i=0;i<20;i++)await drain();assert.equal(h.service.views.isIdle(),false,'replacement read remains counted');
 gates[1].resolve();for(let i=0;i<30;i++)await drain();assert.equal(h.service.views.isIdle(),true);
 assert.equal((await h.view('sidebar')).state,'ready');assert.equal((await h.view()).ok,false);
});


test('stale scheduled retry retires at its existing timer without starting another read',async t=>{
 const clock=fakeClock(),h=await fixture(t,clock);await h.bind();await h.observe();await h.mount();
 let calls=0;h.service.nativeRepository.page=async()=>{calls++;throw Error('stale-free-page');};
 assert.equal((await h.view()).state,'preparing');for(let i=0;i<30;i++)await drain();assert.equal(calls,1);assert([...clock.timers.values()].some(x=>x.at===50));
 h.disconnectWorkspace();await clock.advance(50);
 assert.equal(calls,1,'no stale retry read');assert.equal(h.service.views.isIdle(),true,'invalid retry bookkeeping retired');
 assert.equal((await h.view()).ok,false,'retired grant cannot read');
});

test('same-entry new generation preserves the existing single-flight read and final view',async t=>{
 const clock=fakeClock(),h=await fixture(t,clock);await h.bind();await h.observe();await h.mount();
 const gate=deferred();let calls=0;const native=h.service.nativeRepository,original=native.page.bind(native);
 native.page=async(...args)=>{calls++;await gate.promise;return original(...args);};t.after(()=>gate.resolve());
 assert.equal((await h.view()).state,'preparing');for(let i=0;i<50&&calls<1;i++)await drain();assert.equal(calls,1);
 h.service.views.refreshScope(h.scopeKey);for(let i=0;i<20;i++)await drain();assert.equal(calls,1,'same-entry refresh reuses original single-flight');assert.equal(h.service.views.isIdle(),false);
 gate.resolve();for(let i=0;i<30;i++)await drain();assert.equal(h.service.views.isIdle(),true);assert.equal((await h.view()).state,'ready');
});
