import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readIdleBootstrapFacts,idleEvaluationFailure} from './natural-worker-idle-bootstrap.mjs';
import {idleBootstrapAction} from './natural-worker-idle-oracle.mjs';

function fixture(){return {location:{href:'http://127.0.0.1/'},document:{
 documentElement:null,activeElement:null,readyState:'loading',visibilityState:'visible',
 hasFocus:()=>true,querySelector:()=>null,querySelectorAll:()=>[],
}};}
const read=page=>runInNewContext(`(${readIdleBootstrapFacts.toString()})()`,page);
test('new parsing document without an HTML root remains pending instead of aborting bootstrap',()=>{
 const page=fixture(),facts=read(page);
 assert.equal(facts.rootPresent,false);assert.equal(facts.state,null);assert.equal(facts.reason,null);
 assert.equal(idleBootstrapAction(facts,'chrome-extension://fixture/'),'WAIT');
 page.document.documentElement={dataset:{vaiwlState:'waiting',vaiwlReason:'fresh-context-required'}};
 page.document.readyState='complete';const next=read(page);
 assert.equal(next.rootPresent,true);assert.equal(next.state,'waiting');
 assert.equal(next.reason,'fresh-context-required');assert.equal(idleBootstrapAction(next,'chrome-extension://fixture/'),'WAIT');
});
test('missing root never grants readiness even if other observer fields are complete',()=>{
 const facts={readyState:'complete',rootPresent:false,visibility:'visible',returnCount:0,open:2,
  frames:['workspace','sidebar'].map(role=>({src:'chrome-extension://fixture/'+role+'.html',connected:true}))};
 assert.equal(idleBootstrapAction(facts,'chrome-extension://fixture/'),'WAIT');
});
test('unexpected page query failures remain failures rather than being converted into waits',()=>{
 const page=fixture();page.document.documentElement={dataset:{}};
 page.document.querySelectorAll=()=>{throw Error('synthetic-selector-failure');};
 assert.throws(()=>read(page),/synthetic-selector-failure/);
});
test('page evaluation failure retains bounded original details without retrying or swallowing it',()=>{
 const error=idleEvaluationFailure({text:'Uncaught',exception:{description:'TypeError: missing root'},lineNumber:3,columnNumber:8});
 assert.match(error.message,/TypeError: missing root/);assert.match(error.message,/"line":3/);
 const bounded=idleEvaluationFailure({text:'x'.repeat(1000),exception:{description:'y'.repeat(2000)}});
 assert(bounded.message.length<1100);
});
