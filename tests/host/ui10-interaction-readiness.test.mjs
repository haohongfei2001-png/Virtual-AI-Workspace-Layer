import test from 'node:test';import assert from 'node:assert/strict';import {readUi10Geometry,ui10InitialSearchReady} from './ui10-interaction-readiness.mjs';
const box=()=>({connected:true,visible:true,rect:{width:420,height:520,left:0,right:420},viewport:{width:420,height:520},scrollWidth:420,clientWidth:420,fontFamily:'Arial'});
test('actual positive box accepted',async()=>assert.equal((await readUi10Geometry({evaluate:async()=>box()})).rect.width,420));
test('detached/zero render commit retried within same deadline',async()=>{let t=0,calls=0;const good=box();assert.deepEqual(await readUi10Geometry({evaluate:async()=>++calls<3?{...good,connected:false,rect:{...good.rect,width:0}}:good},{now:()=>t,pause:async ms=>t+=ms}),good);assert.equal(calls,3);assert.equal(t,100);});
test('persistent zero geometry fails within original budget',async()=>{let t=0;await assert.rejects(readUi10Geometry({evaluate:async()=>({...box(),visible:false})},{now:()=>t,pause:async ms=>t+=ms,budgetMs:100}),/no-visible-positive/);assert.equal(t,100);});
for(const bad of [{scrollWidth:500},{fontFamily:'Times New Roman'},{rect:{width:500,height:520,left:0,right:500}}])test('real positive geometry defect not retried '+JSON.stringify(bad),async()=>{let calls=0;await assert.rejects(readUi10Geometry({evaluate:async()=>{calls++;return {...box(),...bad};}}));assert.equal(calls,1);});
test('search requires initial owner result not merely mounted input',()=>{const s={present:true,connected:true,value:'',loading:false,resultText:'results'};assert(ui10InitialSearchReady(s));for(const patch of [{present:false},{connected:false},{value:'stale'},{loading:true},{resultText:null}])assert(!ui10InitialSearchReady({...s,...patch}));});
test('positive overflow failure preserves exact observed geometry for diagnosis',async()=>{const observed={...box(),scrollWidth:435,clientWidth:420,scrollbarWidth:0,overflowX:'auto'};await assert.rejects(readUi10Geometry({evaluate:async()=>observed}),error=>{assert.equal(error.message,'panel must not hide horizontal overflow');assert.deepEqual(error.ui10Geometry,observed);return true;});});

test('locator timeout retains last observed hidden geometry without retrying the error',async()=>{
 const hidden={...box(),visible:false},failure=Error('locator timeout');let calls=0,t=0;
 await assert.rejects(readUi10Geometry({evaluate:async()=>{if(++calls===1)return hidden;throw failure;}},{now:()=>t,pause:async ms=>t+=ms}),error=>error===failure&&error.ui10Geometry===hidden);assert.equal(calls,2);
});
