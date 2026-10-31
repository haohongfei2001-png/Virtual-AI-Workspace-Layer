import {digest} from '../../data/hash.mjs';
import {boundedJSON, boundedText, integer, exact} from '../model/schema-runtime.mjs';
import {validateModelConfiguration, publicModelConfiguration, modelBinding} from '../model/configuration.mjs';
import {createOpenAIResponsesAdapter, buildOpenAIRequest} from '../model/openai-responses.mjs';
import {buildProviderPayload} from '../model/payload.mjs';
import {validateModelOutput} from '../model/validate.mjs';
import {validateSourceScope, sameVersions} from '../evidence/metadata.mjs';
import {planSuggestions, automaticGate, automaticReadiness} from '../organize/planner.mjs';
import {queueJob, transitionJob} from './lifecycle.mjs';
import {estimateCharge, budgetSummary} from './budget.mjs';

const id = prefix => prefix + crypto.randomUUID().replaceAll('-', '');
const result = (state, jobId = null, reason = null, proposalCount = 0, automaticApplied = false) => ({state, jobId, reason, proposalCount, automaticApplied});
const emptyBudget = () => ({currency: null, reserved: 0, uncertain: 0, settled: 0, blocked: false, limitScope: 'this-installation-only'});
const knownReason = error => /^[a-z][a-z0-9-]{0,99}$/u.test(error?.message ?? '') ? error.message : 'model-execution-failed';
const captureRefIds = refIds => {
  if (refIds === null) return null;
  if (!Array.isArray(refIds) || refIds.length > 10 || new Set(refIds).size !== refIds.length) throw Error('invalid-model-batch');
  const captured = refIds.map(refId => { boundedText(refId, 128); return refId; });
  return Object.freeze(captured);
};
const freezeJSON = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeJSON); Object.freeze(value); }
  return value;
};

/** Worker-only orchestration over the EXISTING same-IDB billing and Pro commit
 * owners. No DB, global fetch, key storage or provider retries. Optional
 * automation is a separate trusted owner port, absent by default.
 * Every hook is trusted owner code, never deserialized from a frame request.
 *
 * getContext(authority,{phase,signal,refIds}) returns a fresh authorized
 * {pack,overlay,currentVersions,mode,processing,foregroundBusy,backgroundWhileNative}.
 * authorizeDispatch(authority,metadata,signal) verifies current destination and
 * purpose permission and returns a session-only {ok:true,apiKey}. Its immutable
 * payloadPreview contains exactly the outgoing minimized fields, retention
 * disclosure and maximum charge; it stays within this private owner callback.
 * registerProposals(authority,{proposals,versions,jobId},signal) rechecks the
 * current source/epoch/constraints atomically while writing proposal records.
 * automation.policy(authority,{context,profile,signal}) returns only an actual
 * owner-approved {firstRun,autoRequested,quality}. automation.apply(authority,
 * {proposal,versions,pack,quality,modelProfile,jobId},signal) must recheck current
 * policy in its transaction and return {ok:true,operationId} after durable apply.
 * At most ONE independently qualified proposal can apply per task. Remaining
 * proposals remain visible for review; there is no automatic commit retry.
 * Optional getProposalReceipt(authority,{jobId,proposalId},signal) must read the
 * actual matching owner operation; {committed:true,proposalId,operationId} lets
 * explicit recovery reconcile a lost task receipt without reapplying assets.
 * An applied sibling additionally requires registeredProposalIds from the
 * verified registration operation, containing both the tracked and applied IDs.
 * No source text, raw reply, key, grant or request body is persisted by this service.
 */
export function createOrganizeService({enabled = false, configuration = null, billingStore = null, transport,
  authorizeDispatch, getContext, registerProposals, getProposalReceipt = null, automation = null, budgetOwner = null, clock = () => new Date().toISOString(), timeoutMs = 30000} = {}) {
  if (typeof enabled !== 'boolean' || typeof clock !== 'function') throw Error('invalid-model-service-options');
  integer(timeoutMs, 60000); if (timeoutMs < 10) throw Error('invalid-model-timeout');
  const captured = configuration === null ? null : boundedJSON(configuration, {maxBytes: 16384});
  // Expired pricing disables NEW execution. It must not prevent reopening an
  // old task, seeing a held charge, cancelling or reconciling under new authority.
  if (captured) validateModelConfiguration(captured, clock(), {requireCurrent: false});
  if (enabled && (!captured || typeof billingStore?.read !== 'function' || typeof billingStore?.transact !== 'function' ||
      [transport, authorizeDispatch, getContext, registerProposals].some(fn => typeof fn !== 'function'))) throw Error('model-owner-ports-required');
  if (automation !== null && (typeof automation?.policy !== 'function' || typeof automation?.apply !== 'function')) throw Error('automatic-owner-ports-required');
  if (getProposalReceipt !== null && typeof getProposalReceipt !== 'function') throw Error('proposal-receipt-owner-required');
  if (budgetOwner !== null && ['prepare', 'assertCurrent'].some(key => typeof budgetOwner?.[key] !== 'function')) throw Error('model-budget-owner-required');
  const automaticOwner = automation === null ? null : {policy: automation.policy, apply: automation.apply};
  let stopped = false;
  const active = new Map();
  const configured = () => publicModelConfiguration(captured, clock(), {requireCurrent: false});
  const context = async (authority, phase, signal, refIds = null) => {
    if (stopped || signal?.aborted) throw Error('cancelled');
    const c = await getContext(authority, {phase, signal, refIds});
    if (stopped || signal?.aborted) throw Error('cancelled');
    const scope = validateSourceScope(c?.pack?.scope);
    if (scope.key !== c.overlay?.scopeKey || !sameVersions(c.pack.versions, c.currentVersions) ||
        c.pack.versions.overlayRevision !== c.overlay.revision) throw Error('stale-model-input');
    return c;
  };
  const transact = async (authority, command, signal) => {
    const before = await billingStore.read(authority, signal);
    const written = await billingStore.transact(authority, {operationId: id('modelop_'), expectedRevision: before.revision, command}, signal);
    if (!written.ok) throw Error(written.reason ?? 'billing-write-failed');
    // A replayed DISPATCH receipt must never be used to send again.
    if (command.type === 'DISPATCH_JOB' && written.replayed) throw Error('dispatch-already-recorded');
    return written.value;
  };
  const assertRunnable = c => {
    if (c.pack.scope.persistence !== 'same-idb') throw Error('session-cloud-denied');
    if (c.processing !== 'cloud') throw Error('processing-consent-required');
    if (c.foregroundBusy === true || (c.mode === 'native' && c.backgroundWhileNative !== true)) throw Error('foreground-priority');
  };
  const assertOriginal = (initial, current) => {
    assertRunnable(current);
    if (!sameVersions(initial.pack.versions, current.currentVersions) ||
        digest(initial.pack) !== digest(current.pack) || digest(initial.overlay) !== digest(current.overlay)) throw Error('stale-model-input');
  };
  const automaticPolicy = async (authority, c, profile, signal) => {
    if (!automaticOwner) return {firstRun: true, autoRequested: false, quality: null};
    let timer, onAbort;
    try {
      if (signal?.aborted) throw Error('cancelled');
      const deadline = new Promise(resolve => {
        timer = setTimeout(() => resolve(null), Math.min(timeoutMs, 1000));
        onAbort = () => resolve(null); signal?.addEventListener('abort', onAbort, {once: true});
      });
      const policy = boundedJSON(await Promise.race([automaticOwner.policy(authority, {context: structuredClone(c), profile: structuredClone(profile), signal}), deadline]), {maxBytes: 65536});
      exact(policy, ['firstRun', 'autoRequested', 'quality']);
      if (typeof policy.firstRun !== 'boolean' || typeof policy.autoRequested !== 'boolean') throw Error('invalid-automatic-policy');
      return policy;
    } catch { return {firstRun: true, autoRequested: false, quality: null}; }
    finally { clearTimeout(timer); if (onAbort) signal?.removeEventListener('abort', onAbort); }
  };
  const cancelPersisted = async (authority, jobId, reason) => {
    try { await transact(authority, {type: 'CANCEL_JOB', jobId, reason}); return true; }
    catch { return false; } // A revoked grant cannot be used for a cleanup write.
  };
  async function run({authority, signal, firstRun = true, refIds = null, reviewOnly = false, automaticTrigger = false} = {}) {
    if (!enabled || !captured || stopped) return result('not-configured', null, stopped ? 'service-stopped' : 'provider-disabled');
    if (typeof firstRun !== 'boolean') throw Error('invalid-first-run');
    let selectedRefIds = captureRefIds(refIds);
    if (typeof reviewOnly !== 'boolean' || reviewOnly && !selectedRefIds?.length) throw Error('explicit-model-review-batch-required');
    if (typeof automaticTrigger !== 'boolean' || automaticTrigger && (reviewOnly || !selectedRefIds?.length)) throw Error('invalid-automatic-trigger');
    if (signal?.aborted) return result('cancelled', null, 'cancelled');
    let jobId = null, reservationId = null, initial = null, dispatched = false, dispatchAttempted = false, proposalsRegistered = false;
    let automaticAttempted = false, automaticCommitted = false, proposalCount = 0, budgetFence = null;
    const controller = new AbortController(), abort = () => controller.abort(), taskSignal = controller.signal;
    signal?.addEventListener('abort', abort, {once: true});
    let timeout, timeoutReject;
    const expired = new Promise((_resolve, reject) => { timeoutReject = reject; });
    const onAbort = () => timeoutReject(Error('cancelled'));
    taskSignal.addEventListener('abort', onAbort, {once: true});
    // Attached rejection handlers on each race prevent late provider resolution
    // from re-entering validation/registration after an abort or deadline.
    const bounded = work => Promise.race([Promise.resolve(work), expired]);
    const currentContext = async phase => {
      const value = await context(authority, phase, taskSignal, selectedRefIds);
      if (budgetFence) await budgetOwner.assertCurrent(authority, budgetFence, taskSignal);
      return value;
    };
    timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const config = validateModelConfiguration(captured, clock());
      initial = await bounded(currentContext('prepare')); assertRunnable(initial);
      if (!initial.pack.metadata.length) return result('empty', null, 'no-eligible-metadata');
      if (selectedRefIds && initial.pack.metadata.some(row => !selectedRefIds.includes(row.refId))) throw Error('model-batch-mismatch');
      selectedRefIds = captureRefIds(initial.pack.metadata.map(row => row.refId));
      let taskMaximum = config.maxChargePerTaskMicros;
      const {payload, handleMap, truncated: payloadTruncated} = buildProviderPayload(initial.pack, initial.overlay);
      const built = buildOpenAIRequest(payload, config.profile), binding = modelBinding(config.profile);
      const fingerprint = digest({pack: initial.pack, modelBinding: binding, ...(reviewOnly ? {purpose: 'explicit-review-only'} : automaticTrigger ? {purpose: 'automatic-incremental'} : {})});
      const automaticReady = async c => {
        if (!automaticTrigger) return true;
        const policy = await automaticPolicy(authority, c, config.profile, taskSignal);
        try { return !c.pack.truncated && !payloadTruncated && automaticReadiness({...policy, modelProfile: config.profile}).eligible; } catch { return false; }
      };
      let queued = queueJob({id: id('modeljob_'), scope: initial.pack.scope, versions: initial.currentVersions,
        inputFingerprint: fingerprint, modelBinding: binding, processing: 'cloud', mode: initial.mode,
        foregroundBusy: initial.foregroundBusy === true, backgroundWhileNative: initial.backgroundWhileNative === true});
      if (queued.state === 'queued' && !await bounded(automaticReady(initial))) queued = transitionJob(queued, {type: 'pause', reason: 'capability'});
      const admitted = await bounded(transact(authority, {type: 'QUEUE_JOB', checkpoint: queued}, taskSignal));
      jobId = admitted.detail.jobId;
      if (!admitted.detail.admitted) return result('deduplicated', jobId, 'existing-job');
      active.set(jobId, {scopeKey: initial.pack.scope.key, controller});
      if (queued.state !== 'queued') return result('paused', jobId, queued.reason);
      if (budgetOwner) {
        const selected = await bounded(budgetOwner.prepare(authority, {scope: initial.pack.scope, writePeriods: true}, taskSignal));
        integer(selected.maxChargePerTaskMicros); if (selected.maxChargePerTaskMicros > taskMaximum) throw Error('task-budget-exceeds-provider-maximum');
        taskMaximum = selected.maxChargePerTaskMicros; budgetFence = boundedJSON(selected.fence, {maxBytes: 4096});
      }
      const maximum = estimateCharge({inputTokens: built.inputTokenUpperBound, outputTokens: config.profile.maxOutputTokens}, config.priceCard, clock());
      if (maximum > taskMaximum || taskMaximum === 0) throw Error('task-budget-exceeded');
      const beforeReserve = await bounded(billingStore.read(authority, taskSignal));
      if (automaticTrigger && !await bounded(automaticReady(await currentContext('before-reservation')))) throw Error('automatic-policy-unavailable');
      const expectedBudgetRevisions = Object.fromEntries(Object.values(beforeReserve.ledger.policies).map(p => [p.id, p.revision]));
      reservationId = id('reservation_');
      await bounded(transact(authority, {type: 'RESERVE_JOB', jobId, reservationId, maximum,
        billingProfileId: config.billingProfileId, providerProfileId: config.profile.providerProfileId,
        currency: config.priceCard.currency, priceCardVersion: config.priceCard.version, expectedBudgetRevisions}, taskSignal));
      const payloadPreview = freezeJSON({payload: structuredClone(payload), retention: 'store-false-is-not-zero-retention',
        estimate: {currency: config.priceCard.currency, scale: 6, maximumMicros: maximum}, maxChargePerTaskMicros: taskMaximum,
        truncated: initial.pack.truncated === true || payloadTruncated, missing: [...initial.pack.missing]});
      const adapter = createOpenAIResponsesAdapter({enabled: true, profile: config.profile, transport,
        authorizeDispatch: async (_ticket, metadata) => {
          validateModelConfiguration(config, clock());
          const authorizing = await currentContext('before-authorization'); assertOriginal(initial, authorizing);
          if (!await automaticReady(authorizing)) throw Error('automatic-policy-unavailable');
          const permission = await authorizeDispatch(authority, {...metadata, configuration: structuredClone(config), payloadPreview, jobId, reservationId, maximum}, taskSignal);
          if (permission?.ok !== true || typeof permission.apiKey !== 'string' || permission.apiKey.length < 8 || permission.apiKey.length > 1024 || /[^\x21-\x7e]/u.test(permission.apiKey)) throw Error('dispatch-not-authorized');
          const dispatching = await currentContext('before-dispatch'); assertOriginal(initial, dispatching);
          if (!await automaticReady(dispatching)) throw Error('automatic-policy-unavailable');
          validateModelConfiguration(config, clock());
          dispatchAttempted = true;
          await transact(authority, {type: 'DISPATCH_JOB', jobId}, taskSignal);
          dispatched = true;
          if (taskSignal.aborted || stopped) throw Error('cancelled');
          return permission;
        }});
      const reply = await bounded(adapter.execute(Object.freeze({}), payload, taskSignal));
      if (reply.state !== 'complete' || reply.usage === null || config.priceCard.otherMaximumMicros > 0) {
        await cancelPersisted(authority, jobId, reply.state === 'not-dispatched' ? reply.reason : 'provider-' + reply.state);
        let uncertain = dispatched || dispatchAttempted;
        try { const saved = await billingStore.read(authority); uncertain = ['dispatched', 'outcome-unknown'].includes(saved.jobs[jobId]?.checkpoint.state); } catch {}
        return result(uncertain ? 'outcome-unknown' : 'paused', jobId,
          uncertain ? (reply.state === 'complete' ? (config.priceCard.otherMaximumMicros > 0 ? 'non-token-charge-needs-reconciliation' : 'usage-unavailable') : 'provider-' + reply.state) : reply.reason);
      }
      // Valid usage settles the already-dispatched task even if semantic output
      // is invalid. Schema rejection must never hide a real provider charge.
      const actualCharge = estimateCharge(reply.usage, config.priceCard, config.priceCard.validFrom);
      await bounded(transact(authority, {type: 'COMPLETE_JOB', jobId, resultDigest: digest(reply.json), actualCharge, reportedExactChargeDecimal: null}, taskSignal));
      const current = await bounded(currentContext('before-validation')); assertOriginal(initial, current);
      const validated = validateModelOutput(reply, {payload, handleMap, pack: initial.pack, overlay: current.overlay,
        currentVersions: current.currentVersions, currentReferences: current.pack.references});
      const policy = reviewOnly ? {firstRun: true, autoRequested: false, quality: null} : await bounded(automaticPolicy(authority, current, config.profile, taskSignal));
      const planned = planSuggestions({validated, pack: initial.pack, overlay: current.overlay,
        currentVersions: current.currentVersions, modelProfile: config.profile,
        firstRun: automaticOwner ? policy.firstRun : firstRun, autoRequested: policy.autoRequested && !payloadTruncated, quality: policy.quality});
      proposalCount = planned.proposals.length;
      if (!planned.proposals.length) {
        await cancelPersisted(authority, jobId, 'no-supported-suggestions');
        return result('empty', jobId, 'no-supported-suggestions');
      }
      assertOriginal(initial, await bounded(currentContext('before-registration')));
      const registered = await bounded(registerProposals(authority, {proposals: planned.proposals,
        versions: current.currentVersions, jobId, ...(budgetFence ? {budgetFence} : {})}, taskSignal));
      proposalsRegistered = registered?.ok === true || registered?.committed === true;
      if (registered?.ok !== true) throw Error(registered?.reason ?? 'proposal-registration-failed');
      const candidate = planned.proposals.find(p => p.qualityBand === 'eligible-auto');
      await bounded(transact(authority, {type: 'ADVANCE_RESULT', jobId, event: {type: 'validate',
        currentVersions: initial.currentVersions, awaitingReview: true, proposalId: candidate?.id ?? planned.proposals[0].id}}, taskSignal));
      if (!reviewOnly && automaticOwner && candidate) {
        const applying = await bounded(currentContext('before-automation'));
        assertRunnable(applying);
        // Registering suggestions changes their rows but not the source/asset
        // revision. It is not permission to tolerate a concurrent human edit.
        if (!sameVersions(initial.currentVersions, applying.currentVersions) || digest(initial.pack) !== digest(applying.pack)) throw Error('stale-model-input');
        const latest = await bounded(automaticPolicy(authority, applying, config.profile, taskSignal));
        const gate = automaticGate(candidate, {overlay: applying.overlay, pack: applying.pack, modelProfile: config.profile, ...latest});
        if (gate.eligible) {
          automaticAttempted = true;
          const applied = await bounded(automaticOwner.apply(authority, {proposal: candidate, versions: applying.currentVersions,
            pack: applying.pack, quality: latest.quality, modelProfile: config.profile, jobId, ...(budgetFence ? {budgetFence} : {})}, taskSignal));
          if (applied?.ok !== true && applied?.committed !== true) return result('awaiting-review', jobId, 'automatic-apply-deferred', proposalCount);
          boundedText(applied.operationId, 128); automaticCommitted = true;
          await bounded(transact(authority, {type: 'ADVANCE_RESULT', jobId, event: {type: 'commit', operationId: applied.operationId}}, taskSignal));
          return result('committed', jobId, applied.ok === true ? null : 'task-status-needs-refresh', proposalCount - 1, true);
        }
      }
      return result('awaiting-review', jobId, null, planned.proposals.length);
    } catch (error) {
      if (automaticCommitted) return result('committed', jobId, 'task-status-needs-refresh', Math.max(0, proposalCount - 1), true);
      // No model/registration retry after an unknown commit. The accepted
      // proposal records remain accessible independently of the task status.
      if (proposalsRegistered) return result('awaiting-review', jobId, automaticAttempted ? 'automatic-commit-needs-refresh' : 'task-status-needs-refresh', proposalCount);
      if (jobId) await cancelPersisted(authority, jobId, knownReason(error));
      let uncertain = dispatched || dispatchAttempted;
      if (jobId) try {
        const saved = await billingStore.read(authority);
        uncertain = ['dispatched', 'outcome-unknown'].includes(saved.jobs[jobId]?.checkpoint.state);
      } catch { /* Recover under new authority; never assume an unsent request. */ }
      const reason = knownReason(error), paused = /^(?:budget-|task-budget-|price-card-|foreground-priority|processing-consent-required)/u.test(reason);
      return result(uncertain ? 'outcome-unknown' : taskSignal.aborted ? 'cancelled' : paused ? 'paused' : 'failed', jobId, reason);
    } finally {
      clearTimeout(timeout); signal?.removeEventListener('abort', abort); taskSignal.removeEventListener('abort', onAbort);
      if (jobId) active.delete(jobId);
    }
  }
  async function status({authority, signal, offset = 0, limit = 20} = {}) {
    integer(offset, 1000); integer(limit, 20); if (!limit) throw Error('invalid-model-page');
    let config;
    try { config = configured(); } catch { config = publicModelConfiguration(null, clock()); }
    let currentConfiguration = false;
    try { if (captured) { validateModelConfiguration(captured, clock()); currentConfiguration = true; } } catch {}
    const base = {...config, enabled: enabled && !stopped && config.configured && currentConfiguration, budget: emptyBudget(), jobs: [], totalJobs: 0, runningCount: 0,
      page: {offset: 0, total: 0, count: 0, limit, hasMore: false}};
    if (!captured || typeof billingStore?.read !== 'function' || typeof getContext !== 'function' || stopped) return base;
    const c = await context(authority, 'status', signal), saved = await billingStore.read(authority, signal);
    let automaticEnabled = false;
    if (base.enabled && automaticOwner && c.processing === 'cloud' && c.pack.scope.persistence === 'same-idb' && c.foregroundBusy !== true &&
        (c.mode !== 'native' || c.backgroundWhileNative === true)) {
      const policy = await automaticPolicy(authority, c, captured.profile, signal);
      try {
        validateModelConfiguration(captured, clock());
        automaticEnabled = !signal?.aborted && !stopped && automaticReadiness({...policy, modelProfile: captured.profile}).eligible;
      } catch { /* A price expiring while policy is read cannot enable a lane. */ }
    }
    const rows = Object.values(saved.jobs).filter(row => row.scope.key === c.pack.scope.key).map(row => row.checkpoint);
    const priority = state => ['outcome-unknown', 'dispatched', 'queued', 'reserved', 'awaiting-review', 'result-ready'].indexOf(state);
    rows.sort((a, b) => (priority(a.state) < 0 ? 99 : priority(a.state)) - (priority(b.state) < 0 ? 99 : priority(b.state)) || a.id.localeCompare(b.id));
    const start = offset < rows.length ? offset : rows.length ? Math.floor((rows.length - 1) / limit) * limit : 0;
    const visible = rows.slice(start, start + limit);
    return {...base, automaticEnabled, budget: budgetSummary(saved.ledger, captured.billingProfileId, {archivedSettledTotals: saved.archivedSettledTotals ?? []}), totalJobs: rows.length,
      runningCount: [...active.values()].filter(row => row.scopeKey === c.pack.scope.key).length,
      page: {offset: start, total: rows.length, count: visible.length, limit, hasMore: start + visible.length < rows.length},
      jobs: visible.map(job => ({id: job.id, state: job.state,
        reason: job.reason === undefined ? null : knownReason({message: job.reason}), proposalId: job.proposalId ?? null}))};
  }
  async function cancel({authority, jobId, reason = 'user-cancelled', signal} = {}) {
    if (stopped || typeof billingStore?.read !== 'function' || typeof billingStore?.transact !== 'function' || typeof getContext !== 'function') return result('not-configured', null, 'provider-disabled');
    boundedText(jobId, 128); boundedText(reason, 100);
    const c = await context(authority, 'cancel', signal);
    if (active.get(jobId)?.scopeKey === c.pack.scope.key) active.get(jobId).controller.abort();
    await transact(authority, {type: 'CANCEL_JOB', jobId, reason}, signal);
    const saved = await billingStore.read(authority, signal), state = saved.jobs[jobId]?.checkpoint.state;
    return result(['outcome-unknown', 'committed'].includes(state) ? state : 'cancelled', jobId, state === 'committed' ? 'already-committed' : reason);
  }
  async function recover({authority, signal, cursor = null} = {}) {
    if (stopped || typeof billingStore?.read !== 'function' || typeof billingStore?.transact !== 'function' || typeof getContext !== 'function') return result('not-configured', null, 'provider-disabled');
    if (cursor !== null) {
      cursor = boundedJSON(cursor, {maxBytes: 2048}); exact(cursor, ['priority', 'jobId']); integer(cursor.priority, 1); boundedText(cursor.jobId, 128);
    }
    const c = await context(authority, 'recover', signal);
    const recovered = await transact(authority, {type: 'RECOVER_SCOPE'}, signal);
    if (!getProposalReceipt) return recovered;
    const saved = await billingStore.read(authority, signal);
    const pending = Object.values(saved.jobs).filter(row => row.scope.key === c.pack.scope.key && ['awaiting-review', 'validated'].includes(row.checkpoint.state));
    const priority = row => {
      const proposal = c.overlay.proposals?.[row.checkpoint.proposalId];
      return proposal?.appliedOperationId && ['applied', 'rejected'].includes(proposal.state) ? 0 : 1;
    };
    const key = row => ({priority: priority(row), jobId: row.checkpoint.id});
    const compare = (a, b) => a.priority - b.priority || a.jobId.localeCompare(b.jobId);
    pending.sort((a, b) => compare(key(a), key(b)));
    const remaining = cursor === null ? pending : pending.filter(row => compare(key(row), cursor) > 0);
    let reconciled = 0, inspected = 0, last = cursor;
    // A fresh owner scope is required, and every receipt is separately verified.
    // The explicit short RPC can make bounded progress and safely repeat later.
    for (const row of remaining.slice(0, 20)) {
      if (stopped || signal?.aborted) break;
      inspected++; last = key(row);
      try {
        const {id: jobId, proposalId} = row.checkpoint;
        const received = await getProposalReceipt(authority, {jobId, proposalId}, signal);
        if (received?.committed !== true) continue;
        const receipt = boundedJSON(received, {maxBytes: 16384});
        exact(receipt, ['committed', 'proposalId', 'operationId'], ['registeredProposalIds']);
        boundedText(receipt.operationId, 128); boundedText(receipt.proposalId, 128);
        const registered = receipt.registeredProposalIds;
        if (registered !== undefined) {
          if (!Array.isArray(registered) || !registered.length || registered.length > 40 || new Set(registered).size !== registered.length) continue;
          registered.forEach(id => boundedText(id, 128));
          if (!registered.includes(proposalId) || !registered.includes(receipt.proposalId)) continue;
        } else if (receipt.proposalId !== proposalId) continue;
        await transact(authority, {type: 'ADVANCE_RESULT', jobId, event: {type: 'commit', operationId: receipt.operationId}}, signal);
        reconciled++;
      } catch { /* Revoked/conflicting/missing receipts cannot authorize replay. */ }
    }
    const left = Math.max(0, remaining.length - inspected);
    return {...recovered, receiptReconciliations: reconciled, receiptPage: {nextCursor: left ? last : null, inspected, remaining: left}};
  }
  /** Owner-private consent preview. Opaque handles/nonces are regenerated for a
   * later run; the displayed metadata and limits are precisely this authorized
   * snapshot. Preview never reserves money, accesses credentials or sends data. */
  async function preview({authority, signal, refIds = null, reviewOnly = false} = {}) {
    if (!captured || stopped || typeof getContext !== 'function') return {state: 'unavailable', reason: 'provider-unconfigured'};
    const selectedRefIds = captureRefIds(refIds);
    if (typeof reviewOnly !== 'boolean' || reviewOnly && !selectedRefIds?.length) throw Error('explicit-model-review-batch-required');
    const config = validateModelConfiguration(captured, clock()), c = await context(authority, 'preview', signal, selectedRefIds);
    if (!c.pack.metadata.length) return {state: 'unavailable', reason: 'no-eligible-metadata'};
    if (selectedRefIds && c.pack.metadata.some(row => !selectedRefIds.includes(row.refId))) throw Error('model-batch-mismatch');
    const {payload, truncated: payloadTruncated} = buildProviderPayload(c.pack, c.overlay), built = buildOpenAIRequest(payload, config.profile);
    const maximumMicros = estimateCharge({inputTokens: built.inputTokenUpperBound, outputTokens: config.profile.maxOutputTokens}, config.priceCard, clock());
    const selected = budgetOwner ? await budgetOwner.prepare(authority, {scope: c.pack.scope, writePeriods: false}, signal) : null;
    const taskMaximum = selected?.maxChargePerTaskMicros ?? config.maxChargePerTaskMicros;
    const policy = reviewOnly ? {firstRun: true, autoRequested: false, quality: null} : await automaticPolicy(authority, c, config.profile, signal);
    let automaticAvailable = false;
    try { automaticAvailable = !c.pack.truncated && !payloadTruncated && automaticReadiness({...policy, modelProfile: config.profile}).eligible; } catch { /* Independent quality admission is absent. */ }
    return {state: 'ready', configuration: publicModelConfiguration(config, clock()), payload,
      estimate: {currency: config.priceCard.currency, scale: 6, maximumMicros}, maxChargePerTaskMicros: taskMaximum,
      withinTaskBudget: taskMaximum > 0 && maximumMicros <= taskMaximum,
      withinBudget: taskMaximum > 0 && maximumMicros <= taskMaximum && (!selected || !selected.settings.blocked && maximumMicros <= selected.settings.remaining.queueMicros),
      automaticAvailable,
      ...(selected ? {budgetFence: selected.fence, budgetRevision: selected.settings.revision} : {}),
      truncated: c.pack.truncated === true || payloadTruncated, missing: [...c.pack.missing], retention: 'store-false-is-not-zero-retention'};
  }
  function revoke(scopeKey) { for (const row of active.values()) if (row.scopeKey === scopeKey) row.controller.abort(); }
  function abortJob(jobId) { boundedText(jobId, 128); const running = active.get(jobId); if (!running) return false; running.controller.abort(); return true; }
  function stop() { stopped = true; for (const row of active.values()) row.controller.abort(); }
  return Object.freeze({run, status, cancel, recover, preview, abortJob, revoke, stop});
}
