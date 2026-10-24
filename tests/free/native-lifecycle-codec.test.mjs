import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyNativeFacts,validateNativeFacts,validateAndMeasureNativeFacts} from '../../src/data/native-facts.mjs';
import {applyNativeLifecycle,MAX_NATIVE_LIFECYCLE_RESULTS} from '../../src/data/native-lifecycle.mjs';
import {digest} from '../../src/data/hash.mjs';
import {scopeOf} from '../../simulator/data.mjs';
const scope=scopeOf('A');
function change(facts,i){const prior=facts.refLifecycle?.R,state=prior?.state==='deletion-confirmed'?'existence-confirmed':'deletion-confirmed';return {kind:'refs',id:'R',state,expectedVersion:prior?.version??0,fenceId:state==='existence-confirmed'?prior.fenceId:null,fenceVersion:state==='existence-confirmed'?prior.fenceVersion:null,resultFingerprint:digest('result-'+i),profileId:'fixture',profileVersion:1};}
test('bounded per-object result history refuses eviction, keeps oldest replay and exact size audit',()=>{
 let facts=emptyNativeFacts(scope),first=change(facts,0);
 for(let i=0;i<MAX_NATIVE_LIFECYCLE_RESULTS;i++)facts=applyNativeLifecycle(facts,change(facts,i));
 validateNativeFacts(facts,scope);assert.equal(facts.refLifecycle.R.results.length,64);assert.equal(validateAndMeasureNativeFacts(facts,scope).jsonLength,JSON.stringify(facts).length);
 assert.strictEqual(applyNativeLifecycle(facts,{...first,expectedVersion:facts.revision}),facts);
 assert.throws(()=>applyNativeLifecycle(facts,change(facts,65)),/native-lifecycle-results-capacity/);assert.equal(facts.revision,64);
 const bad=structuredClone(facts);bad.refLifecycle.R.results.shift();assert.throws(()=>validateNativeFacts({...bad,refLifecycle:{R:{...bad.refLifecycle.R,fenceId:first.resultFingerprint}}},scope),/missing-native-lifecycle-result/);
});
