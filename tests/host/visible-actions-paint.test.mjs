import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

// Execute the runner's collector and assertions without starting its browser.
// Keep one implementation of the paint contract; DOM doubles supply observations.
const source=await readFile(new URL('./visible-actions-package-browser.mjs',import.meta.url),'utf8');
const start=' async function visibleLabel(label){',end=' async function visibleSidebarAction(){';
assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);
const body=source.slice(source.indexOf(start),source.indexOf(end));
const label='已保存片段';
const rect=(x,y,width,height)=>({x,y,width,height,left:x,top:y,right:x+width,bottom:y+height});

function fixture(samples){
 let current=null,at=-1,waits=0,timer=0;const timers=new Set(),nodes=new Map(),report={steps:[]};
 const shadow={querySelector:selector=>selector==='.workspace'?{}:null,querySelectorAll:()=>current?[current]:[],elementFromPoint:()=>samples[at].hit===false?null:current};
 const root={shadowRoot:shadow};
 const document={
  querySelectorAll:()=>Array.from({length:samples[at].roots??1},()=>root),
  createRange(){let selected;return {selectNodeContents:n=>{selected=n;},getClientRects:()=>{const value=rect(selected.x+10,116,60,14);return [{...value,toJSON:()=>value}];}};},
 };
 const sandbox={assert,report,document,innerWidth:420,innerHeight:700,performance:{now:()=>0,timeOrigin:1000},
  getComputedStyle:n=>n.style,
  setTimeout(){const id=++timer;timers.add(id);return id;},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame(fn){
   assert(++at<samples.length,'collector exceeded supplied paint observations');const sample=samples[at],id=sample.node??'original';
   if(!nodes.has(id))nodes.set(id,{textContent:label,scrollWidth:80,clientWidth:80,getAttribute:key=>key==='aria-label'?label:null,getRootNode:()=>shadow,contains:()=>false,getBoundingClientRect(){const value=rect(this.x,106,80,34);return {...value,toJSON:()=>value};}});
   current=nodes.get(id);Object.assign(current,{isConnected:sample.connected!==false,x:sample.x??217.359375,style:{display:sample.display??'block',visibility:sample.visibility??'visible'}});fn(sample.time);
  },
  frames:{workspace:{getByRole(role,options){assert.equal(role,'button');assert.equal(options.name,label);assert.equal(options.exact,true);return {waitFor:async options=>{waits++;assert.equal(options.state,'visible');assert.equal(options.timeout,30000);}};},evaluate:(fn,value)=>fn(value)}},
 };
 const run=runInNewContext(body+'\nvisibleLabel',sandbox);
 return {run:()=>run(label),report,callbacks:()=>at+1,waits:()=>waits,timers};
}

test('stable current label passes with retained or replaced owned node',async()=>{
 for(const replaced of [false,true]){
  const f=fixture([{time:10},{time:26,node:replaced?'replacement':'original'}]);await f.run();
  assert.equal(f.report.steps[0].sameNode,!replaced);assert.equal(f.report.steps[0].paintSamples.length,2);assert.equal(f.callbacks(),2);assert.equal(f.waits(),1);assert.equal(f.timers.size,0);
 }
});

test('replacement during a repeated timestamp remains diagnostic and still needs a later paint',async()=>{
 const f=fixture([{time:10},{time:10,node:'replacement'},{time:26,node:'replacement'}]);await f.run();
 assert.equal(f.report.steps[0].sameNode,false);assert.equal(f.report.steps[0].paintSamples.length,3);assert.equal(f.callbacks(),3);
});

test('a replacement cannot hide stale, invisible, unhit, ambiguous or moving control samples',async()=>{
 for(const [change,reason]of [
  [{connected:false},/current owner/],
  [{visibility:'hidden'},/remain visible/],
  [{display:'none'},/remain visible/],
  [{hit:false},/native hit target/],
  [{roots:2},/current owner/],
  [{x:218.359375},/rect must stay stable/],
 ]){
  const f=fixture([{time:10},{time:26,node:'replacement',...change}]);await assert.rejects(f.run(),reason);
  assert.equal(f.callbacks(),2);assert.equal(f.waits(),1);assert.equal(f.timers.size,0);
 }
});

test('node replacements do not extend the eight-callback distinct-paint bound',async()=>{
 const f=fixture(Array.from({length:8},(_,i)=>({time:10,node:String(i)})));
 await assert.rejects(f.run(),/two distinct paint opportunities/);assert.equal(f.callbacks(),8);assert.equal(f.report.steps[0].paintCallbackLimit,8);assert.equal(f.timers.size,0);
});
