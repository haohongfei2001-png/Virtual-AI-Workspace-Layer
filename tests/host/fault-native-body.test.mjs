import test from 'node:test';import assert from 'node:assert/strict';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
for(const fault of ['rate-limit','corrupt','unknown-protocol'])for(const enabled of [false,true])test(fault+' independent native body '+enabled,async t=>{
 const s=await createVariantHostFixtureServer({profile:'FAULT',fault,faultNativeBody:enabled});t.after(()=>s.close());const initial=await fetch(s.url),cookie=initial.headers.get('set-cookie').split(';')[0],get=path=>fetch(s.origin+path,{headers:{cookie}});
 const route=await(await get('/native/route?path=%2Fc%2F33333333-3333-4333-8333-333333333333')).json();
 assert.deepEqual(route.messages,enabled?[{messageId:'msg-self',branchId:'fault-native-branch',text:'Independently rendered native fixture message'}]:undefined);
 const response=await get('/backend-api/conversation/33333333-3333-4333-8333-333333333333');
 if(fault==='rate-limit')assert.equal(response.status,429);else if(fault==='corrupt')await assert.rejects(response.json(),SyntaxError);else assert.deepEqual(await response.json(),{protocol:'future-99',payload:{opaque:true}});
 assert.equal(s.manifest.faultNativeBody,enabled?true:undefined);
});
for(const options of [{profile:'MODERN',faultNativeBody:true},{profile:'FAULT',fault:'csp',faultNativeBody:true},{profile:'FAULT',fault:'rate-limit',faultNativeBody:'yes'}])test('native fault body option rejects '+JSON.stringify(options),()=>assert.rejects(createVariantHostFixtureServer(options),/invalid-fault-native-body/));
