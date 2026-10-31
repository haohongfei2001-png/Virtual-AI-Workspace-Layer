import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBudgetLedger, configureBudgetPolicies, reserveBudget, markBudgetDispatched, releaseReservation,
  settleReservation, budgetSummary, estimateCharge, validateBudgetLedger} from '../../src/pro/jobs/index.mjs';

const now = '2026-10-31T12:00:00Z';
const scope = key => ({kind: 'verified-scope', key, serverIdentity: 'established', persistence: 'same-idb'});
const policy = (id, appliesTo, ceiling = 40000) => ({id, billingProfileId: 'bill_fixture', appliesTo, currency: 'USD', scale: 6,
  ceiling, window: {from: '2026-10-01T00:00:00Z', through: '2026-10-31T23:59:59Z'}, providerProfileId: 'openai-responses', pricingVersion: 'price_fixture', revision: 1});
function ledgerFixture() { return configureBudgetPolicies(emptyBudgetLedger(), [policy('total', {kind: 'installation-total'}),
  policy('scope_a', {kind: 'scope-sublimit', scopeKey: 'a'}), policy('scope_b', {kind: 'scope-sublimit', scopeKey: 'b'})], 0); }
const request = (id = 'r_a', key = 'a', maximum = 30000) => ({id, jobId: 'job_' + id, scope: scope(key), billingProfileId: 'bill_fixture',
  providerProfileId: 'openai-responses', currency: 'USD', priceCardVersion: 'price_fixture', maximum,
  expectedBudgetRevisions: {total: 1, scope_a: 1, scope_b: 1}, now});
const card = () => ({version: 'price_fixture', currency: 'USD', providerProfileId: 'openai-responses', inputPerMillion: '0.025',
  outputPerMillion: '0.30', validFrom: '2026-10-01T00:00:00Z', validThrough: '2026-11-30T23:59:59Z', otherMaximumMicros: 0});

test('default budget is zero; money uses exact rationals and conservative micro rounding', () => {
  assert.throws(() => reserveBudget(emptyBudgetLedger(), request()), /budget-zero/);
  assert.equal(estimateCharge({inputTokens: 1, outputTokens: 0}, card(), now), 1);
  assert.equal(estimateCharge({inputTokens: 40, outputTokens: 0}, card(), now), 1);
  assert.equal(estimateCharge({inputTokens: 41, outputTokens: 0}, card(), now), 2);
  assert.equal(estimateCharge({inputTokens: 100, outputTokens: 10}, card(), now), 6);
  const fine = {...card(), inputPerMillion: '0.000000000000000001'};
  assert.equal(estimateCharge({inputTokens: 1, outputTokens: 0}, fine, now), 1);
  assert.throws(() => estimateCharge({inputTokens: 1, outputTokens: 0}, {...card(), inputPerMillion: '1e-9'}, now), /invalid-price-decimal/);
  assert.throws(() => estimateCharge({inputTokens: 1, outputTokens: 0}, card(), '2027-01-01'), /price-card-not-current/);
  assert.throws(() => estimateCharge({inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0}, card(), now), /invalid-integer/);
});

test('A24 two scopes share a single installation ceiling, not a reset per account', () => {
  const initial = ledgerFixture(), first = reserveBudget(initial, request());
  assert.equal(first.reservation.maxCharge, 30000); assert.equal(initial.reservations.r_a, undefined);
  assert.throws(() => reserveBudget(first.ledger, request('r_b', 'b')), /budget-exceeded/);
  assert.equal(reserveBudget(first.ledger, request('r_b', 'b', 10000)).reservation.maxCharge, 10000);
});

test('parallel callers through one owner serialize current ledger and cannot exceed ceiling', async () => {
  let current = ledgerFixture();
  const transact = async req => { const result = reserveBudget(current, req); current = result.ledger; return result.reservation; };
  const outcomes = await Promise.allSettled([transact(request('r_a', 'a')), transact(request('r_b', 'b'))]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal(budgetSummary(current, 'bill_fixture').reserved, 30000);
});

test('same reservation is idempotent, changed payload and second reservation for same job fail', () => {
  const first = reserveBudget(ledgerFixture(), request());
  const duplicate = reserveBudget(first.ledger, request()); assert.equal(duplicate.idempotent, true); assert.deepEqual(duplicate.ledger, first.ledger);
  assert.throws(() => reserveBudget(first.ledger, {...request(), maximum: 1}), /reservation-id-conflict/);
  assert.throws(() => reserveBudget(first.ledger, {...request('other'), jobId: request().jobId}), /job-already-reserved/);
});

test('all applicable scope limits, currency, price and revision fences are checked', () => {
  let current = ledgerFixture(); current = configureBudgetPolicies(current, [{...current.policies.scope_a, revision: 2, ceiling: 5000}], current.revision);
  assert.throws(() => reserveBudget(current, request()), /budget-conflict/);
  assert.throws(() => reserveBudget(current, {...request(), expectedBudgetRevisions: {total: 1, scope_a: 2}}), /budget-exceeded/);
  assert.throws(() => reserveBudget(current, {...request(), currency: 'CNY'}), /price-or-currency-mismatch/);
  assert.throws(() => reserveBudget(current, {...request(), priceCardVersion: 'new_card'}), /price-or-currency-mismatch/);
});

test('A25 dispatch marker immediately holds charge; timeout/restart cannot release or resend', () => {
  const reserved = reserveBudget(ledgerFixture(), request()), sent = markBudgetDispatched(reserved.ledger, 'r_a', 0);
  assert.equal(sent.reservation.status, 'sent-uncertain'); assert.equal(sent.reservation.heldCharge, 30000);
  const restarted = validateBudgetLedger(JSON.parse(JSON.stringify(sent.ledger)));
  assert.equal(budgetSummary(restarted, 'bill_fixture').uncertain, 30000);
  assert.throws(() => releaseReservation(restarted, 'r_a', 1), /unknown-charge-must-remain-held/);
  assert.throws(() => markBudgetDispatched(restarted, 'r_a', 1), /reservation-not-dispatchable/);
  assert.throws(() => reserveBudget(restarted, request('r_b', 'b')), /budget-exceeded/);
});

test('pre-dispatch cancellation releases; settlement uses actual and rejects stale repeat', () => {
  const reserved = reserveBudget(ledgerFixture(), request());
  const released = releaseReservation(reserved.ledger, 'r_a', 0); assert.equal(released.reservation.reason, 'not-dispatched');
  assert.equal(budgetSummary(released.ledger, 'bill_fixture').reserved, 0);
  const sent = markBudgetDispatched(reserved.ledger, 'r_a', 0), settled = settleReservation(sent.ledger, 'r_a', 1, {actualCharge: 1500, reportedExactChargeDecimal: '0.0015'});
  assert.equal(settled.reservation.actualCharge, 1500); assert.equal(budgetSummary(settled.ledger, 'bill_fixture').uncertain, 0);
  assert.equal(budgetSummary(settled.ledger, 'bill_fixture').settled, 1500);
  assert.throws(() => settleReservation(settled.ledger, 'r_a', 1, {actualCharge: 1500}), /reservation-settlement-conflict/);
});

test('budget tightening blocks unsent dispatch; actual overrun is recorded and freezes further spending', () => {
  const reserved = reserveBudget(ledgerFixture(), request());
  const tightened = configureBudgetPolicies(reserved.ledger, [{...reserved.ledger.policies.total, ceiling: 20000, revision: 2}], reserved.ledger.revision);
  assert.throws(() => markBudgetDispatched(tightened, 'r_a', 0), /budget-tightened-before-dispatch/);
  const sent = markBudgetDispatched(reserved.ledger, 'r_a', 0), settled = settleReservation(sent.ledger, 'r_a', 1, {actualCharge: 31000});
  assert.equal(settled.exceededReservation, true); assert.equal(budgetSummary(settled.ledger, 'bill_fixture').settled, 31000);
  assert.throws(() => reserveBudget(settled.ledger, request('r_b', 'b', 1)), /billing-reconciliation-required/);
});

test('rollover cannot discard unknown liabilities and session scope cannot reserve paid work', () => {
  const reserved = reserveBudget(ledgerFixture(), request()), sent = markBudgetDispatched(reserved.ledger, 'r_a', 0);
  const november = {...policy('november', {kind: 'installation-total'}), window: {from: '2026-11-01T00:00:00Z', through: '2026-11-30T23:59:59Z'}};
  const rolled = configureBudgetPolicies(sent.ledger, [november], sent.ledger.revision);
  assert.throws(() => reserveBudget(rolled, {...request('r_b', 'b'), now: '2026-11-01T12:00:00Z', expectedBudgetRevisions: {november: 1}}), /budget-exceeded/);
  assert.throws(() => reserveBudget(ledgerFixture(), {...request(), scope: {kind: 'browser-local-session', key: 'a', persistence: 'memory', serverIdentity: 'not-established'}}), /session-paid-job-denied/);
});
