/** Characterization only: actual adapter/discovery with offline DOM doubles. No browser or owner persistence claims. */
import {installTreeWalkerDouble} from './tree-walker-double.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTAdapter} from '../../src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const C='33333333-3333-4333-8333-333333333333';
// Minimal visible directory DOM for discovery; these remain offline doubles.
function visibleDirectoryNode(document,parentElement=null){return {ownerDocument:document,parentElement,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:()=>null};}
function fixture(options={}){
 let observer,clock=0;const listeners=new Map(),emitted=[],rebind=[];
 const node=(x,y,width,height)=>({textContent:'',children:[],contains:()=>false,querySelectorAll:()=>[],getBoundingClientRect:()=>({x,y,width,height}),isConnected:true});
 const history=node(0,50,200,500),reading=node(220,70,700,400),header=node(220,0,700,60),composer=node(220,480,700,90),slot=node(220,0,40,40);
 const selectors=new Map([['aside nav[aria-label="Chat history"]',[history]],['main > header',[header]],['main > section[aria-label="Conversation"]',[reading]],['main > form#composer',[composer]],['main > header > .navigation-slot',[slot]]]);
 const documentListeners=new Map();
 const document={addEventListener:(t,f)=>documentListeners.set(t,f),removeEventListener:t=>documentListeners.delete(t),location:{href:`https://chatgpt.com/c/${C}`},documentElement:{dataset:{}},querySelectorAll:s=>selectors.get(s)??[],querySelector:()=>null,defaultView:{getComputedStyle:n=>n.style??{display:'block',visibility:'visible'},crypto,MutationObserver:class{constructor(cb){observer=this;this.cb=cb;}observe(){}disconnect(){this.closed=true;}},addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t)}};
 installTreeWalkerDouble(document);
 const binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'browser-doc',routeEpoch:4,origin:'https://chatgpt.com',expiresAt:new Date(100000).toISOString()};
 const adapter=createChatGPTAdapter({document,profile:{...LEGACY_SURFACE_PROFILE,currentBody:undefined},now:()=>clock,onRebindNeeded:v=>rebind.push(v),...options});
 return {adapter,document,documentListeners,binding,emitted,rebind,selectors,reading,composer,slot,setTime:v=>clock=v,trigger:()=>observer.cb([]),observer:()=>observer,start:(emit,extra={})=>adapter.start({binding,...extra,emit:emit??(async p=>{emitted.push(p);return {state:'accepted',localSeq:p.localSeq,receiptId:'r'};})})};
}
function sys05Directory(f,size=32){
 const nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>{for(let current=n;current;current=current.parentNode??current.parentElement)if(current===root)return true;return false;},querySelectorAll:()=>nodes};
 for(let i=0;i<size;i++)nodes.push({tagName:'A',textContent:'Native '+i,isConnected:true,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:k=>k==='href'?'https://chatgpt.com/c/55555555-5555-4555-8555-'+i.toString(16).padStart(12,'0'):null});
 f.selectors.set(LEGACY_SURFACE_PROFILE.regions.history,[root]);
 let visits=0,walkers=0;const original=f.document.createTreeWalker;
 f.document.createTreeWalker=(r,what)=>{const walker=original(r,what);if(r!==root)return walker;walkers++;return {nextNode(){const n=walker.nextNode();if(n)visits++;return n;}};};
 return {nodes,root,counts:()=>({visits,walkers})};
}
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const semantics=packets=>new Map(packets.flatMap(p=>p.payload.candidates).map(c=>[c.renderKey,JSON.stringify({...c,target:{...c.target,liveHandle:null}})]));
const detached=packets=>packets.flatMap(p=>p.payload.detachedHandles);
for(const size of [1000,2100,10000])test('characterize unchanged renewal at directory size '+size,async t=>{
 const f=fixture(),d=sys05Directory(f,size);t.after(()=>f.adapter.stop());
 await f.start();await drain();const initial=f.emitted.slice(),before=semantics(initial);assert.equal(before.size,size);
 await drain();assert.equal(f.emitted.length,initial.length,'first pass drained');
 f.setTime(10000);f.adapter.updateBinding({...f.binding,expiresAt:new Date(30000).toISOString()});await drain();
 const repeated=f.emitted.slice(initial.length),after=semantics(repeated);
 assert(d.nodes.every(n=>n.isConnected&&n.parentNode===d.root&&d.root.contains(n)),'no real node detach or replacement');
 for(const [key,value]of after)assert.equal(value,before.get(key),'native candidate semantics unchanged');
 const initialClaims=new Map(initial.flatMap(p=>p.payload.membershipClaims).map(c=>[c.conversationId,JSON.stringify(c)]));
 for(const c of repeated.flatMap(p=>p.payload.membershipClaims))assert.equal(JSON.stringify(c),initialClaims.get(c.conversationId));
 const handles=new Map(initial.flatMap(p=>p.payload.candidates).map(c=>[c.target.liveHandle.id,c.target.nativeId]));
 let knownConnectedEvictions=0;for(const id of detached(initial)){if(handles.has(id))knownConnectedEvictions++;}
 t.diagnostic(JSON.stringify({size,initialPackets:initial.length,repeatPackets:repeated.length,repeatDistinctCandidates:after.size,initialDetached:detached(initial).length,repeatDetached:detached(repeated).length,knownConnectedEvictions,semanticChanges:0,realNodeDetaches:0}));
 // Keep the observed count diagnostic, not an assumed optimization contract.
 // Current onEvict only removes lookup entries: capacity alone did not create
 // detached tokens or repeated packets in any of these three actual runs.
 assert(initial.every(p=>p.payload.candidates.length<=256&&p.payload.detachedHandles.length<=512));
 await drain();assert.equal(f.emitted.length,initial.length+repeated.length,'repeat pass drained');
});
test('real node detach is separately observable below handle capacity',async t=>{
 const f=fixture(),d=sys05Directory(f,32);t.after(()=>f.adapter.stop());await f.start();await drain();
 const first=f.emitted.flatMap(p=>p.payload.candidates).find(c=>c.nativeTitle==='Native 0'),count=f.emitted.length,node=d.nodes.shift();node.isConnected=false;node.parentNode=null;node.parentElement=null;
 f.observer().cb([{type:'childList',target:d.root,addedNodes:[],removedNodes:[node]}]);await drain();const changed=f.emitted.slice(count);
 assert(detached(changed).includes(first.target.liveHandle.id));assert(!semantics(changed).has(first.renderKey));
 t.diagnostic(JSON.stringify({initialNodes:32,remainingNodes:d.nodes.length,realNodeDetaches:1,emittedPackets:changed.length,detached:detached(changed).length}));
});
