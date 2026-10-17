/** Real binding service, handshake and scope authority; MOCK_IDB and browser transport doubles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
const origin='https://chatgpt.com',url=origin+'/c/33333333-3333-4333-8333-333333333333';
const flush=()=>new Promise(r=>setImmediate(r));
async function fixture(t,{c2=false,receiptLostAfterPolicy=false,autoReply=true,originalURL=url,primaryError='session-transport-failed',primaryDelay=0}={}){
 let time=1000,elapsed=0,n=0,principal='A',reads=0,frameCost=0,contextReads=0;const timers=new Map(),commands=[],acks=[];
 const contextReceipt=Object.freeze({id:'context_receipt',documentId:'document',selectionEpoch:1,wall:1000});
 let actual={documentId:'document',url,documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1};
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'document',documentLifecycle:'active',url:originalURL};
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'fallback-service'});
 const identity=transport=>({principalId:principal,contexts:[{id:'personal',kind:'personal'}],expiresAt:new Date(100000).toISOString(),providerProfile:'chatgpt-session-v1',transport});
 const result=c=>({type:'HOST_IDENTITY_RESULT',challenge:c.challenge,documentToken:c.documentToken,producerToken:c.producerToken,routeEpoch:c.routeEpoch,authorityEpoch:c.authorityEpoch,ok:true,identity:identity('isolated-fixed-fetch')});
 const service=createHostBindingService({extensionId:'extension',getFrame:async()=>{elapsed+=frameCost;time+=frameCost;frameCost=0;return {...actual};},allowedURL:u=>new URL(u).origin===origin,repository:base,identityOrigin:origin,
  provider:{read:async()=>{reads++;elapsed+=primaryDelay;time+=primaryDelay;if(primaryError)throw Error(primaryError);return identity('worker-fixed-fetch');}},
  profile:{id:'test-profile',singlePersonalDefault:!c2,browserRequestContext:c2},contextObserver:c2?{verify:async()=>++contextReads===1&&receiptLostAfterPolicy?contextReceipt:null,isCurrent:(_frame,receipt)=>receiptLostAfterPolicy&&contextReads===1&&receipt===contextReceipt}:null,
  isolatedIdentityDispatch:async(frame,command)=>{commands.push({frame,command});if(autoReply)acks.push(await service.handle(result(command),sender));return identity('isolated-fixed-fetch');},
  now:()=>time,elapsedNow:()=>elapsed,makeId:()=> 'identity_'+(++n),schedule:(fn,ms)=>{const id=++n;timers.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>timers.delete(id)});
 t.after(()=>{service.stop();base.close();});
 const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender);assert.equal(hello.ok,true);const {documentToken,producerToken,routeEpoch}=hello.binding;let seq=1;
 const frame={tabId:1,frameId:0,documentId:'document',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false};
 return {service,sender,frame,commands,acks,timers,result,identity,request:(type='HOST_REFRESH')=>service.handle({v:1,type,clientId:'client',seq:++seq,documentToken,producerToken,routeEpoch},sender),get reads(){return reads;},set nextFrameCost(v){frameCost=v;},set primaryError(v){primaryError=v;},set principal(v){principal=v;},set actual(v){actual=v;},get actual(){return actual;},advance(ms,fire=true){elapsed+=ms;time+=ms;if(fire)for(const [id,timer]of [...timers])if(timer.at<=elapsed&&timers.delete(id))timer.fn();}};
}
test('MOCK transport failure uses actual challenge/result service dispatch to establish isolated C3 proof',async t=>{
 const f=await fixture(t);const response=await f.request();assert.equal(response.state,'verified');assert.equal(f.reads,1);assert.equal(f.commands.length,1);assert.deepEqual(f.acks,[{ok:true}]);
 const proof=f.service.authority.peek(f.frame);assert.equal(proof.grant.principal.transport,'isolated-fixed-fetch');assert.equal(proof.grant.principal.providerProfile,'chatgpt-session-v1');assert.equal(proof.grant.context.kind,'single-personal-context');assert.equal(f.timers.size,0);
});
test('MOCK successful primary does not invoke isolated reader',async t=>{const f=await fixture(t,{primaryError:null});assert.equal((await f.request()).state,'verified');assert.equal(f.commands.length,0);assert.equal(f.service.authority.peek(f.frame).grant.principal.transport,'worker-fixed-fetch');});
for(const error of ['session-unauthorized','invalid-session-schema','invalid-accounts-schema','request-timeout','session-aborted','invalid-session-json','invalid-session-response'])test('MOCK primary '+error+' never triggers auth fallback',async t=>{
 const f=await fixture(t,{primaryError:error});assert.notEqual((await f.request()).state,'verified');assert.equal(f.commands.length,0);assert.equal(f.service.authority.scopeFor(f.frame),null);
});
test('MOCK isolated principal/roster cannot substitute for C2 receipt lost after policy admission',async t=>{
 const f=await fixture(t,{c2:true,receiptLostAfterPolicy:true});const response=await f.request();assert.equal(f.commands.length,1);assert.equal(f.reads,1);assert.deepEqual(f.acks,[{ok:true}]);assert.equal(response.state,'ambiguous');assert.equal(response.reason,'current-context-unproven');assert.equal(f.service.authority.scopeFor(f.frame),null);assert.equal(f.timers.size,0);
});
test('MOCK missing C2 settles before primary or isolated identity work',async t=>{
 const f=await fixture(t,{c2:true});const response=await f.request();assert.equal(f.commands.length,0);assert.equal(f.reads,0);assert.equal(response.state,'ambiguous');assert.equal(response.reason,'current-context-unproven');assert.equal(f.service.authority.scopeFor(f.frame),null);assert.equal(f.timers.size,0);
});
test('MOCK fallback retains original SPA sender while browser current route owns command',async t=>{
 const f=await fixture(t,{originalURL:origin+'/'});assert.equal((await f.request()).state,'verified');assert.equal(f.commands[0].command.actualURL,url);assert.equal(f.sender.url,origin+'/');
});
test('MOCK primary elapsed cost reduces fallback command and cannot renew six-second deadline',async t=>{
 const f=await fixture(t,{primaryDelay:4500,autoReply:false}),pending=f.request();await flush();assert.equal(f.commands.length,1);assert.equal(f.commands[0].command.timeoutMs,1500);
 f.advance(1500,false);assert.deepEqual(await f.service.handle(f.result(f.commands[0].command),f.sender),{ok:false});assert.notEqual((await pending).state,'verified');assert.equal(f.service.authority.scopeFor(f.frame),null);
});
test('MOCK exhausted primary budget cannot issue fallback challenge',async t=>{
 const f=await fixture(t,{primaryDelay:6000});assert.notEqual((await f.request()).state,'verified');assert.equal(f.commands.length,0);
});
test('MOCK foreign document result is rejected without consuming rightful reply, completed challenge rejects replay',async t=>{
 const f=await fixture(t,{autoReply:false}),pending=f.request();await flush();const message=f.result(f.commands[0].command);
 assert.deepEqual(await f.service.handle(message,{...f.sender,documentId:'foreign'}),{ok:false});assert.deepEqual(await f.service.handle(message,f.sender),{ok:true});assert.equal((await pending).state,'verified');assert.deepEqual(await f.service.handle(message,f.sender),{ok:false});
});
for(const mode of ['invalidate','stop','replace-document','replace-route'])test('MOCK pending isolated reply cannot restore authority after '+mode,async t=>{
 const f=await fixture(t,{autoReply:false}),pending=f.request();await flush();const message=f.result(f.commands[0].command);
 if(mode==='invalidate')f.service.invalidate({tabId:1});else if(mode==='stop')f.service.stop();else f.actual={...f.actual,...(mode==='replace-document'?{documentId:'new-document'}:{url:origin+'/c/44444444-4444-4444-8444-444444444444'})};
 assert.equal((await f.service.handle(message,f.sender)).ok,false);f.advance(6000);assert.notEqual((await pending).state,'verified');assert.equal(f.service.authority.scopeFor(f.frame),null);
});
test('MOCK forced revalidation preserves isolated identity then revokes changed principal',async t=>{
 const f=await fixture(t);assert.equal((await f.request()).state,'verified');const original=f.service.authority.peek(f.frame).grant;
 assert.equal((await f.request('HOST_FOCUS')).state,'verified');assert.equal(f.commands.length,2);assert.equal(f.service.authority.peek(f.frame).grant.scopeKey,original.scopeKey);
 f.principal='B';assert.notEqual((await f.request('HOST_FOCUS')).state,'verified');assert.equal(f.commands.length,3);assert.equal(f.service.authority.scopeFor(f.frame),null);
});

test('MOCK original refresh deadline includes pre-provider browser verification cost',async t=>{
 const f=await fixture(t,{primaryDelay:3000,autoReply:false});f.nextFrameCost=1500;const pending=f.request();await flush();assert.equal(f.commands.length,1);
 const timeoutMs=f.commands[0].command.timeoutMs;f.advance(1500);await pending;assert.equal(timeoutMs,1500,'fallback cannot borrow the 1500ms already spent before scope-authority');
});
