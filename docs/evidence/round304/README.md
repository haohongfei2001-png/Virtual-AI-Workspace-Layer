# Round304 — Isolate Project candidate cleanup from member handles

Base a70dca8. That verified commit's normal push hit GitHub low-speed timeout; local commit preserved. No forced/reset/remote change.

Production change is a narrow predicate in existing surface discovery: initial candidate-only scans validate Project-region handles; ordinary surface scans still validate all handles. Route/root invalidation remains before this predicate. Actual getNode/dispatch and loaded-target resolution keep all node/document/parent/root/fingerprint/epoch and uniqueness checks. Registry capacity/eviction/pins remain unchanged. Candidate-only reads keep existing detached draining; the change avoids discovering and consuming unrelated changed-member cleanup in that path.

Independent DOM-double red: empty candidate reads touched 600 unrelated member fingerprints, and discovered a changed member's detached record before the normal producer could report it. Final 9 tests pass, including stale Project cleanup, member navigation rejection before normal cleanup, later normal detached reporting, route/region invalidation, duplicates and incomplete-cache fallback. Combined discovery/navigation/retention group **84/84 PASS**. Independent review found no authority or capacity blocker. Full Node suite **5958/5958 PASS**, no skips.

Actual packaged headless MV3 navigation **5/5 PASS**: original conversation and Project native anchors dispatched exactly once, same native editor retained; old action replay blocked after each route rebind; modifier href opens the correct new tab without native delegation. Source hashes stable.

10k single-Project actual scenario remains **FAIL** at the original 30-second member deadline. Before change, point-in-time index held 3736 refs/revision144; after, 5611 refs/revision183. These are diagnostic snapshots, not complete membership audits or performance acceptance; independent runs are not a p95 or causal speedup proof. Both raw failures retained, timing NOT_RUN. Initial report had 742 VIEW calls (364ready/378preparing), 363 candidate calls without same-frame overlap: existing singleflight was not the missing mechanism. No budget/threshold/coverage/hash relaxed.

Full 10k/100k, 81/profile matrix, remaining UI/J4/cold/G/U gates remain open. Free NOT_RELEASE_READY.
