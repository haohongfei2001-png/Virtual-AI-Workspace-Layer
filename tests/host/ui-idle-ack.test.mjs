import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiFrameClient} from '../../src/host/ui-frame-client.mjs';
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
 let time=1000,id=0;const parentListeners=new Set();const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],messages=[],requests=[],grants=[],clears=[];
 const body={textContent:'old_private',replaceChildren(){this.textContent='';}};
 const doc={body,defaultView:{addEventListener:(type,fn)=>{if(type==='message')parentListeners.add(fn);},removeEventListener:(type,fn)=>{if(type==='message')parentListeners.delete(fn);},parent:{postMessage:(message,origin)=>messages.push({message,origin})}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(time+20000).toISOString()});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},disconnect(){}}),sendMessage:async message=>{requests.push(message);return {ok:true,grant:grant()};}};
 const options={document:doc,runtime,role:'workspace',parentOrigin:'https://chatgpt.com',makeNonce:()=> 'random_key',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),onGrant:g=>{grants.push(g);body.textContent='private_projection';},onClear:reason=>clears.push(reason)};
 const advance=async ms=>{time+=ms;for(const [key,value]of [...timers])if(value.at<=time&&timers.has(key)){timers.delete(key);value.fn();}await drain();};
 return {parentListeners,parentMessage:(data,patch={})=>{for(const fn of [...parentListeners])fn({data,source:doc.defaultView.parent,origin:'https://chatgpt.com',...patch});},messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},body,doc,runtime,options,messages,requests,grants,clears,grant,advance,disconnect:()=>{for(const fn of [...listeners])fn();}};
}

const request=()=>({type:'VAIWL_UI_IDLE',role:'workspace',requestId:'idle_request_1'});
const acknowledgements=f=>f.messages.filter(item=>item.message.type==='VAIWL_UI_IDLE_ACK');
// These are frame-local teardown receipts, never document close authorization.
test('idle request clears private root and emits exact receipt to the exact parent origin',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options);await client.start();
 const snapshots=[],post=f.doc.defaultView.parent.postMessage;f.doc.defaultView.parent.postMessage=(message,origin)=>{snapshots.push({type:message.type,privateText:f.body.textContent,authorized:client.isAuthorized()});post(message,origin);};
 f.parentMessage(request());await drain();assert.equal(client.isAuthorized(),false);assert.equal(f.body.textContent,'');
 assert.deepEqual(acknowledgements(f),[{origin:'https://chatgpt.com',message:{type:'VAIWL_UI_IDLE_ACK',role:'workspace',requestId:'idle_request_1'}}]);
 assert.deepEqual(snapshots.find(value=>value.type==='VAIWL_UI_IDLE_ACK'),{type:'VAIWL_UI_IDLE_ACK',privateText:'',authorized:false});assert.equal(f.clears.at(-1),'ui-idle');client.stop();
});
for(const rejected of [false,true])test('pending renderer '+(rejected?'rejection':'completion')+' must settle and late private writes clear before idle ACK',async()=>{
 const f=fixture(),held=deferred();f.options.onGrant=async()=>{f.body.textContent='private_before';await held.promise;f.body.textContent='late_private';if(rejected)throw Error('renderer_failure');};
 const client=createUiFrameClient(f.options),starting=client.start();await drain();assert.equal(f.body.textContent,'private_before');
 f.parentMessage(request());assert.equal(f.body.textContent,'');assert.equal(client.isAuthorized(),false);await drain();assert.equal(acknowledgements(f).length,0);
 held.resolve();assert.equal(await starting,false);await drain();assert.equal(f.body.textContent,'');assert.equal(acknowledgements(f).length,1);client.stop();
});
test('legacy two-field idle message still clears but never emits ACK',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options);await client.start();f.parentMessage({type:'VAIWL_UI_IDLE',role:'workspace'});await drain();assert.equal(client.isAuthorized(),false);assert.equal(f.body.textContent,'');assert.equal(acknowledgements(f).length,0);client.stop();
});
test('reentrant start from onClear cancels old idle receipt and preserves new authority',async()=>{
 const f=fixture();let client,restarting;f.options.onClear=reason=>{f.clears.push(reason);if(reason==='ui-idle')restarting=client.start();};client=createUiFrameClient(f.options);await client.start();
 f.parentMessage(request());assert.equal(await restarting,true);await drain();assert.equal(acknowledgements(f).length,0);assert.equal(client.isAuthorized(),true);assert.equal(f.body.textContent,'private_projection');client.stop();
});
test('restart while old renderer is pending cancels its receipt without clearing new render',async()=>{
 const f=fixture(),held=deferred();let renders=0;f.options.onGrant=async()=>{if(++renders===1){await held.promise;f.body.textContent='old_late_write';}else f.body.textContent='new_private';};
 const client=createUiFrameClient(f.options),first=client.start();await drain();f.parentMessage(request());const second=client.start();await drain();assert.equal(acknowledgements(f).length,0);
 held.resolve();assert.equal(await first,false);assert.equal(await second,true);await drain();assert.equal(acknowledgements(f).length,0);assert.equal(f.body.textContent,'new_private');assert.equal(client.isAuthorized(),true);client.stop();
});
test('wrong origin source role or malformed request cannot stop or acknowledge',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options);await client.start();
 for(const [data,patch] of [[request(),{origin:'https://evil.test'}],[request(),{source:{}}],[{...request(),role:'sidebar'},{}],[{...request(),requestId:''},{}],[{...request(),requestId:'bad id'},{}],[{...request(),requestId:null},{}],[{...request(),extra:true},{}],[Object.create(request()),{}]]){
  f.parentMessage(data,patch);await drain();assert.equal(client.isAuthorized(),true);assert.equal(f.body.textContent,'private_projection');assert.equal(acknowledgements(f).length,0);
 }
 client.stop();
});
test('retained old parent listener cannot acknowledge an idle request after restart',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options);await client.start();const old=[...f.parentListeners][0];await client.start();old({data:request(),source:f.doc.defaultView.parent,origin:'https://chatgpt.com'});await drain();assert.equal(client.isAuthorized(),true);assert.equal(acknowledgements(f).length,0);client.stop();
});
