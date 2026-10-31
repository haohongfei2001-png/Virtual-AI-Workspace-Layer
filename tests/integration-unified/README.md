# Unified Free + Pro R1 verification

These scripts test the isolated integration candidate. They are engineering
verification entries, not a second product or development plan. The production
source PRs and `main` remain owned by their existing writers.

## Independent incoming baseline

The input was independently archived and run at exact Pro commit
`5dec17dc275a79b998db6b3ba8d940710337d3b5`, including Free commit
`2c9b043ce3c65a4b92c6f8f83b59fb416f63132a`. Files in `baseline/` are immutable
incoming-baseline evidence, not results for a later integrated commit:

- Pro + related shared regression: **443/443, 0 failed, 0 skipped**. This includes
  the original Chromium continuous journey and the separate UI mouse/keyboard
  journey, browser-process restart, and data-only backup restore.
- Unapplied shared-owner patch in a separate temporary mirror: **202/202**. Some
  tests overlap the 443; the numbers must not be added as unique cases.
- Development performance, 1000 references / 100 topics / 30 warm samples:
  reducer p95 **74.832 ms**, cached switch p95 **18.997 ms**, MockIDB chain p95
  **490.618 ms**. All original development targets passed. This does not measure
  real browser disk, real ChatGPT, or a user's Mac.
- Browser: official Chrome for Testing **143.0.7499.4**; Node **24.22.1**; isolated
  temporary profiles; no user data, model calls, or non-loopback page requests.

The first no-font browser reproduction failed because the optional font endpoint
returned 204 while the demo declared it as a required `@font-face`. The unchanged
baseline passed with a local TTF explicitly supplied. The integration fixture
server now omits that face declaration when no font is configured; the unchanged
browser journey then passed without a font. No browser assertion was relaxed.

## Candidate checks

Install the repository's locked dependencies:

```sh
npm ci --prefix extension/tooling --ignore-scripts --no-audit --no-fund
npm ci --prefix tests/b1/tooling --ignore-scripts --no-audit --no-fund
tests/b1/tooling/node_modules/.bin/playwright install --with-deps chromium
```

The CI workflow uses official full Chrome for Testing **143.0.7499.4**, matching
the independent baseline, and checks the downloaded Linux archive against
SHA-256 `ab56b2a7955c2961f74348e2349f1e907489283da23dba37c730b624e4d670bb`.
The full browser is required for unpacked MV3 lifecycle checks; a headless-shell
binary alone is insufficient. To reproduce that exact browser, use the URL and
checksum in `.github/workflows/vaiwl-unified-r1.yml`.

Provide `FREE_CHROME_EXECUTABLE` and `PRO_CHROMIUM_EXECUTABLE` pointing to the
installed Chromium binary, and `CODEX_PRIMARY_RUNTIME_NODE_MODULES` pointing to
`tests/b1/tooling/node_modules` (absolute paths). Then run:

```sh
node tests/integration-unified/run.mjs node
node tests/integration-unified/run.mjs package
node tests/integration-unified/run.mjs performance
node tests/integration-unified/run.mjs browser
```

`VAIWL_UNIFIED_EVIDENCE_DIR` optionally chooses the report directory. By default
reports go to `artifacts/unified-r1/`. `VAIWL_SOURCE_COMMIT`, when supplied, must
equal the actual checkout HEAD. Reports include the SHA, source and test hashes,
source cleanliness, raw command logs, pass/fail/skip counts where applicable, and
before/after stability. CI requires committed source. Missing Chromium or missing
browser evidence fails; it never becomes a skipped green test.

The browser phase includes the original continuous Pro and UI journeys, the
bounded remote renderer with a long Series, native IndexedDB compound restore
and damaged-root recovery, the production unified MV3 journey, and both
standalone Free and unified formal BrowserLocal packages. The latter exercises the memory-only default, explicit
existing popup binding, private local persistence, document replacement, fresh
binding and revocation. It never treats an observed conversation route as
positive NONE membership. The verified loopback journey separately exercises
positive native NONE, explicit correction and exclusions, split/merge/Series,
whole-operation undo, native reading/return, composite download and blank-profile
restore, multiple tabs, worker termination, browser restart, account replacement,
and actual disable/reenable/uninstall of only the disposable installation. The
same journey deletes only the current Pro root through a test-only CDP fault
injection, proves the real recovery preview is read-only, and confirms the whole
journal-backed overlay through the production recovery dialog. It also imports
a synthetic legacy Free file through the original backup UI and upgrades it
through Pro's review, retaining the Free assets and requiring an explicit choice
for ambiguous historical primary relationships.

The formal BrowserLocal test uses exactly `{browserLocal:true}` and
`{browserLocal:true,proR1:true}`. It does not replace the formal manifest, CSP, or
Host config with an offline build. Playwright fulfills synthetic observed-shape
HTML at the exact allowed `https://chatgpt.com/c/<synthetic-id>` URL; a local deny
proxy has no outbound forwarding, and every other page request is aborted. No
real ChatGPT page or account is accessed. The actual loaded formal ZIPs are
retained in `formal-tested-packages/` alongside their source and SHA-256 reports.
Their hashes can be compared directly with the independently rebuilt package
job artifacts for the same commit.

The unified journey also reuses its saved assets in a raw-CDP browser with no
host tabs for one fixed 60-second observation. The inherited independent idle
oracle verifies that no worker or page target was attached and no stop, page
freeze, production timer change, or polling occurred during that window.
Playwright connects only afterward to verify normal fresh host authorization
and retained assets. A missing stop is recorded as `NOT_OBSERVED`; an unforced
target destruction is recorded without claiming that its cause was natural
idle. These finite observations never manufacture a natural-sleep pass.

The workflow checks out the immutable event SHA and runs only on the isolated
integration branch or explicit dispatch. It uploads the exact reports and
candidate packages. It neither merges nor releases the extension.

## Evidence limits

The verified-scope unified browser test loads the real packaged service worker
and extension frames into an anonymous loopback Host reconstruction. Fixture
authentication is confined to that reconstruction; production ports and storage
run unchanged. The separate formal BrowserLocal test uses the unchanged formal
package with synthetic browser-fulfilled HTML and no server identity.
Synthetic coexistence probes are not a test of an installed PAIA build. Forced
worker termination and unforced target destruction do not establish natural
idle causality. Real ChatGPT
markup, real positive NONE source evidence, private old assets, physical input
methods, actual PAIA, personal Mac, and paid model/provider gates remain separately
identified. No offline pass is a claim of `FREE_ACCEPTED` or `RELEASE_READY`.
