# Round269 — Recovery preserves populated foreign scope and manual assets

Base `033c80372d47c65f1f1d713bf9b30e954fbff4fb`, original branch / Draft PR16, 2026-10-16. Production code and schema are unchanged.

The existing two completion-abort/repair cases now restore the schema-valid J4 manual bundle through actual preview/restore APIs and apply scope-specific human titles through normal commands. Scope A includes a human reference, two workspaces, locked DisplayIdentity and Placement, working-set reference and saved snippet. Their complete content is compared after ingest/aborted completion, repair, reopening and repeat drain; counts alone are not the oracle.

A second fixture shares the same actual database but has a different principal/context. Its real observation/ACK/continuation owners populate Native and Evidence; its manual assets use the same reference ID with a different human title. Scope B has one native ref and one correctly scoped ACK hint. Complete Native, Evidence and Workspace states remain equal before/after A's recovery. No direct database writes fabricate B's authority or ACK; the only direct corruption remains the intentional A Evidence checksum fault.

The ordinary-restart case completes exactly once. The repaired-source case becomes needs-revalidation/source-revoked, retaining receipt and old anchor bytes without replay. Both retain the original six manual asset classes and the populated foreign scope.

Actual isolated headless Chrome extension-origin **native IndexedDB: 2/2 PASS**, source integrity PASS, no errors. These are **D_REAL_EXTENSION_ORIGIN_INDEXEDDB_TEST_ONLY_COMPOSITION** results, not production Host S, full SYS02/J4, physical disk exhaustion or whole-process crash. The browser report now preserves case-returned verified details and rejects returned FAIL/NOT_RUN instead of silently labeling them PASS. Existing cases returning no detail remain compatible.

The shared test fixture's default self/personal identities remain unchanged. Targeted affected owner regressions:93/93 PASS; report checks:7/7 PASS. Full Node result is recorded in STATUS and node.log.gz. Complete81, scale/cold reliability, actual G/U and release gates remain open. **Free NOT_RELEASE_READY.**
