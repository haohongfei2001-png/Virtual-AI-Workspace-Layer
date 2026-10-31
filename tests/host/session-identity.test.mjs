import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createIsolatedSessionReader} from '../../src/host/isolated-session-reader.mjs';
import {readSessionJSON,sessionCredentials} from '../../src/host/session-identity.mjs';
for(const [name,factory] of [['worker',createSessionProvider],['isolated',createIsolatedSessionReader]])for(const bytes of [[0xff],[0xe2,0x82]])test(name+' invalid UTF8 '+bytes.join(',')+' is schema failure, never transport fallback',async()=>{
 let calls=0;const reader=factory({origin:'https://chatgpt.com',fetch:async url=>{calls++;const response=new Response(new Uint8Array(bytes),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;}});
 await assert.rejects(reader.read(),{message:'invalid-session-body'});assert.equal(calls,1);
});
for(const time of [NaN,Infinity,-Infinity])test('shared decoder rejects nonfinite wall clock '+time,()=>{
 assert.throws(()=>sessionCredentials({user:{id:'P'},expires:'2099-01-01T00:00:00Z',accessToken:'PRIVATE'},time),{message:'invalid-session-schema'});
});

const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
for(const [options,expected] of [
 [{status:401},'session-unauthorized'],
 [{headers:{'content-type':'text/html'}},'invalid-session-mime'],
 [{headers:{'content-length':'9999'}},'session-response-too-large']
])test('pre-reader rejection drains body and preserves '+expected,async()=>{
 let cancel, cancellations=0, settled=false;
 const body=new ReadableStream({cancel(){cancellations++;return new Promise((_,reject)=>{cancel=reject;});}});
 const response=new Response(body,{...options,headers:{'content-type':'application/json',...options.headers}});
 Object.defineProperty(response,'url',{value:'https://fixture.test/session'});
 const pending=readSessionJSON(response,{target:response.url,limit:100,check(){}});
 const result=pending.then(()=>{settled=true;return 'unexpected-success';},error=>{settled=true;return error.message;});
 await flush();const before={cancellations,settled,locked:body.locked};
 cancel?.(Error('private cleanup error'));await flush();
 assert.deepEqual(before,{cancellations:1,settled:false,locked:false});
 assert.equal(await result,expected);
});

test('isolated reader retains late response cleanup after caller abort',async()=>{
 let deliver,cancel,calls=0,cancellations=0;
 const reader=createIsolatedSessionReader({origin:'https://fixture.test',fetch:()=>{calls++;return new Promise(resolve=>{deliver=resolve;});}});
 const controller=new AbortController();
 const pending=reader.read({signal:controller.signal});
 const rejected=assert.rejects(pending,{message:'session-aborted'});
 controller.abort();await rejected;
 const body=new ReadableStream({cancel(){cancellations++;return new Promise(resolve=>{cancel=resolve;});}});
 deliver(new Response(body));await flush();
 const before={cancellations,idle:reader.prepareIdle()!==null};
 cancel?.();await flush();
 assert.deepEqual(before,{cancellations:1,idle:false});
 assert(reader.prepareIdle()?.isCurrent());assert.equal(calls,1);
});
