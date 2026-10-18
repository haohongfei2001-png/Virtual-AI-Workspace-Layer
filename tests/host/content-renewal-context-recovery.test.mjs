import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
// Real content session; private controller lifecycle and worker are isolated doubles.
// ready() is the exact callback wired to HOST_CONTEXT_READY by content-entry.
function fixture(t){
 const calls=[],controllers=[],listeners=new Set(),timers=new Map();let wall=1000,serial=0,hello=0,answer={state:'verified',scopeKey:'scope'},expired=false,holdNext=false,releaseRefresh=null;
 const events=new Map(),document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},draft:'UNSENT',defaultView:{addEventListener:(k,f)=>events.set(k,f),removeEventListener:(k,f)=>{if(events.get(k)===f)events.delete(k);}}};
 const binding=()=>({documentToken:'document'+hello,producerToken:'producer'+hello,browserDocumentId:'browser',routeEpoch:hello,origin:document.location.origin,expiresAt:new Date(expired?wall-1:wall+20000).toISOString()});
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},async sendMessage(m){calls.push(m);if(m.type==='HOST_HELLO'){hello++;return {binding:binding()};}if(m.type==='HOST_DOCUMENT_RENEW')return {ok:true,binding:binding()};if(m.type==='HOST_REFRESH'){if(holdNext){holdNext=false;return new Promise(resolve=>{releaseRefresh=resolve;});}return {...answer};}return {ok:true};}};
 const session=createHostContentSession({document,runtime,contextRecovery:true,automaticDormancy:false,now:()=>wall,elapsedNow:()=>wall,makeId:()=> 'client',schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:wall+ms});return id;},cancel:id=>timers.delete(id),adapterFactory:()=>({inspect:()=>({ok:true}),stop(){},risk:()=>({state:'unknown'})}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:options=>{
  const c={options,active:false,binding:null,async start(context){c.binding=context.binding;await options.bridge.registerMount({handle:{id:'mount'+hello,regionEpoch:1}});c.active=true;return {id:'mount'+hello};},stop(){c.active=false;},showWorkspace:()=>c.active,presentationMode:()=> 'reading',terminate(){c.active=false;options.onTerminated('session-renew-failed',{mode:'reading'});}};controllers.push(c);return c;
 }});t.after(()=>session.stop());
 return {session,calls,controllers,document,listeners,ready:()=>session.contextReady(),hellos:()=>calls.filter(m=>m.type==='HOST_HELLO').length,setAnswer:value=>{answer=value;},expire:()=>{expired=true;},holdRefresh:()=>{holdNext=true;},releaseRefresh:value=>releaseRefresh(value),async advance(ms){wall+=ms;for(const[id,timer]of [...timers])if(timer.at<=wall){timers.delete(id);timer.fn();}await drain();}};
}
async function denied(f,answer={state:'unknown'}){
 await f.session.start();assert.equal(f.session.showWorkspace(),true);const old=f.controllers[0];f.setAnswer(answer);
 await assert.rejects(old.options.bridge.renewSession({handle:{id:'mount1'},binding:old.binding}),/scope-not-verified/);
 old.terminate();await drain();assert.equal(f.session.showWorkspace(),false,'denied renewal withdraws surfaces');assert.equal(f.hellos(),1,'scope denial must not retry automatically');return old;
}
for(const answer of [{state:'unknown'},{state:'ambiguous'},{state:'revoked'},{state:'verified',scopeKey:'other'}])test('renewal '+JSON.stringify(answer)+' waits safely then fresh READY authorizes new generation',async t=>{
 const f=fixture(t),old=await denied(f,answer);await f.advance(30000);assert.equal(f.hellos(),1);
 f.setAnswer({state:'verified',scopeKey:'scope'});await f.ready();await drain();
 assert.equal(f.hellos(),2,'new READY after renewal denial must not be swallowed by old ready=true');assert.equal(f.controllers.length,2);assert.equal(f.session.showWorkspace(),true);
 assert.deepEqual(f.calls.filter(m=>m.type==='HOST_REFRESH').map(m=>m.documentToken),['document1','document1','document2']);
 assert.deepEqual(f.calls.filter(m=>m.type==='HOST_REFRESH').map(m=>m.producerToken),['producer1','producer1','producer2']);
 assert(f.calls.filter(m=>m.type==='HOST_HELLO').every(m=>Object.keys(m).sort().join(',')==='clientId,seq,type,v'),'HELLO never carries old receipt/scope');
 old.terminate();await drain();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),true);assert.equal(f.document.draft,'UNSENT');
});
test('new READY without fresh verified evidence cannot reuse old scope or loop',async t=>{
 const f=fixture(t);await denied(f);await f.ready();await drain();assert.equal(f.hellos(),2,'one fresh handshake for a new ready signal');assert.equal(f.controllers.length,1);assert.equal(f.session.showWorkspace(),false);await f.advance(60000);assert.equal(f.hellos(),2);assert.equal(f.document.draft,'UNSENT');
});
test('expired replacement binding cannot recover from new READY',async t=>{
 const f=fixture(t);await denied(f);f.setAnswer({state:'verified',scopeKey:'scope'});f.expire();await f.ready();await drain();assert.equal(f.hellos(),2);assert.equal(f.controllers.length,1);assert.equal(f.session.showWorkspace(),false);assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').length,2,'expired HELLO never reaches scope refresh');
});
test('explicit stop fences late READY and old owner notifications after denied renewal',async t=>{
 const f=fixture(t),old=await denied(f);f.session.stop();f.setAnswer({state:'verified',scopeKey:'scope'});old.terminate();await f.ready();await f.advance(30000);assert.equal(f.hellos(),1);assert.equal(f.session.showWorkspace(),false);assert.equal(f.listeners.size,0);
});

test('READY arriving during renewal REFRESH is retained only until that renewal settles',async t=>{
 const f=fixture(t);await f.session.start();const old=f.controllers[0];f.holdRefresh();
 const renewal=old.options.bridge.renewSession({handle:{id:'mount1'},binding:old.binding}),rejected=assert.rejects(renewal,/scope-not-verified/);await drain();
 await f.ready();assert.equal(f.hellos(),1,'READY cannot race a parallel handshake against in-flight renewal');
 f.releaseRefresh({state:'unknown'});await rejected;old.terminate();await drain();
 assert.equal(f.hellos(),2,'the new context notification must survive the stale renewal response');assert.equal(f.controllers.length,2);assert.equal(f.session.showWorkspace(),true);
 old.terminate();await drain();assert.equal(f.hellos(),2);
});
test('successful renewal consumes early READY without replay or extra handshake',async t=>{
 const f=fixture(t);await f.session.start();const old=f.controllers[0];f.holdRefresh();
 const renewal=old.options.bridge.renewSession({handle:{id:'mount1'},binding:old.binding});await drain();await f.ready();f.releaseRefresh({state:'verified',scopeKey:'scope'});await renewal;await drain();
 assert.equal(f.hellos(),1);assert.equal(f.session.showWorkspace(),true);
 // A later denial without a new signal cannot reuse the old READY.
 f.setAnswer({state:'unknown'});await assert.rejects(old.options.bridge.renewSession({handle:{id:'mount1'},binding:old.binding}),/scope-not-verified/);old.terminate();await drain();assert.equal(f.hellos(),1);assert.equal(f.session.showWorkspace(),false);
});
