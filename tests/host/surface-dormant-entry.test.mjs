import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture({onWake=()=>false}={}){
 let time=1000,next=0,layer=false,occupied=false,surrender;const visible={workspace:false,sidebar:false};const events=new Map(),timers=new Map(),mutations=[];
 const calls={disposed:0,suspended:0,renewed:0,confirmed:0,shown:0,messages:[],ended:[]};
 const win={addEventListener(k,fn){if(!events.has(k))events.set(k,new Set());events.get(k).add(fn);},removeEventListener(k,fn){events.get(k)?.delete(fn);},MutationObserver:class{constructor(fn){mutations.push(fn);}observe(){}disconnect(){}}};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},createElement(){return {dataset:{},style:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,v){this.events[k]=v;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}};}};
 const slot={isConnected:true,ownerDocument:doc,children:[],append(button){this.children.push(button);button.parent=this;},contains(node){return this.children.includes(node);}};
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{postMessage(data,origin){calls.messages.push({data,origin});}}}}));
 const binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(21000).toISOString()};
 const inspection={ok:true,regionEpoch:1,navigationSlot:slot};
 const adapter={start:async()=>({binding}),stop(){},inspect:()=>occupied?{ok:false,reason:'native-content-occupies-return-slot'}:inspection,hasNativeLayer:()=>layer,updateBinding:()=>true};
 const surface={mount:async(context,inspection,options)=>{surrender=options.onSurrender;return {id:'mount',documentToken:'doc',regionEpoch:1};},frames:()=>frames,showWorkspace(){calls.shown++;visible.workspace=visible.sidebar=true;},showReading(){visible.workspace=false;},suspend(){calls.suspended++;visible.workspace=visible.sidebar=false;},dispose(){calls.disposed++;},visibility:()=>({...visible})};
 const bridge={registerMount:async()=>({ok:true}),confirmParent:async({role})=>{calls.confirmed++;return {ok:true,grant:{id:'grant_'+role,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};}};
 const controller=createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://ext',onWake,onTerminated:reason=>calls.ended.push(reason),now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const message=(role,type='VAIWL_UI_JOIN',extra={},overrides={})=>{const event={origin:'chrome-extension://ext',source:frames.find(x=>x.role===role).frame.contentWindow,data:{type,role,...(type==='VAIWL_UI_JOIN'?{nonce:'nonce_'+role}:{}),...extra},...overrides};for(const fn of events.get('message')??[])fn(event);};
 return {controller,adapter,surface,bridge,calls,slot,frames,doc,timers,message,nativeInput(){surrender({reason:'native-input'});},layer(v){layer=v;},occupied(v){occupied=v;},mutate(){for(const fn of mutations)fn();},async ready(){await controller.start({});message('workspace');message('sidebar');await flush();controller.showNativeReading();},advance(ms){time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}

async function dormant({notify='ok'}={}){
 let f,wakeCount=0;
 f=fixture({onWake:()=>{wakeCount++;return f.controller.resumeDormant({binding:f.fresh});}});
 const entries=[];f.bridge.workspaceEntered=input=>{entries.push(input);if(notify==='throw')throw Error('notification-failed');if(notify==='reject')return Promise.reject(Error('notification-failed'));return Promise.resolve({ok:true});};
 await f.ready();assert.equal(entries.length,0);assert.equal(f.controller.enterDormant(),true);
 const requestId=f.calls.messages.find(x=>x.data.type==='VAIWL_UI_IDLE').data.requestId;
 for(const role of ['workspace','sidebar'])f.message(role,'VAIWL_UI_IDLE_ACK',{requestId});
 f.adapter.start=async options=>({binding:options.binding});
 f.fresh={documentToken:'fresh-doc',producerToken:'fresh-producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(21000).toISOString()};
 f.surface.rebind=(handle,context)=>({...handle,documentToken:context.binding.documentToken});f.surface.isRebindCurrent=()=>true;
 return Object.assign(f,{entries,wakes:()=>wakeCount,click(trusted=true){f.slot.children[0].events.click({isTrusted:trusted});}});
}
async function joins(f){f.message('workspace');await flush();f.message('sidebar');await flush();}
test('trusted dormant return notifies once only after both fresh grants',async()=>{
 const f=await dormant();f.click();f.click();await flush();assert.equal(f.wakes(),1);assert.equal(f.entries.length,0);
 f.message('workspace');await flush();assert.equal(f.entries.length,0);
 f.message('sidebar');await flush();assert.deepEqual(f.entries,[{mountId:'mount'}]);assert.equal(f.controller.presentationMode(),'workspace');
 f.message('sidebar');f.message('workspace');await flush();assert.equal(f.entries.length,1);f.controller.stop();
});
test('untrusted click and programmatic resume do not manufacture workspace entry',async()=>{
 const f=await dormant();f.click(false);await flush();assert.equal(f.wakes(),0);assert.equal(f.entries.length,0);
 assert.ok(await f.controller.resumeDormant({binding:f.fresh}));await joins(f);assert.equal(f.controller.presentationMode(),'workspace');assert.equal(f.entries.length,0);f.controller.stop();
});
for(const reason of ['native-input','native-layer','registration-failure','stop'])test('trusted dormant entry is suppressed by '+reason,async()=>{
 const f=await dormant();let release;f.bridge.registerMount=()=>new Promise(resolve=>release=resolve);f.click();await flush();assert.equal(f.entries.length,0);
 if(reason==='native-input')f.nativeInput();if(reason==='native-layer')f.layer(true);if(reason==='stop')f.controller.stop();release({ok:reason!=='registration-failure'});await flush();await joins(f);
 assert.equal(f.entries.length,0);if(reason==='native-input')assert.equal(f.controller.presentationMode(),'reading');if(['registration-failure','stop'].includes(reason))assert.equal(f.calls.disposed,1);f.controller.stop();
});
for(const notify of ['throw','reject'])test('dormant entry notification '+notify+' cannot revoke opened UI',async()=>{
 const f=await dormant({notify});f.click();await flush();await joins(f);assert.equal(f.entries.length,1);assert.equal(f.controller.presentationMode(),'workspace');assert.equal(f.calls.disposed,0);assert.equal(f.controller.showWorkspace(),true);f.controller.stop();
});

for(const reason of ['native-input','native-layer'])test('synchronous '+reason+' while opening fresh surfaces cancels dormant entry notification',async()=>{
 const f=await dormant();f.click();await flush();
 const show=f.surface.showWorkspace,frames=f.frames.map(target=>target.frame),beforeSuspended=f.calls.suspended;
 f.surface.showWorkspace=()=>{show();if(reason==='native-input'){f.surface.suspend();f.nativeInput();}else{f.layer(true);f.controller.suspend('native-layer');}show();return true;};
 await joins(f);assert.equal(f.entries.length,0);assert.equal(f.calls.disposed,0);assert.equal(f.controller.presentationMode(),'reading');assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:false},'later surface opening must be closed after synchronous surrender');assert(f.calls.suspended>beforeSuspended);
 for(let i=0;i<frames.length;i++)assert.equal(f.frames[i].frame,frames[i]);
 if(reason==='native-input'){assert.equal(f.slot.children.length,1);assert.equal(f.controller.isReturnTarget(f.slot.children[0]),true);}else{assert.equal(f.slot.children.length,0);f.layer(false);f.mutate();assert.equal(f.slot.children.length,1);}
 f.controller.stop();
});

for(const replacement of [false,true])test('synchronous '+(replacement?'replacement':'stop')+' while showing cannot report success or remove the current return',async()=>{
 const f=fixture(),entered=[];f.bridge.workspaceEntered=value=>entered.push(value);await f.ready();const oldReturn=f.slot.children[0],show=f.surface.showWorkspace;let next;
 f.surface.showWorkspace=()=>{show();f.surface.showWorkspace=show;if(replacement)next=f.controller.start({});else f.controller.stop();return true;};
 assert.equal(f.controller.showWorkspace(),false,'abandoned presentation attempt cannot claim success');assert.equal(f.controller.presentationMode(),'reading');assert.equal(f.calls.disposed,1);assert.equal(entered.length,0);
 if(replacement){await next;await joins(f);f.controller.showNativeReading();const currentReturn=f.slot.children[0];assert(currentReturn);assert.notEqual(currentReturn,oldReturn);assert.equal(f.slot.children.length,1);assert.equal(f.controller.isReturnTarget(currentReturn),true);oldReturn.events.click({isTrusted:true});assert.equal(f.slot.children[0],currentReturn);assert.equal(f.controller.presentationMode(),'reading');assert.equal(entered.length,0);}
 else{assert.equal(f.slot.children.length,0);assert.equal(f.controller.showWorkspace(),false);}
 f.controller.stop();
});
