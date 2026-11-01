import test from 'node:test';
import assert from 'node:assert/strict';
import {readUI06StableDocuments,createUI06Deadline,reduceUI06Key} from './ui06-keyboard-ax.mjs';
const snapshot=()=>['parent','workspace','sidebar'].map(document=>({document,keys:document==='parent'?1:0,key:document==='parent'?{trusted:true,direction:'Tab',target:'composer'}:null,focus:document==='parent'?'composer':'owned-control',open:document==='parent'?0:null,events:[],overflow:false,hasFocus:document==='parent',ups:0,up:null}));
const deadline=()=>createUI06Deadline({now:()=>0});
// All rounds are full snapshots, never reset/filtered event deltas.
function rounds(values){let calls=0;return {readRound:async()=>{assert(calls<values.length,'unexpected extra read');return structuredClone(values[calls++]);},calls:()=>calls};}
// Each trace entry is the complete three-document snapshot for one round.
function traceDocuments(trace){assert(trace.every(item=>Array.isArray(item)&&item.length===3));return trace;}
test('two independently allocated equal complete rounds settle, with both retained in trace',async()=>{
 const a=snapshot(),input=rounds([a,a]),trace=[];
 const result=await readUI06StableDocuments({...input,deadline:deadline(),trace});
 assert.equal(input.calls(),2);assert.deepEqual(result,a);assert.deepEqual(traceDocuments(trace),[a,a]);
});
for(const index of [0,1,2])test('changing '+['parent','workspace','sidebar'][index]+' requires a new consecutive equal pair',async()=>{
 const a=snapshot(),b=structuredClone(a);b[index].hasFocus=!b[index].hasFocus;
 const input=rounds([a,b,b]),trace=[];assert.deepEqual(await readUI06StableDocuments({...input,deadline:deadline(),trace}),b);assert.equal(input.calls(),3);assert.deepEqual(traceDocuments(trace),[a,b,b]);
});
test('nonconsecutive equal rounds cannot establish stability',async()=>{
 const a=snapshot(),b=structuredClone(a);b[2].ups=1;b[2].up={trusted:true,direction:'Tab',target:'owned-control'};
 const input=rounds([a,b,a,a]),trace=[];assert.deepEqual(await readUI06StableDocuments({...input,deadline:deadline(),trace}),a);assert.equal(input.calls(),4);assert.deepEqual(traceDocuments(trace),[a,b,a,a]);
});
test('default maximum eight changing complete rounds fail without discarding evidence',async()=>{
 const values=Array.from({length:8},(_,i)=>{const a=snapshot();a[0].events=Array.from({length:i},()=>({target:'composer',open:0}));return a;}),input=rounds(values),trace=[];
 await assert.rejects(readUI06StableDocuments({...input,deadline:deadline(),trace}));assert.equal(input.calls(),8);assert.deepEqual(traceDocuments(trace),values);
});
test('custom round cap is enforced even when next round would have stabilized',async()=>{
 const a=snapshot(),b=structuredClone(a);b[1].hasFocus=true;const input=rounds([a,b,b]),trace=[];
 await assert.rejects(readUI06StableDocuments({...input,deadline:deadline(),trace,maxRounds:2}));assert.equal(input.calls(),2);assert.deepEqual(traceDocuments(trace),[a,b]);
});
test('maxRounds one is invalid before any observation',async()=>{
 let calls=0;const trace=[];await assert.rejects(readUI06StableDocuments({readRound:async()=>{calls++;return snapshot();},deadline:deadline(),trace,maxRounds:1}));assert.equal(calls,0);assert.deepEqual(trace,[]);
});
test('already expired shared phase deadline permits no reads',async()=>{
 let time=0,calls=0;const d=createUI06Deadline({now:()=>time,limit:10});time=10;await assert.rejects(readUI06StableDocuments({readRound:async()=>{calls++;return snapshot();},deadline:d,trace:[]}),/deadline/);assert.equal(calls,0);
});
test('deadline consumed by the second read cannot return a stable snapshot',async()=>{
 let time=0,calls=0;const d=createUI06Deadline({now:()=>time,limit:10}),trace=[];
 await assert.rejects(readUI06StableDocuments({readRound:async()=>{calls++;time=calls===1?5:10;return snapshot();},deadline:d,trace}),/deadline/);assert.equal(calls,2);
 assert.deepEqual(traceDocuments(trace)[0],snapshot(),'earlier completed evidence remains');
});
test('stable unsafe key provenance is returned intact and original reducer rejects it',async()=>{
 const unsafe=snapshot();unsafe[0].key.trusted=false;const input=rounds([unsafe,unsafe]),trace=[];
 const result=await readUI06StableDocuments({...input,deadline:deadline(),trace});assert.deepEqual(result,unsafe);assert.deepEqual(traceDocuments(trace),[unsafe,unsafe]);assert.throws(()=>reduceUI06Key({before:0,after:0,direction:'Tab',documents:result}),/untrusted/);
});
test('stable duplicate keydown remains duplicate for the original reducer',async()=>{
 const unsafe=snapshot();unsafe[1].keys=1;unsafe[1].key={trusted:true,direction:'Tab',target:'owned-control'};const trace=[],input=rounds([unsafe,unsafe]);
 const result=await readUI06StableDocuments({...input,deadline:deadline(),trace});assert.deepEqual(result,unsafe);assert.throws(()=>reduceUI06Key({before:0,after:0,direction:'Tab',documents:result}),/duplicated/);
});
