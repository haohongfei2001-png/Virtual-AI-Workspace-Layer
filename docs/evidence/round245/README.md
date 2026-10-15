# Round245 — finite ingestion versus snapshot preparation

CI40: https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38750829876
Exact source: b59a1a9c013bd3ad9cf22cd13ecacc78d54450b0.

4751 Node contracts and all twelve mutation controls passed. Journeys failed only the instrumented cold case; durability failed only the intentionally non-accepting 10k diagnostic slot. Other scoped slices remain partial evidence.

## Verified diagnostic evidence

The 170 original source/fixture hashes match the exact commit. All three instrumented module hashes were independently reconstructed from those bytes and match the report. Original source, fixtures and manifest remained unchanged. This is an instrumented package-copy diagnosis, not formal performance acceptance. The combined trace has503 records and zero dropped events; no pass-complete or pass-drained event occurred before the observed producer/session interruption. Absence alone is not a complete-index oracle.

Relative to the first observed surface-pass start:
- First view begins at0.243s. Attempts run at0.243,3.040,19.325s; all fail snapshot-revision-changed. Terminal failure is19.581s, before the original30s limit.
- A view stop is observed at19.771s; the stop lacks producer ordinal, so it cannot uniquely identify a role from generation alone. Subsequent pass and view starts show a restarted preparation cycle.
- Second view begins20.152s; attempts at20.152,22.627,23.297s again fail, terminal23.490s.
- Each of the four queued retries observes no active packet write, but a new real native write starts2–60ms later. A packet gap is not a finite producer-pass completion signal.
- Point-in-time verified VERSION_INDEX roots contain55,3597,6413refs at approximately0.54,10.20,20.26s. No full admitted-ID audit or timing exists.
-158 successful native transaction events total18.842s from their respective starts to commits (mean119.25ms, max188ms). These intervals include opening/queueing/synchronous work; they are not pure IDB costs. Commit precedes the final live-guard check.

## Next candidate boundary

Restore the single original noninstrumented10k slot before the next candidate. The evidence supports coordinating preparation with a bounded, verified producer-pass lifecycle rather than guessing that an individual transaction gap is quiet. Such a signal may only delay existing reads; it must not confer evidence authority, mark the index complete, extend grants, reset the original30s preparation deadline or increase three attempts/RPC6s. Its lifecycle and concurrent-scope/producer failures require independent review and actual browser verification.

No further root-encoding optimization is inferred from these timings. Full SYS04/SYS05, immediate cold support and Free release acceptance remain open.

## Frozen implementation validation (candidate, browser pending)

The candidate adds a private RAM-only ingestion-pass owner and content wiring. A start is awaited before initial body/observation emission and mount; DOM restart replaces the previous active pass by increasing sequence without a cancel/start gap. Terminal tombstones reject late starts. Exact-scope active producers combine with OR, with original live binding/grant/profile checks and bounded state. A missing or refused scheduling acknowledgement cancels once and falls back to the pre-existing ingestion path, without claiming coordination or completeness.

View preparation waits before its first attempt and existing counted retries while that scope has an active pass or original native write. The existing three-attempt limit remains. An explicit generation-fenced absolute30s expiry invalidates pending read work, including a read that only starts at29s. No new observation codec, data admission, proof lifetime, native/evidence write, or snapshot CAS exception is added.

238 focused contracts pass. Two finite packet-gap regressions fail when only the pass scheduling predicate is disabled. Adjacent guard groups pass131 and110 tests respectively (overlapping, not additive). Independent review adds two lifecycle races and11 adapter/view controls, all passing. Integrated owner/trace/workflow checks pass36/36. Exact-head Chrome acceptance remains required. The formal10k slot is restored with the original admitted-index/timing gates.
