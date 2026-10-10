# Independent R0 CI and evidence review

Date: 2026-10-10 UTC. Result: **PASS for the exact BROWSER_FIXTURE evidence; no blocking finding remains. Overall capability decision remains LIMITED.**

This was a separate read-only source/evidence review, not a live-host test or a claim of human GitHub approval.

## Reviewed identity

- Tested head: `4d04a4bbf025c83435c7122065bc326fc72b09ba`.
- [Run 38040447893](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38040447893), job `114179458354`.
- Workflow SHA-256: `1a8e03fc044a6d4cc35fc9ba85ac67171b65cc7ca1f234116a5ce99c9bf00c45`.
- Evidence decoder SHA-256: `d8fff7142dd087195ee0721236b028754776c9eb6051bf0e73772bb2a18276f4`.

## Independent checks

1. Re-fetched the GitHub job status and full job log. Every step actually succeeded; the checkout log identifies the exact tested head. The first failed validation run was independently rechecked and has zero jobs.
2. The saved 15 timestamped evidence lines match the freshly fetched remote log byte-for-byte.
3. Independently decoded all four gzip/base64 envelopes. Their original lengths, SHA-256 digests and saved file bytes agree. No file is missing.
4. All 13 reported source hashes agree between the browser report, source-check report and checked-out files. Remote changes from `62017df56c0ee6a889ac57462dcad1500aff06a0` to the tested head add only the authorized workflow.
5. Confirmed Chromium `140.0.7339.16`, Ubuntu runner image `20261004.327.1`, four actual executions of all 18 assertions: **72 PASS, 0 FAIL**, no page error, page-level external request or horizontal overflow. The **27 Node** and **2 Python mocked-runner** checks are counted separately.
6. Confirmed the report retains the first workflow validation failure, BF-12's expected `cleanLayout: false`, BF-18's active-JavaScript-only scope, and the LIVE_HOST/MV3/PAIA limits.
7. Final decoder reproduces the exact four files. Nine independent invalid-input cases were rejected, covering missing files, wrong digest, duplicate envelopes, input/advertised-size limits, chunks after END, skipped chunk numbers and decompression above the limit. Validation uses explicit checks, bounded decompression and completes for every file before any output file is written.

## Findings and disposition

- Initial workflow review missed GitHub's job-level `env` context restriction. Run `38040381950` failed validation before any job started. Diagnosis, repair and successful rerun are preserved in [run-ledger.json](run-ledger.json) and [REPORT.md](REPORT.md).
- The first local draft of the documentation decoder used Python assertions, checked decompression size only after full decompression, and reported missing files without a nonzero failure. Before publication it was hardened with explicit validation, bounded input/output, complete four-file requirements, strict chunk ordering and rejection after END. Independent regression checks passed.
- No source contract, fixture assertion or browser runner was weakened or edited to get a passing CI run.
- No unresolved blocker remains for recording this fixture result. Actual host identity, extension lifecycle under disabled/frozen/terminated code, native-navigation replacement and PAIA coexistence remain unverified and are not approved by this review.

