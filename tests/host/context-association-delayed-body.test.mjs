import test from 'node:test';
import assert from 'node:assert/strict';
import {createContextAssociationBridge} from '../../src/host/context-association.mjs';
import {createBrowserRequestContext} from '../../src/runtime/browser-request-context.mjs';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {digest} from '../../src/data/hash.mjs';

const origin='https://chatgpt.com',C='11111111-1111-4111-8111-111111111111',D='22222222-2222-4222-8222-222222222222';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function event(){const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:value=>{for(const fn of listeners)fn(value);}};}
function fixture(t,{providerDelay=0,messageMode=false}={}){
 let wall=1000,elapsed=1000,sequence=0,present=false,bodyId=C,hidden=false,reads=0,messageId=null;
 const timers=new Map(),observers=new Set(),listeners=new Set(),challenges=[],replies=[];
 const schedule=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:elapsed+ms});return id;},cancel=id=>timers.delete(id);
 class MutationObserver {constructor(fn){this.fn=fn;}observe(target,options){this.options=options;observers.add(this);}disconnect(){observers.delete(this);}}
 const document={location:{href:origin+'/c/'+C},defaultView:{MutationObserver,getComputedStyle:()=>({display:'block',visibility:'visible'})},querySelectorAll:()=>{reads++;return present?[root]:[];}};
 const root={nodeType:1,isConnected:true,ownerDocument:document,parentElement:null,get hidden(){return hidden;},getAttribute:name=>name==='data-c'&&!messageMode?bodyId:null,getClientRects:()=>[{}],querySelectorAll:()=>messageMode?[message]:[],contains:node=>node===root||node===message,get textContent(){throw Error('association-must-not-read-body-text');}};
 const message={isConnected:true,ownerDocument:document,parentElement:root,getClientRects:()=>[{}],getAttribute:name=>name==='data-c'?bodyId:name==='data-message'?messageId:null,get textContent(){throw Error('must-not-read-message');}};
 document.documentElement={nodeType:1,isConnected:true,ownerDocument:document,contains:()=>true};
 const runtime={id:'ext',onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
 const bridge=createContextAssociationBridge({document,runtime,origin,profile:{id:'fixed',revision:1,currentBody:{rootSelector:'#reading',conversationIdAttribute:'data-c',messageSelector:'[data-message]',messageIdAttribute:'data-message',...(messageMode?{conversationIdSource:'message-elements'}:{})}},now:()=>wall,elapsedNow:()=>elapsed,schedule,cancel});
 const call=(message,reply)=>{for(const fn of listeners)fn(message,{id:'ext'},reply);};
 const frame={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',incognito:false,actualURL:document.location.href};
 const webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>[name,event()]));
 const owner=createBrowserRequestContext({webRequest,getTab:async id=>({id,incognito:false}),getFrame:async()=>({documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:document.location.href}),associatePage:q=>new Promise(resolve=>{challenges.push(q);call({type:'HOST_CONTEXT_ASSOCIATE',challenge:q.challenge,actualURL:q.actualURL,conversationId:q.conversationId,expiresAt:q.expiresAt},answer=>{replies.push(answer);resolve(answer);});}),origin,now:()=>wall,elapsedNow:()=>elapsed,makeId:()=>`id_${++sequence}`});
 const auth=createScopeAuthority({provider:{read:async()=>{if(providerDelay)await new Promise(resolve=>schedule(resolve,providerDelay));return {principalId:'user',contexts:[{id:'personal',kind:'personal'},{id:'team',kind:'organization'}],expiresAt:new Date(1000000).toISOString(),providerProfile:'session',transport:'worker-fixed-fetch'};}},profile:{id:'c2',singlePersonalDefault:false,browserRequestContext:true},contextObserver:owner,now:()=>wall,elapsedNow:()=>elapsed,makeId:()=>`grant_${++sequence}`,schedule,cancel});
 t.after(()=>{bridge.stop();owner.stop();});
 async function advance(ms,{wallDelta=ms}={}){elapsed+=ms;wall+=wallDelta;for(let i=0;i<20;i++){const due=[...timers].filter(([,timer])=>timer.at<=elapsed);if(!due.length)break;for(const [id,timer]of due){if(timers.delete(id))timer.fn();}await flush();}await flush();}
 function render(id=C){present=true;bodyId=id;for(const observer of [...observers])observer.fn([{type:'childList',target:document.documentElement,addedNodes:[root],removedNodes:[]}]);}
 async function nativeGET(){const details={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:'native-request',url:origin+'/backend-api/conversation/'+C,requestHeaders:[{name:'Chatgpt-Account-Id',value:'team'}]};webRequest.onSendHeaders.emit(details);await flush();webRequest.onCompleted.emit({...details,statusCode:200,fromCache:false,requestHeaders:undefined});await flush();}
 return {auth,frame,bridge,owner,document,challenges,replies,timers,render,advance,nativeGET,call,setMessageId(id){messageId=id;for(const observer of [...observers])if(observer.options.attributeFilter.includes('data-message'))observer.fn([{type:'attributes',target:message,attributeName:'data-message'}]);},get reads(){return reads;},hide(){hidden=true;}};
}

test('successful native GET plus late matching body establishes actual C2 authority within the original challenge',async t=>{
 const f=fixture(t);await f.nativeGET();const pending=f.auth.refresh(f.frame,'bind');await flush();
 assert.equal(f.challenges.length,1,'the real completed GET produced an association challenge');
 assert.equal(f.replies.length,0,'missing body must remain pending within this challenge');
 await f.advance(200);f.render();await f.advance(100);
 const result=await pending;assert.equal(result.state,'verified');assert.equal(result.grant.context.kind,'browser-request-context');assert.equal(result.grant.context.contextKey,'context_'+digest(['chatgpt-context-v1','user','team']));assert.equal(f.challenges.length,1);assert.equal(f.replies.length,1);
});

for(const reason of ['deadline','elapsed-only','route','wrong-body','hidden','stop','pending-invalidation'])test('late body cannot authorize after '+reason,async t=>{
 const f=fixture(t);await f.nativeGET();const pending=f.auth.refresh(f.frame,'bind');await flush();assert.equal(f.challenges.length,1);
 if(reason==='deadline')await f.advance(6000);
 if(reason==='elapsed-only')await f.advance(6000,{wallDelta:0});
 if(reason==='route')f.document.location.href=origin+'/c/'+D;
 if(reason==='hidden')f.hide();
 if(reason==='stop')f.bridge.stop();
 if(reason==='pending-invalidation')f.call({type:'HOST_CONTEXT_PENDING'},()=>{});
 f.render(reason==='wrong-body'?D:C);await f.advance(100);await f.advance(6000);
 assert.notEqual((await pending).state,'verified');assert.equal(f.auth.scopeFor(f.frame),null);assert(!f.replies.some(reply=>reply?.association==='explicit-body-id'));assert.equal(f.challenges.length,1);
});

test('repeated metadata mutations cannot renew the original six-second challenge deadline',async t=>{
 const f=fixture(t);await f.nativeGET();const pending=f.auth.refresh(f.frame,'bind');await flush();const original=f.challenges[0].expiresAt;
 for(let i=0;i<6;i++){f.render(D);await f.advance(1000);}f.render();await f.advance(100);
 assert.notEqual((await pending).state,'verified');assert.equal(f.challenges.length,1);assert.equal(f.challenges[0].expiresAt,original);assert(!f.replies.some(reply=>reply?.association==='explicit-body-id'));
});

const challenge=(id,expires=7000)=>({type:'HOST_CONTEXT_ASSOCIATE',challenge:id,actualURL:origin+'/c/'+C,conversationId:C,expiresAt:new Date(expires).toISOString()});
test('new authenticated challenge supersedes a pending association without answering the old one with new body',async t=>{
 const f=fixture(t),old=[],fresh=[];f.call(challenge('old_challenge'),answer=>old.push(answer));await f.advance(200);
 f.call(challenge('new_challenge',7200),answer=>fresh.push(answer));assert.deepEqual(old,[null]);assert.deepEqual(fresh,[]);
 f.render();await f.advance(100);assert.deepEqual(fresh,[{challenge:'new_challenge',actualURL:origin+'/c/'+C,conversationId:C,association:'explicit-body-id'}]);assert.deepEqual(old,[null]);
});
test('repeated challenge token with later expiresAt cannot extend the original pending association',async t=>{
 const f=fixture(t),old=[],duplicate=[];f.call(challenge('same_challenge'),answer=>old.push(answer));await f.advance(3000);
 f.call(challenge('same_challenge',10000),answer=>duplicate.push(answer));await f.advance(3000);f.render();await f.advance(100);
 assert(![...old,...duplicate].some(answer=>answer?.association==='explicit-body-id'));assert.deepEqual(old,[null]);
});


test('provider latency consumes the original scope deadline even when the later body challenge has more time',async t=>{
 const f=fixture(t,{providerDelay:5500});await f.nativeGET();const pending=f.auth.refresh(f.frame,'bind');await flush();
 assert.equal(f.challenges.length,0);await f.advance(5500);assert.equal(f.challenges.length,1);
 assert.equal(Date.parse(f.challenges[0].expiresAt),12500,'body challenge begins after provider latency');
 await f.advance(500);assert.notEqual((await pending).state,'verified');assert.equal(f.auth.scopeFor(f.frame),null);
 f.render();await f.advance(100);assert.equal(f.auth.scopeFor(f.frame),null,'late body cannot resurrect expired refresh');
 assert.equal(f.challenges.length,1);
});

test('native message identity arriving after container creation completes the original C2 challenge',async t=>{
 const f=fixture(t,{messageMode:true});await f.nativeGET();const pending=f.auth.refresh(f.frame,'bind');await flush();
 f.render();await f.advance(100);assert.equal(f.replies.length,0,'container and route alone do not prove identity');
 f.setMessageId('native-message');await f.advance(100);
 assert.equal((await pending).state,'verified');assert.equal(f.challenges.length,1);assert.equal(f.replies.length,1);
});
test('message identity mode cannot authenticate without a real completed native request',async t=>{
 const f=fixture(t,{messageMode:true});f.render();f.setMessageId('native-message');await f.advance(100);
 assert.notEqual((await f.auth.refresh(f.frame,'bind')).state,'verified');assert.equal(f.challenges.length,0);
});
