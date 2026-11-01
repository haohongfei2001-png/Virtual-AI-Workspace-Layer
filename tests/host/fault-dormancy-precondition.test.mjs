import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {createFaultDormancyRpcObserver,waitForSettledFaultDormancy,installFaultDormancyPrecondition,faultCurrentObservationTerminal} from './fault-dormancy-precondition.mjs';

const flush=async()=>{await Promise.resolve();await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const cleared=role=>({role,present:true,documentUnchanged:true,mainCount:1,empty:true,lifecycle:'ui-idle'});
const snapshot=(events,sequence=1)=>({sequence,limit:32,dropped:0,current:true,events});
const release=(sequence=1)=>[{sequence,direction:'request'},{sequence,direction:'reply',ok:true}];
const wait=options=>waitForSettledFaultDormancy({readSnapshot:async()=>snapshot(release()),readFrames:async()=>[cleared('workspace')],boundary:0,roles:['workspace'],startedAt:performance.now(),timeoutMs:150,...options});

test('observer preserves receiver, arguments, callback and original Promise without recording other RPCs',async()=>{
 const pending=deferred(),calls=[],callback=()=>{},runtime={sendMessage(...args){calls.push({receiver:this,args});return pending.promise;}};
 const original=runtime.sendMessage,observer=createFaultDormancyRpcObserver(runtime),message={type:'HOST_OTHER',grantId:'PRIVATE_GRANT',payload:'PRIVATE_BODY'},args=[message,{includeTlsChannelId:true},callback];
 assert.equal(runtime.sendMessage(...args),pending.promise);assert.equal(calls.length,1);assert.equal(calls[0].receiver,runtime);assert(calls[0].args.every((value,i)=>value===args[i]));
 pending.resolve({ok:true});await flush();assert.deepEqual(observer.snapshot().events,[]);observer.restore();assert.equal(runtime.sendMessage,original);
});

test('only release sequence and boolean outcome are copied; promise identity and rejection stay intact',async()=>{
 const first=deferred(),second=deferred(),queue=[first.promise,second.promise],runtime={sendMessage:()=>queue.shift()},observer=createFaultDormancyRpcObserver(runtime);
 const reply={ok:true,grantId:'PRIVATE_GRANT',payload:'PRIVATE_BODY'},a=runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE',documentToken:'PRIVATE_TOKEN'});
 assert.equal(a,first.promise);first.resolve(reply);assert.equal(await a,reply);await flush();
 const error=Error('PRIVATE_REJECTION'),b=runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE'});assert.equal(b,second.promise);second.reject(error);await assert.rejects(b,value=>value===error);await flush();
 assert.deepEqual(observer.snapshot().events,[...release(),{sequence:2,direction:'request'},{sequence:2,direction:'rejection'}]);assert(!JSON.stringify(observer.snapshot()).includes('PRIVATE'));observer.restore();
});

test('sync throw and callback-only undefined result are unchanged; neither invents successful release',()=>{
 const error=Error('private'),callback=()=>{},calls=[],runtime={sendMessage(...args){calls.push(args);if(calls.length===1)throw error;return undefined;}},observer=createFaultDormancyRpcObserver(runtime);
 assert.throws(()=>runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE'}),value=>value===error);assert.equal(runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE'},callback),undefined);assert.equal(calls[1][1],callback);
 assert.deepEqual(observer.snapshot().events,[{sequence:1,direction:'request'},{sequence:1,direction:'throw'},{sequence:2,direction:'request'}]);observer.restore();
});

test('bounded observer exposes drops and never overwrites a replacement wrapper',async()=>{
 const runtime={sendMessage:()=>Promise.resolve({ok:true})},observer=createFaultDormancyRpcObserver(runtime,{limit:2});
 await runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE'});await runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE'});await flush();assert.equal(observer.snapshot().dropped,2);
 const replacement=()=>{};runtime.sendMessage=replacement;assert.equal(observer.snapshot().current,false);assert.throws(()=>observer.restore(),/observer-replaced/);assert.equal(runtime.sendMessage,replacement);
});

test('old successful release, including its late reply, cannot satisfy a new close boundary',async()=>{
 let reads=0;await assert.rejects(wait({boundary:1,readSnapshot:async()=>{reads++;return snapshot(release());},timeoutMs:25}),/dormancy-deadline/);assert(reads>=1);
});

test('one successful release still waits for every captured role to finish clearing',async()=>{
 let reads=0;const result=await wait({roles:['sidebar','workspace'],readFrames:async()=>{reads++;return [{...cleared('sidebar'),empty:reads>1},cleared('workspace')];}});
 assert.equal(result.status,'PASS_SETTLED_DORMANT_PRECONDITION');assert.equal(result.releaseSequence,1);assert.equal(reads,2);assert.deepEqual(result.frames,[cleared('sidebar'),cleared('workspace')]);
});

test('refusal, unmatched reply, dropped trace and missing or replaced frame fail without another release',async()=>{
 for(const rows of [[{sequence:1,direction:'request'},{sequence:1,direction:'reply',ok:false}],[{sequence:1,direction:'request'},{sequence:1,direction:'rejection'}],[{sequence:1,direction:'request'},{sequence:2,direction:'reply',ok:true}]])await assert.rejects(wait({readSnapshot:async()=>snapshot(rows,2)}),/release-refused|unmatched-reply/);
 await assert.rejects(wait({readSnapshot:async()=>({...snapshot(release()),dropped:1})}),/observer-dropped/);
 for(const frames of [[],[{...cleared('workspace'),documentUnchanged:false}],[{...cleared('workspace'),mainCount:0}]])await assert.rejects(wait({readFrames:async()=>frames}),/frame-changed/);
});

test('a drop during frame observation cannot be hidden by the preceding successful sample',async()=>{
 let reads=0;await assert.rejects(wait({readSnapshot:async()=>({...snapshot(release()),dropped:++reads>1?1:0})}),/observer-dropped/);assert.equal(reads,2);
});

test('one original deadline bounds a hanging observer and pending release without creating an RPC',async()=>{
 let reads=0;const started=performance.now();await assert.rejects(wait({timeoutMs:25,readSnapshot:()=>{reads++;return new Promise(()=>{});}}),/dormancy-deadline/);assert.equal(reads,1);assert(performance.now()-started<1000);
 await assert.rejects(wait({startedAt:performance.now()-30,timeoutMs:25,readSnapshot:()=>assert.fail('expired window must not read')}),/dormancy-deadline/);
});

test('precondition timeout cannot cancel, replace or retry the actual pending release',async()=>{
 const pending=deferred();let calls=0;const runtime={sendMessage(){calls++;return pending.promise;}},observer=createFaultDormancyRpcObserver(runtime);
 const actual=runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE'});assert.equal(actual,pending.promise);
 await assert.rejects(wait({timeoutMs:25,readSnapshot:async()=>observer.snapshot()}),/dormancy-deadline/);assert.equal(calls,1);assert.deepEqual(observer.snapshot().events,[{sequence:1,direction:'request'}]);
 pending.resolve({ok:true});assert.deepEqual(await actual,{ok:true});await flush();assert.deepEqual(observer.snapshot().events,release());observer.restore();
});

function isolatedFixture(){
 const extensionId='a'.repeat(32),realm=vm.createContext({});vm.runInContext(`globalThis.window=globalThis;globalThis.top=globalThis;globalThis.calls=0;globalThis.chrome={runtime:{id:'${extensionId}',sendMessage(){calls++;return Promise.resolve({ok:true});}}};globalThis.original=chrome.runtime.sendMessage;`,realm);
 class Session extends EventEmitter {detached=false;async send(method,params){if(method==='Runtime.enable'){this.emit('Runtime.executionContextCreated',{context:{id:7,auxData:{isDefault:false}}});return {};}assert.equal(method,'Runtime.evaluate');assert.equal(params.contextId,7);try{return {result:{value:JSON.parse(JSON.stringify(vm.runInContext(params.expression,realm)))}};}catch{return {exceptionDetails:{text:'fixture failure'}};}}async detach(){this.detached=true;}}
 const session=new Session(),main={},state={timeOrigin:1,role:'workspace',mainCount:1,empty:false,lifecycle:'ui-starting'};
 const frame={url:()=>`chrome-extension://${extensionId}/workspace.html`,parentFrame:()=>main,isDetached:()=>false,evaluate:async()=>({...state})},page={frames:()=>[frame],mainFrame:()=>main},context={newCDPSession:async()=>session};
 return {extensionId,realm,session,frame,state,page,context};
}

test('isolated adapter only observes an existing release and restores its wrapper/session',async()=>{
 const f=isolatedFixture(),observer=await installFaultDormancyPrecondition(f);await observer.arm();assert.equal(vm.runInContext('calls',f.realm),0);
 await vm.runInContext(`chrome.runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE',documentToken:'PRIVATE'})`,f.realm);Object.assign(f.state,{empty:true,lifecycle:'ui-idle'});
 const result=await observer.wait();assert.equal(result.status,'PASS_SETTLED_DORMANT_PRECONDITION');assert.equal(vm.runInContext('calls',f.realm),1);assert(!JSON.stringify(observer.receipt).includes('PRIVATE'));
 await observer.close();assert.equal(observer.receipt.observerRestored,true);assert.equal(vm.runInContext('chrome.runtime.sendMessage===original',f.realm),true);assert.equal(f.session.detached,true);assert.equal(f.session.listenerCount('Runtime.executionContextDestroyed'),0);
});

test('selected isolated world destruction is terminal and is never retargeted',async()=>{
 const f=isolatedFixture(),observer=await installFaultDormancyPrecondition(f);await observer.arm();f.session.emit('Runtime.executionContextDestroyed',{executionContextId:7});f.session.emit('Runtime.executionContextCreated',{context:{id:8,auxData:{isDefault:false}}});
 await assert.rejects(observer.wait(),/world-changed/);assert.equal(vm.runInContext('calls',f.realm),0);await observer.close();assert.equal(f.session.detached,true);
});


test('current observer follows the new wake binding and original final Promise, not calibration',async()=>{
 const pending=deferred(),binding={documentToken:'PRIVATE_NEW_DOCUMENT',producerToken:'PRIVATE_NEW_PRODUCER',routeEpoch:2,origin:'http://fixture.test'},runtime={sendMessage(message){if(message.type==='HOST_HELLO')return Promise.resolve({ok:true,binding});if(message.kind==='current-observation')return pending.promise;return Promise.resolve({ok:true});}},original=runtime.sendMessage;
 const observer=createFaultDormancyRpcObserver(runtime,{observeCurrent:true,conversationId:'conversation',messageId:'msg-self',origin:binding.origin});
 await runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE',documentToken:'PRIVATE_OLD_DOCUMENT',producerToken:'PRIVATE_OLD_PRODUCER',routeEpoch:1});await runtime.sendMessage({type:'HOST_HELLO'});
 const message={protocol:'vaiwl-host-observation/2',kind:'current-observation',...binding,localSeq:1,payload:{body:{association:'explicit-body-id',conversationId:'conversation',messageIds:['msg-self'],privateText:'PRIVATE_BODY'}}};
 const actual=runtime.sendMessage(message);assert.equal(actual,pending.promise);
 await runtime.sendMessage({type:'HOST_UI_CALIBRATION_ENTRY'});assert.equal(faultCurrentObservationTerminal(observer.snapshot(),0),null);
 pending.resolve({state:'rejected',localSeq:1,reason:'PRIVATE_REASON'});await actual;await flush();
 assert.deepEqual(faultCurrentObservationTerminal(observer.snapshot(),0),{kind:'CURRENT_OBSERVATION_TERMINAL',boundary:0,sequence:1,state:'rejected'});
 assert.equal(faultCurrentObservationTerminal(observer.snapshot(),1),null);assert(!JSON.stringify(observer.snapshot()).includes('PRIVATE'));
 observer.restore();assert.equal(runtime.sendMessage,original);
});

test('old binding, unproven body, empty body and another conversation never complete the wake observation',async()=>{
 for(const mutate of [m=>m.producerToken='old',m=>m.payload.body.association='unproven',m=>m.payload.body.messageIds=[],m=>m.payload.body.conversationId='other']){
  const binding={documentToken:'new-document',producerToken:'new',routeEpoch:2,origin:'http://fixture.test'},runtime={sendMessage:m=>Promise.resolve(m.type==='HOST_HELLO'?{ok:true,binding}:{state:'accepted',localSeq:m.localSeq,ok:true})},observer=createFaultDormancyRpcObserver(runtime,{observeCurrent:true,conversationId:'conversation',messageId:'msg-self',origin:binding.origin});
  await runtime.sendMessage({type:'HOST_UI_IDLE_RELEASE',producerToken:'old'});await runtime.sendMessage({type:'HOST_HELLO'});
  const message={protocol:'vaiwl-host-observation/2',kind:'current-observation',...binding,localSeq:1,payload:{body:{association:'explicit-body-id',conversationId:'conversation',messageIds:['msg-self']}}};mutate(message);await runtime.sendMessage(message);await flush();
  assert.equal(faultCurrentObservationTerminal(observer.snapshot(),0),null);observer.restore();
 }
});

test('retry, late old reply and truncated observer cannot certify a current terminal',()=>{
 const sample={current:true,bodySequence:2,bodyDropped:0,bodyEvents:[{sequence:1,direction:'request',eligible:true},{sequence:1,direction:'reply',matched:true,state:'accepted'},{sequence:2,direction:'request',eligible:true},{sequence:2,direction:'reply',matched:true,state:'retry-after'}]};
 assert.equal(faultCurrentObservationTerminal(sample,1),null);
 assert.throws(()=>faultCurrentObservationTerminal({...sample,bodyDropped:1},1),/dropped/);
 const mismatch=structuredClone(sample);mismatch.bodyEvents[3].matched=false;assert.throws(()=>faultCurrentObservationTerminal(mismatch,1),/unmatched/);
});
