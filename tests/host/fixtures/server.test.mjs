import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostFixtureServer } from './server.mjs';
import { legacyExpectedWorld as expected } from '../expected/legacy.mjs';

async function fixture(t) {
  const server = await createHostFixtureServer(); t.after(() => server.close());
  const page = await fetch(server.url);
  const cookie = page.headers.get('set-cookie').split(';')[0];
  return {...server,cookie,html:await page.text(),get:(path) => fetch(server.origin+path,{headers:{cookie}})};
}

test('LEGACY serves native-shaped reconstruction without oracle or initial idless identity', async (t) => {
  const server = await fixture(t);
  assert.equal(server.manifest.reconstruction,true);
  assert.match(server.html,/aria-label="Chat history"/);
  assert.match(server.html,/id="composer"/);
  assert.ok(server.html.includes(expected.projects[0].id));
  assert.ok(!server.html.includes(expected.projects[1].id));
  assert.doesNotMatch(server.html,/window\.__expected|data-hf-|verified|application\/json/);
  for(const path of ['/expected/legacy.mjs','/tests/host/expected/legacy.mjs','/server.mjs']) assert.equal((await server.get(path)).status,404);
  assert.equal(server.manifest.oracleHash.length,64);
});

test('fixed authentication endpoints require server-owned cookie and token and return raw protocol data', async (t) => {
  const server = await fixture(t);
  assert.equal((await fetch(server.origin+'/api/auth/session')).status,401);
  const session = await (await server.get('/api/auth/session')).json();
  assert.deepEqual(session.user,{id:expected.principalId});
  assert.ok(Date.parse(session.expires)>Date.now());
  const path = '/backend-api/accounts/check/v4-2023-04-27';
  assert.equal((await server.get(path)).status,401);
  const response = await fetch(server.origin+path,{headers:{cookie:server.cookie,authorization:`Bearer ${session.accessToken}`}});
  const roster = await response.json();
  assert.equal(roster.accounts[expected.contextId].account.structure,'personal');
  assert.equal(Object.hasOwn(roster,'verified'),false);
  server.setPrincipal(null);
  assert.equal((await server.get('/api/auth/session')).status,401);
});

test('idless native activation reveals correct distinct same-name project and members', async (t) => {
  const server = await fixture(t);
  const response = await fetch(server.origin+'/native/action',{method:'POST',headers:{cookie:server.cookie,'Content-Type':'application/json'},body:JSON.stringify({kind:'open-project-button'})});
  const {href} = await response.json();
  const view = await (await server.get(`/native/route?path=${encodeURIComponent(href)}`)).json();
  assert.equal(view.project.id,expected.projects[1].id);
  assert.equal(view.project.name,expected.projects[0].name);
  assert.equal(view.conversations[0].id,expected.conversations[1].id);
  assert.equal(server.snapshot().actions['open-project-button'],1);
});

test('ordinary NONE has explicit current native menu state; UNKNOWN remains unselected', async (t) => {
  const server = await fixture(t);
  const none = await (await server.get(`/native/move-menu?conversation=${expected.conversations[2].id}`)).json();
  const unknown = await (await server.get(`/native/move-menu?conversation=${expected.conversations[3].id}`)).json();
  assert.deepEqual(none.items.filter((i) => i.selected),[{label:'No project',selected:true}]);
  assert.deepEqual(unknown.items.filter((i) => i.selected),[]);
  assert.equal(unknown.items.some((i) => i.label === 'No project'),false);
});

test('test-process identity control retains independent roster order without active-context claim', async (t) => {
  const server = await fixture(t);
  server.setPrincipal('user-other',{accounts:[{account_id:'team',structure:'workspace'},{account_id:'personal',structure:'personal'}]});
  const session = await (await server.get('/api/auth/session')).json();
  assert.equal(session.user.id,'user-other');
  const roster = await (await fetch(server.origin+'/backend-api/accounts/check/v4-2023-04-27',{headers:{cookie:server.cookie,authorization:`Bearer ${session.accessToken}`}})).json();
  assert.deepEqual(roster.account_order,['team','personal']);
  assert.equal(Object.hasOwn(roster,'active_account_id'),false);
  assert.equal(server.snapshot().projectCount,2);
});
