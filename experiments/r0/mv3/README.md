# R0-04 MV3 source preparation (NOT LOADED)

This is a **separate, source-only experimental probe**, based on the already verified R0 branch. It does not change the original page fixture, product behavior or any proposal decision. The code has not been loaded into Chromium as an extension. Node mocks and packaging tests do not establish MV3 lifecycle behavior.

## Current execution boundary

Allowed here: write this minimal probe and run ordinary Node/Python contract and static-assembly tests in the original R0 directories. Actual unpacked-extension loading, browser/profile operation, extension CI and any new permissions remain pending separate approval. No such operation is performed by any command below.

No ChatGPT adapter, account authentication, native write, product storage, AI, cloud, PAIA integration, page-message bridge, production UI or formal B/C implementation is included. Do not install this on a daily browser.

## Small source surface

- `manifest.json`: MV3 module worker and a static isolated-world content script, matched only to `http://127.0.0.1/r0-mv3-fixture/*`. Match rules are a declared host-access surface even without a separate `host_permissions` field; they have **not** been granted or exercised.
- Runtime URL validation further permits only canonical `/r0-mv3-fixture/A.html` and `B.html`, without credentials, query or fragment. It excludes localhost aliases, real hosts and subframes. The manifest pattern is not a port-level permission boundary; any future test runner must additionally restrict its ephemeral origin/egress.
- `protocol.mjs`: exact bounded message schema; browser-supplied extension/tab/frame/document/lifecycle/URL identity; worker boot ID, client session ID, monotonically increasing request sequence and random lease ID. No payload-supplied identity or page scope is trusted.
- `worker.mjs`: actual extension entry source, only registered against a **mocked** Chrome runtime in unit tests. No external-message listener. At most 32 in-memory tab slots; four-second leases; no storage, reconnect loop, heartbeat or background network.
- `client.mjs`: bounded request wait, generation-bound response acceptance, final URL/deadline recheck, ownership cleanup, active-timer expiry and cleanup-failure latch. Stops and timeouts settle pending promises; stale replies/callbacks cannot clear a newer connection.
- `content-entry.mjs`: sole owned synthetic marker in an empty namespaced slot. It never reads or changes transcript, composer, native styles, model or tools. Only trusted lifecycle events are accepted: pagehide/freeze/hidden/popstate/hashchange stop the local lease; visible pageshow/resume/visibility request a fresh handshake. Initially hidden pages do not connect. It does not listen to postMessage, wrap pushState, parse page account metadata or automatically refresh. Node VM wiring tests use fakes, not a browser DOM.
- `host-fixture.html`: script-free synthetic native island, supplied as future A/B fixture bytes. The metadata marker is only a fixture switch, never authentication.
- `build-probe.mjs`: deterministic four-file source assembly into a dedicated empty directory outside this repository. No browser/server/extension loader exists in this preparation.

## Lease contract and deliberate limits

A duplicate/reordered BIND does not renew its lease. A new explicit local connection request may obtain a fresh lease. A different document/client/URL cannot evict an unexpired slot by arriving later; it is conservatively refused until expiry. There is no RELEASE/disconnect command that an old client could use to remove a new owner.

CHECK accepts only the exact current sender/client/worker/lease with a later request sequence; it never renews expiry. It is prepared for tests and is not an automatic heartbeat. A new broker instance has a fresh boot ID and no old leases.

These values are message/ownership correlation, **not account scope witnesses or capabilities for reading/writing real content**. This probe displays only a fixed nonsensitive marker. The content controller has no independent immediate worker-death detector: without a new connection or lifecycle signal it relies on its short active-JavaScript lease. The four-second constant assumes active execution and a normally advancing Date.now clock; it is not an unconditional maximum lifetime. Source mocks cannot establish real sender delivery, process death, disable cleanup, frozen execution, clock behavior or native usability. In particular, disabled/frozen code may not execute cleanup at all. A-to-B-to-A unit tests explicitly invoke controller transitions; they do not prove automatic production SPA tracking. Do not enable sensitive projection or hide native navigation based on these tests.

The mount callback contract is ownership-specific and failure-atomic: validate before inserting; return its cleanup immediately after insertion. Cleanup failures are recorded and further mounts are refused. Tests deliberately exercise callback reentry and failures; they do not prove browser DOM recovery.

## Reproduce only permitted checks

From repository root:

```sh
node tests/r0/mv3/run-checks.mjs /tmp/vawl-r0-mv3-source-checks
```

This runs source syntax, new Node contracts, Python static packaging tests and the unchanged original 27 Node / 2 Python checks. Browser/extension evidence stays NOT_RUN.

To inspect the source package without loading it:

```sh
node experiments/r0/mv3/build-probe.mjs /tmp/unique-empty-r0-mv3-output
```

Do not infer permission to execute a browser load command from the existence of the assembled manifest. No generated package is committed or used as an installable release.

## Next bounded experiment, after approval

Only in an approved ephemeral CI profile: load this owned unpacked probe, serve synthetic A/B on loopback, establish a no-extension baseline, then execute genuine worker restart/reconnect, extension reload, disable/re-enable and freeze/resume cases. Observe real worker boot changes and actual sender provenance; never claim that constructing a second JavaScript broker proves a killed worker. Measure native operability, layout residue and projection lifetime separately and preserve failures/NOT_RUN.

The original R0-04/06 instructions remain authoritative. Actual clean ChatGPT accounts, sample creation/export, PAIA's exact installed build and formal B/C are separate gates. Product PD-01–PD-12 remain pending.

Official references checked 2026-10-10: [Playwright extension testing](https://playwright.dev/python/docs/chrome-extensions), [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [Chrome declared permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions). These are preparation references, not execution evidence.

