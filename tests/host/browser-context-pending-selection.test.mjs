import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserRequestContext} from '../../src/runtime/browser-request-context.mjs';
const origin='https://chatgpt.com',C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444';
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(t){
 let time=1000,serial=0;const notices=[];
 const events=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>{const listeners=new Set();return [k,{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:d=>{for(const f of listeners)f(d);}}];}));
 const browser={documentId:'document',frameType:'outermost_frame',documentLifecycle:'active',url:origin+'/c/'+C};
 const frame=()=>({tabId:7,frameId:0,documentId:browser.documentId,documentLifecycle:'active',incognito:false,actualURL:browser.url});
 const owner=createBrowserRequestContext({webRequest:events,origin,getFrame:async()=>({...browser}),getTab:async id=>({id,incognito:false}),associatePage:async d=>({...d,association:'explicit-body-id'}),now:()=>time,elapsedNow:()=>time,makeId:()=> 'receipt_'+(++serial),onInvalidate:()=>notices.push('pending'),onReady:()=>notices.push('ready')});t.after(()=>owner.stop());
 const send=async(requestId,contextId='team',conversationId=C)=>{const r={...frame(),initiator:origin,type:'xmlhttprequest',method:'GET',requestId,url:origin+'/backend-api/conversation/'+conversationId,requestHeaders:[{name:'chatgpt-account-id',value:contextId}]};events.onSendHeaders.emit(r);await flush();return r;};
 const complete=async r=>{events.onCompleted.emit({...r,statusCode:200,fromCache:false});await flush();};
 return {notices,send,complete,advance:ms=>time+=ms,verify:()=>owner.verify(frame()),fail:async r=>{events.onErrorOccurred.emit({...r,error:'net::ERR_ABORTED'});await flush();},history:async(id=D)=>{browser.url=origin+'/c/'+id;owner.invalidateHistory({...browser,tabId:7,frameId:0});await flush();},commit:async()=>{owner.invalidateCommitted({...browser,tabId:7,frameId:0});await flush();}};
}
test('staggered same-selection pending requests keep initial epoch until a real successful replacement',async t=>{
 const f=fixture(t),a=await f.send('a');f.advance(100);const b=await f.send('b');
 assert.equal(f.notices.filter(n=>n==='pending').length,1,'same pending selection does not invalidate twice');
 await f.complete(a);const first=await f.verify();assert(first,'earlier successful request remains eligible');assert.equal(first.contextId,'team');assert.equal(f.notices.filter(n=>n==='ready').length,1);
 await f.complete(b);const second=await f.verify();assert(second);assert.notEqual(second,first);assert(second.selectionEpoch>first.selectionEpoch);assert(second.wall>first.wall);assert.equal(f.notices.filter(n=>n==='ready').length,2);assert.equal(f.notices.filter(n=>n==='pending').length,2);
});
test('failed pending B poisons A and a later matching commit cannot revive it',async t=>{
 const f=fixture(t),a=await f.send('a');f.advance(100);const b=await f.send('b');await f.fail(b);await f.commit();await f.complete(a);assert.equal(await f.verify(),null);assert.equal(f.notices.filter(n=>n==='ready').length,0);
});
test('different context overlap cannot inherit the pending selection',async t=>{
 const f=fixture(t),a=await f.send('a');f.advance(100);const b=await f.send('b','other-team');await f.complete(a);await f.complete(b);assert.equal(await f.verify(),null);assert.equal(f.notices.filter(n=>n==='ready').length,0);
});
test('history navigation still revokes both already prepared requests without a receipt',async t=>{
 const f=fixture(t),a=await f.send('a');f.advance(100);const b=await f.send('b');await f.history();await f.history(C);await f.complete(a);await f.complete(b);assert.equal(await f.verify(),null);assert.equal(f.notices.filter(n=>n==='ready').length,0);
});
test('same-selection pending request cannot renew the original six-second deadline',async t=>{
 const f=fixture(t),a=await f.send('a');f.advance(5900);await f.send('b');f.advance(100);await f.complete(a);assert.equal(await f.verify(),null);assert.equal(f.notices.filter(n=>n==='ready').length,0);
});
test('expired pending requests cannot be revived by matching committed retention',async t=>{
 const f=fixture(t),a=await f.send('a');f.advance(100);const b=await f.send('b');f.advance(6000);await f.commit();await f.complete(a);await f.complete(b);assert.equal(await f.verify(),null);assert.equal(f.notices.filter(n=>n==='ready').length,0);
});
