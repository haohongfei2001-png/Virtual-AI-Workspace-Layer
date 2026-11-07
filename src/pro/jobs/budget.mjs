import {digest} from '../../data/hash.mjs';
import {boundedJSON, exact, integer, boundedText} from '../model/schema-runtime.mjs';
import {validateSourceScope} from '../evidence/metadata.mjs';

const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const safe = value => { if (value < 0n || value > MAX) throw Error('money-overflow'); return Number(value); };
const instant = value => { boundedText(value, 64); const n = Date.parse(value); if (!Number.isFinite(n)) throw Error('invalid-budget-time'); return n; };
const currencyOK = currency => { if (typeof currency !== 'string' || !/^[A-Z]{3}$/u.test(currency)) throw Error('invalid-currency'); return currency; };
const decimal = text => {
  if (typeof text !== 'string' || !/^(0|[1-9]\d{0,15})(?:\.\d{1,18})?$/u.test(text)) throw Error('invalid-price-decimal');
  const [whole, fraction = ''] = text.split('.'); return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
};
const ceilRatio = (numerator, denominator) => (numerator + denominator - 1n) / denominator;

export function validatePriceCard(input, now) {
  const card = boundedJSON(input, {maxBytes: 4096});
  exact(card, ['version', 'currency', 'providerProfileId', 'inputPerMillion', 'outputPerMillion', 'validFrom', 'validThrough', 'otherMaximumMicros']);
  boundedText(card.version, 128); boundedText(card.providerProfileId, 128); currencyOK(card.currency);
  decimal(card.inputPerMillion); decimal(card.outputPerMillion); integer(card.otherMaximumMicros);
  const from = instant(card.validFrom), through = instant(card.validThrough), time = instant(now);
  if (through < from || time < from || time > through) throw Error('price-card-not-current');
  return card;
}

/** USD per million tokens × tokens equals micro-USD. Rational arithmetic
 * preserves sub-micro charges; reserve and settle conservatively round UP. */
export function estimateCharge({inputTokens, outputTokens}, rawCard, now) {
  integer(inputTokens, 10000000); integer(outputTokens, 10000000);
  const card = validatePriceCard(rawCard, now);
  const [inputNumerator, inputDenominator] = decimal(card.inputPerMillion);
  const [outputNumerator, outputDenominator] = decimal(card.outputPerMillion);
  const denominator = inputDenominator * outputDenominator;
  const numerator = BigInt(inputTokens) * inputNumerator * outputDenominator + BigInt(outputTokens) * outputNumerator * inputDenominator;
  return safe(ceilRatio(numerator, denominator) + BigInt(card.otherMaximumMicros));
}

export function emptyBudgetLedger() {
  return {schema: 'vaiwl-pro-budget/1', revision: 0, policies: {}, reservations: {}, blockedBillingProfiles: {}};
}
export function validateBudgetPolicy(input) {
  const policy = boundedJSON(input, {maxBytes: 4096});
  exact(policy, ['id', 'billingProfileId', 'appliesTo', 'currency', 'scale', 'ceiling', 'window', 'providerProfileId', 'pricingVersion', 'revision']);
  for (const key of ['id', 'billingProfileId', 'providerProfileId', 'pricingVersion']) boundedText(policy[key], 128);
  currencyOK(policy.currency); if (policy.scale !== 6) throw Error('invalid-money-scale'); integer(policy.ceiling); integer(policy.revision);
  exact(policy.window, ['from', 'through']); if (instant(policy.window.from) > instant(policy.window.through)) throw Error('invalid-policy-window');
  if (policy.appliesTo.kind === 'installation-total') exact(policy.appliesTo, ['kind']);
  else if (policy.appliesTo.kind === 'scope-sublimit') { exact(policy.appliesTo, ['kind', 'scopeKey']); boundedText(policy.appliesTo.scopeKey, 1024); }
  else throw Error('invalid-budget-owner');
  return policy;
}
export function validateBudgetLedger(input) {
  const ledger = boundedJSON(input, {maxBytes: 4 * 1024 * 1024, maxNodes: 200000});
  exact(ledger, ['schema', 'revision', 'policies', 'reservations', 'blockedBillingProfiles']);
  if (ledger.schema !== 'vaiwl-pro-budget/1') throw Error('invalid-budget-ledger'); integer(ledger.revision);
  for (const table of ['policies', 'reservations', 'blockedBillingProfiles']) {
    if (!ledger[table] || typeof ledger[table] !== 'object' || Array.isArray(ledger[table]) || Object.keys(ledger[table]).length > 10000) throw Error('invalid-budget-table');
  }
  for (const [key, policy] of Object.entries(ledger.policies)) { validateBudgetPolicy(policy); if (key !== policy.id) throw Error('invalid-budget-policy-key'); }
  for (const [id, row] of Object.entries(ledger.reservations)) {
    exact(row, ['scopeKey', 'createdAt', 'dispatchRecorded', 'reservation', 'requestDigest']); boundedText(row.scopeKey, 1024); instant(row.createdAt); boundedText(row.requestDigest, 128);
    if (typeof row.dispatchRecorded !== 'boolean') throw Error('invalid-dispatch-marker');
    const r = row.reservation;
    const statusFields = {reserved: ['maxCharge'], 'sent-uncertain': ['heldCharge', 'providerRequestId'], settled: ['actualCharge', 'reportedExactChargeDecimal'], released: ['reason']}[r.status];
    if (!statusFields) throw Error('invalid-reservation-state');
    exact(r, ['status', 'id', 'jobId', 'billingProfileId', 'currency', 'scale', 'priceCardVersion', 'policyIds', 'revision', ...statusFields]);
    if (r.id !== id || r.scale !== 6) throw Error('invalid-reservation');
    for (const key of ['id', 'jobId', 'billingProfileId', 'priceCardVersion']) boundedText(r[key], 128);
    currencyOK(r.currency); integer(r.revision);
    if (!Array.isArray(r.policyIds) || !r.policyIds.length || new Set(r.policyIds).size !== r.policyIds.length) throw Error('invalid-policy-list');
    r.policyIds.forEach(key => { boundedText(key, 128); if (!ledger.policies[key]) throw Error('missing-reservation-policy'); });
    for (const key of ['maxCharge', 'heldCharge', 'actualCharge']) if (key in r) integer(r[key]);
    if (r.status === 'released' && !['not-dispatched', 'provider-confirmed-no-charge'].includes(r.reason)) throw Error('invalid-release-reason');
    if (r.status === 'sent-uncertain' && r.providerRequestId !== null) boundedText(r.providerRequestId, 256);
    if (r.status === 'settled' && r.reportedExactChargeDecimal !== null) decimal(r.reportedExactChargeDecimal);
    if (['sent-uncertain', 'settled'].includes(r.status) && !row.dispatchRecorded) throw Error('missing-dispatch-marker');
  }
  for (const reason of Object.values(ledger.blockedBillingProfiles)) if (reason !== 'settlement-exceeded-reservation') throw Error('invalid-billing-block');
  return ledger;
}

export function configureBudgetPolicies(current, policies, expectedRevision) {
  const ledger = validateBudgetLedger(current);
  if (ledger.revision !== expectedRevision || !Array.isArray(policies) || policies.length > 100) throw Error('budget-conflict');
  for (const raw of policies) {
    const policy = validateBudgetPolicy(raw), old = ledger.policies[policy.id];
    if (old && (policy.revision <= old.revision || old.billingProfileId !== policy.billingProfileId || old.currency !== policy.currency ||
        old.providerProfileId !== policy.providerProfileId || digest(old.appliesTo) !== digest(policy.appliesTo) || digest(old.window) !== digest(policy.window))) throw Error('policy-revision-or-identity-conflict');
    ledger.policies[policy.id] = policy;
  }
  ledger.revision++;
  return validateBudgetLedger(ledger);
}
const liability = reservation => BigInt(reservation.status === 'reserved' ? reservation.maxCharge : reservation.status === 'sent-uncertain' ? reservation.heldCharge : reservation.status === 'settled' ? reservation.actualCharge : 0);
export function reserveBudget(current, request) {
  const ledger = validateBudgetLedger(current), scope = validateSourceScope(request.scope);
  if (scope.persistence !== 'same-idb') throw Error('session-paid-job-denied');
  const {id, jobId, billingProfileId, providerProfileId, currency, priceCardVersion, maximum, expectedBudgetRevisions, now} = request;
  for (const value of [id, jobId, billingProfileId, providerProfileId, priceCardVersion]) boundedText(value, 128);
  integer(maximum); currencyOK(currency); const time = instant(now);
  if (!expectedBudgetRevisions || typeof expectedBudgetRevisions !== 'object') throw Error('missing-budget-fence');
  const requestDigest = digest({id, jobId, billingProfileId, providerProfileId, currency, priceCardVersion, maximum, scopeKey: scope.key});
  const prior = ledger.reservations[id];
  if (prior) {
    if (prior.requestDigest !== requestDigest) throw Error('reservation-id-conflict');
    return {ledger, reservation: structuredClone(prior.reservation), idempotent: true};
  }
  if (Object.values(ledger.reservations).some(row => row.reservation.jobId === jobId)) throw Error('job-already-reserved');
  if (ledger.blockedBillingProfiles[billingProfileId]) throw Error('billing-reconciliation-required');
  const relevant = Object.values(ledger.policies).filter(policy => policy.billingProfileId === billingProfileId &&
    time >= instant(policy.window.from) && time <= instant(policy.window.through) &&
    (policy.appliesTo.kind === 'installation-total' || policy.appliesTo.scopeKey === scope.key));
  if (!relevant.some(policy => policy.appliesTo.kind === 'installation-total')) throw Error('budget-zero');
  for (const policy of relevant) {
    if (policy.currency !== currency || policy.providerProfileId !== providerProfileId || policy.pricingVersion !== priceCardVersion) throw Error('price-or-currency-mismatch');
    if (expectedBudgetRevisions[policy.id] !== policy.revision) throw Error('budget-conflict');
    let spent = 0n;
    for (const row of Object.values(ledger.reservations)) {
      const r = row.reservation;
      if (r.billingProfileId !== billingProfileId || r.currency !== currency) continue;
      // Unknown liabilities cannot be escaped by rolling windows or switching
      // scope; hold them against every later applicable installation budget.
      if (r.policyIds.includes(policy.id) || (r.status === 'sent-uncertain' &&
          (policy.appliesTo.kind === 'installation-total' || row.scopeKey === scope.key))) spent += liability(r);
    }
    if (spent + BigInt(maximum) > BigInt(policy.ceiling)) throw Error('budget-exceeded');
  }
  const reservation = {status: 'reserved', id, jobId, billingProfileId, currency, scale: 6, priceCardVersion,
    policyIds: relevant.map(policy => policy.id).sort(), maxCharge: maximum, revision: 0};
  ledger.reservations[id] = {scopeKey: scope.key, createdAt: now, dispatchRecorded: false, reservation, requestDigest};
  ledger.revision++;
  return {ledger: validateBudgetLedger(ledger), reservation: structuredClone(reservation), idempotent: false};
}

export function markBudgetDispatched(current, id, expectedRevision, providerRequestId = null) {
  const ledger = validateBudgetLedger(current), row = ledger.reservations[id];
  if (!row || row.reservation.revision !== expectedRevision || row.reservation.status !== 'reserved' || row.dispatchRecorded) throw Error('reservation-not-dispatchable');
  if (ledger.blockedBillingProfiles[row.reservation.billingProfileId]) throw Error('billing-reconciliation-required');
  for (const policyId of row.reservation.policyIds) {
    const policy = ledger.policies[policyId];
    let committed = 0n;
    for (const record of Object.values(ledger.reservations)) if (record.reservation.policyIds.includes(policyId)) committed += liability(record.reservation);
    if (committed > BigInt(policy.ceiling)) throw Error('budget-tightened-before-dispatch');
  }
  const {maxCharge, ...base} = row.reservation;
  row.reservation = {...base, status: 'sent-uncertain', heldCharge: maxCharge, providerRequestId, revision: expectedRevision + 1};
  row.dispatchRecorded = true; ledger.revision++;
  return {ledger: validateBudgetLedger(ledger), reservation: structuredClone(row.reservation)};
}
export function releaseReservation(current, id, expectedRevision, {providerConfirmedNoCharge = false} = {}) {
  const ledger = validateBudgetLedger(current), row = ledger.reservations[id];
  if (!row || row.reservation.revision !== expectedRevision || !['reserved', 'sent-uncertain'].includes(row.reservation.status)) throw Error('reservation-release-conflict');
  if (row.dispatchRecorded && !providerConfirmedNoCharge) throw Error('unknown-charge-must-remain-held');
  const {maxCharge: _max, heldCharge: _held, providerRequestId: _request, ...base} = row.reservation;
  row.reservation = {...base, status: 'released', reason: row.dispatchRecorded ? 'provider-confirmed-no-charge' : 'not-dispatched', revision: expectedRevision + 1};
  ledger.revision++;
  return {ledger: validateBudgetLedger(ledger), reservation: structuredClone(row.reservation)};
}
export function settleReservation(current, id, expectedRevision, {actualCharge, reportedExactChargeDecimal = null}) {
  const ledger = validateBudgetLedger(current), row = ledger.reservations[id]; integer(actualCharge);
  if (!row || row.reservation.revision !== expectedRevision || row.reservation.status !== 'sent-uncertain') throw Error('reservation-settlement-conflict');
  const {heldCharge, providerRequestId: _request, ...base} = row.reservation;
  const exceededReservation = actualCharge > heldCharge;
  // Never hide a real reported overrun by rejecting the accounting write.
  // Freeze additional charges and require reconciliation instead.
  if (exceededReservation) ledger.blockedBillingProfiles[base.billingProfileId] = 'settlement-exceeded-reservation';
  row.reservation = {...base, status: 'settled', actualCharge, reportedExactChargeDecimal, revision: expectedRevision + 1}; ledger.revision++;
  return {ledger: validateBudgetLedger(ledger), reservation: structuredClone(row.reservation), exceededReservation};
}
export function budgetSummary(current, billingProfileId) {
  const ledger = validateBudgetLedger(current);
  let reserved = 0n, uncertain = 0n, settled = 0n;
  const currencies = new Set();
  for (const {reservation: r} of Object.values(ledger.reservations)) if (r.billingProfileId === billingProfileId) {
    currencies.add(r.currency);
    if (r.status === 'reserved') reserved += BigInt(r.maxCharge);
    if (r.status === 'sent-uncertain') uncertain += BigInt(r.heldCharge);
    if (r.status === 'settled') settled += BigInt(r.actualCharge);
  }
  if (currencies.size > 1) throw Error('mixed-currency-summary');
  return {currency: [...currencies][0] ?? null, reserved: safe(reserved), uncertain: safe(uncertain), settled: safe(settled),
    blocked: Boolean(ledger.blockedBillingProfiles[billingProfileId]), limitScope: 'this-installation-only'};
}
