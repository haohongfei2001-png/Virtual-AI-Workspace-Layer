import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
// Controller/Chrome transport doubles, real content-session state machine.
function fixture(){
 const calls=[],controllers=[],events=new Map(),listeners=new Set(),timers=new Map();let time=1000,seq=0,hello=0,reject=false,refreshDenied=false;
 const doc={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},draft:'UNSENT',defaultView:{addEventListener:(k,f)=>events.set(k,f),removeEventListener:(k,f)=>{if(events.get(k)===f)events.delete(k);}}};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},async sendMessage(m){calls.push(m);if(m.type==='HOST_HELLO'){hello++;if(reject)return {ok:false};return {binding:{documentToken:'doc'+hello,producerToken:'producer'+hello,browserDocumentId:'browser',routeEpoch:hello,origin:doc.location.origin,expiresAt:new Date(time+20000).toISOString()}};}if(m.type==='HOST_DOCUMENT_RENEW')return {ok:true,binding:{documentToken:'doc'+hello,producerToken:'producer'+hello,browserDocumentId:'browser',routeEpoch:hello,origin:doc.location.origin,expiresAt:new Date(time+20000).toISOString()}};if(m.type==='HOST_REFRESH')return {state:refreshDenied?'unknown':'verified'};return {ok:true};}};
 const session=createHostContentSession({document:doc,runtime,makeId:()=> 'client',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++seq;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:()=>({inspect:()=>({ok:true}),stop(){}}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:options=>{let active=false;const controller={options,async start(context){controller.binding=context.binding;await options.bridge.registerMount({handle:{id:'mount'+hello,regionEpoch:1}});active=true;return {id:'mount'+hello};},stop(){if(!active)return;active=false;options.onTerminated?.('surface-stopped');},showWorkspace:()=>active,showReading:()=>active,terminate(reason,presentation){assert.equal(typeof options.onTerminated,'function','private controller termination callback must be wired');active=false;options.onTerminated(reason,presentation);}};controllers.push(controller);return controller;}});
 return {session,calls,controllers,doc,events,listeners,fail:()=>{reject=true;},denyRefresh:()=>{refreshDenied=true;},hellos:()=>calls.filter(m=>m.type==='HOST_HELLO'),async advance(ms){time+=ms;for(const[id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}await drain();}};
}
for(const reason of ['ui-frame-suspended','session-renew-failed','ui-grant-expired','stale-session-renewal'])test('one fresh handshake after '+reason+' without navigation or old authority',async()=>{
 const f=fixture();await f.session.start();f.controllers[0].terminate(reason);await drain();assert.equal(f.hellos().length,2);assert.equal(f.controllers.length,2);assert.equal(f.session.showWorkspace(),true);assert.equal(f.doc.draft,'UNSENT');
 assert.deepEqual(f.hellos().map(m=>Object.keys(m).sort()),[['clientId','seq','type','v'],['clientId','seq','type','v']]);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_REFRESH').map(m=>m.documentToken),['doc1','doc2']);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_REFRESH').map(m=>m.producerToken),['producer1','producer2']);
 f.controllers[1].terminate(reason);await drain();await f.advance(30000);assert.equal(f.hellos().length,2);assert.equal(f.session.showWorkspace(),false);f.session.stop();
});
test('failed replacement does not schedule another handshake',async()=>{const f=fixture();await f.session.start();f.fail();f.controllers[0].terminate('session-renew-failed');await drain();await f.advance(30000);assert.equal(f.hellos().length,2);assert.equal(f.controllers.length,1);assert.equal(f.session.showWorkspace(),false);f.session.stop();});
test('stop, pagehide and changed URL reject queued recovery and late termination callbacks',async()=>{
 for(const mode of ['stop','pagehide','url']){const f=fixture();await f.session.start();const old=f.controllers[0];if(mode==='url')f.doc.location.href+='c/next';old.terminate('ui-frame-suspended');if(mode==='stop')f.session.stop();if(mode==='pagehide')f.events.get('pagehide')?.({persisted:false});await drain();assert.equal(f.hellos().length,1);old.options.onTerminated('ui-grant-expired');await drain();assert.equal(f.hellos().length,1);f.session.stop();}
});
test('unlisted intentional termination does not recover, explicit start grants a new one-shot budget',async()=>{
 const f=fixture();await f.session.start();f.controllers[0].terminate('surface-stopped');await drain();assert.equal(f.hellos().length,1);await f.session.start();f.controllers[1].terminate('ui-frame-suspended');await drain();assert.equal(f.hellos().length,3);f.session.stop();
});
test('old controller duplicate notifications cannot spend the replacement generation twice',async()=>{
 const f=fixture();await f.session.start();const old=f.controllers[0];old.terminate('ui-frame-suspended');old.options.onTerminated('ui-grant-expired');await drain();assert.equal(f.hellos().length,2);old.options.onTerminated('session-renew-failed');await drain();assert.equal(f.hellos().length,2);assert.equal(f.session.showWorkspace(),true);f.session.stop();
});

test('explicitly unverified scope during renewal forbids automatic recovery',async()=>{
 const f=fixture();await f.session.start();const current=f.controllers[0];f.denyRefresh();await assert.rejects(current.options.bridge.renewSession({handle:{id:'mount1'},binding:current.binding}),/scope-not-verified/);current.terminate('session-renew-failed');await drain();await f.advance(30000);assert.equal(f.hellos().length,1);assert.equal(f.session.showWorkspace(),false);f.session.stop();
});

test('automatic replacement carries only private presentation intent and ignores old callbacks',async()=>{for(const mode of ['reading','workspace']){const f=fixture();await f.session.start();const prior=f.controllers[0];prior.terminate('ui-frame-suspended',{mode});await drain();assert.equal(f.controllers[1].options.initialMode,mode);prior.terminate('ui-frame-suspended',{mode:mode==='reading'?'workspace':'reading'});await drain();assert.equal(f.controllers.length,2);assert.equal(f.controllers[1].options.initialMode,mode);f.session.stop();}});
