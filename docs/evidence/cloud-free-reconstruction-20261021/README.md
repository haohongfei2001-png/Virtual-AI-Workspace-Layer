# Reconstructed cloud Free candidate — 2026-10-21

The previous local f033d62c candidate was never attached to the remote branch. Its temporary workspace was lost after interrupted execution. Only the workflow blob and previously persisted ABA patch were exactly recovered. Other changes were reconstructed and independently revalidated; no byte identity with f033 or reuse of its missing raw logs is claimed.

Baseline remains 64b926e3ce2d07ad1f6f3bcd16a36f006746f3a4, same Free branch / Draft PR16. Product changes are confined to the original recovery/backup write-success guards (including late reference writes and shared-retention deletes) and truthful native/evidence transaction-abort results. Original TTLs, schemas, source authority and Pro assets remain unchanged.

Fresh validation:
- 52 controlled deadline/abort cases pass; original baseline fails20 of the same52.
- B5 focused209; journey-focused555; SYS05-focused170; original ABA4; UI first focused50; CI-contract30; browser-report5 pass.
- Frozen worktree full Node:9881/9881, zero failures/skips/cancellations,175254.719219ms. All1241 source/test inputs match before/after. This worktree run includes the separately retained next-batch native UI fixture tests; remote exact-head CI remains the final published-candidate gate.
- All12 existing guard mutations killed. Default184-file package builds/verifies, HOST_IMPLEMENTATION_UNVERIFIED and NOT_RELEASE_READY retained.
- One fresh local Chromium attempt failed before startup (socket EPERM), zero executed IDB cases. No browser pass is inferred. Hosted CI must execute the actual52-case real-IDB runner, bounded overflow, profile journey and UI matrices.

Rebuilt test additions preserve scoped claims: observed ABA is not unobservable switching proof; SYS05 accepted gap/fresh ACK retains metadata/directory/oldACK and does not claim fullSYS05; J1–J4 matrix requires exact continuous checkpoint order, not stitched acceptance; populated renderer evidence is WEB_MECHANISM_ONLY; fullV27/G/U remain unestablished.

Cloud work remains active. Next-batch native populated UI, PARTIAL natural paging, unforced idle reentry, real packaged FAULT/privacy gates, strict pending-repair precondition and approved visual comparison are not declared complete. Live principal/current-context/roster/default-personal semantics and physical/local validation remain separate.10k/100k DEFERRED; Pro out of scope. No real-account requests, merge or deployment.

After the frozen full run, independent review found J2 emits seven string checkpoints plus one metadata object, unlike other journey report shapes. Matrix admission now validates that exact ordered eight-step shape and ACK metadata;34 targeted tests pass. This is a post-full-run harness-only correction, to be covered by final exact-head CI, not retrospectively included in the9881 run.
