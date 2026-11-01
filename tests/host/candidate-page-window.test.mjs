import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidatePageWindow} from '../../src/host/candidate-page-window.mjs';

for(const count of [0,1,32,33,605,100000])test(`page window streams ${count} rows with at most 64 reference slots`,()=>{
 const lastOffset=Math.max(0,Math.floor((count-1)/32)*32);
 for(const offset of [...new Set([0,32,lastOffset,lastOffset+32,Number.MAX_SAFE_INTEGER-31])]){
  const window=createCandidatePageWindow(offset);
  assert.deepEqual(window.stats(),{retainedRows:0,total:0});
  for(let i=0;i<count;i++){
   window.add(i);
   const stats=window.stats();
   assert.equal(stats.total,i+1);
   assert(stats.retainedRows<=64);
  }
  const selectedOffset=Math.min(offset,lastOffset),length=Math.min(32,count-selectedOffset);
  assert.deepEqual(window.finish(),{items:Array.from({length},(_,i)=>selectedOffset+i),total:count,offset:selectedOffset,nextOffset:selectedOffset+length<count?selectedOffset+32:null});
 }
});

test('every row remains reachable by requesting all pages of a 605-row stream',()=>{
 const visited=[];
 for(let offset=0;offset<605;offset+=32){
  const window=createCandidatePageWindow(offset);
  for(let i=0;i<605;i++)window.add(i);
  visited.push(...window.finish().items);
 }
 assert.deepEqual(visited,Array.from({length:605},(_,i)=>i));
});

test('finish and stats copies cannot mutate stored array slots or counters',()=>{
 const window=createCandidatePageWindow(0);
 for(let i=0;i<33;i++)window.add({id:i});
 const first=window.finish();
 first.items.fill(null);first.items.push('injected');first.total=-1;first.offset=999;
 const stats=window.stats();stats.total=-1;stats.retainedRows=999;
 assert.deepEqual(window.finish().items.map(row=>row.id),Array.from({length:32},(_,i)=>i));
 assert.deepEqual(window.stats(),{retainedRows:33,total:33});
 const tail=createCandidatePageWindow(3200);tail.add('first');
 const snapshot=tail.finish();snapshot.items.length=0;
 assert.deepEqual(tail.finish().items,['first']);
 tail.add('second');
 assert.deepEqual(tail.finish().items,['first','second']);
 assert.deepEqual(snapshot.items,[]);
});

for(const offset of [undefined,null,-32,-1,1,31,33,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,'32',32n,{},[],true])test(`reject invalid offset ${String(offset)}`,()=>{
 assert.throws(()=>createCandidatePageWindow(offset),/invalid-candidate-offset/);
});
