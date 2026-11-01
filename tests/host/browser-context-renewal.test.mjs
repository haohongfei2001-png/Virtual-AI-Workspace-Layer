import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserRequestContext} from '../../src/runtime/browser-request-context.mjs';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
const origin='https://chatgpt.com',C='11111111-1111-4111-8111-111111111111';
const frame={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',incognito:false,actualURL:origin+'/c/'+C};
const browserFrame={documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:frame.actualURL};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function event(){const handlers=new Set();return {addListener:fn=>handlers.add(fn),removeListener:fn=>handlers.delete(fn),emit:value=>{for(const fn of handlers)fn(value);}};}
function fixture(t){
 let wall=1000,elapsed=1000,ids=0,body=true,current=browserFrame;const signals=[],associated=[];
 const webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>[name,event()]));
 const owner=createBrowserRequestContext({origin,webRequest,getFrame:async()=>current,getTab:async id=>({id,incognito:false}),associatePage:async q=>{associated.push(q);return {challenge:q.challenge,actualURL:q.actualURL,conversationId:body?q.conversationId:'22222222-2222-4222-8222-222222222222',association:'explicit-body-id'};},now:()=>wall,elapsedNow:()=>elapsed,makeId:()=>`id_${++ids}`,onInvalidate:()=>signals.push('invalidate'),onReady:()=>signals.push('ready')});t.after(()=>owner.stop());
 const send=async(requestId,patch={})=>{const d={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId,url:origin+'/backend-api/conversation/'+C,requestHeaders:[{name:'Chatgpt-Account-Id',value:'team'}],...patch};webRequest.onSendHeaders.emit(d);await flush();return d;};
 const finish=async(d,patch={})=>{webRequest.onCompleted.emit({...d,statusCode:200,fromCache:false,requestHeaders:undefined,...patch});await flush();};
 return {owner,send,finish,signals,associated,webRequest,now:()=>wall,elapsedNow:()=>elapsed,advance(ms){wall+=ms;elapsed+=ms;},clock(w,e){wall=w;elapsed=e;},body(value){body=value;},current(value){current=value;},async seed(){await finish(await send('initial'));const r=await owner.verify(frame);assert(r);signals.length=0;return r;}};
}
test('later real native request replaces live receipt with a new epoch and ordered revoke/ready signals',async t=>{
 const f=fixture(t),old=await f.seed();f.advance(20000);await f.finish(await f.send('new'));
 const renewed=await f.owner.verify(frame);assert(renewed);assert.notEqual(renewed,old);assert(renewed.selectionEpoch>old.selectionEpoch);assert.equal(renewed.wall,21000);assert.equal(renewed.elapsed,21000);
 assert.equal(f.owner.isCurrent(frame,old),false);assert.deepEqual(f.signals,['invalidate','ready']);
 f.advance(40000);assert.equal(f.owner.isCurrent(frame,renewed),true,'new proof survives the original proof deadline');
 f.advance(20000);assert.equal(f.owner.isCurrent(frame,renewed),false,'new proof still has its own fixed deadline');
});
test('same browser request ID and duplicate completion never renew receipt',async t=>{
 const f=fixture(t),old=await f.seed();f.advance(20000);const duplicate=await f.send('initial');await f.finish(duplicate);await f.finish(duplicate);
 assert.equal(await f.owner.verify(frame),old);assert.deepEqual(f.signals,[]);assert.equal(old.wall,1000);
});
for(const order of ['newest-first','oldest-first'])test('parallel same-context completions preserve the newest independently valid request: '+order,async t=>{
 const f=fixture(t),original=await f.seed();f.advance(1000);const older=await f.send('older');f.advance(1000);const newer=await f.send('newer');
 for(const d of order==='newest-first'?[newer,older]:[older,newer])await f.finish(d);
 const result=await f.owner.verify(frame);assert(result);assert.notEqual(result,original);assert.equal(result.wall,3000);assert.equal(result.elapsed,3000);
 const retained=result;await f.finish(older);assert.equal(await f.owner.verify(frame),retained);
});
test('replacement is not a body or roster authority shortcut',async t=>{
 const f=fixture(t);await f.seed();f.advance(1000);await f.finish(await f.send('new'));f.body(false);assert.equal(await f.owner.verify(frame),null);
 f.body(true);let n=0;const auth=createScopeAuthority({provider:{read:async()=>({principalId:'user',contexts:[{id:'personal',kind:'personal'}],expiresAt:new Date(1000000).toISOString(),providerProfile:'session',transport:'worker-fixed-fetch'})},profile:{id:'c2',singlePersonalDefault:false,browserRequestContext:true},contextObserver:f.owner,now:f.now,elapsedNow:f.elapsedNow,makeId:()=>`grant_${++n}`});
 assert.notEqual((await auth.refresh(frame,'bind')).state,'verified');assert.equal(auth.scopeFor(frame),null);assert(f.associated.length>=3);
});
for(const kind of ['extension','prefetch','cache','failure'])test(kind+' traffic cannot upgrade an existing receipt',async t=>{
 const f=fixture(t);await f.seed();f.advance(1000);
 const patch=kind==='extension'?{initiator:'chrome-extension://extension'}:kind==='prefetch'?{requestHeaders:[{name:'Chatgpt-Account-Id',value:'team'},{name:'Sec-Purpose',value:'prefetch'}]}:{};
 await f.finish(await f.send(kind,patch),kind==='cache'?{fromCache:true}:kind==='failure'?{statusCode:500}:{});
 assert.equal(f.signals.includes('ready'),false);const r=await f.owner.verify(frame);assert(r===null||r.wall===1000);
});
test('silent expiry and later verification cannot renew old native context',async t=>{
 const f=fixture(t),old=await f.seed();f.advance(60000);assert.equal(await f.owner.verify(frame),null);assert.equal(f.owner.isCurrent(frame,old),false);assert.equal(f.signals.includes('ready'),false);
});
for(const clock of ['wall','elapsed'])test(clock+' rollback during a new request cannot publish or revive a replacement',async t=>{
 const f=fixture(t);await f.seed();f.advance(1000);const candidate=await f.send('candidate');f.clock(clock==='wall'?1999:2000,clock==='elapsed'?1999:2000);await f.finish(candidate);
 f.clock(2001,2001);await f.finish(candidate);assert.equal(f.signals.includes('ready'),false);
});
test('conflicting parallel context cannot be promoted by same-context renewal logic',async t=>{
 const f=fixture(t);await f.seed();f.advance(1000);const team=await f.send('team');f.advance(1);const personal=await f.send('personal',{requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]});await f.finish(team);await f.finish(personal);
 assert.equal(await f.owner.verify(frame),null);assert.equal(f.signals.includes('ready'),false);
});
test('migrated later request retains its original six-second deadline',async t=>{
 const f=fixture(t);await f.seed();f.advance(1000);const first=await f.send('first');f.advance(1000);const later=await f.send('later');await f.finish(first);
 const accepted=await f.owner.verify(frame);assert.equal(accepted.wall,2000);f.signals.length=0;
 f.advance(6000);await f.finish(later);assert.deepEqual(f.signals,[]);assert.equal(await f.owner.verify(frame),accepted);
});
test('route invalidation prevents a migrated request from inheriting old selection',async t=>{
 const f=fixture(t);await f.seed();f.advance(1000);const first=await f.send('first');f.advance(1000);const later=await f.send('later');await f.finish(first);
 const route=origin+'/c/22222222-2222-4222-8222-222222222222';f.current({...browserFrame,url:route});f.owner.invalidateHistory({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:route});f.signals.length=0;
 await f.finish(later);assert.equal(f.signals.includes('ready'),false);assert.equal(await f.owner.verify({...frame,actualURL:route}),null);
});
test('context conflict after migration invalidates both pending completions',async t=>{
 const f=fixture(t);await f.seed();f.advance(1000);const first=await f.send('first');f.advance(1000);const later=await f.send('later');await f.finish(first);f.advance(1);
 const other=await f.send('other',{requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]});f.signals.length=0;
 await f.finish(later);await f.finish(other);assert.equal(f.signals.includes('ready'),false);assert.equal(await f.owner.verify(frame),null);
});
for(const tiedClock of ['both','wall','elapsed'])test('candidate without strictly newer '+tiedClock+' start cannot inherit replacement epoch',async t=>{
 const f=fixture(t);await f.seed();f.advance(1000);const first=await f.send('first');
 f.clock(tiedClock==='elapsed'?2001:2000,tiedClock==='wall'?2001:2000);const tied=await f.send('tied');await f.finish(first);
 const accepted=await f.owner.verify(frame);assert.equal(accepted.wall,2000);f.signals.length=0;await f.finish(tied);
 assert.deepEqual(f.signals,[]);assert.equal(await f.owner.verify(frame),accepted);
});
