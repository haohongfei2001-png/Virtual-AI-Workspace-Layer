import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../src/data/hash.mjs';
import {emptyOverlay, validateProposal} from '../../src/pro/domain/index.mjs';
import {prepareMetadataEvidence, authorizeContentPack, buildProviderPayload, validateModelOutput, runLocalSuggestions,
  planSuggestions, recallTopics, incrementalCacheKey, createSuggestionCache, semanticActionDigest, automaticGate} from '../../src/pro/organize/index.mjs';

function setup() {
  const scope = {kind: 'verified-scope', key: 'scope_fixture', serverIdentity: 'established', persistence: 'same-idb'};
  const versions = {scopeKey: scope.key, authorizationEpoch: 1, sourceGeneration: {source_fixture: 1}, nativeFields: {c_a: 1, c_b: 1, c_u: 1},
    overlayRevision: 0, targets: {}, constraintRevision: 0, policyVersion: 'p1', evidenceDigest: digest('fixture_evidence')};
  const overlay = emptyOverlay(scope.key);
  const control = {mode: 'automatic', locked: false, revision: 0, lastHumanOperation: null};
  overlay.topics.t_a = {id: 't_a', scopeKey: scope.key, name: '数值积分', aliases: [], icon: '◇', intent: null,
    nameControl: {...control, mode: 'human', locked: true}, membershipControl: control, lifecycle: 'active', createdBy: 'human', revision: 0};
  const ref = (id, title, membership) => ({id, nativeTitle: title, nativeUrl: 'https://chatgpt.com/c/' + id, membership, available: true,
    freshness: 'current', nativeRevision: 1, sourceIds: ['source_fixture']});
  const references = [ref('c_a', '数值积分参数核对', {state: 'NONE', evidenceId: 'none_a', revision: 1}),
    ref('c_b', '项目甲：官网文案', {state: 'NONE', evidenceId: 'none_b', revision: 1}),
    ref('c_u', '数值积分未核验', {state: 'UNKNOWN', reason: 'not-proven', revision: 1})];
  const capabilities = {scope, metadata: 'available', positiveNone: 'available', selectedText: 'unavailable', sentUserInput: 'unavailable', historicalCompleteness: 'partial', reasonCodes: []};
  const consent = {mode: 'local', revision: 0, inputKinds: ['metadata'], maxMemoryMiB: 32, maxDownloadMiB: 0};
  return {scope, versions, overlay, references, capabilities, consent};
}
const evidence = fixture => prepareMetadataEvidence(fixture);
const existingReply = payload => ({state: 'complete', json: {schemaVersion: 'vaiwl-pro-model-output/1', requestNonce: payload.requestNonce,
  items: [{kind: 'EXISTING', conversationHandle: payload.items[0].handle, topicHandle: payload.candidateTopics[0].handle,
    titleSuggestion: null, evidenceHandles: [payload.items[0].handle], reason: 'same-object-goal', explanation: '标题明确包含积分任务。'}]}, providerRequestId: null, usage: null});

test('A01/A03 metadata pipeline accepts positive NONE only and never fabricates body or membership', async () => {
  const fixture = setup(), before = structuredClone(fixture);
  const pack = evidence(fixture);
  assert.deepEqual(pack.references.map(ref => ref.id), ['c_a', 'c_b']);
  assert.equal('content' in pack, false); assert.ok(pack.missing.includes('body')); assert.ok(pack.missing.includes('membership'));
  const result = await runLocalSuggestions({pack, overlay: fixture.overlay});
  assert.equal(result.adapter, 'fixture-rules'); assert.equal(result.quality, 'not-evaluated');
  assert.ok(result.proposals.some(p => p.kind === 'existing-topic' && p.refId === 'c_a'));
  assert.ok(result.proposals.some(p => p.kind === 'new-topic' && p.members.includes('c_b')));
  assert.ok(result.proposals.every(p => p.qualityBand === 'review')); result.proposals.forEach(validateProposal);
  assert.deepEqual(fixture, before);
});

test('capability missing cannot be replaced by checkbox, URL, permission field or cloud membership', async () => {
  const fixture = setup(); fixture.capabilities.positiveNone = 'unavailable';
  const pack = evidence(fixture);
  assert.equal(pack.metadata.length, 0); assert.deepEqual((await runLocalSuggestions({pack, overlay: fixture.overlay})).proposals, []);
  fixture.capabilities.metadata = 'unavailable'; assert.throws(() => evidence(fixture), /metadata-not-authorized/);
  fixture.capabilities.metadata = 'available'; fixture.consent.mode = 'off'; assert.throws(() => evidence(fixture), /metadata-not-authorized/);
});

test('A04 Browser Local session is metadata-only memory and cannot send cloud jobs', () => {
  const fixture = setup(); fixture.scope = {kind: 'browser-local-session', key: fixture.scope.key, serverIdentity: 'not-established', persistence: 'memory'};
  fixture.capabilities.scope = fixture.scope;
  const pack = evidence(fixture); assert.equal(pack.scope.persistence, 'memory');
  assert.throws(() => authorizeContentPack(pack, [], {capabilities: fixture.capabilities, consent: fixture.consent}), /browser-local-content-unavailable/);
  fixture.consent.mode = 'cloud'; assert.throws(() => evidence(fixture), /session-cloud-denied/);
});

test('A09 excluded references do not reach payload; available assets remain untouched', () => {
  const fixture = setup(); fixture.overlay.constraints.no_ai = {kind: 'exclude-ai-processing', refId: 'c_a', revision: 1, operationId: 'op_fixture'};
  const pack = evidence(fixture); assert.deepEqual(pack.references.map(ref => ref.id), ['c_b']);
  assert.equal(fixture.references.length, 3); assert.equal(fixture.overlay.topics.t_a.name, '数值积分');
});

test('selected cross-Project is explicit and UNKNOWN remains excluded', () => {
  const fixture = setup(); fixture.references[1].membership = {state: 'PROJECT', projectId: 'project_a', evidenceId: 'project_e', revision: 2};
  assert.deepEqual(evidence(fixture).references.map(r => r.id), ['c_a']);
  assert.deepEqual(prepareMetadataEvidence({...fixture, mode: 'pro-cross-project', selectedProjectIds: ['project_a']}).references.map(r => r.id), ['c_a', 'c_b']);
});

test('provider receives job-scoped handles and approved fields only', () => {
  const fixture = setup(), pack = evidence(fixture);
  const one = buildProviderPayload(pack, fixture.overlay), two = buildProviderPayload(pack, fixture.overlay);
  assert.notEqual(one.payload.requestNonce, two.payload.requestNonce); assert.notEqual(one.payload.items[0].handle, two.payload.items[0].handle);
  const wire = JSON.stringify(one.payload);
  for (const privateData of ['scope_fixture', 'source_fixture', '"c_a"', '"c_b"', 'none_a', 'chatgpt.com', 'authorizationEpoch', 'grant']) assert.equal(wire.includes(privateData), false);
  assert.deepEqual(Object.keys(one.payload.items[0]).sort(), ['approvedAliases', 'approvedText', 'approvedTitle', 'handle']);
  const reply = existingReply(one.payload), validated = validateModelOutput(reply, {...one, pack, overlay: fixture.overlay, currentVersions: fixture.versions});
  assert.equal(validated[0].refId, 'c_a'); assert.equal(validated[0].topicId, 't_a'); assert.ok(validated[0].evidenceIds[0].startsWith('meta_'));
});

test('A22 citations are own title or exact same-ref content; unrelated evidence is rejected', () => {
  const fixture = setup(), pack = evidence(fixture), built = buildProviderPayload(pack, fixture.overlay), reply = existingReply(built.payload);
  reply.json.items[0].evidenceHandles = [built.payload.items[1].handle];
  assert.throws(() => validateModelOutput(reply, {...built, pack, overlay: fixture.overlay, currentVersions: fixture.versions}), /unknown-evidence-handle/);
  const full = authorizeContentPack(pack, [{kind: 'explicit-selected-text', evidenceId: 'e_text', refId: 'c_a', text: '数值积分参数', role: 'user', anchor: {kind: 'unanchored', reason: 'explicit_selection'}}],
    {capabilities: {...fixture.capabilities, selectedText: 'available'}, consent: {...fixture.consent, inputKinds: ['metadata', 'selected-text']}});
  const contentBuilt = buildProviderPayload(full, fixture.overlay), contentReply = existingReply(contentBuilt.payload);
  contentReply.json.items[0].evidenceHandles = [contentBuilt.payload.items[0].approvedText[0].evidenceHandle];
  assert.deepEqual(validateModelOutput(contentReply, {...contentBuilt, pack: full, overlay: fixture.overlay, currentVersions: fixture.versions})[0].evidenceIds, ['e_text']);
});

for (const [name, mutate, reason] of [
  ['wrong nonce', (reply) => { reply.json.requestNonce = 'different_nonce'; }, /request-mismatch/],
  ['unknown topic', (reply) => { reply.json.items[0].topicHandle = 't_not_in_input'; }, /unknown-topic-handle/],
  ['unknown conversation', (reply) => { reply.json.items[0].conversationHandle = 'c_not_in_input'; }, /unknown-conversation-handle/],
  ['duplicate conversation', (reply) => { reply.json.items.push(structuredClone(reply.json.items[0])); }, /duplicate-conversation-result/],
  ['duplicate evidence', (reply) => { reply.json.items[0].evidenceHandles.push(reply.json.items[0].evidenceHandles[0]); }, /duplicate-evidence-handle/],
  ['refusal', (reply) => { reply.state = 'refusal'; }, /model-refusal/],
  ['truncated', (reply) => { reply.state = 'truncated'; }, /model-truncated/],
]) test('A22/A23 runtime rejects ' + name + ' without producing any plan', () => {
  const fixture = setup(), before = structuredClone(fixture.overlay), pack = evidence(fixture), built = buildProviderPayload(pack, fixture.overlay), reply = existingReply(built.payload);
  mutate(reply);
  assert.throws(() => validateModelOutput(reply, {...built, pack, overlay: fixture.overlay, currentVersions: fixture.versions}), reason);
  assert.deepEqual(fixture.overlay, before);
});

test('payload mutation and newer overlay cannot be substituted into a prior model job', () => {
  const fixture = setup(), pack = evidence(fixture), built = buildProviderPayload(pack, fixture.overlay), reply = existingReply(built.payload);
  const changed = structuredClone(built.payload); changed.items[0].approvedTitle = '别的资料';
  assert.throws(() => validateModelOutput(reply, {...built, payload: changed, pack, overlay: fixture.overlay, currentVersions: fixture.versions}), /request-mismatch/);
  fixture.overlay.revision = 1;
  assert.throws(() => validateModelOutput(reply, {...built, pack, overlay: fixture.overlay, currentVersions: fixture.versions}), /stale-overlay/);
});

test('A05/A21 fresh version fence rejects scope/revocation/native membership change', () => {
  const fixture = setup(), pack = evidence(fixture), built = buildProviderPayload(pack, fixture.overlay), reply = existingReply(built.payload);
  for (const update of [{authorizationEpoch: 2}, {sourceGeneration: {source_fixture: 2}}, {constraintRevision: 1}, {scopeKey: 'other_scope'}]) {
    assert.throws(() => validateModelOutput(reply, {...built, pack, overlay: fixture.overlay, currentVersions: {...fixture.versions, ...update}}), /stale-input/);
  }
  const currentReferences = structuredClone(pack.references); currentReferences[0].membership = {state: 'PROJECT', projectId: 'p_real', evidenceId: 'e_project', revision: 2};
  assert.throws(() => validateModelOutput(reply, {...built, pack, overlay: fixture.overlay, currentVersions: fixture.versions, currentReferences}), /stale-native-reference/);
});

test('A06/A07 human title remains protected even unlocked; model cannot invent entities or versions', () => {
  const fixture = setup(), pack = evidence(fixture), built = buildProviderPayload(pack, fixture.overlay), reply = existingReply(built.payload);
  fixture.overlay.titles.c_a = {conversationId: 'c_a', title: '人工积分标题', aliases: [], displayPreference: 'derived',
    control: {mode: 'human', locked: false, revision: 1, lastHumanOperation: 'rename'}, evidenceIds: [], revision: 1};
  reply.json.items[0].titleSuggestion = '数值积分参数';
  assert.throws(() => validateModelOutput(reply, {...built, pack, overlay: fixture.overlay, currentVersions: fixture.versions}), /human-title-protected/);
  delete fixture.overlay.titles.c_a; reply.json.items[0].titleSuggestion = '数值积分 v2.10 参数';
  assert.throws(() => validateModelOutput(reply, {...built, pack, overlay: fixture.overlay, currentVersions: fixture.versions}), /unsupported-title-evidence/);
});

test('A08 hard pair exclusions survive newer evidence and model output', () => {
  const fixture = setup(), pack = evidence(fixture), built = buildProviderPayload(pack, fixture.overlay), reply = existingReply(built.payload);
  fixture.overlay.constraints.exclude = {kind: 'exclude-topic', refId: 'c_a', topicId: 't_a', revision: 1, operationId: 'exclude'};
  assert.throws(() => validateModelOutput(reply, {...built, pack, overlay: fixture.overlay, currentVersions: fixture.versions}), /hard-pair-exclusion/);
  assert.deepEqual(recallTopics(fixture.references[0], fixture.overlay), []);
});

test('rejection fingerprint ignores model/nonce; metadata spelling changes do not defeat target rejection', async () => {
  const fixture = setup(), pack = evidence(fixture), first = await runLocalSuggestions({pack, overlay: fixture.overlay});
  const p = first.proposals.find(p => p.kind === 'existing-topic');
  const second = await runLocalSuggestions({pack, overlay: fixture.overlay});
  assert.equal(second.proposals.find(p => p.kind === 'existing-topic').fingerprint, p.fingerprint);
  fixture.overlay.constraints.reject = {kind: 'reject-proposal', proposalFingerprint: p.fingerprint, evidenceDigest: fixture.versions.evidenceDigest,
    targetDigest: semanticActionDigest(p), revision: 1, operationId: 'reject'};
  fixture.references[0].nativeTitle += '（稍后继续）';
  const changedPack = evidence(fixture), changed = await runLocalSuggestions({pack: changedPack, overlay: fixture.overlay});
  assert.equal(changed.proposals.some(p => p.kind === 'existing-topic'), false);
  assert.ok(changed.diagnostics.some(item => item.reason === 'previously-rejected'));
});

test('A12/A14 each auto lane needs actual quality and first round stays preview', async () => {
  const fixture = setup(), pack = evidence(fixture), result = await runLocalSuggestions({pack, overlay: fixture.overlay});
  const proposal = result.proposals[0];
  assert.equal(automaticGate(proposal, {overlay: fixture.overlay, pack, firstRun: false, autoRequested: true}).eligible, false);
  const model = {profileId: 'model_fixture', modelVersion: 'snapshot', promptVersion: 'prompt1', outputSchemaVersion: 'vaiwl-pro-model-output/1'};
  const quality = {approvedByOwner: true, report: {status: 'evaluated-unapproved', naturalSampleCount: 1000, leakage: false,
    mandatoryCounterexamplesPassed: true, modelBinding: model, lanes: {'existing-topic': {qualified: true}, 'new-topic': {qualified: false}}}};
  assert.equal(automaticGate(proposal, {overlay: fixture.overlay, pack, quality, modelProfile: model, firstRun: true, autoRequested: true}).eligible, false);
  assert.equal(automaticGate(proposal, {overlay: fixture.overlay, pack, quality, modelProfile: model, firstRun: false, autoRequested: true}).eligible, true);
  const newProposal = result.proposals.find(p => p.kind === 'new-topic');
  assert.equal(automaticGate(newProposal, {overlay: fixture.overlay, pack, quality, modelProfile: model, firstRun: false, autoRequested: true}).eligible, false);
  fixture.overlay.placements.p = {conversationId: proposal.refId, topicId: 'another', role: 'primary', state: 'included'};
  assert.equal(automaticGate(proposal, {overlay: fixture.overlay, pack, quality, modelProfile: model, firstRun: false, autoRequested: true}).eligible, false);
});

test('local recall respects bounds and distinguishes integer tuple version tokens', () => {
  const fixture = setup();
  for (let i = 0; i < 50; i++) fixture.overlay.topics['t_' + i] = {...fixture.overlay.topics.t_a, id: 't_' + i, name: '数值积分 ' + i};
  assert.equal(recallTopics(fixture.references[0], fixture.overlay).length, 20);
  assert.throws(() => recallTopics(fixture.references[0], fixture.overlay, {limit: 21}), /invalid-integer/);
});

test('cache uses epoch/source/model/targets and clearing a scope removes accepted cache', () => {
  const fixture = setup(), pack = evidence(fixture), args = {pack, modelProfile: {id: 'model1'}, policyVersion: 'policy1', targetVersions: {t_a: 1}};
  const key = incrementalCacheKey(args), cache = createSuggestionCache(2);
  cache.set(key, fixture.scope.key, 1, {proposals: []}); assert.deepEqual(cache.get(key, fixture.scope.key, 1), {proposals: []});
  assert.equal(cache.get(key, 'other', 1), null); assert.equal(cache.get(key, fixture.scope.key, 2), null);
  assert.notEqual(incrementalCacheKey({...args, modelProfile: {id: 'model2'}}), key);
  assert.notEqual(incrementalCacheKey({...args, targetVersions: {t_a: 2}}), key);
  cache.revoke(fixture.scope.key); assert.equal(cache.get(key, fixture.scope.key, 1), null);
});
