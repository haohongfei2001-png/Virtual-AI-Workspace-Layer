# Native host fixture

`server.mjs` exports `await createHostFixtureServer({ profile: 'LEGACY' })`.
Returned fields are `origin`, `url`, `manifest`, `snapshot()`,
`setPrincipal(id, { accounts })`, and async `close()`.
The server binds only to `127.0.0.1` on a random port.

This is a structure reconstruction under VA-HOST/1.1, **not a real ChatGPT
DOM capture or live protocol certification**. Only LEGACY is implemented.
MODERN, PARTIAL and FAULT are not yet supported and fail explicitly.

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
