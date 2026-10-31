import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../src/data/hash.mjs';
import {planMetadataBatch, metadataBatchCursorKey} from '../../src/pro/organize/metadata-batch.mjs';

test('metadata batches traverse every authorized row in canonical order and end without repeating', () => {
  const references = Array.from({length: 1003}, (_, i) => ({id: 'synthetic_' + i}));
  const metadata = references.filter((_, i) => i % 7 !== 0).map(r => ({refId: r.id})).reverse();
  const expected = references.filter((_, i) => i % 7 !== 0).map(r => r.id), visited = [];
  let offset = 0, batch;
  do {
    batch = planMetadataBatch({references, metadata, offset});
    assert.equal(batch.offset, offset); assert.ok(batch.refIds.length <= 10);
    visited.push(...batch.refIds); offset = batch.nextOffset;
  } while (batch.hasMore);
  assert.deepEqual(visited, expected); assert.equal(batch.total, expected.length);
  assert.deepEqual(planMetadataBatch({references, metadata, offset}), {refIds: [], offset, nextOffset: offset, total: expected.length, hasMore: false});
  assert.deepEqual(metadata[0], {refId: expected.at(-1)});
});

test('metadata batches validate IDs and bounds, and zero eligible rows are a finite complete pass', () => {
  assert.deepEqual(planMetadataBatch({references: [], offset: 99}), {refIds: [], offset: 0, nextOffset: 0, total: 0, hasMore: false});
  assert.deepEqual(planMetadataBatch({references: [{id: 'a'}], metadata: []}).refIds, []);
  for (const bad of [{references: [{id: 'a'}, {id: 'a'}]}, {references: [{id: 'a'}], metadata: [{refId: 'b'}]},
    {references: [{id: 'a'}], metadata: [{refId: 'a'}, {refId: 'a'}]}, {references: [{id: ''}]},
    {references: [], offset: -1}, {references: [], offset: NaN}, {references: [], limit: 0}, {references: [], limit: 11}]) {
    assert.throws(() => planMetadataBatch(bad));
  }
});

test('batch cursor binds source authority, evidence, human constraints and mode with stable project set order', () => {
  const versions = {scopeKey: 'synthetic_batch', authorizationEpoch: 1, sourceGeneration: {local: 1}, nativeFields: {root: 1},
    overlayRevision: 0, targets: {}, constraintRevision: 0, policyVersion: 'synthetic_1', evidenceDigest: digest('metadata')};
  const input = {versions, mode: 'pro-cross-project', selectedProjectIds: ['b', 'a'], processing: 'local'}, key = metadataBatchCursorKey(input);
  assert.equal(metadataBatchCursorKey({...input, selectedProjectIds: ['a', 'b']}), key);
  for (const change of [{authorizationEpoch: 2}, {evidenceDigest: digest('new source')}, {constraintRevision: 1}, {overlayRevision: 1}]) {
    assert.notEqual(metadataBatchCursorKey({...input, versions: {...versions, ...change}}), key);
  }
  assert.notEqual(metadataBatchCursorKey({...input, processing: 'cloud'}), key);
  assert.notEqual(metadataBatchCursorKey({...input, mode: 'pro-default-none', selectedProjectIds: []}), key);
  assert.throws(() => metadataBatchCursorKey({...input, selectedProjectIds: ['a', 'a']}));
});
