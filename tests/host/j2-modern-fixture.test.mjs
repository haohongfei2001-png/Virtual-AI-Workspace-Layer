import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {j2ModernNative,j2ModernDetail} from './fixtures/j2-modern.mjs';
import {J2_C} from './fixtures/j2-send.mjs';
import {modernExpectedWorld as oracle} from './expected/modern.mjs';
const detail='/backend-api/conversation/'+J2_C,team=oracle.selectedContext,personal=oracle.accountRoster[0];
async function fixture(t){
 const now=Date.UTC(2026,9,17),server=await createVariantHostFixtureServer({profile:'MODERN',journey:'J2',now:()=>now});t.after(()=>server.close());
 const page=await fetch(server.origin+'/c/'+J2_C),cookie=page.headers.get('set-cookie').split(';')[0];await page.text();
 const request=(path,options={})=>fetch(server.origin+path,{...options,headers:{Cookie:cookie,...options.headers}});
 const session=await(await request('/api/auth/session')).json();
 const send=(id,context=team)=>request('/native/j2/send',{method:'POST',headers:{'Chatgpt-Account-Id':context,'x-j2-operation-id':id,'x-j2-message-id':'msg_'+id}});
 return {server,request,session,send,now};
}
test('MODERN J2 HTTP session selects non-first Team and exposes independently original historical row',async t=>{
 const f=await fixture(t);assert.notEqual(team,personal);assert.equal(f.server.manifest.journey,'J2');
 assert.equal((await(await f.request('/native/preferences')).json()).account_id,team);
 const roster=await(await f.request('/backend-api/accounts/check/v4-2023-04-27',{headers:{Authorization:'Bearer '+f.session.accessToken}})).json();assert.deepEqual(roster.account_order,oracle.accountRoster);
 const body=await(await f.request(detail,{headers:{'Chatgpt-Account-Id':team}})).json();assert.equal(body.history_semantics,'fixture-original-self-send/1');
 assert.equal(f.now-Date.parse(body.mapping.j2_old.message.original_send.sent_at),90*86400000);
 assert.equal(body.mapping.j2_old.message.original_send.author_id,oracle.principalId);
 assert.equal((await f.request(detail,{headers:{'Chatgpt-Account-Id':team,Authorization:'Bearer '+f.session.accessToken}})).status,200);
});
test('MODERN J2 private operations and metadata require cookie and selected Team authority',async t=>{
 const f=await fixture(t);
 for(const path of [detail,'/native/j2/operations/missing'])assert.equal((await fetch(f.server.origin+path)).status,401);
 assert.equal((await fetch(f.server.origin+'/native/j2/send',{method:'POST'})).status,401);
 for(const context of [undefined,personal,'not-in-roster'])assert.equal((await f.request(detail,{headers:context===undefined?{}:{'Chatgpt-Account-Id':context}})).ok,false,'detail must reject '+String(context));
 assert.equal((await f.request(detail,{headers:{'Chatgpt-Account-Id':team,Authorization:'Bearer invalid'}})).status,401);
 const before=f.server.snapshot().j2;
 assert.equal((await f.send('wrong_context',personal)).status,409);assert.deepEqual(f.server.snapshot().j2,before);
});
test('actual HTTP failed then accepted Team send preserves receipt and late original-time reveal',async t=>{
 const f=await fixture(t);assert.equal((await f.send('failed')).status,503);
 const failed=await(await f.request('/native/j2/operations/failed')).json();assert.equal(failed.acceptanceState,'failed');assert.equal(failed.contextId,team);assert.equal(f.server.snapshot().j2.rows.length,1);
 await f.request('/native/j2/success',{method:'POST'});assert.equal((await f.send('accepted')).status,200);
 const accepted=await(await f.request('/native/j2/operations/accepted')).json();assert.equal(accepted.acceptanceState,'accepted');assert.equal(accepted.contextId,team);
 const before=await(await f.request(detail,{headers:{'Chatgpt-Account-Id':team}})).json();assert.equal(before.mapping.msg_accepted.message.status,'fixture-accepted');assert.equal(before.mapping.msg_accepted.message.original_send,undefined);
 await f.request('/native/j2/reveal',{method:'POST'});
 const after=await(await f.request(detail,{headers:{'Chatgpt-Account-Id':team}})).json();assert.equal(after.mapping.msg_accepted.message.original_send.sent_at,f.server.snapshot().j2.rows.at(-1).at);
 assert.deepEqual(await(await f.request('/native/j2/operations/failed')).json(),failed);
 assert.equal((await f.send('accepted')).status,409);
 f.server.setSelectedContext(personal);assert.equal((await f.request('/native/j2/operations/accepted')).status,404);
});
test('served native scripts declare selected context and retain unique route-owned J2 message bodies',async t=>{
 const f=await fixture(t),script=await(await f.request('/native.mjs')).text(),variant=await(await f.request('/variants-native.mjs')).text();
 assert(script.includes("'Chatgpt-Account-Id':(await (await fetch('/native/preferences')).json()).account_id"));
 assert(variant.includes("headers:{'Chatgpt-Account-Id':preferences.account_id}"));
 const requests=[],document={querySelector:selector=>selector.startsWith('aside')?{querySelectorAll:()=>[],addEventListener(){}}:{append(){throw Error('duplicate-reading-body');}},createDocumentFragment(){throw Error('duplicate-message-construction');}};
 const fetchStub=async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>path==='/native/preferences'?{account_id:team}:{history_semantics:'fixture-original-self-send/1',mapping:{j2_old:{message:{id:'j2_old'}}}}};};
 await new (Object.getPrototypeOf(async function(){}).constructor)('document','fetch','MutationObserver','location',variant.replace("import '/native.mjs';",''))(document,fetchStub,class{observe(){}},{pathname:'/c/'+J2_C});
 assert.equal(requests.at(-1).path,detail);assert.equal(requests.at(-1).options.headers['Chatgpt-Account-Id'],team);
 const view=await(await f.request('/native/route?path='+encodeURIComponent('/c/'+J2_C))).json();assert.deepEqual(view.messages.map(row=>row.messageId),['j2_old']);assert.equal(view.messages[0].branchId,'j2-root');
});
test('J2 script transforms reject missing anchors and normal MODERN never acquires J2 routes',async t=>{
 assert.throws(()=>j2ModernNative(''),/handler-changed/);assert.throws(()=>j2ModernDetail(''),/anchor-mismatch/);
 const native=await readFile(new URL('./fixtures/variants-native.mjs',import.meta.url),'utf8');assert.throws(()=>j2ModernDetail(native+native),/anchor-mismatch/);
 const server=await createVariantHostFixtureServer({profile:'MODERN'});t.after(()=>server.close());const page=await fetch(server.origin+'/c/'+J2_C),cookie=page.headers.get('set-cookie').split(';')[0];await page.text();
 const body=await(await fetch(server.origin+detail,{headers:{Cookie:cookie,'Chatgpt-Account-Id':team}})).json();assert.equal(body.history_semantics,undefined);
 assert.equal((await fetch(server.origin+'/native/j2/success',{method:'POST',headers:{Cookie:cookie}})).status,404);
});
