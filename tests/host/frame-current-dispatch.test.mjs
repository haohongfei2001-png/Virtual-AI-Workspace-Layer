import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameNativePlans} from '../../src/host/frame-native-plans.mjs';
import {createNativeActions} from '../../src/host/native-actions.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const id='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+id;
function fixture(){
 let intent=0;let elapsed=0,wall=1800000000000,binding='binding',here=url,proof={conversationId:id,bodyProofId:'proof'},shows=0,authorizations=0,helper;
 const hooks={authorize(){},before(){},ack(){}};
 const actions=createNativeActions({discovery:{getNode:()=>null},urlPolicy:createURLPolicy({profile:{projectId:({container})=>container}}),currentURL:()=>here,bodyProof:()=>proof,now:()=>elapsed,authorize:async command=>{authorizations++;await hooks.authorize(command,authorizations);return helper.authorize(command);},beforeDispatch:()=>hooks.before()});
 const adapter={...actions,currentURL:()=>here,dispatchNative:async command=>{const result=await actions.dispatchNative(command);await hooks.ack(result);return result;}};
 helper=createFrameNativePlans({adapter,bindingCurrent:()=>binding,captureIntent:()=>{const captured=intent;return ()=>intent===captured;},now:()=>wall,elapsedNow:()=>elapsed,showReading:()=>{shows++;return true;}});
 const plan=()=>helper.plan({targets:[{refId:id,navigationURL:url}]} )[0];
 const row=plan(),command={actionId:'action',uiGrantId:'grant',mountId:'mount',planRevision:row.plan.planRevision,targetKey:row.targetKey};
 return {helper,adapter,hooks,command,row,plan,activate:(delta=6000,c=command)=>helper.activate({command:c,expiresAt:new Date(wall+delta).toISOString()}),advance:n=>{elapsed+=n;wall+=n;},intent:()=>{intent++;},binding:()=>{binding='other';},route:()=>{here='https://chatgpt.com/';},proof:()=>{proof={conversationId:id,bodyProofId:'replacement'};},stats:()=>({shows,authorizations})};
}
test('real same-target action loops through authorization twice before reading',async()=>{const h=fixture();assert.equal(h.row.plan.mode,'same-target');assert.equal(h.helper.authorize(h.command),false);assert.equal((await h.activate()).state,'already-current');assert.deepEqual(h.stats(),{shows:1,authorizations:2});assert.equal(h.helper.authorize(h.command),false);});
for(const change of ['proof','binding','route'])test(`${change} invalidation during second authorization never opens reading`,async()=>{const h=fixture();h.hooks.authorize=(_,n)=>{if(n===2)h[change]();};assert.equal((await h.activate()).state,'blocked');assert.equal(h.stats().shows,0);});
test('changed body proof before dispatch cannot reuse a same-target plan',async()=>{const h=fixture();h.proof();assert.equal((await h.activate()).state,'blocked');assert.equal(h.stats().shows,0);});
test('late already-current acknowledgement is fenced at six seconds',async()=>{const h=fixture();h.hooks.ack=()=>h.advance(6000);assert.notEqual((await h.activate()).state,'already-current');assert.equal(h.stats().shows,0);});
test('acknowledgement just before elapsed deadline remains valid',async()=>{const h=fixture();h.hooks.ack=()=>h.advance(5999);assert.equal((await h.activate()).state,'already-current');assert.equal(h.stats().shows,1);});
test('binding change after native acknowledgement cannot reveal reading',async()=>{const h=fixture();h.hooks.ack=()=>h.binding();assert.equal((await h.activate()).state,'blocked');assert.equal(h.stats().shows,0);});
test('consumed action cannot show reading twice',async()=>{const h=fixture();assert.equal((await h.activate()).state,'already-current');assert.equal((await h.activate()).state,'blocked');assert.equal(h.stats().shows,1);});
test('pending duplicate is refused while original remains independently authorized',async()=>{const h=fixture();let release,entered;const ready=new Promise(r=>entered=r);h.hooks.before=()=>{entered();return new Promise(r=>release=r);};const first=h.activate();await ready;assert.equal((await h.activate()).state,'blocked');assert.equal(h.helper.authorize(h.command),true);release();assert.equal((await first).state,'already-current');assert.equal(h.stats().shows,1);});
for(const delta of [6001,0,-1])test(`deadline ${delta} cannot dispatch`,async()=>{const h=fixture();assert.equal((await h.activate(delta)).state,'blocked');assert.deepEqual(h.stats(),{shows:0,authorizations:0});});
test('expired thirty second plan is rejected before authorization',async()=>{const h=fixture();h.advance(30000);assert.equal((await h.activate()).state,'blocked');assert.deepEqual(h.stats(),{shows:0,authorizations:0});});
for(const state of ['dispatched','unknown',undefined])test(`unexpected acknowledgement ${state} never opens reading`,async()=>{const h=fixture();const real=h.adapter.dispatchNative;h.adapter.dispatchNative=async c=>{await real(c);return {state};};assert.equal((await h.activate()).state,'blocked');assert.equal(h.stats().shows,0);});
test('unregistered non-current href plan cannot become same-target reading',async()=>{const h=fixture();h.route();const row=h.plan();assert.equal(row.plan.mode,'href');assert.equal((await h.activate(6000,{...h.command,planRevision:row.plan.planRevision,targetKey:row.targetKey})).state,'blocked');assert.equal(h.stats().shows,0);});
test('authorization requires the exact pending command tuple',async()=>{const h=fixture();h.hooks.before=()=>{for(const field of ['actionId','uiGrantId','mountId','targetKey'])assert.equal(h.helper.authorize({...h.command,[field]:'other'}),false);assert.equal(h.helper.authorize({...h.command,planRevision:h.command.planRevision+1}),false);};assert.equal((await h.activate()).state,'already-current');});

for(const stage of ['authorize','before','ack'])test(`intent invalidated during ${stage} never opens reading`,async()=>{const h=fixture();h.hooks[stage]=()=>h.intent();assert.equal((await h.activate()).state,'blocked');assert.equal(h.stats().shows,0);assert.equal(h.helper.authorize(h.command),false);});
