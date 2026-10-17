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

async function renewable(t){const f=await dormant(t);f.bridge.renewDormantBinding=async({binding})=>({ok:true,binding:renewed(binding)});assert.equal(await f.controller.renewDormantLease(),true);return f;}
test('cancelled busy close keeps original frames and only fresh dual JOIN restores authority',async t=>{
 const f=await renewable(t),frames=f.frames.map(item=>item.frame),confirmed=f.calls.confirmed,shown=f.calls.shown;
 let ready=0;f.bridge.cancelledCloseReady=()=>ready++;
 f.surface.rebind=()=>assert.fail('must not rebind');f.bridge.registerMount=()=>assert.fail('must not register again');
 assert.equal(f.controller.cancelDormantClose(),true);
 const idle=f.calls.messages.find(item=>item.data.type==='VAIWL_UI_IDLE').data.requestId,wakes=f.calls.messages.filter(item=>item.data.type==='VAIWL_UI_WAKE');
 assert.equal(wakes.length,2);assert(wakes.every(item=>item.data.requestId===idle));assert.deepEqual(f.frames.map(item=>item.frame),frames);
 assert.equal(f.controller.showWorkspace(),false);assert.equal(f.controller.focusFrame('workspace'),false);assert.equal(f.calls.confirmed,confirmed);assert.equal(ready,0);
 f.message('workspace');await flush();assert.equal(f.controller.showWorkspace(),false);assert.equal(f.calls.confirmed,confirmed+1);assert.equal(ready,0);
 f.message('sidebar');await flush();assert.equal(f.calls.confirmed,confirmed+2);assert.equal(ready,1);assert.equal(f.calls.shown,shown,'dual JOIN resumes reading');assert.equal(f.controller.presentationMode(),'reading');assert.equal(f.controller.showWorkspace(),true);assert.equal(f.calls.disposed,0);
 assert.equal(f.controller.cancelDormantClose(),false,'consumed transition cannot resend WAKE');assert.equal(f.calls.messages.filter(item=>item.data.type==='VAIWL_UI_WAKE').length,2);
});
for(const reason of ['no-busy','not-renewed','renew-failed','expired','route','frame','stop'])test('cancel dormant close refuses '+reason,async t=>{
 const f=reason==='no-busy'?await dormant(t,{busy:false}):['not-renewed','renew-failed'].includes(reason)?await dormant(t):await renewable(t);
 if(reason==='renew-failed'){f.bridge.renewDormantBinding=async()=>({ok:false});assert.equal(await f.controller.renewDormantLease(),false);}
 if(reason==='expired')f.advance(20000);if(reason==='route')f.doc.location.href+='c/changed';if(reason==='frame')f.frames[0].frame.contentWindow={};if(reason==='stop')f.controller.stop();
 assert.equal(f.controller.cancelDormantClose(),false);assert.equal(f.calls.messages.filter(item=>item.data.type==='VAIWL_UI_WAKE').length,0);assert.equal(f.controller.showWorkspace(),false);
});

test('native layer during cancellation cannot strand successful dual grant notification',async t=>{
 const f=await renewable(t);let ready=0;f.bridge.cancelledCloseReady=()=>ready++;
 assert.equal(f.controller.cancelDormantClose(),true);f.layer(true);f.controller.suspend('native-layer');
 const shown=f.calls.shown;f.message('workspace');await flush();assert.equal(ready,0);
 f.message('sidebar');await flush();assert.equal(ready,1);assert.equal(f.calls.shown,shown);assert.equal(f.controller.showWorkspace(),false);
});
