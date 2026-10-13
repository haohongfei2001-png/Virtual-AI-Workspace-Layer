import test from 'node:test';
import assert from 'node:assert/strict';
import {createMountSurface} from '../../src/navigation/mount-surface.mjs';
// DOM double checks callback/cleanup, not Chrome popover layout.
test('mount native focus hides both surfaces and notifies; owned controls and disposed mounts do not',async()=>{
 const listeners=new Map();let doc;
 const element=()=>({ownerDocument:doc,isConnected:true,dataset:{},style:{},attrs:{},open:false,children:[],events:new Map(),addEventListener(k,f){this.events.set(k,f);},removeEventListener(k,f){if(this.events.get(k)===f)this.events.delete(k);},contains(){return false;},getBoundingClientRect(){return {width:0,height:0};},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},append(...v){this.children.push(...v);},matches(){return this.open;},showPopover(){this.open=true;},hidePopover(){this.open=false;},remove(){this.isConnected=false;}});
 doc={defaultView:{CSS:{supports:()=>true},HTMLElement:{prototype:{showPopover(){}}},crypto:{randomUUID:()=> 'unique'},MutationObserver:class{observe(){}disconnect(){}}},createElement:element,querySelector:()=>null,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}};doc.head=element();doc.body=element();
 const reading=element(),history=element(),composer=element(),header=element(),events=[];
 const surface=createMountSurface({document:doc,createFrameURL:()=> 'chrome-extension://extension/ui.html'});
 const handle=await surface.mount({binding:{documentToken:'doc'}},{ok:true,viewMask:'declarative-css',reading,historyMaskRoots:[history],composer,header,protectedRegions:[composer,header],regionEpoch:1,readingRect:{x:0,y:0,width:100,height:100},sidebarRect:{x:100,y:0,width:100,height:100}},{onSurrender:e=>events.push(e)});
 surface.showWorkspace(handle);assert(doc.body.children.every(n=>n.open));listeners.get('focusin')({target:composer});assert(doc.body.children.every(n=>!n.open));assert.deepEqual(events,[{reason:'native-input'}]);
 surface.showWorkspace(handle);listeners.get('pointerdown')({target:element()});assert(doc.body.children.every(n=>n.open));assert.equal(events.length,1);
 const workspace=doc.body.children[0],sidebar=doc.body.children[1],closed=workspace.events.get('toggle');
 assert.equal(sidebar.events.has('toggle'),false);sidebar.hidePopover();assert.equal(events.length,1);
 // A queued close from before a later open cannot surrender the new state.
 closed({target:workspace,newState:'closed'});assert.equal(events.length,1);
 workspace.hidePopover();closed({target:sidebar,newState:'closed'});assert.equal(events.length,1);
 closed({target:workspace,newState:'closed'});assert.deepEqual(events.at(-1),{reason:'native-reading'});assert.equal(events.length,2);
 surface.dispose(handle);assert.equal(listeners.size,0);assert.equal(workspace.events.size,0);closed({target:workspace,newState:'closed'});assert.equal(events.length,2);
});
