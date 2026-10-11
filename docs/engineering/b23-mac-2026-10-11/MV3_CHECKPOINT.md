# Real Chrome MV3 checkpoint

Original driver 6/6 PASS; initial expanded driver 17/17 PASS; final expanded driver 19/19 PASS. Actual Extensions.loadUnpacked succeeded in a fresh headless Chrome 154 profile. Actual content-script-to-worker messages, extension-origin IndexedDB rows and manual UI edits are used. No page-mode service or fake sender replaces MV3.

ServiceWorker.stopWorker is followed by actual workerVersionUpdated stopped event for the observed version. A real content message wakes the worker before reload: boot UUID changes while documentId stays identical. Existing manual state remains revision 8, 120 bootstrap themes + 1 human theme, 604 refs. Old lease denied with no snapshot; real new BIND obtains a different lease. Then explicit page reload rebinds UI and retains title/name/icon/manual placements. This proves cold worker recovery; it does not certify automatic UI reconnection of idle old leases.

A/B/A and real simultaneous tab writes pass. Actual delayed worker reply is held by test scheduling and discarded after unknown identity; unknown content BIND denied. Native input/messages/tool/interactive nodes and native references/Projects remain unchanged. Corrupt extension view shows diagnostic without discarding workspace; corrupted row bytes retained and manual data editable. Screenshot and raw Chrome log retained.

Command: DEBUG=pw:browser /private/tmp/vaiwl-pr7-mac-hTNRJ6Mq/venv/bin/python tests/b23/real-browser.py --mode mv3 --port 48174 --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out docs/engineering/b23-mac-2026-10-11/mv3-final.json

mv3-final.json includes all results, actual content execution contexts, raw CDP worker events, before/after boot & document identifiers, stop command, native stored records, source and build hashes. Test profiles/build directories were removed by the driver; no daily profile, real ChatGPT or PAIA access.
