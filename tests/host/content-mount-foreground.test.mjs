import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
// L-only: real content lifecycle with explicit transport/controller doubles.
// Event delivery below is synthetic; this does not establish a browser focus
// event, worker restart, production authority, or the cause of the CI failure.
function fixture({holdFocus=false}={}){
 const calls=[],events=new Map(),docEvents=new Map(),listeners=new Set(),timers=new Map();let timer=0,releaseMount,releaseFocus,releaseWake,mountEntered=false,controllerOptions,dormant=false,hellos=0;
 const wakeHeld=new Promise(resolve=>{releaseWake=resolve;});
 const held=new Promise(resolve=>{releaseMount=resolve;}),focusHeld=new Promise(resolve=>{releaseFocus=resolve;}),scopeKey='test-scope';
 const doc={visibilityState:'hidden',location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},draft:'UNSENT',addEventListener:(k,f)=>docEvents.set(k,f),removeEventListener:(k,f)=>{if(docEvents.get(k)===f)docEvents.delete(k);},defaultView:{addEventListener:(k,f)=>events.set(k,f),removeEventListener:(k,f)=>{if(events.get(k)===f)events.delete(k);}}};
 const binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:doc.location.origin,expiresAt:new Date(21000).toISOString()};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},async sendMessage(message){calls.push(message);if(message.type==='HOST_HELLO')return {binding:{...binding,producerToken:'producer'+(++hellos)}};if(message.type==='HOST_FOCUS'&&holdFocus)await focusHeld;if(message.type==='HOST_REFRESH'||message.type==='HOST_FOCUS')return {ok:true,state:'verified',scopeKey};return {ok:true};}};
 const session=createHostContentSession({document:doc,runtime,makeId:()=> 'client',now:()=>1000,elapsedNow:()=>1000,schedule:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},cancel:key=>timers.delete(key),adapterFactory:()=>({start:async()=>({}),inspect:()=>({ok:true}),prepareRecovery:()=>({isCurrent:()=>true}),stop(){}}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:options=>(controllerOptions=options,{dormantReady:()=>dormant,async resumeDormant(){await wakeHeld;return {id:'mount'};},async start(){await options.bridge.registerMount({handle:{id:'mount',regionEpoch:1}});mountEntered=true;if(await held===false)throw Error('injected-mount-failure');return {id:'mount'};},stop(){},showWorkspace:()=>true,showReading:()=>true})});
 return {session,calls,doc,events,docEvents,releaseMount,releaseFocus,releaseWake,wake:()=>{dormant=true;return controllerOptions.onWake();},mountEntered:()=>mountEntered,focusCalls:()=>calls.filter(m=>m.type==='HOST_FOCUS'),foreground(){doc.visibilityState='visible';docEvents.get('visibilitychange')?.({isTrusted:false});events.get('focus')?.({isTrusted:false});}};
}
test('foreground during pending controller mount is checked once after mount becomes ready',async()=>{
 const f=fixture();try{
  const started=f.session.start();await drain();assert.equal(f.mountEntered(),true);
  f.foreground();await drain();assert.equal(f.focusCalls().length,0,'pending mount must not use unready authority');
  f.releaseMount();await started;await drain();
  assert.equal(f.focusCalls().length,1,'the foreground transition during mount must not be lost');
  assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,1);assert.equal(f.doc.draft,'UNSENT');
  f.events.get('focus')?.({isTrusted:false});await drain();assert.equal(f.focusCalls().length,1,'same transition must not duplicate validation');
 }finally{f.session.stop();}
});
test('control: foreground after completed mount uses the existing focus validation path',async()=>{
 const f=fixture();try{const started=f.session.start();await drain();f.releaseMount();await started;assert.equal(f.focusCalls().length,0);f.foreground();await drain();assert.equal(f.focusCalls().length,1);assert.equal(f.doc.draft,'UNSENT');}finally{f.session.stop();}
});

test('hidden mount completion does not manufacture a foreground check',async()=>{
 const f=fixture();try{const started=f.session.start();await drain();assert(f.mountEntered());f.releaseMount();await started;await drain();assert.equal(f.doc.visibilityState,'hidden');assert.equal(f.focusCalls().length,0);assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,1);}finally{f.session.stop();}
});
for(const mode of ['failure','stop'])test('pending foreground cannot revive '+mode+' mount',async()=>{
 const f=fixture();try{const started=f.session.start();await drain();assert(f.mountEntered());const staleFocus=f.events.get('focus'),staleVisibility=f.docEvents.get('visibilitychange');f.foreground();if(mode==='stop')f.session.stop();f.releaseMount(mode==='failure'?false:undefined);assert.equal(await started,null);await drain();staleFocus?.({isTrusted:false});staleVisibility?.({isTrusted:false});await drain();assert.equal(f.focusCalls().length,0);assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,1);assert.equal(f.events.size,0);assert.equal(f.docEvents.size,0);assert.equal(f.doc.draft,'UNSENT');}finally{f.session.stop();}
});
test('repeated visibility and focus notifications while validation is pending stay single-flight',async()=>{
 const f=fixture({holdFocus:true});try{const started=f.session.start();await drain();f.releaseMount();await started;f.foreground();await drain();assert.equal(f.focusCalls().length,1);for(let i=0;i<4;i++)f.foreground();await drain();assert.equal(f.focusCalls().length,1);f.releaseFocus();await drain();f.foreground();await drain();assert.equal(f.focusCalls().length,1);}finally{f.releaseFocus();f.session.stop();}
});

test('foreground during an already authorized dormant wake is checked after resume becomes ready',async()=>{
 const f=fixture();try{const started=f.session.start();await drain();f.releaseMount();await started;assert.equal(f.focusCalls().length,0);
  const waking=f.wake();await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2,'wake must reach its real fresh binding handshake');assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').length,2);
  f.foreground();await drain();assert.equal(f.focusCalls().length,0,'wake has not completed');f.releaseWake();assert.deepEqual(await waking,{id:'mount'});await drain();assert.equal(f.focusCalls().length,1,'foreground during resume must not be lost');assert.equal(f.doc.draft,'UNSENT');
 }finally{f.releaseWake();f.session.stop();}
});
