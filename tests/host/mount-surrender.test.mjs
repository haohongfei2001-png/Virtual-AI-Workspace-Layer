import test from 'node:test';
import assert from 'node:assert/strict';
import {createMountSurface} from '../../src/navigation/mount-surface.mjs';
// DOM double checks callback/cleanup, not Chrome popover layout.
test('mount native focus hides both surfaces and notifies; owned controls and disposed mounts do not',async()=>{
 const listeners=new Map();let doc,observer;
 const element=()=>({ownerDocument:doc,isConnected:true,dataset:{},style:{},attrs:{},textContent:'',open:false,children:[],events:new Map(),addEventListener(k,f){this.events.set(k,f);},removeEventListener(k,f){if(this.events.get(k)===f)this.events.delete(k);},contains(){return false;},getBoundingClientRect(){return {width:0,height:0};},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},append(...v){this.children.push(...v);},matches(){return this.open;},showPopover(){this.open=true;},hidePopover(){this.open=false;},remove(){this.isConnected=false;}});
 doc={defaultView:{getComputedStyle:node=>({visibility:node.nativeVisibility??'visible'}),CSS:{supports:()=>true},HTMLElement:{prototype:{showPopover(){}}},crypto:{randomUUID:()=> 'unique'},MutationObserver:class{constructor(callback){observer=callback;}observe(){}disconnect(){}}},createElement:element,querySelector:()=>null,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}};doc.head=element();doc.body=element();
 const reading=element(),history=element(),composer=element(),header=element(),events=[];
 const surface=createMountSurface({document:doc,createFrameURL:()=> 'chrome-extension://extension/ui.html'});
 const handle=await surface.mount({binding:{documentToken:'doc'}},{ok:true,viewMask:'declarative-css',reading,historyMaskRoots:[history],composer,header,protectedRegions:[composer,header],regionEpoch:1,readingRect:{x:0,y:0,width:100,height:100},sidebarRect:{x:100,y:0,width:100,height:100}},{onSurrender:e=>events.push(e)});
 assert.equal(surface.isMasked(reading),false,'closed popovers do not own native invisibility');
 const fake=element();fake.setAttribute('data-va-mask-workspace',handle.id);assert.equal(surface.isMasked(fake),false,'copied public marker cannot enter the RAM registry');
 surface.showWorkspace(handle);assert.equal(surface.isMasked(reading),true);assert.equal(surface.isMasked(history),true);
 const style=doc.head.children[0],styleText=style.textContent;
 for(const mutate of [
  ()=>{reading.setAttribute('class','native-changed');return ()=>reading.removeAttribute('class');},
  ()=>{reading.setAttribute('style','visibility:hidden');return ()=>reading.removeAttribute('style');},
  ()=>{style.textContent+=' changed';return ()=>style.textContent=styleText;},
  ()=>{style.isConnected=false;return ()=>style.isConnected=true;},
  ()=>{reading.isConnected=false;return ()=>reading.isConnected=true;},
  ()=>{reading.setAttribute('data-va-mask-workspace','forged');return ()=>reading.setAttribute('data-va-mask-workspace',handle.id);},
 ]){const undo=mutate();assert.equal(surface.isMasked(reading),false);undo();assert.equal(surface.isMasked(reading),true);}
 for(const mutate of [
  ()=>{reading.setAttribute('class','native-changed');return ()=>reading.removeAttribute('class');},
  ()=>{reading.setAttribute('style','visibility:hidden');return ()=>reading.removeAttribute('style');},
  ()=>{reading.setAttribute('hidden','');return ()=>reading.removeAttribute('hidden');},
  ()=>{history.setAttribute('aria-hidden','true');return ()=>history.removeAttribute('aria-hidden');},
  ()=>{reading.isConnected=false;return ()=>reading.isConnected=true;},
 ]){surface.showWorkspace(handle);const undo=mutate();observer();assert(doc.body.children.every(n=>!n.open),'changed native mask boundary releases both surfaces');undo();}
 surface.showWorkspace(handle);observer();assert(doc.body.children.every(n=>n.open),'unchanged boundaries do not close workspace');
 reading.setAttribute('class','new-native-layout');observer();assert(doc.body.children.every(n=>!n.open));assert.equal(surface.showWorkspace(handle),true);observer();assert(doc.body.children.every(n=>n.open));assert.equal(surface.isMasked(reading),true);reading.removeAttribute('class');observer();surface.showWorkspace(handle);
 const child=element(),outside=element();const originalContains=reading.contains;reading.contains=node=>node===child;
 assert.equal(surface.surrenderChanged([{type:'characterData',target:outside}]),false);assert(doc.body.children.every(n=>n.open));
 assert.equal(surface.surrenderChanged([{type:'characterData',target:child}]),true);assert(doc.body.children.every(n=>!n.open));assert.deepEqual(events.at(-1),{reason:'native-change'},'mode notification must not wait for a queued toggle');assert.equal(surface.surrenderChanged([{type:'characterData',target:child}]),false);
 surface.showWorkspace(handle);assert.equal(surface.surrenderChanged([{type:'childList',target:outside,addedNodes:[],removedNodes:[reading]}]),true);assert(doc.body.children.every(n=>!n.open));reading.contains=originalContains;surface.showWorkspace(handle);
 surface.showReading(handle);assert.equal(surface.isMasked(reading),false);assert.equal(surface.isMasked(history),true,'workspace closure does not impersonate sidebar closure');
 events.length=0;surface.showWorkspace(handle);assert(doc.body.children.every(n=>n.open));listeners.get('focusin')({target:composer});assert(doc.body.children.every(n=>!n.open));assert.deepEqual(events,[{reason:'native-input'}]);
 surface.showWorkspace(handle);listeners.get('pointerdown')({target:element()});assert(doc.body.children.every(n=>n.open));assert.equal(events.length,1);
 const workspace=doc.body.children[0],sidebar=doc.body.children[1],closed=workspace.events.get('toggle');
 assert.equal(sidebar.events.has('toggle'),false);sidebar.hidePopover();assert.equal(events.length,1);
 // A queued close from before a later open cannot surrender the new state.
 closed({target:workspace,newState:'closed'});assert.equal(events.length,1);
 workspace.hidePopover();closed({target:sidebar,newState:'closed'});assert.equal(events.length,1);
 closed({target:workspace,newState:'closed'});assert.deepEqual(events.at(-1),{reason:'native-reading'});assert.equal(events.length,2);
 surface.dispose(handle);assert.equal(surface.isMasked(reading),false);assert.equal(surface.isMasked(history),false);assert.equal(surface.isMasked(fake),false);assert.equal(listeners.size,0);assert.equal(workspace.events.size,0);closed({target:workspace,newState:'closed'});assert.equal(events.length,2);
 reading.nativeVisibility='hidden';
 const hiddenHandle=await surface.mount({binding:{documentToken:'doc'}},{ok:true,viewMask:'declarative-css',reading,historyMaskRoots:[history],composer,header,protectedRegions:[composer,header],regionEpoch:2,readingRect:{x:0,y:0,width:100,height:100},sidebarRect:{x:100,y:0,width:100,height:100}});
 surface.showWorkspace(hiddenHandle);assert.equal(surface.isMasked(reading),false,'preexisting native invisibility is never extension ownership');surface.dispose(hiddenHandle);

});
