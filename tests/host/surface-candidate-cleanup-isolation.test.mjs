/** DOM doubles exercise discovery identity/algorithm bounds, not browser/live certification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {installTreeWalkerDouble} from './tree-walker-double.mjs';
function fixture(){
 const document={defaultView:{crypto:{randomUUID},getComputedStyle:()=>({display:"block",visibility:"visible"})},location:{href:'https://chatgpt.com/'}};
 const binding={documentToken:'doc',routeEpoch:1},nodes={projects:[],history:[],members:[]},roots={};
 let textReads=0,walks=0;const readsByKind={projects:0,history:0,members:0};
 const makeRoot=kind=>({parentElement:null,getAttribute:()=>null,getClientRects:()=>[{width:100,height:30}],isConnected:true,ownerDocument:document,contains:n=>nodes[kind].includes(n),querySelectorAll:()=>nodes[kind]});
 for(const kind of Object.keys(nodes))roots[kind]=makeRoot(kind);
 document.querySelectorAll=selector=>{const kind=Object.keys(nodes).find(k=>LEGACY_SURFACE_PROFILE.regions[k]===selector);return kind?[roots[kind]]:[];};
 installTreeWalkerDouble(document);const walker=document.createTreeWalker;document.createTreeWalker=(...args)=>{walks++;return walker(...args);};
 const policy=createURLPolicy({profile:{conversationId:id=>id,projectId:({container})=>container}});
 const d=createSurfaceDiscovery({document,binding,urlPolicy:policy});
 function add(kind,id,href=kind==='projects'?`/g/${id}/project`:`/c/${id}`){const node={tagName:'A',getClientRects:()=>[{width:100,height:30}],get parentElement(){return this.parentNode;},isConnected:true,ownerDocument:document,parentNode:roots[kind],disabled:false,attrs:{href},name:'Native title',get textContent(){textReads++;readsByKind[kind]++;return this.name;},getAttribute(k){return this.attrs[k]??null;}};nodes[kind].push(node);return node;}
 const target=(entity,id,url=entity==='project'?`/g/${id}/project`:`/c/${id}`)=>({entity,nativeId:id,navigationURL:new URL(url,'https://chatgpt.com').href});
 function scan(){let page=d.scanPage();while(page.cursor)page=d.scanPage(page.cursor);}
 return {document,binding,nodes,roots,d,add,target,scan,readsByKind,replaceRoot(kind){roots[kind]=makeRoot(kind);},counts:()=>({textReads,walks}),reset(){textReads=0;walks=0;for(const key of Object.keys(readsByKind))readsByKind[key]=0;}};
}
function candidatePages(f){let page=f.d.scanCandidatePage(),pages=[page];while(page.cursor){page=f.d.scanCandidatePage(page.cursor);pages.push(page);}return pages.flatMap(p=>p.payload.detachedHandles);}
function normalPages(f){let page=f.d.scanPage(),pages=[page];while(page.cursor){page=f.d.scanPage(page.cursor);pages.push(page);}return pages.flatMap(p=>p.payload.detachedHandles);}
function seeded(t,count=600){const f=fixture();t.after(()=>f.d.stop());for(let i=0;i<count;i++)f.add('members',`c${i}`);const project=f.add('projects','p','');project.tagName='BUTTON';f.scan();f.reset();return f;}
test('candidate-only listing does not fingerprint unrelated sampled members',t=>{const f=seeded(t);candidatePages(f);assert.equal(f.readsByKind.members,0);assert(f.readsByKind.projects>0,'project candidate must still be checked');});
test('stale project handles are still cleaned during candidate-only listing',t=>{const f=seeded(t,2),page=f.d.scanCandidatePage(),old=page.payload.candidates[0].target.control;f.nodes.projects[0].name='Changed project';const detached=candidatePages(f);assert(detached.includes(old.id));assert.equal(f.d.getNode(old),null);});
test('candidate listing defers member cleanup to the next normal producer scan',t=>{const f=seeded(t,2),[old]=f.d.resolveLoadedTargets([f.target('conversation','c0')]);assert(old);f.nodes.members[0].name='Changed member';f.reset();assert(!candidatePages(f).includes(old.id),'candidate read must not consume unrelated member detach');assert.equal(f.readsByKind.members,0);assert(normalPages(f).includes(old.id));assert.equal(f.d.getNode(old),null);});
for(const forDispatch of [false,true])test('deferred cleanup cannot authorize stale member getNode forDispatch='+forDispatch,t=>{const f=seeded(t,2),[old]=f.d.resolveLoadedTargets([f.target('conversation','c0')]);f.nodes.members[0].name='Changed member';candidatePages(f);assert.equal(f.d.getNode(old,{forDispatch}),null);});
for(const change of ['route','region'])test('candidate-only '+change+' reset invalidates every old member handle',t=>{const f=seeded(t,2),[old]=f.d.resolveLoadedTargets([f.target('conversation','c0')]);if(change==='route')f.document.location.href='https://chatgpt.com/c/other';else f.replaceRoot('members');const detached=candidatePages(f);assert(detached.includes(old.id));assert.equal(f.d.getNode(old),null);assert.equal(f.d.getNode(old,{forDispatch:true}),null);});
test('candidate listing retains duplicate resolution refusal',t=>{const f=seeded(t,2);f.add('members','c0');f.scan();candidatePages(f);assert.deepEqual(f.d.resolveLoadedTargets([f.target('conversation','c0')]),[null]);});
test('candidate listing cannot turn incomplete handle cache into unique resolved evidence',t=>{const f=seeded(t,2050);assert.equal(f.d.handleStats().lookupComplete,false);candidatePages(f);assert.equal(f.d.handleStats().lookupComplete,false);assert.deepEqual(f.d.resolveLoadedTargets([f.target('conversation','c2049')]),[null]);});
