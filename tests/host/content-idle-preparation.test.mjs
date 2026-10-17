import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(overrides={}){
 let adapterReady=true,readerReady=true;let time=1000,id=0,bridge,context,adapterOptions,stops=0,planned=0;const presentations=[];const calls=[],listeners=new Set(),events=new Map(),timers=new Map();
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 let respond=m=>m.type==='HOST_HELLO'?{binding:binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:binding()}:{ok:true,grants:[]};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);return respond(m);}};
 const options={document,runtime,identityReader:{read:async()=>({}),prepareIdle:()=>readerReady?Object.freeze({isCurrent:()=>readerReady}):null},makeId:()=> 'client',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:o=>(adapterOptions=o,{inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,prepareIdle:()=>adapterReady?Object.freeze({isCurrent:()=>adapterReady}):null}),surfaceFactory:()=>({}),plansFactory:({bindingCurrent})=>({plan:()=>{assert.ok(bindingCurrent());planned++;return ['plan'];}}),controllerFactory:o=>{bridge=o.bridge;return {start:async c=>{context=c;await bridge.registerMount({handle:{id:'mount',regionEpoch:1}});return {id:'mount'};},stop:()=>{stops++;bridge.revokeMount({mountId:'mount'});},showWorkspace:()=>{presentations.push('workspace');return true;},showReading:()=>{presentations.push('reading');return true;},showNativeReading:()=>{presentations.push('native-page');return true;}};}};
 const client=createHostContentSession({...options,...overrides});
 return {setAdapterReady:value=>adapterReady=value,setReaderReady:value=>readerReady=value,presentations,get adapterOptions(){return adapterOptions;},client,options,runtime,document,binding,calls,listeners,events,setResponse:f=>{respond=f;},get bridge(){return bridge;},get context(){return context;},get stops(){return stops;},get planned(){return planned;},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await drain();}};
}

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const normal=f=>m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:f.binding()}:{ok:true,grants:[]};
// These are local readiness snapshots; no test treats one as a close permit.
test('only a ready live session returns a frozen revocable preparation',async t=>{
 const f=fixture();t.after(()=>f.client.stop());assert.equal(f.client.prepareIdle(),null);await f.client.start();await drain();
 const token=f.client.prepareIdle();assert.ok(token);assert(Object.isFrozen(token));assert.equal(token.isCurrent(),true);
 f.client.stop();assert.equal(token.isCurrent(),false);assert.equal(f.client.prepareIdle(),null);await f.client.start();await drain();assert.ok(f.client.prepareIdle());assert.equal(token.isCurrent(),false);
});
for(const method of ['showWorkspace','showReading'])test(method+' invalidates the prior preparation without stopping the session',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();const token=f.client.prepareIdle();assert.ok(token);
 assert.equal(f.client[method](),true);assert.equal(token.isCurrent(),false);await drain();assert.ok(f.client.prepareIdle());assert.equal(token.isCurrent(),false);
});
test('trusted runtime presentation invalidates the token permanently',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();const token=f.client.prepareIdle();assert.ok(token);let reply;
 [...f.listeners][0]({type:'HOST_PRESENT_SURFACE',documentToken:'doc',producerToken:'producer',routeEpoch:1,mode:'reading'},{id:'extension'},value=>reply=value);
 assert.deepEqual(reply,{ok:true});assert.equal(token.isCurrent(),false);await drain();assert.ok(f.client.prepareIdle());assert.equal(token.isCurrent(),false);
});
for(const dependency of ['adapter','reader'])test('missing '+dependency+' readiness fails closed',async t=>{
 const overrides=dependency==='adapter'?{adapterFactory:()=>({inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false})}:{identityReader:{read:async()=>({})}};
 const f=fixture(overrides);t.after(()=>f.client.stop());await f.client.start();await drain();assert.equal(f.client.prepareIdle(),null);
});
for(const dependency of ['adapter','reader'])test('pending '+dependency+' readiness blocks local preparation',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();const token=f.client.prepareIdle();assert.ok(token);
 const set=dependency==='adapter'?f.setAdapterReady:f.setReaderReady;set(false);assert.equal(token.isCurrent(),false);assert.equal(f.client.prepareIdle(),null);
 set(true);assert.ok(f.client.prepareIdle());
});
test('raw RPC remains pending across timeout and restart until the original send settles',async t=>{
 const f=fixture(),hold=deferred();t.after(()=>f.client.stop());await f.client.start();await drain();const token=f.client.prepareIdle();assert.ok(token);
 f.setResponse(m=>m.type==='HOST_UI_WORKSPACE_ENTERED'?hold.promise:normal(f)(m));
 const pending=f.bridge.workspaceEntered({mountId:'mount'}),rejected=assert.rejects(pending,/request-timeout/);await drain();assert.equal(f.client.prepareIdle(),null);assert.equal(token.isCurrent(),false);
 await f.advance(6000);await rejected;assert.equal(f.client.prepareIdle(),null);f.client.stop();await f.client.start();await drain();assert.equal(f.client.prepareIdle(),null);
 hold.resolve({ok:true});await drain();assert.ok(f.client.prepareIdle());assert.equal(token.isCurrent(),false);
});
for(const [callback,type] of [['onFirstSendIntent','HOST_FIRST_SEND_INTENT'],['onOldSendOperation','HOST_OLD_SEND_OPERATION']])test(callback+' raw send blocks readiness while listener remains active',async t=>{
 const f=fixture(),hold=deferred();t.after(()=>f.client.stop());await f.client.start();await drain();const token=f.client.prepareIdle();assert.ok(token);
 f.setResponse(m=>m.type===type?hold.promise:normal(f)(m));f.adapterOptions[callback]({intentId:'intent',observedAt:new Date(1000).toISOString()},f.context.binding);await drain();
 assert.equal(f.calls.at(-1).type,type);assert.equal(token.isCurrent(),false);assert.equal(f.client.prepareIdle(),null);assert.equal(f.listeners.size,1);
 hold.resolve({ok:true});await drain();assert.ok(f.client.prepareIdle());assert.equal(token.isCurrent(),false);
});
for(const mode of ['route','expiry'])test(mode+' revokes an otherwise idle session',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();const token=f.client.prepareIdle();assert.ok(token);
 if(mode==='route')f.document.location.href+='c/other';else await f.advance(20000);assert.equal(token.isCurrent(),false);assert.equal(f.client.prepareIdle(),null);
});

for(const method of ['showWorkspace','showReading'])test(method+' cannot prepare through a synchronous presentation callback',async t=>{
 let f,inside='unset';f=fixture({controllerFactory:()=>({start:async()=>({id:'mount'}),stop(){},[method](){inside=f.client.prepareIdle();return true;}})});t.after(()=>f.client.stop());
 await f.client.start();await drain();assert.ok(f.client.prepareIdle());assert.equal(f.client[method](),true);assert.equal(inside,null);assert.ok(f.client.prepareIdle());
});
test('native plan cannot prepare through synchronous planning or its reply callback',async t=>{
 let f,inside='unset',replyIdle='unset';f=fixture({plansFactory:()=>({plan(){inside=f.client.prepareIdle();return ['plan'];}})});t.after(()=>f.client.stop());await f.client.start();await drain();assert.ok(f.client.prepareIdle());
 [...f.listeners][0]({type:'HOST_NATIVE_PLAN',documentToken:'doc',producerToken:'producer',routeEpoch:1,targets:[]},{id:'extension'},()=>{replyIdle=f.client.prepareIdle();});
 assert.equal(inside,null);assert.equal(replyIdle,null);assert.ok(f.client.prepareIdle());
});

for(const phase of ['prepare','check'])test('dependency '+phase+' reentry cannot certify changed content state',async t=>{
 let f,armed=false;const identityReader={read:async()=>({}),prepareIdle(){if(phase==='prepare'&&armed){armed=false;f.client.showReading();}return {isCurrent(){if(phase==='check'&&armed){armed=false;f.client.showReading();}return true;}};}};
 f=fixture({identityReader});t.after(()=>f.client.stop());await f.client.start();await drain();
 if(phase==='prepare'){armed=true;assert.equal(f.client.prepareIdle(),null);}else{const token=f.client.prepareIdle();assert.ok(token);armed=true;assert.equal(token.isCurrent(),false);assert.equal(token.isCurrent(),false);}
 assert.ok(f.client.prepareIdle());
});
