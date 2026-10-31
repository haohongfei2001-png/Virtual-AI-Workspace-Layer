/** Runs ONLY against the patched temporary mirror created by verify-shared-owner.
 * Browser identity/sender/provider are explicit offline doubles; no native NONE
 * receipt, production grant, model invocation or live host result is claimed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostBindingService} from '../../../src/runtime/host-binding-service.mjs';
import {createProWorkerService} from '../../../src/pro/integration/worker-service.mjs';
import {ScopeRepository} from '../../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../../b23/mock-idb.mjs';

const deferred = () => { let resolve; const promise = new Promise(a => { resolve = a; }); return {promise, resolve}; };
const drain = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function fixture(t, options = {}) {
  let id = 0, time = 1000;
  const timers = new Map(), frames = new Map(), repository = new ScopeRepository({indexedDB: new MockIDBFactory(), databaseName: 'pro-owner-hook-fixture'});
  const parent = {id: 'ext', tab: {id: 1, incognito: false}, frameId: 0, documentId: 'parent_fixture', documentLifecycle: 'active', url: 'https://chatgpt.com/'};
  const child = {...parent, frameId: 2, documentId: 'ui_fixture', url: 'chrome-extension://ext/ui.html'};
  for (const s of [parent, child]) frames.set(s.frameId, {documentId: s.documentId, url: s.url, documentLifecycle: 'active', parentFrameId: s.frameId === 0 ? -1 : 0});
  const args = {extensionId: 'ext', repository, uiURL: child.url, profile: {id: 'test', singlePersonalDefault: true},
    provider: {read: async () => ({principalId: 'synthetic-principal', expiresAt: new Date(100000).toISOString(), contexts: [{id: 'personal', kind: 'personal'}], providerProfile: 'test', transport: 'worker-fixed-fetch'})},
    allowedURL: url => url === parent.url, getFrame: async ({frameId}) => frames.get(frameId), now: () => time, elapsedNow: () => time,
    makeId: () => 'fixture_' + (++id), schedule: (fn, ms) => { const key = Symbol(); timers.set(key, {fn, at: time + ms}); return key; }, cancel: key => timers.delete(key), ...options};
  let service;
  t.after(() => { service?.stop(); repository.close(); });
  service = createHostBindingService(args);
  const activate = async () => {
    const hello = await service.handle({v: 1, type: 'HOST_HELLO', clientId: 'client_fixture', seq: 1}, parent); assert.equal(hello.ok, true);
    const {documentToken, producerToken, routeEpoch} = hello.binding, packet = {documentToken, producerToken, routeEpoch};
    assert.equal((await service.handle({v: 1, type: 'HOST_REFRESH', clientId: 'client_fixture', seq: 2, ...packet}, parent)).state, 'verified');
    assert.equal((await service.handle({v: 1, type: 'HOST_UI_MOUNT', ...packet, mountId: 'mount_fixture', regionEpoch: 1}, parent)).ok, true);
    const pair = await Promise.all([service.handle({v: 1, type: 'HOST_UI_JOIN', nonce: 'nonce_fixture', role: 'workspace'}, child),
      service.handle({v: 1, type: 'HOST_UI_CONFIRM', ...packet, mountId: 'mount_fixture', regionEpoch: 1, nonce: 'nonce_fixture', role: 'workspace'}, parent)]);
    assert(pair.every(result => result.ok), JSON.stringify(pair));
    return {grant: pair[0].grant, packet};
  };
  return {service, repository, parent, child, activate,
    async advance(ms) { time += ms; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); } await drain(); }};
}
function spy(overrides = {}) {
  const events = [], object = {handle: async message => { events.push(['handle', message.type]); return {ok: true, value: 'projected-fixture'}; },
    revokeDocument: id => events.push(['document', id]), revokeMount: id => events.push(['mount', id]),
    revokeTab: id => events.push(['tab', id]), stop: () => events.push(['stop']), isIdle: () => true, ...overrides};
  return {object, events};
}

test('patch defaults to disabled and imports no Pro at normal Free construction', async t => {
  const f = fixture(t); assert.equal(f.service.isIdle(), true);
  assert.deepEqual(await f.service.handle({type: 'HOST_UI_PRO'}, f.child), {ok: false, reason: 'pro-unavailable'});
  assert.equal(f.service.isIdle(), true);
});

test('factory receives existing owners once, with no new provider or authority surface', t => {
  let received, count = 0; const s = spy();
  const f = fixture(t, {proServiceFactory: context => { received = context; count++; return s.object; }});
  assert.equal(count, 1); assert.equal(received.ui, f.service.ui); assert.equal(received.assetUi, f.service.ui);
  assert.equal(received.repository, f.repository); assert.equal(received.nativeRepository, f.service.nativeRepository);
  assert.equal(received.readService, f.service.readService); assert.equal(received.views, f.service.views); assert.equal(received.browserLocal, false);
  assert(Object.isFrozen(received)); assert.equal('provider' in received, false); assert.equal('authority' in received, false);
});

test('factory type, synchronous result and own-method interface are validated fail-closed', async t => {
  for (const proServiceFactory of [1, true, {}]) assert.throws(() => fixture(t, {proServiceFactory}), /invalid-pro-service-factory/);
  let getters = 0; const accessor = spy().object; Object.defineProperty(accessor, 'handle', {get() { getters++; return () => {}; }});
  for (const candidate of [null, {}, [], {handle() {}}, accessor, Promise.resolve(spy().object), Promise.reject(Error('private-factory-rejection'))]) {
    assert.throws(() => fixture(t, {proServiceFactory: () => candidate}), /invalid-pro-service-interface/);
  }
  assert.equal(getters, 0); assert.throws(() => fixture(t, {uiURL: null, proServiceFactory: () => spy().object}), /pro-service-ui-required/);
  await drain();
});

test('only the exact HOST_UI_PRO route reaches the optional service before generic UI routing', async t => {
  const s = spy(), f = fixture(t, {proServiceFactory: () => s.object});
  assert.deepEqual(await f.service.handle({type: 'HOST_UI_PRO'}, f.child), {ok: true, value: 'projected-fixture'});
  assert.equal((await f.service.handle({type: 'HOST_UI_PRO_EXTRA'}, f.child)).ok, false);
  assert.deepEqual(s.events, [['handle', 'HOST_UI_PRO']]);
});

test('captured methods retain their factory receiver and cannot be swapped after validation', async t => {
  const s = spy(); s.object.handle = function () { assert.equal(this, s.object); return {ok: true, value: 'captured'}; };
  const f = fixture(t, {proServiceFactory: () => s.object}); s.object.handle = () => { throw Error('replaced'); };
  assert.deepEqual(await f.service.handle({type: 'HOST_UI_PRO'}, f.child), {ok: true, value: 'captured'});
});

test('UI document/mount, explicit invalidation, tab close and stop forward lifecycle hooks', async t => {
  const s = spy(), f = fixture(t, {proServiceFactory: () => s.object}); await f.activate();
  s.events.length = 0; f.service.ui.revokeMount('mount_fixture'); assert.deepEqual(s.events[0], ['mount', 'mount_fixture']);
  assert(s.events.some(event => event[0] === 'document' && event[1] === 'ui_fixture'));
  s.events.length = 0; f.service.invalidate({tabId: 1, documentId: 'parent_fixture'}); assert.deepEqual(s.events[0], ['document', 'parent_fixture']);
  s.events.length = 0; f.service.invalidate({tabId: 1}); assert.deepEqual(s.events[0], ['tab', 1]);
  s.events.length = 0; f.service.tabClosed(1); assert.deepEqual(s.events[0], ['tab', 1]);
  s.events.length = 0; f.service.stop(); assert.deepEqual(s.events[0], ['stop']); assert.equal(f.service.isIdle(), false);
});

test('optional service isIdle failures and promises never allow idle admission', async t => {
  for (const isIdle of [() => false, () => { throw Error('private-idle-error'); }, () => Promise.resolve(true)]) {
    const f = fixture(t, {proServiceFactory: () => spy({isIdle}).object}); assert.equal(f.service.isIdle(), false);
  }
  await drain();
});

test('optional lifecycle exceptions cannot bypass existing Free revocation/stop', async t => {
  const s = spy({revokeDocument() { throw Error('private-error'); }, stop() { throw Error('private-error'); }});
  const f = fixture(t, {proServiceFactory: () => s.object}), {grant} = await f.activate();
  f.service.invalidate({tabId: 1, documentId: 'parent_fixture'});
  await assert.rejects(f.service.ui.withScope({sender: f.child, grantId: grant.id, mountId: 'mount_fixture'}, () => assert.fail('old grant cannot survive')));
  assert.doesNotThrow(() => f.service.stop()); assert.equal(f.service.isIdle(), false);
});

test('patched binding with real RPC shell aborts on parent invalidation and tracks late invoke', async t => {
  const gate = deferred(); let call;
  const f = fixture(t, {proServiceFactory: ports => createProWorkerService({...ports,
    invoke: value => { call = value; return gate.promise; }, projectReply: () => ({state: 'ready'})})});
  const {grant} = await f.activate();
  const pending = f.service.handle({v: 1, type: 'HOST_UI_PRO', grantId: grant.id, mountId: 'mount_fixture', action: 'view', payload: {}}, f.child);
  await drain(); assert.equal(call.guard(), true); assert.equal(f.service.isIdle(), false);
  f.service.invalidate({tabId: 1, documentId: 'parent_fixture'}); assert.equal(call.signal.aborted, true);
  assert.deepEqual(await pending, {ok: false, reason: 'pro-request-unavailable'}); assert.equal(f.service.isIdle(), false);
  gate.resolve({ok: true, value: {privateIndex: 'late'}}); await drain(); assert.equal(f.service.isIdle(), true);
});

test('patched binding does not become idle at the six-second RPC deadline before owner settles', async t => {
  const gate = deferred(); let call;
  const f = fixture(t, {proServiceFactory: ports => createProWorkerService({...ports,
    invoke: value => { call = value; return gate.promise; }, projectReply: () => ({state: 'ready'})})});
  const {grant} = await f.activate(), pending = f.service.handle({v: 1, type: 'HOST_UI_PRO', grantId: grant.id, mountId: 'mount_fixture', action: 'view', payload: {}}, f.child);
  await drain(); await f.advance(6000); assert.deepEqual(await pending, {ok: false, reason: 'pro-request-unavailable'});
  assert.equal(call.signal.aborted, true); assert.equal(f.service.isIdle(), false);
  gate.resolve({ok: true, value: {}}); await drain(); assert.equal(f.service.isIdle(), true);
});
