import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(){
 let time=1000,elapsed=1000,id=0,bridge,context,adapterOptions,stops=0,planned=0;const presentations=[];const calls=[],listeners=new Set(),events=new Map(),timers=new Map();
 const docEvents=new Map();
 const document={addEventListener:(type,fn)=>{if(!docEvents.has(type))docEvents.set(type,new Set());docEvents.get(type).add(fn);},removeEventListener:(type,fn)=>docEvents.get(type)?.delete(fn),location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 let respond=m=>m.type==='HOST_HELLO'?{binding:binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:binding()}:{ok:true,grants:[]};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);return respond(m);}};
 const options={document,runtime,makeId:()=> 'client',now:()=>time,elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:o=>(adapterOptions=o,{inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false}),surfaceFactory:()=>({}),plansFactory:({bindingCurrent})=>({plan:()=>{assert.ok(bindingCurrent());planned++;return ['plan'];}}),controllerFactory:o=>{bridge=o.bridge;return {start:async c=>{context=c;await bridge.registerMount({handle:{id:'mount',regionEpoch:1}});return {id:'mount'};},stop:()=>{stops++;bridge.revokeMount({mountId:'mount'});},showWorkspace:()=>{presentations.push('workspace');return true;},showReading:()=>{presentations.push('reading');return true;}};}};
 const client=createHostContentSession(options);
 return {presentations,event:(type,extra={})=>{for(const fn of [...(docEvents.get(type)??[])])fn({type,...extra});},handlerCount:()=>['pointerdown','focusin','keydown','wheel','beforetoggle'].reduce((n,type)=>n+(docEvents.get(type)?.size??0),0),allHandlerCount:()=>[...docEvents.values()].reduce((n,set)=>n+set.size,0),setElapsed:n=>elapsed=n,get adapterOptions(){return adapterOptions;},client,options,runtime,document,binding,calls,listeners,events,setResponse:f=>{respond=f;},get bridge(){return bridge;},get context(){return context;},get stops(){return stops;},get planned(){return planned;},async advance(ms){time+=ms;elapsed+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await drain();}};
}
// Real content session; only native DOM adapter and clock are controlled unit doubles.
function restoreFixture(){const f=fixture();let ready=false,checks=0,scrolls=0,result=true,modal=false,reading=true;const client=createHostContentSession({...f.options,controllerFactory:options=>({...f.options.controllerFactory(options),readingGuard:()=>()=>reading}),adapterFactory:()=>({inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>modal,snippetReady:()=>{checks++;return ready;},restoreSnippet:()=>{assert.deepEqual(f.presentations,['reading']);scrolls++;return {ok:result};}})});const replies=[],message={type:'HOST_SNIPPET_RESTORE',documentToken:'doc',producerToken:'producer',routeEpoch:1,scopeGrantId:'scope',ref:{id:'C',nativeUrl:'https://chatgpt.com/c/C'},anchor:{refId:'C',messageId:'M',branchId:'B',text:'selected',bodyHash:'a'.repeat(64)},expiresAt:new Date(7000).toISOString()};return {...f,client,replies,send:()=>[...f.listeners][0](message,{id:'extension'},r=>replies.push(r)),setReady:v=>ready=v,setModal:v=>modal=v,setReading:v=>reading=v,setResult:v=>result=v,get checks(){return checks;},get scrolls(){return scrolls;}};}
test('native reading reveals first and waits for acknowledged body before one scroll',async()=>{const f=restoreFixture();await f.client.start();assert.equal(f.send(),true);assert.deepEqual(f.presentations,['reading']);assert.equal(f.scrolls,0);await f.advance(50);assert.equal(f.scrolls,0);f.setReady(true);await f.advance(50);assert.equal(f.scrolls,1);assert.deepEqual(f.replies,[{ok:true}]);await f.advance(1000);assert.equal(f.scrolls,1);f.client.stop();});
test('unready proof expires within six seconds without scrolling or reopening',async()=>{const f=restoreFixture();await f.client.start();f.send();for(let i=0;i<120;i++)await f.advance(50);assert.equal(f.scrolls,0);assert.deepEqual(f.replies,[{ok:false}]);assert(f.checks<=120);f.setReady(true);await f.advance(1000);assert.equal(f.scrolls,0);assert.equal(f.replies.length,1);f.client.stop();});
for(const kind of ['stop','route'])test('pending proof cannot scroll after '+kind,async()=>{const f=restoreFixture();await f.client.start();f.send();if(kind==='stop')f.client.stop();else f.document.location.href='https://chatgpt.com/c/other';f.setReady(true);await f.advance(50);assert.equal(f.scrolls,0);assert.deepEqual(f.replies,[{ok:false}]);await f.advance(500);assert.equal(f.replies.length,1);f.client.stop();});
test('failed native restore is attempted only once even while command remains live',async()=>{const f=restoreFixture();await f.client.start();f.setReady(true);f.setResult(false);f.send();assert.equal(f.scrolls,1);assert.deepEqual(f.replies,[{ok:false}]);for(let i=0;i<20;i++)await f.advance(50);assert.equal(f.scrolls,1);assert.equal(f.replies.length,1);f.client.stop();});

test('native modal cancels pending proof even when ACK becomes ready, and closing cannot revive scroll',async()=>{const f=restoreFixture();await f.client.start();f.send();assert.equal(f.scrolls,0);f.setModal(true);f.setReady(true);await f.advance(50);assert.equal(f.scrolls,0);assert.deepEqual(f.replies,[{ok:false}]);f.setModal(false);await f.advance(1000);assert.equal(f.scrolls,0);assert.deepEqual(f.replies,[{ok:false}]);assert.deepEqual(f.presentations,['reading']);f.client.stop();});

for(const type of ['pointerdown','focusin','keydown','wheel','beforetoggle'])test('trusted '+type+' cancels pending restore and removes all temporary handlers',async()=>{
 const f=restoreFixture();await f.client.start();f.send();assert.equal(f.handlerCount(),5);
 f.event(type,{isTrusted:true,newState:'open'});assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.handlerCount(),0);
 f.setReady(true);await f.advance(1000);assert.equal(f.scrolls,0);assert.equal(f.replies.length,1);f.client.stop();
});
test('untrusted events and closing toggle do not cancel; success removes handlers',async()=>{
 const f=restoreFixture();await f.client.start();f.send();
 for(const type of ['pointerdown','focusin','keydown','wheel','beforetoggle'])f.event(type,{isTrusted:false,newState:'open'});
 f.event('beforetoggle',{isTrusted:true,newState:'closed'});assert.deepEqual(f.replies,[]);assert.equal(f.handlerCount(),5);
 f.setReady(true);await f.advance(50);assert.equal(f.scrolls,1);assert.deepEqual(f.replies,[{ok:true}]);assert.equal(f.handlerCount(),0);f.client.stop();
});
test('elapsed clock rollback rejects while wall deadline is still valid',async()=>{
 const f=restoreFixture();await f.client.start();f.send();f.setElapsed(900);f.setReady(true);await f.advance(50);
 assert.equal(f.scrolls,0);assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.handlerCount(),0);f.setElapsed(1100);await f.advance(100);assert.equal(f.scrolls,0);f.client.stop();
});
test('expired reading guard terminates command permanently even if reading becomes valid again',async()=>{
 const f=restoreFixture();await f.client.start();f.send();f.setReading(false);f.setReady(true);await f.advance(50);
 assert.equal(f.scrolls,0);assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.handlerCount(),0);f.setReading(true);await f.advance(100);assert.equal(f.scrolls,0);assert.equal(f.replies.length,1);f.client.stop();
});
test('stop removes pending handlers immediately and replacement restore aborts old command once',async()=>{
 const f=restoreFixture();await f.client.start();f.send();assert.equal(f.handlerCount(),5);assert.equal(f.allHandlerCount(),6);f.send();assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.handlerCount(),5);
 f.client.stop();assert.equal(f.handlerCount(),0);assert.equal(f.allHandlerCount(),0);assert.deepEqual(f.replies,[{ok:false},{ok:false}]);f.setReady(true);await f.advance(1000);assert.equal(f.scrolls,0);assert.equal(f.replies.length,2);
});
