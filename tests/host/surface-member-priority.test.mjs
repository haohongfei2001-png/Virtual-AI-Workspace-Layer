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
