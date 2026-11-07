# One-shot recovery after an expired document handshake

Integration handoff only. The sole Free writer chooses when to apply this patch.
No production source or ordinary test list is changed by this collaboration branch.

## Exact candidate

- Reviewed production base: `206af45931e417106c3c236ceb881c43e31d1c09`.
- Rechecked integration base: `c070abb567f97e1937fbd200860754b8afcc905c`; intervening changes are documentation and J2 diagnostics, not this owner.
- Unchanged `src/host/content-session.mjs` SHA256: `25325cab877fad024d513049bcdc8ce056055703499c9282bc0d3caa68164e70`.
- Candidate owner SHA256 after applying the patch: `57f648a96468c36eefadd9f5e63285cf21c88427c65630d7f5868e01ab1fe31f`.
- Patch SHA256: `8ef8e98adb33972a16e0a6d828137e9c013acd11b50cdfd9ce412bec7cf3836b`.
- Reproducer SHA256: `2d9fcd05260a6fddf340af8d3cba2c2b678a9917a47eed5849a38537662df90f`.

## Mechanism and boundary

A worker can lose its document handshake after successful `HOST_DOCUMENT_RENEW`, before `HOST_REFRESH`. The binding service then returns exactly `{ok:false,reason:'invalid-host-document'}`. Existing content renewal treats every failed refresh as a scope refusal and latches `recoveryDenied`, so the existing `session-renew-failed` termination cannot spend its one fresh handshake opportunity.

The proposed branch classifies only that exact response as `invalid-host-binding`, matching the existing treatment of a failed document renewal. It delegates recovery to the existing termination callback; it does not directly rebind, clear a prior denial, add retries, extend the six-second request deadline, or reuse an old grant. Actual unknown/denied/different scopes and malformed responses keep the denial latch. This is consistent with the existing narrow `HOST_FOCUS` invalid-document recovery classification.

This deterministic transport-seam defect is **not established as the cause of CI39101646460's J2 failure**. That run's startup diagnostic misses messages before installation, and a later local J2 run passed. No new browser or CI run was performed here.

## Reproduce and integrate

On the unchanged production base, this intentional regression reproducer reports 2 failures and 8 passing refusal/cancellation controls:

```sh
node --test tests/host/renew-handshake-recovery.repro.mjs
```

The patch changes one production line and adds the ordinary regression test `tests/host/renew-handshake-recovery.test.mjs`. Inspect current local edits first; do not apply over unrelated WIP or cherry-pick the handoff as a product fix.

```sh
git apply --check tests/host/renew-handshake-recovery.patch
git apply tests/host/renew-handshake-recovery.patch
node --test tests/host/renew-handshake-recovery.test.mjs
```

Validated in an isolated temporary tree with the patch actually applied: 10/10 new tests and 92 existing related tests passed (102/102, no skips). The existing groups were `content-session-recovery.test.mjs`, `content-session-start-recovery.test.mjs`, `content-session.test.mjs`, and `content-foreground-recovery.test.mjs`.

The ten new cases cover successful one-shot replacement, exact denial/malformed/different-scope controls, an already-latched denial, stop/pagehide cancellation, failed replacement without looping, and six-second timeout plus late response. No browser, real account, native content, persisted authorization, scale test, or release assertion is involved. Parent independent review ran the ten tests against the actual patched source and reported no blocker.
