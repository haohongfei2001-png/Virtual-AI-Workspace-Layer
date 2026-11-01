import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(role='workspace'){
 const nativePending=[];let time=1000,id=0,navOptions,views=0;const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],parentMessages=[],calls=[],pages=[],states=[],presented=[],restoredViews=[];let factories=0,stops=0,invalidations=0,recoveryOptions,recoveryOpens=0,recoveryStops=0,recoveryInvalidations=0,backupOptions,backupOpens=0,backupStops=0,backupInvalidations=0,snippetOptions,snippetOpens=0,snippetStops=0,snippetInvalidations=0;
 const element=()=>({children:[],setAttribute(){},append(n){n.parent=this;this.children.push(n);},replaceChildren(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}});
 const body=element(),privateRoot=element();body.append(privateRoot);
 const events=new Map();const document={visibilityState:'visible',addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),body,createElement:element,defaultView:{parent:{postMessage(message,origin){parentMessages.push({message,origin});}}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role,expiresAt:new Date(time+20000).toISOString()});
 const page=()=>({protocol:'vaiwl-free-frame/1',role,scope:'A',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null});
 let view=async()=>({ok:true,state:'ready',page:page(),navigation:[]});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){}}),sendMessage:async m=>{calls.push(m);if(m.type==='HOST_UI_VIEW'){views++;return view(m);}return {ok:true,grant:grant()};}};
 const client=createFreeFrameClient({document,privateRoot,runtime,role,parentOrigin:'https://chatgpt.com',onState:s=>states.push(s),now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),snippetsFactory:options=>{snippetOptions=options;return {open(){snippetOpens++;},stop(){snippetStops++;},invalidate(){snippetInvalidations++;}};},backupFactory:options=>{backupOptions=options;return {open(){backupOpens++;},stop(){backupStops++;},invalidate(){backupInvalidations++;}};},recoveryFactory:options=>{recoveryOptions=options;return {open(){recoveryOpens++;},stop(){recoveryStops++;},invalidate(){recoveryInvalidations++;}};},navigationFactory:options=>{factories++;navOptions=options;return {setNativeNavigationPending:value=>nativePending.push(value),restoreFrameView:value=>restoredViews.push(value),invalidate(){invalidations++;},present:intent=>presented.push(intent),updateFrameProjection:p=>pages.push(p),stop:()=>{stops++;}};}});
 return {visibility(value){document.visibilityState=value;events.get('visibilitychange')?.();},nativePending,parentMessages,restoredViews,jump(ms){time+=ms;},runtime,grant,presented,messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},client,calls,pages,states,body,privateRoot,page,setView:fn=>{view=fn;},get snippets(){return snippetOptions;},get snippetOpens(){return snippetOpens;},get snippetStops(){return snippetStops;},get snippetInvalidations(){return snippetInvalidations;},get backup(){return backupOptions;},get backupOpens(){return backupOpens;},get backupStops(){return backupStops;},get backupInvalidations(){return backupInvalidations;},get recovery(){return recoveryOptions;},get recoveryOpens(){return recoveryOpens;},get recoveryStops(){return recoveryStops;},get recoveryInvalidations(){return recoveryInvalidations;},get invalidations(){return invalidations;},get nav(){return navOptions;},get factories(){return factories;},get stops(){return stops;},get views(){return views;},disconnect:()=>{for(const fn of [...listeners])fn();},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time&&timers.has(key)){timers.delete(key);t.fn();}await drain();}};
}

const hint=f=>f.emit({type:'VAIWL_UI_DATA_CHANGED'});
const ready=f=>({ok:true,state:'ready',page:f.page(),navigation:[]});
for(const role of ['workspace','sidebar'])test(role+': hidden ordinary hints coalesce without reads; visible starts one fresh read',async t=>{
 const f=fixture(role);t.after(()=>f.client.stop());await f.client.start();await drain();const before=f.views;
 f.visibility('hidden');for(let i=0;i<20;i++)hint(f);await drain();assert.equal(f.views,before,'hidden hints must not issue HOST_UI_VIEW');
 const held=deferred();f.setView(()=>held.promise);f.visibility('visible');await drain();assert.equal(f.views,before+1);f.visibility('visible');await drain();assert.equal(f.views,before+1);
 held.resolve(ready(f));await drain();assert.equal(f.views,before+1,'consumed dirty flag must not chain a second visible read');
});
for(const role of ['workspace','sidebar'])test(role+': hidden in-flight completion does not chain queued dirty reads',async t=>{
 const f=fixture(role);t.after(()=>f.client.stop());await f.client.start();await drain();const held=deferred();f.setView(()=>held.promise);hint(f);await drain();const inFlight=f.views;
 f.visibility('hidden');for(let i=0;i<10;i++)hint(f);held.resolve(ready(f));await drain();assert.equal(f.views,inFlight,'read finally must preserve dirty without hidden follow-up');
 f.setView(async()=>ready(f));f.visibility('visible');await drain();assert.equal(f.views,inFlight+1);
});
for(const terminal of ['disconnect','stop','expiry'])test('hidden queued hints cannot revive after '+terminal,async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();f.visibility('hidden');hint(f);await drain();
 if(terminal==='disconnect')f.disconnect();if(terminal==='stop')f.client.stop();if(terminal==='expiry')f.jump(20001);
 const before=f.views;f.visibility('visible');hint(f);await drain();assert.equal(f.views,before);
});
for(const panel of ['backup','recovery','snippets'])test('hidden '+panel+' conflict invalidation remains immediate',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();f.nav[{backup:'onBackupRequest',recovery:'onRecoveryRequest',snippets:'onSnippetsRequest'}[panel]]();await drain();
 f.visibility('hidden');const before=f.views;hint(f);hint(f);await drain();assert.equal(f[{backup:'backupInvalidations',recovery:'recoveryInvalidations',snippets:'snippetInvalidations'}[panel]],2);assert.equal(f.views,before);
});
test('explicit projection request remains available while document is hidden',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();f.visibility('hidden');const before=f.views;
 const result=await f.nav.onProjectionRequest({segment:1,offset:0,limit:8});await drain();assert.equal(f.views,before+1);assert.equal(result.protocol,'vaiwl-free-frame/1');
});

test('initial bootstrap still performs its authorized read in an initially hidden document',async t=>{
 const f=fixture();t.after(()=>f.client.stop());f.visibility('hidden');await f.client.start();await drain();assert.equal(f.views,1);assert.equal(f.pages.length,1);
});
for(const terminal of ['disconnect','stop','expiry'])test('late in-flight result cannot publish or restart hidden work after '+terminal,async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();const held=deferred();f.setView(()=>held.promise);hint(f);await drain();
 f.visibility('hidden');hint(f);const views=f.views,pages=f.pages.length;
 if(terminal==='disconnect')f.disconnect();if(terminal==='stop')f.client.stop();if(terminal==='expiry')f.jump(20001);
 held.resolve(ready(f));await drain();f.visibility('visible');await drain();assert.equal(f.views,views);assert.equal(f.pages.length,pages);
});
