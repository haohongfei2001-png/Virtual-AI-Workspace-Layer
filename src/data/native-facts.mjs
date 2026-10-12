import { normalizedScope, isRecord, tokenOK, urlOK } from '../b1/identity.mjs';
import { instant } from '../navigation/projection.mjs';

const reserved = new Set(['__proto__', 'constructor', 'prototype']);
const availabilityValues = ['available', 'unavailable', 'unknown'];
const membershipValues = ['PROJECT', 'NONE', 'UNKNOWN'];
function identifier(value) {
  if (!tokenOK(value) || reserved.has(value)) throw Error('invalid-native-id');
  return value;
}
function shape(value, fields) {
  if (!isRecord(value) || fields.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !fields.includes(key))) throw Error('invalid-native-schema');
}
function timestamp(value) {
  const result = instant(value);
  if (result === null) throw Error('invalid-native-time');
  return result;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw Error('invalid-native-revision');
}
function name(value) {
  if (value !== null && (typeof value !== 'string' || !value.trim() || value.length > 200)) {
    throw Error('invalid-native-name');
  }
}
function scopeKey(scope) {
  const normalized = normalizedScope(scope);
  if (!normalized) throw Error('unverified-scope');
  return normalized.key;
}
function rows(value) {
  if (!Array.isArray(value) || value.length > 5000) throw Error('invalid-native-batch');
  const seen = new Set();
  for (const row of value) {
    identifier(row?.id);
    if (seen.has(row.id)) throw Error('duplicate-native-observation');
    seen.add(row.id);
  }
}
function witness(value) {
  identifier(value.sourceId);
  identifier(value.generation);
  revision(value.sourceRevision);
  if (timestamp(value.validUntil) <= timestamp(value.observedAt)) throw Error('invalid-native-expiry');
}
function nativeObject(value, titleField) {
  identifier(value.id);
  name(value[titleField]);
  if (!urlOK(value.nativeUrl) || !availabilityValues.includes(value.availability)) {
    throw Error('invalid-native-object');
  }
}
function membership(value, projects) {
  identifier(value.id);
  if (!membershipValues.includes(value.state)) throw Error('invalid-native-membership');
  if (value.state === 'PROJECT') {
    identifier(value.projectId);
    if (!Object.hasOwn(projects, value.projectId)) throw Error('missing-native-project');
  } else if (value.projectId !== null) throw Error('invalid-native-membership');
}

export function emptyNativeFacts(scope) {
  return {format: 'vaiwl-native-facts-v1', scopeKey: scopeKey(scope), revision: 0,
    projects: {}, refs: {}, membership: {}, sources: {}};
}

export function validateNativeFacts(facts, scope) {
  shape(facts, ['format', 'scopeKey', 'revision', 'projects', 'refs', 'membership', 'sources']);
  if (facts.format !== 'vaiwl-native-facts-v1' || facts.scopeKey !== scopeKey(scope) ||
      !Number.isSafeInteger(facts.revision) || facts.revision < 0) throw Error('invalid-native-facts');
  for (const table of ['projects', 'refs', 'membership', 'sources']) {
    if (!isRecord(facts[table]) || Object.keys(facts[table]).length > 20000) throw Error('native-facts-capacity');
    for (const [key, row] of Object.entries(facts[table])) {
      identifier(key);
      if (!isRecord(row) || row.id !== key) throw Error('invalid-native-row');
      if (table === 'sources') {
        shape(row, ['id', 'generation', 'sourceRevision', 'observedAt', 'validUntil', 'revoked', 'channel', 'inventory']);
        witness({...row, sourceId: key});
        if (row.channel !== 'synthetic' || typeof row.revoked !== 'boolean') throw Error('untrusted-native-source');
        inventory(row.inventory);
        continue;
      }
      const fields = table === 'membership' ? ['state', 'projectId'] :
        [table === 'projects' ? 'nativeName' : 'nativeTitle', 'nativeUrl', 'availability'];
      shape(row, ['id', ...fields, 'sourceId', 'generation', 'sourceRevision', 'observedAt', 'validUntil']);
      witness(row);
      const source = facts.sources[row.sourceId];
      if (!source || source.generation !== row.generation || source.sourceRevision < row.sourceRevision) {
        throw Error('orphan-native-witness');
      }
      if (table === 'membership') {
        membership(row, facts.projects);
        if (!Object.hasOwn(facts.refs, row.id)) throw Error('orphan-native-membership');
      } else nativeObject(row, table === 'projects' ? 'nativeName' : 'nativeTitle');
    }
  }
  if (JSON.stringify(facts).length > 16 * 1024 * 1024) throw Error('native-facts-too-large');
  return facts;
}

function inventory(value) {
  shape(value, ['projects', 'conversations', 'cursor']);
  if (![value.projects, value.conversations].every(status => ['partial', 'complete', 'unknown'].includes(status)) ||
      (value.cursor !== null && (typeof value.cursor !== 'string' || value.cursor.length > 2048))) {
    throw Error('invalid-native-inventory');
  }
  if (value.cursor !== null && (value.projects === 'complete' || value.conversations === 'complete')) {
    throw Error('unfinished-native-inventory');
  }
}

export function applyNativeObservations(current, batch, {scope, channel, sourceId, generation, now}) {
  validateNativeFacts(current, scope);
  if (channel !== 'synthetic') throw Error('untrusted-native-source');
  identifier(sourceId);
  identifier(generation);
  shape(batch, ['scopeKey', 'sourceRevision', 'observedAt', 'validUntil', 'projects', 'refs', 'membership', 'inventory']);
  if (batch.scopeKey !== current.scopeKey) throw Error('cross-scope-native-observation');
  const provenance = {sourceId, generation, sourceRevision: batch.sourceRevision,
    observedAt: batch.observedAt, validUntil: batch.validUntil};
  witness(provenance);
  if (timestamp(batch.observedAt) > timestamp(now) || timestamp(batch.validUntil) <= timestamp(now)) {
    throw Error('stale-native-observation');
  }
  const prior = current.sources[sourceId];
  if (prior && (prior.revoked || prior.generation !== generation)) throw Error('native-source-invalidated');
  if (prior && (batch.sourceRevision <= prior.sourceRevision ||
      timestamp(batch.observedAt) < timestamp(prior.observedAt))) throw Error('stale-native-revision');
  inventory(batch.inventory);
  for (const table of ['projects', 'refs', 'membership']) rows(batch[table]);
  const next = structuredClone(current);
  for (const table of ['projects', 'refs', 'membership']) {
    for (const row of batch[table]) {
      const fields = table === 'membership' ? ['id', 'state', 'projectId'] :
        ['id', table === 'projects' ? 'nativeName' : 'nativeTitle', 'nativeUrl', 'availability'];
      shape(row, fields);
      if (table === 'membership') membership(row, next.projects);
      else nativeObject(row, table === 'projects' ? 'nativeName' : 'nativeTitle');
      const previous = next[table][row.id];
      if (previous && previous.sourceId !== sourceId) throw Error('native-source-conflict');
      next[table][row.id] = {...row, ...provenance};
    }
  }
  next.sources[sourceId] = {id: sourceId, generation, sourceRevision: batch.sourceRevision,
    observedAt: batch.observedAt, validUntil: batch.validUntil, revoked: false, channel,
    inventory: structuredClone(batch.inventory)};
  next.revision++;
  return validateNativeFacts(next, scope);
}

export function invalidateNativeSource(current, sourceId, scope) {
  validateNativeFacts(current, scope);
  identifier(sourceId);
  if (!Object.hasOwn(current.sources, sourceId)) throw Error('missing-native-source');
  const next = structuredClone(current);
  next.sources[sourceId].revoked = true;
  next.revision++;
  return next;
}

export function nativeWitnessActive(row, facts, now) {
  const clock = timestamp(now), source = facts.sources[row.sourceId];
  return !!source && !source.revoked && source.generation === row.generation &&
    source.sourceRevision >= row.sourceRevision && timestamp(row.observedAt) <= clock &&
    timestamp(row.validUntil) > clock;
}
