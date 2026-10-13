import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostFixtureServer} from './server.mjs';
import {modernExpectedWorld as modern} from '../expected/modern.mjs';
import {partialExpectedWorld as partial} from '../expected/partial.mjs';
import {faultExpectedWorld as faultWorld} from '../expected/fault.mjs';
async function start(t,options){
 const fixture=await createHostFixtureServer(options);t.after(()=>fixture.close());
 const response=await fetch(fixture.url),html=await response.text(),cookie=response.headers.get('set-cookie').split(';')[0];
 return{...fixture,html,headers:response.headers,get:(path,headers={})=>fetch(fixture.origin+path,{headers:{cookie,...headers}})};
}
test('MODERN raw roster is not a current-context proof; native requests carry selected context',async t=>{
 const s=await start(t,{profile:'MODERN'});assert.match(s.html,/Navigation rail/);assert.match(s.html,/section hidden aria-label="Previous conversation"/);
 const session=await(await s.get('/api/auth/session')).json();const roster=await(await s.get('/backend-api/accounts/check/v4-2023-04-27',{authorization:`Bearer ${session.accessToken}`})).json();
 assert.deepEqual(roster.account_order,modern.accountRoster);assert.equal(Object.hasOwn(roster,'active_account_id'),false);
 const preferences=await(await s.get('/native/preferences')).json();assert.equal(preferences.account_id,modern.selectedContext);
 const c=modern.conversations[2].id;const body=await(await s.get(`/backend-api/conversation/${c}`,{'Chatgpt-Account-Id':preferences.account_id})).json();
 assert.equal(body.mapping['node-self'].message.create_time,modern.messageCases.positive.selfTime);
 assert.equal(Object.hasOwn(body.mapping['node-incomplete'].message,'author'),false);assert.equal(Object.hasOwn(body.mapping['node-incomplete'].message,'create_time'),false);
 assert.equal(s.snapshot().nativeRequests[0].context,modern.selectedContext);
 const next=await(await s.get('/backend-api/conversations?offset=2&limit=25')).json();assert.deepEqual(next.items.map(c=>c.id),modern.afterScrollIds);assert.equal(next.windowed,true);
 for(const path of ['/expected/modern.mjs','/tests/host/expected/modern.mjs','/variants-server.mjs'])assert.equal((await s.get(path)).status,404);
});
for(const variant of ['positive','missing','conflict','neighbor'])test(`MODERN ${variant} metadata remains independent and imperfect`,async t=>{
 const s=await start(t,{profile:'MODERN',variant});const body=await(await s.get(`/backend-api/conversation/${modern.conversations[2].id}`)).json();
 assert.equal(body.mapping['node-incomplete'].message.id,'msg-incomplete');assert.equal(Object.hasOwn(body.mapping['node-incomplete'].message,'author'),false);
 if(variant==='missing')assert.equal(Object.hasOwn(body.mapping['node-self'].message,'create_time'),false);
 if(variant==='conflict'){assert.equal(body.mapping['node-self'].message.id,body.mapping['node-conflict'].message.id);assert.notEqual(body.mapping['node-self'].message.create_time,body.mapping['node-conflict'].message.create_time);}
 if(variant==='neighbor')assert.equal(body.mapping['node-neighbor'].message.author.id,modern.messageCases.neighbor.actorId);
});
for(const variant of ['positive','missing','conflict','neighbor'])test(`PARTIAL ${variant}: 1000 independent objects, only 25 initially exposed`,async t=>{
 const s=await start(t,{profile:'PARTIAL',variant});assert.equal(s.snapshot().conversationCount,partial.worldSize);
 const links=[...s.html.matchAll(/href="\/c\/([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(links,partial.conversations.slice(0,25).map(c=>c.id));assert.ok(!s.html.includes(partial.conversations[999].id));
 const data=await(await s.get('/backend-api/conversations?offset=25&limit=25')).json();assert.equal(data.items.length,25);assert.equal(data.items[0].id,partial.conversations[partial.variants[variant].secondPageStart].id);
 assert.equal(new Set([...links,...data.items.map(c=>c.id)]).size,25+partial.variants[variant].newVisible);
 const again=await(await s.get('/backend-api/conversations?offset=50&limit=25')).json();assert.notEqual(again.page_revision,data.page_revision);
 if(variant==='missing')assert.equal(Object.hasOwn(data.items[1],'title'),false);
 assert.equal((await s.get('/expected/partial.mjs')).status,404);
});
for(const fault of Object.keys(faultWorld.cases))test(`FAULT ${fault} has fixed predeclared behavior`,async t=>{
 const s=await start(t,{profile:'FAULT',fault});assert.equal(s.manifest.fault,fault);
 const path=`/backend-api/conversation/${modern.conversations[2].id}`;
 if(fault==='auth-failure')assert.equal((await s.get('/api/auth/session')).status,401);
 if(fault==='unsafe-reading')assert.match(s.html,/<section aria-label="Conversation" id="reading">[\s\S]*<form id="composer">[\s\S]*<\/form><\/section>/);
 if(fault==='forged-scope'){const script=await(await s.get('/fault-native.mjs')).text();assert.match(script,/attacker-chosen-scope/);assert.doesNotMatch(script,/account-host-personal/);}
 if(fault==='csp')assert.match(s.headers.get('content-security-policy'),/frame-src 'none'/);
 if(fault==='iframe-destroy')assert.match(await(await s.get('/fault-native.mjs')).text(),/MutationObserver/);
 if(fault==='rate-limit'){const response=await s.get(path);assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');}
 if(fault==='corrupt')await assert.rejects(async()=>await(await s.get(path)).json(),SyntaxError);
 if(fault==='unknown-protocol')assert.deepEqual(await(await s.get(path)).json(),{protocol:'future-99',payload:{opaque:true}});
 if(fault==='stale-response'){
  const held=s.get(`/native/route?path=${encodeURIComponent('/c/'+modern.conversations[2].id)}`);
  for(let i=0;i<50&&s.snapshot().pendingResponses===0;i++)await new Promise(resolve=>setTimeout(resolve,2));
  assert.equal(s.snapshot().pendingResponses,1);
  const fresh=await(await s.get(`/native/route?path=${encodeURIComponent('/c/'+modern.conversations[3].id)}`)).json();assert.equal(fresh.conversationId,modern.conversations[3].id);
  assert.equal(s.releaseStaleResponses(),1);assert.equal((await(await held).json()).conversationId,modern.conversations[2].id);
 }
});
test('unsupported profiles and faults fail before binding a server',async()=>{
 await assert.rejects(createHostFixtureServer({profile:'UNRECOGNIZED'}),/not-implemented/);
 await assert.rejects(createHostFixtureServer({profile:'FAULT',fault:'invented'}),/not-implemented/);
});
