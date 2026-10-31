import test from 'node:test';
import assert from 'node:assert/strict';
import {createIncrementalTrigger} from '../../src/pro/organize/incremental-trigger.mjs';

test('explicit enable seeds existing eligible references without changing the old collection', () => {
  const trigger = createIncrementalTrigger();
  assert.throws(() => trigger.observe(['old'], 'source1'), /not-seeded/);
  assert.deepEqual(trigger.seed(['old', 'also-old']), {pending: 0, seen: 2, capacityReached: false});
  trigger.observe(['old', 'also-old'], 'source1');
  assert.deepEqual(trigger.nextBatch(), {batchId: null, refIds: [], total: 0, remaining: 0, hasMore: false, capacityReached: false});
  trigger.observe(['new', 'old', 'also-old'], 'source2');
  assert.deepEqual(trigger.nextBatch().refIds, ['new']);
});

test('a finite new collection drains in at most ten references per start and never retries failed work on refresh', () => {
  const trigger = createIncrementalTrigger(), added = Array.from({length: 23}, (_, index) => 'new' + index);
  trigger.seed(['old'], 'source1');
  trigger.observe(['old', ...added], 'source2');
  const batches = [];
  while (trigger.nextBatch().refIds.length) {
    const batch = trigger.nextBatch();
    assert.equal(trigger.nextBatch(), batch);
    batches.push([...batch.refIds]);
    assert.equal(trigger.markStarted(batch).consumed, true);
    // A timeout, unknown provider result or failed source check still consumed
    // the one automatic intent. Repeated refresh never creates a retry loop.
    trigger.observe(['old', ...added], 'source2');
  }
  assert.deepEqual(batches.map(batch => batch.length), [10, 10, 3]);
  assert.deepEqual(batches.flat(), added);
  trigger.observe([...added, 'old'], 'source3');
  assert.deepEqual(trigger.nextBatch().refIds, []);
});

test('a changed source invalidates an issued batch without losing still-pending work', () => {
  const trigger = createIncrementalTrigger();
  trigger.seed([], 'one'); trigger.observe(['a', 'b'], 'two');
  const stale = trigger.nextBatch();
  trigger.observe(['b', 'a', 'c'], 'three');
  assert.deepEqual(trigger.markStarted(stale), {consumed: false, count: 0, remaining: 3, reason: 'stale-incremental-batch'});
  assert.deepEqual(trigger.nextBatch().refIds, ['a', 'b', 'c']);
});

test('unavailable and excluded references leave pending immediately and do not restart when they reappear', () => {
  const trigger = createIncrementalTrigger();
  trigger.seed(['old']); trigger.observe(['old', 'a', 'b'], 'source');
  const stale = trigger.nextBatch();
  // Eligibility can change independently of source generation, e.g. a human
  // exclusion. This still invalidates the prepared automatic batch.
  trigger.observe(['old', 'b'], 'source');
  assert.equal(trigger.markStarted(stale).consumed, false);
  assert.deepEqual(trigger.nextBatch().refIds, ['b']);
  trigger.observe(['old', 'a', 'b'], 'later-source');
  assert.deepEqual(trigger.nextBatch().refIds, ['b']);
});

test('restoring a processing preference never treats an already known excluded reference as new paid work', () => {
  const trigger = createIncrementalTrigger();
  trigger.seed(['old-eligible'], 'source1', {knownRefIds: ['old-eligible', 'old-excluded']});
  trigger.observe(['old-eligible', 'old-excluded'], 'human-preference-changed', {knownRefIds: ['old-eligible', 'old-excluded']});
  assert.deepEqual(trigger.nextBatch().refIds, []);
  // A newly observed source reference can also be ineligible at first. Its
  // later explicit restoration must not manufacture another automatic intent.
  trigger.observe(['old-eligible', 'old-excluded'], 'source2', {knownRefIds: ['old-eligible', 'old-excluded', 'new-but-excluded']});
  trigger.observe(['old-eligible', 'old-excluded', 'new-but-excluded'], 'human-preference-changed-again');
  assert.deepEqual(trigger.nextBatch().refIds, []);
  trigger.observe(['old-eligible', 'old-excluded', 'new-but-excluded', 'actually-new'], 'source3');
  assert.deepEqual(trigger.nextBatch().refIds, ['actually-new']);
});

test('issued batches cannot be mutated, forged, consumed twice or used across explicit reset', () => {
  const trigger = createIncrementalTrigger();
  trigger.seed([]); trigger.observe(['a'], 'one');
  const first = trigger.nextBatch();
  assert.throws(() => first.refIds.push('forged'), TypeError);
  assert.equal(trigger.markStarted(structuredClone(first)).consumed, false);
  assert.equal(trigger.markStarted(first).consumed, true);
  assert.equal(trigger.markStarted(first).consumed, false);
  trigger.observe(['a', 'b'], 'two'); const oldGeneration = trigger.nextBatch();
  assert.deepEqual(trigger.reset(), {pending: 0, seen: 0, capacityReached: false});
  assert.equal(trigger.markStarted(oldGeneration).consumed, false);
  trigger.seed(['a', 'b'], 'three');
  assert.deepEqual(trigger.nextBatch().refIds, []);
});

test('seen capacity never evicts earlier IDs or admits a partial over-capacity batch', () => {
  const trigger = createIncrementalTrigger({maxReferences: 4, maxBatchSize: 2});
  trigger.seed(['old']); trigger.observe(['old', 'a', 'b'], 'one');
  assert.equal(trigger.markStarted(trigger.nextBatch()).count, 2);
  assert.deepEqual(trigger.observe(['old', 'c', 'd'], 'two'), {pending: 0, seen: 3, capacityReached: true});
  assert.deepEqual(trigger.nextBatch().refIds, []);
  // A genuinely bounded next observation can fill the last slot. Earlier IDs
  // remain remembered even after disappearing from the current source page.
  trigger.observe(['c'], 'three');
  assert.deepEqual(trigger.nextBatch().refIds, ['c']);
  trigger.markStarted(trigger.nextBatch());
  trigger.observe(['old', 'a', 'b', 'c'], 'four');
  assert.deepEqual(trigger.nextBatch().refIds, []);
  assert.equal(trigger.observe(['newer'], 'five').seen, 4);
  assert.deepEqual(trigger.nextBatch().refIds, []);
});

test('capacity refusal still removes references that lost eligibility', () => {
  const trigger = createIncrementalTrigger({maxReferences: 3});
  trigger.seed(['old']); trigger.observe(['old', 'a', 'b'], 'one');
  const old = trigger.nextBatch();
  assert.deepEqual(trigger.observe(['b', 'c'], 'two'), {pending: 1, seen: 3, capacityReached: true});
  assert.equal(trigger.markStarted(old).consumed, false);
  assert.deepEqual(trigger.nextBatch().refIds, ['b']);
});

test('invalid input is atomic and cannot disturb a valid prepared batch', () => {
  const trigger = createIncrementalTrigger({maxReferences: 2});
  trigger.seed([]); trigger.observe(['a'], 'one'); const batch = trigger.nextBatch();
  for (const invalid of [['a', 'a'], ['a', 'b', 'c'], [''], ['x'.repeat(129)], [null]]) {
    assert.throws(() => trigger.observe(invalid, 'two'));
    assert.equal(trigger.nextBatch(), batch);
    assert.throws(() => trigger.seed(invalid));
    assert.equal(trigger.nextBatch(), batch);
  }
  assert.throws(() => trigger.observe(['a', 'b'], null));
  assert.throws(() => trigger.observe(['a', 'b'], 'two', {knownRefIds: ['a']}), /unknown-incremental-reference/);
  assert.throws(() => trigger.seed(['a'], 'two', {knownRefIds: []}), /unknown-incremental-reference/);
  assert.equal(trigger.nextBatch(), batch);
  assert.equal(trigger.markStarted(batch).consumed, true);
});

test('limits are positive and bounded by the R1 ten-reference packet and active reference capacity', () => {
  for (const options of [{maxReferences: 0}, {maxReferences: 20001}, {maxBatchSize: 0}, {maxBatchSize: 11}, {maxBatchSize: 1.5}]) {
    assert.throws(() => createIncrementalTrigger(options));
  }
  const ids = Array.from({length: 20000}, (_, index) => 'ref' + index), trigger = createIncrementalTrigger();
  trigger.seed(ids, 'large');
  assert.deepEqual(trigger.observe(ids, 'same-collection'), {pending: 0, seen: 20000, capacityReached: true});
  assert.deepEqual(trigger.nextBatch().refIds, []);
});
