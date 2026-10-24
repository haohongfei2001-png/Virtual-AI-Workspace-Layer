# Round271 — Preserve body ACK when optional metadata budget is exhausted

Base `db0d9dac75f19185d8a140f2225a21ec6a2cd897`, same directory/branch/Draft PR16.

Actual temporary isolated-package diagnostics found a visible, noncollapsed selection but no accepted body proof. A subsequent ACK trace recorded a rejected current-observation; the worker exception was read-budget-exhausted through session-provider/current-metadata-reader/host-send-candidates. The unchanged-native-semantics observation path propagated that optional read failure and withheld its otherwise valid DOM body ACK. Waiting alone did not resolve it. All intermediate FAILs and diagnostic harnesses are retained; modified packages are diagnostic only.

The production owner now tolerates **only read-budget-exhausted** in the combined observation / unchanged native semantics path, after rechecking original body, scope guard and a fresh handshake, then rechecking after await. No HTTP retry or budget reset is added; no event/ACK is fabricated. Native changes with a claimed joint transaction retain the existing no-fallback rule. Independent red-to-green tests verify zero additional Native/Evidence writes, retained body proof, duplicate idempotency, document/tab invalidation and fresh-handshake rejection.

An initially broader optional-error catch failed the existing principal-change recovery test in the full suite (5396/5397). It was narrowed to the exact budget error; principal changes and every other exception still reject. The original failure is retained, not weakened or deleted. Final authority/revalidation tests:22/22 PASS.

Explicit selection capture also supports pending body ACK within the original worker request's **remaining** six-second budget. The worker forwards expiresAt; content enforces wall and monotonic deadlines, at most120 checks, one capture, and no selection rewrite. Pending work retains only the original RAM Selection/Range, endpoint identities/offsets/text and bounded ancestor chains. Replacement, disconnect, reparent, trusted user interaction, route/authority loss, modal, stop or a newer capture cancels it. A final guard/time/selection check runs after readiness. Independent tests caught clock rollback and readiness-consuming-deadline issues before completion. Legacy validate/release shapes remain unchanged; production capture requires the new deadline.

**Final uninstrumented packaged MV3 J3:16/16 PASS**, including native-rendered Range explicit save, saved-snippet search, native-reading locate and subsequent native search. Chrome155.0.8059.80; zero browser errors, unchanged source/script and build manifest. The final screenshot retains original draft and selected local fixture file. This is the existing offline J3 scope, not full v2.7 screenshot certification, a production snippet profile or live ChatGPT G/U acceptance.

**Final full Node:5397/5397 PASS, zero skip.** Capture helper/content58/58, owner adjacent44/44 and other focused results retained. No schema change or Pro asset migration.

Git endpoint diagnostics showed a19.6s successful read once, followed by fetch low-speed timeout even with a120s outer bound. Existing remote/credential configuration remains unchanged; db0d9da was still local pending normal push at round start. Full81, scale/cold reliability, actual G/U, release readiness and publication remain incomplete. **Free NOT_RELEASE_READY.**

After verification, normal push also failed with the30-second low-speed transport error. GitHub API independently reconfirmed remote `0e51d65e40cef515fc03a29aca04af6654acb6e9`; two local descendant commits remain pending normal push. Tracked work is saved; no force, alternate remote or API history replacement was used.
