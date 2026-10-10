# R0-04 minimal MV3 source preparation

Date: 2026-10-10 UTC. **Result: SOURCE PREPARATION ONLY / LIMITED. Actual MV3 loading and lifecycle: NOT_RUN.**

## Fixed baseline and scope

This separate preparation branch, `experiments/vawl-r0-mv3-preparation-20261010`, starts at `e2e45a897417a5a38148f14e4cad469837a29964` (the completed page-fixture Draft PR #2). The base tree is `8f8281d44072a240fcf661f477ef8b1abbc6c1ae`. Its 54 blobs, including the original fixture, all prior evidence, proposal and workflow, are unchanged. New files are confined to the original three permitted directories.

This task authorizes minimal probe source and ordinary Node/Python checks only. It does **not** authorize loading an unpacked extension or triggering extension CI. The new branch does not match the existing workflow's sole push branch; that workflow has not been changed.

## Source delivered

[Probe README](../../../../experiments/r0/mv3/README.md) explains the complete surface and next execution gate.

- A minimal MV3 manifest, module worker and classic content-script source assembly.
- Strict canonical loopback A/B fixture URLs and exact request/reply schemas.
- Real worker entry code with browser MessageSender validation, fresh boot identity, client/lease/request correlation and bounded in-memory slots; unit execution uses a fake Chrome runtime.
- Content controller with timeout settlement, delayed-response rejection, cleanup/expiry generations, reentry protection and failure latching.
- Trusted lifecycle wiring, hidden-state refusal and an owned constant marker in a script-free synthetic host.
- No account witness, private data, native write, storage, model, external endpoint, page-message bridge, product UI or PAIA integration.

The only declared host-access surface is a static content-script match for loopback fixture paths. No installation or permission grant occurred. The broader manifest path is additionally narrowed by runtime canonical A/B checks; future browser isolation still needs a specific origin/egress guard.

## Executed evidence

[Raw source-check report](source-checks.json) contains commands, outputs, source SHA-256 values and explicit non-execution flags.

- **30 new Node tests PASS**, including actual worker-entry source under a mocked Chrome runtime and assembled content-entry source under Node VM plus a tiny fake owned slot.
- **4 new Python static-package tests PASS**: exact manifest surface, deterministic assembly and syntax, refusal to overwrite source/nonempty output, script-free host fixture structure.
- **27 original Node + 2 original mocked-runner Python tests PASS**, with the original syntax/build checks.
- Ten new JavaScript syntax checks passed; the complete preparation runner has 13 successful command groups.
- No browser or local server was started, no extension was loaded, and no new browser/MV3 evidence was generated.

The original 72 browser checks remain evidence for the exact earlier page-fixture head and run; they are not reused as evidence for these new sources.

## Failures retained and repaired

1. [initial-failing-tests.tap](initial-failing-tests.tap): 23/25 passed. A bare trailing `?` was accepted as a canonical fixture URL, and a null schema input returned null rather than false. Both validators were corrected without relaxing tests.
2. [review-failing-tests.tap](review-failing-tests.tap): an independent review's cleanup-reentry counterexample was added and reproduced before repair. A cleanup callback could start an inner connect that shared the outer generation, leaving duplicate marks and timers. Clear now reserves its generation and phase before callbacks; superseded connect returns false. The new regression passes.
3. Review also identified untrusted lifecycle events and initially hidden pages as an overly permissive entry path. Both were narrowed and tested through the actual assembled entry source in a Node fake environment.
4. [Independent review](REVIEW.md) records its final disposition. Source tests do not replace actual Chrome lifecycle tests.

## Capability decisions

| Capability | Current evidence / decision |
|---|---|
| Message schema, source assembly, client timeout/currentness, fake sender/broker contracts | GO for the enumerated synthetic source contracts only |
| Genuine MV3 module registration, sender identity delivery, isolated-world wiring | NOT_RUN in Chrome; source/mock checks only |
| Worker termination/restart and old-worker response behavior | NOT_RUN; creating a second Node broker is only a model |
| Extension reload/disable/re-enable and content residue | NOT_RUN; no extension installation/load performed |
| Freeze/background throttle, normally advancing clock, actual native DOM usability | NOT_RUN |
| Host account/organization/Project identity and real route-body ownership | BLOCKED without permitted clean-host environment |
| Actual PAIA coexistence | BLOCKED without the authorized exact loaded build/environment |
| Sensitive projection or native-navigation hiding | NO_GO for enabling based on this probe |

The four-second lease is a constant under active JavaScript and a normally advancing Date.now clock, not a hard independent expiry deadline. The client does not detect worker death immediately; CHECK is not used as an automatic heartbeat. Old-response tests prove rejection after an explicit newer local generation, not independent detection of an unseen process restart. Route unit cases explicitly drive transitions; popstate wiring does not cover arbitrary pushState/production SPA behavior.

## Single next step

After explicit authorization, use the existing free standard runner's isolated temporary Chromium profile to load this owned probe on loopback synthetic A/B pages and execute the actual R0-04 lifecycle matrix. Preserve native usability, clean-layout and projection-lifetime outcomes separately, including residual DOM and failures. Do not touch daily browser profiles, ChatGPT accounts, new paid services or broader permissions.

Until then, this source preparation is the stopping point. It does not approve any of PD-01–PD-12, merge either earlier Draft, install a probe or start B/C.

