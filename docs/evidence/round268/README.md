# Round268 — Entry calibration browser oracle and shared-window fairness

Base `3dc82cfb30dfd5ca58c32793d61d575c677593a3`, original directory/branch and Draft PR16, 2026-10-16.

## Actual entry journey

A new isolated headless MV3 runner uses the existing J2 native fixture. A genuine synthetic native send first creates an undated observation anchor. After the existing persisted 30-second budget expires on real wall time, the fixture server exposes its actual original send time without changing the page. No detail GET or strict event occurs before entering the workspace. A trusted click on the sole return control then causes a real `HOST_UI_CALIBRATION_ENTRY` and exactly one current-conversation GET inside that RPC, followed by the correct strict event. The event's conversation, verified actor scope, source admission and generation are checked; the original anchor remains byte-for-byte equal.

The strongest actual positive records a 27ms RPC, identical document timeOrigin/history state and exact original document/reading/message nodes, unchanged native URL/body, one native send, one new detail read and one matching strict event. Worker external network is blocked. Source/package hashes remained unchanged and the isolated temporary Profile was removed. This validates the current-body entry slice, not all history/FR-08, full J2, actual ChatGPT or cross-device acceptance.

A temporary package mutant disables only the entry handler. It fails specifically at `workspace-entry-calibration` with the expected event timeout; stored facts still lack the target strict event and only the two pre-entry detail GETs exist. We explicitly inspect this cause, rather than treating any nonzero exit as mutation detection. That mutation run preceded a runner fix ensuring an unexpected surviving mutant is reported as `MUTATION_SURVIVED` instead of failing the original package hash verifier. The final normal runner verifies the original package before mutation, checks every package file against its exact expected hash afterward, enforces the original six-second RPC duration, and cleans startup resources as well as successful runs.

Entry browser evidence was generated on the base production source, before the independent window correction below. Its manifests retain exact hashes; it is not relabeled as a browser run of the later product tree.

## Product correction

Two actual independently authenticated mounts sharing a scope could reserve the same 1000ms scheduling window, but the first delivery unconditionally closed it while the other mount was still reading. New tests reproduce both second-delivery and original-deadline paths: before the fix a background surface packet was wrongly accepted instead of yielding. Release now removes only the matching entry's participation and rechecks remaining current participants. Identity/generation checks, fixed deadline, publication prerequisite and no-renewal policy remain. Same-mount workspace/sidebar still share one owner.

The two new tests changed from FAIL to PASS. Trace instrumentation preserves the new production behavior; its prior expectation of premature closure was updated. Final full Node: **5324/5324 PASS, zero skipped**. The subsequent uninstrumented isolated 10k single-project run completes native tail/member/return navigation and exact before/after audits: 10000 distinct refs, all 10000 in the correct Project, zero missing/duplicate/unknown/wrong membership, stable revision792. Its status remains **PARTIAL_SYS04_NOT_ACCEPTED**, with single local search/pagination samples rather than p95. Source/fixture/manifest hashes remain stable and the temporary directory is removed. This is a demonstrated fairness defect, not proof that it explains every 10k timeout.

Prior CI `38854583912` on `51d9ef2` failed its formal 10k single-project surface deadline; the log is retained. No CI rerun or deployment was requested. Complete81, scale/cold reliability and genuine G/U remain open. **Free NOT_RELEASE_READY.**
