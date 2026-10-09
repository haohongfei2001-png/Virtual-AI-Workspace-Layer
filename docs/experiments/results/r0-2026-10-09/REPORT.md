# R0 synthetic capability spike: limited result

Date: 2026-10-09 UTC. Proposal baseline: `223a34f4b4f47d56b17b8d2c1cd3afa5a162101f`; main remains `76e3dbdb283769e5c94fcef2de35f6b21cf7e49c`. Branch: `experiments/vawl-r0-synthetic-20261009`. This is a stacked Draft experiment against `docs/vaiwl-research-proposal-20261010`, not a merge or approval of design PR #1. Source, tests and result files are confined to the three R0 directories.

The inherited STATUS/AGENTS/decisions describe the earlier document-only task and are preserved byte-for-byte on the remote. This report records the later scoped experiment; it does not rewrite the product queue, approve PD-01–PD-12 or authorize B/C.

## Result

**LIMITED: executed synthetic JavaScript contracts; actual browser execution BLOCKED.** There are no LIVE_HOST, MV3, PAIA or product-ready claims. Browser fixture code is a prepared test instrument, not browser evidence. No account, private conversation, model, paid provider, persistent hosted resource, extension install, new permission or other repository was used or changed.

- Node v24.19.0, Linux x64: 27 contract tests pass; 0 fail/skip. Seven module syntax checks and the portable fixture build also pass. Two Python mocked-runner failure-classification tests pass; these are not browser evidence. Python runner syntax compiles.
- Browser: 18 prepared assertions, **0 executed**. Local Chromium failed before page creation; the dedicated cloud browser could not reach the workspace's loopback server. Exact failure excerpts and chronology are in [ENVIRONMENT_ATTEMPTS.json](ENVIRONMENT_ATTEMPTS.json).
- Independent source review identified provenance replay, forged shell references, cleanup exception handling and URL normalization gaps; the implementation was corrected and regressions added. The initial lazy-expiry gap was subsequently addressed with a bounded active-JavaScript scheduler and seven timer regressions; suspended/disabled-code expiry remains explicitly unverified. See [REVIEW.md](REVIEW.md).
- Source hashes, unedited Node test output, run commands and UTC timestamp are in [source-checks.json](source-checks.json). The reproducible fixture uses exactly the reviewed source modules; it is not the old 20/20 product prototype.

## Capability matrix

| Capability / R0 item | Evidence actually obtained | Decision | Dependency / executable limit |
|---|---|---|---|
| R0-00 source/environment inventory | Fixed remote baseline; local tools; eleven current official sources | GO for this bounded source review | [Official source review](OFFICIAL_SOURCE_REVIEW.md) does not confer platform/legal approval. |
| R0-01 scope/epoch commit contract | Positive same-scope; A→B→A; org/document/tab/route changes; stale asynchronous commit; source-ref revocation | LIMITED | Synthetic witnesses only. No actual host identity discovery/authentication. |
| R0-01 unknown/currentness | Unknown clears memory; issued-token identity; API-boundary plus scheduled expiry; cleanup callback and scheduler failure regressions | LIMITED | Memory-only experiment. Node tests both injected scheduler fault cases and a real active Node timer; actual browser timer behavior is prepared but unexecuted. |
| R0-01 unattended sensitive projection | No independent lease/freeze/disabled-code evidence | NO_GO in this experiment | Never enable unattended sensitive projection or claim no-cleanup recovery from this code. |
| R0-02 route/render/message ownership contract | All ownership fields rejected independently; residual conversation/branch, duplicate IDs, draft/unknown role rejected | LIMITED | Only synthetic metadata retained, no user text/body extraction. Real route/body binding BLOCKED. |
| R0-02 reference/history/export coverage | Explicit reference-only/partial-user-metadata states, no account-total field | LIMITED for stated metadata | Full history, hidden T5, real branch identity, native Project witness, clean official export/schema/ZIP parser NOT_RUN. No all-account coverage claim. |
| R0-03 same-scope cross-Project reference contract | T0/P1-T1/P2-T2 retain native source values and URLs; derived title separate; cross-account/org refs rejected | LIMITED | Actual ChatGPT Project ownership and navigation BLOCKED. No context/file/permission merging. |
| R0-04 original DOM preservation / controlled exit | Source-reviewed additive-only shell; prepared real-browser assertions | BLOCKED | Zero browser executions. No composer/transcript reconstruction or native style/history write exists in probe source. Runtime behavior not certified. |
| R0-04 hidden-native-navigation replacement | Not implemented or tested | NO_GO for enabling this strategy | Additive-only exploration avoids hiding native navigation; it is a deliberately smaller experimental surface, not approval to change the product target. |
| R0-04 real MV3/disable/re-enable/freeze | No extension installed | BLOCKED | No worker restart, extension reload/disable, browser freeze, physical IME or screen-reader evidence. |
| R0-05 actual PAIA/ACS/CTM coexistence | No actual builds installed or private stores read | BLOCKED | All four actual PAIA arms, order reversal and independent exit NOT_RUN. No mock extension substituted. |
| R0-06 evidence and stopping decision | Source checks, failed environment attempts, review, official sources, rerunnable runner | GO for reporting | Stop after this Draft delivery. Do not infer GO for any unexecuted capability. |

## Data / permission / coverage ledger

| Channel | Input / retained output | Persistence / outbound | Permission |
|---|---|---|---|
| Node synthetic witnesses | Fixed synthetic account/org/document/route/branch IDs; ref/title metadata and counts | Process memory; local test reports only | None |
| Synthetic browser fixture | Fixture-owned DOM and draft; runner alone inspects its synthetic draft to assert unchanged state | No host storage; CSP blocks connections; local runner blocks non-loopback requests | None; no extension |
| Probe shell | Validated synthetic reference metadata | Own DOM only; no composer/body read, no host history/style mutation | None |
| Official public pages | Bounded architecture-changing documentation facts | This cited report | Public read only |
| Real ChatGPT/sidebar/search/export/network | Not accessed | None | Not granted/used |
| Cloud/model/native writer/sync/PAIA data | Not implemented or accessed | None | Default off |

This is neither an official export parser nor durable B-stage storage. No unobserved conversation is assigned a title, body, count or membership. Partial metadata does not imply full text or complete history. Shared routes and noncanonical/credential-bearing URLs are rejected by the fixture contract.

## Recovery / native ownership limits

The probe mounts a namespace-owned section only in an explicitly empty fixture slot. It never hides the synthetic native navigation and never replaces the host transcript/composer/model/tools. Controlled disposal removes only its own section, and source/scope invalidation triggers cleanup. Native state is neither copied nor restored from stale strings.

That source design is not measured browser behavior. In particular, the prepared BF-12 intentionally leaves an additive panel without cleanup and expects residual layout, while native controls remain present. Even a future passing BF-12 is **not** a successful real extension-disable recovery. The first reviewed gate checked expiry lazily. The follow-up change adds an active-JavaScript scheduler with cancellation, epoch checks, deadline rechecks and fail-closed scheduling. Seven actual Node regressions pass, including one default real Node timer without API polling; BF-18 prepares an actual browser timer assertion but has not run. No independent lease or clean layout is promised when extension code is disabled, frozen or terminated.

## Actual blockers and one next experiment

**One next task:** obtain a browser-capable isolated execution route for this exact fixture and run the prepared runner, preserving scope and all existing limits. The current machine's Chromium failed with socket EPERM; the dedicated cloud browser's loopback attempt was refused. No security setting or browser protocol was bypassed, no new resource was provisioned and no repeated launch loop was used.

A minimal possible repository-based route would add exactly one `.github/workflows/r0-fixture.yml` file to a separately approved change. It would run only synthetic source checks and Playwright in an ephemeral standard runner, with read-only repository permission, no secrets, no live account, bounded timeout and evidence upload. **It was not created or run**, because it is outside the three-directory boundary and this task excludes new CI workflows. Runner availability/billing entitlement would need checking before that route, without assuming “free” authorizes a resource or cost.

That fixture rerun will not resolve the independent LIVE_HOST gates: permitted clean-account environment and identity witnesses, real route/body/Project binding, real MV3 lifecycle and exact PAIA-build coexistence. Formal B/C runtime implementation remains stopped. Product interaction approvals remain pending; no broad architecture research or new product prototype is needed to close the first execution gap.
