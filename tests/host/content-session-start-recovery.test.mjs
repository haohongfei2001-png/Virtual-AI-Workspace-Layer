import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function fixture(t){
 const calls=[],controllers=[],events=new Map();let releaseFirst,refreshes=0,denied=false;
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/c/33333333-3333-4333-8333-333333333333'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding={documentToken:'document',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(21000).toISOString()};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener(){},removeListener(){}},sendMessage:async m=>{calls.push(m.type);if(m.type==='HOST_HELLO')return {ok:true,binding};if(m.type==='HOST_REFRESH'){refreshes++;return denied?{state:'ambiguous'}:{state:'verified',scopeKey:'scope'};}return {ok:true};}};
 const client=createHostContentSession({document,runtime,contextRecovery:true,now:()=>1000,elapsedNow:()=>1000,makeId:()=> 'client',adapterFactory:()=>({start:async()=>({}),inspect:()=>({ok:true}),stop(){}}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:options=>{
  const index=controllers.length,entry={options,registered:false,stops:0};controllers.push(entry);
  return {start:async()=>{await options.bridge.registerMount({handle:{id:'mount-'+index,regionEpoch:1}});entry.registered=true;if(index===0)return new Promise(resolve=>{releaseFirst=resolve;});return {id:'mount-'+index};},stop(){entry.stops++;},presentationMode:()=>options.initialMode,showWorkspace:()=>true};
 }});t.after(()=>client.stop());
 return {client,calls,controllers,finish:(value=null)=>releaseFirst(value),deny:()=>{denied=true;},terminate:(index=0,reason='ui-frame-suspended')=>controllers[index].options.onTerminated(reason,{mode:'reading'}),hello:()=>calls.filter(v=>v==='HOST_HELLO').length,refresh:()=>refreshes};
}
async function pending(t){const f=fixture(t),started=f.client.start();await drain();assert.equal(f.controllers.length,1);assert.equal(f.controllers[0].registered,true);assert.equal(f.hello(),1);assert.equal(f.refresh(),1);return {...f,started};}
test('suspension after registration during start gets one fresh authorization and reading recovery',async t=>{
 const f=await pending(t);f.terminate();f.finish();await f.started;await drain();
 assert.equal(f.hello(),2);assert.equal(f.refresh(),2);assert.equal(f.controllers.length,2);assert.equal(f.controllers[1].options.initialMode,'reading');
 f.terminate(1);await drain();assert.equal(f.hello(),2,'one start must not create an automatic recovery loop');
});
for(const action of ['user-exit','explicit-stop'])test(action+' cancels startup recovery including old late termination',async t=>{
 const f=await pending(t);if(action==='user-exit')f.terminate(0,'ui-user-exit');else f.client.stop();f.terminate();f.finish();await f.started;await drain();assert.equal(f.hello(),1);assert.equal(f.controllers.length,1);
});
test('replacement scope refusal cannot mount or schedule another startup recovery',async t=>{
 const f=await pending(t);f.deny();f.terminate();f.finish();await f.started;await drain();assert.equal(f.hello(),2);assert.equal(f.refresh(),2);assert.equal(f.controllers.length,1);f.terminate();await drain();assert.equal(f.hello(),2);
});
test('old late callbacks cannot consume or restart the replacement session',async t=>{
 const f=await pending(t);f.terminate();f.finish();await f.started;await drain();assert.equal(f.controllers.length,2);for(let i=0;i<5;i++)f.terminate();await drain();assert.equal(f.hello(),2);assert.equal(f.controllers[1].stops,0);
});

test('frame replacement terminates pending authority and reports a fixed local failure without retry',async t=>{
 const f=await pending(t);f.terminate(0,'ui-frame-document-replaced');f.finish();await f.started;await drain();
 assert.equal(f.client.localStatus(),'frame-blocked');assert.equal(f.controllers[0].stops,1);
 await f.client.contextReady();f.terminate(0,'ui-frame-suspended');await drain();
 assert.equal(f.hello(),1);assert.equal(f.refresh(),1);assert.equal(f.controllers.length,1);
 // Explicit start uses a fresh handshake; stale callbacks cannot poison it.
 await f.client.start();assert.equal(f.hello(),2);f.terminate(0,'ui-frame-document-replaced');
 assert.notEqual(f.client.localStatus(),'frame-blocked');
});

test('frame replacement after a live mount withdraws the session instead of leaving a ready producer',async t=>{
 const f=await pending(t);f.finish({id:'mount-0'});await f.started;
 f.terminate(0,'ui-frame-document-replaced');await drain();
 assert.equal(f.client.localStatus(),'frame-blocked');assert.equal(f.controllers[0].stops,1);
 assert.equal(f.client.showWorkspace(),false);await f.client.contextReady();
 assert.equal(f.hello(),1);
});
