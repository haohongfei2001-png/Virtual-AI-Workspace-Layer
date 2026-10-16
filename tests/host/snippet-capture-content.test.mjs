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
// Production content-session and selection ticket; only DOM/adapter/clock are doubles.
function captureFixture(){
 const f=fixture();let ready=false,modal=false,selected=0,epoch='body-epoch';
 const node={isConnected:true,ownerDocument:f.document},range={startContainer:node,endContainer:node,startOffset:0,endOffset:8,toString:()=> 'selected'},selection={rangeCount:1,isCollapsed:false,getRangeAt:()=>range};f.document.getSelection=()=>selection;
 const anchor={refId:'C',messageId:'M',branchId:'B',text:'selected',bodyHash:'a'.repeat(64)};
 const client=createHostContentSession({...f.options,adapterFactory:()=>({inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>modal,snippetReady:()=>ready,selectionEpoch:()=>epoch,selectedSnippet:ref=>{selected++;assert.equal(ready,true);assert.equal(ref.id,'C');return {...anchor};}})});
 const replies=[],message={type:'HOST_SNIPPET_SELECTION',documentToken:'doc',producerToken:'producer',routeEpoch:1,scopeGrantId:'scope',expiresAt:new Date(7000).toISOString(),phase:'capture',ref:{id:'C',nativeUrl:'https://chatgpt.com/c/C'},selectionId:null};
 return {...f,client,anchor,replies,range,node,message,send:(reply=replies,command=message)=>[...f.listeners][0](command,{id:'extension'},r=>reply.push(r)),setReady:v=>ready=v,setModal:v=>modal=v,setEpoch:v=>epoch=v,get selected(){return selected;}};
}
test('capture waits for body ACK and returns one validated anchor without worker writes',async()=>{
 const f=captureFixture();await f.client.start();const before=f.calls.length;assert.equal(f.send(),true);assert.equal(f.selected,0);await f.advance(50);assert.deepEqual(f.replies,[]);
 f.setReady(true);await f.advance(50);assert.deepEqual(f.replies,[{ok:true,selectionId:'client',anchor:f.anchor}]);assert.equal(f.selected,2,'capture and ticket read independently validate selection');assert.equal(f.calls.length,before);assert.equal(f.handlerCount(),0);
 await f.advance(500);assert.equal(f.replies.length,1);assert.equal(f.selected,2);f.client.stop();
});
for(const kind of ['stop','route','modal'])test('capture '+kind+' cancels waiting selection and late ACK cannot capture',async()=>{
 const f=captureFixture();await f.client.start();f.send();assert.equal(f.selected,0);
 if(kind==='stop')f.client.stop();if(kind==='route')f.document.location.href='https://chatgpt.com/c/other';if(kind==='modal')f.setModal(true);
 f.setReady(true);await f.advance(50);assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.selected,0);assert.equal(f.handlerCount(),0);
 f.setModal(false);await f.advance(500);assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.selected,0);f.client.stop();
});
test('new capture cancels old request exactly once and only latest selection obtains ticket',async()=>{
 const f=captureFixture();await f.client.start();const first=[],second=[];f.send(first);f.send(second);assert.deepEqual(first,[{ok:false}]);assert.deepEqual(second,[]);
 f.setReady(true);await f.advance(50);assert.deepEqual(second,[{ok:true,selectionId:'client',anchor:f.anchor}]);assert.equal(f.selected,2);await f.advance(500);assert.equal(first.length,1);assert.equal(second.length,1);f.client.stop();
});
test('six-second capture deadline rejects late proof without capture or worker write',async()=>{
 const f=captureFixture();await f.client.start();const before=f.calls.length;f.send();for(let i=0;i<120;i++)await f.advance(50);
 assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.selected,0);f.setReady(true);await f.advance(50);assert.equal(f.selected,0);assert.equal(f.calls.length,before);assert.equal(f.handlerCount(),0);f.client.stop();
});
test('changed original Range cancels even when ACK arrives in same check',async()=>{
 const f=captureFixture();await f.client.start();f.send();f.range.endOffset=7;f.setReady(true);await f.advance(50);assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.selected,0);f.client.stop();
});

test('capture obeys remaining 100ms worker budget and cannot restart a six-second wait',async()=>{
 const f=captureFixture();await f.client.start();f.send(f.replies,{...f.message,expiresAt:new Date(1100).toISOString()});await f.advance(50);assert.deepEqual(f.replies,[]);await f.advance(50);assert.deepEqual(f.replies,[{ok:false}]);f.setReady(true);await f.advance(500);assert.equal(f.selected,0);assert.equal(f.replies.length,1);f.client.stop();
});
test('capture without expiresAt is refused before selection access',async()=>{
 const f=captureFixture();await f.client.start();const command={...f.message};delete command.expiresAt;f.setReady(true);f.send(f.replies,command);assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.selected,0);f.client.stop();
});
test('validate and release retain their original no-expiresAt contracts',async()=>{
 const f=captureFixture();await f.client.start();f.setReady(true);f.send();assert.equal(f.replies[0].ok,true);
 const command={...f.message,selectionId:f.replies[0].selectionId};delete command.expiresAt;const validated=[],released=[],after=[];
 f.send(validated,{...command,phase:'validate'});assert.deepEqual(validated,[{ok:true,anchor:f.anchor}]);
 f.send(released,{...command,phase:'release'});assert.deepEqual(released,[{ok:true}]);
 f.send(after,{...command,phase:'validate'});assert.deepEqual(after,[{ok:false}]);f.client.stop();
});
