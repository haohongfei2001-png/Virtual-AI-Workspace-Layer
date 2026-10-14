import test from 'node:test';
import assert from 'node:assert/strict';
import {createMountSurface} from '../../src/navigation/mount-surface.mjs';
// Structural geometry and ownership oracle; actual browser zoom remains separate.
async function fixture(){
 let doc;const element=()=>({ownerDocument:doc,isConnected:true,dataset:{},style:{},attrs:{},textContent:'',open:false,children:[],events:new Map(),rect:{left:0,top:0,right:0,bottom:0,width:0,height:0},addEventListener(k,f){this.events.set(k,f);},removeEventListener(k){this.events.delete(k);},contains(){return false;},getBoundingClientRect(){return this.rect;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},append(...v){this.children.push(...v);},matches(){return this.open;},showPopover(){this.open=true;},hidePopover(){this.open=false;},remove(){this.isConnected=false;}});
 doc={defaultView:{getComputedStyle:()=>({visibility:'visible',display:'block'}),CSS:{supports:()=>true},HTMLElement:{prototype:{showPopover(){}}},crypto:{randomUUID:()=> 'unique'},MutationObserver:class{observe(){}disconnect(){}}},createElement:element,querySelector:()=>null,addEventListener(){},removeEventListener(){}};doc.head=element();doc.body=element();
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
for(const role of ['readingRect','sidebarRect'])for(const invalid of [{width:0},{height:-1},{x:NaN},{y:Infinity},{x:0,y:290,width:100,height:50}])test(`${role} unsafe ${JSON.stringify(invalid)} closes both masks without partial geometry writes`,async()=>{
 const f=await fixture();try{const old=styles(f),native=snapshot(f),next=f.next();Object.assign(next[role],invalid);assert.equal(f.surface.refreshGeometry(f.handle,next),false);assert.deepEqual(styles(f),old);assert(f.nodes.every(n=>!n.open));assert.equal(f.surface.isMasked(f.reading),false);assert.equal(f.surface.isMasked(f.history),false);assert.deepEqual(snapshot(f),native);}finally{f.surface.dispose(f.handle);}
});
for(const field of ['reading','historyMaskRoots','composer','header','protectedRegions','regionEpoch'])test(`refresh refuses replaced ${field} authority boundary`,async()=>{
 const f=await fixture();try{const next=f.next(),old=styles(f);next[field]=field==='regionEpoch'?2:['historyMaskRoots','protectedRegions'].includes(field)?[f.element()]:f.element();assert.equal(f.surface.refreshGeometry(f.handle,next),false);assert.deepEqual(styles(f),old);assert(f.nodes.every(n=>!n.open));}finally{f.surface.dispose(f.handle);}
});
test('refresh rejects failed inspection and missing sidebar rectangle without partially moving workspace',async()=>{
 for(const patch of [{ok:false},{viewMask:'unsupported'},{sidebarRect:null}]){const f=await fixture();try{const old=styles(f);assert.equal(f.surface.refreshGeometry(f.handle,{...f.next(),...patch}),false);assert.deepEqual(styles(f),old);assert(f.nodes.every(n=>!n.open));}finally{f.surface.dispose(f.handle);}}
});
