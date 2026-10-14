import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
// DOM, browser transport, adapter identity certificates and surfaces are explicit
// doubles. The production content session and candidate correlation run unchanged.
const P='g-p-11111111111111111111111111111111',URL='https://chatgpt.com/g/'+P+'/project';
const drain=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function fixture(){
 let holdHello=null;let time=1000;let scope='scopeA',documentId='browser',epoch=0,ack='accepted',matches=true,serial=0,options,controller,emit;const identity={},listeners=new Set(),events=new Map(),docEvents=new Map(),timers=new Map(),modes=[],calls=[];
 const document={addEventListener:(n,f)=>docEvents.set(n,f),removeEventListener:(n,f)=>{if(docEvents.get(n)===f)docEvents.delete(n);},location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc'+epoch,producerToken:'producer'+epoch,browserDocumentId:documentId,routeEpoch:epoch,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);if(m.type==='HOST_HELLO'){epoch++;if(holdHello)await holdHello;return {binding:binding()};}if(m.type==='HOST_REFRESH')return {state:'verified',scopeKey:scope};if(m.kind==='surface-delta')return {state:ack};return {ok:true};}};
 const row=id=>({entity:'project',renderKey:id,nativeTitle:'Same',titleState:'exact',target:{kind:'live-control',control:{id},navigationURL:null}});
 const proposal=()=>({kind:'surface-delta',payload:{candidates:[row('clicked'),row('neighbor'),...(document.location.href===URL?[{entity:'project',target:{kind:'resolved',nativeId:P},evidence:{fieldPaths:['current-project-route']}}]:[])]}});
 const client=createHostContentSession({document,runtime,now:()=>time,elapsedNow:()=>time,makeId:()=> 'client',schedule:(f,ms)=>{const id=++serial;timers.set(id,{f,at:time+ms});return id;},cancel:id=>timers.delete(id),surfaceFactory:()=>({}),plansFactory:()=>({}),adapterFactory:o=>{options=o;return {inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,captureCandidateIdentity:h=>h.id==='clicked'?identity:null,matchesCandidateIdentity:(token,h)=>matches&&token===identity&&h.id==='clicked',readLoaded:async()=>[proposal()],planNavigation:target=>({mode:'native-control',target,control:target.control,planRevision:++serial}),planKey:p=>'key'+p.planRevision};},controllerFactory:o=>{controller=o;modes.push(o.initialMode);return {start:async c=>{emit=c.emit;await emit(proposal());return {id:'mount'};},stop(){},showReading:()=>true,showWorkspace:()=>true};}});
 const list=()=>new Promise(resolve=>[...listeners][0]({type:'HOST_CANDIDATES',...(({documentToken,producerToken,routeEpoch})=>({documentToken,producerToken,routeEpoch}))(binding()),phase:'list'},{id:'extension'},resolve));
 async function navigate({beforeRoute=()=>{},cancel=false,newScope=scope,newDocument=documentId,nodeMatches=true}={}){const old=options,event={actionId:'action',plan:{target:{kind:'live-control'},control:{id:'clicked'}}};old.onNativeDispatch(event);if(cancel)old.onNativeDispatchCancelled(event);await beforeRoute();scope=newScope;documentId=newDocument;matches=nodeMatches;document.location.href=URL;old.onRebindNeeded();await drain();return old;}
 return {client,list,navigate,modes,calls,document,holdHello:p=>holdHello=p,docEvents,timers,events,setMatches:v=>matches=v,async advance(ms){time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.f();}await drain();},setAck:v=>ack=v,ack:()=>emit(proposal()),get options(){return options;},get controller(){return controller;}};
}
test('same document/scope and accepted current Project upgrades only matching node, never same name',async()=>{
 const f=fixture();await f.client.start();assert.deepEqual((await f.list()).items.map(r=>r.renderKey),['clicked','neighbor']);await f.navigate();assert.deepEqual(f.modes,['workspace','reading']);assert.deepEqual((await f.list()).items.map(r=>r.renderKey),['neighbor']);assert.deepEqual((await f.list()).items.map(r=>r.renderKey),['neighbor']);f.client.stop();
});
for(const mode of ['cancel','scope','document','node','unacknowledged'])test(mode+' cannot suppress the clicked candidate',async()=>{
 const f=fixture();await f.client.start();if(mode==='unacknowledged')f.setAck('rejected');await f.navigate({cancel:mode==='cancel',newScope:mode==='scope'?'scopeB':'scopeA',newDocument:mode==='document'?'otherBrowser':'browser',nodeMatches:mode!=='node'});assert.deepEqual((await f.list()).items.map(r=>r.renderKey),['clicked','neighbor']);assert.equal(f.modes.at(-1),mode==='cancel'?'workspace':'reading');f.client.stop();
});
test('candidate stays visible before ACK and upgrades after accepted current-project observation',async()=>{
 const f=fixture();await f.client.start();f.setAck('rejected');await f.navigate();assert.equal((await f.list()).total,2);f.setAck('accepted');await f.ack();assert.deepEqual((await f.list()).items.map(r=>r.renderKey),['neighbor']);f.client.stop();
});
test('duplicate ACK is accepted and stale rebind callback cannot replace current session',async()=>{
 const f=fixture();await f.client.start();f.setAck('duplicate');const old=await f.navigate();assert.equal((await f.list()).total,1);old.onRebindNeeded();await drain();assert.equal(f.modes.length,2);assert.equal((await f.list()).total,1);f.client.stop();
});

for(const type of ['pointerdown','keydown'])for(const trusted of [false,true])test(`pending ${type} trusted=${trusted} interruption and listener cleanup`,async()=>{
 const f=fixture();await f.client.start();assert.equal(f.docEvents.has(type),false);
 await f.navigate({beforeRoute:()=>{assert.equal(f.docEvents.has('pointerdown'),true);assert.equal(f.docEvents.has('keydown'),true);f.docEvents.get(type)({isTrusted:trusted});if(trusted)assert.equal(f.docEvents.has(type),false);}});
 assert.equal((await f.list()).total,trusted?2:1);assert.equal(f.modes.at(-1),trusted?'workspace':'reading');assert.equal(f.docEvents.has('pointerdown'),false);assert.equal(f.docEvents.has('keydown'),false);assert.equal(f.timers.size,0);f.client.stop();
});
test('six-second pending expiry removes hooks and cannot suppress after route ACK',async()=>{
 const f=fixture();await f.client.start();await f.navigate({beforeRoute:async()=>{assert.equal(f.timers.size,1);await f.advance(6000);assert.equal(f.timers.size,0);assert.equal(f.docEvents.has('pointerdown'),false);}});assert.equal((await f.list()).total,2);assert.equal(f.modes.at(-1),'workspace');f.client.stop();
});
for(const mode of ['stop','pagehide'])test(mode+' clears pending listeners/timer and old rebind cannot revive it',async()=>{
 const f=fixture();await f.client.start();await f.navigate({beforeRoute:()=>{if(mode==='stop')f.client.stop();else f.events.get('pagehide')({persisted:true});assert.equal(f.docEvents.has('pointerdown'),false);assert.equal(f.docEvents.has('keydown'),false);assert.equal(f.timers.size,0);}});assert.equal(f.modes.length,1);await f.client.start();assert.equal((await f.list()).total,2);f.client.stop();
});
test('confirmed same-session upgrade outlives correlation timer but still checks every node identity',async()=>{
 const f=fixture();await f.client.start();await f.navigate();assert.equal((await f.list()).total,1);assert.equal(f.timers.size,0);await f.advance(6500);assert.equal((await f.list()).total,1);f.setMatches(false);assert.equal((await f.list()).total,2);f.client.stop();
});

for(const type of ['popstate','hashchange'])test(`pending replacement ${type} P-Q-P cannot reuse original action correlation`,async()=>{
 const f=fixture();await f.client.start();let release;f.holdHello(new Promise(r=>release=r));await f.navigate();assert.equal(f.modes.length,1);assert.equal(f.events.has(type),true);
 f.document.location.href='https://chatgpt.com/g/g-p-22222222222222222222222222222222/project';f.events.get(type)();f.document.location.href=URL;f.events.get(type)?.();assert.equal(f.events.has('popstate'),false);assert.equal(f.events.has('hashchange'),false);
 release();await drain();assert.equal((await f.list()).total,2);f.client.stop();
});
test('same P repeated route events preserve pending relation then confirmation removes route listeners',async()=>{
 const f=fixture();await f.client.start();let release;f.holdHello(new Promise(r=>release=r));await f.navigate();for(let i=0;i<3;i++){f.events.get('popstate')();f.events.get('hashchange')();}release();await drain();assert.equal((await f.list()).total,1);assert.equal(f.events.has('popstate'),false);assert.equal(f.events.has('hashchange'),false);f.client.stop();
});
test('stop removes pending route listeners while replacement handshake is blocked',async()=>{
 const f=fixture();await f.client.start();let release;f.holdHello(new Promise(r=>release=r));await f.navigate();assert.equal(f.events.has('popstate'),true);assert.equal(f.events.has('hashchange'),true);f.client.stop();assert.equal(f.events.has('popstate'),false);assert.equal(f.events.has('hashchange'),false);release();await drain();assert.equal(f.modes.length,1);
});
