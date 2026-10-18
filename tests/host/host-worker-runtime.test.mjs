import {digest} from '../../src/data/hash.mjs';
/** Worker composition contract with explicit browser/service doubles and MOCK_IDB. No seed or account access. */
import test from 'node:test';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createHostWorkerRuntime} from '../../src/runtime/host-worker-runtime.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function event(){const listeners=new Set();return {listeners,addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit(...args){return [...listeners].map(f=>f(...args));}};}
function fixture(t,options={}){
 const calls={sent:[],invalidated:[],closed:[],handled:[],revoke:0,views:0,stop:0},events=Array.from({length:5},event);let config;
 const service={stop:()=>calls.stop++,handle:async(m,s)=>{calls.handled.push([m,s]);return {ok:true};},connectPort:p=>p.accept===true,invalidate:d=>calls.invalidated.push(d),tabClosed:id=>calls.closed.push(id),ui:{revokeAll:()=>calls.revoke++},views:{stop:()=>calls.views++}};
 const chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,getContexts:async q=>[q],onMessage:events[0],onConnect:events[1]},webNavigation:{getFrame:async q=>q,onCommitted:events[2],onHistoryStateUpdated:events[3]},tabs:{sendMessage:async(...args)=>{calls.sent.push(args);return {ok:true};},onRemoved:events[4]}};
 const indexedDB=new MockIDBFactory();let opens=0;const original=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{opens++;return original(...args);};
 const runtime=createHostWorkerRuntime({chrome,indexedDB,...options,serviceFactory:args=>{config=args;return service;}});t.after(()=>runtime.stop());
 return {runtime,chrome,service,config,calls,events,opens:()=>opens};
}
test('zero-seed default is unverified context and exact supported origin only',t=>{const f=fixture(t);assert.equal(f.opens(),0);assert.equal(f.config.profile.singlePersonalDefault,false);assert.equal(typeof f.config.provider.read,'function');assert.equal(f.config.allowedURL('https://chatgpt.com/'),true);for(const url of ['https://chatgpt.com.evil/','http://chatgpt.com/','https://chatgpt.com:444/','https://user@chatgpt.com/','https://chatgpt.com/c/no/slash'])assert.equal(f.config.allowedURL(url),false,url);assert.deepEqual(f.config.uiURLs,{workspace:'chrome-extension://ext/workspace.html',sidebar:'chrome-extension://ext/sidebar.html'});});
test('explicit packaged origin/provider and actual document-targeted navigation forwarded',async t=>{const provider={read:async()=>null},f=fixture(t,{origin:'http://127.0.0.1:4567',provider,scopeProfile:{id:'offline',singlePersonalDefault:true}});assert.equal(f.config.provider,provider);assert(f.config.allowedURL('http://127.0.0.1:4567/'));assert.equal(f.config.allowedURL('http://127.0.0.1:4568/'),false);const binding={documentToken:'d',producerToken:'p',routeEpoch:2},targets=[{refId:'c',navigationURL:'url'}];await f.config.prepareNavigation({parentFrame:{tabId:7,documentId:'actual-doc'},binding,targets});assert.deepEqual(f.calls.sent,[[7,{type:'HOST_NATIVE_PLAN',...binding,targets},{documentId:'actual-doc'}]]);assert.deepEqual(await f.config.getContexts({contextTypes:['TAB']}),[{contextTypes:['TAB']}]);assert.deepEqual(await f.config.getFrame({tabId:7,frameId:0}),{tabId:7,frameId:0});});
test('runtime routing preserves sender and errors have safe bounded reply',async t=>{const f=fixture(t),sender={documentId:'actual'},message={type:'HOST_HELLO'},replies=[];assert.deepEqual(f.events[0].emit(message,sender,r=>replies.push(r)),[true]);await flush();assert.deepEqual(f.calls.handled,[[message,sender]]);assert.deepEqual(replies,[{ok:true}]);for(const handler of [()=>{throw Error('PRIVATE');},async()=>{throw Error('PRIVATE');}]){f.service.handle=handler;f.events[0].emit({},sender,r=>replies.push(r));await flush();assert.deepEqual(replies.at(-1),{ok:false,reason:'host-unavailable'});}});
test('unaccepted ports disconnect, accepted ports stay connected',t=>{const f=fixture(t);let disconnected=0;f.events[1].emit({accept:false,disconnect(){disconnected++;}});f.events[1].emit({accept:true,disconnect(){disconnected++;}});assert.equal(disconnected,1);assert.doesNotThrow(()=>f.events[1].emit({disconnect(){throw Error('closed');}}));});
test('top committed/history routes revoke tab authority; only history retains exact document display',async t=>{const f=fixture(t);for(const e of [f.events[2],f.events[3]])e.emit({tabId:7,frameId:0,documentId:'new-doc',url:'https://chatgpt.com/',private:'never'});await flush();assert.deepEqual(f.calls.invalidated,[{tabId:7},{tabId:7,preserveViewDocumentId:'new-doc'}]);assert.deepEqual(f.calls.sent,Array.from({length:2},()=>[7,{type:'HOST_DOCUMENT_INVALIDATED'},{documentId:'new-doc'}]));f.events[2].emit({tabId:7,frameId:3,documentId:'child',url:'https://chatgpt.com/'});f.events[2].emit({tabId:7,frameId:0,documentId:'outside',url:'https://example.com/'});await flush();assert.equal(f.calls.invalidated.length,3);assert.equal(f.calls.sent.length,2);f.events[4].emit(7);assert.deepEqual(f.calls.closed,[7]);});
test('stop detaches all listeners, closes views once and suppresses late service reply',async t=>{const f=fixture(t);let resolve;f.service.handle=()=>new Promise(r=>{resolve=r;});const replies=[];f.events[0].emit({}, {},r=>replies.push(r));await flush();f.runtime.stop();f.runtime.stop();assert(f.events.every(e=>e.listeners.size===0));resolve({private:'late'});await flush();assert.deepEqual(replies,[]);assert.equal(f.calls.revoke,1);assert.equal(f.calls.views,1);assert.equal(f.calls.stop,1);});
test('stop before queued microtasks prevents late service execution and document notifications',async t=>{const f=fixture(t);f.events[0].emit({type:'HOST_HELLO'}, {},()=>assert.fail('late reply'));f.events[2].emit({tabId:7,frameId:0,documentId:'doc',url:'https://chatgpt.com/'});f.runtime.stop();await flush();assert.deepEqual(f.calls.handled,[]);assert.deepEqual(f.calls.sent,[]);});
test('throwing port admission fails closed and disconnects rejected port',t=>{const f=fixture(t);let disconnected=0;f.service.connectPort=()=>{throw Error('admission-failed');};assert.doesNotThrow(()=>f.events[1].emit({disconnect(){disconnected++;}}));assert.equal(disconnected,1);});
test('snippet bridge uses owner parent document and strips all unrelated ref data',async t=>{
 const f=fixture(t),anchor={refId:'C',messageId:'M',branchId:'B',text:'chosen',bodyHash:'a'.repeat(64)},context={parentFrame:{tabId:9,documentId:'actual-parent'},binding:{documentToken:'d',producerToken:'p',routeEpoch:2},scopeGrantId:'scope',isCurrent:()=>true};
 f.chrome.tabs.sendMessage=async(...args)=>{f.calls.sent.push(args);return {ok:true,selectionId:'selection',anchor};};
 assert.deepEqual(await f.config.selectionBridge({context,ref:{id:'C',nativeUrl:'https://chatgpt.com/c/C',private:'never'},phase:'capture',guard:()=>true,remainingMs:500}),{selectionId:'selection',anchor});
 assert.deepEqual(f.calls.sent[0],[9,{type:'HOST_SNIPPET_SELECTION',...context.binding,scopeGrantId:'scope',phase:'capture',ref:{id:'C',nativeUrl:'https://chatgpt.com/c/C'},selectionId:null,expiresAt:f.calls.sent[0][1].expiresAt},{documentId:'actual-parent'}]);
 assert(Date.parse(f.calls.sent[0][1].expiresAt)>Date.now());assert(Date.parse(f.calls.sent[0][1].expiresAt)<=Date.now()+500);
 f.chrome.tabs.sendMessage=async()=>({ok:false,anchor});assert.equal(await f.config.selectionBridge({context,ref:{id:'C',nativeUrl:'url'},phase:'capture'}),null);
});
test('snippet restore and reveal is one expiring parent command; late reply cannot send another action',async t=>{
 const f=fixture(t);let current=true;const context={parentFrame:{tabId:9,documentId:'parent'},binding:{documentToken:'d',producerToken:'p',routeEpoch:1},scopeGrantId:'s',isCurrent:()=>current},ref={id:'C',nativeUrl:'https://chatgpt.com/c/C'},anchor={refId:'C',messageId:'M',branchId:'B',text:'selected',bodyHash:'a'.repeat(64)},options={context,ref,phase:'restore',anchor,guard:()=>current,remainingMs:500};
 assert.deepEqual(await f.config.selectionBridge(options),{ok:true});assert.deepEqual(f.calls.sent.map(c=>c[1].type),['HOST_SNIPPET_RESTORE']);assert(Date.parse(f.calls.sent[0][1].expiresAt)>Date.now());
 f.calls.sent.length=0;f.chrome.tabs.sendMessage=async(...args)=>{f.calls.sent.push(args);current=false;return {ok:true};};assert.deepEqual(await f.config.selectionBridge(options),{ok:false});assert.equal(f.calls.sent.length,1);
 f.calls.sent.length=0;assert.deepEqual(await f.config.selectionBridge(options),{ok:false});assert.equal(f.calls.sent.length,0);
});

test('ACK profile is explicit packaged configuration and default remains absent',t=>{const f=fixture(t);assert.equal(f.config.sendAckProfile,null);const ack={id:'offline_ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}};const enabled=fixture(t,{currentMetadataReadEnabled:true,sendCandidatesEnabled:true,sendAckProfile:ack});assert.deepEqual(enabled.config.sendAckProfile,ack);assert.equal(typeof enabled.config.provider.acceptanceFor,'function');assert.equal(enabled.opens(),0);});

test('history display retention rejects missing, empty, non-string document and unsupported URL',t=>{
 const f=fixture(t);
 for(const details of [{},{documentId:''},{documentId:17},{documentId:'doc',url:'https://example.com/'}])
  f.events[3].emit({tabId:7,frameId:0,url:'https://chatgpt.com/',...details});
 assert.deepEqual(f.calls.invalidated,Array.from({length:4},()=>({tabId:7})));
 f.events[3].emit({tabId:7,frameId:2,documentId:'doc',url:'https://chatgpt.com/'});
 assert.equal(f.calls.invalidated.length,4);
});

test('fixed worker URL classification reuses bounded original-string results without parsing each guard',t=>{
 const f=fixture(t),OriginalURL=globalThis.URL;let parses=0;
 globalThis.URL=new Proxy(OriginalURL,{construct(target,args,newTarget){parses++;return Reflect.construct(target,args,newTarget);}});
 try{
  const home='https://chatgpt.com/';assert.equal(f.config.allowedURL(home),true);const initial=parses;assert(initial>0);
  for(let i=0;i<1000;i++)assert.equal(f.config.allowedURL(home),true);
  assert.equal(parses,initial,'unchanged pure URL classification must not be repeated at every live authority fence');
  const paths=['projects','share/one','share/two','share/three'].map(path=>'https://chatgpt.com/'+path);
  for(const path of paths)assert.equal(f.config.allowedURL(path),true);
  const atCapacity=parses;assert.equal(f.config.allowedURL(paths[0]),true);assert.equal(parses,atCapacity);
  assert.equal(f.config.allowedURL(home),true);assert(parses>atCapacity,'a fifth distinct URL must evict the least recently used of four entries');
  const atEviction=parses;assert.equal(f.config.allowedURL(paths[1]),true);assert(parses>atEviction,'hits promote their exact entry before bounded eviction');
 }finally{globalThis.URL=OriginalURL;}
});

test('warmed worker URL results cannot authorize normalized aliases or non-string coercion',t=>{
 const f=fixture(t),good='https://chatgpt.com/c/11111111-2222-4333-8444-555555555555';assert.equal(f.config.allowedURL(good),true);
 for(const value of [good.replace('chatgpt.com','chatgpt.com:443'),good.replace('chatgpt.com','user@chatgpt.com'),good+'?model=x',good+'#body',good.replace('/c/','/x/../c/'),good.replace('/c/','/x/%2e%2e/c/'),good.replace('/c/','/c%2f/'),good.replace('chatgpt.com','chatgpt.com.evil'),good.replace('https:','http:'),'/c/11111111-2222-4333-8444-555555555555','https://chatgpt.com/'+'x'.repeat(8192)]){
  assert.equal(f.config.allowedURL(value),false,value);assert.equal(f.config.allowedURL(value),false,value);assert.equal(f.config.allowedURL(good),true);
 }
 let coerced=0;const object={toString(){coerced++;return good;}};
 assert.equal(f.config.allowedURL(object),false);assert.equal(f.config.allowedURL(object),false);assert.equal(coerced,0);
});

test('URL classification cache belongs only to its fixed worker origin',t=>{
 const a=fixture(t,{origin:'http://127.0.0.1:4567'}),b=fixture(t,{origin:'http://127.0.0.1:4568'});
 for(let i=0;i<3;i++)for(const [f,yes,no]of [[a,'4567','4568'],[b,'4568','4567']]){
  assert.equal(f.config.allowedURL('http://127.0.0.1:'+yes+'/'),true);assert.equal(f.config.allowedURL('http://127.0.0.1:'+no+'/'),false);
 }
});

test('stop drops warm classification and leaves all listeners detached',t=>{
 const f=fixture(t),U=globalThis.URL;let n=0;
 globalThis.URL=new Proxy(U,{construct(target,args,newTarget){n++;return Reflect.construct(target,args,newTarget);}});
 try {
  const url='https://chatgpt.com/';assert(f.config.allowedURL(url));assert.equal(n,2);assert(f.config.allowedURL(url));assert.equal(n,2);
  f.runtime.stop();assert(f.events.every(e=>e.listeners.size===0));assert(f.config.allowedURL(url));assert.equal(n,4,'stop must have discarded the cached entry');assert.equal(f.calls.stop,1);
 } finally {globalThis.URL=U;}
});
test('warmed pure URL result never extends or revives actual authority',async t=>{
 const f=fixture(t),frame={tabId:1,frameId:0,documentId:'doc',actualURL:'https://chatgpt.com/',documentLifecycle:'active',incognito:false};
 let now=1000,id=0;const a=createScopeAuthority({allowedURL:f.config.allowedURL,profile:{id:'review',singlePersonalDefault:true},now:()=>now,makeId:()=>`review_${++id}`,provider:{read:async()=>({principalId:'review',expiresAt:new Date(1e6).toISOString(),contexts:[{id:'review',kind:'personal'}],providerProfile:'session_v1',transport:'worker-fixed-fetch'})}});
 assert(f.config.allowedURL(frame.actualURL));const first=await a.refresh(frame,'bind');assert.equal(first.state,'verified');for(let i=0;i<1000;i++)assert.equal(a.peek(frame).grant,first.grant);
 now+=60000;assert(f.config.allowedURL(frame.actualURL));assert.equal(a.peek(frame).state,'unverified');
 assert.equal((await a.refresh(frame,'expiry')).state,'verified');a.invalidateAll();assert(f.config.allowedURL(frame.actualURL));assert.equal(a.peek(frame).state,'unverified');assert.equal(a.scopeFor(frame),null);
});

test('worker composition refuses contradictory conversation dialects before starting',t=>{
 for(const options of [
  {scopeProfile:{conversationRequestContext:'conversation-detail-plural-v1'},sessionProfile:{conversationRequestContext:null}},
  {sessionProfile:{conversationRequestContext:'conversation-detail-plural-v1'}}
 ])assert.throws(()=>fixture(t,options),/host-conversation-profile-mismatch/);
});
test('worker fixed reader inherits the packaged scope dialect with shared durable budget',async t=>{
 const C='12345678-1234-4234-8234-123456789abc',calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls.push({url,options});const n=calls.length;
  const body=n===1?{user:{id:'runtime-user'},expires:new Date(Date.now()+60000).toISOString(),accessToken:'SECRET'}:n===2?{accounts:{P:{account:{account_id:'P',structure:'personal'}}}}:{conversation_id:C,mapping:{}};
  const result=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(result,'url',{value:url});return result;
 });
 const f=fixture(t,{scopeProfile:{id:'explicit-plural-candidate',singlePersonalDefault:false,conversationRequestContext:'conversation-detail-plural-v1'},currentMetadataReadEnabled:true});
 const result=await f.config.provider.readCurrentConversation({conversationId:C,expectedPrincipalKey:'principal_'+digest(['chatgpt-principal-v1','runtime-user']),expectedContextKey:'context_'+digest(['chatgpt-context-v1','runtime-user','P'])});
 assert.equal(calls.length,3);assert.equal(calls[2].url,'https://chatgpt.com/backend-api/conversations/'+C);assert.equal(result.metadata.conversationId,C);
 assert(f.opens()>0);assert(!JSON.stringify(result).includes('SECRET'));assert.equal(f.config.profile.singlePersonalDefault,false);
});
