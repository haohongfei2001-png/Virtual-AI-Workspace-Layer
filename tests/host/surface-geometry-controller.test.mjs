import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
// Controller lifecycle doubles; actual page-zoom geometry is a separate Chrome oracle.
function fixture({geometry=true}={}){
 const events=new Map(),viewport=new Map(),observers=[],calls=[];let region=1,time=1000,ok=true,layer=false,id=0;
 const target=map=>({addEventListener(k,fn){if(!map.has(k))map.set(k,new Set());map.get(k).add(fn);},removeEventListener(k,fn){map.get(k)?.delete(fn);}});
 const win={...target(events),visualViewport:target(viewport),ResizeObserver:class{constructor(fn){this.fn=fn;this.nodes=[];this.disconnected=false;observers.push(this);}observe(n){this.nodes.push(n);}disconnect(){this.disconnected=true;}}};
 const slot={isConnected:true,children:[],append(n){this.children.push(n);n.parent=this;}};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},activeElement:{native:true},draft:'UNSENT',createElement:()=>({dataset:{},setAttribute(){},addEventListener(){},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}})};
 const nodes=Array.from({length:4},()=>({isConnected:true,ownerDocument:doc}));
 const inspection=()=>({ok,regionEpoch:region,reading:nodes[0],header:nodes[1],composer:nodes[2],historyMaskRoots:[nodes[3]],protectedRegions:[nodes[1],nodes[2]],navigationSlot:slot,readingRect:{x:100,y:40,width:800,height:500}});
 const binding={documentToken:'token',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(60000).toISOString()};
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{}}}));
 const adapter={start:async()=>({binding}),stop:()=>calls.push('stop'),inspect:inspection,hasNativeLayer:()=>layer};
 const surface={mount:async()=>({id:'mount'+(++id),documentToken:'token',regionEpoch:region}),frames:()=>frames,showWorkspace:()=>{calls.push('show');return true;},showReading:()=>calls.push('reading'),suspend:()=>calls.push('suspend'),dispose:()=>calls.push('dispose')};
 if(geometry)surface.refreshGeometry=(handle,value)=>{calls.push({handle,inspection:value});return true;};
 const bridge={registerMount:async()=>({ok:true}),confirmParent:async v=>({ok:true,grant:{id:'grant_'+v.role,mountId:v.mountId,role:v.role,parentDocumentId:'parent',uiDocumentId:'ui_'+v.role,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}})};
 const controller=createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://extension',now:()=>time,schedule:()=>++id,cancel:()=>{}});
 const emit=(name,map=events)=>{for(const fn of [...map.get(name)??[]])fn();};
 const both=async()=>{for(const {role,frame}of frames)for(const fn of events.get('message')??[])fn({origin:'chrome-extension://extension',source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'nonce_'+role}});await drain();};
 return {controller,surface,adapter,doc,frames,events,viewport,observers,calls,emit,both,region:()=>region++,invalid:()=>{ok=false;},expire:()=>{time=22000;},layer:()=>{layer=true;},refreshes:()=>calls.filter(x=>typeof x==='object')};
}
test('window/visualViewport/observed native resize refresh current geometry without opening or authorizing UI',async()=>{
 const f=fixture();await f.controller.start({});assert.equal(f.observers.length,1);assert.equal(f.observers[0].nodes.length,4);
 f.emit('resize');f.emit('resize',f.viewport);f.observers[0].fn();assert.equal(f.refreshes().length,3);assert.equal(f.calls.includes('show'),false);assert.equal(f.controller.showWorkspace(),false);
 await f.both();const focus=f.doc.activeElement;f.controller.showReading();const guard=f.controller.readingGuard(),n=f.calls.filter(x=>x==='show').length;f.emit('resize');assert.equal(guard(),true);assert.equal(f.doc.activeElement,focus);assert.equal(f.doc.draft,'UNSENT');assert.equal(f.calls.filter(x=>x==='show').length,n);f.controller.stop();
});
test('workspace entry validates latest geometry before opening and refuses failed refresh',async()=>{
 const f=fixture();await f.controller.start({});await f.both();assert.equal(typeof f.calls.at(-2),'object');assert.equal(f.calls.at(-1),'show');f.controller.showReading();f.surface.refreshGeometry=()=>false;
 assert.equal(f.controller.showWorkspace(),false);assert.equal(f.calls.at(-1),'dispose');assert.equal(f.calls.filter(x=>x==='show').length,1);assert.equal(f.controller.showWorkspace(),false);
});
for(const failure of ['false','throw'])test('geometry '+failure+' disposes surfaces and listeners',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.surface.refreshGeometry=()=>{if(failure==='throw')throw Error('unsafe');return false;};f.observers[0].fn();assert.equal(f.calls.filter(x=>x==='dispose').length,1);assert.equal(f.observers[0].disconnected,true);assert.equal(f.events.get('resize').size,0);assert.equal(f.viewport.get('resize').size,0);assert.equal(f.controller.showWorkspace(),false);
});
for(const mutate of [f=>f.region(),f=>f.invalid(),f=>{f.doc.location.href+='c/new';},f=>{f.frames[0].frame.isConnected=false;}])test('stale native/frame identity terminates before geometry refresh',async()=>{
 const f=fixture();await f.controller.start({});await f.both();const count=f.refreshes().length;mutate(f);f.emit('resize');assert.equal(f.refreshes().length,count);assert.equal(f.calls.filter(x=>x==='dispose').length,1);
});
test('expired grants and native layers cannot use resize to open workspace',async()=>{
 for(const mutate of [f=>f.expire(),f=>f.layer()]){const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();mutate(f);f.emit('resize');assert.equal(f.controller.showWorkspace(),false);assert.equal(f.calls.filter(x=>x==='show').length,1);f.controller.stop();}
});
test('stopped and superseded geometry callbacks never touch a subsequent mount',async()=>{
 const f=fixture();await f.controller.start({});await f.both();const old=f.observers[0],resize=[...f.viewport.get('resize')][0];f.controller.stop();const count=f.refreshes().length;old.fn();resize();assert.equal(f.refreshes().length,count);await f.controller.start({});await f.both();const next=f.refreshes().length;old.fn();resize();assert.equal(f.refreshes().length,next);assert.equal(f.observers[0].disconnected,true);assert.equal(f.observers[1].disconnected,false);f.controller.stop();assert.equal(f.observers[1].disconnected,true);
});
test('legacy surface without geometry API does not register geometry observers',async()=>{const f=fixture({geometry:false});await f.controller.start({});await f.both();assert.equal(f.observers.length,0);assert.equal(f.viewport.has('resize'),false);assert.equal(f.calls.includes('show'),true);f.controller.stop();});
