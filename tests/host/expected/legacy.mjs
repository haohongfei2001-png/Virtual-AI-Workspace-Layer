// Independent oracle, test-process only. Never served to the host document.
export const legacyExpectedWorld = Object.freeze({
  fixtureId: 'chatgpt-host-legacy-reconstruction-v1', reconstruction: true,
  principalId: 'user-host-fixture', contextId: 'account-host-personal',
  projects: [
    { id: 'g-p-11111111111111111111111111111111', name: 'Research', initiallyCanonical: true },
    { id: 'g-p-22222222222222222222222222222222', name: 'Research', initiallyCanonical: false },
  ],
  conversations: [
    { id: '11111111-1111-4111-8111-111111111111', title: 'First project conversation', membership: 'PROJECT', projectId: 'g-p-11111111111111111111111111111111' },
    { id: '22222222-2222-4222-8222-222222222222', title: 'Second project conversation', membership: 'PROJECT', projectId: 'g-p-22222222222222222222222222222222' },
    { id: '33333333-3333-4333-8333-333333333333', title: 'Ordinary conversation', membership: 'NONE', evidence: 'naturally-opened-move-menu' },
    { id: '44444444-4444-4444-8444-444444444444', title: 'Membership not loaded', membership: 'UNKNOWN' },
  ],
  initialCanonicalProjectCount: 1, initialProjectCandidateCount: 1,
  initialConversationCount: 2,
  routes: { home: '/', newChat: '/', search: 'native-dialog' },
});
