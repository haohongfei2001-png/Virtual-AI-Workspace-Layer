import test from 'node:test';
import assert from 'node:assert/strict';
import {createMountSurface} from '../../src/navigation/mount-surface.mjs';
// Structural geometry and ownership oracle; actual browser zoom remains separate.
async function fixture(){
 let doc;const element=()=>({ownerDocument:doc,isConnected:true,dataset:{},style:{},attrs:{},textContent:'',open:false,children:[],events:new Map(),rect:{left:0,top:0,right:0,bottom:0,width:0,height:0},addEventListener(k,f){this.events.set(k,f);},removeEventListener(k){this.events.delete(k);},contains(){return false;},getBoundingClientRect(){return this.rect;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},append(...v){this.children.push(...v);},matches(){return this.open;},showPopover(){this.open=true;},hidePopover(){this.open=false;},remove(){this.isConnected=false;}});
 doc={defaultView:{addEventListener(){},removeEventListener(){},getComputedStyle:()=>({visibility:'visible',display:'block'}),CSS:{supports:()=>true},HTMLElement:{prototype:{showPopover(){}}},crypto:{randomUUID:()=> 'unique'},MutationObserver:class{observe(){}disconnect(){}}},createElement:element,querySelector:()=>null,addEventListener(){},removeEventListener(){}};doc.head=element();doc.body=element();
 const reading=element(),history=element(),composer=element(),header=element(),events=[];composer.rect={left:0,top:300,right:800,bottom:400,width:800,height:100};header.rect={left:0,top:0,right:800,bottom:40,width:800,height:40};
 reading.attrs.class='native-reading';history.attrs.style='color:red';composer.attrs.role='textbox';composer.value='UNSENT DRAFT';
 const inspection={ok:true,viewMask:'declarative-css',reading,historyMaskRoots:[history],composer,header,protectedRegions:[composer,header],regionEpoch:1,readingRect:{x:200,y:40,width:400,height:200},sidebarRect:{x:0,y:40,width:180,height:200}};
 const surface=createMountSurface({document:doc,createFrameURL:()=> 'chrome-extension://extension/ui.html'}),handle=await surface.mount({binding:{documentToken:'doc'}},inspection,{onSurrender:e=>events.push(e)});surface.showWorkspace(handle);
 return {doc,element,surface,handle,inspection,events,reading,history,composer,header,nodes:doc.body.children,next:()=>({...inspection,readingRect:{x:120,y:40,width:300,height:180},sidebarRect:{x:0,y:40,width:100,height:180}})};
}
// Observe CSSOM setter calls, including same-value writes; no timing oracle.
async function observed(t){const f=await fixture();t.after(()=>f.surface.dispose(f.handle));assert.equal(f.surface.refreshGeometry(f.handle,f.inspection),true);const writes=[];const observe=(node,index)=>{node.style=new Proxy(node.style,{set(target,key,value){writes.push({index,key,value});target[key]=value;return true;}});node.children.forEach((child,i)=>observe(child,`${index}.${i}`));};for(const [index,node]of f.nodes.entries())observe(node,index);return {...f,writes};}
test('identical rect refresh performs zero owned style setter calls',async t=>{const f=await observed(t),frames=f.surface.frames(f.handle);for(let i=0;i<20;i++)assert.equal(f.surface.refreshGeometry(f.handle,{...f.inspection,readingRect:{...f.inspection.readingRect},sidebarRect:{...f.inspection.sidebarRect}}),true);assert.deepEqual(f.writes,[]);assert.deepEqual(f.surface.frames(f.handle),frames);assert(f.nodes.every(n=>n.open));});
test('position-only change writes exactly changed left and top while preserving dimensions',async t=>{const f=await observed(t),next={...f.inspection,readingRect:{...f.inspection.readingRect,x:210,y:45},sidebarRect:{...f.inspection.sidebarRect,x:5,y:45}};assert.equal(f.surface.refreshGeometry(f.handle,next),true);assert.deepEqual(f.writes,[{index:0,key:'left',value:'210px'},{index:0,key:'top',value:'45px'},{index:1,key:'left',value:'5px'},{index:1,key:'top',value:'45px'}]);f.writes.length=0;assert.equal(f.surface.refreshGeometry(f.handle,next),true);assert.deepEqual(f.writes,[]);assert(f.nodes.every(n=>n.open));});
for(const invalidRole of ['readingRect','sidebarRect'])test('invalid '+invalidRole+' writes only independently valid role geometry',async t=>{const f=await observed(t),before=f.nodes.map(n=>({...n.style})),next={...f.inspection,readingRect:{...f.inspection.readingRect,x:210},sidebarRect:{...f.inspection.sidebarRect,x:5}};next[invalidRole].height=0;const core=invalidRole==='readingRect';assert.equal(f.surface.refreshGeometry(f.handle,next),!core);assert.deepEqual(f.writes,core?[]:[{index:0,key:'left',value:'210px'}]);assert.deepEqual({...f.nodes[core?0:1].style},before[core?0:1]);assert.equal(f.nodes[0].open,!core);assert.equal(f.nodes[1].open,core);assert.equal(f.surface.isMasked(f.reading),!core);assert.equal(f.surface.isMasked(f.history),core);});

test('surface ownership uses exact live mount identity, never copied markers or descendants',async()=>{
 const f=await fixture(),nodes=[...f.nodes];
 for(const node of nodes){
  assert.equal(f.surface.isOwnedSurface(node),true);
  node.hidePopover();assert.equal(f.surface.isOwnedSurface(node),true,'closed toggle still belongs to this mount');
  assert.equal(f.surface.isOwnedSurface({...node}),false);
  for(const child of node.children)assert.equal(f.surface.isOwnedSurface(child),false);
  node.isConnected=false;assert.equal(f.surface.isOwnedSurface(node),false);node.isConnected=true;
  node.ownerDocument={};assert.equal(f.surface.isOwnedSurface(node),false);node.ownerDocument=f.doc;
 }
 assert.equal(f.surface.isOwnedSurface(f.reading),false);
 assert.equal(f.surface.isOwnedSurface(null),false);
 f.surface.dispose(f.handle);
 for(const node of nodes){node.isConnected=true;assert.equal(f.surface.isOwnedSurface(node),false,'removed registry cannot be revived by reattachment');}
});
