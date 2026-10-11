# C1 actual interface acceptance

Run with isolated Python/Playwright and the installed Mac Chrome. No package installation, real login or existing debugging port needed.

```sh
python tests/c1/real-ui.py --out /tmp/vaiwl-c1-ui-new
node --test --test-reporter=tap tests/b1/broker.test.mjs tests/hf/*.test.mjs tests/b23/*.test.mjs tests/b4/*.test.mjs
python tests/b23/view-browser.py --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out /tmp/vaiwl-c1-dom-new
python tests/b23/real-browser.py --mode page --port 48173 --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out /tmp/vaiwl-c1-page.json
python tests/b23/real-browser.py --mode mv3 --port 48174 --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out /tmp/vaiwl-c1-mv3.json
python tests/b4/real-mv3.py --suite core --out /tmp/vaiwl-c1-core.json
python tests/b4/real-mv3.py --suite lifecycle --out /tmp/vaiwl-c1-lifecycle.json
```

The C1 driver builds the actual MV3 extension, launches a fresh headless Profile with Chromium sandbox enabled, loads via Extensions.loadUnpacked and serves only the synthetic loopback host on 48176. Temporary profiles/builds and test servers are cleaned. Current/history navigation uses the actual UI; tests do not rewrite view data. Real human UI edits and PLACE commands feed the existing B3/B4 CAS repository. Raw output binds source/build hashes and captures desktop, narrow/drawer, dark, history, empty segment, recent-long/old-long and editor screenshots. `--baseline` checks the first four journeys against an unchanged PR #8 runtime in a separate checkout; stable original counterexamples are retained.

Run C1 UI alone for final screenshots; concurrent heavy Chrome regressions can encounter the already defined lease/unknown-write boundary. Never blindly replay a write to manufacture saved feedback. DOM regression has its existing fake sender/mock IDB; it does not stand in for native MV3/IndexedDB. D28 expands all search batches to the original 604-reference assertion. There is no real ChatGPT/physical IME/user-discoverability/production compatibility claim.
