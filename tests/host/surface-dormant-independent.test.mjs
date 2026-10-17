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

test('dormant readiness requires both exact frame clearing receipts',async()=>{
 const f=fixture();await f.ready();assert.equal(f.controller.dormantReady(),false);assert.equal(f.controller.enterDormant(),true);assert.equal(f.controller.dormantReady(),false);
 const requestId=f.calls.messages.find(x=>x.data.type==='VAIWL_UI_IDLE').data.requestId;
 f.message('workspace','VAIWL_UI_IDLE_ACK',{requestId});assert.equal(f.controller.dormantReady(),false);
 f.message('workspace','VAIWL_UI_IDLE_ACK',{requestId});assert.equal(f.controller.dormantReady(),false);
 f.message('sidebar','VAIWL_UI_IDLE_ACK',{requestId});assert.equal(f.controller.dormantReady(),true);
 f.controller.stop();assert.equal(f.controller.dormantReady(),false);
});
for(const kind of ['request','origin','source','extra'])test('dormant readiness rejects mismatched '+kind+' receipt',async()=>{
 const f=fixture();await f.ready();f.controller.enterDormant();const requestId=f.calls.messages.find(x=>x.data.type==='VAIWL_UI_IDLE').data.requestId;
 const extra={requestId:kind==='request'?'wrong':requestId,...(kind==='extra'?{ok:true}:{})},override=kind==='origin'?{origin:'https://chatgpt.com'}:kind==='source'?{source:{}}:{};
 for(const role of ['workspace','sidebar'])f.message(role,'VAIWL_UI_IDLE_ACK',extra,override);
 assert.equal(f.controller.dormantReady(),false);f.controller.stop();
});
for(const kind of ['route','frame'])test('a confirmed dormant pair becomes invalid after '+kind+' changes',async()=>{
 const f=fixture();await f.ready();f.controller.enterDormant();const requestId=f.calls.messages.find(x=>x.data.type==='VAIWL_UI_IDLE').data.requestId;
 for(const role of ['workspace','sidebar'])f.message(role,'VAIWL_UI_IDLE_ACK',{requestId});assert.equal(f.controller.dormantReady(),true);
 if(kind==='route')f.doc.location.href+='c/changed';else f.frames[0].frame.contentWindow={};assert.equal(f.controller.dormantReady(),false);f.controller.stop();
});

async function dormantForResume(){
 const f=fixture();await f.ready();f.controller.enterDormant();const requestId=f.calls.messages.find(x=>x.data.type==='VAIWL_UI_IDLE').data.requestId;
 for(const role of ['workspace','sidebar'])f.message(role,'VAIWL_UI_IDLE_ACK',{requestId});
 f.adapter.start=async options=>({binding:options.binding});let rebinds=0;
 f.surface.rebind=(handle,context,inspection)=>{rebinds++;assert.equal(inspection.navigationSlot,f.slot);return Object.freeze({...handle,documentToken:context.binding.documentToken});};
 f.fresh={documentToken:'fresh-doc',producerToken:'fresh-producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(21000).toISOString()};
 f.surface.isRebindCurrent=()=>true;f.rebinds=()=>rebinds;return f;
}
test('dormant resume registers fresh binding on original frames before starting new joins',async()=>{
 const f=await dormantForResume(),original=f.frames.map(x=>x.frame),shown=f.calls.shown;let register;
 f.bridge.registerMount=()=>new Promise(r=>register=r);const pending=f.controller.resumeDormant({binding:f.fresh});await flush();
 assert.equal(f.rebinds(),1);assert.equal(f.calls.messages.filter(x=>x.data.type==='VAIWL_UI_WAKE').length,0);assert.equal(f.controller.showWorkspace(),false);
 assert.equal(await f.controller.resumeDormant({binding:f.fresh}),null);register({ok:true});const handle=await pending;assert.equal(handle.documentToken,'fresh-doc');assert.equal(f.controller.showWorkspace(),false);
 const wake=f.calls.messages.filter(x=>x.data.type==='VAIWL_UI_WAKE');assert.equal(wake.length,2);assert(wake.every(x=>x.data.requestId===f.calls.messages.find(y=>y.data.type==='VAIWL_UI_IDLE').data.requestId));assert.equal(f.calls.shown,shown);
 f.message('workspace');await flush();assert.equal(f.controller.showWorkspace(),false);f.message('sidebar');await flush();assert.equal(f.controller.showWorkspace(),true);assert.deepEqual(f.frames.map(x=>x.frame),original);assert.equal(f.calls.disposed,0);f.controller.stop();
});
for(const bad of ['producerToken','browserDocumentId','origin','expiresAt'])test('resume rejects invalid fresh '+bad+' without waking frames',async()=>{
 const f=await dormantForResume(),values={producerToken:'producer',browserDocumentId:'other',origin:'https://other.test',expiresAt:new Date(0).toISOString()};
 assert.equal(await f.controller.resumeDormant({binding:{...f.fresh,[bad]:values[bad]}}),null);assert.equal(f.calls.messages.filter(x=>x.data.type==='VAIWL_UI_WAKE').length,0);assert.equal(f.calls.disposed,1);
});
for(const reason of ['route','frame','stop','registration-denied'])test('pending resume rejects '+reason+' and never sends wake',async()=>{
 const f=await dormantForResume();let resolve;f.bridge.registerMount=()=>new Promise(r=>resolve=r);const pending=f.controller.resumeDormant({binding:f.fresh});await flush();
 if(reason==='route')f.doc.location.href+='c/change';if(reason==='frame')f.frames[0].frame.contentWindow={};if(reason==='stop')f.controller.stop();resolve({ok:reason!=='registration-denied'});
 assert.equal(await pending,null);assert.equal(f.calls.messages.filter(x=>x.data.type==='VAIWL_UI_WAKE').length,0);assert.equal(f.calls.disposed,1);
});
test('resume registration retains original six second deadline',async()=>{
 const f=await dormantForResume();let resolve;f.bridge.registerMount=()=>new Promise(r=>resolve=r);const pending=f.controller.resumeDormant({binding:f.fresh});await flush();f.advance(6000);assert.equal(await pending,null);
 resolve({ok:true});await flush();assert.equal(f.calls.messages.filter(x=>x.data.type==='VAIWL_UI_WAKE').length,0);assert.equal(f.calls.disposed,1);
});

test('resume revalidates closed surface integrity after asynchronous registration',async()=>{
 const f=await dormantForResume();let resolve,intact=true,checks=0;f.surface.isRebindCurrent=()=>{checks++;return intact;};f.bridge.registerMount=()=>new Promise(r=>resolve=r);
 const pending=f.controller.resumeDormant({binding:f.fresh});await flush();intact=false;resolve({ok:true});assert.equal(await pending,null);assert.equal(checks,1);assert.equal(f.calls.messages.filter(x=>x.data.type==='VAIWL_UI_WAKE').length,0);assert.equal(f.calls.disposed,1);
});
test('resume can keep reading after fresh joins without opening old projection',async()=>{
 const f=await dormantForResume(),shown=f.calls.shown;assert.ok(await f.controller.resumeDormant({binding:f.fresh},{mode:'reading'}));
 f.message('workspace');f.message('sidebar');await flush();assert.equal(f.calls.shown,shown);assert.equal(f.controller.presentationMode(),'reading');assert.equal(f.slot.children.length,1);f.controller.stop();
});

function acknowledgeIdle(f,role){const requestId=f.calls.messages.find(x=>x.data.type==='VAIWL_UI_IDLE').data.requestId;f.message(role,'VAIWL_UI_IDLE_ACK',{requestId});}
test('settlement waits for both exact frame ACKs and passes remaining deadline to worker',async()=>{
 const f=fixture();await f.ready();let released=[];f.bridge.releaseIdleMount=async value=>{released.push(value);return {ok:true};};assert(f.controller.enterDormant());
 const pending=f.controller.settleDormant({isCurrent:()=>true});await flush();assert.equal(released.length,0);acknowledgeIdle(f,'workspace');await flush();assert.equal(released.length,0);
 f.advance(4000);acknowledgeIdle(f,'sidebar');assert.equal(await pending,true);assert.equal(released.length,1);assert.equal(released[0].timeoutMs,2000);assert.equal(f.calls.disposed,0);assert.equal(f.slot.children.length,1);f.controller.stop();
});
for(const interruption of ['guard','stop','route','frame','deadline'])test('settlement refuses '+interruption+' before worker release',async()=>{
 const f=fixture();await f.ready();let releases=0,current=true;f.bridge.releaseIdleMount=async()=>{releases++;return {ok:true};};f.controller.enterDormant();const pending=f.controller.settleDormant({isCurrent:()=>current});
 if(interruption==='guard')current=false;if(interruption==='stop')f.controller.stop();if(interruption==='route')f.doc.location.href+='c/other';if(interruption==='frame')f.frames[0].frame.contentWindow={};if(interruption==='deadline')f.advance(6000);
 acknowledgeIdle(f,'workspace');acknowledgeIdle(f,'sidebar');if(['route','frame'].includes(interruption))f.advance(6000);
 assert.equal(await pending,false);assert.equal(releases,0);f.controller.stop();
});
for(const result of [{ok:false},{ok:true}])test('settlement singleflight and post-release guard '+result.ok,async()=>{
 const f=fixture();await f.ready();let resolve,current=true,releases=0;f.bridge.releaseIdleMount=()=>{releases++;return new Promise(r=>resolve=r);};f.controller.enterDormant();acknowledgeIdle(f,'workspace');acknowledgeIdle(f,'sidebar');
 const pending=f.controller.settleDormant({isCurrent:()=>current});await flush();assert.equal(await f.controller.settleDormant({isCurrent:()=>true}),false);assert.equal(releases,1);current=false;resolve(result);assert.equal(await pending,false);assert.equal(f.calls.disposed,0);f.controller.stop();
});

for(const result of ['busy','reject'])test('idle preflight '+result+' preserves renewal timers and current grants',async t=>{
 const f=fixture();t.after(()=>f.controller.stop());
 f.bridge.renewSession=async()=>{assert.fail('renewal must not run during immediate preflight');};
 await f.ready();const timers=[...f.timers.keys()],messages=f.calls.messages.length,suspended=f.calls.suspended;
 assert(timers.length>=2,'expiry and renewal are armed');
 f.bridge.checkIdleMount=async()=>{if(result==='reject')throw Error('worker unavailable');return {ok:false};};
 assert.equal(await f.controller.checkIdle({isCurrent:()=>true}),false);
 assert.deepEqual([...f.timers.keys()],timers);assert.equal(f.calls.messages.length,messages);assert.equal(f.calls.suspended,suspended);assert.equal(f.calls.disposed,0);
 assert.equal(f.controller.showWorkspace(),true,'original grants still authorize presentation');
});
test('successful controller preflight does not clear frames and settlement still requires both ACKs',async t=>{
 const f=fixture();t.after(()=>f.controller.stop());await f.ready();let checks=0,releases=0;
 f.bridge.checkIdleMount=async({handle,timeoutMs})=>{assert.equal(handle.id,'mount');assert.equal(timeoutMs,4321);checks++;return {ok:true};};
 f.bridge.releaseIdleMount=async()=>{releases++;return {ok:true};};
 const before=f.calls.messages.length,timers=[...f.timers.keys()];
 assert.equal(await f.controller.checkIdle({isCurrent:()=>true,timeoutMs:4321}),true);assert.equal(checks,1);assert.equal(f.calls.messages.length,before);assert.deepEqual([...f.timers.keys()],timers);assert.equal(f.controller.dormantReady(),false);
 assert.equal(f.controller.enterDormant(),true);const pending=f.controller.settleDormant({isCurrent:()=>true});await flush();assert.equal(releases,0);
 acknowledgeIdle(f,'workspace');await flush();assert.equal(releases,0);assert.equal(f.controller.dormantReady(),false);
 acknowledgeIdle(f,'sidebar');assert.equal(await pending,true);assert.equal(releases,1);
});
for(const change of ['scope','guard','visible','route','stop'])test('late successful idle preflight rejects changed '+change,async t=>{
 const f=fixture();t.after(()=>f.controller.stop());await f.ready();let resolve,current=true,scope='scope';
 f.bridge.checkIdleMount=()=>new Promise(done=>resolve=done);
 const pending=f.controller.checkIdle({isCurrent:()=>current&&scope==='scope'});await flush();assert.equal(typeof resolve,'function');
 if(change==='scope')scope='replacement';if(change==='guard')current=false;if(change==='visible')f.surface.visibility=()=>({workspace:true,sidebar:false});if(change==='route')f.doc.location.href+='c/other';if(change==='stop')f.controller.stop();
 resolve({ok:true});assert.equal(await pending,false);assert.equal(f.calls.messages.filter(m=>m.data.type==='VAIWL_UI_IDLE').length,0);
 if(['scope','guard','visible'].includes(change)){assert.equal(f.calls.disposed,0);assert.equal(f.controller.showWorkspace(),true);}
});
