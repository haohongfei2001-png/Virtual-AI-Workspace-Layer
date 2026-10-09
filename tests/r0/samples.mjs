export const SCOPE_A = Object.freeze({ provider: 'synthetic-r0', account: 'synthetic-A', organization: 'synthetic-personal' });
export const SCOPE_B = Object.freeze({ provider: 'synthetic-r0', account: 'synthetic-B', organization: 'synthetic-personal' });
export function witness(overrides = {}) {
  return { evidence: 'SYNTHETIC_WITNESS', status: 'verified', scope: SCOPE_A, document: 'synthetic-doc', tab: 'synthetic-tab',
    frame: 0, route: 'https://r0.invalid/c/T0', routeRevision: 1, branch: 'synthetic-main', expiresAt: 20000, ...overrides };
}
export function observation(token, overrides = {}) {
  return { ...token, evidence: 'SYNTHETIC_WITNESS', nativeTitle: 'Synthetic native title', renderedRoots: 1, transitioning: false,
    messages: [{ id: 'synthetic-u1', conversation: token.conversation, branch: token.branch, role: 'user', sent: true },
      { id: 'synthetic-a1', conversation: token.conversation, branch: token.branch, role: 'assistant', sent: true }], ...overrides };
}
