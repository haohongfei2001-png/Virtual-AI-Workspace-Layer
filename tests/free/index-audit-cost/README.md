# Fresh complete-index page selection

Review/integration slice tested on Free `e1b0bfd6ae76a5aa5e6948edc71b0487a1a371af`.
Before delivery, Free advanced through `f29443acfa8157fd5b314367cec41952ba96f261`
to `19b938a074d89e2e66086828a17221671dc4a15d`. The complete diff leaves all
three proposed index owners and these tests' dependencies unchanged. The delivery
branch preserves that latest Free tree.

Local Codex remains the only Free/main integration writer. This delivery adds one
standalone helper and test-only files. It does not apply the shared-owner patch,
change the formal runner, or claim the 10k gate is fixed.

## Why this slice exists

[CI 39083660931](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/39083660931/job/117545634563)
completed its first 21-page/10,000-member audit in 3034.547 ms, then exhausted the
original member deadline during its second full audit. That observation does not
attribute the failure to selection CPU. The current `NativeRepository.page`
non-ID path nevertheless has a definite redundant operation: every page reads
all index buckets, reconstructs a complete legacy inventory, validates that full
manifest, enumerates its keys again, and then discards all but the requested page.

The later [f29443a CI summary](../../../docs/evidence/free-delivery-2026-10-17/local-ci39086077996-summary.json)
records a formal failure before any complete audit, with revision 310 at the
deadline and 10000 refs only established afterwards at revision 311. Its separate
diagnostic run completed one 3081.18164 ms audit but timed out during the second.
Neither sample establishes that selection CPU is the dominant cause.

`selectNativeIndexPage` retains every fresh bucket read and its existing complete
byte/schema verification. It checks all global ordinals, root/scope and the exact
old 16 MiB manifest limit, while constructing only requested ID arrays.
`loadNativePieces` still reads and validates requested facts and their Project
dependencies. Nothing is cached between pages or audits. The two complete audits,
revision protocol, 30-second total budget, 6-second RPC budget, 10000 IDs and zero
missing/duplicate/UNKNOWN/wrong-membership checks are unchanged.

Only exact private immutable proofs created by the existing reader enter the
optimized selector. Ordinary inputs, clones and caller-frozen objects use the old
materializer, preserving its getter, prototype and schema rejection behavior.
Integer-index IDs also use the old materializer because `Object.keys` ordering
can differ from stored ordinals. Full JSON length is exact: root metadata uses
normal JSON serialization (including escaping), and validated ASCII IDs plus
safe-integer versions have an additive exact length. Tests explicitly exercise
the private fast path at 16 MiB and one character beyond, including two nonempty
tables and `Number.MAX_SAFE_INTEGER` versions.

## Integration by the existing owner

New production helper: `src/data/native-index-page.mjs`.
The only proposed existing-file changes are in `integration.patch`:

- `src/data/native-index-reader.mjs`: reuse the existing complete fresh bucket
  read for either the full materializer or the page selector.
- `src/data/native-repository.mjs`: use the selector for non-ID indexed pages,
  passing the existing lookup into `loadNativePieces`.
- `src/data/native-version-index.mjs`: add a read-only query for existing private
  immutable root/piece proofs with matching scope/kind/bucket/pointer revision and
  count. It cannot create proof, retain records or bless caller objects. All
  existing snapshot and validation functions remain byte-for-byte unchanged.

A newer root revision may legitimately reference the same immutable bucket
revision; the query recognizes that data proof, never authorization. The real
reader still obtains a fresh root and every bucket in the current transaction;
old immutable objects do not substitute for new IDB reads. Existing final
transaction, owner guard and abort-signal checks remain in place.

The existing `all`, targeted IDs, legacy formats, write/GC/recovery paths, source
permissions and transaction fence remain intact. Inspect current local changes
before applying; reconcile rather than overwrite newer owner work.

    git apply --check tests/free/index-audit-cost/integration.patch
    git apply tests/free/index-audit-cost/integration.patch
    node --test --experimental-test-isolation=none tests/free/index-audit-cost/*.test.mjs

The fixture recognizes either exact side of the patch and creates temporary
baseline/candidate source copies. Tests and mutation checks work before and after
integration; source drift that matches neither side fails explicitly. Counters
instrument only temporary copies. Owner scheduling/durability tests use MockIDB,
not browser evidence.

Independent review found getter/prototype regressions in an earlier draft. That
design was withdrawn: the final design does not modify snapshot capture or reuse
behavior and preserves the old validator for ordinary input. The final independent
21-case suite is included, with 1440 private-fast-path differential cases and
explicit checks that only numeric cases invoke the fallback materializer.

## Reproduction and measured result

    node --test --experimental-test-isolation=none tests/free/index-audit-cost/*.test.mjs
    node tests/free/index-audit-cost/mutations.mjs /tmp/index-page-mutations.json
    node tests/free/index-audit-cost/selection-benchmark.mjs /tmp/index-page-selection.json

- 77 new tests pass before integration; the same 77 pass after applying the patch.
- 232 affected tests pass on the integrated temporary tree; this set includes all
  77 new tests and must not be added to 77 as disjoint coverage.
- Eight precise mutants are killed: dropping root/scope validation, manifest-size
  bound, global ordinals, numeric fallback, ordinary-input fallback, or private
  root proof, piece proof or proof-context binding.
- Actual `NativeRepository` 108-ref/5-page comparison is byte-for-byte identical:
  425 fresh index reads and 113 fact reads per variant. Full inventory-map
  construction drops from five times/545 entries to zero.
- Unchanged `auditHostScaleIndex` passes twice over 1000 refs, three pages per
  audit, revision 2: 1506 fresh index reads and 2006 fact reads in total. The second
  pass repeats all reads. A late corrupted member fails the second audit.
  Cross-scope, revision/source revocation, GC retention, and guard/signal loss
  during bucket or fact callbacks reject stale results.
- Pure 10k, 42-page selection computation uses three alternating A/B pairs.
  Median is 267.91 ms versus 57.04 ms with identical selections. It avoids 420042
  full inventory-map entries while visiting all 420042 global ordinals per pair.
  IDB, fresh bucket encoding/validation, facts, broker and UI are outside timing.

See `validation.json` for commands, exact results and source hashes. No browser,
formal CI rerun, real account access, full Node suite, merge, deployment or Free
push was performed by this slice. The original failures, full cross-environment
10k journey and all existing acceptance gates remain open. The roughly 211 ms
isolated compute saving is not a prediction of a 30-second journey pass.
