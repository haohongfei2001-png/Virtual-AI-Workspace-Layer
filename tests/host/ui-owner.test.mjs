/** Owner API contracts with explicit frame/handshake/authority test doubles. */
import test from 'node:test';import assert from 'node:assert/strict';
import {createHostUiOwner} from '../../src/runtime/host-ui-owner.mjs';
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(){let time=0,id=0,delay=null;const timers=new Map();const parent={id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:'parent',documentLifecycle:'active',url:'https://chatgpt.com/'},ui={...parent,frameId:2,documentId:'ui',url:'chrome-extension://ext/ui.html'};
 const getFrame=async({frameId})=>{if(delay)await delay;const s=frameId===0?parent:ui;return {documentId:s.documentId,url:s.url,documentLifecycle:'active',parentFrameId:frameId===0?-1:0};};
 const owner=createHostUiOwner({extensionId:'ext',uiURL:ui.url,getFrame,handshake:{verify:async(m,s)=>s.documentId===parent.documentId&&m.documentToken==='doc'&&m.producerToken==='producer'&&m.routeEpoch===1,matchesFrame:(m,s,f)=>f.documentId===s.documentId&&f.url===s.url},authority:{peek:()=>({state:'verified',grant:{id:'scope',scopeKey:'scope-key',scopeEpoch:1,expiresAt:new Date(100000).toISOString()}})},now:()=>time,elapsedNow:()=>time,makeId:()=>`grant_${++id}`,maxPending:1,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key)});
 const binding={documentToken:'doc',producerToken:'producer',routeEpoch:1};const msg=(type,extra={})=>({v:1,type,...extra});
 return {owner,parent,ui,timers,async mount(){assert.equal((await owner.handle(msg('HOST_UI_MOUNT',{...binding,mountId:'mount',regionEpoch:1}),parent)).ok,true);},confirm:(nonce='nonce',extra={})=>owner.handle(msg('HOST_UI_CONFIRM',{...binding,mountId:'mount',regionEpoch:1,nonce,role:'workspace',...extra}),parent),join:(nonce='nonce',extra={},sender=ui)=>owner.handle(msg('HOST_UI_JOIN',{nonce,role:'workspace',...extra}),sender),release:()=>owner.handle(msg('HOST_UI_RELEASE',{...binding,mountId:'mount'}),parent),renew:grant=>owner.handle(msg('HOST_UI_RENEW',{grantId:grant.id,mountId:'mount'}),ui),block(){let resolve;delay=new Promise(r=>resolve=r);return ()=>{delay=null;resolve();};},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await tick();}};
}
for(const order of ['parent','ui'])test(`MOCK dual channel ${order} first gets identical grant and renew/release`,async()=>{const f=fixture();await f.mount();const first=order==='parent'?f.confirm():f.join();await tick();const second=order==='parent'?f.join():f.confirm();const [a,b]=await Promise.all([first,second]);assert(a.ok&&b.ok,JSON.stringify([a,b]));assert.deepEqual(a.grant,b.grant);assert.equal((await f.renew(a.grant)).ok,true);assert.equal((await f.release()).ok,true);await assert.rejects(f.owner.validate({sender:f.ui,grantId:a.grant.id,mountId:'mount'}));assert.equal(f.timers.size,0);});
test('MOCK wrong WAR role binding and mount fail closed',async()=>{const f=fixture();await f.mount();assert.equal((await f.join('a',{}, {...f.ui,url:'chrome-extension://ext/other.html'})).ok,false);assert.equal((await f.join('b',{role:'invalid'})).ok,false);assert.equal((await f.confirm('c',{documentToken:'wrong'})).ok,false);assert.equal((await f.confirm('d',{mountId:'unknown'})).ok,false);assert.equal(f.timers.size,0);});
test('MOCK unpaired channel expires at six seconds and frees pending capacity',async()=>{const f=fixture();await f.mount();const pending=f.join();await tick();await f.advance(6000);assert.equal((await pending).ok,false);const a=f.confirm('new');await tick();const b=f.join('new');const results=await Promise.all([a,b]);assert.ok(results.every(r=>r.ok),JSON.stringify(results));});
test('MOCK late pairing after deadline must not publish or retain grant',async()=>{const f=fixture();await f.mount();const a=f.join();await tick();const unblock=f.block(),b=f.confirm();await tick();await f.advance(6000);assert.equal((await a).ok,false);assert.equal((await b).ok,false);unblock();await tick();const next=f.confirm('fresh');await tick();const joined=f.join('fresh');const replies=await Promise.all([next,joined]);assert.ok(replies.every(r=>r.ok),JSON.stringify(replies));});
test('MOCK release during in-flight pair cannot authorize late UI',async()=>{const f=fixture();await f.mount();const a=f.confirm();await tick();const unblock=f.block(),b=f.join();await tick();f.owner.revokeDocument('parent');unblock();const [x,y]=await Promise.all([a,b]);assert.equal(x.ok,false);assert.equal(y.ok,false);});
test('MOCK late pair completion after both timed out cannot leave usable grant',async()=>{const f=fixture();await f.mount();const a=f.confirm();await tick();const unblock=f.block(),b=f.join();await tick();await f.advance(6000);assert.equal((await a).ok,false);assert.equal((await b).ok,false);unblock();await tick();for(let i=1;i<12;i++)await assert.rejects(f.owner.validate({sender:f.ui,grantId:`grant_${i}`,mountId:'mount'}));});
function mockPort(sender,name='vaiwl-ui'){
 const listeners=new Set();return {name,sender,disconnects:0,onDisconnect:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},disconnect(){this.disconnects++;for(const fn of [...listeners])fn();},drop(){for(const fn of [...listeners])fn();}};
}
async function pair(f){await f.mount();const a=f.confirm();await tick();const [x,y]=await Promise.all([a,f.join()]);assert(x.ok&&y.ok);return y.grant;}
test('MOCK verified parent/mount/tab invalidation synchronously disconnects UI port',async()=>{
 for(const action of [f=>f.owner.revokeDocument('parent'),f=>f.owner.revokeMount('mount'),f=>f.owner.revokeTab(1),f=>f.owner.revokeAll()]){
  const f=fixture(),port=mockPort(f.ui);assert.equal(f.owner.connectPort(port),true);const grant=await pair(f);action(f);assert.equal(port.disconnects,1);await assert.rejects(f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}));
 }
});
test('MOCK port opened after authorized pairing attaches to exact document ledger',async()=>{const f=fixture(),grant=await pair(f),port=mockPort(f.ui);assert.equal(f.owner.connectPort(port),true);f.owner.revokeDocument('parent');assert.equal(port.disconnects,1);assert.equal((await f.renew(grant)).ok,false);});
test('MOCK authorized port disconnect revokes that UI grant and sibling ports only',async()=>{
 const f=fixture(),a=mockPort(f.ui),b=mockPort(f.ui),other=mockPort({...f.ui,documentId:'unrelated',frameId:3});f.owner.connectPort(a);f.owner.connectPort(b);f.owner.connectPort(other);const grant=await pair(f);a.drop();assert.equal(b.disconnects,1);assert.equal(other.disconnects,0);await assert.rejects(f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}));
});
test('MOCK unpaired WAR port disconnect cannot revoke a different authorized document',async()=>{const f=fixture(),port=mockPort({...f.ui,documentId:'other',frameId:3});assert.equal(f.owner.connectPort(port),true);const grant=await pair(f);port.drop();assert.equal((await f.renew(grant)).ok,true);});
test('MOCK forged or top-frame port cannot authorize or disconnect valid UI',async()=>{
 const f=fixture(),good=mockPort(f.ui);f.owner.connectPort(good);const grant=await pair(f);
 for(const [sender,name]of [[{...f.ui,id:'foreign'},'vaiwl-ui'],[f.parent,'vaiwl-ui'],[{...f.ui,tab:{id:1,incognito:true}},'vaiwl-ui'],[f.ui,'other'],[{...f.ui,url:'chrome-extension://ext/other.html'},'vaiwl-ui']]){const bad=mockPort(sender,name);assert.equal(f.owner.connectPort(bad),false);bad.drop();}
 assert.equal(good.disconnects,0);assert.equal((await f.renew(grant)).ok,true);
});
test('MOCK valid-looking unpaired port is not a grant and registry remains bounded',async()=>{
 const f=fixture();for(let i=0;i<128;i++)assert.equal(f.owner.connectPort(mockPort({...f.ui,documentId:`anonymous_${i}`,frameId:i+1})),true);
 assert.equal(f.owner.connectPort(mockPort({...f.ui,documentId:'overflow'})),false);await assert.rejects(f.owner.validate({sender:f.ui,grantId:'made-up',mountId:'mount'}));f.owner.revokeAll();assert.equal(f.owner.connectPort(mockPort(f.ui)),true);
});
test('MOCK release disconnects paired UI but tab invalidation does not touch other tabs',async()=>{const f=fixture(),port=mockPort(f.ui),other=mockPort({...f.ui,tab:{id:2,incognito:false},documentId:'other'});f.owner.connectPort(port);f.owner.connectPort(other);await pair(f);assert.equal((await f.release()).ok,true);assert.equal(port.disconnects,1);assert.equal(other.disconnects,0);f.owner.revokeTab(1);assert.equal(other.disconnects,0);});
test('MOCK port disconnect before parent half revokes pending UI join, preventing late grant',async()=>{
 const f=fixture(),port=mockPort(f.ui);assert.equal(f.owner.connectPort(port),true);await f.mount();
 const pending=f.join();await tick();port.drop();
 const confirmed=await f.confirm();assert.equal(confirmed.ok,false);
 assert.equal((await pending).ok,false);
 for(let i=1;i<12;i++)await assert.rejects(f.owner.validate({sender:f.ui,grantId:`grant_${i}`,mountId:'mount'}));
});
test('MOCK port disconnect during actual frame check rejects both late pairing replies',async()=>{
 const f=fixture(),port=mockPort(f.ui);f.owner.connectPort(port);await f.mount();
 const confirmed=f.confirm();await tick();const unblock=f.block(),joined=f.join();await tick();
 port.drop();unblock();const replies=await Promise.all([confirmed,joined]);assert(replies.every(r=>r.ok===false));
});
