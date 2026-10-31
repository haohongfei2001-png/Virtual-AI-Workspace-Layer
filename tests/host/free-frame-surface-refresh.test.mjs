import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(role='workspace'){
 let readErrorOptions,readErrorShows=0,readErrorStops=0,focuses=0;
 const nativePending=[];let time=1000,id=0,navOptions,views=0;const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],parentMessages=[],calls=[],pages=[],states=[],presented=[],restoredViews=[];let factories=0,stops=0,invalidations=0,recoveryOptions,recoveryOpens=0,recoveryStops=0,recoveryInvalidations=0,backupOptions,backupOpens=0,backupStops=0,backupInvalidations=0,snippetOptions,snippetOpens=0,snippetStops=0,snippetInvalidations=0;
 const element=()=>({children:[],setAttribute(){},append(n){n.parent=this;this.children.push(n);},replaceChildren(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}});
 const body=element(),privateRoot=element();body.append(privateRoot);
 // These cases model surface visibility and scheduling, not browser layout.
 // The formal sidebar measures its persistent main, including auxiliary panels.
 privateRoot.getBoundingClientRect=()=>({height:128});
 const events=new EventTarget();const document={visibilityState:'visible',addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),body,createElement:element,defaultView:{parent:{postMessage(message,origin){parentMessages.push({message,origin});}}}};
 let grantId='grant',mountId='mount';let surfaceGet=async()=>({ok:true,surface:null});
 const grant=()=>({id:grantId,mountId,parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role,expiresAt:new Date(time+20000).toISOString()});
 const page=()=>({protocol:'vaiwl-free-frame/1',role,scope:'A',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null});
 let view=async()=>({ok:true,state:'ready',page:page(),navigation:[]});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){}}),sendMessage:async m=>{calls.push(m);if(m.type==='HOST_UI_SURFACE_STATE_GET')return surfaceGet(m);if(m.type==='HOST_UI_VIEW'){views++;return view(m);}return {ok:true,grant:grant()};}};
 const client=createFreeFrameClient({readErrorFactory:options=>{readErrorOptions=options;return {show(){readErrorShows++;},stop(){readErrorStops++;}};},document,privateRoot,runtime,role,parentOrigin:'https://chatgpt.com',onState:s=>states.push(s),now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),snippetsFactory:options=>{snippetOptions=options;return {open(){snippetOpens++;},stop(){snippetStops++;},invalidate(){snippetInvalidations++;}};},backupFactory:options=>{backupOptions=options;return {open(){backupOpens++;},stop(){backupStops++;},invalidate(){backupInvalidations++;}};},recoveryFactory:options=>{recoveryOptions=options;return {open(){recoveryOpens++;},stop(){recoveryStops++;},invalidate(){recoveryInvalidations++;}};},navigationFactory:options=>{factories++;navOptions=options;return {focusSurface:()=>focuses++,setNativeNavigationPending:value=>nativePending.push(value),restoreFrameView:value=>restoredViews.push(value),invalidate(){invalidations++;},present:intent=>presented.push(intent),updateFrameProjection:p=>pages.push(p),stop:()=>{stops++;}};}});
 return {events,get focuses(){return focuses;},get readError(){return readErrorOptions;},get readErrorShows(){return readErrorShows;},get readErrorStops(){return readErrorStops;},setSurfaceGet:fn=>{surfaceGet=fn;},setGrant:(id,mount)=>{grantId=id;mountId=mount;},visibility(value){document.visibilityState=value;events.dispatchEvent(new Event('visibilitychange'));},nativePending,parentMessages,restoredViews,jump(ms){time+=ms;},runtime,grant,presented,messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},client,calls,pages,states,body,privateRoot,page,setView:fn=>{view=fn;},get snippets(){return snippetOptions;},get snippetOpens(){return snippetOpens;},get snippetStops(){return snippetStops;},get snippetInvalidations(){return snippetInvalidations;},get backup(){return backupOptions;},get backupOpens(){return backupOpens;},get backupStops(){return backupStops;},get backupInvalidations(){return backupInvalidations;},get recovery(){return recoveryOptions;},get recoveryOpens(){return recoveryOpens;},get recoveryStops(){return recoveryStops;},get recoveryInvalidations(){return recoveryInvalidations;},get invalidations(){return invalidations;},get nav(){return navOptions;},get factories(){return factories;},get stops(){return stops;},get views(){return views;},disconnect:()=>{for(const fn of [...listeners])fn();},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time&&timers.has(key)){timers.delete(key);t.fn();}await drain();}};
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

for(const role of ['workspace','sidebar'])for(const hidden of ['surface','document'])test(`${role}: same-grant renewal while ${hidden} hidden refreshes authority and hint without starting VIEW`,async t=>{
 const f=fixture(role);t.after(()=>f.client.stop());await f.client.start();await drain();
 const before=f.views,gets=f.calls.filter(m=>m.type==='HOST_UI_SURFACE_STATE_GET').length,calibrations=calibrationCount(f);
 if(hidden==='surface')surface(f,7,false);else f.visibility('hidden');
 for(let i=0;i<5;i++)hint(f);
 await f.advance(10000);
 assert.equal(f.calls.filter(m=>m.type==='HOST_UI_RENEW').length,1);
 assert.equal(f.calls.filter(m=>m.type==='HOST_UI_SURFACE_STATE_GET').length,gets+1);
 assert.equal(f.views,before,'authority renewal is not an explicit projection request');
 assert.equal(f.stops,0);assert.equal(f.parentMessages.filter(p=>p.message.type==='VAIWL_UI_SUSPEND').length,0);
 hint(f);await drain();assert.equal(f.views,before);
 if(hidden==='surface'){surface(f,8,true);await drain();assert.equal(calibrationCount(f),calibrations);}else{f.visibility('visible');await drain();}
 assert.equal(f.views,before+1,'real reappearance consumes accumulated dirty work once');
});
for(const role of ['workspace','sidebar'])test(`${role}: same-grant renewal updates lease without rereading VIEW`,async t=>{
 const f=fixture(role);t.after(()=>f.client.stop());await f.client.start();await drain();surface(f,1,true);const before=f.views;
 await f.advance(10000);assert.equal(f.views,before);assert.equal(f.stops,0);
});
for(const terminal of ['expiry','disconnect'])test(`closed surface still clears immediately on ${terminal}`,async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start();await drain();surface(f,1,false);const before=f.views;
 if(terminal==='expiry')await f.advance(20000);else{f.disconnect();await drain();}
 assert.equal(f.stops,1);assert.equal(f.privateRoot.children.length,0);assert(f.parentMessages.some(p=>p.message.type==='VAIWL_UI_SUSPEND'));
 surface(f,2,true);hint(f);await drain();assert.equal(f.views,before);
});

for(const role of ['workspace','sidebar'])test(role+': terminal read conflict preserves authorization and blocks all automatic refresh until explicit one-shot retry',async t=>{
 const f=fixture(role);t.after(()=>f.client.stop());await f.client.start();await drain();const pages=f.pages.length;
 f.setView(async()=>({ok:false,reason:'snapshot-revision-changed',retryToken:'retry_1'}));hint(f);await drain();
 assert.equal(f.readErrorShows,1);assert.equal(f.stops,0);assert.equal(f.recoveryOpens,0);assert.equal(f.states.at(-1).state,'read-stopped');
 const before=f.views,calibrations=calibrationCount(f);for(let i=0;i<5;i++)hint(f);surface(f,1,false);surface(f,2,true);f.visibility('hidden');f.visibility('visible');await f.advance(10000);await drain();
 assert.equal(f.views,before);assert.equal(calibrationCount(f),calibrations);assert.equal(f.parentMessages.filter(p=>p.message.type==='VAIWL_UI_SUSPEND').length,0);
 const response=deferred();f.setView(()=>response.promise);f.readError.onRetry();f.readError.onRetry();await drain();assert.equal(f.views,before+1);assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).retryToken,'retry_1');
 response.resolve(ready(f));await drain();assert.equal(f.pages.length,pages+1);assert.equal(f.readErrorStops,1);assert.equal(f.stops,0);
 hint(f);await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).retryToken,undefined);
});
for(const outcome of ['expiry','disconnect','stop'])test('read terminal clears on '+outcome+' and stale retry cannot read',async()=>{
 const f=fixture();f.setView(async()=>({ok:false,reason:'stale-free-page',retryToken:'retry_1'}));await f.client.start();await drain();const retry=f.readError.onRetry;
 if(outcome==='expiry')await f.advance(20000);else if(outcome==='disconnect'){f.disconnect();await drain();}else f.client.stop();const before=f.views;retry();hint(f);await drain();assert.equal(f.views,before);assert.equal(f.privateRoot.children.length,0);assert.equal(f.readErrorStops,1);f.client.stop();
});
test('explicit retry transmits its token once across preparing polls and new terminal cannot auto-retry',async t=>{
 const f=fixture();t.after(()=>f.client.stop());f.setView(async()=>({ok:false,reason:'snapshot-revision-changed',retryToken:'retry_1'}));await f.client.start();await drain();
 let count=0;f.setView(async()=>++count===1?{ok:true,state:'preparing',retryAfterMs:50}:{ok:false,reason:'stale-free-page',retryToken:'retry_2'});f.readError.onRetry();await drain();await f.advance(50);await drain();
 assert.equal(count,2);assert.equal(f.readErrorShows,2);const last=f.calls.filter(m=>m.type==='HOST_UI_VIEW').slice(-2);assert.equal(last[0].retryToken,'retry_1');assert.equal(last[1].retryToken,undefined);hint(f);await drain();assert.equal(count,2);assert.equal(f.stops,0);
});

for(const retry of [false,true])for(const operation of ['present','working-set'])test(`${operation}: delayed result cannot revive stopped read, retry=${retry}`,async t=>{
 const f=fixture();t.after(()=>f.client.stop());f.setView(async()=>({...ready(f),page:{...f.page(),workspaceRevision:4}}));await f.client.start();await drain();
 const pending=deferred(),original=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type===(operation==='present'?'HOST_UI_PRESENT':'HOST_UI_WORKING_SET')?pending.promise:original(m);
 const request=operation==='present'?f.nav.onPresentationRequest({kind:'show-workspace'}):f.nav.onWorkingSetRequest({action:'add',refId:'ref1'});await drain();
 f.setView(async()=>({ok:false,reason:'snapshot-revision-changed',retryToken:'retry_1'}));await f.nav.onProjectionRequest({segment:1,offset:0,limit:8});await drain();
 assert.equal(f.states.at(-1).state,'read-stopped');
 if(retry){f.setView(async()=>({...ready(f),page:{...f.page(),workspaceRevision:5}}));f.readError.onRetry();await drain();}
 const views=f.views,states=f.states.length,presentations=f.presented.length;
 pending.resolve(operation==='present'?{ok:true,presentation:{revision:99,intent:{kind:'enter-reading'}}}:{ok:true,workspaceRevision:900,workingSet:{total:1,currentRefId:'ref1'}});
 await request;await drain();assert.equal(f.views,views);assert.equal(f.presented.length,presentations);assert.equal(f.states.length,states);
});
for(const response of [{reason:'snapshot-revision-changed',retryToken:'retry_1'},{ok:true,reason:'snapshot-revision-changed',retryToken:'retry_1'},{ok:false,reason:'snapshot-revision-changed',retryToken:'retry_1',extra:true}])test('malformed retry DTO cannot publish data or automatically retry: '+JSON.stringify(response),async t=>{
 const f=fixture();t.after(()=>f.client.stop());f.setView(async()=>response);await f.client.start();await drain();assert.equal(f.readErrorShows,1);assert.equal(f.stops,0);
});

for(const interruption of ['none','pointerdown','keydown','focusin','visibilitychange','disconnect','stop','renew'])test('explicit read retry focuses only the untouched current result: '+interruption,async t=>{
 const f=fixture();t.after(()=>f.client.stop());f.setView(async()=>({ok:false,reason:'stale-free-page',retryToken:'retry_focus'}));await f.client.start();await drain();
 const held=deferred();f.setView(()=>held.promise);f.readError.onRetry({restoreFocus:true});await drain();
 assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).retryToken,'retry_focus');
 if(interruption==='disconnect')f.disconnect();else if(interruption==='stop')f.client.stop();else if(interruption==='renew')await f.advance(10000);else if(interruption!=='none')f.events.dispatchEvent(new Event(interruption));
 held.resolve(ready(f));await drain();assert.equal(f.focuses,interruption==='none'?1:0);
});

for(const kind of ['show-working-set','search-known'])for(const outcome of ['deny','throw'])test(`failed ${kind} presentation drains only the retained pointer dirty hint: ${outcome}`,async()=>{
 const f=fixture('sidebar');try{await f.client.start();await drain();const before=f.views,release=f.nav.onNativeInteractionStart();hint(f);await drain();assert.equal(f.views,before);
 const send=f.runtime.sendMessage;f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_PRESENT'){if(outcome==='throw')throw Error('transport');return Promise.resolve({ok:false});}return send(m);};
 await f.nav.onPresentationRequest({kind});await drain();assert.equal(f.views,before+1);
 release();await f.advance(1000);assert.equal(f.views,before+1,'old release/timer cannot cause a second refresh');
 }finally{f.client.stop();}
});
for(const condition of ['clean','hidden','inflight','new-hold','restart'])test('late failed presentation respects '+condition+' read ownership',async()=>{
 const f=fixture('sidebar'),held=deferred(),readHeld=deferred();try{await f.client.start();await drain();const send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_PRESENT'?held.promise:send(m);
 const before=f.views;if(condition!=='clean'){f.nav.onNativeInteractionStart();hint(f);}const present=f.nav.onPresentationRequest({kind:'show-working-set'});await drain();
 let release;if(condition==='hidden')f.visibility('hidden');
 if(condition==='inflight'){f.setView(()=>readHeld.promise);hint(f);await drain();assert.equal(f.views,before+1);hint(f);await drain();}
 if(condition==='new-hold')release=f.nav.onNativeInteractionStart();
 if(condition==='restart'){f.client.stop();await f.client.start();await drain();release=f.nav.onNativeInteractionStart();hint(f);}
 const atFailure=f.views;held.resolve({ok:false});await present;await drain();assert.equal(f.views,atFailure);
 if(condition==='hidden'){f.visibility('visible');await drain();assert.equal(f.views,before+1);}
 if(condition==='inflight'){f.setView(async()=>ready(f));readHeld.resolve(ready(f));await drain();assert.equal(f.views,before+2);}
 if(release){release();await drain();assert.equal(f.views,atFailure+1);}
 }finally{held.resolve({ok:false});readHeld.resolve({ok:false});f.client.stop();}
});
