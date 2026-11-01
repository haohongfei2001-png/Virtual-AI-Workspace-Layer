import test from 'node:test';import assert from 'node:assert/strict';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
test('fixed production parser authenticates a real loopback service and separates changed principals',async t=>{
 const fixture=await createHostFixtureServer();t.after(()=>fixture.close());const welcome=await fetch(fixture.url),cookie=welcome.headers.get('set-cookie').split(';')[0];await welcome.arrayBuffer();
 // Node has no browser cookie jar. Test transport injects only the server-issued
 // fixture cookie; fixed parser/request policy bytes are the product module.
 const provider=createSessionProvider({origin:fixture.origin,fetch:(url,options)=>{assert(url.startsWith(fixture.origin+'/'));return fetch(url,{...options,headers:{...options.headers,Cookie:cookie}});}});
 const sender={id:'ext',tab:{id:1},frameId:0,documentId:'doc',url:fixture.url,documentLifecycle:'active'};let id=0,seq=0;
 const service=createHostBindingService({extensionId:'ext',provider,profile:{id:'legacy_personal_reconstruction',singlePersonalDefault:true},repository:{},getFrame:async()=>({documentId:'doc',url:fixture.url,documentLifecycle:'active'}),allowedURL:url=>new URL(url).origin===fixture.origin,makeId:()=>`token_${++id}`});
 const request=(type,extra={})=>service.handle({v:1,type,clientId:'client',seq:++seq,...extra},sender);
 async function bind(){const hello=await request('HOST_HELLO');assert(hello.ok);const {documentToken,producerToken,routeEpoch}=hello.binding;assert.equal((await request('HOST_REFRESH',{documentToken,producerToken,routeEpoch})).state,'verified');const bound=await request('BIND');assert(bound.ok);return bound;}
 const a=await bind();assert.equal(fixture.snapshot().requests['/api/auth/session'],1);assert.equal(fixture.snapshot().requests['/backend-api/accounts/check/v4-2023-04-27'],1);
 fixture.setPrincipal('second-fixture-principal');service.invalidate({tabId:1,documentId:'doc'});const b=await bind();assert.notEqual(a.scope,b.scope);assert(!JSON.stringify(b).includes('second-fixture-principal'));
 fixture.setPrincipal(null);service.invalidate({tabId:1,documentId:'doc'});const hello=await request('HOST_HELLO'),{documentToken,producerToken,routeEpoch}=hello.binding;assert.equal((await request('HOST_REFRESH',{documentToken,producerToken,routeEpoch})).state,'unverified');assert.equal((await request('BIND')).ok,false);
});
