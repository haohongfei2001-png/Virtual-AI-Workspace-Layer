import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {projectFreeFrame} from '../../src/runtime/free-frame-projection.mjs';
const url=new URL('./free-frame-client.test.mjs',import.meta.url),text=await readFile(url,'utf8'),boundary="test('actual lifecycle composition";
assert.equal(text.split(boundary).length,2);
const source=(text.slice(0,text.indexOf(boundary))+'\nexport {fixture,drain,deferred};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");
const {fixture,drain,deferred}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const windows=()=>[{groupId:'p',list:'current',rowOffset:0,rowLimit:17},{groupId:'p',list:'old',rowOffset:0,rowLimit:5},{groupId:'q',list:'current',rowOffset:0,rowLimit:17}];
function current(stamp){const refs=[],projects=['p','q','hidden'].map(id=>{const members=Array.from({length:35},(_,i)=>({id:id+'_'+i,scope:'scope',nativeTitle:stamp+' '+id+' '+i,nativeUrl:'https://chatgpt.com/c/'+id+'_'+i,membership:'PROJECT',projectId:id,activityDecision:{segment:i<30?0:2}}));refs.push(...members);return {id,scope:'scope',nativeName:id,members,activityDecision:{segment:0}};});return {snapshot:freeNavigationSnapshot({scope:'scope',viewMode:'free',revision:1,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},projects,refs})};}
test('one projection materializes all visible windows anew; primary selection overrides matching window only',()=>{
 const query={role:'workspace',limit:2,rowWindows:windows(),groupId:'p',list:'old',rowOffset:0,rowLimit:5};const first=projectFreeFrame(current('old'),query),next=projectFreeFrame(current('new'),query);
 assert.equal(next.groups.items[0].lists.current.items.length,17);assert.equal(next.groups.items[0].lists.old.items.length,5);assert.equal(next.groups.items[1].lists.current.items.length,17);assert.equal(next.selection.items.length,5);assert(next.groups.items.flatMap(g=>Object.values(g.lists).flatMap(p=>p.items)).every(r=>r.nativeTitle.startsWith('new')));assert(first.groups.items[0].lists.current.items.every(r=>r.nativeTitle.startsWith('old')));
 const primary=projectFreeFrame(current('new'),{...query,list:'current',rowOffset:17,rowLimit:17,rowWindows:[{...windows()[0],rowOffset:17,paged:true}]});assert.equal(primary.groups.items[0].lists.current.limit,5);assert.equal(primary.selection.offset,17);assert.equal(primary.selection.limit,17);assert.equal(primary.selection.paged,true);
});
test('invalid windows fail before member access; hidden-group windows never materialize hidden members',()=>{
 const f=current('new');let reads=0;Object.defineProperty(f.snapshot.groups[2],'current',{get(){reads++;throw Error('hidden members read');}});
 assert.equal(projectFreeFrame(f,{role:'workspace',limit:2,rowWindows:[{groupId:'hidden',list:'current',rowOffset:0,rowLimit:197}]}).groups.items.length,2);assert.equal(reads,0);
 assert.throws(()=>projectFreeFrame(f,{role:'workspace',rowWindows:[{...windows()[0],rowLimit:6}]}));assert.equal(reads,0);
});
test('combined row windows retain original 64KiB rejection without title clipping',()=>{const f=current('中'.repeat(1000));assert.throws(()=>projectFreeFrame(f,{role:'workspace',limit:2,rowWindows:windows()}),/free-frame-page-too-large/);assert.equal(f.snapshot.refs[0].nativeTitle.length>1000,true);});
test('client first shrinks retained windows to paged five, then original bounded split while primary offsets stay fixed',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();const start=f.calls.length;f.setView(async()=>({ok:false,reason:'free-frame-page-too-large'}));
 await f.nav.onProjectionRequest({role:'workspace',segment:2,offset:24,limit:8,groupId:'p',list:'old',rowOffset:17,rowLimit:17,rowWindows:windows()});
 const queries=f.calls.slice(start).filter(m=>m.type==='HOST_UI_VIEW').map(m=>m.query);assert.equal(queries.length,6);assert.deepEqual(queries.map(q=>q.limit),[8,8,4,2,1,1]);assert.deepEqual(queries.map(q=>q.rowLimit),[17,17,17,17,17,5]);assert(queries.every(q=>q.offset===24&&q.rowOffset===17&&q.segment===2));assert.deepEqual(queries[1].rowWindows,windows().map(w=>w.rowLimit>5?{...w,rowLimit:5,paged:true}:w));assert(queries.length<=9);assert.equal(f.stops,1);
});
test('resume windows trigger fresh VIEW; no navigation plan exists before response',async t=>{
 const f=fixture(),send=f.runtime.sendMessage,held=deferred(),query={segment:0,offset:0,limit:8,rowWindows:windows()};t.after(()=>f.client.stop());f.runtime.sendMessage=m=>m.type==='HOST_UI_RESUME'?Promise.resolve({ok:true,resume:{query,view:null}}):send(m);f.setView(()=>held.promise);
 await f.client.start();await drain();assert.deepEqual(f.calls.find(m=>m.type==='HOST_UI_VIEW').query,query);assert.equal(f.pages.length,0);assert.equal(f.nav.adapter.navigationPlan({id:'old'}),undefined);
 held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert.equal(f.pages.length,1);assert.equal(f.nav.adapter.navigationPlan({id:'old'}),undefined);
});
