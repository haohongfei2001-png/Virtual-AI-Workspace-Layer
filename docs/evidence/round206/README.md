# Round206: cloud takeover checkpoint

Base: d1872d9c97504d2994509a3a358f7e77c14c440d. Original PR16 branch only.

## Scope and limits

An opt-in loopback C2 profile connects native conversation GET context headers,
browser document identity, a private current-body association challenge and an
authenticated session roster. Headers are never authentication on their own.
Production remains context-unverified with metadata/send disabled. This is a
conversation-only slice: home/Project C2, first-send operation causality and
strict historical activity are not completed. No private account was accessed.

The independent L review found and drove fixes for trusted incognito source,
synchronous old-grant revocation, overlapping async request races, explicit-exit
revival, whole-operation six-second/abort bounds, and capacity-edge revocation.
Node evidence cannot certify native Chrome event provenance or real ChatGPT.

J1 now has opt-in 81-candidate fixture assertions for nonzero candidate page,
scroll and canonical target focus. Canonical-card page/scroll remains uncovered.
J2/J4 prerequisites remain PARTIAL, not completed journeys. J3 old-date gaps,
81-case acceptance, large-data performance and G/U remain open. Visibility CSS
probe experiments are deliberately not integrated pending a product decision.

## Reproduction

- `node --test $(find tests -name '*.test.mjs' -not -path '*/node_modules/*' | sort)`
- `node tests/host/guard-mutations.runner.mjs --source-commit <base-sha> --report /tmp/guards.json`
- `FREE_CHROME_EXECUTABLE=<chromium> node tests/host/context-package-mv3-browser.mjs /tmp/c2.json`

The guard report records actual source/test hashes; base SHA is provenance, not
a claim that uncommitted code matches the base. Twelve isolated mutations are
L-only; MOCK_IDB is not D, and UI contracts are not S. Dependencies are excluded
from frozen input tree hashes/copies. Source files remain individually hashed.

Cloud Chromium startup is blocked by socket() Operation not permitted, including
an approved normal-environment retry. Local S is NOT_RUN; no bypass was attempted.
The new CI uses a fresh isolated package/profile and loopback host, blocks external
page/worker network, and emits bounded text logs only. CI result is pending.

## Free CI conditions checked

Repository API reported public visibility. GitHub's published billing rules say
standard GitHub-hosted runners are free for public repositories:
https://docs.github.com/en/billing/concepts/product-billing/github-actions

Workflow additionally gates on this exact public repository, uses standard
ubuntu-latest, read-only contents, a 20-minute timeout and no artifact/cache
upload, deployment, secrets or paid services. It is slice evidence, never a
release gate claiming all 81 cases/J1-J4 passed.

Free remains NOT_RELEASE_READY.
