/** Actual UI owner/grants with explicit browser-frame and authority fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostUiOwner} from '../../src/runtime/host-ui-owner.mjs';
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function port(sender){
 const listeners=new Set();return {name:'vaiwl-ui',sender,messages:[],onDisconnect:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},disconnect(){for(const fn of [...listeners])fn();},drop(){for(const fn of [...listeners])fn();},postMessage(value){this.messages.push(structuredClone(value));}};
}
async function fixture(t,{setup=true,maxPending=128,maxPorts=128}={}){
 let time=0,sequence=0,timerSequence=0;
 const frames=new Map(),bindings=new Map(),parents=new Map(),children=new Map(),grants=new Map(),proofs=new Map(),bound=new Set(),gates=[],timers=new Map();
 for(const tabId of [1,2]){
  const parent={id:'ext',tab:{id:tabId,incognito:false},frameId:0,documentId:'parent_'+tabId,documentLifecycle:'active',url:'https://chatgpt.com/c/'+tabId};parents.set(tabId,parent);bindings.set(tabId,{documentToken:'doc_'+tabId,producerToken:'producer_'+tabId,routeEpoch:tabId});bound.add(tabId);
  proofs.set(tabId,{state:'verified',grant:{id:'scope_grant_'+tabId,scopeKey:'same-scope',scopeEpoch:1,expiresAt:new Date(100000).toISOString()}});
  frames.set(tabId+':0',{documentId:parent.documentId,url:parent.url,documentLifecycle:'active',parentFrameId:-1});
  for(const [index,role]of ['workspace','sidebar'].entries()){const child={...parent,frameId:index+1,documentId:'ui_'+tabId+'_'+role,url:'chrome-extension://ext/'+role+'.html'};children.set(tabId+':'+role,child);frames.set(tabId+':'+child.frameId,{documentId:child.documentId,url:child.url,documentLifecycle:'active',parentFrameId:0});}
 }
 const isBound=(binding,sender)=>{const expected=bindings.get(sender.tab.id),parent=parents.get(sender.tab.id);return bound.has(sender.tab.id)&&sender.documentId===parent?.documentId&&sender.url===parent.url&&Object.keys(expected).every(key=>binding[key]===expected[key]);};
 const owner=createHostUiOwner({extensionId:'ext',uiURLs:{workspace:'chrome-extension://ext/workspace.html',sidebar:'chrome-extension://ext/sidebar.html'},now:()=>time,elapsedNow:()=>time,makeId:()=>`grant_${++sequence}`,maxPending,maxPorts,schedule:(fn,ms)=>{const id=++timerSequence;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id),getFrame:async({tabId,frameId})=>{const gate=gates.find(g=>!g.hit&&g.tabId===tabId&&g.frameId===frameId);if(gate&&--gate.nth===0){gate.hit=true;gate.arrive();await gate.held;}return frames.get(tabId+':'+frameId);},handshake:{isBound,verify:async(...args)=>isBound(...args),matchesFrame:(binding,sender,actual)=>isBound(binding,sender)&&actual?.documentId===sender.documentId&&actual.url===sender.url},authority:{peek:frame=>proofs.get(frame.tabId),scopeFor:frame=>({key:proofs.get(frame.tabId)?.grant?.scopeKey})}});
 t.after(()=>{for(const gate of gates)gate.release();owner.revokeAll();});
 const message=(type,tab=1,extra={})=>({v:1,type,...bindings.get(tab),mountId:'mount_'+tab,...extra});
 const mount=(tab=1,id='mount_'+tab)=>owner.handle(message('HOST_UI_MOUNT',tab,{mountId:id,regionEpoch:1}),parents.get(tab));
 const join=(tab=1,role='workspace',nonce='nonce_'+(++sequence))=>owner.handle({v:1,type:'HOST_UI_JOIN',nonce,role},children.get(tab+':'+role));
 const confirm=(tab=1,role='workspace',nonce)=>owner.handle(message('HOST_UI_CONFIRM',tab,{regionEpoch:1,nonce,role}),parents.get(tab));
 async function pair(tab=1,role='workspace'){
  const nonce='nonce_'+(++sequence),replies=await Promise.all([join(tab,role,nonce),confirm(tab,role,nonce)]);assert(replies.every(r=>r.ok),JSON.stringify(replies));grants.set(tab+':'+role,replies[0].grant);return replies[0].grant;
 }
 if(setup)for(const tab of [1,2]){assert.equal((await mount(tab)).ok,true);for(const role of ['workspace','sidebar'])await pair(tab,role);}
 const args=(tab=1,role='workspace')=>({sender:children.get(tab+':'+role),grantId:grants.get(tab+':'+role).id,mountId:'mount_'+tab});
 const renew=(tab=1,role='workspace')=>{const {sender,...fields}=args(tab,role);return owner.handle({v:1,type:'HOST_UI_RENEW',...fields},sender);};
 const status=(tab=1)=>owner.handle(message('HOST_UI_STATUS',tab),parents.get(tab));
 function hold(tabId=1,frameId=0,nth=1){let release,arrive;const gate={tabId,frameId,nth,hit:false,held:new Promise(r=>release=r),arrived:new Promise(r=>arrive=r),release,arrive};gates.push(gate);return gate;}
 async function advance(ms){time+=ms;for(const [id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}await tick();}
 return {owner,args,renew,status,mount,pair,join,confirm,message,parents,children,proofs,frames,bound,grants,hold,advance,timers};
}

async function connected(t,options={}){const f=await fixture(t,options),ports=new Map();for(const [key,child]of f.children){const p=port(child);assert(f.owner.connectPort(p));ports.set(key,p);}assert.equal(f.timers.size,0);return {...f,ports};}
const hint={type:'VAIWL_UI_DATA_CHANGED'};
const messages=f=>[...f.ports.values()].map(p=>p.messages);
test('100 background publications share one fixed 100ms timer and both roles on two mounts receive one empty hint',async t=>{
 const f=await connected(t);for(let i=0;i<100;i++)f.owner.notifyBackground('same-scope');assert.equal(f.timers.size,1);assert(messages(f).every(m=>m.length===0));
 const timer=[...f.timers.values()][0];assert.equal(timer.at,100);await f.advance(99);f.owner.notifyBackground('same-scope');assert.equal([...f.timers.values()][0],timer);await f.advance(1);
 assert.equal(f.timers.size,0);for(const m of messages(f))assert.deepEqual(m,[hint]);
});
test('scope-wide immediate notification cancels queued background delivery without extra wake',async t=>{
 const f=await connected(t);f.owner.notifyBackground('same-scope');const old=[...f.timers.values()][0];assert.equal(f.owner.notifyScope('same-scope'),4);assert.equal(f.timers.size,0);old.fn();await f.advance(100);for(const m of messages(f))assert.deepEqual(m,[hint]);
});
for(const mode of ['notifyMount','notifyScope'])test(mode+' mount-specific immediate hint preserves other mounts queued scope delivery',async t=>{
 const f=await connected(t);f.owner.notifyBackground('same-scope');const timer=[...f.timers.values()][0];assert.equal(mode==='notifyMount'?f.owner.notifyMount('mount_1'):f.owner.notifyScope('same-scope','mount_1'),2);assert.equal([...f.timers.values()][0],timer);
 for(const role of ['workspace','sidebar']){assert.deepEqual(f.ports.get('1:'+role).messages,[hint]);assert.deepEqual(f.ports.get('2:'+role).messages,[]);}await f.advance(100);for(const role of ['workspace','sidebar']){assert.deepEqual(f.ports.get('1:'+role).messages,[hint,hint]);assert.deepEqual(f.ports.get('2:'+role).messages,[hint]);}
});
for(const mutation of ['expire','revoke-mount','revoke-parent','unbind','scope','grant-id','unverified'])test('queued delivery revalidates '+mutation+' and preserves unrelated mount',async t=>{
 const f=await connected(t);f.owner.notifyBackground('same-scope');
 if(mutation==='expire')f.proofs.get(1).grant.expiresAt=new Date(50).toISOString();if(mutation==='revoke-mount')f.owner.revokeMount('mount_1');if(mutation==='revoke-parent')f.owner.revokeDocument('parent_1');if(mutation==='unbind')f.bound.delete(1);if(mutation==='scope')f.proofs.get(1).grant.scopeKey='other';if(mutation==='grant-id')f.proofs.get(1).grant.id='other';if(mutation==='unverified')f.proofs.set(1,{state:'unverified'});
 await f.advance(100);for(const role of ['workspace','sidebar']){assert.deepEqual(f.ports.get('1:'+role).messages,[]);assert.deepEqual(f.ports.get('2:'+role).messages,[hint]);}
});
test('UI grant expiration during delayed flush sends no notification even with valid scope',async t=>{
 const f=await connected(t);f.owner.notifyBackground('same-scope');await f.advance(20000);assert(messages(f).every(m=>m.length===0));assert.equal(f.timers.size,0);
});
test('stale cancelled timer cannot consume replacement same-scope queue',async t=>{
 const f=await connected(t);f.owner.notifyBackground('same-scope');const stale=[...f.timers.values()][0];f.owner.notifyScope('same-scope');await f.advance(30);f.owner.notifyBackground('same-scope');const fresh=[...f.timers.values()][0];assert.equal(fresh.at,130);stale.fn();assert.equal([...f.timers.values()][0],fresh);assert(messages(f).every(m=>m.length===1));await f.advance(100);assert(messages(f).every(m=>m.length===2));
});
test('flush deletes queue before port callback so reentrant background publication receives a new bounded window',async t=>{
 const f=await connected(t),p=f.ports.get('1:workspace'),post=p.postMessage.bind(p);let once=false;p.postMessage=m=>{post(m);if(!once){once=true;f.owner.notifyBackground('same-scope');}};
 f.owner.notifyBackground('same-scope');await f.advance(100);assert(messages(f).every(m=>m.length===1));assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].at,200);await f.advance(100);assert(messages(f).every(m=>m.length===2));assert.equal(f.timers.size,0);
});
test('scope queue remains maxPorts bounded and overflow delivers immediate validated hint',async t=>{
 const f=await connected(t,{maxPorts:4});for(let i=0;i<4;i++)f.owner.notifyBackground('empty-scope-'+i);assert.equal(f.timers.size,4);f.owner.notifyBackground('same-scope');assert.equal(f.timers.size,4);for(const m of messages(f))assert.deepEqual(m,[hint]);await f.advance(100);assert.equal(f.timers.size,0);for(const m of messages(f))assert.deepEqual(m,[hint]);
});
test('revokeAll cancels every background timer and retained callbacks cannot notify later',async t=>{
 const f=await connected(t);f.owner.notifyBackground('same-scope');f.owner.notifyBackground('other');const stale=[...f.timers.values()];assert.equal(stale.length,2);f.owner.revokeAll();assert.equal(f.timers.size,0);for(const timer of stale)timer.fn();await f.advance(100);assert(messages(f).every(m=>m.length===0));
});
test('queued hint after revoked document remount reaches only newly authorized same-scope ports',async t=>{
 const f=await connected(t),old=[f.ports.get('1:workspace'),f.ports.get('1:sidebar')];f.owner.notifyBackground('same-scope');f.owner.revokeDocument('parent_1');
 assert.equal((await f.mount(1)).ok,true);
 for(const role of ['workspace','sidebar']){const child=f.children.get('1:'+role);child.documentId+='replacement';f.frames.get('1:'+child.frameId).documentId=child.documentId;await f.pair(1,role);const fresh=port(child);assert(f.owner.connectPort(fresh));f.ports.set('1:'+role,fresh);}
 await f.advance(100);assert(old.every(p=>p.messages.length===0));for(const m of messages(f))assert.deepEqual(m,[hint]);
});
