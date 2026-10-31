# Round264 — Preserve strict browser oracles across asynchronous sampling

Base `e5270a4e9c4757692c135d3a4adda6520edf63dc`, original local branch / Draft PR16, 2026-10-16. Production sources are unchanged.

CI58 (`38851822919`, exact Round262 head6715249) failed: J3 sampled changing parent focus while reading cross-process children; J4 reached its successor-ACK stage but a single timer woke before the strict persisted30-second boundary; 10k initial surfaces stayed in `preparing` past30seconds. Raw failed logs and extracted scale report are retained. No successful local result erases these failures.

## J3 observation repair

The previous first-parent/children/last-parent one-shot assertion assumed that focus could not finish crossing a renderer boundary during protocol reads. The helper now requires two adjacent equal complete three-document snapshots, bounded by8 rounds and the same original15-second phase deadline. It never presses another key or resets cumulative observations while sampling; every round is retained in the report. The original64-key bound, trusted single-key provenance, cumulative parent focus events, overflow rejection, forbidden focus targets, surrender and continuity assertions remain. This is stable observation, not mathematical atomicity.

Independent tests cover changes in each document, nonadjacent equality, nonconvergence, phase expiry and invalid bounds. Stable untrusted/duplicate keyboard observations still fail the original reducer. The actual formal isolated Chrome155 J3 passed16/16; reverse13keys, closed7/7, forward18. Every read stabilized in2 rounds in this local run; CI's transient itself has not yet been reproduced here.

## J4 timer repair

The offline helper rechecks actual wall time after waking and only returns once `Date.now() > startedAt + 30000`. A monotonic deadline caps total waiting, including clock rollback; each sleep is at most1000ms. Production budget, persistent rows and original final assertion are unchanged. Tests cover early wake, exact boundary, invalid/retreating clocks and expired windows. The new helper is included in the J4 source hash manifest.

Actual isolated J4 completed23/23 implemented steps, including successor ACK, disable/uninstall and original native continuity. Status remains PARTIAL_J4_NOT_ACCEPTED; source and build hashes stayed stable. Final full Node regression5234/5234 PASS, zero skips. CI59 (38852582236, e5270a4) subsequently ended FAIL with the10k surfaces deadline; its original failed log is retained.

## Other findings and remaining work

Read-only tracing corrected the initial mask hypothesis: `surface-batch` already ignores UNKNOWN membership claims, `native-facts` only updates explicit member rows, and projection preserves eligible older member evidence. Suppressing UNKNOWN would not fix anything. The real gap is membership first encountered under an owned mask; native `visibility:hidden` must remain distinguishable, so no unsafe descendant exemption or temporary mask removal was added.

CI58 scale facts show two attached/open frames with repeated `HOST_UI_VIEW preparing`, rather than missing geometry. Initial progressive projection readiness remains the next product investigation. Full81 cases, scale/cold reliability, native mask proof, live ChatGPT/PAIA/physical IME and release gates remain open. **Free NOT_RELEASE_READY.**
