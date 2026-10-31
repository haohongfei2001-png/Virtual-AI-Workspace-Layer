import {boundedText, integer} from '../model/schema-runtime.mjs';

/** A live owner may observe newly eligible references after an explicit user
 * choice. This RAM-only queue never reads sources, obtains authority, schedules
 * timers, persists a job or calls a provider. The owner must still check its
 * current mode, consent, source and budget before every attempted start.
 *
 * Seed records the existing collection without enqueuing it. An ID is observed
 * at most once per seed, including failed starts and references that disappear
 * before dispatch. Reappearing source pages cannot silently retry paid work.
 * Known but currently ineligible IDs are remembered too. Restoring a processing
 * preference is not permission to charge for an old reference immediately.
 * Seen IDs are never evicted to make room: reaching the bounded live-session
 * capacity pauses new automatic admission while preserving manual operations.
 */
export function createIncrementalTrigger({maxReferences = 20000, maxBatchSize = 10} = {}) {
  integer(maxReferences, 20000); integer(maxBatchSize, 10);
  if (!maxReferences || !maxBatchSize) throw Error('invalid-incremental-capacity');
  let initialized = false, generation = 0, serial = 0, sourceKey = null;
  let seen = new Set(), current = new Set(), pending = [], issued = null, capacityReached = false;
  const references = input => {
    if (!Array.isArray(input) || input.length > maxReferences) throw Error('invalid-incremental-references');
    const ids = input.map(value => { boundedText(value, 128); return value; });
    if (new Set(ids).size !== ids.length) throw Error('duplicate-incremental-reference');
    return ids;
  };
  const version = value => { boundedText(value, 1024); return value; };
  const observation = (refIds, knownRefIds) => {
    const ids = references(refIds), known = references(knownRefIds), set = new Set(known);
    if (ids.some(id => !set.has(id))) throw Error('unknown-incremental-reference');
    return {ids, known};
  };
  const status = () => ({pending: pending.length, seen: seen.size, capacityReached});
  function reset() {
    initialized = false; generation++; sourceKey = null; seen = new Set(); current = new Set();
    pending = []; issued = null; capacityReached = false;
    return status();
  }
  function seed(refIds, sourceVersionKey = null, {knownRefIds = refIds} = {}) {
    const {ids, known} = observation(refIds, knownRefIds), key = sourceVersionKey === null ? null : version(sourceVersionKey);
    reset(); initialized = true; sourceKey = key; seen = new Set(known); current = new Set(ids);
    capacityReached = seen.size === maxReferences;
    return status();
  }
  function observe(refIds, sourceVersionKey, {knownRefIds = refIds} = {}) {
    const {ids, known} = observation(refIds, knownRefIds), key = version(sourceVersionKey);
    if (!initialized) throw Error('incremental-trigger-not-seeded');
    const nextCurrent = new Set(ids), added = ids.filter(id => !seen.has(id)), newlyKnown = known.filter(id => !seen.has(id));
    const changed = key !== sourceKey || newlyKnown.length > 0 || current.size !== nextCurrent.size || ids.some(id => !current.has(id));
    // Losing eligibility invalidates a prepared batch before any owner can
    // consume it. Removing then re-adding an ID is not a new automatic intent.
    pending = pending.filter(id => nextCurrent.has(id));
    if (seen.size + newlyKnown.length <= maxReferences) {
      for (const id of newlyKnown) seen.add(id);
      pending.push(...added);
    } else capacityReached = true;
    capacityReached ||= seen.size === maxReferences;
    current = nextCurrent; sourceKey = key;
    if (changed) { generation++; issued = null; }
    return status();
  }
  function nextBatch() {
    if (issued) return issued;
    const refIds = pending.slice(0, maxBatchSize), remaining = pending.length - refIds.length;
    const batch = {batchId: refIds.length ? `incremental_${generation}_${++serial}` : null,
      refIds: Object.freeze(refIds), total: pending.length, remaining, hasMore: remaining > 0, capacityReached};
    // Only this exact owner-private object can be consumed. A copied JSON ID
    // or a batch from a previous source generation cannot consume other work.
    if (refIds.length) issued = Object.freeze(batch);
    return issued ?? Object.freeze(batch);
  }
  function markStarted(batch) {
    if (!initialized || !issued || batch !== issued) return {consumed: false, count: 0, remaining: pending.length, reason: 'stale-incremental-batch'};
    const count = issued.refIds.length;
    pending = pending.slice(count); issued = null;
    return {consumed: true, count, remaining: pending.length};
  }
  return Object.freeze({seed, observe, nextBatch, markStarted, reset});
}
