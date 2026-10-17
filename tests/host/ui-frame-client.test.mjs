import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiFrameClient} from '../../src/host/ui-frame-client.mjs';
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
 let time=1000,id=0;const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],messages=[],requests=[],grants=[],clears=[];
 const body={textContent:'old_private',replaceChildren(){this.textContent='';}};
 const doc={body,defaultView:{parent:{postMessage:(message,origin)=>messages.push({message,origin})}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(time+20000).toISOString()});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},disconnect(){}}),sendMessage:async message=>{requests.push(message);return {ok:true,grant:grant()};}};
 const options={document:doc,runtime,role:'workspace',parentOrigin:'https://chatgpt.com',makeNonce:()=> 'random_key',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),onGrant:g=>{grants.push(g);body.textContent='private_projection';},onClear:reason=>clears.push(reason)};
 const advance=async ms=>{time+=ms;for(const [key,value]of [...timers])if(value.at<=time&&timers.has(key)){timers.delete(key);value.fn();}await drain();};
 return {messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},body,doc,runtime,options,messages,requests,grants,clears,grant,advance,disconnect:()=>{for(const fn of [...listeners])fn();}};
}
test('static frame sends only public nonce to parent and exact versioned runtime join',async()=>{const f=fixture(),client=createUiFrameClient(f.options);assert.equal(await client.start(),true);assert.deepEqual(f.messages,[{origin:'https://chatgpt.com',message:{type:'VAIWL_UI_JOIN',role:'workspace',nonce:'random_key'}}]);assert.deepEqual(f.requests,[{v:1,type:'HOST_UI_JOIN',nonce:'random_key',role:'workspace'}]);assert.equal(client.isAuthorized(),true);});
test('runtime disconnect synchronously clears private DOM once and invalidates grant',async()=>{const f=fixture(),client=createUiFrameClient(f.options);await client.start();f.disconnect();assert.equal(f.body.textContent,'');assert.equal(client.isAuthorized(),false);assert.deepEqual(f.clears,['ui-port-disconnected']);client.stop();assert.equal(f.clears.length,1);});
test('ten-second renew retains scope-bound identity without a new public join',async()=>{const f=fixture(),client=createUiFrameClient(f.options);await client.start();await f.advance(10000);assert.deepEqual(f.requests[1],{v:1,type:'HOST_UI_RENEW',grantId:'grant',mountId:'mount'});assert.equal(f.messages.length,1);assert.equal(f.grants.length,2);assert.equal(client.isAuthorized(),true);});
test('renew rejection, changed scope, expired grant and network error clear projection',async()=>{for(const result of ['reject','scope','expired','throw']){const f=fixture(),client=createUiFrameClient(f.options);await client.start();f.runtime.sendMessage=async()=>{if(result==='throw')throw Error('disconnect');return result==='reject'?{ok:false}:{ok:true,grant:{...f.grant(),...(result==='scope'?{scopeGrantId:'other'}:{expiresAt:new Date(1).toISOString()})}};};await f.advance(10000);assert.equal(f.body.textContent,'');assert.equal(client.isAuthorized(),false);assert.deepEqual(f.clears,['ui-renew-failed']);}});
test('never-returning renewal is bounded and late reply cannot restore private DOM',async()=>{const f=fixture(),held=deferred(),client=createUiFrameClient(f.options);await client.start();f.runtime.sendMessage=()=>held.promise;await f.advance(10000);await f.advance(6000);assert.equal(f.body.textContent,'');held.resolve({ok:true,grant:f.grant()});await drain();assert.equal(f.body.textContent,'');assert.equal(f.grants.length,1);});
test('independent grant expiry clears even while renderer callback is pending',async()=>{const f=fixture(),held=deferred();f.options.onGrant=async()=>{f.body.textContent='private';await held.promise;f.body.textContent='late_private';};const client=createUiFrameClient(f.options),starting=client.start();await drain();await f.advance(20000);assert.equal(f.body.textContent,'');held.resolve();assert.equal(await starting,false);assert.equal(f.body.textContent,'');assert.equal(f.clears.length,1);});
test('late join result after disconnect never invokes renderer',async()=>{const f=fixture(),held=deferred();f.runtime.sendMessage=()=>held.promise;const client=createUiFrameClient(f.options),starting=client.start();await drain();f.disconnect();assert.equal(await starting,false);held.resolve({ok:true,grant:f.grant()});await drain();assert.equal(f.grants.length,0);assert.equal(f.body.textContent,'');});
test('wrong role, excessive lease and missing authority fields never render',async()=>{for(const patch of [{role:'sidebar'},{expiresAt:new Date(999999).toISOString()},{scopeGrantId:null}]){const f=fixture();f.runtime.sendMessage=async()=>({ok:true,grant:{...f.grant(),...patch}});assert.equal(await createUiFrameClient(f.options).start(),false);assert.equal(f.grants.length,0);assert.equal(f.body.textContent,'');}});
test('renew while G1 callback waits serializes latest G2 without stale cleanup erasing it',async()=>{
 const f=fixture(),held=deferred(),seen=[];let active=0,maxActive=0;
 f.options.onGrant=async(g,{isCurrent})=>{const index=seen.length;seen.push(g.expiresAt);active++;maxActive=Math.max(maxActive,active);if(index===0)await held.promise;if(isCurrent())f.body.textContent=`render${index+1}`;active--;};
 const client=createUiFrameClient(f.options),first=client.start();await drain();await f.advance(10000);assert.equal(seen.length,1);held.resolve();assert.equal(await first,false);await drain();assert.equal(seen.length,2);assert.equal(maxActive,1);assert.equal(f.body.textContent,'render2');assert.equal(client.isAuthorized(),true);
});
test('old callback rejection does not stop renewed G2, and intermediate grants coalesce',async()=>{
 const f=fixture(),held=deferred(),seen=[];
 f.options.onGrant=async(g)=>{seen.push(g.expiresAt);if(seen.length===1){await held.promise;throw Error('old failure');}f.body.textContent='latest_render';};
 const client=createUiFrameClient(f.options),first=client.start();await drain();await f.advance(10000);await f.advance(10000);assert.equal(seen.length,1);
 held.resolve();assert.equal(await first,false);await drain();assert.equal(seen.length,2);assert.equal(seen[1],new Date(41000).toISOString());assert.equal(client.isAuthorized(),true);assert.equal(f.body.textContent,'latest_render');assert.equal(f.clears.length,0);
});
test('cross-start pending render is cleared before new epoch renders, never after it',async()=>{
 const f=fixture(),held=deferred();let count=0;
 f.options.onGrant=async()=>{count++;if(count===1){await held.promise;f.body.textContent='stale_side_effect';}else f.body.textContent='new_epoch';};
 const client=createUiFrameClient(f.options),first=client.start();await drain();client.stop();const second=client.start();await drain();assert.equal(count,1);assert.equal(f.body.textContent,'');
 held.resolve();assert.equal(await first,false);assert.equal(await second,true);assert.equal(count,2);assert.equal(f.body.textContent,'new_epoch');assert.equal(client.isAuthorized(),true);assert.equal(f.clears.length,1);
});
test('only exact active port invalidations reach callback; stopped and historical ports cannot notify',async()=>{
 const f=fixture();let count=0;f.options.onInvalidate=()=>count++;const client=createUiFrameClient(f.options);
 const starting=client.start();await drain();await starting;
 for(const value of [null,[],{}, {type:'other'},{type:'VAIWL_UI_DATA_CHANGED',scope:'private'},Object.create({type:'VAIWL_UI_DATA_CHANGED'})])f.emit(value);
 assert.equal(count,0);f.emit({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(count,1);
 const old=f.historicalMessages[0];client.stop();assert.equal(f.messageListeners.size,0);old({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(count,1);
 await client.start();old({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(count,1);f.emit({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(count,2);
 f.disconnect();assert.equal(f.messageListeners.size,0);f.historicalMessages.at(-1)({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(count,2);
});
test('pending join and rejected scope renewal cannot authorize invalidation',async()=>{
 const f=fixture(),held=deferred();let count=0;f.options.onInvalidate=()=>count++;f.runtime.sendMessage=()=>held.promise;
 const client=createUiFrameClient(f.options),starting=client.start();await drain();f.emit({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(count,0);
 held.resolve({ok:true,grant:f.grant()});await starting;f.runtime.sendMessage=async()=>({ok:true,grant:{...f.grant(),scopeGrantId:'other'}});
 await f.advance(10000);f.historicalMessages[0]({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(count,0);
});
test('ten-second grant renews at five seconds, preserving identity and original hard expiry until ACK',async()=>{
 const f=fixture(),held=deferred();let requests=0;f.runtime.sendMessage=async()=>++requests===1?{ok:true,grant:{...f.grant(),expiresAt:new Date(11000).toISOString()}}:held.promise;
 const client=createUiFrameClient(f.options);await client.start();await f.advance(4999);assert.equal(requests,1);await f.advance(1);assert.equal(requests,2);assert.equal(client.isAuthorized(),true);assert.equal(f.body.textContent,'private_projection');
 await f.advance(5000);assert.equal(client.isAuthorized(),false);assert.equal(f.body.textContent,'');assert.deepEqual(f.clears,['ui-grant-expired']);held.resolve({ok:true,grant:f.grant()});await drain();assert.equal(client.isAuthorized(),false);assert.equal(f.grants.length,1);
});
test('short-grant early renewal accepts only same identity and cannot extend authorization itself',async()=>{
 for(const changed of [false,true]){const f=fixture();let requests=0;f.runtime.sendMessage=async()=>{requests++;return {ok:true,grant:requests===1?{...f.grant(),expiresAt:new Date(11000).toISOString()}:{...f.grant(),...(changed?{scopeGrantId:'other'}:{})}};};
 const client=createUiFrameClient(f.options);await client.start();await f.advance(5000);assert.equal(requests,2);assert.equal(client.isAuthorized(),!changed);
 if(changed){assert.equal(f.body.textContent,'');assert.deepEqual(f.clears,['ui-renew-failed']);}else{assert.equal(f.grants.length,2);assert.equal(f.grants[1].scopeGrantId,'scope');await f.advance(9999);assert.equal(requests,2);await f.advance(1);assert.equal(requests,3);}client.stop();}
});
test('unchanged short expiration is not converted into an implicit twenty-second extension',async()=>{
 const f=fixture();f.runtime.sendMessage=async()=>({ok:true,grant:{...f.grant(),expiresAt:new Date(11000).toISOString()}});const client=createUiFrameClient(f.options);await client.start();await f.advance(5000);assert.equal(client.isAuthorized(),true);assert.equal(f.grants.at(-1).expiresAt,new Date(11000).toISOString());await f.advance(5000);assert.equal(client.isAuthorized(),false);assert.equal(f.body.textContent,'');
});

test('private workspace-entry hint is distinct from dirty reads and rejected after lifecycle invalidation',async()=>{
 const f=fixture();let entries=0,dirty=0;const client=createUiFrameClient({...f.options,onWorkspaceEntry:()=>entries++,onInvalidate:()=>dirty++});
 f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});assert.equal(entries,0);await client.start();
 f.emit({type:'VAIWL_UI_WORKSPACE_ENTERED'});assert.equal(entries,1);assert.equal(dirty,0);
 for(const message of [{type:'VAIWL_UI_WORKSPACE_ENTERED',scope:'forged'},null,{type:'OTHER'}])f.emit(message);
 assert.equal(entries,1);f.emit({type:'VAIWL_UI_DATA_CHANGED'});assert.equal(dirty,1);
 await f.advance(10000);assert.equal(entries,1,'renew is not a safe entry');client.stop();f.historicalMessages[0]({type:'VAIWL_UI_WORKSPACE_ENTERED'});assert.equal(entries,1);
});


test('explicit exit clears private data and queues parent intent before port teardown',async()=>{
 const f=fixture(),connect=f.runtime.connect;let disconnected=0,observed;
 f.runtime.connect=()=>({...connect(),disconnect(){disconnected++;observed={text:f.body.textContent,message:f.messages.at(-1)};}});
 const client=createUiFrameClient(f.options);await client.start();client.exit();
 assert.equal(disconnected,1);assert.deepEqual(observed,{text:'',message:{origin:'https://chatgpt.com',message:{type:'VAIWL_UI_EXIT',role:'workspace'}}});assert.equal(client.isAuthorized(),false);assert.equal(f.clears.at(-1),'ui-user-exit');
 client.exit();client.stop();assert.equal(disconnected,1);
});


test('onClear reentrant start cannot have its new port disconnected by the old exit',async()=>{
 const f=fixture(),connect=f.runtime.connect,disconnected=[];let sequence=0,restarted=false,client;
 f.runtime.connect=()=>{const id=++sequence;return {...connect(),disconnect(){disconnected.push(id);}};};
 f.options.onClear=()=>{if(!restarted){restarted=true;void client.start();}};
 client=createUiFrameClient(f.options);await client.start();client.exit();await drain();
 assert.deepEqual(disconnected,[1]);assert.equal(client.isAuthorized(),true);
 assert.deepEqual(f.messages.map(x=>x.message.type),['VAIWL_UI_JOIN','VAIWL_UI_EXIT','VAIWL_UI_JOIN']);
 client.stop();assert.deepEqual(disconnected,[1,2]);
});
