import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeAccountsProbe} from '../../tools/native-me-probe/accounts.mjs';
const target='https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27';
const entry={account:{account_id:'PRIVATE_ID',structure:'personal'},name:'PRIVATE_NAME'};
function response(body,headers={}){const r=new Response(JSON.stringify(body),{headers:{'content-type':'application/json',...headers}});Object.defineProperty(r,'url',{value:target});return r;}
for(const mode of ['valid','invalid','challenge','size','mime','deadline','route'])test(`accounts-only bounded diagnostic: ${mode}`,async()=>{
 let calls=0,time=0,current=true;
 const probe=createNativeAccountsProbe({now:()=>time,isCurrent:()=>current,fetch:async(url,options)=>{
  calls++;assert.equal(url,target);assert.deepEqual({...options,signal:null},{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:null});
  if(mode==='deadline')time=6000;if(mode==='route')current=false;
  return response({accounts:mode==='invalid'?{default:entry}:{PRIVATE_ID:entry}},mode==='challenge'?{'cf-mitigated':'challenge'}:mode==='size'?{'content-length':'1048577'}:mode==='mime'?{'content-type':'text/html'}:{});
 }});
 assert.equal(probe.peek(),null);const r=await probe.run();
 assert.deepEqual(r,{state:'finished',reason:{valid:'accounts-schema-valid-not-authorized',invalid:'accounts-schema:default-canonical-missing',challenge:'session-challenged',size:'session-response-too-large',mime:'invalid-session-mime',deadline:'request-timeout',route:'document-changed'}[mode]});
 assert.equal(calls,1);assert(!JSON.stringify(r).includes('PRIVATE'));assert(Object.isFrozen(r));assert.equal(probe.peek(),r);
 assert.deepEqual(await probe.run(),{state:'already-consumed'});assert.equal(calls,1);
});
test('cancellation settles once; late transport cannot publish private data or retry',async()=>{
 const c=new AbortController();let finish,calls=0;const p=createNativeAccountsProbe({signal:c.signal,fetch:()=>{calls++;return new Promise(r=>finish=r);}});
 const pending=p.run();c.abort();const r=await pending;finish(response({accounts:{PRIVATE_ID:entry}}));await new Promise(r=>setImmediate(r));
 assert.deepEqual(p.peek(),{state:'finished',reason:'document-changed'});assert.equal(p.peek(),r);assert.equal(calls,1);
});
