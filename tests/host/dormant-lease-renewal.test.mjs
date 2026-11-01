import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture({onWake=()=>false}={}){
 let time=1000,next=0,layer=false,occupied=false;const events=new Map(),timers=new Map(),mutations=[];
 const calls={disposed:0,suspended:0,renewed:0,confirmed:0,shown:0,messages:[],ended:[]};
 const win={addEventListener(k,fn){if(!events.has(k))events.set(k,new Set());events.get(k).add(fn);},removeEventListener(k,fn){events.get(k)?.delete(fn);},MutationObserver:class{constructor(fn){mutations.push(fn);}observe(){}disconnect(){}}};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},createElement(){return {dataset:{},style:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,v){this.events[k]=v;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}};}};
 const slot={isConnected:true,ownerDocument:doc,children:[],append(button){this.children.push(button);button.parent=this;},contains(node){return this.children.includes(node);}};
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{postMessage(data,origin){calls.messages.push({data,origin});}}}}));
 const binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(21000).toISOString()};
 const inspection={ok:true,regionEpoch:1,navigationSlot:slot};
 const adapter={start:async()=>({binding}),stop(){},inspect:()=>occupied?{ok:false,reason:'native-content-occupies-return-slot'}:inspection,hasNativeLayer:()=>layer,updateBinding:()=>true};
 const surface={mount:async()=>({id:'mount',documentToken:'doc',regionEpoch:1}),frames:()=>frames,showWorkspace(){calls.shown++;},showReading(){},suspend(){calls.suspended++;},dispose(){calls.disposed++;},visibility:()=>({workspace:false,sidebar:false})};
 const bridge={registerMount:async()=>({ok:true}),confirmParent:async({role})=>{calls.confirmed++;return {ok:true,grant:{id:'grant_'+role,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};}};
 const controller=createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://ext',onWake,onTerminated:reason=>calls.ended.push(reason),now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const message=(role,type='VAIWL_UI_JOIN',extra={},overrides={})=>{const event={origin:'chrome-extension://ext',source:frames.find(x=>x.role===role).frame.contentWindow,data:{type,role,...(type==='VAIWL_UI_JOIN'?{nonce:'nonce_'+role}:{}),...extra},...overrides};for(const fn of events.get('message')??[])fn(event);};
 return {controller,adapter,surface,bridge,calls,slot,frames,doc,timers,message,layer(v){layer=v;},occupied(v){occupied=v;},mutate(){for(const fn of mutations)fn();},async ready(){await controller.start({});message('workspace');message('sidebar');await flush();controller.showNativeReading();},advance(ms){time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}

// L: actual controller; browser surfaces and worker bridge are explicit doubles.
async function dormant(t,{busy=true}={}){
 const f=fixture();t.after(()=>f.controller.stop());await f.ready();assert.equal(f.controller.enterDormant(),true);
 const requestId=f.calls.messages.find(item=>item.data.type==='VAIWL_UI_IDLE').data.requestId;
 for(const role of ['workspace','sidebar'])f.message(role,'VAIWL_UI_IDLE_ACK',{requestId});assert.equal(f.controller.dormantReady(),true);
 if(busy){f.bridge.releaseIdleMount=async()=>({ok:false,reason:'ui-release-busy'});assert.equal(await f.controller.settleDormant({isCurrent:()=>true}),false);}
 f.advance(1000);
 f.adapter.start=()=>assert.fail('lease renewal must not restart adapter');f.bridge.renewSession=()=>assert.fail('no ordinary UI renewal');
 return f;
}
const renewed=binding=>({...binding,expiresAt:new Date(22000).toISOString()});
test('same-producer dormant lease refresh retains cleared frames and never restores UI authority',async t=>{
 const f=await dormant(t),original=f.frames.map(item=>item.frame),messages=f.calls.messages.length,updated=[];let calls=0;
 f.adapter.updateBinding=binding=>{updated.push(binding);return true;};
 f.bridge.renewDormantBinding=async({handle,binding})=>{calls++;assert.equal(handle.id,'mount');assert.equal(binding.producerToken,'producer');return {ok:true,binding:renewed(binding)};};
 assert.equal(await f.controller.renewDormantLease(),true);assert.equal(calls,1);assert.equal(updated.length,1);assert.equal(updated[0].producerToken,'producer');assert.equal(updated[0].expiresAt,new Date(22000).toISOString());
 assert.deepEqual(f.frames.map(item=>item.frame),original);assert.equal(f.calls.messages.length,messages);assert.equal(f.controller.showWorkspace(),false);assert.equal(f.controller.focusFrame('workspace'),false);assert.equal(f.controller.dormantReady(),true);assert.equal(f.calls.disposed,0);
});
for(const field of ['producerToken','documentToken','browserDocumentId','routeEpoch','origin','expiresAt','tooFar'])test('dormant lease rejects changed or expired '+field,async t=>{
 const f=await dormant(t);let updates=0;f.adapter.updateBinding=()=>{updates++;return true;};
 const replacements={producerToken:'other',documentToken:'other',browserDocumentId:'other',routeEpoch:2,origin:'https://other.test',expiresAt:new Date(1000).toISOString()};
 f.bridge.renewDormantBinding=async({binding})=>({ok:true,binding:{...renewed(binding),[field==='tooFar'?'expiresAt':field]:field==='tooFar'?new Date(22001).toISOString():replacements[field]}});
 assert.equal(await f.controller.renewDormantLease(),false);assert.equal(updates,0);assert.equal(f.calls.messages.filter(item=>item.data.type==='VAIWL_UI_WAKE').length,0);assert.equal(f.controller.showWorkspace(),false);
});
for(const reason of ['route','stop'])test('late dormant lease reply cannot survive '+reason,async t=>{
 const f=await dormant(t);let resolve,updates=0;f.adapter.updateBinding=()=>{updates++;return true;};
 f.bridge.renewDormantBinding=({binding})=>new Promise(done=>resolve=()=>done({ok:true,binding:renewed(binding)}));
 const pending=f.controller.renewDormantLease();await flush();assert.equal(typeof resolve,'function');
 if(reason==='route')f.doc.location.href+='c/changed';else f.controller.stop();resolve();assert.equal(await pending,false);assert.equal(updates,0);assert.equal(f.calls.messages.filter(item=>item.data.type==='VAIWL_UI_WAKE').length,0);assert.equal(f.controller.showWorkspace(),false);
});

test('one busy release result allows at most one dormant lease bridge request',async t=>{
 const f=await dormant(t);let calls=0;f.bridge.renewDormantBinding=async({binding})=>{calls++;return {ok:true,binding:renewed(binding)};};
 assert.equal(await f.controller.renewDormantLease(),true);assert.equal(await f.controller.renewDormantLease(),false);assert.equal(calls,1);
});
for(const mode of ['unsettled','released','other-failure'])test('dormant lease rejects '+mode+' without a real busy release result',async t=>{
 const f=await dormant(t,{busy:false});let calls=0;f.bridge.renewDormantBinding=async({binding})=>{calls++;return {ok:true,binding:renewed(binding)};};
 if(mode!=='unsettled'){f.bridge.releaseIdleMount=async()=>mode==='released'?{ok:true}:{ok:false,reason:'scope-revoked'};assert.equal(await f.controller.settleDormant({isCurrent:()=>true}),mode==='released');}
 assert.equal(await f.controller.renewDormantLease(),false);assert.equal(calls,0);assert.equal(f.controller.showWorkspace(),false);
});
