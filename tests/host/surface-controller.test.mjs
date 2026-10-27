import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
// Isolated DOM/lifecycle mocks: these contracts do not certify actual Chrome masks.
function fixture(options={}){
 const listeners=new Map(),timers=new Map();let time=1000,n=0,layer=false,region=1,observer,surrender;
 const calls={terminations:[],updates:[],show:0,reading:0,suspend:0,dispose:0,confirm:[],register:0,stop:0};
 const win={addEventListener:(k,fn)=>{if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener:(k,fn)=>listeners.get(k)?.delete(fn),MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}};
 const slot={isConnected:true,children:[],append(b){this.children.push(b);b.parent=this;}};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},createElement:()=>({dataset:{},style:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.events[k]=fn;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}})};
 slot.ownerDocument=doc;const roots=Object.fromEntries(['history','header','reading','composer'].map(key=>[key,{isConnected:true,ownerDocument:doc}]));let visible=false;
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{}}}));
 const binding={documentToken:'token',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(60000).toISOString()};
 const adapter={updateBinding:next=>{calls.updates.push(next);return true;},start:async()=>({binding}),stop:()=>{calls.stop++;},inspect:()=>({ok:true,regionEpoch:region,navigationSlot:slot,...roots}),hasNativeLayer:()=>layer};
 const surface={mount:async(c,i,o)=>(surrender=o.onSurrender,{id:'mount',documentToken:'token',regionEpoch:region}),frames:()=>frames,showWorkspace:(_handle,options)=>{if(options?.roles?.includes('workspace')!==false){visible=true;calls.show++;}},showReading:()=>{visible=false;calls.reading++;},visibility:()=>({workspace:visible,sidebar:visible}),suspend:()=>{visible=false;calls.suspend++;},dispose:()=>{calls.dispose++;}};
 const bridge={registerMount:async()=>{calls.register++;return {ok:true};},confirmParent:async value=>{calls.confirm.push(value);return {ok:true,grant:{id:`grant_${value.role}`,mountId:'mount',role:value.role,parentDocumentId:'parent',uiDocumentId:`ui_${value.role}`,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};}};
 const controller=createSurfaceController({onWake:()=>false,...options,document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://extension',onTerminated:(reason,presentation)=>calls.terminations.push({reason,presentation}),now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++n;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const message=(role='workspace',patch={})=>{const event={source:frames.find(x=>x.role===role).frame.contentWindow,origin:'chrome-extension://extension',data:{type:'VAIWL_UI_JOIN',role,nonce:`nonce_${role}`},...patch};for(const fn of listeners.get('message')??[])fn(event);};
 const both=async()=>{message();message('sidebar');await drain();};
 return {timers,renewAck:()=>({ok:true,binding:{...binding,expiresAt:new Date(time+20000).toISOString()},grants:['workspace','sidebar'].map(role=>({id:`grant_${role}`,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:`ui_${role}`,scopeGrantId:'scope',expiresAt:new Date(time+20000).toISOString()}))}),surrender:(event={reason:'native-input'})=>surrender?.(event),pagehide:()=>{for(const fn of listeners.get('pagehide')??[])fn();},controller,bridge,adapter,surface,doc,slot,frames,binding,calls,message,both,change:()=>observer?.(),layer:value=>{layer=value;},region:()=>{region++;},tick:ms=>{time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}
test('owner registration and workspace UiGrant gate workspace; sidebar joins independently',async()=>{const f=fixture(),held=deferred();f.bridge.registerMount=()=>held.promise;const start=f.controller.start({});await drain();f.message();assert.equal(f.calls.confirm.length,0);assert.equal(f.controller.showWorkspace(),false);held.resolve({ok:true});await start;f.message();await drain();assert.equal(f.calls.show,1);f.message('sidebar');await drain();assert.equal(f.calls.show,1);assert.deepEqual(Object.keys(f.calls.confirm[0]).sort(),['documentToken','mountId','nonce','regionEpoch','role']);});
test('origin, original contentWindow, connectedness and public join shape are mandatory',async()=>{for(const mutate of [f=>f.message('workspace',{origin:'https://chatgpt.com'}),f=>f.message('workspace',{source:{}}),f=>{f.frames[0].frame.isConnected=false;f.message();},f=>f.message('workspace',{data:{type:'VAIWL_UI_JOIN',role:'workspace',nonce:'n',scope:'forged'}})]){const f=fixture();await f.controller.start({});mutate(f);await drain();assert.equal(f.calls.confirm.length,0);assert.equal(f.calls.show,0);}});
test('exactly one four-grid return exists only in reading and opens workspace',async()=>{const f=fixture();await f.controller.start({});await f.both();assert.equal(f.slot.children.length,0);f.controller.showReading();f.controller.showReading();assert.equal(f.slot.children.length,1);assert.equal((f.slot.children[0].innerHTML.match(/<rect /g)??[]).length,4);assert.equal(f.slot.children[0]['aria-label'],'返回工作空间');f.slot.children[0].events.click({isTrusted:true});assert.equal(f.slot.children.length,0);assert.equal(f.calls.show,2);});
test('native portal surrenders both surfaces without automatically taking focus back',async()=>{const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();f.layer(true);f.change();assert.equal(f.slot.children.length,0);assert.ok(f.calls.suspend>0);assert.equal(f.controller.isWorkspacePresented(),false);f.layer(false);f.change();assert.equal(f.calls.show,1);});
test('route or region replacement disposes owned UI and stops adapter',async()=>{for(const change of [f=>{f.doc.location.href+='c/new';},f=>f.region()]){const f=fixture();await f.controller.start({});await f.both();change(f);f.change();assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);}});
test('grant expiry and explicit revoke remove return and dispose both surfaces',async()=>{for(const change of [f=>f.tick(20000),f=>f.controller.revoke()]){const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();change(f);assert.equal(f.slot.children.length,0);assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);}});
test('late registration or grant ACK after stop never shows stale surfaces',async()=>{for(const method of ['registerMount','confirmParent']){const f=fixture(),held=deferred(),original=f.bridge[method];f.bridge[method]=()=>held.promise;const start=f.controller.start({});await drain();if(method==='confirmParent')f.message();await drain();f.controller.stop();held.resolve(method==='registerMount'?{ok:true}:await original({role:'workspace'}));await start;await drain();assert.equal(f.calls.show,0);assert.equal(f.calls.dispose,1);}});
test('owner denial disposes; geometry change does not revoke document transport',async()=>{
 const denied=fixture();denied.bridge.registerMount=async()=>({ok:false});assert.equal(await denied.controller.start({}),null);assert.equal(denied.calls.dispose,1);
 const changed=fixture();changed.bridge.registerMount=async()=>{changed.region();return {ok:true};};assert((await changed.controller.start({})));assert.equal(changed.calls.dispose,0);assert.equal(changed.calls.show,0);changed.controller.stop();
});
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
test('stop and route changes fence pending session renewal',async()=>{
 for(const change of [f=>f.controller.stop(),f=>{f.doc.location.href+='c/new';}]){
  const f=fixture(),held=deferred();f.bridge.renewSession=()=>held.promise;await f.controller.start({});await f.both();f.tick(10000);await drain();change(f);held.resolve(f.renewAck());await drain();assert.equal(f.calls.updates.length,0);assert.equal(f.calls.dispose,1);
 }
});
test('native input surrender creates one return without reopening masks or changing draft',async()=>{
 const f=fixture();await f.controller.start({});assert.equal(f.slot.children.length,0);await f.both();f.doc.draft='unsent';f.surrender();const button=f.slot.children[0];f.surrender();f.change();assert.equal(f.slot.children.length,1);assert.equal(f.slot.children[0],button);assert.equal(f.calls.show,1);assert.equal(f.calls.reading,0);assert.equal(f.doc.draft,'unsent');button.events.click({isTrusted:true});assert.equal(f.calls.show,2);assert.equal(f.slot.children.length,0);f.controller.stop();
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
test('private migration frame focus requires authorized visible workspace and exact role',async()=>{const f=fixture();let focused=0;for(const x of f.frames)x.frame.focus=options=>{assert.deepEqual(options,{preventScroll:true});focused++;f.doc.activeElement=x.frame;};await f.controller.start({});assert.equal(f.controller.focusFrame('workspace'),false);await f.both();assert.equal(f.controller.focusFrame('unknown'),false);assert.equal(f.controller.focusFrame('workspace'),true);assert.equal(f.doc.activeElement,f.frames[0].frame);f.controller.showReading();const button=f.slot.children[0];assert.equal(f.controller.isReturnTarget(button),true);assert.equal(f.controller.isReturnTarget({}),false);assert.equal(f.controller.focusFrame('workspace'),false);f.controller.showWorkspace();assert.equal(f.controller.isReturnTarget(button),false);f.layer(true);assert.equal(f.controller.focusFrame('sidebar'),false);f.controller.stop();assert.equal(f.controller.focusFrame('workspace'),false);assert.equal(focused,1);});

test('private frame focus recognizes actual iframe through nested shadow active elements',async()=>{
 const f=fixture(),frame=f.frames[0].frame,inner={shadowRoot:{activeElement:null}},outer={shadowRoot:{activeElement:inner}};frame.focus=options=>{assert.deepEqual(options,{preventScroll:true});f.doc.activeElement=outer;inner.shadowRoot.activeElement=frame;};await f.controller.start({});await f.both();assert.equal(f.controller.focusFrame('workspace'),true);assert.equal(f.doc.activeElement,outer);assert.equal(inner.shadowRoot.activeElement,frame);f.controller.stop();
});

test('presentationMode is a read-only hint, reading before grants and after suspension or stop',async()=>{
 const f=fixture();assert.equal(f.controller.presentationMode(),'reading');await f.controller.start({});assert.equal(f.controller.presentationMode(),'reading');const before=f.calls.show;await f.both();assert.equal(f.controller.presentationMode(),'workspace');assert.equal(f.calls.show,before+1);f.controller.showReading();assert.equal(f.controller.presentationMode(),'reading');f.controller.showWorkspace();assert.equal(f.controller.presentationMode(),'workspace');f.controller.suspend();assert.equal(f.controller.presentationMode(),'reading');f.controller.stop();assert.equal(f.controller.presentationMode(),'reading');assert.equal(f.controller.showWorkspace(),false);
});

test('native boundary refusal preserves reading mode and its unique return control',async()=>{
 const f=fixture(),show=f.surface.showWorkspace;await f.controller.start({});await f.both();f.controller.showReading();const button=f.slot.children[0];
 f.surface.showWorkspace=()=>false;assert.equal(f.controller.showWorkspace(),false);assert.equal(f.controller.presentationMode(),'reading');assert.equal(f.slot.children.length,1);assert.equal(f.slot.children[0],button);
 f.surface.showWorkspace=show;assert.equal(f.controller.showWorkspace(),true);assert.equal(f.controller.presentationMode(),'workspace');assert.equal(f.slot.children.length,0);f.controller.stop();
});


test('native surrender records reading for recovery even if authority expires before toggle',async()=>{
 const f=fixture();await f.controller.start({});await f.both();assert.equal(f.controller.presentationMode(),'workspace');
 f.binding.expiresAt=new Date(0).toISOString();f.surrender({reason:'native-input'});
 assert.equal(f.controller.presentationMode(),'reading');assert.equal(f.slot.children.length,0,'expired grant cannot create a return control');
 f.controller.stop('ui-grant-expired');assert.deepEqual(f.calls.terminations.at(-1),{reason:'ui-grant-expired',presentation:{mode:'reading'}});
});

for(const role of ['workspace'])test('owned '+role+' EXIT fully disposes surfaces and the reading return',async()=>{
 const f=fixture(),released=[];f.bridge.revokeMount=value=>released.push(value);await f.controller.start({});await f.both();f.controller.showReading();assert.equal(f.slot.children.length,1);const stops=f.calls.stop;
 f.message(role,{data:{type:'VAIWL_UI_EXIT',role}});await drain();
 assert.equal(f.calls.dispose,1);assert.equal(f.calls.stop,stops);assert.equal(f.slot.children.length,0);assert.deepEqual(released,[{mountId:'mount'}]);assert.deepEqual(f.calls.terminations,[{reason:'ui-user-exit',presentation:{mode:'reading'}}]);assert.equal(f.controller.showWorkspace(),false);
 f.message(role,{data:{type:'VAIWL_UI_EXIT',role}});f.message();f.tick(60000);await drain();assert.equal(f.calls.dispose,1);assert.equal(f.calls.show,1);assert.equal(f.slot.children.length,0);
});

test('EXIT rejects wrong origin, source, role, disconnected or replaced frame and extra fields',async()=>{
 const cases=[
  f=>f.message('workspace',{origin:'https://chatgpt.com',data:{type:'VAIWL_UI_EXIT',role:'workspace'}}),
  f=>f.message('workspace',{source:{},data:{type:'VAIWL_UI_EXIT',role:'workspace'}}),
  f=>f.message('workspace',{data:{type:'VAIWL_UI_EXIT',role:'sidebar'}}),
  f=>f.message('workspace',{data:{type:'VAIWL_UI_EXIT',role:'other'}}),
  f=>f.message('workspace',{data:{type:'VAIWL_UI_EXIT',role:'workspace',nonce:'extra'}}),
  f=>f.message('workspace',{data:{type:'VAIWL_UI_EXIT',role:'workspace',[Symbol('extra')]:true}}),
  f=>{f.frames[0].frame.isConnected=false;f.message('workspace',{data:{type:'VAIWL_UI_EXIT',role:'workspace'}});},
  f=>{f.frames[0].frame.contentWindow={};f.message('workspace',{data:{type:'VAIWL_UI_EXIT',role:'workspace'}});}
 ];
 for(const [index,attempt] of cases.entries()){const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();attempt(f);await drain();assert.equal(f.calls.dispose,index>=6?1:0);assert.equal(f.slot.children.length,index>=6?0:1);assert(!f.calls.terminations.some(x=>x.reason==='ui-user-exit'));f.controller.stop();}
});

test('owned EXIT while mount registration is pending clears queued JOINs and rejects the late registration',async()=>{
 const f=fixture(),held=deferred(),released=[];f.bridge.registerMount=()=>held.promise;f.bridge.revokeMount=value=>released.push(value);const starting=f.controller.start({});await drain();f.message();f.message('sidebar');
 f.message('workspace',{data:{type:'VAIWL_UI_EXIT',role:'workspace'}});await drain();assert.equal(f.calls.dispose,1);assert.equal(f.calls.terminations[0]?.reason,'ui-user-exit');assert.deepEqual(released,[{mountId:'mount'}]);
 held.resolve({ok:true});assert.equal(await starting,null);await drain();assert.equal(f.calls.confirm.length,0);assert.equal(f.calls.show,0);assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);assert.equal(f.slot.children.length,0);
});

test('owned EXIT fences an in-flight grant confirmation and no late ACK can recreate UI',async()=>{
 const f=fixture(),held=deferred(),original=f.bridge.confirmParent;f.bridge.confirmParent=value=>value.role==='workspace'?held.promise:original(value);await f.controller.start({});f.message();f.message('sidebar');await drain();assert.equal(f.calls.show,0);
 f.message('workspace',{data:{type:'VAIWL_UI_EXIT',role:'workspace'}});await drain();assert.equal(f.calls.dispose,1);assert.equal(f.calls.terminations[0]?.reason,'ui-user-exit');
 held.resolve(await original({role:'workspace'}));await drain();assert.equal(f.calls.show,0);assert.equal(f.calls.dispose,1);assert.equal(f.slot.children.length,0);assert.equal(f.controller.showWorkspace(),false);f.message();await drain();assert.equal(f.calls.show,0);
});

test('appearance is allowlisted, sent after owned JOIN and deduplicated without native work',async()=>{
 const f=fixture(),sent=[],observers=[];let theme='light';
 f.doc.documentElement={classList:{contains:()=>false}};
 f.doc.defaultView.getComputedStyle=()=>({colorScheme:theme,direction:'ltr',fontFamily:'PrivateFont, serif',fontSize:'20px',backgroundColor:'rgb(255,255,255)'});
 f.doc.defaultView.MutationObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(node){if(node===f.doc.documentElement)this.appearance=true;}disconnect(){this.disconnected=true;}};
 for(const target of f.frames)target.frame.contentWindow.postMessage=(data,origin)=>sent.push({data,origin});
 await f.controller.start({});assert.equal(sent.length,0);await f.both();assert.equal(sent.length,2);
 assert.deepEqual(sent[0],{origin:'chrome-extension://extension',data:{type:'VAIWL_UI_APPEARANCE',role:'workspace',appearance:{theme:'light',direction:'ltr',fontFamily:'serif',baseFontSize:20}}});
 const watcher=observers.find(o=>o.appearance);for(let i=0;i<100;i++)watcher.fn();f.tick(0);assert.equal(sent.length,2);
 theme='dark';for(let i=0;i<100;i++)watcher.fn();f.tick(0);assert.equal(sent.length,4);assert(sent.slice(2).every(v=>v.data.appearance.theme==='dark'));assert.equal(f.calls.confirm.length,2);assert.equal(f.calls.show,1);
 watcher.fn();f.controller.stop();f.tick(0);watcher.fn();f.tick(0);assert.equal(sent.length,4);assert(watcher.disconnected);
});
test('sidebar ancestor replacement rebinds role canvas observation without remounting or scroll churn',async()=>{
 const f=fixture(),sent=[],observers=[];let geometry,background='rgb(243,243,243)';
 f.doc.documentElement={};const parent=()=>({ownerDocument:f.doc,isConnected:true,parentElement:f.doc.documentElement});let sidebar=parent();
 const inspect=f.adapter.inspect;f.adapter.inspect=()=>({...inspect(),historyMaskRoots:[],protectedRegions:[],sidebarPlacement:{parent:sidebar,scrollPort:sidebar}});
 f.surface.refreshGeometry=()=>true;
 f.doc.defaultView.ResizeObserver=class{constructor(fn){geometry=fn;}observe(){}disconnect(){}};
 f.doc.defaultView.MutationObserver=class{constructor(fn){this.fn=fn;this.nodes=new Set();this.disconnects=0;observers.push(this);}observe(node){this.nodes.add(node);}disconnect(){this.nodes.clear();this.disconnects++;}};
 f.doc.defaultView.getComputedStyle=n=>({colorScheme:'light',direction:'ltr',fontFamily:'system-ui',fontSize:'16px',backgroundColor:n===sidebar?background:'rgb(255,255,255)',backgroundImage:'none',opacity:'1'});
 for(const target of f.frames)target.frame.contentWindow.postMessage=data=>sent.push(data);
 await f.controller.start({});await f.both();const watcher=observers.find(o=>o.nodes.has(sidebar));assert(watcher);assert.equal(sent.find(v=>v.role==='sidebar').appearance.canvas,'#f3f3f3');
 sent.length=0;const old=sidebar;sidebar=parent();background='rgb(240,240,240)';geometry();
 assert(watcher.nodes.has(sidebar));assert(!watcher.nodes.has(old));assert.equal(sent.length,1);assert.equal(sent[0].appearance.canvas,'#f0f0f0');assert.equal(f.calls.register,1);
 const rebound=watcher.disconnects;for(let i=0;i<10;i++)geometry();assert.equal(watcher.disconnects,rebound);assert.equal(sent.length,1);
 background='rgb(246,246,246)';watcher.fn();f.tick(0);assert.equal(sent.at(-1).appearance.canvas,'#f6f6f6');f.controller.stop();assert.equal(watcher.nodes.size,0);
});
test('appearance queued for replaced frame window or retired mount cannot reach it',async()=>{
 const f=fixture(),sent=[],observers=[];let theme='light';f.doc.documentElement={classList:{contains:()=>false}};
 f.doc.defaultView.getComputedStyle=()=>({colorScheme:theme,fontFamily:'system-ui',fontSize:'16px',direction:'ltr'});
 f.doc.defaultView.MutationObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(node){if(node===f.doc.documentElement)this.appearance=true;}disconnect(){}};
 for(const target of f.frames)target.frame.contentWindow.postMessage=data=>sent.push(data.role);
 await f.controller.start({});await f.both();sent.length=0;theme='dark';observers.find(o=>o.appearance).fn();f.frames[0].frame.contentWindow={postMessage:()=>assert.fail('replacement frame received appearance')};f.tick(0);assert.deepEqual(sent,[]);
 f.controller.stop();theme='light';observers.find(o=>o.appearance).fn();f.tick(0);assert.deepEqual(sent,[]);
});

function publishingFixture(options={}){
 const f=fixture(options),sent=[],events=new Map();let visible=null;
 f.doc.addEventListener=(type,fn)=>events.set(type,fn);f.doc.removeEventListener=(type,fn)=>{if(events.get(type)===fn)events.delete(type);};
 f.surface.visibility=()=>visible===null?null:{...visible};
 f.surface.showWorkspace=(_handle,{roles=['workspace','sidebar']}={})=>{if(roles.includes('workspace'))f.calls.show++;visible={workspace:visible?.workspace??false,sidebar:visible?.sidebar??false};for(const role of roles)visible[role]=true;return visible.workspace;};
 f.surface.showReading=()=>{f.calls.reading++;visible={workspace:false,sidebar:visible?.sidebar??false};};
 f.surface.suspend=()=>{f.calls.suspend++;visible={workspace:false,sidebar:false};};
 f.bridge.surfaceState=async value=>{sent.push(value);return {ok:true};};
 return {...f,sent,events,actual:value=>{visible=value;},toggle:()=>events.get('toggle')?.({})};
}
test('private state samples both actual popovers; unknown is not false, revisions increase and equal values deduplicate',async()=>{
 const f=publishingFixture();await f.controller.start({});f.toggle();await drain();assert.deepEqual(f.sent,[{mountId:'mount',revision:1,workspace:null,sidebar:null}]);
 await f.both();f.toggle();assert.deepEqual(f.sent.at(-1),{mountId:'mount',revision:3,workspace:true,sidebar:true});f.toggle();f.controller.showWorkspace();await drain();assert.equal(f.sent.length,3);
 f.controller.showReading();assert.deepEqual(f.sent.at(-1),{mountId:'mount',revision:4,workspace:false,sidebar:true});f.controller.showReading();assert.equal(f.sent.length,4);
 f.actual({workspace:true,sidebar:false});f.toggle();assert.deepEqual(f.sent.at(-1),{mountId:'mount',revision:5,workspace:true,sidebar:true});f.controller.suspend();assert.deepEqual(f.sent.at(-1),{mountId:'mount',revision:6,workspace:false,sidebar:false});f.controller.stop();
});
test('native surrender immediately publishes actual closure without awaiting later toggle',async()=>{
 const f=publishingFixture();await f.controller.start({});await f.both();f.actual({workspace:false,sidebar:false});f.surrender({reason:'native-input'});assert.deepEqual(f.sent.at(-1),{mountId:'mount',revision:2,workspace:false,sidebar:false});f.controller.stop();
});
test('failed show publishes sampled state rather than requested workspace mode',async()=>{
 const f=publishingFixture();await f.controller.start({});await f.both();f.surface.showWorkspace=()=>{f.actual({workspace:false,sidebar:false});return false;};assert.equal(f.controller.showWorkspace(),false);assert.deepEqual(f.sent.at(-1),{mountId:'mount',revision:2,workspace:false,sidebar:false});f.controller.stop();
});
test('unreadable surface becomes unknown and failed publication retries with higher revision',async()=>{
 const f=publishingFixture();await f.controller.start({});await f.both();f.surface.visibility=()=>{throw Error('unreadable-parent');};f.toggle();assert.deepEqual(f.sent.at(-1),{mountId:'mount',revision:2,workspace:null,sidebar:null});
 f.bridge.surfaceState=async value=>{f.sent.push(value);return {ok:false};};f.surface.visibility=()=>({workspace:false,sidebar:true});f.toggle();await drain();f.toggle();await drain();assert.deepEqual(f.sent.slice(-2).map(x=>x.revision),[3,4]);f.controller.stop();
});
test('expired binding, retired mount callback and stopped controller cannot publish',async()=>{
 const f=publishingFixture();await f.controller.start({});await f.both();const oldToggle=f.events.get('toggle');await f.controller.start({});await f.both();const before=f.sent.length;oldToggle({});assert.equal(f.sent.length,before);f.tick(60000);f.actual({workspace:false,sidebar:false});f.toggle();f.controller.suspend();assert.equal(f.sent.length,before);f.controller.stop();oldToggle({});assert.equal(f.sent.length,before);
});

function idleSurface(f){const messages=[];for(const item of f.frames)item.frame.contentWindow.postMessage=(data,origin)=>messages.push({data,origin});return messages;}
test('dormant UI retains frames and one wake entry while revoking all old presentation guards',async()=>{
 const f=fixture(),messages=idleSurface(f);await f.controller.start({});await f.both();f.controller.showNativeReading();const before=[...f.frames],guard=f.controller.intentGuard(),reading=f.controller.readingGuard();
 assert.equal(f.controller.enterDormant(),true);assert.equal(guard(),false);assert.equal(reading(),false);assert.equal(f.controller.showWorkspace(),false);assert.equal(f.controller.showReading(),false);assert.equal(f.calls.dispose,0);assert.equal(f.slot.children.length,1);assert.deepEqual(f.frames,before);
 assert.equal(typeof messages[0].data.requestId,'string');assert(messages[0].data.requestId.length>0);assert.deepEqual(messages.map(x=>x.data),[{type:'VAIWL_UI_IDLE',role:'workspace',requestId:messages[0].data.requestId},{type:'VAIWL_UI_IDLE',role:'sidebar',requestId:messages[0].data.requestId}]);assert(messages.every(x=>x.origin==='chrome-extension://extension'));
 const confirms=f.calls.confirm.length;f.message();f.message('sidebar',{data:{type:'VAIWL_UI_SUSPEND',role:'sidebar'}});await drain();f.tick(100000);f.change();assert.equal(f.calls.confirm.length,confirms);assert.equal(f.calls.dispose,0);assert.equal(f.slot.children.length,1);
 f.controller.stop();assert.equal(f.calls.dispose,1);assert.equal(f.slot.children.length,0);
});
test('dormant return only requests fresh owner wake once per in-flight trusted click',async()=>{
 const gate=deferred();let wakes=0;const f=fixture({onWake:()=>{wakes++;return gate.promise;}});idleSurface(f);await f.controller.start({});await f.both();f.controller.showNativeReading();assert.equal(f.controller.enterDormant(),true);
 const button=f.slot.children[0],shown=f.calls.show;button.events.click({isTrusted:false});assert.equal(wakes,0);button.events.click({isTrusted:true});button.events.click({isTrusted:true});assert.equal(wakes,1);assert.equal(f.calls.show,shown);assert.equal(f.calls.dispose,0);gate.resolve(false);await drain();assert.equal(f.controller.showWorkspace(),false);
});
test('dormant entry refuses visible surfaces and renewal in flight',async()=>{
 const f=fixture();idleSurface(f);const renewal=deferred();f.bridge.renewSession=()=>renewal.promise;await f.controller.start({});await f.both();assert.equal(f.controller.enterDormant(),false);f.controller.showNativeReading();f.surface.visibility=()=>({workspace:false,sidebar:true});assert.equal(f.controller.enterDormant(),false);f.surface.visibility=()=>({workspace:false,sidebar:false});f.tick(10000);await drain();assert.equal(f.controller.enterDormant(),false);renewal.resolve(f.renewAck());await drain();assert.equal(f.controller.enterDormant(),true);f.tick(100000);assert.equal(f.calls.dispose,0);
});
test('dormant pagehide and changed document still dispose the old frames',async()=>{
 for(const change of [f=>f.pagehide(),f=>{f.doc.location.href+='c/next';f.change();}]){const f=fixture();idleSurface(f);await f.controller.start({});await f.both();f.controller.showNativeReading();assert.equal(f.controller.enterDormant(),true);change(f);assert.equal(f.calls.dispose,1);assert.equal(f.slot.children.length,0);}
});

test('already queued expiry callback cannot dispose dormant frames',async()=>{
 const f=fixture();idleSurface(f);await f.controller.start({});await f.both();f.controller.showNativeReading();const expired=[...f.timers.values()].find(t=>t.at===21000);assert(expired);assert.equal(f.controller.enterDormant(),true);expired.fn();assert.equal(f.calls.dispose,0);assert.equal(f.slot.children.length,1);
});

test('dormant entry requires an explicit owner wake path',async()=>{const f=fixture({onWake:null});idleSurface(f);await f.controller.start({});await f.both();f.controller.showNativeReading();assert.equal(f.controller.enterDormant(),false);assert.equal(f.controller.showWorkspace(),true);});

for(const role of ['workspace'])test('registered owned '+role+' SUSPEND synchronously terminates pending start and late registration returns no handle',async()=>{
 const f=fixture({initialMode:'reading'}),held=deferred(),released=[];let entered=false;
 f.bridge.registerMount=()=>{entered=true;return held.promise;};f.bridge.revokeMount=value=>released.push(value);
 const starting=f.controller.start({});await drain();assert.equal(entered,true);assert.equal(f.calls.dispose,0);
 f.message(role,{data:{type:'VAIWL_UI_SUSPEND',role}});
 assert.equal(f.calls.dispose,1);assert.equal(f.calls.suspend,1);assert.deepEqual(f.calls.terminations,[{reason:'ui-frame-suspended',presentation:{mode:'reading'}}]);assert.deepEqual(released,[{mountId:'mount'}]);assert.equal(f.controller.showWorkspace(),false);
 held.resolve({ok:true});assert.equal(await starting,null);await drain();assert.equal(f.calls.dispose,1);assert.equal(f.calls.terminations.length,1);assert.equal(f.calls.show,0);assert.equal(f.calls.confirm.length,0);
});
for(const patch of [{origin:'https://chatgpt.com'},{source:{}}])test('foreign '+Object.keys(patch)[0]+' SUSPEND cannot terminate pending registration',async()=>{
 const f=fixture(),held=deferred();f.bridge.registerMount=()=>held.promise;const starting=f.controller.start({});await drain();
 f.message('workspace',{...patch,data:{type:'VAIWL_UI_SUSPEND',role:'workspace'}});assert.equal(f.calls.dispose,0);assert.deepEqual(f.calls.terminations,[]);
 held.resolve({ok:true});assert.equal((await starting)?.id,'mount');await f.both();assert.equal(f.calls.show,1);assert.deepEqual(f.calls.terminations,[]);f.controller.stop();
});

test('native-reading closing invalidates intent without DOM writes; actual closed creates one return',async()=>{
 const f=fixture();let open=true;const published=[];
 f.surface.visibility=()=>({workspace:open,sidebar:true});f.bridge.surfaceState=value=>{published.push(value);return {ok:true};};
 await f.controller.start({});await f.both();const original=f.controller.intentGuard(),before={...f.calls},publicationCount=published.length;
 assert.equal(original(),true);assert.equal(f.controller.isWorkspacePresented(),true);
 f.surrender({reason:'native-reading',phase:'closing'});
 assert.equal(original(),false);assert.equal(f.controller.isWorkspacePresented(),false);
 assert.equal(f.slot.children.length,0,'beforetoggle must not create the return while the browser still reports open');
 for(const key of ['show','reading','suspend','dispose'])assert.equal(f.calls[key],before[key],key);
 assert.equal(published.length,publicationCount,'old open visibility is not published as a completed close');
 const reading=f.controller.readingGuard();assert.equal(reading(),true);
 f.surrender({reason:'native-reading',phase:'closing'});assert.equal(reading(),true,'duplicate close intent cannot invalidate the new reading guard');
 open=false;f.surrender({reason:'native-reading'});assert.equal(f.slot.children.length,1);const button=f.slot.children[0];
 assert.equal(reading(),true);assert.equal(published.at(-1).workspace,false);
 f.surrender({reason:'native-reading'});assert.equal(f.slot.children.length,1);assert.equal(f.slot.children[0],button);assert.equal(reading(),true);
 for(const key of ['show','reading','suspend','dispose'])assert.equal(f.calls[key],before[key],key);
 f.controller.stop();
});

test('isWorkspacePresented is read-only and rejects missing authority, closed surface, portal and stale document',async()=>{
 const absent=fixture();assert.equal(absent.controller.isWorkspacePresented(),false);await absent.controller.start({});
 absent.surface.visibility=()=>({workspace:true,sidebar:true});absent.message();await drain();assert.equal(absent.controller.isWorkspacePresented(),true);assert.equal(absent.calls.show,1);absent.controller.stop();
 for(const [index,mutate] of [
  f=>{f.surface.visibility=()=>({workspace:false,sidebar:true});},
  f=>{f.surface.visibility=()=>null;},
  f=>{f.surface.visibility=()=>{throw Error('invalid-handle');};},
  f=>f.layer(true),
  f=>{f.binding.expiresAt=new Date(0).toISOString();},
  f=>{f.doc.location.href+='c/replaced';},
  f=>f.region(),
  f=>{f.frames[0].frame.contentWindow={};},
  f=>{f.frames[0].frame.isConnected=false;}
 ].entries()){
  const f=fixture();f.surface.visibility=()=>({workspace:true,sidebar:true});await f.controller.start({});await f.both();
  assert.equal(f.controller.isWorkspacePresented(),true);const before={...f.calls};mutate(f);
  assert.equal(f.controller.isWorkspacePresented(),false,`case ${index}`);assert.equal(f.slot.children.length,0);
  for(const key of ['show','reading','suspend','dispose'])assert.equal(f.calls[key],before[key],key);
  f.controller.stop();
 }
});

test('isWorkspacePresented rejects a synchronous close during its visibility read',async()=>{
 const f=fixture();await f.controller.start({});await f.both();const before=f.calls.show;
 f.surface.visibility=()=>{f.surrender({reason:'native-reading',phase:'closing'});return {workspace:true,sidebar:true};};
 assert.equal(f.controller.isWorkspacePresented(),false);assert.equal(f.calls.show,before);assert.equal(f.slot.children.length,0);f.controller.stop();
});

test('an inline replacement fails closed before registration and is never removed to retry',async()=>{
 const f=fixture();let checked=0;f.frames[0].frame.hasAttribute=name=>(checked++,name==='srcdoc');
 assert.equal(await f.controller.start({}),null);await f.both();
 assert(checked>0);assert.equal(f.calls.register,0);assert.equal(f.calls.confirm.length,0);assert.equal(f.calls.show,0);
 assert.equal(f.calls.terminations.at(-1).reason,'ui-frame-document-replaced');assert.equal(f.calls.dispose,1);
});
test('inline replacement while a private grant is pending cannot reveal either surface',async()=>{
 const f=fixture(),held=deferred(),confirm=f.bridge.confirmParent;f.bridge.confirmParent=()=>held.promise;
 await f.controller.start({});f.message();await drain();f.frames[0].frame.hasAttribute=name=>name==='srcdoc';
 held.resolve(await confirm({role:'workspace'}));await drain();await f.both();
 assert.equal(f.calls.show,0);assert.equal(f.calls.terminations.at(-1).reason,'ui-frame-document-replaced');assert.equal(f.calls.dispose,1);
});
test('frame boot reports cannot grant a surface or carry arbitrary diagnostic content',async()=>{
 const f=fixture();f.frames[0].frame.dataset={};await f.controller.start({});
 const boot=stage=>f.message('workspace',{data:{type:'VAIWL_UI_BOOT',role:'workspace',stage}});
 boot('entry-ready');await drain();assert.equal(JSON.parse(f.frames[0].frame.dataset.vaiwlFrameJoin).boot.workspace,'entry-ready');
 boot('PRIVATE_TEST_VALUE');await drain();assert(!f.frames[0].frame.dataset.vaiwlFrameJoin.includes('PRIVATE_TEST_VALUE'));
 assert.equal(f.calls.confirm.length,0);assert.equal(f.calls.show,0);await f.both();assert.equal(f.calls.show,1);
 f.doc.documentElement={dataset:{}};f.frames[0].frame.dataset.vaiwlFrameJoin='PRIVATE_TEST_VALUE';f.controller.stop();assert(!f.doc.documentElement.dataset.vaiwlFrameExit.includes('PRIVATE_TEST_VALUE'));
});

test('geometry reconciliation forwards one complete inspection to mount without rescanning',async()=>{
 const f=fixture();f.surface.refreshGeometry=()=>true;await f.controller.start({});await f.both();
 const inspect=f.adapter.inspect;let count=0,observed;
 f.adapter.inspect=()=>{count++;if(count>1)return {ok:false,reason:'unsafe-native-geometry'};return observed=inspect();};
 f.surface.refreshGeometry=(handle,value)=>{assert.equal(value,observed);return true;};
 // Workspace mode avoids a separate return-button action: the same mutation
 // callback must validate and refresh from one current, complete snapshot.
 f.change();assert.equal(count,1);assert.equal(f.calls.terminations.length,0);f.controller.stop();
});

test('renewal diagnostics distinguish local geometry from ACK rejection without exposing raw failures',async()=>{
 for(const [stage,change] of [['local-validity',f=>{f.adapter.inspect=()=>({ok:false});}],['ack',(_f,a)=>{a.ok=false;}],['adapter',f=>{f.adapter.updateBinding=()=>false;}]]){
  const reasons=[],f=fixture({onFailure:reason=>reasons.push(reason)});
  f.bridge.renewSession=async()=>{const a=f.renewAck();change(f,a);return a;};
  await f.controller.start({});await f.both();f.tick(10000);await drain();
  assert.deepEqual(reasons,stage==='local-validity'?[]:['surface-session-renew-'+stage]);assert.equal(f.calls.dispose,stage==='local-validity'?0:1);f.controller.stop();
 }
});

test('only a correlated fixed frame failure may report its stage and withdraw UI',async()=>{
 const failures=[],f=fixture({onFailure:v=>failures.push(v)});await f.controller.start({});await f.both();
 for(const patch of [{origin:'https://chatgpt.com'},{source:{}},{data:{type:'VAIWL_UI_SUSPEND',role:'workspace',reason:'private-value'}}])f.message('workspace',{data:{type:'VAIWL_UI_SUSPEND',role:'workspace',reason:'ui-renew-failed'},...patch});
 assert.equal(f.calls.dispose,0);assert.deepEqual(failures,[]);
 f.message('workspace',{data:{type:'VAIWL_UI_SUSPEND',role:'workspace',reason:'ui-renew-failed'}});
 assert.equal(f.calls.dispose,1);assert.deepEqual(failures,['surface-frame-ui-renew-failed']);
});

test('keyboard return transfers its own focus after show; pointer and programmatic entry do not',async()=>{
 const f=fixture();let focused=0;const frame=f.frames[0].frame;frame.focus=options=>{assert.deepEqual(options,{preventScroll:true});focused++;f.doc.activeElement=frame;};
 await f.controller.start({});await f.both();assert.equal(focused,0);
 for(const detail of [1,0]){f.controller.showReading();const button=f.slot.children[0];f.doc.activeElement=button;button.events.click({isTrusted:true,detail});assert.equal(focused,detail===0?1:0);}
 assert.equal(f.doc.activeElement,frame);f.controller.stop();
});

test('native modal may hide background layout without destroying a live suspended mount',async()=>{
 const f=fixture(),inspect=f.adapter.inspect;let hidden=false;
 f.adapter.inspect=()=>hidden?{ok:false,reason:'unsafe-native-history-list'}:inspect();
 await f.controller.start({});await f.both();f.controller.showReading();
 hidden=true;f.layer(true);f.change();
 assert.equal(f.calls.dispose,0,'native modal background hiding is presentation suspension');
 assert.equal(f.slot.children.length,0);assert.equal(f.controller.isWorkspacePresented(),false);
 hidden=false;f.layer(false);f.change();
 assert.equal(f.slot.children.length,1);assert.equal(f.calls.show,1,'closing the modal restores only the return');
 assert.equal(f.controller.showWorkspace(),true);f.controller.stop();
});

test('hidden modal transport renews across expiry but cannot show until full geometry returns',async()=>{
 const f=fixture(),inspect=f.adapter.inspect;let hidden=false;
 f.adapter.inspect=()=>hidden?{ok:false,reason:'unsafe-native-history-list'}:inspect();
 f.bridge.renewSession=async()=>f.renewAck();
 await f.controller.start({});await f.both();f.controller.showReading();hidden=true;f.layer(true);f.change();
 for(let i=0;i<3;i++){f.tick(10000);await drain();assert.equal(f.calls.dispose,0);assert.equal(f.controller.isWorkspacePresented(),false);assert.equal(f.slot.children.length,0);}
 assert.equal(f.calls.updates.length,3);
 f.layer(false);hidden=false;f.change();assert.equal(f.slot.children.length,1);assert.equal(f.calls.show,1);assert.equal(f.controller.showWorkspace(),true);f.controller.stop();
});
test('modal never exempts expired authority, changed frame or route',async()=>{
 for(const invalidate of [f=>f.tick(20000),f=>{f.frames[0].frame.contentWindow={};},f=>{f.doc.location.href+='c/other';}]){
  const f=fixture();await f.controller.start({});await f.both();f.layer(true);f.change();invalidate(f);f.change();assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);
 }
});
test('invalid background suspends workspace without revoking document transport',async()=>{
 const f=fixture(),inspect=f.adapter.inspect;let hidden=false;f.adapter.inspect=()=>hidden?{ok:false,reason:'unsafe-native-history-list'}:inspect();
 await f.controller.start({});await f.both();hidden=true;f.layer(true);f.change();assert.equal(f.calls.dispose,0);f.layer(false);f.change();assert.equal(f.calls.dispose,0);assert.equal(f.controller.isWorkspacePresented(),false);assert.equal(f.slot.children.length,0);hidden=false;f.change();assert.equal(f.controller.isWorkspacePresented(),true);f.controller.stop();
});

// Classification must not authorize an unsafe layout or expose arbitrary text.
test('history refusal reports only fixed categories on mount and later withdrawal',async()=>{
 for(const detail of ['row-gap','PRIVATE_PAGE_VALUE'])for(const mounted of [false,true]){
  const failures=[],f=fixture({onFailure:v=>failures.push(v)});
  if(mounted){await f.controller.start({});await f.both();}
  f.adapter.inspect=()=>({ok:false,reason:'unsafe-native-history-list',historyFailure:detail});
  if(mounted)f.change();else assert.equal(await f.controller.start({}),null);
  assert(failures.includes('surface-unsafe-native-history-list'+(detail==='row-gap'?'-row-gap':'')));
  assert(failures.every(v=>!v.includes('PRIVATE_PAGE_VALUE')));assert.equal(f.controller.showWorkspace(),false);
 }
});


test('correlated fixed projection failure reaches local status without authorizing recovery',async()=>{
 for(const reason of ['frame-view-unavailable','invalid-frame-current','invalid-frame-navigation','read-budget-exhausted']){
  const failures=[],f=fixture({onFailure:v=>failures.push(v)});await f.controller.start({});await f.both();
  f.message('workspace',{data:{type:'VAIWL_UI_SUSPEND',role:'workspace',reason}});await drain();
  assert(failures.includes('surface-frame-'+reason));assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);
 }
});


test('workspace entry does not destroy a mount on a redundant pre-show reading scan',async()=>{
 const f=fixture();f.surface.refreshGeometry=(_handle,inspection)=>inspection.ok===true;
 await f.controller.start({});await f.both();f.controller.showReading();
 const inspect=f.adapter.inspect;let shown=false,preShowScans=0,observed;
 f.adapter.inspect=()=>{if(!shown&&++preShowScans>1)return {ok:false,reason:'unsafe-native-geometry'};return observed=inspect();};
 f.surface.refreshGeometry=(_handle,inspection)=>{assert.equal(inspection,observed);return inspection.ok===true;};
 const show=f.surface.showWorkspace;f.surface.showWorkspace=()=>{shown=true;show();return true;};
 assert.equal(f.controller.showWorkspace(),true);assert.equal(preShowScans,1);assert.equal(f.calls.dispose,0);
 f.controller.stop();
});

test('a declined or unopened popover never commits workspace mode or consumes the return entry',async()=>{
 for(const result of [false,undefined]){
  const f=fixture();f.surface.showWorkspace=()=>result;
  await f.controller.start({});await f.both();
  assert.equal(f.controller.localStatus(),'reading');assert.equal(f.slot.children.length,1);
  assert.equal(f.controller.showWorkspace(),false);assert.equal(f.slot.children.length,1);
  assert.equal(f.controller.presentationSnapshot().attempt,'show-refused');
  assert.equal(f.controller.presentationSnapshot().workspace,false);
 }
});

test('sidebar SUSPEND retires only sidebar and ignores its late grant',async()=>{
 for(const type of ['VAIWL_UI_SUSPEND']){
  const f=fixture(),held=deferred(),confirm=f.bridge.confirmParent,retired=[],released=[];
  f.surface.retireRole=(_h,role)=>retired.push(role);f.surface.suspend=(_h,_reason,role)=>{assert.equal(role,'sidebar');};
  f.bridge.releaseRole=async value=>{released.push(value);return {ok:true};};
  f.bridge.confirmParent=value=>value.role==='sidebar'?held.promise:confirm(value);
  await f.controller.start({});f.message();f.message('sidebar');await drain();assert.equal(f.controller.isWorkspacePresented(),true);
  f.message('sidebar',{data:{type,role:'sidebar'}});await drain();held.resolve(await confirm({role:'sidebar'}));await drain();
  assert.equal(f.calls.dispose,0);assert.equal(f.controller.isWorkspacePresented(),true);assert.deepEqual(retired,['sidebar']);assert.deepEqual(released,[{mountId:'mount',role:'sidebar'}]);assert.equal(f.calls.stop,0);f.controller.stop();
 }
});

test('sidebar renewal failure cannot retire the workspace grant',async()=>{
 const f=fixture();f.bridge.releaseRole=async()=>({ok:true});f.bridge.renewSession=async()=>{const a=f.renewAck();a.grants.find(g=>g.role==='sidebar').uiDocumentId='stale-sidebar';return a;};
 await f.controller.start({});await f.both();f.tick(10000);await drain();assert.equal(f.calls.dispose,0);assert.equal(f.calls.updates.length,1);assert.equal(f.controller.showWorkspace(),true);f.controller.stop();
});


test('sidebar release completion rechecks current geometry without waiting for unrelated mutations',async()=>{
 const f=fixture(),released=deferred();let restored=0;const inspect=f.adapter.inspect;
 f.adapter.inspect=()=>({...inspect(),sidebarRect:{x:0,y:0,width:240,height:400},sidebarRevision:1,preserveNativeSidebar:false});
 f.surface.refreshGeometry=()=>true;f.surface.retireRole=()=>{};f.surface.suspend=()=>{};
 f.surface.restoreRole=()=>{restored++;return f.frames[1];};f.bridge.releaseRole=()=>released.promise;
 await f.controller.start({});await f.both();f.message('sidebar',{data:{type:'VAIWL_UI_SUSPEND',role:'sidebar'}});f.change();await drain();assert.equal(restored,0);
 released.resolve({ok:true});await drain();assert.equal(restored,1);assert.equal(f.calls.dispose,0);assert.equal(f.calls.register,1);assert.equal(f.controller.isWorkspacePresented(),true);f.controller.stop();
});

test('connected sidebar with replaced flow membership releases its grant before fresh JOIN, keeping workspace',async()=>{
 const f=publishingFixture(),released=deferred();let intact=true,restored=0,retired=0;const inspect=f.adapter.inspect;
 f.adapter.inspect=()=>({...inspect(),sidebarRect:{x:0,y:0,width:240,height:400},sidebarRevision:2,preserveNativeSidebar:false});
 f.surface.refreshGeometry=()=>true;f.surface.isRoleCurrent=()=>intact;
 f.surface.retireRole=()=>{retired++;};f.surface.suspend=(_h,_reason,role)=>{if(role==='sidebar')f.actual({workspace:true,sidebar:false});};
 f.surface.restoreRole=()=>{restored++;intact=true;return f.frames[1];};f.bridge.releaseRole=()=>released.promise;
 await f.controller.start({});await f.both();const confirms=f.calls.confirm.length;
 intact=false;f.change();await drain();assert.equal(retired,1);assert.equal(restored,0);assert.equal(f.calls.dispose,0);
 assert.deepEqual(f.surface.visibility(),{workspace:true,sidebar:false});
 f.message('sidebar');await drain();assert.equal(f.calls.confirm.length,confirms,'retired window cannot reacquire while release is pending');
 released.resolve({ok:true});await drain();assert.equal(restored,1);
 assert.deepEqual(f.surface.visibility(),{workspace:true,sidebar:false},'insertion cannot grant visibility');
 f.message('sidebar');await drain();assert.deepEqual(f.surface.visibility(),{workspace:true,sidebar:true});
 assert.equal(f.calls.register,1);f.controller.revoke();f.change();await drain();assert.equal(restored,1);
});


test('explicit sidebar user exit stops enhancement rather than automatically rejoining',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.message('sidebar',{data:{type:'VAIWL_UI_EXIT',role:'sidebar'}});await drain();assert.equal(f.calls.dispose,1);assert.equal(f.controller.isWorkspacePresented(),false);
});
test('sidebar recovery attempts once per proved layout revision',async()=>{
 const f=fixture();let restored=0,revision=1;const inspect=f.adapter.inspect;
 f.adapter.inspect=()=>({...inspect(),sidebarRect:{x:0,y:0,width:240,height:400},sidebarRevision:revision,preserveNativeSidebar:false});
 f.surface.refreshGeometry=()=>true;f.surface.retireRole=()=>{};f.surface.suspend=()=>{};f.surface.restoreRole=()=>{restored++;return f.frames[1];};f.bridge.releaseRole=async()=>({ok:true});
 await f.controller.start({});await f.both();
 f.message('sidebar',{data:{type:'VAIWL_UI_SUSPEND',role:'sidebar'}});await drain();assert.equal(restored,1);
 f.message('sidebar',{data:{type:'VAIWL_UI_SUSPEND',role:'sidebar'}});await drain();f.change();await drain();assert.equal(restored,1);
 revision++;f.change();await drain();assert.equal(restored,2);assert.equal(f.calls.dispose,0);f.controller.stop();
});

test('reading keeps the independently granted sidebar and restores it after a native layer without reopening workspace',async()=>{
 const f=publishingFixture({initialMode:'reading'});await f.controller.start({});f.message();await drain();
 assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:false});f.message('sidebar');await drain();
 assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:true});assert.equal(f.slot.children.length,1);
 f.layer(true);f.change();assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:false});
 f.layer(false);f.change();assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:true});assert.equal(f.calls.show,0);
 f.frames[1].frame.isConnected=false;f.change();assert.equal(f.controller.isWorkspacePresented(),false);assert.equal(f.calls.dispose,0);f.controller.stop();
});


test('explicit native-list choice survives geometry and modal recovery until workspace entry',async()=>{
 const f=publishingFixture({initialMode:'reading'});await f.controller.start({});await f.both();
 f.surrender({role:'sidebar',reason:'native-list',phase:'closing'});f.actual({workspace:false,sidebar:false});f.surrender({role:'sidebar',reason:'native-list'});
 f.change();assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:false});
 f.layer(true);f.change();f.layer(false);f.change();assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:false});
 assert.equal(f.slot.children.length,1);f.slot.children[0].events.click({isTrusted:true});
 assert.deepEqual(f.surface.visibility(),{workspace:true,sidebar:true});f.controller.stop();
});

test('same-document layout replacement preserves native-list choice but never old frame grants',async()=>{
 const f=publishingFixture({initialMode:'reading'});await f.controller.start({});await f.both();
 f.surrender({role:'sidebar',reason:'native-list'});f.actual({workspace:false,sidebar:false});
 f.region();f.change();await drain();
 assert.equal(f.calls.register,2);assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:false});
 assert.equal(f.controller.isWorkspacePresented(),false,'replacement must acquire fresh grants');
 await f.both();assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:false});
 f.controller.showReading();f.slot.children[0].events.click({isTrusted:true});
 assert.deepEqual(f.surface.visibility(),{workspace:true,sidebar:true});f.controller.stop();
});

for(const failure of ['missing-boundary','insertion-error'])test('sidebar '+failure+' remains local and recovers only on a new proved revision',async()=>{
 const f=publishingFixture();let attempts=0,revision=1;const inspect=f.adapter.inspect;
 f.adapter.inspect=()=>({...inspect(),sidebarRect:{x:0,y:0,width:240,height:400},sidebarRevision:revision,preserveNativeSidebar:false});
 f.surface.refreshGeometry=()=>true;f.surface.retireRole=()=>{};f.surface.suspend=(_h,_reason,role)=>{if(role==='sidebar')f.actual({workspace:true,sidebar:false});};
 f.surface.restoreRole=()=>{attempts++;if(attempts===1){if(failure==='insertion-error')throw Error('detached-boundary');return null;}return f.frames[1];};
 f.bridge.releaseRole=async()=>({ok:true});await f.controller.start({});await f.both();
 f.message('sidebar',{data:{type:'VAIWL_UI_SUSPEND',role:'sidebar'}});await drain();
 assert.equal(attempts,1);assert.equal(f.controller.isWorkspacePresented(),true);
 f.change();f.change();await drain();assert.equal(attempts,1,'no same-layout retries');
 revision++;f.change();await drain();assert.equal(attempts,2);
 assert.deepEqual(f.surface.visibility(),{workspace:true,sidebar:false},'restoration alone never grants presentation');
 f.message('sidebar');await drain();assert.deepEqual(f.surface.visibility(),{workspace:true,sidebar:true});
 assert.equal(f.calls.dispose,0);f.controller.revoke();revision++;f.change();await drain();assert.equal(attempts,2);
});


test('native dispatch holds sidebar masks off across geometry and releases only current authority',async()=>{
 for(const ending of ['release','revoke','route','deadline']){
  const f=publishingFixture();await f.controller.start({});await f.both();
  const release=f.controller.beginNativeDispatch();assert.equal(typeof release,'function');
  assert.equal(f.controller.beginNativeDispatch(),null);assert.equal(f.controller.showNativeReading(),true);
  f.change();await drain();assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:false});
  assert.equal(f.controller.showWorkspace(),false,'presentation cannot supersede an in-flight native action');
  if(ending==='revoke')f.controller.revoke();
  if(ending==='route'){f.doc.location.href+='c/changed';f.change();}
  if(ending==='deadline')f.tick(6000);
  release();release();
  assert.deepEqual(f.surface.visibility(),{workspace:false,sidebar:ending==='release'||ending==='deadline'});
  f.controller.stop();
 }
});

test('intrinsic sidebar size is bounded, correlated and authorized without granting presentation',async()=>{
 const f=fixture(),sizes=[];f.surface.resizeSidebar=(_h,size)=>sizes.push(size);
 const send=(patch={},event={})=>f.message('sidebar',{data:{type:'VAIWL_UI_INTRINSIC_SIZE',role:'sidebar',height:300,...patch},...event});
 await f.controller.start({});send();await drain();assert.deepEqual(sizes,[]);
 await f.both();const shown=f.calls.show;
 send({}, {source:{}});send({}, {origin:'https://chatgpt.com'});send({height:127});send({height:1025});send({height:NaN});send({extra:true});send({top:-1});send({bottom:1025});send({top:40});send({role:'workspace'});await drain();assert.deepEqual(sizes,[]);
 send();await drain();assert.deepEqual(sizes,[300]);assert.equal(f.calls.show,shown);
 f.controller.revoke();send();await drain();assert.deepEqual(sizes,[300]);
});

test('sidebar focus reveal needs the live focused frame and cannot grant presentation',async()=>{
 const f=fixture(),reveals=[];f.surface.revealSidebar=handle=>reveals.push(handle);
 const send=(data={},event={})=>f.message('sidebar',{data:{type:'VAIWL_UI_REVEAL_FOCUS',role:'sidebar',top:10,bottom:40,...data},...event});
 await f.controller.start({});f.doc.activeElement=f.frames[1].frame;send();await drain();assert.equal(reveals.length,0);
 await f.both();const shown=f.calls.show;
 send({}, {source:{}});send({}, {origin:'https://chatgpt.com'});send({extra:true});send({top:-1});send({bottom:1025});send({top:40});send({role:'workspace'});await drain();assert.equal(reveals.length,0);
 f.doc.activeElement=f.frames[0].frame;send();await drain();assert.equal(reveals.length,0);
 f.doc.activeElement=f.frames[1].frame;f.layer(true);send();await drain();assert.equal(reveals.length,0);
 f.layer(false);send();await drain();assert.equal(reveals.length,1);assert.equal(f.calls.show,shown);
 f.controller.revoke();send();await drain();assert.equal(reveals.length,1);
});

test('sidebar edge wheel requires a correlated live grant and bounded geometry; never presents',async()=>{
 const f=fixture(),scrolls=[];f.surface.scrollSidebar=(_handle,input)=>scrolls.push(input);
 const send=(patch={},event={})=>f.message('sidebar',{data:{type:'VAIWL_UI_SIDEBAR_WHEEL',role:'sidebar',x:40,y:50,delta:80,...patch},...event});
 await f.controller.start({});send();await drain();assert.deepEqual(scrolls,[]);
 await f.both();const shown=f.calls.show;
 send({}, {source:{}});send({}, {origin:'https://chatgpt.com'});
 for(const patch of [{role:'workspace'},{x:-1},{x:4097},{y:1025},{delta:0},{delta:1025},{delta:NaN},{delta:1.5},{extra:true}])send(patch);
 f.layer(true);send();await drain();assert.deepEqual(scrolls,[]);
 f.layer(false);send();await drain();assert.deepEqual(scrolls,[{x:40,y:50,delta:80}]);assert.equal(f.calls.show,shown);
 f.controller.revoke();send();await drain();assert.equal(scrolls.length,1);
});

// Presentation-only reproof must not replace the existing document or grants.
test('closed flow layout reproof restores workspace after persistent native presentation change',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();
 let same=false,reproofs=0;f.surface.backend='document-flow';f.surface.isSameNativeRegions=()=>same;
 f.surface.hasNativeInputFocus=()=>false;f.adapter.inspectStructure=()=>f.adapter.inspect();
 f.surface.refreshNativeBaseline=(_handle,inspect)=>{reproofs++;const result=inspect();same=true;return result;};
 assert.equal(f.controller.showWorkspace(true),true);assert.equal(reproofs,1);
 assert.equal(f.calls.register,1);assert.equal(f.calls.confirm.length,2);assert.equal(f.calls.dispose,0);
 assert.equal(f.controller.showWorkspace(),true);assert.equal(reproofs,1);f.controller.stop();
});
for(const boundary of ['layer','dispatch','expired','route'])test('flow reproof cannot cross '+boundary+' boundary',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();
 let reproofs=0;f.surface.backend='document-flow';f.surface.isSameNativeRegions=()=>false;f.surface.hasNativeInputFocus=()=>false;
 f.surface.refreshNativeBaseline=()=>{reproofs++;return f.adapter.inspect();};
 if(boundary==='layer')f.layer(true);
 if(boundary==='dispatch')f.controller.beginNativeDispatch();
 if(boundary==='expired')f.tick(22000);
 if(boundary==='route')f.doc.location.href+='c/changed';
 assert.equal(f.controller.showWorkspace(),false);assert.equal(reproofs,0);f.controller.stop();
});

test('completed native input reproof repairs paused layout without waiting for renewal',async()=>{
 const f=fixture();await f.controller.start({});await f.both();
 let same=false,reproofs=0;f.surface.backend='document-flow';f.surface.isSameNativeRegions=()=>same;
 f.surface.hasNativeInputFocus=()=>true;f.adapter.inspectStructure=()=>f.adapter.inspect();
 f.surface.refreshNativeBaseline=(_handle,inspect)=>{reproofs++;same=true;return inspect();};
 f.surrender({role:'workspace',reason:'workspace-geometry'});
 assert.equal(f.slot.children.length,0);assert.equal(reproofs,0);
 f.surrender({role:'workspace',reason:'native-input'});
 assert.equal(reproofs,1);assert.equal(f.slot.children.length,1);assert.equal(f.calls.dispose,0);
 assert.equal(f.calls.register,1);assert.equal(f.calls.confirm.length,2);assert.equal(f.calls.show,1);
 f.surface.hasNativeInputFocus=()=>false;f.slot.children[0].events.click({isTrusted:true});
 assert.equal(f.calls.show,2);assert.equal(f.calls.dispose,0);f.controller.stop();
});

test('closed flow re-entry refreshes CSS-only viewport changes without replacing grants',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();
 let stale=true,reproofs=0;f.surface.backend='document-flow';f.surface.isSameNativeRegions=()=>true;
 f.surface.needsNativeBaselineRefresh=()=>stale;f.adapter.inspectStructure=()=>f.adapter.inspect();
 f.surface.refreshNativeBaseline=(_handle,inspect)=>{reproofs++;stale=false;return inspect();};
 assert.equal(f.controller.showWorkspace(true),true);assert.equal(reproofs,1);
 assert.equal(f.calls.register,1);assert.equal(f.calls.confirm.length,2);assert.equal(f.calls.dispose,0);
 assert.equal(f.controller.showWorkspace(),true);assert.equal(reproofs,1);f.controller.stop();
});

test('failed responsive native proof cannot reopen workspace on stale coordinates',async()=>{
 const f=fixture();await f.controller.start({});await f.both();f.controller.showReading();
 const shown=f.calls.show;f.surface.backend='document-flow';f.surface.isSameNativeRegions=()=>true;
 f.surface.needsNativeBaselineRefresh=()=>true;f.surface.refreshNativeBaseline=()=>null;
 assert.equal(f.controller.showWorkspace(true),false);assert.equal(f.calls.show,shown);
 assert.equal(f.calls.dispose,0);f.controller.stop();
});
