# Independent review: minimal MV3 source preparation

Date: 2026-10-10 UTC. **Disposition: source preparation can be delivered; actual MV3 capability remains NOT_RUN.**

## Independent checks

- Read the authoritative R0 task and architecture boundaries, then reviewed all new source and test files without modifying them.
- Independently reproduced the cleanup-reentry defect, checked the writer's failing regression before the repair, and verified the final fix. A superseded outer connection no longer shares a newer connection's generation, mounts twice or leaves a timer/node after disposal.
- Reviewed exact schema, MessageSender fields, worker/client/request/lease correlation, stale responses, cleanup-failure latching, untrusted lifecycle-event rejection and initially hidden refusal.
- Ran **57/57 Node tests (30 new + 27 original)**, **4/4 new Python static-package tests**, and **2/2 original Python mocked-runner tests**. All passed.
- Verified all 54 original blobs against the supplied exact remote Git tree `8f8281d44072a240fcf661f477ef8b1abbc6c1ae`. Existing page fixture, runner and workflow remain byte-for-byte unchanged.
- No browser or server was started, no extension was loaded, no CI was triggered and no real host was accessed by this review.

## Findings resolved

1. Cleanup callback reentry previously allowed both outer and inner connects to share a generation. The added regression is preserved in [review-failing-tests.tap](review-failing-tests.tap). Generation/phase reservation now occurs before cleanup callbacks; stale outer calls exit.
2. Lifecycle callbacks previously accepted script-dispatched events, and an initially hidden document attempted a bind. Trusted-event checks and hidden-state refusal were added. New Node VM tests exercise the actual assembled entry code against fake event/slot objects; this is source wiring evidence, not Chrome evidence.
3. The report and README were narrowed to avoid interpreting a mock broker restart, Date.now lease constant or explicit route transition as real independent lifecycle recovery.

## Reviewed code identity

- `experiments/r0/mv3/client.mjs` SHA-256: `65504be5f2d42779eb2c549458aa50aba0b40d40cfc85c014bcdb107eced876e`.
- `experiments/r0/mv3/content-entry.mjs` SHA-256: `f34dcb71c0a3ddfedc404ea66b5022c5c86398bccb9e02821ddd333f0ef145f0`.
- Complete source hashes and raw command outputs are in [source-checks.json](source-checks.json).

## Retained limitations

CHECK is not an automatic worker-death detector. There is no production pushState route observer. Date.now changes, frozen execution and disabled extension code do not have an independently proven cleanup deadline. Only a fixed synthetic marker is displayed. Sensitive projection and hidden/replaced native navigation remain disabled.

No unresolved blocker remains for this bounded source-only handoff. Actual MV3 load, worker termination, reload, disable/re-enable, freeze/resume, clean-host identity and PAIA coexistence must be evaluated separately after the applicable authorization.

