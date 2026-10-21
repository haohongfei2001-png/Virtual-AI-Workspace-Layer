import {exact, id} from './state.mjs';
import {digest} from './hash.mjs';

export const NATIVE_LIFECYCLE_FACTS = 'vaiwl-native-facts-v3';
export const NATIVE_LIFECYCLE_PARTITIONS = 'vaiwl-native-partitions-v2';
export const NATIVE_LIFECYCLE_INDEX = 'vaiwl-native-version-index-v2';
export const nativeObjectKinds = Object.freeze(['projects', 'refs']);
export const nativeLifecycleKinds = Object.freeze(['projectLifecycle', 'refLifecycle']);
export const hasNativeLifecycle = value => [NATIVE_LIFECYCLE_FACTS, NATIVE_LIFECYCLE_PARTITIONS, NATIVE_LIFECYCLE_INDEX].includes(value?.format);
export const nativeKinds = value => hasNativeLifecycle(value) ? [...nativeObjectKinds, ...nativeLifecycleKinds] : nativeObjectKinds;
export const emptyNativeMaps = value => Object.fromEntries(nativeKinds(value).map(kind => [kind, {}]));
export const allNativeKeys = value => Object.fromEntries(nativeKinds(value).map(kind => [kind, Object.keys(value[kind])]));
export const lifecycleKind = kind => kind === 'projects' ? 'projectLifecycle' : kind === 'refs' ? 'refLifecycle' : null;
export const nativeDeleted = (facts, kind, key) => facts[lifecycleKind(kind)]?.[key]?.state === 'deletion-confirmed';
// Never forget consumed result identities to make room. At this per-object
// ceiling, fail closed; a future causal source contract may define compaction.
export const MAX_NATIVE_LIFECYCLE_RESULTS = 64;
export const nativeLifecycleSemantic = change => digest(Object.fromEntries(Object.entries(change).filter(([key]) => key !== 'expectedVersion')));

const fingerprint = value => { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw Error('invalid-native-lifecycle-fingerprint'); };
const version = value => { if (!Number.isSafeInteger(value) || value < 1) throw Error('invalid-native-lifecycle-version'); };
export function validateNativeLifecycleRow(row, ceiling) {
  exact(row, ['id', 'state', 'version', 'fenceId', 'fenceVersion', 'resultFingerprint', 'profileId', 'profileVersion', 'results']);
  id(row.id); id(row.profileId); version(row.profileVersion); version(row.version); version(row.fenceVersion);
  fingerprint(row.fenceId); fingerprint(row.resultFingerprint);
  if (!Array.isArray(row.results) || row.results.length < 1 || row.results.length > MAX_NATIVE_LIFECYCLE_RESULTS) throw Error('invalid-native-lifecycle-results');
  const seen = new Set();
  for (const result of row.results) {
    exact(result, ['fingerprint', 'semantic']); fingerprint(result.fingerprint); fingerprint(result.semantic);
    if (seen.has(result.fingerprint)) throw Error('duplicate-native-lifecycle-result');
    seen.add(result.fingerprint);
  }
  if (!seen.has(row.resultFingerprint) || !seen.has(row.fenceId)) throw Error('missing-native-lifecycle-result');
  if (!['deletion-confirmed', 'existence-confirmed'].includes(row.state) || row.fenceVersion > row.version || row.version > ceiling ||
      (row.state === 'existence-confirmed' && row.fenceVersion >= row.version) ||
      (row.state === 'deletion-confirmed' && (row.fenceVersion !== row.version || row.fenceId !== row.resultFingerprint))) throw Error('invalid-native-lifecycle-row');
  return row;
}

// The repository accepts this command only through its private owner gate.
// expectedVersion is a local CAS fence, never an invented upstream version.
export function validateNativeLifecycleChange(change) {
  exact(change, ['kind', 'id', 'state', 'expectedVersion', 'fenceId', 'fenceVersion', 'resultFingerprint', 'profileId', 'profileVersion']);
  if (!nativeObjectKinds.includes(change.kind) || !['deletion-confirmed', 'existence-confirmed'].includes(change.state)) throw Error('invalid-native-lifecycle-change');
  id(change.id); id(change.profileId); version(change.profileVersion); fingerprint(change.resultFingerprint);
  if (!Number.isSafeInteger(change.expectedVersion) || change.expectedVersion < 0) throw Error('invalid-native-lifecycle-version');
  if (change.state === 'deletion-confirmed') {
    if (change.fenceId !== null || change.fenceVersion !== null) throw Error('invalid-native-lifecycle-change');
  } else { fingerprint(change.fenceId); version(change.fenceVersion); }
  return change;
}

export function applyNativeLifecycle(current, change) {
  validateNativeLifecycleChange(change);
  const kind = lifecycleKind(change.kind), prior = current[kind]?.[change.id];
  const semantic = nativeLifecycleSemantic(change), consumed = prior?.results.find(result => result.fingerprint === change.resultFingerprint);
  if (consumed) {
    if (consumed.semantic !== semantic) throw Error('native-lifecycle-result-conflict');
    return current;
  }
  if ((prior?.version ?? 0) !== change.expectedVersion) throw Error('native-lifecycle-version-conflict');
  if (change.state === 'existence-confirmed' && (prior?.state !== 'deletion-confirmed' || prior.fenceId !== change.fenceId || prior.fenceVersion !== change.fenceVersion)) throw Error('native-lifecycle-fence-conflict');
  if (prior?.results.length >= MAX_NATIVE_LIFECYCLE_RESULTS) throw Error('native-lifecycle-results-capacity');
  const next = structuredClone(current);
  next.format = NATIVE_LIFECYCLE_FACTS;
  for (const table of nativeLifecycleKinds) next[table] ??= {};
  next.revision++;
  next[kind][change.id] = {id: change.id, state: change.state, version: next.revision,
    fenceId: change.state === 'deletion-confirmed' ? change.resultFingerprint : prior.fenceId,
    fenceVersion: change.state === 'deletion-confirmed' ? next.revision : prior.fenceVersion,
    resultFingerprint: change.resultFingerprint, profileId: change.profileId, profileVersion: change.profileVersion,
    results: [...(prior?.results ?? []), {fingerprint: change.resultFingerprint, semantic}]};
  return next;
}

export function nativeCommandKeys(command, next) {
  const result = Object.fromEntries(nativeKinds(next).map(kind => [kind, []]));
  result.projects = (command.batch?.projects ?? []).map(row => row.id);
  result.refs = [...new Set([...(command.batch?.refs ?? []).map(row => row.id), ...(command.batch?.membership ?? []).map(row => row.id)])];
  if (command.lifecycle) result[lifecycleKind(command.lifecycle.kind)] = [command.lifecycle.id];
  return result;
}

// Once lifecycle data exists, the same-revision recovery shadow must match the
// exact root committed with this marker. An older, valid codec is not a backup.
export function nativeLifecycleMarker(root, checksum) {
  return hasNativeLifecycle(root) ? {lifecycleRootChecksum: checksum} : {};
}
export function verifyNativeLifecycleMarker(marker, root, checksum) {
  if (marker?.lifecycleRootChecksum !== undefined || hasNativeLifecycle(root)) {
    if (!hasNativeLifecycle(root) || marker?.lifecycleRootChecksum !== checksum) throw Error('native-lifecycle-root-conflict');
  }
}
