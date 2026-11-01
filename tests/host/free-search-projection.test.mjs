import test from 'node:test';
import assert from 'node:assert/strict';
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {projectFreeSearch} from '../../src/runtime/free-search-projection.mjs';
function fixture(){
 const ref=(id,membership='PROJECT',projectId='p')=>({id,scope:'scope',nativeTitle:'Native '+id,nativeAliases:['Original '+id],nativeUrl:'https://chatgpt.com/c/'+id,membership,projectId:membership==='PROJECT'?projectId:null,freshness:'last-known',displayTitle:'PRO_SECRET',displayName:'PRO_SECRET',activityDecision:{segment:99,private:'PRIVATE_EVIDENCE'}});
 const refs=[...Array.from({length:30},(_,i)=>ref('c'+i)),ref('other','PROJECT','q'),ref('none','NONE'),ref('unknown','UNKNOWN')];
 const project=(id,members)=>({id,scope:'scope',nativeName:'Same native project',nativeAliases:['Previous project name'],name:'PRO_SECRET',members});
 const snapshot=freeNavigationSnapshot({scope:'scope',viewMode:'free',projects:[project('p',refs.slice(0,30)),project('q',[refs[30]])],refs,preferences:{savedSnippets:{value:[{id:'s0',refId:'c0',text:'explicit saved excerpt Native c0',private:'PRIVATE_ANCHOR'},{id:'s1',refId:'c0',text:'explicit saved excerpt again'}]}}});
 return {snapshot,index:{private:'PRIVATE_INDEX'}};
}
test('owner search finds historical rows outside first frame page and keeps NONE/UNKNOWN reachable',()=>{
 const current=fixture(),before=JSON.stringify(current.snapshot),result=projectFreeSearch(current,{query:'Native',offset:24});
 assert.equal(result.total,35);assert.equal(result.items.length,11);assert.equal(result.items[0].id,'c24');assert.equal(result.hasMore,false);
 assert(result.items.some(row=>row.membership==='NONE'));assert(result.items.some(row=>row.membership==='UNKNOWN'));assert.equal(result.items[0].freshness,'last-known');
 assert.equal(JSON.stringify(current.snapshot),before);assert(!JSON.stringify(result).includes('PRIVATE_'));assert(!JSON.stringify(result).includes('PRO_SECRET'));
 assert.deepEqual(Object.keys(result.items[0]).sort(),['displayTitle','freshness','id','membership','nativeTitle','nativeUrl','projectId']);
});
test('native project names and aliases search members without merging same-name projects',()=>{
 const current=fixture();assert.equal(projectFreeSearch(current,{query:'Same native project'}).total,33);
 const p=projectFreeSearch(current,{query:'Previous project name',projectId:'p'}),q=projectFreeSearch(current,{query:'Same native project',projectId:'q'});
 assert.equal(p.total,31);assert.equal(p.items.length,24);assert.equal(p.hasMore,true);assert.deepEqual(q.items.map(row=>row.id),['other','q']);
 assert.equal(projectFreeSearch(current,{query:'oRiGiNaL C29'}).items[0].id,'c29');assert.equal(projectFreeSearch(current,{query:'PRO_SECRET'}).total,0);
});
test('explicit saved excerpts reuse knownMatches and deduplicate ref results without exposing anchors',()=>{
 const current=fixture(),result=projectFreeSearch(current,{query:'explicit saved excerpt'});assert.equal(result.total,1);assert.equal(result.items[0].id,'c0');assert.equal(result.items[0].anchor,undefined);assert.deepEqual(result.items[0].snippetMatches,[{id:'s0',preview:'explicit saved excerpt Native c0'},{id:'s1',preview:'explicit saved excerpt again'}]);assert.deepEqual(Object.keys(result.items[0].snippetMatches[0]).sort(),['id','preview']);assert(!JSON.stringify(result).includes('PRIVATE_ANCHOR'));
 assert.equal(projectFreeSearch(current,{query:'Native c0'}).total,1);assert.equal(projectFreeSearch(current,{query:'explicit saved excerpt',projectId:'q'}).total,0);
});
test('query and pagination contracts reject unsafe shape, bounds and absent project',()=>{
 const current=fixture();for(const request of [null,[],{}, {query:1},{query:'x'.repeat(201)},{query:'x',scope:'other'},{query:'x',projectId:''},{query:'x',projectId:'x'.repeat(129)},{query:'x',offset:-1},{query:'x',offset:1000001},{query:'x',offset:1.5},{query:'x',limit:0},{query:'x',limit:25}])assert.throws(()=>projectFreeSearch(current,request),/invalid-free-search-query/);
 assert.throws(()=>projectFreeSearch(current,{query:'x',projectId:'missing'}),/free-search-project-unavailable/);
 assert.throws(()=>projectFreeSearch({snapshot:{...current.snapshot}},{query:''}),/unprepared/);
 assert.equal(projectFreeSearch(current,{query:'😀'.repeat(100)}).query.length,200);assert.throws(()=>projectFreeSearch(current,{query:'😀'.repeat(101)}),/invalid-free-search-query/);
 const last=projectFreeSearch(current,{query:'',offset:1000000,limit:1});assert.equal(last.total,35);assert.deepEqual(last.items,[]);assert.equal(last.hasMore,false);
});
test('search DTO rejects UTF8 overflow without clipping original native title',()=>{
 const current=fixture();current.snapshot.refs[0].nativeTitle='中'.repeat(23000);assert.throws(()=>projectFreeSearch(current,{query:'c0'}),/free-search-page-too-large/);assert.equal(current.snapshot.refs[0].nativeTitle.length,23000);
});

test('title-first hit still retains every matching snippet in saved manual order',()=>{const current=fixture();current.snapshot.preferences.savedSnippets.value[1].text='Native c0 second selection';const result=projectFreeSearch(current,{query:'Native c0'});assert.equal(result.total,1);assert.deepEqual(result.items[0].snippetMatches.map(s=>s.id),['s0','s1']);assert.equal(result.items[0].nativeTitle,'Native c0');assert(!JSON.stringify(result).includes('PRO_SECRET'));});
test('all matching snippets aggregate before ref pagination and previews stop at 160 code units',()=>{const current=fixture();current.snapshot.preferences.savedSnippets.value.push({id:'tail',refId:'c24',text:'Native '+'x'.repeat(300),messageId:'SECRET_MESSAGE',branchId:'SECRET_BRANCH',bodyHash:'a'.repeat(64)});const first=projectFreeSearch(current,{query:'Native',offset:0,limit:24}),next=projectFreeSearch(current,{query:'Native',offset:24,limit:1});assert.equal(first.total,35);assert.equal(next.total,35);assert.equal(next.items[0].id,'c24');assert.equal(next.items[0].snippetMatches[0].preview.length,160);assert.deepEqual(Object.keys(next.items[0].snippetMatches[0]),['id','preview']);assert(!JSON.stringify(next).includes('SECRET_'));assert.equal(next.items[0].anchor,undefined);});
test('nonmatching saved text does not add snippet affordance to native title match',()=>{const current=fixture();const result=projectFreeSearch(current,{query:'c29'});assert.equal(result.items[0].id,'c29');assert.equal(Object.hasOwn(result.items[0],'snippetMatches'),false);});

test('known projects remain searchable before members arrive, without inventing membership',()=>{
 const project={id:'p',scope:'scope',nativeName:'Research empty project',nativeAliases:['Prior research'],nativeUrl:'https://chatgpt.com/g/p/project',members:[]};
 const prepare=refs=>({snapshot:freeNavigationSnapshot({scope:'scope',viewMode:'free',projects:[{...project,members:refs}],refs,preferences:{}})});
 const current=prepare([]),before=JSON.stringify(current.snapshot),result=projectFreeSearch(current,{query:'Prior research'});
 assert.equal(result.total,1);assert.deepEqual(result.items,[{kind:'project',id:'p',nativeName:project.nativeName,nativeUrl:project.nativeUrl,freshness:'unknown',available:true}]);
 assert.equal(JSON.stringify(current.snapshot),before);assert(!('membership' in result.items[0]));assert(!('memberCount' in result.items[0]));
 const updated=prepare([{id:'p',scope:'scope',nativeTitle:'Research conversation',membership:'PROJECT',projectId:'p'}]);
 assert.deepEqual(projectFreeSearch(updated,{query:'Research'}).items.map(r=>[r.kind??'conversation',r.id]),[['conversation','p'],['project','p']]);
});
test('mixed search pages retain same-name projects and chats exactly once, including missing URLs',()=>{
 const projects=Array.from({length:27},(_,i)=>({id:'p'+i,scope:'scope',nativeName:'Shared title',nativeAliases:[],nativeUrl:i?'https://chatgpt.com/g/p'+i+'/project':null,members:[]}));
 const refs=[{id:'p0',scope:'scope',nativeTitle:'Shared title',membership:'UNKNOWN',projectId:null}];
 const current={snapshot:freeNavigationSnapshot({scope:'scope',viewMode:'free',projects,refs,preferences:{}})},seen=[];
 for(let offset=0;offset<28;offset+=24){const p=projectFreeSearch(current,{query:'Shared',offset});assert.equal(p.total,28);assert.equal(p.hasMore,offset===0);seen.push(...p.items.map(r=>[r.kind??'conversation',r.id]));}
 assert.equal(new Set(seen.map(JSON.stringify)).size,28);assert.equal(projectFreeSearch(current,{query:'Shared',projectId:'p0'}).total,1);
 assert.equal(projectFreeSearch(current,{query:'Shared'}).items[1].nativeUrl,null);assert.equal(refs[0].membership,'UNKNOWN');
});
