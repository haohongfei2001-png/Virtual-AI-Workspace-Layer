import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserRequestContext} from '../../src/runtime/browser-request-context.mjs';
const origin='http://127.0.0.1:54321',conversationId='33333333-3333-4333-8333-333333333333';
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(t){
 const events=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>{const listeners=new Set();return [k,{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:d=>{for(const f of listeners)f(d);}}];}));
 const frame={documentId:'new-document',frameType:'outermost_frame',documentLifecycle:'active',url:origin+'/c/'+conversationId};let holdNext=false,release,ready=0;
 const owner=createBrowserRequestContext({webRequest:events,origin,getFrame:()=>{if(holdNext){holdNext=false;return new Promise(resolve=>{release=()=>resolve(frame);});}return Promise.resolve(frame);},getTab:async id=>({id,incognito:false}),associatePage:async d=>({...d,association:'explicit-body-id'}),onReady:()=>ready++});t.after(()=>owner.stop());
 const send=id=>{const r={tabId:7,frameId:0,documentId:frame.documentId,documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:id,url:origin+'/backend-api/conversation/'+conversationId,requestHeaders:[{name:'chatgpt-account-id',value:'team'}]};events.onSendHeaders.emit(r);return r;};
 return {send,hold:()=>{holdNext=true;},release:()=>release(),fail:r=>events.onErrorOccurred.emit(r),complete:r=>events.onCompleted.emit({...r,statusCode:200,fromCache:false}),commit:()=>owner.invalidateCommitted({...frame,tabId:7,frameId:0}),verify:()=>owner.verify({tabId:7,frameId:0,documentId:frame.documentId,documentLifecycle:'active',incognito:false,actualURL:frame.url}),ready:()=>ready};
}
for(const commit of [false,true])test('failed A epoch cannot be adopted by deferred B preparation'+(commit?' then retained commit':''),async t=>{
 const f=fixture(t),a=f.send('a');await flush();f.hold();const b=f.send('b');await flush();f.fail(a);f.release();await flush();if(commit)f.commit();f.complete(b);await flush();assert.equal(await f.verify(),null);assert.equal(f.ready(),0);
});
test('same-context simultaneous initial GETs retain an initial valid completion',async t=>{
 const f=fixture(t);const a=f.send('a'),b=f.send('b');await flush();f.complete(a);f.complete(b);await flush();assert(await f.verify());assert(f.ready()>=1);
});
test('a genuinely new GET after failure establishes fresh evidence',async t=>{
 const f=fixture(t),a=f.send('a');await flush();f.fail(a);const b=f.send('b');await flush();f.complete(b);await flush();assert(await f.verify());assert.equal(f.ready(),1);
});
