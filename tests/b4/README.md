# B4 — isolated real Chrome MV3 acceptance

Only synthetic loopback host, fresh disposable profiles, real extension-origin IndexedDB and real Chrome worker. Reuses accepted B23 data/CAS/idempotence/undo. No existing Chrome debugging endpoint, daily profile, real account, paid API or Actions.

Python Playwright1.63.0, Node26.8.2, Chrome154.0.8037.99 on macOS27.0. Default suite is `core`; complete acceptance requires BOTH commands:

```sh
python tests/b4/real-mv3.py --suite core --out /tmp/b4-core-new.json
python tests/b4/real-mv3.py --suite lifecycle --out /tmp/b4-lifecycle-new.json
node --test --test-reporter=tap tests/b1/broker.test.mjs tests/hf/*.test.mjs tests/b23/*.test.mjs tests/b4/*.test.mjs
```

Both suites are headless. Core5 journeys: >=3 actual20s leases during65s run; real stopped worker auto-wake/rebind with no reload; two-tab dirty draft/remote edit conflict and explicit retry; actual read reply held past6s and late-reply fence; bounded transport failure + actual command/undo commit with reply loss, no automatic replay.

Lifecycle1 journey uses a new owned Chrome process and only its new DevToolsActivePort. `connect_over_cdp(no_defaults=True)` avoids Playwright's forced-visible focus emulation; Chrome tabs API actually activates the other test tab. Actual hidden21.5s, actual background freeze21s, trusted freeze/resume/visibility events, automatic reconnect, preserved drafts/native nodes, SPA A/B/unknown/A, actual120 themes/604 refs/160-message long chat. No JS visibility override or synthetic lifecycle event. Test process/profile are cleaned.

`--suite timeout` is a targeted counterexample, not the complete run. `--baseline` selects the old baseline subset; archived original FAIL is bound to its original code commit, not reproduced against repaired code by pretending it failed.

Final report: docs/engineering/B4_ACCEPTANCE_2026_10_11.md. Raw immutable failures, intermediate/final JSON, Chrome/CDP logs, exact commands and hashes: docs/engineering/b4-mac-2026-10-11/. Earlier headed visibility failure was a short driver diagnostic; no visible browser is needed by the final driver.
