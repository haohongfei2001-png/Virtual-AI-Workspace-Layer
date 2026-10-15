import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
// DOM, browser transport, adapter identity certificates and surfaces are explicit
// doubles. The production content session and candidate correlation run unchanged.
const P='g-p-11111111111111111111111111111111',URL='https://chatgpt.com/g/'+P+'/project';
const drain=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function fixture({extraCandidates=0}={}){
 let scanFactory=null;let present=true;let cancelClick=false;const focusCalls=[];let holdHello=null;let time=1000;let scope='scopeA',documentId='browser',epoch=0,ack='accepted',matches=true,serial=0,options,controller,emit;const identity={},extraIdentities=new Map(Array.from({length:extraCandidates},(_,i)=>['extra'+i,{}])),listeners=new Set(),events=new Map(),docEvents=new Map(),timers=new Map(),modes=[],calls=[];
 const document={addEventListener:(n,f)=>docEvents.set(n,f),removeEventListener:(n,f)=>{if(docEvents.get(n)===f)docEvents.delete(n);},location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc'+epoch,producerToken:'producer'+epoch,browserDocumentId:documentId,routeEpoch:epoch,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);if(m.type==='HOST_HELLO'){epoch++;if(holdHello)await holdHello;return {binding:binding()};}if(m.type==='HOST_REFRESH')return {state:'verified',scopeKey:scope};if(m.kind==='surface-delta')return {state:ack};return {ok:true};}};
 const row=id=>({entity:'project',renderKey:id,nativeTitle:'Same',titleState:'exact',target:{kind:'live-control',control:{id},navigationURL:null}});
 const proposal=()=>({kind:'surface-delta',payload:{candidates:[...(present?[row('clicked')]:[]),row('neighbor'),...[...extraIdentities.keys()].map(row),...(document.location.href===URL?[{entity:'project',target:{kind:'resolved',nativeId:P},evidence:{fieldPaths:['current-project-route']}}]:[])]}});
 const client=createHostContentSession({document,runtime,now:()=>time,elapsedNow:()=>time,makeId:()=> 'client',schedule:(f,ms)=>{const id=++serial;timers.set(id,{f,at:time+ms});return id;},cancel:id=>timers.delete(id),surfaceFactory:()=>({}),plansFactory:()=>({}),adapterFactory:o=>{options=o;const plans=new Map();return {inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,captureCandidateIdentity:h=>h.id==='clicked'?identity:extraIdentities.get(h.id)??null,matchesCandidateIdentity:(token,h)=>matches&&(h.id==='clicked'?token===identity:extraIdentities.get(h.id)===token&&token!==undefined),loadedPages:()=>scanFactory?scanFactory(proposal):(async function*(){yield proposal();})(),readLoaded:async()=>[proposal()],planNavigation:target=>{const p={mode:'native-control',target,control:target.control,planRevision:++serial};plans.set('key'+p.planRevision,p);return p;},planKey:p=>'key'+p.planRevision,dispatchNative:async command=>{assert.equal(await o.authorize(command),true);o.beforeDispatch();const event={actionId:command.actionId,command,plan:plans.get(command.targetKey)};o.onNativeDispatch(event);if(cancelClick){o.onNativeDispatchCancelled(event);return {state:'unconfirmed'};}document.location.href=URL;o.onRebindNeeded();return {state:'dispatched'};}};},controllerFactory:o=>{let mode=o.initialMode;controller=o;modes.push(o.initialMode);return {start:async c=>{emit=c.emit;await emit(proposal());return {id:'mount'};},stop(){},presentationMode:()=>mode,showReading:()=>{mode='reading';return true;},showWorkspace:()=>{mode='workspace';return true;},focusFrame:role=>{focusCalls.push(role);return true;},isReturnTarget:node=>node==='return'};}});
 const list=(role)=>new Promise(resolve=>[...listeners][0]({type:'HOST_CANDIDATES',...(({documentToken,producerToken,routeEpoch})=>({documentToken,producerToken,routeEpoch}))(binding()),phase:'list',...(role?{role}:{})},{id:'extension'},resolve));
 async function navigate({beforeRoute=()=>{},cancel=false,newScope=scope,newDocument=documentId,nodeMatches=true,controlId='clicked'}={}){const old=options,event={actionId:'action',plan:{target:{kind:'live-control'},control:{id:controlId}}};old.onNativeDispatch(event);if(cancel)old.onNativeDispatchCancelled(event);await beforeRoute();scope=newScope;documentId=newDocument;matches=nodeMatches;document.location.href=URL;old.onRebindNeeded();await drain();return old;}
 const activate=(candidate,display)=>new Promise(resolve=>[...listeners][0]({type:'HOST_CANDIDATES',documentToken:binding().documentToken,producerToken:binding().producerToken,routeEpoch:binding().routeEpoch,phase:'activate',candidate,actionId:'realAction',uiGrantId:'grant',mountId:'mount',expiresAt:new Date(time+6000).toISOString(),display},{id:'extension'},resolve));
 return {setScanFactory:f=>scanFactory=f,client,list,activate,focusCalls,setPresent:v=>present=v,async spa(url,{newScope=scope,newDocument=documentId}={}){scope=newScope;documentId=newDocument;document.location.href=url;options.onRebindNeeded();await drain();},setCancelClick:v=>cancelClick=v,listener:()=>[...listeners][0],binding,navigate,modes,calls,document,holdHello:p=>holdHello=p,docEvents,timers,events,setTime:v=>time=v,setMatches:v=>matches=v,async advance(ms){time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.f();}await drain();},setAck:v=>ack=v,ack:()=>emit(proposal()),get options(){return options;},get controller(){return controller;}};
}
test('same document/scope and accepted current Project upgrades only matching node, never same name',async()=>{
 const f=fixture();await f.client.start();assert.deepEqual((await f.list()).items.map(r=>r.renderKey),['clicked','neighbor']);await f.navigate();assert.deepEqual(f.modes,['workspace','reading']);assert.deepEqual((await f.list()).items.map(r=>r.renderKey),['neighbor']);assert.deepEqual((await f.list()).items.map(r=>r.renderKey),['neighbor']);f.client.stop();
});
for(const mode of ['cancel','scope','document','node','unacknowledged'])test(mode+' cannot suppress the clicked candidate',async()=>{
 const f=fixture();await f.client.start();if(mode==='unacknowledged')f.setAck('rejected');await f.navigate({cancel:mode==='cancel',newScope:mode==='scope'?'scopeB':'scopeA',newDocument:mode==='document'?'otherBrowser':'browser',nodeMatches:mode!=='node'});assert.deepEqual((await f.list()).items.map(r=>r.renderKey),['clicked','neighbor']);assert.equal(f.modes.at(-1),'reading');f.client.stop();
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
 assert.equal((await f.list()).total,trusted?2:1);assert.equal(f.modes.at(-1),'reading');assert.equal(f.docEvents.has('pointerdown'),false);assert.equal(f.docEvents.has('keydown'),false);assert.equal(f.timers.size,0);f.client.stop();
});
test('six-second pending expiry removes hooks and cannot suppress after route ACK',async()=>{
 const f=fixture();await f.client.start();await f.navigate({beforeRoute:async()=>{assert.equal(f.timers.size,1);await f.advance(6000);assert.equal(f.timers.size,0);assert.equal(f.docEvents.has('pointerdown'),false);}});assert.equal((await f.list()).total,2);assert.equal(f.modes.at(-1),'reading');f.client.stop();
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

for(const role of ['workspace','sidebar'])test('active dispatch display migrates only original '+role+' after explicit workspace return',async()=>{
 const f=fixture();await f.client.start();const oldListener=f.listener(),oldBinding=f.binding(),candidate=(await f.list()).items[0],presentation={offset:32,scrollTop:81,focused:true};await f.activate(candidate,{role,presentation});await drain();
 const before=(await f.list(role)).migration;assert.equal(before.ready,false);assert.equal(before.focusAllowed,false);assert.deepEqual(before.presentation,presentation);assert.equal(f.modes.at(-1),'reading');
 await f.controller.bridge.workspaceEntered({mountId:'mount'});const after=(await f.list(role)).migration;assert.equal(after.ready,true);assert.equal(after.focusAllowed,true);assert.deepEqual(f.focusCalls,[role]);const other=(await f.list(role==='workspace'?'sidebar':'workspace')).migration;assert.equal(other.ready,true);assert.equal(other.focusAllowed,false);assert.deepEqual(other.presentation,{offset:0,scrollTop:0,focused:false});
 let replied=false;oldListener({type:'HOST_CANDIDATES',documentToken:oldBinding.documentToken,producerToken:oldBinding.producerToken,routeEpoch:oldBinding.routeEpoch,phase:'list',role},{id:'extension'},()=>replied=true);assert.equal(replied,false);assert.notEqual(f.binding().documentToken,oldBinding.documentToken);f.client.stop();
});
test('trusted top native gesture cancels focus transfer but retains migration identity',async()=>{
 const f=fixture();await f.client.start();await f.activate((await f.list()).items[0],{role:'workspace',presentation:{offset:0,scrollTop:10,focused:true}});await drain();assert.ok((await f.list('workspace')).migration);f.docEvents.get('pointerdown')({isTrusted:true,target:'native-composer'});await f.controller.bridge.workspaceEntered({mountId:'mount'});const m=(await f.list('workspace')).migration;assert.equal(m.ready,true);assert.equal(m.focusAllowed,false);assert.deepEqual(f.focusCalls,[]);f.client.stop();
});
test('cancelled dispatch saves no migration display even if matching Project later appears',async()=>{
 const f=fixture();await f.client.start();f.setCancelClick(true);await f.activate((await f.list()).items[0],{role:'workspace',presentation:{offset:0,scrollTop:10,focused:true}});f.document.location.href=URL;f.options.onRebindNeeded();await drain();const result=await f.list('workspace');assert.equal(result.total,2);assert.equal(result.migration,undefined);f.client.stop();
});

test('rebuilt candidate node rejects focus before any further LIST on workspace return',async()=>{
 const f=fixture();await f.client.start();await f.activate((await f.list()).items[0],{role:'workspace',presentation:{offset:0,scrollTop:11,focused:true}});await drain();assert.ok((await f.list('workspace')).migration);f.setMatches(false);await f.controller.bridge.workspaceEntered({mountId:'mount'});assert.deepEqual(f.focusCalls,[]);assert.equal((await f.list('workspace')).migration,undefined);assert.equal(f.docEvents.has('pointerdown'),false);f.client.stop();
});
test('scan discards missing identity migration and removes its trusted gesture listener safely',async()=>{
 const f=fixture();await f.client.start();await f.activate((await f.list()).items[0],{role:'workspace',presentation:{offset:0,scrollTop:11,focused:true}});await drain();assert.ok((await f.list('workspace')).migration);const late=f.docEvents.get('pointerdown');f.setMatches(false);assert.equal((await f.list('workspace')).migration,undefined);assert.equal(f.docEvents.has('pointerdown'),false);assert.doesNotThrow(()=>late({isTrusted:true,target:'native'}));await f.controller.bridge.workspaceEntered({mountId:'mount'});assert.deepEqual(f.focusCalls,[]);f.client.stop();
});
test('explicit display null is rejected rather than silently downgraded to legacy activation',async()=>{
 const f=fixture();await f.client.start();const result=await f.activate((await f.list()).items[0],null);assert.equal(result.state,'blocked');assert.equal(f.modes.length,1);assert.equal(f.calls.some(m=>m.type==='HOST_NATIVE_AUTHORIZE'),false);f.client.stop();
});

for(const time of [31000,500])test('migration return outside its time window cannot focus at '+time,async()=>{
 const f=fixture();await f.client.start();await f.activate((await f.list()).items[0],{role:'workspace',presentation:{offset:0,scrollTop:11,focused:true}});await drain();assert.ok((await f.list('workspace')).migration);f.setTime(time);await f.controller.bridge.workspaceEntered({mountId:'mount'});assert.deepEqual(f.focusCalls,[]);f.client.stop();
});

const C='https://chatgpt.com/c/11111111-1111-4111-8111-111111111111';
test('learned exact node survives P to C to P with fresh producers but no repeated presentation action',async()=>{
 const f=fixture();await f.client.start();await f.activate((await f.list()).items[0],{role:'workspace',presentation:{offset:0,scrollTop:11,focused:true}});await drain();assert.equal((await f.list('workspace')).total,1);const old=f.listener(),oldBinding=f.binding();
 await f.spa(C);assert.notEqual(f.binding().producerToken,oldBinding.producerToken);assert.deepEqual((await f.list('workspace')).items.map(x=>x.renderKey),['neighbor']);assert.equal((await f.list('workspace')).migration,undefined);await f.controller.bridge.workspaceEntered({mountId:'mount'});assert.deepEqual(f.focusCalls,[]);
 await f.spa(URL);assert.equal((await f.list()).total,1);assert.equal((await f.list('workspace')).migration,undefined);let reply=false;old({type:'HOST_CANDIDATES',...oldBinding,phase:'list'},{id:'extension'},()=>reply=true);assert.equal(reply,false);f.client.stop();
});
for(const kind of ['scope','document','identity','absent','stop','pagehide'])test('learned identity permanently discarded on '+kind,async()=>{
 const f=fixture();await f.client.start();await f.navigate();assert.equal((await f.list()).total,1);
 if(kind==='scope'||kind==='document'){await f.spa(C,kind==='scope'?{newScope:'scopeB'}:{newDocument:'browserB'});assert.equal((await f.list()).total,2);await f.spa(URL,{newScope:'scopeA',newDocument:'browser'});}
 else if(kind==='identity'){f.setMatches(false);await f.spa(C);assert.equal((await f.list()).total,2);f.setMatches(true);await f.spa(URL);}
 else if(kind==='absent'){f.setPresent(false);await f.spa(C);assert.equal((await f.list()).total,1);f.setPresent(true);await f.spa(URL);}
 else {if(kind==='stop')f.client.stop();else f.events.get('pagehide')({persisted:true});await f.client.start();}
 assert.equal((await f.list()).total,2);f.client.stop();
});
test('replacement handshake cannot expose learned candidates before verified session readiness',async()=>{
 const f=fixture();await f.client.start();await f.navigate();assert.equal((await f.list()).total,1);let release;f.holdHello(new Promise(r=>release=r));await f.spa(C);assert.deepEqual(await f.list(),{ok:false});release();await drain();assert.equal((await f.list()).total,1);f.client.stop();
});

test('learned registry stores at most 32 identities without evicting into stale replay',async()=>{
 const f=fixture({extraCandidates:33});await f.client.start();
 for(let i=0;i<33;i++){await f.spa(C);await f.navigate({controlId:'extra'+i});await f.list();}
 await f.spa(C);assert.deepEqual((await f.list()).items.map(x=>x.renderKey),['clicked','neighbor','extra32']);f.client.stop();
});

test('ordinary P to C and native Back keep new authorized surfaces in reading',async()=>{
 const f=fixture();await f.client.start();await f.spa(URL);await f.spa(C);await f.spa(URL);assert.deepEqual(f.modes,['workspace','reading','reading','reading']);assert.equal((await f.list()).total,2);assert.equal(f.calls.filter(x=>x.type==='HOST_NATIVE_AUTHORIZE').length,0);f.client.stop();
});
for(const mode of ['workspace','reading'])test('same URL authorization recovery retains explicit presentation '+mode,async()=>{
 const f=fixture();await f.client.start();const prior=f.controller;prior.onTerminated('ui-frame-suspended',{mode});await drain();assert.equal(f.modes.at(-1),mode);assert.equal(f.calls.filter(x=>x.type==='HOST_REFRESH').length,2);assert.equal((await f.list()).total,2);f.client.stop();
});

for(const mode of ['workspace','reading'])test('same URL body invalidation and trusted worker invalidation preserve '+mode,async()=>{
 const f=fixture();await f.client.start();if(mode==='reading')f.client.showReading();else f.client.showWorkspace();
 f.options.onRebindNeeded();await drain();assert.equal(f.modes.at(-1),mode);
 f.listener()({type:'HOST_DOCUMENT_INVALIDATED'},{id:'extension'},()=>{});await drain();assert.equal(f.modes.at(-1),mode);assert.equal(f.calls.filter(x=>x.type==='HOST_REFRESH').length,3);f.client.stop();
});
test('Back route followed by same URL body invalidation never reopens workspace',async()=>{
 const f=fixture();await f.client.start();await f.spa(URL);await f.spa(C);await f.spa(URL);f.options.onRebindNeeded();await drain();assert.deepEqual(f.modes,['workspace','reading','reading','reading','reading']);f.client.stop();
});


test('failed streaming scan cannot prune an already learned native identity',async()=>{
 const f=fixture();await f.client.start();await f.navigate();assert.equal((await f.list()).total,1);
 f.setPresent(false);f.setScanFactory(async function*(proposal){yield proposal();throw Error('late-scan-failure');});
 assert.deepEqual(await f.list(),{ok:false});f.setPresent(true);f.setScanFactory(null);
 assert.equal((await f.list()).total,1);f.client.stop();
});
for(const cause of ['gesture','expiry'])test('pending upgrade changed during streaming scan rejects transaction: '+cause,async()=>{
 const f=fixture();await f.client.start();await f.navigate();
 f.setScanFactory(async function*(proposal){yield proposal();if(cause==='gesture')f.docEvents.get('pointerdown')({isTrusted:true});else await f.advance(6000);});
 assert.deepEqual(await f.list(),{ok:false});f.setScanFactory(null);
 assert.equal((await f.list()).total,2);assert.equal(f.docEvents.has('pointerdown'),false);f.client.stop();
});
test('current Project ACK arriving after last packet invalidates scan; next scan alone upgrades',async()=>{
 const f=fixture();await f.client.start();f.setAck('rejected');await f.navigate();
 f.setScanFactory(async function*(proposal){yield proposal();f.setAck('accepted');await f.ack();});
 assert.deepEqual(await f.list(),{ok:false});assert.equal(f.docEvents.has('pointerdown'),true,'pending upgrade was not consumed');
 f.setScanFactory(null);assert.equal((await f.list()).total,1);assert.equal(f.docEvents.has('pointerdown'),false);f.client.stop();
});
for(const change of ['silent-expiry','identity-loss'])test('streaming predicted exclusion is discarded before commit on '+change,async()=>{
 const f=fixture();await f.client.start();await f.navigate();if(change==='silent-expiry')f.setTime(4500);
 f.setScanFactory(async function*(proposal){yield proposal();if(change==='silent-expiry')f.setTime(7000);else f.setMatches(false);});
 assert.deepEqual(await f.list(),{ok:false});f.setScanFactory(null);
 assert.equal((await f.list()).total,2);f.client.stop();
});

// Round205: returning immediately must not erase an ACKed identity before its
// first candidate-list transaction commits. These are session/DOM doubles.
const returnGestures=[
 {type:'pointerdown',button:0},
 {type:'keydown',key:'Enter',repeat:false,isComposing:false},
 {type:'keydown',key:' ',repeat:false,isComposing:false}
];
async function pendingReturnFixture(){
 const f=fixture();await f.client.start();
 await f.activate((await f.list()).items[0],{role:'workspace',presentation:{offset:0,scrollTop:11,focused:true}});await drain();
 assert.equal(f.modes.at(-1),'reading');
 assert.ok(f.calls.some(m=>m.kind==='surface-delta'&&m.payload.candidates.some(r=>r.target?.nativeId===P)),'new controller emitted current Project observation');
 assert.equal(f.docEvents.has('pointerdown'),true,'identity has not yet been consumed by list commit');
 return f;
}
for(const gesture of returnGestures)test('immediate authenticated return retains pending identity: '+JSON.stringify(gesture),async()=>{
 const f=await pendingReturnFixture();
 try{
  const deadlines=[...f.timers.values()].map(t=>t.at);
  f.docEvents.get(gesture.type)({...gesture,isTrusted:true,target:'return'});
  assert.equal(f.docEvents.has('pointerdown'),true);
  assert.deepEqual([...f.timers.values()].map(t=>t.at),deadlines,'return does not renew correlation');
  await f.controller.bridge.workspaceEntered({mountId:'mount'});
  const result=await f.list('workspace');
  assert.deepEqual(result.items.map(r=>r.renderKey),['neighbor']);
  assert.equal(result.migration.ready,true,'return before commit becomes ready migration');
  assert.equal(result.migration.focusAllowed,true);
  assert.equal(f.docEvents.has('keydown'),true,'committed migration retains its own gesture hook');
 }finally{f.client.stop();}
});
for(const [name,event] of [
 ['native target',{type:'pointerdown',button:0,target:'native-composer'}],
 ['forged return',{type:'pointerdown',button:0,target:{id:'return'}}],
 ['composed native target',{type:'pointerdown',button:0,target:'return',composedPath:()=>['native']}],
 ['Tab',{type:'keydown',key:'Tab',target:'return'}],
 ['repeat',{type:'keydown',key:'Enter',repeat:true,target:'return'}],
 ['composing',{type:'keydown',key:'Enter',isComposing:true,target:'return'}],
 ['IME keyCode',{type:'keydown',key:'Enter',keyCode:229,target:'return'}],
 ['secondary pointer',{type:'pointerdown',button:2,target:'return'}],
 ['prevented',{type:'pointerdown',button:0,defaultPrevented:true,target:'return'}],
 ...['shiftKey','ctrlKey','altKey','metaKey'].map(key=>[key,{type:'keydown',key:'Enter',[key]:true,target:'return'}])
])test('pending return exemption rejects '+name,async()=>{
 const f=await pendingReturnFixture();try{
  f.docEvents.get(event.type)({...event,isTrusted:true});
  assert.equal(f.docEvents.has('pointerdown'),false);
  await f.controller.bridge.workspaceEntered({mountId:'mount'});
  const result=await f.list('workspace');assert.deepEqual(result.items.map(r=>r.renderKey),['clicked','neighbor']);assert.equal(result.migration,undefined);
 }finally{f.client.stop();}
});
test('authenticated return during streamed scan preserves transaction through commit',async()=>{
 const f=await pendingReturnFixture();try{
  f.setScanFactory(async function*(proposal){yield proposal();f.docEvents.get('pointerdown')({isTrusted:true,type:'pointerdown',button:0,target:'return'});await f.controller.bridge.workspaceEntered({mountId:'mount'});});
  const result=await f.list('workspace');assert.deepEqual(result.items.map(r=>r.renderKey),['neighbor']);assert.equal(result.migration.ready,true);
 }finally{f.client.stop();}
});
test('return target cannot exempt an unready replacement handshake',async()=>{
 const f=fixture();await f.client.start();let release;f.holdHello(new Promise(r=>release=r));
 try{await f.navigate();assert.equal(f.modes.length,1);assert.deepEqual(await f.list(),{ok:false});
  f.docEvents.get('pointerdown')({isTrusted:true,type:'pointerdown',button:0,target:'return'});assert.equal(f.docEvents.has('pointerdown'),false);
  release();await drain();assert.equal((await f.list()).total,2);
 }finally{release();f.client.stop();}
});
test('repeated authenticated return does not extend six-second identity deadline',async()=>{
 const f=await pendingReturnFixture();try{
  await f.advance(5999);f.docEvents.get('keydown')({isTrusted:true,type:'keydown',key:'Enter',target:'return'});
  assert.equal(f.docEvents.has('pointerdown'),true);await f.advance(1);
  assert.equal(f.docEvents.has('pointerdown'),false);assert.equal((await f.list()).total,2);
 }finally{f.client.stop();}
});
test('authenticated return cannot carry pending identity across scope replacement',async()=>{
 const f=await pendingReturnFixture();try{
  f.docEvents.get('pointerdown')({isTrusted:true,type:'pointerdown',button:0,target:'return'});
  await f.spa(URL,{newScope:'scopeB'});await f.controller.bridge.workspaceEntered({mountId:'mount'});
  const result=await f.list('workspace');assert.equal(result.total,2);assert.equal(result.migration,undefined);
 }finally{f.client.stop();}
});
