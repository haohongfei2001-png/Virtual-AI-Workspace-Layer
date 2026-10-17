import assert from 'node:assert/strict';
import {createBrowserRequestContext} from '/tmp/vaiwl-free-takeover/src/runtime/browser-request-context.mjs';
import {createScopeAuthority} from '/tmp/vaiwl-free-takeover/src/runtime/scope-authority.mjs';
const origin='https://chatgpt.com',c='11111111-1111-4111-8111-111111111111';
const frame={tabId:1,frameId:0,documentId:'doc',documentLifecycle:'active',incognito:false,actualURL:origin+'/c/'+c},bf={documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:frame.actualURL};
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(opts={}) {let n=0,held=false,release;const event=()=>({addListener(f){this.f=f},removeListener(){}}),webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(x=>[x,event()]));const owner=createBrowserRequestContext({origin,webRequest,getTab:async()=>({id:1,incognito:false}),getFrame:()=>{if(held){held=false;return new Promise(r=>release=r)}return Promise.resolve(bf)},associatePage:async q=>({...q,association:'explicit-body-id'}),makeId:()=>`id${++n}`,...opts});const details=(requestId,ctx)=>({tabId:1,frameId:0,documentId:'doc',documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId,url:origin+'/backend-api/conversation/'+c,requestHeaders:[{name:'Chatgpt-Account-Id',value:ctx}]});return {owner,hold(){held=true},release(){release(bf)},send(id,ctx){const d=details(id,ctx);webRequest.onSendHeaders.f(d);return d},async finish(d){webRequest.onCompleted.f({...d,statusCode:200,fromCache:false});await flush()}}}
{
const f=fixture();const a=f.send('a','personal');await flush();await f.finish(a);const receipt=await f.owner.verify(frame);assert(receipt,'Native event without fabricated incognito field accepted');f.hold();f.send('b','team');assert.equal(f.owner.isCurrent(frame,receipt),false);console.log('PASS native Chrome event shape and synchronous early invalidation');f.owner.stop();
}
{
const f=fixture();const a=f.send('a','personal');await flush();f.hold();const b=f.send('b','team');await flush();await f.finish(a);f.release();await flush();await f.finish(b);assert.equal(await f.owner.verify(frame),null);console.log('PASS original deferred getFrame concurrency counterexample');f.owner.stop();
}
{
let tick;const auth=createScopeAuthority({profile:{id:'c2',singlePersonalDefault:false,browserRequestContext:true},provider:{read:async()=>({})},contextObserver:{verify:()=>new Promise(()=>{})},schedule:f=>(tick=f,1),cancel(){}});const p=auth.refresh(frame,'bind');await flush();tick();assert.equal((await p).state,'unverified');assert.notEqual(auth.peek(frame).state,'pending');console.log('PASS context verify included in total deadline');
const abort=new AbortController();const q=auth.refresh(frame,'bind',abort.signal);await flush();abort.abort();assert.equal((await q).state,'unverified');console.log('PASS abort releases hung context verify');
}
{
const f=fixture({maxRequests:1});for(let i=0;i<4;i++){const a=f.send('a'+i,'personal');await flush();await f.finish(a)}const receipt=await f.owner.verify(frame);assert(receipt);f.send('switch','team');console.log('CAPACITY residual old receipt authorized:',f.owner.isCurrent(frame,receipt));f.owner.stop();
}
{
const f=fixture({maxRequests:1});const a=f.send('a','personal');await flush();f.send('b','team');await f.finish(a);console.log('INFLIGHT CAPACITY residual selected:',(await f.owner.verify(frame))?.contextId??null);f.owner.stop();
}
