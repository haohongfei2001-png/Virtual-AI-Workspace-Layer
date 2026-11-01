import test from 'node:test';
import assert from 'node:assert/strict';
import {currentIndex,currentIndexAsync} from '../../src/navigation/current-index.mjs';
function fixture(){
 const refs=['a','b','solo','tail'].map(id=>({id,nativeUrl:'https://example.test/c/'+(['a','b'].includes(id)?'shared':id)}));
 return {scope:'scope-A',refs,groups:[{id:'one',members:['a','b'],current:[refs[1],refs[0]],old:[],unknown:[]},{id:'two',members:['tail'],current:[],old:[refs[3]],unknown:[]}]};
}
function compare(actual,cold,snapshot){
 for(const raw of [...snapshot.refs.map(r=>r.nativeUrl),'https://example.test/c/shared?query=1#hash','https://example.test/c/missing']){
  const a=actual.at(raw),b=cold.at(raw);
  assert.equal(a.ref,b.ref);assert.equal(a.selected,b.selected);assert.equal(a.independent,b.independent);
  for(const group of snapshot.groups)assert.equal(a.inGroup(group),b.inGroup(group));
 }
 for(const ref of snapshot.refs)assert.equal(actual.byId(ref.id),ref);
}
function countURLs(run){const Original=globalThis.URL,calls=[];globalThis.URL=class extends Original{constructor(...args){calls.push(args[0]);super(...args);}};try{return {value:run(),calls};}finally{globalThis.URL=Original;}}
for(const [name,change] of [
 ['addition',s=>{s.refs.push({id:'new',nativeUrl:'https://example.test/c/new'});s.groups[1].unknown.push(s.refs.at(-1));s.groups[1].members.push('new');}],
 ['deletion',s=>{s.refs=s.refs.filter(r=>r.id!=='a');s.groups[0].members=['b'];s.groups[0].current=[s.refs.find(r=>r.id==='b')];}],
 ['reorder and duplicate URL',s=>{s.refs.reverse();s.groups.reverse();s.groups[1].current.reverse();}],
 ['membership movement',s=>{s.groups[0].members=['solo'];s.groups[0].current=[s.refs[2]];s.groups[1].members=['a','b'];s.groups[1].old=[s.refs[0],s.refs[1]];}],
])test('cached parsing rebuild equals cold routes after '+name,async()=>{
 const before=fixture(),prior=currentIndex(before,before.groups),next=structuredClone(before);change(next);
 const warm=currentIndex(next,next.groups,prior),cold=currentIndex(next,next.groups);
 compare(warm,cold,next);compare(await currentIndexAsync(next,next.groups,()=>true,prior),cold,next);
 assert.equal(prior.at('https://example.test/c/shared').ref,before.refs[0]);
 assert.equal(prior.at('https://example.test/c/shared').inGroup(before.groups[0]),before.refs[1]);
});
test('only new raw URL bytes parse again while all semantic lookup tables rebuild',()=>{
 const before=fixture(),prior=currentIndex(before,before.groups),next=structuredClone(before);
 next.refs.reverse();next.groups.reverse();next.groups[1].current.reverse();
 const reused=countURLs(()=>currentIndex(next,next.groups,prior));assert.equal(reused.calls.length,0);
 next.refs.push({id:'new',nativeUrl:'https://example.test/c/new'});
 next.refs[0]={...next.refs[0],nativeUrl:next.refs[0].nativeUrl+'?changed=1'};
 const added=countURLs(()=>currentIndex(next,next.groups,prior));
 assert.deepEqual(added.calls.slice().sort(),[next.refs[0].nativeUrl,'https://example.test/c/new'].sort());
 compare(added.value,currentIndex(next,next.groups),next);
});
test('cross-scope and forged previous indexes are rejected instead of importing routes',async()=>{
 const before=fixture(),prior=currentIndex(before,before.groups),other=structuredClone(before);other.scope='scope-B';
 assert.throws(()=>currentIndex(other,other.groups,prior),/cross-scope-index/);
 await assert.rejects(currentIndexAsync(other,other.groups,()=>true,prior),/cross-scope-index/);
 for(const fake of [{},{...prior},Object.create(prior)]){
  assert.throws(()=>currentIndex(before,before.groups,fake),/unverified-index-cache/);
  await assert.rejects(currentIndexAsync(before,before.groups,()=>true,fake),/unverified-index-cache/);
 }
 compare(prior,currentIndex(before,before.groups),before);
});
test('cancelled rebuild leaves previous parsing certificate usable and retry reconstructs current refs',async()=>{
 const before={scope:'scope-A',refs:Array.from({length:600},(_,i)=>({id:'r'+i,nativeUrl:'https://example.test/c/'+i})),groups:[]},prior=currentIndex(before,[]),next=structuredClone(before);
 next.refs.reverse();next.refs.push({id:'new',nativeUrl:'https://example.test/c/new'});
 await assert.rejects(currentIndexAsync(next,[],()=>false,prior),/stale-client-response/);
 let checks=0;await assert.rejects(currentIndexAsync(next,[],()=>++checks<2,prior),/stale-client-response/);assert.equal(checks,2);
 assert.equal(prior.at(before.refs[599].nativeUrl).ref,before.refs[599]);assert.equal(prior.byId('new'),undefined);
 const retried=await currentIndexAsync(next,[],()=>true,prior);compare(retried,currentIndex(next,[]),next);
 const counted=countURLs(()=>currentIndex(next,[],prior));assert.deepEqual(counted.calls,['https://example.test/c/new']);
});
