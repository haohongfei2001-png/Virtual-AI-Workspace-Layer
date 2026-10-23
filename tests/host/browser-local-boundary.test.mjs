import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserLocalAuthority} from '../../src/runtime/browser-local-authority.mjs';
import {createBrowserLocalControl} from '../../src/runtime/browser-local-control.mjs';
import {installBrowserLocalLifecycle} from '../../src/host/browser-local-lifecycle.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const origin='https://chatgpt.com',target=origin+'/c/33333333-3333-4333-8333-333333333333',frame={tabId:7,frameId:0,documentId:'doc',actualURL:origin+'/',incognito:false,documentLifecycle:'active'};
test('local native intent retains store once, renews grant, never authorizes replacement or unannounced route',async()=>{
 let now=1000,id=0;const dropped=[],a=createBrowserLocalAuthority({allowedURL:u=>u.startsWith(origin+'/'),now:()=>now,makeId:()=>`id_${++id}`,onDiscard:k=>dropped.push(k)});
 await a.bindPersonal(frame,'mine');const old=a.peek(frame).grant,scope=a.scopeFor(frame);
 assert(a.prepareNavigation(frame,target));a.invalidateTab(7,{documentId:'doc',url:target,documentLifecycle:'active'});
 const next={...frame,actualURL:target};assert.equal(a.scopeFor(next).key,scope.key);assert.notEqual(a.peek(next).grant.id,old.id);assert.equal(a.peek(frame).state,'unverified');assert.equal(dropped.length,0);
 assert(a.takeArrival(next));assert.equal(a.takeArrival(next),null);
 a.invalidateTab(7,{documentId:'doc',url:origin+'/',documentLifecycle:'active'});assert.equal(a.scopeFor(next),null);assert.deepEqual(dropped,[scope.key]);
 await a.bindPersonal(frame,'mine');a.prepareNavigation(frame,target);now+=6000;a.invalidateTab(7,{documentId:'doc',url:target,documentLifecycle:'active'});assert.equal(a.scopeFor(next),null);
 await a.bindPersonal(frame,'mine');a.prepareNavigation(frame,target);a.invalidateTab(7,{documentId:'replacement',url:target,documentLifecycle:'active'});assert.equal(a.scopeFor({...next,documentId:'replacement'}),null);
});
function controlFixture(){
 const stored={},sent=[],a=createBrowserLocalAuthority({allowedURL:u=>u.startsWith(origin+'/')});let getHook=null,restart={ok:true};
 const chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p},tabs:{query:async()=>[{id:7,incognito:false}],sendMessage:async(...args)=>{sent.push(args);return restart;}},webNavigation:{getFrame:async()=>({documentId:'doc',url:origin+'/',documentLifecycle:'active'})},storage:{local:{get:async key=>{if(getHook)await getHook();return {[key]:stored[key]};},set:async value=>Object.assign(stored,value)}}};
 const service={authority:a,invalidate:({tabId})=>a.invalidateTab(tabId)},control=createBrowserLocalControl({chrome,service,allowedURL:u=>u.startsWith(origin+'/'),urlPolicy:createURLPolicy()});
 return {control,a,stored,sent,hook:h=>getHook=h,restart:r=>restart=r,popup:{id:'ext',url:chrome.runtime.getURL('status.html')},content:{id:'ext',url:origin+'/',frameId:0,documentId:'doc',documentLifecycle:'active',tab:{id:7,incognito:false}}};
}
test('only private confirmation unlocks; descriptor alone restores nothing; failed restart revokes',async()=>{
 const f=controlFixture(),m={v:1,type:'HOST_LOCAL_SPACE',action:'unlock'};
 assert.equal((await f.control.handle(m,f.content)).ok,false);assert.equal(Object.keys(f.stored).length,0);
 assert.equal((await f.control.handle(m,f.popup)).ok,true);assert.equal(f.a.scopeFor(frame).storage,'personal');assert.equal(Object.keys(f.stored).length,1);
 assert.equal((await f.control.handle({...m,action:'lock'},f.content)).ok,true);assert.equal(f.a.scopeFor(frame),null);
 assert.equal((await f.control.handle({...m,action:'status'},f.popup)).mode,'locked');
 f.restart({ok:false});assert.equal((await f.control.handle(m,f.popup)).ok,false);assert.equal(f.a.scopeFor(frame),null);
});
test('a concurrent content lock fences delayed popup binding instead of being dropped as busy',async()=>{
 const f=controlFixture();let release,entered;const ready=new Promise(r=>entered=r);f.hook(()=>new Promise(r=>{release=r;entered();}));
 const pending=f.control.handle({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'},f.popup);await ready;
 assert.equal((await f.control.handle({v:1,type:'HOST_LOCAL_SPACE',action:'lock'},f.content)).ok,true);release();
 assert.equal((await pending).ok,false);assert.equal(f.a.scopeFor(frame),null);assert.equal(f.sent.length,0);
});
function lifecycleFixture(){
 const win=new EventTarget(),doc=new EventTarget();Object.assign(doc,{defaultView:win,visibilityState:'visible',activeElement:null});let listener,release,starts=0,stops=0;
 const runtime={id:'ext',getURL:()=> 'chrome-extension://ext/',sendMessage:()=>new Promise(r=>release=r),onMessage:{addListener:f=>listener=f,removeListener:()=>{}}};
 const remove=installBrowserLocalLifecycle({document:doc,runtime,session:{stop:()=>stops++,start:async()=>starts++}});
 return {win,remove,resolve:value=>release(value),starts:()=>starts,stops:()=>stops,listener:()=>listener};
}
test('foreground restart waits for lock confirmation; failed lock never exposes previous personal data',async()=>{
 const f=lifecycleFixture();f.win.dispatchEvent(new Event('blur'));await Promise.resolve();f.win.dispatchEvent(new Event('focus'));await Promise.resolve();assert.equal(f.starts(),0);
 f.resolve({ok:false});await new Promise(r=>setImmediate(r));assert.equal(f.starts(),0);f.remove();
 const g=lifecycleFixture();g.win.dispatchEvent(new Event('blur'));await Promise.resolve();g.win.dispatchEvent(new Event('focus'));g.resolve({ok:true});await new Promise(r=>setImmediate(r));assert.equal(g.starts(),1);g.remove();
});

test('keyboard activation of native controls locks before account menus can change context',async()=>{
 const handlers=new Map(),win=new EventTarget();let stops=0,locks=0;
 const doc={defaultView:win,addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
 const runtime={id:'ext',getURL:()=> 'chrome-extension://ext/',sendMessage:async()=>{locks++;return {ok:true};},onMessage:{addListener(){},removeListener(){}}};
 const remove=installBrowserLocalLifecycle({document:doc,runtime,session:{stop:()=>stops++,start:async()=>{}}});
 const target={closest:selector=>selector==='[data-va-owned]'?null:{}};
 handlers.get('keydown')({key:'Enter',isTrusted:false,target});assert.equal(stops,0);
 handlers.get('keydown')({key:'ArrowDown',isTrusted:true,target});assert.equal(stops,0);
 handlers.get('keydown')({key:'Enter',isTrusted:true,target});assert.equal(stops,1);await Promise.resolve();assert.equal(locks,1);
 handlers.get('keydown')({key:' ',isTrusted:true,target});assert.equal(stops,2);await Promise.resolve();assert.equal(locks,2);
 remove();assert.equal(handlers.has('keydown'),false);
});
