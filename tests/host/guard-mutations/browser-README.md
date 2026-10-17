# Real browser guard mutations (CI)

Run with preinstalled Playwright and Chrome/Chromium in the approved isolated CI:

    FREE_CHROME_EXECUTABLE=/usr/bin/chromium FREE_SOURCE_COMMIT=<verified-sha> node tests/host/guard-mutations-browser.runner.mjs /tmp/browser-guards.json

Optional final argument selects one of auto-popover, background-mask, async-default, postcommit-window. The runner invokes real browsers only; do not run in an executor where browser startup is prohibited. It downloads nothing and never modifies the checkout. The writer may run it in the existing free standard Linux CI. Allow up to 20 minutes for all eight baseline/mutant launches; successful runs should take much less.

Each case gets an independent temporary source copy and new profile; the ordinary packageHost/verifyHost path builds the exact baseline and its designated mutant. The baseline must PASS before a mutation is attempted. A target-phase ERR_ASSERTION, child exit 1, and no terminating signal are required for KILLED. Startup/import/package/wait/fixture errors are never kills. Reports retain per-build hashes, browser version, worker external-network denial, exact observations, assertion and infrastructure failures. No report is claimed until CI executes it.

## Scope

- UI-08 S: real browser beforetoggle events prove both surfaces attempted to open. The oracle requires two independent simultaneously open popovers. The mutant sets actual owned popovers to auto.
- UI-06 S: native history link, present in the original fixture, must reject focus behind open surfaces, and never acquire HTML inert. The mutant removes the entire declarative background mask, including visibility and interactivity. Removing only interactivity while retaining visibility:hidden can be browser-behavior equivalent; we do not mislabel a string assertion as a focus test.
- UI-01 S: trusted browser click on an actual rendered native-control anchor; a document bubble observer records defaultPrevented after the renderer listener and before async RPC settles. The mutant removes synchronous preventDefault while retaining asynchronous dispatch. It does not intercept or fake the dispatch reply.
- SYS-01 D: actual extension-origin IndexedDB in a separate database and a synthetic test-only WeakMap admission. The mutant moves continuation out of native commit and exposes the cut after successful commit but before the separate continuation write; it suspends at that cut. A separate readonly transaction confirms native durability, then the actual writer page closes. A fresh extension page reads the persisted pending queue. Baseline must retain one pending continuation; the mutant loses it. This is real D/page-lifetime failure evidence, not a full browser process crash, natural worker sleep, production ACK authority, or J4 certification.

These four guards do not complete all 12 S/D cases, all 81 acceptance cases, J1–J4, G/U or release acceptance. No private account, paid infrastructure or production release is involved. All protocol data is isolated synthetic offline fixture data.
