import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const drain=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
// Real content and surface lifecycle together; DOM/worker are explicit doubles.
// Region replacement is delivered through the real controller's resize listener,
// never by calling its termination callback or manufacturing a new grant locally.
function fixture(t){
 let now=1000,id=0,generation=0,region=1,geometry=true,answer={state:'verified',scopeKey:'scope-A'};
 const calls=[],adapters=[],frames=[],timers=new Map(),events=new Map(),listeners=new Set();
 const on=(k,f)=>{if(!events.has(k))events.set(k,new Set());events.get(k).add(f);};
 const off=(k,f)=>events.get(k)?.delete(f),emit=(k,e)=>{for(const f of [...events.get(k)??[]])f(e);};
 const win={addEventListener:on,removeEventListener:off};
 const slot={isConnected:true,children:[],append(n){this.children.push(n);n.remove=()=>{this.children=this.children.filter(x=>x!==n);};}};
 const doc={defaultView:win,location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},body:{},draft:'UNSENT',createElement:()=>({dataset:{},style:{},setAttribute(){},addEventListener(){},remove(){}})};
 const binding=()=>({documentToken:'doc'+generation,producerToken:'producer'+generation,browserDocumentId:'browser',routeEpoch:generation,origin:doc.location.origin,expiresAt:new Date(now+20000).toISOString()});
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},async sendMessage(m){calls.push(m);if(m.type==='HOST_HELLO'){generation++;return {binding:binding()};}if(m.type==='HOST_REFRESH')return {...answer};if(m.type==='HOST_UI_CONFIRM')return {ok:true,grant:{id:'grant-'+generation+'-'+m.role,mountId:m.mountId,role:m.role,parentDocumentId:'browser',uiDocumentId:'ui-'+generation+'-'+m.role,scopeGrantId:answer.scopeKey,expiresAt:binding().expiresAt}};return {ok:true};}};
 const session=createHostContentSession({document:doc,runtime,contextRecovery:true,now:()=>now,elapsedNow:()=>now,makeId:()=> 'client',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:now+ms});return key;},cancel:key=>timers.delete(key),plansFactory:()=>({}),adapterFactory:()=>{
  const a={active:false,phases:[],async start(options){this.active=true;this.phases.push(options.phase??'authorized');return {binding:options.binding};},stop(){this.active=false;},inspect(){return this.active?{ok:true,regionEpoch:region,navigationSlot:slot,reading:{},historyMaskRoots:[],header:{},composer:{},protectedRegions:[]}:{ok:false};},hasNativeLayer:()=>false,risk:()=>({state:'unknown'})};adapters.push(a);return a;
 },surfaceFactory:()=>{
  const pair=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{postMessage(){}}}}));frames.push(pair);
  return {async mount(){return {id:'mount'+generation,regionEpoch:region};},frames:()=>pair,refreshGeometry:()=>geometry,showWorkspace:()=>true,showReading(){},suspend(){},dispose(){for(const {frame}of pair)frame.isConnected=false;}};
 },controllerFactory:createSurfaceController});t.after(()=>session.stop());
 async function join(){for(const {role,frame}of frames.at(-1))emit('message',{origin:'chrome-extension://extension',source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'nonce-'+role}});await drain();}
 return {session,calls,adapters,frames,doc,join,ready:()=>session.contextReady(),answer:v=>{answer=v;},replace(){region++;emit('resize');},unsafe(){geometry=false;emit('resize');geometry=true;},async start(){await session.start();await join();assert.equal(session.showWorkspace(),true);},async tick(ms){now+=ms;for(const [k,v]of [...timers])if(v.at<=now){timers.delete(k);v.fn();}await drain();}};
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
