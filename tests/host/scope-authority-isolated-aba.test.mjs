import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {createIsolatedSessionOwner} from '../../src/runtime/isolated-session-owner.mjs';

// Synthetic composition oracle, not a production identity source. It assumes
// the owner observes auth-change; unobserved A→B→A cannot be certified here.
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const origin='https://chatgpt.com';
function fixture(t){
 let wall=1000,elapsed=0,serial=0,verifyGate=null;
 const timers=new Map(),commands=[];
 const frame={tabId:1,frameId:0,documentId:'aba_document',documentLifecycle:'active',incognito:false,actualURL:origin+'/'};
 const sender={id:'test_extension',tab:{id:1,incognito:false},frameId:0,documentId:frame.documentId,documentLifecycle:'active',url:frame.actualURL};
 const binding={documentToken:'aba_binding',producerToken:'aba_producer',routeEpoch:1,expiresAt:new Date(100000).toISOString()};
 const clock={now:()=>wall,elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>timers.delete(id)};
 const owner=createIsolatedSessionOwner({extensionId:sender.id,origin,...clock,makeId:()=> 'constant_random',
  handshake:{verify:async(b,s)=>{const gate=verifyGate;verifyGate=null;if(gate)await gate;return b.documentToken===binding.documentToken&&b.producerToken===binding.producerToken&&b.routeEpoch===binding.routeEpoch&&s.documentId===frame.documentId;},matchesFrame:(b,s,a)=>b.routeEpoch===binding.routeEpoch&&s.documentId===a.documentId},
  getFrame:async()=>({documentId:frame.documentId,documentLifecycle:'active',frameType:'outermost_frame',url:frame.actualURL}),
  dispatch:async(f,c)=>{assert.deepEqual(f,frame);commands.push(c);}
 });
 const authority=createScopeAuthority({provider:{read:()=>{throw Error('unexpected-provider');}},profile:{id:'synthetic_single_personal',singlePersonalDefault:true},...clock,makeId:()=>`aba_${++serial}`,
  readIdentity:(f,o)=>owner.read({frame:f,binding,sender,signal:o.signal,isCurrent:o.isCurrent,authorityEpoch:o.authorityEpoch,remainingMs:o.remainingMs()})});
 t.after(()=>{authority.invalidateAll();owner.stop();assert.equal(timers.size,0);});
 const identity=principal=>({principalId:principal,expiresAt:new Date(90000).toISOString(),contexts:[{id:'personal_'+principal,kind:'personal'}],providerProfile:'chatgpt-session-v1',transport:'isolated-fixed-fetch'});
 const reply=(c,principal)=>({type:'HOST_IDENTITY_RESULT',challenge:c.challenge,documentToken:c.documentToken,producerToken:c.producerToken,routeEpoch:c.routeEpoch,authorityEpoch:c.authorityEpoch,ok:true,identity:identity(principal)});
 async function start(reason='auth-change'){
  const count=commands.length,pending=authority.refresh(frame,reason);await flush();
  assert.equal(commands.length,count+1,'one isolated dispatch, no implicit retry');
  return {pending,command:commands.at(-1)};
 }
 async function accept(run,principal){assert.deepEqual(await owner.handle(reply(run.command,principal),sender),{ok:true});const result=await run.pending;assert.equal(result.state,'verified');return {grant:result.grant,source:authority.sourceFor(frame)};}
 return {authority,owner,frame,sender,commands,timers,reply,start,accept,
  holdNextVerification(){let release;verifyGate=new Promise(resolve=>release=resolve);return release;},
  advance(ms,fire=false){wall+=ms;elapsed+=ms;if(fire)for(const[id,job]of [...timers])if(job.at<=elapsed){timers.delete(id);job.fn();}}
 };
}
function assertFreshA(a1,b,a2){
 assert.equal(a1.grant.scopeKey,a2.grant.scopeKey,'returning A keeps stable cache namespace');
 assert.notEqual(a1.grant.scopeKey,b.grant.scopeKey);
 assert.notEqual(a1.source,a2.source,'stable namespace is not reusable source authorization');
 assert.notEqual(a1.grant.id,a2.grant.id);
 assert.notEqual(a1.grant.principal.id,a2.grant.principal.id);
 assert(a1.grant.scopeEpoch<b.grant.scopeEpoch&&b.grant.scopeEpoch<a2.grant.scopeEpoch);
 assert.equal(a2.grant.principal.sessionGeneration,a2.grant.scopeEpoch);
 assert.equal(a2.grant.context.selectionEpoch,a2.grant.scopeEpoch);
}

test('observed A1→B→A2 restores namespace but never A1 grant, source or challenge',async t=>{
 const h=fixture(t),first=await h.start('bind'),a1=await h.accept(first,'A'),bytes=JSON.stringify(a1.grant);
 const second=await h.start();assert.equal(h.authority.sourceFor(h.frame),null);assert.equal(h.authority.scopeFor(h.frame),null);
 const b=await h.accept(second,'B'),third=await h.start();
 assert.deepEqual(await h.owner.handle(h.reply(first.command,'A'),h.sender),{ok:false},'consumed A1 challenge cannot complete A2');
 assert.equal(h.authority.peek(h.frame).state,'pending');
 const forged=h.reply(third.command,'A');forged.authorityEpoch=first.command.authorityEpoch;
 assert.deepEqual(await h.owner.handle(forged,h.sender),{ok:false},'fresh challenge does not launder old authority epoch');
 const a2=await h.accept(third,'A');assertFreshA(a1,b,a2);
 assert.notEqual(first.command.challenge,third.command.challenge,'constant RNG cannot recreate old challenge');
 assert.equal(JSON.stringify(a1.grant),bytes,'retired grant remains immutable');
 assert.deepEqual(await h.owner.handle(h.reply(first.command,'A'),h.sender),{ok:false});
 assert.equal(h.authority.peek(h.frame).grant,a2.grant);assert.equal(h.commands.length,3);
});

test('A1 renewal reply already inside async verification cannot overwrite fresh A2',async t=>{
 const h=fixture(t),a1=await h.accept(await h.start('bind'),'A');
 const renewal=h.authority.revalidate(h.frame,undefined,{force:true});await flush();
 const old=h.commands.at(-1),release=h.holdNextVerification();
 const oldHandle=h.owner.handle(h.reply(old,'A'),h.sender);await flush();
 const b=await h.accept(await h.start(),'B'),a2=await h.accept(await h.start(),'A');
 release();assert.deepEqual(await oldHandle,{ok:false});assert.equal((await renewal).state,'unverified');
 assertFreshA(a1,b,a2);assert.equal(h.authority.peek(h.frame).grant,a2.grant);
 assert.equal(h.authority.sourceFor(h.frame),a2.source);assert.equal(h.commands.length,4);
});

for(const fire of [false,true])test(`A2 six-second deadline rejects late A response (timer fired=${fire})`,async t=>{
 const h=fixture(t),a1=await h.accept(await h.start('bind'),'A');
 await h.accept(await h.start(),'B');const a2=await h.start();let settled=false;a2.pending.then(()=>settled=true);
 h.advance(5999,fire);await flush();assert.equal(settled,false);assert.equal(h.authority.sourceFor(h.frame),null);
 h.advance(1,fire);assert.deepEqual(await h.owner.handle(h.reply(a2.command,'A'),h.sender),{ok:false});
 assert.equal((await a2.pending).state,'unverified');assert.equal(h.authority.scopeFor(h.frame),null);
 assert.equal(h.authority.sourceFor(h.frame),null);assert.notEqual(h.authority.peek(h.frame).grant,a1.grant);
 await flush();assert.equal(h.commands.length,3,'timeout must not automatically retry');
});
