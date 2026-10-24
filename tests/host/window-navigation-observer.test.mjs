import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {installWindowNavigationObserver,createWindowNavigationTraceRecorder} from './window-navigation-observer.mjs';
const tick=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
function fixture({protocol='chrome-extension:',deliver,send,documentId='document-one'}={}){
 const entries=[],events={},timers=[],calls=[],pending=[];let now=10;
 const original=send??function(...args){calls.push({receiver:this,args});let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});pending.push({promise,resolve,reject});return promise;};
 const runtime={sendMessage:original},context=vm.createContext({location:{protocol},chrome:{runtime},crypto:{randomUUID:()=>documentId},performance:{now:()=>now},document:{addEventListener:(type,fn,capture)=>{events[type]={fn,capture};}},setTimeout:(fn,delay)=>{timers.push({fn,delay});},observeWindowReturn:deliver??(entry=>{entries.push(entry);return Promise.resolve();})});
 vm.runInContext(`(${installWindowNavigationObserver.toString()})()`,context);
 return {entries,events,timers,calls,pending,runtime,original,time:value=>{now=value;},fire:(type,event)=>events[type].fn(event),flush:()=>{while(timers.length)timers.shift().fn();}};
}
const link=()=>({disabled:null,connected:true,matches:s=>s==='.search-results a[data-ref-id]',hasAttribute:s=>s==='data-native-plan-control',getAttribute(s){return s==='aria-disabled'?this.disabled:s==='target'?'_self':null;},get isConnected(){return this.connected;}});
const event=node=>({composedPath:()=>[{},node],button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,defaultPrevented:false});

test('observer leaves native documents and unrelated messages untouched',async()=>{
 const native=fixture({protocol:'https:'});assert.equal(native.runtime.sendMessage,native.original);assert.deepEqual(Object.keys(native.events),[]);
 const f=fixture(),message={type:'OTHER',privateValue:'never recorded'},callback=()=>{};const promise=f.runtime.sendMessage(message,callback);assert.equal(promise,f.pending[0].promise);assert.equal(f.calls[0].receiver,f.runtime);assert.deepEqual(f.calls[0].args,[message,callback]);const value={ok:true};f.pending[0].resolve(value);assert.equal(await promise,value);await tick();assert.deepEqual(f.entries,[]);
});
test('VIEW start and completion correlate overlapping requests without replacing promises or results',async()=>{
 const f=fixture(),one={type:'HOST_UI_VIEW',query:{offset:0}},two={type:'HOST_UI_VIEW',query:{offset:24}};
 const a=f.runtime.sendMessage(one);f.time(20);const b=f.runtime.sendMessage(two);assert.equal(a,f.pending[0].promise);assert.equal(b,f.pending[1].promise);assert.equal(f.calls[0].args[0],one);assert.equal(f.calls[1].args[0],two);
 assert.deepEqual(f.entries.map(x=>[x.type,x.requestId,x.requestStartedAt]),[['HOST_UI_VIEW_REQUESTED',1,10],['HOST_UI_VIEW_REQUESTED',2,20]]);
 const ready={ok:true,presentation:'workspace'},preparing={ok:false,reason:'preparing'};f.time(30);f.pending[1].resolve(ready);assert.equal(await b,ready);await tick();f.time(40);f.pending[0].resolve(preparing);assert.equal(await a,preparing);await tick();
 assert.deepEqual(f.entries.slice(2).map(x=>[x.type,x.requestId,x.requestStartedAt,x.requestCompletedAt,x.observedAt]),[['HOST_UI_VIEW',2,20,30,30],['HOST_UI_VIEW',1,10,40,40]]);assert.deepEqual(f.entries.map(x=>x.observationId),[1,2,3,4]);
});
test('pointer and click capture readiness and monotonic time without changing event or scheduling gestures',async()=>{
 const f=fixture(),node=link(),down=event(node);f.fire('pointerdown',down);assert.equal(down.defaultPrevented,false);assert.equal(f.entries[0].type,'SEARCH_LINK_POINTERDOWN');assert.equal(f.events.pointerdown.capture,true);assert.equal(f.events.click.capture,true);
 f.time(15);const click=event(node);f.fire('click',click);assert.equal(click.defaultPrevented,false);assert.equal(f.entries.length,1);assert.equal(f.timers.length,1);assert.equal(f.timers[0].delay,0);
 node.disabled='true';node.connected=false;click.defaultPrevented=true;f.time(50);f.flush();await tick();const recorded=f.entries[1];assert.equal(recorded.type,'SEARCH_LINK_CLICK');assert.equal(recorded.observedAt,15);assert.equal(recorded.ariaDisabled,null);assert.equal(recorded.connected,true);assert.equal(recorded.defaultPrevented,true);assert.equal(recorded.observationId,2);assert.equal(f.calls.length,0);
 f.fire('click',{...event(node),composedPath:()=>[{}]});assert.equal(f.timers.length,0);
});
test('diagnostic throws and rejections cannot change runtime results or consumed click',async()=>{
 for(const deliver of [()=>{throw Error('diagnostic');},()=>Promise.reject(Error('diagnostic'))]){const f=fixture({deliver}),p=f.runtime.sendMessage({type:'HOST_UI_VIEW'});assert.equal(p,f.pending[0].promise);const value={ok:true};f.pending[0].resolve(value);assert.equal(await p,value);const click=event(link());f.fire('click',click);f.flush();await tick();assert.equal(click.defaultPrevented,false);assert.equal(f.calls.length,1);}
 const error=Error('original send failure'),f=fixture({send:()=>{throw error;}});assert.throws(()=>f.runtime.sendMessage({type:'HOST_UI_VIEW'}),value=>value===error);
});
test('other tracked replies keep existing bounded fields and rejected requests stay rejected',async()=>{
 const f=fixture(),message={type:'HOST_UI_DISPATCH_CURRENT',actionId:'action',targetKey:'key'},p=f.runtime.sendMessage(message),value={ok:true,state:'already-current'};assert.equal(p,f.pending[0].promise);f.pending[0].resolve(value);assert.equal(await p,value);await tick();assert.equal(f.entries[0].type,message.type);assert.equal(f.entries[0].actionId,'action');assert.equal(f.entries[0].state,'already-current');assert.equal(f.entries[0].requestId,undefined);
 const q=f.runtime.sendMessage({type:'HOST_UI_VIEW'}),error=Error('original rejection');f.pending[1].reject(error);await assert.rejects(q,value=>value===error);await tick();assert.equal(f.entries.length,2);assert.equal(f.entries[1].type,'HOST_UI_VIEW_REQUESTED');
});
test('receiver distinguishes same-URL frames, preserves document identity and enforces the original400 bound',()=>{
 const report={trace:[],traceDropped:0,phase:'actual-phase'},record=createWindowNavigationTraceRecorder(report),a={url:()=> 'chrome-extension://id/workspace.html'},b={url:()=>a.url()};
 record({frame:a},{observationId:1,documentId:'a-one',phase:'spoof',frame:'spoof',frameId:99});record({frame:b},{observationId:1,documentId:'b-one'});record({frame:a},{observationId:1,documentId:'a-two'});
 assert.deepEqual(report.trace.map(x=>x.frameId),[1,2,1]);assert.deepEqual(report.trace.map(x=>x.documentId),['a-one','b-one','a-two']);assert.equal(report.trace[0].phase,'actual-phase');assert.equal(report.trace[0].frame,a.url());for(let n=3;n<403;n++)record({frame:a},{observationId:n});assert.equal(report.trace.length,400);assert.equal(report.traceDropped,3);
});
test('each init document carries distinct identity while monotonic counters remain local',()=>{
 const a=fixture({documentId:'first-document'}),b=fixture({documentId:'second-document'});a.fire('pointerdown',event(link()));b.fire('pointerdown',event(link()));assert.equal(a.entries[0].documentId,'first-document');assert.equal(b.entries[0].documentId,'second-document');assert.equal(a.entries[0].observationId,1);assert.equal(b.entries[0].observationId,1);
});
test('runner wires the passive observer with fixture hashing and preserves raw gesture/default timeout',()=>{
 const source=readFileSync(new URL('./frame-window-retention-package-browser.mjs',import.meta.url),'utf8');assert.match(source,/sources=\['window-navigation-observer\.mjs'/);assert.match(source,/exposeBinding\('observeWindowReturn',createWindowNavigationTraceRecorder\(report\)\)/);assert.match(source,/addInitScript\(installWindowNavigationObserver\)/);assert.match(source,/setDefaultTimeout\(6000\)/);assert.match(source,/const result=workspace\.locator\(`\.search-results a\[data-ref-id=/);assert.equal((source.match(/await result\.click\(\)/g)??[]).length,1);assert(!source.includes('.and('));
});
