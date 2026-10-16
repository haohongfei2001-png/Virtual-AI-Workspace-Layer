import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(role='workspace'){
 const nativePending=[];let time=1000,id=0,navOptions,views=0;const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],parentMessages=[],calls=[],pages=[],states=[],presented=[],restoredViews=[];let factories=0,stops=0,invalidations=0,recoveryOptions,recoveryOpens=0,recoveryStops=0,backupOptions,backupOpens=0,backupStops=0,backupInvalidations=0,snippetOptions,snippetOpens=0,snippetStops=0,snippetInvalidations=0;
 const element=()=>({children:[],setAttribute(){},append(n){n.parent=this;this.children.push(n);},replaceChildren(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}});
 const body=element(),privateRoot=element();body.append(privateRoot);
 const events=new Map();const document={visibilityState:'visible',addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),body,createElement:element,defaultView:{parent:{postMessage(message,origin){parentMessages.push({message,origin});}}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role,expiresAt:new Date(time+20000).toISOString()});
 const page=()=>({protocol:'vaiwl-free-frame/1',role,scope:'A',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null});
 let view=async()=>({ok:true,state:'ready',page:page(),navigation:[]});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){}}),sendMessage:async m=>{calls.push(m);if(m.type==='HOST_UI_VIEW'){views++;return view(m);}return {ok:true,grant:grant()};}};
 const client=createFreeFrameClient({document,privateRoot,runtime,role,parentOrigin:'https://chatgpt.com',onState:s=>states.push(s),now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),snippetsFactory:options=>{snippetOptions=options;return {open(){snippetOpens++;},stop(){snippetStops++;},invalidate(){snippetInvalidations++;}};},backupFactory:options=>{backupOptions=options;return {open(){backupOpens++;},stop(){backupStops++;},invalidate(){backupInvalidations++;}};},recoveryFactory:options=>{recoveryOptions=options;return {open(){recoveryOpens++;},stop(){recoveryStops++;}};},navigationFactory:options=>{factories++;navOptions=options;return {setNativeNavigationPending:value=>nativePending.push(value),restoreFrameView:value=>restoredViews.push(value),invalidate(){invalidations++;},present:intent=>presented.push(intent),updateFrameProjection:p=>pages.push(p),stop:()=>{stops++;}};}});
 return {visibility(value){document.visibilityState=value;events.get('visibilitychange')?.();},nativePending,parentMessages,restoredViews,jump(ms){time+=ms;},runtime,grant,presented,messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},client,calls,pages,states,body,privateRoot,page,setView:fn=>{view=fn;},get snippets(){return snippetOptions;},get snippetOpens(){return snippetOpens;},get snippetStops(){return snippetStops;},get snippetInvalidations(){return snippetInvalidations;},get backup(){return backupOptions;},get backupOpens(){return backupOpens;},get backupStops(){return backupStops;},get backupInvalidations(){return backupInvalidations;},get recovery(){return recoveryOptions;},get recoveryOpens(){return recoveryOpens;},get recoveryStops(){return recoveryStops;},get invalidations(){return invalidations;},get nav(){return navOptions;},get factories(){return factories;},get stops(){return stops;},get views(){return views;},disconnect:()=>{for(const fn of [...listeners])fn();},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time&&timers.has(key)){timers.delete(key);t.fn();}await drain();}};
}

const entries=f=>f.calls.filter(m=>m.type==='HOST_UI_CALIBRATION_ENTRY');
test('renderer entry sends only owner grant identifiers and finite kind',async()=>{
 const f=fixture();await f.client.start();await drain();
 for(const kind of ['foreground','history'])await f.nav.onCalibrationEntry({kind,objectIds:['private'],proofId:'forged',conversationId:'arbitrary'});
 assert.deepEqual(entries(f),['foreground','history'].map(kind=>({v:1,type:'HOST_UI_CALIBRATION_ENTRY',grantId:'grant',mountId:'mount',kind})));
 for(const kind of ['send','inventory','',null,undefined])await f.nav.onCalibrationEntry({kind});assert.equal(entries(f).length,2);f.client.stop();
});
test('pending entry coalesces visibility and workspace-entry bursts',async()=>{
 const f=fixture();await f.client.start();await drain();const send=f.runtime.sendMessage,held=deferred();f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_CALIBRATION_ENTRY'){f.calls.push(m);return held.promise;}return send(m);};
 const first=f.nav.onCalibrationEntry({kind:'history'});await drain();
 f.visibility('hidden');f.visibility('visible');f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});await f.nav.onCalibrationEntry({kind:'foreground'});await drain();assert.equal(entries(f).length,1);
 held.resolve({ok:true});await first;await drain();f.visibility('hidden');f.visibility('visible');await drain();assert.equal(entries(f).length,2);f.client.stop();
});
test('workspace entry triggers foreground calibration without arbitrary target data',async()=>{
 const f=fixture();await f.client.start();await drain();f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});await drain();assert.deepEqual(entries(f),[{v:1,type:'HOST_UI_CALIBRATION_ENTRY',grantId:'grant',mountId:'mount',kind:'foreground'}]);f.client.stop();
});
for(const panel of ['backup','recovery','snippets'])test(panel+' suppresses calibration on both callback and visibility',async()=>{
 const f=fixture();await f.client.start();await drain();f.nav[{backup:'onBackupRequest',recovery:'onRecoveryRequest',snippets:'onSnippetsRequest'}[panel]]();await drain();
 await f.nav.onCalibrationEntry({kind:'history'});f.visibility('hidden');f.visibility('visible');f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});await drain();assert.equal(entries(f).length,0);f.client.stop();
});
test('closed and expired grant never issue calibration',async()=>{
 for(const closed of [true,false]){const f=fixture();await f.client.start();await drain();const callback=f.nav.onCalibrationEntry;if(closed)f.client.stop();else f.jump(20001);await callback({kind:'foreground'});f.visibility('hidden');f.visibility('visible');await drain();assert.equal(entries(f).length,0);f.client.stop();}
});

test('sidebar never issues owner calibration despite callback, visibility and workspace notices',async()=>{const f=fixture('sidebar');await f.client.start();await drain();await f.nav.onCalibrationEntry({kind:'foreground'});await f.nav.onCalibrationEntry({kind:'history'});f.visibility('hidden');f.visibility('visible');f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});await drain();assert.equal(entries(f).length,0);f.client.stop();});
