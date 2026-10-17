import test from 'node:test';
import assert from 'node:assert/strict';
import {currentIndex} from '../../src/navigation/current-index.mjs';
function fixture(){
 const refs=['a','b','solo','d','e','f','g'].map(id=>({id,nativeUrl:'https://example.test/c/'+(['a','b'].includes(id)?'shared':id),nativeTitle:'old '+id,activity:{candidateDay:1}})),byId=new Map(refs.map(r=>[r.id,r]));
 const groups=[{id:'one',name:'old group',members:['a','b','d','e','f','g'],current:[byId.get('b'),byId.get('a')],old:[byId.get('d'),byId.get('e')],unknown:[byId.get('f'),byId.get('g')]},{id:'two',members:['a'],current:[byId.get('a')],old:[],unknown:[]}];return {scope:'verified-scope-A',refs,groups};
}
test('title/activity changes rebind fresh refs and groups while preserving native route first-match order',async()=>{
 const before=fixture(),index=currentIndex(before,before.groups),next=structuredClone(before);for(const r of next.refs){r.nativeTitle='fresh '+r.id;r.activity={candidateDay:2};}next.groups[0].name='fresh group';
 const rebound=await index.rebindCompatibleAsync(next,next.groups,()=>true);assert(rebound);const route=rebound.at('https://example.test/c/shared?model=new#tail');
 assert.equal(route.ref,next.refs[0]);assert.equal(route.ref.nativeTitle,'fresh a');assert.equal(route.selected,next.groups[0]);assert.equal(route.inGroup(next.groups[0]),next.refs[1],'group row first match differs from global reference first match');assert.equal(route.inGroup(next.groups[1]),next.refs[0]);assert.equal(rebound.at('https://example.test/c/solo').independent,next.refs[2]);
 assert.equal(index.at('https://example.test/c/shared').ref,before.refs[0]);assert.equal(index.at('https://example.test/c/shared').selected.name,'old group');
 const third=structuredClone(next);third.refs[0].nativeTitle='third';const again=await rebound.rebindCompatibleAsync(third,third.groups,()=>true);assert.equal(again.at('https://example.test/c/shared').ref,third.refs[0]);assert.equal(rebound.at('https://example.test/c/shared').ref.nativeTitle,'fresh a');
});
const incompatible=[
 ['ref ID',s=>{s.refs[0].id='renamed-id';}],
 ['ref order',s=>{[s.refs[0],s.refs[1]]=[s.refs[1],s.refs[0]];}],
 ['ref URL',s=>{s.refs[0].nativeUrl='https://example.test/c/changed';}],
 ['ref count',s=>{s.refs.pop();}],
 ['group order',s=>{s.groups.reverse();}],
 ['group ID',s=>{s.groups[0].id='another';}],
 ['group count',s=>{s.groups.pop();}],
 ['member order',s=>{s.groups[0].members.reverse();}],
 ['member IDs',s=>{s.groups[0].members[0]='solo';}],
 ['current row first-match order',s=>{s.groups[0].current.reverse();}],
 ['old row order',s=>{s.groups[0].old.reverse();}],
 ['unknown row order',s=>{s.groups[0].unknown.reverse();}],
 ['group row native URL',s=>{s.groups[0].current[0]={...s.groups[0].current[0],nativeUrl:'https://example.test/c/changed-row'};}],
 ['group row ID',s=>{s.groups[0].old[0]={...s.groups[0].old[0],id:'another-row'};}],
];
for(const [name,change] of incompatible)test(`route-contract change requires rebuild: ${name}`,async()=>{
 const before=fixture(),index=currentIndex(before,before.groups),next=structuredClone(before);change(next);assert.equal(await index.rebindCompatibleAsync(next,next.groups,()=>true),null);assert.equal(index.at('https://example.test/c/shared').ref,before.refs[0]);assert.equal(index.at('https://example.test/c/shared').inGroup(before.groups[0]),before.refs[1]);
});
test('cross-scope rebind rejects even if all routes and IDs are identical',async()=>{
 const before=fixture(),index=currentIndex(before,before.groups),next=structuredClone(before);next.scope='verified-scope-B';await assert.rejects(index.rebindCompatibleAsync(next,next.groups,()=>true),/cross-scope-index/);assert.equal(index.at('https://example.test/c/shared').ref,before.refs[0]);
});
test('cancelled guards reject before work and across a yield without mutating the prior index',async()=>{
 const before={scope:'scope',refs:Array.from({length:600},(_,i)=>({id:'ref_'+i,nativeUrl:'https://example.test/c/'+i})),groups:[]},index=currentIndex(before,[]),next=structuredClone(before);
 await assert.rejects(index.rebindCompatibleAsync(next,[],()=>false),/stale-client-response/);let checks=0;await assert.rejects(index.rebindCompatibleAsync(next,[],()=>++checks<2),/stale-client-response/);assert.equal(checks,2);assert.equal(index.at('https://example.test/c/599').ref,before.refs[599]);
 const good=await index.rebindCompatibleAsync(next,[],()=>true);assert.equal(good.at('https://example.test/c/599').ref,next.refs[599]);
});
