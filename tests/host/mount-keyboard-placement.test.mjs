import test from 'node:test';
import assert from 'node:assert/strict';
import {createMountSurface} from '../../src/navigation/mount-surface.mjs';
// Structural placement only: browser Tab/AX traversal is independently required.
async function fixture(nested){
 let doc;const moves=[],listeners=new Map();
 const element=(tag='div')=>({tagName:tag.toUpperCase(),ownerDocument:doc,isConnected:true,parentElement:null,dataset:{},style:{},attrs:{},children:[],events:new Map(),open:false,
  append(...nodes){for(const node of nodes)this.insertBefore(node,null);},
  insertBefore(node,before){if(before!==null)assert.equal(before.parentElement,this);moves.push(node);if(node.parentElement){const a=node.parentElement.children;a.splice(a.indexOf(node),1);}const i=before===null?this.children.length:this.children.indexOf(before);this.children.splice(i,0,node);node.parentElement=this;node.isConnected=true;},
  contains(node){return this.children.some(child=>child===node||child.contains(node));},
  remove(){if(this.parentElement){const a=this.parentElement.children;a.splice(a.indexOf(this),1);}this.parentElement=null;this.isConnected=false;},
  setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},
  addEventListener(k,v){this.events.set(k,v);},removeEventListener(k){this.events.delete(k);},
  getBoundingClientRect(){return {width:0,height:0};},matches(){return this.open;},showPopover(){this.open=true;},hidePopover(){this.open=false;}
 });
 doc={defaultView:{getComputedStyle:()=>({visibility:'visible',display:'block'}),CSS:{supports:()=>true},HTMLElement:{prototype:{showPopover(){}}},crypto:{randomUUID:()=> 'placement'},MutationObserver:class{observe(){}disconnect(){}}},createElement:element,querySelector:()=>null,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 doc.head=element('head');doc.body=element('body');const header=element('header'),history=element('aside'),reading=element('main'),composer=element('form'),editor=element('textarea'),tail=element('footer'),prefix=element('div');composer.append(editor);editor.value='UNSENT';editor.nativeHandler=()=>17;
 let anchor=composer;
 if(nested){anchor=element('div');const inner=element('section');inner.append(reading,composer);anchor.append(header,history,inner);doc.body.append(prefix,anchor,tail);}else doc.body.append(prefix,header,history,reading,composer,tail);
 const native=[prefix,header,history,reading,composer,editor,tail,...(nested?[anchor,anchor.children[2]]:[])],parents=native.map(n=>n.parentElement),childLists=native.map(n=>[...n.children]),originalBody=[...doc.body.children],handler=editor.nativeHandler;moves.length=0;
 const surface=createMountSurface({document:doc,createFrameURL:({role})=>'chrome-extension://static/'+role+'.html'}),handle=await surface.mount({binding:{documentToken:'doc'}},{ok:true,viewMask:'declarative-css',regionEpoch:1,reading,header,composer,historyMaskRoots:[history],protectedRegions:[],readingRect:{x:200,y:40,width:300,height:200},sidebarRect:{x:0,y:40,width:180,height:200}});
 const unchanged=()=>{assert.deepEqual(native.map(n=>n.parentElement),parents);assert.deepEqual(native.map(n=>[...n.children]),childLists);assert.equal(editor.value,'UNSENT');assert.equal(editor.nativeHandler,handler);assert.equal(editor.nativeHandler(),17);assert(moves.every(n=>!native.includes(n)),'native node must never be moved');};
 return {doc,surface,handle,native,anchor,originalBody,editor,unchanged,listeners};
}
for(const nested of [false,true])test(`${nested?'nested app-root':'direct body'} composer: owned workspace/sidebar precede top-level composer ancestor without native moves`,async()=>{
 const f=await fixture(nested),frames=f.surface.frames(f.handle),owned=frames.map(({frame})=>frame.parentElement),before=f.doc.body.children.indexOf(f.anchor);
 assert.deepEqual(frames.map(v=>v.role),['workspace','sidebar']);assert.deepEqual(f.doc.body.children.slice(before-2,before),owned);assert.deepEqual(f.doc.body.children.filter(n=>!owned.includes(n)),f.originalBody);f.unchanged();
 assert.equal(f.surface.showWorkspace(f.handle),true);assert(owned.every(n=>n.open));f.surface.showReading(f.handle);assert.deepEqual(owned.map(n=>n.open),[false,true]);f.surface.showWorkspace(f.handle);assert(owned.every(n=>n.open));assert.deepEqual(f.surface.frames(f.handle),frames);f.unchanged();
 f.listeners.get('focusin')({target:f.editor});assert.deepEqual(owned.map(n=>n.open),[false,true]);f.unchanged();
 f.surface.dispose(f.handle);assert.deepEqual(f.doc.body.children,f.originalBody);assert(owned.every(n=>!n.isConnected));assert.equal(f.listeners.size,0);f.unchanged();
});
