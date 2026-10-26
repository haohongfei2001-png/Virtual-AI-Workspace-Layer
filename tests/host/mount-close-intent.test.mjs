import test from 'node:test';
import assert from 'node:assert/strict';
import {createMountSurface} from '../../src/navigation/mount-surface.mjs';

// Real mount implementation with a DOM event double. This establishes ordering,
// not Chromium rendering: beforetoggle is synchronous, toggle may be coalesced.
async function fixture(onSurrender=()=>{}){
 let doc;const listeners=new Map();
 const element=()=>({ownerDocument:doc,isConnected:true,dataset:{},style:{},attrs:{},textContent:'',open:false,closing:false,children:[],events:new Map(),
  addEventListener(k,f){this.events.set(k,f);},removeEventListener(k,f){if(this.events.get(k)===f)this.events.delete(k);},
  contains(){return false;},closest(){return this.dataset.vaOwned?this:null;},getBoundingClientRect(){return {width:0,height:0};},
  setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},
  append(...nodes){for(const node of nodes)node.parentElement=this;this.children.push(...nodes);},matches(){return this.open;},
  emit(type,oldState,newState,target=this){const e={target,oldState,newState,isTrusted:true};listeners.get(type)?.(e);this.events.get(type)?.(e);},
  showPopover(){if(this.open)return;this.emit('beforetoggle','closed','open');this.open=true;},
  hidePopover(){if(!this.open||this.closing)return;this.closing=true;try{this.emit('beforetoggle','open','closed');this.open=false;}finally{this.closing=false;}},
  remove(){this.isConnected=false;}});
 doc={defaultView:{getComputedStyle:()=>({visibility:'visible',display:'block'}),CSS:{supports:()=>true},HTMLElement:{prototype:{showPopover(){}}},crypto:{randomUUID:()=> 'unique'},MutationObserver:class{observe(){}disconnect(){}}},createElement:element,querySelector:()=>null,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:(k,f)=>{if(listeners.get(k)===f)listeners.delete(k);}};doc.head=element();doc.body=element();
 const reading=element(),history=element(),composer=element(),header=element();
 const surface=createMountSurface({document:doc,createFrameURL:()=> 'chrome-extension://extension/ui.html'});
 const handle=await surface.mount({binding:{documentToken:'doc'}},{ok:true,viewMask:'declarative-css',reading,historyMaskRoots:[history],composer,header,protectedRegions:[composer,header],regionEpoch:1,readingRect:{x:0,y:0,width:100,height:100},sidebarRect:{x:100,y:0,width:100,height:100}},{onSurrender});
 const [workspace,sidebar]=doc.body.children;return {surface,handle,workspace,sidebar,element};
}

test('workspace close invalidates the prior intent synchronously even when toggle coalesces open to open',async()=>{
 let intent=0;const reasons=[];const f=await fixture(e=>{if(e.phase==='closing')intent++;reasons.push(e);});
 try{f.surface.showWorkspace(f.handle);const captured=intent;
  f.workspace.hidePopover();
  assert.notEqual(intent,captured,'the real close must invalidate pending presentation before queued toggle');
  assert.deepEqual(reasons,[{role:'workspace',reason:'native-reading',phase:'closing'}]);
  // A later explicit reopen can coalesce the delayed notification. The close
  // intent must already have been observed and must not be notified twice.
  f.surface.showWorkspace(f.handle);f.workspace.emit('toggle','open','open');
  assert.deepEqual(reasons,[{role:'workspace',reason:'native-reading',phase:'closing'}]);
 }finally{f.surface.dispose(f.handle);}
});

test('programmatic reading changes visibility without impersonating user close intent',async()=>{
 const events=[];const f=await fixture(e=>events.push(e));
 try{f.surface.showWorkspace(f.handle);f.surface.showReading(f.handle);
  assert.deepEqual(events,[]);f.workspace.emit('toggle','open','closed');assert.deepEqual(events,[]);
  assert.deepEqual(f.surface.visibility(f.handle),{workspace:false,sidebar:true});
 }finally{f.surface.dispose(f.handle);}
});

test('wrong-target and disposed close events cannot surrender the live mount',async()=>{
 const reasons=[];const f=await fixture(e=>reasons.push(e.reason));f.surface.showWorkspace(f.handle);
 const before=f.workspace.events.get('beforetoggle'),closed=f.workspace.events.get('toggle');
 before?.({target:f.sidebar,oldState:'open',newState:'closed',isTrusted:true});
 closed?.({target:f.sidebar,oldState:'open',newState:'closed',isTrusted:true});assert.deepEqual(reasons,[]);
 f.surface.dispose(f.handle);
 before?.({target:f.workspace,oldState:'open',newState:'closed',isTrusted:true});
 closed?.({target:f.workspace,oldState:'open',newState:'closed',isTrusted:true});assert.deepEqual(reasons,[]);
 assert.equal(f.workspace.events.size,0);
});

test('synchronous closing callback reentry cannot emit a second closing intent',async()=>{
 let f,calls=0;f=await fixture(e=>{if(e.phase!=='closing')return;calls++;assert.equal(f.workspace.open,true,'closing notification precedes actual visibility change');if(calls===1)f.workspace.emit('beforetoggle','open','closed');});
 try{f.surface.showWorkspace(f.handle);f.workspace.hidePopover();assert.equal(calls,1);assert.equal(f.workspace.open,false);}
 finally{f.surface.dispose(f.handle);}
});
