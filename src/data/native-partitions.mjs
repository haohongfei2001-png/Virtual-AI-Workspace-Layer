import { emptyNativeFacts, validateNativeFacts } from './native-facts.mjs';
import { digest } from './hash.mjs';
import { id, exact } from './state.mjs';

export const NATIVE_PARTITION_FORMAT = 'vaiwl-native-partitions-v1';
export const nativePartitionKey = (scope, kind, key, revision) => JSON.stringify([scope, 'native-piece', kind, key, revision]);
export const nativeRecoveryKey = scope => JSON.stringify([scope, 'native-recovery']);
export const nativeCheckpointKey = scope => JSON.stringify([scope, 'native-checkpoint']);
export const nativeRecord = (key, payload) => {
  if (JSON.stringify(payload).length > 16 * 1024 * 1024) throw Error('native-record-too-large');
  return {key, payload, checksum: digest(payload)};
};
export function nativeUnpack(row) {
  if (!row || row.checksum !== digest(row.payload)) throw Error('corrupt-native-record');
  return row.payload;
}
export const isNativePartitioned = value => value?.format === NATIVE_PARTITION_FORMAT;
export function nativeHeader(manifest, scope) {
  return {...emptyNativeFacts(scope), format: 'vaiwl-native-facts-v2', revision: manifest.revision, sources: manifest.sources};
}
export function validateNativeManifest(m, scope) {
  exact(m, ['format', 'scopeKey', 'revision', 'sources', 'projects', 'refs', 'units', 'changes']);
  if (m.format !== NATIVE_PARTITION_FORMAT || m.scopeKey !== emptyNativeFacts(scope).scopeKey ||
      !Number.isSafeInteger(m.revision) || m.revision < 1 || !Number.isSafeInteger(m.units) ||
      m.units < 0 || m.units > 128 * 1024 * 1024) throw Error('invalid-native-manifest');
  validateNativeFacts(nativeHeader(m, scope), scope);
  for (const table of ['projects', 'refs']) {
    if (!m[table] || Array.isArray(m[table]) || Object.keys(m[table]).length > 100000) throw Error('native-partition-capacity');
    for (const [key, version] of Object.entries(m[table])) {
      id(key);
      if (!Number.isSafeInteger(version) || version < 1 || version > m.revision) throw Error('invalid-native-piece-version');
    }
  }
  if (!Array.isArray(m.changes) || m.changes.length > 64) throw Error('invalid-native-changes');
  for (const change of m.changes) {
    exact(change, ['revision', 'projects', 'refs']);
    if (!Number.isSafeInteger(change.revision) || change.revision < 1 || change.revision > m.revision) throw Error('invalid-native-changes');
    for (const table of ['projects', 'refs']) {
      if (!Array.isArray(change[table]) || change[table].length > 10000) throw Error('invalid-native-changes');
      change[table].forEach(id);
    }
  }
  if (JSON.stringify(m).length > 16 * 1024 * 1024) throw Error('native-manifest-too-large');
  return m;
}

/** Immutable bounded pieces share the original store and root CAS transaction.
 * A partial mutation reads only changed rows and their Project dependencies.
 */
export function loadNativePieces(store, manifest, scope, wanted, done, fail) {
  const facts = nativeHeader(manifest, scope), pieces = new Map();
  const requested = new Set();
  let waiting = 0, launching = true, failed = false;
  const finish = () => {
    if (!waiting && !launching && !failed) {
      try { validateNativeFacts(facts, scope); done(facts, {manifest, pieces}); } catch (error) { failed = true; fail(error); }
    }
  };
  const load = (kind, key) => {
    const identity = JSON.stringify([kind, key]);
    if (requested.has(identity) || !Object.hasOwn(manifest[kind], key)) return;
    requested.add(identity); waiting++;
    const request = store.get(nativePartitionKey(manifest.scopeKey, kind, key, manifest[kind][key]));
    request.onsuccess = () => {
      if (failed) return;
      try {
        const piece = nativeUnpack(request.result);
        exact(piece, kind === 'projects' ? ['scopeKey', 'kind', 'id', 'revision', 'row'] : ['scopeKey', 'kind', 'id', 'revision', 'row', 'membership']);
        if (piece.scopeKey !== manifest.scopeKey || piece.kind !== kind || piece.id !== key ||
            piece.revision !== manifest[kind][key] || piece.row?.id !== key) throw Error('invalid-native-piece');
        pieces.set(identity, piece); facts[kind][key] = piece.row;
        if (kind === 'refs' && piece.membership) {
          if (piece.membership.id !== key) throw Error('invalid-native-piece');
          facts.membership[key] = piece.membership;
          if (piece.membership.state === 'PROJECT') load('projects', piece.membership.projectId);
        }
        waiting--; finish();
      } catch (error) { failed = true; fail(error); }
    };
  };
  for (const kind of ['projects', 'refs']) for (const key of wanted[kind]) load(kind, key);
  launching = false; finish();
}

export function saveNativePieces(store, scope, current, next, storage, command) {
  const prior = storage?.manifest;
  const projectIds = prior ? (command.batch?.projects ?? []).map(row => row.id) : Object.keys(next.projects);
  const refIds = prior ? [...new Set([...(command.batch?.refs ?? []).map(row => row.id),
    ...(command.batch?.membership ?? []).map(row => row.id)])] : Object.keys(next.refs);
  const manifest = {format: NATIVE_PARTITION_FORMAT, scopeKey: next.scopeKey, revision: next.revision,
    sources: next.sources, projects: {...prior?.projects}, refs: {...prior?.refs}, units: prior?.units ?? 0,
    changes: [...(prior?.changes ?? []), {revision: next.revision, projects: projectIds.slice(0, 10000), refs: refIds.slice(0, 10000)}].slice(-64)};
  for (const [kind, keys] of [['projects', projectIds], ['refs', refIds]]) for (const key of keys) {
    const old = storage?.pieces.get(JSON.stringify([kind, key]));
    if (old) manifest.units -= JSON.stringify(old).length;
    const piece = {scopeKey: next.scopeKey, kind, id: key, revision: next.revision, row: next[kind][key],
      ...(kind === 'refs' ? {membership: next.membership[key] ?? null} : {})};
    if (!piece.row) throw Error('orphan-native-membership');
    manifest.units += JSON.stringify(piece).length;
    manifest[kind][key] = next.revision;
    store.put(nativeRecord(nativePartitionKey(next.scopeKey, kind, key, next.revision), piece));
  }
  validateNativeManifest(manifest, scope);
  if (prior) {
    const oldCheckpoint = store.get(nativeCheckpointKey(next.scopeKey));
    oldCheckpoint.onsuccess = () => {
      // Only retire pieces superseded before the checkpoint being retained.
      // Corrupt diagnostic checkpoints are preserved for explicit repair.
      let old;
      try { old = nativeUnpack(oldCheckpoint.result); if (!isNativePartitioned(old)) return; validateNativeManifest(old, scope); } catch { return; }
      const changed = prior.changes.find(change => change.revision === prior.revision);
      for (const kind of ['projects', 'refs']) for (const key of changed?.[kind] ?? []) {
        const version = old[kind][key];
        if (version && version !== prior[kind][key] && version !== manifest[kind][key]) {
          store.delete(nativePartitionKey(next.scopeKey, kind, key, version));
        }
      }
    };
  }
  // Previous immutable root is retained for diagnosis; recovering it must invalidate all evidence.
  if (prior) store.put(nativeRecord(nativeCheckpointKey(next.scopeKey), prior));
  else if (current.revision) store.put(nativeRecord(nativeCheckpointKey(next.scopeKey), current));
  store.put(nativeRecord(nativeRecoveryKey(next.scopeKey), manifest));
  store.put(nativeRecord(next.scopeKey, manifest));
  return manifest;
}
