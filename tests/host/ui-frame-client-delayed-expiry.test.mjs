import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiFrameClient} from '../../src/host/ui-frame-client.mjs';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(){
 let wall=1000,elapsed=0,next=0,resolveRenew;const timers=new Map(),requests=[],renders=[],clears=[];
 const body={textContent:'',replaceChildren(){this.textContent='';}};
 const grant=expiresAt=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(expiresAt).toISOString()});
 const runtime={connect:()=>({onDisconnect:{addListener(){},removeListener(){}},onMessage:{addListener(){},removeListener(){}},disconnect(){}}),sendMessage:message=>{requests.push(message);return message.type==='HOST_UI_JOIN'?Promise.resolve({ok:true,grant:grant(11000)}):new Promise(resolve=>{resolveRenew=resolve;});}};
 const client=createUiFrameClient({document:{body,defaultView:{parent:{postMessage(){}}}},runtime,role:'workspace',parentOrigin:'https://chatgpt.com',makeNonce:()=> 'nonce',now:()=>wall,elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>timers.delete(id),onGrant:g=>{renders.push(g);body.textContent='private';},onClear:reason=>clears.push(reason)});
 return {client,body,requests,renders,clears,timers,setTime:ms=>{elapsed=ms;wall=1000+ms;},fireAt:at=>{const item=[...timers].find(([,v])=>v.at===at);assert(item,'expected scheduled callback at '+at);timers.delete(item[0]);item[1].fn();},reply:()=>{assert(resolveRenew);resolveRenew({ok:true,grant:grant(wall+10000)});}};
}
for(const responseAt of [10000,10500])test('short grant cannot revive from renewal ACK at '+responseAt+'ms when expiry task is delayed',async()=>{
 const f=fixture();assert.equal(await f.client.start(),true);f.setTime(5000);f.fireAt(5000);await drain();assert.equal(f.requests.at(-1).type,'HOST_UI_RENEW');
 f.setTime(responseAt);assert.equal(f.client.isAuthorized(),false);assert([...f.timers.values()].some(v=>v.at===10000),'expiry task remains queued');
 // The renewal itself remains inside its original six-second request deadline.
 assert(responseAt-5000<6000);f.reply();await drain();
 assert.equal(f.client.isAuthorized(),false,'a queued expiry callback cannot permit renewed authorization after the old lease elapsed');assert.equal(f.body.textContent,'');assert.equal(f.renders.length,1);assert.equal(f.clears.length,1);f.client.stop();
});
test('same short grant renews normally when ACK arrives before old expiry',async()=>{
 const f=fixture();assert.equal(await f.client.start(),true);f.setTime(5000);f.fireAt(5000);await drain();f.setTime(9999);f.reply();await drain();assert.equal(f.client.isAuthorized(),true);assert.equal(f.body.textContent,'private');assert.equal(f.renders.length,2);assert.equal(f.clears.length,0);f.client.stop();
});
test('late renewal timer never sends an RPC after local lease expiry',async()=>{
 const f=fixture();assert.equal(await f.client.start(),true);
 f.setTime(10000);f.fireAt(5000);await drain();
 assert.equal(f.requests.length,1);assert.equal(f.client.isAuthorized(),false);
 assert.equal(f.body.textContent,'');assert.deepEqual(f.clears,['ui-grant-expired']);f.client.stop();
});
