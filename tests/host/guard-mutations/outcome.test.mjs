import test from 'node:test';import assert from 'node:assert/strict';
import {baselinePass,classifyMutant} from './outcome.mjs';
const run=(patch={})=>({exitCode:1,signal:null,records:[{name:'target',type:'test:fail',code:'ERR_ASSERTION'}],...patch});
test('only designated assertion failure is a kill',()=>assert.equal(classifyMutant(run(),'target'),'KILLED'));
for(const [name,patch] of [
 ['import failure',{records:[{name:'file.mjs',type:'test:fail',code:'ERR_MODULE_NOT_FOUND'}]}],
 ['unrelated assertion',{records:[{name:'other',type:'test:fail',code:'ERR_ASSERTION'}]}],
 ['unexpected runtime error',{records:[{name:'target',type:'test:fail',code:'ERR_TEST_FAILURE'}]}],
 ['timeout',{error:'ETIMEDOUT'}],['signal',{signal:'SIGTERM'}],
 ['skipped target',{records:[{name:'target',type:'test:fail',code:'ERR_ASSERTION',skip:true}]}],
 ['extra failure',{records:[{name:'target',type:'test:fail',code:'ERR_ASSERTION'},{name:'other',type:'test:fail',code:'ERR_ASSERTION'}]}],
 ['no selected tests',{exitCode:0,records:[]}],['wrong exit',{exitCode:2}]
])test(name+' is never a kill',()=>assert.equal(classifyMutant(run(patch),'target'),'INVALID_FAILURE'));
test('survivor must pass the designated non-skipped case',()=>{const r=run({exitCode:0,records:[{name:'target',type:'test:pass'}]});assert(baselinePass(r,'target'));assert.equal(classifyMutant(r,'target'),'SURVIVED');assert(!baselinePass({...r,records:[]},'target'));});
