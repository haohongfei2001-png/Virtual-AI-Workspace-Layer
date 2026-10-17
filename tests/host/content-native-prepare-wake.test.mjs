import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(overrides={}){
 let adapterReady=true,readerReady=true,dormant=false,enterAllowed=true,settleHook=null,controllerOptions,controllers=0,adapters=0,readerRevision=0,adapterRevision=0,scopeKey="scope_A",hello=0;const resumed=[],closeEntries=[],settlements=[];let time=1000,id=0,bridge,context,adapterOptions,stops=0,planned=0;const presentations=[];const calls=[],listeners=new Set(),events=new Map(),timers=new Map();
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 const normal=m=>m.type==='HOST_HELLO'?{binding:{...binding(),producerToken:'producer_'+(++hello)}}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey}:m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:binding()}:{ok:true,grants:[]};
 let respond=normal;const readiness=(kind)=>{const revision=kind==='adapter'?adapterRevision:readerRevision;return Object.freeze({isCurrent:()=>kind==='adapter'?adapterReady&&revision===adapterRevision:readerReady&&revision===readerRevision});};const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);return respond(m);}};
 const options={document,runtime,identityReader:{read:async()=>({}),prepareIdle:()=>readerReady?readiness('reader'):null},makeId:()=> 'client',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:o=>(adapters++,adapterOptions=o,{inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,prepareIdle:()=>adapterReady?readiness('adapter'):null,prepareRecovery:()=>adapterReady?readiness('adapter'):null}),surfaceFactory:()=>({}),plansFactory:({bindingCurrent})=>({plan:()=>{assert.ok(bindingCurrent());planned++;return ['plan'];}}),controllerFactory:o=>{controllers++;controllerOptions=o;bridge=o.bridge;return {async checkIdle(options){const result=await bridge.checkIdleMount({handle:{id:'mount',regionEpoch:1},timeoutMs:options.timeoutMs});return result?.ok===true&&options.isCurrent();},enterDormant(){closeEntries.push(true);if(!enterAllowed)return false;dormant=true;return true;},async settleDormant(options){settlements.push(options);if(settleHook)await settleHook(options);if(!options.isCurrent())return false;const result=await bridge.releaseIdleMount({handle:{id:'mount',regionEpoch:1},timeoutMs:options.timeoutMs});return result?.ok===true&&options.isCurrent();},dormantReady:()=>dormant,resumeDormant:async (c,mode)=>{resumed.push({context:c,mode});dormant=false;return {id:'mount'};},start:async c=>{context=c;await bridge.registerMount({handle:{id:'mount',regionEpoch:1}});return {id:'mount'};},stop:()=>{stops++;bridge.revokeMount({mountId:'mount'});},showWorkspace:()=>{presentations.push('workspace');return true;},showReading:()=>{presentations.push('reading');return true;},showNativeReading:()=>{presentations.push('native-page');return true;}};}};
 const client=createHostContentSession({...options,...overrides});
 return {closeEntries,settlements,setEnterAllowed:value=>enterAllowed=value,setSettleHook:value=>settleHook=value,normal,resumed,get controllers(){return controllers;},get adapters(){return adapters;},get controllerOptions(){return controllerOptions;},setDormant:value=>dormant=value,setScope:value=>scopeKey=value,setAdapterReady:value=>{adapterRevision++;adapterReady=value;},setReaderReady:value=>{readerRevision++;readerReady=value;},presentations,get adapterOptions(){return adapterOptions;},client,options,runtime,document,binding,calls,listeners,events,setResponse:f=>{respond=f;},get bridge(){return bridge;},get context(){return context;},get stops(){return stops;},get planned(){return planned;},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await drain();}};
}



const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function ready(f){await f.client.start();await drain();assert.equal(typeof f.client.enterDormant,'function');}
const closes=f=>f.calls.filter(message=>message.type==='HOST_UI_IDLE_RELEASE');
// L-only content orchestration: synthetic runtime/controller; no native gesture or MV3 claim.
const hellos=f=>f.calls.filter(m=>m.type==='HOST_HELLO');
const prepare=f=>{assert.equal(typeof f.adapterOptions.onNativePrepare,'function');return f.adapterOptions.onNativePrepare;};
async function asleep(f){await ready(f);assert.equal(await f.client.enterDormant(),true);}
const noReplay=f=>assert.equal(f.calls.filter(m=>['HOST_FIRST_SEND_INTENT','HOST_OLD_SEND_OPERATION','HOST_UI_CALIBRATION_ENTRY'].includes(m.type)).length,0);
test('native prepare wakes complete dormant session with fresh authority in reading only',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await asleep(f);const before=f.calls.length;
 assert.equal(prepare(f)(f.context.binding),true);await drain();
 assert.deepEqual(f.calls.slice(before).filter(m=>['HOST_HELLO','HOST_REFRESH'].includes(m.type)).map(m=>m.type),['HOST_HELLO','HOST_REFRESH']);
 assert.equal(f.resumed.length,1);assert.deepEqual(f.resumed[0].mode,{mode:'reading'});assert.equal(f.resumed[0].context.binding.producerToken,'producer_2');
 assert.equal(f.controllers,1);assert.equal(f.adapters,1);assert.equal(f.stops,0);assert.deepEqual(f.presentations,[]);noReplay(f);
});
test('awake native prepare returns false without handshake',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);const count=f.calls.length;assert.equal(prepare(f)(f.context.binding),false);await drain();assert.equal(f.calls.length,count);assert.equal(f.resumed.length,0);
});
for(const kind of ['missing','old'])test('native prepare rejects '+kind+' producer before dormant wake',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await asleep(f);assert.equal(prepare(f)(kind==='missing'?undefined:{...f.context.binding,producerToken:'stale'}),false);await drain();assert.equal(hellos(f).length,1);assert.equal(f.resumed.length,0);noReplay(f);
});
for(const dependency of ['adapter','reader'])test('native prepare during '+dependency+' work does not initiate wake',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await asleep(f);(dependency==='adapter'?f.setAdapterReady:f.setReaderReady)(false);
 assert.equal(prepare(f)(f.context.binding),false);await drain();assert.equal(hellos(f).length,1);assert.equal(f.resumed.length,0);assert.equal(f.stops,0);
});
test('pending native prepare is acknowledged synchronously and duplicate is single flight',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await asleep(f);const producer=f.context.binding,callback=prepare(f);
 f.setResponse(m=>m.type==='HOST_HELLO'?held.promise:f.normal(m));
 assert.equal(callback(producer),true);assert.equal(callback(producer),true);await drain();assert.equal(hellos(f).length,2);assert.equal(f.resumed.length,0);
 held.resolve(f.normal({type:'HOST_HELLO'}));await drain();assert.equal(f.resumed.length,1);assert.deepEqual(f.resumed[0].mode,{mode:'reading'});assert.equal(hellos(f).length,2);
 assert.equal(callback(producer),false,'old observer cannot reuse new producer');noReplay(f);
});
test('native prepare scope change cannot resume dormant controller',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await asleep(f);f.setScope('scope_B');assert.equal(prepare(f)(f.context.binding),true);await drain();
 assert.equal(hellos(f).length,2);assert.equal(f.resumed.length,0);assert.equal(f.stops,1);assert.equal(f.listeners.size,0);noReplay(f);
});
test('captured observer producer remains singleflight during fresh REFRESH before adapter resume',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await asleep(f);
 const producer=f.context.binding,callback=prepare(f);
 f.setResponse(m=>m.type==='HOST_REFRESH'?held.promise:f.normal(m));
 assert.equal(callback(producer),true);await drain();
 assert.equal(hellos(f).length,2);assert.equal(f.resumed.length,0);
 const refresh=f.calls.filter(m=>m.type==='HOST_REFRESH').at(-1);
 assert.equal(refresh.producerToken,'producer_2','HELLO already changed content binding while old observer remains');
 assert.equal(callback({...producer,producerToken:'foreign'}),false);
 assert.equal(callback({...producer,documentToken:'foreign'}),false);
 assert.equal(callback({...producer,routeEpoch:2}),false);
 const repeated=callback(producer);
 // Always settle the held raw RPC, including on the expected old-code failure.
 held.resolve({state:'verified',scopeKey:'scope_A'});await drain();
 assert.equal(repeated,true,'same captured observer must suppress scheduling throughout pending refresh');
 assert.equal(hellos(f).length,2);assert.equal(f.resumed.length,1);
 assert.deepEqual(f.resumed[0].mode,{mode:'reading'});noReplay(f);
 assert.equal(callback(producer),false,'old observer loses the exception after successful resume');
});
