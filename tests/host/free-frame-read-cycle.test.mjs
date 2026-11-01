import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
// Use the real frame lifecycle and read budget, with a deterministic runtime and clock.
function fixture(){
 let time=1000,id=0,nav,views=0,stops=0,renderFailure=false;
 const timers=new Map(),listeners=new Set(),messageListeners=new Set(),parentMessages=[],calls=[],pages=[],states=[];
 const element=()=>({children:[],style:{},addEventListener(){},setAttribute(){},append(n){n.parent=this;this.children.push(n);},replaceChildren(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}});
 const body=element(),privateRoot=element();body.append(privateRoot);
 const document={body,createElement:element,defaultView:{parent:{postMessage(message,origin){parentMessages.push({message,origin});}}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(time+20000).toISOString()});
 const page=()=>({protocol:'vaiwl-free-frame/1',role:'workspace',scope:'A',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null});
 let view=async()=>({ok:true,state:'ready',page:page(),navigation:[]});
 const runtime={connect:()=>({onMessage:{addListener:fn=>messageListeners.add(fn),removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},disconnect(){}}),sendMessage:async m=>{calls.push(m);if(m.type==='HOST_UI_VIEW'){views++;return view(m);}return {ok:true,grant:grant()};}};
 const client=createFreeFrameClient({document,privateRoot,runtime,role:'workspace',parentOrigin:'https://chatgpt.com',onState:s=>states.push(s),now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),navigationFactory:options=>{nav=options;return {setNativeNavigationPending(){},invalidate(){},present(){},updateFrameProjection:p=>{if(renderFailure)throw Error('fixture-render-failed');pages.push(p);},stop:()=>{stops++;}};}});
 return {parentMessages,runtime,grant,emit:m=>{for(const fn of [...messageListeners])fn(m);},client,calls,pages,states,privateRoot,page,setView:fn=>{view=fn;},failRender(){renderFailure=true;},jump(ms){time+=ms;},get nav(){return nav;},get stops(){return stops;},get views(){return views;},disconnect:()=>{for(const fn of [...listeners])fn();},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time&&timers.has(key)){timers.delete(key);t.fn();}await drain();}};
}

test('L regression: accepted current ready completes its read even when another invalidation is queued',async()=>{
 const f=fixture();await f.client.start();await drain();assert.equal(f.pages.length,1);
 f.setView(async()=>({ok:true,state:'preparing',retryAfterMs:50}));f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();
 for(let i=0;i<21;i++)await f.advance(1000);
 let accepted=false;f.setView(async()=>{if(!accepted){accepted=true;f.emit({type:'VAIWL_UI_DATA_CHANGED'});return {ok:true,state:'ready',page:f.page(),navigation:[]};}return {ok:true,state:'preparing',retryAfterMs:50};});
 await f.advance(50);assert.equal(f.pages.length,2,'the current-ticket ready was actually accepted and rendered');
 for(let i=0;i<9;i++)await f.advance(1000);
 assert.equal(f.stops,0,'completed read must not lend its earlier deadline to the next queued read');
 for(let i=0;i<20;i++)await f.advance(1000);assert.equal(f.stops,0,'new cycle remains within its own thirty seconds');await f.advance(1000);assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,'read-stopped');assert.equal(f.states.at(-1).reason,'read-budget-exhausted');
});
test('L safety: invalidation and normal renew cannot extend permanently preparing thirty-second read',async()=>{
 const f=fixture();f.setView(async()=>({ok:true,state:'preparing',retryAfterMs:50}));await f.client.start();await drain();for(let i=0;i<30;i++){f.emit({type:'VAIWL_UI_DATA_CHANGED'});await f.advance(1000);}assert.equal(f.pages.length,0);assert.equal(f.states.at(-1).reason,'read-budget-exhausted');assert.equal(f.stops,0);
});
test('L safety: an obsolete ticket late ready is not completion of the current pending query',async()=>{
 const f=fixture();await f.client.start();await drain();const old=deferred();let first=true;f.setView(()=>first?(first=false,old.promise):Promise.resolve({ok:true,state:'preparing',retryAfterMs:50}));f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();
 const fresh=f.nav.onProjectionRequest({segment:3});await drain();old.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();for(let i=0;i<30;i++)await f.advance(1000);await fresh;assert.equal(f.pages.length,1);assert.equal(f.states.at(-1).reason,'read-budget-exhausted');assert.equal(f.stops,0);
});
for(const offset of [0,1])test('L absolute deadline refuses late ready at boundary +'+offset+'ms even with delayed timers',async()=>{
 const f=fixture();f.setView(async()=>({ok:true,state:'preparing',retryAfterMs:50}));await f.client.start();await drain();for(let i=0;i<25;i++)await f.advance(1000);
 const held=deferred();f.setView(()=>held.promise);await f.advance(50);f.jump(4950+offset);held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert.equal(f.pages.length,0);assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,'read-stopped');
});
for(const end of ['stop','scope-replaced','port-revoked'])test('L '+end+' late ready cannot complete or reopen a read cycle',async()=>{
 const f=fixture();await f.client.start();await drain();if(end==='scope-replaced')await f.advance(9000);
 const held=deferred();f.setView(()=>held.promise);f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();
 if(end==='stop')f.client.stop();else if(end==='port-revoked')f.disconnect();else{const send=f.runtime.sendMessage;f.runtime.sendMessage=m=>m.type==='HOST_UI_RENEW'?Promise.resolve({ok:true,grant:{...f.grant(),scopeGrantId:'replacement'}}):send(m);await f.advance(1000);}
 const pages=f.pages.length;held.resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert.equal(f.pages.length,pages);assert.equal(f.stops,1);const calls=f.views;await f.advance(30000);assert.equal(f.views,calls);assert.equal(f.privateRoot.children.length,0);
});
for(const malformed of ['role','protocol','current','presentation','renderer'])test('L dirty ready '+malformed+' failure cannot reopen a read cycle',async()=>{
 const f=fixture();await f.client.start();await drain();const before=f.pages.length;
 f.setView(async()=>{f.emit({type:'VAIWL_UI_DATA_CHANGED'});const result={ok:true,state:'ready',page:f.page(),navigation:[]};if(malformed==='role')result.page.role='sidebar';else if(malformed==='protocol')result.page.protocol='foreign';else if(malformed==='current')result.page.current={nativeUrl:'https://foreign.test/',refId:null,projectId:null};else if(malformed==='navigation')result.navigation=[{refId:'c',plan:{mode:'foreign'},targetKey:'target'}];else if(malformed==='presentation')result.page.presentation={revision:-1,intent:{kind:'show-workspace'}};else f.failRender();return result;});
 f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,'read-stopped');assert.equal(f.pages.length,before+(malformed==='presentation'?1:0));const calls=f.views;await f.advance(30000);assert.equal(f.views,calls);assert.equal(f.privateRoot.children.length,0,'later grant expiry still clears terminal UI');
});
test('L successive accepted dirty ready responses complete separate bounded cycles',async()=>{
 const f=fixture();await f.client.start();await drain();f.setView(async()=>({ok:true,state:'preparing',retryAfterMs:50}));f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();
 for(let cycle=0;cycle<4;cycle++){
  for(let i=0;i<10;i++)await f.advance(1000);let once=false;f.setView(async()=>{if(!once){once=true;f.emit({type:'VAIWL_UI_DATA_CHANGED'});return {ok:true,state:'ready',page:f.page(),navigation:[]};}return {ok:true,state:'preparing',retryAfterMs:50};});await f.advance(50);assert.equal(f.pages.length,cycle+2);assert.equal(f.stops,0);
 }
 for(let i=0;i<30;i++)await f.advance(1000);assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,'read-stopped');assert.equal(f.states.at(-1).reason,'read-budget-exhausted');
});
test('L session-relocation ready must finish its replacement read within the original budget',async()=>{
 const f=fixture(),session={H:30,T:21000,Z:'UTC',policyRevision:0};f.setView(async()=>({ok:true,state:'ready',page:{...f.page(),viewSession:session},navigation:[]}));await f.client.start();await drain();
 f.setView(async()=>({ok:true,state:'preparing',retryAfterMs:50}));f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();for(let i=0;i<21;i++)await f.advance(1000);
 let once=false;f.setView(async()=>{if(!once){once=true;f.emit({type:'VAIWL_UI_DATA_CHANGED'});return {ok:true,state:'ready',page:{...f.page(),viewSession:{...session,H:7}},navigation:[]};}return {ok:true,state:'preparing',retryAfterMs:50};});await f.advance(50);assert.equal(f.pages.length,1);for(let i=0;i<9;i++)await f.advance(1000);assert.equal(f.stops,0);assert.equal(f.states.at(-1).state,'read-stopped');assert.equal(f.states.at(-1).reason,'read-budget-exhausted');
});
