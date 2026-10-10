# Independent R0 source review and remediation

Review date: 2026-10-09 UTC. An independent read-only reviewer inspected the fixed-source experiment and ran its Node tests plus adversarial JavaScript reproductions. DOM doubles used for adversarial shell checks were explicitly not treated as browser evidence. Remote SHA/PR/file-scope verification belongs to the publishing task, separately from this source review.

## Findings preserved and addressed

| Finding at first review | Correction / disposition | Regression evidence |
|---|---|---|
| Shell accepted a plain object with matching scope/evidence strings and arbitrary synthetic-origin URLs; malformed URL could throw | Validated reference provenance is tracked in a module-private WeakMap. The shell verifies current gate/token and source provenance before touching DOM. | Forged/shared/credential-bearing/malformed references rejected; original reproduction no longer succeeds. |
| One throwing invalidation callback prevented later cleanup | Every cleanup callback is attempted. A failed cleanup leaves scope unknown and blocks a new binding. | Throwing listener does not skip later cleanup; projection and shell clear in JavaScript reproductions. |
| A newly issued A token could re-add an old A reference after A→B→A | References retain their issuing gate/token, are checked for currentness, and subscribe to source invalidation. Projection views preserve this provenance. | Old-reference replay rejected; independent source-document scope change clears the reference and mounted shell. |
| URL parsing normalized dot segments; test title overstated coverage | Only exact canonical synthetic URL strings are accepted; raw query/fragment delimiters, whitespace and normalization differences are rejected. | Traversal, empty ?/#, alternate spelling and existing bad-route cases now pass. |
| Expiry alone did not remove mounted DOM | Follow-up adds a bounded active-JavaScript scheduler. API-boundary checks remain. Independent lease, freeze and disabled-code safety are still not claimed. | Seven scheduler regressions (including actual Node event-loop expiry and deadline crossing during bind) cover expiry without API polling, old callback cancellation/currentness, early callbacks/cleanup errors and initial/rearm failure. Suspended/disabled-code sensitive projection remains NO_GO. |
| Browser runner labeled post-launch fixture errors BLOCKED when no run had completed | Explicit dependency/server/launch phases vs fixture-execution phase. Errors after launch are FAIL, even if runs is empty; page errors are retained. | Two mocked-launcher Python tests pass: launch error → BLOCKED; post-launch fixture load error → FAIL. These are not browser runs. |

## Scheduler follow-up review

Review of the active-JavaScript expiry follow-up additionally found that a constant fixture clock with a real scheduler could keep rearming timers, and that a deadline crossed during binding could report success without a binding. The browser harness now tracks every gate and invalidates all of them in `finally`, including on failures and repeated runs. Binding now refuses a synchronously expired deadline; a regression covers it. A real Node timer was also exercised without API polling, separately from injected scheduler cases. None of these runs is browser or MV3 evidence.

## Final review result

No remaining deterministic defect was found within the explicitly limited synthetic scope after these fixes. This is suitable for a **LIMITED experimental Draft**, not browser/product acceptance.

- Node: 27/27 actual tests pass.
- Python runner classification: 2/2 actual unit tests pass using mocked browser objects.
- Source checks and generated-fixture transformation match the reviewed source.
- Browser: 18 assertions prepared, 0 executed.
- LIVE_HOST/MV3/PAIA: not verified.

Reviewed SHA-256 values:

- `experiments/r0/core.mjs`: `eb27f6707dedfb0f6ddfef813baaeb350e591ae7f489887a8bc290f76a4f90da`
- `experiments/r0/shell.mjs`: `04b8e4ade85b70182c0bd21bb713b887ca023583cc55b0e9411925ba15ddbeb6`
- `tests/r0/browser-suite.mjs`: `2a2e5358646552d950f69a5355fefc66849c64386e271aa555c889d2ec451538`
- `tests/r0/run-browser.py`: `90ef1d3331b645105d52d62665a59d5cdb36770d54898fbaef337a43aeaa871f`

Review is a point-in-time source result, not a GitHub approval or a guarantee against all defects. The suspended/disabled-code expiry limit and actual environment failures are intentionally preserved rather than converted into green results.
