# Round330 — bounded context handshake recovery

Independent deterministic tests reproduce two missed recovery paths: READY arriving while the old REFRESH still resolves to ambiguous, and the real document handshake returning `invalidated-during-check` before its PENDING notification. A READY is now held only while initial authorization is unfinished and consumed once through a new HELLO/REFRESH. Exact superseded HELLO replies preserve context wait eligibility; malformed/ordinary invalid replies still stop. Stop/pagehide/rebind invalidate queued recovery. Successful authorization clears the one-shot notification to prevent later reuse.

Initial reproduction: 2 failures. Extended review found one further stale-notification case after successful REFRESH (11/12 passed); clearing the flag on verified scope fixes it. Final focused content/recovery/foreground/race regression: 72/72 PASS; independent review passes. No deadline, authority, scope, retry budget or native navigation contract is weakened.

Formal immediate-load, non-instrumented MODERN J3 passes all 16 steps on the candidate before the final successful-authorization flag-clear line. Source, fixture, runner and build hashes are stable for that run. This includes original UI06 assertions and the J3-only stable-native-history fixture. It is a scoped offline reconstruction result, not real ChatGPT/physical IME/full Free acceptance. The final flag-clear line is separately covered by Node; later browser results must use their own hashes.

MODERN J2 execution and final integration validation are recorded when their processes complete. Full Free, 100k and remaining profile/real-environment gates remain open; NOT_RELEASE_READY.

## J2 harness incomplete execution

The MODERN J2 process produced neither a final report nor log output after approximately five minutes. Its direct isolated Chrome child was verified by PID/parent/profile and terminated; Chrome exited but Node stayed pending, so only the owned Node process was terminated (exit 143). No product stage, anchor outcome or browser acceptance is inferred. The intervention record is retained; no user browser was touched.

Independent tests prove lifecycle diagnostics could wait forever on worker installation, trace reading or page reading (0/3 before). Each diagnostic evaluate now has a 1500 ms deadline, records INCOMPLETE and continues independent diagnostics; these 3 tests pass. This repairs a proven harness defect, not a confirmed explanation of the aborted run. The runner still needs a bounded whole-observation/final-evidence path before another expensive J2 attempt.

Final full Node regression: **6376/6376 PASS**, zero skips, terminal exit 0. This is the current full suite count, not a sum of earlier targeted runs.

Final-version formal MODERN J3 run **FAILS initial workspace 15 s, 0/16** (exit 1, browser/fixture closed, all source/fixture/script/build hashes stable). The earlier 16/16 run is preserved as a single candidate success, not repeatable final acceptance. The deterministic races are repaired, but the actual cold-start fault remains unresolved; do not assert those races explain every browser failure. Next: capture minimally perturbing startup state and bound J2 runner waits before another journey.
