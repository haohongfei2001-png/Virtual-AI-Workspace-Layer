import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../src/data/hash.mjs';
import {emptyOverlay, validateProposal, registerProposal, planTransaction} from '../../src/pro/domain/index.mjs';
import {prepareMetadataEvidence} from '../../src/pro/evidence/metadata.mjs';
import {runLocalMetadataSuggestions} from '../../src/pro/organize/local-runner.mjs';
import {planSuggestions, semanticActionDigest} from '../../src/pro/organize/planner.mjs';

function fixture(titles = ['博士论文：数值积分误差验证', '博士论文：数值积分误差验证']) {
  const scope = {kind: 'verified-scope', key: 'synthetic_group', serverIdentity: 'established', persistence: 'same-idb'}, overlay = emptyOverlay(scope.key);
  const references = titles.map((nativeTitle, i) => ({id: 'c_' + i, nativeTitle, nativeUrl: null, membership: {state: 'NONE', evidenceId: 'e_' + i, revision: 1},
    available: true, freshness: 'current', nativeRevision: 1, sourceIds: ['synthetic']}));
  const versions = {scopeKey: scope.key, authorizationEpoch: 1, sourceGeneration: {synthetic: 1}, nativeFields: {root: 1}, overlayRevision: 0,
    targets: {}, constraintRevision: 0, policyVersion: 'synthetic', evidenceDigest: digest(references)};
  const capabilities = {scope, metadata: 'available', positiveNone: 'available', selectedText: 'unavailable', sentUserInput: 'unavailable', historicalCompleteness: 'partial', reasonCodes: []};
  const pack = prepareMetadataEvidence({scope, overlay, versions, references, capabilities, consent: {mode: 'local', inputKinds: ['metadata']}});
  const validated = references.map((r, i) => ({kind: 'NEW_TOPIC', refId: r.id, seed: {name: '博士论文：数值积分误差验证', object: '博士论文', goal: '数值积分误差验证', outcome: null},
    evidenceIds: [pack.evidenceIds[i]], evidenceDigest: digest([r.id, r.nativeTitle]), explanation: '明确的同一对象和任务。', titleSuggestion: null}));
  return {overlay, pack, versions, references, validated};
}

test('identical concrete new-topic seeds form one reviewed proposal with all original references', async () => {
  const f = fixture(), original = structuredClone(f);
  const result = await runLocalMetadataSuggestions(f);
  assert.equal(result.proposals.length, 1); const p = result.proposals[0]; validateProposal(p);
  assert.equal(p.kind, 'new-topic'); assert.deepEqual(p.members, ['c_0', 'c_1']); assert.equal(p.evidenceIds.length, 2);
  assert.equal(p.qualityBand, 'review'); assert.deepEqual(f, original);
});

test('new-topic exact grouping keeps distinct names, versions, goals and outcomes separate', () => {
  for (const change of [{name: '另一主题名'}, {object: '博士论文 v2'}, {goal: '验证不同目标'}, {outcome: '独立成果'}]) {
    const f = fixture(); Object.assign(f.validated[1].seed, change);
    assert.equal(planSuggestions(f).proposals.length, 2);
  }
});

test('per-reference rejection is applied before exact grouping; grouped rejection is also respected', () => {
  const f = fixture(), single = planSuggestions({...f, validated: [f.validated[0]]}).proposals[0];
  f.overlay.constraints.rejected = {kind: 'reject-proposal', proposalFingerprint: single.fingerprint,
    targetDigest: semanticActionDigest(single), evidenceDigest: f.versions.evidenceDigest, revision: 1, operationId: 'synthetic_reject'};
  const after = planSuggestions(f); assert.equal(after.proposals.length, 1); assert.deepEqual(after.proposals[0].members, ['c_1']);
  delete f.overlay.constraints.rejected;
  const grouped = planSuggestions(f).proposals[0];
  f.overlay.constraints.rejected = {kind: 'reject-proposal', proposalFingerprint: grouped.fingerprint,
    targetDigest: semanticActionDigest(grouped), evidenceDigest: f.versions.evidenceDigest, revision: 1, operationId: 'synthetic_group_reject'};
  assert.equal(planSuggestions(f).proposals.length, 0);
});

test('deleted exact intent suppresses each reference even when the old topic combined different evidence IDs', () => {
  const f = fixture(), grouped = planSuggestions(f).proposals[0];
  f.overlay.topics.deleted = {id: 'deleted', intent: grouped.intent, lifecycle: 'trashed'};
  f.overlay.tombstones.deleted = {topicId: 'deleted', intentDigest: digest(grouped.intent), evidenceDigest: digest('older_version'), proposalFingerprints: [grouped.fingerprint]};
  assert.equal(planSuggestions({...f, validated: [f.validated[0]]}).proposals.length, 0);
  f.validated[1].seed.goal = '独立的新目标';
  const after = planSuggestions(f); assert.equal(after.proposals.length, 1); assert.deepEqual(after.proposals[0].members, ['c_1']);
});

test('durable grouped rejection still suppresses each individual later batch after the original proposal row retires', () => {
  const f = fixture(), grouped = planSuggestions(f).proposals[0], registered = registerProposal(f.overlay, grouped);
  const plan = planTransaction(registered, {type: 'REJECT_PROPOSAL', proposalId: grouped.id}, {actor: 'human', operationId: 'reject_combined',
    snapshot: {references: f.references, versions: f.versions}, expected: f.versions});
  const overlay = plan.state; delete overlay.proposals[grouped.id];
  const versions = {...f.versions, overlayRevision: overlay.revision, constraintRevision: overlay.revision}, pack = {...f.pack, versions};
  for (const item of f.validated) assert.equal(planSuggestions({overlay, pack, validated: [item]}).proposals.length, 0);
  assert.equal(Object.values(overlay.constraints).filter(row => row.kind === 'reject-proposal').length, 3);
});
