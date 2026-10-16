import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture({onWake=()=>false}={}){
 let time=1000,next=0,layer=false,occupied=false;const events=new Map(),timers=new Map(),mutations=[];
 const calls={disposed:0,suspended:0,renewed:0,confirmed:0,shown:0,messages:[],ended:[]};
 const win={addEventListener(k,fn){if(!events.has(k))events.set(k,new Set());events.get(k).add(fn);},removeEventListener(k,fn){events.get(k)?.delete(fn);},MutationObserver:class{constructor(fn){mutations.push(fn);}observe(){}disconnect(){}}};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},createElement(){return {dataset:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,v){this.events[k]=v;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}};}};
 const slot={isConnected:true,ownerDocument:doc,children:[],append(button){this.children.push(button);button.parent=this;},contains(node){return this.children.includes(node);}};
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{postMessage(data,origin){calls.messages.push({data,origin});}}}}));
 const binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(21000).toISOString()};
 const inspection={ok:true,regionEpoch:1,navigationSlot:slot};
 const adapter={start:async()=>({binding}),stop(){},inspect:()=>occupied?{ok:false,reason:'native-content-occupies-return-slot'}:inspection,hasNativeLayer:()=>layer,updateBinding:()=>true};
 const surface={mount:async()=>({id:'mount',documentToken:'doc',regionEpoch:1}),frames:()=>frames,showWorkspace(){calls.shown++;},showReading(){},suspend(){calls.suspended++;},dispose(){calls.disposed++;},visibility:()=>({workspace:false,sidebar:false})};
 const bridge={registerMount:async()=>({ok:true}),confirmParent:async({role})=>{calls.confirmed++;return {ok:true,grant:{id:'grant_'+role,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};}};
 const controller=createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://ext',onWake,onTerminated:reason=>calls.ended.push(reason),now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const message=(role,type='VAIWL_UI_JOIN')=>{const event={origin:'chrome-extension://ext',source:frames.find(x=>x.role===role).frame.contentWindow,data:{type,role,...(type==='VAIWL_UI_JOIN'?{nonce:'nonce_'+role}:{})}};for(const fn of events.get('message')??[])fn(event);};
 return {controller,adapter,surface,bridge,calls,slot,frames,doc,timers,message,layer(v){layer=v;},occupied(v){occupied=v;},mutate(){for(const fn of mutations)fn();},async ready(){await controller.start({});message('workspace');message('sidebar');await flush();controller.showNativeReading();},advance(ms){time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}
for(const role of ['workspace','sidebar'])test('failed '+role+' idle dispatch cannot claim dormant success with a live unrevoked client',async()=>{
 const f=fixture();await f.ready();f.frames.find(x=>x.role===role).frame.contentWindow.postMessage=()=>{throw Error('closed-or-unavailable-frame');};
 assert.equal(f.controller.enterDormant(),false);assert.equal(f.calls.disposed,1);assert.equal(f.slot.children.length,0);
});
test('dormant return yields an original slot subsequently occupied by native UI',async()=>{
 const f=fixture();await f.ready();assert.equal(f.controller.enterDormant(),true);const native={isConnected:true,ownerDocument:f.doc,hasAttribute:()=>false};f.slot.children.push(native);f.occupied(true);f.mutate();assert(!f.slot.children.some(n=>n.dataset?.vaOwned));assert(f.slot.children.includes(native));
});
test('native modal blocks dormant wake before asynchronous DOM reconciliation',async()=>{
 let woke=0;const f=fixture({onWake:()=>{woke++;}});await f.ready();assert.equal(f.controller.enterDormant(),true);const button=f.slot.children[0];f.layer(true);button.events.click({isTrusted:true});assert.equal(woke,0);f.mutate();assert.equal(f.slot.children.length,0);f.layer(false);f.mutate();assert.equal(f.slot.children.length,1);assert.equal(f.calls.shown,1);
});
test('public EXIT SUSPEND and JOIN cannot revive or dispose dormant original frames',async()=>{
 const f=fixture();await f.ready();assert.equal(f.controller.enterDormant(),true);const confirms=f.calls.confirmed;for(const type of ['VAIWL_UI_EXIT','VAIWL_UI_SUSPEND','VAIWL_UI_JOIN'])for(const role of ['workspace','sidebar'])f.message(role,type);await flush();f.advance(60000);assert.equal(f.calls.disposed,0);assert.equal(f.calls.confirmed,confirms);assert.equal(f.controller.focusFrame('workspace'),false);assert.equal(f.controller.showWorkspace(),false);
});
test('a replaced frame window during dormant state triggers complete cleanup',async()=>{
 const f=fixture();await f.ready();assert.equal(f.controller.enterDormant(),true);f.frames[0].frame.contentWindow={};f.mutate();assert.equal(f.calls.disposed,1);assert.equal(f.slot.children.length,0);assert.equal(f.controller.showWorkspace(),false);
});
test('wake callback failure leaves no old-grant route back to the workspace',async()=>{
 let woke=0;const f=fixture({onWake:()=>{woke++;throw Error('fresh-auth-denied');}});await f.ready();assert.equal(f.controller.enterDormant(),true);f.slot.children[0].events.click({isTrusted:true});await flush();assert.equal(woke,1);assert.equal(f.controller.showWorkspace(),false);assert.equal(f.calls.shown,1);assert.equal(f.calls.disposed,0);
});
