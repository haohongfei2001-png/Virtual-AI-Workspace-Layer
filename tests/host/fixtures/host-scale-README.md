# Host SYS-04 scale reconstruction

This is an application-owned LEGACY loopback reconstruction, not real ChatGPT,
a production DB seed, or completed SYS-04/F1 evidence. All files are test-only.
The production Host package and its real auth/bind/observation/UI paths are used
when the browser runner is explicitly enabled. No product source or RPC timeout
is modified.

## Cheap checks

From the repository root:

    node --test tests/host/host-scale-world.test.mjs tests/host/host-scale-server.test.mjs tests/host/host-scale-cleanup.test.mjs tests/host/host-scale-audit.test.mjs tests/host/isolated-browser-cleanup.test.mjs
    node tests/host/host-scale-package-browser.mjs /tmp/host-scale-plan.json

The second command only records NOT_RUN for all 18 combinations:
1k/10k/100k × project-mixed/none-heavy/single-project × renderer 1x/4x.
It does not load Playwright, build a package, start Chrome, or allocate 100k rows.
The endpoint checks allocate only 1k rows per distribution.

## Explicit browser run, after other functional workloads finish

    HOST_SCALE_RUN=1 HOST_SCALE_SIZE=1000 HOST_SCALE_DISTRIBUTION=project-mixed HOST_SCALE_CPU_RATE=1 node tests/host/host-scale-package-browser.mjs /tmp/host-scale-1k-mixed-1x.json

Repeat with the exact matrix values only when heavy runs are scheduled. Chrome
and the existing tests/b1/tooling Playwright installation must already be present.
FREE_CHROME_EXECUTABLE may select the existing supported Chrome executable.
Use separate report filenames; the runner intentionally executes one scenario,
not an automatic 18-case heavy sweep. No live account or daily profile is used.
The verified offline package retains its exact fixture-origin connect-src policy
for the worker and loopback-only host permissions; the normal context route guard
restricts page requests. No proxy or OS network settings are changed.

The native service contains exactly the requested rows and exposes original
history links; project pages expose native membership, and native search can
reach the last title. Search returns at most 28 rows. Native ungrouped service
truth is not an extension NONE grant: the real Host must observe its selected
native move-menu semantics. The runner does not prepopulate any extension store,
create fake scope/admission/ACK fields, or replace adapter methods. All-history
DOM is an intentional reconstruction workload, not a live DOM performance claim.

The runner opens both production surfaces in two tabs, records initial-surface
latency, bounded pass-through RPC metadata and real native tail search/navigation
samples, then verifies unchanged package/source/fixture hashes. Every cleanup step
is attempted even after an earlier failure, and the report is still written. Its
owned temporary package/profile directory is removed after browser closure; if
closure fails without confirmation, the directory is retained and explicitly
reported as FAIL_CLEANUP rather than deleting a possibly live profile. Native search
samples are named as such and are not extension local-search or p95 acceptance.
It does not retain full RPC pages or duplicate a 100k index in its instrumentation.
Renderer 4x is applied only to the native page target: it does not certify worker,
other renderer targets, or a physical weak device. A 30s DOM readiness diagnostic
wait never changes the production 6s RPC deadline.

## Status and remaining evidence

Browser execution has NOT_RUN at preparation time. A successful implemented
journey emits PARTIAL_SYS04_NOT_ACCEPTED and exit code 2, not PASS. Startup failure
is NOT_RUN_BROWSER_OR_PACKAGE_STARTUP; a post-launch assertion failure is FAIL.
The native service size and DOM link count are never called the admitted Host
index size. A post-measurement audit now uses the production NativeRepository.page
reader with a fixed revision, bounded pages (default 500, maximum 5000), distinct
reference IDs and an exact expected-ID-set check. Dependency project rows do not
inflate counts. A final version check detects changes after the last page. Revision
changes report UNSTABLE_REVISION; incomplete/foreign/duplicate IDs fail the audit.
The audit executes only in the current, attached, exact-extension workspace frame
and rejects replacement during the read. Dynamic imports never run in an MV3
service worker; no test page or extra web-accessible resource is added. It selects
an existing scope root, refuses schema creation/upgrades
and forces every repository transaction readonly. Its scope selector is never sent
to the broker and provides no write grant. It does not call store.count or copy a
seed into storage. No production code is changed.

For single-project, the runner additionally activates the original project link,
waits for the real project route/member surface and audits every reference's
PROJECT state and exact projectId. An empty card, UNKNOWN members, or false NONE
cannot pass this check. Other distributions report fixture nativeNone truth,
actually admitted NONE and UNKNOWN separately; history links do not grant NONE.
The audit takes one bounded-version snapshot, without assuming ingestion has
finished. A partial or unstable snapshot fails the runner and remains visible in
the report; it never extends RPC timeouts or silently lowers N. Existing initial
and native-search samples are labeled NATIVE_WORLD_NOT_PROVEN_ADMITTED_AT_SAMPLE
or named native-only: later cardinality does not retroactively certify them. Actual admitted 1k/10k/100k cardinality, observed membership by native
routes, full local search/pagination/tail reachability, shared-index ownership and
bounded dual-surface DTOs still need evidence. First-schema preparing may be
observed in the RPC trace, but that alone does not prove no false empty library.

Preserve the original targets: navigation p95 <150ms; search first screen <300ms;
qualified activity evidence to UI <1000ms; foreground 30s/12 requests/2 retries;
production RPC 6000ms. The runner records samples but does not certify these
metrics, reset failure baselines, or change thresholds. Send/title/token-storm
SYS-05, worker restart/cross-tab shared budgets, physical weak device, all other
supported profiles, and real G/U are NOT_RUN. Repeated timing samples, worker
counts/read bytes, and an actual successful stored-index audit run are still required
before closing SYS-04/F1. Existing synthetic scale reports cannot fill these gaps.

## Next natural-observation workload (not implemented or run)

If initial cursor-drain admission is incomplete, extend the application-owned history view with user-driven paged/virtualized
scrolling. Each next-page action must reveal genuine native links from the
service; the unchanged Host discovery/admission pipeline must ingest them. Then
visit native project pages for grouped membership and actual selected move menus
for explicit NONE, retaining UNKNOWN for unobserved membership. Do not synthesize
extension observations, grants, authoritative membership, or DB rows. Assert the
admitted distinct IDs using a read-only post-measurement store audit against an
independent oracle; reaching the native page tail is insufficient. Only after
that count is established should warmed index timing/shared-owner measurements
claim the corresponding 1k/10k/100k Host scale. Keep ingestion time and measured
steady-state time separate, and keep partial admission a reported gap.
