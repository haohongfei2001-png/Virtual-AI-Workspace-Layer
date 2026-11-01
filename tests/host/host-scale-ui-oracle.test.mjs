import test from 'node:test';
import assert from 'node:assert/strict';
import {checkHostScaleSearchPage} from './fixtures/host-scale-ui-oracle.mjs';
const row=i=>({id:'60000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),title:'原生压力聊天 '+String(i).padStart(6,'0')+' · 长中文标题与 English mixed 内容用于尾部原名检索及实际可达验证，不代表真实聊天。'});
const input=()=>({rows:Array.from({length:24},(_,i)=>row(i)),size:1000,query:'原生压力聊天'});
test('independent UI oracle accepts two exact-size native-name pages without assuming production order',()=>{
 const first=input();first.rows.reverse();const ids=checkHostScaleSearchPage(first),second={...input(),rows:Array.from({length:24},(_,i)=>row(i+24)),excludedIds:ids};assert.equal(checkHostScaleSearchPage(second).length,24);
});
test('foreign IDs that passed old two-page shape checks now fail',()=>{
 const first=Array.from({length:24},(_,i)=>'foreign-'+i),second=Array.from({length:24},(_,i)=>'foreign-'+(i+24));
 assert(first.length>0&&first.length<=24&&second.length>0&&second.length<=24&&second.every(id=>!first.includes(id))&&new Set(second).size===second.length);
 const value=input();value.rows=first.map((id,i)=>({...row(i),id}));assert.throws(()=>checkHostScaleSearchPage(value),/foreign-id/);
});
test('each page requires all 24 expected rows, not a one-row substitute',()=>{
 for(const count of [0,1,23,25])assert.throws(()=>checkHostScaleSearchPage({...input(),rows:Array.from({length:count},(_,i)=>row(i))}),/page-cardinality/);
});
test('duplicate first-page rows and cross-page reuse fail independently',()=>{
 const first=input();first.rows[1]=first.rows[0];assert.throws(()=>checkHostScaleSearchPage(first),/duplicate-id/);
 assert.throws(()=>checkHostScaleSearchPage({...input(),excludedIds:[row(0).id]}),/page-overlap/);
});
test('wrong original title, swapped titles, out-of-world index and wrong query fail',()=>{
 const wrong=input();wrong.rows[0].title='plausible foreign result';assert.throws(()=>checkHostScaleSearchPage(wrong),/title-mismatch/);
 const swapped=input();[swapped.rows[0].title,swapped.rows[1].title]=[swapped.rows[1].title,swapped.rows[0].title];assert.throws(()=>checkHostScaleSearchPage(swapped),/title-mismatch/);
 const outside=input();outside.rows[0]=row(1000);assert.throws(()=>checkHostScaleSearchPage(outside),/foreign-id/);
 assert.throws(()=>checkHostScaleSearchPage({...input(),query:'does not exist'}),/query-mismatch/);
});
test('exact tail query requires its original ID/title and exactly one row',()=>{
 assert.deepEqual(checkHostScaleSearchPage({rows:[row(999)],size:1000,query:row(999).title,expectedCount:1}),[row(999).id]);
 assert.throws(()=>checkHostScaleSearchPage({rows:[row(998)],size:1000,query:row(999).title,expectedCount:1}),/query-mismatch/);
});
