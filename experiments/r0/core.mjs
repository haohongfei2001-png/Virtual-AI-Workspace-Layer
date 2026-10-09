/** R0 synthetic contracts. No ChatGPT adapter, authentication, I/O or persistence. */
const referenceProvenance = new WeakMap();
const validText = (v, max = 128) => typeof v === 'string' && v.length > 0 && v.length <= max;
const fail = reason => ({ ok: false, reason });
export const FIXTURE_ORIGIN = 'https://r0.invalid';

export function scopeKey(scope) {
  if (!scope || scope.provider !== 'synthetic-r0' || !validText(scope.account) || !validText(scope.organization)) return null;
  return JSON.stringify([scope.provider, scope.account, scope.organization]);
}

export function fixtureRoute(raw) {
  try {
    if (typeof raw !== 'string' || raw.includes('?') || raw.includes('#')) return null;
    const url = new URL(raw);
    if (raw !== url.href) return null; // Reject normalization, whitespace, dot segments and alternate spellings.
    if (url.origin !== FIXTURE_ORIGIN || url.username || url.password || url.search || url.hash) return null;
    const match = /^\/(?:p\/([A-Za-z0-9_-]+)\/)?c\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    return match ? { url: url.href, project: match[1] ?? null, conversation: match[2] } : null;
  } catch { return null; }
}

export class FixtureScopeGate {
  #epoch = 0;
  #binding = null;
  #tokens = new WeakSet();
  #listeners = new Set();
  constructor(now = () => Date.now()) { this.now = now; }
  onInvalidate(callback) { this.#listeners.add(callback); return () => this.#listeners.delete(callback); }
  invalidate(reason = 'transition') {
    this.#epoch += 1;
    this.#binding = null;
    // Clear projection before accepting any subsequent scope or response.
    let cleanupErrors = 0;
    for (const callback of [...this.#listeners]) {
      try { callback(reason); } catch { cleanupErrors += 1; }
    }
    return { ok: cleanupErrors === 0, cleanupErrors };
  }
  bindFixture(witness) {
    if (!this.invalidate('bind').ok) return fail('cleanup-failed');
    const key = scopeKey(witness?.scope);
    const route = fixtureRoute(witness?.route);
    if (!key || !route || witness?.evidence !== 'SYNTHETIC_WITNESS' || witness?.status !== 'verified' ||
        !validText(witness.document) || !validText(witness.tab) || witness.frame !== 0 ||
        !validText(witness.branch) || !Number.isSafeInteger(witness.routeRevision) || witness.routeRevision < 0 ||
        !Number.isFinite(witness.expiresAt) || witness.expiresAt <= this.now()) return fail('invalid-witness');
    this.#binding = Object.freeze({ scope: key, epoch: this.#epoch, document: witness.document, tab: witness.tab,
      frame: 0, route: route.url, routeRevision: witness.routeRevision, conversation: route.conversation,
      project: route.project, branch: witness.branch, expiresAt: witness.expiresAt });
    return { ok: true, evidence: 'SYNTHETIC_WITNESS' };
  }
  token() {
    if (!this.#binding || this.#binding.expiresAt <= this.now()) {
      if (this.#binding) this.invalidate('expired');
      return null;
    }
    const token = Object.freeze({ ...this.#binding });
    this.#tokens.add(token);
    return token;
  }
  check(token) {
    if (!token || !this.#tokens.has(token)) return fail('unissued-token');
    if (!this.#binding) return fail('unknown-scope');
    if (this.#binding.expiresAt <= this.now()) { this.invalidate('expired'); return fail('expired'); }
    if (token.epoch !== this.#binding.epoch) return fail('stale-epoch');
    for (const key of ['scope', 'document', 'tab', 'frame', 'route', 'routeRevision', 'conversation', 'project', 'branch']) {
      if (token[key] !== this.#binding[key]) return fail(`mismatched-${key}`);
    }
    return { ok: true };
  }
}

export function validateFixtureObservation(gate, token, observation) {
  const current = gate.check(token);
  if (!current.ok) return current;
  if (!observation || observation.evidence !== 'SYNTHETIC_WITNESS') return fail('not-fixture-evidence');
  for (const key of ['scope', 'document', 'tab', 'frame', 'route', 'routeRevision', 'conversation', 'project', 'branch']) {
    if (observation[key] !== token[key]) return fail(`observation-${key}`);
  }
  if (observation.renderedRoots !== 1 || observation.transitioning) return fail('ambiguous-render');
  if (!Array.isArray(observation.messages) || observation.messages.length > 1000) return fail('invalid-messages');
  const ids = new Set();
  for (const message of observation.messages) {
    if (!message || !validText(message.id) || ids.has(message.id) || message.conversation !== token.conversation ||
        message.branch !== token.branch || !['user', 'assistant'].includes(message.role) || message.sent !== true) return fail('message-ownership');
    ids.add(message.id);
  }
  if (!validText(observation.nativeTitle, 512)) return fail('invalid-title');
  // Only metadata is retained. No body, draft, attachment or assistant content is copied.
  const reference = Object.freeze({ scope: token.scope, id: token.conversation, url: token.route,
    nativeProject: token.project, nativeTitle: observation.nativeTitle, branch: token.branch,
    knownUserMessages: observation.messages.filter(m => m.role === 'user').length,
    coverage: observation.messages.some(m => m.role === 'user') ? 'partial_user_metadata' : 'reference_only',
    evidence: 'SYNTHETIC_WITNESS' });
  referenceProvenance.set(reference, { gate, token });
  return { ok: true, reference };
}

export function checkFixtureReference(gate, token, reference) {
  const current = gate.check(token);
  if (!current.ok) return current;
  const provenance = reference && referenceProvenance.get(reference);
  if (!provenance) return fail('unvalidated-reference');
  if (reference.scope !== token.scope) return fail('cross-scope');
  if (!provenance.gate.check(provenance.token).ok) return fail('stale-reference');
  return { ok: true };
}

export function onFixtureReferenceInvalidated(reference, callback) {
  const provenance = reference && referenceProvenance.get(reference);
  if (!provenance) throw new Error('Cannot subscribe to an unvalidated reference');
  return provenance.gate.onInvalidate(callback);
}

export class FixtureProjection {
  #references = new Map();
  #rows = new Map();
  #sourceUnsubscribe = new Map();
  constructor(gate) { this.gate = gate; this.unsubscribe = gate.onInvalidate(() => this.clear()); }
  clear() {
    for (const unsubscribe of this.#sourceUnsubscribe.values()) unsubscribe();
    this.#sourceUnsubscribe.clear(); this.#references.clear(); this.#rows.clear();
  }
  dispose() { this.clear(); this.unsubscribe(); }
  add(token, reference) {
    const check = checkFixtureReference(this.gate, token, reference);
    if (!check.ok) return check;
    this.#sourceUnsubscribe.get(reference.id)?.();
    this.#references.set(reference.id, reference);
    this.#sourceUnsubscribe.set(reference.id, onFixtureReferenceInvalidated(reference, () => {
      this.#references.delete(reference.id); this.#rows.delete(reference.id);
      this.#sourceUnsubscribe.get(reference.id)?.(); this.#sourceUnsubscribe.delete(reference.id);
    }));
    if (!this.#rows.has(reference.id)) this.#rows.set(reference.id, { title: reference.nativeTitle, revision: 0, manual: false });
    return { ok: true };
  }
  setDisplayTitle(token, id, title, baseRevision, origin = 'manual') {
    const check = this.gate.check(token);
    if (!check.ok) return check;
    const row = this.#rows.get(id);
    if (!row || !validText(title, 512) || !['manual', 'candidate'].includes(origin)) return fail('invalid-edit');
    if (row.revision !== baseRevision) return fail('revision-conflict');
    if (row.manual && origin === 'candidate') return fail('manual-lock');
    this.#rows.set(id, { title, revision: row.revision + 1, manual: origin === 'manual' });
    return { ok: true };
  }
  view(token) {
    if (!this.gate.check(token).ok) return [];
    return [...this.#references.values()].filter(ref => checkFixtureReference(this.gate, token, ref).ok).map(ref => {
      const view = Object.freeze({ ...ref, display: Object.freeze({ ...this.#rows.get(ref.id) }) });
      referenceProvenance.set(view, referenceProvenance.get(ref));
      return view;
    });
  }
}
