import { emptyNativeFacts, validateNativeFacts, applyNativeObservations, invalidateNativeSource } from './native-facts.mjs';
import { freeProjection } from './free-projection.mjs';
import { id } from './state.mjs';
import { digest } from './hash.mjs';

const record = (key, payload) => ({key, payload, checksum: digest(payload)});
function unpack(row) {
  if (!row || row.checksum !== digest(row.payload)) throw Error('corrupt-native-record');
  return row.payload;
}
function fence({guard = () => true, signal} = {}) {
  if (signal?.aborted || guard() !== true) throw Error('stale-binding');
}

export class NativeRepository {
  constructor({baseRepository, observationGate = null, clock = () => new Date().toISOString()}) {
    if (!baseRepository?.open || !baseRepository?.scopeOrThrow) throw Error('b1-repository-required');
    this.base = baseRepository;
    this.observationGate = observationGate;
    this.clock = clock;
  }

  async read(scope, options = {}) {
    const normalized = this.base.scopeOrThrow(scope), db = await this.base.open();
    fence(options);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['native_states', 'native_operations'], 'readonly');
      const request = transaction.objectStore('native_states').get(normalized.key);
      let facts, error;
      request.onsuccess = () => {
        try {
          facts = request.result ? validateNativeFacts(unpack(request.result), normalized) : emptyNativeFacts(normalized);
          const marker = transaction.objectStore('native_operations').get(normalized.key);
          marker.onsuccess = () => {
            try {
              if (!request.result && marker.result) throw Error('missing-native-root');
              if (facts.revision && !marker.result) throw Error('missing-native-marker');
              if (marker.result && unpack(marker.result).revision !== facts.revision) throw Error('native-root-revision-conflict');
            } catch (failure) { error = failure; transaction.abort(); }
          };
        } catch (failure) { error = failure; transaction.abort(); }
      };
      transaction.oncomplete = () => {
        try { fence(options); resolve(facts); } catch (failure) { reject(failure); }
      };
      transaction.onabort = () => reject(error ?? transaction.error ?? Error('native-read-aborted'));
    });
  }

  async snapshot(scope, options = {}) {
    const facts = await this.read(scope, options);
    fence(options);
    return freeProjection(facts, {scope, now: this.clock(), knownState: options.knownState});
  }

  async apply(scope, request, options = {}) {
    const normalized = this.base.scopeOrThrow(scope);
    const authority = this.observationGate?.(normalized);
    if (authority?.channel !== 'synthetic') throw Error('untrusted-native-source');
    const witness = {channel: authority.channel, sourceId: authority.sourceId, generation: authority.generation};
    id(witness.sourceId);
    id(witness.generation);
    return this.mutate(normalized, request, {kind: 'APPLY_NATIVE_OBSERVATIONS', ...witness, batch: request.batch},
      current => applyNativeObservations(current, request.batch, {scope: normalized, ...witness, now: this.clock()}), options);
  }

  async invalidate(scope, request, options = {}) {
    id(request.sourceId);
    return this.mutate(scope, request, {kind: 'INVALIDATE_NATIVE_SOURCE', sourceId: request.sourceId},
      current => invalidateNativeSource(current, request.sourceId, scope), options);
  }

  async mutate(scope, {operationId, expectedRevision}, command, reduce, options) {
    const normalized = this.base.scopeOrThrow(scope);
    id(operationId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw Error('invalid-revision');
    const fingerprint = digest({command, expectedRevision}), db = await this.base.open();
    fence(options);
    return new Promise(resolve => {
      const transaction = db.transaction(['native_states', 'native_operations'], 'readwrite');
      const states = transaction.objectStore('native_states'), operations = transaction.objectStore('native_operations');
      const operationKey = JSON.stringify([normalized.key, operationId]);
      let result;
      const abort = reason => { result = {ok: false, reason}; try { transaction.abort(); } catch {} };
      const check = () => { fence(options); };
      const revoked = () => abort('stale-binding');
      options.signal?.addEventListener('abort', revoked, {once: true});
      const request = states.get(normalized.key);
      request.onsuccess = () => {
        try {
          check();
          const current = request.result ? validateNativeFacts(unpack(request.result), normalized) : emptyNativeFacts(normalized);
          const marker = operations.get(normalized.key);
          marker.onsuccess = () => {
            try {
              check();
              if (!request.result && marker.result) throw Error('missing-native-root');
              if (marker.result && unpack(marker.result).revision !== current.revision) throw Error('native-root-revision-conflict');
              if (current.revision && !marker.result) throw Error('missing-native-marker');
              const receipt = operations.get(operationKey);
              receipt.onsuccess = () => {
                try {
                  check();
                  if (receipt.result) {
                    const prior = unpack(receipt.result);
                    result = prior.fingerprint === fingerprint ? {ok: true, replayed: true, revision: prior.revision, operationId} :
                      {ok: false, reason: 'operation-replay-conflict'};
                    return;
                  }
                  if (current.revision !== expectedRevision) throw Error('revision-conflict');
                  const next = reduce(current);
                  check();
                  states.put(record(normalized.key, next));
                  operations.put(record(normalized.key, {revision: next.revision}));
                  operations.put(record(operationKey, {fingerprint, revision: next.revision, operationId}));
                  check();
                  result = {ok: true, replayed: false, revision: next.revision, operationId};
                } catch (failure) { abort(failure.message); }
              };
            } catch (failure) { abort(failure.message); }
          };
        } catch (failure) { abort(failure.message); }
      };
      transaction.oncomplete = () => {
        options.signal?.removeEventListener('abort', revoked);
        try { check(); resolve(result); } catch { resolve({ok: false, reason: 'stale-after-commit', committed: true}); }
      };
      transaction.onabort = () => {
        options.signal?.removeEventListener('abort', revoked);
        resolve(result?.ok === false ? result : {ok: false, reason: transaction.error?.name ?? 'native-write-aborted'});
      };
      transaction.onerror = () => {};
    });
  }
}
