import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserRequestContext} from '../../src/runtime/browser-request-context.mjs';
const origin='https://chatgpt.com',conversationId='33333333-3333-4333-8333-333333333333';
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(t){
 let time=1000,serial=0;const notices=[];
 const events=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>{const listeners=new Set();return [k,{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:d=>{for(const f of listeners)f(d);}}];}));
 const browserFrame={documentId:'document',frameType:'outermost_frame',documentLifecycle:'active',url:origin+'/c/'+conversationId};
 const frame={tabId:7,frameId:0,documentId:'document',documentLifecycle:'active',incognito:false,actualURL:browserFrame.url};
 const owner=createBrowserRequestContext({webRequest:events,origin,getFrame:async()=>browserFrame,getTab:async id=>({id,incognito:false}),associatePage:async d=>({...d,association:'explicit-body-id'}),now:()=>time,elapsedNow:()=>time,makeId:()=> 'receipt_'+(++serial),onInvalidate:()=>notices.push('pending'),onReady:()=>notices.push('ready')});t.after(()=>owner.stop());
 const send=async requestId=>{const r={tabId:7,frameId:0,documentId:'document',documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId,url:origin+'/backend-api/conversation/'+conversationId,requestHeaders:[{name:'chatgpt-account-id',value:'team'}]};events.onSendHeaders.emit(r);await flush();return r;};
 const complete=async r=>{events.onCompleted.emit({...r,statusCode:200,fromCache:false});await flush();};
 return {events,notices,send,complete,advance:ms=>time+=ms,verify:()=>owner.verify(frame)};
}
async function superseded(t){
 const f=fixture(t);await f.complete(await f.send('seed'));assert(await f.verify());
 f.advance(100);const old=await f.send('old');f.advance(1000);const newer=await f.send('newer');await f.complete(newer);const receipt=await f.verify();assert(receipt);return {f,old,receipt};
}
for(const event of ['onErrorOccurred','onBeforeRedirect','http-failure'])test('older accepted request '+event+' cannot revoke a newer successful receipt',async t=>{
 const {f,old,receipt}=await superseded(t),notices=f.notices.length;
 f.events[event==='http-failure'?'onCompleted':event].emit({...old,statusCode:503,fromCache:false,error:'net::ERR_ABORTED'});await flush();
 assert.equal(await f.verify(),receipt,'stale request must not revoke the newer epoch');assert.equal(f.notices.length,notices,'stale request must not emit PENDING');
});
test('cleanup of an older accepted request cannot revoke a newer successful receipt',async t=>{
 const {f,receipt}=await superseded(t);f.advance(5000);const notices=f.notices.length;
 await f.send('trigger-cleanup');
 assert.equal(await f.verify(),receipt,'expired request in superseded epoch must not revoke current receipt');assert.equal(f.notices.length,notices);
});
for(const event of ['onErrorOccurred','onBeforeRedirect','http-failure','expiry'])test('current epoch accepted request still revokes on '+event,async t=>{
 const f=fixture(t);await f.complete(await f.send('seed'));assert(await f.verify());f.advance(100);const current=await f.send('current');const notices=f.notices.length;
 if(event==='expiry'){f.advance(6000);await f.send('trigger-cleanup');}else {f.events[event==='http-failure'?'onCompleted':event].emit({...current,statusCode:503,fromCache:false,error:'net::ERR_ABORTED'});await flush();}
 assert.equal(await f.verify(),null);assert(f.notices.slice(notices).includes('pending'));
});
