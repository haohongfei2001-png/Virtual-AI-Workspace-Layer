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
 let textReads=0,walks=0;
 const makeRoot=kind=>({parentElement:null,getAttribute:()=>null,getClientRects:()=>[{width:100,height:30}],isConnected:true,ownerDocument:document,contains:n=>nodes[kind].includes(n),querySelectorAll:()=>nodes[kind]});
 for(const kind of Object.keys(nodes))roots[kind]=makeRoot(kind);
 document.querySelectorAll=selector=>{const kind=Object.keys(nodes).find(k=>LEGACY_SURFACE_PROFILE.regions[k]===selector);return kind?[roots[kind]]:[];};
 installTreeWalkerDouble(document);const walker=document.createTreeWalker;document.createTreeWalker=(...args)=>{walks++;return walker(...args);};
 const policy=createURLPolicy({profile:{conversationId:id=>id,projectId:({container})=>container}});
 const d=createSurfaceDiscovery({document,binding,urlPolicy:policy});
 function add(kind,id,href=kind==='projects'?`/g/${id}/project`:`/c/${id}`){const node={tagName:'A',getClientRects:()=>[{width:100,height:30}],get parentElement(){return this.parentNode;},isConnected:true,ownerDocument:document,parentNode:roots[kind],disabled:false,attrs:{href},name:'Native title',get textContent(){textReads++;return this.name;},getAttribute(k){return this.attrs[k]??null;}};nodes[kind].push(node);return node;}
 const target=(entity,id,url=entity==='project'?`/g/${id}/project`:`/c/${id}`)=>({entity,nativeId:id,navigationURL:new URL(url,'https://chatgpt.com').href});
 function scan(){let page=d.scanPage();while(page.cursor)page=d.scanPage(page.cursor);}
 return {document,binding,nodes,roots,d,add,target,scan,replaceRoot(kind){roots[kind]=makeRoot(kind);},counts:()=>({textReads,walks}),reset(){textReads=0;walks=0;}};
}
test('only sampled exact native IDs and canonical URLs resolve, preserving order and duplicate inputs',()=>{
 const f=fixture(),p=f.add('projects','p'),c=f.add('history','c');
 const targets=[f.target('conversation','c'),f.target('project','p'),f.target('conversation','missing'),f.target('conversation','c')];
 assert.deepEqual(f.d.resolveLoadedTargets(targets),[null,null,null,null]);f.scan();
 const result=f.d.resolveLoadedTargets(targets);assert.equal(f.d.getNode(result[0]),c);assert.equal(f.d.getNode(result[1]),p);assert.equal(result[2],null);assert.deepEqual(result[0],result[3]);assert.notEqual(result[0],result[3]);
 result[0].routeEpoch=100;assert.equal(f.d.getNode(f.d.resolveLoadedTargets([targets[0]])[0]),c);
});
test('equal titles, IDless controls, alternate container URLs and unobserved late controls never substitute',()=>{
 const f=fixture();f.add('history','c','/g/container/c/c');f.add('projects','p').attrs.href='/g/unknown';f.scan();f.add('history','late');
 assert.deepEqual(f.d.resolveLoadedTargets([f.target('conversation','c'),f.target('conversation','late'),f.target('project','p')]),[null,null,null]);
 assert(f.d.resolveLoadedTargets([f.target('conversation','c','/g/container/c/c')])[0]);
});
test('all valid matches are counted, ambiguity never selects first; invalid duplicate does not shadow original',()=>{
 const f=fixture(),a=f.add('history','c'),b=f.add('history','c');f.scan();const target=f.target('conversation','c');
 assert.deepEqual(f.d.resolveLoadedTargets([target]),[null]);b.isConnected=false;const [handle]=f.d.resolveLoadedTargets([target]);assert.equal(f.d.getNode(handle),a);
});
for(const change of ['href','title','role','aria','disabled','parent','disconnected','ownerDocument','root','route','binding','invalidate','stop','rebuilt'])test('previous sample rejects '+change,()=>{
 const f=fixture(),node=f.add('history','c');f.scan();const target=f.target('conversation','c');assert(f.d.resolveLoadedTargets([target])[0]);
 if(change==='href')node.attrs.href='/c/other';if(change==='title')node.name='Renamed';if(change==='role')node.attrs.role='button';if(change==='aria')node.attrs['aria-label']='new';if(change==='disabled')node.disabled=true;if(change==='parent')node.parentNode={};if(change==='disconnected')node.isConnected=false;if(change==='ownerDocument')node.ownerDocument={};if(change==='root')f.replaceRoot('history');if(change==='route')f.document.location.href='https://chatgpt.com/c/other';if(change==='binding')f.binding.documentToken='another';if(change==='invalidate')f.d.invalidate();if(change==='stop')f.d.stop();if(change==='rebuilt'){node.isConnected=false;f.nodes.history.splice(0,1);f.add('history','c');}
 assert.deepEqual(f.d.resolveLoadedTargets([target]),[null]);
});
test('malformed batch fails before getters, registry traversal or DOM lookup',()=>{
 const f=fixture();f.add('history','c');f.scan();const target=f.target('conversation','c');let invoked=0;
 const getter={...target};Object.defineProperty(getter,'nativeId',{get(){invoked++;return 'c';}});
 const arrayGetter=[];Object.defineProperty(arrayGetter,'0',{get(){invoked++;return target;}});
 for(const input of [null,{},Array(201).fill(target),Array(1),arrayGetter,[getter],[{...target,extra:true}],[{...target,[Symbol('extra')]:true}],[{...target,nativeId:'wrong'}],[{...target,navigationURL:'/c/c'}],[{...target,navigationURL:'https://other.test/c/c'}],[{...target,entity:'unknown'}]])assert.throws(()=>f.d.resolveLoadedTargets(input),/invalid-resolved-targets/);
 assert.equal(invoked,0);assert.deepEqual(f.d.resolveLoadedTargets([]),[]);
});
test('one registry pass and bounded target work: unrelated entries do not incur DOM fingerprint reads',()=>{
 const f=fixture();for(let i=0;i<600;i++)f.add('history',`c${i}`);f.scan();f.reset();
 const targets=Array.from({length:200},()=>f.target('conversation','c599'));
 const results=f.d.resolveLoadedTargets(targets);assert(results.every(h=>h&&h.id===results[0].id));
 assert.deepEqual(f.counts(),{walks:0,textReads:1});
 // Every unique selected entry is revalidated; repeated targets share validation, not mutable handles.
 f.reset();const unique=Array.from({length:200},(_,i)=>f.target('conversation',`c${i}`));assert(f.d.resolveLoadedTargets(unique).every(Boolean));assert.deepEqual(f.counts(),{walks:0,textReads:200});
});
