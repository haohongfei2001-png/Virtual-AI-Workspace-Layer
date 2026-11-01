# Round234: preparation during a native commit and cancellation diagnostics

Actual source: 7fd4aa26f74d25e6e6f63e72c7ecee40e2b98b32. CI29: https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38711694858

Node 4641/4641 passes. J4's 19 implemented steps pass again, as do the scoped J1/J3/first-send/full-J2/failed-retry/UI48 and durability/compatibility gates. All cold variants pass this run; earlier immediate-cold failures remain evidence of unresolved reliability. The cancelled-then-success rapid retry and formal 1k baseline fail. The earlier same-SHA run 38711628772 was cancelled by concurrency when this replacement push run appeared; no rerun or cancellation was requested by the integrator, and the duplicate event's cause is unproven.

## Actual 1k failure and narrow scheduling candidate

The first tab has two preparation/mount cycles, each ending with snapshot-revision-changed and absent frames. The revised current-frame observer correctly retains this failure under its original total 30-second deadline. No complete admitted-index audit or valid timing sample exists, and the fixture's 1000 native objects are not proof of admitted cardinality.

A separate real-binding L counterexample holds a verified native repository apply beyond the queued 50ms retry. The previous implementation spends another preparation attempt while that write is still in progress. The candidate exposes only a synchronous, same-scope, live-guarded indication of the existing owner attempt's actual native apply. An already-counted retry waits while that indication is true. Ordinary and joint native apply clear it in finally. Original 6-second owner fencing, two preparation retries and the absolute 30-second preparation cycle remain unchanged. There is no new admission, write, authenticated read or authorization lifetime.

The counterexample turns green. The author affected owner/view group passes 96/96, and the current integrated subset passes 88/88; independent tests additionally prove repository rejection clears the indication, a held write does not consume the next attempt, the original six-second guard expires, and its late apply cannot write a new project. Foreign scope, revoke, stop, rollback, joint completion and the original three-call constant-CAS failure controls remain intact. This is an L scheduling repair awaiting the same real 1k gate, not proof that every observed Chrome preparation failure is explained or repaired.

## Rapid cancellation evidence gap

The native fixture records a cancelled first operation followed by an accepted retry. Both intents use the same document, route epoch and body proof; a later metadata detail request occurs, but there is no authenticated operation GET and no successful ACK hint. The persistent budget is 6/12, so total request exhaustion is not established. Existing trace does not distinguish missing actual ERR_ABORTED delivery, operation-candidate delivery or terminal join rejection.

The test-only candidate adds bounded passive browser-event and private operation/body message observations with shared opaque labels. It does not change sends, wait for extension settlement, relax the exact ACK assertions or alter production budgets. A browser run must establish the missing boundary before claiming a product fix.

Draft NOT_RELEASE_READY remains. Full Free acceptance, larger admitted scales, p95, real-browser SYS05 storm budgets, complete UI and real ChatGPT evidence remain open. All reports here are isolated synthetic fixtures without real account credentials or private chats.

Report integrity review matches all 155 cancellation-report source/fixture hashes and all 166 scale-report source/fixture hashes to the exact official 7fd4aa2 commit. This establishes source identity, not successful acceptance of their failed scenarios.

Before integration, independent malformed-metadata tests caught object/oversized fields leaking into the first diagnostic candidate. Strict scalar/enumeration/time and label-length validation replaces that candidate; the old unvalidated listener is removed. Both independent red cases now pass (seven diagnostic checks total), and independent cleanup stages retain the original failure report. The final integrated diagnostic/partition subset passes 9/9. These fixes are diagnostic reliability/privacy controls, not a cancelled-send product repair.
