import {digest, stable} from '../../data/hash.mjs';
import {boundedJSON, exact, integer, boundedText} from '../model/schema-runtime.mjs';
import {validateSourceScope} from '../evidence/metadata.mjs';
import {assertRegisteredProDatabase} from './storage-registry.mjs';
import {emptyBudgetLedger, validateBudgetLedger, configureBudgetPolicies, reserveBudget,
  markBudgetDispatched, releaseReservation, settleReservation} from '../jobs/budget.mjs';
import {validateJob, admitJob, transitionJob, recoverJob} from '../jobs/lifecycle.mjs';

/** Opt-in SAME-database billing adapter; never opens/upgrades a database and is
 * not imported by production/Free. One installation root intentionally spans
 * scopes so account changes cannot reset a payer's budget. The existing owner
 * supplies its connection and a synchronous live RAM-authority verifier.
 *
 * Legacy readers query their own actual scope keys; all billing root/journal
 * payload.scopeKey values use this distinct namespace. This does not constitute
 * production reader/backup/GC approval: the shared owner must register codec,
 * capacity, retention, backup exclusions and minimum-binary rules before enabling.
 * No credential, grant, provider payload or model response is stored here.
 */
export const BILLING_NAMESPACE = 'vaiwl-pro-billing/1';
export const billingRootKey = JSON.stringify([BILLING_NAMESPACE, 'installation']);
export const billingOperationKey = operationId => JSON.stringify([billingRootKey, operationId]);
export const BILLING_INTEGRATION_STATUS = Object.freeze({productionEnabled: false,
  sharedCodecRegistration: 'required', backupRegistration: 'required', garbageCollectionRegistration: 'required',
  minimumReaderReview: 'required', networkEffects: false});
const STORES = ['b23_states', 'b23_operations'];
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_JOBS = 1000;
const clone = value => structuredClone(value);
const operationIdOK = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) throw Error('invalid-billing-operation-id'); return value; };
const stateData = root => ({ledger: root.ledger, jobs: root.jobs});
const stateDigest = root => digest(stateData(root));
const envelope = (key, payload) => ({key, payload, checksum: digest(payload)});
function unpack(row, key) {
  const captured = boundedJSON(row, {maxBytes: MAX_BYTES + 4096, maxNodes: 500000, maxDepth: 32});
  exact(captured, ['key', 'payload', 'checksum']);
  if (captured.key !== key || captured.checksum !== digest(captured.payload)) throw Error('billing-corrupt-record');
  return captured.payload;
}
function emptyRoot() {
  return {format: 'vaiwl-pro-billing-root/1', minimumReader: BILLING_NAMESPACE, scopeKey: billingRootKey,
    revision: 0, ledger: emptyBudgetLedger(), jobs: {}, operationIds: []};
}
function validateRoot(input) {
  const root = boundedJSON(input, {maxBytes: MAX_BYTES, maxNodes: 500000, maxDepth: 32});
  exact(root, ['format', 'minimumReader', 'scopeKey', 'revision', 'ledger', 'jobs', 'operationIds']);
  if (root.format !== 'vaiwl-pro-billing-root/1' || root.minimumReader !== BILLING_NAMESPACE || root.scopeKey !== billingRootKey) throw Error('billing-reader-incompatible');
  integer(root.revision); validateBudgetLedger(root.ledger);
  if (!root.jobs || typeof root.jobs !== 'object' || Array.isArray(root.jobs) || Object.keys(root.jobs).length > MAX_JOBS) throw Error('billing-job-capacity');
  if (!Array.isArray(root.operationIds) || root.operationIds.length > 10000 || new Set(root.operationIds).size !== root.operationIds.length || root.operationIds.length !== root.revision) throw Error('invalid-billing-journal-index');
  root.operationIds.forEach(operationIdOK);
  for (const [id, row] of Object.entries(root.jobs)) {
    exact(row, ['scope', 'checkpoint']); validateSourceScope(row.scope); validateJob(row.checkpoint);
    if (row.scope.persistence !== 'same-idb' || row.checkpoint.id !== id ||
        (row.checkpoint.inputVersions && row.checkpoint.inputVersions.scopeKey !== row.scope.key)) throw Error('invalid-persistent-job');
    const reservation = Object.values(root.ledger.reservations).find(record => record.reservation.jobId === id);
    if (['reserved', 'dispatched', 'outcome-unknown'].includes(row.checkpoint.state) && row.checkpoint.modelBinding !== null) {
      if (!reservation || reservation.scopeKey !== row.scope.key || row.checkpoint.reservationId !== reservation.reservation.id) throw Error('job-reservation-mismatch');
      if (row.checkpoint.state === 'reserved' && reservation.reservation.status !== 'reserved') throw Error('job-reservation-mismatch');
      if (['dispatched', 'outcome-unknown'].includes(row.checkpoint.state) && reservation.reservation.status !== 'sent-uncertain') throw Error('job-reservation-mismatch');
    }
  }
  for (const record of Object.values(root.ledger.reservations)) {
    const row = root.jobs[record.reservation.jobId];
    if (!row || row.scope.key !== record.scopeKey) throw Error('orphan-billing-reservation');
  }
  return root;
}
function validateLog(input) {
  const log = boundedJSON(input, {maxBytes: 131072, maxNodes: 20000, maxDepth: 24});
  exact(log, ['format', 'scopeKey', 'operationId', 'sequence', 'fingerprint', 'actorScopeKey', 'action', 'beforeDigest', 'afterDigest', 'result']);
  if (log.format !== 'vaiwl-pro-billing-journal/1' || log.scopeKey !== billingRootKey) throw Error('billing-reader-incompatible');
  operationIdOK(log.operationId); integer(log.sequence); boundedText(log.actorScopeKey, 1024); boundedText(log.action, 64);
  for (const key of ['fingerprint', 'beforeDigest', 'afterDigest']) if (typeof log[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(log[key])) throw Error('invalid-billing-digest');
  if (log.result?.revision !== log.sequence) throw Error('invalid-billing-result');
  return log;
}
function checkpointRow(root, id, scope) {
  boundedText(id, 128); const row = root.jobs[id];
  if (!row) throw Error('missing-billing-job');
  if (row.scope.key !== scope.key || row.scope.persistence !== 'same-idb') throw Error('cross-scope-job-denied');
  return row;
}
function reservationRow(root, jobId) {
  const found = Object.values(root.ledger.reservations).find(row => row.reservation.jobId === jobId);
  if (!found) throw Error('missing-job-reservation');
  return found;
}
function cancelJob(root, jobId, reason) {
  const row = root.jobs[jobId], checkpoint = row.checkpoint;
  const reservation = Object.values(root.ledger.reservations).find(item => item.reservation.jobId === jobId)?.reservation;
  if (reservation?.status === 'reserved') root.ledger = releaseReservation(root.ledger, reservation.id, reservation.revision).ledger;
  row.checkpoint = transitionJob(checkpoint, {type: 'cancel', reason});
}

/** This reducer is deliberately private. Store clients cannot provide code,
 * generic patches, external effects or arbitrary writes. */
function applyCommand(current, command, scope, now) {
  const root = clone(current), changedJobs = [];
  let detail = null;
  const rowFor = id => checkpointRow(root, id, scope);
  switch (command.type) {
    case 'CONFIGURE_POLICIES': {
      exact(command, ['type', 'policies']);
      const affected = new Set(command.policies.filter(policy => {
        const old = root.ledger.policies[policy.id];
        return old && (policy.ceiling < old.ceiling || policy.pricingVersion !== old.pricingVersion);
      }).map(policy => policy.billingProfileId));
      root.ledger = configureBudgetPolicies(root.ledger, command.policies, root.ledger.revision);
      // Tightening cannot leave an unsent reserved job eligible for dispatch.
      // Release its reservation and cancel; any future task requires new intent.
      for (const [jobId, row] of Object.entries(root.jobs)) {
        const reservation = Object.values(root.ledger.reservations).find(item => item.reservation.jobId === jobId)?.reservation;
        if (reservation && affected.has(reservation.billingProfileId) && reservation.status === 'reserved') {
          cancelJob(root, jobId, 'budget-tightened'); changedJobs.push(jobId);
        }
      }
      detail = {policyIds: command.policies.map(policy => policy.id)};
      break;
    }
    case 'QUEUE_JOB': {
      exact(command, ['type', 'checkpoint']); const checkpoint = validateJob(command.checkpoint);
      if (!['queued', 'paused'].includes(checkpoint.state)) throw Error('new-job-must-be-unsent');
      if (checkpoint.inputVersions?.scopeKey !== scope.key && checkpoint.state === 'queued') throw Error('cross-scope-job-denied');
      if (root.jobs[checkpoint.id] && root.jobs[checkpoint.id].scope.key !== scope.key) throw Error('cross-scope-job-denied');
      const admitted = admitJob(Object.values(root.jobs).filter(row => row.scope.key === scope.key).map(row => row.checkpoint), checkpoint);
      if (admitted.admitted) { root.jobs[checkpoint.id] = {scope: clone(scope), checkpoint}; changedJobs.push(checkpoint.id); }
      detail = {jobId: admitted.checkpoint.id, admitted: admitted.admitted};
      break;
    }
    case 'RESERVE_JOB': {
      exact(command, ['type', 'jobId', 'reservationId', 'maximum', 'billingProfileId', 'providerProfileId', 'currency', 'priceCardVersion', 'expectedBudgetRevisions']);
      const row = rowFor(command.jobId);
      if (row.checkpoint.state !== 'queued' || !row.checkpoint.modelBinding || row.checkpoint.modelBinding.priceCardVersion !== command.priceCardVersion) throw Error('job-not-reservable');
      const reserved = reserveBudget(root.ledger, {id: command.reservationId, jobId: command.jobId, scope,
        billingProfileId: command.billingProfileId, providerProfileId: command.providerProfileId, currency: command.currency,
        priceCardVersion: command.priceCardVersion, maximum: command.maximum, expectedBudgetRevisions: command.expectedBudgetRevisions, now});
      root.ledger = reserved.ledger; row.checkpoint = transitionJob(row.checkpoint, {type: 'reserve', reservationId: command.reservationId});
      detail = {reservation: reserved.reservation}; changedJobs.push(command.jobId);
      break;
    }
    case 'DISPATCH_JOB': {
      exact(command, ['type', 'jobId']); const row = rowFor(command.jobId);
      if (Object.values(root.jobs).some(item => item.checkpoint.state === 'dispatched')) throw Error('installation-model-concurrency-limit');
      if (row.checkpoint.modelBinding) {
        const reservation = reservationRow(root, command.jobId).reservation;
        root.ledger = markBudgetDispatched(root.ledger, reservation.id, reservation.revision).ledger;
      }
      row.checkpoint = transitionJob(row.checkpoint, {type: 'dispatch'}); changedJobs.push(command.jobId);
      detail = {checkpoint: row.checkpoint, networkDispatched: false};
      break;
    }
    case 'COMPLETE_JOB': {
      exact(command, ['type', 'jobId', 'resultDigest', 'actualCharge', 'reportedExactChargeDecimal']);
      const row = rowFor(command.jobId);
      if (row.checkpoint.state !== 'dispatched') throw Error('job-result-not-expected');
      if (row.checkpoint.modelBinding) {
        const reservation = reservationRow(root, command.jobId).reservation;
        const settled = settleReservation(root.ledger, reservation.id, reservation.revision,
          {actualCharge: command.actualCharge, reportedExactChargeDecimal: command.reportedExactChargeDecimal});
        root.ledger = settled.ledger;
        detail = {exceededReservation: settled.exceededReservation};
      } else if (command.actualCharge !== 0 || command.reportedExactChargeDecimal !== null) throw Error('local-job-cannot-charge');
      row.checkpoint = transitionJob(row.checkpoint, {type: 'result', resultDigest: command.resultDigest}); changedJobs.push(command.jobId);
      break;
    }
    case 'ADVANCE_RESULT': {
      exact(command, ['type', 'jobId', 'event']); const row = rowFor(command.jobId);
      if (command.event.type === 'validate') exact(command.event, ['type', 'currentVersions', 'awaitingReview', 'proposalId']);
      else if (command.event.type === 'commit') exact(command.event, ['type', 'operationId']);
      else throw Error('result-event-not-allowed');
      row.checkpoint = transitionJob(row.checkpoint, command.event); changedJobs.push(command.jobId);
      break;
    }
    case 'CANCEL_JOB': {
      exact(command, ['type', 'jobId', 'reason']); rowFor(command.jobId); boundedText(command.reason, 200);
      cancelJob(root, command.jobId, command.reason); changedJobs.push(command.jobId);
      detail = {checkpoint: root.jobs[command.jobId].checkpoint};
      break;
    }
    case 'RECONCILE_CHARGE': {
      exact(command, ['type', 'jobId', 'actualCharge', 'reportedExactChargeDecimal']);
      const row = rowFor(command.jobId), reservation = reservationRow(root, command.jobId).reservation;
      if (!['outcome-unknown', 'dispatched'].includes(row.checkpoint.state)) throw Error('job-not-uncertain');
      const settled = settleReservation(root.ledger, reservation.id, reservation.revision,
        {actualCharge: command.actualCharge, reportedExactChargeDecimal: command.reportedExactChargeDecimal});
      root.ledger = settled.ledger;
      row.checkpoint = validateJob({state: 'cancelled', id: row.checkpoint.id, inputFingerprint: row.checkpoint.inputFingerprint,
        modelBinding: row.checkpoint.modelBinding, reason: 'charge-reconciled-no-result-replay'});
      changedJobs.push(command.jobId); detail = {exceededReservation: settled.exceededReservation};
      break;
    }
    case 'RECONCILE_NO_CHARGE': {
      exact(command, ['type', 'jobId']); const row = rowFor(command.jobId), reservation = reservationRow(root, command.jobId).reservation;
      if (!['outcome-unknown', 'dispatched'].includes(row.checkpoint.state)) throw Error('job-not-uncertain');
      root.ledger = releaseReservation(root.ledger, reservation.id, reservation.revision, {providerConfirmedNoCharge: true}).ledger;
      row.checkpoint = validateJob({state: 'cancelled', id: row.checkpoint.id, inputFingerprint: row.checkpoint.inputFingerprint,
        modelBinding: row.checkpoint.modelBinding, reason: 'provider-confirmed-no-charge'});
      changedJobs.push(command.jobId);
      break;
    }
    case 'RECOVER_SCOPE': {
      exact(command, ['type']); const actions = [];
      for (const [id, row] of Object.entries(root.jobs)) if (row.scope.key === scope.key) {
        const recovered = recoverJob(row.checkpoint, {scope, authorized: false});
        if (digest(row.checkpoint) !== digest(recovered.checkpoint)) { row.checkpoint = recovered.checkpoint; changedJobs.push(id); }
        actions.push({jobId: id, action: recovered.action, automaticDispatch: false});
      }
      detail = {actions, automaticDispatch: false};
      break;
    }
    default: throw Error('unsupported-billing-command');
  }
  return {root, result: {changedJobs, detail}};
}

export function createSameDatabaseBillingStore({connection, verifyAuthority, enabled = false, clock = () => new Date().toISOString()} = {}) {
  if (typeof connection !== 'function' || typeof verifyAuthority !== 'function' || typeof clock !== 'function') throw Error('billing-shared-owner-required');
  function guard(authority, intent, signal) {
    if (!enabled) throw Error('billing-integration-disabled');
    if (signal?.aborted) throw Error('aborted');
    // No structural check of a caller grant can replace this owner callback.
    // It must resolve the exact RAM object and authorize the requested action,
    // including separate admin/billing/reconciliation capabilities as applicable.
    const resolved = verifyAuthority(authority, intent);
    if (resolved?.then) { if (resolved instanceof Promise) resolved.catch(() => {}); throw Error('async-billing-authority-denied'); }
    const scope = validateSourceScope(resolved);
    if (scope.persistence !== 'same-idb') throw Error('billing-persistent-scope-required');
    return clone(scope);
  }
  async function read(authority, signal) {
    const initialScope = guard(authority, {action: 'READ_BILLING', phase: 'before-connection'}, signal), db = assertRegisteredProDatabase(await connection());
    if (stable(guard(authority, {action: 'READ_BILLING', phase: 'before-transaction'}, signal)) !== stable(initialScope)) throw Error('billing-authority-scope-changed');
    return new Promise((resolve, reject) => {
      let tx, current, failure, logs = [];
      const fail = error => { failure = error; try { tx?.abort(); } catch {} };
      const check = () => { const scope = guard(authority, {action: 'READ_BILLING', phase: 'inside-transaction'}, signal); if (stable(scope) !== stable(initialScope)) throw Error('billing-authority-scope-changed'); };
      const abort = () => fail(Error('aborted'));
      try {
        tx = db.transaction(STORES, 'readonly'); signal?.addEventListener('abort', abort, {once: true});
        const request = tx.objectStore('b23_states').get(billingRootKey);
        request.onsuccess = () => {
          try {
            check(); current = request.result ? validateRoot(unpack(request.result, billingRootKey)) : emptyRoot();
            if (!request.result) {
              const orphan = tx.objectStore('b23_operations').index('scopeKey').openCursor(billingRootKey);
              orphan.onsuccess = () => { try { check(); if (orphan.result) throw Error('billing-missing-root-with-history'); } catch (error) { fail(error); } };
            }
            for (const id of current.operationIds) {
              const key = billingOperationKey(id), q = tx.objectStore('b23_operations').get(key);
              q.onsuccess = () => { try { check(); if (!q.result) throw Error('billing-missing-journal'); logs.push(validateLog(unpack(q.result, key))); } catch (error) { fail(error); } };
            }
          } catch (error) { fail(error); }
        };
        tx.oncomplete = () => {
          signal?.removeEventListener('abort', abort);
          try {
            check(); logs.sort((a, b) => a.sequence - b.sequence);
            for (let i = 0; i < logs.length; i++) if (logs[i].sequence !== i + 1 || logs[i].operationId !== current.operationIds[i] ||
                (i && logs[i].beforeDigest !== logs[i - 1].afterDigest)) throw Error('billing-journal-chain-invalid');
            if (logs.length && logs.at(-1).afterDigest !== stateDigest(current)) throw Error('billing-journal-root-mismatch');
            resolve({revision: current.revision, ledger: clone(current.ledger), jobs: clone(current.jobs), records: logs});
          } catch (error) { reject(error); }
        };
        tx.onabort = () => { signal?.removeEventListener('abort', abort); reject(failure ?? tx.error ?? Error('billing-read-aborted')); };
        tx.onerror = () => {};
      } catch (error) { signal?.removeEventListener('abort', abort); reject(error); }
    });
  }
  async function transact(authority, request, signal) {
    const input = boundedJSON(request, {maxBytes: 131072, maxNodes: 20000, maxDepth: 24});
    exact(input, ['operationId', 'expectedRevision', 'command']); operationIdOK(input.operationId); integer(input.expectedRevision);
    boundedText(input.command?.type, 64);
    const fingerprint = digest(input), intent = {action: input.command.type, operationId: input.operationId, command: clone(input.command)};
    const initialScope = guard(authority, {...intent, phase: 'before-connection'}, signal), db = assertRegisteredProDatabase(await connection());
    const priorScope = guard(authority, {...intent, phase: 'before-transaction'}, signal);
    if (stable(priorScope) !== stable(initialScope)) throw Error('billing-authority-scope-changed');
    return new Promise(resolve => {
      let tx, outcome = null, finished = false;
      const fail = reason => { if (finished) return; outcome = {ok: false, reason}; try { tx?.abort(); } catch {} };
      const check = (root = null) => {
        try {
          const scope = guard(authority, {...intent, phase: 'inside-transaction',
            job: input.command.jobId && root ? clone(root.jobs[input.command.jobId] ?? null) : null}, signal);
          if (stable(scope) !== stable(initialScope)) throw Error('billing-authority-scope-changed'); return scope;
        } catch (error) { fail(error.message); return null; }
      };
      const abort = () => fail('aborted');
      try {
        tx = db.transaction(STORES, 'readwrite'); signal?.addEventListener('abort', abort, {once: true});
        const opKey = billingOperationKey(input.operationId), logRequest = tx.objectStore('b23_operations').get(opKey);
        logRequest.onsuccess = () => {
          if (!check()) return;
          try {
            if (logRequest.result) {
              const old = validateLog(unpack(logRequest.result, opKey));
              if (old.fingerprint !== fingerprint || old.actorScopeKey !== initialScope.key) { fail('billing-operation-replay-conflict'); return; }
              const liveRoot = tx.objectStore('b23_states').get(billingRootKey);
              liveRoot.onsuccess = () => { try { if (!check()) return; if (!liveRoot.result) throw Error('billing-missing-root-with-history'); const root = validateRoot(unpack(liveRoot.result, billingRootKey)); if (!root.operationIds.includes(input.operationId)) throw Error('billing-orphan-receipt'); outcome = {ok: true, value: clone(old.result), replayed: true}; } catch (error) { fail(error.message); } };
              return;
            }
            const rootRequest = tx.objectStore('b23_states').get(billingRootKey);
            rootRequest.onsuccess = () => {
              if (!check()) return;
              try {
                const current = rootRequest.result ? validateRoot(unpack(rootRequest.result, billingRootKey)) : emptyRoot();
                if (!rootRequest.result) {
                  const orphan = tx.objectStore('b23_operations').index('scopeKey').openCursor(billingRootKey);
                  orphan.onsuccess = () => { try { if (!check()) return; if (orphan.result) throw Error('billing-missing-root-with-history'); } catch (error) { fail(error.message); } };
                }
                if (current.revision !== input.expectedRevision) throw Error('billing-revision-conflict');
                const scope = check(current); if (!scope) return;
                const reduced = applyCommand(current, input.command, scope, clock());
                const sequence = current.revision + 1;
                const next = validateRoot({...reduced.root, revision: sequence, operationIds: [...current.operationIds, input.operationId]});
                const result = {...reduced.result, revision: sequence, ledgerRevision: next.ledger.revision};
                const log = validateLog({format: 'vaiwl-pro-billing-journal/1', scopeKey: billingRootKey, operationId: input.operationId,
                  sequence, fingerprint, actorScopeKey: scope.key, action: input.command.type,
                  beforeDigest: stateDigest(current), afterDigest: stateDigest(next), result});
                if (!check(current)) return;
                const stateWrite = tx.objectStore('b23_states').put(envelope(billingRootKey, next)); stateWrite.onsuccess = () => { check(current); };
                const logWrite = tx.objectStore('b23_operations').put(envelope(opKey, log)); logWrite.onsuccess = () => { check(current); };
                if (!check(current)) return;
                outcome = {ok: true, value: clone(result), replayed: false};
              } catch (error) { fail(error.message); }
            };
          } catch (error) { fail(error.message); }
        };
        tx.oncomplete = () => {
          finished = true; signal?.removeEventListener('abort', abort);
          try { const scope = guard(authority, {...intent, phase: 'after-commit'}, signal); if (stable(scope) !== stable(initialScope)) throw Error('scope-changed');
            resolve(outcome ?? {ok: false, reason: 'billing-no-result'});
          } catch { resolve({ok: false, reason: 'billing-stale-after-commit', committed: true}); }
        };
        tx.onabort = () => { finished = true; signal?.removeEventListener('abort', abort);
          resolve(outcome?.ok === false ? outcome : {ok: false, reason: tx.error?.name ?? 'billing-transaction-aborted'}); };
        tx.onerror = () => {};
      } catch (error) { signal?.removeEventListener('abort', abort); fail(error.message); resolve({ok: false, reason: error.message}); }
    });
  }
  return Object.freeze({read, transact});
}
