// Offline DOM double. These assertions do not certify a live ChatGPT profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE as profile} from '../../src/host/surface-discovery.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
function fixture({projectCount=300,historyCount=300,memberCount=3}={}){
 const document={location:{href:'https://chatgpt.com/g/p1/project'},defaultView:{crypto:{randomUUID},getComputedStyle:n=>n.style}};
 function node(tag='DIV',text='',attrs={},parent=null){const n={tagName:tag,textContent:text,attrs,parentNode:parent,parentElement:parent,isConnected:true,ownerDocument:document,children:[],style:{display:'block',visibility:'visible'},getAttribute(k){return this.attrs[k]??null;},getClientRects(){return [{}];},contains(other){return this.children.includes(other);},querySelectorAll(){return this.children;}};return n;}
 const reading=node(),members=node('NAV','',{'data-project-id':'p1'},reading),heading=node('H2','Native project',{},reading),header=node('H1','Native project'),projects=node(),history=node();
 projects.children=Array.from({length:projectCount},(_,i)=>node('A','Project '+i,{href:`/g/p${i+2}/project`},projects));
 history.children=Array.from({length:historyCount},(_,i)=>node('A','History '+i,{href:`/c/h${i}`},history));
 members.children=Array.from({length:memberCount},(_,i)=>node('A','Member '+i,{href:`/c/m${i}`},members));
 const selectors=new Map([[profile.regions.projects,[projects]],[profile.regions.history,[history]],[profile.regions.members,[members]],[profile.currentProjectTitle,[heading]],[profile.currentProjectHeader,[header]]]);
 document.querySelectorAll=s=>selectors.get(s)??[];
 const discovery=createSurfaceDiscovery({document,binding:{documentToken:'doc',routeEpoch:1},profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>container,conversationId:id=>id}})});
 return {document,discovery,projects,history,members,heading,header,node};
}
test('confirmed current Project members precede saturated project and history lists',()=>{
 const f=fixture(),p=f.discovery.scan();
 assert.equal(p.candidates.length,256);
 assert.deepEqual(p.candidates.slice(0,4).map(c=>c.renderKey),['project:p1','conversation:m0','conversation:m1','conversation:m2']);
 assert.deepEqual(p.membershipClaims.map(c=>[c.conversationId,c.asserted,c.projectId]),[['m0','PROJECT','p1'],['m1','PROJECT','p1'],['m2','PROJECT','p1']]);
 assert.deepEqual(p.coverageClaims,[]);
 for(const c of p.candidates.slice(1,4))assert.equal(f.discovery.getNode(c.target.liveHandle),f.members.children[Number(c.target.nativeId.slice(1))]);
});
test('member evidence survives a duplicate ordinary history entry',()=>{
 const f=fixture({projectCount:1,historyCount:1,memberCount:1});f.history.children[0].attrs.href='/c/m0';f.history.children[0].textContent='Member 0';
 const p=f.discovery.scan();assert.equal(p.candidates.filter(c=>c.renderKey==='conversation:m0').length,2);assert.equal(p.membershipClaims.length,1);assert.equal(p.membershipClaims[0].asserted,'PROJECT');assert.equal(p.membershipClaims[0].projectId,'p1');
});
for(const change of ['wrong-member-id','hidden-members','mismatched-title','ambiguous-title'])test('unconfirmed current Project does not acquire priority: '+change,()=>{
 const f=fixture();if(change==='wrong-member-id')f.members.attrs['data-project-id']='p2';if(change==='hidden-members')f.members.hidden=true;if(change==='mismatched-title')f.header.textContent='Different';if(change==='ambiguous-title'){const query=f.document.querySelectorAll;f.document.querySelectorAll=s=>s===profile.currentProjectTitle?[f.heading,f.heading]:query(s);}
 const p=f.discovery.scan();assert.equal(p.candidates.length,256);assert(p.candidates.every(c=>c.entity==='project'));assert.deepEqual(p.membershipClaims,[]);assert.deepEqual(p.coverageClaims,[]);
});
test('large current member list remains bounded and handle invalidation still applies',()=>{
 const f=fixture({memberCount:300}),p=f.discovery.scan();assert.equal(p.candidates.length,256);assert.equal(p.membershipClaims.length,255);assert(p.membershipClaims.every(c=>c.asserted==='PROJECT'));assert.deepEqual(p.coverageClaims,[]);
 const handle=p.candidates[1].target.liveHandle;f.members.children[0].attrs.href='/c/replaced';assert.equal(f.discovery.getNode(handle),null);assert(f.discovery.scan().detachedHandles.includes(handle.id));
});

test('finite pages expose every loaded project, member and history without a coverage claim',()=>{
 const f=fixture({memberCount:603}),keys=new Set();let result=f.discovery.scanPage(),pages=0;
 while(true){pages++;assert(pages<20);assert(result.payload.candidates.length<=256);assert(result.payload.membershipClaims.length<=256);assert.deepEqual(result.payload.coverageClaims,[]);for(const c of result.payload.candidates)keys.add(c.renderKey);
  if(!result.cursor)break;const cursor=result.cursor;result=f.discovery.scanPage(cursor);assert.throws(()=>f.discovery.scanPage(cursor),/stale-surface-cursor/);
 }
 assert.equal(keys.size,1204);for(let i=0;i<603;i++)assert(keys.has('conversation:m'+i));assert(keys.has('project:p301'));assert(keys.has('conversation:h299'));
});
for(const change of ['route','root','stop','foreign-cursor'])test('page continuation rejects '+change,()=>{
 const f=fixture(),page=f.discovery.scanPage();assert(page.cursor);
 if(change==='route')f.document.location.href='https://chatgpt.com/';
 if(change==='root'){const query=f.document.querySelectorAll;f.document.querySelectorAll=s=>s===profile.regions.members?[]:query(s);}
 if(change==='stop')f.discovery.stop();
 assert.throws(()=>f.discovery.scanPage(change==='foreign-cursor'?{}:page.cursor),/stale-surface-cursor/);
});
test('detached handles drain in bounded pages after a large loaded surface is removed',()=>{
 const f=fixture({projectCount:800,historyCount:0,memberCount:0});let p=f.discovery.scanPage();while(p.cursor)p=f.discovery.scanPage(p.cursor);
 for(const n of f.projects.children)n.isConnected=false;
 let count=0;p=f.discovery.scanPage();while(true){assert(p.payload.detachedHandles.length<=512);count+=p.payload.detachedHandles.length;if(!p.cursor)break;p=f.discovery.scanPage(p.cursor);}assert.equal(count,800);
});

test('continuation avoids re-reading prior handles but direct activation still rejects changed node',()=>{
 const f=fixture({memberCount:400}),first=f.discovery.scanPage(),node=f.members.children[0],handle=first.payload.candidates[1].target.liveHandle;let reads=0;const get=node.getAttribute;node.getAttribute=function(k){reads++;return get.call(this,k);};
 const second=f.discovery.scanPage(first.cursor);assert(second.payload.candidates.length>0);assert.equal(reads,0);
 node.attrs.href='/c/changed';assert.equal(f.discovery.getNode(handle),null);assert(reads>0);
});
test('surface mutation filter includes roots, labels, ancestor visibility and detached roots',()=>{
 const f=fixture({projectCount:1,historyCount:1,memberCount:1}),d=f.discovery;
 for(const target of [f.members,f.members.children[0],f.header,f.projects.children[0]])assert(d.affectsSurface([{type:'attributes',target}]));
 const ancestor={contains:n=>n===f.members};assert(d.affectsSurface([{type:'attributes',target:ancestor}]));
 const unrelated={contains:()=>false};assert.equal(d.affectsSurface([{type:'characterData',target:unrelated}]),false);
 assert(d.affectsSurface([{type:'childList',target:unrelated,addedNodes:[],removedNodes:[f.members]}]));
});
