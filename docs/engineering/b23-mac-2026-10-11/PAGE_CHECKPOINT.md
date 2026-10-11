# Real page persistence checkpoint

Original driver: 6/6 PASS. Final expanded native page run: 17/17 PASS. Uses normal loopback URLs, actual host-origin IndexedDB and two real tabs. The UI writes create/rename/icon/title/place/move/undo, and durable raw records plus editor fields are checked after refresh and new tab. The 120 baseline themes and 604 refs remain; one manual theme brings the total to 121. A/B/A isolates title, workspace and placements. Concurrent UI writes share a revision; exactly one commits and one reports conflict. A separate two-connection native CAS also passes.

Real native snapshot replies are delayed by driver scheduling only. Later manual commands stay ordered; old replies after unknown identity cannot render sensitive data. Input, form, transcript, individual message nodes, draft, interactive slider, tool/model selection and native catalog/Projects remain intact. Corrupt view is injected only in the owned native DB; warning shown, workspace/title remain editable, damaged bytes preserved, draft and native nodes retained.

Driver-only failures retained: CSP rejects a string wait_for_function; ambiguous status also matches output; broker is frozen and cannot be replaced; Playwright auto-calls an assigned function returned by evaluate. Fixed using function predicates, scoped status locator, delaying actual repository snapshot, and explicit no-return evaluate callback. No CSP, browser policy or assertion weakened. No product source change beyond the already committed native IDB repair.

Command: DEBUG=pw:browser /private/tmp/vaiwl-pr7-mac-hTNRJ6Mq/venv/bin/python tests/b23/real-browser.py --mode page --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out docs/engineering/b23-mac-2026-10-11/page-final.json
Chrome launch/close stderr is retained in page-final.log. page-final.json contains every result and source/build SHA256. Screenshot: page-final.png (synthetic only).
