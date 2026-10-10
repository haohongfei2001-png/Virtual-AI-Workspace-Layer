# Executed R0 v2.7 experiments — not product code

This execution is based on design PR #1 head `79dbfa7e6e71595bfcc543334204975000469ac9`. The 27 pre-existing R0 source/test files are imported byte-for-byte from PR #3 head `d5c66221f18a24145974b9696a8788a5a8b90155` (which includes PR #2 work). No workflow, old design document, or product implementation is imported or changed. Historical comments saying “not loaded” describe that original preparation; the current executed results are in `docs/experiments/results/r0-executed-2026-10-11/REPORT.md`.

The user separately authorized this isolated Mac execution. That authorization does not authorize real private chats, a production adapter, merging any PR, or modifying a daily Chrome profile. The host fixture, message events, account witnesses, PAIA placeholders and ZIP payload are synthetic. The public-shell probe is a separately invoked, single unauthenticated navigation; it does not submit a message or log in.

## Exact executed environment

macOS 27.0 (26A428), arm64; Google Chrome 154.0.8037.99; Node 26.8.2; npm 11.19.1; Python 3.14.7; project-local Playwright 1.64.0. Chrome ran headless with a newly created user-data directory and a debugging pipe, never the user's daily profile or debug port. No global install or OS permission change was performed. The reload follow-up changed Developer Mode only inside its new disposable test profile.

## Reproduce the isolated synthetic experiments

Use a new `/tmp/vaiwl-r0-*` directory. Do not point these commands at a daily Chrome profile. The commands below create their own profiles; they never accept a user-profile path.

```sh
export R0_WORKDIR="$(mktemp -d /tmp/vaiwl-r0-XXXXXX)"
git clone --branch experiments/vaiwl-r0-executed-20261011 \
  https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer.git "$R0_WORKDIR/source"
mkdir "$R0_WORKDIR/tools"
cp "$R0_WORKDIR/source/tests/r0/execution_v27/tooling/"package*.json "$R0_WORKDIR/tools/"
npm ci --prefix="$R0_WORKDIR/tools" --cache="$R0_WORKDIR/npm-cache" \
  --ignore-scripts --no-audit --no-fund
cd "$R0_WORKDIR/source"
node experiments/r0/mv3/build-probe.mjs "$R0_WORKDIR/built-original"
node experiments/r0/execution_v27/build-variants.mjs "$R0_WORKDIR/built-route"
node experiments/r0/build-fixture.mjs "$R0_WORKDIR/legacy-fixture.html"
node tests/r0/mv3/run-checks.mjs "$R0_WORKDIR/inherited-checks"
python3 tests/r0/execution_v27/test_timefacts.py "$R0_WORKDIR/timefacts.json"
R0_RESULT=reproduction-chrome.json node tests/r0/execution_v27/run-chrome.mjs
node tests/r0/execution_v27/complete-lifecycle.mjs
```

Use the installed Chrome application, not a global browser install. A different Chrome/OS version is a different environment and must be reported as such. The main runner records counterexamples as FAIL and still executes independent cases; orchestration exit 0 is **not** an all-tests-pass signal. Read the JSON statuses. Reproduction writes only this new checkout/temporary directory, not GitHub.

`public-shell.mjs` is not part of the default loopback suite. Its separately authorized execution reached HTTP 403, not the ChatGPT app. Do not add authentication, defeat the browser challenge, or change extension matches to ChatGPT without separate clean-account approval.

## What the probes establish

The original four-file MV3 package is actually loaded with Chrome's `Extensions.loadUnpacked` CDP command and process-local `--enable-unsafe-extension-debugging`. Content-script/worker interaction is real. It is not `page.set_content` masquerading as MV3.

`build-variants.mjs` creates a distinct experimental variant: browser-sourced `webNavigation.onHistoryStateUpdated` invalidation and one non-sensitive four-grid hook inside the fixture's already empty exclusive slot. It neither authenticates a ChatGPT account nor implements a production workspace. The original probe is unchanged. No private ChatGPT history API, native-data write, model call, or cloud persistence exists in these probes.

`timefacts.py` is a normalized **synthetic** evidence calculus, not an official-export parser. Its fixture ZIP limits are test bounds, not approved product import limits. Explicit synthetic attestation labels are preconditions of tests, not a substitute for host identity or timestamp provenance.

The extension-origin IndexedDB check writes one synthetic committed record and verifies it after actual worker termination and volatile-memory loss. It is not a full repository, crash-during-transaction, migration or concurrent-CAS implementation.

Native feature operations use real browser DOM controls and fixture handlers. The synthetic stream is not an LLM response, the file input is not a real attachment upload, automated Chinese text insertion is not physical macOS IME, and the PAIA placeholder is not PAIA. Frozen-tab and live-host evidence remain blocked where stated.

See the result report, native five-column matrix and architecture decision before using any PASS as a development prerequisite.
