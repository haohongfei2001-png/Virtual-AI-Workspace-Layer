# UI-10 offline matrix test support

These test-only helpers prepare the remaining Canonical81 UI-10 inputs. They
neither alter production code nor replace the approved v2.7 visual/interaction
oracle. They do not launch a browser or expand the supported browser set.

Run the lightweight contracts:

    node --test tests/host/ui10-matrix-contract.test.mjs tests/host/ui10-package-sequence.test.mjs tests/host/fixtures/ui10-conversation-title.test.mjs

`ui10Cases()` produces 48 isolated cases: LEGACY/MODERN/PARTIAL × 1440/420px ×
light/dark × ordinary/long Chinese × 1000/520px height. These are explicit test
samples, not new responsive breakpoints. FAULT is not counted as a positive
supported profile. The browser axis is the existing Chrome-family MV3 runner; the executable is
selected by FREE_CHROME_EXECUTABLE (Linux default /usr/bin/chromium), and its
actual version is recorded. No Firefox, Safari or Edge support is inferred. All cases start at `NOT_RUN`.

`configureUi10Environment()` changes only the browser viewport and color media.
The native fixture must supply `fixtureTitle` through its own data before the
package observes it; injecting a fake title into the extension frame is not
native evidence. The candidate `ui10-package-matrix-browser.mjs` now supplies the title through
the existing native New project dialog and Create handler for LEGACY.
MODERN/PARTIAL use the explicit ui10ConversationTitle option on the fixture
before native HTML/routes/detail responses are built. It changes only the
existing current C title in the same fixture map, preserving IDs and membership.
Default fixtures are unchanged; non-positive variants, journeys, other profiles
and invalid titles are rejected. MODERN therefore remains on /c with its normal
native detail GET/context proof rather than navigating to an unbound /g route. Native create validation (200 characters) is unchanged. The runner
waits for the native title and its visible packaged workspace projection.
Its actual browser execution remains NOT_RUN. `exerciseUi10HeightChange()` retains
the same page and calls the supplied continuity observer before/reduced/after;
any failure aborts without a recovery reload. Resize is a keyboard-height proxy,
not evidence of a physical keyboard, visualViewport behavior or physical IME.

`observeUi10Shell()` is a read-only Playwright helper carrying the existing
`frame-shell-layout-browser.mjs` shell geometry checks, including its unchanged
1px tolerances. Its result is SHELL_GEOMETRY_ONLY. Deterministic negative cases
kill overflow/scroll/frame-over-close mutations. This does not measure a font,
prove accessibility, validate native actions, or certify complete v2.7 behavior.

The packaged candidate retains original textarea/File/draft/document identity,
zero send-intent, exact one native create for LEGACY and none for other profiles,
before/reduced/restored sequencing,
source/script/build hashes, and blocked worker external network. It opens one
fresh context for LEGACY and one per title mode for MODERN/PARTIAL (five
contexts total), not one per matrix cell. Every height sequence stays on the
same document. Each actual frame records matchMedia and computed foreground,
background and color-scheme, traversing open shadows with frame locators.
These colors are recorded measurements, not a new visual baseline. MODERN uses explicit
offlineContext and starts on a real fixture conversation; PARTIAL starts at
its own known first conversation. Missing mounting/long-title projection or
geometry fails, rather than counting NATIVE_ONLY as success.

After integration, the explicit browser command is:

    node tests/host/ui10-package-matrix-browser.mjs /tmp/ui10-report.json

An optional third argument selects LEGACY, MODERN, or PARTIAL. No local browser
run was performed during preparation. Screenshots are observations only, not
goldens. A failed profile/title run invalidates its previously observed cell summaries.
Final test-hash read exceptions produce a saved FAIL report and invalidate
previous cells rather than dropping the report.

Broader UI-10 acceptance must additionally retain J3's original document/editor/
file-object/draft continuity, host action counters, frame readiness, worker
network isolation, and source/script/build hash checks. It must measure the
native fixture content, preserve original focus/AX and overlay surrender
assertions, and reject normal profiles reduced to UNKNOWN/NATIVE_ONLY.

Original references (not new requirements):
- `docs/specs/chatgpt-host/VAIWL_OFFLINE_ACCEPTANCE.md` UI-10 and §5.3
- `docs/INTERACTION_SPEC.md` §§1–3 and §8
- `tests/host/frame-shell-layout-browser.mjs` bounded/sample geometry
- `tests/host/frame-theme-menu-layout-browser.mjs` long-Chinese fixture text
- `tests/host/j3-package-journey.mjs` existing native ownership and true zoom

The existing J3 `chrome.tabs.setZoom/getZoom(2)` result is retained historical
coverage, not repeated, downgraded to untested, or promoted to these new cells.
CSS zoom/font scale are not substitutes. Matrix cases deliberately use zoom 1.
Approved v2.7 + current Free screenshots at matching dimensions remain needed
for all required views. No candidate-generated goldens or new visual thresholds
are introduced. Full v2.7 acceptance is NOT_ESTABLISHED; native matrix, physical
keyboard/IME, and real account evidence remain NOT_RUN.
