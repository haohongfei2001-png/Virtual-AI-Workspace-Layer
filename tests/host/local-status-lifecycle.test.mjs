import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
// Exact test-only fixture boundaries; no tests executed and no product source rewritten.
function loadFixture(file,end,dependencyName,dependency){
 const source=readFileSync(new URL(file,import.meta.url),'utf8');assert.equal(source.split(end).length,2,'fixture boundary must remain unique');
 const prefix=source.slice(0,source.indexOf(end)).replace(/^import .*;\n/gm,'');
 return new Function('assert',dependencyName,prefix+'\nreturn fixture;')(assert,dependency);
}
const surfaceFixture=loadFixture('./surface-controller.test.mjs',"\ntest('owner registration and workspace UiGrant gate workspace; sidebar joins independently'",'createSurfaceController',createSurfaceController);
const contentFixture=loadFixture('./content-renewal-context-recovery.test.mjs','\nasync function denied(','createHostContentSession',createHostContentSession);
function passive(f,expected){
 const inspect=f.adapter.inspect,before=JSON.stringify(f.calls),timers=[...f.timers.keys()];let inspections=0;
 f.adapter.inspect=()=>{inspections++;throw Error('status must not inspect native DOM');};
 try{for(let i=0;i<4;i++)assert.equal(f.controller.localStatus(),expected);assert.equal(inspections,0);assert.equal(JSON.stringify(f.calls),before);assert.deepEqual([...f.timers.keys()],timers);}finally{f.adapter.inspect=inspect;}
}
async function mounted(t){const f=surfaceFixture();t.after(()=>f.controller.stop());await f.controller.start({});await f.both();passive(f,'ready');return f;}
test('controller status moves through startup and each grant without inspecting or requesting',async t=>{
 const f=surfaceFixture();t.after(()=>f.controller.stop());passive(f,'surface-controller-absent');let release;
 f.bridge.registerMount=()=>new Promise(resolve=>{release=resolve;});const started=f.controller.start({});await drain();passive(f,'connecting');release({ok:true});await started;passive(f,'connecting');
 f.message();await drain();passive(f,'ready');f.message('sidebar');await drain();passive(f,'ready');
});
for(const kind of ['revoke','stop','grant-expiry','binding-expiry','route','detached-frame','replacement-window','foreign-owner'])test('controller status refuses '+kind+' locally',async t=>{
 const f=await mounted(t);
 if(kind==='revoke')f.controller.revoke();
 if(kind==='stop')f.controller.stop();
 if(kind==='grant-expiry'){f.timers.clear();f.tick(20000);}
 if(kind==='binding-expiry')f.binding.expiresAt=new Date(999).toISOString();
 if(kind==='route')f.doc.location.href+='c/another';
 if(kind==='detached-frame')f.frames[0].frame.isConnected=false;
 if(kind==='replacement-window')f.frames[0].frame.contentWindow={};
 if(kind==='foreign-owner')f.frames[0].frame.ownerDocument={};
 passive(f,({'revoke':'surface-controller-absent','stop':'surface-controller-absent','grant-expiry':'surface-grants-expired','binding-expiry':'surface-binding-expired','route':'surface-document-stale'})[kind]??'surface-frames-detached');
});
test('dormant status requires both original idle ACKs and connected frames but never renews expired lease',async t=>{
 const f=await mounted(t),messages=[];f.surface.visibility=()=>({workspace:false,sidebar:false});
 for(const entry of f.frames)entry.frame.contentWindow.postMessage=message=>messages.push(message);
 f.controller.showReading();assert.equal(f.controller.enterDormant(),true);passive(f,'unavailable');
 for(const message of messages){f.message(message.role,{data:{type:'VAIWL_UI_IDLE_ACK',role:message.role,requestId:message.requestId}});await drain();}
 passive(f,'dormant');f.tick(60000);passive(f,'dormant');assert.equal(f.calls.updates.length,0);f.frames[1].frame.isConnected=false;passive(f,'unavailable');
});
function contentPassive(f,expected){const before=JSON.stringify(f.calls);for(let i=0;i<4;i++)assert.equal(f.session.localStatus(),expected);assert.equal(JSON.stringify(f.calls),before,'local reads cannot invoke handshake, refresh or any runtime request');}
function installControllerStatus(f){const c=f.controllers.at(-1);c.localStatus=()=>c.active?'ready':'unavailable';return c;}
test('content local status reports connecting, refusal wait, fresh READY, and explicit stop',async t=>{
 const f=contentFixture(t);contentPassive(f,'unavailable');f.holdRefresh();const starting=f.session.start();await drain();contentPassive(f,'connecting');
 f.releaseRefresh({state:'unknown'});await starting;contentPassive(f,'waiting');await f.advance(60000);contentPassive(f,'waiting');assert.equal(f.hellos(),1);
 f.setAnswer({state:'verified',scopeKey:'scope'});await f.ready();installControllerStatus(f);contentPassive(f,'ready');assert.equal(f.hellos(),2);
 f.session.stop();contentPassive(f,'unavailable');await f.ready();contentPassive(f,'unavailable');assert.equal(f.hellos(),2);
});
test('content renewal refusal does not misreport old ready flag, and late owner cannot overwrite new status',async t=>{
 const f=contentFixture(t);await f.session.start();const old=installControllerStatus(f);contentPassive(f,'ready');f.setAnswer({state:'unknown'});
 await assert.rejects(old.options.bridge.renewSession({handle:{id:'mount1'},binding:old.binding}),/scope-not-verified/);old.terminate();await drain();contentPassive(f,'waiting');
 f.setAnswer({state:'verified',scopeKey:'scope'});await f.ready();installControllerStatus(f);contentPassive(f,'ready');old.terminate();await drain();contentPassive(f,'ready');assert.equal(f.hellos(),2);
});
test('content delegates only current controller local status and rejects changed route',async t=>{
 const f=contentFixture(t);await f.session.start();const c=installControllerStatus(f);c.localStatus=()=> 'dormant';contentPassive(f,'dormant');c.active=false;c.localStatus=()=> 'unavailable';contentPassive(f,'unavailable');
 f.document.location.href+='c/changed';contentPassive(f,'unavailable');
});

test('connected reading and native-layer suspension are distinct passive status snapshots',async t=>{
 const f=await mounted(t);f.doc.draft='UNSENT';
 f.controller.showNativeReading();passive(f,'reading');
 assert.equal(f.slot.children.length,1);assert.equal(f.doc.draft,'UNSENT');
 f.layer(true);f.change();passive(f,'suspended');
 f.layer(false);f.change();
 const button=f.slot.children[0];assert(button,'the existing return entry remains the only workspace control');
 button.events.click({isTrusted:true});passive(f,'ready');assert.equal(f.doc.draft,'UNSENT');
});
test('native composer focus at JOIN keeps reading and does not report the workspace as shown',async t=>{
 const f=surfaceFixture();t.after(()=>f.controller.stop());
 const editor={isConnected:true,ownerDocument:f.doc};f.doc.activeElement=editor;f.doc.draft='UNSENT';
 const inspect=f.adapter.inspect;f.adapter.inspect=()=>({...inspect(),composer:editor});
 await f.controller.start({});await f.both();passive(f,'reading');
 assert.equal(f.calls.show,0);assert.equal(f.slot.children.length,1);assert.equal(f.doc.draft,'UNSENT');
});

test('stalled frame startup reports the existing fixed stage without DOM inspection or retry',async t=>{
 const f=surfaceFixture();t.after(()=>f.controller.stop());await f.controller.start({});f.tick(6000);passive(f,'surface-frame-module-pending');
 for(const role of ['workspace','sidebar'])f.message(role,{data:{type:'VAIWL_UI_BOOT',role,stage:'module-ready'}});
 await drain();passive(f,'surface-frame-join-pending');
 f.bridge.confirmParent=async()=>({ok:false});await f.both();passive(f,'surface-frame-grant-pending');
});
