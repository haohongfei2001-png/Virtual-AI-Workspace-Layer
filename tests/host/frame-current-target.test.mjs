import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeActions} from '../../src/host/native-actions.mjs';
import {createFrameNativePlans} from '../../src/host/frame-native-plans.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const currentId='33333333-3333-4333-8333-333333333333',otherId='44444444-4444-4444-8444-444444444444';
const href=id=>'https://chatgpt.com/c/'+id;
function fixture(){
 let url=href(currentId),proof={conversationId:currentId,bodyProofId:'body_proof_1',bodyEpoch:1},time=1000,authorize=async()=>true,checks=0,clicks=0;
 const actions=createNativeActions({discovery:{getNode:()=>{throw Error('resolved current target must not look up a native node');}},urlPolicy:createURLPolicy(),currentURL:()=>url,bodyProof:()=>proof,inputRisk:()=>({state:'unsaved',flags:['composer']}),authorize:async command=>{checks++;return authorize(command);},onNativeDispatch:()=>clicks++,now:()=>time});
 const plans=createFrameNativePlans({adapter:{...actions,currentURL:()=>url},bindingCurrent:()=> 'bound_document'});
 const issue=(id=currentId)=>plans.plan({targets:[{refId:id,navigationURL:href(id)}]})[0];
 const command=(issued,actionId='action_1')=>({actionId,uiGrantId:'ui_grant',mountId:'mount',planRevision:issued.plan.planRevision,targetKey:issued.targetKey});
 return {actions,issue,command,setProof:v=>{proof=v;},setURL:v=>{url=v;},setTime:v=>{time=v;},setAuthorize:v=>{authorize=v;},counts:()=>({checks,clicks})};
}
test('confirmed current conversation keeps same-target certificate through frame planning',async()=>{
 const f=fixture(),issued=f.issue();assert.equal(issued.refId,currentId);assert.equal(issued.plan.mode,'same-target');assert.equal(issued.plan.bodyProofId,'body_proof_1');assert.equal(issued.plan.target.liveHandle,null);assert.equal(issued.plan.target.navigationURL,href(currentId));assert.equal(f.actions.planKey(issued.plan),issued.targetKey);
 const result=await f.actions.dispatchNative(f.command(issued));assert.deepEqual(result,{state:'already-current',actionId:'action_1'});assert.deepEqual(f.counts(),{checks:2,clicks:0});
});
test('same-route missing, changed, or other-conversation proof blocks issued current plan',async()=>{
 for(const proof of [null,{conversationId:currentId,bodyProofId:'replacement',bodyEpoch:2},{conversationId:otherId,bodyProofId:'body_proof_1',bodyEpoch:1}]){
  const f=fixture(),issued=f.issue();f.setProof(proof);assert.deepEqual(await f.actions.dispatchNative(f.command(issued)),{state:'blocked',reason:'stale-navigation-plan'});assert.equal(f.counts().clicks,0);
 }
});
test('proof invalidation during async owner authorization cannot return already-current',async()=>{
 const f=fixture(),issued=f.issue();f.setAuthorize(async()=>{f.setProof(null);return true;});assert.equal((await f.actions.dispatchNative(f.command(issued))).state,'blocked');assert.equal(f.counts().clicks,0);
});
test('different conversation preserves current draft with new-tab href and cannot be dispatched',async()=>{
 const f=fixture(),issued=f.issue(otherId);assert.equal(issued.plan.mode,'href');assert.equal(issued.plan.disposition,'new-tab-preserve-current');assert.equal(issued.plan.target.nativeId,otherId);assert.equal(issued.plan.target.navigationURL,href(otherId));assert.deepEqual(await f.actions.dispatchNative(f.command(issued)),{state:'blocked',reason:'renderer-default-required'});assert.equal(f.counts().clicks,0);
});
test('same-target actionId is consumed once including blocked attempts and concurrent dispatch',async()=>{
 const f=fixture(),issued=f.issue(),command=f.command(issued);const results=await Promise.all([f.actions.dispatchNative(command),f.actions.dispatchNative(command)]);assert.deepEqual(results.map(r=>r.state).sort(),['already-current','blocked']);assert.equal(results.find(r=>r.state==='blocked').reason,'action-already-used');assert.deepEqual(f.counts(),{checks:2,clicks:0});
 const g=fixture(),stale=g.issue(),dto=g.command(stale);g.setProof(null);assert.equal((await g.actions.dispatchNative(dto)).state,'blocked');g.setProof({conversationId:currentId,bodyProofId:'body_proof_1',bodyEpoch:1});assert.deepEqual(await g.actions.dispatchNative(dto),{state:'blocked',reason:'action-already-used'});
});
test('current plan remains bounded by route, plan revision, owner permission and thirty seconds',async()=>{
 for(const change of ['route','ttl','owner','revision']){const f=fixture(),issued=f.issue(),command=f.command(issued);if(change==='route')f.setURL(href(otherId));if(change==='ttl')f.setTime(31000);if(change==='owner')f.setAuthorize(async()=>false);if(change==='revision')command.planRevision++;assert.equal((await f.actions.dispatchNative(command)).state,'blocked');assert.equal(f.counts().clicks,0);}
});
