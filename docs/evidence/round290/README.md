# Round290 — Authentication source ABA fencing

Base7f14432, normally pushed and GitHub API confirmed DraftPR16/base unchanged. Independent actual ScopeAuthority→observation→provider→metadata reader tests exposed7 stale acceptance failures (2same-source controls passed): source transitions A→B→A revived old in-flight reads and saved readback callbacks, including transitions missed between guard samples.

ScopeAuthority now owns a RAM-only frozen source token per entry. Every authenticated transport change replaces it; same-source receipt renewal preserves it. No grant/schema/wire field changes. Observation context and guard compare token identity; metadata readback's private WeakMap retains and compares that same token before and after work. Expiry/revoke/new binding still invalidate. Existing source labels, principal/context/profile, body/route/document/producer and original budgets remain required. Production always uses the frozen real authority providing sourceFor; optional access only preserves existing test double compatibility. Independent review found no wire/storage propagation or production bypass.

Final independent9/9PASS. Full Node5701/5701PASS, zero skipped, complete compressed output retained. Actual headless packaged MV3 transport-renewal fixture PASS on this source: trusted foreground transitions verify both directions, original frames/mount/editor/draft preserved and only1HELLO/REFRESH. This browser journey verifies continuity; ABA rejection itself is independently proven by the real-owner Node tests, not claimed as browser ABA coverage. Source/fixture hashes stable and cleanup fulfilled. No real account/native writes.

Remaining complete81/profile, cold/reenable reliability,100k and realG/U gates remain open. Free NOT_RELEASE_READY.
