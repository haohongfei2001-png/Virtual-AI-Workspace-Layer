import { emptyNativeFacts, validateNativeFacts, validateAndMeasureNativeFacts } from './native-facts.mjs';
import { digest, stable, sha256 } from './hash.mjs';
import { id, exact } from './state.mjs';

export const NATIVE_PARTITION_FORMAT = 'vaiwl-native-partitions-v1';
export const nativePartitionKey = (scope, kind, key, revision) => JSON.stringify([scope, 'native-piece', kind, key, revision]);
export const nativeRecoveryKey = scope => JSON.stringify([scope, 'native-recovery']);
export const nativeCheckpointKey = scope => JSON.stringify([scope, 'native-checkpoint']);
export const nativeRecord = (key, payload) => {
  const encoded=stable(payload);
  if (encoded.length > 16 * 1024 * 1024) throw Error('native-record-too-large');
  return {key, payload, checksum: sha256(encoded)};
};
export function nativeUnpack(row) {
  if (!row || row.checksum !== digest(row.payload)) throw Error('corrupt-native-record');
  return row.payload;
}
export const isNativePartitioned = value => value?.format === NATIVE_PARTITION_FORMAT;
export function nativeHeader(manifest, scope) {
  return {...emptyNativeFacts(scope), format: 'vaiwl-native-facts-v2', revision: manifest.revision, sources: manifest.sources};
}
function checkNativeManifestStructure(m, scope) {
  exact(m, ['format', 'scopeKey', 'revision', 'sources', 'projects', 'refs', 'units', 'changes']);
  if (m.format !== NATIVE_PARTITION_FORMAT || m.scopeKey !== emptyNativeFacts(scope).scopeKey ||
      !Number.isSafeInteger(m.revision) || m.revision < 1 || !Number.isSafeInteger(m.units) ||
      m.units < 0 || m.units > 128 * 1024 * 1024) throw Error('invalid-native-manifest');
  validateNativeFacts(nativeHeader(m, scope), scope);
  for (const table of ['projects', 'refs']) {
    const rows=m[table];
    if (!rows || typeof rows!=='object' || Array.isArray(rows)) throw Error('native-partition-capacity');
    const keys=Object.keys(rows);
    if (keys.length > 100000) throw Error('native-partition-capacity');
    for (const key of keys) {
      const version=rows[key];id(key);
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
  return m;
}
export function validateNativeManifest(m, scope) {
  checkNativeManifestStructure(m,scope);
  if(JSON.stringify(m).length>16*1024*1024)throw Error('native-manifest-too-large');
  return m;
}
// Internal write path: the same canonical encoding bounds the record and hashes it.
// Callers cannot supply a precomputed size or opt out of structural validation.
function nativeManifestRecord(key,manifest,scope){
  checkNativeManifestStructure(manifest,scope);
  const encoded=stable(manifest);
  if(encoded.length>16*1024*1024)throw Error('native-manifest-too-large');
  return {key,payload:manifest,checksum:sha256(encoded)};
}

/** Immutable bounded pieces share the original store and root CAS transaction.
 * A partial mutation reads only changed rows and their Project dependencies.
 */
export function loadNativePieces(store, manifest, scope, wanted, done, fail, lookup = null, measureForAudit = false, prefetched = null) {
  const facts = nativeHeader(manifest, scope), pieces = new Map();
  const requested = new Set();
  const order=lookup?{projects:[...wanted.projects],refs:[...wanted.refs]}:null;
  let waiting = 0, launching = true, failed = false;
  const finish = () => {
    if (!waiting && !launching && !failed) {
      try {
        if(order){
          // Bucket callbacks can finish in a different order from the caller's
          // IDs. Preserve stable native navigation order across warm/cold reads.
          const ordered=(table,keys)=>Object.fromEntries([...new Set(keys)].filter(key=>Object.hasOwn(table,key)).map(key=>[key,table[key]]));
          facts.refs=ordered(facts.refs,order.refs);facts.membership=ordered(facts.membership,order.refs);
          const dependencies=Object.values(facts.membership).filter(row=>row.state==='PROJECT').map(row=>row.projectId);
          facts.projects=ordered(facts.projects,[...order.projects,...dependencies]);
        }
        // Ordinary page reads retain their original validation cost. Only the
        // migration audit consumes metrics; both paths fully validate facts.
        if(measureForAudit){const validation=validateAndMeasureNativeFacts(facts,scope);done(facts,{manifest,pieces,validation});}
        else{validateNativeFacts(facts,scope);done(facts,{manifest,pieces});}
      } catch (error) { failed = true; fail(error); }
    }
  };
  const load = (kind, key) => {
    const identity = JSON.stringify([kind, key]);
    if (requested.has(identity)) return;
    requested.add(identity); waiting++;
    const read = version => {
    if(failed)return;
    if(version===undefined){waiting--;finish();return;}
    const physicalKey=nativePartitionKey(manifest.scopeKey,kind,key,version);
    const consume = record => {
      if (failed) return;
      try {
        const piece = nativeUnpack(record);
        exact(piece, kind === 'projects' ? ['scopeKey', 'kind', 'id', 'revision', 'row'] : ['scopeKey', 'kind', 'id', 'revision', 'row', 'membership']);
        if (piece.scopeKey !== manifest.scopeKey || piece.kind !== kind || piece.id !== key ||
            piece.revision !== version || piece.row?.id !== key) throw Error('invalid-native-piece');
        pieces.set(identity, piece); facts[kind][key] = piece.row;
        if (kind === 'refs' && piece.membership) {
          if (piece.membership.id !== key) throw Error('invalid-native-piece');
          facts.membership[key] = piece.membership;
          if (piece.membership.state === 'PROJECT') load('projects', piece.membership.projectId);
        }
        waiting--; finish();
      } catch (error) { failed = true; fail(error); }
    };
    if(prefetched?.has(physicalKey))consume(prefetched.get(physicalKey));
    else{const request=store.get(physicalKey);request.onsuccess=()=>consume(request.result);}
    };
    if(lookup)lookup(kind,key,read);else read(Object.hasOwn(manifest[kind],key)?manifest[kind][key]:undefined);
  };
  for (const kind of ['projects', 'refs']) for (const key of (order??wanted)[kind]) load(kind, key);
  launching = false; finish();
}

export function saveNativePieces(store, scope, current, next, storage, command, verifyCheckpoint = null) {
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
  const rootRecord=nativeManifestRecord(next.scopeKey,manifest,scope);
  if (prior) {
    const oldCheckpoint = store.get(nativeCheckpointKey(next.scopeKey));
    oldCheckpoint.onsuccess = () => {
      // Only retire pieces superseded before the checkpoint being retained.
      // An unverifiable older checkpoint must not authorize deleting its pieces.
      let old;
      try {
        old = verifyCheckpoint ? verifyCheckpoint(oldCheckpoint.result) : nativeUnpack(oldCheckpoint.result);
        if (!isNativePartitioned(old)) return;
        if (!verifyCheckpoint) validateNativeManifest(old, scope);
      } catch { return; }
      const changed = prior.changes.find(change => change.revision === prior.revision);
      // Recovery deliberately clears change history. Reconcile the older
      // checkpoint once in that case, so its superseded pieces cannot leak.
      for (const kind of ['projects', 'refs']) for (const key of changed?.[kind] ?? Object.keys(old[kind])) {
        const version = old[kind][key];
        if (version && version !== prior[kind][key] && version !== manifest[kind][key]) {
          store.delete(nativePartitionKey(next.scopeKey, kind, key, version));
        }
      }
    };
  }
  // Both atomic roots contain the exact same immutable payload. Hash it once;
  // the key is outside the checksum and no payload mutation occurs between puts.
  store.put({...rootRecord,key:nativeRecoveryKey(next.scopeKey)});
  store.put(rootRecord);
  return manifest;
}
