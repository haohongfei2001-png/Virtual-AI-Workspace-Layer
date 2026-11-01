# Round248 — original 10k ingestion deadline remains unmet

CI43: https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38772415284
Exact source: 602732b3e110ea643e254bdfd73d8514467ff668.

Node: 4879/4880 pass, zero skips/cancellations. The sole failure is an existing static runner string guard that did not allow the added request timestamp between the initial clock and unchanged send call. The candidate allows exactly that optional timestamp; original transport/Promise execution tests remain. Related12 tests and independent static review pass. The downstream twelve mutation step was skipped because Node failed; no mutation pass is inferred for this run.

The journey job passes all scoped steps. Durability/compatibility passes every preceding slice; formal10k fails its original first-tab30s readiness limit. All171 source/fixture hashes match the exact source, with all changed flags false. All395 recorded UI RPCs succeed:2 joins,2 resumes,387 preparing views and4 renewals. There is no accepted ready result, so this run does not exercise the previous accepted-ready/queued-read defect in this scale scenario.

At failure the actual readonly root is PARTITIONED, revision193,9741 reference inventory entries and100 projects, one active source. This is a point-in-time inventory, not a complete ID/membership audit. Both frames remain attached with two open surfaces and a non-ready workspace. There are no lifecycle records; absence cannot prove that no suspension occurred. No full admitted-index audit or timing was reached.

The current read preparation is the existing caller that migrates a partitioned native manifest to its version index. Its interaction with finite-pass scheduling is under investigation: this report supports incomplete ingestion at the deadline and the exact observed format, but does not prove a unique runtime bottleneck. Original30s/6s/attempt/CAS and all acceptance gates remain.

Full Free/81/SYS04/SYS05,100k,p95 and release readiness remain incomplete. Prior1k measurements are single samples with UNKNOWN memberships.

## Reviewed fresh Host storage candidate

The production binding explicitly enables a default-off initial native-index preparation option. After the first genuine Host observation has already committed successfully at revision1, and only for expectedRevision0 / non-replayed success, the repository attempts the existing fully checked version-index migration once under the same guard and signal. Both ordinary and shared-migration retry exits use this helper. The migration performs its existing root/marker CAS, piece audit and atomic storage publication. The observation result and operation receipt remain revision1; successful structural migration advances the root to2 without renewing source evidence. Subsequent fragments read the new revision normally.

Migration failure, exception or concurrent CAS loss preserves the already committed observation result. Replay does not retry migration. Owner post-apply authorization and the original6s budget remain decisive. Actual joint pending with nativeRevision1 remains readable under root2 and completes once. This only improves fresh Host stores; an existing large partitioned root or failed initial migration is not covered by this optimization.

Validation: original initial8-case set gives3 pass/5 failures before and8 pass after. Final12 new contracts plus affected index-write/binding/joint tests pass78/78; adjacent continuation/owner/shared migration/index preparation/runtime tests pass66/66. Independent review reruns12 and adds2 actual transaction-boundary cases,14/14 total. Covered boundaries include shared retry, concurrent native winner, aborted/revoked post-commit migration, quota rollback, replay, unchanged synthetic/default behavior and joint continuation recovery. These are lightweight repository/MockIDB evidence, not browser performance.

Candidate product/test patch SHA256:0fe605b81c0fea89831803a180767f9ba622d23459727c940b30795ec0192e24. Static runner-guard correction SHA256:e8bbc16bc809774dc65d34af09ac0533359cf21f1060cb3aabc5920d1e2f2033. The next original formal10k run must establish actual admission and timing; no throughput improvement is claimed yet.
