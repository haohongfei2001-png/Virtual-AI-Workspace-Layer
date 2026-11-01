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
 let textReads=0,walks=0;const queries=[];const ambiguous=new Set();
 const makeRoot=kind=>({parentElement:null,getAttribute:()=>null,getClientRects:()=>[{width:100,height:30}],isConnected:true,ownerDocument:document,contains:n=>nodes[kind].includes(n),querySelectorAll:()=>nodes[kind]});
 for(const kind of Object.keys(nodes))roots[kind]=makeRoot(kind);
 document.querySelectorAll=selector=>{queries.push(selector);const kind=Object.keys(nodes).find(k=>LEGACY_SURFACE_PROFILE.regions[k]===selector);return kind?(ambiguous.has(kind)?[roots[kind],makeRoot(kind)]:[roots[kind]]):[];};
 installTreeWalkerDouble(document);const walker=document.createTreeWalker;document.createTreeWalker=(...args)=>{walks++;return walker(...args);};
 const policy=createURLPolicy({profile:{conversationId:id=>id,projectId:({container})=>container}});
 const d=createSurfaceDiscovery({document,binding,urlPolicy:policy});
 function add(kind,id,href=kind==='projects'?`/g/${id}/project`:`/c/${id}`){const node={tagName:'A',getClientRects:()=>[{width:100,height:30}],get parentElement(){return this.parentNode;},isConnected:true,ownerDocument:document,parentNode:roots[kind],disabled:false,attrs:{href},name:'Native title',get textContent(){textReads++;return this.name;},getAttribute(k){return this.attrs[k]??null;}};nodes[kind].push(node);return node;}
 const target=(entity,id,url=entity==='project'?`/g/${id}/project`:`/c/${id}`)=>({entity,nativeId:id,navigationURL:new URL(url,'https://chatgpt.com').href});
 function scan(){let page=d.scanPage();while(page.cursor)page=d.scanPage(page.cursor);}
 return {document,binding,nodes,roots,d,add,target,scan,queries,ambiguous,replaceRoot(kind){roots[kind]=makeRoot(kind);},counts:()=>({textReads,walks}),reset(){textReads=0;walks=0;}};
}

const expectedRoots=()=>Object.values(LEGACY_SURFACE_PROFILE.regions);
test('a 200-target resolution batch refreshes each native root once and validates every selected node',()=>{
 const f=fixture();for(let i=0;i<200;i++)f.add('history','c'+i);f.scan();f.queries.length=0;f.reset();
 const targets=Array.from({length:200},(_,i)=>f.target('conversation','c'+i)),handles=f.d.resolveLoadedTargets(targets);
 assert(handles.every(Boolean));assert.deepEqual(f.queries,expectedRoots());assert.deepEqual(f.counts(),{walks:0,textReads:200});
 f.queries.length=0;assert.equal(f.d.getNode(handles[0]),f.nodes.history[0]);assert.deepEqual(f.queries,expectedRoots(),'public getNode independently refreshes roots');
});
for(const kind of ['projects','history','members','moveMenu'])for(const change of ['replacement','ambiguity'])test('batch gate rejects '+kind+' root '+change,()=>{
 const f=fixture();f.add('history','c');f.scan();const target=f.target('conversation','c');assert(f.d.resolveLoadedTargets([target])[0]);
 // moveMenu begins absent; turning it ambiguous is still null and does not change an observed root.
 if(kind==='moveMenu'){const original=f.document.querySelectorAll;let menu={isConnected:true,ownerDocument:f.document,getAttribute:()=>null,querySelectorAll:()=>[]};f.document.querySelectorAll=s=>s===LEGACY_SURFACE_PROFILE.regions.moveMenu?[menu]:original(s);f.scan();if(change==='replacement')menu={...menu};else f.document.querySelectorAll=s=>s===LEGACY_SURFACE_PROFILE.regions.moveMenu?[menu,{...menu}]:original(s);}
 else if(change==='replacement')f.replaceRoot(kind);else f.ambiguous.add(kind);
 assert.deepEqual(f.d.resolveLoadedTargets([target]),[null]);
});
for(const change of ['detach','root-detach','fingerprint','ownerDocument','reparent'])test('selected entry still rejects '+change+' after one batch root refresh',()=>{
 const f=fixture(),node=f.add('history','c');f.scan();if(change==='detach')node.isConnected=false;if(change==='root-detach')f.roots.history.isConnected=false;if(change==='fingerprint')node.attrs.href='/c/replaced';if(change==='ownerDocument')node.ownerDocument={};if(change==='reparent')node.parentNode={};
 f.queries.length=0;assert.deepEqual(f.d.resolveLoadedTargets([f.target('conversation','c')]),[null]);assert.deepEqual(f.queries,expectedRoots());
});
test('eviction-lost ambiguity evidence still denies resolution even for retained exact target',()=>{
 const f=fixture();for(let i=0;i<2100;i++)f.add('history','c'+i);f.scan();assert.equal(f.d.handleStats().lookupComplete,false);f.queries.length=0;
 assert.deepEqual(f.d.resolveLoadedTargets([f.target('conversation','c2099')]),[null]);assert.deepEqual(f.queries,expectedRoots());
});
test('two matching valid controls remain ambiguous; stale duplicate is removed without losing valid identity',()=>{
 const f=fixture(),a=f.add('history','c'),b=f.add('history','c');f.scan();const target=f.target('conversation','c');f.queries.length=0;assert.deepEqual(f.d.resolveLoadedTargets([target]),[null]);assert.deepEqual(f.queries,expectedRoots());
 b.isConnected=false;f.queries.length=0;const [handle]=f.d.resolveLoadedTargets([target]);assert(handle);assert.deepEqual(f.queries,expectedRoots());assert.equal(f.d.getNode(handle),a);
});
