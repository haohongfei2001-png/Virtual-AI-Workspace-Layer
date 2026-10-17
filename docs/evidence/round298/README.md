# Round298 — Separate progressive admission from stable-index measurement

Remote fetched and API checked: original Draft PR16/base unchanged; dot d1872d9 and Pro72ca068 are ancestors. Previously local6019b47 successfully pushed and API confirmed. No alternate branch or workspace.

Original immediate-cardinality failures remain unchanged. New explicit FREE_HOST_SCALE_ADMISSION_PREPARE=1 path preserves its immediate exact audit, then independently observes six fixed 5-second slots under a 30-second outer preparation ceiling. Inventory never grants readiness: a final unchanged full ID/member oracle must pass, followed by the existing measurement-before/after same-revision audits. Trace/progress diagnostic modes still cannot produce performance samples. Original initial-surface 30s and production6s RPC budgets are unchanged.

Review found that the first candidate outer deadline could leave an internal readonly audit running. Final helper propagates the remaining frame/read budget; tracks and aborts readonly transactions, closes DB handles including late-open handles, and refuses all late report mutation/pagination. Browser evaluate transport delay may put readonly cleanup slightly after the Node deadline; outer cancellation rejects its result and context cleanup closes remaining browser work. No timeout can authorize measurement.

Final focused Node176/176 PASS, zero skipped (12 preparation,13 audit-deadline,6 runner-control cases among existing scale contracts). Independent review found no blocker. Production code unchanged; prior full5801 result is not represented as a new full run.

Actual isolated headless MV3, uninstrumented production package:

- 1k mixed, initial candidate before audit-cancellation refinement: immediate audit UNSTABLE_REVISION/360 refs; by first5s inventory1000. Final exact1000 refs/10Projects, revision47 stable before/after UI measurement. Extra preparation25075ms; exact-tail26ms/broadfirst26ms/nextpage59ms are SINGLE samples including automation overhead, not p95. All1000 memberships remain UNKNOWN in this history-only sample; this is not complete membership/profile acceptance.
- Final10k mixed: initial surfaces392ms/476ms on partial index, native tail/return reachable. Immediate468 refs; six inventories468→2054→3214→3781→4662→5427. Final exact5427/10000 refs/100Projects atrevision157;4573missing. Extra preparation25421ms, statusNOT_READY_AFTER_PREPARATION, timingNOT_RUN. It shows ongoing admission, not completion or a stalled producer. No browser errors; source/fixture/manifest stable.

Both raw reports retained losslessly.1k success cannot erase old immediate-pathFAIL or establish fullSYS04/F1.10k remains failed; no repetitive100k run made on the same incomplete-admission hypothesis. Cold receipt race, remaining81/J4/profile/realG/U and release gates remain open. Free NOT_RELEASE_READY.
