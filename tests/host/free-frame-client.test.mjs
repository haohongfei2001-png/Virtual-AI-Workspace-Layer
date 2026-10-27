import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {projectFreeSearch} from '../../src/runtime/free-search-projection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
export function fixture(role='workspace',createClient=createFreeFrameClient){
 const nativePending=[];let time=1000,id=0,navOptions,views=0;const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],parentMessages=[],calls=[],pages=[],states=[],presented=[],restoredViews=[];let factories=0,stops=0,invalidations=0,recoveryOptions,recoveryOpens=0,recoveryStops=0,backupOptions,backupOpens=0,backupStops=0,backupInvalidations=0,snippetOptions,snippetOpens=0,snippetStops=0,snippetInvalidations=0;
 const element=()=>({children:[],setAttribute(){},append(n){n.parent=this;this.children.push(n);},replaceChildren(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}});
 const body=element(),privateRoot=element();body.append(privateRoot);
 const focusEvents=new EventTarget();let panelFocuses=0;const document={addEventListener:focusEvents.addEventListener.bind(focusEvents),removeEventListener:focusEvents.removeEventListener.bind(focusEvents),body,createElement:element,defaultView:{parent:{postMessage(message,origin){parentMessages.push({message,origin});}}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role,expiresAt:new Date(time+20000).toISOString()});
 const page=()=>({protocol:'vaiwl-free-frame/1',role,scope:'A',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null});
 let view=async()=>({ok:true,state:'ready',page:page(),navigation:[]});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){}}),sendMessage:async m=>{calls.push(m);if(m.type==='HOST_UI_VIEW'){views++;return view(m);}return {ok:true,grant:grant()};}};
 const client=createClient({document,privateRoot,runtime,role,parentOrigin:'https://chatgpt.com',onState:s=>states.push(s),now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),readErrorFactory:()=>({show(){},stop(){}}),snippetsFactory:options=>{snippetOptions=options;return {open(){snippetOpens++;},stop(){snippetStops++;},invalidate(){snippetInvalidations++;}};},backupFactory:options=>{backupOptions=options;return {open(){backupOpens++;},stop(){backupStops++;},invalidate(){backupInvalidations++;}};},recoveryFactory:options=>{recoveryOptions=options;return {open(){recoveryOpens++;},stop(){recoveryStops++;}};},navigationFactory:options=>{factories++;navOptions=options;return {focusSurface:()=>{panelFocuses++;},setNativeNavigationPending:value=>nativePending.push(value),restoreFrameView:value=>restoredViews.push(value),invalidate(){invalidations++;},present:intent=>presented.push(intent),updateFrameProjection:p=>pages.push(p),stop:()=>{stops++;}};}});
 return {focusEvents,get panelFocuses(){return panelFocuses;},nativePending,parentMessages,restoredViews,jump(ms){time+=ms;},runtime,grant,presented,messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},client,calls,pages,states,body,privateRoot,page,setView:fn=>{view=fn;},get snippets(){return snippetOptions;},get snippetOpens(){return snippetOpens;},get snippetStops(){return snippetStops;},get snippetInvalidations(){return snippetInvalidations;},get backup(){return backupOptions;},get backupOpens(){return backupOpens;},get backupStops(){return backupStops;},get backupInvalidations(){return backupInvalidations;},get recovery(){return recoveryOptions;},get recoveryOpens(){return recoveryOpens;},get recoveryStops(){return recoveryStops;},get invalidations(){return invalidations;},get nav(){return navOptions;},get factories(){return factories;},get stops(){return stops;},get views(){return views;},disconnect:()=>{for(const fn of [...listeners])fn();},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time&&timers.has(key)){timers.delete(key);t.fn();}await drain();}};
}
test('actual lifecycle composition sends bounded VIEW without role and keeps one renderer across grant renewal',async()=>{const f=fixture();await f.client.start();await drain();assert.equal(f.pages.length,1);assert.deepEqual(f.calls.find(m=>m.type==='HOST_UI_VIEW'),{v:1,type:'HOST_UI_VIEW',grantId:'grant',mountId:'mount',query:{segment:0,offset:0,limit:8}});await f.advance(10000);assert.equal(f.factories,1);assert.equal(f.pages.length,1);assert.equal(f.stops,0);assert.equal(f.body.children[0],f.privateRoot);});
test('preparing is not empty; bounded retry eventually publishes owner page',async()=>{const f=fixture();let n=0;f.setView(async()=>++n===1?{ok:true,state:'preparing',retryAfterMs:50}:{ok:true,state:'ready',page:f.page(),navigation:[]});await f.client.start();await drain();assert.equal(f.pages.length,0);assert.equal(f.states.at(-1).state,'preparing');await f.advance(50);assert.equal(f.pages.length,1);});
test('page query strips role and installs synchronous href plans before returning DTO',async()=>{const f=fixture();await f.client.start();await drain();const id='33333333-3333-4333-8333-333333333333',url=`https://chatgpt.com/c/${id}`;f.setView(async()=>({ok:true,state:'ready',page:f.page(),navigation:[{refId:id,plan:{mode:'href',target:{kind:'resolved',entity:'conversation',nativeId:id,navigationURL:url},disposition:'new-tab-preserve-current'},targetKey:'target'}]}));const result=await f.nav.onProjectionRequest({role:'workspace',segment:2,offset:0,limit:8});assert.equal(result.protocol,'vaiwl-free-frame/1');assert.equal(f.calls.at(-1).query.role,undefined);assert.equal(f.nav.adapter.navigationPlan({id}).plan.target.navigationURL,url);assert.equal(f.nav.adapter.nativeHref('https://evil.test/'),null);});
test('oversize responses halve bounded limit then rowLimit within the same finite read',async()=>{const f=fixture();f.setView(async m=>m.query.limit>1?{ok:false,reason:'free-frame-page-too-large'}:{ok:true,state:'ready',page:f.page(),navigation:[]});await f.client.start();await drain();assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').map(m=>m.query.limit),[8,4,2,1]);assert.equal(f.pages.length,1);f.setView(async()=>({ok:false,reason:'free-frame-page-too-large'}));await f.nav.onProjectionRequest({role:'workspace',segment:2,offset:24,limit:1,rowOffset:200,rowLimit:17});const queries=f.calls.filter(m=>m.type==='HOST_UI_VIEW').slice(-2).map(m=>m.query);assert.deepEqual(queries.map(q=>q.rowLimit),[17,5]);assert(queries.every(q=>q.offset===24&&q.segment===2&&q.rowOffset===200));assert.equal(f.stops,0);});
test('disconnect stops navigation synchronously and late ready never renders',async()=>{const f=fixture(),held=deferred();f.setView(()=>held.promise);await f.client.start();await drain();f.disconnect();assert.equal(f.stops,1);assert.equal(f.privateRoot.children.length,0);held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert.equal(f.pages.length,0);});
test('VIEW RPC is limited to six seconds',async()=>{const f=fixture();f.setView(()=>new Promise(()=>{}));await f.client.start();await drain();await f.advance(6000);assert.equal(f.pages.length,0);assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,'read-stopped');});
test('preparing total budget does not restart with renewed grant',async()=>{const f=fixture();f.setView(async()=>({ok:true,state:'preparing',retryAfterMs:50}));await f.client.start();await drain();for(let i=0;i<30;i++)await f.advance(1000);assert.equal(f.pages.length,0);assert.equal(f.stops,0);assert.equal(f.states.at(-1).reason,'read-budget-exhausted');});
test('invalidation bursts coalesce to one follow-up and retain current query and renderer',async()=>{
 const f=fixture();await f.client.start();await drain();await f.nav.onProjectionRequest({role:'workspace',segment:3,offset:8,limit:8,groupId:'p',list:'old',rowOffset:0,rowLimit:17});
 const held=deferred();let n=0;f.setView(()=>++n===1?held.promise:Promise.resolve({ok:true,state:'ready',page:f.page(),navigation:[]}));
 f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();const before=f.views;
 for(let i=0;i<1000;i++)f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.views,before);
 held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert.equal(f.views,before+1);assert.equal(f.factories,1);assert.equal(f.stops,0);
 assert.deepEqual(f.calls.at(-1).query,{segment:3,offset:8,limit:8,groupId:'p',list:'old',rowOffset:0,rowLimit:17});
});
test('queued notification is discarded on scope rejection and late old port response',async()=>{
 const f=fixture();await f.client.start();await drain();await f.advance(9000);const held=deferred();f.setView(()=>held.promise);f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();f.emit({type:'VAIWL_UI_DATA_CHANGED'});
 const send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_RENEW'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'B'}}):send(m);
 await f.advance(1000);const count=f.views;held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});f.historicalMessages[0]({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.views,count);assert.equal(f.pages.length,1);assert.equal(f.stops,1);
});
test('burst and renew during preparation retain the original thirty-second budget',async()=>{
 const f=fixture();f.setView(async()=>({ok:true,state:'preparing',retryAfterMs:50}));await f.client.start();await drain();
 for(let i=0;i<30;i++){for(let j=0;j<20;j++)f.emit({type:'VAIWL_UI_DATA_CHANGED'});await f.advance(1000);}
 assert.equal(f.states.at(-1).reason,'read-budget-exhausted');assert.equal(f.pages.length,0);assert.equal(f.stops,0);
});
test('owner current URL drives adapter matching and is erased on clear or legacy page',async()=>{const f=fixture(),id='33333333-3333-4333-8333-333333333333',nativeUrl='https://chatgpt.com/c/'+id;f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),current:{nativeUrl,refId:id,projectId:null}},navigation:[]}));await f.client.start();await drain();assert.equal(f.nav.adapter.currentURL(),nativeUrl);assert.equal(f.nav.adapter.isCurrent(nativeUrl),true);assert.equal(f.nav.adapter.isCurrent('https://chatgpt.com/'),false);f.setView(async()=>({ok:true,state:'ready',page:f.page(),navigation:[]}));await f.nav.onProjectionRequest({segment:0});assert.equal(f.nav.adapter.currentURL(),'');f.disconnect();assert.equal(f.nav.adapter.isCurrent(nativeUrl),false);});
for(const current of [null,{nativeUrl:'https://evil.test/',refId:null,projectId:null},{nativeUrl:'https://chatgpt.com/',refId:22,projectId:null},{nativeUrl:'https://chatgpt.com/',refId:null,projectId:null,title:'private'}])test('malformed owner current fails closed '+JSON.stringify(current),async()=>{const f=fixture();f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),current},navigation:[]}));await f.client.start();await drain();assert.equal(f.pages.length,0);assert.equal(f.states.at(-1).reason,'invalid-frame-current');});

test('presentation bridge sends current grant and self echo does not erase typed search',async()=>{
 const f=fixture();await f.client.start();await drain();const send=f.runtime.sendMessage,packets=[];
 f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_PRESENT'){packets.push(m);return Promise.resolve({ok:true,presentation:{revision:1,intent:m.intent}});}return send(m);};
 const search={query:'typed native name',projectId:'P1',offset:24,limit:24};await f.nav.onProjectionRequest({segment:0,offset:0,limit:8,search});
 await f.nav.onPresentationRequest({kind:'search-known',themeId:'P1'});await drain();
 assert.deepEqual(packets,[{v:1,type:'HOST_UI_PRESENT',grantId:'grant',mountId:'mount',intent:{kind:'search-known',themeId:'P1'}}]);assert.deepEqual(f.presented,[]);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query.search,search);
 await f.advance(10000);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query.search,search);
 await f.nav.onProjectionRequest({segment:0,offset:0,limit:8});assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query.search,undefined);
});
test('shared presentation revisions and identical intent do not repeatedly reset search',async()=>{
 const f=fixture();let presentation={revision:1,intent:{kind:'search-known',themeId:null}};
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),presentation},navigation:[]}));await f.client.start();await drain();assert.equal(f.presented.length,1);
 await f.nav.onProjectionRequest({search:{query:'typed',projectId:null,offset:0,limit:24}});presentation={...presentation,revision:2};f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.presented.length,1);
 presentation={revision:1,intent:{kind:'show-workspace'}};f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.presented.length,1);
 presentation={revision:3,intent:{kind:'show-workspace'}};f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.deepEqual(f.presented.at(-1),{kind:'show-workspace'});assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query.search,undefined);
});
test('presentation denial reports once without retry or stopping authorized frame',async()=>{
 const f=fixture();await f.client.start();await drain();const send=f.runtime.sendMessage;let presents=0;f.runtime.sendMessage=m=>m.type==='HOST_UI_PRESENT'?(presents++,Promise.resolve({ok:false,reason:'ui-authorization-unavailable'})):send(m);
 await f.nav.onPresentationRequest({kind:'show-workspace'});await drain();assert.equal(presents,1);assert.equal(f.states.at(-1).reason,'presentation-unavailable');assert.equal(f.stops,0);assert.deepEqual(f.presented,[]);
});
for(const mode of ['stop','scope-change'])test('late presentation reply after '+mode+' cannot present or refresh',async()=>{
 const f=fixture(),held=deferred();await f.client.start();await drain();const send=f.runtime.sendMessage;
 f.runtime.sendMessage=m=>m.type==='HOST_UI_PRESENT'?held.promise:m.type==='HOST_UI_RENEW'&&mode==='scope-change'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'other'}}):send(m);
 const pending=f.nav.onPresentationRequest({kind:'search-known',themeId:null});if(mode==='stop')f.client.stop();else await f.advance(10000);const views=f.views;
 held.resolve({ok:true,presentation:{revision:2,intent:{kind:'enter-reading'}}});await pending;await drain();assert.deepEqual(f.presented,[]);assert.equal(f.views,views);
});

test('working set query survives renewal and shared close clears it',async()=>{
 const f=fixture();let presentation={revision:1,intent:{kind:'show-working-set'}};
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),presentation},navigation:[]}));await f.client.start();await drain();
 const workingSet={offset:24,limit:24};await f.nav.onProjectionRequest({workingSet});await f.advance(10000);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query.workingSet,workingSet);
 presentation={revision:2,intent:{kind:'search-known',themeId:null}};f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query.workingSet,undefined);assert.equal(f.presented.at(-1).kind,'search-known');
});
test('working set oversize refines bounded rows without changing offset',async()=>{
 const f=fixture();await f.client.start();await drain();f.setView(async m=>m.query.workingSet.limit>6?{ok:false,reason:'free-working-set-page-too-large'}:{ok:true,state:'ready',page:f.page(),navigation:[]});
 await f.nav.onProjectionRequest({limit:1,workingSet:{offset:48,limit:24}});const queries=f.calls.filter(m=>m.query?.workingSet).map(m=>m.query.workingSet);assert.deepEqual(queries,[{offset:48,limit:24},{offset:48,limit:12},{offset:48,limit:6}]);assert.equal(f.stops,0);
});
test('simultaneous search and working set is rejected before privileged read',async()=>{
 const f=fixture();await f.client.start();await drain();const views=f.views;await assert.rejects(f.nav.onProjectionRequest({search:{query:'x'},workingSet:{offset:0}}),/invalid-frame-query/);assert.equal(f.views,views);assert.equal(f.stops,0);
});

test('manual horizon writes once using current revision and relocates before refreshing',async()=>{
 const f=fixture(),old={H:30,T:20740,Z:'UTC',policyRevision:0};let session=old;
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:5,viewSession:session},navigation:[]}));await f.client.start();await drain();
 const send=f.runtime.sendMessage,writes=[];f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_SET_HORIZON'){writes.push(m);session={...old,H:7,policyRevision:1};return Promise.resolve({ok:true,segment:8,viewSession:session,workspaceRevision:6});}return send(m);};
 const result=await f.nav.onHorizonRequest({H:7,segment:2,anchorRefId:null});await drain();assert.equal(result.ok,true);assert.equal(writes.length,1);assert.equal(writes[0].expectedRevision,5);assert.equal(writes[0].scope,undefined);assert.equal(f.calls.at(-1).query.segment,8);assert.equal(f.pages.at(-1).viewSession.H,7);
});
test('automatic mode keeps frozen horizon and history query while writing only the selection',async()=>{
 const f=fixture(),old={H:60,T:20740,Z:'UTC',policyRevision:4};let session=old;
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:5,viewSession:session},navigation:[]}));await f.client.start();await drain();
 const send=f.runtime.sendMessage,writes=[];f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_SET_HORIZON'){writes.push(m);session={...old,policyRevision:5};return Promise.resolve({ok:true,segment:3,viewSession:session,workspaceRevision:6});}return send(m);};
 const result=await f.nav.onHorizonRequest({H:'auto',segment:3,anchorRefId:null});await drain();assert.equal(result.ok,true);assert.equal(writes.length,1);assert.equal(writes[0].H,'auto');assert.equal(writes[0].expectedRevision,5);assert.equal(writes[0].scope,undefined);assert.equal(f.calls.at(-1).query.segment,3);assert.deepEqual(f.pages.at(-1).viewSession,{...old,policyRevision:5});
});
test('automatic selection rejects a response which changes the frozen horizon',async()=>{
 const f=fixture();f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:5,viewSession:{H:60,T:20740,Z:'UTC',policyRevision:4}},navigation:[]}));await f.client.start();await drain();
 const send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_SET_HORIZON'?Promise.resolve({ok:true,segment:0,viewSession:{H:30,T:20740,Z:'UTC',policyRevision:5},workspaceRevision:6}):send(m);
 assert.equal((await f.nav.onHorizonRequest({H:'auto',segment:0,anchorRefId:null})).reason,'invalid-horizon-response');assert.equal(f.pages.at(-1).viewSession.H,60);
});
test('another frame horizon change relocates existing date interval before publishing',async()=>{
 const f=fixture();let session={H:30,T:20740,Z:'UTC',policyRevision:0};f.setView(async m=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:5,viewSession:session,segment:m.query.segment??0},navigation:[]}));await f.client.start();await drain();await f.nav.onProjectionRequest({segment:2,offset:0,limit:8});
 session={...session,H:7,policyRevision:1};f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.calls.at(-1).query.segment,8);assert.equal(f.pages.at(-1).segment,8);
});
test('denied horizon never retries or changes query; late success after stop cannot publish',async()=>{
 const f=fixture();f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:5,viewSession:{H:30,T:20740,Z:'UTC',policyRevision:0}},navigation:[]}));await f.client.start();await drain();
 const send=f.runtime.sendMessage;let writes=0;f.runtime.sendMessage=m=>m.type==='HOST_UI_SET_HORIZON'?(writes++,Promise.resolve({ok:false,reason:'revision-conflict'})):send(m);const fail=await f.nav.onHorizonRequest({H:7,segment:0,anchorRefId:null});assert.equal(fail.reason,'revision-conflict');assert.equal(writes,1);assert.equal(f.pages.at(-1).viewSession.H,30);
 const held=deferred();f.runtime.sendMessage=m=>m.type==='HOST_UI_SET_HORIZON'?held.promise:send(m);const late=f.nav.onHorizonRequest({H:7,segment:0,anchorRefId:null});f.client.stop();const count=f.pages.length;held.resolve({ok:true,segment:0,viewSession:{H:7,T:20740,Z:'UTC',policyRevision:1},workspaceRevision:6});assert.equal((await late).ok,false);assert.equal(f.pages.length,count);
});

test('current ref cannot mismatch owner current identity',async()=>{
 const f=fixture();f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),current:{nativeUrl:'https://chatgpt.com/',refId:null,projectId:null},currentRef:{id:'forged'}},navigation:[]}));await f.client.start();await drain();assert.equal(f.states.at(-1).reason,'invalid-frame-current-ref');assert.equal(f.pages.length,0);
});

async function workingFixture(){const f=fixture();let revision=4;f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:revision},navigation:[]}));await f.client.start();await drain();return {...f,setRevision:v=>revision=v};}
test('working-set mutation uses fresh private operation identity and resets only working-set page',async()=>{const f=await workingFixture(),send=f.runtime.sendMessage,packets=[];f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_WORKING_SET'){packets.push(m);f.setRevision(5);return Promise.resolve({ok:true,workspaceRevision:5,workingSet:{total:1,currentRefId:'C'}});}return send(m);};await f.nav.onProjectionRequest({segment:3,offset:8,limit:8,workingSet:{offset:24,limit:24}});assert.equal((await f.nav.onWorkingSetRequest({action:'add',refId:'C'})).ok,true);assert.deepEqual({...packets[0],operationId:'generated'},{v:1,type:'HOST_UI_WORKING_SET',grantId:'grant',mountId:'mount',operationId:'generated',expectedRevision:4,action:'add',refId:'C'});assert.match(packets[0].operationId,/^[0-9a-f-]{36}$/);assert.deepEqual(f.calls.at(-1).query,{segment:3,offset:8,limit:8,workingSet:{offset:0,limit:24}});});
test('working-set mutation excludes concurrent horizon/working writes and coalesces dirty signals',async()=>{const f=await workingFixture(),held=deferred(),send=f.runtime.sendMessage;let writes=0;f.runtime.sendMessage=m=>m.type==='HOST_UI_WORKING_SET'?(writes++,held.promise):send(m);const job=f.nav.onWorkingSetRequest({action:'remove',refId:'C'});await drain();assert.equal((await f.nav.onWorkingSetRequest({action:'add',refId:'D'})).ok,false);assert.equal((await f.nav.onHorizonRequest({H:7,segment:0,anchorRefId:null})).ok,false);const count=f.calls.filter(x=>x.type==='HOST_UI_VIEW').length;for(let i=0;i<20;i++)f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.calls.filter(x=>x.type==='HOST_UI_VIEW').length,count);f.setRevision(5);held.resolve({ok:true,workspaceRevision:5,workingSet:{total:0,currentRefId:null}});assert.equal((await job).ok,true);assert.equal(writes,1);assert.equal(f.calls.filter(x=>x.type==='HOST_UI_VIEW').length,count+1);});
test('working-set rejects caller authority fields and CAS denial never replays',async()=>{const f=await workingFixture(),send=f.runtime.sendMessage;let writes=0;f.runtime.sendMessage=m=>m.type==='HOST_UI_WORKING_SET'?(writes++,Promise.resolve({ok:false,reason:'revision-conflict'})):send(m);for(const extra of [{scope:'B'},{operationId:'caller'}, {action:'rename'},{refId:''}])assert.equal((await f.nav.onWorkingSetRequest({action:'add',refId:'C',...extra})).ok,false);assert.equal(writes,0);assert.deepEqual(await f.nav.onWorkingSetRequest({action:'add',refId:'C'}),{ok:false,reason:'revision-conflict'});assert.equal(writes,1);assert.equal(f.stops,0);});
test('working-set committed response does not report success when follow-up read fails or frame stops',async()=>{for(const stop of [false,true]){const f=await workingFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_WORKING_SET'?held.promise:send(m);const job=f.nav.onWorkingSetRequest({action:'move-up',refId:'C'});await drain();if(stop)f.client.stop();else f.setView(async()=>({ok:false,reason:'read-failed'}));held.resolve({ok:true,workspaceRevision:5,workingSet:{total:1,currentRefId:'C'}});assert.equal((await job).ok,false);}});
test('working-set update preserves current search and six-second request deadline',async()=>{const f=await workingFixture(),send=f.runtime.sendMessage;await f.nav.onProjectionRequest({segment:2,search:{query:'Original',projectId:null,offset:24,limit:24}});f.runtime.sendMessage=m=>m.type==='HOST_UI_WORKING_SET'?new Promise(()=>{}):send(m);const job=f.nav.onWorkingSetRequest({action:'add',refId:'C'});await drain();await f.advance(6000);assert.equal((await job).ok,false);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query.search,{query:'Original',projectId:null,offset:24,limit:24});});
test('horizon in flight excludes working-set writes; successful working-set add preserves search',async()=>{const f=await workingFixture(),held=deferred(),send=f.runtime.sendMessage;let mutations=0;f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_SET_HORIZON')return held.promise;if(m.type==='HOST_UI_WORKING_SET'){mutations++;f.setRevision(5);return Promise.resolve({ok:true,workspaceRevision:5,workingSet:{total:1,currentRefId:'C'}});}return send(m);};const horizon=f.nav.onHorizonRequest({H:7,segment:0,anchorRefId:null});await drain();assert.equal((await f.nav.onWorkingSetRequest({action:'add',refId:'C'})).ok,false);assert.equal(mutations,0);held.resolve({ok:false,reason:'revision-conflict'});await horizon;const query={segment:2,offset:8,limit:8,search:{query:'Original',projectId:null,offset:24,limit:24}};await f.nav.onProjectionRequest(query);assert.equal((await f.nav.onWorkingSetRequest({action:'add',refId:'C'})).ok,true);assert.deepEqual(f.calls.at(-1).query,query);});

test('explicit recovery invalidates navigation but keeps grant and attaches it to recovery requests',async()=>{const f=fixture();await f.client.start();await drain();f.nav.onRecoveryRequest();assert.equal(f.invalidations,1);assert.equal(f.stops,0);assert.equal(f.recoveryOpens,1);f.nav.onRecoveryRequest();assert.equal(f.recoveryOpens,1);await f.recovery.request({v:1,type:'HOST_UI_RECOVERY_STATUS'});assert.deepEqual(f.calls.at(-1),{v:1,type:'HOST_UI_RECOVERY_STATUS',grantId:'grant',mountId:'mount'});assert.equal(f.states.at(-1).state,'recovery');});
test('storage read corruption enters recovery while protocol and permission failures stop lifecycle',async()=>{const recoverable=['corrupt-native-record','corrupt-free-evidence-record','invalid-partition-manifest','native-index-key-mismatch','invalid-native-index-directory','evidence-directory-key-mismatch','invalid-evidence-directory','shared-directory-key-mismatch','invalid-shared-directory','free-evidence-index-checksum-mismatch','free-evidence-index-conflict','invalid-free-evidence-index-checksums'];for(const reason of [...recoverable,'untrusted-source','invalid-protocol']){const f=fixture();f.setView(async()=>({ok:false,reason}));await f.client.start();await drain();const storage=recoverable.includes(reason);assert.equal(f.recoveryOpens,storage?1:0,reason);assert.equal(f.stops,0,reason);assert.equal(f.invalidations,1,reason);}});
test('grant renew and data-changed bursts preserve recovery panel without VIEW reads or stale painting',async()=>{const f=fixture();await f.client.start();await drain();const held=deferred();f.setView(()=>held.promise);f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();f.nav.onRecoveryRequest();const views=f.views,pages=f.pages.length;for(let i=0;i<20;i++)f.emit({type:'VAIWL_UI_DATA_CHANGED'});await f.advance(10000);assert.equal(f.views,views);assert.equal(f.recoveryOpens,1);assert.equal(f.recoveryStops,0);held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert.equal(f.pages.length,pages);await f.recovery.request({v:1,type:'HOST_UI_RECOVERY_STATUS'});assert.equal(f.calls.at(-1).grantId,'grant');});
test('recovery resume rereads preserved query and keeps existing renderer',async()=>{const f=fixture();await f.client.start();await drain();const query={segment:4,offset:8,limit:8,search:{query:'saved typed search',projectId:null,offset:24,limit:24}};await f.nav.onProjectionRequest(query);f.nav.onRecoveryRequest();const views=f.views;f.recovery.onResume();await drain();assert.equal(f.recoveryStops,1);assert.equal(f.views,views+1);assert.equal(f.factories,1);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,query);});
test('stop or scope replacement clears recovery and fences delayed replies and resume',async()=>{for(const changeScope of [false,true]){const f=fixture();await f.client.start();await drain();f.nav.onRecoveryRequest();if(changeScope)await f.advance(9000);const panel=f.recovery,held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_RECOVERY_STATUS'?held.promise:m.type==='HOST_UI_RENEW'&&changeScope?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'other_scope'}}):send(m);const reply=panel.request({v:1,type:'HOST_UI_RECOVERY_STATUS'});const rejected=assert.rejects(reply,/recovery-unavailable/);if(changeScope)await f.advance(1000);else f.client.stop();held.resolve({ok:true,plans:{}});await rejected;assert.equal(f.recoveryStops,1);const views=f.views;panel.onResume();await drain();assert.equal(f.views,views);assert.equal(f.stops,1);assert.equal(f.privateRoot.children.length,0);}});

for(const kind of ['workset','horizon'])test('committed '+kind+' follow-up corruption still opens recovery after write mutex clears',async()=>{const f=fixture();f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:4,viewSession:{H:30,T:20740,Z:'UTC',policyRevision:0}},navigation:[]}));await f.client.start();await drain();const send=f.runtime.sendMessage;f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_WORKING_SET'||m.type==='HOST_UI_SET_HORIZON'){f.setView(async()=>({ok:false,reason:'corrupt-native-record'}));return Promise.resolve(kind==='workset'?{ok:true,workspaceRevision:5,workingSet:{total:1,currentRefId:'C'}}:{ok:true,workspaceRevision:5,segment:0,viewSession:{H:7,T:20740,Z:'UTC',policyRevision:1}});}return send(m);};await(kind==='workset'?f.nav.onWorkingSetRequest({action:'add',refId:'C'}):f.nav.onHorizonRequest({H:7,segment:0,anchorRefId:null}));await drain();assert.equal(f.recoveryOpens,1,kind+' must not swallow recoverable error');assert.equal(f.invalidations,1);assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,'recovery');});
test('closing panel during repair leaves one resumed query and rejects late repair reply',async()=>{const f=fixture();await f.client.start();await drain();f.nav.onRecoveryRequest();const panel=f.recovery,held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_RECOVER'?held.promise:send(m);const repair=panel.request({v:1,type:'HOST_UI_RECOVER',kind:'native',planId:'plan',operationId:'operation'}),rejected=assert.rejects(repair,/recovery-unavailable/);panel.onResume();await drain();const pages=f.pages.length,views=f.views;held.resolve({ok:true,kind:'native'});await rejected;panel.onResume();await drain();assert.equal(f.pages.length,pages);assert.equal(f.views,views);assert.equal(f.recoveryStops,1);});


test('backup opens once, attaches current authority, and preserves panel through grant renewal',async()=>{const f=fixture();await f.client.start();await drain();f.nav.onBackupRequest();f.nav.onBackupRequest();f.nav.onRecoveryRequest();assert.equal(f.backupOpens,1);assert.equal(f.recoveryOpens,0);assert.equal(f.invalidations,1);const views=f.views;await f.backup.request({v:1,type:'HOST_UI_BACKUP_EXPORT'});assert.deepEqual(f.calls.at(-1),{v:1,type:'HOST_UI_BACKUP_EXPORT',grantId:'grant',mountId:'mount'});await f.advance(10000);assert.equal(f.backupInvalidations,0);assert.equal(f.views,views);f.emit({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(f.backupInvalidations,1);assert.equal(f.views,views);assert.equal(f.states.at(-1).state,'backup');});
test('backup return reuses renderer and query while late export gets bounded owner cleanup',async()=>{const f=fixture();await f.client.start();await drain();const query={segment:3,offset:8,limit:8};await f.nav.onProjectionRequest(query);f.nav.onBackupRequest();const panel=f.backup,held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_BACKUP_EXPORT'?held.promise:send(m);const request=panel.request({v:1,type:'HOST_UI_BACKUP_EXPORT'}),rejected=assert.rejects(request,/backup-unavailable/);panel.onResume();await drain();held.resolve({ok:true,transferId:'transfer'});await rejected;assert.equal(f.backupStops,1);assert.equal(f.factories,1);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,query);assert.deepEqual(f.calls.at(-1),{v:1,type:'HOST_UI_BACKUP_CLOSE',transferId:'transfer',grantId:'grant',mountId:'mount'});});
test('scope change clears backup and denies late chunks without resuming old private view',async()=>{const f=fixture();await f.client.start();await drain();await f.advance(9000);f.nav.onBackupRequest();const panel=f.backup,held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_BACKUP_READ'?held.promise:m.type==='HOST_UI_RENEW'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'other'}}):send(m);const pending=panel.request({v:1,type:'HOST_UI_BACKUP_READ',transferId:'transfer',index:0}),rejected=assert.rejects(pending,/backup-unavailable/);await f.advance(1000);held.resolve({ok:true,transferId:'transfer',index:0,data:'SECRET'});await rejected;panel.onResume();assert.equal(f.backupStops,1);assert.equal(f.privateRoot.children.length,0);assert.equal(f.calls.some(m=>m.type==='HOST_UI_BACKUP_CLOSE'),false);});

test('backup allocation arriving after client deadline is closed under the still-current grant',async()=>{for(const type of ['HOST_UI_BACKUP_EXPORT','HOST_UI_BACKUP_UPLOAD']){const f=fixture();await f.client.start();await drain();f.nav.onBackupRequest();const held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type===type?held.promise:send(m);const request=f.backup.request({v:1,type,...(type.endsWith('UPLOAD')?{byteLength:100}:{})}),rejected=assert.rejects(request,/request-timeout/);await drain();await f.advance(6000);await rejected;held.resolve({ok:true,transferId:'late_allocated'});await drain();assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_BACKUP_CLOSE'),[{v:1,type:'HOST_UI_BACKUP_CLOSE',transferId:'late_allocated',grantId:'grant',mountId:'mount'}]);assert.equal(f.backupStops,0);f.client.stop();}});

test('backup allocation is also closed when an overdue reply beats a delayed timer callback',async()=>{const f=fixture();await f.client.start();await drain();f.nav.onBackupRequest();const held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_BACKUP_EXPORT'?held.promise:send(m);const pending=f.backup.request({v:1,type:'HOST_UI_BACKUP_EXPORT'}),rejected=assert.rejects(pending,/request-timeout/);await drain();f.jump(6001);held.resolve({ok:true,transferId:'overdue_allocated'});await rejected;await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_BACKUP_CLOSE'&&m.transferId==='overdue_allocated').length,1);f.client.stop();});

const projectPlanFixture=()=>{const id='33333333-3333-4333-8333-333333333333',nativeUrl='https://chatgpt.com/g/'+id+'/project';return {id,nativeUrl,item:{projectId:id,targetKey:'project-plan',plan:{mode:'href',disposition:'new-tab-preserve-current',planRevision:1,target:{kind:'resolved',entity:'project',nativeId:id,navigationURL:nativeUrl}}}};};
test('project and conversation plans with identical IDs remain separate and revoke together',async()=>{
 const f=fixture(),{id,nativeUrl,item}=projectPlanFixture(),conversation={refId:id,targetKey:'conversation-plan',plan:{...item.plan,target:{kind:'resolved',entity:'conversation',nativeId:id,navigationURL:'https://chatgpt.com/c/'+id}}};
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),groups:{items:[{id,nativeUrl}]}},navigation:[item,conversation]}));await f.client.start();await drain();
 const adapter=f.nav.adapter;assert.equal(adapter.projectNavigationPlan({id}).targetKey,'project-plan');assert.equal(adapter.navigationPlan({id}).targetKey,'conversation-plan');assert.equal(f.stops,0);
 f.disconnect();assert.equal(adapter.projectNavigationPlan({id}),undefined);assert.equal(adapter.navigationPlan({id}),undefined);
});
for(const invalid of ['wrong-entity','wrong-url','unknown-project','both-ids','same-tab','duplicate'])test('project navigation rejects '+invalid,async()=>{
 const f=fixture(),{id,nativeUrl,item}=projectPlanFixture();let items=[item];
 if(invalid==='wrong-entity')item.plan.target.entity='conversation';
 if(invalid==='wrong-url')item.plan.target.navigationURL='https://chatgpt.com/g/other/project';
 if(invalid==='unknown-project')item.projectId='other';
 if(invalid==='both-ids')item.refId=id;
 if(invalid==='same-tab')item.plan.disposition='same-tab';
 if(invalid==='duplicate')items.push(structuredClone(item));
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),groups:{items:[{id,nativeUrl}]}},navigation:items}));await f.client.start();await drain();assert.equal(f.pages.length,1);assert.equal(f.states.at(-1).state,'ready');assert.equal(f.nav.adapter.projectNavigationPlan({id}),undefined);
});

for(const explicit of [true,false])test('oversize search refines its own page and preserves query, project and history: '+explicit,async()=>{
 const f=fixture();await f.client.start();await drain();
 f.setView(async m=>(m.query.search.limit??24)>6?{ok:false,reason:'free-search-page-too-large'}:{ok:true,state:'ready',page:f.page(),navigation:[]});
 const search={query:'原生标题',projectId:'P1',offset:48,...(explicit?{limit:24}:{})};
 await f.nav.onProjectionRequest({segment:3,offset:8,limit:8,search});
 const queries=f.calls.filter(m=>m.query?.search).map(m=>m.query);
 assert.deepEqual(queries.map(q=>q.search.limit),[explicit?24:undefined,12,6]);
 for(const q of queries){assert.equal(q.segment,3);assert.equal(q.offset,8);assert.equal(q.limit,8);assert.equal(q.search.query,search.query);assert.equal(q.search.projectId,'P1');assert.equal(q.search.offset,48);}
 assert.equal(f.stops,0);f.client.stop();
});
test('permanently oversize search stops after bounded refinement without publishing a partial page',async()=>{
 const f=fixture();await f.client.start();await drain();const published=f.pages.length;
 f.setView(async()=>({ok:false,reason:'free-search-page-too-large'}));
 assert.equal(await f.nav.onProjectionRequest({limit:1,search:{query:'long',offset:24}}),null);
 assert.deepEqual(f.calls.filter(m=>m.query?.search).map(m=>m.query.search.limit),[undefined,12,6,3,1]);
 assert.equal(f.pages.length,published);assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,'read-stopped');
});

test('real search projection with long Unicode native titles remains reachable through smaller pages',async()=>{
 const refs=Array.from({length:30},(_,i)=>({id:'C'+i,scope:'A',nativeTitle:'中'.repeat(1000)+i,nativeUrl:'https://chatgpt.com/c/C'+i,membership:'NONE',projectId:null}));
 const current={snapshot:freeNavigationSnapshot({scope:'A',viewMode:'free',projects:[],refs,preferences:{}})};
 const f=fixture();await f.client.start();await drain();
 f.setView(async m=>{try{return {ok:true,state:'ready',page:{...f.page(),search:projectFreeSearch(current,m.query.search)},navigation:[]};}catch(error){return {ok:false,reason:error.message};}});
 let offset=0,seen=[];
 while(offset<refs.length){const result=await f.nav.onProjectionRequest({limit:8,search:{query:'中',offset,limit:24}});assert(result);assert(new TextEncoder().encode(JSON.stringify(result.search)).length<=65536);seen.push(...result.search.items.map(r=>r.id));for(const row of result.search.items)assert.equal(row.nativeTitle,refs.find(r=>r.id===row.id).nativeTitle);offset+=result.search.items.length;assert.equal(result.search.hasMore,offset<refs.length);}
 assert.deepEqual(new Set(seen),new Set(refs.map(r=>r.id)));assert.equal(seen.length,refs.length);assert.equal(f.stops,0);f.client.stop();
});

async function currentEntryFixture(role='workspace'){
 const f=fixture(role);let session={H:30,T:20740,Z:'UTC',policyRevision:2},revision=5;
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:revision,viewSession:{...session}},navigation:[]}));
 f.setSession=value=>{session=value;};f.setWorkspaceRevision=value=>{revision=value;};await f.client.start();await drain();return f;
}

for(const kind of ['current','horizon','undo','working-set'])for(const settlement of ['reply','reject','deadline'])test(`retired ${kind} ${settlement} cannot release the replacement session mutation`,async()=>{
 const f=await currentEntryFixture(),send=f.runtime.sendMessage;
 if(kind==='undo'){
  const next={H:14,T:20740,Z:'UTC',policyRevision:3};
  f.runtime.sendMessage=m=>{
   if(m.type!=='HOST_UI_CURRENT_ENTRY')return send(m);
   f.setSession(next);f.setWorkspaceRevision(6);
   return Promise.resolve({ok:true,segment:0,workspaceRevision:6,viewSession:next,policyCommit:{policyRevision:3,workspaceRevision:6},autoChange:{id:'change',expiresAt:new Date(16000).toISOString(),previousH:30,H:14,policyRevision:3,workspaceRevision:6}});
  };
  assert.equal((await f.nav.onCurrentWorkspaceEntry()).ok,true);
 }
 let rejectOld;const old=deferred(),retired=new Promise((resolve,reject)=>{old.promise.then(resolve);rejectOld=reject;}),current=deferred();
 const types={current:'HOST_UI_CURRENT_ENTRY',horizon:'HOST_UI_SET_HORIZON',undo:'HOST_UI_UNDO_AUTO_HORIZON','working-set':'HOST_UI_WORKING_SET'};
 let oldDispatched=false,currentWrites=0,restarted=false;
 f.runtime.sendMessage=m=>{
  if(!restarted&&m.type===types[kind]){oldDispatched=true;return retired;}
  if(restarted&&m.type==='HOST_UI_WORKING_SET'){currentWrites++;return currentWrites===1?current.promise:Promise.resolve({ok:false,reason:'revision-conflict'});}
  return send(m);
 };
 const operations={current:()=>f.nav.onCurrentWorkspaceEntry(),horizon:()=>f.nav.onHorizonRequest({H:7,segment:0,anchorRefId:null}),undo:()=>f.nav.onUndoTimePolicyRequest({id:'change'}),'working-set':()=>f.nav.onWorkingSetRequest({action:'add',refId:'old'})};
 const first=operations[kind]();await drain();assert.equal(oldDispatched,true);
 // Keep the retired deadline one second ahead of the new operation. The new
 // client deliberately receives identical grant IDs, so renderer ownership is
 // required even when transport identifiers happen to be reused.
 f.jump(1000);f.client.stop();restarted=true;await f.client.start();await drain();
 const second=f.nav.onWorkingSetRequest({action:'add',refId:'new'});await drain();
 f.emit({type:'VAIWL_UI_DATA_CHANGED'});const views=f.views,pages=f.pages.length;
 try{
  if(settlement==='reply')old.resolve({ok:true,workspaceRevision:99,segment:0,viewSession:{H:7,T:20740,Z:'UTC',policyRevision:4},workingSet:{total:1,currentRefId:'old'}});
  if(settlement==='reject')rejectOld(Error('retired-transport'));
  if(settlement==='deadline')await f.advance(5000);
  assert.equal((await first).ok,false);await drain();
  assert.equal((await f.nav.onWorkingSetRequest({action:'add',refId:'extra'})).ok,false);
  assert.equal(currentWrites,1,'only the replacement operation may own the write lock');
  assert.equal(f.views,views,'retired cleanup must not drain the replacement dirty view');
  assert.equal(f.pages.length,pages,'retired reply must not paint');
  const revision=kind==='undo'?7:6;f.setWorkspaceRevision(revision);
  current.resolve({ok:true,workspaceRevision:revision,workingSet:{total:1,currentRefId:'new'}});
  assert.equal((await second).ok,true);await drain();
  assert.equal(f.pages.at(-1).workspaceRevision,revision);
  await f.nav.onWorkingSetRequest({action:'remove',refId:'new'});
  assert.equal(currentWrites,2,'current cleanup must release its own lock');
  const finalViews=f.views;old.resolve({ok:true,workspaceRevision:100});await drain();assert.equal(f.views,finalViews);
 }finally{old.resolve({ok:false});current.resolve({ok:false});f.client.stop();await drain();}
});
test('safe current entry alone sends frozen authority and adopts returned session before a current-page read',async()=>{
 const f=await currentEntryFixture(),other=await currentEntryFixture(),send=f.runtime.sendMessage,writes=[],next={H:14,T:20741,Z:'Asia/Shanghai',policyRevision:3};
 await f.advance(10000);assert.equal(f.calls.some(m=>m.type==='HOST_UI_CURRENT_ENTRY'),false);
 f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_CURRENT_ENTRY'){writes.push(m);f.setSession(next);return Promise.resolve({ok:true,segment:0,workspaceRevision:5,viewSession:next});}return send(m);};
 const result=await f.nav.onCurrentWorkspaceEntry();assert.equal(result.ok,true);assert.deepEqual(writes,[{v:1,type:'HOST_UI_CURRENT_ENTRY',grantId:'grant',mountId:'mount',expectedRevision:5,viewSession:{H:30,T:20740,Z:'UTC',policyRevision:2}}]);
 assert.deepEqual(f.calls.at(-1).query,{segment:0,offset:0,limit:8});assert.deepEqual(f.pages.at(-1).viewSession,next);assert.equal(other.pages.at(-1).viewSession.T,20740);f.client.stop();other.client.stop();
});
test('safe current entry does not run for sidebar history search working set or expired grant',async()=>{
 for(const kind of ['sidebar','history','search','workingSet','expired']){
  const f=await currentEntryFixture(kind==='sidebar'?'sidebar':'workspace');
  if(kind==='history')await f.nav.onProjectionRequest({segment:1});
  if(kind==='search')await f.nav.onProjectionRequest({segment:0,search:{query:'term',projectId:null,offset:0,limit:24}});
  if(kind==='workingSet')await f.nav.onProjectionRequest({segment:0,workingSet:{offset:0,limit:24}});
  if(kind==='expired')f.jump(20001);
  assert.equal((await f.nav.onCurrentWorkspaceEntry()).ok,false,kind);assert.equal(f.calls.some(m=>m.type==='HOST_UI_CURRENT_ENTRY'),false,kind);f.client.stop();
 }
});
test('late current entry response cannot overwrite stopped disconnected changed-scope or later history view',async()=>{
 for(const kind of ['stop','disconnect','scope','history']){
  const f=await currentEntryFixture(),held=deferred(),send=f.runtime.sendMessage;
  if(kind==='scope')await f.advance(9000);
  f.runtime.sendMessage=m=>m.type==='HOST_UI_CURRENT_ENTRY'?held.promise:m.type==='HOST_UI_RENEW'&&kind==='scope'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'different'}}):send(m);
  const job=f.nav.onCurrentWorkspaceEntry();await drain();
  if(kind==='stop')f.client.stop();if(kind==='disconnect')f.disconnect();if(kind==='scope')await f.advance(1000);if(kind==='history')await f.nav.onProjectionRequest({segment:2});
  const views=f.views,count=f.pages.length;held.resolve({ok:true,segment:0,workspaceRevision:5,viewSession:{H:7,T:20741,Z:'UTC',policyRevision:3}});
  assert.equal((await job).ok,false,kind);assert.equal(f.views,views,kind);assert.equal(f.pages.length,count,kind);f.client.stop();
 }
});
test('current entry and horizon changes share a single mutation mutex in both directions',async()=>{
 for(const first of ['current','horizon']){
  const f=await currentEntryFixture(),held=deferred(),send=f.runtime.sendMessage,packets=[];
  f.runtime.sendMessage=m=>{if(['HOST_UI_CURRENT_ENTRY','HOST_UI_SET_HORIZON'].includes(m.type)){packets.push(m);return held.promise;}return send(m);};
  const h=()=>f.nav.onHorizonRequest({H:7,segment:0,anchorRefId:null}),c=()=>f.nav.onCurrentWorkspaceEntry();const job=first==='current'?c():h();await drain();
  assert.equal((await(first==='current'?h():c())).ok,false);assert.equal((await c()).ok,false);assert.equal(packets.length,1);
  held.resolve({ok:false,reason:'revision-conflict'});assert.equal((await job).ok,false);assert.equal(f.pages.at(-1).viewSession.H,30);f.client.stop();
 }
});
test('malformed current-entry responses never change session or trigger projection reads',async()=>{
 const good={ok:true,segment:0,workspaceRevision:5,viewSession:{H:30,T:20741,Z:'UTC',policyRevision:2}};
 for(const patch of [{segment:1},{workspaceRevision:6},{viewSession:{...good.viewSession,H:8}},{viewSession:{...good.viewSession,T:1.5}},{viewSession:{...good.viewSession,Z:'invalid-zone'}},{viewSession:{...good.viewSession,policyRevision:1}},{viewSession:{...good.viewSession,scope:'other'}},{ok:false,reason:'revision-conflict'}]){
  const f=await currentEntryFixture(),send=f.runtime.sendMessage,views=f.views;f.runtime.sendMessage=m=>m.type==='HOST_UI_CURRENT_ENTRY'?Promise.resolve({...good,...patch}):send(m);
  assert.equal((await f.nav.onCurrentWorkspaceEntry()).ok,false);assert.equal(f.views,views);assert.equal(f.pages.at(-1).viewSession.T,20740);f.client.stop();
 }
});
test('current-entry RPC expires at six seconds and a late success cannot publish',async()=>{
 const f=await currentEntryFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_CURRENT_ENTRY'?held.promise:send(m);
 const job=f.nav.onCurrentWorkspaceEntry();await drain();await f.advance(5999);const views=f.views;await f.advance(1);assert.equal((await job).ok,false);assert.equal(f.views,views);
 held.resolve({ok:true,segment:0,workspaceRevision:5,viewSession:{H:7,T:20741,Z:'UTC',policyRevision:3}});await drain();assert.equal(f.views,views);assert.equal(f.pages.at(-1).viewSession.T,20740);f.client.stop();
});

test('snippet panel uses current route and owner authority, prepares view before list and restores original query',async()=>{
 const f=fixture('sidebar'),C='11111111-1111-4111-8111-111111111111';f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:3,current:{refId:C,projectId:null,nativeUrl:'https://chatgpt.com/c/'+C}},navigation:[]}));await f.client.start();await drain();
 const query={segment:2,offset:8,limit:8};await f.nav.onProjectionRequest(query);f.nav.onSnippetsRequest();f.nav.onSnippetsRequest();f.nav.onBackupRequest();assert.equal(f.snippetOpens,1);assert.equal(f.backupOpens,0);assert.deepEqual(f.snippets.currentRef,{id:C,nativeUrl:'https://chatgpt.com/c/'+C});
 const pages=f.pages.length;await f.snippets.request({type:'HOST_UI_SNIPPET_LIST',offset:0,limit:12});assert.equal(f.calls.at(-2).type,'HOST_UI_VIEW');assert.deepEqual(f.calls.at(-1),{type:'HOST_UI_SNIPPET_LIST',offset:0,limit:12,v:1,grantId:'grant',mountId:'mount'});assert.equal(f.pages.length,pages);
 f.emit({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(f.snippetInvalidations,1);f.snippets.onClose();await drain();assert.equal(f.snippetStops,1);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,query);f.client.stop();
});
test('scope replacement clears snippet panel and rejects late selected-asset reply',async()=>{
 const f=fixture();await f.client.start();await drain();await f.advance(9000);f.nav.onSnippetsRequest();const panel=f.snippets,held=deferred(),send=f.runtime.sendMessage;
 f.runtime.sendMessage=m=>m.type==='HOST_UI_SNIPPET'?held.promise:m.type==='HOST_UI_RENEW'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'other'}}):send(m);
 const pending=panel.request({type:'HOST_UI_SNIPPET',action:'save',id:'C'}),rejected=assert.rejects(pending,/snippet-unavailable/);await f.advance(1000);held.resolve({ok:true});await rejected;panel.onClose();assert.equal(f.snippetStops,1);assert.equal(f.privateRoot.children.length,0);
});

async function searchSnippetFixture(){
 const f=fixture(),C='11111111-1111-4111-8111-111111111111';
 f.setView(async m=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:5,current:{refId:C,projectId:null,nativeUrl:'https://chatgpt.com/c/'+C},...(m.query.search?{search:{...m.query.search,items:[{id:C,snippetMatches:[{id:'saved',preview:'match'}]},{id:'other',snippetMatches:[{id:'elsewhere',preview:'match'}]}]}}:{})},navigation:[]}));
 await f.client.start();await drain();await f.nav.onProjectionRequest({search:{query:'match',offset:0,limit:24,projectId:null}});return f;
}
test('search locate uses only current owner-issued saved asset and bounded authority',async()=>{
 const f=await searchSnippetFixture(),send=f.runtime.sendMessage,packets=[];f.runtime.sendMessage=m=>m.type==='HOST_UI_SNIPPET'?(packets.push(m),Promise.resolve({ok:true})):send(m);
 for(const value of [{id:'unknown'},{id:'elsewhere'},{id:'saved',scope:'A'},null])assert.equal((await f.nav.onSnippetLocateRequest(value)).ok,false);
 assert.equal(packets.length,0);assert.deepEqual(await f.nav.onSnippetLocateRequest({id:'saved'}),{ok:true});assert.deepEqual({...packets[0],operationId:'uuid'},{v:1,type:'HOST_UI_SNIPPET',grantId:'grant',mountId:'mount',operationId:'uuid',expectedRevision:5,action:'locate',id:'saved'});f.client.stop();
});
for(const change of ['query','stop','disconnect','scope','deadline'])test('search locate rejects duplicate and late '+change+' reply',async()=>{
 const f=await searchSnippetFixture(),held=deferred(),send=f.runtime.sendMessage;let count=0;
 if(change==='scope')await f.advance(9000);
 f.runtime.sendMessage=m=>m.type==='HOST_UI_SNIPPET'?(count++,held.promise):m.type==='HOST_UI_RENEW'&&change==='scope'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'other'}}):send(m);
 const pending=f.nav.onSnippetLocateRequest({id:'saved'});await drain();assert.equal((await f.nav.onSnippetLocateRequest({id:'saved'})).ok,false);assert.equal(count,1);
 if(change==='query')await f.nav.onProjectionRequest({segment:1});if(change==='stop')f.client.stop();if(change==='disconnect')f.disconnect();if(change==='scope')await f.advance(1000);if(change==='deadline')await f.advance(6000);
 held.resolve({ok:true});assert.equal((await pending).ok,false);f.client.stop();
});
const resumeLayout=()=>({segment:7,oldOpen:['p:7'],sidebarOpen:['p'],capacities:[['p:7',17]],scroll:312,sidebarScroll:22,sidebarVisible:true});
test('resume GET precedes initial VIEW and restores bounded query and layout',async()=>{const f=fixture(),send=f.runtime.sendMessage,order=[],view=resumeLayout(),query={segment:7,offset:8,limit:8};f.runtime.sendMessage=m=>{order.push(m.type);return m.type==='HOST_UI_RESUME'?Promise.resolve({ok:true,resume:{query,view}}):send(m);};await f.client.start();await drain();assert(order.indexOf('HOST_UI_RESUME')<order.indexOf('HOST_UI_VIEW'));assert.deepEqual(f.restoredViews,[view]);assert.deepEqual(f.calls.find(m=>m.type==='HOST_UI_VIEW').query,query);f.client.stop();});
test('resume late GET after account clear or stop cannot restore private layout or publish',async()=>{for(const mode of ['scope','stop']){const f=fixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_JOIN'?Promise.resolve({ok:true,grant:{...f.grant(),expiresAt:new Date(5000).toISOString()}}):m.type==='HOST_UI_RESUME'?held.promise:m.type==='HOST_UI_RENEW'&&mode==='scope'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'other'}}):send(m);await f.client.start();await drain();if(mode==='stop')f.client.stop();else await f.advance(2000);held.resolve({ok:true,resume:{query:{segment:7},view:resumeLayout()}});await drain();assert.equal(f.restoredViews.length,0);assert.equal(f.pages.length,0);assert.equal(f.privateRoot.children.length,0);f.client.stop();}});
test('layout save strips freeSession, coalesces 100ms and does not repeat acknowledged state',async()=>{const f=fixture(),send=f.runtime.sendMessage,saves=[];f.runtime.sendMessage=m=>m.type==='HOST_UI_SAVE_VIEW'?(saves.push(m),Promise.resolve({ok:true})):send(m);await f.client.start();await drain();for(let i=0;i<20;i++)f.nav.onViewChange({...resumeLayout(),scroll:i,freeSession:{H:30,T:1,Z:'UTC',policyRevision:0}});await f.advance(99);assert.equal(saves.length,0);await f.advance(1);assert.equal(saves.length,1);assert.equal(saves[0].view.scroll,19);assert.deepEqual(Object.keys(saves[0].view).sort(),['capacities','oldOpen','scroll','segment','sidebarOpen','sidebarScroll','sidebarVisible']);f.nav.onViewChange({...resumeLayout(),scroll:19});await f.advance(100);assert.equal(saves.length,1);f.client.stop();});
test('sidebar folds reach SAVE immediately while scroll-only changes stay coalesced',async()=>{
 const f=fixture('sidebar'),send=f.runtime.sendMessage,saves=[];
 f.runtime.sendMessage=m=>m.type==='HOST_UI_SAVE_VIEW'?(saves.push(m),Promise.resolve({ok:true})):send(m);
 await f.client.start();await drain();
 const folded={...resumeLayout(),sidebarChoices:[['project',false]]};
 f.nav.onViewChange(folded);await drain();assert.equal(saves.length,1,'no 100ms window before a different frame can navigate');
 f.nav.onViewChange({...folded,sidebarScroll:20});await drain();assert.equal(saves.length,1);
 await f.advance(100);assert.equal(saves.length,2);assert.equal(saves[1].view.sidebarScroll,20);
 f.nav.onViewChange({...folded,sidebarChoices:[['project',true]]});await drain();assert.equal(saves.length,3);
 f.client.stop();f.nav.onViewChange(folded);await drain();assert.equal(saves.length,3);
});
test('old SAVE reply cannot mark a replacement grant layout already saved',async()=>{const f=fixture(),send=f.runtime.sendMessage,held=deferred(),saves=[];f.runtime.sendMessage=m=>m.type==='HOST_UI_SAVE_VIEW'?(saves.push(m),saves.length===1?held.promise:Promise.resolve({ok:true})):send(m);await f.client.start();await drain();f.nav.onViewChange(resumeLayout());await f.advance(100);f.client.stop();await f.client.start();await drain();held.resolve({ok:true});await drain();f.nav.onViewChange(resumeLayout());await f.advance(100);assert.equal(saves.length,2);assert.equal(f.restoredViews.length,0);f.client.stop();});
test('invalid resume query or layout falls back atomically without exposing extra fields',async()=>{for(const patch of [{query:{scope:'secret'}},{view:{...resumeLayout(),title:'secret'}},{query:{search:{query:'x',body:'secret'}}}]){const f=fixture(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_RESUME'?Promise.resolve({ok:true,resume:{query:{segment:7},view:resumeLayout(),...patch}}):send(m);await f.client.start();await drain();assert.equal(f.restoredViews.length,0);assert.deepEqual(f.calls.find(m=>m.type==='HOST_UI_VIEW').query,{segment:0,offset:0,limit:8});assert(!JSON.stringify(f.states).includes('secret'));f.client.stop();}});
test('same layout after query change saves again with exact expectedQuery',async()=>{const f=fixture(),send=f.runtime.sendMessage,saves=[];f.runtime.sendMessage=m=>m.type==='HOST_UI_SAVE_VIEW'?(saves.push(m),Promise.resolve({ok:true})):send(m);await f.client.start();await drain();const layout={...resumeLayout(),segment:0};f.nav.onViewChange(layout);await f.advance(100);const next={segment:0,offset:0,limit:8,search:{query:'new',projectId:null,offset:0,limit:24}};await f.nav.onProjectionRequest(next);f.nav.onViewChange(layout);await f.advance(100);assert.equal(saves.length,2);assert.deepEqual(saves[0].expectedQuery,{segment:0,offset:0,limit:8});assert.deepEqual(saves[1].expectedQuery,next);f.client.stop();});
test('queued old layout and interim old renderer cannot attach to pending new query',async()=>{const f=fixture(),send=f.runtime.sendMessage,saves=[],held=deferred();f.runtime.sendMessage=m=>m.type==='HOST_UI_SAVE_VIEW'?(saves.push(m),Promise.resolve({ok:true})):send(m);await f.client.start();await drain();f.nav.onViewChange(resumeLayout());f.setView(()=>held.promise);const requested=f.nav.onProjectionRequest({segment:7,offset:8,limit:8});f.nav.onViewChange(resumeLayout());await f.advance(100);assert.equal(saves.length,0);held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await requested;f.nav.onViewChange(resumeLayout());await f.advance(100);assert.equal(saves.length,1);assert.deepEqual(saves[0].expectedQuery,{segment:7,offset:8,limit:8});f.client.stop();});

for(const role of ['workspace','sidebar'])test(`explicit ${role} renderer exit clears lifecycle and emits one exact EXIT instead of SUSPEND`,async()=>{
 const f=fixture(role);await f.client.start();await drain();
 const exit=f.nav.onExit;assert.equal(typeof exit,'function');assert(f.privateRoot.children.length>0);
 f.parentMessages.length=0;const before=f.pages.length,requests=f.calls.length;
 exit();assert.equal(f.privateRoot.children.length,0);assert.equal(f.stops,1);assert.equal(f.messageListeners.size,0);
 assert.deepEqual(f.parentMessages,[{message:{type:'VAIWL_UI_EXIT',role},origin:'https://chatgpt.com'}]);
 exit();f.client.stop();f.emit({type:'VAIWL_UI_DATA_CHANGED'});await f.advance(30000);
 assert.equal(f.stops,1);assert.equal(f.parentMessages.length,1);assert.equal(f.pages.length,before);assert.equal(f.calls.length,requests);
});
for(const role of ['workspace','sidebar'])test(`explicit ${role} exit fences a pending VIEW reply and old invalidation callback`,async()=>{
 const f=fixture(role);await f.client.start();await drain();
 const held=deferred(),nav=f.nav,oldNotification=f.historicalMessages[0],pageCount=f.pages.length;
 f.setView(()=>held.promise);const pending=nav.onProjectionRequest({segment:2,offset:0,limit:8});await drain();
 f.parentMessages.length=0;nav.onExit();const requests=f.calls.length;
 assert.equal(f.privateRoot.children.length,0);assert.equal(f.stops,1);
 held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await pending;await drain();
 oldNotification({type:'VAIWL_UI_DATA_CHANGED'});await f.advance(30000);
 assert.equal(f.pages.length,pageCount);assert.equal(f.privateRoot.children.length,0);assert.equal(f.calls.length,requests);assert.equal(f.factories,1);
 assert.deepEqual(f.parentMessages,[{message:{type:'VAIWL_UI_EXIT',role},origin:'https://chatgpt.com'}]);
});

const sameCurrentId='33333333-3333-4333-8333-333333333333';
const sameCurrentURL=`https://chatgpt.com/c/${sameCurrentId}`;
const sameCurrentPlan=()=>({mode:'same-target',bodyProofId:'current-body-proof',planRevision:4,target:{kind:'resolved',entity:'conversation',nativeId:sameCurrentId,navigationURL:sameCurrentURL,liveHandle:null}});
const sameCurrentCommand=()=>({actionId:'current-action',uiGrantId:'grant',mountId:'mount',planRevision:4,targetKey:'current-key'});
async function currentDispatchFixture(){const f=fixture();f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),current:{nativeUrl:sameCurrentURL,refId:sameCurrentId,projectId:null}},navigation:[{refId:sameCurrentId,plan:sameCurrentPlan(),targetKey:'current-key'}]}));await f.client.start();await drain();return f;}
test('ready native pointer interaction owns background hints until its single dispatch settles',async()=>{
 const f=await currentDispatchFixture(),before=f.views,send=f.runtime.sendMessage,held=deferred();
 try{
  const release=f.nav.onNativeInteractionStart?.();
  for(let i=0;i<100;i++)f.emit({type:'VAIWL_UI_DATA_CHANGED'});
  await drain();assert.equal(f.views,before,'background VIEW must not replace the plan after pointerdown');
  assert.equal(typeof release,'function');assert.equal(f.nativePending.at(-1),false);
  let dispatches=0;f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_DISPATCH_CURRENT'){dispatches++;return held.promise;}return send(m);};
  const action=f.nav.onDispatch(sameCurrentCommand());release();await drain();
  assert.equal(dispatches,1);assert.equal(f.views,before);assert.equal(f.nativePending.at(-1),true);
  held.resolve({ok:true,state:'already-current'});assert.deepEqual(await action,{state:'already-current'});await drain();
  assert.equal(f.views,before+1);assert.equal(dispatches,1);assert.equal(f.nativePending.at(-1),false);
 }finally{held.resolve({ok:false});f.client.stop();}
});
test('a VIEW already in flight cannot be reserved or bypassed by pointerdown',async()=>{
 const f=await currentDispatchFixture(),held=deferred();try{
  f.setView(()=>held.promise);f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();
  assert.equal(f.nav.onNativeInteractionStart(),null);
  assert.deepEqual(await f.nav.onDispatch(sameCurrentCommand()),{state:'blocked'});
  assert.equal(f.calls.filter(m=>m.type==='HOST_UI_DISPATCH_CURRENT').length,0);
  held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();
 }finally{held.resolve({ok:false});f.client.stop();}
});
test('native pointer hold has a fixed one-second ceiling and never extends a VIEW deadline',async()=>{
 const f=await currentDispatchFixture(),held=deferred();try{
  const before=f.views,release=f.nav.onNativeInteractionStart();f.emit({type:'VAIWL_UI_DATA_CHANGED'});
  await f.advance(999);assert.equal(f.views,before);assert.equal(f.nav.onNativeInteractionStart(),null);
  f.setView(()=>held.promise);await f.advance(1);assert.equal(f.views,before+1);assert.equal(f.nativePending.at(-1),true);
  release();assert.equal(f.views,before+1);
  await f.advance(5999);assert.equal(f.stops,0);await f.advance(1);assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,'read-stopped');
 }finally{held.resolve({ok:false});f.client.stop();}
});
for(const end of ['release','explicit-query','hidden','disconnect','exit'])test('native pointer ownership ends safely on '+end,async()=>{
 const f=await currentDispatchFixture();try{
  const before=f.views,release=f.nav.onNativeInteractionStart();f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.views,before);
  if(end==='release')release();
  if(end==='explicit-query')await f.nav.onProjectionRequest({segment:0,offset:8,limit:8});
  if(end==='hidden'){f.nav.document.visibilityState='hidden';f.focusEvents.dispatchEvent(new Event('visibilitychange'));}
  if(end==='disconnect')f.disconnect();if(end==='exit')f.nav.onExit();
  await drain();const requests=f.calls.length;release();await f.advance(1000);
  assert.equal(f.calls.length,requests,'old release and timer do not start another read');
  assert.equal(f.views,before+(end==='explicit-query'?2:end==='release'?1:0),'explicit read retains the existing dirty follow-up');
  if(end==='hidden'){f.nav.document.visibilityState='visible';f.focusEvents.dispatchEvent(new Event('visibilitychange'));await drain();assert.equal(f.views,before+1);}
 }finally{f.client.stop();}
});
test('old pointer release cannot release a later interaction in the same renderer',async()=>{
 const f=await currentDispatchFixture();try{
  const old=f.nav.onNativeInteractionStart();old();
  const release=f.nav.onNativeInteractionStart(),before=f.views;
  f.emit({type:'VAIWL_UI_DATA_CHANGED'});old();await drain();assert.equal(f.views,before);
  release();await drain();assert.equal(f.views,before+1);
 }finally{f.client.stop();}
});
for(const outcome of ['saved','rejected','timeout','revoked','inflight'])test(`native dispatch drains presentation under the same deadline: ${outcome}`,async()=>{
 const f=await currentDispatchFixture(),send=f.runtime.sendMessage,held=deferred(),packets=[];
 f.runtime.sendMessage=m=>{if(['HOST_UI_SAVE_VIEW','HOST_UI_DISPATCH_CURRENT'].includes(m.type)){packets.push(m);return m.type==='HOST_UI_SAVE_VIEW'?held.promise:Promise.resolve({ok:true,state:'already-current'});}return send(m);};
 f.nav.onViewChange({...resumeLayout(),segment:0,capacities:[['expanded',17]]});
 if(outcome==='inflight')await f.advance(100);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();assert.deepEqual(packets.map(m=>m.type),['HOST_UI_SAVE_VIEW']);
 if(outcome==='timeout')await f.advance(500);
 if(outcome==='revoked')f.disconnect();
 held.resolve({ok:outcome!=='rejected'});const result=await pending;await drain();
 const success=['saved','inflight','rejected','timeout'].includes(outcome);assert.equal(result.state,success?'already-current':'blocked');
 assert.equal(packets.filter(m=>m.type==='HOST_UI_DISPATCH_CURRENT').length,success?1:0);f.client.stop();
});
test('layout changes during the first save must be acknowledged before native dispatch',async()=>{
 const f=await currentDispatchFixture(),send=f.runtime.sendMessage,held=[deferred(),deferred()],packets=[];let saves=0;
 f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_SAVE_VIEW'){packets.push(m);return held[saves++].promise;}if(m.type==='HOST_UI_DISPATCH_CURRENT'){packets.push(m);return Promise.resolve({ok:true,state:'already-current'});}return send(m);};
 f.nav.onViewChange({...resumeLayout(),segment:0,scroll:10});const pending=f.nav.onDispatch(sameCurrentCommand());await drain();
 f.nav.onViewChange({...resumeLayout(),segment:0,scroll:20});held[0].resolve({ok:true});await drain();
 assert.deepEqual(packets.map(m=>m.type),['HOST_UI_SAVE_VIEW','HOST_UI_SAVE_VIEW']);assert.equal(packets[1].view.scroll,20);
 held[1].resolve({ok:true});assert.equal((await pending).state,'already-current');assert.equal(packets.at(-1).type,'HOST_UI_DISPATCH_CURRENT');f.client.stop();
});
test('same-target current plan is issued with frame grant and dispatch uses only owner tuple',async()=>{
 const f=await currentDispatchFixture(),issued=f.nav.adapter.navigationPlan({id:sameCurrentId});assert.deepEqual(issued,{plan:sameCurrentPlan(),targetKey:'current-key',uiGrantId:'grant',mountId:'mount'});
 const send=f.runtime.sendMessage,packets=[];f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?(packets.push(m),Promise.resolve({ok:true,state:'already-current'})):send(m);
 assert.deepEqual(await f.nav.onDispatch(sameCurrentCommand()),{state:'already-current'});assert.deepEqual(packets,[{v:1,type:'HOST_UI_DISPATCH_CURRENT',grantId:'grant',mountId:'mount',actionId:'current-action',planRevision:4,targetKey:'current-key'}]);f.client.stop();
});
for(const bad of ['no-current','different-current-id','different-current-url','different-target-id','extra-plan','extra-target','bad-epoch','missing-proof','project'])test('same-target projection rejects '+bad,async()=>{
 const f=fixture(),plan=sameCurrentPlan(),current={nativeUrl:sameCurrentURL,refId:sameCurrentId,projectId:null},item={refId:sameCurrentId,plan,targetKey:'current-key'};
 if(bad==='different-current-id')current.refId='other';if(bad==='different-current-url')current.nativeUrl='https://chatgpt.com/c/44444444-4444-4444-8444-444444444444';if(bad==='different-target-id')plan.target.nativeId='other';if(bad==='extra-plan')plan.extra=true;if(bad==='extra-target')plan.target.extra=true;if(bad==='bad-epoch')plan.planRevision=0;if(bad==='missing-proof')delete plan.bodyProofId;if(bad==='project'){delete item.refId;item.projectId=sameCurrentId;}
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),...(bad==='no-current'?{}:{current}),groups:{items:[{id:sameCurrentId}]}},navigation:[item]}));await f.client.start();await drain();assert.equal(f.pages.length,1);assert.equal(f.states.at(-1).state,'ready');assert.equal(f.nav.adapter.navigationPlan({id:sameCurrentId}),undefined);f.client.stop();
});
test('current dispatch rejects unissued tuple without sending an owner request',async()=>{
 const f=await currentDispatchFixture();const count=f.calls.length;
 for(const patch of [{uiGrantId:'other'},{mountId:'other'},{planRevision:5},{targetKey:'other'},{extra:true}])assert.equal((await f.nav.onDispatch({...sameCurrentCommand(),...patch})).state,'blocked');
 assert.equal(f.calls.length,count);f.client.stop();
});
for(const result of [{ok:true,state:'dispatched'},{ok:true},{ok:false,state:'already-current'},{state:'already-current'},null])test('current dispatch does not turn unconfirmed reply into success '+JSON.stringify(result),async()=>{
 const f=await currentDispatchFixture(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?Promise.resolve(result):send(m);assert.notEqual((await f.nav.onDispatch(sameCurrentCommand())).state,'already-current');f.client.stop();
});
for(const change of ['stop','scope-change','expired','deadline'])test('late same-target success remains fenced after '+change,async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:m.type==='HOST_UI_RENEW'&&change==='scope-change'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'replacement-scope'}}):send(m);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();if(change==='stop')f.client.stop();if(change==='scope-change')await f.advance(10000);if(change==='expired')f.jump(21000);if(change==='deadline')f.jump(6001);
 held.resolve({ok:true,state:'already-current'});assert.notEqual((await pending).state,'already-current');f.client.stop();
});
test('ordinary href plan remains browser-default-only and cannot use current dispatch',async()=>{
 const f=fixture(),plan={mode:'href',target:sameCurrentPlan().target,disposition:'new-tab-preserve-current'};f.setView(async()=>({ok:true,state:'ready',page:f.page(),navigation:[{refId:sameCurrentId,plan,targetKey:'current-key'}]}));await f.client.start();await drain();assert.deepEqual(f.nav.adapter.navigationPlan({id:sameCurrentId}).plan,plan);const before=f.calls.length;assert.equal((await f.nav.onDispatch(sameCurrentCommand())).state,'blocked');assert.equal(f.calls.length,before);f.client.stop();
});


test('trusted return lifecycle preserves resumed nonzero query and scroll in an unchanged current session',async()=>{
 const f=fixture(),session={H:30,T:20740,Z:'UTC',policyRevision:2};
 const query={segment:0,offset:32,limit:8,groupId:'project',list:'old',rowOffset:17,rowLimit:17};
 const view={segment:0,oldOpen:['project'],sidebarOpen:[],capacities:[],scroll:566,sidebarScroll:0,sidebarVisible:true};
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:5,viewSession:session},navigation:[]}));
 const send=f.runtime.sendMessage;
 f.runtime.sendMessage=m=>{
  if(m.type==='HOST_UI_RESUME')return Promise.resolve({ok:true,resume:{query,view}});
  if(m.type==='HOST_UI_CURRENT_ENTRY'){f.calls.push(m);return Promise.resolve({ok:true,segment:0,workspaceRevision:5,viewSession:{...session}});}
  return send(m);
 };
 await f.client.start();await drain();
 assert.deepEqual(f.restoredViews,[view]);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,query);
 f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});await drain();
 assert.equal(f.calls.filter(m=>m.type==='HOST_UI_CURRENT_ENTRY').length,1);
 assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,query);
 f.nav.onViewChange(view);await f.advance(100);
 const saved=f.calls.filter(m=>m.type==='HOST_UI_SAVE_VIEW').at(-1);assert.deepEqual(saved.expectedQuery,query);assert.equal(saved.view.scroll,566);f.client.stop();
});

test('trusted return lifecycle resets nonzero page only when current session fields change',async()=>{
 for(const patch of [{H:14},{T:20741},{Z:'Asia/Shanghai'},{policyRevision:3}]){
  const f=await currentEntryFixture(),send=f.runtime.sendMessage,next={H:30,T:20740,Z:'UTC',policyRevision:2,...patch};
  await f.nav.onProjectionRequest({segment:0,offset:32,limit:8});
  f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_CURRENT_ENTRY'){f.setSession(next);return Promise.resolve({ok:true,segment:0,workspaceRevision:5,viewSession:next});}return send(m);};
  f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});await drain();
  assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,{segment:0,offset:0,limit:8},JSON.stringify(patch));f.client.stop();
 }
});

test('late unchanged current-entry response cannot overwrite newer current-page intent',async()=>{
 const f=await currentEntryFixture(),held=deferred(),send=f.runtime.sendMessage;
 await f.nav.onProjectionRequest({segment:0,offset:32,limit:8});
 f.runtime.sendMessage=m=>m.type==='HOST_UI_CURRENT_ENTRY'?held.promise:send(m);
 f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});await drain();
 const later={segment:0,offset:16,limit:8};await f.nav.onProjectionRequest(later);
 const views=f.views;held.resolve({ok:true,segment:0,workspaceRevision:5,viewSession:{H:30,T:20740,Z:'UTC',policyRevision:2}});await drain();
 assert.equal(f.views,views);assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,later);f.client.stop();
});

test('pending VIEW blocks old native tuple until the newest response settles',async()=>{const f=await currentDispatchFixture(),held=deferred();f.setView(()=>held.promise);const reading=f.nav.onProjectionRequest({segment:0,offset:8});await drain();const count=f.calls.length;assert.equal(f.nativePending.at(-1),true);assert.deepEqual(await f.nav.onDispatch(sameCurrentCommand()),{state:'blocked'});assert.equal(f.calls.length,count);held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await reading;assert.equal(f.nativePending.at(-1),false);f.client.stop();});
for(const terminal of ['success','failure','timeout','disconnect','scope-change','renew'])test('dispatch coalesces role VIEW and releases safely at '+terminal,async()=>{const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:m.type==='HOST_UI_RENEW'&&terminal==='scope-change'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'other'}}):send(m);if(terminal==='renew'||terminal==='scope-change')f.jump(9000);const before=f.views,pending=f.nav.onDispatch(sameCurrentCommand());await drain();for(let i=0;i<20;i++)f.emit({type:'VAIWL_UI_DATA_CHANGED'});await f.nav.onProjectionRequest({segment:0,offset:8});await f.nav.onProjectionRequest({segment:0,offset:16});assert.equal(f.views,before);assert.equal(f.nativePending.at(-1),true);assert.deepEqual(await f.nav.onDispatch(sameCurrentCommand()),{state:'blocked'});
 if(terminal==='disconnect')f.disconnect();if(terminal==='scope-change'||terminal==='renew')await f.advance(1000);if(terminal==='timeout')await f.advance(6000);held.resolve(terminal==='failure'?{ok:false}:{ok:true,state:'already-current'});await pending;await drain();if(['disconnect','scope-change'].includes(terminal)){assert.equal(f.views,before);assert.equal(f.stops,1);}else{assert.equal(f.views,before+1);assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query.offset,16);assert.equal(f.nativePending.at(-1),false);}f.client.stop();});
test('dispatch scheduling is per role and old VIEW completion cannot unlock its newer generation',async()=>{const a=await currentDispatchFixture(),b=fixture('sidebar');await b.client.start();await drain();const held=deferred(),send=a.runtime.sendMessage;a.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:send(m);const pending=a.nav.onDispatch(sameCurrentCommand()),before=b.views;b.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(b.views,before+1);assert.equal(a.nativePending.at(-1),true);held.resolve({ok:true,state:'already-current'});await pending;const old=deferred(),fresh=deferred();let count=0;a.setView(()=>++count===1?old.promise:fresh.promise);const p=a.nav.onProjectionRequest({offset:8}),q=a.nav.onProjectionRequest({offset:16});old.resolve({ok:true,state:'ready',page:a.page(),navigation:[]});await p;assert.equal(a.nativePending.at(-1),true);fresh.resolve({ok:true,state:'ready',page:a.page(),navigation:[]});await q;assert.equal(a.nativePending.at(-1),false);a.client.stop();b.client.stop();});

// Four real owners: frame scheduling -> worker registry -> content plan -> native action.
// The native-reading hook causes the same invalidation that raced the CI33 click.
import {createHostCurrentNavigation} from '../../src/runtime/host-current-navigation.mjs';
import {createFrameNativePlans} from '../../src/host/frame-native-plans.mjs';
import {createNativeActions} from '../../src/host/native-actions.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
for(const revoke of [false,true])test('actual native authorization survives queued VIEW but never scope revocation '+revoke,async()=>{
 const f=fixture();let helper,clicks=0,authorizations=0,live=true;
 const context={scope:{key:'A'},scopeGrantId:'scope',role:'workspace',binding:{documentToken:'doc',producerToken:'producer',routeEpoch:1},parentFrame:{tabId:1,frameId:0,documentId:'parent',actualURL:'https://chatgpt.com/'},isCurrent:()=>live};
 const owner=createHostCurrentNavigation({ui:{withScope:async(_,fn)=>fn(context)},observations:{withCurrent:()=>{throw Error('no body proof');}},bridge:({command})=>helper.activate({command,expiresAt:new Date(7000).toISOString()}),elapsedNow:()=>1000});
 const control={id:'native',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'conversation'},node={isConnected:true,click(){clicks++;}};
 const actions=createNativeActions({discovery:{getNode:()=>node},urlPolicy:createURLPolicy(),currentURL:()=>context.parentFrame.actualURL,inputRisk:()=>({state:'clear',flags:[]}),authorize:async command=>{authorizations++;return helper.authorize(command)&&owner.authorize(command,context.parentFrame);},beforeDispatch:plan=>helper.beforeDispatch(plan),now:()=>1000});
 helper=createFrameNativePlans({adapter:{...actions,currentURL:()=>context.parentFrame.actualURL,resolveLoadedTargets:()=>[control]},bindingCurrent:()=> 'binding',captureIntent:()=>()=>true,showNativeReading:()=>{f.emit({type:'VAIWL_UI_DATA_CHANGED'});if(revoke){live=false;f.disconnect();}return true;},now:()=>1000,elapsedNow:()=>1000});
 f.setView(async()=>{const navigation=helper.plan({targets:[{refId:sameCurrentId,navigationURL:sameCurrentURL}]});owner.register({context,grantId:'grant',mountId:'mount',navigation});return {ok:true,state:'ready',page:f.page(),navigation};});
 const send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_NATIVE'?owner.handle(m,'owned'):send(m);
 await f.client.start();await drain();const issued=f.nav.adapter.navigationPlan({id:sameCurrentId}),before=f.views;
 const result=await f.nav.onDispatch({actionId:'one-action',uiGrantId:'grant',mountId:'mount',planRevision:issued.plan.planRevision,targetKey:issued.targetKey});await drain();
 assert.equal(authorizations,2);assert.equal(clicks,revoke?0:1);assert.equal(result.state,revoke?'blocked':'dispatched');assert.equal(f.views,before+(revoke?0:1));f.client.stop();owner.stop();
});

test('search-only project receives its own native plan outside the current card page',async()=>{
 const f=fixture(),{id,nativeUrl,item}=projectPlanFixture(),project={kind:'project',id,nativeName:'Known project',nativeUrl,available:true,freshness:'unknown'};
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),groups:{items:[]},search:{items:[project]}},navigation:[item]}));await f.client.start();await drain();assert.equal(f.pages.length,1);const adapter=f.nav.adapter;assert.equal(adapter.projectNavigationPlan({id}).targetKey,'project-plan');assert.equal(adapter.navigationPlan({id}),undefined);f.disconnect();assert.equal(adapter.projectNavigationPlan({id}),undefined);
});
for(const invalid of ['snippets','membership','duplicate','conflict','foreign-url','wrong-id'])test('search project rejects '+invalid,async()=>{
 const f=fixture(),{id,nativeUrl,item}=projectPlanFixture(),project={kind:'project',id,nativeName:'Known project',nativeUrl,available:true,freshness:'unknown'},groups=[];let items=[project];
 if(invalid==='snippets')project.snippetMatches=[{id:'secret',preview:'text'}];if(invalid==='membership')project.membership='NONE';if(invalid==='duplicate')items.push({...project});if(invalid==='conflict')groups.push({id,nativeName:'Other title',nativeUrl});if(invalid==='foreign-url'){project.nativeUrl='https://evil.test/g/'+id+'/project';item.plan.target.navigationURL=project.nativeUrl;}if(invalid==='wrong-id')item.plan.target.nativeId='other';
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),groups:{items:groups},search:{items}},navigation:[item]}));await f.client.start();await drain();const actionOnly=['foreign-url','wrong-id'].includes(invalid);assert.equal(f.pages.length,actionOnly?1:0);assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,actionOnly?'ready':'read-stopped');if(actionOnly)assert.equal(f.nav.adapter.projectNavigationPlan({id}),undefined);
});

for(const kind of ['backup','recovery','snippets'])test(kind+' return focuses only the fresh workspace unless user intent or lifetime intervenes',async()=>{
 for(const interruption of ['none','pointerdown','keydown','focusin','visibilitychange','stop','no-focus-request']){
  const f=fixture();await f.client.start();await drain();f.nav[kind==='backup'?'onBackupRequest':kind==='snippets'?'onSnippetsRequest':'onRecoveryRequest']();
  const held=deferred();f.setView(()=>held.promise);f[kind][kind==='snippets'?'onClose':'onResume']({restoreFocus:interruption!=='no-focus-request'});await drain();assert.equal(f.panelFocuses,0);
  if(interruption==='stop')f.client.stop();else if(!['none','no-focus-request'].includes(interruption))f.focusEvents.dispatchEvent(new Event(interruption));
  held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert.equal(f.panelFocuses,interruption==='none'?1:0,interruption);
  f.client.stop();
 }
});

for(const failure of ['denied','throw'])test('settled failed resume save is retried only by explicit navigation: '+failure,async t=>{
 const f=await currentDispatchFixture();t.after(()=>f.client.stop());const send=f.runtime.sendMessage,packets=[];let saveOK=false;
 f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_SAVE_VIEW'){packets.push(m);if(failure==='throw'&&!saveOK)return Promise.reject(Error('storage-unavailable'));return Promise.resolve({ok:saveOK});}if(m.type==='HOST_UI_DISPATCH_CURRENT'){packets.push(m);return Promise.resolve({ok:true,state:'already-current'});}return send(m);};
 f.nav.onViewChange({...resumeLayout(),segment:0,scroll:566});await f.advance(100);await f.advance(500);
 f.nav.onViewChange({...resumeLayout(),segment:0,scroll:566});await f.advance(100);assert.equal(packets.length,1,'settled failure and identical repaint must not automatically retry');
 assert.equal((await f.nav.onDispatch(sameCurrentCommand())).state,'already-current');assert.deepEqual(packets.map(m=>m.type),['HOST_UI_SAVE_VIEW','HOST_UI_SAVE_VIEW','HOST_UI_DISPATCH_CURRENT']);
 saveOK=true;assert.equal((await f.nav.onDispatch({...sameCurrentCommand(),actionId:'later-action'})).state,'already-current');
 assert.deepEqual(packets.map(m=>m.type),['HOST_UI_SAVE_VIEW','HOST_UI_SAVE_VIEW','HOST_UI_DISPATCH_CURRENT','HOST_UI_SAVE_VIEW','HOST_UI_DISPATCH_CURRENT']);assert.equal(packets[3].view.scroll,566);
});
test('returning to last saved layout cancels obsolete queued save but supersedes an in-flight save',async t=>{
 const f=await currentDispatchFixture();t.after(()=>f.client.stop());const send=f.runtime.sendMessage,packets=[];let hold=null;
 f.runtime.sendMessage=m=>m.type==='HOST_UI_SAVE_VIEW'?(packets.push(m),hold?.promise??Promise.resolve({ok:true})):send(m);
 const original={...resumeLayout(),segment:0,scroll:10},other={...original,scroll:50};f.nav.onViewChange(original);await f.advance(100);
 f.nav.onViewChange(other);f.nav.onViewChange(original);await f.advance(100);assert.deepEqual(packets.map(m=>m.view.scroll),[10]);
 hold=deferred();f.nav.onViewChange(other);await f.advance(100);f.nav.onViewChange(original);const pending=hold;hold=null;pending.resolve({ok:true});await drain();await f.advance(100);
 assert.deepEqual(packets.map(m=>m.view.scroll),[10,50,10]);
});

test('lost save acknowledgement invalidates old deduplication even when user returns to prior layout',async t=>{
 const f=await currentDispatchFixture();t.after(()=>f.client.stop());const send=f.runtime.sendMessage,saves=[];let ownerScroll=null;
 f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_SAVE_VIEW'){ownerScroll=m.view.scroll;saves.push(ownerScroll);return ownerScroll===50?Promise.reject(Error('ack-lost-after-write')):Promise.resolve({ok:true});}if(m.type==='HOST_UI_DISPATCH_CURRENT'){assert.equal(ownerScroll,10);return Promise.resolve({ok:true,state:'already-current'});}return send(m);};
 const original={...resumeLayout(),segment:0,scroll:10};f.nav.onViewChange(original);await f.advance(100);f.nav.onViewChange({...original,scroll:50});await f.advance(100);
 assert.equal(ownerScroll,50);f.nav.onViewChange(original);assert.equal((await f.nav.onDispatch(sameCurrentCommand())).state,'already-current');assert.deepEqual(saves,[10,50,10]);
});

for(const intent of ['query','return'])for(const same of [false,true])for(const stage of [1,2])test('new explicit '+intent+' cancels native side effect before authorization completes '+same+' stage '+stage,async()=>{
 const gate=deferred(),f=fixture();let helper,clicks=0,shows=0,authorizations=0,live=true;
 const context={scope:{key:'A'},scopeGrantId:'scope',role:'workspace',binding:{documentToken:'doc',producerToken:'producer',routeEpoch:1},parentFrame:{tabId:1,frameId:0,documentId:'parent',actualURL:same?sameCurrentURL:'https://chatgpt.com/'},isCurrent:()=>live};
 const owner=createHostCurrentNavigation({ui:{withScope:async(_,fn)=>fn(context)},observations:{withCurrent:(_,fn)=>fn({scope:context.scope,...context.binding,conversationId:sameCurrentId,guard:()=>true})},bridge:({command,mode})=>mode==='cancel'?helper.cancelAction({command,expiresAt:new Date(7000).toISOString()}):helper.activate({command,expiresAt:new Date(7000).toISOString()}),elapsedNow:()=>1000});
 const control={id:'native',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'conversation'},node={isConnected:true,click(){clicks++;}};
 const actions=createNativeActions({discovery:{getNode:()=>node},urlPolicy:createURLPolicy(),currentURL:()=>context.parentFrame.actualURL,inputRisk:()=>({state:'clear',flags:[]}),bodyProof:()=>same?{conversationId:sameCurrentId,bodyProofId:'proof'}:null,authorize:async command=>{authorizations++;const allowed=helper.authorize(command)&&owner.authorize(command,context.parentFrame);if(authorizations===stage)await gate.promise;return allowed;},beforeDispatch:plan=>helper.beforeDispatch(plan),now:()=>1000});
 helper=createFrameNativePlans({adapter:{...actions,currentURL:()=>context.parentFrame.actualURL,resolveLoadedTargets:()=>[control]},bindingCurrent:()=> 'binding',captureIntent:()=>()=>true,showReading:()=>{shows++;return true;},showNativeReading:()=>{shows++;f.emit({type:'VAIWL_UI_DATA_CHANGED'});return true;},now:()=>1000,elapsedNow:()=>1000});
 f.setView(async()=>{const navigation=helper.plan({targets:[{refId:sameCurrentId,navigationURL:sameCurrentURL}]});owner.register({context,grantId:'grant',mountId:'mount',navigation});return {ok:true,state:'ready',page:{...f.page(),...(same?{current:{nativeUrl:sameCurrentURL,refId:sameCurrentId,projectId:null}}:{})},navigation};});
 const send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_CANCEL_NAVIGATION'?owner.cancelAction(m,'owned'):['HOST_UI_DISPATCH_NATIVE','HOST_UI_DISPATCH_CURRENT'].includes(m.type)?owner.handle(m,'owned'):send(m);
 await f.client.start();await drain();const issued=f.nav.adapter.navigationPlan({id:sameCurrentId}),before=f.views;
 const pending=f.nav.onDispatch({actionId:'one-action',uiGrantId:'grant',mountId:'mount',planRevision:issued.plan.planRevision,targetKey:issued.targetKey});await drain();assert.equal(authorizations,stage);if(intent==='query')await f.nav.onProjectionRequest({segment:0,offset:16});else f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});assert.equal(f.views,before);await drain();gate.resolve();const result=await pending;await drain();
 assert.equal(clicks,0,'superseded action must not click native control');assert.equal(shows,!same&&stage===2?1:0,'only the native preparation preceding the second authorization may have occurred');assert.equal(result.state,'blocked');if(intent==='query')assert.equal(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query.offset,16);f.client.stop();owner.stop();
});

for(const kind of ['backup','recovery'])test('latest queued query survives '+kind+' while native dispatch settles',async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:send(m);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();const latest={segment:0,offset:16,limit:8};await f.nav.onProjectionRequest(latest);f.nav[kind==='backup'?'onBackupRequest':'onRecoveryRequest']();held.resolve({ok:false});await pending;await drain();f[kind].onResume();await drain();assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').at(-1).query,latest);f.client.stop();
});
test('snippet list opened during native dispatch waits for its real preparation',async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:send(m);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();const before=f.views;f.nav.onSnippetsRequest();let outcome='pending';const listing=f.snippets.request({type:'HOST_UI_SNIPPET_LIST'}).then(()=>outcome='ready',()=>outcome='failed');await drain();assert.equal(outcome,'pending');held.resolve({ok:false});await pending;await listing;assert.equal(outcome,'ready');assert.equal(f.views,before+1);assert.equal(f.calls.filter(m=>m.type==='HOST_UI_SNIPPET_LIST').length,1);f.client.stop();
});
for(const kind of ['backup','recovery','snippets'])test(kind+' return keeps focus restoration until pending native dispatch completes',async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:send(m);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();f.nav[kind==='backup'?'onBackupRequest':kind==='snippets'?'onSnippetsRequest':'onRecoveryRequest']();f[kind][kind==='snippets'?'onClose':'onResume']({restoreFocus:true});await drain();assert.equal(f.panelFocuses,0);held.resolve({ok:false});await pending;await drain();assert.equal(f.panelFocuses,1);f.client.stop();
});

for(const interruption of ['focusin','disconnect','deadline'])test('pending panel return respects '+interruption,async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:send(m);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();const before=f.views;f.nav.onBackupRequest();f.backup.onResume({restoreFocus:true});await drain();
 if(interruption==='focusin')f.focusEvents.dispatchEvent(new Event('focusin'));if(interruption==='disconnect')f.disconnect();if(interruption==='deadline')await f.advance(6000);
 held.resolve({ok:false});await pending;await drain();assert.equal(f.panelFocuses,interruption==='deadline'?1:0);assert.equal(f.views,before+(interruption==='disconnect'?0:1));f.client.stop();
});
test('closing snippets during the dispatch wait cannot issue a stale list request',async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:send(m);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();f.nav.onSnippetsRequest();const listing=f.snippets.request({type:'HOST_UI_SNIPPET_LIST'});const rejected=assert.rejects(listing,/snippet-unavailable/);f.snippets.onClose();held.resolve({ok:false});await pending;await rejected;await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_UI_SNIPPET_LIST').length,0);f.client.stop();
});

test('panel return survives same-authority renewal while dispatch settles',async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:send(m);f.jump(9000);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();const before=f.views;f.nav.onBackupRequest();f.backup.onResume({restoreFocus:true});await f.advance(1000);held.resolve({ok:false});await pending;await drain();assert.equal(f.views,before+1);assert.equal(f.panelFocuses,1);f.client.stop();
});

for(const changed of [false,true])test('panel fresh read fences scope changes but permits renewal '+changed,async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.jump(9000);f.nav.onBackupRequest();f.setView(()=>held.promise);
 f.runtime.sendMessage=m=>m.type==='HOST_UI_RENEW'&&changed?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'other'}}):send(m);
 f.backup.onResume({restoreFocus:true});await drain();await f.advance(1000);held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert.equal(f.panelFocuses,changed?0:1);f.client.stop();
});

for(const next of ['backup','recovery','snippets'])test('superseded panel return does not compete with '+next,async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:send(m);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();f.nav.onBackupRequest();f.backup.onResume({restoreFocus:true});await drain();
 f.nav[next==='backup'?'onBackupRequest':next==='recovery'?'onRecoveryRequest':'onSnippetsRequest']();const before=f.views;
 f[next][next==='snippets'?'onClose':'onResume']({restoreFocus:true});await drain();held.resolve({ok:false});await pending;await drain();assert.equal(f.views,before+1);assert.equal(f.panelFocuses,1);f.client.stop();
});

test('opening a newer snippet panel retires the older pending return read',async()=>{
 const f=await currentDispatchFixture(),held=deferred(),send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_CURRENT'?held.promise:send(m);
 const pending=f.nav.onDispatch(sameCurrentCommand());await drain();f.nav.onBackupRequest();f.backup.onResume({restoreFocus:true});await drain();f.nav.onSnippetsRequest();const before=f.views;held.resolve({ok:false});await pending;await drain();assert.equal(f.views,before);assert.equal(f.panelFocuses,0);
 await f.snippets.request({type:'HOST_UI_SNIPPET_LIST'});assert.equal(f.views,before+1);f.snippets.onClose({restoreFocus:true});await drain();assert.equal(f.panelFocuses,1);f.client.stop();
});

for(const ending of ['return','timeout','disconnect'])test('late recovery status releases unused plans only under current authority '+ending,async()=>{
 const f=fixture(),held=deferred(),send=f.runtime.sendMessage,releases=[];f.runtime.sendMessage=m=>m.type==='HOST_UI_RECOVERY_STATUS'?held.promise:m.type==='HOST_UI_RECOVERY_RELEASE'?(releases.push(m),Promise.resolve({ok:true})):send(m);
 await f.client.start();await drain();f.nav.onRecoveryRequest();const pending=f.recovery.request({v:1,type:'HOST_UI_RECOVERY_STATUS'});const rejection=assert.rejects(pending);await drain();
 if(ending==='return')f.recovery.onResume();else if(ending==='timeout')await f.advance(6000);else f.disconnect();
 held.resolve({ok:true,plans:{workspace:{planId:'work_plan'},native:{planId:'native_plan'},evidence:{planId:null}}});await rejection;await drain();assert.equal(releases.length,ending==='disconnect'?0:1);if(releases.length)assert.deepEqual(releases[0],{v:1,type:'HOST_UI_RECOVERY_RELEASE',planIds:['work_plan','native_plan'],grantId:'grant',mountId:'mount'});f.client.stop();
});

for(const outcome of ['success','denied','timeout'])test(`in-flight read keeps a queued refresh behind the horizon owner: ${outcome}`,async()=>{
 const f=fixture(),old={H:30,T:20740,Z:'UTC',policyRevision:0},prior=deferred(),mutation=deferred();let revision=5,session=old,reads=0,writes=0;
 const ready=()=>({ok:true,state:'ready',page:{...f.page(),workspaceRevision:revision,viewSession:session},navigation:[]});
 f.setView(async()=>{reads++;return ready();});await f.client.start();await drain();
 f.setView(async()=>{reads++;return prior.promise;});f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();
 const send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_SET_HORIZON'?(writes++,mutation.promise):send(m);
 const job=f.nav.onHorizonRequest({H:7,segment:0,anchorRefId:null});await drain();
 f.emit({type:'VAIWL_UI_DATA_CHANGED'});const before=reads,oldPage=ready();
 f.setView(async()=>{reads++;return ready();});prior.resolve(oldPage);await drain();
 assert.equal(reads,before,'a background read may not start a successor while a preference mutation owns the view');
 if(outcome==='success'){revision=6;session={...old,H:7,policyRevision:1};mutation.resolve({ok:true,segment:0,viewSession:session,workspaceRevision:revision});}
 else if(outcome==='denied')mutation.resolve({ok:false,reason:'revision-conflict'});
 else await f.advance(6000);
 const result=await job;await drain();assert.equal(writes,1);assert.equal(result.ok,outcome==='success');
 if(outcome==='denied')assert.equal(result.reason,'revision-conflict');
 assert.equal(reads,before+1,'success refresh or preserved dirty hint settles in one fresh read');
 assert.equal(f.pages.at(-1).viewSession.H,outcome==='success'?7:30);
 if(outcome==='timeout'){const settledReads=reads,settledPages=f.pages.length;mutation.resolve({ok:true,segment:0,viewSession:{...old,H:7,policyRevision:1},workspaceRevision:6});await drain();assert.equal(reads,settledReads);assert.equal(f.pages.length,settledPages);assert.equal(writes,1);}
 f.client.stop();
});

test('ready VIEW sends received receipt and only renderer callback sends DOM receipt',async()=>{
 const f=fixture();f.setView(async()=>({ok:true,state:'ready',deliveryId:7,page:f.page(),navigation:[]}));
 await f.client.start();await drain();
 const receipts=()=>f.calls.filter(m=>m.type==='HOST_UI_VIEW_RECEIPT');
 assert.deepEqual(receipts().map(m=>m.phase),['received']);
 f.nav.onFrameRendered(f.pages[0],{cards:0,rows:1});await drain();
 assert.deepEqual(receipts().map(m=>m.phase),['received','rendered']);assert.equal(receipts()[1].deliveryId,7);
 const callback=f.nav.onFrameRendered,page=f.pages[0];f.client.stop();callback(page,{cards:0,rows:1});await drain();assert.equal(receipts().length,2);
});

for(const phase of ['preparing','error'])test('owner source withdrawal clears old rows but retains the live frame: '+phase,async()=>{
 const f=fixture();await f.client.start();await drain();assert.equal(f.pages.length,1);
 f.setView(async()=>phase==='preparing'?{ok:true,state:'preparing',retryAfterMs:50,clearProjection:true}:{ok:false,reason:'request-timeout',clearProjection:true});
 f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.invalidations,1);assert.equal(f.stops,0);
 if(phase==='preparing'){f.setView(async()=>({ok:false,reason:'request-timeout',clearProjection:true}));await f.advance(50);assert.equal(f.invalidations,1);}
 assert.equal(f.states.at(-1).state,'read-stopped');assert.equal(f.stops,0);f.client.stop();
});
test('ordinary preparing and timeout retain lawful prior projection',async()=>{
 const f=fixture();await f.client.start();await drain();f.setView(async()=>({ok:true,state:'preparing',retryAfterMs:50}));f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.invalidations,0);
 f.setView(async()=>({ok:false,reason:'request-timeout'}));await f.advance(50);assert.equal(f.invalidations,0);assert.equal(f.stops,0);f.client.stop();
});

function expiringNavigationFixture(){
 const f=fixture(),id='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+id;
 const control={id:'handle',documentToken:'document',routeEpoch:0,regionEpoch:0,controlKind:'conversation'};
 const target={kind:'resolved',entity:'conversation',nativeId:id,navigationURL:url,liveHandle:control};
 let revisions=0,answer=null;const send=f.runtime.sendMessage;
 const context={scope:{key:'A'},scopeGrantId:'scope',role:'workspace',binding:{documentToken:'document',producerToken:'producer',routeEpoch:0},parentFrame:{tabId:1,frameId:0,documentId:'parent',actualURL:'https://chatgpt.com/'},isCurrent:()=>f.stops===0};
 const registry=createHostCurrentNavigation({ui:{withScope:async(args,fn)=>fn(context)},observations:{withCurrent:async()=>{throw Error('unexpected-body-read');}},bridge:async()=>({state:'dispatched'}),elapsedNow:()=>Date.parse(f.grant().expiresAt)-20000});
 f.setView(async()=>({ok:true,state:'ready',deliveryId:f.views,page:f.page(),navigation:[]}));
 f.runtime.sendMessage=m=>{
  if(m.type==='HOST_UI_NAVIGATION_PLANS'){
   f.calls.push(m);const n=++revisions;
   if(answer)return answer(m,n);
   const hrefId='44444444-4444-4444-8444-444444444444';
   const navigation=[{refId:id,targetKey:'key_'+n,plan:{mode:'native-control',target,control,planRevision:n}},{refId:hrefId,targetKey:'href',plan:{mode:'href',planRevision:n,disposition:'new-tab-preserve-current',target:{kind:'resolved',entity:'conversation',nativeId:hrefId,navigationURL:'https://chatgpt.com/c/'+hrefId,liveHandle:null}}}];
   registry.register({context,grantId:'grant',mountId:'mount',navigation:navigation.filter(item=>item.plan.mode==='native-control')});
   return Promise.resolve({ok:true,deliveryId:m.deliveryId,navigation});
  }
  if(m.type==='HOST_UI_DISPATCH_NATIVE'){f.calls.push(m);return registry.handle(m,'owned');}
  return send(m);
 };
 return {f,id,get revisions(){return revisions;},setAnswer(value){answer=value;},issued:()=>f.nav.adapter.navigationPlan({id})};
}
test('delegated navigation renews current delivery independently of VIEW and authority keepalive',async()=>{
 const x=expiringNavigationFixture(),{f}=x;await f.client.start();await drain();assert.equal(x.revisions,1);
 const page=f.pages.at(-1);
 for(let i=0;i<4;i++)await f.advance(10000);
 assert.equal(x.revisions,3);assert.equal(f.views,1);assert.equal(f.factories,1);assert.equal(f.invalidations,0);assert.equal(f.pages.at(-1),page);
 assert(f.calls.filter(m=>m.type==='HOST_UI_NAVIGATION_PLANS').every(m=>m.deliveryId===1));
 const issued=x.issued();assert.equal(issued.plan.planRevision,3);
 assert.deepEqual(await f.nav.onDispatch({actionId:'action',uiGrantId:issued.uiGrantId,mountId:issued.mountId,planRevision:issued.plan.planRevision,targetKey:issued.targetKey}),{state:'dispatched'});
 f.client.stop();
});
test('delegated navigation refresh waits for pressed control and disables dispatch while replacement is pending',async()=>{
 const x=expiringNavigationFixture(),{f}=x;await f.client.start();await drain();await f.advance(10000);await f.advance(9500);
 const release=f.nav.onNativeInteractionStart();assert.equal(typeof release,'function');const old=x.issued();
 await f.advance(500);assert.equal(x.revisions,1);assert.equal(x.issued(),old);
 const held=deferred();x.setAnswer(()=>held.promise);release();await drain();assert.equal(x.revisions,2);assert.equal(f.nativePending.at(-1),true);
 assert.equal(f.nav.onNativeInteractionStart(),null);
 assert.deepEqual(await f.nav.onDispatch({actionId:'old',uiGrantId:old.uiGrantId,mountId:old.mountId,planRevision:old.plan.planRevision,targetKey:old.targetKey}),{state:'blocked'});
 assert.equal(f.calls.some(m=>m.type==='HOST_UI_DISPATCH_NATIVE'),false);
 held.resolve({ok:true,deliveryId:1,navigation:[]});await drain();assert.equal(f.nativePending.at(-1),false);assert.equal(x.issued(),undefined);assert.equal(f.views,1);f.client.stop();
});
test('failed action refresh retains VIEW without retrying stale delegation',async()=>{
 const x=expiringNavigationFixture(),{f}=x;await f.client.start();await drain();const page=f.pages.at(-1);
 x.setAnswer(()=>Promise.resolve({ok:false,reason:'stale-navigation-delivery'}));
 await f.advance(10000);await f.advance(10000);assert.equal(x.issued(),undefined);assert.equal(f.nav.adapter.navigationPlan({id:'44444444-4444-4444-8444-444444444444'}).plan.mode,'href');assert.equal(f.pages.at(-1),page);assert.equal(f.views,1);assert.equal(f.invalidations,0);assert.equal(f.nativePending.at(-1),false);
 await f.advance(10000);await f.advance(10000);assert.equal(x.revisions,2);f.client.stop();
});
test('late action refresh cannot replace newer VIEW or revive revoked frame',async()=>{
 for(const revoke of [false,true]){
  const x=expiringNavigationFixture(),{f}=x;await f.client.start();await drain();const held=deferred();x.setAnswer(()=>held.promise);
  await f.advance(10000);await f.advance(10000);
  if(revoke)f.disconnect();else{x.setAnswer(null);f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(x.issued().plan.planRevision,3);}
  const count=f.pages.length;held.resolve({ok:true,deliveryId:1,navigation:[]});await drain();assert.equal(f.pages.length,count);
  if(revoke)assert.equal(x.issued(),undefined);else assert.equal(x.issued().plan.planRevision,3);
  f.client.stop();
 }
});
test('hidden surface does not refresh action capabilities and reappearance uses fresh VIEW',async()=>{
 const x=expiringNavigationFixture(),{f}=x;await f.client.start();await drain();
 f.emit({type:'VAIWL_UI_SURFACE_STATE',revision:1,visible:false});
 await f.advance(10000);await f.advance(10000);assert.equal(x.revisions,1);
 f.emit({type:'VAIWL_UI_SURFACE_STATE',revision:2,visible:true});await drain();assert.equal(f.views,2);assert.equal(x.revisions,2);f.client.stop();
});


test('authority renewal cannot retire the one-second pressed-control hold before action refresh',async()=>{
 const x=expiringNavigationFixture(),{f}=x,first=deferred();f.setView(()=>first.promise);
 await f.client.start();await drain();await f.advance(500);
 first.resolve({ok:true,state:'ready',deliveryId:1,page:f.page(),navigation:[]});await drain();assert.equal(x.revisions,1);
 await f.advance(9500);await f.advance(9900);
 const release=f.nav.onNativeInteractionStart();assert.equal(typeof release,'function');
 await f.advance(100); // Same scope/document renewal creates a new grant object.
 await f.advance(500); // Plans are due; the physical press is only 600ms old.
 assert.equal(x.revisions,1);assert.equal(x.issued().plan.planRevision,1);
 release();await drain();assert.equal(x.revisions,2);assert.equal(f.views,1);f.client.stop();
});

test('sidebar reannounces its intrinsic size when the parent confirms visibility after grant join',async()=>{
 const classes=names=>({contains:name=>names.includes(name)});
 const row={hidden:false,classList:classes([]),getBoundingClientRect:()=>({height:40})};
 const panel={hidden:false,classList:classes([]),getBoundingClientRect:()=>({height:200}),children:[{hidden:false,classList:classes(['themes']),children:[row]}, {hidden:false,classList:classes(['sidebar-footer']),getBoundingClientRect:()=>({height:40})}]};
 const f=fixture('sidebar',options=>createFreeFrameClient({...options,
  document:{...options.document,defaultView:{...options.document.defaultView,getComputedStyle:()=>({marginTop:'0',marginBottom:'0'})}},
  navigationFactory:args=>({...options.navigationFactory(args),roots:()=>({sidebar:{shadow:{querySelector:()=>panel}}})})}));
 await f.client.start();await drain();await f.advance(0);
 const sizes=()=>f.parentMessages.filter(p=>p.message.type==='VAIWL_UI_INTRINSIC_SIZE');
 assert.equal(sizes().length,1);
 // Parent may reject the first hint while confirmParent is still resolving.
 f.emit({type:'VAIWL_UI_SURFACE_STATE',revision:1,visible:true});await drain();await f.advance(0);
 assert.equal(sizes().length,2);assert.equal(sizes()[1].message.height,sizes()[0].message.height);
 f.emit({type:'VAIWL_UI_SURFACE_STATE',revision:1,visible:true});await f.advance(0);
 assert.equal(sizes().length,2,'stale receipt does not create a retry loop');
 f.disconnect();f.emit({type:'VAIWL_UI_SURFACE_STATE',revision:2,visible:true});await f.advance(0);assert.equal(sizes().length,2);
});

test('current row reveal publishes expanded flow height before its bounded coordinates',async()=>{
 let height=200;const panel={hidden:false,classList:{contains:()=>false},getBoundingClientRect:()=>({height})};
 const f=fixture('sidebar',options=>createFreeFrameClient({...options,
  document:{...options.document,defaultView:{...options.document.defaultView,getComputedStyle:()=>({marginTop:'0',marginBottom:'0'})}},
  navigationFactory:args=>({...options.navigationFactory(args),roots:()=>({sidebar:{shadow:{querySelector:()=>panel}}})})}));
 await f.client.start();await drain();await f.advance(0);f.parentMessages.length=0;
 height=900;f.nav.onSidebarLayout();f.nav.onSidebarReveal({top:800,bottom:834,height:34});
 assert.deepEqual(f.parentMessages.map(p=>p.message),[
  {type:'VAIWL_UI_INTRINSIC_SIZE',role:'sidebar',height:900},
  {type:'VAIWL_UI_REVEAL_ROW',role:'sidebar',top:800,bottom:834}
 ]);
 await f.advance(0);assert.equal(f.parentMessages.length,2,'scheduled size update must not duplicate delivery');
 f.disconnect();const retiredCount=f.parentMessages.length;f.nav.onSidebarReveal({top:800,bottom:834,height:34});assert.equal(f.parentMessages.length,retiredCount);
});

test('restored keyboard focus sizes an expanded native-NAV frame before reveal',async()=>{
 let height=200,focused=true;const panel={hidden:false,classList:{contains:()=>false},getBoundingClientRect:()=>({height})};
 const f=fixture('sidebar',options=>createFreeFrameClient({...options,
  document:{...options.document,hasFocus:()=>focused,defaultView:{...options.document.defaultView,innerHeight:200,getComputedStyle:()=>({marginTop:'0',marginBottom:'0'})}},
  navigationFactory:args=>({...options.navigationFactory(args),roots:()=>({sidebar:{shadow:{querySelector:()=>panel}}})})}));
 const focus=box=>{const event=new Event('focusin');event.composedPath=()=>[{getBoundingClientRect:()=>box}];f.focusEvents.dispatchEvent(event);};
 await f.client.start();await drain();await f.advance(0);f.parentMessages.length=0;
 height=900;f.nav.onSidebarLayout();focus({top:800,bottom:834,height:34});
 assert.deepEqual(f.parentMessages.map(p=>p.message),[
  {type:'VAIWL_UI_INTRINSIC_SIZE',role:'sidebar',height:900},
  {type:'VAIWL_UI_REVEAL_FOCUS',role:'sidebar',top:800,bottom:834}
 ]);
 await f.advance(0);assert.equal(f.parentMessages.length,2);
 for(const box of [{top:800,bottom:901,height:101},{top:-1,bottom:33,height:34},{top:NaN,bottom:40,height:34},{top:20,bottom:20,height:0}])focus(box);
 assert.equal(f.parentMessages.length,2,'invalid or outside natural content cannot request reveal');
 focused=false;focus({top:800,bottom:834,height:34});assert.equal(f.parentMessages.length,2);
 focused=true;f.emit({type:'VAIWL_UI_SURFACE_STATE',revision:1,visible:false});focus({top:800,bottom:834,height:34});assert.equal(f.parentMessages.length,2);
 f.disconnect();const retiredCount=f.parentMessages.length;focus({top:800,bottom:834,height:34});assert.equal(f.parentMessages.length,retiredCount);
});
