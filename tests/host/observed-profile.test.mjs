import test from 'node:test';
import assert from 'node:assert/strict';
import {CHATGPT_OBSERVED_PROFILE as observed,selectHostSurfaceProfile} from '../../src/host/chatgpt-observed-profile.mjs';
import {LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
import {CHATGPT_SELECTION_CURRENT_BODY} from '../../src/host/current-body-discovery.mjs';
test('observed profile is explicit and cannot replace default or invent authority',()=>{
 assert.equal(selectHostSurfaceProfile(),LEGACY_SURFACE_PROFILE);
 assert.equal(selectHostSurfaceProfile(observed.id),observed);
 for(const value of [null,'unknown','chatgpt-context-unverified',{},true])assert.throws(()=>selectHostSurfaceProfile(value),/unsupported-host-surface-profile/);
 assert.equal(observed.liveVerified,false);assert.equal(observed.reconstruction,false);
 assert.equal(observed.currentBody,CHATGPT_SELECTION_CURRENT_BODY);
 for(const key of ['scopeProfile','sendIntent','sendAckProfile','inputRisk','memberProjectIdAttribute','noneLabel'])assert.equal(Object.hasOwn(observed,key),false);
 assert(Object.isFrozen(observed)&&Object.isFrozen(observed.nativeLayout)&&Object.isFrozen(observed.nativeHomeLayout)&&Object.isFrozen(observed.regions));
});

import {waitForNativeHomeLayout} from '../../src/host/chatgpt-observed-profile.mjs';
test('home and conversation hydration wait once; timeout, route change and pagehide never authorize startup',async()=>{
 for(const pathname of ['/', '/c/33333333-3333-4333-8333-333333333333', '/g/g-p-11111111111111111111111111111111/c/33333333-3333-4333-8333-333333333333'])for(const outcome of ['ready','timeout','route','pagehide']){
  let hydrated=false,notify,disconnected=false,time=0,next=0;const events=new Map(),timers=new Map(),node={};
  const document={location:{pathname,href:'https://chatgpt.com'+pathname},documentElement:{},querySelectorAll:()=>hydrated?[node]:[],defaultView:{performance:{now:()=>time},MutationObserver:class{constructor(fn){notify=fn;}observe(){}disconnect(){disconnected=true;}},setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)}};
  let resolved=false;const pending=waitForNativeHomeLayout({document,profile:{...observed,nativeHomeLayout:{...observed.nativeHomeLayout,returnPlacement:undefined},nativeLayout:{...observed.nativeLayout,returnPlacement:undefined}}}).then(value=>(resolved=true,value));await Promise.resolve();assert.equal(resolved,false);
  if(outcome==='ready'){hydrated=true;notify();await Promise.resolve();assert.equal(resolved,false);time=150;[...timers.values()].find(t=>t.ms===150).fn();}
  if(outcome==='timeout'){time=6000;[...timers.values()].find(t=>t.ms===6000).fn();}
  if(outcome==='route'){document.location.href+='c/changed';hydrated=true;notify();}
  if(outcome==='pagehide')events.get('pagehide')();
  assert.equal(await pending,outcome==='ready');assert.equal(disconnected,true);assert.equal(events.size,0);assert.equal(timers.size,0);
 }
});
