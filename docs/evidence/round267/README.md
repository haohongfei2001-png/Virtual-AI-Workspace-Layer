# Round267 — Current-body calibration on Free workspace entry

Base `fad7326a91ee2ef6984c94ea1d6812914bdb6e4e`, original local branch / Draft PR16, 2026-10-16.

The formal Free frame now connects foreground/workspace entry and successful history segment transitions to a bounded current-body calibration. Only the workspace role initiates it; sidebar callbacks cannot duplicate the read. The UI sends only the existing grant/mount plus foreground/history kind. The worker validates UI scope, then privately selects the unique current body matching scope grant, parent tab/document/URL and producer/document/route binding. UI-supplied proof IDs, conversation IDs and budget windows are rejected.

The existing metadata reader and authenticated historical consumer perform the read/write. No schema, second runtime, scheduler or history crawler is introduced. Entry reads are opportunistic, with no automatic retry or queue. Existing current/send reads take precedence and abort a lower-priority entry; old completions cannot clear the new single flight. The entry guard and combined cancellation signal reach the historical transaction gate. Calibration results cannot become send-ACK readbacks. Existing provider-owned persistent GET budgets remain authoritative; cancellation does not refund spent requests or undo previously legitimate commits.

## Evidence

- Reader tests cover lower-priority refusal, foreground preemption, late provider responses, guard/signal invalidation during historical work and no ACK capability.
- Entry service and actual body-owner tests cover exact parent identity, strict request schema, workspace-only dispatch, six-second deadline, stop and sanitized response.
- Frame/navigation tests execute real client/navigation code with independent fixtures: successful segment application triggers calibration, failed/stale responses do not; lifecycle, visibility, busy and auxiliary-panel guards are exercised.
- Isolated actual Chrome MV3 J2 fast-failure/retry passes both implemented steps, including exact ACK after immediate native retry (124ms in this run). Source hashes unchanged; no page errors. This is the fast-retry slice, **not full J2 or a real-account result**. It does not independently demonstrate the new entry-to-historical-write browser journey; that direct browser oracle remains next.
- Complete Node result is in `node-final.log.gz` and STATUS. Initial reader API-key assertion and parallel test-fixture role mismatch are retained as development test corrections, not hidden product passes.

CI for prior `51d9ef2` has ended FAILURE; `fad7326` was still in progress at the last query. Local success does not replace those results. No manual CI rerun or deployment was triggered.

This implements a bounded current-body portion of B2.F3/C3, not arbitrary older-history calibration or full FR-08. Complete81/profile matrix, scale/cold reliability, genuine account/PAIA/IME/cross-device G/U and release gates remain open. **Free NOT_RELEASE_READY.**
