import test from 'node:test';
import assert from 'node:assert/strict';
import {foregroundFailureStates,installLocalStatus,readActiveLocalStatus,validLayoutShape,readActiveLocalLayout} from '../../src/host/local-status.mjs';
const request=()=>({v:1,type:'HOST_LOCAL_STATUS'});
const sender=()=>({id:'extension',url:'chrome-extension://extension/status.html'});
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function listenerFixture(readState=()=> 'ready'){
 const listeners=new Set();let reads=0;
 const runtime={id:'extension',getURL:path=>'chrome-extension://extension/'+path,onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
 const dispose=installLocalStatus({runtime,readState:()=>{reads++;return readState();}});
 return {listeners,dispose,reads:()=>reads,dispatch(message=request(),source=sender()){const replies=[];for(const listener of listeners)listener(message,source,value=>replies.push(value));return replies;}};
}
for(const state of ['ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed','layout-missing-reading','layout-geometry-header-gap','unavailable'])test('fixed popup receives only local '+state+' enum',()=>{
 const f=listenerFixture(()=>state);assert.deepEqual(f.dispatch(),[{v:1,state}]);assert.equal(f.reads(),1);f.dispose();assert.equal(f.listeners.size,0);assert.deepEqual(f.dispatch(),[]);f.dispose();
});
for(const source of [null,{}, {...sender(),id:'other'},{...sender(),url:'https://chatgpt.com/'},{...sender(),url:'chrome-extension://extension/workspace.html'},{...sender(),url:'chrome-extension://extension/status.html#x'},{...sender(),url:'chrome-extension://extension/status.html?x'},{...sender(),tab:{}},{...sender(),tab:null}])test('reject non-popup sender '+JSON.stringify(source),()=>{
 const f=listenerFixture();assert.deepEqual(f.dispatch(request(),source),[]);assert.equal(f.reads(),0);f.dispose();
});
for(const message of [null,{},[],{v:2,type:'HOST_LOCAL_STATUS'},{v:1,type:'HOST_REFRESH'},{...request(),scope:'PRIVATE'},{...request(),extra:undefined},Object.assign(Object.create({inherited:true}),request())])test('reject malformed status request '+JSON.stringify(message),()=>{
 const f=listenerFixture();assert.deepEqual(f.dispatch(message),[]);assert.equal(f.reads(),0);f.dispose();
});
for(const value of ['PRIVATE',null,{state:'ready',scope:'PRIVATE'},['ready'],Promise.resolve('ready')])test('unknown local result never exposes private content '+String(value),()=>{
 const f=listenerFixture(()=>value);assert.deepEqual(f.dispatch(),[{v:1,state:'unavailable'}]);f.dispose();
});
test('local read exception becomes unavailable without exception text',()=>{const f=listenerFixture(()=>{throw Error('PRIVATE_TOKEN');});assert.deepEqual(f.dispatch(),[{v:1,state:'unavailable'}]);f.dispose();});
function popupFixture({query=async()=>[{id:7}],send=async()=>({v:1,state:'ready'})}={}){
 const calls=[],timers=new Map();let serial=0;
 const tabs={query:args=>{calls.push(['query',args]);return query(args);},sendMessage:(...args)=>{calls.push(['send',...args]);return send(...args);}};
 const schedule=(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},cancel=id=>timers.delete(id);
 return {calls,timers,run:()=>readActiveLocalStatus({tabs,schedule,cancel}),expire(){for(const[id,timer]of [...timers]){timers.delete(id);timer.fn();}}};
}
for(const state of ['ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed','layout-missing-reading','layout-geometry-header-gap','unavailable'])test('active tab lookup has one topframe request and exact '+state+' result',async()=>{
 const f=popupFixture({query:async()=>[{id:7,get url(){throw Error('must not read private URL');},get title(){throw Error('must not read private title');}}],send:async()=>({v:1,state})});assert.equal(await f.run(),state);
 assert.deepEqual(f.calls,[['query',{active:true,currentWindow:true}],['send',7,request(),{frameId:0}]]);assert.equal(f.timers.size,0);
});
for(const response of [null,{},[],{v:2,state:'ready'},{v:1,state:'PRIVATE'},{v:1,state:'ready',scope:'PRIVATE'},{v:1,state:'ready',extra:undefined},Object.assign(Object.create({inherited:true}),{v:1,state:'ready'})])test('popup rejects malformed response '+JSON.stringify(response),async()=>{
 const f=popupFixture({send:async()=>response});assert.equal(await f.run(),'unavailable');assert.equal(f.calls.filter(c=>c[0]==='send').length,1);assert.equal(f.timers.size,0);
});
for(const rows of [[],null,[{}],[{id:-1}],[{id:'7'}],[{id:1.5}],[{id:NaN}]])test('no valid current tab yields unavailable without request '+JSON.stringify(rows),async()=>{
 const f=popupFixture({query:async()=>rows});assert.equal(await f.run(),'unavailable');assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
});
for(const stage of ['query','send'])test(stage+' rejection is unavailable with no retry',async()=>{
 const f=popupFixture({[stage]:async()=>{throw Error('PRIVATE_ERROR');}});assert.equal(await f.run(),'unavailable');assert.equal(f.calls.length,stage==='query'?1:2);assert.equal(f.timers.size,0);
});
for(const stage of ['query','send'])test('single 1000ms observation deadline fences late '+stage+' completion',async()=>{
 let release;const f=popupFixture({[stage]:()=>new Promise(resolve=>{release=resolve;})});const result=f.run();await drain();assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,1000);
 f.expire();assert.equal(await result,'unavailable');const count=f.calls.length;release(stage==='query'?[{id:7}]:{v:1,state:'ready'});await drain();assert.equal(f.calls.length,count,'late query must not dispatch, late reply must not retry');assert.equal(f.timers.size,0);
});

test('layout shape is bounded fixed metadata and restricted to the exact popup',async()=>{
 const shape={counts:[1,2,1,1,1,1,1],branches:[['DIV',true,false,true,false,1],['STYLE',false,false,false,false,0]]};
 assert.equal(validLayoutShape(shape),true);
 for(const bad of [{...shape,url:'PRIVATE'}, {...shape,counts:[34,2,1,1,1,1,1]}, {...shape,branches:[['PRIVATE',true,false,true,false,1]]}])assert.equal(validLayoutShape(bad),false);
 let listener;const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listener=f,removeListener(){}}};
 const dispose=installLocalStatus({runtime,readState:()=> 'layout-ambiguous-reading',readLayout:()=>shape});
 for(const source of [{...sender(),tab:{}},{...sender(),url:'https://chatgpt.com/'}]){let called=false;listener({v:1,type:'HOST_LOCAL_LAYOUT'},source,()=>called=true);assert.equal(called,false);}
 const tabs={query:async()=>[{id:7}],sendMessage:async(id,msg,options)=>{assert.equal(id,7);assert.deepEqual(options,{frameId:0});let result;listener(msg,sender(),r=>result=r);return result;}};
 assert.deepEqual(await readActiveLocalLayout({tabs}),shape);dispose();
});

test('layout lookup deadline fences a late tab lookup without dispatch',async()=>{
 let release,expire,sends=0;const tabs={query:()=>new Promise(r=>release=r),sendMessage:()=>{sends++;}};
 const result=readActiveLocalLayout({tabs,schedule:f=>{expire=f;return 1;},cancel:()=>{}});await drain();expire();assert.equal(await result,null);release([{id:7}]);await drain();assert.equal(sends,0);
});

test('foreground diagnostic codes use the existing private popup channel without raw response text',async()=>{
 for(const state of foregroundFailureStates){const f=listenerFixture(()=>state);assert.deepEqual(f.dispatch(),[{v:1,state}]);f.dispose();assert.equal(await popupFixture({send:async()=>({v:1,state})}).run(),state);}
 const f=listenerFixture(()=> 'foreground-PRIVATE');assert.deepEqual(f.dispatch(),[{v:1,state:'unavailable'}]);f.dispose();
});
