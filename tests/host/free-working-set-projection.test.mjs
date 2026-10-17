import test from 'node:test';
import assert from 'node:assert/strict';
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {currentIndex} from '../../src/navigation/current-index.mjs';
import {projectFreeWorkingSet} from '../../src/runtime/free-working-set-projection.mjs';
function fixture(ids=['unknown','missing','none','old'],current='missing'){
 const refs=['old','none','unknown'].map((id,i)=>({id,scope:'scope',nativeTitle:'Native '+id,nativeUrl:'https://chatgpt.com/c/'+id,displayTitle:'PRO_NAME',displayName:'PRO_NAME',membership:i===0?'PROJECT':i===1?'NONE':'UNKNOWN',projectId:i===0?'p':null,freshness:'last-known',membershipFreshness:'last-known',activityDecision:{segment:i===0?80:null,secret:'PRIVATE_EVIDENCE'},anchor:{text:'PRIVATE_SNIPPET'}}));
 const snapshot=freeNavigationSnapshot({scope:'scope',viewMode:'free',refs,projects:[{id:'p',scope:'scope',nativeName:'Native P',members:['old']}],preferences:ids===null?{}:{workingSet:{value:{refs:ids,current}},savedSnippets:{value:[{refId:'old',text:'PRIVATE_SNIPPET'}]}}});
 return {snapshot,index:currentIndex(snapshot,snapshot.groups)};
}
test('working set retains exact manual order, unavailable references and current selection',()=>{
 const current=fixture(),before=JSON.stringify(current.snapshot),result=projectFreeWorkingSet(current);
 assert.deepEqual(result.items.map(row=>row.id),['unknown','missing','none','old']);assert.equal(result.currentRefId,'missing');assert.equal(result.total,4);assert.equal(result.hasMore,false);
 assert.deepEqual(result.items[1],{id:'missing',available:false,displayTitle:'暂时无法打开的引用',nativeTitle:null,nativeUrl:null,membership:'UNKNOWN',projectId:null});
 assert.equal(result.items[3].segment,80);assert.equal(result.items[2].membership,'NONE');assert.equal(result.items[0].membership,'UNKNOWN');assert.equal(result.items[3].freshness,'last-known');
 assert(!JSON.stringify(result).includes('PRIVATE_'));assert(!JSON.stringify(result).includes('PRO_NAME'));assert.equal(JSON.stringify(current.snapshot),before);
});
test('empty asset and absent preference produce explicit empty pages',()=>{
 for(const current of [fixture([],null),fixture(null)])assert.deepEqual(projectFreeWorkingSet(current),{items:[],total:0,offset:0,limit:24,hasMore:false,currentRefId:null});
});
test('bounded pages keep missing entries and currentRefId even outside selected page',()=>{
 const ids=Array.from({length:31},(_,i)=>'missing_'+i),current=fixture(ids,'missing_30');
 const first=projectFreeWorkingSet(current),last=projectFreeWorkingSet(current,{offset:24});assert.equal(first.items.length,24);assert.equal(first.total,31);assert.equal(first.hasMore,true);assert.equal(first.currentRefId,'missing_30');assert.equal(last.items.length,7);assert.equal(last.items[0].id,'missing_24');assert.equal(last.hasMore,false);assert(last.items.every(row=>row.available===false));
 assert.deepEqual(projectFreeWorkingSet(current,{offset:1000000}).items,[]);
});
test('strict request bounds, prepared provenance and scope-bound index are mandatory',()=>{
 const current=fixture();for(const query of [null,[],{offset:-1},{offset:1000001},{offset:1.5},{limit:0},{limit:25},{scope:'other'}])assert.throws(()=>projectFreeWorkingSet(current,query),/invalid-free-working-set-query/);
 assert.throws(()=>projectFreeWorkingSet({snapshot:{...current.snapshot},index:current.index}),/unprepared/);assert.throws(()=>projectFreeWorkingSet({snapshot:current.snapshot}),/missing-free-working-set-index/);
 assert.throws(()=>projectFreeWorkingSet({...current,index:{byId:id=>({id,scope:'foreign'})}}),/cross-scope-free-working-set/);
});
test('unavailable existing rows stay unavailable and UTF8 cap never truncates human/native assets',()=>{
 const current=fixture();current.index.byId('old').available=false;assert.equal(projectFreeWorkingSet(current).items.at(-1).available,false);
 current.index.byId('old').nativeTitle='中'.repeat(23000);assert.throws(()=>projectFreeWorkingSet(current),/free-working-set-page-too-large/);assert.equal(current.index.byId('old').nativeTitle.length,23000);
});
