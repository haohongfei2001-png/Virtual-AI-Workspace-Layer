# PR7 baseline rerun — execution checkpoint

Source runtime: `cbcde633777ec7c463ddce3f6f1b888fa61f0cfe`; current branch differs only by the environment evidence file. No product fixes have been made yet.

Actual complete Node command:
`node --test tests/b1/broker.test.mjs tests/hf/*.test.mjs tests/b23/*.test.mjs`

Result: 104 tests, 104 pass, 0 fail, exit 0. Raw TAP is 20010 bytes, SHA256 `b094a573cf97e83f0f60c88281ad835571f8f306112cce670e1fab7a1fc11cc7`.

Actual complete Chromium DOM command:
`python tests/b23/browser.py --browser /usr/bin/chromium --out /mnt/data/vaiwl-pr7-audit/dom-baseline`

Result: 48 pass, 0 fail, exit 0. Raw JSON is 16836 bytes, SHA256 `c7abd555527972149618853f8ce870aa3ce358b32961b9b77a4ebad4084fd4c8`. The existing 120-theme / 604-reference pressure and 128-member expansion cases were not reduced.

The database contracts and opaque DOM runner explicitly use mock IDB. Real origin IndexedDB, browser reload persistence and MV3 remain BLOCKED by the actual policy errors already committed in `environment.json`. None of these counts is logged-in ChatGPT evidence.

The raw logs have been retained during this execution and will be included with final audit evidence. This checkpoint records the successful baseline only; newly identified recovery/revocation counterexamples still need execution. No blanket B2/B3 acceptance claim is made.
