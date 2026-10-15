# Round247 — healthy UI authorization; remaining preparation lifecycle

CI42: https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38768178101
Exact source: 371f327797797c0d87abcff74c24ac3067a034e7.

4859 Node contracts and all scoped journey steps passed. Durability failed only the formal 10k baseline. All 171 source/fixture hashes match the exact commit; source, fixture and manifest changed flags are false.

Both initial dual-surface preparations pass within their original 30 seconds (25033.96ms and 21187.31ms). Native tail search/navigation passes. Returning to the workspace still exceeds its original readiness limit, before full admitted-index audit or measurement. The report contains 2636 successful UI RPC observations, including all 24 renewals; there is no recorded authorization rejection. Tab 1 and later tab 0 each establish another UI pair, then continue preparing. The recorded final frames are attached with two open surfaces but no ready workspace, followed by teardown.

This closes the observed unrelated-tab authorization rejection in this run, not the full scale failure. The client read budget, dirty notifications, UI suspension and content-session recovery chain is being investigated with controlled production-module counterexamples. The current report lacks absolute RPC timestamps and local client stop reasons, so it cannot identify that chain as the unique CI cause.

No complete 10k audit, stable timing, p95, 100k certification or full SYS04/SYS05 result exists. The earlier 1k result remains a single sample with UNKNOWN memberships. Full Free acceptance and release readiness remain open.

## Minimal accepted-ready cycle correction (candidate)

A production `free-frame-client` / `ui-frame-client` / read-budget composition reproduces a distinct lifecycle defect: a current ready result is accepted at 21.05 seconds while another invalidation is queued, but the completed read retains its old deadline. Nine seconds later the following read receives `read-budget-exhausted` and sends UI suspension. Runtime transport and DOM are explicit test doubles; this is L evidence, not proof of the unique CI42 cause.

The independently reviewed one-condition change completes the already validated ready read even when another read is queued. The queued read then starts its own original 30-second cycle. Preparing, notifications, renewals, obsolete replies and revoked authority do not complete a cycle. Existing renderer/presentation exceptions still fail immediately. No owner attempt, RPC deadline or browser readiness gate is increased.

The formal runner also observes existing RPC send/response wall-clock times and separately records only parent-delivered UI SUSPEND/EXIT type, role and time, capped at 128 events. It sends no new RPC or recovery action and does not report a stop reason the protocol does not contain. Five tests execute the actual wrapper/collector and real UI-frame client parent-message path and verify original call/Promise identity, payload exclusion, exception isolation and the event bound. These observations are available for the next formal run; they do not retroactively identify CI42's local lifecycle.

The identical 16-case suite fails two regressions on the original source and passes all 16 on the candidate. Author focused227 and adjacent172 groups pass (not summed as distinct contracts); independent review passes the 16 cases plus a sidebar-cycle boundary. Integrated product/timeline/CI-partition checks pass27/27, zero skips/cancellations. The first diagnostic draft incorrectly watched lifecycle types through runtime.sendMessage; independent review caught that unexercised path. The replacement listens passively to the actual parent message route, requiring exact fixture/extension origins and a current direct child, and its regression invokes the real UI-frame client stop path.

The corrected timeline passes independent five-case review. Lifecycle observations may be absent when a child has already detached before message delivery or lies outside the first 16 direct children; absence is not proof of no suspension. A captured event is only a timing observation, not an internal failure-reason or authorization witness.
