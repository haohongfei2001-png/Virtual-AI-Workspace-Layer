# Round263 — Nested host keyboard journey and interrupted completion repair

Base `67152498cdf6edfc1299bacdf390bfd6392ec7a3`, original local branch / Draft PR16, 2026-10-16. This round changes tests and fixtures only; production sources remain Round262. No private ChatGPT, ordinary Chrome profile, PAIA, deployment or native service was accessed.

## Nested host journey

The fixture server accepts `j3Layout: app-root` only for LEGACY/J3. It wraps the original native regions before page load in one full-size flex application root, leaving the module script outside. Default HTML stays byte-identical; original resources, authentication and actions remain. `J3_LAYOUT=app-root` selects this layout in the existing formal J3 runner. No journey assertion or keyboard bound changed.

Actual isolated packaged Chrome155 J3 **16/16 PASS**. UI06 open reverse reached composer in7 keys, closed reverse/forward in7/7, and open forward in24, under the original64-key/15-second bounds. Parent AX masks/restoration, original document/drafts/File, Back/Forward, actual200% zoom, old history, UNKNOWN reachability and snippet/native search all passed. Source/script/helper hashes stayed stable. Final screenshot was inspected. This is the LEGACY nested reconstruction, not all production layouts or full UI06/UI10/v2.7 certification.

The separate static production-mount probe passed8 direct/nested open/closed keyboard paths. It remains `STATIC_MOUNT_KEYBOARD_MECHANISM_ONLY_NOT_HOST_S`; its result is not added to the J3 denominator.

## Completion followed by Evidence repair

Two portable cases use the existing joint owner fixture and inject an abort after a successful completion transaction put. They first prove Evidence revision1, original anchor and valid durable receipt exist while the original continuation remains pending. The ordinary restart control completes exactly once. The repair case changes only the Evidence root checksum, uses actual recovery, and proves the old source revoked while its anchor and receipt bytes remain.

After reopening the repository, the repaired case retires as `needs-revalidation/source-revoked`, with unchanged native witness; the receipt does not mutate Evidence or revive the ACK. A second drain is idle. The actual artificial workspace is preserved and an empty other scope remains empty. This does not certify all historic Pro asset types or preservation of populated scope-B data.

Both cases passed MockIDB portability and actual isolated extension-origin IndexedDB **2/2**, with stable source hashes. Evidence class is **D / TEST_ONLY composition**, not Host S, physical crash/disk exhaustion, live account or complete SYS02/J4. The existing runner's default13 pending cases remain unchanged; the new pair requires `SYS02_SUITE=completion-repair`. Unknown suite names fail before package/browser access. Initial scaffold failures (snapshot taken before legitimate native ingestion, normalized anchor fields) are retained; final assertions compare original payload fields and full before/after records.

## Commands and bounds

- `J3_LAYOUT=app-root node tests/host/j3-package-journey.mjs <report>`
- `SYS02_SUITE=completion-repair FREE_CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node tests/host/sys02-pending-idb-browser.mjs <report>`
- Full Node regression result is recorded in `node.log.gz` and STATUS. Targeted24 include default pending13, fixture and report contracts, and are not added to full totals.

Round261 CI was cancelled after its successor; Round262 CI38851822919 was still running at this checkpoint's validation. Earlier CI56 failures remain. No CI pass is inferred from local evidence. Inherited native-mask visibility, scale/cold reliability, remaining81 subcases, real ChatGPT/PAIA/physical IME and release gates stay open. **Free NOT_RELEASE_READY.**
