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
 let grantId='grant',mountId='mount';let surfaceGet=async()=>({ok:true,surface:null});
 const grant=()=>({id:grantId,mountId,parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role,expiresAt:new Date(time+20000).toISOString()});
 const page=()=>({protocol:'vaiwl-free-frame/1',role,scope:'A',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null});
 let view=async()=>({ok:true,state:'ready',page:page(),navigation:[]});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){}}),sendMessage:async m=>{calls.push(m);if(m.type==='HOST_UI_SURFACE_STATE_GET')return surfaceGet(m);if(m.type==='HOST_UI_VIEW'){views++;return view(m);}return {ok:true,grant:grant()};}};
 const client=createFreeFrameClient({document,privateRoot,runtime,role,parentOrigin:'https://chatgpt.com',onState:s=>states.push(s),now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),snippetsFactory:options=>{snippetOptions=options;return {open(){snippetOpens++;},stop(){snippetStops++;},invalidate(){snippetInvalidations++;}};},backupFactory:options=>{backupOptions=options;return {open(){backupOpens++;},stop(){backupStops++;},invalidate(){backupInvalidations++;}};},recoveryFactory:options=>{recoveryOptions=options;return {open(){recoveryOpens++;},stop(){recoveryStops++;},invalidate(){recoveryInvalidations++;}};},navigationFactory:options=>{factories++;navOptions=options;return {setNativeNavigationPending:value=>nativePending.push(value),restoreFrameView:value=>restoredViews.push(value),invalidate(){invalidations++;},present:intent=>presented.push(intent),updateFrameProjection:p=>pages.push(p),stop:()=>{stops++;}};}});
 return {setSurfaceGet:fn=>{surfaceGet=fn;},setGrant:(id,mount)=>{grantId=id;mountId=mount;},visibility(value){document.visibilityState=value;events.get('visibilitychange')?.();},nativePending,parentMessages,restoredViews,jump(ms){time+=ms;},runtime,grant,presented,messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},client,calls,pages,states,body,privateRoot,page,setView:fn=>{view=fn;},get snippets(){return snippetOptions;},get snippetOpens(){return snippetOpens;},get snippetStops(){return snippetStops;},get snippetInvalidations(){return snippetInvalidations;},get backup(){return backupOptions;},get backupOpens(){return backupOpens;},get backupStops(){return backupStops;},get backupInvalidations(){return backupInvalidations;},get recovery(){return recoveryOptions;},get recoveryOpens(){return recoveryOpens;},get recoveryStops(){return recoveryStops;},get recoveryInvalidations(){return recoveryInvalidations;},get invalidations(){return invalidations;},get nav(){return navOptions;},get factories(){return factories;},get stops(){return stops;},get views(){return views;},disconnect:()=>{for(const fn of [...listeners])fn();},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time&&timers.has(key)){timers.delete(key);t.fn();}await drain();}};
}

const hint=f=>f.emit({type:'VAIWL_UI_DATA_CHANGED'});
const ready=f=>({ok:true,state:'ready',page:f.page(),navigation:[]});

const surface=(f,revision,visible)=>f.emit({type:'VAIWL_UI_SURFACE_STATE',revision,visible});
const calibrationCount=f=>f.calls.filter(m=>m.type==='HOST_UI_CALIBRATION_ENTRY').length;
for(const role of ['workspace','sidebar'])test(role+': closed ordinary hints coalesce; reopening starts exactly one fresh view without calibration',async t=>{
 const f=fixture(role);t.after(()=>f.client.stop());await f.client.start();await drain();const before=f.views,calibrations=calibrationCount(f);
 surface(f,1,false);for(let i=0;i<20;i++)hint(f);await drain();assert.equal(f.views,before);
 const held=deferred();f.setView(()=>held.promise);surface(f,2,true);await drain();assert.equal(f.views,before+1);surface(f,2,true);surface(f,3,true);await drain();assert.equal(f.views,before+1);held.resolve(ready(f));await drain();assert.equal(f.views,before+1);assert.equal(calibrationCount(f),calibrations);
});
for(const role of ['workspace','sidebar'])test(role+': in-flight completion after close does not chain dirty reads',async t=>{
 const f=fixture(role);t.after(()=>f.client.stop());await f.client.start();await drain();const held=deferred();f.setView(()=>held.promise);hint(f);await drain();const before=f.views;
 surface(f,1,false);for(let i=0;i<10;i++)hint(f);held.resolve(ready(f));await drain();assert.equal(f.views,before);f.setView(async()=>ready(f));surface(f,2,true);await drain();assert.equal(f.views,before+1);
});
test('surface visible while document hidden retains dirty work until genuine document return',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();f.visibility('hidden');surface(f,1,false);hint(f);const before=f.views;surface(f,2,true);await drain();assert.equal(f.views,before);f.visibility('visible');await drain();assert.equal(f.views,before+1);
});
test('unknown GET state preserves preexisting visibility fallback and ordinary hints',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();const before=f.views;hint(f);await drain();assert.equal(f.views,before+1);f.visibility('hidden');hint(f);await drain();assert.equal(f.views,before+1);
 assert(f.calls.some(m=>m.type==='HOST_UI_SURFACE_STATE_GET'&&m.grantId==='grant'&&m.mountId==='mount'));
});
test('malformed old and replayed surface revisions cannot release a closed surface',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();surface(f,10,false);const before=f.views;
 for(const m of [{type:'VAIWL_UI_SURFACE_STATE',revision:9,visible:true},{type:'VAIWL_UI_SURFACE_STATE',revision:10,visible:true},{type:'VAIWL_UI_SURFACE_STATE',revision:0,visible:true},{type:'VAIWL_UI_SURFACE_STATE',revision:11.5,visible:true},{type:'VAIWL_UI_SURFACE_STATE',revision:Number.MAX_SAFE_INTEGER+1,visible:true},{type:'VAIWL_UI_SURFACE_STATE',revision:11,visible:1},{type:'VAIWL_UI_SURFACE_STATE',revision:11,visible:true,extra:true},{type:'OTHER',revision:11,visible:true}]){f.emit(m);hint(f);await drain();assert.equal(f.views,before);}
 surface(f,11,true);await drain();assert.equal(f.views,before+1);
});
test('late GET lower revision cannot overwrite newer private-port state and never blocks bootstrap',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());f.setSurfaceGet(()=>held.promise);await f.client.start();await drain();assert.equal(f.views,1);surface(f,9,false);const before=f.views;held.resolve({ok:true,surface:{revision:2,visible:true}});await drain();hint(f);await drain();assert.equal(f.views,before);
});
test('same-mount grant renewal preserves surface revision high-water mark',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();surface(f,20,false);await f.advance(10000);assert(f.calls.some(m=>m.type==='HOST_UI_RENEW'));const before=f.views;surface(f,19,true);hint(f);await drain();assert.equal(f.views,before);surface(f,21,true);await drain();assert.equal(f.views,before+1);
});
test('clear fences old GET and old port so neither can affect a new grant',async t=>{
 const f=fixture(),oldGet=deferred();t.after(()=>f.client.stop());f.setSurfaceGet(()=>oldGet.promise);await f.client.start();await drain();const oldPort=[...f.messageListeners][0];f.client.stop();f.setGrant('new-grant','new-mount');f.setSurfaceGet(async()=>({ok:true,surface:{revision:1,visible:true}}));await f.client.start();await drain();oldGet.resolve({ok:true,surface:{revision:100,visible:false}});oldPort({type:'VAIWL_UI_SURFACE_STATE',revision:101,visible:false});await drain();const before=f.views;hint(f);await drain();assert.equal(f.views,before+1);
});
for(const panel of ['backup','recovery','snippets'])test('closed '+panel+' conflict invalidation is not suppressed',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();f.nav[{backup:'onBackupRequest',recovery:'onRecoveryRequest',snippets:'onSnippetsRequest'}[panel]]();await drain();surface(f,1,false);const before=f.views;hint(f);hint(f);await drain();assert.equal(f[{backup:'backupInvalidations',recovery:'recoveryInvalidations',snippets:'snippetInvalidations'}[panel]],2);assert.equal(f.views,before);
});
test('explicit projection requests remain available on closed surfaces',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();surface(f,1,false);const before=f.views;const result=await f.nav.onProjectionRequest({segment:1,offset:0,limit:8});await drain();assert.equal(f.views,before+1);assert.equal(result.protocol,'vaiwl-free-frame/1');
});
test('known closed GET state cannot suppress authorized initial bootstrap',async t=>{
 const f=fixture();t.after(()=>f.client.stop());f.setSurfaceGet(async()=>({ok:true,surface:{revision:1,visible:false}}));await f.client.start();await drain();assert.equal(f.views,1);assert.equal(f.pages.length,1);hint(f);await drain();assert.equal(f.views,1);
});
