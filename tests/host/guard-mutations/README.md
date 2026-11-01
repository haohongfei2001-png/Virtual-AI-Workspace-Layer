# Host guard mutation checks (VA-HOST/1.1 FINAL §5.2)

Run from any checkout:

    node tests/host/guard-mutations.runner.mjs --report /tmp/host-guards.json
    node tests/host/guard-mutations.runner.mjs --only origin,old-epoch --report /tmp/host-guards-small.json
    node --test --test-concurrency=1 tests/host/guard-mutations/*.test.mjs

Optionally supply `--source-commit <verified-sha>` as provenance. This is caller-supplied, not remote HEAD verification. Reported tree/file hashes identify the bytes actually tested. No dependencies are downloaded, browser started, production source edited, or remote operation performed. Each case runs sequentially in private disposable temporary copies. The source copy is frozen once; each mutant starts fresh. The final checksum confirms the input tree did not change.

The manifest fixes all twelve §5.2 mutations and the exact designated test name. Every designated case must pass unmodified before its mutation runs. Only that case's `ERR_ASSERTION` and exit code 1 counts as a kill. Syntax/import errors, crashes, timeout, skipped/missing cases, unrelated failures and survivors fail the runner. Patch anchors must occur exactly once: source drift is `PATCH_MISMATCH`, never an implicit skip or a broadened patch.

## Evidence boundaries

All checks are **L**. Repository checks use **MOCK_IDB**, not D. UI checks use an existing lightweight DOM double, not S. Real Chrome MV3, native event dispatch/AX/focus/dismissal, real IndexedDB, G and U remain NOT_RUN in this runner. Twelve killed logical mutations do not mean 81 cases, J1–J4, FREE_ACCEPTED or RELEASE_READY passed.

- `current-leaf-key` inserts dependence on adversarial caller-context `currentLeaf` into the real durable event-key formula. Independent expectation: the same conversation/message keeps the same key across a changed current leaf. It does not hard-code or call the hash formula to compute the expected key. This specifically tests owner event-key identity; parser ancestry/current_node coverage remains in the existing metadata suite.
- `post-commit-continuation` removes continuation from the native transaction, representing the crash cut after native commit and before a moved, separate continuation write. The existing oracle requires native data and pending evidence to be committed together. It does not claim an actual browser process crash was exercised.
- `old-epoch` targets late route-epoch proposals; account-switch asynchronous/provider paths remain separate integration coverage.
- `pre-ack-send` targets parser acceptance without an accepted status; a complete network/send pipeline is separate coverage.
- `auto-popover` and `remove-background-inert` prove the owned declarations are guarded; actual browser behavior requires the S runners.
- Navigation and ACK test fixtures are small test-only copies of the existing renderer/owner fixture setup. Their assertions are independent of the mutated implementation. Production parser/reducer/renderer modules are imported directly from each temporary copy.

The runner's outcome classifier has adversarial tests proving failures unrelated to the designated assertion do not yield green mutation evidence. Existing tests are reused without rewriting their oracle. The manifest neither changes specification outcomes nor labels unknown behavior supported.

Input tree hashing and frozen copies exclude dependency node_modules directories. Symlinks elsewhere fail closed. Source and oracle files remain hashed individually.
