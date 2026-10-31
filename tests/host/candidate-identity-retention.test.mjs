import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedHandleRegistry} from '../../src/host/bounded-handle-registry.mjs';
import {createHostContentSession} from '../../src/host/content-session.mjs';
// DOM, browser transport, adapter identity certificates and surfaces are explicit
// doubles. The production content session and candidate correlation run unchanged.
const P='g-p-11111111111111111111111111111111',URL='https://chatgpt.com/g/'+P+'/project';
const drain=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function fixture({extraCandidates=0,useRegistry=false}={}){
 let registry=null,elapsed=null,retainAllowed=()=>true;
 let scanFactory=null;let present=true;let cancelClick=false;const focusCalls=[],retentions=[],releases=[];let holdHello=null;let time=1000;let scope='scopeA',documentId='browser',epoch=0,ack='accepted',matches=true,serial=0,options,controller,emit;const identity={},extraIdentities=new Map(Array.from({length:extraCandidates},(_,i)=>['extra'+i,{}])),listeners=new Set(),events=new Map(),docEvents=new Map(),timers=new Map(),modes=[],calls=[];
 const document={addEventListener:(n,f)=>docEvents.set(n,f),removeEventListener:(n,f)=>{if(docEvents.get(n)===f)docEvents.delete(n);},location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc'+epoch,producerToken:'producer'+epoch,browserDocumentId:documentId,routeEpoch:epoch,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);if(m.type==='HOST_HELLO'){epoch++;if(holdHello)await holdHello;return {binding:binding()};}if(m.type==='HOST_REFRESH')return {state:'verified',scopeKey:scope};if(m.kind==='surface-delta')return {state:ack};return {ok:true};}};
 const row=id=>({entity:'project',renderKey:id,nativeTitle:'Same',titleState:'exact',target:{kind:'live-control',control:{id},navigationURL:null}});
 const proposal=()=>({kind:'surface-delta',payload:{candidates:[...(present?[row('clicked')]:[]),row('neighbor'),...[...extraIdentities.keys()].map(row),...(document.location.href===URL?[{entity:'project',target:{kind:'resolved',nativeId:P},evidence:{fieldPaths:['current-project-route']}}]:[])]}});
 const client=createHostContentSession({document,runtime,now:()=>time,elapsedNow:()=>elapsed??time,makeId:()=> 'client',schedule:(f,ms)=>{const id=++serial;timers.set(id,{f,at:time+ms});return id;},cancel:id=>timers.delete(id),surfaceFactory:()=>({}),plansFactory:()=>({}),adapterFactory:o=>{options=o;if(useRegistry){registry=createBoundedHandleRegistry({capacity:8,maxPinned:4,now:()=>elapsed??time});for(const id of ['clicked','neighbor',...extraIdentities.keys()])registry.set(id,{id});}const plans=new Map();return {start:async()=>({}),inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,retainLoadedHandles:(owner,handles,deadline)=>{retentions.push({owner,handles:structuredClone(handles),deadline});return retainAllowed(owner)&&(!useRegistry||registry.retain(owner,handles.map(h=>h.id),deadline));},releaseLoadedHandles:owner=>{releases.push(owner);registry?.release(owner);},captureCandidateIdentity:h=>h.id==='clicked'?identity:extraIdentities.get(h.id)??null,matchesCandidateIdentity:(token,h)=>matches&&(!useRegistry||!!registry.get(h.id))&&(h.id==='clicked'?token===identity:extraIdentities.get(h.id)===token&&token!==undefined),loadedPages:()=>scanFactory?scanFactory(proposal):(async function*(){yield proposal();})(),readLoaded:async()=>[proposal()],planNavigation:target=>{const p={mode:'native-control',target,control:target.control,planRevision:++serial};plans.set('key'+p.planRevision,p);return p;},planKey:p=>'key'+p.planRevision,dispatchNative:async command=>{assert.equal(await o.authorize(command),true);o.beforeDispatch();const event={actionId:command.actionId,command,plan:plans.get(command.targetKey)};o.onNativeDispatch(event);if(cancelClick){o.onNativeDispatchCancelled(event);return {state:'unconfirmed'};}document.location.href=URL;o.onRebindNeeded();return {state:'dispatched'};}};},controllerFactory:o=>{let mode=o.initialMode;controller=o;modes.push(o.initialMode);return {start:async c=>{emit=c.emit;await emit(proposal());return {id:'mount'};},stop(){},presentationMode:()=>mode,beginNativeDispatch:()=>{mode='reading';return ()=>{};},showReading:()=>{mode='reading';return true;},showWorkspace:()=>{mode='workspace';return true;},focusFrame:role=>{focusCalls.push(role);return true;},isReturnTarget:node=>node==='return'};}});
 const list=(role)=>new Promise(resolve=>[...listeners][0]({type:'HOST_CANDIDATES',...(({documentToken,producerToken,routeEpoch})=>({documentToken,producerToken,routeEpoch}))(binding()),phase:'list',...(role?{role}:{})},{id:'extension'},resolve));
 async function navigate({beforeRoute=()=>{},cancel=false,newScope=scope,newDocument=documentId,nodeMatches=true,controlId='clicked'}={}){const old=options,event={actionId:'action',plan:{target:{kind:'live-control'},control:{id:controlId}}};old.onNativeDispatch(event);if(cancel)old.onNativeDispatchCancelled(event);await beforeRoute();scope=newScope;documentId=newDocument;matches=nodeMatches;document.location.href=URL;old.onRebindNeeded();await drain();return old;}
 const activate=(candidate,display)=>new Promise(resolve=>[...listeners][0]({type:'HOST_CANDIDATES',documentToken:binding().documentToken,producerToken:binding().producerToken,routeEpoch:binding().routeEpoch,phase:'activate',candidate,actionId:'realAction',uiGrantId:'grant',mountId:'mount',expiresAt:new Date(time+6000).toISOString(),display},{id:'extension'},resolve));
 return {get registry(){return registry;},setElapsed:v=>elapsed=v,setRetainAllowed:fn=>retainAllowed=fn,churn(){for(let i=0;i<100;i++)registry.set('churn'+i,{id:'churn'+i});},retentions,releases,setScanFactory:f=>scanFactory=f,client,list,activate,focusCalls,setPresent:v=>present=v,async spa(url,{newScope=scope,newDocument=documentId}={}){scope=newScope;documentId=newDocument;document.location.href=url;options.onRebindNeeded();await drain();},setCancelClick:v=>cancelClick=v,listener:()=>[...listeners][0],binding,navigate,modes,calls,document,holdHello:p=>holdHello=p,docEvents,timers,events,setTime:v=>time=v,setMatches:v=>matches=v,async advance(ms){time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.f();}await drain();},setAck:v=>ack=v,ack:()=>emit(proposal()),get options(){return options;},get controller(){return controller;}};
}

test('actual content-session scan retains excluded pending upgrade and learned identity handles',async()=>{
 const f=fixture();await f.client.start();await f.navigate();f.retentions.length=0;
 const upgraded=await f.list();assert.deepEqual(upgraded.items.map(x=>x.renderKey),['neighbor']);
 assert.equal(f.retentions.length,1);assert.deepEqual(f.retentions[0].handles.map(h=>h.id).sort(),['clicked','neighbor']);assert.equal(f.retentions[0].deadline,7000);assert(f.releases.includes(f.retentions[0].owner));
 // Upgrade has committed; a fresh scan follows the learned/upgraded exclusion path.
 f.retentions.length=0;assert.equal((await f.list()).total,1);assert.deepEqual(f.retentions[0].handles.map(h=>h.id).sort(),['clicked','neighbor']);assert.equal(f.retentions[0].deadline,7000);f.client.stop();
});
for(const change of ['stop','route'])test('actual identity transaction cannot continue retaining after '+change,async()=>{
 const f=fixture();await f.client.start();await f.navigate();await f.list();f.retentions.length=0;
 let release,entered;const held=new Promise(r=>release=r),seen=new Promise(r=>entered=r);
 f.setScanFactory(async function*(proposal){yield proposal();entered();await held;yield {kind:'surface-delta',payload:{candidates:[]}};});
 const pending=f.list();await seen;assert.equal(f.retentions.length,1);const owner=f.retentions[0].owner;
 assert.deepEqual(f.retentions[0].handles.map(h=>h.id).sort(),['clicked','neighbor']);
 if(change==='stop')f.client.stop();else f.document.location.href='https://chatgpt.com/c/11111111-1111-4111-8111-111111111111';
 release();assert.deepEqual(await pending,{ok:false});assert.equal(f.retentions.length,1);assert.equal(f.releases.filter(value=>value===owner).length,1);f.client.stop();
});
test('failed identity scan releases retained excluded handles without consuming learned state',async()=>{
 const f=fixture();await f.client.start();await f.navigate();await f.list();f.retentions.length=0;
 f.setScanFactory(async function*(proposal){yield proposal();throw Error('tail-failure');});
 assert.deepEqual(await f.list(),{ok:false});assert.equal(f.retentions.length,1);assert.deepEqual(f.retentions[0].handles.map(h=>h.id).sort(),['clicked','neighbor']);assert(f.releases.includes(f.retentions[0].owner));
 f.setScanFactory(null);assert.deepEqual((await f.list()).items.map(x=>x.renderKey),['neighbor']);f.client.stop();
});

const migrationOwner='candidate-migration_realAction';
async function migrationFixture(){
 const f=fixture({useRegistry:true});await f.client.start();await f.activate((await f.list()).items[0],{role:'workspace',presentation:{offset:0,scrollTop:81,focused:true}});await drain();return f;
}
test('committed migration owns an independent original-deadline pin after scan release and background churn',async()=>{
 const f=await migrationFixture();assert((await f.list('workspace')).migration);
 const issued=f.retentions.filter(x=>x.owner===migrationOwner);assert.equal(issued.length,1);assert.deepEqual(issued[0].handles,[{id:'clicked'}]);assert.equal(issued[0].deadline,31000);assert.equal(f.releases.includes(migrationOwner),false);
 assert.equal(f.registry.stats().owners,1,'window lease released but migration remains');f.churn();assert(f.registry.get('clicked'));
 await f.controller.bridge.workspaceEntered({mountId:'mount'});assert.deepEqual(f.focusCalls,['workspace']);assert.equal(f.releases.includes(migrationOwner),false);f.client.stop();assert.equal(f.releases.filter(x=>x===migrationOwner).length,1);
});
test('migration handle refresh uses same owner and original absolute deadline',async()=>{
 const f=await migrationFixture();await f.list('workspace');f.setElapsed(5000);assert((await f.list('workspace')).migration);
 const issued=f.retentions.filter(x=>x.owner===migrationOwner);assert.equal(issued.length,2);assert(issued.every(x=>x.deadline===31000));assert.equal(f.registry.stats().owners,1);f.client.stop();
});
for(const change of ['stop','route','identity-loss'])test('committed migration releases owner on '+change,async()=>{
 const f=await migrationFixture();await f.list('workspace');
 if(change==='stop')f.client.stop();if(change==='route')await f.spa('https://chatgpt.com/c/11111111-1111-4111-8111-111111111111');if(change==='identity-loss'){f.setMatches(false);await f.controller.bridge.workspaceEntered({mountId:'mount'});}
 assert.equal(f.releases.filter(x=>x===migrationOwner).length,1);assert.deepEqual(f.focusCalls,[]);f.client.stop();assert.equal(f.releases.filter(x=>x===migrationOwner).length,1);
});
for(const elapsed of [31000,999,NaN])test('migration elapsed expiry or invalid clock prevents focus: '+elapsed,async()=>{
 const f=await migrationFixture();await f.list('workspace');f.setElapsed(elapsed);await f.controller.bridge.workspaceEntered({mountId:'mount'});assert.deepEqual(f.focusCalls,[]);assert.equal(f.releases.filter(x=>x===migrationOwner).length,1);f.client.stop();
});
for(const phase of ['creation','refresh'])test('migration retention '+phase+' failure never transfers focus',async()=>{
 const f=await migrationFixture();if(phase==='refresh')await f.list('workspace');f.setRetainAllowed(owner=>owner!==migrationOwner);
 const result=await f.list('workspace');assert.equal(result.migration,undefined);await f.controller.bridge.workspaceEntered({mountId:'mount'});assert.deepEqual(f.focusCalls,[]);assert.equal(f.registry.stats().owners,0);f.client.stop();
});
