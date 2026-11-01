import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserRequestContext} from '../../src/runtime/browser-request-context.mjs';
const origin='http://127.0.0.1:3210',C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(t){
 let clock=1000,serial=0,actual={documentId:'doc',frameType:'outermost_frame',documentLifecycle:'active',url:origin+'/c/'+C},hold=false,release;
 const calls=[],notices=[],events=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>{const listeners=new Set();return [name,{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:d=>{for(const f of listeners)f(d);}}];}));
 const owner=createBrowserRequestContext({origin,webRequest:events,getFrame:async()=>{const captured={...actual};calls.push({kind:'getFrame',url:captured.url});if(hold){hold=false;return new Promise(r=>release=()=>r(captured));}return captured;},getTab:async id=>({id,incognito:false}),associatePage:async q=>({...q,association:'explicit-body-id'}),now:()=>clock,elapsedNow:()=>clock,makeId:()=> 'id_'+(++serial),onInvalidate:()=>notices.push('pending'),onReady:()=>notices.push('ready')});
 t.after(()=>owner.stop());
 const send=(id,target=C,context='team')=>{const request={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:id,url:origin+'/backend-api/conversation/'+target,requestHeaders:[{name:'Chatgpt-Account-Id',value:context}]};events.onSendHeaders.emit(request);return request;};
 const complete=async request=>{events.onCompleted.emit({...request,statusCode:200,fromCache:false});await drain();};
 const frame=()=>({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',incognito:false,actualURL:actual.url});
 return {owner,send,complete,calls,notices,frame,advance:ms=>clock+=ms,hold:()=>hold=true,release:()=>release(),setRoute:(id,patch={})=>actual={...actual,url:origin+'/c/'+id,...patch},history:(patch={})=>owner.invalidateHistory({tabId:7,frameId:0,...actual,...patch}),verify:()=>owner.verify(frame()),fail:r=>events.onErrorOccurred.emit(r)};
}
async function initial(f){const old=f.send('initial');await drain();await f.complete(old);const receipt=await f.verify();assert(receipt);f.advance(100);return receipt;}
async function retained(f,{stale=false,negative=null}={}){
 const old=await initial(f);
 if(!stale)f.setRoute(D);
 f.hold();const next=f.send('next',D);await drain();
 f.setRoute(D);f.history();assert.equal(f.owner.isCurrent({...f.frame(),actualURL:origin+'/c/'+C},old),false,'old authority is revoked synchronously');
 if(negative==='second-history')f.history();
 if(negative==='conflict'){f.send('conflict',D,'personal');await drain();}
 if(negative==='deadline')f.advance(6000);
 if(negative==='wrong-document')f.setRoute(D,{documentId:'other'});
 if(negative==='wrong-final-route')f.setRoute(C);
 if(negative==='stop')f.owner.stop();
 f.release();await drain();await f.complete(next);
 return f.verify();
}
test('control: new-route snapshot held across trusted history remains eligible',async t=>{const f=fixture(t);const receipt=await retained(f);assert.equal(receipt?.conversationId,D);assert.deepEqual(f.notices,['pending','ready','pending','pending','ready']);});
test('retained new-route GET loses its only completion when first browser lookup captured the prior route',async t=>{
 const f=fixture(t);const receipt=await retained(f,{stale:true});
 console.log('RETAINED_OLD_SNAPSHOT',JSON.stringify({receiptPresent:!!receipt,notices:f.notices,lookups:f.calls}));
 assert.equal(receipt?.conversationId,D,'a current successful retained GET should receive one fresh browser-frame validation, still under its original deadline');
});
for(const negative of ['second-history','conflict','deadline','wrong-document','wrong-final-route','stop'])test('safety control rejects '+negative,async t=>{const f=fixture(t);assert.equal(await retained(f,{stale:true,negative}),null);});
test('a genuinely new native GET after lost retained completion recovers without reusing receipt',async t=>{const f=fixture(t);const retainedReceipt=await retained(f,{stale:true});f.advance(100);const fresh=f.send('fresh',D);await drain();await f.complete(fresh);const receipt=await f.verify();assert.equal(receipt?.conversationId,D);assert.notEqual(receipt,retainedReceipt);});
