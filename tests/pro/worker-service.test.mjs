import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createProWorkerService, PRO_WORKER_ACTIONS, PRO_WORKER_MAX_BYTES} from '../../src/pro/integration/worker-service.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const drain = async () => { for (let index = 0; index < 32; index++) await Promise.resolve(); };
const request = (action = 'view', payload = {}) => ({v: 1, type: 'HOST_UI_PRO', grantId: 'grant_fixture', mountId: 'mount_fixture', action, payload});
const sender = () => ({id: 'fixture_extension', tab: {id: 1, incognito: false}, frameId: 2, documentId: 'ui_fixture',
  documentLifecycle: 'active', url: 'chrome-extension://fixture_extension/ui.html'});
const unavailable = {ok: false, reason: 'pro-request-unavailable'};
function fixture(options = {}) {
  const timers = new Map(), calls = [], scopes = [], projections = [], gate = {current: true};
  let time = 0;
  const context = {scope: {key: 'fixture_scope'}, scopeGrantId: 'owner_private_grant',
    parentFrame: {documentId: 'parent_fixture', tabId: 1}, role: 'workspace', isCurrent: () => gate.current};
  const invoke = async value => { calls.push(value); return options.invoke ? options.invoke(value) : {ok: true, value: {privateIndex: {a: 'private'}}}; };
  const projectReply = value => { projections.push(value); return options.projectReply ? options.projectReply(value) : {state: 'ready', action: value.action}; };
  const ui = {withScope: async (args, work) => { scopes.push(args); return options.withScope ? options.withScope(args, work, context) : work(context); }};
  const service = createProWorkerService({ui, invoke, projectReply, maxPending: options.maxPending ?? 32,
    elapsedNow: () => time, schedule: (fn, ms) => { const id = Symbol(); timers.set(id, {fn, at: time + ms}); return id; }, cancel: id => timers.delete(id)});
  return {service, calls, scopes, projections, context, gate, timers,
    setTime(value) { time = value; }, async advance(ms) { time += ms; for (const [id, item] of [...timers]) if (item.at <= time) { timers.delete(id); item.fn(); } await drain(); }};
}

test('cross-realm rejecting projector is refused and its rejection is consumed', async () => {
  const foreign = runInNewContext('Promise.reject(new Error("private-foreign-projector-error"))');
  assert.equal(foreign instanceof Promise, false);
  const f = fixture({projectReply: () => foreign});
  assert.deepEqual(await f.service.handle(request(), sender()), unavailable);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.service.isIdle(), true);
});

test('worker requires shared owner, invoke and synchronous public projector composition', () => {
  for (const input of [{}, {ui: {withScope() {}}, invoke() {}}, {invoke() {}, projectReply() {}},
    {ui: {withScope() {}}, projectReply() {}}, {ui: {withScope() {}}, invoke() {}, projectReply() {}, maxPending: 0}]) {
    assert.throws(() => createProWorkerService(input), /pro-worker-owner-required/);
  }
});

test('all six exact actions use existing ui.withScope and keep context/private result worker-local', async () => {
  const f = fixture();
  for (const action of PRO_WORKER_ACTIONS) {
    assert.deepEqual(await f.service.handle(request(action, {operation: 'fixture'}), sender()), {ok: true, value: {state: 'ready', action}});
    const call = f.calls.at(-1), authorization = f.scopes.at(-1);
    assert.deepEqual(Object.keys(authorization).sort(), ['grantId', 'mountId', 'sender']);
    assert.equal(call.context, f.context); assert.equal(call.context.scopeGrantId, 'owner_private_grant');
    assert.equal(call.action, action); assert.deepEqual(call.payload, {operation: 'fixture'});
    assert.equal(call.signal.aborted, true, 'completed request retires its invocation signal');
    assert.equal(call.guard(), false, 'a completed request cannot authorize later work');
    assert.deepEqual(f.projections.at(-1).value, {privateIndex: {a: 'private'}});
    assert.equal(f.service.isIdle(), true);
  }
});

test('malformed envelope, unknown port and near-prefix requests never reach owner', async () => {
  const f = fixture(), invalid = [null, 'wire', {}, {...request(), type: 'HOST_UI_PRO_EXTRA'}, {...request(), v: 2},
    {...request(), grantId: {}}, {...request(), mountId: 'bad.token'}, {...request(), action: 'model'},
    {...request(), action: 'sharedSnapshot.read'}, {...request(), scopeKey: 'attacker'}, {...request(), payload: []},
    {...request(), payload: null}, {...request(), payload: undefined}];
  for (const message of invalid) assert.deepEqual(await f.service.handle(message, sender()), {ok: false, reason: 'invalid-pro-request'});
  for (const origin of [null, {}, {...sender(), documentId: null}, {...sender(), tab: {id: -1}}]) {
    assert.deepEqual(await f.service.handle(request(), origin), {ok: false, reason: 'invalid-pro-request'});
  }
  assert.equal(f.scopes.length, 0); assert.equal(f.calls.length, 0); assert.equal(f.service.isIdle(), true);
});

test('strict JSON rejects exotic/hidden/accessor/cyclic/sparse payloads without invoking getters', async () => {
  const f = fixture(); let getters = 0;
  const accessor = {}; Object.defineProperty(accessor, 'leak', {enumerable: true, get() { getters++; return 'secret'; }});
  const hidden = {}; Object.defineProperty(hidden, 'leak', {value: 'secret'});
  const cycle = {}; cycle.self = cycle;
  const sparse = []; sparse.length = 1; sparse.fake = 'not-a-real-slot';
  const symbol = {[Symbol('hidden')]: 1};
  const poisoned = JSON.parse('{"__proto__":{"granted":true}}');
  const values = [new Date(), new Map(), new Set(), new Uint8Array([1]), Infinity, NaN, 1n, undefined, () => {},
    Symbol('value'), accessor, hidden, cycle, sparse, symbol, poisoned, Object.create({inherited: true})];
  for (const value of values) assert.deepEqual(await f.service.handle(request('commit', {value}), sender()), {ok: false, reason: 'invalid-pro-request'});
  const rootGetter = {}; Object.defineProperty(rootGetter, 'type', {enumerable: true, get() { getters++; return 'HOST_UI_PRO'; }});
  assert.equal((await f.service.handle(rootGetter, sender())).ok, false);
  assert.equal(getters, 0); assert.equal(f.scopes.length, 0);
});

test('request byte bound is 64 KiB UTF-8 inclusive, not character count', async () => {
  const f = fixture(), message = request('view', {text: ''}), baseline = new TextEncoder().encode(JSON.stringify(message)).length;
  message.payload.text = 'x'.repeat(PRO_WORKER_MAX_BYTES - baseline);
  assert.equal((await f.service.handle(message, sender())).ok, true);
  message.payload.text += 'x'; assert.equal((await f.service.handle(message, sender())).reason, 'invalid-pro-request');
  message.payload.text = '中'.repeat(22000); assert.equal((await f.service.handle(message, sender())).reason, 'invalid-pro-request');
  assert.equal(f.calls.length, 1);
});

test('request and sender are detached before the first asynchronous authorization step', async () => {
  const gate = deferred(), f = fixture({withScope: async (_args, work, context) => { await gate.promise; return work(context); }});
  const message = request('commit', {name: 'before'}), origin = sender(), pending = f.service.handle(message, origin);
  message.payload.name = 'after'; origin.documentId = 'changed'; origin.tab.id = 2;
  gate.resolve(); assert.equal((await pending).ok, true);
  assert.equal(f.calls[0].payload.name, 'before'); assert.equal(f.scopes[0].sender.documentId, 'ui_fixture'); assert.equal(f.scopes[0].sender.tab.id, 1);
});

test('owner still verifies grant; caller scope data cannot supply semantic authorization', async () => {
  const f = fixture({withScope: async () => { throw Error('private-auth-reason'); }});
  const forged = request('commit', {scope: {verified: true, key: 'fixture_scope'}, grant: {serialized: true}});
  assert.deepEqual(await f.service.handle(forged, sender()), unavailable);
  assert.equal(f.scopes.length, 1); assert.equal(f.calls.length, 0); assert.equal(f.projections.length, 0);
});

test('inactive scope or wrong parent tab is rejected before invoking the port', async () => {
  for (const mode of ['inactive', 'tab', 'document', 'scope']) {
    const f = fixture();
    if (mode === 'inactive') f.gate.current = false;
    if (mode === 'tab') f.context.parentFrame.tabId = 2;
    if (mode === 'document') f.context.parentFrame.documentId = '';
    if (mode === 'scope') f.context.scope.key = '';
    assert.deepEqual(await f.service.handle(request(), sender()), unavailable);
    assert.equal(f.calls.length, 0); assert.equal(f.service.isIdle(), true);
  }
});

for (const kind of ['revokeDocument', 'revokeMount', 'revokeTab']) test(`pending authorization is promptly aborted by ${kind} and remains nonidle until settlement`, async () => {
  const gate = deferred(), f = fixture({withScope: async (_args, work, context) => { await gate.promise; return work(context); }});
  const pending = f.service.handle(request(), sender()); await drain();
  f.service[kind](kind === 'revokeDocument' ? 'parent_fixture' : kind === 'revokeMount' ? 'mount_fixture' : 1);
  assert.deepEqual(await pending, unavailable); assert.equal(f.service.isIdle(), false); assert.equal(f.calls.length, 0);
  gate.resolve(); await drain(); assert.equal(f.calls.length, 0); assert.equal(f.service.isIdle(), true);
});

for (const id of ['ui_fixture', 'parent_fixture']) test(`document revocation ${id} aborts in-flight invoke before any late private result`, async () => {
  const gate = deferred(), f = fixture({invoke: () => gate.promise}), pending = f.service.handle(request(), sender());
  await drain(); assert.equal(f.calls[0].guard(), true);
  f.service.revokeDocument(id); assert.equal(f.calls[0].signal.aborted, true); assert.equal(f.calls[0].guard(), false);
  assert.deepEqual(await pending, unavailable); assert.equal(f.service.isIdle(), false);
  gate.resolve({ok: true, value: {privateIndex: 'late private data'}}); await drain();
  assert.equal(f.projections.length, 0); assert.equal(f.service.isIdle(), true);
});

test('unrelated known document/mount/tab revocation does not abort an active scoped request', async () => {
  const gate = deferred(), f = fixture({invoke: () => gate.promise}), pending = f.service.handle(request(), sender());
  await drain(); f.service.revokeDocument('unrelated'); f.service.revokeMount('another_mount'); f.service.revokeTab(99);
  assert.equal(f.calls[0].signal.aborted, false); assert.equal(f.calls[0].guard(), true);
  gate.resolve({ok: true, value: {}}); assert.equal((await pending).ok, true);
});

test('mount and tab revocation also abort an already invoked request synchronously', async () => {
  for (const [method, id] of [['revokeMount', 'mount_fixture'], ['revokeTab', 1]]) {
    const gate = deferred(), f = fixture({invoke: () => gate.promise}), pending = f.service.handle(request(), sender());
    await drain(); f.service[method](id); assert.equal(f.calls[0].signal.aborted, true);
    assert.deepEqual(await pending, unavailable); gate.resolve({ok: true, value: {}}); await drain(); assert.equal(f.service.isIdle(), true);
  }
});

test('stop aborts first, rejects new work, and never claims idle after late settlement', async () => {
  const gate = deferred(), f = fixture({invoke: () => gate.promise}), pending = f.service.handle(request(), sender());
  await drain(); f.service.stop(); assert.equal(f.calls[0].signal.aborted, true); assert.equal(f.service.isIdle(), false);
  assert.deepEqual(await pending, unavailable); assert.deepEqual(await f.service.handle(request(), sender()), unavailable);
  gate.resolve({ok: true, value: {}}); await drain(); f.service.stop(); assert.equal(f.service.isIdle(), false); assert.equal(f.scopes.length, 1);
});

for (const outcome of ['resolve', 'reject']) test(`six-second deadline holds invoke activity until its late ${outcome}`, async () => {
  const gate = deferred(), f = fixture({invoke: () => gate.promise}), pending = f.service.handle(request(), sender());
  await drain(); await f.advance(5999); assert.equal(f.calls[0].signal.aborted, false); assert.equal(f.service.isIdle(), false);
  await f.advance(1); assert.deepEqual(await pending, unavailable); assert.equal(f.calls[0].signal.aborted, true); assert.equal(f.service.isIdle(), false);
  if (outcome === 'resolve') gate.resolve({ok: true, value: {privateIndex: 'late'}}); else gate.reject(Error('private-late-error'));
  await drain(); assert.equal(f.projections.length, 0); assert.equal(f.service.isIdle(), true); assert.equal(f.timers.size, 0);
});

test('a delayed timer cannot make an overdue invoke successful', async () => {
  const gate = deferred(), f = fixture({invoke: () => gate.promise}), pending = f.service.handle(request(), sender());
  await drain(); f.setTime(6001); gate.resolve({ok: true, value: {}});
  assert.deepEqual(await pending, unavailable); assert.equal(f.projections.length, 0); assert.equal(f.calls[0].signal.aborted, true);
});

test('clock rollback retires the request permanently', async () => {
  const gate = deferred(), f = fixture({invoke: () => gate.promise}), pending = f.service.handle(request(), sender());
  await drain(); f.setTime(10); assert.equal(f.calls[0].guard(), true); f.setTime(9); assert.equal(f.calls[0].guard(), false);
  f.setTime(11); assert.equal(f.calls[0].guard(), false); assert.deepEqual(await pending, unavailable);
  gate.resolve({ok: true, value: {}}); await drain(); assert.equal(f.service.isIdle(), true);
});

test('authority changed after invoke or during ui final revalidation never returns private results', async () => {
  for (const stage of ['invoke', 'final-validation']) {
    const gate = deferred();
    const f = fixture(stage === 'invoke' ? {invoke: async () => { await gate.promise; return {ok: true, value: {}}; }} :
      {withScope: async (_args, work, context) => { const value = await work(context); await gate.promise; return value; }});
    const pending = f.service.handle(request(), sender()); await drain(); f.gate.current = false; gate.resolve();
    assert.deepEqual(await pending, unavailable);
    assert.equal(f.projections.length, stage === 'invoke' ? 0 : 1); assert.equal(f.service.isIdle(), true);
  }
});

test('a failed current-scope guard aborts and cannot later revive the same invocation', async () => {
  const gate = deferred(), f = fixture({invoke: () => gate.promise}), pending = f.service.handle(request(), sender());
  await drain(); f.gate.current = false; assert.equal(f.calls[0].guard(), false); assert.equal(f.calls[0].signal.aborted, true);
  f.gate.current = true; assert.equal(f.calls[0].guard(), false); assert.deepEqual(await pending, unavailable);
  gate.resolve({ok: true, value: {}}); await drain(); assert.equal(f.projections.length, 0);
});

test('owner failure and exception text never reach public reply or public projector', async () => {
  for (const invoke of [async () => ({ok: false, reason: 'private-person-and-body', value: {leak: true}}),
    async () => { throw Error('private-person-and-body'); }]) {
    const f = fixture({invoke}); assert.deepEqual(await f.service.handle(request('commit'), sender()), unavailable); assert.equal(f.projections.length, 0);
  }
});

test('public projection blocks authority keys and full index even under innocuous nesting', async () => {
  const forbidden = ['grant', 'grantId', 'scopeGrantId', 'intent', 'ticket', 'credential', 'apiKey', 'handleMap', 'providerPayload',
    'privateIndex', 'completeIndex', 'metadataEvidence', 'evidencePack', 'selectedText', 'context', 'parentFrame', 'scope_grant_id'];
  for (const key of forbidden) {
    const f = fixture({projectReply: () => ({safe: {[key]: 'private'}})});
    assert.deepEqual(await f.service.handle(request('evidence'), sender()), unavailable, key);
  }
  for (const value of [{references: []}, {activities: []}, {refs: []}, {completeSnapshot: true}]) {
    const f = fixture({projectReply: () => value}); assert.deepEqual(await f.service.handle(request(), sender()), unavailable);
  }
  const f = fixture({projectReply: () => ({versions: {scopeKey: 'fixture_scope', authorizationEpoch: 1}, inventory: {refs: 3}, completeSnapshot: false})});
  assert.equal((await f.service.handle(request(), sender())).ok, true, 'version vectors and bounded inventory counts are public data, not authority');
});

test('actual projectProFrame and existing projectFreeFrame DTOs survive the RPC reply boundary', async () => {
  const owner = await createFixtureOwner({indexedDB: new MockIDBFactory(), databaseName: 'rpc-frame-compatibility', fixtureOnly: true});
  const controller = await createProController(owner);
  try {
    await controller.dispatch({type: 'CREATE_TOPIC', name: 'RPC 主主题'});
    await controller.dispatch({type: 'CREATE_TOPIC', name: 'RPC 关联主题'});
    const topics = Object.values(controller.getState().topics);
    await controller.dispatch({type: 'SET_PLACEMENT', refId: 'c_alpha', topicId: topics[0].id, role: 'primary'});
    await controller.dispatch({type: 'SET_PLACEMENT', refId: 'c_alpha', topicId: topics[1].id, role: 'related'});
    const proFrame = controller.getView();
    assert.equal(proFrame.native.protocol, 'vaiwl-free-frame/1'); assert.equal(proFrame.native.completeSnapshot, false);
    assert.equal(proFrame.overlay.protocol, 'vaiwl-pro-frame/1');
    assert(proFrame.overlay.cards.flatMap(card => card.rows).some(row => row.context === 'primary-topic'));
    assert(proFrame.overlay.cards.flatMap(card => card.rows).some(row => row.context === 'related-topic'));
    assert(proFrame.overlay.uncollected.some(row => row.context === 'uncollected'));
    const pass = async value => {
      const f = fixture({invoke: async () => ({ok: true, value}), projectReply: ({value}) => value});
      f.context.scope.key = controller.getState().scopeKey;
      assert.deepEqual(await f.service.handle(request(), sender()), {ok: true, value});
    };
    await pass(proFrame);
    await controller.setMode('native'); const freeFrame = controller.getView();
    assert.deepEqual(Object.keys(freeFrame), ['mode', 'native']); assert(freeFrame.native.entries.noProject.items.length > 0);
    await pass(freeFrame);
    for (const value of [{context: {scope: {key: 'private'}}}, {context: 'owner-scope'}, {Context: 'primary-topic'}]) {
      const f = fixture({projectReply: () => value}); assert.deepEqual(await f.service.handle(request(), sender()), unavailable);
    }
  } finally { controller.destroy(); }
});

test('public projection must be synchronous strict JSON and fit entire 64 KiB response', async () => {
  const baseline = new TextEncoder().encode(JSON.stringify({ok: true, value: {text: ''}})).length;
  const exact = fixture({projectReply: () => ({text: 'x'.repeat(PRO_WORKER_MAX_BYTES - baseline)})});
  assert.equal((await exact.service.handle(request(), sender())).ok, true);
  for (const projectReply of [() => ({text: 'x'.repeat(PRO_WORKER_MAX_BYTES - baseline + 1)}), () => Promise.resolve({safe: true}),
    () => Promise.reject(Error('private-async-projector-error')),
    () => ({notJSON: undefined}), () => { throw Error('private-codec-error'); }]) {
    const f = fixture({projectReply}); assert.deepEqual(await f.service.handle(request(), sender()), unavailable);
  }
});

test('UI scope wrapper cannot replace the approved projection with an unrelated response', async () => {
  const f = fixture({withScope: async (_args, work, context) => { await work(context); return {ok: true, value: 'private replacement'}; }});
  assert.deepEqual(await f.service.handle(request(), sender()), unavailable);
});

test('expired unresolved work still consumes bounded admission capacity', async () => {
  const gate = deferred(), f = fixture({maxPending: 1, invoke: () => gate.promise}), pending = f.service.handle(request(), sender());
  await drain(); await f.advance(6000); assert.deepEqual(await pending, unavailable);
  assert.deepEqual(await f.service.handle(request(), sender()), {ok: false, reason: 'pro-request-capacity'}); assert.equal(f.scopes.length, 1);
  gate.resolve({ok: true, value: {}}); await drain(); assert.equal(f.service.isIdle(), true);
  assert.equal((await f.service.handle(request(), sender())).ok, true); assert.equal(f.scopes.length, 2);
});
