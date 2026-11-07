import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIResponsesAdapter, buildOpenAIRequest, OPENAI_RESPONSES_ENDPOINT, PROVIDER_ADAPTER_STATUS} from '../../src/pro/model/openai-responses.mjs';

const payload = () => ({schema: 'vaiwl-pro-provider-input/1', requestNonce: 'synthetic_nonce',
  items: [{handle: 'c_fixture', approvedTitle: '数值积分核对', approvedAliases: [], approvedText: []}],
  candidateTopics: [{handle: 't_fixture', approvedName: '数值积分', approvedIntentSummary: null}],
  allowedOperations: ['classify', 'name', 'propose-topic'], outputSchemaVersion: 'vaiwl-pro-model-output/1'});
const profile = () => ({id: 'offline_provider_fixture', providerProfileId: 'openai-responses', frozenModelVersion: 'not-a-live-model-fixture',
  promptVersion: 'fixture_prompt', outputSchemaVersion: 'vaiwl-pro-model-output/1', inputKinds: ['metadata'], maxInputTokens: 32768,
  maxOutputTokens: 1024, maxUtf8Bytes: 32768, priceCardVersion: 'noncommercial_fixture_prices', qualityGateReference: null});
const output = () => ({schemaVersion: 'vaiwl-pro-model-output/1', requestNonce: 'synthetic_nonce', items: [{kind: 'EXISTING',
  conversationHandle: 'c_fixture', topicHandle: 't_fixture', titleSuggestion: null, evidenceHandles: ['c_fixture'], reason: 'same-object-goal', explanation: '离线协议测试。'}]});
const response = (raw = {status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(output())}]}], usage: {input_tokens: 100, output_tokens: 80}}) =>
  new Response(JSON.stringify(raw), {status: 200, headers: {'content-type': 'application/json', 'x-request-id': 'fixture_request'}});

test('cloud provider remains disabled and zero transport/key calls occur by default', async () => {
  let calls = 0;
  const adapter = createOpenAIResponsesAdapter({profile: profile(), transport() { calls++; }, authorizeDispatch() { calls++; }});
  assert.equal((await adapter.execute({}, payload())).state, 'not-dispatched'); assert.equal(calls, 0);
  assert.equal(PROVIDER_ADAPTER_STATUS.productionEnabled, false); assert.equal(PROVIDER_ADAPTER_STATUS.liveCallsRun, false);
  assert.throws(() => createOpenAIResponsesAdapter({enabled: true}), /owner-execution-port-required/);
});

test('fixed HTTPS Responses transport is bounded, no tools/store/stream, only approved payload', async () => {
  let observed, authContext;
  const adapter = createOpenAIResponsesAdapter({enabled: true, profile: profile(),
    authorizeDispatch: async (_ticket, context) => { authContext = context; return {ok: true, apiKey: 'test-only-not-a-real-key'}; },
    transport: async (url, options) => { observed = {url, options}; return response(); }});
  const result = await adapter.execute({}, payload()); assert.equal(result.state, 'complete'); assert.deepEqual(result.json, output());
  assert.equal(observed.url, OPENAI_RESPONSES_ENDPOINT); assert.equal(observed.options.redirect, 'error'); assert.equal(observed.options.credentials, 'omit');
  const body = JSON.parse(observed.options.body);
  assert.equal(body.store, false); assert.equal(body.background, false); assert.equal(body.stream, false); assert.deepEqual(body.tools, []);
  assert.equal(body.max_output_tokens, 1024); assert.equal(body.text.format.strict, true); assert.equal(body.model, profile().frozenModelVersion);
  assert.equal(observed.options.body.includes('test-only-not-a-real-key'), false); assert.equal(authContext.endpointProfile, 'openai-responses');
  assert.ok(authContext.inputTokenUpperBound >= Buffer.byteLength(observed.options.body));
  assert.deepEqual(result.usage, {inputTokens: 100, outputTokens: 80});
});

test('same one-use RAM ticket cannot race or be replayed after a completed dispatch', async () => {
  let sends = 0, authorizations = 0;
  const adapter = createOpenAIResponsesAdapter({enabled: true, profile: profile(),
    authorizeDispatch: async () => { authorizations++; await Promise.resolve(); return {ok: true, apiKey: 'fixture-secret-only'}; },
    transport: async () => { sends++; return response(); }});
  const ticket = {};
  const outcomes = await Promise.all([adapter.execute(ticket, payload()), adapter.execute(ticket, payload())]);
  assert.equal(outcomes.filter(outcome => outcome.state === 'complete').length, 1); assert.equal(sends, 1); assert.equal(authorizations, 1);
  assert.equal((await adapter.execute(ticket, payload())).state, 'not-dispatched'); assert.equal(sends, 1);
});

test('no key authorization on malformed/oversized input and no caller endpoint override', async () => {
  let calls = 0;
  const adapter = createOpenAIResponsesAdapter({enabled: true, profile: profile(), authorizeDispatch: async () => { calls++; return {ok: false}; }, transport: async () => { calls++; return response(); }});
  assert.equal((await adapter.execute({}, {...payload(), endpoint: 'https://evil.invalid'})).state, 'not-dispatched');
  assert.equal(calls, 0);
  const p = payload(); p.items[0].approvedTitle = 'x'.repeat(500); assert.equal((await adapter.execute({}, p)).state, 'not-dispatched'); assert.equal(calls, 0);
  assert.throws(() => buildOpenAIRequest(payload(), {...profile(), maxInputTokens: 100}), /provider-input-token-bound/);
  assert.throws(() => buildOpenAIRequest(payload(), {...profile(), priceCardVersion: null}), /unconfigured-provider-profile/);
});

for (const [name, factory, expected] of [
  ['refusal', () => response({status: 'completed', output: [{type: 'message', content: [{type: 'refusal', refusal: 'refused'}]}]}), 'refusal'],
  ['truncation', () => response({status: 'incomplete', incomplete_details: {reason: 'max_output_tokens'}}), 'truncated'],
  ['rate limit', () => new Response('{}', {status: 429}), 'outcome-unknown'],
  ['broken JSON', () => new Response('{bad', {status: 200}), 'outcome-unknown'],
  ['oversized response', () => new Response('x'.repeat(140000), {status: 200}), 'outcome-unknown'],
  ['unexpected usage', () => response({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(output())}]}], usage: {input_tokens: 100, output_tokens: 99999}}), 'outcome-unknown'],
  ['redirected endpoint', () => ({ok: true, url: 'https://other.invalid', headers: new Headers(), text: async () => '{}'}), 'outcome-unknown'],
]) test('A23/A25 ' + name + ' makes one bounded attempt and cannot auto-retry', async () => {
  let sends = 0;
  const adapter = createOpenAIResponsesAdapter({enabled: true, profile: profile(), authorizeDispatch: async () => ({ok: true, apiKey: 'fixture-secret-only'}),
    transport: async () => { sends++; return factory(); }});
  const ticket = {}; assert.equal((await adapter.execute(ticket, payload())).state, expected); assert.equal(sends, 1);
  assert.equal((await adapter.execute(ticket, payload())).state, 'not-dispatched'); assert.equal(sends, 1);
});

test('abort before dispatch has no side effect; abort or throw after marker holds uncertainty', async () => {
  let calls = 0;
  const signal = new AbortController(); signal.abort();
  const adapter = createOpenAIResponsesAdapter({enabled: true, profile: profile(), authorizeDispatch: async () => ({ok: true, apiKey: 'fixture-secret-only'}), transport: async () => { calls++; throw Error('transport-lost'); }});
  assert.equal((await adapter.execute({}, payload(), signal.signal)).state, 'not-dispatched'); assert.equal(calls, 0);
  assert.equal((await adapter.execute({}, payload())).state, 'outcome-unknown'); assert.equal(calls, 1);
});
