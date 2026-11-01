import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostFixtureServer} from './server.mjs';
import {legacyExpectedWorld as expected} from '../expected/legacy.mjs';

async function fixture(t) {
  const server=await createHostFixtureServer();t.after(()=>server.close());
  const page=await fetch(server.url),cookie=page.headers.get('set-cookie').split(';')[0];await page.text();
  const session=await (await fetch(server.origin+'/api/auth/session',{headers:{cookie}})).json();
  const headers={cookie,authorization:`Bearer ${session.accessToken}`};
  const path='/backend-api/conversation/'+expected.conversations[0].id;
  return {server,headers,path,get:(target=path,auth=headers)=>fetch(server.origin+target,{headers:auth})};
}

function assertPrivateSnapshot(server) {
  const snapshot=JSON.stringify(server.snapshot()),secrets=server.privacySentinels();
  for(const secret of [secrets.token,secrets.cookie,secrets.body])assert.equal(snapshot.includes(secret),false,'snapshot must omit sentinel data');
}

test('privacy failure is consumed only by one authenticated known conversation metadata GET',async t=>{
  const {server,headers,path,get}=await fixture(t);
  assert.deepEqual(server.privacyFailureStatus(),{armed:false,authenticatedFailures:0});
  server.failNextAuthenticatedMetadata();
  assert.throws(()=>server.failNextAuthenticatedMetadata(),/privacy-failure-already-armed/);
  const probes=[
    [path,{},401],
    [path,{cookie:headers.cookie},401],
    [path,{authorization:headers.authorization},401],
    [path,{cookie:headers.cookie,authorization:'Bearer incorrect-fixture-token'},401],
    ['/backend-api/conversation/ffffffff-ffff-4fff-8fff-ffffffffffff',headers,404],
    [path+'?unexpected=1',headers,404],
  ];
  for(const [target,auth,status] of probes){
    const response=await get(target,auth);assert.equal(response.status,status);await response.text();
    assert.deepEqual(server.privacyFailureStatus(),{armed:true,authenticatedFailures:0});
    assertPrivateSnapshot(server);
  }
  const failure=await get();assert.equal(failure.status,200);assert.match(failure.headers.get('content-type'),/^application\/json/);
  const raw=await failure.text();assert(raw.includes('SYNTHETIC_BODY_MUST_NOT_ESCAPE'));assert.throws(()=>JSON.parse(raw),SyntaxError);
  assert.deepEqual(server.privacyFailureStatus(),{armed:false,authenticatedFailures:1});
  const recovered=await get();assert.equal(recovered.status,200);
  assert.equal((await recovered.json()).conversation_id,expected.conversations[0].id);
  assert.deepEqual(server.privacyFailureStatus(),{armed:false,authenticatedFailures:1});assertPrivateSnapshot(server);
});

test('privacy controls and sentinel getter have no HTTP route or mutable returned state',async t=>{
  const {server,headers,get}=await fixture(t),sentinels=server.privacySentinels();
  assert.equal(sentinels.token,headers.authorization.slice('Bearer '.length));
  assert.equal(sentinels.cookie,headers.cookie.slice('host_fixture_session='.length));
  const copy=server.privacySentinels();copy.token='changed';copy.cookie='changed';copy.body='changed';
  assert.deepEqual(server.privacySentinels(),sentinels);
  const status=server.privacyFailureStatus();status.armed=true;status.authenticatedFailures=99;
  assert.deepEqual(server.privacyFailureStatus(),{armed:false,authenticatedFailures:0});
  for(const control of ['privacySentinels','failNextAuthenticatedMetadata','privacyFailureStatus']){
    for(const path of ['/'+control,'/native/'+control]){
      for(const method of ['GET','POST']){
        const response=await fetch(server.origin+path,{method,headers});assert.equal(response.status,404);
        const body=await response.text();for(const secret of Object.values(sentinels))assert.equal(body.includes(secret),false);
      }
    }
  }
  assert.deepEqual(server.privacyFailureStatus(),{armed:false,authenticatedFailures:0});
  assert.equal((await (await get()).json()).conversation_id,expected.conversations[0].id);assertPrivateSnapshot(server);
});

test('revoked principal cannot consume armed privacy failure and status/snapshot omit credentials',async t=>{
  const {server,get}=await fixture(t);server.failNextAuthenticatedMetadata();server.setPrincipal(null);
  const denied=await get();assert.equal(denied.status,401);await denied.text();
  assert.deepEqual(server.privacyFailureStatus(),{armed:true,authenticatedFailures:0});assertPrivateSnapshot(server);
  const encoded=JSON.stringify(server.privacyFailureStatus());
  for(const secret of Object.values(server.privacySentinels()))assert.equal(encoded.includes(secret),false);
});
