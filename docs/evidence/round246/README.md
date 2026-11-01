# Round246 — dual-tab ingestion advances; isolate unrelated UI revocation

CI41: https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38755605657
Exact source: 17433d25ab3cb15c2ab171a9a66c296ce4618712.

Node passed 4788/4788 contracts and all twelve mutation controls. The journeys job passed all its scoped steps. Durability failed only the formal 10k single-sample step. Prior failures and partial acceptance boundaries remain applicable.

## Actual formal-package evidence

All 171 source/fixture hashes independently match the exact commit. Source, fixtures and manifest remained unchanged. Both initial tabs reached the required dual surfaces within their original 30-second limits: 27521.95ms and 23066.22ms. Native tail search and navigation then passed. The failure moved to `return-workspace-local-search`, where the original 30-second surface-readiness limit expired before any full admitted-ID audit or measurement.

The report contains 2751 UI RPC observations. All 22 UI renewals succeeded. Near the route transition, tab 0 receives `ui-authority-invalidated`, tab 1 joins its new route, and tab 0 also rejoins. The final waiting samples show mounted frames and two open surfaces while workspace content remains unready, then final frame teardown. Failure-time inventory cannot read a unique remaining frame. These facts do not establish complete admission, a stable revision, performance timings, or a unique cause for the entire return failure.

## Independently reproducible product defect

A real Host UI owner and grant fixture with two tabs in the same scope reproduces an isolation defect: while tab 1 validates its own grant across an awaited frame lookup, revoking only tab 2's parent document causes tab 1 to reject with `ui-authority-invalidated`. A fresh call with the same tab 1 grant succeeds; tab 2 is correctly revoked. The global revocation epoch incorrectly couples unrelated authority lifetimes. The reproduction retains passing own-parent, own-role, own-mount, own-scope and global-revocation controls.

The candidate retains a global generation only for global revocation. Other revocations invalidate matching bounded in-flight requests, while synchronous final grant/mount/scope checks reject replacement after asynchronous browser validation. Status rechecks both roles together. Cleanup from an obsolete request cannot revoke a fresh same-document grant; genuine current-grant expiry cleanup remains.

The new 71-case group has 38 passing and 33 failing checks against the original production files. The candidate passes 128 focused and 137 adjacent contracts, with independent frozen-byte review passing the original seven scenarios and three additional replacement/cleanup combinations. The writer integrated 77 targeted UI/CI-partition checks successfully. Actual CI verification remains required. No deadline, retry allowance, grant lifetime, snapshot CAS or index-completeness requirement is relaxed.

The earlier 1k sample remains a single sample with UNKNOWN membership. Full SYS04/SYS05, immediate cold support, all Free acceptance criteria and release readiness remain open.
