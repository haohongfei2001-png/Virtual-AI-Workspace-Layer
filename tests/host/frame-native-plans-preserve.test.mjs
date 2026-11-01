import test from 'node:test';import assert from 'node:assert/strict';
import {createFrameNativePlans} from '../../src/host/frame-native-plans.mjs';
import {createNativeActions} from '../../src/host/native-actions.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const C='33333333-3333-4333-8333-333333333333';
const targets=[{refId:C,navigationURL:'https://chatgpt.com/c/'+C},{projectId:'p1',navigationURL:'https://chatgpt.com/g/p1/project'}];
function fixture(state='clear'){
 const issued=[],lookups=[],actions=createNativeActions({discovery:{getNode:()=>null},urlPolicy:createURLPolicy({profile:{projectId:({container})=>container}}),currentURL:()=> 'https://chatgpt.com/',inputRisk:()=>({state,flags:state==='clear'?[]:['composer']})});
 const helper=createFrameNativePlans({bindingCurrent:()=> 'doc:route',adapter:{currentURL:()=> 'https://chatgpt.com/',planNavigation:target=>{const plan=actions.planNavigation(target);issued.push(plan);return plan;},planKey:plan=>{lookups.push(plan);return actions.planKey(plan);}}});return {helper,issued,lookups,actions};
}
test('empty-composer conversation and project hrefs preserve current frame despite raw same-tab plan',()=>{
 const f=fixture(),rows=f.helper.plan({targets});assert.equal(rows.length,2);
 for(let i=0;i<2;i++){const original=f.issued[i],before=structuredClone(original);assert.equal(original.mode,'href');assert.equal(original.disposition,'same-tab');assert.equal(rows[i].plan.mode,'href');assert.equal(rows[i].plan.disposition,'new-tab-preserve-current');assert.notEqual(rows[i].plan,original);assert.equal(f.lookups[i],original);assert.equal(rows[i].targetKey,f.actions.planKey(original));assert.ok(rows[i].targetKey);assert.deepEqual(original,before);assert.deepEqual(rows[i].plan.target,original.target);assert.equal(rows[i].plan.planRevision,original.planRevision);}
 assert.equal(rows[0].plan.target.entity,'conversation');assert.equal(rows[1].plan.target.entity,'project');
});
test('unknown-risk existing new-tab plan remains semantically unchanged with original issued key',()=>{const f=fixture('unknown'),rows=f.helper.plan({targets});for(let i=0;i<2;i++){assert.equal(f.issued[i].disposition,'new-tab-preserve-current');assert.deepEqual(rows[i].plan,f.issued[i]);assert.equal(f.lookups[i],f.issued[i]);assert.equal(rows[i].targetKey,f.actions.planKey(f.issued[i]));}});
test('unavailable original URL-policy results are never promoted into href or registered keys',()=>{const f=fixture();const rows=f.helper.plan({targets:[{refId:C,navigationURL:'https://evil.test/c/'+C},{projectId:'p1',navigationURL:'https://chatgpt.com/g/p2/project'}]});for(let i=0;i<2;i++){assert.equal(rows[i].plan.mode,'unavailable');assert.equal(rows[i].plan,f.issued[i]);assert.equal(rows[i].targetKey,null);assert.equal(Object.hasOwn(rows[i].plan,'disposition'),false);}});
test('normalizing frozen issued href does not mutate owner plan or resolve key from a clone',()=>{let issued;const registry=new WeakMap();const helper=createFrameNativePlans({bindingCurrent:()=> 'doc',adapter:{currentURL:()=> 'https://chatgpt.com/',planNavigation:target=>{issued=Object.freeze({mode:'href',disposition:'same-tab',planRevision:9,target:Object.freeze(target)});registry.set(issued,'original-key');return issued;},planKey:plan=>{assert.equal(plan,issued);return registry.get(plan);}}});const [row]=helper.plan({targets:[targets[0]]});assert.equal(row.targetKey,'original-key');assert.equal(row.plan.disposition,'new-tab-preserve-current');assert.equal(issued.disposition,'same-tab');});
