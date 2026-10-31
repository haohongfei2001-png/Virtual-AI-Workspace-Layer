import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../src/data/hash.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {emptyOverlay, validateProposal, registerProposal, planTransaction} from '../../src/pro/domain/index.mjs';
import {prepareMetadataEvidence, runLocalMetadataSuggestions, buildProviderPayload, validateModelOutput, validateQualityReport, automaticGate} from '../../src/pro/organize/index.mjs';
import {syntheticQualityFixture as arithmeticQuality} from './support/synthetic-quality.mjs';
import {createOrganizeService} from '../../src/pro/jobs/organize-service.mjs';
import {createSameDatabaseBillingStore} from '../../src/pro/integration/billing-store.mjs';
import {createModelBudgetOwner} from '../../src/pro/integration/model-budget.mjs';
import {createProductionModelBridge} from '../../src/pro/integration/model-bridge.mjs';
import {validateModelProfile, validateModelConfiguration} from '../../src/pro/model/configuration.mjs';
import {createOpenAIResponsesAdapter} from '../../src/pro/model/openai-responses.mjs';
import {createLocalMetadataAdapter} from '../../src/pro/model/local-metadata.mjs';
import {queueJob, transitionJob, admitJob} from '../../src/pro/jobs/lifecycle.mjs';
import {emptyBudgetLedger, configureBudgetPolicies, reserveBudget, markBudgetDispatched, settleReservation, releaseReservation,
  archiveFinalizedReservations, budgetSummary} from '../../src/pro/jobs/budget.mjs';

// Original synthetic metadata only. No source account, natural benchmark,
// provider key or real network is involved in these counterexamples.
const NOW = '2026-11-01T10:00:00.000Z';
const scope = {kind: 'verified-scope', key: 'ai_service_synthetic_scope', serverIdentity: 'established', persistence: 'same-idb'};
const profile = () => ({id: 'synthetic_profile', providerProfileId: 'openai-responses', frozenModelVersion: 'synthetic_model',
  promptVersion: 'synthetic_prompt', outputSchemaVersion: 'vaiwl-pro-model-output/1', inputKinds: ['metadata'],
  maxInputTokens: 32768, maxOutputTokens: 1024, maxUtf8Bytes: 32768, priceCardVersion: 'synthetic_prices', qualityGateReference: null});
const priceCard = () => ({version: 'synthetic_prices', currency: 'USD', providerProfileId: 'openai-responses',
  inputPerMillion: '0.01', outputPerMillion: '0.02', validFrom: '2026-11-01T00:00:00Z', validThrough: '2026-11-30T23:59:59Z', otherMaximumMicros: 0});
const config = () => ({schema: 'vaiwl-pro-model-configuration/1', profile: profile(), priceCard: priceCard(), billingProfileId: 'synthetic_billing', maxChargePerTaskMicros: 100000});
const policy = (id = 'month', ceiling = 100000) => ({id, billingProfileId: 'synthetic_billing', appliesTo: {kind: 'installation-total'},
  currency: 'USD', scale: 6, ceiling, window: {from: '2026-11-01T00:00:00Z', through: '2026-11-30T23:59:59Z'},
  providerProfileId: 'openai-responses', pricingVersion: 'synthetic_prices', revision: 1});
const binding = () => ({modelProfileId: 'synthetic_profile', modelVersion: 'synthetic_model', promptVersion: 'synthetic_prompt', outputSchemaVersion: 'vaiwl-pro-model-output/1', priceCardVersion: 'synthetic_prices'});
function data() {
  const overlay = emptyOverlay(scope.key), control = {mode: 'automatic', locked: false, revision: 0, lastHumanOperation: null};
  overlay.topics.t_integral = {id: 't_integral', scopeKey: scope.key, name: '数值积分', aliases: [], icon: '◇', intent: null,
    nameControl: {...control, mode: 'human', locked: true}, membershipControl: control, lifecycle: 'active', createdBy: 'human', revision: 0};
  const references = [{id: 'c_integral', nativeTitle: '数值积分参数核对', nativeUrl: 'https://fixture.invalid/c/integral',
    membership: {state: 'NONE', evidenceId: 'synthetic_none', revision: 1}, available: true, freshness: 'current', nativeRevision: 1, sourceIds: ['synthetic_source']}];
  const versions = {scopeKey: scope.key, authorizationEpoch: 1, sourceGeneration: {synthetic: 1}, nativeFields: {c_integral: 1},
    overlayRevision: 0, targets: {}, constraintRevision: 0, policyVersion: 'synthetic_policy', evidenceDigest: digest(references)};
  const capabilities = {scope, metadata: 'available', positiveNone: 'available', selectedText: 'unavailable', sentUserInput: 'unavailable', historicalCompleteness: 'partial', reasonCodes: []};
  const consent = {mode: 'cloud', inputKinds: ['metadata'], revision: 1};
  const context = () => ({pack: prepareMetadataEvidence({scope, references, versions, overlay, capabilities, consent}),
    overlay: structuredClone(overlay), currentVersions: structuredClone(versions), mode: 'pro-default-none', processing: 'cloud', foregroundBusy: false, backgroundWhileNative: false});
  return {overlay, references, versions, capabilities, consent, context};
}
const completed = (payload, {wrongHandle = false, usage = true} = {}) => new Response(JSON.stringify({status: 'completed',
  output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({schemaVersion: 'vaiwl-pro-model-output/1', requestNonce: payload.requestNonce,
    items: [{kind: 'EXISTING', conversationHandle: payload.items[0].handle, topicHandle: wrongHandle ? 't_unseen' : payload.candidateTopics[0].handle,
      titleSuggestion: null, evidenceHandles: [payload.items[0].handle], reason: 'same-object-goal', explanation: '仅合成协议验证。'}]})}]}],
  ...(usage ? {usage: {input_tokens: 100, output_tokens: 20}} : {})}), {status: 200});

async function fixture({configureBudget = true, behavior = null, timeoutMs = 1000, configuration = config(), authorize = null, registration = null, wrapStore = null, clock = () => NOW} = {}) {
  const source = data(), database = new ScopeRepository({indexedDB: new MockIDBFactory(), databaseName: 'ai_service_' + crypto.randomUUID()});
  const db = await database.open(), token = Object.freeze({synthetic: true}); let authorized = true, calls = 0, registrations = 0, authorizations = 0;
  const store = createSameDatabaseBillingStore({connection: async () => db, enabled: true, clock,
    verifyAuthority(value) { if (value !== token || !authorized) throw Error('authority-revoked'); return scope; }});
  if (configureBudget) assert.equal((await store.transact(token, {operationId: 'init', expectedRevision: 0, command: {type: 'CONFIGURE_POLICIES', policies: [policy()]}})).ok, true);
  const options = {enabled: true, configuration, billingStore: wrapStore ? wrapStore(store) : store, timeoutMs, clock,
    getContext(value) { if (value !== token || !authorized) throw Error('authority-revoked'); return source.context(); },
    authorizeDispatch: async (value, metadata, signal) => { authorizations++; if (value !== token || !authorized) throw Error('authority-revoked');
      const approved = authorize ? await authorize({source, metadata, signal}) : null; return approved ?? {ok: true, apiKey: 'synthetic-not-a-secret'}; },
    transport: async (_url, options) => { calls++; const payload = JSON.parse(JSON.parse(options.body).input[1].content);
      return behavior ? behavior({source, payload, options}) : completed(payload); },
    registerProposals: async (_authority, request, signal) => { if (signal.aborted || !authorized) throw Error('authority-revoked');
      if (registration) return registration({source, request, signal});
      registrations++; for (const proposal of request.proposals) { validateProposal(proposal); Object.assign(source.overlay, registerProposal(source.overlay, proposal)); } return {ok: true}; }};
  const service = createOrganizeService(options);
  return {source, token, store, service, connection: () => db, reopen: (overrides = {}) => createOrganizeService({...options, ...overrides}), get calls() { return calls; }, get registrations() { return registrations; }, get authorizations() { return authorizations; },
    revoke() { authorized = false; service.revoke(scope.key); }, close() { service.stop(); database.close(); }};
}

test('model configuration rejects unknown input/secret/endpoint fields and requires current matched price', () => {
  assert.equal(validateModelConfiguration(config(), NOW).profile.frozenModelVersion, 'synthetic_model');
  for (const bad of [{...profile(), inputKinds: ['metadata', 'cookies']}, {...profile(), inputKinds: ['metadata', 'metadata']},
    {...profile(), qualityGateReference: {}}, {...profile(), maxOutputTokens: 1}]) assert.throws(() => validateModelProfile(bad));
  assert.throws(() => validateModelConfiguration({...config(), apiKey: 'never-store-here'}, NOW), /invalid-schema/);
  assert.throws(() => validateModelConfiguration({...config(), priceCard: {...priceCard(), version: 'wrong'}}, NOW), /model-price-card-mismatch/);
  assert.throws(() => validateModelConfiguration(config(), '2027-01-01T00:00:00Z'), /price-card-not-current/);
});

test('adapter captures its frozen profile before a caller changes model/settings', async () => {
  const p = profile(), source = data(), {payload} = buildProviderPayload(source.context().pack, source.overlay); let requestedModel;
  const adapter = createOpenAIResponsesAdapter({enabled: true, profile: p, authorizeDispatch: async () => ({ok: true, apiKey: 'synthetic-only'}),
    transport: async (_url, options) => { requestedModel = JSON.parse(options.body).model; return completed(payload); }});
  p.frozenModelVersion = 'changed_after_configuration';
  assert.equal((await adapter.execute({}, payload)).state, 'complete'); assert.equal(requestedModel, 'synthetic_model');
});

test('local production rules handle Chinese names/new intent/ambiguity/version and stay review-only', async () => {
  const source = data(), before = structuredClone(source.overlay);
  const res = await runLocalMetadataSuggestions({pack: source.context().pack, overlay: source.overlay});
  assert.equal(res.adapter, 'local-metadata-rules/1'); assert.equal(res.quality, 'not-model-evaluated'); assert.equal(res.proposals[0].kind, 'existing-topic');
  assert.equal(res.proposals[0].qualityBand, 'review'); assert.deepEqual(source.overlay, before);
  const payload = title => ({schema: 'vaiwl-pro-provider-input/1', requestNonce: 'synthetic_nonce', items: [{handle: 'c_a', approvedTitle: title, approvedAliases: [], approvedText: []}],
    candidateTopics: [], allowedOperations: ['classify', 'name', 'propose-topic'], outputSchemaVersion: 'vaiwl-pro-model-output/1'});
  const adapter = createLocalMetadataAdapter();
  const newTopic = await adapter.execute(null, payload('毕业论文：数值积分误差验证')); assert.equal(newTopic.json.items[0].kind, 'NEW_TOPIC');
  assert.equal((await adapter.execute(null, payload('继续'))).json.items[0].kind, 'UNKNOWN');
  const ambiguous = payload('数值积分参数核对'); ambiguous.candidateTopics = ['t_a', 't_b'].map(handle => ({handle, approvedName: '数值积分', approvedIntentSummary: null}));
  assert.equal((await adapter.execute(null, ambiguous)).json.items[0].kind, 'UNKNOWN');
  const versions = payload('PAIA v0.5 输入捕获'); versions.candidateTopics = [{handle: 't_a', approvedName: 'PAIA v0.6 输入捕获', approvedIntentSummary: null}];
  assert.equal((await adapter.execute(null, versions)).json.items[0].kind, 'UNKNOWN');
});

test('cloud semantic validation rejects explicit disjoint topic versions despite matching product words', () => {
  const source = data(); source.references[0].nativeTitle = 'PAIA v0.5 输入捕获'; source.overlay.topics.t_integral.name = 'PAIA v0.6 输入捕获';
  const pack = prepareMetadataEvidence({...source, scope, candidateTopicIds: ['t_integral']}), built = buildProviderPayload(pack, source.overlay);
  const reply = {state: 'complete', json: {schemaVersion: 'vaiwl-pro-model-output/1', requestNonce: built.payload.requestNonce, items: [{kind: 'EXISTING',
    conversationHandle: built.payload.items[0].handle, topicHandle: built.payload.candidateTopics[0].handle, titleSuggestion: null,
    evidenceHandles: [built.payload.items[0].handle], reason: 'same-object-goal', explanation: 'Synthetic mismatch.'}]}};
  assert.throws(() => validateModelOutput(reply, {...built, pack, overlay: source.overlay, currentVersions: source.versions}), /conflicting-topic-version/);
});

test('reserved/dispatched jobs still deduplicate; malformed queue limits and missing paid reservation fail', () => {
  const source = data(), queued = queueJob({id: 'a', scope, versions: source.versions, inputFingerprint: digest('semantic-input'), modelBinding: binding(), processing: 'cloud'});
  const reserved = transitionJob(queued, {type: 'reserve', reservationId: 'r_a'}), sent = transitionJob(reserved, {type: 'dispatch'});
  assert.equal(admitJob([reserved], {...queued, id: 'b'}).admitted, false); assert.equal(admitJob([sent], {...queued, id: 'c'}).admitted, false);
  assert.throws(() => transitionJob(queued, {type: 'reserve', reservationId: null}), /paid-reservation-required/);
  assert.throws(() => admitJob([], queued, {maxQueued: NaN}), /invalid-job-queue-bound/);
});

test('dispatch rechecks newly added installation ceilings and expired time windows', () => {
  let ledger = configureBudgetPolicies(emptyBudgetLedger(), [policy('month', 100)], 0);
  const reserved = reserveBudget(ledger, {id: 'r_a', jobId: 'a', scope, billingProfileId: 'synthetic_billing', providerProfileId: 'openai-responses',
    currency: 'USD', priceCardVersion: 'synthetic_prices', maximum: 50, expectedBudgetRevisions: {month: 1}, now: NOW});
  ledger = configureBudgetPolicies(reserved.ledger, [policy('new_limit', 40)], reserved.ledger.revision);
  assert.throws(() => markBudgetDispatched(ledger, 'r_a', 0, null, {now: NOW}), /budget-tightened-before-dispatch/);
  assert.throws(() => markBudgetDispatched(reserved.ledger, 'r_a', 0, null, {now: '2026-12-01T00:00:00Z'}), /budget-window-expired-before-dispatch/);
});

test('default service performs no source, credential, storage or provider calls', async () => {
  let calls = 0; const service = createOrganizeService({getContext() { calls++; }, transport() { calls++; }});
  assert.equal((await service.run()).state, 'not-configured'); assert.equal((await service.status()).enabled, false); assert.equal(calls, 0);
});

test('service freezes its chosen metadata batch across preview, authorization and result freshness checks', async () => {
  const f = await fixture(), phases = [], selected = ['c_integral'];
  const service = f.reopen({getContext(_authority, options) {
    phases.push({phase: options.phase, refIds: options.refIds});
    if (options.refIds) { assert.equal(Object.isFrozen(options.refIds), true); assert.deepEqual(options.refIds, ['c_integral']); }
    return f.source.context();
  }});
  try {
    assert.equal((await service.preview({authority: f.token, refIds: selected})).state, 'ready');
    const running = service.run({authority: f.token, refIds: selected}); selected.push('late_mutation');
    assert.equal((await running).state, 'awaiting-review'); assert.equal(f.calls, 1);
    assert.deepEqual(phases.map(p => p.phase), ['preview', 'prepare', 'before-authorization', 'before-dispatch', 'before-validation', 'before-registration']);
    assert.ok(phases.every(p => p.refIds.length === 1));
  } finally { service.stop(); f.close(); }
});

test('explicit metadata batch never silently sends another selected reference', async () => {
  const f = await fixture();
  try {
    await assert.rejects(() => f.service.preview({authority: f.token, refIds: ['c_other']}), /model-batch-mismatch/);
    assert.equal((await f.service.run({authority: f.token, refIds: ['c_other']})).reason, 'model-batch-mismatch');
    assert.equal(f.calls, 0); assert.equal(Object.keys((await f.store.read(f.token)).jobs).length, 0);
  } finally { f.close(); }
});

test('complete report integrity and profile reference cannot be replaced by a qualified boolean', () => {
  const quality = arithmeticQuality(), source = data(), p = {kind: 'existing-topic', refId: 'c_integral', topicId: 't_integral', role: 'primary'};
  const model = {...profile(), qualityGateReference: quality.report.reportDigest}, args = {overlay: source.overlay, pack: source.context().pack,
    modelProfile: model, quality, firstRun: false, autoRequested: true};
  assert.deepEqual(validateQualityReport(quality.report), quality.report); assert.equal(automaticGate(p, args).eligible, true);
  const changed = structuredClone(quality); changed.report.lanes['existing-topic'].n = 1;
  assert.equal(automaticGate(p, {...args, quality: changed}).eligible, false);
  assert.equal(automaticGate(p, {...args, modelProfile: profile()}).eligible, false);
  assert.equal(automaticGate(p, {...args, pack: {...args.pack, truncated: true}}).eligible, false);
  assert.equal(automaticGate(p, {...args, quality: {approvedByOwner: true, report: {lanes: {'existing-topic': {qualified: true}}}}}).eligible, false);
});

test('automatic status requires a current approved matching lane and actual explicit processing policy', async () => {
  const quality = arithmeticQuality(), configuration = config(); configuration.profile.qualityGateReference = quality.report.reportDigest;
  const f = await fixture({configuration}); let currentPolicy = {firstRun: false, autoRequested: true, quality};
  const options = {automation: {policy: async () => currentPolicy, apply: async () => { throw Error('status-never-applies'); }}};
  const service = f.reopen(options);
  try {
    assert.equal((await service.status({authority: f.token})).automaticEnabled, true);
    for (const patch of [{firstRun: true}, {autoRequested: false}, {quality: null}]) {
      currentPolicy = {firstRun: false, autoRequested: true, quality, ...patch};
      assert.equal((await service.status({authority: f.token})).automaticEnabled, false);
    }
    currentPolicy = {firstRun: false, autoRequested: true, quality};
    const disabled = f.reopen({...options, enabled: false}), expired = f.reopen({...options, clock: () => '2027-01-01T00:00:00Z'});
    try {
      assert.equal((await disabled.status({authority: f.token})).automaticEnabled, false);
      assert.equal((await expired.status({authority: f.token})).automaticEnabled, false);
    } finally { disabled.stop(); expired.stop(); }
    assert.equal(f.calls, 0);
  } finally { service.stop(); f.close(); }
});

test('status page clamps to the last current page after terminal rows are archived, using one read', async () => {
  const source = data(); let count = 45, reads = 0;
  const rows = Array.from({length: count}, (_, i) => ({scope, checkpoint: queueJob({id: 'page_' + String(i).padStart(3, '0'), scope,
    versions: source.versions, inputFingerprint: digest(i), processing: 'local'})}));
  const service = createOrganizeService({configuration: config(), clock: () => NOW, getContext: () => source.context(), billingStore: {read: async () => {
    reads++; return {ledger: emptyBudgetLedger(), jobs: Object.fromEntries(rows.slice(0, count).map(row => [row.checkpoint.id, row]))};
  }}});
  try {
    assert.deepEqual((await service.status({offset: 40})).page, {offset: 40, total: 45, count: 5, limit: 20, hasMore: false});
    count = 7; const shrunk = await service.status({offset: 40});
    assert.deepEqual(shrunk.page, {offset: 0, total: 7, count: 7, limit: 20, hasMore: false}); assert.equal(shrunk.jobs.length, 7);
    count = 0; assert.deepEqual((await service.status({offset: 40})).page, {offset: 0, total: 0, count: 0, limit: 20, hasMore: false});
    count = 27; assert.deepEqual((await service.status({offset: 1000})).page, {offset: 20, total: 27, count: 7, limit: 20, hasMore: false});
    assert.equal(reads, 4);
  } finally { service.stop(); }
});

test('optional trusted automation applies at most one qualified proposal and persists its actual operation receipt', async () => {
  const quality = arithmeticQuality(), configuration = config(); configuration.profile.qualityGateReference = quality.report.reportDigest;
  const f = await fixture({configuration, behavior: async ({payload}) => {
    const reply = await completed(payload).json(); const output = JSON.parse(reply.output[0].content[0].text);
    output.items[0].titleSuggestion = '数值积分参数核对'; reply.output[0].content[0].text = JSON.stringify(output);
    return new Response(JSON.stringify(reply), {status: 200});
  }});
  let applied = 0;
  const service = f.reopen({automation: {
    policy: async () => ({firstRun: false, autoRequested: true, quality}),
    apply: async (_authority, request, signal) => {
      assert.equal(signal.aborted, false); applied++;
      const context = {actor: 'automation', operationId: 'synthetic_auto_receipt', snapshot: {references: request.pack.references, versions: request.versions},
        expected: request.versions, firstRun: false, mode: 'pro-default-none', qualityGate: {existingTopic: true, title: true, newTopic: true, related: true}};
      const plan = planTransaction(f.source.overlay, {type: 'APPLY_LOW_RISK_PROPOSAL', proposalId: request.proposal.id, planHash: request.proposal.planHash}, context);
      Object.assign(f.source.overlay, plan.state); return {ok: true, operationId: context.operationId};
    }
  }});
  try {
    const done = await service.run({authority: f.token});
    assert.equal(done.state, 'committed'); assert.equal(done.automaticApplied, true); assert.equal(applied, 1); assert.equal(done.proposalCount, 1);
    assert.equal(Object.keys(f.source.overlay.placements).length, 1); assert.equal(Object.keys(f.source.overlay.titles).length, 0);
    const saved = await f.store.read(f.token); assert.equal(saved.jobs[done.jobId].checkpoint.state, 'committed');
    assert.equal(saved.jobs[done.jobId].checkpoint.operationId, 'synthetic_auto_receipt');
  } finally { service.stop(); f.close(); }
});

test('first run, missing quality and revoked current automatic policy retain reviewed suggestions', async () => {
  const quality = arithmeticQuality(), configuration = config(); configuration.profile.qualityGateReference = quality.report.reportDigest;
  for (const mode of ['first-run', 'missing-quality', 'revoked', 'truncated']) {
    const f = await fixture({configuration}); let reads = 0, writes = 0;
    const service = f.reopen({getContext: () => {const context = f.source.context(); if (mode === 'truncated') context.pack.truncated = true; return context;},
      automation: {policy: async () => { reads++; return {firstRun: mode === 'first-run', autoRequested: !(mode === 'revoked' && reads > 1), quality: mode === 'missing-quality' ? null : quality}; }, apply: async () => { writes++; throw Error('must-not-apply'); }}});
    try { const done = await service.run({authority: f.token}); assert.equal(done.state, 'awaiting-review'); assert.equal(done.automaticApplied, false); assert.equal(writes, 0); }
    finally { service.stop(); f.close(); }
  }
});

test('ambiguous automatic commit keeps proposals and never retries the asset operation', async () => {
  const quality = arithmeticQuality(), configuration = config(); configuration.profile.qualityGateReference = quality.report.reportDigest;
  const f = await fixture({configuration}); let writes = 0;
  const service = f.reopen({automation: {policy: async () => ({firstRun: false, autoRequested: true, quality}), apply: async () => { writes++; throw Error('reply-lost'); }}});
  try {
    const done = await service.run({authority: f.token}); assert.equal(done.state, 'awaiting-review'); assert.equal(done.automaticApplied, false);
    assert.equal(done.reason, 'automatic-commit-needs-refresh'); assert.equal((await service.run({authority: f.token})).state, 'deduplicated');
    assert.equal(writes, 1); assert.equal(f.calls, 1);
  } finally { service.stop(); f.close(); }
});

test('known committed asset with lost task receipt is recovered only from the owner receipt, without applying again', async () => {
  const quality = arithmeticQuality(), configuration = config(); configuration.profile.qualityGateReference = quality.report.reportDigest;
  let denyTaskReceipt = true, durableReceipt = null, writes = 0;
  const f = await fixture({configuration, wrapStore: store => ({read: (...args) => store.read(...args), transact: (authority, input, signal) => {
    if (denyTaskReceipt && input.command.type === 'ADVANCE_RESULT' && input.command.event.type === 'commit') return {ok: false, reason: 'synthetic-receipt-failure'};
    return store.transact(authority, input, signal);
  }})});
  const service = f.reopen({automation: {policy: async () => ({firstRun: false, autoRequested: true, quality}), apply: async (_authority, request) => {
    writes++; const operationId = 'synthetic_late_commit';
    const plan = planTransaction(f.source.overlay, {type: 'APPLY_LOW_RISK_PROPOSAL', proposalId: request.proposal.id, planHash: request.proposal.planHash}, {
      actor: 'automation', operationId, snapshot: {references: request.pack.references, versions: request.versions}, expected: request.versions,
      firstRun: false, mode: 'pro-default-none', qualityGate: {existingTopic: true}});
    Object.assign(f.source.overlay, plan.state); durableReceipt = {committed: true, proposalId: request.proposal.id, operationId};
    return {committed: true, operationId, reason: 'stale-after-commit'};
  }}});
  try {
    const done = await service.run({authority: f.token}); assert.equal(done.state, 'committed'); assert.equal(done.automaticApplied, true); assert.equal(done.reason, 'task-status-needs-refresh');
    assert.equal((await f.store.read(f.token)).jobs[done.jobId].checkpoint.state, 'awaiting-review');
    denyTaskReceipt = false; f.source.versions.overlayRevision = f.source.overlay.revision; f.source.versions.constraintRevision = f.source.overlay.revision;
    const recovered = f.reopen({getProposalReceipt: async (_authority, query) => query.proposalId === durableReceipt.proposalId ? durableReceipt : null});
    try {
      assert.equal((await recovered.recover({authority: f.token})).receiptReconciliations, 1);
      assert.equal((await f.store.read(f.token)).jobs[done.jobId].checkpoint.operationId, durableReceipt.operationId);
      assert.equal((await recovered.cancel({authority: f.token, jobId: done.jobId})).state, 'committed');
      assert.equal(writes, 1); assert.equal(f.calls, 1); assert.equal(f.source.overlay.revision, 1);
    } finally { recovered.stop(); }
  } finally { service.stop(); f.close(); }
});

test('recovery accepts another applied item only with the trusted exact registration membership proof', async () => {
  const f = await fixture(); let evidence;
  const service = f.reopen({getProposalReceipt: async (_authority, query) => ({committed: true, proposalId: 'proposal_second', operationId: 'synthetic_second_accept',
    ...(evidence === undefined ? {} : {registeredProposalIds: typeof evidence === 'function' ? evidence(query.proposalId) : evidence})})});
  try {
    const done = await service.run({authority: f.token}); assert.equal(done.state, 'awaiting-review');
    for (const invalid of [undefined, ['proposal_second'], id => [id, id, 'proposal_second'], id => [id, ...Array.from({length: 40}, (_, i) => 'proposal_' + i)]]) {
      evidence = invalid; assert.equal((await service.recover({authority: f.token})).receiptReconciliations, 0);
      assert.equal((await f.store.read(f.token)).jobs[done.jobId].checkpoint.state, 'awaiting-review');
    }
    evidence = id => [id, 'proposal_second'];
    assert.equal((await service.recover({authority: f.token})).receiptReconciliations, 1);
    assert.equal((await f.store.read(f.token)).jobs[done.jobId].checkpoint.operationId, 'synthetic_second_accept');
    assert.equal(f.calls, 1);
  } finally { service.stop(); f.close(); }
});

test('bounded receipt cursor reaches later completed tasks beyond twenty genuinely pending jobs across service recreation', async () => {
  const f = await fixture(); let operation = 0, reads = 0;
  const write = async command => {
    const saved = await f.store.read(f.token), result = await f.store.transact(f.token, {operationId: 'cursor_seed_' + operation++, expectedRevision: saved.revision, command});
    assert.equal(result.ok, true, result.reason);
  };
  for (let i = 0; i < 25; i++) {
    const jobId = 'cursor_' + String(i).padStart(2, '0');
    await write({type: 'QUEUE_JOB', checkpoint: queueJob({id: jobId, scope, versions: f.source.versions, inputFingerprint: digest(jobId), processing: 'local'})});
    await write({type: 'DISPATCH_JOB', jobId});
    await write({type: 'COMPLETE_JOB', jobId, resultDigest: digest(jobId), actualCharge: 0, reportedExactChargeDecimal: null});
    await write({type: 'ADVANCE_RESULT', jobId, event: {type: 'validate', currentVersions: f.source.versions, awaitingReview: true, proposalId: 'proposal_' + i}});
  }
  const getProposalReceipt = async (_authority, query) => { reads++; return query.jobId === 'cursor_24' ? {committed: true, proposalId: query.proposalId, operationId: 'synthetic_late_accept'} : null; };
  const firstService = f.reopen({getProposalReceipt});
  try {
    const first = await firstService.recover({authority: f.token});
    assert.equal(first.receiptReconciliations, 0); assert.equal(first.receiptPage.inspected, 20); assert.equal(first.receiptPage.remaining, 5); assert.equal(reads, 20);
    firstService.stop(); const nextService = f.reopen({getProposalReceipt});
    try {
      const second = await nextService.recover({authority: f.token, cursor: first.receiptPage.nextCursor});
      assert.equal(second.receiptReconciliations, 1); assert.equal(second.receiptPage.inspected, 5); assert.equal(second.receiptPage.nextCursor, null);
      assert.equal((await f.store.read(f.token)).jobs.cursor_24.checkpoint.state, 'committed'); assert.equal(reads, 25); assert.equal(f.calls, 0);
    } finally { nextService.stop(); }
  } finally { firstService.stop(); f.close(); }
});

test('dispatch authorizer receives immutable exact private payload preview without storing text or credentials', async () => {
  let consentPreview = null;
  const f = await fixture({authorize: ({metadata}) => {
    consentPreview = metadata.payloadPreview;
    assert.equal(Object.isFrozen(consentPreview), true); assert.equal(Object.isFrozen(consentPreview.payload.items[0].approvedAliases), true);
    assert.equal(consentPreview.estimate.maximumMicros, metadata.maximum); assert.equal(consentPreview.estimate.currency, 'USD');
    assert.equal(consentPreview.retention, 'store-false-is-not-zero-retention');
    assert.throws(() => { consentPreview.payload.items[0].approvedTitle = 'changed'; }, TypeError);
  }, behavior: ({payload}) => { assert.deepEqual(payload, consentPreview.payload); return completed(payload); }});
  try {
    assert.equal((await f.service.run({authority: f.token})).state, 'awaiting-review');
    const persisted = JSON.stringify(await f.store.read(f.token));
    assert.equal(persisted.includes('数值积分参数核对'), false); assert.equal(persisted.includes('synthetic-not-a-secret'), false); assert.equal(persisted.includes('payloadPreview'), false);
  } finally { f.close(); }
});

test('invalid credential header bytes are denied before dispatch marker or provider transport', async () => {
  const f = await fixture({authorize: () => ({ok: true, apiKey: 'invalid\nsynthetic_key'})});
  try {
    const done = await f.service.run({authority: f.token}); assert.equal(done.automaticApplied, false); assert.equal(f.calls, 0);
    const status = await f.service.status({authority: f.token}); assert.equal(status.budget.uncertain, 0); assert.equal(status.budget.reserved, 0);
  } finally { f.close(); }
});

test('large legitimate human alias sets are bounded without rejecting ten authorized native titles or mutating assets', () => {
  const source = data(); source.references.splice(0, 1, ...Array.from({length: 10}, (_, i) => ({...source.references[0], id: 'c_' + i, nativeTitle: '中文原生标题'.repeat(66).slice(0, 400)})));
  for (const ref of source.references) source.overlay.titles[ref.id] = {conversationId: ref.id, title: '人工名称', aliases: Array.from({length: 100}, (_, i) => ('别名' + i + '内容'.repeat(100)).slice(0, 200)),
    displayPreference: 'derived', control: {mode: 'human', locked: false, revision: 0, lastHumanOperation: 'human'}, evidenceIds: [], revision: 0};
  const before = structuredClone(source.overlay), pack = source.context().pack;
  assert.equal(pack.metadata.length, 10); assert.equal(pack.truncated, true); assert.ok(pack.metadata.every(row => row.humanAliases.length < 100));
  assert.ok(pack.metadata.some(row => row.humanAliases.length > 0)); assert.ok(new TextEncoder().encode(JSON.stringify(pack)).byteLength <= 32768);
  assert.deepEqual(source.overlay, before);
});

test('large Chinese candidate summaries cannot overflow an otherwise valid minimized provider request', () => {
  const source = data(), template = source.overlay.topics.t_integral;
  source.references.splice(0, 1, ...Array.from({length: 10}, (_, i) => ({...source.references[0], id: 'c_' + i, nativeTitle: '数值积分'.repeat(100)})));
  source.overlay.topics = Object.fromEntries(Array.from({length: 20}, (_, i) => ['t_' + i, {...structuredClone(template), id: 't_' + i,
    name: '数值积分'.repeat(50), intent: {object: '数值积分对象'.repeat(50), objective: '误差验证目标'.repeat(50), expectedOutcome: '检验结果', evidenceIds: ['synthetic']}}]));
  const pack = prepareMetadataEvidence({...source, scope, candidateTopicIds: Object.keys(source.overlay.topics)}), before = structuredClone({pack, overlay: source.overlay});
  const built = buildProviderPayload(pack, source.overlay);
  assert.equal(built.truncated, true); assert.equal(built.payload.items.length, 10); assert.equal(built.payload.candidateTopics.length, 20);
  assert.ok(built.payload.candidateTopics.every(row => row.approvedIntentSummary === null));
  assert.ok(new TextEncoder().encode(JSON.stringify(built.payload)).byteLength <= 32768);
  assert.deepEqual({pack, overlay: source.overlay}, before);
});

test('same-IDB orchestration reserves/dispatches/settles/validates/registers once and never auto applies', async () => {
  const f = await fixture(); try {
    const first = await f.service.run({authority: f.token}); assert.equal(first.state, 'awaiting-review', first.reason);
    assert.equal(first.automaticApplied, false); assert.equal(first.proposalCount, 1); assert.equal(f.calls, 1); assert.equal(f.registrations, 1);
    const saved = await f.store.read(f.token); assert.equal(saved.jobs[first.jobId].checkpoint.state, 'awaiting-review');
    assert.equal(Object.values(saved.ledger.reservations)[0].reservation.status, 'settled');
    assert.equal(JSON.stringify(saved).includes('synthetic-not-a-secret'), false); assert.equal(JSON.stringify(saved).includes('数值积分参数核对'), false);
    const again = await f.service.run({authority: f.token}); assert.equal(again.state, 'deduplicated'); assert.equal(f.calls, 1);
    const status = await f.service.status({authority: f.token}); assert.equal(status.jobs[0].state, 'awaiting-review'); assert.equal(status.automaticEnabled, false);
  } finally { f.close(); }
});

for (const [label, options, reason] of [['installation budget zero', {configureBudget: false}, 'budget-zero'],
  ['single task budget zero', {configuration: {...config(), maxChargePerTaskMicros: 0}}, 'task-budget-exceeded'],
  ['consent changes during key authorization', {authorize: async ({source}) => { source.versions.authorizationEpoch++; }}, 'dispatch-not-authorized']])
test(label + ' produces zero network calls and no held charge', async () => {
  const f = await fixture(options); try {
    const out = await f.service.run({authority: f.token}); assert.equal(out.reason, reason); assert.equal(f.calls, 0); assert.equal(f.registrations, 0);
    assert.equal((await f.service.status({authority: f.token})).budget.uncertain, 0);
  } finally { f.close(); }
});

for (const [label, behavior] of [['network failure', () => { throw Error('offline'); }],
  ['missing usage', ({payload}) => completed(payload, {usage: false})],
  ['refusal', () => new Response(JSON.stringify({status: 'completed', output: [{type: 'message', content: [{type: 'refusal', refusal: 'synthetic'}]}]}))]])
test(label + ' holds unknown liability after one send and recovery never replays', async () => {
  const f = await fixture({behavior}); try {
    const out = await f.service.run({authority: f.token}); assert.equal(out.state, 'outcome-unknown', out.reason); assert.equal(f.calls, 1); assert.equal(f.registrations, 0);
    assert.ok((await f.service.status({authority: f.token})).budget.uncertain > 0);
    await f.service.recover({authority: f.token}); assert.equal((await f.service.run({authority: f.token})).state, 'deduplicated'); assert.equal(f.calls, 1);
  } finally { f.close(); }
});

test('invalid model handle settles real reported usage but makes no proposal', async () => {
  const f = await fixture({behavior: ({payload}) => completed(payload, {wrongHandle: true})}); try {
    const out = await f.service.run({authority: f.token}); assert.equal(out.state, 'failed'); assert.equal(f.registrations, 0);
    const status = await f.service.status({authority: f.token}); assert.equal(status.budget.uncertain, 0); assert.ok(status.budget.settled > 0);
  } finally { f.close(); }
});

test('bounded model timeout aborts even a transport that ignores signal; late result never registers', async () => {
  let release; const f = await fixture({timeoutMs: 100, behavior: ({payload}) => new Promise(resolve => { release = () => resolve(completed(payload)); })});
  try {
    const out = await f.service.run({authority: f.token}); assert.equal(out.state, 'outcome-unknown'); assert.equal(f.calls, 1);
    release(); await Promise.resolve(); await Promise.resolve(); assert.equal(f.registrations, 0);
    assert.ok((await f.service.status({authority: f.token})).budget.uncertain > 0);
  } finally { f.close(); }
});

test('lost durable dispatch reply preserves unknown liability without issuing a network request', async () => {
  const f = await fixture({wrapStore: store => ({read: store.read, async transact(authority, request, signal) {
    const written = await store.transact(authority, request, signal);
    return request.command.type === 'DISPATCH_JOB' && written.ok ? {ok: false, committed: true, reason: 'synthetic-response-lost'} : written;
  }})});
  try {
    const out = await f.service.run({authority: f.token}); assert.equal(out.state, 'outcome-unknown'); assert.equal(f.calls, 0);
    assert.ok((await f.service.status({authority: f.token})).budget.uncertain > 0); assert.equal(f.registrations, 0);
  } finally { f.close(); }
});

test('changed source during model work settles usage but rejects the late proposal', async () => {
  const f = await fixture({behavior: ({source, payload}) => { source.versions.authorizationEpoch++; return completed(payload); }});
  try {
    const out = await f.service.run({authority: f.token}); assert.equal(out.state, 'failed'); assert.equal(out.reason, 'stale-model-input');
    const status = await f.service.status({authority: f.token}); assert.equal(status.budget.uncertain, 0); assert.ok(status.budget.settled > 0); assert.equal(f.registrations, 0);
  } finally { f.close(); }
});

test('finalized billing archival keeps historical totals and every pending/uncertain liability', () => {
  let ledger = configureBudgetPolicies(emptyBudgetLedger(), [policy('month', 100000)], 0);
  const reserve = id => { ledger = reserveBudget(ledger, {id, jobId: id, scope, billingProfileId: 'synthetic_billing', providerProfileId: 'openai-responses',
    currency: 'USD', priceCardVersion: 'synthetic_prices', maximum: 100, expectedBudgetRevisions: {month: 1}, now: NOW}).ledger; };
  reserve('settled'); ledger = markBudgetDispatched(ledger, 'settled', 0).ledger; ledger = settleReservation(ledger, 'settled', 1, {actualCharge: 60}).ledger;
  reserve('released'); ledger = releaseReservation(ledger, 'released', 0).ledger;
  reserve('reserved'); reserve('unknown'); ledger = markBudgetDispatched(ledger, 'unknown', 0).ledger;
  assert.equal(archiveFinalizedReservations(ledger, {now: NOW}).archived.length, 0);
  const archived = archiveFinalizedReservations(ledger, {now: '2026-12-01T00:00:00Z'});
  assert.deepEqual(archived.archived.map(r => r.id).sort(), ['released', 'settled']);
  assert.deepEqual(Object.keys(archived.ledger.reservations).sort(), ['reserved', 'unknown']);
  assert.equal(archived.ledger.revision, ledger.revision + 1);
  assert.deepEqual(budgetSummary(archived.ledger, 'synthetic_billing', {archivedSettledTotals: archived.settledTotals}), budgetSummary(ledger, 'synthetic_billing'));
  const retained = archiveFinalizedReservations(ledger, {now: '2026-12-01T00:00:00Z', retainReservationIds: ['settled']});
  assert.ok(retained.ledger.reservations.settled); assert.equal(retained.archived.length, 1);
});

test('consent preview shows only minimized authorized fields, real estimated currency/limit and creates no task', async () => {
  const f = await fixture(); try {
    const before = await f.store.read(f.token), preview = await f.service.preview({authority: f.token});
    assert.equal(preview.state, 'ready'); assert.equal(preview.payload.items[0].approvedTitle, f.source.references[0].nativeTitle);
    assert.equal(preview.estimate.currency, 'USD'); assert.equal(preview.estimate.scale, 6); assert.ok(preview.estimate.maximumMicros > 0);
    assert.equal(preview.withinTaskBudget, true); assert.equal(preview.retention, 'store-false-is-not-zero-retention');
    const wire = JSON.stringify(preview.payload);
    for (const value of [scope.key, 'c_integral', 'synthetic_source', 'fixture.invalid', 'authorizationEpoch']) assert.equal(wire.includes(value), false);
    assert.equal(f.calls, 0); assert.equal(f.authorizations, 0); assert.deepEqual(await f.store.read(f.token), before);
  } finally { f.close(); }
});

test('expired price disables new calls but status, held charge, cancellation and recovery survive reopening', async () => {
  let now = NOW; const f = await fixture({clock: () => now, behavior: () => { throw Error('network-lost'); }});
  let reopened;
  try {
    const task = await f.service.run({authority: f.token}); assert.equal(task.state, 'outcome-unknown');
    now = '2026-12-01T00:00:00Z';
    const oldStatus = await f.service.status({authority: f.token}); assert.equal(oldStatus.enabled, false); assert.equal(oldStatus.configured, true); assert.ok(oldStatus.budget.uncertain > 0);
    reopened = f.reopen(); assert.equal((await reopened.status({authority: f.token})).budget.uncertain, oldStatus.budget.uncertain);
    assert.equal((await reopened.cancel({authority: f.token, jobId: task.jobId})).state, 'outcome-unknown');
    await reopened.recover({authority: f.token});
    assert.equal((await reopened.run({authority: f.token})).reason, 'price-card-not-current'); assert.equal(f.calls, 1);
  } finally { reopened?.stop(); f.close(); }
});

test('switching provider execution off preserves authoritative billing status and task controls', async () => {
  const f = await fixture({behavior: () => { throw Error('network-lost'); }}); let disabled;
  try {
    const task = await f.service.run({authority: f.token}); disabled = f.reopen({enabled: false});
    const status = await disabled.status({authority: f.token}); assert.equal(status.enabled, false); assert.ok(status.budget.uncertain > 0);
    assert.equal((await disabled.cancel({authority: f.token, jobId: task.jobId})).state, 'outcome-unknown');
    await disabled.recover({authority: f.token}); assert.equal((await disabled.run({authority: f.token})).state, 'not-configured'); assert.equal(f.calls, 1);
  } finally { disabled?.stop(); f.close(); }
});

test('new overlapping policy accounts prior current-window settlements instead of resetting allowance', () => {
  let ledger = configureBudgetPolicies(emptyBudgetLedger(), [policy('month', 1000)], 0);
  const request = (id, maximum, expectedBudgetRevisions) => ({id, jobId: id, scope, billingProfileId: 'synthetic_billing', providerProfileId: 'openai-responses',
    currency: 'USD', priceCardVersion: 'synthetic_prices', maximum, expectedBudgetRevisions, now: NOW});
  ledger = reserveBudget(ledger, request('first', 100, {month: 1})).ledger;
  ledger = markBudgetDispatched(ledger, 'first', 0).ledger;
  ledger = settleReservation(ledger, 'first', 1, {actualCharge: 60}).ledger;
  ledger = configureBudgetPolicies(ledger, [policy('new_daily', 80)], ledger.revision);
  assert.throws(() => reserveBudget(ledger, request('second', 30, {month: 1, new_daily: 1})), /budget-exceeded/);
  assert.equal(reserveBudget(ledger, request('second', 20, {month: 1, new_daily: 1})).reservation.maxCharge, 20);
});

test('explicit fine review has a separate job identity, requires a selected batch and never invokes automation', async () => {
  const quality = arithmeticQuality(), configuration = config(); configuration.profile.qualityGateReference = quality.report.reportDigest;
  const f = await fixture({configuration}); let policyCalls = 0, writes = 0;
  const service = f.reopen({automation: {policy: async () => { policyCalls++; return {firstRun: false, autoRequested: true, quality}; }, apply: async () => { writes++; throw Error('review-must-not-apply'); }}});
  try {
    const ordinary = await f.service.run({authority: f.token}); assert.equal(ordinary.state, 'awaiting-review');
    await assert.rejects(service.run({authority: f.token, reviewOnly: true}), /explicit-model-review-batch-required/);
    const preview = await service.preview({authority: f.token, reviewOnly: true, refIds: ['c_integral']}); assert.equal(preview.automaticAvailable, false);
    const reviewed = await service.run({authority: f.token, reviewOnly: true, refIds: ['c_integral']});
    assert.equal(reviewed.state, 'awaiting-review'); assert.equal(reviewed.automaticApplied, false); assert.notEqual(reviewed.jobId, ordinary.jobId);
    assert.equal(f.calls, 2); assert.equal(policyCalls, 0); assert.equal(writes, 0);
    assert.equal((await service.run({authority: f.token, reviewOnly: true, refIds: ['c_integral']})).state, 'deduplicated'); assert.equal(f.calls, 2);
  } finally { service.stop(); f.close(); }
});

test('automatic source trigger pauses before credentials or money when independent current quality is absent', async () => {
  const f = await fixture(); let writes = 0;
  const service = f.reopen({automation: {policy: async () => ({firstRun: false, autoRequested: true, quality: null}), apply: async () => { writes++; }}});
  try {
    await assert.rejects(service.run({authority: f.token, automaticTrigger: true, reviewOnly: true, refIds: ['c_integral']}), /invalid-automatic-trigger/);
    const done = await service.run({authority: f.token, automaticTrigger: true, refIds: ['c_integral']});
    assert.equal(done.state, 'paused'); assert.equal((await f.store.read(f.token)).jobs[done.jobId].checkpoint.state, 'paused');
    assert.equal(f.calls, 0); assert.equal(f.authorizations, 0); assert.equal(writes, 0); assert.equal(Object.keys((await f.store.read(f.token)).ledger.reservations).length, 0);
    const manual = await service.run({authority: f.token, refIds: ['c_integral']}); assert.equal(manual.state, 'awaiting-review'); assert.notEqual(manual.jobId, done.jobId); assert.equal(f.calls, 1);
  } finally { service.stop(); f.close(); }
});

test('automatic trigger rechecks current independent quality immediately before reservation and dispatch', async () => {
  const quality = arithmeticQuality(), configuration = config(); configuration.profile.qualityGateReference = quality.report.reportDigest;
  for (const revokeAt of [2, 4]) {
    const f = await fixture({configuration}); let reads = 0, writes = 0;
    const service = f.reopen({automation: {policy: async () => ({firstRun: false, autoRequested: ++reads < revokeAt, quality}), apply: async () => { writes++; }}});
    try {
      const done = await service.run({authority: f.token, automaticTrigger: true, refIds: ['c_integral']});
      assert.equal(done.automaticApplied, false); assert.equal(f.calls, 0); assert.equal(writes, 0);
      const saved = await f.store.read(f.token); assert(!Object.values(saved.ledger.reservations).some(r => ['reserved', 'sent-uncertain'].includes(r.reservation.status)));
    } finally { service.stop(); f.close(); }
  }
});

test('production budget owner starts at zero, reports depleted preview and preserves an explicit failed task without sending', async () => {
  const f = await fixture(), budgetOwner = createModelBudgetOwner({configuration: config(), billingStore: f.store, clock: () => NOW});
  const service = f.reopen({budgetOwner});
  try {
    const preview = await service.preview({authority: f.token}); assert.equal(preview.maxChargePerTaskMicros, 0); assert.equal(preview.withinBudget, false);
    const paused = await service.run({authority: f.token}); assert.equal(paused.state, 'paused'); assert.equal(paused.reason, 'budget-zero');
    assert((await f.store.read(f.token)).jobs[paused.jobId]); assert.equal(f.calls, 0); assert.equal(f.authorizations, 0);
    await budgetOwner.configure(f.token, {limits: {taskMicros: 1000, dayMicros: 0, monthMicros: 1000}, expectedRevision: (await f.store.read(f.token)).revision});
    const zeroDay = await service.preview({authority: f.token}); assert.equal(zeroDay.withinTaskBudget, true); assert.equal(zeroDay.withinBudget, false);
  } finally { service.stop(); f.close(); }
});

test('trusted external budget tightening after send settles usage but rejects every late suggestion and automatic write', async () => {
  let f;
  f = await fixture({behavior: async ({payload}) => {
    const saved = await f.store.read(f.token), original = saved.ledger.policies.month;
    assert.equal((await f.store.transact(f.token, {operationId: 'external_tightening', expectedRevision: saved.revision, command: {type: 'CONFIGURE_POLICIES', policies: [{...original, ceiling: 0, revision: 2}]}})).ok, true);
    return completed(payload);
  }});
  const budgetOwner = createModelBudgetOwner({configuration: config(), billingStore: f.store, clock: () => NOW});
  await budgetOwner.configure(f.token, {limits: {taskMicros: 1000, dayMicros: 1000, monthMicros: 1000}, expectedRevision: (await f.store.read(f.token)).revision});
  const service = f.reopen({budgetOwner});
  try {
    const done = await service.run({authority: f.token}); assert.equal(done.reason, 'model-budget-changed'); assert.equal(done.automaticApplied, false);
    assert.equal(f.calls, 1); assert.equal(f.registrations, 0); assert.equal(Object.keys(f.source.overlay.proposals).length, 0);
    const summary = budgetSummary((await f.store.read(f.token)).ledger, 'synthetic_billing'); assert.equal(summary.settled, 2); assert.equal(summary.uncertain, 0);
  } finally { service.stop(); f.close(); }
});

test('production automatic dispatch needs a synchronous current quality receipt inside billing; a manual suggestion remains available', async () => {
  for (const invalid of [() => false, () => Promise.resolve(true)]) {
    const quality = arithmeticQuality(), configuration = config(); configuration.profile.qualityGateReference = quality.report.reportDigest;
    const f = await fixture({configuration}); let calls = 0, checks = 0;
    const session = {key: 'synthetic_session', context: {}, scope, live: () => true, canRun: () => true, autoRequested: () => true};
    const bridge = createProductionModelBridge({now: () => Date.parse(NOW), connection: f.connection, context: async () => f.source.context(),
      register: async (_session, request) => {for (const proposal of request.proposals) Object.assign(f.source.overlay, registerProposal(f.source.overlay, proposal)); return {ok: true};},
      applyAutomatic: async () => ({ok: false}), provider: {enabled: true, configuration, canUse: () => true,
        disclosure: {provider: 'Synthetic only', policyVersion: 'synthetic/1', policyUrl: 'https://platform.openai.com/docs/guides/your-data', retentionText: 'Synthetic only, no provider call.'},
        authorizeDispatch: async () => ({ok: true, apiKey: 'synthetic-only-key'}), transport: async (_url, options) => {calls++; return completed(JSON.parse(JSON.parse(options.body).input[1].content));},
        automation: {policy: async () => ({firstRun: false, autoRequested: true, quality}), isCurrent: (_context, input) => {if (input.phase === 'dispatch-admission') {checks++; return checks < 3 ? true : invalid();} return true;}}}});
    const finish = async () => {for (let i = 0; i < 1000 && !bridge.isIdle(); i++) await new Promise(resolve => setImmediate(resolve)); assert.equal(bridge.isIdle(), true);};
    try {
      const selected = await bridge.budgetSettings(session); await bridge.configureBudget(session, {limits: {taskMicros: 1000, dayMicros: 1000, monthMicros: 1000}, expectedRevision: selected.revision});
      bridge.start(session, {refIds: ['c_integral'], automaticTrigger: true}); await finish(); assert.equal(calls, 0); assert(checks >= 3);
      assert.equal(Object.keys((await f.store.read(f.token)).ledger.reservations).length, 0);
      bridge.start(session, {refIds: ['c_integral']}); await finish(); assert.equal(calls, 1);
    } finally {bridge.stop(); f.close();}
  }
});
