# First-observation ingestion write causes

This is a finite, runnable characterization for the local Free integration owner.
It adds tests/diagnostics only. No production fix, shared-owner patch, workflow,
acceptance threshold, Free/main write or browser rerun is included.

## What the probe establishes

With the same 1000 actual scale-fixture long-title rows and the original 65536-byte
splitter, the unchanged discovery, observation owner, NativeRepository and
WorkspaceRepository produce:

| Earlier history packets | Later Project packets | Successful apply calls | Readwrite transactions | Final Native revision |
| --- | --- | --- | --- | --- |
| 0 | 20 | 20 | 25 | 21 |
| 2 | 20 | 22 | 27 | 23 |
| 4 | 20 | 24 | 29 | 25 |

All cases verify the exact same 1000 ref IDs and 1000 memberships in the expected
Project. Initial index migration adds one Native revision beyond observations;
raw transaction totals also include initialization/migration. Calls, commits,
transactions and revisions are deliberately different counters.

The first 2/4 history packets previously observed 120/240 refs without confirmed
Project membership. Their later first Project claims require semantic writes,
even though title/URL values remain unchanged. Extra revisions therefore cannot
be attributed to unchanged rescans from final inventory counts alone.

Controls distinguish:
- Fresh unchanged Project observations: zero apply calls and zero write
  transactions; original source and row timestamps remain unchanged.
- Expired witnesses: real writes are required, despite identical native values.
- Revoked source: only fresh observation establishes a successor incarnation;
  the original source stays revoked.
- One changed native title: exactly one semantic rename, with unchanged rows in
  the same fragment reported separately.
- Revision movement and authority loss at the no-op fence: retry/reject,
  respectively; never counted as accepted zero-write work.

These findings do not prove the cause of Linux CI39086077996's deadline failure.
They do not justify changing initial native navigation, suppressing observations,
extending TTL or dropping membership updates. No safe production optimization
was established by this slice.

## Reproduce

From repository root:

    node tests/host/ingestion-cost/diagnostic.mjs /tmp/ingestion-causes.json
    node --test tests/host/ingestion-cost/write-causes.test.mjs
    node tests/host/ingestion-cost/mutations.mjs /tmp/ingestion-mutants.json

The normal fixture bounds inputs to at most 1000 synthetic rows and the CLI runs
exactly three cells. DOM traversal and fragment sending are lazy: ending a history
prefix does not sample unseen later pages. An early exploratory probe eagerly
collected the full iterator before sending a prefix, introducing artificial
handle-detachment traffic. That result was withdrawn. The final table uses only
the corrected lazy probe; an eager-prefix mutation now fails its dedicated test.

## Evidence boundary and integration

The chain uses real `createSurfaceDiscovery`, `splitSurfacePayload`,
`createHostObservationOwner`, NativeRepository and WorkspaceRepository. DOM,
handshake/scope, wall clock and IDB are explicit doubles. It does **not** run the
adapter pump, content-session, browser event loop or genuine authentication.
The original per-request owner deadline remains intact; the formal 30-second
journey and its two complete audits are not executed or simulated here.

Read/apply/version wrappers bind the original receiver and preserve results. The
transaction wrapper returns the exact original transaction. Counting uses the
owner's already returned targeted page and read-only admission lookup, without
adding a storage read or acquiring authority. A `record:false` control compares
complete facts and every packet settlement through history, Project, repeat and
rename against the counted run. Diagnostic output contains aggregate causes and
store names, not IDs, titles, URLs, scope identifiers or credentials. The complete
facts remain local synthetic test values.

Validation: 12 new tests pass; 60 related tests pass, including those 12. Six
precise mutants are killed, each by one explicitly selected behavioral test.
Independent review passed the original 10 plus the added 2 controls and reviewed
the mutation script. Exact source hashes/results are in `validation.json`.

Tested owner/source baseline: `e1b0bfd6ae76a5aa5e6948edc71b0487a1a371af`.
Delivery base: `48dd9205d242696fdcd6c5dc09927267725cbd8b`. All production modules
used by this probe remain unchanged across that advance. Local Codex's newer
hidden-directory and foreground-readiness changes are preserved; this direct
owner probe does not characterize those adapter/content-session scheduling paths.
PR18's runner work is already transplanted; PR19/20 remain separate pending
handoffs at this check. No claim is made about unpushed local work.

Use the tool to separate first-new refs, first confirmed memberships, semantic
changes, source revalidation and inactive witnesses before comparing revision
counts in a controlled reproduction. To explain the actual CI, matching packet
order and lifecycle evidence from that run is still required. Do not infer
latency or deadline success from MockIDB or these transaction counts.
