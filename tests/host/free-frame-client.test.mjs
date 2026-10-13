import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
 let time=1000,id=0,navOptions,views=0;const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],calls=[],pages=[],states=[],presented=[];let factories=0,stops=0;
 const element=()=>({children:[],setAttribute(){},append(n){n.parent=this;this.children.push(n);},replaceChildren(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}});
 const body=element(),privateRoot=element();body.append(privateRoot);
 const document={body,createElement:element,defaultView:{parent:{postMessage(){}}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(time+20000).toISOString()});
 const page=()=>({protocol:'vaiwl-free-frame/1',role:'workspace',scope:'A',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null});
 let view=async()=>({ok:true,state:'ready',page:page(),navigation:[]});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){}}),sendMessage:async m=>{calls.push(m);if(m.type==='HOST_UI_VIEW'){views++;return view(m);}return {ok:true,grant:grant()};}};
 const client=createFreeFrameClient({document,privateRoot,runtime,role:'workspace',parentOrigin:'https://chatgpt.com',onState:s=>states.push(s),now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),navigationFactory:options=>{factories++;navOptions=options;return {present:intent=>presented.push(intent),updateFrameProjection:p=>pages.push(p),stop:()=>{stops++;}};}});
 return {runtime,grant,presented,messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},client,calls,pages,states,body,privateRoot,page,setView:fn=>{view=fn;},get nav(){return navOptions;},get factories(){return factories;},get stops(){return stops;},get views(){return views;},disconnect:()=>{for(const fn of [...listeners])fn();},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time&&timers.has(key)){timers.delete(key);t.fn();}await drain();}};
}
test('actual lifecycle composition sends bounded VIEW without role and keeps one renderer across grant renewal',async()=>{const f=fixture();await f.client.start();await drain();assert.equal(f.pages.length,1);assert.deepEqual(f.calls.find(m=>m.type==='HOST_UI_VIEW'),{v:1,type:'HOST_UI_VIEW',grantId:'grant',mountId:'mount',query:{segment:0,offset:0,limit:8}});await f.advance(10000);assert.equal(f.factories,1);assert.equal(f.pages.length,2);assert.equal(f.stops,0);assert.equal(f.body.children[0],f.privateRoot);});
test('preparing is not empty; bounded retry eventually publishes owner page',async()=>{const f=fixture();let n=0;f.setView(async()=>++n===1?{ok:true,state:'preparing',retryAfterMs:50}:{ok:true,state:'ready',page:f.page(),navigation:[]});await f.client.start();await drain();assert.equal(f.pages.length,0);assert.equal(f.states.at(-1).state,'preparing');await f.advance(50);assert.equal(f.pages.length,1);});
test('page query strips role and installs synchronous href plans before returning DTO',async()=>{const f=fixture();await f.client.start();await drain();const id='33333333-3333-4333-8333-333333333333',url=`https://chatgpt.com/c/${id}`;f.setView(async()=>({ok:true,state:'ready',page:f.page(),navigation:[{refId:id,plan:{mode:'href',target:{kind:'resolved',entity:'conversation',nativeId:id,navigationURL:url},disposition:'new-tab-preserve-current'},targetKey:'target'}]}));const result=await f.nav.onProjectionRequest({role:'workspace',segment:2,offset:0,limit:8});assert.equal(result.protocol,'vaiwl-free-frame/1');assert.equal(f.calls.at(-1).query.role,undefined);assert.equal(f.nav.adapter.navigationPlan({id}).plan.target.navigationURL,url);assert.equal(f.nav.adapter.nativeHref('https://evil.test/'),null);});
test('oversize responses halve bounded limit then rowLimit within the same finite read',async()=>{const f=fixture();f.setView(async m=>m.query.limit>1?{ok:false,reason:'free-frame-page-too-large'}:{ok:true,state:'ready',page:f.page(),navigation:[]});await f.client.start();await drain();assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_VIEW').map(m=>m.query.limit),[8,4,2,1]);assert.equal(f.pages.length,1);f.setView(async()=>({ok:false,reason:'free-frame-page-too-large'}));await f.nav.onProjectionRequest({role:'workspace',segment:2,offset:24,limit:1,rowOffset:200,rowLimit:17});const queries=f.calls.filter(m=>m.type==='HOST_UI_VIEW').slice(-2).map(m=>m.query);assert.deepEqual(queries.map(q=>q.rowLimit),[17,5]);assert(queries.every(q=>q.offset===24&&q.segment===2&&q.rowOffset===200));assert.equal(f.stops,1);});
test('disconnect stops navigation synchronously and late ready never renders',async()=>{const f=fixture(),held=deferred();f.setView(()=>held.promise);await f.client.start();await drain();f.disconnect();assert.equal(f.stops,1);assert.equal(f.privateRoot.children.length,0);held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert.equal(f.pages.length,0);});
test('VIEW RPC is limited to six seconds',async()=>{const f=fixture();f.setView(()=>new Promise(()=>{}));await f.client.start();await drain();await f.advance(6000);assert.equal(f.pages.length,0);assert.equal(f.stops,1);assert.equal(f.states.at(-1).state,'failed');});
test('preparing total budget does not restart with renewed grant',async()=>{const f=fixture();f.setView(async()=>({ok:true,state:'preparing',retryAfterMs:50}));await f.client.start();await drain();for(let i=0;i<30;i++)await f.advance(1000);assert.equal(f.pages.length,0);assert.equal(f.stops,1);assert.equal(f.states.at(-1).reason,'read-budget-exhausted');});
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
 assert.equal(f.states.at(-1).reason,'read-budget-exhausted');assert.equal(f.pages.length,0);assert.equal(f.stops,1);
});
test('owner current URL drives adapter matching and is erased on clear or legacy page',async()=>{const f=fixture(),id='33333333-3333-4333-8333-333333333333',nativeUrl='https://chatgpt.com/c/'+id;f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),current:{nativeUrl,refId:id,projectId:null}},navigation:[]}));await f.client.start();await drain();assert.equal(f.nav.adapter.currentURL(),nativeUrl);assert.equal(f.nav.adapter.isCurrent(nativeUrl),true);assert.equal(f.nav.adapter.isCurrent('https://chatgpt.com/'),false);f.setView(async()=>({ok:true,state:'ready',page:f.page(),navigation:[]}));await f.nav.onProjectionRequest({segment:0});assert.equal(f.nav.adapter.currentURL(),'');f.disconnect();assert.equal(f.nav.adapter.isCurrent(nativeUrl),false);});
for(const current of [null,{nativeUrl:'https://evil.test/',refId:null,projectId:null},{nativeUrl:'https://chatgpt.com/',refId:22,projectId:null},{nativeUrl:'https://chatgpt.com/',refId:null,projectId:null,title:'private'}])test('malformed owner current fails closed '+JSON.stringify(current),async()=>{const f=fixture();f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),current},navigation:[]}));await f.client.start();await drain();assert.equal(f.pages.length,0);assert.equal(f.states.at(-1).reason,'invalid-frame-current');});

test('presentation bridge sends current grant and self echo does not erase typed search',async()=>{
 const f=fixture();await f.client.start();await drain();const send=f.runtime.sendMessage,packets=[];
 f.runtime.sendMessage=m=>{if(m.type==='HOST_UI_PRESENT'){packets.push(m);return Promise.resolve({ok:true,presentation:{revision:1,intent:m.intent}});}return send(m);};
 const search={query:'typed native name',projectId:'P1',offset:24,limit:24};await f.nav.onProjectionRequest({segment:0,offset:0,limit:8,search});
 await f.nav.onPresentationRequest({kind:'search-known',themeId:'P1'});await drain();
 assert.deepEqual(packets,[{v:1,type:'HOST_UI_PRESENT',grantId:'grant',mountId:'mount',intent:{kind:'search-known',themeId:'P1'}}]);assert.deepEqual(f.presented,[]);assert.deepEqual(f.calls.at(-1).query.search,search);
 await f.advance(10000);assert.deepEqual(f.calls.at(-1).query.search,search);
 await f.nav.onProjectionRequest({segment:0,offset:0,limit:8});assert.equal(f.calls.at(-1).query.search,undefined);
});
test('shared presentation revisions and identical intent do not repeatedly reset search',async()=>{
 const f=fixture();let presentation={revision:1,intent:{kind:'search-known',themeId:null}};
 f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),presentation},navigation:[]}));await f.client.start();await drain();assert.equal(f.presented.length,1);
 await f.nav.onProjectionRequest({search:{query:'typed',projectId:null,offset:0,limit:24}});presentation={...presentation,revision:2};f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.presented.length,1);
 presentation={revision:1,intent:{kind:'show-workspace'}};f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.presented.length,1);
 presentation={revision:3,intent:{kind:'show-workspace'}};f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.deepEqual(f.presented.at(-1),{kind:'show-workspace'});assert.equal(f.calls.at(-1).query.search,undefined);
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
 const workingSet={offset:24,limit:24};await f.nav.onProjectionRequest({workingSet});await f.advance(10000);assert.deepEqual(f.calls.at(-1).query.workingSet,workingSet);
 presentation={revision:2,intent:{kind:'search-known',themeId:null}};f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.calls.at(-1).query.workingSet,undefined);assert.equal(f.presented.at(-1).kind,'search-known');
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
