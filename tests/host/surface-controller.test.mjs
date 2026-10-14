import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
// Isolated DOM/lifecycle mocks: these contracts do not certify actual Chrome masks.
function fixture(){
 const listeners=new Map(),timers=new Map();let time=1000,n=0,layer=false,region=1,observer,surrender;
 const calls={updates:[],show:0,reading:0,suspend:0,dispose:0,confirm:[],register:0,stop:0};
 const win={addEventListener:(k,fn)=>{if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener:(k,fn)=>listeners.get(k)?.delete(fn),MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}};
 const slot={isConnected:true,children:[],append(b){this.children.push(b);b.parent=this;}};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},createElement:()=>({dataset:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.events[k]=fn;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}})};
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{}}}));
 const binding={documentToken:'token',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(60000).toISOString()};
 const adapter={updateBinding:next=>{calls.updates.push(next);return true;},start:async()=>({binding}),stop:()=>{calls.stop++;},inspect:()=>({ok:true,regionEpoch:region,navigationSlot:slot}),hasNativeLayer:()=>layer};
 const surface={mount:async(c,i,o)=>(surrender=o.onSurrender,{id:'mount',documentToken:'token',regionEpoch:region}),frames:()=>frames,showWorkspace:()=>{calls.show++;},showReading:()=>{calls.reading++;},suspend:()=>{calls.suspend++;},dispose:()=>{calls.dispose++;}};
 const bridge={registerMount:async()=>{calls.register++;return {ok:true};},confirmParent:async value=>{calls.confirm.push(value);return {ok:true,grant:{id:`grant_${value.role}`,mountId:'mount',role:value.role,parentDocumentId:'parent',uiDocumentId:`ui_${value.role}`,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};}};
 const controller=createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://extension',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++n;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const message=(role='workspace',patch={})=>{const event={source:frames.find(x=>x.role===role).frame.contentWindow,origin:'chrome-extension://extension',data:{type:'VAIWL_UI_JOIN',role,nonce:`nonce_${role}`},...patch};for(const fn of listeners.get('message')??[])fn(event);};
 const both=async()=>{message();message('sidebar');await drain();};
 return {renewAck:()=>({ok:true,binding:{...binding,expiresAt:new Date(time+20000).toISOString()},grants:['workspace','sidebar'].map(role=>({id:`grant_${role}`,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:`ui_${role}`,scopeGrantId:'scope',expiresAt:new Date(time+20000).toISOString()}))}),surrender:event=>surrender?.(event),pagehide:()=>{for(const fn of listeners.get('pagehide')??[])fn();},controller,bridge,adapter,surface,doc,slot,frames,binding,calls,message,both,change:()=>observer?.(),layer:value=>{layer=value;},region:()=>{region++;},tick:ms=>{time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}
test('owner registration and both UiGrant ACKs gate initial dual-surface show',async()=>{const f=fixture(),held=deferred();f.bridge.registerMount=()=>held.promise;const start=f.controller.start({});await drain();f.message();assert.equal(f.calls.confirm.length,0);assert.equal(f.controller.showWorkspace(),false);held.resolve({ok:true});await start;f.message();await drain();assert.equal(f.calls.show,0);f.message('sidebar');await drain();assert.equal(f.calls.show,1);assert.deepEqual(Object.keys(f.calls.confirm[0]).sort(),['documentToken','mountId','nonce','regionEpoch','role']);});
test('origin, original contentWindow, connectedness and public join shape are mandatory',async()=>{for(const mutate of [f=>f.message('workspace',{origin:'https://chatgpt.com'}),f=>f.message('workspace',{source:{}}),f=>{f.frames[0].frame.isConnected=false;f.message();},f=>f.message('workspace',{data:{type:'VAIWL_UI_JOIN',role:'workspace',nonce:'n',scope:'forged'}})]){const f=fixture();await f.controller.start({});mutate(f);await drain();assert.equal(f.calls.confirm.length,0);assert.equal(f.calls.show,0);}});
test('exactly one four-grid return exists only in reading and opens workspace',async()=>{const f=fixture();await f.controller.start({});await f.both();assert.equal(f.slot.children.length,0);f.controller.showReading();f.controller.showReading();assert.equal(f.slot.children.length,1);assert.equal(f.slot.children[0].textContent,'▦');f.slot.children[0].events.click({isTrusted:true});assert.equal(f.slot.children.length,0);assert.equal(f.calls.show,2);});
test('native portal surrenders both surfaces without automatically taking focus back',async()=>{const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();f.layer(true);f.change();assert.equal(f.slot.children.length,0);assert.ok(f.calls.suspend>0);assert.equal(f.controller.showWorkspace(),false);f.layer(false);f.change();assert.equal(f.calls.show,1);});
test('route or region replacement disposes owned UI and stops adapter',async()=>{for(const change of [f=>{f.doc.location.href+='c/new';},f=>f.region()]){const f=fixture();await f.controller.start({});await f.both();change(f);f.change();assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);}});
test('grant expiry and explicit revoke remove return and dispose both surfaces',async()=>{for(const change of [f=>f.tick(20000),f=>f.controller.revoke()]){const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();change(f);assert.equal(f.slot.children.length,0);assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);}});
test('late registration or grant ACK after stop never shows stale surfaces',async()=>{for(const method of ['registerMount','confirmParent']){const f=fixture(),held=deferred(),original=f.bridge[method];f.bridge[method]=()=>held.promise;const start=f.controller.start({});await drain();if(method==='confirmParent')f.message();await drain();f.controller.stop();held.resolve(method==='registerMount'?{ok:true}:await original({role:'workspace'}));await start;await drain();assert.equal(f.calls.show,0);assert.equal(f.calls.dispose,1);}});
test('owner denial and stale region during registration dispose without show',async()=>{for(const denied of [true,false]){const f=fixture();f.bridge.registerMount=async()=>{if(!denied)f.region();return {ok:!denied};};assert.equal(await f.controller.start({}),null);assert.equal(f.calls.dispose,1);assert.equal(f.calls.show,0);}});
test('both early JOINs drain only after owner ACK, with one pending nonce per role',async()=>{
 const f=fixture(),held=deferred();f.bridge.registerMount=()=>held.promise;const starting=f.controller.start({});await drain();
 f.message();f.message('workspace',{data:{type:'VAIWL_UI_JOIN',role:'workspace',nonce:'later_nonce'}});f.message('sidebar');await drain();
 assert.equal(f.calls.confirm.length,0);assert.equal(f.calls.show,0);held.resolve({ok:true});await starting;await drain();
 assert.equal(f.calls.confirm.length,2);assert.equal(f.calls.confirm[0].nonce,'nonce_workspace');assert.equal(f.calls.show,1);
});
test('cached JOIN cannot survive stop or changed original WindowProxy before register ACK',async()=>{
 for(const change of [f=>f.controller.stop(),f=>{f.frames[0].frame.contentWindow={};}]){
  const f=fixture(),held=deferred();f.bridge.registerMount=()=>held.promise;const starting=f.controller.start({});await drain();f.message();change(f);held.resolve({ok:true});await starting;await drain();assert.equal(f.calls.confirm.length,0);assert.equal(f.calls.show,0);
 }
});
test('early forged source/origin cannot occupy cache ahead of legitimate JOIN',async()=>{
 const f=fixture(),held=deferred();f.bridge.registerMount=()=>held.promise;const starting=f.controller.start({});await drain();f.message('workspace',{source:{}});f.message('workspace',{origin:'https://chatgpt.com'});f.message();held.resolve({ok:true});await starting;await drain();assert.equal(f.calls.confirm.length,1);assert.equal(f.calls.confirm[0].nonce,'nonce_workspace');
});
test('owned-frame public SUSPEND remains effective while registration is pending',async()=>{
 const f=fixture(),held=deferred();f.bridge.registerMount=()=>held.promise;const starting=f.controller.start({});await drain();f.message('workspace',{data:{type:'VAIWL_UI_SUSPEND',role:'workspace'}});held.resolve({ok:true});await starting;await drain();assert.equal(f.calls.dispose,1);assert.equal(f.calls.confirm.length,0);assert.equal(f.calls.show,0);
});
test('trusted session renewal extends binding/grants in place without new JOIN or return/draft mutations',async()=>{
 const f=fixture();let renews=0;f.doc.draft='UNSENT';f.bridge.renewSession=async({handle,binding})=>{renews++;assert.equal(handle.id,'mount');assert.equal(binding.documentToken,'token');return f.renewAck();};
 await f.controller.start({});await f.both();f.controller.showReading();const button=f.slot.children[0];
 f.tick(10000);await drain();assert.equal(renews,1);assert.equal(f.calls.updates.length,1);assert.equal(f.calls.confirm.length,2);assert.equal(f.calls.register,1);assert.equal(f.slot.children[0],button);assert.equal(f.doc.draft,'UNSENT');assert.equal(f.calls.dispose,0);
 f.tick(10000);await drain();assert.equal(renews,2);assert.equal(f.calls.dispose,0);
});
test('session renewal rejects changed binding/scope/UI/role and overlong lifetime',async()=>{
 for(const change of [a=>{a.binding.producerToken='other';},a=>{a.grants[0].scopeGrantId='other';},a=>{a.grants[0].uiDocumentId='other';},a=>{a.grants[1]=a.grants[0];},a=>{a.binding.expiresAt=new Date(999999).toISOString();},a=>{a.grants[0].expiresAt=new Date(999999).toISOString();}]){
  const f=fixture();f.bridge.renewSession=async()=>{const ack=f.renewAck();change(ack);return ack;};await f.controller.start({});await f.both();f.tick(10000);await drain();assert.equal(f.calls.dispose,1);assert.equal(f.calls.updates.length,0);
 }
});
test('six-second session deadline releases UI and late ACK cannot renew or resurrect it',async()=>{
 const f=fixture(),held=deferred();f.bridge.renewSession=()=>held.promise;await f.controller.start({});await f.both();f.tick(10000);await drain();f.tick(6000);await drain();assert.equal(f.calls.dispose,1);held.resolve(f.renewAck());await drain();assert.equal(f.calls.updates.length,0);assert.equal(f.controller.showWorkspace(),false);
});
test('stop, route and region changes fence pending session renewal',async()=>{
 for(const change of [f=>f.controller.stop(),f=>{f.doc.location.href+='c/new';},f=>f.region()]){
  const f=fixture(),held=deferred();f.bridge.renewSession=()=>held.promise;await f.controller.start({});await f.both();f.tick(10000);await drain();change(f);held.resolve(f.renewAck());await drain();assert.equal(f.calls.updates.length,0);assert.equal(f.calls.dispose,1);
 }
});
test('native input surrender creates one return without reopening masks or changing draft',async()=>{
 const f=fixture();await f.controller.start({});f.surrender();assert.equal(f.slot.children.length,0);await f.both();f.doc.draft='unsent';f.surrender();const button=f.slot.children[0];f.surrender();f.change();assert.equal(f.slot.children.length,1);assert.equal(f.slot.children[0],button);assert.equal(f.calls.show,1);assert.equal(f.calls.reading,0);assert.equal(f.doc.draft,'unsent');button.events.click({isTrusted:true});assert.equal(f.calls.show,2);assert.equal(f.slot.children.length,0);f.controller.stop();
});
test('native portal removes return then restores only the entry; invalid slot never receives it',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.surrender();f.layer(true);f.change();assert.equal(f.slot.children.length,0);f.surrender();assert.equal(f.slot.children.length,0);f.layer(false);f.change();assert.equal(f.slot.children.length,1);assert.equal(f.calls.show,1);f.slot.isConnected=false;f.change();assert.equal(f.slot.children.length,0);f.controller.stop();
});
test('late native surrender after pagehide, expiry or stop cannot restore return',async()=>{
 for(const end of [f=>f.pagehide(),f=>f.tick(20000),f=>f.controller.stop()]){const f=fixture();await f.controller.start({});await f.both();f.surrender();assert.equal(f.slot.children.length,1);end(f);f.surrender();f.layer(false);f.change();assert.equal(f.slot.children.length,0);assert.equal(f.controller.showWorkspace(),false);}
});
test('short scope-clipped grants renew before their hard expiry',async()=>{
 const f=fixture(),confirm=f.bridge.confirmParent;let renews=0;
 f.bridge.confirmParent=async value=>{const result=await confirm(value);result.grant.expiresAt=new Date(11000).toISOString();return result;};
 f.bridge.renewSession=async()=>{renews++;return f.renewAck();};
 await f.controller.start({});await f.both();f.tick(4999);await drain();assert.equal(renews,0);
 f.tick(1);await drain();assert.equal(renews,1);f.tick(5000);await drain();assert.equal(f.calls.dispose,0);f.controller.stop();
});

test('only trusted return-button entry notifies owner after synchronous successful show',async()=>{
 const f=fixture(),entered=[],held=deferred();f.bridge.workspaceEntered=value=>{assert.equal(f.slot.children.length,0);assert.equal(f.calls.show,3);entered.push(value);return held.promise;};await f.controller.start({});await f.both();assert.deepEqual(entered,[]);f.controller.showWorkspace();assert.deepEqual(entered,[]);f.controller.showReading();f.slot.children[0].events.click({isTrusted:false});assert.deepEqual(entered,[]);f.controller.showReading();f.slot.children[0].events.click({isTrusted:true});assert.deepEqual(entered,[{mountId:'mount'}]);assert.equal(f.calls.show,3);held.resolve({ok:false});await drain();assert.equal(f.calls.dispose,0);
});
test('notification failures never prevent native return and stale or blocked buttons cannot notify',async()=>{
 for(const failure of [()=>{throw Error('unavailable');},()=>Promise.reject(Error('unavailable'))]){const f=fixture();f.bridge.workspaceEntered=failure;await f.controller.start({});await f.both();f.controller.showReading();f.slot.children[0].events.click({isTrusted:true});await drain();assert.equal(f.calls.show,2);assert.equal(f.calls.dispose,0);}
 const f=fixture();let calls=0;f.bridge.workspaceEntered=()=>{calls++;};await f.controller.start({});await f.both();f.controller.showReading();const old=f.slot.children[0];f.layer(true);old.events.click({isTrusted:true});assert.equal(calls,0);f.controller.stop();old.events.click({isTrusted:true});assert.equal(calls,0);
});
test('session renewal and programmatic workspace presentation never notify entry',async()=>{
 const f=fixture();let calls=0;f.bridge.workspaceEntered=()=>{calls++;};f.bridge.renewSession=async()=>f.renewAck();await f.controller.start({});await f.both();f.tick(10000);await drain();f.controller.showWorkspace();assert.equal(calls,0);f.controller.stop();
});

test('reading guard is tied to one explicit reading intent and never revives after workspace return',async()=>{
 const f=fixture();const absent=f.controller.readingGuard();assert.equal(absent(),false);
 await f.controller.start({});await f.both();assert.equal(f.controller.readingGuard()(),false);
 assert.equal(f.controller.showReading(),true);const old=f.controller.readingGuard();assert.equal(old(),true);
 assert.equal(f.controller.showWorkspace(),true);assert.equal(old(),false);
 assert.equal(f.controller.showReading(),true);assert.equal(old(),false);assert.equal(f.controller.readingGuard()(),true);assert.equal(absent(),false);f.controller.stop();
});
test('native surrender and suspension invalidate prior reading intent permanently',async()=>{
 for(const interrupt of [f=>f.surrender(),f=>f.controller.suspend('native-layer')]){
  const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();const old=f.controller.readingGuard();assert.equal(old(),true);
  interrupt(f);assert.equal(old(),false);f.controller.showReading();assert.equal(old(),false);assert.equal(f.controller.readingGuard()(),true);f.controller.stop();
 }
});
test('successful in-place session renewal preserves a reading guard and stop invalidates it',async()=>{
 const f=fixture();f.bridge.renewSession=async()=>f.renewAck();await f.controller.start({});await f.both();f.controller.showReading();const guard=f.controller.readingGuard();assert.equal(guard(),true);
 f.tick(10000);await drain();assert.equal(f.calls.updates.length,1);assert.equal(guard(),true);
 f.tick(10000);await drain();assert.equal(f.calls.updates.length,2);assert.equal(guard(),true);
 f.controller.stop();assert.equal(guard(),false);assert.equal(f.controller.readingGuard()(),false);
});

test('asynchronous native-reading close echo preserves the programmatic reading guard',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();const guard=f.controller.readingGuard(),button=f.slot.children[0];assert.equal(guard(),true);
 await drain();f.surrender({reason:'native-reading'});assert.equal(guard(),true);assert.equal(f.slot.children[0],button);
 f.surrender({reason:'native-reading'});assert.equal(guard(),true);assert.equal(f.calls.reading,1);f.controller.stop();
});
test('native-input surrender while already reading still invalidates the previous guard',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();const guard=f.controller.readingGuard();assert.equal(guard(),true);
 f.surrender({reason:'native-input'});assert.equal(guard(),false);const next=f.controller.readingGuard();assert.equal(next(),true);
 f.surrender({reason:'native-reading'});assert.equal(guard(),false);assert.equal(next(),true);
 f.surrender({reason:'native-input'});assert.equal(next(),false);f.controller.stop();
});

test('untrusted or missing return gesture cannot open workspace or consume reading return',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();const button=f.slot.children[0],guard=f.controller.readingGuard();
 for(const event of [undefined,{}, {isTrusted:false}]){button.events.click(event);assert.equal(f.calls.show,1);assert.equal(f.slot.children[0],button);assert.equal(guard(),true);}
 button.events.click({isTrusted:true});assert.equal(f.calls.show,2);assert.equal(f.slot.children.length,0);f.controller.stop();
});
