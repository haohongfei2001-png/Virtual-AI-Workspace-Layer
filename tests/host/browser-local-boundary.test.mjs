import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserLocalAuthority} from '../../src/runtime/browser-local-authority.mjs';
import {createBrowserLocalControl} from '../../src/runtime/browser-local-control.mjs';
import {installBrowserLocalLifecycle} from '../../src/host/browser-local-lifecycle.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const origin='https://chatgpt.com',target=origin+'/c/33333333-3333-4333-8333-333333333333',frame={tabId:7,frameId:0,documentId:'doc',actualURL:origin+'/',incognito:false,documentLifecycle:'active'};
test('local native intent retains store once, renews grant, never authorizes replacement or unknown route',async()=>{
 let now=1000,id=0;const dropped=[],a=createBrowserLocalAuthority({allowedURL:u=>u.startsWith(origin+'/')&&!u.includes('/auth/'),now:()=>now,makeId:()=>`id_${++id}`,onDiscard:k=>dropped.push(k)});
 await a.bindPersonal(frame,'mine');const old=a.peek(frame).grant,scope=a.scopeFor(frame);
 assert(a.prepareNavigation(frame,target));a.invalidateTab(7,{documentId:'doc',url:target,documentLifecycle:'active'});
 const next={...frame,actualURL:target};assert.equal(a.scopeFor(next).key,scope.key);assert.notEqual(a.peek(next).grant.id,old.id);assert.equal(a.peek(frame).state,'unverified');assert.equal(dropped.length,0);
 assert(a.takeArrival(next));assert.equal(a.takeArrival(next),null);
 a.invalidateTab(7,{documentId:'doc',url:origin+'/auth/login',documentLifecycle:'active'});assert.equal(a.scopeFor(next),null);assert.deepEqual(dropped,[scope.key]);
 await a.bindPersonal(frame,'mine');a.prepareNavigation(frame,target);now+=6000;a.invalidateTab(7,{documentId:'doc',url:target,documentLifecycle:'active'});assert.equal(a.scopeFor(next).storage,'personal');assert.equal(a.takeArrival(next),null);
 await a.bindPersonal(frame,'mine');a.prepareNavigation(frame,target);a.invalidateTab(7,{documentId:'replacement',url:target,documentLifecycle:'active'});assert.equal(a.scopeFor({...next,documentId:'replacement'}),null);
});
function controlFixture(){
 const stored={},sessionStored={},sent=[],a=createBrowserLocalAuthority({allowedURL:u=>u.startsWith(origin+'/')});let getHook=null,restart={ok:true},nonce=null,probeHook=null;
 const chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p},tabs:{query:async()=>[{id:7,incognito:false}],sendMessage:async(...args)=>{sent.push(args);const m=args[1];if(m.type==='HOST_LOCAL_CONTINUITY'){if(m.action==='probe'){if(probeHook)await probeHook();return {challenge:m.challenge,revision:0,nonce};}nonce=m.nonce;return {ok:true};}if(m.type==='HOST_LOCAL_LOCKED')nonce=null;return restart;}},webNavigation:{getFrame:async()=>({documentId:'doc',url:origin+'/',documentLifecycle:'active'})},storage:{session:{setAccessLevel:async()=>{},get:async key=>({[key]:sessionStored[key]}),set:async value=>Object.assign(sessionStored,structuredClone(value))},local:{get:async key=>{if(getHook)await getHook();return {[key]:stored[key]};},set:async value=>Object.assign(stored,value)}}};
 const service={authority:a,invalidate:({tabId})=>a.invalidateTab(tabId)},control=createBrowserLocalControl({chrome,service,allowedURL:u=>u.startsWith(origin+'/'),urlPolicy:createURLPolicy()});
 return {control,a,stored,sent,chrome,sessionStored,clearNonce:()=>nonce=null,probeHook:h=>probeHook=h,hook:h=>getHook=h,restart:r=>restart=r,popup:{id:'ext',url:chrome.runtime.getURL('status.html')},content:{id:'ext',url:origin+'/',frameId:0,documentId:'doc',documentLifecycle:'active',tab:{id:7,incognito:false}}};
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
 assert.equal((await pending).ok,false);assert.equal(f.a.scopeFor(frame),null);assert.equal(f.a.scopeFor(frame),null);
});
function lifecycleFixture(){
 const win=new EventTarget(),handlers=new Map();let listener,release,starts=0,stops=0;
 const doc={defaultView:win,visibilityState:'visible',addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
 const runtime={id:'ext',getURL:()=> 'chrome-extension://ext/',sendMessage:()=>new Promise(r=>release=r),onMessage:{addListener:f=>listener=f,removeListener:()=>{}}};
 const remove=installBrowserLocalLifecycle({document:doc,runtime,session:{stop:()=>stops++,start:async()=>starts++}});
 const control=label=>({closest:selector=>selector==='[data-va-owned]'||selector.startsWith('[data-testid')?null:control(label),getAttribute:name=>name==='aria-label'?label:null,matches:()=>false});
 const fire=(name,label,extra={})=>handlers.get(name)?.({isTrusted:true,target:control(label),...extra});
 const message=m=>new Promise(resolve=>listener(m,{id:'ext'},resolve));
 return {win,handlers,fire,message,remove,resolve:value=>release(value),starts:()=>starts,stops:()=>stops};
}
test('ordinary focus, visibility, search, tools and keyboard do not revoke a local confirmation',async()=>{
 const f=lifecycleFixture();await f.message({type:'HOST_LOCAL_CONTINUITY',action:'arm',nonce:'nonce',revision:0,expiresAt:Date.now()+60000});
 f.win.dispatchEvent(new Event('blur'));f.win.dispatchEvent(new Event('focus'));assert.equal(f.handlers.has('visibilitychange'),false);
 for(const label of ['Native search','New chat','工具','附件','模型','聊天操作']){f.fire('pointerdown',label);f.fire('keydown',label,{key:'Enter'});}
 assert.equal(f.stops(),0);assert.equal((await f.message({type:'HOST_LOCAL_CONTINUITY',action:'probe',challenge:'check'})).nonce,'nonce');f.remove();
});
test('account risk clears the live witness synchronously; failed revocation cannot reopen old data',async()=>{
 const f=lifecycleFixture();await f.message({type:'HOST_LOCAL_CONTINUITY',action:'arm',nonce:'nonce',revision:0,expiresAt:Date.now()+60000});
 f.fire('keydown','账户',{key:'Enter'});assert.equal(f.stops(),1);assert.equal((await f.message({type:'HOST_LOCAL_CONTINUITY',action:'probe',challenge:'check'})).nonce,null);
 assert.equal((await f.message({type:'HOST_LOCAL_CONTINUITY',action:'arm',nonce:'late',revision:0,expiresAt:Date.now()+60000})).ok,false);
 await Promise.resolve();f.win.dispatchEvent(new Event('focus'));f.resolve({ok:false});await new Promise(r=>setImmediate(r));assert.equal(f.starts(),0);f.remove();
});
test('expiry denies an old grant but a live same-document selection renews without confirmation',async()=>{
 let now=1000;const a=createBrowserLocalAuthority({allowedURL:u=>u.startsWith(origin+'/'),now:()=>now});
 await a.bindPersonal(frame,'mine');const original=a.peek(frame).grant;now+=60001;
 assert.equal(a.peek(frame).state,'unverified');assert(a.hasPersonalSelection(frame));await a.revalidate(frame);
 assert.equal(a.scopeFor(frame).storage,'personal');assert.notEqual(a.peek(frame).grant,original);
 now+=43200000;await a.revalidate(frame);assert.equal(a.scopeFor(frame).storage,'session');
});

function restartedControl(f){
 const a=createBrowserLocalAuthority({allowedURL:u=>u.startsWith(origin+'/')});
 return {a,control:createBrowserLocalControl({chrome:f.chrome,service:{authority:a,invalidate:({tabId})=>a.invalidateTab(tabId)},allowedURL:u=>u.startsWith(origin+'/'),urlPolicy:createURLPolicy()})};
}
test('worker restoration needs both trusted session row and the surviving exact document witness',async()=>{
 const f=controlFixture();await f.control.handle({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'},f.popup);f.control.stop();
 const next=restartedControl(f);await next.control.resume(f.content);assert.equal(next.a.scopeFor(frame).storage,'personal');
 const replacement=restartedControl(f);await replacement.control.resume({...f.content,documentId:'replacement'});assert.equal(replacement.a.scopeFor({...frame,documentId:'replacement'}),null);
 f.clearNonce();const lost=restartedControl(f);await lost.control.resume(f.content);assert.equal(lost.a.scopeFor(frame),null);
 const empty=controlFixture();Object.assign(empty.stored,f.stored);const noSession=restartedControl(empty);await noSession.control.resume(empty.content);assert.equal(noSession.a.scopeFor(frame),null);
});
test('risk during a worker continuity probe fences late restoration and deletes the session binding',async()=>{
 const f=controlFixture();await f.control.handle({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'},f.popup);f.control.stop();
 let release,entered;const ready=new Promise(r=>entered=r);f.probeHook(()=>new Promise(r=>{release=r;entered();}));
 const next=restartedControl(f),pending=next.control.resume(f.content);await ready;
 await next.control.handle({v:1,type:'HOST_LOCAL_SPACE',action:'lock'},f.content);release();await pending;
 assert.equal(next.a.scopeFor(frame),null);assert.deepEqual(f.sessionStored['vaiwl-browser-local-continuity-v1'].rows,[]);
});

test('a stale pre-SPA sender URL cannot block exact-document restoration or local navigation',async()=>{
 const f=controlFixture();await f.control.handle({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'},f.popup);f.control.stop();
 f.chrome.webNavigation.getFrame=async()=>({documentId:'doc',url:target,documentLifecycle:'active'});
 const next=restartedControl(f);await next.control.resume(f.content);assert.equal(next.a.scopeFor({...frame,actualURL:target}).storage,'personal');
 assert.equal((await next.control.handle({v:1,type:'HOST_LOCAL_SPACE',action:'prepare-navigation',target:origin+'/c/44444444-4444-4444-8444-444444444444'},f.content)).ok,true);
});
test('account risk revokes all confirmed documents, not just the triggering tab',async()=>{
 const f=controlFixture();await f.control.handle({v:1,type:'HOST_LOCAL_SPACE',action:'unlock'},f.popup);
 const other={...frame,tabId:8,documentId:'other'};await f.a.bindPersonal(other,'mine');
 await f.control.handle({v:1,type:'HOST_LOCAL_SPACE',action:'lock'},f.content);
 assert.equal(f.a.scopeFor(frame),null);assert.equal(f.a.scopeFor(other),null);
 assert(f.sent.some(([tab,m])=>tab===8&&m.type==='HOST_LOCAL_LOCKED'));
});
