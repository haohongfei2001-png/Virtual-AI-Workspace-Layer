import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(role='workspace'){
 let time=1000,id=0,navOptions,views=0;const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],parentMessages=[],calls=[],pages=[],states=[],presented=[],restoredViews=[];let factories=0,stops=0,invalidations=0,recoveryOptions,recoveryOpens=0,recoveryStops=0,backupOptions,backupOpens=0,backupStops=0,backupInvalidations=0,snippetOptions,snippetOpens=0,snippetStops=0,snippetInvalidations=0;
 const element=()=>({children:[],setAttribute(){},append(n){n.parent=this;this.children.push(n);},replaceChildren(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}});
 const body=element(),privateRoot=element();body.append(privateRoot);
 const document={body,createElement:element,defaultView:{parent:{postMessage(message,origin){parentMessages.push({message,origin});}}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role,expiresAt:new Date(time+20000).toISOString()});
 const page=()=>({protocol:'vaiwl-free-frame/1',role,scope:'A',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null});
 let view=async()=>({ok:true,state:'ready',page:page(),navigation:[]});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){}}),sendMessage:async m=>{calls.push(m);if(m.type==='HOST_UI_VIEW'){views++;return view(m);}return {ok:true,grant:grant()};}};
 const client=createFreeFrameClient({document,privateRoot,runtime,role,parentOrigin:'https://chatgpt.com',onState:s=>states.push(s),now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),snippetsFactory:options=>{snippetOptions=options;return {open(){snippetOpens++;},stop(){snippetStops++;},invalidate(){snippetInvalidations++;}};},backupFactory:options=>{backupOptions=options;return {open(){backupOpens++;},stop(){backupStops++;},invalidate(){backupInvalidations++;}};},recoveryFactory:options=>{recoveryOptions=options;return {open(){recoveryOpens++;},stop(){recoveryStops++;}};},navigationFactory:options=>{factories++;navOptions=options;return {restoreFrameView:value=>restoredViews.push(value),invalidate(){invalidations++;},present:intent=>presented.push(intent),updateFrameProjection:p=>pages.push(p),stop:()=>{stops++;}};}});
 return {parentMessages,restoredViews,jump(ms){time+=ms;},runtime,grant,presented,messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},client,calls,pages,states,body,privateRoot,page,setView:fn=>{view=fn;},get snippets(){return snippetOptions;},get snippetOpens(){return snippetOpens;},get snippetStops(){return snippetStops;},get snippetInvalidations(){return snippetInvalidations;},get backup(){return backupOptions;},get backupOpens(){return backupOpens;},get backupStops(){return backupStops;},get backupInvalidations(){return backupInvalidations;},get recovery(){return recoveryOptions;},get recoveryOpens(){return recoveryOpens;},get recoveryStops(){return recoveryStops;},get invalidations(){return invalidations;},get nav(){return navOptions;},get factories(){return factories;},get stops(){return stops;},get views(){return views;},disconnect:()=>{for(const fn of [...listeners])fn();},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time&&timers.has(key)){timers.delete(key);t.fn();}await drain();}};
}

const conversation='33333333-3333-4333-8333-333333333333';
const project='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
function nativeRow(entity='conversation'){
 const id=entity==='project'?project:conversation,url=entity==='project'?`https://chatgpt.com/g/${id}/project`:`https://chatgpt.com/c/${id}`;
 const handle={id:'handle',documentToken:'document',routeEpoch:0,regionEpoch:1,controlKind:entity};
 return {[entity==='project'?'projectId':'refId']:id,targetKey:'native-key',plan:{mode:'native-control',target:{kind:'resolved',entity,nativeId:id,navigationURL:url,liveHandle:{...handle}},control:handle,planRevision:7}};
}
const command=()=>({actionId:'native-action',uiGrantId:'grant',mountId:'mount',planRevision:7,targetKey:'native-key'});
async function nativeFixture(entity='conversation',mutate=()=>{},role='workspace'){
 const f=fixture(role),row=nativeRow(entity),page=f.page();
 if(entity==='project')page.groups.items=[{id:project,name:'Native project',nativeUrl:row.plan.target.navigationURL}];
 mutate(row,page);
 f.setView(async()=>({ok:true,state:'ready',page,navigation:[row]}));
 await f.client.start();await drain();return {...f,row,get nav(){return f.nav;}};
}
for(const role of ['workspace','sidebar'])for(const entity of ['conversation','project'])test(`${role} ${entity} resolved native plan dispatches only owner tuple without current body`,async()=>{
 const f=await nativeFixture(entity,()=>{},role);assert.equal(f.pages.length,1);
 const issued=entity==='project'?f.nav.adapter.projectNavigationPlan({id:project}):f.nav.adapter.navigationPlan({id:conversation});
 assert.deepEqual(issued,{plan:f.row.plan,targetKey:'native-key',uiGrantId:'grant',mountId:'mount'});
 const send=f.runtime.sendMessage,packets=[];f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_NATIVE'?(packets.push(m),Promise.resolve({ok:true,state:'dispatched'})):send(m);
 assert.deepEqual(await f.nav.onDispatch(command()),{state:'dispatched'});
 assert.deepEqual(packets,[{v:1,type:'HOST_UI_DISPATCH_NATIVE',grantId:'grant',mountId:'mount',actionId:'native-action',planRevision:7,targetKey:'native-key'}]);f.client.stop();
});
for(const [name,mutate] of [
 ['mismatched control kind',r=>r.plan.control.controlKind='project'],
 ['mismatched handles',r=>r.plan.target.liveHandle.id='other'],
 ['wrong target identity',r=>r.plan.target.nativeId='other'],
 ['foreign URL',r=>r.plan.target.navigationURL='https://evil.test/c/'+conversation],
 ['different conversation URL identity',r=>r.plan.target.navigationURL='https://chatgpt.com/c/44444444-4444-4444-8444-444444444444'],
 ['project URL for conversation',r=>r.plan.target.navigationURL='https://chatgpt.com/g/'+project+'/project'],
 ['extra plan',r=>r.plan.bodyProofId='proof'],
 ['extra control',r=>r.plan.control.selector='button'],
 ['negative epoch',r=>{r.plan.control.routeEpoch=-1;r.plan.target.liveHandle.routeEpoch=-1;}],
 ['fractional revision',r=>r.plan.planRevision=1.5],
 ['live control masquerading as resolved',r=>r.plan.target.kind='live-control'],
 ['null handle',r=>r.plan.target.liveHandle=null],
])test('resolved native frame rejects '+name,async()=>{
 const f=await nativeFixture('conversation',mutate);assert.equal(f.pages.length,0);assert.equal(f.states.at(-1).reason,'invalid-frame-navigation');assert(!f.calls.some(m=>m.type==='HOST_UI_DISPATCH_NATIVE'));f.client.stop();
});
for(const [name,mutate] of [
 ['missing group',(_r,p)=>p.groups.items=[]],
 ['different group URL',(_r,p)=>p.groups.items[0].nativeUrl='https://chatgpt.com/g/g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/project'],
 ['conversation row identity',r=>{r.refId=r.projectId;delete r.projectId;}],
])test('resolved project frame rejects '+name,async()=>{
 const f=await nativeFixture('project',mutate);assert.equal(f.pages.length,0);assert.equal(f.states.at(-1).reason,'invalid-frame-navigation');f.client.stop();
});
test('resolved native dispatch rejects unissued authority tuple locally',async()=>{
 const f=await nativeFixture(),before=f.calls.length;
 for(const patch of [{uiGrantId:'other'},{mountId:'other'},{targetKey:'other'},{planRevision:8},{extra:true}])assert.deepEqual(await f.nav.onDispatch({...command(),...patch}),{state:'blocked'});
 assert.equal(f.calls.length,before);f.client.stop();
});
for(const result of [{ok:true,state:'already-current'},{ok:true,state:'blocked'},{ok:false,state:'dispatched'},null])test('native reply cannot be interpreted as dispatched '+JSON.stringify(result),async()=>{
 const f=await nativeFixture(),send=f.runtime.sendMessage,requests=[];f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_NATIVE'?(requests.push(m),Promise.resolve(result)):send(m);
 assert.notEqual((await f.nav.onDispatch(command())).state,'dispatched');await drain();assert.equal(requests.length,1);f.client.stop();
});
for(const change of ['stop','new-view','expired','deadline'])test('native acknowledgement cannot cross '+change,async()=>{
 const f=await nativeFixture(),held=deferred(),send=f.runtime.sendMessage;let requests=0;
 f.runtime.sendMessage=m=>m.type==='HOST_UI_DISPATCH_NATIVE'?(requests++,held.promise):send(m);
 const pending=f.nav.onDispatch(command());await drain();
 if(change==='stop')f.client.stop();if(change==='new-view')await f.nav.onProjectionRequest({segment:1});if(change==='expired')f.jump(20001);if(change==='deadline')f.jump(6001);
 held.resolve({ok:true,state:'dispatched'});assert.notEqual((await pending).state,'dispatched');assert.equal(requests,1);f.client.stop();
});

test('native unconfirmed acknowledgement remains unknown and never retries or fetches fallback',async()=>{
 const f=await nativeFixture(),send=f.runtime.sendMessage,packets=[];let answered=false;
 f.runtime.sendMessage=m=>{packets.push(m);if(m.type==='HOST_UI_DISPATCH_NATIVE'){answered=true;return Promise.resolve({ok:true,state:'unconfirmed'});}return send(m);};
 assert.deepEqual(await f.nav.onDispatch(command()),{state:'unconfirmed'});assert.equal(answered,true);await drain();
 assert.deepEqual(packets,[{v:1,type:'HOST_UI_DISPATCH_NATIVE',grantId:'grant',mountId:'mount',actionId:'native-action',planRevision:7,targetKey:'native-key'}]);f.client.stop();
});
