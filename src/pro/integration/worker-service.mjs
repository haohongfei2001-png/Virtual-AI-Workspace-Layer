import {exactHostRecord} from '../../host/contract.mjs';
import {tokenOK} from '../../b1/identity.mjs';
import {withRequestDeadline} from '../../data/request-deadline.mjs';

export const PRO_WORKER_ACTIONS = Object.freeze(['sharedSnapshot', 'evidence', 'commit', 'view', 'navigation', 'background']);
export const PRO_WORKER_MAX_BYTES = 65536;
export const PRO_WORKER_DEADLINE_MS = 6000;
const encoder = new TextEncoder();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const normalizedKey = key => key.replace(/[_-]/g, '').toLowerCase();
const rowContexts = new Set(['primary-topic', 'related-topic', 'uncollected', 'pending']);
// This is a second boundary, after the owner's action-specific public codec.
// It is not a substitute for that codec or for current semantic authorization.
const privateKeys = new Set([
  'grant', 'grants', 'grantid', 'scopegrantid', 'semanticgrant', 'authority',
  'authorization', 'authorizationtoken', 'authtoken', 'accesstoken', 'refreshtoken',
  'intent', 'humanintent', 'ticket', 'executionticket', 'modelexecutionticket',
  'credential', 'credentials', 'apikey', 'secret', 'secretkey', 'password',
  'handlemap', 'providerpayload', 'privateindex', 'completeindex', 'nativeindex',
  'privatesnapshot', 'metadataevidence', 'evidencepack', 'selectedtext', 'sentuserinput',
  'parentframe', 'binding', 'documenttoken', 'producertoken', 'context',
]);

/** Strict JSON only: no getters, symbols, custom prototypes, sparse arrays,
 * non-finite numbers, hidden properties, cyclic graphs or toJSON hooks. Check
 * before cloning; structuredClone by itself accepts non-JSON values/getters. */
function jsonClone(input, {publicReply = false} = {}) {
  let nodes = 0;
  const ancestors = new WeakSet();
  const visit = (value, depth) => {
    if (++nodes > 8192 || depth > 16) throw Error('pro-json-complexity');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      if (value.length > PRO_WORKER_MAX_BYTES) throw Error('pro-json-size');
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || ancestors.has(value)) throw Error('pro-json-value');
    const array = Array.isArray(value);
    if (array ? Object.getPrototypeOf(value) !== Array.prototype : !record(value)) throw Error('pro-json-prototype');
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    if (array && (value.length > 8192 || keys.length !== value.length + 1)) throw Error('pro-json-array');
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) ||
          !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw Error('pro-json-property');
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) throw Error('pro-json-array');
      const publicRowContext = key === 'context' && typeof descriptor.value === 'string' && rowContexts.has(descriptor.value);
      if (publicReply && (privateKeys.has(normalizedKey(key)) && !publicRowContext ||
          key === 'completeSnapshot' && descriptor.value === true ||
          ['references', 'activities', 'refs'].includes(key) && Array.isArray(descriptor.value))) throw Error('pro-private-reply');
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
  };
  visit(input, 0);
  const json = JSON.stringify(input);
  if (encoder.encode(json).byteLength > PRO_WORKER_MAX_BYTES) throw Error('pro-json-size');
  return JSON.parse(json);
}

const failure = reason => ({ok: false, reason});
const unavailable = () => failure('pro-request-unavailable');
// `instanceof Promise` misses genuine promises created in another realm. The
// native then operation checks the internal Promise brand and does not read a
// plain DTO's `then` getter. Consume both settlements before rejecting an async
// projector so a private exception cannot escape as an unhandled rejection.
function consumePromise(value) {
  try { Promise.prototype.then.call(value, () => {}, () => {}); return true; }
  catch { return false; }
}

/** Worker-local RPC shell. It never opens a database, mints a grant, invokes a
 * provider, interprets payload as authority or exposes a private port result.
 *
 * invoke({action,payload,context,guard,signal}) -> Promise<Result<privateValue>>
 * projectReply({action,value,context}) -> public JSON DTO (synchronous)
 *
 * Both functions belong to packaged shared-owner composition. projectReply is
 * REQUIRED and must validate the exact public schema for each action, including
 * paging and consent descriptions. Evidence replies contain reviewable process
 * descriptions only; packs, handles, snippets and the complete index stay here.
 * The default Free composition does not instantiate this service.
 */
export function createProWorkerService({ui, invoke, projectReply, maxPending = 32,
  elapsedNow = () => performance.now(), schedule = setTimeout, cancel = clearTimeout} = {}) {
  if (typeof ui?.withScope !== 'function' || typeof invoke !== 'function' || typeof projectReply !== 'function' ||
      !Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 128 ||
      [elapsedNow, schedule, cancel].some(value => typeof value !== 'function')) throw Error('pro-worker-owner-required');
  const attempts = new Set();
  let stopped = false, scopeWork = 0, invokeWork = 0;

  const abortAttempt = attempt => {
    attempt.active = false;
    attempt.abort.abort();
  };
  function revokeDocument(id) {
    for (const attempt of attempts) if (attempt.uiDocumentId === id || attempt.parentDocumentId === id ||
        attempt.parentDocumentId === null) abortAttempt(attempt);
  }
  function revokeMount(id) { for (const attempt of attempts) if (attempt.mountId === id) abortAttempt(attempt); }
  function revokeTab(id) { for (const attempt of attempts) if (attempt.tabId === id) abortAttempt(attempt); }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const attempt of attempts) abortAttempt(attempt);
    // Never clear outstanding work counters when a response merely timed out.
  }
  const isIdle = () => !stopped && attempts.size === 0 && scopeWork === 0 && invokeWork === 0;

  async function handle(input, originalSender) {
    if (stopped) return unavailable();
    if (Math.max(attempts.size, scopeWork, invokeWork) >= maxPending) return failure('pro-request-capacity');
    let message, sender;
    try {
      message = jsonClone(input); sender = jsonClone(originalSender);
      if (!exactHostRecord(message, ['v', 'type', 'grantId', 'mountId', 'action', 'payload']) ||
          message.v !== 1 || message.type !== 'HOST_UI_PRO' || !tokenOK(message.grantId) || !tokenOK(message.mountId) ||
          !PRO_WORKER_ACTIONS.includes(message.action) || !record(message.payload) ||
          !record(sender) || !tokenOK(sender.documentId) || !Number.isSafeInteger(sender.tab?.id) || sender.tab.id < 0) throw Error('invalid-pro-request');
    } catch { return failure('invalid-pro-request'); }
    const started = elapsedNow();
    if (!Number.isFinite(started)) return unavailable();
    const attempt = {active: true, abort: new AbortController(), started, last: started,
      mountId: message.mountId, uiDocumentId: sender.documentId, tabId: sender.tab.id, parentDocumentId: null};
    attempts.add(attempt);
    let context = null, scopeKey = null, called = false, approvedReply = null;
    const live = () => {
      const at = elapsedNow();
      if (!Number.isFinite(at) || at < attempt.last || at - started >= PRO_WORKER_DEADLINE_MS) {
        abortAttempt(attempt); return false;
      }
      attempt.last = at;
      return !stopped && attempt.active && !attempt.abort.signal.aborted;
    };
    const guard = () => {
      try {
        const current = live() && context !== null && context.scope?.key === scopeKey &&
          context.parentFrame?.documentId === attempt.parentDocumentId && context.parentFrame?.tabId === attempt.tabId &&
          context.isCurrent() === true;
        if (!current) abortAttempt(attempt);
        return current;
      } catch { abortAttempt(attempt); return false; }
    };
    const check = () => { if (!guard()) throw Error('pro-authority-expired'); };
    let rejectAbort;
    const aborted = new Promise((_, reject) => {
      rejectAbort = () => reject(Error('pro-request-aborted'));
      attempt.abort.signal.addEventListener('abort', rejectAbort, {once: true});
    });
    const work = async () => {
      scopeWork++;
      try {
        return await ui.withScope({sender, grantId: message.grantId, mountId: message.mountId}, async current => {
          if (called || !live()) throw Error('pro-authority-expired');
          called = true;
          if (!current || typeof current.isCurrent !== 'function' || typeof current.scope?.key !== 'string' ||
              !current.scope.key || current.scope.key.length > 4096 || !tokenOK(current.parentFrame?.documentId) ||
              current.parentFrame.tabId !== attempt.tabId) throw Error('pro-owner-context-required');
          context = current; scopeKey = current.scope.key; attempt.parentDocumentId = current.parentFrame.documentId;
          check();
          let result;
          invokeWork++;
          try { result = await invoke({action: message.action, payload: message.payload, context, guard, signal: attempt.abort.signal}); }
          finally { invokeWork--; }
          check();
          // A failed owner operation is never projected, and its arbitrary
          // reason/value/exception cannot become a frame-visible error channel.
          if (!exactHostRecord(result, ['ok', 'value']) || result.ok !== true) throw Error('pro-owner-action-failed');
          const value = projectReply({action: message.action, value: result.value, context});
          // A miscomposed async projector is rejected, but its eventual reject
          // must not escape as an unhandled worker exception after RPC failure.
          if (consumePromise(value)) throw Error('pro-projector-must-be-synchronous');
          check();
          approvedReply = jsonClone({ok: true, value}, {publicReply: true});
          check();
          return approvedReply;
        });
      } finally { scopeWork--; }
    };
    try {
      const result = await withRequestDeadline(() => Promise.race([work(), aborted]),
        {timeoutMs: PRO_WORKER_DEADLINE_MS, now: elapsedNow, schedule, cancel});
      check();
      if (approvedReply === null || result !== approvedReply) throw Error('pro-owner-result-mismatch');
      return result;
    } catch { return unavailable(); }
    finally {
      abortAttempt(attempt);
      attempt.abort.signal.removeEventListener('abort', rejectAbort);
      attempts.delete(attempt);
    }
  }
  return Object.freeze({handle, revokeDocument, revokeMount, revokeTab, stop, isIdle});
}
