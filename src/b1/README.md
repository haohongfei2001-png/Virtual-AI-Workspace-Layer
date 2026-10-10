# B1 limited engine: ScopeRepository + DocumentBindingBroker

These are B1 implementation modules, **not a ChatGPT adapter**. They were built after the R0 LIMITED verdict on design PR #1; original R0 evidence is kept in Draft PR #4.

## Boundary

- \`ScopeRepository\`: extension-origin IndexedDB, scoped immutable conversation references, atomic expectedRevision CAS, operationId replay verification, listing/getting within a verified scope. No chat text, cookies, titles, input drafts, model output or auth tokens are collected.
- \`DocumentBindingBroker\`: verifies the Chrome \`MessageSender\` against \`webNavigation.getFrame\` for the current tab/frame/document; requires a *separate trusted* account/organization resolver before minting a lease; handles current-document handoff without an old lease blocking; denies old client/sequence, route revocation, expired lease and worker restart reuse.
- All operation messages are strictly shaped. Scope/organization are never accepted from the request envelope. Observed browser document URL is not an account identity.
- Worker remains disposable. Durable records live in IndexedDB, while lease tokens live only in worker memory; lost worker leases must be rebound.

**No trusted real ChatGPT account resolver has been validated or shipped.** The only assembled MV3 worker is the \`experiments/b1/fixture\` build, which recognizes \`127.0.0.1/b1-fixture/A|B.html\` as *synthetic test scopes*. It does not request access to ChatGPT or install production navigation. A future verified identity adapter must be separately designed and tested before enabling any private ChatGPT projection.

## Known constraints

- No live ChatGPT identity proof, actual conversation/message timestamps, official export parsing, account permission logic or Project attribution is claimed.
- \`beforeCommit\` synchronously rejects stale bindings just before IndexedDB writes are scheduled, and the broker rejects results that become stale before return. A navigation invalidation after an IndexedDB write is queued can still race transaction commit; B1 only writes synthetic/minimal references. Stronger durable invalidation fencing, cancellation and account-change tests are required before sensitive production data.
- Automatic reconnection after arbitrary SPA transitions, extension disable/reload/re-enable and frozen-page instantaneous DOM cleanup remain unproven. This B1 fixture displays no sensitive content.
- No UI, automatic classification, native rename, import, sync, cloud model, PAIA integration or genuine ChatGPT content-script injection is implemented.
- Canonical URLs and actual native IDs in production must come from independently verified host evidence. The synthetic worker stores a fixture URL and a synthetic reference ID only.

See \`docs/engineering/B1_IMPLEMENTATION_2026_10_11.md\` for real execution evidence, and Draft PR #4 for the R0 failures that motivated this phase.
