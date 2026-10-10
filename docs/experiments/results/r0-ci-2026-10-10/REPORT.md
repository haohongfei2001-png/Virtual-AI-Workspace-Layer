# R0: first executed browser-fixture evidence

Date: 2026-10-10 UTC. This closes the execution-environment gap in the [2026-10-09 limited report](../r0-2026-10-09/REPORT.md); that earlier failure record remains intact.

**Result: 18/18 unique assertions passed in four real Chromium executions (72/72 checks). Overall architecture decision remains LIMITED.** This is BROWSER_FIXTURE evidence, not LIVE_HOST, MV3-extension or PAIA-coexistence evidence.

## Version and actual execution

- Tested commit: `4d04a4bbf025c83435c7122065bc326fc72b09ba`.
- [Successful GitHub run 38040447893](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38040447893), [job 114179458354](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38040447893/job/114179458354). All test and evidence steps executed successfully; nothing is inferred from a skipped job.
- Chromium `140.0.7339.16`, Playwright `1.55.0`, Node `22.16.0`, Python `3.12.11`.
- Standard GitHub-hosted `ubuntu-24.04`, image `ubuntu24 / 20261004.327.1`; Linux kernel and exact versions are in [environment.json](environment.json). The runner image/apt environment is recorded, not claimed immutable.
- Fresh browser contexts at 1440×1000 and 390×844, with two consecutive suite runs in each context. Every run has 18 PASS, 0 FAIL, no horizontal overflow and no page-script error. Observed page-level external request list is empty. This is not a claim that the whole runner had no network activity: dependency installation uses official distribution services.
- 27 Node tests and 2 mocked-runner Python tests passed on that same checkout, along with seven module syntax checks, Python syntax compilation and the fixture build. Python mocks are not browser evidence.
- All experimental source files are unchanged from `62017df56c0ee6a889ac57462dcad1500aff06a0`. This CI addition changes only the explicitly authorized workflow; this report and raw evidence are in the previously permitted results directory.

## Scope exception and cost boundary

The user separately approved adding exactly `.github/workflows/r0-fixture.yml` on 2026-10-10 to run this synthetic fixture on a free standard runner. The historical document-task prohibition on CI is preserved in the proposal; it is not silently edited or treated as broader approval. PD-01–PD-12, live account access, actual extension installation, product B/C implementation and merging remain outside this change.

The repository was verified public. GitHub documents free standard hosted runners for public repositories; larger runners are charged, and artifact/cache storage has separate quota rules. This workflow uses standard Ubuntu only, creates no cache or artifact upload, and emits bounded lossless evidence to job logs, which GitHub excludes from artifact-storage charging. It has a 15-minute timeout, `contents: read`, no secrets, no writable checkout credentials, fixed action commit SHAs, exact triggering-commit checkout, and a repository/public-visibility/branch guard. No account, host conversation, new hosted service, permission expansion or paid resource is used.

Sources read 2026-10-10: [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Playwright CI](https://playwright.dev/python/docs/ci), [pinned Playwright release](https://pypi.org/project/playwright/1.55.0/).

## What the actual browser assertions establish

| Cases | Actual assertions | Boundary |
|---|---|---|
| BF-01–06 | Synthetic native-node identity, composer focus/selection and known synthetic draft survive additive mount, repeated mount refusal, controlled disposal/remount and unknown-scope removal; host style updates remain | Fixture-owned DOM only. The probe does not read the draft; its test harness inspects known synthetic data. Native tool checks exercise a fixture button handler and model node, not ChatGPT tools. |
| BF-07–08 | A→B→A rejects old epochs; new-route/old-conversation metadata is rejected while matching metadata succeeds | Witnesses and route/body metadata are deliberately supplied by the fixture. This does not discover a real account or authenticate ChatGPT rendered-body ownership. |
| BF-09–10 | T0/P1-T1/P2-T2 synthetic references keep native source values, cross-account refs are refused, and alias HTML payloads render as text | No real Project, account or native title was changed. No model context, project file or permission merge is implied. |
| BF-11–14 | Loss of probe CSS leaves fixture native controls visible; additive slot does not overlap composer; explicit cleanup and host slot replacement preserve native island | No original navigation is hidden. This is not a real SPA route/lifecycle or extension-disable chain. |
| BF-12 specifically | Omitting explicit disposal leaves additive DOM at the sampled instant: `cleanLayout: false`, `nativeOperable: true` | This expected limitation is preserved in all four runs. Active code/timers still exist; it is not a test of actual disabled extension code. |
| BF-15–17 | Forged references rejected before DOM mutation; independent synthetic source invalidation removes shell; one failing cleanup listener does not skip shell cleanup | Contract and controlled DOM cleanup in the fixture realm, not production extension-origin authorization. |
| BF-18 | A real browser timer expires a short binding and removes the mount without gate API polling; composer node remains | Active JavaScript/event-loop behavior only. No freeze, background-throttle, disabled-code or killed-worker deadline guarantee. |

## Updated capability decisions

| Capability | Decision after this run |
|---|---|
| Synthetic scope/epoch/ref provenance and metadata ownership contracts in Chromium | GO for this exact BROWSER_FIXTURE; LIMITED as product evidence |
| Same-scope synthetic cross-Project reference rendering and immutable original metadata | GO for fixture; real Project observation/navigation BLOCKED |
| Additive mount / controlled exit / fixture DOM preservation / active-JS expiry | GO for tested fixture flows at both viewports; actual ChatGPT integration remains BLOCKED |
| Sensitive projection while code is frozen/disabled/terminated | NO_GO for enabling: independent expiry and complete recovery still unverified |
| Hiding/replacing real native navigation | NO_GO for enabling: strategy not implemented or tested |
| Host account/native-organization witness, real route-body ownership, real export/history coverage | BLOCKED / NOT_RUN |
| Real MV3 worker/reload/disable/re-enable/freeze; actual PAIA four-arm coexistence | BLOCKED / NOT_RUN |
| Physical IME, screen reader, real model/attachment/Canvas/voice/send controls | NOT_RUN |
| Formal B/C product implementation and product interaction choices | Not authorized by this fixture result |

No test or scope was weakened to obtain a pass. All 18 previously prepared assertions executed. The browser runner itself was not modified to make this run pass.

## Evidence integrity and failures

[run-ledger.json](run-ledger.json) preserves both runs. The first workflow commit `39352eb48a0d16a78db17084d2f30ea791edc146` failed validation before assigning a job (run [38040381950](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38040381950), zero jobs/check runs, zero browser executions). Source diagnosis found `runner.temp` used in job-level `env`, where the [official context table](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability) does not allow `runner`. The repaired workflow uses allowed `github.run_id`-scoped temporary paths. The next run was accepted and passed. The first result was not discarded or mislabeled a browser failure.

[evidence-log-excerpt.txt](evidence-log-excerpt.txt) contains the 15 original timestamped evidence-envelope lines from the successful job log, excluding unrelated installation logs. Each gzip/base64 envelope was decoded and its original byte count and SHA-256 verified, producing these unchanged files:

- [environment.json](environment.json)
- [source-checks.json](source-checks.json)
- [browser-results.json](browser-results.json)
- [dependencies.txt](dependencies.txt)

[evidence-integrity.json](evidence-integrity.json) records those checks; missing envelopes: zero. Every source hash in the browser and source-check reports matches the local files and the tested remote version. The workflow hash is `1a8e03fc044a6d4cc35fc9ba85ac67171b65cc7ca1f234116a5ce99c9bf00c45`. Reproduce the log decode with [decode-evidence.py](decode-evidence.py), passing the excerpt and an output directory. It validates sequence, length and digest before writing supported evidence files; it never executes decoded content.

## Review and next gate

The workflow was independently source-reviewed before publication; the initial review missed the GitHub-specific context placement rule, which was corrected after the validation failure and separately checked against official documentation. Post-run evidence review is recorded in [REVIEW.md](REVIEW.md).

This experiment ends with the executable fixture and verified evidence. The next R0 gate is a separately authorized, permitted clean-host/MV3 environment with real identity and lifecycle witnesses, then the exact installed PAIA coexistence matrix. It is not another product-design rewrite, automatic merge, extension installation or start of B/C. A passing fixture cannot waive those gates.
