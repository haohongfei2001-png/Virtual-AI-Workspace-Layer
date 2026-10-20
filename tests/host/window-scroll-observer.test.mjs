import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {observeWindowScroll} from './window-scroll-observer.mjs';
for(const replace of [false,true])test('scroll observation follows current viewport without repeating gesture '+replace,async()=>{
 let writes=0,frames=0;const root={querySelector:()=>current,querySelectorAll:()=>[]};let top=30;
 const node={getRootNode:()=>root,get scrollTop(){return this.isConnected?top:0;},set scrollTop(v){writes++;top=v;},clientHeight:100,scrollHeight:1000,isConnected:true};let current=node;
 const result=await vm.runInNewContext('('+observeWindowScroll.toString()+')()',{document:root,getComputedStyle:()=>({overflowY:'auto'}),requestAnimationFrame:fn=>{if(++frames===2&&replace){current={scrollTop:top,clientHeight:100,scrollHeight:1000,isConnected:true};node.isConnected=false;}queueMicrotask(fn);}});
 assert.equal(writes,1);assert.equal(frames,2);assert.equal(result.assigned.top,150);assert.equal(result.after.top,150);assert.equal(result.after.connected,true);if(replace)assert.equal(result.originalAfter.connected,false);
});
test('missing replacement is not treated as scroll success',async()=>{
 const node={scrollTop:0,clientHeight:100,scrollHeight:1000,isConnected:true};let frames=0,current=node;
 const result=await vm.runInNewContext('('+observeWindowScroll.toString()+')()',{document:{querySelector:()=>current,querySelectorAll:()=>[]},getComputedStyle:()=>({overflowY:'auto'}),requestAnimationFrame:fn=>{if(++frames===2)current=null;queueMicrotask(fn);}});assert.equal(result.after,null);
});
test('missing viewport performs no synthetic scroll',async()=>{
 const result=await vm.runInNewContext('('+observeWindowScroll.toString()+')()',{document:{querySelector:()=>null,querySelectorAll:()=>[]}});assert.equal(result.before,null);assert.equal(result.after,null);
});
