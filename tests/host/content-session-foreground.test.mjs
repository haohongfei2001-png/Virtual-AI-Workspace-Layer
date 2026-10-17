import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
// Controller/Chrome transport doubles, real content-session state machine.
function fixture(){
 const calls=[],controllers=[],events=new Map(),docEvents=new Map(),listeners=new Set(),timers=new Map();let time=1000,seq=0,hello=0,reject=false,refreshDenied=false;
 const doc={visibilityState:'visible',addEventListener:(k,f)=>docEvents.set(k,f),removeEventListener:(k,f)=>{if(docEvents.get(k)===f)docEvents.delete(k);},location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},draft:'UNSENT',defaultView:{addEventListener:(k,f)=>events.set(k,f),removeEventListener:(k,f)=>{if(events.get(k)===f)events.delete(k);}}};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},async sendMessage(m){calls.push(m);if(m.type==='HOST_HELLO'){hello++;if(reject)return {ok:false};return {binding:{documentToken:'doc'+hello,producerToken:'producer'+hello,browserDocumentId:'browser',routeEpoch:hello,origin:doc.location.origin,expiresAt:new Date(time+20000).toISOString()}};}if(m.type==='HOST_DOCUMENT_RENEW')return {ok:true,binding:{documentToken:'doc'+hello,producerToken:'producer'+hello,browserDocumentId:'browser',routeEpoch:hello,origin:doc.location.origin,expiresAt:new Date(time+20000).toISOString()}};if(m.type==='HOST_FOCUS')return {ok:true,state:refreshDenied?'unknown':'verified'};if(m.type==='HOST_REFRESH')return {state:refreshDenied?'unknown':'verified'};return {ok:true};}};
 const session=createHostContentSession({document:doc,runtime,makeId:()=> 'client',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++seq;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:()=>({inspect:()=>({ok:true}),stop(){}}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:options=>{let active=false;const controller={options,async start(context){controller.binding=context.binding;await options.bridge.registerMount({handle:{id:'mount'+hello,regionEpoch:1}});active=true;return {id:'mount'+hello};},stop(){if(!active)return;active=false;options.onTerminated?.('surface-stopped');},showWorkspace:()=>active,showReading:()=>active,terminate(reason,presentation){assert.equal(typeof options.onTerminated,'function','private controller termination callback must be wired');active=false;options.onTerminated(reason,presentation);}};controllers.push(controller);return controller;}});
 return {session,calls,controllers,doc,events,docEvents,listeners,fail:()=>{reject=true;},denyRefresh:()=>{refreshDenied=true;},hellos:()=>calls.filter(m=>m.type==='HOST_HELLO'),async advance(ms){time+=ms;for(const[id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}await drain();}};
}

test('foreground forces independent identity check without remount or duplicate focus',async()=>{
 const f=fixture();await f.session.start();f.doc.visibilityState='hidden';f.docEvents.get('visibilitychange')();f.doc.visibilityState='visible';f.docEvents.get('visibilitychange')();f.events.get('focus')();await drain();
 assert.equal(f.calls.filter(m=>m.type==='HOST_FOCUS').length,1);assert.equal(f.hellos().length,1);assert.equal(f.controllers.length,1);assert.equal(f.session.showWorkspace(),true);assert.equal(f.doc.draft,'UNSENT');
 f.events.get('blur')();f.events.get('focus')();await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_FOCUS').length,2);f.session.stop();assert.equal(f.docEvents.size,0);assert.equal(f.events.size,0);
});
test('foreground denied identity clears session without automatic recovery',async()=>{
 const f=fixture();await f.session.start();f.denyRefresh();f.events.get('blur')();f.events.get('focus')();await drain();assert.equal(f.session.showWorkspace(),false);assert.equal(f.hellos().length,1);assert.equal(f.events.size,0);assert.equal(f.docEvents.size,0);await f.advance(30000);assert.equal(f.hellos().length,1);
});
test('hidden focus, changed route, stop and stale callbacks cannot refresh identity',async()=>{
 for(const mode of ['hidden','route','stop']){const f=fixture();await f.session.start();const focus=f.events.get('focus'),blur=f.events.get('blur');blur();if(mode==='hidden')f.doc.visibilityState='hidden';if(mode==='route')f.doc.location.href+='c/next';if(mode==='stop')f.session.stop();focus();await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_FOCUS').length,0);f.session.stop();}
});
