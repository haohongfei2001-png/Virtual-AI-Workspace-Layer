import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiFrameClient} from '../../src/host/ui-frame-client.mjs';
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
 let time=1000,id=0,nonces=0,connections=0;const parentListeners=new Set();const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],messages=[],requests=[],grants=[],clears=[];
 const body={textContent:'old_private',replaceChildren(){this.textContent='';}};
 const doc={body,defaultView:{addEventListener:(type,fn)=>{if(type==='message')parentListeners.add(fn);},removeEventListener:(type,fn)=>{if(type==='message')parentListeners.delete(fn);},parent:{postMessage:(message,origin)=>messages.push({message,origin})}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(time+20000).toISOString()});
 const runtime={connect:()=>(connections++,{onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},disconnect(){}}),sendMessage:async message=>{requests.push(message);return {ok:true,grant:grant()};}};
 const options={document:doc,runtime,role:'workspace',parentOrigin:'https://chatgpt.com',makeNonce:()=> 'nonce_'+(++nonces),now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),onGrant:g=>{grants.push(g);body.textContent='private_projection';},onClear:reason=>clears.push(reason)};
 const advance=async ms=>{time+=ms;for(const [key,value]of [...timers])if(value.at<=time&&timers.has(key)){timers.delete(key);value.fn();}await drain();};
 return {get connections(){return connections;},parentListeners,parentMessage:(data,patch={})=>{for(const fn of [...parentListeners])fn({data,source:doc.defaultView.parent,origin:'https://chatgpt.com',...patch});},messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},body,doc,runtime,options,messages,requests,grants,clears,grant,advance,disconnect:()=>{for(const fn of [...listeners])fn();}};
}


const idle=(requestId='idle_1')=>({type:'VAIWL_UI_IDLE',role:'workspace',requestId});
const wake=(requestId='idle_1')=>({type:'VAIWL_UI_WAKE',role:'workspace',requestId});
const joins=f=>f.messages.filter(item=>item.message.type==='VAIWL_UI_JOIN');
async function dormant(f,client,requestId='idle_1'){f.parentMessage(idle(requestId));await drain();assert.equal(client.isAuthorized(),false);assert.equal(f.body.textContent,'');assert.equal(f.messages.at(-1).message.type,'VAIWL_UI_IDLE_ACK');}

test('wake uses a fresh nonce port and private JOIN; no old grant renders while JOIN is pending',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options),held=deferred();await client.start();await dormant(f,client);
 f.runtime.sendMessage=message=>{f.requests.push(message);return held.promise;};
 f.parentMessage(wake());await drain();assert.equal(f.connections,2);assert.equal(f.requests.length,2);assert.deepEqual(f.requests[1],{v:1,type:'HOST_UI_JOIN',role:'workspace',nonce:'nonce_2'});
 assert.deepEqual(joins(f).map(item=>item.message.nonce),['nonce_1','nonce_2']);assert.equal(client.isAuthorized(),false);assert.equal(f.body.textContent,'');assert.equal(f.grants.length,1);
 held.resolve({ok:true,grant:{...f.grant(),id:'fresh_grant'}});await drain();assert.equal(client.isAuthorized(),true);assert.equal(f.grants.at(-1).id,'fresh_grant');assert.equal(f.body.textContent,'private_projection');client.stop();
});
test('wrong wake origin source role request ID and shape cannot join or restore private content',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options);await client.start();await dormant(f,client);
 for(const [data,patch] of [[wake(),{origin:'https://evil.test'}],[wake(),{source:{}}],[{...wake(),role:'sidebar'},{}],[wake('old_request'),{}],[wake(''),{}],[{...wake(),extra:true},{}],[{type:'VAIWL_UI_WAKE',role:'workspace'},{}],[Object.create(wake()),{}]]){
  f.parentMessage(data,patch);await drain();assert.equal(f.requests.length,1);assert.equal(f.connections,1);assert.equal(client.isAuthorized(),false);assert.equal(f.body.textContent,'');
 }
 f.parentMessage(wake());await drain();assert.equal(f.requests.length,2);assert.equal(client.isAuthorized(),true);client.stop();
});
test('wake is consumed once even during a delayed JOIN',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options),held=deferred();await client.start();await dormant(f,client);const old=[...f.parentListeners][0];
 f.runtime.sendMessage=message=>{f.requests.push(message);return held.promise;};
 for(let i=0;i<20;i++)f.parentMessage(wake());old({data:wake(),source:f.doc.defaultView.parent,origin:'https://chatgpt.com'});await drain();assert.equal(f.requests.length,2);assert.equal(f.connections,2);
 held.resolve({ok:true,grant:f.grant()});await drain();f.parentMessage(wake());await drain();assert.equal(f.requests.length,2);client.stop();
});
for(const action of ['stop','exit'])test('explicit '+action+' revokes dormant wake including retained listener',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options);await client.start();await dormant(f,client);const old=[...f.parentListeners][0];assert.equal(typeof old,'function');client[action]();
 f.parentMessage(wake());old({data:wake(),source:f.doc.defaultView.parent,origin:'https://chatgpt.com'});await drain();assert.equal(f.requests.length,1);assert.equal(f.connections,1);assert.equal(client.isAuthorized(),false);assert.equal(f.body.textContent,'');
});
test('a prior dormant request ID cannot wake a later idle generation',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options);await client.start();await dormant(f,client,'first_idle');f.parentMessage(wake('first_idle'));await drain();assert.equal(client.isAuthorized(),true);await dormant(f,client,'second_idle');
 f.parentMessage(wake('first_idle'));await drain();assert.equal(f.requests.length,2);assert.equal(client.isAuthorized(),false);
 f.parentMessage(wake('second_idle'));await drain();assert.equal(f.requests.length,3);assert.equal(client.isAuthorized(),true);client.stop();
});
test('pending old renderer cannot receive wake before idle ACK has become possible',async()=>{
 const f=fixture(),held=deferred();let renders=0;f.options.onGrant=async()=>{if(++renders===1){await held.promise;f.body.textContent='late_private';}else f.body.textContent='fresh_private';};
 const client=createUiFrameClient(f.options),starting=client.start();await drain();f.parentMessage(idle());f.parentMessage(wake());await drain();assert.equal(f.requests.length,1);assert.equal(f.connections,1);assert.equal(f.messages.some(item=>item.message.type==='VAIWL_UI_IDLE_ACK'),false);assert.equal(f.body.textContent,'');
 held.resolve();assert.equal(await starting,false);await drain();assert.equal(f.body.textContent,'');assert.equal(f.messages.at(-1).message.type,'VAIWL_UI_IDLE_ACK');assert.equal(f.requests.length,1);
 f.parentMessage(wake());await drain();assert.equal(client.isAuthorized(),true);assert.equal(f.body.textContent,'fresh_private');client.stop();
});
test('denied fresh JOIN never revives old private grant or leaves reusable wake listener',async()=>{
 const f=fixture(),client=createUiFrameClient(f.options);await client.start();await dormant(f,client);f.runtime.sendMessage=async message=>{f.requests.push(message);return {ok:false};};
 f.parentMessage(wake());await drain();assert.equal(client.isAuthorized(),false);assert.equal(f.body.textContent,'');assert.equal(f.grants.length,1);assert.equal(f.requests.length,2);f.parentMessage(wake());await drain();assert.equal(f.requests.length,2);client.stop();
});
