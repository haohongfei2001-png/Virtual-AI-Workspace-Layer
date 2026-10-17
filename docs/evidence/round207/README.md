# Round207: explicit historical activity and immediate-return focus

Base: 9279d1c2f597da2f4631624fe043229b413159e7. Original PR16 branch.

- The loopback-only historical grammar authenticates current-object readback,
  explicit self author, committed original send, exact original time/precision,
  durable message identity and lineage. A private request-identity gate admits
  codec2 historical events through the existing evidence repository. Codec1 ACK
  hints are unchanged. Source expiry cannot erase an established original send;
  absence of complete coverage still leaves the projected activity provisional.
- Conflicting original times remain contested instead of overwriting earlier
  evidence. Same message through a changed view lineage does not create a new
  event. Serialized/copied grants, wrong scopes, old body/epoch, late responses,
  cancellation and false guards are rejected. The independent audit has 33
  passing L/MOCK_IDB checks; that is not real D/S/G evidence.
- The actual J1 failure from CI 38664192347 is retained under Round206. A trusted
  return arriving before candidate commit formerly failed to focus its originating
  frame. The minimal fix stores the existing surface intent guard and focuses
  only after the identity/ACK/commit checks if that intent remains current.
  New native intent and denied focus cannot claim permission. The original
  browser focus assertion is unchanged; its rerun is pending.
- Browser test-only database inspection now runs in an already existing
  extension iframe, not an unsupported dynamic import inside the service worker.
  A separate immediate-load C2 case preserves the unresolved cold-start failure;
  warm-worker UI mounting alone is not proof of the intended scope or cold start.
- J3 now tests native old-window navigation using authenticated historical
  ingestion, without seeding event data or forcing disabled controls. It uses
  Linux-compatible tmpdir and the same fresh actual package. Browser outcome
  pending. No full 81-case/J1-J4, real ChatGPT or release claim.
- First-send work was split out rather than included with known join/request
  budget blockers. Production remains disabled; no private account or deployment.

Integrated focused Node: 111/111 PASS. Full bounded-concurrency result is recorded
in STATUS after completion. A prior unbounded concurrent full run had seven
file-process failures without an assertion diagnostic; the failure log was kept
locally. It is not attributed to a confirmed product bug or claimed fixed.

The isolated visibility experiment passed before/after focus/AX/popover and
three restored animation-frame checks. It does not prove absence of all transient
paint/AX observations. No production visibility/mask modification is included.

Free remains NOT_RELEASE_READY.
