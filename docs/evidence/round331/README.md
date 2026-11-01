# Round331 — bounded J2 execution and unchanged-package J3 samples

Parent 1ac979b. J2 runner now bounds observation callbacks, worker evaluation, setup, failure diagnostics and cleanup separately; original25s polling, eight steps, real calibration expiry and31s negative waits are retained. Persistent progress contains only stage/time. The external network probe distinguishes actual rejection from timeout; timeout cannot pass.

One actual MODERN J2 run exits1 with a final report after three passed steps: old original send, failed native send, then successful ACK without invented original time. It waits the real60s calibration deadline. Before worker stop both frames were already removed and UI_SUSPEND occurred near the initial C2 receipt's60s expiry. Stopped→running observation then fails its original25s window. Source/fixture hashes unchanged, context/server cleanup completed. Old worker trace timeout is recorded, not allowed to hang report writing.

This establishes a C2 continuous-residency limitation, not deletion of the durable ACK: session/roster refresh cannot extend the independently selected context beyond the receipt deadline. VA-HOST §5.3 excludes extension-generated verification requests from C2 and permits ambiguous fallback without fresh proof. Current silent MODERN C2 lacks independently verified C1/default C3 reselection after expiry or worker-memory loss. Do not prolong TTL, repeat fixture native GETs periodically or claim the original eight-step J2 passed.

Two independent immediate-load MODERN J3 runs both pass16/16 on the existing production candidate. Earlier formal failures remain; these two samples do not prove startup stability. New failure-only CDP inspection reads bounded whitelisted closure state from the unchanged package, never calls owner methods or reveals identities/credentials. Both runs succeeded, so the collector was not invoked in Chrome; its7 Node/inspector tests are not an actual MV3 failed-state capture. Optional RAM-only diagnostic-copy tracing is prepared and unit tested, not run or accepted as production.

Full Free, remaining profile coverage,100k and real-environment gates remain open. NOT_RELEASE_READY.
