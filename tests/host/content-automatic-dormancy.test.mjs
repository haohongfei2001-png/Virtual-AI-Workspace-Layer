import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(overrides={}){
 let controller,adapterReady=true,readerReady=true,dormant=false,enterAllowed=true,settleHook=null,controllerOptions,controllers=0,adapters=0,readerRevision=0,adapterRevision=0,riskRevision=0,riskClear=true,scopeKey="scope_A",hello=0;const resumed=[],closeEntries=[],settlements=[];let time=1000,id=0,bridge,context,adapterOptions,stops=0,planned=0;const presentations=[];const calls=[],listeners=new Set(),events=new Map(),timers=new Map();
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 const normal=m=>m.type==='HOST_HELLO'?{binding:{...binding(),producerToken:'producer_'+(++hello)}}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey}:m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:binding()}:{ok:true,grants:[]};
 let respond=normal;const readiness=(kind)=>{const revision=kind==='adapter'?adapterRevision:readerRevision;return Object.freeze({isCurrent:()=>kind==='adapter'?adapterReady&&revision===adapterRevision:readerReady&&revision===readerRevision});};const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);return respond(m);}};
 const options={document,runtime,identityReader:{read:async()=>({}),prepareIdle:()=>readerReady?readiness('reader'):null},makeId:()=> 'client',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:o=>(adapters++,adapterOptions=o,{inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,prepareIdle:()=>adapterReady?readiness('adapter'):null,prepareAutomaticIdle:()=>{const rev=riskRevision;return riskClear&&adapterReady?{isCurrent:()=>riskClear&&rev===riskRevision&&adapterReady}:null;},prepareRecovery:()=>adapterReady?readiness('adapter'):null}),surfaceFactory:()=>({}),plansFactory:({bindingCurrent})=>({plan:()=>{assert.ok(bindingCurrent());planned++;return ['plan'];}}),controllerFactory:o=>{controllers++;controllerOptions=o;bridge=o.bridge;return controller={async checkIdle(options){const result=await bridge.checkIdleMount({handle:{id:'mount',regionEpoch:1},timeoutMs:options.timeoutMs});return result?.ok===true&&options.isCurrent();},enterDormant(){closeEntries.push(true);if(!enterAllowed)return false;dormant=true;return true;},async settleDormant(options){settlements.push(options);if(settleHook)await settleHook(options);if(!options.isCurrent())return false;const result=await bridge.releaseIdleMount({handle:{id:'mount',regionEpoch:1},timeoutMs:options.timeoutMs});return result?.ok===true&&options.isCurrent();},dormantReady:()=>dormant,resumeDormant:async c=>{resumed.push(c);return {id:'mount'};},start:async c=>{context=c;await bridge.registerMount({handle:{id:'mount',regionEpoch:1}});return {id:'mount'};},stop:()=>{stops++;bridge.revokeMount({mountId:'mount'});},showWorkspace:()=>{presentations.push('workspace');return true;},showReading:()=>{presentations.push('reading');return true;},showNativeReading:()=>{presentations.push('native-page');return true;}};}};
 const client=createHostContentSession({...options,...overrides});
 return {setRisk:value=>{riskRevision++;riskClear=value;},hint:()=>adapterOptions.onIdleHint?.(),get controller(){return controller;},closeEntries,settlements,setEnterAllowed:value=>enterAllowed=value,setSettleHook:value=>settleHook=value,normal,resumed,get controllers(){return controllers;},get adapters(){return adapters;},get controllerOptions(){return controllerOptions;},setDormant:value=>dormant=value,setScope:value=>scopeKey=value,setAdapterReady:value=>{adapterRevision++;adapterReady=value;},setReaderReady:value=>{readerRevision++;readerReady=value;},presentations,get adapterOptions(){return adapterOptions;},client,options,runtime,document,binding,calls,listeners,events,setResponse:f=>{respond=f;},get bridge(){return bridge;},get context(){return context;},get stops(){return stops;},get planned(){return planned;},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await drain();}};
}



const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function ready(f){await f.client.start();await drain();assert.equal(typeof f.client.enterDormant,'function');}
const closes=f=>f.calls.filter(message=>message.type==='HOST_UI_IDLE_RELEASE');
// L: actual content orchestration with explicit controller/transport doubles.
// Does not certify browser shutdown, C3 authority or actual native risk parsing.
const surfaces=(f,open,revision)=>f.bridge.surfaceState({mountId:'mount',revision,workspace:open,sidebar:open});
async function transition(f){await surfaces(f,true,1);await surfaces(f,false,2);await drain();}
const checks=f=>f.calls.filter(m=>m.type==='HOST_UI_IDLE_CHECK');

test('automatic reading transition consumes one real idle release opportunity',async t=>{
 const f=fixture({automaticDormancy:true});t.after(()=>f.client.stop());await ready(f);await transition(f);
 assert.equal(f.closeEntries.length,1);assert.equal(closes(f).length,1);assert.equal(checks(f).length,1);
 f.hint();await drain();assert.equal(closes(f).length,1);
});
test('default policy does not automatically close',async t=>{const f=fixture();t.after(()=>f.client.stop());await ready(f);await transition(f);assert.equal(checks(f).length,0);});
test('initial closed snapshot alone does not create a reading transition',async t=>{const f=fixture({automaticDormancy:true});t.after(()=>f.client.stop());await ready(f);await surfaces(f,false,1);f.hint();await drain();assert.equal(checks(f).length,0);});
test('adapter drain preserves a pending opportunity without polling',async t=>{const f=fixture({automaticDormancy:true});t.after(()=>f.client.stop());await ready(f);f.setAdapterReady(false);await transition(f);assert.equal(checks(f).length,0);f.setAdapterReady(true);f.hint();await drain();assert.equal(closes(f).length,1);});
test('raw IPC drain permits the waiting close only after actual completion',async t=>{
 const f=fixture({automaticDormancy:true}),held=deferred();t.after(()=>f.client.stop());await ready(f);
 f.setResponse(m=>m.type==='HOST_UI_WORKSPACE_ENTERED'?held.promise:f.normal(m));
 const pending=f.bridge.workspaceEntered({mountId:'mount'});await transition(f);assert.equal(checks(f).length,0);
 held.resolve({ok:true});await pending;await drain();assert.equal(closes(f).length,1);
});
for(const action of ['stop','reopen'])test('late closed ACK after '+action+' cannot create an opportunity',async t=>{
 const f=fixture({automaticDormancy:true}),held=deferred();t.after(()=>f.client.stop());await ready(f);await surfaces(f,true,1);
 f.setResponse(m=>m.type==='HOST_UI_SURFACE_STATE'&&m.revision===2?held.promise:f.normal(m));const pending=surfaces(f,false,2);await drain();
 if(action==='stop')f.client.stop();else await surfaces(f,true,3);
 held.resolve({ok:true});await pending.catch(()=>{});f.hint();await drain();assert.equal(checks(f).length,0);
});
test('risk unknown blocks automatic entry without weakening explicit close',async t=>{
 const f=fixture({automaticDormancy:true});t.after(()=>f.client.stop());await ready(f);f.setRisk(false);await transition(f);assert.equal(checks(f).length,0);
 assert.equal(await f.client.enterDormant(),true);assert.equal(closes(f).length,1);
});
test('revoked automatic risk token cannot revive after clear returns during preflight',async t=>{
 const f=fixture({automaticDormancy:true}),held=deferred();t.after(()=>f.client.stop());await ready(f);
 f.setResponse(m=>m.type==='HOST_UI_IDLE_CHECK'?held.promise:f.normal(m));await transition(f);assert.equal(checks(f).length,1);
 f.setRisk(false);f.setRisk(true);held.resolve({ok:true});await drain();assert.equal(f.closeEntries.length,0);f.hint();await drain();assert.equal(checks(f).length,1);
});
test('busy preflight consumes opportunity and hints do not recursively retry',async t=>{
 const f=fixture({automaticDormancy:true});t.after(()=>f.client.stop());await ready(f);f.setResponse(m=>m.type==='HOST_UI_IDLE_CHECK'?{ok:false,reason:'ui-release-busy'}:f.normal(m));
 await transition(f);assert.equal(checks(f).length,1);for(let i=0;i<5;i++){f.hint();await drain();}assert.equal(checks(f).length,1);assert.equal(closes(f).length,0);
 await surfaces(f,true,3);await surfaces(f,false,4);await drain();assert.equal(checks(f).length,2);
});
