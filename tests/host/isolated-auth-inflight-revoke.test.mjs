/** Accounts-stage suspension after credentials arrive; real reader/owner, no external network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createIsolatedSessionReader} from '../../src/host/isolated-session-reader.mjs';
import {createIsolatedSessionOwner} from '../../src/runtime/isolated-session-owner.mjs';
const origin='https://chatgpt.com',NOW=1000,SECRET='PRIVATE_AUTH_INFLIGHT_TOKEN';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=()=>new Promise(r=>setImmediate(r));
function response(url,body){const r=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;}
function suspendedReader(){
 const reached=deferred(),late=deferred(),calls=[];let elapsed=0;
 const reader=createIsolatedSessionReader({origin,now:()=>NOW,elapsedNow:()=>elapsed,fetch:async(url,options)=>{
  calls.push({url,options});if(url.endsWith('/api/auth/session')){elapsed+=20;return response(url,{user:{id:'self'},expires:new Date(60000).toISOString(),accessToken:SECRET});}
  assert.equal(options.headers.Authorization,'Bearer '+SECRET);reached.resolve();return late.promise;
 }});
 return {reader,reached:reached.promise,calls,set elapsed(v){elapsed=v;},release(){late.resolve(response(origin+'/backend-api/accounts/check/v4-2023-04-27',{accounts:{personal:{account:{account_id:'personal',structure:'personal',name:'PRIVATE_ACCOUNT_NAME'}}}}));}};
}
for(const mode of ['abort','original-deadline'])test('isolated reader '+mode+' while authenticated accounts is pending rejects late accounts',async()=>{
 const f=suspendedReader(),abort=new AbortController(),outcome=f.reader.read({signal:abort.signal,timeoutMs:100}).then(value=>({value}),error=>({error:error.message}));await f.reached;
 if(mode==='abort')abort.abort();else f.elapsed=100;
 if(mode==='original-deadline')f.release();
 const result=await outcome;assert.deepEqual(result,{error:mode==='abort'?'session-aborted':'request-timeout'});assert(f.calls[1].options.signal.aborted);f.release();await flush();assert.equal(f.calls.length,2);assert(!JSON.stringify(result).includes(SECRET));
});
for(const mode of ['abort','stop','original-deadline'])test('owner '+mode+' during real reader accounts suspension cannot accept late authenticated result',async t=>{
 const f=suspendedReader(),abort=new AbortController(),timers=new Map();let elapsed=0,serial=0,command,delivery;
 const frame={tabId:1,frameId:0,documentId:'doc',documentLifecycle:'active',incognito:false,actualURL:origin+'/c/test'},sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'doc',documentLifecycle:'active',url:frame.actualURL},binding={documentToken:'document',producerToken:'producer',routeEpoch:1,expiresAt:new Date(20000).toISOString()};
 const owner=createIsolatedSessionOwner({extensionId:'extension',origin,handshake:{verify:async()=>true,matchesFrame:()=>true},getFrame:async()=>({documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:frame.actualURL}),now:()=>NOW,elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>timers.delete(id),makeId:()=> 'challenge',dispatch:(_frame,c)=>{command=c;delivery=f.reader.read({timeoutMs:c.timeoutMs});return undefined;}});t.after(()=>owner.stop());
 const outcome=owner.read({frame,binding,sender,authorityEpoch:1,isCurrent:()=>true,remainingMs:100,signal:abort.signal}).then(value=>({value}),error=>({error:error.message}));await f.reached;assert.equal(command.timeoutMs,100);
 if(mode==='abort')abort.abort();if(mode==='stop')owner.stop();if(mode==='original-deadline'){elapsed=100;for(const timer of [...timers.values()])if(timer.at<=elapsed)timer.fn();}
 const result=await outcome;assert.match(result.error,/^isolated-session-(aborted|stopped|timeout)$/);assert.equal(timers.size,0);
 // The worlds are separate: worker cancellation need not stop an already sent
 // HTTP request. Even a valid late minimal identity must never restore authority.
 f.release();const identity=await delivery;const message={type:'HOST_IDENTITY_RESULT',challenge:command.challenge,documentToken:command.documentToken,producerToken:command.producerToken,routeEpoch:command.routeEpoch,authorityEpoch:command.authorityEpoch,ok:true,identity};
 assert.deepEqual(await owner.handle(message,sender),{ok:false});assert.deepEqual(await owner.handle(message,sender),{ok:false});assert.equal(timers.size,0);assert.equal(f.calls.length,2);assert(f.calls[1].options.signal.aborted);assert(!JSON.stringify({command,message,result}).includes(SECRET));assert(!JSON.stringify(message).includes('PRIVATE_ACCOUNT_NAME'));assert.equal(command.timeoutMs,100);
});
