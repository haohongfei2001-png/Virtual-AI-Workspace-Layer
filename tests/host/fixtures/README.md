# Native host fixture

`server.mjs` exports `await createHostFixtureServer({ profile: 'LEGACY' })`.
Returned fields are `origin`, `url`, `manifest`, `snapshot()`,
`setPrincipal(id, { accounts })`, and async `close()`.
The server binds only to `127.0.0.1` on a random port.

This is a structure reconstruction under VA-HOST/1.1, **not a real ChatGPT
DOM capture or live protocol certification**. Profiles are `LEGACY`, `MODERN`, `PARTIAL`, and `FAULT`.
LEGACY retains its original page, script, and endpoint behavior.
For the other profiles, `variant` accepts `positive`, `missing`, `conflict`, or
`neighbor`; unrecognized profiles/variants/faults fail explicitly.

The initial native page has two identically named Projects, one without any ID
or href; two ordinary conversation links; separate header, transcript, editor,
and pure history regions. The native application activates the original
controls, loads current Project members, updates browser history, and retains
the actual editor node across SPA navigation. Search opens a native dialog.
Move-to-project exposes a selected No project option only for the explicit NONE
case. UNKNOWN has no selected membership. Current-domain data attributes are
reconstruction-only profile inputs, not live authority or authenticated receipts.
Sending records an offline intent and explicitly does not send a real message.

Authentication is fixed-path `/api/auth/session` and
`/backend-api/accounts/check/v4-2023-04-27`. The former requires the fixture's
HttpOnly cookie and returns `user.id`, `expires`, and a fictional access token.
The latter requires that cookie and token and returns the account roster.
No endpoint returns `verified` or an active-context conclusion. The server
holds the principal/roster; `setPrincipal` exists only in the test process.
A production provider must still establish its own supported personal-context
semantics or separately verify active-context evidence.

The independent oracle is `../expected/legacy.mjs`; it is never imported into
page code or served over HTTP. The server allows only explicit page/assets and
native application endpoints, never arbitrary repository paths. The manifest
contains fixture/oracle SHA-256 hashes; source commit/blob are null because
this fixture is not attributed to a captured host commit.

Run `node --test tests/host/fixtures/server.test.mjs` for the endpoint contract.
Run `node tests/host/fixtures/native-browser-smoke.mjs [report.json]` for actual
headless native handlers and draft checks. Browser tests use the local Chrome
binary, a fresh context, and block page requests outside the fixture origin;
these tests do not contain an extension worker and do not certify worker
network policy or actual MV3 compatibility.

## Additional native profiles

`MODERN` mounts both sidebar and rail, keeps a hidden old body, virtualizes its
visible chat list, and exposes multiple native message ID nodes. Current-object
responses contain original timestamps as well as deliberately missing author
and time fields. `conflict` repeats a message ID with a different original time;
`neighbor` adds a different author's message. Normal current-object and scroll
requests carry `Chatgpt-Account-Id`. The roster contains two contexts and the
selected context is the second, so selecting the roster's first row fails.
`/native/preferences` is application state only, not an authentication proof.

`PARTIAL` holds 1000 conversations but exposes only 25 initial links. Native
scroll loads the next 25 through `/backend-api/conversations`; no hidden DOM or
script contains the other IDs. Page revisions change, so these reads are not a
complete atomic snapshot. The conflict variant overlaps one row at the page
boundary; missing omits some metadata titles. Native search is still available.

`FAULT` has a fixed `fault` option: `auth-failure`, `unsafe-reading`,
`forged-scope`, `csp`, `iframe-destroy`, `stale-response`, `rate-limit`,
`corrupt`, or `unknown-protocol`. Expected restrictions are declared separately
in `../expected/fault.mjs`. `forged-scope` sends an explicitly hostile fabricated
message; it never alters the server's authenticated identity. This is an
adversarial input, not an oracle shortcut. `stale-response` holds the first
conversation route response until the test process calls
`releaseStaleResponses()`; subsequent requests can finish first. This control
has no HTTP endpoint. `setSelectedContext(id)` is also test-process-only.

`variants-server.test.mjs` checks these normal protocol and fault endpoints.
`variants-browser-smoke.mjs` verifies actual headless native DOM/scroll/handler
behavior and selected browser fault effects. It does not certify the production
adapter, actual extension CSP/disable behavior, browser webRequest receipts, or
all 81 acceptance cases. Those remain separate integration tests.
