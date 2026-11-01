/** Controller lifecycle contracts with explicit DOM/surface doubles, not Chrome mask certification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const drain=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function fixture(t,withViewport=false){
 const listeners=new Map(),timers=new Map();let time=1000,serial=0,region=1,unsafe=false,reason=null,stopped=false,layer=false,continuity=true;
 const calls={mount:0,register:0,confirm:0,show:0,suspend:0,dispose:0,revoke:0,termination:[],refresh:0};const visibility={workspace:false,sidebar:false,masks:false};
 const win={addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener(k,fn){listeners.get(k)?.delete(fn);}};
 const observed=[];
 if(withViewport){win.visualViewport={addEventListener:(k,fn)=>win.addEventListener('visual-'+k,fn),removeEventListener:(k,fn)=>win.removeEventListener('visual-'+k,fn)};win.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(node){observed.push(node);}disconnect(){observed.length=0;}};}
 const slot={isConnected:true,children:[],append(b){this.children.push(b);b.parent=this;}},nativeFocus={id:'native-composer'};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},activeElement:nativeFocus,createElement:()=>({dataset:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.events[k]=fn;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},focus(){doc.activeElement=this;}})};
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{},focus(){doc.activeElement=this;}}}));
 const binding={documentToken:'token',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(21000).toISOString()};
 const reading={},history={},header={},composer={},readingViewport={};
 const adapter={updateBinding:()=>true,isSameNativeRegions:inspection=>continuity&&!stopped&&!reason&&inspection.regionEpoch===region,start:async()=>{stopped=false;return {binding};},stop(){stopped=true;},hasNativeLayer:()=>layer,inspect:()=>reason||stopped?{ok:false,reason:reason??'stale-host-binding'}:unsafe?{ok:false,reason:'unsafe-native-geometry',profileId:'fixture'}:{ok:true,regionEpoch:region,navigationSlot:slot,reading,...(withViewport?{readingViewport}:{}),historyMaskRoots:[history],header,composer,protectedRegions:[header,composer]}};
 const hide=(role=null)=>{for(const key of ['workspace','sidebar'])if(!role||role===key)visibility[key]=false;visibility.masks=visibility.workspace||visibility.sidebar;};
 const surface={mount:async()=>{calls.mount++;return {id:'mount',documentToken:'token',regionEpoch:region};},frames:()=>frames,refreshGeometry:(_h,inspection)=>{calls.refresh++;return inspection.ok===true;},showWorkspace:(_h,{roles=['workspace','sidebar']}={})=>{if(roles.includes('workspace'))calls.show++;for(const role of roles)visibility[role]=true;visibility.masks=visibility.workspace||visibility.sidebar;return visibility.workspace;},showReading:()=>hide('workspace'),suspend(_h,_reason,role){calls.suspend++;hide(role);},dispose(){calls.dispose++;hide();}};
 const bridge={registerMount:async()=>{calls.register++;return {ok:true};},confirmParent:async({role})=>{calls.confirm++;return {ok:true,grant:{id:'grant_'+role,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};},revokeMount:async()=>{calls.revoke++;}};
 const controller=createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://extension',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id),onTerminated:reason=>calls.termination.push(reason)});t.after(()=>controller.stop());
 const emit=(name,event)=>{for(const fn of [...listeners.get(name)??[]])fn(event);};
 return {controller,adapter,bridge,doc,slot,frames,observed,readingViewport,scroll:()=>emit('scroll'),visualScroll:()=>emit('visual-scroll'),calls,visibility,nativeFocus,timers,continuity(value){continuity=value;},message(type){emit('message',{origin:'chrome-extension://extension',source:frames[0].frame.contentWindow,data:{type,role:'workspace'}});},renewAck(){return {ok:true,binding:{...binding,expiresAt:new Date(time+20000).toISOString()},grants:frames.map(({role})=>({id:'grant_'+role,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:new Date(time+20000).toISOString()}))};},async start(){await controller.start({});for(const {role,frame}of frames)emit('message',{origin:'chrome-extension://extension',source:frame.contentWindow,data:{type:'VAIWL_UI_JOIN',role,nonce:'nonce_'+role}});await drain();assert.equal(calls.show,1);},resize:()=>emit('resize'),unsafe(value){unsafe=value;},region(){region++;},reason(value){reason=value;},layer(value){layer=value;},tick(ms){time+=ms;for(const [id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}}};
}
test('temporary unsafe workspace geometry preserves independently valid sidebar, removes return and grants no action without destroying mount',async t=>{
 const f=fixture(t);await f.start();const intent=f.controller.intentGuard();f.unsafe(true);f.resize();assert.deepEqual(f.visibility,{workspace:false,sidebar:true,masks:true});assert.equal(f.slot.children.length,0);assert.equal(f.controller.showWorkspace(),false);assert.equal(f.controller.focusFrame('workspace'),false);assert.equal(intent(),false);assert.equal(f.controller.readingGuard()(),false);assert.equal(f.calls.dispose,0);assert.equal(f.calls.revoke,0);assert.deepEqual(f.calls.termination,[]);
});
test('same-region safe recovery preserves user workspace intent without focus or remount',async t=>{
 const f=fixture(t);await f.start();const old=f.controller.intentGuard();f.unsafe(true);f.resize();f.unsafe(false);f.resize();f.resize();
 assert.equal(f.slot.children.length,0);assert.deepEqual(f.visibility,{workspace:true,sidebar:true,masks:true});assert.equal(f.doc.activeElement,f.nativeFocus);assert.equal(f.calls.mount,1);assert.equal(f.calls.register,1);assert.equal(f.calls.confirm,2);assert.equal(f.calls.dispose,0);assert.equal(old(),false);assert.equal(f.controller.presentationMode(),'workspace');
});
test('geometry recovery cannot extend original binding/grant expiration',async t=>{
 const f=fixture(t);await f.start();f.tick(19000);f.unsafe(true);f.resize();f.tick(999);f.unsafe(false);f.resize();assert.equal(f.slot.children.length,0);assert.equal(f.visibility.workspace,true);f.tick(1);assert.equal(f.slot.children.length,0);assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);f.resize();assert.equal(f.slot.children.length,0);
});
for(const kind of ['route','region','frame-detached','frame-document','frame-window','binding','expiry','explicit-revoke'])test('unsafe pause cannot recover after '+kind+' invalidation',async t=>{
 const f=fixture(t);await f.start();f.unsafe(true);f.resize();
 if(kind==='route')f.doc.location.href+='c/other';if(kind==='region')f.region();if(kind==='frame-detached')f.frames[0].frame.isConnected=false;if(kind==='frame-document')f.frames[0].frame.ownerDocument={};if(kind==='frame-window')f.frames[0].frame.contentWindow={};if(kind==='binding')f.reason('stale-host-binding');if(kind==='expiry')f.tick(20000);if(kind==='explicit-revoke')f.controller.revoke();
 f.unsafe(false);f.resize();assert.equal(f.slot.children.length,0);if(kind==='binding'){assert.equal(f.calls.dispose,0);assert.equal(f.controller.showWorkspace(),false);assert.equal(f.visibility.workspace,false);return;}assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);assert.deepEqual(f.visibility,{workspace:false,sidebar:false,masks:false});
});
test('native layer suppresses presentation until closed then restores workspace intent',async t=>{
 const f=fixture(t);await f.start();f.unsafe(true);f.resize();f.layer(true);f.unsafe(false);f.resize();assert.equal(f.slot.children.length,0);assert.equal(f.calls.show,1);f.layer(false);f.resize();assert.equal(f.slot.children.length,0);assert.equal(f.visibility.workspace,true);assert.equal(f.doc.activeElement,f.nativeFocus);
});

for(const mode of ['false','missing'])test('unsafe geometry without '+mode+' legacy continuity hint preserves role-local suspension',async t=>{
 const f=fixture(t);await f.start();if(mode==='false')f.continuity(false);else delete f.adapter.isSameNativeRegions;f.unsafe(true);f.resize();assert.equal(f.calls.dispose,0);assert.equal(f.visibility.workspace,false);assert.equal(f.visibility.sidebar,true);f.unsafe(false);f.resize();assert.equal(f.slot.children.length,0);assert.equal(f.controller.showWorkspace(),true);
});
for(const type of ['VAIWL_UI_SUSPEND','VAIWL_UI_EXIT'])test('paused owned-frame '+type+' still ends authority',async t=>{
 const f=fixture(t);await f.start();f.unsafe(true);f.resize();assert.equal(f.calls.dispose,0);f.message(type);await drain();assert.equal(f.calls.dispose,1);assert.equal(f.calls.termination.at(-1),type==='VAIWL_UI_EXIT'?'ui-user-exit':'ui-frame-suspended');f.unsafe(false);f.resize();assert.equal(f.slot.children.length,0);
});
test('authorized renewal survives presentation-only pause and uses returned absolute deadline',async t=>{
 const f=fixture(t);let release,updates=0;f.adapter.updateBinding=()=>{updates++;return true;};f.bridge.renewSession=()=>new Promise(r=>release=r);await f.start();f.tick(10000);await drain();assert.equal(typeof release,'function');f.unsafe(true);f.resize();f.unsafe(false);f.resize();release(f.renewAck());await drain();assert.equal(updates,1);f.tick(10000);assert.equal(f.controller.showWorkspace(),true);f.tick(10000);assert.equal(f.controller.showWorkspace(),false);assert.equal(f.slot.children.length,0);assert.equal(f.calls.dispose,1);
});
test('ordinary in-place renewal without geometry pause remains valid',async t=>{
 const f=fixture(t);let updates=0;f.adapter.updateBinding=()=>{updates++;return true;};f.bridge.renewSession=async()=>f.renewAck();await f.start();f.tick(10000);await drain();assert.equal(updates,1);assert.equal(f.calls.dispose,0);assert.equal(f.calls.show,1);assert.equal(f.controller.showWorkspace(),true);
});

test('viewport scroll automatically refreshes geometry and observes viewport resize; stop removes listeners',async t=>{
 const f=fixture(t,true);await f.start();assert(f.observed.includes(f.readingViewport));const before=f.calls.refresh;f.scroll();assert.equal(f.calls.refresh,before+1);
 f.visualScroll();assert.equal(f.calls.refresh,before+2);f.controller.stop();const stopped=f.calls.refresh;f.scroll();f.visualScroll();assert.equal(f.calls.refresh,stopped);assert.equal(f.observed.length,0);
});
test('visual viewport pan suspends workspace only and safe scroll restores user intent',async t=>{
 const f=fixture(t,true);await f.start();f.unsafe(true);f.visualScroll();assert.deepEqual(f.visibility,{workspace:false,sidebar:true,masks:true});assert.equal(f.slot.children.length,0);f.unsafe(false);f.scroll();assert.equal(f.controller.presentationMode(),'workspace');assert.equal(f.slot.children.length,0);assert.deepEqual(f.visibility,{workspace:true,sidebar:true,masks:true});
});
