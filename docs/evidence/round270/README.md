# Round270 — Bounded snippet refresh and persistent failure feedback

Base `0e51d65e40cef515fc03a29aca04af6654acb6e9`, same local branch and Draft PR16. GitHub API verified the remote branch at this same SHA during this round; initial git ls-remote transport timed out, not a divergence.

The original J3 journey reproduced CI failure after its first twelve steps. A dirty LIST previously discarded its result and required manual reload. The panel now coalesces notifications into at most one additional LIST per read chain; a second invalidation retains the manual recovery path. SAVE/remove/locate are never automatically replayed, and close/stop fence late results. Four independently written LIST regressions failed before this change and pass after it.

Failure-only diagnostics now read the actual Workspace revision/snippet count and panel text. The unchanged journey still failed after the first fix, with actual savedSnippetCount 0. Temporary diagnostic-only runs recorded a single SAVE returning ok:false, then successful empty LISTs on renewal. A temporary package catch discriminator narrowed the rejection to **invalid-capture**, before persistence; it does not establish why capture was invalid. Those modified-package runs are not formal acceptance. Their exact temporary harness and separate reports are retained; instrumentation was removed from the committed runner.

The confirmed feedback defect is also fixed: a failed explicit action warning survives subsequent LIST refreshes and unrelated successful locate/remove operations. Only a matching explicit successful action or closing the panel clears it. Independent review caught the unrelated-action case and tests now cover it. No selection proof, authorization, CAS, request deadline, or native write guard was weakened. Actual end-to-end snippet save remains open.

Final focused tests **14/14 PASS**; full Node **5332/5332 PASS, zero skip**. J3 reports remain FAIL, not relabeled as a successful journey. The final sticky-warning code has unit coverage, not a new complete browser PASS.

One original 100k mixed-project run reached both initial surfaces (3.216/3.555 seconds) but failed the pre-measurement index audit: only 80 of 100000 references admitted, 1000 projects, 99920 missing, 80 UNKNOWN and no project membership. No performance samples or 100k acceptance exist. This is not evidence for a specific storage bottleneck. Original deadlines and scale gates remain unchanged.

Full81, J3 capture, scale/cold reliability, real G/U and release readiness remain open. **Free NOT_RELEASE_READY.**

Checkpoint synchronization: both HTTP/1.1 and HTTP/2 fetch attempts reached the bounded 35-second process timeout; a scoped existing-gh-credential-helper attempt also timed out. No merge/push ran after failed fetch. GitHub API still confirmed remote `0e51d65`; local preserves one descendant checkpoint. Existing `72ca068` and `d1872d9` are verified ancestors. No remote/branch configuration was changed. Normal push remains pending transport recovery.
