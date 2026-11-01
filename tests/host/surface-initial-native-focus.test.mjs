import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
// Isolated DOM/lifecycle mocks: these contracts do not certify actual Chrome masks.
function fixture(){
 const listeners=new Map(),timers=new Map();let time=1000,n=0,layer=false,region=1,observer,surrender;
 const calls={terminations:[],updates:[],show:0,reading:0,suspend:0,dispose:0,confirm:[],register:0,stop:0};
 const win={addEventListener:(k,fn)=>{if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener:(k,fn)=>listeners.get(k)?.delete(fn),MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}};
 const slot={isConnected:true,children:[],append(b){this.children.push(b);b.parent=this;}};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},createElement:()=>({dataset:{},style:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.events[k]=fn;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}})};
 const composer={isConnected:true,ownerDocument:doc,contains:n=>n===editor||n===editorChild},header={isConnected:true,ownerDocument:doc,contains:n=>n===model},editor={isConnected:true,ownerDocument:doc,parentElement:composer},editorChild={isConnected:true,ownerDocument:doc,parentElement:editor},model={isConnected:true,ownerDocument:doc,parentElement:header};doc.activeElement=doc.body;doc.body.isConnected=true;doc.body.ownerDocument=doc;
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{}}}));
 const binding={documentToken:'token',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(60000).toISOString()};
 const adapter={updateBinding:next=>{calls.updates.push(next);return true;},start:async()=>({binding}),stop:()=>{calls.stop++;},inspect:()=>({ok:true,regionEpoch:region,navigationSlot:slot,composer,header,protectedRegions:[header,composer]}),hasNativeLayer:()=>layer};
 let visible=false;
 const surface={mount:async(c,i,o)=>(surrender=o.onSurrender,{id:'mount',documentToken:'token',regionEpoch:region}),frames:()=>frames,showWorkspace:(_h,o)=>{if(o?.roles?.includes('workspace')!==false){visible=true;calls.show++;}},visibility:()=>({workspace:visible,sidebar:visible}),showReading:()=>{visible=false;calls.reading++;},suspend:()=>{visible=false;calls.suspend++;},dispose:()=>{calls.dispose++;}};
 const bridge={registerMount:async()=>{calls.register++;return {ok:true};},confirmParent:async value=>{calls.confirm.push(value);return {ok:true,grant:{id:`grant_${value.role}`,mountId:'mount',role:value.role,parentDocumentId:'parent',uiDocumentId:`ui_${value.role}`,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};}};
 const controller=createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://extension',onTerminated:(reason,presentation)=>calls.terminations.push({reason,presentation}),now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++n;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const message=(role='workspace',patch={})=>{const event={source:frames.find(x=>x.role===role).frame.contentWindow,origin:'chrome-extension://extension',data:{type:'VAIWL_UI_JOIN',role,nonce:`nonce_${role}`},...patch};for(const fn of listeners.get('message')??[])fn(event);};
 const both=async()=>{message();message('sidebar');await drain();};
 return {editor,editorChild,composer,header,model,timers,focus(node){doc.activeElement=node;surrender?.({reason:'native-input'});},renewAck:()=>({ok:true,binding:{...binding,expiresAt:new Date(time+20000).toISOString()},grants:['workspace','sidebar'].map(role=>({id:`grant_${role}`,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:`ui_${role}`,scopeGrantId:'scope',expiresAt:new Date(time+20000).toISOString()}))}),surrender:event=>surrender?.(event),pagehide:()=>{for(const fn of listeners.get('pagehide')??[])fn();},controller,bridge,adapter,surface,doc,slot,frames,binding,calls,message,both,change:()=>observer?.(),layer:value=>{layer=value;},region:()=>{region++;},tick:ms=>{time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}

for(const target of ['editor','editorChild','model'])test('native '+target+' already focused before mount remains native until explicit return',async t=>{
 const f=fixture();t.after(()=>f.controller.stop());f.doc.activeElement=f[target];await f.controller.start({});assert.equal(f.slot.children.length,0);assert.equal(f.calls.show,0);f.message();await drain();assert.equal(f.slot.children.length,1);assert.equal(f.calls.show,0);f.message('sidebar');await drain();
 assert.equal(f.calls.show,0,'late initial grants cannot mask reading after protected native focus');assert.equal(f.slot.children.length,1);assert.equal(f.slot.children[0]['aria-label'],'返回工作空间');assert.equal(f.doc.activeElement,f[target]);assert.equal(f.controller.presentationMode(),'reading');
 f.slot.children[0].events.click({isTrusted:true});assert.equal(f.calls.show,1);assert.equal(f.slot.children.length,0);
});
for(const stage of ['adapter-start','mount-registration','workspace-grant','sidebar-grant'])test('native focus while '+stage+' pending never authorizes return early and survives final grants',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.controller.stop());let pending;
 if(stage==='adapter-start'){f.adapter.start=()=>held.promise;pending=f.controller.start({});await drain();f.doc.activeElement=f.editor;held.resolve({binding:f.binding});await pending;}
 else if(stage==='mount-registration'){f.bridge.registerMount=()=>held.promise;pending=f.controller.start({});await drain();f.focus(f.editor);assert.equal(f.slot.children.length,0);held.resolve({ok:true});await pending;}
 else{await f.controller.start({});const original=f.bridge.confirmParent;f.bridge.confirmParent=value=>value.role===(stage==='workspace-grant'?'workspace':'sidebar')?held.promise:original(value);f.focus(f.editor);f.message();f.message('sidebar');await drain();assert.equal(f.slot.children.length,stage==='sidebar-grant'?1:0);held.resolve(await original({role:stage==='workspace-grant'?'workspace':'sidebar'}));await drain();}
 if(stage==='adapter-start'||stage==='mount-registration'){assert.equal(f.slot.children.length,0);assert.equal(f.calls.show,0);await f.both();}
 assert.equal(f.calls.show,0);assert.equal(f.slot.children.length,1);assert.equal(f.doc.activeElement,f.editor);assert.equal(f.calls.register,stage==='mount-registration'?0:1);
});
test('pending native-input surrender is remembered even if focus subsequently moves to neutral body',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.controller.stop());f.bridge.registerMount=()=>held.promise;const pending=f.controller.start({});await drain();f.focus(f.editor);f.doc.activeElement=f.doc.body;assert.equal(f.slot.children.length,0);held.resolve({ok:true});await pending;await f.both();assert.equal(f.calls.show,0);assert.equal(f.slot.children.length,1);
});
for(const invalid of ['stop','expired','wrong-window'])test('native focus cannot bypass '+invalid+' grant gate',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.controller.stop());await f.controller.start({});const original=f.bridge.confirmParent;f.bridge.confirmParent=value=>value.role==='workspace'?held.promise:original(value);f.message();f.message('sidebar');await drain();f.focus(f.editor);assert.equal(f.slot.children.length,0);
 if(invalid==='stop')f.controller.stop();if(invalid==='expired')f.tick(20000);if(invalid==='wrong-window')f.frames[0].frame.contentWindow={};held.resolve(await original({role:'workspace'}));await drain();assert.equal(f.calls.show,0);assert.equal(f.slot.children.length,0);
});
for(const target of ['body','detached','foreign-document','owned-frame'])test('unprotected '+target+' focus retains ordinary initial workspace behavior',async t=>{
 const f=fixture();t.after(()=>f.controller.stop());if(target==='body')f.doc.activeElement=f.doc.body;if(target==='detached'){f.editor.isConnected=false;f.doc.activeElement=f.editor;}if(target==='foreign-document'){f.editor.ownerDocument={};f.doc.activeElement=f.editor;}if(target==='owned-frame')f.doc.activeElement=f.frames[0].frame;await f.controller.start({});await f.both();assert.equal(f.calls.show,1);assert.equal(f.slot.children.length,0);
});
test('native portal present at final grants defers private surfaces and closing it restores one return without auto-open',async t=>{
 const f=fixture();t.after(()=>f.controller.stop());await f.controller.start({});f.focus(f.editor);f.layer(true);await f.both();assert.equal(f.calls.show,0);assert.equal(f.slot.children.length,0);assert.equal(f.doc.activeElement,f.editor);
 f.layer(false);f.change();await drain();assert.equal(f.calls.show,0);assert.equal(f.slot.children.length,1);assert.equal(f.doc.activeElement,f.editor);f.change();assert.equal(f.slot.children.length,1);
});
test('preexisting native shadow-host focus is recognized before descending beyond native contains boundary',async t=>{
 const f=fixture();t.after(()=>f.controller.stop());const inner={isConnected:true,ownerDocument:f.doc};f.editor.shadowRoot={activeElement:inner};f.doc.activeElement=f.editor;
 assert.equal(f.composer.contains(inner),false,'DOM contains does not cross the shadow boundary');await f.controller.start({});assert.equal(f.slot.children.length,0);await f.both();assert.equal(f.calls.show,0);assert.equal(f.slot.children.length,1);assert.equal(f.doc.activeElement,f.editor);assert.equal(f.editor.shadowRoot.activeElement,inner);
});
test('native focus inside a surrounding open shadow root remains protected',async t=>{
 const f=fixture();t.after(()=>f.controller.stop());const host={isConnected:true,ownerDocument:f.doc,shadowRoot:{activeElement:f.editor}};f.doc.activeElement=host;
 await f.controller.start({});assert.equal(f.slot.children.length,0);await f.both();assert.equal(f.calls.show,0);assert.equal(f.slot.children.length,1);assert.equal(f.doc.activeElement,host);assert.equal(host.shadowRoot.activeElement,f.editor);
});
