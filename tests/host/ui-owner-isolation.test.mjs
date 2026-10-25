/** Actual UI owner/grants with explicit browser-frame and authority fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostUiOwner} from '../../src/runtime/host-ui-owner.mjs';
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function port(sender){
 const listeners=new Set();return {name:'vaiwl-ui',sender,onDisconnect:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},disconnect(){for(const fn of [...listeners])fn();},drop(){for(const fn of [...listeners])fn();},postMessage(){}};
}
async function fixture(t,{setup=true,maxPending=128,maxPorts=128,onRevokeDocument=()=>{}}={}){
 let time=0,sequence=0,timerSequence=0;
 const frames=new Map(),bindings=new Map(),parents=new Map(),children=new Map(),grants=new Map(),proofs=new Map(),bound=new Set(),gates=[],timers=new Map();
 for(const tabId of [1,2]){
  const parent={id:'ext',tab:{id:tabId,incognito:false},frameId:0,documentId:'parent_'+tabId,documentLifecycle:'active',url:'https://chatgpt.com/c/'+tabId};parents.set(tabId,parent);bindings.set(tabId,{documentToken:'doc_'+tabId,producerToken:'producer_'+tabId,routeEpoch:tabId});bound.add(tabId);
  proofs.set(tabId,{state:'verified',grant:{id:'scope_grant_'+tabId,scopeKey:'same-scope',scopeEpoch:1,expiresAt:new Date(100000).toISOString()}});
  frames.set(tabId+':0',{documentId:parent.documentId,url:parent.url,documentLifecycle:'active',parentFrameId:-1});
  for(const [index,role]of ['workspace','sidebar'].entries()){const child={...parent,frameId:index+1,documentId:'ui_'+tabId+'_'+role,url:'chrome-extension://ext/'+role+'.html'};children.set(tabId+':'+role,child);frames.set(tabId+':'+child.frameId,{documentId:child.documentId,url:child.url,documentLifecycle:'active',parentFrameId:0});}
 }
 const isBound=(binding,sender)=>{const expected=bindings.get(sender.tab.id),parent=parents.get(sender.tab.id);return bound.has(sender.tab.id)&&sender.documentId===parent?.documentId&&sender.url===parent.url&&Object.keys(expected).every(key=>binding[key]===expected[key]);};
 const owner=createHostUiOwner({onRevokeDocument,extensionId:'ext',uiURLs:{workspace:'chrome-extension://ext/workspace.html',sidebar:'chrome-extension://ext/sidebar.html'},now:()=>time,elapsedNow:()=>time,makeId:()=>`grant_${++sequence}`,maxPending,maxPorts,schedule:(fn,ms)=>{const id=++timerSequence;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id),getFrame:async({tabId,frameId})=>{const gate=gates.find(g=>!g.hit&&g.tabId===tabId&&g.frameId===frameId);if(gate&&--gate.nth===0){gate.hit=true;gate.arrive();await gate.held;}return frames.get(tabId+':'+frameId);},handshake:{isBound,verify:async(...args)=>isBound(...args),matchesFrame:(binding,sender,actual)=>isBound(binding,sender)&&actual?.documentId===sender.documentId&&actual.url===sender.url},authority:{peek:frame=>proofs.get(frame.tabId),scopeFor:frame=>({key:proofs.get(frame.tabId)?.grant?.scopeKey})}});
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
const operations={
 withScope:{nth:2,start:h=>h.owner.withScope(h.args(),()=> 'healthy')},
 renew:{nth:3,start:h=>h.renew()},
 status:{nth:4,start:h=>h.status()}
};
const settle=promise=>promise.then(value=>({value}),error=>({error:error.message}));
const succeeds=(kind,outcome)=>kind==='withScope'?outcome.value==='healthy':outcome.value?.ok===true;
for(const [kind,operation]of Object.entries(operations))for(const other of ['parent','mount','tab','port'])test(`L ${kind}: unrelated same-scope tab ${other} revocation does not reject in-flight authorization`,async t=>{
 const h=await fixture(t),gate=h.hold(1,0,operation.nth),otherPort=port(h.children.get('2:workspace'));assert(h.owner.connectPort(otherPort));
 const pending=settle(operation.start(h));await gate.arrived;
 if(other==='parent')h.owner.revokeDocument('parent_2');else if(other==='mount')h.owner.revokeMount('mount_2');else if(other==='tab')h.owner.revokeTab(2);else otherPort.drop();
 gate.release();const result=await pending;assert(succeeds(kind,result),JSON.stringify(result));
 await assert.rejects(h.owner.withScope(h.args(2),()=> 'revoked work'));
});
for(const [kind,operation]of Object.entries(operations))for(const target of ['parent','ui','mount','tab','all','port','scope-epoch','scope-key','scope-id','binding','actual-document','replacement'])test(`L ${kind}: final await still fences actual ${target} invalidation`,async t=>{
 const h=await fixture(t),old=h.args(),gate=h.hold(1,0,operation.nth),ownPort=port(h.children.get('1:workspace'));assert(h.owner.connectPort(ownPort));
 const pending=settle(operation.start(h));await gate.arrived;
 if(target==='parent')h.owner.revokeDocument('parent_1');else if(target==='ui')h.owner.revokeDocument('ui_1_workspace');else if(target==='mount')h.owner.revokeMount('mount_1');else if(target==='tab')h.owner.revokeTab(1);else if(target==='all')h.owner.revokeAll();else if(target==='port')ownPort.drop();else if(target==='scope-epoch')h.proofs.get(1).grant.scopeEpoch++;else if(target==='scope-key')h.proofs.get(1).grant.scopeKey='different';else if(target==='scope-id')h.proofs.get(1).grant.id='replacement';else if(target==='binding')h.bound.delete(1);else if(target==='actual-document')h.frames.get('1:0').documentId='replacement';else await h.pair(1,'workspace');
 gate.release();const result=await pending;assert(!succeeds(kind,result),JSON.stringify(result));
 if(target==='replacement'){await assert.rejects(h.owner.validate(old));assert.equal((await h.owner.validate(h.args())).id,h.args().grantId);}
});
for(const kind of ['withScope','renew'])test(`L ${kind}: revoking sibling role leaves the current role authorized`,async t=>{
 const h=await fixture(t),operation=operations[kind],gate=h.hold(1,0,operation.nth),pending=settle(operation.start(h));await gate.arrived;h.owner.revokeDocument('ui_1_sidebar');gate.release();assert(succeeds(kind,await pending));await assert.rejects(h.owner.validate(h.args(1,'sidebar')));
});
for(const nth of [1,3,4])test(`L STATUS captures both original roles and rejects workspace replacement at parent check ${nth}`,async t=>{
 const h=await fixture(t),gate=h.hold(1,0,nth),pending=h.status();await gate.arrived;await h.pair(1,'workspace');gate.release();assert.equal((await pending).ok,false);assert.equal((await h.status()).ok,true);
});
test('L STATUS omits revoked sidebar after both renewals while retaining workspace',async t=>{const h=await fixture(t),gate=h.hold(1,0,4),pending=h.status();await gate.arrived;h.owner.revokeDocument('ui_1_sidebar');gate.release();const result=await pending;assert.equal(result.ok,true);assert.deepEqual(result.grants.map(g=>g.role),['workspace']);});
test('L synchronous withScope guard sees same-role replacement while work is pending',async t=>{
 const h=await fixture(t);let release,entered;const held=new Promise(r=>release=r),arrived=new Promise(r=>entered=r);let context;
 const pending=settle(h.owner.withScope(h.args(),async value=>{context=value;entered();await held;return 'stale';}));await arrived;assert.equal(context.isCurrent(),true);await h.pair(1,'workspace');assert.equal(context.isCurrent(),false);release();assert.equal(typeof (await pending).error,'string');
});
test('L final validate returns current renewed grant without rolling the remembered lease back',async t=>{
 const h=await fixture(t),args=h.args(),gate=h.hold(1,0,2),pending=h.owner.validate(args);await gate.arrived;await h.advance(1000);const renewed=await h.renew();assert(renewed.ok);gate.release();assert.deepEqual(await pending,renewed.grant);assert.deepEqual(await h.owner.validate(args),renewed.grant);
});
test('L STATUS final pair uses current same-grant renewals and does not reject object replacement',async t=>{
 const h=await fixture(t),gate=h.hold(1,0,4),pending=h.status();await gate.arrived;await h.advance(1000);const renewed=await h.renew();gate.release();const result=await pending;assert(result.ok);assert.deepEqual(result.grants.find(g=>g.role==='workspace'),renewed.grant);
});
for(const kind of ['renew','status'])test(`L ${kind}: six-second timeout rejects late result and releases in-flight capacity`,async t=>{
 const h=await fixture(t),gate=h.hold(1,0,operations[kind].nth),pending=operations[kind].start(h);await gate.arrived;await h.advance(6000);assert.equal((await pending).ok,false);gate.release();await tick();assert.equal(h.timers.size,0);if(kind==='renew')await assert.rejects(h.owner.validate(h.args()),/ui-grant/,'the timed-out request still retires its own current grant');assert.equal((await h.mount(2,'after_timeout')).ok,true);
});
for(const target of ['document','tab','all'])test(`L pending MOUNT cannot register after ${target} revocation before its first browser reply`,async t=>{
 const h=await fixture(t,{setup:false}),gate=h.hold(),pending=h.mount();await gate.arrived;if(target==='document')h.owner.revokeDocument('parent_1');else if(target==='tab')h.owner.revokeTab(1);else h.owner.revokeAll();gate.release();assert.equal((await pending).ok,false);assert.equal((await h.mount()).ok,true,'late request did not leave a registration');
});
test('L revokeTab cancels a UI-only JOIN with no registration, remembered document, or port',async t=>{
 const h=await fixture(t,{setup:false}),joining=h.join(1,'workspace','old_nonce');await tick();h.owner.revokeTab(1);assert.equal((await h.mount()).ok,true);const confirmed=await h.confirm(1,'workspace','old_nonce');await h.advance(6000);assert.equal(confirmed.ok,false);assert.equal((await joining).ok,false);assert((await h.pair()).id);
});
for(const target of ['document','tab','all','port'])test(`L unremembered JOIN pairing cannot return after ${target} revocation`,async t=>{
 const h=await fixture(t,{setup:false});assert.equal((await h.mount()).ok,true);const ownPort=port(h.children.get('1:workspace'));h.owner.connectPort(ownPort);
 const nonce='pending_pair',joining=h.join(1,'workspace',nonce),gate=h.hold(),confirming=h.confirm(1,'workspace',nonce);await gate.arrived;
 if(target==='document')h.owner.revokeDocument('ui_1_workspace');else if(target==='tab')h.owner.revokeTab(1);else if(target==='all')h.owner.revokeAll();else ownPort.drop();gate.release();const replies=await Promise.all([joining,confirming]);assert(replies.every(reply=>!reply.ok),JSON.stringify(replies));
});
test('L bounded in-flight capacity fails closed, then frees every completed or timed-out request',async t=>{
 const h=await fixture(t,{setup:false,maxPending:1,maxPorts:1});
 for(const timeout of [false,true]){
  const gates=[h.hold(),h.hold(),h.hold()],requests=gates.map((_,index)=>h.mount(1,`capacity_${timeout}_${index}`));await Promise.all(gates.map(g=>g.arrived));assert.equal((await h.mount(1,'overflow')).ok,false);
  if(timeout){await h.advance(6000);assert((await Promise.all(requests)).every(reply=>!reply.ok));}for(const gate of gates)gate.release();const replies=await Promise.all(requests);if(!timeout)assert(replies.every(reply=>reply.ok));await tick();assert.equal(h.timers.size,0);assert.equal((await h.mount(1,`freed_${timeout}`)).ok,true);
 }
});
test('L late revoked renewal cannot revoke a fresh same-document replacement mount',async t=>{
 const h=await fixture(t),gate=h.hold(1,0,3),pending=h.renew();await gate.arrived;h.owner.revokeMount('mount_1');assert.equal((await h.mount()).ok,true);await h.pair(1,'workspace');await h.pair(1,'sidebar');gate.release();assert.equal((await pending).ok,false);assert.equal((await h.status()).ok,true,'old response cannot clear fresh role grants');
});
test('L late revoked renewal cannot revoke a fresh same-document role grant',async t=>{
 const h=await fixture(t),gate=h.hold(1,0,3),pending=h.renew();await gate.arrived;h.owner.revokeDocument('ui_1_workspace');await h.pair(1,'workspace');gate.release();assert.equal((await pending).ok,false);assert.equal((await h.status()).ok,true,'old response cannot clear fresh role grant');
});
test('L timed-out old renewal cannot revoke a newer same-document role JOIN',async t=>{
 const h=await fixture(t),gate=h.hold(1,0,3),pending=h.renew();await gate.arrived;await h.pair(1,'workspace');await h.advance(6000);assert.equal((await pending).ok,false);gate.release();await tick();assert.equal((await h.status()).ok,true);
});

test('expired sibling document retirement notifies recovery before later mount cleanup',async t=>{
 const retired=[],h=await fixture(t,{onRevokeDocument:id=>retired.push(id)});await h.advance(10000);assert((await h.renew(2)).ok);retired.length=0;await h.advance(10001);await h.owner.validate(h.args(2));assert(retired.includes('ui_1_workspace'));assert(!retired.includes('ui_2_workspace'));h.owner.revokeMount('mount_1');
});

test('optional role release invalidates pending joins and permits a new child without replacing workspace',{timeout:2000},async t=>{
 const h=await fixture(t);const original=h.grants.get('1:workspace').id;
 h.owner.revokeDocument('ui_1_sidebar');
 const gate=h.hold(1,2,1),pending=h.join(1,'sidebar','old-sidebar-join'),confirming=h.confirm(1,'sidebar','old-sidebar-join');await gate.arrived;
 const released=await h.owner.handle(h.message('HOST_UI_ROLE_RELEASE',1,{role:'sidebar'}),h.parents.get(1));assert.equal(released.ok,true);
 gate.release();await tick();await h.advance(6000);assert.equal((await pending).ok,false);assert.equal((await confirming).ok,false);
 const fresh=await h.pair(1,'sidebar');assert(fresh.id);const status=await h.status();assert.equal(status.ok,true);assert.equal(status.grants.find(g=>g.role==='workspace').id,original);
});
