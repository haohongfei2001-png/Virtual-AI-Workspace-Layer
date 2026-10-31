import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
// Isolated DOM/lifecycle mocks: these contracts do not certify actual Chrome masks.
function fixture(onTerminated=()=>{},initialMode='workspace'){
 const listeners=new Map(),timers=new Map();let time=1000,n=0,layer=false,region=1,observer,surrender;
 const calls={updates:[],show:0,reading:0,suspend:0,dispose:0,confirm:[],register:0,stop:0};
 const win={addEventListener:(k,fn)=>{if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener:(k,fn)=>listeners.get(k)?.delete(fn),MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}};
 const slot={isConnected:true,children:[],append(b){this.children.push(b);b.parent=this;}};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},createElement:()=>({dataset:{},style:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.events[k]=fn;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}})};
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{}}}));
 const binding={documentToken:'token',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(60000).toISOString()};
 const adapter={updateBinding:next=>{calls.updates.push(next);return true;},start:async()=>({binding}),stop:()=>{calls.stop++;},inspect:()=>({ok:true,regionEpoch:region,navigationSlot:slot}),hasNativeLayer:()=>layer};
 const surface={mount:async(c,i,o)=>(surrender=o.onSurrender,{id:'mount',documentToken:'token',regionEpoch:region}),frames:()=>frames,showWorkspace:(_handle,{roles=['workspace','sidebar']}={})=>{if(roles.includes('workspace'))calls.show++;},showReading:()=>{calls.reading++;},suspend:()=>{calls.suspend++;},dispose:()=>{calls.dispose++;}};
 const bridge={registerMount:async()=>{calls.register++;return {ok:true};},confirmParent:async value=>{calls.confirm.push(value);return {ok:true,grant:{id:`grant_${value.role}`,mountId:'mount',role:value.role,parentDocumentId:'parent',uiDocumentId:`ui_${value.role}`,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};}};
 const controller=createSurfaceController({onTerminated,initialMode,document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://extension',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++n;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const message=(role='workspace',patch={})=>{const event={source:frames.find(x=>x.role===role).frame.contentWindow,origin:'chrome-extension://extension',data:{type:'VAIWL_UI_JOIN',role,nonce:`nonce_${role}`},...patch};for(const fn of listeners.get('message')??[])fn(event);};
 const both=async()=>{message();message('sidebar');await drain();};
 return {renewAck:()=>({ok:true,binding:{...binding,expiresAt:new Date(time+20000).toISOString()},grants:['workspace','sidebar'].map(role=>({id:`grant_${role}`,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:`ui_${role}`,scopeGrantId:'scope',expiresAt:new Date(time+20000).toISOString()}))}),surrender:event=>surrender?.(event),pagehide:()=>{for(const fn of listeners.get('pagehide')??[])fn();},controller,bridge,adapter,surface,doc,slot,frames,binding,calls,message,both,change:()=>observer?.(),layer:value=>{layer=value;},region:()=>{region++;},tick:ms=>{time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}
test('termination cleans owned surfaces without stopping the document-owned producer',async()=>{const events=[];let f;f=fixture(reason=>events.push({reason,dispose:f.calls.dispose,stops:f.calls.stop,available:f.controller.showWorkspace(),returns:f.slot.children.length}));f.controller.stop();assert.deepEqual(events,[]);await f.controller.start({});await f.both();f.controller.showReading();assert.equal(f.slot.children.length,1);const priorStops=f.calls.stop;f.controller.stop('explicit-close');assert.deepEqual(events,[{reason:'explicit-close',dispose:1,stops:priorStops,available:false,returns:0}]);f.controller.stop('again');assert.equal(events.length,1);});
for(const [kind,reason]of [['revoke','ui-authority-revoked'],['pagehide','page-hidden'],['restart','surface-restart']])test('termination reports '+kind+' exactly once with its reason',async()=>{const reasons=[],f=fixture(r=>reasons.push(r));await f.controller.start({});await f.both();if(kind==='revoke')f.controller.revoke();if(kind==='pagehide')f.pagehide();if(kind==='restart')await f.controller.start({});assert.deepEqual(reasons,[reason]);assert.equal(f.calls.dispose,1);if(kind!=='restart'){f.controller.stop();assert.equal(reasons.length,1);}else f.controller.stop();});
test('throwing callback cannot interrupt disposal or leave reading return behind',async()=>{let notifications=0;const f=fixture(()=>{notifications++;throw Error('callback-failed');});await f.controller.start({});await f.both();f.controller.showReading();assert.doesNotThrow(()=>f.controller.revoke());assert.equal(notifications,1);assert.equal(f.calls.dispose,1);assert.equal(f.slot.children.length,0);assert.equal(f.controller.showWorkspace(),false);assert.doesNotThrow(()=>f.controller.stop());assert.equal(notifications,1);});
test('adapter stop failure cannot strand owned surface or suppress termination notification',async()=>{const reasons=[],f=fixture(reason=>reasons.push(reason));await f.controller.start({});await f.both();f.adapter.stop=()=>{throw Error('adapter failure');};assert.doesNotThrow(()=>f.controller.stop('session-renew-failed'));assert.equal(f.calls.dispose,1);assert.equal(f.slot.children.length,0);assert.deepEqual(reasons,['session-renew-failed']);assert.equal(f.controller.showWorkspace(),false);});

test('reading recovery needs only workspace authority and retains its native return',async()=>{const f=fixture(()=>{},'reading');await f.controller.start({});f.message();await drain();assert.equal(f.calls.reading,1);assert.equal(f.calls.show,0);f.message('sidebar');await drain();assert.equal(f.calls.reading,1);assert.equal(f.calls.show,0);assert.equal(f.slot.children.length,1);f.controller.stop();});
test('termination reports detached presentation intent, including native surrender',async()=>{for(const reading of [false,true]){const events=[],f=fixture((reason,presentation)=>events.push(presentation));await f.controller.start({});await f.both();if(reading)f.surrender({reason:'native-input'});f.controller.stop('ui-frame-suspended');assert.deepEqual(events,[{mode:reading?'reading':'workspace',sidebarDesired:true}]);assert(Object.isFrozen(events[0]));}});

test('temporary native or geometry suspension preserves user intent across fresh mount recovery',async()=>{
 for(const mode of ['workspace','reading'])for(const reason of ['native-layer','workspace-geometry']){
  const events=[],f=fixture((cause,presentation)=>events.push({cause,presentation}),mode);
  await f.controller.start({});await f.both();
  f.surrender({role:'workspace',reason});
  assert.equal(f.controller.presentationSnapshot().mode,'suspended');
  assert.equal(f.controller.presentationSnapshot().desiredMode,mode);
  f.controller.stop('ui-frame-suspended');
  assert.deepEqual(events,[{cause:'ui-frame-suspended',presentation:{mode,sidebarDesired:true}}]);
  assert.equal(f.calls.dispose,1);assert.equal(f.controller.showWorkspace(),false);
 }
});
