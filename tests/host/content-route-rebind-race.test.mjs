import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<120;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
function fixture(stage){
 const pending=deferred(),events=new Map(),listeners=new Set(),calls=[],mounts=[],timers=new Map();let held=false,n=0,authDenied=false;
 const win={addEventListener(k,fn){if(!events.has(k))events.set(k,new Set());events.get(k).add(fn);},removeEventListener(k,fn){events.get(k)?.delete(fn);}};
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/c/initial'},defaultView:win,draft:'UNCHANGED'};
 const binding=()=>({documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(21000).toISOString()});
 const normal=m=>m.type==='HOST_HELLO'?{binding:binding()}:m.type==='HOST_REFRESH'?{state:authDenied?'unknown':'verified',scopeKey:'scope'}:{ok:true};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push({message:m,url:document.location.href});if(!held&&m.type===stage){held=true;return pending.promise;}return normal(m);}};
 const client=createHostContentSession({document,runtime,makeId:()=> 'route_client',now:()=>1000,elapsedNow:()=>1000,schedule:fn=>{timers.set(++n,fn);return n;},cancel:id=>timers.delete(id),adapterFactory:()=>({inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:options=>{let stopped=false;const url=document.location.href;return {async start(){if(stage==='controller.start'&&!held){held=true;await pending.promise;}await options.bridge.registerMount({handle:{id:'mount',regionEpoch:1}});mounts.push(url);return {id:'mount'};},stop(){stopped=true;},showWorkspace:()=>!stopped,showReading:()=>!stopped,presentationMode:()=> 'reading'};}});
 const release=()=>pending.resolve(stage==='controller.start'?null:normal({type:stage}));
 return {client,document,events,listeners,calls,mounts,release,releaseInvalid:()=>pending.resolve({binding:{...binding(),origin:"https://other.test"}}),reject:()=>pending.reject(Error("mount-rejected")),deny:()=>{authDenied=true;},held:()=>held,hello:()=>calls.filter(c=>c.message.type==='HOST_HELLO'),change:url=>{document.location.href='https://chatgpt.com/c/'+url;},assertNoActions(){assert.equal(calls.some(c=>/AUTHORIZE|DISPATCH|SEND|CREATE/.test(c.message.type)),false);assert.equal(document.draft,'UNCHANGED');}};
}
for(const stage of ['HOST_HELLO','HOST_REFRESH','controller.start'])test('URL drift while '+stage+' is pending binds final route without replaying actions',async()=>{
 const f=fixture(stage);const starting=f.client.start();await drain();assert.equal(f.held(),true);f.change('intermediate');f.change('final');f.release();await starting;await drain();
 assert.equal(f.hello().length,2,'a real URL change must not permanently stop content');assert.equal(f.hello().at(-1).url,'https://chatgpt.com/c/final');assert.equal(f.mounts.at(-1),'https://chatgpt.com/c/final');assert.equal(f.client.showWorkspace(),true);assert.equal(f.listeners.size,1);f.assertNoActions();f.client.stop();
});
test('same URL scope failure stops without self-recovery loop',async()=>{
 const f=fixture('HOST_REFRESH');const starting=f.client.start();await drain();f.deny();f.release();assert.equal(await starting,null);await drain();assert.equal(f.hello().length,1);assert.equal(f.listeners.size,0);assert.equal(f.client.showWorkspace(),false);f.assertNoActions();
});
for(const stage of ['HOST_HELLO','HOST_REFRESH','controller.start'])test('late '+stage+' from replaced session cannot restart new session',async()=>{
 const f=fixture(stage);const old=f.client.start();await drain();f.change('replacement');await f.client.start();await drain();assert.equal(f.hello().length,2);const mounts=f.mounts.length;f.release();await old;await drain();assert.equal(f.hello().length,2);assert.equal(f.mounts.length,mounts);assert.equal(f.client.showWorkspace(),true);assert.equal(f.listeners.size,1);f.assertNoActions();f.client.stop();
});
for(const stage of ['HOST_HELLO','HOST_REFRESH','controller.start'])test('explicit stop fences pending '+stage+' even after URL drift',async()=>{
 const f=fixture(stage);const starting=f.client.start();await drain();f.client.stop();f.change('after-stop');f.release();await starting;await drain();assert.equal(f.hello().length,1);assert.equal(f.mounts.length,0);assert.equal(f.listeners.size,0);assert.equal(f.client.showWorkspace(),false);f.assertNoActions();
});

test('same URL invalid HELLO binding stops before scope refresh without retry',async()=>{
 const f=fixture('HOST_HELLO'),starting=f.client.start();await drain();f.releaseInvalid();assert.equal(await starting,null);await drain();assert.equal(f.hello().length,1);assert.equal(f.calls.some(c=>c.message.type==='HOST_REFRESH'),false);assert.equal(f.mounts.length,0);assert.equal(f.listeners.size,0);assert.equal(f.client.showWorkspace(),false);f.assertNoActions();
});
test('same URL controller start rejection stops without another authorization attempt',async()=>{
 const f=fixture('controller.start'),starting=f.client.start();await drain();f.reject();assert.equal(await starting,null);await drain();assert.equal(f.hello().length,1);assert.equal(f.calls.filter(c=>c.message.type==='HOST_REFRESH').length,1);assert.equal(f.calls.some(c=>c.message.type==='HOST_UI_MOUNT'),false);assert.equal(f.mounts.length,0);assert.equal(f.listeners.size,0);assert.equal(f.client.showWorkspace(),false);f.assertNoActions();
});
