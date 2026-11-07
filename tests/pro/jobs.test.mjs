import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../src/data/hash.mjs';
import {queueJob, transitionJob, recoverJob, admitJob} from '../../src/pro/jobs/index.mjs';

const scope = {kind: 'verified-scope', key: 'scope_fixture', serverIdentity: 'established', persistence: 'same-idb'};
const versions = {scopeKey: scope.key, authorizationEpoch: 1, sourceGeneration: {source: 1}, nativeFields: {c_a: 1}, overlayRevision: 0,
  targets: {}, constraintRevision: 0, policyVersion: 'p1', evidenceDigest: digest('evidence')};
const binding = {modelProfileId: 'profile', modelVersion: 'snapshot', promptVersion: 'prompt1', outputSchemaVersion: 'vaiwl-pro-model-output/1', priceCardVersion: 'prices1'};
const queued = () => queueJob({id: 'job_fixture', scope, versions, inputFingerprint: digest('input'), modelBinding: binding, processing: 'cloud'});

test('queued → reserved → dispatched → result → reviewed → committed has no skipped paid stage', () => {
  const q = queued(); assert.throws(() => transitionJob(q, {type: 'dispatch'}), /job-not-dispatchable/);
  const r = transitionJob(q, {type: 'reserve', reservationId: 'reservation'}), d = transitionJob(r, {type: 'dispatch'});
  const result = transitionJob(d, {type: 'result', resultDigest: digest('result')});
  const review = transitionJob(result, {type: 'validate', currentVersions: versions, awaitingReview: true, proposalId: 'proposal'});
  const committed = transitionJob(review, {type: 'commit', operationId: 'operation'});
  assert.equal(committed.state, 'committed');
  assert.throws(() => transitionJob(committed, {type: 'dispatch'}), /job-not-dispatchable/);
  assert.equal(recoverJob(committed, {scope}).action, 'return-committed-operation');
});

test('A25 recovery of dispatched paid job keeps unknown reservation and never dispatches', () => {
  const dispatched = transitionJob(transitionJob(queued(), {type: 'reserve', reservationId: 'reservation'}), {type: 'dispatch'});
  const restarted = JSON.parse(JSON.stringify(dispatched));
  const recovered = recoverJob(restarted, {scope, authorized: true, currentVersions: versions});
  assert.equal(recovered.checkpoint.state, 'outcome-unknown'); assert.equal(recovered.action, 'hold-and-reconcile'); assert.equal(recovered.automaticDispatch, false);
  assert.throws(() => transitionJob(recovered.checkpoint, {type: 'dispatch'}), /job-not-dispatchable/);
  assert.equal(transitionJob(dispatched, {type: 'cancel', reason: 'scope-revoked'}).state, 'outcome-unknown');
  assert.equal(transitionJob(dispatched, {type: 'fail', reason: 'network'}).state, 'outcome-unknown');
});

test('A05/A09 late results cancelled on exclusion and stale input require replan', () => {
  const cancelled = transitionJob(queued(), {type: 'cancel', reason: 'processing-excluded'});
  assert.throws(() => transitionJob(cancelled, {type: 'result', resultDigest: digest('late')}), /job-transition-denied/);
  const stale = recoverJob(queued(), {scope, authorized: true, currentVersions: {...versions, authorizationEpoch: 2}});
  assert.equal(stale.checkpoint.state, 'stale'); assert.equal(stale.automaticDispatch, false);
  assert.equal(recoverJob(queued(), {scope}).action, 'await-new-authority');
});

test('A26 Free mode or foreground work pauses; explicit background choice and current grant are independent', () => {
  const base = {id: 'job', scope, versions, inputFingerprint: digest('input')};
  assert.equal(queueJob({...base, mode: 'native'}).state, 'paused');
  assert.equal(queueJob({...base, mode: 'native', backgroundWhileNative: true}).state, 'queued');
  assert.equal(queueJob({...base, foregroundBusy: true}).state, 'paused');
  assert.equal(queueJob({...base, processing: 'off'}).reason, 'consent');
});

test('A04 session jobs stay local RAM and are discarded on restart', () => {
  const session = {kind: 'browser-local-session', key: scope.key, serverIdentity: 'not-established', persistence: 'memory'};
  const local = queueJob({id: 'local', scope: session, versions, inputFingerprint: digest('input')});
  assert.equal(recoverJob(local, {scope: session}).checkpoint, null);
  assert.throws(() => queueJob({id: 'paid', scope: session, versions, inputFingerprint: digest('input'), modelBinding: binding, processing: 'cloud'}), /session-paid-job-denied/);
});

test('bounded queue deduplicates same semantic input and rejects conflicting job identity', () => {
  const q = queued(); assert.equal(admitJob([q], q).admitted, false);
  assert.equal(admitJob([q], {...q, id: 'another_job'}).reason, 'deduplicated');
  assert.throws(() => admitJob([q], {...q, inputFingerprint: digest('other')}), /job-id-conflict/);
  assert.throws(() => admitJob([q], {...q, id: 'new', dedupeKey: digest('new')}, {maxQueued: 1}), /job-queue-limit/);
});
