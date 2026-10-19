import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const drain=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
// Real content and surface lifecycle together; DOM/worker are explicit doubles.
// Region replacement is delivered through the real controller's resize listener,
// never by calling its termination callback or manufacturing a new grant locally.
function fixture(t,{contextRecovery=true}={}){
 let now=1000,id=0,generation=0,region=1,geometry=true,visible=true,respond=null,answer={state:'verified',scopeKey:'scope-A'};
 const calls=[],adapters=[],frames=[],timers=new Map(),events=new Map(),listeners=new Set();
 const on=(k,f)=>{if(!events.has(k))events.set(k,new Set());events.get(k).add(f);};
 const off=(k,f)=>events.get(k)?.delete(f),emit=(k,e)=>{for(const f of [...events.get(k)??[]])f(e);};
 const win={addEventListener:on,removeEventListener:off};
 const slot={isConnected:true,children:[],append(n){this.children.push(n);n.remove=()=>{this.children=this.children.filter(x=>x!==n);};}};
 const doc={defaultView:win,location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},body:{},draft:'UNSENT',createElement:()=>({dataset:{},style:{},setAttribute(){},addEventListener(){},remove(){}})};
 const binding=()=>({documentToken:'doc'+generation,producerToken:'producer'+generation,browserDocumentId:'browser',routeEpoch:generation,origin:doc.location.origin,expiresAt:new Date(now+20000).toISOString()});
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},async sendMessage(m){calls.push(m);if(respond){const value=respond(m);if(value!==undefined)return await value;}if(m.type==='HOST_HELLO'){generation++;return {binding:binding()};}if(m.type==='HOST_REFRESH')return {...answer};if(m.type==='HOST_UI_CONFIRM')return {ok:true,grant:{id:'grant-'+generation+'-'+m.role,mountId:m.mountId,role:m.role,parentDocumentId:'browser',uiDocumentId:'ui-'+generation+'-'+m.role,scopeGrantId:answer.scopeKey,expiresAt:binding().expiresAt}};return {ok:true};}};
 const session=createHostContentSession({document:doc,runtime,contextRecovery,identityReader:{read:async()=>({}),prepareIdle:()=>({isCurrent:()=>true})},now:()=>now,elapsedNow:()=>now,makeId:()=> 'client',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:now+ms});return key;},cancel:key=>timers.delete(key),plansFactory:()=>({}),adapterFactory:options=>{
  const a={active:false,phases:[],routeChanged:options.onRebindNeeded,async start(options){this.active=true;this.phases.push(options.phase??'authorized');return {binding:options.binding};},stop(){this.active=false;},prepareIdle(){return {isCurrent:()=>this.active};},inspect(){return this.active?{ok:true,regionEpoch:region,navigationSlot:slot,reading:{},historyMaskRoots:[],header:{},composer:{},protectedRegions:[]}:{ok:false};},hasNativeLayer:()=>false,risk:()=>({state:'unknown'})};adapters.push(a);return a;
 },surfaceFactory:()=>{
  const pair=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{postMessage(m){if(m.type==='VAIWL_UI_IDLE')queueMicrotask(()=>emit('message',{origin:'chrome-extension://extension',source:pair.find(x=>x.role===role).frame.contentWindow,data:{type:'VAIWL_UI_IDLE_ACK',role,requestId:m.requestId}}));}}}}));frames.push(pair);
  return {async mount(){return {id:'mount'+generation,regionEpoch:region};},frames:()=>pair,refreshGeometry:()=>geometry,showWorkspace(){visible=true;return true;},showReading(){visible=false;},suspend(){visible=false;},visibility:()=>({workspace:visible,sidebar:visible}),dispose(){for(const {frame}of pair)frame.isConnected=false;}};
 },controllerFactory:createSurfaceController});t.after(()=>session.stop());
 async function join(){for(const {role,frame}of frames.at(-1))emit('message',{origin:'chrome-extension://extension',source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'nonce-'+role}});await drain();}
 return {session,calls,adapters,frames,doc,join,resize:()=>emit('resize'),loseFrame(){frames.at(-1)[0].frame.isConnected=false;emit('resize');},replaceFrameWindow(){frames.at(-1)[0].frame.contentWindow={postMessage(){}};emit('resize');},ready:()=>session.contextReady(),respond:v=>{respond=v;},answer:v=>{answer=v;},replace(){region++;emit('resize');},unsafe(){geometry=false;emit('resize');geometry=true;},async start(){await session.start();await join();assert.equal(session.showWorkspace(),true);},async tick(ms){now+=ms;for(const [k,v]of [...timers])if(v.at<=now){timers.delete(k);v.fn();}await drain();}};
}
for(const change of ['replace','unsafe'])test('real controller '+change+' retires producer and fresh READY rebuilds isolated surfaces',async t=>{
 const f=fixture(t);await f.start();const old=f.frames[0];f[change]();await drain();
 assert(old.every(x=>!x.frame.isConnected));assert.equal(f.adapters[0].active,false);assert.equal(f.session.localStatus(),'waiting');
 const reads=()=>f.calls.filter(m=>['HOST_HELLO','HOST_REFRESH'].includes(m.type));assert.equal(reads().length,2);
 await f.tick(30000);assert.equal(reads().length,2,'withdrawal and timers do not retry identity');
 f.answer({state:'verified',scopeKey:'scope-B'});await f.ready();await f.join();
 assert.equal(f.session.showWorkspace(),true);assert.equal(f.frames.length,2);assert.notEqual(f.frames[1][0].frame,old[0].frame);
 assert.deepEqual(f.adapters.map(a=>a.phases),[['observation','authorized'],['observation','authorized']]);
 assert.deepEqual(f.calls.filter(m=>m.type==='HOST_REFRESH').map(m=>m.producerToken),['producer1','producer2']);
 assert(f.calls.filter(m=>m.type==='HOST_UI_CONFIRM'&&m.producerToken==='producer2').length===2);
 assert.equal(f.doc.draft,'UNSENT');
});
test('real controller replacement with unverified fresh evidence cannot remount',async t=>{
 const f=fixture(t);await f.start();f.replace();f.answer({state:'unknown'});await f.ready();await drain();
 assert.equal(f.frames.length,1);assert.equal(f.session.showWorkspace(),false);assert.equal(f.session.localStatus(),'waiting');
 const n=f.calls.length;await f.tick(60000);assert.equal(f.calls.length,n);assert.equal(f.doc.draft,'UNSENT');
});

for(const change of ['loseFrame','replaceFrameWindow'])test('actual dormant controller '+change+' clears readiness until genuine new context',async t=>{
 const f=fixture(t);await f.start();assert.equal(f.session.showReading(),true);await drain();
 assert.equal(await f.session.enterDormant(),true,'both real controller frame ACKs and worker release must complete');
 assert.equal(f.calls.filter(m=>m.type==='HOST_UI_IDLE_RELEASE').length,1);const old=f.frames[0];
 f[change]();await drain();assert(old.every(x=>!x.frame.isConnected));assert.equal(f.adapters[0].active,false);
 assert.equal(f.session.localStatus(),'waiting');const count=f.calls.length;
 await f.tick(30000);assert.equal(f.calls.length,count,'frame loss cannot initiate authentication');
 await f.ready();await f.join();assert.equal(f.frames.length,2);assert.equal(f.session.showWorkspace(),true);
 assert.deepEqual(f.adapters.map(a=>a.phases),[['observation','authorized'],['observation','authorized']]);
 assert.equal(f.doc.draft,'UNSENT');
});

test('dormant frame loss with new unknown context stays withdrawn and explicit stop cannot revive',async t=>{
 const f=fixture(t);await f.start();f.session.showReading();await drain();assert.equal(await f.session.enterDormant(),true);
 f.loseFrame();await drain();f.answer({state:'unknown'});await f.ready();await drain();
 assert.equal(f.frames.length,1);assert.equal(f.session.localStatus(),'waiting');assert.equal(f.session.showWorkspace(),false);
 f.session.stop();const calls=f.calls.length;f.answer({state:'verified',scopeKey:'scope-B'});await f.ready();await f.tick(60000);
 assert.equal(f.frames.length,1);assert.equal(f.calls.length,calls);assert.equal(f.doc.draft,'UNSENT');
});

test('dormant frame loss during busy renewal cannot let late close touch the new session',async t=>{
 const f=fixture(t);await f.start();f.session.showReading();await drain();let releaseRenewal,oldBinding;
 f.respond(m=>{if(m.type==='HOST_UI_IDLE_RELEASE')return {ok:false,reason:'ui-release-busy'};if(m.type==='HOST_DOCUMENT_RENEW'){
  oldBinding={documentToken:m.documentToken,producerToken:m.producerToken,routeEpoch:m.routeEpoch,browserDocumentId:'browser',origin:f.doc.location.origin,expiresAt:new Date(21000).toISOString()};
  return new Promise(resolve=>{releaseRenewal=resolve;});
 }});
 const closing=f.session.enterDormant();await drain();assert.equal(typeof releaseRenewal,'function');f.loseFrame();await drain();
 assert.equal(f.session.localStatus(),'waiting');assert.equal(f.calls.filter(m=>['HOST_HELLO','HOST_REFRESH'].includes(m.type)).length,2);
 f.respond(null);await f.ready();await f.join();assert.equal(f.frames.length,2);assert.equal(f.session.showWorkspace(),true);
 await drain();const count=f.calls.length;releaseRenewal({ok:true,binding:oldBinding});assert.equal(await closing,false);await drain();
 assert.equal(f.frames.length,2);assert.equal(f.calls.length,count,JSON.stringify(f.calls.slice(count)));assert.equal(f.session.showWorkspace(),true);assert.equal(f.doc.draft,'UNSENT');
});

for(const contextRecovery of [false,true])test('dormant native route before adapter scan gets a fresh handshake, contextRecovery='+contextRecovery,async t=>{
 const f=fixture(t,{contextRecovery});await f.start();f.session.showReading();await drain();assert.equal(await f.session.enterDormant(),true);
 const old=f.frames[0],oldAdapter=f.adapters[0];assert.equal(f.calls.filter(m=>m.type==='HOST_UI_IDLE_RELEASE').length,1);
 f.doc.location.href='https://chatgpt.com/c/11111111-1111-4111-8111-111111111111';
 // The real dormant controller checks the URL before adapter.inspect(). A
 // resize can therefore retire the old mount before the queued route scan.
 f.resize();oldAdapter.routeChanged({reason:'native-route-changed'});await drain();await f.join();
 assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);
 assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').length,2);
 assert(old.every(x=>!x.frame.isConnected));assert.equal(f.frames.length,2);assert.equal(f.adapters[1].active,true);
 assert.equal(f.session.showReading(),true);assert.equal(f.doc.draft,'UNSENT');
 const n=f.calls.length;oldAdapter.routeChanged({reason:'native-route-changed'});await drain();assert.equal(f.calls.length,n);assert.equal(f.adapters[1].active,true);
});
for(const contextRecovery of [false,true])test('dormant native route with unverified scope stays closed without retry, contextRecovery='+contextRecovery,async t=>{
 const f=fixture(t,{contextRecovery});await f.start();f.session.showReading();await drain();assert.equal(await f.session.enterDormant(),true);
 const oldAdapter=f.adapters[0];f.answer({state:'unknown'});f.doc.location.href='https://chatgpt.com/c/22222222-2222-4222-8222-222222222222';f.resize();oldAdapter.routeChanged({reason:'native-route-changed'});await drain();
 assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').length,2);assert.equal(f.frames.length,1);assert.equal(f.session.showWorkspace(),false);
 const count=f.calls.length;await f.tick(60000);assert.equal(f.calls.length,count);f.session.stop();oldAdapter.routeChanged({reason:'native-route-changed'});await f.ready();assert.equal(f.calls.length,count);assert.equal(f.doc.draft,'UNSENT');
});

test('explicit stop before queued dormant route handshake cannot revive the document',async t=>{
 const f=fixture(t,{contextRecovery:false});await f.start();f.session.showReading();await drain();assert.equal(await f.session.enterDormant(),true);
 const old=f.adapters[0];f.doc.location.href='https://chatgpt.com/c/11111111-1111-4111-8111-111111111111';f.resize();f.session.stop();old.routeChanged({reason:'native-route-changed'});await drain();
 assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,1);assert.equal(f.frames.length,1);assert.equal(f.session.showWorkspace(),false);
});
