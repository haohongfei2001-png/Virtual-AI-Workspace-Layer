/** Synthetic loaded DOM only: registry lifetime/bounds, not Chrome or host latency acceptance. */
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';import {createURLPolicy} from '../../src/host/url-policy.mjs';
function fixture(size){
 let clock=0,steps=0;const document={defaultView:{crypto:{randomUUID},getComputedStyle:()=>({display:"block",visibility:"visible"})},location:{href:'https://chatgpt.com/'}},nodes=[];
 let root={parentElement:null,getAttribute:()=>null,getClientRects:()=>[{width:100,height:30}],isConnected:true,ownerDocument:document,contains:n=>n.parentNode===root};
 document.querySelectorAll=selector=>selector===LEGACY_SURFACE_PROFILE.regions.history?[root]:[];
 document.createTreeWalker=()=>{let index=0;return {nextNode(){steps++;return nodes[index++]??null;}};};
 for(let i=0;i<size;i++)nodes.push({tagName:'A',getClientRects:()=>[{width:100,height:30}],get parentElement(){return this.parentNode;},isConnected:true,ownerDocument:document,parentNode:root,disabled:false,textContent:`Native ${i}`,href:`/c/c${i}`,getAttribute(k){return k==='href'?this.href:null;},matches:s=>s==='a[href]'||s==='a[href],button'});
 const d=createSurfaceDiscovery({document,binding:{documentToken:'doc',routeEpoch:1},urlPolicy:createURLPolicy({profile:{conversationId:id=>id}}),elapsedNow:()=>clock});
 const target=id=>({entity:'conversation',nativeId:id,navigationURL:`https://chatgpt.com/c/${id}`});
 function next(cursor){const before=steps,page=d.scanPage(cursor);assert(page.payload.candidates.length<=256);assert(page.payload.detachedHandles.length<=512);assert(steps-before<=259);assert(d.handleStats().records<=2048);return page;}
 function drain(page=next()){let count=page.payload.candidates.length,pages=1;while(page.cursor){page=next(page.cursor);count+=page.payload.candidates.length;assert(++pages<size+20,'finite continuation');}return count;}
 return {d,document,nodes,target,next,drain,setTime:t=>clock=t,replaceRoot(){root={parentElement:null,getAttribute:()=>null,getClientRects:()=>[{width:100,height:30}],isConnected:true,ownerDocument:document,contains:n=>n.parentNode===root};}};
}
test('100k loaded controls paginate with 2048 record cap; first-page pins survive while old unpinned handles expire',()=>{
 const f=fixture(100000),first=f.next(),pinned=first.payload.candidates.map(c=>c.target.liveHandle);assert.equal(f.d.retainHandles('visible-page',pinned,30000),true);
 const second=f.next(first.cursor),old=second.payload.candidates[0].target.liveHandle;assert.equal(f.d.getNode(old),f.nodes[256]);
 assert.equal(256+f.drain(second),100000);assert.deepEqual(f.d.handleStats(),{records:2048,pinned:256,owners:1,detached:0,lookupComplete:false});
 assert.equal(f.d.getNode(pinned[0]),f.nodes[0]);assert.equal(f.d.getNode(old),null);assert.deepEqual(f.d.resolveLoadedTargets([f.target('c0'),f.target('c99999')]),[null,null]);
 assert.equal(f.d.releaseHandles('visible-page'),true);assert.equal(f.d.handleStats().pinned,0);
});
test('evicted duplicate cannot turn surviving same-ID control into false unique match',()=>{
 const f=fixture(2049);f.nodes.at(-1).href='/c/c0';const first=f.next(),old=first.payload.candidates[0].target.liveHandle;f.drain(first);
 assert.equal(f.d.getNode(old),null);assert.equal(f.d.handleStats().lookupComplete,false);assert.deepEqual(f.d.resolveLoadedTargets([f.target('c0')]),[null]);
});
test('revisited original DOM node gets a fresh handle after capacity eviction',()=>{
 const f=fixture(2049),first=f.next(),old=first.payload.candidates[0].target.liveHandle;f.drain(first);assert.equal(f.d.getNode(old),null);
 const again=f.next().payload.candidates[0].target.liveHandle;assert.notEqual(again.id,old.id);assert.equal(f.d.getNode(again),f.nodes[0]);assert.equal(f.d.getNode(old),null);
});
test('elapsed deadline releases capacity retention and does not keep owners alive',()=>{
 const f=fixture(2049),first=f.next(),h=first.payload.candidates[0].target.liveHandle;assert(f.d.retainHandles('pending',[h],10));assert.equal(f.d.handleStats().pinned,1);
 f.setTime(10);assert.equal(f.d.handleStats().pinned,0);assert.equal(f.d.handleStats().owners,0);assert.equal(f.d.retainHandles('expired',[h],10),false);f.drain(first);assert.equal(f.d.handleStats().records,2048);
 // Expiry removes retention, not identity; enough later pressure eventually evicts the former pin.
 f.drain();assert.equal(f.d.getNode(h),null);
});
for(const kind of ['fingerprint','parent','document','route','root','invalidate','stop'])test('retention cannot authorize invalid '+kind,()=>{
 const f=fixture(4),first=f.next(),h=first.payload.candidates[0].target.liveHandle;assert(f.d.retainHandles('pending',[h],30000));
 if(kind==='fingerprint')f.nodes[0].textContent='Changed';if(kind==='parent')f.nodes[0].parentNode={};if(kind==='document')f.nodes[0].ownerDocument={};if(kind==='route')f.document.location.href='https://chatgpt.com/c/other';if(kind==='root')f.replaceRoot();if(kind==='invalidate')f.d.invalidate();if(kind==='stop')f.d.stop();
 assert.equal(f.d.getNode(h),null);assert.equal(f.d.retainHandles('revive',[h],30000),false);assert.equal(f.d.handleStats().pinned,0);
});
test('route reset restores complete lookup only for newly sampled retained region',()=>{
 const f=fixture(2049);f.drain();assert.equal(f.d.handleStats().lookupComplete,false);f.nodes.splice(1);f.document.location.href='https://chatgpt.com/?unsupported=true';const page=f.next();assert.equal(f.d.handleStats().lookupComplete,true);f.drain(page);
 assert(f.d.resolveLoadedTargets([f.target('c0')])[0]);
});
test('detached IDs drain in bounded empty pages before more loaded controls are admitted',()=>{
 const f=fixture(2048);f.drain();for(const n of f.nodes)n.textContent+=' changed';
 let page=f.next();assert.equal(page.payload.candidates.length,0);assert.equal(page.payload.detachedHandles.length,512);assert.equal(f.d.handleStats().records,0);assert.equal(f.d.handleStats().detached,1536);
 for(const remaining of [1024,512,0]){page=f.next(page.cursor);assert.equal(page.payload.candidates.length,0);assert.equal(page.payload.detachedHandles.length,512);assert.equal(f.d.handleStats().detached,remaining);}
 assert(page.cursor);assert.equal(f.drain(f.next(page.cursor)),2048);assert.equal(f.d.handleStats().records,2048);
});
