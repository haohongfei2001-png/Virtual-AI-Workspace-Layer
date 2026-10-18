# Stale preparation retirement: optional worker-side patch

Base: `3864d39c0b85f8fa5ade02a657046c44e69fc4b9`. Last remote check: 2026-10-18 09:07 UTC.

This handoff contains an **unapplied** `host-view-service.mjs` patch and a standalone seven-case regression. Adding these files alone does not change production. The local sole writer can integrate the small patch at its normal checkpoint; it does not touch content-session or surface-controller.

## Established mechanism

An actual UI port disconnect revokes its child document/grant through `host-ui-owner.mjs:40,192–196`, without retiring the entire parent mount. A view preparation captures that child's `isCurrent` guard. If it becomes false during an in-flight read or a scheduled retry, `host-view-service.mjs:75–102` returns from its completion/timer callbacks without clearing `pending`/retry bookkeeping. After the underlying work settles, `views.isIdle()` stays false; `host-binding-service.mjs:219–224` then refuses authenticated `HOST_UI_IDLE_CHECK` and `HOST_UI_IDLE_RELEASE` with `ui-release-busy`. The original 30-second callback also returns on the stale guard. A future authorized VIEW sweeps stale entries, but a revoked child's failed request never reaches that sweep.

The regression uses the actual binding service, UI owner, view owner and repositories with explicit synthetic browser/provider doubles and MockIDB. It disconnects a registered UI port through the production callback. It neither replaces `isIdle` nor grants authorization through a test-only path. A separate fake elapsed clock isolates scheduler cleanup from wall-clock grant expiry.

This proves an independent mechanism defect, **not the cause of the recorded partial JOIN MV3 failure**. `busy-partial-join-preflight-fail.json.gz` records a busy preflight before fault injection but contains no worker-owner breakdown. No real account, browser run, `_blank` closure cause, accounts403 resolution, J2/J4 closure or release readiness is claimed.

## Patch and checks

The patch retires only the current generation of a stale preparation, and only if the map still owns that exact entry. It reuses existing `remove()`/owner stop at existing timer or completion checkpoints. It leaves `isIdle()` read-only, retains underlying read/refresh/scope-work counters, and does not change deadlines, retry counts, grants, partial-close behavior or checks of legitimate in-flight work. A pending raw read still blocks idle after its RPC deadline; an old callback cannot delete a replacement mount entry.

From repository root:

```sh
# Baseline is intentionally red: 4 FAIL / 3 PASS.
node --test tests/runtime/idle-stale-view.repro.mjs

# Apply only after reconciling current local owner changes.
git apply --check tests/runtime/idle-stale-view.patch
git apply tests/runtime/idle-stale-view.patch
node --test tests/runtime/idle-stale-view.repro.mjs \
  tests/host/host-view-idle.test.mjs \
  tests/host/ui-idle-preflight.test.mjs \
  tests/host/host-view-service.test.mjs \
  tests/host/ui-owner.test.mjs
```

Actual candidate result: **195 PASS, 0 FAIL, 0 SKIP**, 2,741.807 ms. Seven new cases cover live preparation, stale completion, expired outstanding read resolving/rejecting, same-mount replacement, stale scheduled retry, and same-entry single-flight generation. This is focused Node integration verification, not full CI or MV3 certification.

SHA-256:

- Base owner: `675cff64543d88b02853c89acc10b418b080045fd52f0d2834ed3a1d5d633e5d`
- Patched owner: `42fa87c56c04910898b3c029896427cb75ca36447b126a4e10ac2eae282454a3`
- Patch: `a133ba94de9b8a0ed62037fc65481f73b0a205071d0f0d4b96badb13b6a0ec18`
- Regression: `d3f7fa2afe3405c5436383bbdedd348ef07d8527be4d64545a0d81a971c2c6d1`
