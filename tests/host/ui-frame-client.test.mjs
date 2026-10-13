import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiFrameClient} from '../../src/host/ui-frame-client.mjs';
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
 let time=1000,id=0;const timers=new Map(),listeners=new Set(),messages=[],requests=[],grants=[],clears=[];
 const body={textContent:'old_private',replaceChildren(){this.textContent='';}};
 const doc={body,defaultView:{parent:{postMessage:(message,origin)=>messages.push({message,origin})}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(time+20000).toISOString()});
 const runtime={connect:()=>({onDisconnect:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},disconnect(){}}),sendMessage:async message=>{requests.push(message);return {ok:true,grant:grant()};}};
 const options={document:doc,runtime,role:'workspace',parentOrigin:'https://chatgpt.com',makeNonce:()=> 'random_key',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),onGrant:g=>{grants.push(g);body.textContent='private_projection';},onClear:reason=>clears.push(reason)};
 const advance=async ms=>{time+=ms;for(const [key,value]of [...timers])if(value.at<=time&&timers.has(key)){timers.delete(key);value.fn();}await drain();};
 return {body,doc,runtime,options,messages,requests,grants,clears,grant,advance,disconnect:()=>{for(const fn of [...listeners])fn();}};
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
