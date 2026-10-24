import test from 'node:test';
import assert from 'node:assert/strict';
import {createIsolatedSessionOwner} from '../../src/runtime/isolated-session-owner.mjs';
const origin='https://chatgpt.com';
const identity=()=>({principalId:'principal',expiresAt:new Date(60000).toISOString(),contexts:[{id:'team',kind:'organization'}],providerProfile:'chatgpt-session-v1',transport:'isolated-fixed-fetch'});
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(t,overrides={}){
 let wall=1000,elapsed=1000,current=true,valid=true,n=0;const timers=new Map(),commands=[];
 const frame={tabId:1,frameId:0,documentId:'doc',documentLifecycle:'active',incognito:false,actualURL:origin+'/c/test'};
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'doc',documentLifecycle:'active',url:frame.actualURL};
 const binding={documentToken:'document_token',producerToken:'producer_token',routeEpoch:2,expiresAt:new Date(20000).toISOString()};
 const browser=()=>({documentId:frame.documentId,documentLifecycle:'active',frameType:'outermost_frame',url:frame.actualURL});
 const owner=createIsolatedSessionOwner({extensionId:'extension',origin,handshake:{verify:async()=>valid,matchesFrame:()=>valid},getFrame:async()=>browser(),dispatch:async(f,c)=>{commands.push({frame:f,command:c});return identity();},now:()=>wall,elapsedNow:()=>elapsed,schedule:(fn,ms)=>{timers.set(++n,{fn,at:elapsed+ms});return n;},cancel:id=>timers.delete(id),makeId:()=> 'repeated_random',...overrides});t.after(()=>owner.stop());
 const options=(patch={})=>({frame,binding,sender,authorityEpoch:7,isCurrent:()=>current,remainingMs:3000,...patch});
 const reply=(command=commands.at(-1)?.command)=>({type:'HOST_IDENTITY_RESULT',challenge:command.challenge,documentToken:command.documentToken,producerToken:command.producerToken,routeEpoch:command.routeEpoch,authorityEpoch:command.authorityEpoch,ok:true,identity:identity()});
 return {owner,commands,timers,frame,binding,sender,options,reply,browser,set current(v){current=v;},set valid(v){valid=v;},advance(ms,fire=true){wall+=ms;elapsed+=ms;if(fire)for(const [id,timer]of [...timers])if(timer.at<=elapsed){timers.delete(id);timer.fn();}},wall(ms){wall+=ms;},elapsed(ms){elapsed+=ms;}};
}
async function start(f,patch={}){const result=f.owner.read(f.options(patch));const outcome=result.then(value=>({value}),error=>({error:error.message}));await flush();return {result,outcome};}

test('one-use challenge accepts exact runtime result, never dispatch return or replay',async t=>{
 const f=fixture(t);let settled=false;const p=await start(f);p.outcome.then(()=>settled=true);await flush();assert.equal(settled,false);
 const c=f.commands[0].command;assert.deepEqual(Object.keys(c).sort(),['type','challenge','providerId','documentToken','producerToken','routeEpoch','authorityEpoch','actualURL','expiresAt','timeoutMs'].sort());assert.equal(c.timeoutMs,3000);assert.equal(c.providerId,'chatgpt-session-v1');
 const message=f.reply();assert.deepEqual(await f.owner.handle(message,f.sender),{ok:true});assert.deepEqual(await p.result,identity());assert.equal(f.timers.size,0);
 assert.deepEqual(await f.owner.handle(message,f.sender),{ok:false});
 const next=await start(f);assert.notEqual(f.commands[1].command.challenge,c.challenge,'constant random source still cannot reuse challenge');assert.deepEqual(await f.owner.handle(message,f.sender),{ok:false});await f.owner.handle(f.reply(),f.sender);await next.result;
});
for(const [label,patch]of Object.entries({extension:{id:'foreign'},subframe:{frameId:1},document:{documentId:'old'},tab:{tab:{id:2}},incognito:{tab:{id:1,incognito:true}},url:{url:'https://foreign.test/c/other'},credentials:{url:'https://user:secret@chatgpt.com/c/other'},inactive:{documentLifecycle:'prerender'}}))test('foreign '+label+' response cannot consume valid pending challenge',async t=>{
 const f=fixture(t),p=await start(f);assert.deepEqual(await f.owner.handle(f.reply(),{...f.sender,...patch}),{ok:false});assert.deepEqual(await f.owner.handle(f.reply(),f.sender),{ok:true});await p.result;
});
for(const field of ['documentToken','producerToken','routeEpoch','authorityEpoch','challenge'])test('mismatched '+field+' is not authority or consumption',async t=>{
 const f=fixture(t),p=await start(f),message=f.reply();message[field]=typeof message[field]==='number'?99:'other';assert.deepEqual(await f.owner.handle(message,f.sender),{ok:false});await f.owner.handle(f.reply(),f.sender);await p.result;
});
for(const [label,change]of Object.entries({token:v=>v.token='SECRET',transport:v=>v.transport='worker-fixed-fetch',profile:v=>v.providerProfile='arbitrary',expired:v=>v.expiresAt=new Date(1000).toISOString(),principal:v=>v.principalId='bad\nvalue',extraContext:v=>v.contexts[0].token='SECRET',duplicates:v=>v.contexts.push({...v.contexts[0]}),tooMany:v=>v.contexts=Array.from({length:257},(_,i)=>({id:'id'+i,kind:'personal'})),kind:v=>v.contexts[0].kind='active'}))test('strict isolated identity rejects '+label+' with sanitized read error',async t=>{
 const f=fixture(t),p=await start(f),message=f.reply();change(message.identity);assert.deepEqual(await f.owner.handle(message,f.sender),{ok:false});assert.deepEqual(await p.outcome,{error:'isolated-session-unavailable'});assert.equal(f.timers.size,0);
});
test('negative terminal consumes challenge without returning identity',async t=>{const f=fixture(t),p=await start(f),message=f.reply();message.ok=false;delete message.identity;assert.deepEqual(await f.owner.handle(message,f.sender),{ok:false});assert.deepEqual(await p.outcome,{error:'isolated-session-unavailable'});});
for(const mode of ['abort','stop','guard','wall-rollback','elapsed-rollback','delayed-deadline','timer'])test('pending request cannot succeed after '+mode,async t=>{
 const f=fixture(t),controller=new AbortController(),p=await start(f,{signal:controller.signal});
 if(mode==='abort')controller.abort();if(mode==='stop')f.owner.stop();if(mode==='guard')f.current=false;if(mode==='wall-rollback')f.wall(-1);if(mode==='elapsed-rollback')f.elapsed(-1);if(mode==='delayed-deadline')f.advance(3000,false);if(mode==='timer')f.advance(3000);
 assert.deepEqual(await f.owner.handle(f.reply(),f.sender),{ok:false});assert.match((await p.outcome).error,/^isolated-session-(?:aborted|stopped|stale|timeout)$/);assert.equal(f.timers.size,0);
});
test('same document overlap rejected; independent tab may be pending; stop clears both',async t=>{
 let f;f=fixture(t,{getFrame:async({tabId})=>({...f.browser(),documentId:tabId===2?'doc2':'doc'})});const first=await start(f);const conflict=await start(f);assert.deepEqual(await conflict.outcome,{error:'invalid-isolated-session-read'});
 const frame={...f.frame,tabId:2,documentId:'doc2'},sender={...f.sender,tab:{id:2},documentId:'doc2'};
 const second=await start(f,{frame,sender});assert.equal(f.timers.size,2);f.owner.stop();assert.match((await first.outcome).error,/stopped/);assert.match((await second.outcome).error,/stopped/);assert.equal(f.timers.size,0);
});
test('initial browser/handshake validation occurs before dispatch',async t=>{
 const f=fixture(t);f.valid=false;const p=await start(f);assert.deepEqual(await p.outcome,{error:'isolated-session-stale'});assert.equal(f.commands.length,0);
});
test('budget includes pre-dispatch verification and original clock deadline',async t=>{
 let f,calls=0;f=fixture(t,{handshake:{verify:async()=>{if(++calls===1)f.advance(1200,false);return true;},matchesFrame:()=>true}});const p=await start(f);assert.equal(f.commands[0].command.timeoutMs,1800);f.advance(1800,false);assert.deepEqual(await f.owner.handle(f.reply(),f.sender),{ok:false});assert.equal((await p.outcome).error,'isolated-session-stale');
});
test('two matching concurrent replies consume only once',async t=>{const f=fixture(t),p=await start(f);const results=await Promise.all([f.owner.handle(f.reply(),f.sender),f.owner.handle(f.reply(),f.sender)]);assert.equal(results.filter(r=>r.ok).length,1);await p.result;});
test('post-response handshake loss cannot authorize identity',async t=>{
 let calls=0;const f=fixture(t,{handshake:{verify:async()=>++calls<5,matchesFrame:()=>true}}),p=await start(f);assert.deepEqual(await f.owner.handle(f.reply(),f.sender),{ok:false});assert.equal((await p.outcome).error,'isolated-session-stale');
});
for(const remainingMs of [0,-1,6001,NaN,Infinity])test('invalid original remaining budget '+remainingMs+' cannot dispatch',async t=>{const f=fixture(t),p=await start(f,{remainingMs});assert.deepEqual(await p.outcome,{error:'invalid-isolated-session-read'});assert.equal(f.commands.length,0);});

test('capacity rejection leaves existing request usable and successful completion releases slot',async t=>{
 const f=fixture(t,{maxPending:1}),p=await start(f);const other=await start(f,{frame:{...f.frame,tabId:2},sender:{...f.sender,tab:{id:2}}});assert.equal((await other.outcome).error,'invalid-isolated-session-read');await f.owner.handle(f.reply(),f.sender);await p.result;const next=await start(f);await f.owner.handle(f.reply(),f.sender);await next.result;
});
test('browser document changes during final verification reject identity',async t=>{
 let f,reads=0;f=fixture(t,{getFrame:async()=>({...f.browser(),documentId:++reads>=3?'replacement':'doc'})});const p=await start(f);assert.deepEqual(await f.owner.handle(f.reply(),f.sender),{ok:false});assert.equal((await p.outcome).error,'isolated-session-stale');
});
test('stop while initial browser lookup is pending prevents late dispatch',async t=>{
 let release;const f=fixture(t,{getFrame:()=>new Promise(r=>release=r)}),p=await start(f);f.owner.stop();assert.equal((await p.outcome).error,'isolated-session-stopped');release(f.browser());await flush();assert.equal(f.commands.length,0);
});
test('failed dispatch never exposes thrown credentials and frees the document',async t=>{
 const f=fixture(t,{dispatch:async()=>{throw Error('COOKIE_SECRET_TOKEN');}}),p=await start(f);assert.deepEqual(await p.outcome,{error:'isolated-session-unavailable'});assert.equal(f.timers.size,0);const next=await start(f);assert.deepEqual(await next.outcome,{error:'isolated-session-unavailable'});
});
test('extraneous result fields are rejected without consuming the challenge',async t=>{
 const f=fixture(t),p=await start(f);assert.deepEqual(await f.owner.handle({...f.reply(),token:'SECRET'},f.sender),{ok:false});assert.deepEqual(await f.owner.handle(f.reply(),f.sender),{ok:true});await p.result;
});
test('contexts array custom data cannot be returned as authenticated identity',async t=>{
 const f=fixture(t),p=await start(f),message=f.reply();message.identity.contexts.token='SECRET';assert.deepEqual(await f.owner.handle(message,f.sender),{ok:false});assert.equal((await p.outcome).error,'isolated-session-unavailable');
});

 test('SPA original sender URL is accepted only with verified current browser route',async t=>{
  const f=fixture(t),sender={...f.sender,url:origin+'/c/original-document-route'},p=await start(f,{sender});
  assert.equal(f.commands.length,1);assert.equal(f.commands[0].command.actualURL,f.frame.actualURL);assert.notEqual(sender.url,f.frame.actualURL);
  assert.deepEqual(await f.owner.handle(f.reply(),sender),{ok:true});assert.deepEqual(await p.result,identity());
 });

for(const key of ['00','01'])test('noncanonical numeric contexts property '+key+' cannot carry extra data',async t=>{
 const f=fixture(t),p=await start(f),message=f.reply();message.identity.contexts.push({id:'personal',kind:'personal'});message.identity.contexts[key]='SECRET';
 assert.deepEqual(await f.owner.handle(message,f.sender),{ok:false});assert.equal((await p.outcome).error,'isolated-session-unavailable');
});
test('sparse contexts array cannot masquerade as a complete identity roster',async t=>{
 const f=fixture(t),p=await start(f),message=f.reply();message.identity.contexts.length=2;
 assert.deepEqual(await f.owner.handle(message,f.sender),{ok:false});assert.equal((await p.outcome).error,'isolated-session-unavailable');
});
