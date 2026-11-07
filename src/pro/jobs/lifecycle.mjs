import {digest} from '../../data/hash.mjs';
import {boundedJSON, exact, boundedText} from '../model/schema-runtime.mjs';
import {validateRevisionVector, validateSourceScope, sameVersions} from '../evidence/metadata.mjs';

const phases = ['queued', 'reserved', 'dispatched', 'result-ready', 'validated', 'awaiting-review', 'committed', 'paused', 'cancelled', 'stale', 'failed', 'outcome-unknown'];
const hash = value => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) throw Error('invalid-job-digest'); return value; };
export function validateJob(input) {
  const job = boundedJSON(input, {maxBytes: 65536});
  const phaseFields = {queued: ['dedupeKey', 'inputVersions'], reserved: ['reservationId', 'inputVersions'],
    dispatched: ['reservationId', 'inputVersions', 'dispatchRecorded'], 'result-ready': ['resultDigest', 'inputVersions'],
    validated: ['proposalId'], 'awaiting-review': ['proposalId'], committed: ['operationId'], paused: ['reason'],
    stale: ['reason'], cancelled: ['reason'], failed: ['reason'], 'outcome-unknown': ['reservationId']}[job.state];
  if (!phaseFields) throw Error('invalid-job-state');
  exact(job, ['state', 'id', 'inputFingerprint', 'modelBinding', ...phaseFields]);
  boundedText(job.id, 128); hash(job.inputFingerprint);
  if (job.modelBinding !== null) {
    exact(job.modelBinding, ['modelProfileId', 'modelVersion', 'promptVersion', 'outputSchemaVersion', 'priceCardVersion']);
    for (const key of ['modelProfileId', 'modelVersion', 'promptVersion', 'outputSchemaVersion']) boundedText(job.modelBinding[key], 128);
    if (job.modelBinding.priceCardVersion !== null) boundedText(job.modelBinding.priceCardVersion, 128);
  }
  if (job.inputVersions) validateRevisionVector(job.inputVersions);
  if (job.state === 'dispatched' && job.dispatchRecorded !== true) throw Error('dispatch-marker-required');
  if ('reservationId' in job && job.reservationId !== null) boundedText(job.reservationId, 128);
  if (job.state === 'outcome-unknown' && !job.reservationId) throw Error('unknown-without-reservation');
  for (const key of ['dedupeKey', 'resultDigest']) if (key in job) hash(job[key]);
  for (const key of ['proposalId', 'operationId', 'reason']) if (key in job) boundedText(job[key], 256);
  if (job.state === 'paused' && !['budget', 'foreground-priority', 'capability', 'consent'].includes(job.reason)) throw Error('invalid-pause-reason');
  return job;
}

export function queueJob({id, scope, versions, inputFingerprint, modelBinding = null, mode = 'pro-default-none', processing = 'local', foregroundBusy = false, backgroundWhileNative = false}) {
  validateSourceScope(scope); validateRevisionVector(versions);
  if (scope.key !== versions.scopeKey) throw Error('scope-mismatch');
  if (!['native', 'pro-default-none', 'pro-cross-project'].includes(mode) || !['off', 'local', 'cloud'].includes(processing) ||
      typeof foregroundBusy !== 'boolean' || typeof backgroundWhileNative !== 'boolean') throw Error('invalid-job-policy');
  if (processing === 'cloud' && (!modelBinding || !modelBinding.priceCardVersion)) throw Error('cloud-profile-and-price-required');
  if (scope.persistence === 'memory' && (modelBinding !== null || processing !== 'local')) throw Error('session-paid-job-denied');
  if (mode === 'native' && !backgroundWhileNative) return validateJob({state: 'paused', id, inputFingerprint, modelBinding, reason: 'foreground-priority'});
  if (processing === 'off') return validateJob({state: 'paused', id, inputFingerprint, modelBinding, reason: 'consent'});
  if (foregroundBusy) return validateJob({state: 'paused', id, inputFingerprint, modelBinding, reason: 'foreground-priority'});
  return validateJob({state: 'queued', id, inputFingerprint, modelBinding, dedupeKey: digest([scope.key, inputFingerprint, modelBinding]), inputVersions: versions});
}
export function transitionJob(current, event) {
  const job = validateJob(current), base = {id: job.id, inputFingerprint: job.inputFingerprint, modelBinding: job.modelBinding};
  switch (event.type) {
    case 'reserve':
      if (job.state !== 'queued' || !job.modelBinding) throw Error('job-transition-denied');
      return validateJob({...base, state: 'reserved', reservationId: event.reservationId, inputVersions: job.inputVersions});
    case 'dispatch':
      if (!(job.state === 'reserved' || (job.state === 'queued' && job.modelBinding === null))) throw Error('job-not-dispatchable');
      return validateJob({...base, state: 'dispatched', reservationId: job.reservationId ?? null, inputVersions: job.inputVersions, dispatchRecorded: true});
    case 'result':
      if (job.state !== 'dispatched') throw Error('job-transition-denied');
      return validateJob({...base, state: 'result-ready', resultDigest: event.resultDigest, inputVersions: job.inputVersions});
    case 'validate':
      if (job.state !== 'result-ready' || !sameVersions(job.inputVersions, event.currentVersions)) throw Error('stale-job-result');
      return validateJob({...base, state: event.awaitingReview ? 'awaiting-review' : 'validated', proposalId: event.proposalId});
    case 'commit':
      if (!['validated', 'awaiting-review'].includes(job.state)) throw Error('job-transition-denied');
      return validateJob({...base, state: 'committed', operationId: event.operationId});
    case 'cancel':
      if (job.state === 'committed') return job;
      if (job.state === 'dispatched' && job.reservationId) return validateJob({...base, state: 'outcome-unknown', reservationId: job.reservationId});
      if (job.state === 'outcome-unknown') return job;
      return validateJob({...base, state: 'cancelled', reason: event.reason ?? 'cancelled'});
    case 'pause':
      if (!['queued', 'reserved'].includes(job.state)) throw Error('job-transition-denied');
      return validateJob({...base, state: 'paused', reason: event.reason});
    case 'fail':
      if (job.state === 'dispatched' && job.reservationId) return validateJob({...base, state: 'outcome-unknown', reservationId: job.reservationId});
      if (job.state === 'outcome-unknown' || job.state === 'committed') return job;
      return validateJob({...base, state: 'failed', reason: event.reason ?? 'failed'});
    default: throw Error('unknown-job-event');
  }
}

/** No grant/confirmation is rehydrated. Persisted states never trigger network;
 * callers receive instructions and must acquire fresh owner authority. */
export function recoverJob(current, {scope, currentVersions = null, authorized = false} = {}) {
  const job = validateJob(current); validateSourceScope(scope);
  if (scope.persistence === 'memory') return {checkpoint: null, action: 'discard-session-job', automaticDispatch: false};
  const base = {id: job.id, inputFingerprint: job.inputFingerprint, modelBinding: job.modelBinding};
  if (job.state === 'dispatched') {
    const checkpoint = job.reservationId ? validateJob({...base, state: 'outcome-unknown', reservationId: job.reservationId}) :
      validateJob({...base, state: 'stale', reason: 'local-result-lost'});
    return {checkpoint, action: job.reservationId ? 'hold-and-reconcile' : 'revalidate-local-input', automaticDispatch: false};
  }
  if (job.state === 'outcome-unknown') return {checkpoint: job, action: 'hold-and-reconcile', automaticDispatch: false};
  if (job.state === 'committed') return {checkpoint: job, action: 'return-committed-operation', automaticDispatch: false};
  if (!authorized) return {checkpoint: job, action: 'await-new-authority', automaticDispatch: false};
  if (job.inputVersions && (!currentVersions || !sameVersions(job.inputVersions, currentVersions)))
    return {checkpoint: validateJob({...base, state: 'stale', reason: 'input-revalidation-required'}), action: 'replan', automaticDispatch: false};
  return {checkpoint: job, action: ['queued', 'reserved'].includes(job.state) ? 'revalidate-before-dispatch' : 'revalidate-before-apply', automaticDispatch: false};
}

/** Scope-wide serialized queue admission. The owner stores the resulting
 * checkpoint in its existing database transaction; this creates no database. */
export function admitJob(jobs, checkpoint, {maxQueued = 100, maxConcurrent = 1} = {}) {
  const candidate = validateJob(checkpoint), all = jobs.map(validateJob);
  if (all.some(job => job.id === candidate.id && digest(job) !== digest(candidate))) throw Error('job-id-conflict');
  const duplicate = all.find(job => job.id === candidate.id || (job.dedupeKey && job.dedupeKey === candidate.dedupeKey && !['failed', 'cancelled', 'stale'].includes(job.state)));
  if (duplicate) return {checkpoint: duplicate, admitted: false, reason: 'deduplicated'};
  if (all.filter(job => ['queued', 'reserved', 'dispatched'].includes(job.state)).length >= maxQueued) throw Error('job-queue-limit');
  if (candidate.state === 'dispatched' && all.filter(job => job.state === 'dispatched').length >= maxConcurrent) throw Error('job-concurrency-limit');
  return {checkpoint: candidate, admitted: true};
}
