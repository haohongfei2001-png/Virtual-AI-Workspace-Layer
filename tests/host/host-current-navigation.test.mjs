import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostCurrentNavigation} from '../../src/runtime/host-current-navigation.mjs';
const id='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+id;
function fixture(){
 let time=100,live=true,proofLive=true,bridgeCalls=0,proofCalls=0,bridge=async({command})=>({state:'already-current',actionId:command.actionId});
 const context={scope:{key:'scope'},scopeGrantId:'scope_grant',role:'workspace',binding:{documentToken:'doc',producerToken:'producer',routeEpoch:1},parentFrame:{tabId:1,frameId:0,documentId:'browser_doc',actualURL:url},isCurrent:()=>live};
 const proof={scope:{key:'scope'},...context.binding,conversationId:id,bodyEpoch:1,guard:()=>proofLive};
 const row={refId:id,targetKey:'target',plan:{mode:'same-target',target:{kind:'resolved',entity:'conversation',nativeId:id,navigationURL:url,liveHandle:null},bodyProofId:'proof',planRevision:1}};
 const service=createHostCurrentNavigation({ui:{withScope:async(args,fn)=>{if(args.grantId!=='grant'||args.mountId!=='mount'||args.sender!=='owned')throw Error('denied');return fn(context);}},observations:{withCurrent:async(proofId,fn)=>{proofCalls++;assert.equal(proofId,'proof');if(!proofLive)throw Error('stale');const result=await fn(proof);if(!proofLive)throw Error('stale');return result;}},bridge:async args=>{if(args.mode==='cancel')return {state:'cancelled'};bridgeCalls++;return bridge(args);},elapsedNow:()=>time});
 const register=(navigation=[row],overrides={})=>service.register({context,grantId:'grant',mountId:'mount',navigation,...overrides});
 const message=(patch={})=>({v:1,type:'HOST_UI_DISPATCH_CURRENT',grantId:'grant',mountId:'mount',actionId:'action',planRevision:1,targetKey:'target',...patch});
 const handle=(patch={},sender='owned')=>service.handle(message(patch),sender);
 return {service,context,proof,row,register,message,handle,setTime:v=>{time=v;},setLive:v=>{live=v;},setProofLive:v=>{proofLive=v;},setBridge:v=>{bridge=v;},counts:()=>({bridgeCalls,proofCalls})};
}
test('issued current plan uses fresh proof and narrow pending parent authorization only',async()=>{
 const f=fixture();f.register();f.setBridge(async({context,command,guard,remainingMs})=>{assert.equal(guard(),true);assert.equal(remainingMs,6000);assert.equal(f.service.authorize(command,context.parentFrame),true);for(const patch of [{documentId:'other'},{frameId:2},{tabId:2},{actualURL:url+'?x=1'}])assert.equal(f.service.authorize(command,{...context.parentFrame,...patch}),false);assert.equal(f.service.authorize({...command,targetKey:'other'},context.parentFrame),false);return {state:'already-current',actionId:command.actionId};});assert.deepEqual(await f.handle(),{ok:true,state:'already-current'});assert.deepEqual(f.counts(),{bridgeCalls:1,proofCalls:1});assert.equal(f.service.authorize({actionId:'action',uiGrantId:'grant',mountId:'mount',targetKey:'target',planRevision:1},f.context.parentFrame),false);
});
test('registration rejects noncurrent plans, URL mismatch, unsafe shapes and duplicate rows',()=>{
 for(const mutate of [r=>r.plan.mode='href',r=>r.plan.mode='native-control',r=>r.plan.target.entity='project',r=>r.plan.target.liveHandle={},r=>r.plan.target.navigationURL='https://evil.test/c/'+id,r=>r.plan.target.nativeId='other',r=>r.plan.bodyProofId='',r=>r.plan.planRevision=0,r=>r.extra=true,r=>r.plan[Symbol('extra')]=true]){const f=fixture(),r=structuredClone(f.row);mutate(r);assert.throws(()=>f.register([r]));}
 const f=fixture();assert.throws(()=>f.register([f.row,f.row]));assert.throws(()=>f.register(Array(201).fill(f.row)));let reads=0;const r={...f.row};Object.defineProperty(r,'plan',{enumerable:true,get(){reads++;return f.row.plan;}});assert.throws(()=>f.register([r]));assert.equal(reads,0);
});
test('unissued, wrong revision, forged UI and malformed commands cannot bridge',async()=>{
 const f=fixture();assert.equal((await f.handle()).ok,false);f.register();for(const patch of [{planRevision:2},{targetKey:'other'},{grantId:'other'},{mountId:'other'},{v:2},{extra:true},{[Symbol('x')]:true}])assert.equal((await f.handle(patch)).ok,false);assert.equal((await f.handle({},'forged')).ok,false);assert.equal(f.counts().bridgeCalls,0);
});
test('fresh proof must match scope, producer, document, route and conversation',async()=>{
 for(const field of ['scope','documentToken','producerToken','routeEpoch','conversationId']){const f=fixture();f.register();f.proof[field]=field==='scope'?{key:'other'}:field==='routeEpoch'?2:'other';assert.equal((await f.handle()).ok,false);assert.equal(f.counts().bridgeCalls,0);assert.equal((await f.handle()).ok,false);assert.equal(f.counts().proofCalls,1,'failed attempt consumed');}
});
test('registry binds saved parent frame and binding even if current context object mutates',async()=>{
 for(const field of ['documentToken','producerToken','routeEpoch']){const f=fixture();f.register();f.context.binding[field]='changed';assert.equal((await f.handle()).ok,false);assert.equal(f.counts().proofCalls,0);}const f=fixture();f.register();f.context.parentFrame.documentId='other';assert.equal((await f.handle()).ok,false);
});
test('current plans expire at thirty seconds and reject nonfinite or backward time',async()=>{
 for(const time of [30100,NaN,Infinity,99]){const f=fixture();f.register();f.setTime(time);assert.equal((await f.handle()).ok,false);assert.equal(f.counts().bridgeCalls,0);}
});
test('scope invalidation, clear registration and stop prevent current dispatch',async()=>{
 for(const action of ['scope','empty','stop']){const f=fixture();f.register();if(action==='scope')f.setLive(false);if(action==='empty')f.register([]);if(action==='stop')f.service.stop();assert.equal((await f.handle()).ok,false);assert.equal(f.counts().bridgeCalls,0);}
});
test('pending registry replacement, proof loss, stop and six-second deadline invalidate bridge guard',async()=>{
 for(const action of ['replace','proof','stop','deadline']){const f=fixture();f.register();f.setBridge(async({guard,command,context})=>{if(action==='replace')f.register();if(action==='proof')f.setProofLive(false);if(action==='stop')f.service.stop();if(action==='deadline')f.setTime(6100);assert.equal(guard(),false);assert.equal(f.service.authorize(command,context.parentFrame),false);return {state:'already-current'};});assert.equal((await f.handle()).ok,false);}
});
test('concurrent duplicate action bridges only once; failed bridge is never replayed',async()=>{
 const f=fixture();f.register();let release;f.setBridge(()=>new Promise(resolve=>{release=resolve;}));const first=f.handle();for(let i=0;i<10;i++)await Promise.resolve();assert.equal((await f.handle()).ok,false);release({state:'already-current'});assert.equal((await first).ok,true);assert.equal(f.counts().bridgeCalls,1);
 const g=fixture();g.register();g.setBridge(async()=>{throw Error('lost ACK');});assert.equal((await g.handle()).ok,false);assert.equal((await g.handle()).ok,false);assert.equal(g.counts().bridgeCalls,1);
});
test('only already-current blocked unconfirmed are accepted, never dispatched or wrong action',async()=>{
 for(const result of [{state:'dispatched'},{state:'already-current',actionId:'other'},{state:'already-current',extra:true}]){const f=fixture();f.register();f.setBridge(async()=>result);assert.equal((await f.handle()).ok,false);}
 for(const state of ['blocked','unconfirmed']){const f=fixture();f.register();f.setBridge(async()=>({state,reason:'test'}));assert.deepEqual(await f.handle(),{ok:true,state});}
});
test('sixty-four live registry groups are bounded; expired entries can be reclaimed',()=>{
 const f=fixture();for(let i=0;i<64;i++)f.register([f.row],{grantId:'grant_'+i});assert.throws(()=>f.register([f.row],{grantId:'overflow'}),/capacity/);f.setTime(30100);assert.equal(f.register(),true);
});

const cancelMessage=f=>f.message({type:'HOST_UI_CANCEL_NAVIGATION'});
test('cancellation consumes action before delivery without bridging or proof reads',async()=>{
 const f=fixture();f.register();assert.equal((await f.service.cancelAction(cancelMessage(f),'owned')).ok,true);assert.equal((await f.handle()).ok,false);assert.deepEqual(f.counts(),{bridgeCalls:0,proofCalls:0});assert.equal((await f.service.cancelAction(cancelMessage(f),'owned')).ok,true);
});
test('cancellation revokes pending guard and cannot authorize a replacement action',async()=>{
 const f=fixture();f.register();f.setBridge(async({command,context,guard})=>{assert.equal(guard(),true);assert.equal((await f.service.cancelAction(cancelMessage(f),'owned')).ok,true);assert.equal(guard(),false);assert.equal(f.service.authorize(command,context.parentFrame),false);return {state:'already-current'};});assert.equal((await f.handle()).ok,false);assert.equal((await f.handle()).ok,false);assert.equal(f.counts().bridgeCalls,1);
});
test('forged cancellation leaves the independently authorized action usable',async()=>{
 for(const patch of [{grantId:'other'},{mountId:'other'},{targetKey:'other'},{planRevision:2},{extra:true}]){const f=fixture();f.register();assert.equal((await f.service.cancelAction({...cancelMessage(f),...patch},'owned')).ok,false);assert.equal((await f.handle()).state,'already-current');}
 const f=fixture();f.register();assert.equal((await f.service.cancelAction(cancelMessage(f),'forged')).ok,false);assert.equal((await f.handle()).state,'already-current');
});
test('cancellation after completion cannot replay native action',async()=>{const f=fixture();f.register();assert.equal((await f.handle()).state,'already-current');assert.equal((await f.service.cancelAction(cancelMessage(f),'owned')).ok,true);assert.equal((await f.handle()).ok,false);assert.equal(f.counts().bridgeCalls,1);});
