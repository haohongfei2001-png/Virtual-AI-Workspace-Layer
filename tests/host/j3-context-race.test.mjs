import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
import {createHostDocumentHandshake} from '../../src/b1/host-document-handshake.mjs';
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const calls=[],events=new Map(),listeners=new Set();let responder,mounts=0;
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/c/33333333-3333-4333-8333-333333333333'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(21000).toISOString()};
 responder=m=>m.type==='HOST_HELLO'?{ok:true,binding}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey:'scope'}:{ok:true};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);return responder(m);}};
 const client=createHostContentSession({document,runtime,contextRecovery:true,now:()=>1000,elapsedNow:()=>1000,makeId:()=> 'client',adapterFactory:()=>({start:async()=>({}),inspect:()=>({ok:true}),stop(){}}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:()=>({start:async()=>{mounts++;return {id:'mount'};},stop(){},showWorkspace:()=>true})});
 return {client,calls,document,binding,events,setResponder:f=>{responder=f;},get mounts(){return mounts;}};
}
test('READY arriving before stale ambiguous REFRESH response remains a single recovery signal',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const oldRefresh=deferred();let refreshes=0;
 f.setResponder(m=>m.type==='HOST_HELLO'?{ok:true,binding:f.binding}:m.type==='HOST_REFRESH'?++refreshes===1?oldRefresh.promise:{state:'verified',scopeKey:'scope'}:{ok:true});
 const started=f.client.start();await drain();assert.equal(refreshes,1);
 // Worker verify has already observed no receipt. The browser receipt completes
 // and its independent tabs.sendMessage arrives before the old RPC response.
 await f.client.contextReady();assert.equal(f.mounts,0);
 oldRefresh.resolve({state:'ambiguous',reason:'current-context-unproven'});await started;await drain();
 assert.equal(f.mounts,1,'one real READY must survive an in-flight stale REFRESH');
 assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);
});
test('real handshake invalidated-during-check reply before PENDING must not permanently discard later READY',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const frameWait=deferred();let first=true,id=0;
 const frame={documentId:'browser',url:f.document.location.href,documentLifecycle:'active'};
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'browser',documentLifecycle:'active',url:frame.url};
 const handshake=createHostDocumentHandshake({extensionId:'extension',getFrame:()=>first?(first=false,frameWait.promise):Promise.resolve(frame),allowedURL:u=>u===frame.url,now:()=>1000,makeId:()=> 'token-'+(++id)});
 let denied;
 f.setResponder(async m=>{if(m.type!=='HOST_HELLO')return {state:'verified',scopeKey:'scope'};const reply=await handshake.handle(m,sender);if(!reply.ok)denied=reply;return reply;});
 const started=f.client.start();await drain();handshake.invalidate({tabId:1});frameWait.resolve(frame);await started;
 assert.deepEqual(denied,{ok:false,reason:'invalidated-during-check'});assert.equal(f.mounts,0);
 // service.invalidate precedes its independent PENDING notification; transport
 // response and notification need not share a delivery queue.
 f.client.contextPending();await f.client.contextReady();await drain();
 assert.equal(f.mounts,1,'explicit pending then ready must recover a superseded HELLO');
 assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);
});
const helloCount=f=>f.calls.filter(m=>m.type==='HOST_HELLO').length;
function waitingRefresh(f,{recovery='verified'}={}){const pending=deferred();let count=0;f.setResponder(m=>m.type==='HOST_HELLO'?{ok:true,binding:f.binding}:m.type==='HOST_REFRESH'?++count===1?pending.promise:{state:recovery,scopeKey:recovery==='verified'?'scope':undefined}:{ok:true});return pending;}
test('repeated early READY coalesces to one recovery, and successful session ignores duplicates',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const pending=waitingRefresh(f);const started=f.client.start();await drain();
 for(let i=0;i<20;i++)await f.client.contextReady();pending.resolve({state:'ambiguous'});await started;await drain();assert.equal(helloCount(f),2);assert.equal(f.mounts,1);
 for(let i=0;i<20;i++)await f.client.contextReady();await drain();assert.equal(helloCount(f),2);assert.equal(f.mounts,1);
});
for(const action of ['stop','pagehide','persisted-pagehide'])test(action+' cancels the early READY and late REFRESH cannot revive it',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const pending=waitingRefresh(f);const started=f.client.start();await drain();await f.client.contextReady();
 if(action==='stop')f.client.stop();else f.events.get('pagehide')({persisted:action==='persisted-pagehide'});
 pending.resolve({state:'ambiguous'});await started;await drain();assert.equal(helloCount(f),1);assert.equal(f.mounts,0);
});
test('route change discards old READY rather than replaying it after the replacement refresh fails',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const pending=waitingRefresh(f,{recovery:'ambiguous'});const started=f.client.start();await drain();await f.client.contextReady();
 f.document.location.href='https://chatgpt.com/c/44444444-4444-4444-8444-444444444444';pending.resolve({state:'ambiguous'});await started;await drain();assert.equal(helloCount(f),2);assert.equal(f.mounts,0);await drain();assert.equal(helloCount(f),2);
});
test('successful REFRESH consumes early READY so a later PENDING waits for new evidence',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const pending=waitingRefresh(f);const started=f.client.start();await drain();await f.client.contextReady();pending.resolve({state:'verified',scopeKey:'scope'});await started;await drain();assert.equal(helloCount(f),1);assert.equal(f.mounts,1);
 f.client.contextPending();await drain();assert.equal(helloCount(f),1,'old READY must not restart after a later context invalidation');
});
test('one READY plus another ambiguous refresh does not create a self-retry loop',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const pending=waitingRefresh(f,{recovery:'ambiguous'});const started=f.client.start();await drain();await f.client.contextReady();pending.resolve({state:'ambiguous'});await started;await drain();assert.equal(helloCount(f),2);assert.equal(f.mounts,0);await drain();assert.equal(helloCount(f),2);
});
for(const reply of [{ok:false,reason:'invalid-sender'},{ok:false,reason:'invalidated-during-check',extra:true},{ok:true,binding:null}])test('ordinary invalid binding remains stopped: '+JSON.stringify(reply),async t=>{
 const f=fixture();t.after(()=>f.client.stop());f.setResponder(()=>reply);await f.client.start();f.client.contextPending();await f.client.contextReady();await drain();assert.equal(helloCount(f),1);assert.equal(f.mounts,0);
});
