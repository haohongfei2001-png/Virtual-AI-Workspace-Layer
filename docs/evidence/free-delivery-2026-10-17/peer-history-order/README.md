# Peer C2 history-order diagnostic handoff

This is a **diagnostic-only collaboration change**, initially pinned to failed Free
`e1b0bfd6ae76a5aa5e6948edc71b0487a1a371af`, then fast-forwarded and retested on
`f29443acfa8157fd5b314367cec41952ba96f261`. The owner and all pre-existing edited helper paths are unchanged between those bases.
This collaboration diff changes no production owner,
permissions, timing limits, workflow, J4 acceptance assertion, Free branch or main.
It does not repair or establish the cause of the intermittent J4 failure.
Local Codex remains the sole Free integration writer.

## Why this slice

[CI 39083660931, J4 job 117545634719](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/39083660931/job/117545634719)
failed after ten passing steps. At the first peer native hop, the genuine
C444 native GET returned HTTP 200 at `2026-10-18T00:44:26.953Z`, but no fresh
current grant/frame appeared before the original 15-second timeout. The same
native document and editor survived. A later, separate lifecycle-instrumented
run completed 23 steps; it is diagnostic only and does not supersede the FAIL.
That successful run records history→GET→prepared→receipt on both peer hops.
The failed formal run did not record the corresponding worker callback order.

The current owner retains a pending GET across history invalidation only when
an old receipt already identifies a different route, the request is still
unprepared, and exact document, epoch, target and original deadline checks hold.
After worker memory loss, no prior receipt may exist. A synthetic order matrix
makes this particular boundary directly reproducible without running Chrome.

## Run from repository root

```sh
node tests/host/peer-c2-history-order-diagnostic.mjs
node --test tests/host/peer-c2-history-order.test.mjs
```

The executable prints JSON and modifies no repository files. It imports the
actual current `createBrowserRequestContext` and reports its SHA-256. Browser
events, browser metadata lookup, body association and clock are explicit test
doubles. This is **L**, not MV3, authenticated identity, UiGrant or actual VIEW
evidence. The fixed loopback origin is never contacted.

The six baseline cells are:

| Old receipt | Event delivery | First metadata snapshot | New owner receipt |
|---|---|---|---|
| absent | history→GET | current route | observed |
| absent | GET→history | current route, resolved later | absent, fail-closed |
| absent | GET→history | old route, resolved later | absent, fail-closed |
| present | history→GET | current route | observed |
| present | GET→history | current route, resolved later | observed |
| present | GET→history | old route, resolved later | observed |

The regression names explicitly say **characterization**. They record the
current contract, not a requirement to preserve a future liveness defect. A
legitimate owner revision must replace any affected characterization with its
new safety proof; changing the expected result alone proves no repair.

Additional cases preserve rejection after wrong history document/target/frame/
lifecycle, second history, epoch invalidation, original 6000 ms expiry, changed
final document/route, conflicting context, unsuccessful/cached response and
owner stop. No test removes receipt checks or renews authorization.

## Failure-inspection correction

The existing post-failure helper used one request-shaped schema for three
private maps. Documents do not have `accepted`; the resulting false was not a
rejection. `document.reason` is the last invalidation marker and can remain
`context-selection-pending` after a receipt has been installed.

The corrected read-only helper:

- Separates document and request schemas. `accepted` remains explicitly a
  preparation observation, never a success label for closed requests.
- Calls the historical marker `lastInvalidationReason` and reports bounded
  request↔document / receipt↔document epoch and document equality booleans.
- Uses own data descriptors and builtin Map iteration; no field getter,
  application owner method, refresh, retry, navigation or mutation is invoked
  for the ordinary private records constructed by the production owner. This
  helper is not a general-purpose sanitizer for injected Proxy records.
- Carries a unique selected top-world `current.binding.browserDocumentId`
  privately between the two inspectors, then emits only equality booleans.
  The nearest lexical current binding wins even when null; an outer variable
  with the same name cannot supply a substitute identity.
  It never emits that identifier, a scope, context, credential or body.
- Reports correlation **UNAVAILABLE** if the current binding is absent,
  inspection is incomplete (including context-list overflow), or multiple realms exist. CDP frame IDs, same URL,
  learned identity and map order are never substitutes. In the recorded formal
  failure, `current=null` and multiple realms mean correlation stays unavailable.
- Labels the snapshot non-atomic and not authority. Equality does not certify
  currentness, freshness, body proof, identity authentication, grant or VIEW.
- Runs only at the existing post-verdict failure inspection call. Original
  failure, runtime package, capture deadlines and acceptance gates remain.

Both helper files are already included in the J3/J4 fixture hash manifests;
there is no new untracked runner dependency or package instrumentation.

## Narrow next investigation

Before proposing a production fix, correlate the actual failing peer's browser
document and request with onSendHeaders, trusted history delivery, preparation,
receipt creation and READY/PENDING delivery. The six-cell matrix alone does not
show that GET→history occurred in this CI failure. It may represent an intentional
safety boundary. Do not delete `r.document.receipt`, accept cached scope, extend a
deadline, issue a replacement native GET automatically, or infer a receipt from
HTTP 200/page claims. A proposed limited retention must first prove it belongs to
the same legitimate document/epoch/navigation and retain all negative controls.

## Verification

See `validation.json` for exact commands, counts and SHA-256 inputs; `matrix.json`
contains the final observed six-cell result. Focused Node tests and real Node
inspector tests are not Chrome/J4/Free acceptance. No browser or CI was rerun for
this collaboration slice. Existing CI failures remain unchanged.
