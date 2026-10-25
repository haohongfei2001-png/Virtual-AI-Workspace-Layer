import test from 'node:test';
import assert from 'node:assert/strict';
import {foregroundFailureStates,installLocalStatus,readActiveLocalStatus,validLayoutShape,readActiveLocalLayout,validLocalPipeline} from '../../src/host/local-status.mjs';
const request=()=>({v:1,type:'HOST_LOCAL_STATUS'});
const sender=()=>({id:'extension',url:'chrome-extension://extension/status.html'});
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function listenerFixture(readState=()=> 'ready'){
 const listeners=new Set();let reads=0;
 const runtime={id:'extension',getURL:path=>'chrome-extension://extension/'+path,onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
 const dispose=installLocalStatus({runtime,readState:()=>{reads++;return readState();}});
 return {listeners,dispose,reads:()=>reads,dispatch(message=request(),source=sender()){const replies=[];for(const listener of listeners)listener(message,source,value=>replies.push(value));return replies;}};
}
for(const state of ['ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed','layout-missing-reading','layout-geometry-header-gap','layout-history-row-order','unavailable'])test('fixed popup receives only local '+state+' enum',()=>{
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
for(const state of ['ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed','layout-missing-reading','layout-geometry-header-gap','layout-history-row-order','unavailable'])test('active tab lookup has one topframe request and exact '+state+' result',async()=>{
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

test('Project clip diagnostic admits numeric inset geometry only',()=>{
 assert.equal(validLayoutShape({projectClip:'inset(0px 0px 0px -9999px round 16px)'}),true);
 for(const projectClip of ['url(https://private.invalid)','PRIVATE','inset(0px) account-id','inset('+('0'.repeat(200))+'px)'])assert.equal(validLayoutShape({projectClip}),false);
 assert.equal(validLayoutShape({projectClip:'inset(0px)',title:'private'}),false);
});

 test('navigation summary admits only fixed phase and bounded counts, never row data',()=>{
 const navigation={phase:'accepted',roots:[1,1,1],firstOutside:[],firstClip:[],memberShape:[],headingShape:[],memberReject:Array(7).fill(0),rejected:Array(11).fill(0),matched:3,visible:2,titles:2,association:1,candidates:3,claims:2};
 assert.equal(validLayoutShape({navigation}),true);
 for(const n of [{...navigation,url:'PRIVATE'},{...navigation,phase:'PRIVATE'},{...navigation,matched:257},{...navigation,roots:[1,1,1,1]},{...navigation,titles:-1}])assert.equal(validLayoutShape({navigation:n}),false);
 });

test('one-time structure diagnostic accepts only the private popup and fixed anonymous report',async()=>{
 const {validHistoryStructureReport}=await import('../../src/host/history-structure-diagnostic.mjs');
 const report={schema:'history-structure-v1',reason:'complete',truncated:false,events:0,elapsedMs:6000,snapshots:[],operations:[]};
 assert(validHistoryStructureReport(report));assert(!validHistoryStructureReport({...report,title:'PRIVATE'}));
 assert(!validHistoryStructureReport({...report,operations:[{at:1,kind:'children',target:'PRIVATE',removed:[],added:[]}]}));
 let listener,calls=0;const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listener=f,removeListener(){}}};
 const dispose=installLocalStatus({runtime,readState:()=> 'ready',observeHistory:async()=>{calls++;return report;}});
 const message={v:1,type:'HOST_LOCAL_HISTORY_STRUCTURE'};
 for(const source of [{...sender(),tab:{}},{...sender(),url:'https://chatgpt.com/'}])assert.equal(listener(message,source,()=>assert.fail()),undefined);
 const result=await new Promise(resolve=>assert.equal(listener(message,sender(),resolve),true));
 assert.deepEqual(result,{v:1,report});assert.equal(calls,1);dispose();
});

test('structure diagnostic spends before dispatch and never retries an unknown outcome',async()=>{
 const {HISTORY_DIAGNOSTIC_BATCH,runHistoryDiagnosticOnce}=await import('../../src/host/history-structure-diagnostic.mjs');
 const saved={};let sends=0;
 const chrome={storage:{local:{get:async key=>({[key]:saved[key]}),set:async value=>Object.assign(saved,value)}},tabs:{query:async()=>[{id:7,incognito:false}],sendMessage:async()=>{assert.equal(saved[HISTORY_DIAGNOSTIC_BATCH].spent,true);sends++;throw Error('PRIVATE');}}};
 const locks={request:async(key,run)=>run()};
 assert.equal((await runHistoryDiagnosticOnce({chrome,locks})).state,'outcome-unknown');
 assert.deepEqual(await runHistoryDiagnosticOnce({chrome,locks}),{state:'spent',report:null});assert.equal(sends,1);
});

test('local pipeline reports only counts and separate versions, never raw rows or IDs',()=>{
 const p={storage:'session',nativeRevision:3,projects:1,refs:2,lastWorkspaceDelivery:{versions:[2,0,0,0],segment:0,inventory:[1,1],groups:[1,1],noProject:[0,0],unknown:[1,1]}};
 assert(validLocalPipeline(p));assert(validLocalPipeline({...p,projects:null,refs:null,lastWorkspaceDelivery:null}));
 for(const bad of [{...p,scope:'PRIVATE'},{...p,refs:'PRIVATE'},{...p,storage:'server'},{...p,lastWorkspaceDelivery:{...p.lastWorkspaceDelivery,url:'PRIVATE'}}])assert(!validLocalPipeline(bad));
});
for(const [stage,message,expected]of [['query','PRIVATE','tab-query-failed'],['send','Could not establish connection. Receiving end does not exist.','receiver-unavailable'],['send','The message port closed before a response was received.','receiver-disconnected'],['send','No tab with id: 123','tab-closed'],['send','PRIVATE','transport-error']])test('status retains fixed failure stage '+expected+' without retry or error text',async()=>{
 let code,sends=0;const tabs={query:async()=>{if(stage==='query')throw Error(message);return [{id:7}];},sendMessage:async()=>{sends++;throw Error(message);}};
 assert.equal(await readActiveLocalStatus({tabs,onFailure:c=>code=c}),'unavailable');assert.equal(code,expected);assert.equal(sends,stage==='query'?0:1);
});

for(const changed of [false,true])test('status targets exact browser document and rejects replacement '+changed,async()=>{
 let reads=0,sends=0,code;const tabs={query:async()=>[{id:7}],sendMessage:async(id,message,options)=>{sends++;assert.equal(id,7);assert.deepEqual(options,{documentId:'old'});return {v:1,state:'reading'};}};
 const webNavigation={getFrame:async()=>({documentId:changed&&reads++?'new':'old',documentLifecycle:'active',url:'https://chatgpt.com/'})};
 const result=await readActiveLocalStatus({tabs,webNavigation,onFailure:c=>code=c});
 assert.equal(result,changed?'unavailable':'reading');assert.equal(code,changed?'document-changed':undefined);assert.equal(sends,1);
});
test('status timeout during document lookup cannot later dispatch into a replacement',async()=>{
 let release,expire,sends=0;const pending=readActiveLocalStatus({tabs:{query:async()=>[{id:7}],sendMessage:()=>{sends++;}},webNavigation:{getFrame:()=>new Promise(r=>release=r)},schedule:f=>{expire=f;return 1;},cancel:()=>{}});
 await drain();expire();assert.equal(await pending,'unavailable');release({documentId:'late',documentLifecycle:'active'});await drain();assert.equal(sends,0);
});

test('anonymous delivery shape rejects content, extra fields and overflow',()=>{
 const navigation={phase:'accepted',roots:[1,1,0],firstOutside:[],firstClip:[],memberShape:[],headingShape:[],memberReject:Array(7).fill(0),rejected:Array(11).fill(0),matched:0,visible:0,titles:0,association:0,candidates:0,claims:0};
 const delivery={pages:3,resolvedProjects:0,resolvedChats:4,acceptedPackets:2,acceptedProjects:0,acceptedChats:4,rejectedPackets:0,capped:false};
 assert(validLayoutShape({navigation,delivery}));for(const bad of [{...delivery,title:'PRIVATE'},{...delivery,pages:'PRIVATE'},{...delivery,pages:1000001}])assert(!validLayoutShape({navigation,delivery:bad}));
});
test('SPA replacement is rejected even with the same document ID',async()=>{
 let reads=0,code,target;const webNavigation={getFrame:async()=>({documentId:'doc',url:reads++?'https://chatgpt.com/g/private/project':'https://chatgpt.com/',documentLifecycle:'active'})};
 assert.equal(await readActiveLocalStatus({webNavigation,tabs:{query:async()=>[{id:7}],sendMessage:async()=>({v:1,state:'ready'})},onTarget:t=>target=t,onFailure:c=>code=c}),'unavailable');assert.equal(code,'document-changed');assert.equal(target,undefined);
});
test('layout reuses status target and drops data if that route changed',async()=>{
 const target={tabId:7,documentId:'doc',url:'https://chatgpt.com/'};let reads=0,sends=0;
 const result=await readActiveLocalLayout({target,webNavigation:{getFrame:async()=>({documentId:'doc',url:reads++?target.url+'c/private':target.url,documentLifecycle:'active'})},tabs:{query:()=>assert.fail('must reuse the exact status target'),sendMessage:async(id,m,o)=>{sends++;assert.equal(id,7);assert.deepEqual(o,{documentId:'doc'});return {v:1,shape:{counts:[1,1,1,1,1,1,1],branches:[]}};}}});
 assert.equal(result,null);assert.equal(sends,1);
});
