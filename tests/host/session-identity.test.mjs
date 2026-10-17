import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createIsolatedSessionReader} from '../../src/host/isolated-session-reader.mjs';
import {sessionCredentials} from '../../src/host/session-identity.mjs';
for(const [name,factory] of [['worker',createSessionProvider],['isolated',createIsolatedSessionReader]])for(const bytes of [[0xff],[0xe2,0x82]])test(name+' invalid UTF8 '+bytes.join(',')+' is schema failure, never transport fallback',async()=>{
 let calls=0;const reader=factory({origin:'https://chatgpt.com',fetch:async url=>{calls++;const response=new Response(new Uint8Array(bytes),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;}});
 await assert.rejects(reader.read(),{message:'invalid-session-body'});assert.equal(calls,1);
});
for(const time of [NaN,Infinity,-Infinity])test('shared decoder rejects nonfinite wall clock '+time,()=>{
 assert.throws(()=>sessionCredentials({user:{id:'P'},expires:'2099-01-01T00:00:00Z',accessToken:'PRIVATE'},time),{message:'invalid-session-schema'});
});
