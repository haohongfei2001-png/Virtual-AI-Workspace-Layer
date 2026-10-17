import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {J2_C} from './fixtures/j2-send.mjs';
import {parseConversationMetadata} from '../../src/host/conversation-metadata.mjs';

test('test-process partial metadata changes ancestry only and restores identical native facts',async t=>{
 const server=await createHostFixtureServer({journey:'J2'});t.after(()=>server.close());
 const page=await fetch(server.url),cookie=page.headers.get('set-cookie').split(';')[0];await page.text();
 const session=await (await fetch(server.origin+'/api/auth/session',{headers:{cookie}})).json();
 const headers={cookie,authorization:'Bearer '+session.accessToken},path='/backend-api/conversation/'+J2_C;
 const read=async()=>{const r=await fetch(server.origin+path,{headers});assert.equal(r.status,200);return r.json();};
 const before=await read(),native=server.snapshot().j2;assert.deepEqual(server.snapshot().j2DetailResponses,{partial:0,full:1});
 server.setConversationMetadataPartial(J2_C,true);const partial=await read();
 assert.equal(partial.mapping.j2_old.parent,'missing_fixture_parent');
 assert.deepEqual(partial.mapping.j2_old.message,before.mapping.j2_old.message);
 const parsed=parseConversationMetadata({conversationId:J2_C,principalId:session.user.id,payload:JSON.stringify(partial)});
 assert.equal(parsed.state,'partial');assert(parsed.gaps.length>0);
 assert.equal((await fetch(server.origin+path)).status,401);assert.deepEqual(server.snapshot().j2DetailResponses,{partial:1,full:1});
 server.setConversationMetadataPartial(J2_C,false);assert.deepEqual(await read(),before);assert.deepEqual(server.snapshot().j2DetailResponses,{partial:1,full:2});
 assert.deepEqual(server.snapshot().j2,native);
 for(const [id,value] of [['other',true],[J2_C,1],[J2_C,null]])assert.throws(()=>server.setConversationMetadataPartial(id,value),/invalid-fixture/);
 assert.equal((await fetch(server.origin+'/native/setConversationMetadataPartial',{method:'POST',headers})).status,404);
});
test('partial metadata test control is unavailable outside the J2 fixture',async t=>{
 const server=await createHostFixtureServer();t.after(()=>server.close());
 assert.throws(()=>server.setConversationMetadataPartial(J2_C,true),/invalid-fixture/);
});
