import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserRequestContext} from '/tmp/vaiwl-free-takeover/src/runtime/browser-request-context.mjs';
import {createScopeAuthority} from '/tmp/vaiwl-free-takeover/src/runtime/scope-authority.mjs';
import {digest} from '/tmp/vaiwl-free-takeover/src/data/hash.mjs';
const origin='https://chatgpt.com',C='11111111-1111-4111-8111-111111111111',D='22222222-2222-4222-8222-222222222222';
const frame={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',incognito:false,actualURL:origin+'/c/'+C};
const browserFrame={documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:frame.actualURL};
const flush=()=>new Promise(r=>setImmediate(r));
function event(){const listeners=[];return {listeners,addListener:(f,...args)=>listeners.push({f,args}),removeListener:f=>{const i=listeners.findIndex(x=>x.f===f);if(i>=0)listeners.splice(i,1);},emit:d=>listeners.forEach(x=>x.f(d))};}
function fixture(t,options={}){
 let wall=1000,elapsed=1000,n=0,current={...browserFrame},answer=null;const invalidated=[],ready=[],associated=[];
 const webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>[k,event()]));
 const owner=createBrowserRequestContext({webRequest,getTab:async id=>({id,incognito:false}),getFrame:async()=>current,associatePage:async q=>{associated.push(q);return answer??{challenge:q.challenge,actualURL:q.actualURL,conversationId:q.conversationId,association:'explicit-body-id'};},origin,now:()=>wall,elapsedNow:()=>elapsed,makeId:()=>`id_${++n}`,onInvalidate:x=>invalidated.push(x),onReady:x=>ready.push(x),...options});t.after(()=>owner.stop());
 const details=(patch={})=>({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:'r1',url:origin+'/backend-api/conversation/'+C,requestHeaders:[{name:'Chatgpt-Account-Id',value:'team'},{name:'Authorization',value:'DO_NOT_RETAIN'},{name:'Cookie',value:'DO_NOT_RETAIN'}],...patch});
 const send=async patch=>{const d=details(patch);webRequest.onSendHeaders.emit(d);await flush();return d;};
 const finish=async d=>{webRequest.onCompleted.emit({...d,statusCode:200,fromCache:false,requestHeaders:undefined});await flush();};
 return {owner,webRequest,details,send,finish,invalidated,ready,associated,set current(x){current=x;},set answer(x){answer=x;},advance(ms){wall+=ms;elapsed+=ms;},rollback(){wall--;},elapsed(ms){elapsed+=ms;}};
}
for (const mode of ['legitimate','roundtrip','no-old-receipt','late-conflict','incognito','old-route-request']) test('independent '+mode,async t=>{
 const f=fixture(t,mode==='incognito'?{getTab:async id=>({id,incognito:true})}:{});
 if(!['no-old-receipt','incognito'].includes(mode))await f.finish(await f.send());
 const old=await f.owner.verify(frame);
 f.current={...browserFrame,url:origin+'/c/'+D};
 const next=f.details({requestId:'next',url:origin+'/backend-api/conversation/'+(mode==='old-route-request'?C:D)});
 f.webRequest.onSendHeaders.emit(next);
 const h={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:origin+'/c/'+D};
 f.owner.invalidateHistory(h);assert.equal(f.owner.isCurrent(frame,old),false);
 if(mode==='roundtrip'){f.owner.invalidateHistory({...h,url:origin+'/c/'+C});f.owner.invalidateHistory(h);}
 if(mode==='late-conflict')f.webRequest.onSendHeaders.emit({...next,requestId:'conflict',requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]});
 await f.finish(next);const proof=await f.owner.verify({...frame,actualURL:h.url});assert.equal(!!proof,mode==='legitimate');
});
