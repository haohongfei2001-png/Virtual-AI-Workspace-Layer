import {digest} from '../../data/hash.mjs';
import {boundedJSON, boundedText, exact, integer} from '../model/schema-runtime.mjs';
import {validateModelConfiguration} from '../model/configuration.mjs';
import {budgetPeriods, validateUserBudgetLimits, userBudgetKey, userBudgetPolicies, userBudgetUsage, userBudgetFingerprint,applicableBudgetRemaining} from '../jobs/budget.mjs';
import {billingRootKey, inspectBillingRootRecord} from './billing-store.mjs';

const zeroLimits = () => ({taskMicros: 0, dayMicros: 0, monthMicros: 0});
const keyFor = config => userBudgetKey(config.billingProfileId);
const bindingFor = config => ({billingProfileId: config.billingProfileId, currency: config.priceCard.currency,
  providerProfileId: config.profile.providerProfileId, pricingVersion: config.priceCard.version, taskMaximumMicros: config.maxChargePerTaskMicros});
const identityMatches = (setting, config) => setting && setting.billingProfileId === config.billingProfileId &&
  setting.currency === config.priceCard.currency && setting.providerProfileId === config.profile.providerProfileId && setting.pricingVersion === config.priceCard.version;
const fenceFor = (saved, config, scopeKey, now) => {
  const binding = bindingFor(config);
  return {schema: 'vaiwl-pro-model-budget-fence/1', scopeKey, binding, fingerprint: userBudgetFingerprint(saved, binding, scopeKey, now)};
};
export function validateModelBudgetFence(input) {
  const fence = boundedJSON(input, {maxBytes: 4096});
  exact(fence, ['schema', 'scopeKey', 'binding', 'fingerprint']);
  if (fence.schema !== 'vaiwl-pro-model-budget-fence/1' || !/^[a-f0-9]{64}$/u.test(fence.fingerprint)) throw Error('invalid-model-budget-fence');
  boundedText(fence.scopeKey, 1024); exact(fence.binding, ['billingProfileId', 'currency', 'providerProfileId', 'pricingVersion', 'taskMaximumMicros']);
  for (const key of ['billingProfileId', 'providerProfileId', 'pricingVersion']) boundedText(fence.binding[key], 128);
  if (!/^[A-Z]{3}$/u.test(fence.binding.currency)) throw Error('invalid-model-budget-fence'); integer(fence.binding.taskMaximumMicros);
  return fence;
}
/** Must run in the SAME transaction as dispatch, proposal registration or an
 * automatic asset write. A successful earlier asynchronous read is insufficient.
 * This inspects the registered DB4 root and adds no store, DB or side effect. */
export function verifyModelBudgetFence(tx, input, check, ready, fail, {now = new Date().toISOString()} = {}) {
  try {
    const fence = validateModelBudgetFence(input), q = tx.objectStore('b23_states').get(billingRootKey);
    q.onsuccess = () => { try {
      if (!check()) return;
      const root = inspectBillingRootRecord(q.result);
      if (userBudgetFingerprint(root, fence.binding, fence.scopeKey, now) !== fence.fingerprint) throw Error('model-budget-changed');
      if (check()) ready();
    } catch (error) { fail(error.message); } };
  } catch (error) { fail(error.message); }
}
export function disabledModelBudgetSettings(now) {
  return {configured: false, currency: null, priceCardVersion: null, revision: 0, taskMaximumMicros: 0, limits: zeroLimits(),
    usage: {dayMicros: 0, monthMicros: 0}, remaining: {dayMicros: 0, monthMicros: 0, queueMicros: 0}, periods: budgetPeriods(now), nearLimit: false, blocked: true};
}
function projectSettings(saved, config, now, scopeKey = null) {
  const setting = saved.userBudgets?.[keyFor(config)], matched = identityMatches(setting, config), limits = matched ? {...setting.limits} : zeroLimits();
  const usage = userBudgetUsage(saved.ledger, {billingProfileId: config.billingProfileId, currency: config.priceCard.currency, now});
  const remaining = {dayMicros: Math.max(0, limits.dayMicros - usage.dayMicros), monthMicros: Math.max(0, limits.monthMicros - usage.monthMicros)};
  remaining.queueMicros = Math.min(remaining.dayMicros, remaining.monthMicros, applicableBudgetRemaining(saved.ledger, {...bindingFor(config), scopeKey, now}));
  const blocked = !matched || !limits.taskMicros || limits.taskMicros > config.maxChargePerTaskMicros || !remaining.queueMicros || Boolean(saved.ledger.blockedBillingProfiles[config.billingProfileId]);
  const nearLimit = ['day', 'month'].some(kind => limits[kind + 'Micros'] > 0 && BigInt(usage[kind + 'Micros']) * 10n >= BigInt(limits[kind + 'Micros']) * 8n);
  return {configured: true, currency: config.priceCard.currency, priceCardVersion: config.priceCard.version, revision: saved.revision,
    taskMaximumMicros: config.maxChargePerTaskMicros, limits, usage, remaining, periods: budgetPeriods(now), nearLimit, blocked};
}
/** The only budget administration port used by the production model bridge.
 * Callers receive safe settings, never policy IDs, arbitrary windows or keys. */
export function createModelBudgetOwner({configuration, billingStore, scopeKey = null, clock = () => new Date().toISOString()} = {}) {
  const captured = configuration === null ? null : validateModelConfiguration(configuration, clock(), {requireCurrent: false});
  const current = () => validateModelConfiguration(captured, clock());
  const commandBinding = config => bindingFor(config);
  async function settings(authority, signal) {
    let config; try { config = current(); } catch { return disabledModelBudgetSettings(clock()); }
    const saved = await billingStore.read(authority, signal);
    return projectSettings(saved, config, clock(), scopeKey);
  }
  async function configure(authority, {limits, expectedRevision, operationId = 'user_budget_' + crypto.randomUUID().replaceAll('-', '')}, signal) {
    const config = current(), selected = validateUserBudgetLimits(limits); integer(expectedRevision);
    if (selected.taskMicros > config.maxChargePerTaskMicros) throw Error('task-budget-exceeds-provider-maximum');
    const reply = await billingStore.transact(authority, {operationId, expectedRevision,
      command: {type: 'CONFIGURE_USER_BUDGET', ...commandBinding(config), limits: selected}}, signal);
    if (!reply.ok) throw Error(reply.reason ?? 'budget-update-failed');
    return settings(authority, signal);
  }
  async function prepare(authority, {scope, writePeriods = true}, signal) {
    const config = current(); let saved = await billingStore.read(authority, signal), setting = saved.userBudgets?.[keyFor(config)];
    if (writePeriods && identityMatches(setting, config) && setting.limits.taskMicros > 0) {
      const desired = userBudgetPolicies(setting, saved.ledger, clock());
      if (desired.some(p => !saved.ledger.policies[p.id] || saved.ledger.policies[p.id].pricingVersion !== p.pricingVersion)) {
        const reply = await billingStore.transact(authority, {operationId: 'budget_period_' + crypto.randomUUID().replaceAll('-', ''), expectedRevision: saved.revision,
          command: {type: 'ENSURE_USER_BUDGET_PERIODS', ...commandBinding(config)}}, signal);
        if (!reply.ok) throw Error(reply.reason ?? 'budget-period-update-failed');
        saved = await billingStore.read(authority, signal); setting = saved.userBudgets?.[keyFor(config)];
      }
    }
    const value = projectSettings(saved, config, clock(), scope.key);
    if (writePeriods && value.blocked) throw Error('budget-zero');
    return {maxChargePerTaskMicros: value.limits.taskMicros, fence: fenceFor(saved, config, scope.key, clock()), settings: value};
  }
  async function assertCurrent(authority, input, signal) {
    const fence = validateModelBudgetFence(input), config = current();
    if (digest(fence.binding) !== digest(bindingFor(config))) throw Error('model-budget-changed');
    const saved = await billingStore.read(authority, signal);
    if (userBudgetFingerprint(saved, fence.binding, fence.scopeKey, clock()) !== fence.fingerprint) throw Error('model-budget-changed');
    return true;
  }
  return Object.freeze({settings, configure, prepare, assertCurrent});
}
