import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readSessionJSON} from '../../src/host/session-identity.mjs';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createIsolatedSessionReader} from '../../src/host/isolated-session-reader.mjs';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
const origin='https://chatgpt.com',target=origin+'/api/auth/session';
function blockedResponse({status=403,mitigated='challenge',url=target,redirected=false}={}){
 let bodyReads=0,cancellations=0;const response={status,url,redirected,headers:new Headers({'content-type':'text/html',...(mitigated===null?{}:{'cf-mitigated':mitigated})}),body:{async cancel(){cancellations++;},getReader(){bodyReads++;throw Error('PRIVATE_CHALLENGE_HTML_MUST_NOT_BE_READ');}}};
 return {response,bodyReads:()=>bodyReads,cancellations:()=>cancellations};
}
for(const [options,expected] of [[{},'session-challenged'],[{status:200},'session-challenged'],[{status:401},'session-challenged'],[{status:429},'session-challenged'],[{status:503},'session-challenged'],[{mitigated:null},'session-unauthorized'],[{status:401,mitigated:null},'session-unauthorized'],[{mitigated:'other'},'session-unauthorized'],[{status:200,mitigated:null},'invalid-session-mime'],[{status:503,mitigated:null},'invalid-session-response'],[{url:origin+'/other'},'invalid-session-response'],[{redirected:true},'invalid-session-response']])test('parser distinguishes exact challenge without consuming response body '+JSON.stringify(options),async()=>{
 const f=blockedResponse(options);await assert.rejects(readSessionJSON(f.response,{target,limit:262144,check(){}}),{message:expected});assert.equal(f.bodyReads(),0);assert.equal(f.cancellations(),1,'rejected transport is released without acquiring a body reader');
});
for(const factory of [createSessionProvider,createIsolatedSessionReader])for(const status of [200,401,403])test(factory.name+' retains '+status+' challenge enum and performs one fixed fetch only',async()=>{
 const f=blockedResponse({status}),calls=[];const provider=factory({origin,now:()=>1000,elapsedNow:()=>1000,fetch:async(url,options)=>{calls.push({url,options});return f.response;}});
 await assert.rejects(provider.read(),{message:'session-challenged'});assert.equal(calls.length,1);assert.equal(calls[0].url,target);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.credentials,'include');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.redirect,'error');assert.equal(f.bodyReads(),0);assert.equal(f.cancellations(),1,'rejected transport is released without acquiring a body reader');
});
for(const status of [200,401,403])test('real worker provider '+status+' challenge becomes fixed unverified status without scope or retry',async()=>{
 const f=blockedResponse({status});let reads=0,id=0;const provider=createSessionProvider({origin,now:()=>1000,elapsedNow:()=>1000,fetch:async()=>{reads++;return f.response;}});
 const authority=createScopeAuthority({provider,profile:{id:'fixture',singlePersonalDefault:true},now:()=>1000,elapsedNow:()=>1000,makeId:()=> 'id'+(++id)});
 const frame={tabId:1,frameId:0,documentId:'document',documentLifecycle:'active',incognito:false,actualURL:origin+'/'};
 try{assert.deepEqual(await authority.refresh(frame,'bind'),{state:'unverified',reason:'host-verification-required'});assert.equal(authority.scopeFor(frame),null);assert.notEqual(authority.peek(frame).state,'verified');assert.equal(reads,1);assert.equal(f.bodyReads(),0);assert.equal(f.cancellations(),1,'rejected transport is released without acquiring a body reader');assert.equal(id,0,'challenge cannot issue proof IDs');}finally{authority.invalidateAll();}
});
// Exercise actual service fallback admission, not a duplicated condition.
const fixtureSource=readFileSync(new URL('./host-identity-fallback.test.mjs',import.meta.url),'utf8');
const marker="\ntest('MOCK transport failure uses actual challenge/result service dispatch to establish isolated C3 proof'";
assert.equal(fixtureSource.split(marker).length,2,'existing fixture boundary remains exact');
const fixture=new Function('assert','MockIDBFactory','ScopeRepository','createHostBindingService',fixtureSource.slice(0,fixtureSource.indexOf(marker)).replace(/^import .*;\n/gm,'')+'\nreturn fixture;')(assert,MockIDBFactory,ScopeRepository,createHostBindingService);
test('challenge service response cannot fall back to isolated auth or retry in background',async t=>{
 const f=await fixture(t,{primaryError:'session-challenged'}),result=await f.request();assert.equal(result.state,'unverified');assert.equal(result.reason,'host-verification-required');assert.equal(f.commands.length,0);assert.equal(f.reads,1);assert.equal(f.service.authority.scopeFor(f.frame),null);assert.equal(f.timers.size,0);
 f.advance(60000);for(let i=0;i<30;i++)await Promise.resolve();assert.equal(f.reads,1);assert.equal(f.commands.length,0);
});
test('ordinary unauthorized service result is not mislabeled a host challenge',async t=>{
 const f=await fixture(t,{primaryError:'session-unauthorized'}),result=await f.request();assert.equal(result.state,'unverified');assert.notEqual(result.reason,'host-verification-required');assert.equal(f.commands.length,0);assert.equal(f.reads,1);
});
