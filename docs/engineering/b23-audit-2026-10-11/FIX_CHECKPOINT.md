# Verified minimal fixes checkpoint

All seven unchanged audit counterexamples failed on the original runtime, then passed on the source in this commit. The initial test-helper error (using an unnormalized scope key) was corrected before the valid seven-failure run; it is not a product defect.

Fixes: final awaited frame revocation fence; abortable view transaction; recovery invalidates restored sources rather than resurrecting withdrawn activity; historical operation receipts/undo cannot replay across recovery; recovery revision derives from validated journal high-water, not corrupt state; own-property and ID checks for evidence foreign keys; recovery abort/commit fences.

The recovery operation is explicitly lossy: checkpoint assets may omit the last command; all prior receipts are historical, and recovered evidence needs newly admitted witnesses. It is not a general backup, no-loss restore, or new authorization.

Actual full regression: Node 111/111 exit 0; Chromium opaque DOM 48/48 exit 0. The 120 themes / 604 references and 128-member long list remain unchanged. Real IndexedDB and MV3 still BLOCKED, not counted as passing.

Raw hashes: audit-before.tap (5672 bytes) SHA256 4d30610a149c30e32b2e5a24d65465aa2901d0016b4a21edd97bc85338ab3a20; audit-after.tap (1562) 62c48e03cb9370bc49e9123b8c28335dff1a98580f96d39b45641925bace3a34; full Node (21455) 5aad511547d8b1832cd7341bc453cb278da9a61d5c030b986e48f4e31b1b383a; DOM JSON (16832) f8752a383212b6ee3b27b7ff4887a67a9cd03fdd05b709bfdf000b7943cdc5ac.

Remaining in this turn: archive the complete raw outputs, verify real-browser driver limitations and complete the engineering matrix/README/PR verdict. No new feature phase or merge is authorized.
