import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFreePages} from '../../src/data/free-page-loader.mjs';
import {freeReplicaRequests,planFreeReplica,assembleFreeReplica} from '../../src/data/free-replica.mjs';
const ids=(prefix,n)=>Array.from({length:n},(_,i)=>prefix+i);
const size=request=>request.projects.length+request.refs.length;
const fakePage=request=>({scope:'A',revision:3,evidenceRevision:2,projects:request.projects.map(id=>({id,scope:'A',nativeName:id})),refs:request.refs.map(id=>({id,scope:'A',nativeTitle:id,membership:'NONE'}))});
for(const reason of ['native-page-too-large','free-evidence-page-too-large'])test(`adaptive ${reason} splits only failed page and preserves 5000 ID mixed order`,async()=>{
 const plan={projects:ids('p',37),refs:ids('r',4963)},requests=freeReplicaRequests(plan,5000);requests.push({projects:['tail-project'],refs:['tail-ref']});const calls=[];
 const pages=await loadFreePages({requests,load:async request=>{calls.push(structuredClone(request));return size(request)>1000?{ok:false,reason}:{ok:true,page:fakePage(request)};}});
 assert.deepEqual(pages.flatMap(p=>p.projects.map(r=>r.id)),[...plan.projects,'tail-project']);assert.deepEqual(pages.flatMap(p=>p.refs.map(r=>r.id)),[...plan.refs,'tail-ref']);
 assert.equal(calls.filter(c=>c.projects.includes('tail-project')).length,1);assert.deepEqual(calls.at(-1),requests.at(-1));assert.ok(calls.length<=2*5000-1+1);assert.ok(calls.length<=requests.length+128);
 assert.equal(new Set(pages.flatMap(p=>p.refs.map(r=>r.id))).size,4964);
});
test('single oversized item terminates once with explicit failure',async()=>{
 let calls=0;await assert.rejects(loadFreePages({requests:[{projects:[],refs:['large']}],load:async()=>{calls++;return {ok:false,reason:'free-evidence-page-too-large'};}}),/free-single-item-too-large/);assert.equal(calls,1);
});
for(const reason of ['offline','stale-free-page','snapshot-revision-changed','unverified-scope','corrupt-native-piece','free-evidence-too-large'])test(`non-page-size error ${reason} is not retried or split`,async()=>{
 let calls=0;await assert.rejects(loadFreePages({requests:[{projects:['p'],refs:['r1','r2']}],load:async()=>{calls++;return {ok:false,reason};}}),new RegExp(reason));assert.equal(calls,1);
});
test('thrown transport failure is not retried',async()=>{
 let calls=0;await assert.rejects(loadFreePages({requests:[{projects:[],refs:['a','b']}],load:async()=>{calls++;throw Error('transport-unavailable');}}),/transport-unavailable/);assert.equal(calls,1);
});
test('global split budget bounds malicious repeated page-size failure across initial requests',async()=>{
 let calls=0;const requests=Array.from({length:100},(_,i)=>({projects:[],refs:['a'+i,'b'+i]}));
 await assert.rejects(loadFreePages({requests,load:async request=>{calls++;return size(request)>1?{ok:false,reason:'native-page-too-large'}:{ok:true,page:fakePage(request)};}}),/free-page-split-budget/);
 assert.ok(calls<=requests.length+128,`bounded initial calls plus 64 splits: ${calls}`);
});
test('guard rejects before any request and after delayed response without returning partial pages',async()=>{
 let calls=0;await assert.rejects(loadFreePages({requests:[{projects:[],refs:['a']}],guard:()=>false,load:async r=>{calls++;return {ok:true,page:fakePage(r)};}}));assert.equal(calls,0);
 let active=true;await assert.rejects(loadFreePages({requests:[{projects:[],refs:['a']},{projects:[],refs:['b']}],guard:()=>active,load:async r=>{calls++;active=false;return {ok:true,page:fakePage(r)};}}));assert.equal(calls,1);
});
test('guard turning stale on split denial prevents child requests',async()=>{
 let active=true,calls=0;await assert.rejects(loadFreePages({requests:[{projects:[],refs:['a','b']}],guard:()=>active,load:async()=>{calls++;active=false;return {ok:false,reason:'native-page-too-large'};}}));assert.equal(calls,1);
});
for(const mismatch of ['scope','revision','evidenceRevision'])test(`assembled adaptive pages still reject changed ${mismatch}`,async()=>{
 const header={scope:'A',revision:3,evidenceRevision:2,manifest:{projectVersions:{},refVersions:{r0:1,r1:1}},viewSession:{H:30,T:1,Z:'UTC'}},plan=planFreeReplica(null,header);
 const pages=await loadFreePages({requests:freeReplicaRequests(plan),load:async r=>size(r)>1?{ok:false,reason:'native-page-too-large'}:{ok:true,page:{...fakePage(r),[mismatch]:mismatch==='scope'?'B':999}}});
 assert.throws(()=>assembleFreeReplica(null,header,pages,plan),/stale-free-page/);
});
test('empty plan makes no load calls',async()=>{
 let calls=0;assert.deepEqual(await loadFreePages({requests:[],load:async()=>{calls++;}}),[]);assert.equal(calls,0);
});
