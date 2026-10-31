import test from 'node:test';
import assert from 'node:assert/strict';
import {createMountSurface} from '../../src/navigation/mount-surface.mjs';
// Structural geometry and ownership oracle; actual browser zoom remains separate.
async function fixture(){
 let doc;const element=()=>({ownerDocument:doc,isConnected:true,dataset:{},style:{},attrs:{},textContent:'',open:false,children:[],events:new Map(),rect:{left:0,top:0,right:0,bottom:0,width:0,height:0},addEventListener(k,f){this.events.set(k,f);},removeEventListener(k){this.events.delete(k);},contains(){return false;},getBoundingClientRect(){return this.rect;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},append(...v){for(const n of v)n.parentElement=this;this.children.push(...v);},matches(){return this.open;},showPopover(){this.open=true;},hidePopover(){this.open=false;},remove(){this.isConnected=false;}});
 doc={defaultView:{addEventListener(){},removeEventListener(){},getComputedStyle:()=>({visibility:'visible',display:'block'}),CSS:{supports:()=>true},HTMLElement:{prototype:{showPopover(){}}},crypto:{randomUUID:()=> 'unique'},MutationObserver:class{observe(){}disconnect(){}}},createElement:element,querySelector:()=>null,addEventListener(){},removeEventListener(){}};doc.head=element();doc.body=element();
 const reading=element(),history=element(),composer=element(),header=element(),events=[];composer.rect={left:0,top:300,right:800,bottom:400,width:800,height:100};header.rect={left:0,top:0,right:800,bottom:40,width:800,height:40};
 reading.attrs.class='native-reading';history.attrs.style='color:red';composer.attrs.role='textbox';composer.value='UNSENT DRAFT';
 const inspection={ok:true,viewMask:'declarative-css',reading,historyMaskRoots:[history],composer,header,protectedRegions:[composer,header],regionEpoch:1,readingRect:{x:200,y:40,width:400,height:200},sidebarRect:{x:0,y:40,width:180,height:200}};
 const surface=createMountSurface({document:doc,createFrameURL:()=> 'chrome-extension://extension/ui.html'}),handle=await surface.mount({binding:{documentToken:'doc'}},inspection,{onSurrender:e=>events.push(e)});surface.showWorkspace(handle);
 return {doc,element,surface,handle,inspection,events,reading,history,composer,header,nodes:doc.body.children,next:()=>({...inspection,readingRect:{x:120,y:40,width:300,height:180},sidebarRect:{x:0,y:40,width:100,height:180}})};
}
const snapshot=f=>[f.reading,f.history,f.composer,f.header].map(n=>({attrs:{...n.attrs},style:{...n.style},value:n.value}));
const styles=f=>f.nodes.map(n=>({...n.style}));
test('safe resize updates only owned geometry while preserving exact frame objects and mount',async()=>{
 const f=await fixture();try{const frames=f.surface.frames(f.handle),native=snapshot(f),next=f.next();assert.equal(f.surface.refreshGeometry(f.handle,next),true);assert.deepEqual(f.surface.frames(f.handle),frames);assert(f.nodes.every(n=>n.open));for(const [index,key]of ['readingRect','sidebarRect'].entries())for(const [field,prop]of [['x','left'],['y','top'],['width','width'],['height','height']])assert.equal(f.nodes[index].style[prop],next[key][field]+'px');assert.deepEqual(snapshot(f),native);assert.equal(f.surface.isMasked(f.reading),true);assert.equal(f.surface.isMasked(f.history),true);}finally{f.surface.dispose(f.handle);}
});
for(const role of ['readingRect','sidebarRect'])for(const invalid of [{width:0},{height:-1},{x:NaN},{y:Infinity},{x:0,y:290,width:100,height:50}])test(`${role} unsafe ${JSON.stringify(invalid)} withdraws only the affected role`,async()=>{
 const f=await fixture();try{const old=styles(f),native=snapshot(f),next=f.next();Object.assign(next[role],invalid);const core=role==='readingRect';assert.equal(f.surface.refreshGeometry(f.handle,next),!core);assert.deepEqual(f.surface.visibility(f.handle),{workspace:!core,sidebar:core});assert.deepEqual(styles(f)[core?0:1],old[core?0:1]);assert.equal(f.surface.isMasked(f.reading),!core);assert.equal(f.surface.isMasked(f.history),core);assert.deepEqual(snapshot(f),native);}finally{f.surface.dispose(f.handle);}
});
for(const field of ['reading','readingViewport','composer','header','regionEpoch'])test(`refresh withdraws workspace on replaced ${field} boundary`,async()=>{
 const f=await fixture();try{const next=f.next(),old=styles(f);next[field]=field==='regionEpoch'?2:f.element();assert.equal(f.surface.refreshGeometry(f.handle,next),false);assert.deepEqual(styles(f),old);assert.deepEqual(f.surface.visibility(f.handle),{workspace:false,sidebar:true});}finally{f.surface.dispose(f.handle);}
});
test('changed history is re-proved independently and old mask is released',async()=>{
 const f=await fixture();try{const replacement=f.element();assert.equal(f.surface.refreshGeometry(f.handle,{...f.next(),historyMaskRoots:[replacement]}),true);assert.deepEqual(f.surface.visibility(f.handle),{workspace:true,sidebar:false});assert.equal(f.surface.isMasked(f.history),false);assert.equal(f.surface.showWorkspace(f.handle),true);assert.equal(f.surface.isMasked(replacement),true);}finally{f.surface.dispose(f.handle);}
});
test('fresh protected regions are checked for overlap, not stale node identity',async()=>{
 const f=await fixture();try{const obstacle=f.element(),next={...f.next(),protectedRegions:[f.composer,f.header,obstacle]};assert.equal(f.surface.refreshGeometry(f.handle,next),true);obstacle.rect={left:120,top:40,right:150,bottom:70,width:30,height:30};assert.equal(f.surface.refreshGeometry(f.handle,next),false);assert.deepEqual(f.surface.visibility(f.handle),{workspace:false,sidebar:true});}finally{f.surface.dispose(f.handle);}
});
test('failed core inspection withdraws workspace; missing optional sidebar preserves it',async()=>{
 for(const patch of [{ok:false},{viewMask:'unsupported'},{sidebarRect:null}]){const f=await fixture();try{const optional=patch.sidebarRect===null;assert.equal(f.surface.refreshGeometry(f.handle,{...f.next(),...patch}),optional);assert.deepEqual(f.surface.visibility(f.handle),{workspace:optional,sidebar:!optional});}finally{f.surface.dispose(f.handle);}}
});
test('partial native history preserves one native sidebar while workspace and joins survive',async()=>{
 const f=await fixture();try{const frames=f.surface.frames(f.handle),before=snapshot(f);assert.equal(f.surface.refreshGeometry(f.handle,{...f.next(),preserveNativeSidebar:true}),true);assert.equal(f.nodes[0].open,true);assert.equal(f.nodes[1].open,false);assert.equal(f.surface.isMasked(f.history),false);assert.equal(f.surface.isMasked(f.reading),true);f.surface.suspend(f.handle);assert.equal(f.surface.showWorkspace(f.handle),true);assert.equal(f.nodes[0].open,true);assert.equal(f.nodes[1].open,false);assert.deepEqual(f.surface.frames(f.handle),frames);assert.deepEqual(snapshot(f),before);assert.equal(f.composer.value,'UNSENT DRAFT');}finally{f.surface.dispose(f.handle);}
});
