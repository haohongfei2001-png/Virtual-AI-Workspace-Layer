# Independent R0 source review and remediation

Review date: 2026-10-09 UTC. An independent read-only reviewer inspected the fixed-source experiment and ran its Node tests plus adversarial JavaScript reproductions. DOM doubles used for adversarial shell checks were explicitly not treated as browser evidence. Remote SHA/PR/file-scope verification belongs to the publishing task, separately from this source review.

## Findings preserved and addressed

| Finding at first review | Correction / disposition | Regression evidence |
|---|---|---|
| Shell accepted a plain object with matching scope/evidence strings and arbitrary synthetic-origin URLs; malformed URL could throw | Validated reference provenance is tracked in a module-private WeakMap. The shell verifies current gate/token and source provenance before touching DOM. | Forged/shared/credential-bearing/malformed references rejected; original reproduction no longer succeeds. |
| One throwing invalidation callback prevented later cleanup | Every cleanup callback is attempted. A failed cleanup leaves scope unknown and blocks a new binding. | Throwing listener does not skip later cleanup; projection and shell clear in JavaScript reproductions. |
| A newly issued A token could re-add an old A reference after A→B→A | References retain their issuing gate/token, are checked for currentness, and subscribe to source invalidation. Projection views preserve this provenance. | Old-reference replay rejected; independent source-document scope change clears the reference and mounted shell. |
| URL parsing normalized dot segments; test title overstated coverage | Only exact canonical synthetic URL strings are accepted; raw query/fragment delimiters, whitespace and normalization differences are rejected. | Traversal, empty ?/#, alternate spelling and existing bad-route cases now pass. |
| Expiry alone did not remove mounted DOM | Explicitly retained as a limitation: checks occur at API boundaries; no autonomous lease or freeze safety is claimed. | A test demonstrates no callback until gate.check is invoked; unattended sensitive projection is NO_GO. |
| Browser runner labeled post-launch fixture errors BLOCKED when no run had completed | Explicit dependency/server/launch phases vs fixture-execution phase. Errors after launch are FAIL, even if runs is empty; page errors are retained. | Two mocked-launcher Python tests pass: launch error → BLOCKED; post-launch fixture load error → FAIL. These are not browser runs. |

## Final review result

No remaining deterministic defect was found within the explicitly limited synthetic scope after these fixes. This is suitable for a **LIMITED experimental Draft**, not browser/product acceptance.

- Node: 21/21 actual tests pass.
- Python runner classification: 2/2 actual unit tests pass using mocked browser objects.
- Source checks and generated-fixture transformation match the reviewed source.
- Browser: 17 assertions prepared, 0 executed.
- LIVE_HOST/MV3/PAIA: not verified.

Reviewed SHA-256 values:

- `experiments/r0/core.mjs`: `897e87dde1e7c8a496ef22ea709bdc31e8b4bae21f929af24d711ff50d733cb2`
- `experiments/r0/shell.mjs`: `04b8e4ade85b70182c0bd21bb713b887ca023583cc55b0e9411925ba15ddbeb6`
- `tests/r0/browser-suite.mjs`: `926746b3b29f0a8904d8d5ed3c0b8dcb9ae04639772cfce443994754fad55063`
- `tests/r0/run-browser.py`: `90ef1d3331b645105d52d62665a59d5cdb36770d54898fbaef337a43aeaa871f`

Review is a point-in-time source result, not a GitHub approval or a guarantee against all defects. The API-boundary expiry limit and actual environment failures are intentionally preserved rather than converted into green results.
