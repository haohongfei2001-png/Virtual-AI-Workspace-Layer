import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserRequestContext,BROWSER_CONTEXT_DIAGNOSTICS} from '../../src/runtime/browser-request-context.mjs';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {digest} from '../../src/data/hash.mjs';
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
test('private receipt needs actual successful native request and matching current body; minimal listener permissions',async t=>{
 const f=fixture(t);assert.equal(await f.owner.verify(frame),null);const d=await f.send();assert.equal(await f.owner.verify(frame),null);await f.finish(d);const r=await f.owner.verify(frame);assert(r);assert.equal(r.contextId,'team');assert(f.owner.isCurrent(frame,r));assert.equal(f.owner.isCurrent(frame,structuredClone(r)),false);assert.equal(f.owner.isCurrent({...frame,incognito:true},r),false);assert(!JSON.stringify(r).includes('DO_NOT_RETAIN'));assert.equal(f.invalidated.length,1);assert.equal(f.ready.length,1);assert.deepEqual(f.webRequest.onSendHeaders.listeners[0].args,[{urls:[origin+'/backend-api/conversation/*'],types:['xmlhttprequest']},['requestHeaders']]);for(const k of ['onCompleted','onErrorOccurred','onBeforeRedirect'])assert.equal(f.webRequest[k].listeners[0].args.length,1);
});
test('fixed diagnostics distinguish pre-receipt failures without exposing metadata or admitting rejected traffic',async t=>{
 const cases=[
  ['missing-header','context-header-missing',{requestHeaders:[]}],
  ['query','endpoint-or-query-rejected',{url:origin+'/backend-api/conversations/'+C+'?private=value'}],
  ['document','request-metadata-rejected',{documentId:undefined}],
  ['cached','completion-cached',{}],['frame','initial-frame-mismatch',{}],['expired','request-expired',{}],
 ];
 for(const [mode,expected,patch]of cases){
  const trace=[],f=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1',onDiagnostic:code=>trace.push(code)});
  if(mode==='frame')f.current={...browserFrame,documentId:'PRIVATE_OTHER_DOCUMENT'};
  const d=await f.send({url:origin+'/backend-api/conversations/'+C,...patch});if(mode==='expired')f.advance(6000);
  f.webRequest.onCompleted.emit({...d,statusCode:200,fromCache:mode==='cached'});await flush();
  assert(trace.includes(expected),mode+': '+trace.join(','));assert.equal(f.ready.length,0);assert.equal(f.associated.length,0);
  assert(trace.every(code=>BROWSER_CONTEXT_DIAGNOSTICS.includes(code)));assert(!/DO_NOT_RETAIN|PRIVATE|11111111|team|private=value/.test(JSON.stringify(trace)));
 }
});
test('diagnostics identify both cold navigation order rejections and preserve the lawful ordered path',async t=>{
 for(const order of ['history-first','home-lookup-first','prepared-before-history']){
  const trace=[],f=fixture(t,{onDiagnostic:code=>trace.push(code)}),history={...browserFrame,tabId:7,frameId:0};
  let d;
  if(order==='history-first'){f.owner.invalidateHistory(history);d=await f.send();}
  else {if(order==='home-lookup-first')f.current={...browserFrame,url:origin+'/'};d=await f.send();f.current={...browserFrame};f.owner.invalidateHistory(history);}
  await f.finish(d);
  if(order==='history-first'){assert(trace.includes('receipt-created'));assert(await f.owner.verify(frame));assert(trace.includes('association-passed'));}
  else {assert.equal(f.ready.length,0);assert.equal(f.associated.length,0);assert(trace.includes(order==='home-lookup-first'?'initial-frame-mismatch':'history-dropped-pending'));assert(trace.includes(order==='home-lookup-first'?'completion-unprepared':'completion-untracked'));}
 }
});
test('body mismatch is observable only after receipt creation; diagnostic callback failure does not affect authority',async t=>{
 const trace=[],f=fixture(t,{onDiagnostic:code=>{trace.push(code);throw Error('private diagnostic consumer failure');}});
 await f.finish(await f.send());f.answer={challenge:'wrong'};assert.equal(await f.owner.verify(frame),null);
 assert(trace.indexOf('receipt-created')<trace.indexOf('association-started'));assert(trace.includes('association-rejected'));
 f.answer=null;assert(await f.owner.verify(frame));assert(trace.includes('association-passed'));
});
for(const [label,patch] of Object.entries({subframe:{frameId:1},worker:{tabId:-1,initiator:'chrome-extension://ext'},extension:{initiator:'chrome-extension://ext'},prerender:{documentLifecycle:'prerender'},missingDocument:{documentId:undefined},post:{method:'POST'},list:{url:origin+'/backend-api/conversations'},query:{url:origin+'/backend-api/conversation/'+C+'?a=1'},foreign:{url:'https://evil.test/backend-api/conversation/'+C},prefetch:{requestHeaders:[{name:'Chatgpt-Account-Id',value:'team'},{name:'Sec-Purpose',value:'prefetch'}]},duplicateHeader:{requestHeaders:[{name:'Chatgpt-Account-Id',value:'team'},{name:'chatgpt-account-id',value:'other'}]},missingHeader:{requestHeaders:[]},invalidHeader:{requestHeaders:[{name:'Chatgpt-Account-Id',value:'team\r\n'}]},neighborObject:{url:origin+'/backend-api/conversation/'+D}}))test('no receipt from '+label,async t=>{const f=fixture(t),d=await f.send(patch);await f.finish(d);assert.equal(await f.owner.verify(frame),null);assert.equal(f.ready.length,0);});
for(const [label,patch]of Object.entries({failed:{statusCode:500},cached:{fromCache:true},wrongDocument:{documentId:'other'},wrongUrl:{url:origin+'/backend-api/conversation/'+D}}))test('completion rejects '+label,async t=>{const f=fixture(t),d=await f.send();f.webRequest.onCompleted.emit({...d,statusCode:200,fromCache:false,...patch});await flush();assert.equal(await f.owner.verify(frame),null);});
for(const eventName of ['onErrorOccurred','onBeforeRedirect'])test(eventName+' cannot turn into later success',async t=>{const f=fixture(t),d=await f.send();f.webRequest[eventName].emit(d);await f.finish(d);assert.equal(await f.owner.verify(frame),null);});
for(const label of ['route','document','body','challenge','expiry','rollback','elapsed','invalidate','stop'])test('fresh association rejects '+label,async t=>{
 const f=fixture(t),d=await f.send();await f.finish(d);const r=await f.owner.verify(frame);assert(r);
 if(label==='route')f.current={...browserFrame,url:origin+'/c/'+D};if(label==='document')f.current={...browserFrame,documentId:'other'};
 if(label==='body')f.answer={challenge:'id_3',actualURL:frame.actualURL,conversationId:D,association:'explicit-body-id'};if(label==='challenge')f.answer={challenge:'wrong',actualURL:frame.actualURL,conversationId:C,association:'explicit-body-id'};
 if(label==='expiry')f.advance(60000);if(label==='rollback')f.rollback();if(label==='elapsed')f.elapsed(60000);if(label==='invalidate')f.owner.invalidateTab(7);if(label==='stop')f.owner.stop();assert.equal(await f.owner.verify(frame),null);
});
test('parallel different contexts poison both old completions; fresh serial request may recover',async t=>{const f=fixture(t),a=await f.send(),b=await f.send({requestId:'r2',requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]});await f.finish(a);await f.finish(b);assert.equal(await f.owner.verify(frame),null);const c=await f.send({requestId:'r3',requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]});await f.finish(c);assert.equal((await f.owner.verify(frame)).contextId,'personal');});
test('actual C2 receipt joins authenticated roster, second organization selected without first-account guessing',async t=>{
 const f=fixture(t);await f.finish(await f.send());let n=0,identity={principalId:'user',contexts:[{id:'personal',kind:'personal'},{id:'team',kind:'organization'}],expiresAt:new Date(1000000).toISOString(),providerProfile:'session',transport:'worker-fixed-fetch'};
 const auth=createScopeAuthority({provider:{read:async()=>identity},profile:{id:'c2',singlePersonalDefault:false,browserRequestContext:true},contextObserver:f.owner,now:()=>1000,elapsedNow:()=>1000,makeId:()=>`grant_${++n}`});
 const r=await auth.refresh(frame,'bind');assert.equal(r.state,'verified');assert.equal(r.grant.context.kind,'browser-request-context');assert.equal(r.grant.context.contextKey,'context_'+digest(['chatgpt-context-v1','user','team']));assert.equal(r.grant.context.documentId,'doc');assert.equal(r.grant.context.authorizedContextReceiptId,r.grant.principal.id);assert.equal(r.grant.context.rosterReceiptId,undefined);assert.equal(auth.peek(frame).state,'verified');
 identity={...identity,contexts:[{id:'personal',kind:'personal'}]};assert.equal((await auth.revalidate(frame,undefined,{force:true})).state,'unverified');assert.equal(auth.scopeFor(frame),null);
});
test('roster alone and fabricated serialized receipt never select C2',async t=>{const f=fixture(t),auth=createScopeAuthority({provider:{read:async()=>({principalId:'user',contexts:[{id:'personal',kind:'personal'},{id:'team',kind:'organization'}],expiresAt:new Date(1000000).toISOString(),providerProfile:'session',transport:'worker-fixed-fetch',contextReceipt:{contextId:'team'}})},profile:{id:'c2',singlePersonalDefault:false,browserRequestContext:true},contextObserver:f.owner,now:()=>1000});assert.equal((await auth.refresh(frame,'bind')).state,'ambiguous');});
test('incognito is checked from trusted tabs, absent browser event field is normal',async t=>{const f=fixture(t,{getTab:async id=>({id,incognito:true})});await f.finish(await f.send());assert.equal(await f.owner.verify(frame),null);});
test('switch header revokes old receipt synchronously before async getFrame',async t=>{let hold=false,resolve;const f=fixture(t,{getFrame:()=>hold?new Promise(r=>resolve=r):Promise.resolve(browserFrame)});await f.finish(await f.send());const old=await f.owner.verify(frame);assert(old);hold=true;f.webRequest.onSendHeaders.emit(f.details({requestId:'switch',requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]}));assert.equal(f.owner.isCurrent(frame,old),false);await flush();resolve(browserFrame);await flush();});
test('parallel conflict survives one request completing before other getFrame',async t=>{let hold=false,release;const f=fixture(t,{getFrame:()=>hold?new Promise(r=>release=r):Promise.resolve(browserFrame)});const a=await f.send();hold=true;const b=await f.send({requestId:'r2',requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]});hold=false;await f.finish(a);release(browserFrame);await flush();await f.finish(b);assert.equal(await f.owner.verify(frame),null);});
test('verify abort settles pending browser read and late frame cannot restore receipt authority',async t=>{let hold=false,finish;const f=fixture(t,{getFrame:()=>hold?new Promise(r=>finish=r):Promise.resolve(browserFrame)});await f.finish(await f.send());hold=true;const controller=new AbortController(),pending=f.owner.verify(frame,{signal:controller.signal});await flush();controller.abort();assert.equal(await pending,null);finish(browserFrame);await flush();});
test('elapsed rollback permanently poisons a receipt even after wall clock recovers',async t=>{const f=fixture(t);await f.finish(await f.send());const r=await f.owner.verify(frame);f.advance(100);assert(f.owner.isCurrent(frame,r));f.elapsed(-1);assert.equal(f.owner.isCurrent(frame,r),false);f.elapsed(2);assert.equal(f.owner.isCurrent(frame,r),false);});
for(const label of ['abort','deadline'])test('scope six-second budget covers unresolved C2 association '+label,async t=>{const f=fixture(t);await f.finish(await f.send());let time=1000,n=0,finish;const timers=new Map(),controller=new AbortController(),observer={verify:()=>new Promise(r=>finish=r),isCurrent:()=>true};const auth=createScopeAuthority({provider:{read:async()=>({principalId:'user',contexts:[{id:'team',kind:'organization'}],expiresAt:new Date(1000000).toISOString(),providerProfile:'session',transport:'worker-fixed-fetch'})},profile:{id:'c2',singlePersonalDefault:false,browserRequestContext:true},contextObserver:observer,now:()=>time,elapsedNow:()=>time,makeId:()=>`grant_${++n}`,schedule:(fn,ms)=>{const id=++n;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});const pending=auth.refresh(frame,'bind',controller.signal);await flush();if(label==='abort')controller.abort();else{time+=6000;for(const x of timers.values())if(x.at<=time)x.fn();}assert.equal((await pending).state,'unverified');assert.notEqual(auth.peek(frame).state,'pending');finish({contextId:'team'});await flush();assert.equal(auth.scopeFor(frame),null);});
for(const outcome of ['onBeforeRedirect','onErrorOccurred','onCompleted'])test('same request ID cannot be reused after '+outcome,async t=>{const f=fixture(t),d=await f.send();if(outcome==='onCompleted')await f.finish(d);else f.webRequest[outcome].emit(d);f.owner.invalidateTab(7);await f.send();await f.finish(d);assert.equal(await f.owner.verify(frame),null);});
for(const capacity of ['closed','pending'])test('capacity rejects new grants but never suppresses synchronous switch revocation: '+capacity,async t=>{const f=fixture(t,{maxRequests:1});await f.finish(await f.send());const old=await f.owner.verify(frame);assert(old);if(capacity==='closed'){for(let i=2;i<=4;i++)await f.finish(await f.send({requestId:'r'+i}));}else await f.send({requestId:'pending'});f.webRequest.onSendHeaders.emit(f.details({requestId:'switch',requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]}));assert.equal(f.owner.isCurrent(frame,old),false);assert.equal(await f.owner.verify(frame),null);});
test('full pending capacity poisons first request when another context cannot enter queue',async t=>{const f=fixture(t,{maxRequests:1}),a=await f.send();f.webRequest.onSendHeaders.emit(f.details({requestId:'switch',requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]}));await f.finish(a);assert.equal(await f.owner.verify(frame),null);});

test('trusted same-document history keeps only the genuine new-route first-prepare request while revoking old receipt',async t=>{
 const f=fixture(t);await f.finish(await f.send());const old=await f.owner.verify(frame);assert(old);
 f.current={...browserFrame,url:origin+'/c/'+D};const next=f.details({requestId:'next',url:origin+'/backend-api/conversation/'+D});f.webRequest.onSendHeaders.emit(next);
 f.owner.invalidateHistory({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:origin+'/c/'+D});
 assert.equal(f.owner.isCurrent(frame,old),false);assert.equal(await f.owner.verify({...frame,actualURL:origin+'/c/'+D}),null);
 await f.finish(next);const current=await f.owner.verify({...frame,actualURL:origin+'/c/'+D});assert.equal(current?.conversationId,D);assert.equal(current?.contextId,'team');assert.notEqual(current,old);
});
for(const pendingLookup of [false,true])test('cold owner retains genuine pending GET across its first exact history event; lookup pending='+pendingLookup,async t=>{
 let release;const actualURL=origin+'/c/'+D,actual={...browserFrame,url:actualURL};
 const f=fixture(t,pendingLookup?{getFrame:()=>new Promise(resolve=>{release=()=>resolve(actual);})}:{});f.current=actual;
 const next=f.details({requestId:'cold',url:origin+'/backend-api/conversation/'+D});f.webRequest.onSendHeaders.emit(next);if(pendingLookup)await flush();
 f.owner.invalidateHistory({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:actualURL});
 assert.equal(await f.owner.verify({...frame,actualURL}),null);assert.equal(f.ready.length,0);
 if(pendingLookup){release();await flush();f.webRequest.onCompleted.emit({...next,statusCode:200,fromCache:false});await flush();release();await flush();const verified=f.owner.verify({...frame,actualURL});await flush();release();assert.equal((await verified)?.conversationId,D);}
 else {await f.finish(next);assert.equal((await f.owner.verify({...frame,actualURL}))?.conversationId,D);}
 assert.equal(f.ready.length,1);assert.equal(f.associated.length,1);
});
test('cold history cannot invent a prior route to reprepare a mismatched first lookup',async t=>{
 const f=fixture(t),next=f.details({requestId:'cold',url:origin+'/backend-api/conversation/'+D});f.webRequest.onSendHeaders.emit(next);await flush();
 const actualURL=origin+'/c/'+D;f.current={...browserFrame,url:actualURL};f.owner.invalidateHistory({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:actualURL});await f.finish(next);
 assert.equal(await f.owner.verify({...frame,actualURL}),null);assert.equal(f.ready.length,0);assert.equal(f.associated.length,0);
});
for(const mode of ['no-request','second-history','accepted','conflict','committed','expired','clock-rollback','stopped','failed','cached','bad-body','wrong-document','wrong-route','wrong-tab','revoked-epoch'])test('cold history keeps safe rejection: '+mode,async t=>{
 const f=fixture(t),actualURL=origin+'/c/'+D;f.current={...browserFrame,url:actualURL};const next=f.details({requestId:'cold',url:origin+'/backend-api/conversation/'+D});
 if(mode!=='no-request')f.webRequest.onSendHeaders.emit(next);
 if(mode==='accepted')await flush();if(mode==='conflict')f.webRequest.onSendHeaders.emit({...next,requestId:'other-context',requestHeaders:[{name:'Chatgpt-Account-Id',value:'other'}]});
 if(mode==='revoked-epoch')f.owner.invalidateTab(7);
 const history={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:actualURL,...(mode==='wrong-document'?{documentId:'other'}:{}),...(mode==='wrong-route'?{url:frame.actualURL}:{}),...(mode==='wrong-tab'?{tabId:8}:{})};
 f.owner.invalidateHistory(history);
 if(mode==='second-history')f.owner.invalidateHistory(history);if(mode==='committed')f.owner.invalidateTab(7);if(mode==='expired')f.advance(6000);if(mode==='clock-rollback')f.rollback();if(mode==='stopped')f.owner.stop();if(mode==='failed')f.webRequest.onErrorOccurred.emit(next);
 if(mode==='bad-body')f.answer={challenge:'wrong',actualURL,conversationId:C,association:'explicit-body-id'};
 if(mode==='cached'){f.webRequest.onCompleted.emit({...next,statusCode:200,fromCache:true});await flush();}else await f.finish(next);
 if(mode==='wrong-tab'){assert.equal((await f.owner.verify({...frame,actualURL}))?.conversationId,D,'unrelated tab notification does not revoke this tab');return;}
 assert.equal(await f.owner.verify({...frame,actualURL}),null);if(mode!=='bad-body')assert.equal(f.ready.length,0);
});
for(const [name,change]of Object.entries({missingDocument:{documentId:undefined},otherDocument:{documentId:'other'},inactive:{documentLifecycle:'prerender'},subframe:{frameId:1},wrongFrame:{frameType:'sub_frame'},otherRoute:{url:origin+'/c/'+C},foreign:{url:'https://evil.test/c/'+D},query:{url:origin+'/c/'+D+'?x=1'}}))test('history preservation rejects '+name,async t=>{
 const f=fixture(t);await f.finish(await f.send());f.current={...browserFrame,url:origin+'/c/'+D};const next=f.details({requestId:'next',url:origin+'/backend-api/conversation/'+D});f.webRequest.onSendHeaders.emit(next);
 f.owner.invalidateHistory({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:origin+'/c/'+D,...change});await f.finish(next);assert.equal(await f.owner.verify({...frame,actualURL:origin+'/c/'+D}),null);
});
test('preserved request keeps its deadline and cannot survive a second history invalidation',async t=>{
 for(const mode of ['expiry','second-history','committed']){const f=fixture(t);await f.finish(await f.send());f.current={...browserFrame,url:origin+'/c/'+D};const next=f.details({requestId:'next',url:origin+'/backend-api/conversation/'+D});f.webRequest.onSendHeaders.emit(next);const history={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:origin+'/c/'+D};f.owner.invalidateHistory(history);if(mode==='expiry')f.advance(6000);else if(mode==='second-history')f.owner.invalidateHistory(history);else f.owner.invalidateTab(7);await f.finish(next);assert.equal(await f.owner.verify({...frame,actualURL:origin+'/c/'+D}),null);}
});
test('history cannot revive accepted or conflicted work, rolled-back clocks, or stopped owners',async t=>{
 for(const mode of ['accepted','conflict','rollback','stop','wrong-final-route']){const f=fixture(t);await f.finish(await f.send());f.current={...browserFrame,url:origin+'/c/'+D};const next=f.details({requestId:'next',url:origin+'/backend-api/conversation/'+D});f.webRequest.onSendHeaders.emit(next);
 if(mode==='accepted')await flush();if(mode==='conflict')f.webRequest.onSendHeaders.emit({...next,requestId:'conflicting',requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]});if(mode==='rollback')f.rollback();
 f.owner.invalidateHistory({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:origin+'/c/'+D});if(mode==='stop')f.owner.stop();if(mode==='wrong-final-route')f.current={...browserFrame};await f.finish(next);assert.equal(await f.owner.verify({...frame,actualURL:origin+'/c/'+D}),null,mode);}
});

test('plural native detail is opt-in and retains exact current-object receipt guards',async t=>{
 const url=origin+'/backend-api/conversations/'+C;
 const legacy=fixture(t);await legacy.finish(await legacy.send({url}));assert.equal(await legacy.owner.verify(frame),null);
 const f=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1'});
 assert.deepEqual(f.webRequest.onSendHeaders.listeners[0].args[0].urls,[origin+'/backend-api/conversations/*']);
 await f.finish(await f.send({url}));const receipt=await f.owner.verify(frame);assert.equal(receipt?.conversationId,C);assert.equal(receipt?.contextId,'team');
 f.current={...browserFrame,url:origin+'/c/'+D};assert.equal(await f.owner.verify(frame),null);
});
for(const [label,patch] of Object.entries({legacy:{url:origin+'/backend-api/conversation/'+C},list:{url:origin+'/backend-api/conversations'},query:{url:origin+'/backend-api/conversations/'+C+'?prefetch=1'},suffix:{url:origin+'/backend-api/conversations/'+C+'/messages'},foreign:{url:'https://example.test/backend-api/conversations/'+C},prefetch:{requestHeaders:[{name:'chatgpt-account-id',value:'team'},{name:'purpose',value:'prefetch'}]},post:{method:'POST'},wrongObject:{url:origin+'/backend-api/conversations/'+D}}))test('plural context rejects '+label,async t=>{
 const f=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1'});await f.finish(await f.send({url:origin+'/backend-api/conversations/'+C,...patch}));assert.equal(await f.owner.verify(frame),null);
});
test('unknown request context profile fails rather than widening the native endpoint whitelist',async t=>{assert.throws(()=>fixture(t,{conversationRequestContext:'all-conversations'}),/invalid-conversation-context-profile/);});
for(const [label,patch] of Object.entries({cached:{fromCache:true},crossDialect:{url:origin+'/backend-api/conversation/'+C},failed:{statusCode:403}}))test('plural completion refuses '+label,async t=>{
 const f=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1'}),d=await f.send({url:origin+'/backend-api/conversations/'+C});f.webRequest.onCompleted.emit({...d,statusCode:200,fromCache:false,...patch});await flush();assert.equal(await f.owner.verify(frame),null);
});
test('plural receipt expires and still requires the independent matching body association',async t=>{
 const f=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1'});await f.finish(await f.send({url:origin+'/backend-api/conversations/'+C}));const receipt=await f.owner.verify(frame);assert(receipt);f.advance(60000);assert.equal(await f.owner.verify(frame),null);assert.equal(f.owner.isCurrent(frame,receipt),false);
 const g=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1'});await g.finish(await g.send({url:origin+'/backend-api/conversations/'+C}));g.answer={challenge:'wrong',actualURL:frame.actualURL,conversationId:C,association:'explicit-body-id'};assert.equal(await g.owner.verify(frame),null);
});

for(const query of ['?num_turns=10&include_has_versions=true','?include_has_versions=true&num_turns=10'])test('observed plural selection query retains current-body authorization: '+query,async t=>{
 const f=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1'}),url=origin+'/backend-api/conversations/'+C+query;
 await f.finish(await f.send({url}));assert.equal((await f.owner.verify(frame))?.conversationId,C);
 f.answer={challenge:'wrong',actualURL:frame.actualURL,conversationId:C,association:'explicit-body-id'};assert.equal(await f.owner.verify(frame),null);
 const legacy=fixture(t);await legacy.finish(await legacy.send({url:origin+'/backend-api/conversation/'+C+query}));assert.equal(await legacy.owner.verify(frame),null);
});
for(const query of ['?num_turns=10','?include_has_versions=true','?num_turns=11&include_has_versions=true','?num_turns=10&include_has_versions=false','?num_turns=10&include_has_versions=true&num_turns=10','?num_turns=10&include_has_versions=true&prefetch=1','?num_turns=010&include_has_versions=true','?%6eum_turns=10&include_has_versions=true','?num_turns=10&include_has_versions=true#fragment'])test('unobserved plural query remains rejected: '+query,async t=>{
 const f=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1'});await f.finish(await f.send({url:origin+'/backend-api/conversations/'+C+query}));assert.equal(await f.owner.verify(frame),null);assert.equal(f.ready.length,0);
});
test('observed query completion must match exact sent URL',async t=>{
 const f=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1'}),url=origin+'/backend-api/conversations/'+C+'?num_turns=10&include_has_versions=true',d=await f.send({url});
 f.webRequest.onCompleted.emit({...d,url:origin+'/backend-api/conversations/'+C,statusCode:200,fromCache:false});await flush();assert.equal(await f.owner.verify(frame),null);
});

for(const container of ['g-p-0123456789abcdef0123456789abcdef','g-custom-assistant'])test('container chat establishes only conversation context: '+container,async t=>{
 const f=fixture(t,{conversationRequestContext:'conversation-detail-plural-v1'}),actualURL=origin+'/g/'+container+'/c/'+C,current={...frame,actualURL};
 f.current={...browserFrame,url:actualURL};
 await f.finish(await f.send({url:origin+'/backend-api/conversations/'+C+'?num_turns=10&include_has_versions=true'}));
 const receipt=await f.owner.verify(current);assert.equal(receipt?.conversationId,C);assert.equal(receipt?.contextId,'team');assert.equal(receipt?.actualURL,actualURL);
 assert.equal(Object.hasOwn(receipt,'projectId'),false);assert.equal(Object.hasOwn(receipt,'containerHint'),false);assert.equal(f.associated.length,1);assert.equal(Object.hasOwn(f.associated[0],'projectId'),false);
 assert.equal(await f.owner.verify(frame),null,'plain alias cannot reuse container receipt');
 f.current={...browserFrame,url:origin+'/g/g-other/c/'+C};assert.equal(await f.owner.verify(current),null,'same ID at different current URL fails final frame check');
});
test('container context still needs independently authenticated roster and matching body',async t=>{
 const f=fixture(t),actualURL=origin+'/g/g-custom/c/'+C,current={...frame,actualURL};f.current={...browserFrame,url:actualURL};await f.finish(await f.send());
 let identity={principalId:'user',contexts:[{id:'personal',kind:'personal'}],expiresAt:new Date(1000000).toISOString(),providerProfile:'session',transport:'worker-fixed-fetch'},n=0;
 const auth=createScopeAuthority({provider:{read:async()=>identity},profile:{id:'c2',singlePersonalDefault:false,browserRequestContext:true},contextObserver:f.owner,now:()=>1000,elapsedNow:()=>1000,makeId:()=>`container_grant_${++n}`});
 assert.notEqual((await auth.refresh(current,'bind')).state,'verified');assert.equal(auth.scopeFor(current),null);
 identity={...identity,contexts:[{id:'team',kind:'organization'}]};assert.equal((await auth.refresh(current,'auth-change')).state,'verified');
 f.answer={challenge:'wrong',actualURL,conversationId:D,association:'explicit-body-id'};assert.notEqual((await auth.revalidate(current,undefined,{force:true})).state,'verified');assert.equal(auth.scopeFor(current),null);
});
for(const route of ['/g/g-custom/c/'+D,'/g/g-custom/c/'+C+'?x=1','/g/g-custom/c/'+C+'#x','/g/g%2fcustom/c/'+C,'/g/constructor/c/'+C,'/g/g-custom/../g-custom/c/'+C,'/g/g-custom/c/'+C+'/','/g/g-p-0123456789abcdef0123456789abcdef/project'])test('unsupported or different container target never produces receipt: '+route,async t=>{
 const f=fixture(t),actualURL=origin+route;f.current={...browserFrame,url:actualURL};await f.finish(await f.send());assert.equal(await f.owner.verify({...frame,actualURL}),null);assert.equal(f.ready.length,0);assert.equal(f.associated.length,0);
});
test('history switch from ordinary to container chat revokes old receipt and requires fresh native request',async t=>{
 const f=fixture(t);await f.finish(await f.send());const old=await f.owner.verify(frame),actualURL=origin+'/g/g-custom/c/'+D,current={...frame,actualURL};f.current={...browserFrame,url:actualURL};
 const next=f.details({requestId:'container-next',url:origin+'/backend-api/conversation/'+D});f.webRequest.onSendHeaders.emit(next);f.owner.invalidateHistory({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:actualURL});
 assert.equal(f.owner.isCurrent(frame,old),false);assert.equal(await f.owner.verify(current),null);await f.finish(next);const receipt=await f.owner.verify(current);assert.equal(receipt?.conversationId,D);assert.equal(Object.hasOwn(receipt,'projectId'),false);
});
