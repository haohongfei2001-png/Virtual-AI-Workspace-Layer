# R0 isolated synthetic capability spike

This directory is an experiment, not the extension runtime. It is based on proposal commit `223a34f4b4f47d56b17b8d2c1cd3afa5a162101f`. The proposal PR remains Draft and is not automatically approved or merged.

## Scope

- Synthetic-only scope/epoch token issuance and final-commit checks, including A → B → A.
- Independently checked route/render/message metadata. No message body or draft collection.
- Same-scope ordinary/P1/P2 references and independent derived titles; original sources remain immutable.
- Additive navigation attached only to an empty fixture-owned slot. Native DOM, styles, history, menus, composer and draft are not inspected or modified by the probe.
- No hidden-native-navigation strategy, live host adapter, manifest, extension installation, durable store, cloud model, sync, account authentication, network collection or native writes.

Fixture identity is supplied by the test. The gate accepts only `synthetic-r0` / `SYNTHETIC_WITNESS`; it is not a method of discovering or authenticating a real host account. The token mechanism is a unit-test contract, not a security boundary against malicious code in the same JS realm. Independent gates represent synthetic documents, not real Chrome tabs. Expiry is checked at API boundaries, not by an autonomous lease. With no gate/check/view call, an already mounted panel can remain after its clock expiry; freeze, worker death and no-cleanup recovery are not solved. Do not enable sensitive unattended projection or native-navigation hiding from this experiment. Canonical routes under `https://r0.invalid` are intentionally synthetic and not ChatGPT selectors.

The module-level memory maps are temporary test state, not production storage or an implementation of phase B. The fixture has no approved product interaction defaults and does not approve PD-01–PD-12.

## Reproduce source checks

Use an already installed Node.js 22 or newer and Python 3:

    node tests/r0/run-checks.mjs /tmp/vawl-r0-checks

This runs module syntax checks, Node's actual test runner, and two mocked-runner failure-classification tests in Python (not browser evidence), emits unedited TAP in the JSON result, records source hashes and builds a portable fixture. It never installs a package or browser. Generated HTML is transport, not a second source of truth.

## Reproduce browser checks in an authorized isolated environment

If Python Playwright and Chromium are already installed:

    python tests/r0/run-browser.py --chromium /path/to/chromium --output /tmp/vawl-r0-browser.json

The runner creates a fresh ephemeral browser context, serves the repository on loopback only, blocks requests to every other origin, and exercises the fixture twice at 1440×1000 and 390×844. It records real browser results and errors. It does not use an existing profile, sign in, install an extension or request permissions. A launch failure returns `BLOCKED` and exit code 2; test failures return exit code 1. Missing tools are not silently installed.

Alternatively serve the repo on local HTTP in the same isolated browser environment and open `experiments/r0/fixture.html`, then use **Run fixture suite**. The page emits its detailed JSON. It runs no tests automatically and makes no external requests. Only synthetic fixture input should be entered. Clicking a synthetic reference does not reach a real conversation.

The browser test harness, unlike the probe, can inspect its own known synthetic draft to assert preservation. It records no draft content in results. The test deliberately leaves one additive mount without cleanup and records `cleanLayout: false`; this is a demonstrated limitation in that simulated scenario if run successfully, not an actual extension disable test.

## Evidence and stopping point

See `docs/experiments/results/r0-2026-10-09/REPORT.md`. `SYNTHETIC_CONTRACT_TEST` is narrower than the proposal's `BROWSER_FIXTURE` label and is used only for Node tests. The browser suite has a label in its code, but becomes evidence only after an actual browser run. Never count source-only assertions as executed browser results.

LIVE_HOST, real MV3 lifecycle, PAIA coexistence, clean export compatibility, physical IME, screen reader and durable extension-origin storage stay blocked or not run. R0 does not enter B/C, enable dangerous capabilities or merge the design.
