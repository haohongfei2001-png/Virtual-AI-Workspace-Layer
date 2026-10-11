# B2/B3 interruption recovery and verification gate

Date: 2026-10-11. This file is a durable **checkpoint**, not a product acceptance certificate.

## Exact GitHub state

- Review: Draft PR #7 `https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/7`.
- Base: PR #6 `a02d65388f0a5d09833ac8a7091a45dea1720f82`.
- Source checkpoint: `ea034db5ea792b210ffcf66fc25acead10ab1751`.
- Source is already committed to `feat/vaiwl-b2-b3-persistent-20261011`, stacked on PR #6. Do not recreate B2/B3 from scratch.
- No PR merged; no Mac access or production ChatGPT authentication.

## What exists in the source checkpoint

- `src/data/{schema,evidence,state,repository,hash}.mjs`: same B1 IndexedDB, migration to version 2, source/coverage and time-evidence rules, durable Workspaces/Placements/DisplayIdentity, CAS, operation logs, undo and recovery.
- `simulator/{editor,persistent-seed,client,service,worker,...}.mjs`, `src/navigation/navigation.mjs`: workspaces from the B1-backed repository instead of a purely in-memory list, synthetic editor actions and persisted view.
- `tests/b23/`: mock-IDB contracts and failure injection, browser DOM runner, and separate no-fallback real URL / real IDB / MV3 drivers.

These are **committed files**, not a blanket claim that every end-to-end operation is proven.

## Exact verification state

| Level | Evidence | State |
|---|---|---|
| A: Node / mock IDB | Earlier interrupted run reported 104/104 passing. Original full TAP file and exact build identifier were not committed with this head. | RE-RUN REQUIRED |
| B: Chromium DOM / opaque fixture | Earlier interrupted run reported 48/48 passing. Original run JSON/logs not committed with this head. | RE-RUN REQUIRED |
| B: true browser-origin IDB migration, reload, two-tab CAS | Driver is in `tests/b23/real-browser.py` but no real execution evidence is committed. | BLOCKED/NOT_VERIFIED |
| B: real Chrome MV3 worker / extension-origin IDB | Driver exists, cloud administrator policy previously blocked unpacked extensions. PR #6 older MV3 pass is not a B2/B3 integration pass. | BLOCKED |
| C: real logged-in ChatGPT | Explicitly out of scope, no account or data used. | NOT_RUN |

`tests/b23/README.md` referenced `docs/engineering/b23-results/RAW_RESULTS.tar.gz` but the archive was **not included** in the source checkpoint. Do not claim that raw evidence is in the repository.

## Minimal continuation commands

Run from a clean checkout of the current PR #7 head in a permitted isolated environment, without personal Chrome data or real ChatGPT account.

```sh
node --test tests/b1/broker.test.mjs tests/hf/*.test.mjs tests/b23/*.test.mjs
python tests/b23/browser.py --browser /usr/bin/chromium --out /tmp/vaiwl-b23-browser-new
```

Capture Node TAP and exit code, full Chromium JSON/logs, Node/Python/Chromium versions, exact `git rev-parse HEAD`, and SHA-256 hashes; commit sanitized evidence to this PR. Do not accept an old screenshot, a progress message or an earlier head as a substitute for those files.

In a **separately authorized** isolated Chrome environment that permits normal loopback URLs, real IndexedDB and unpacked MV3, run:
```sh
python tests/b23/real-browser.py --mode db --browser /path/to/approved/chromium --out /tmp/b23-native-db.json
python tests/b23/real-browser.py --mode page --browser /path/to/approved/chromium --out /tmp/b23-native-page.json
python tests/b23/real-browser.py --mode mv3 --browser /path/to/approved/chromium --out /tmp/b23-native-mv3.json
```

No permission to connect to the user's Mac has been granted in this turn. Do not bypass cloud administrator policies, schedule paid CI, modify other repositories or use production accounts. If blocked, record BLOCKED and complete the independent checks.

## Exit condition

Only after evidence is committed and checked should the PR be described as B2/B3 engineering verified within the stated scope. Otherwise leave it Draft/LIMITED. Do not auto-merge or start B4/C2.
