# View corruption isolation — verified fix

After restoring the pinned 5997ec0 source and running the original 116 Node and 48 DOM cases, a separate inspection found that corrupt `b23_views` caused `read()` to abort despite intact `b23_states`. This made intact human titles and Workspaces inaccessible.

Two valid regression cases (checksum corruption and checksum-valid invalid view schema) were run BEFORE changing the implementation: both failed, with `corrupt-record` / `invalid-view`. An earlier helper incorrectly queried the unnormalized A.key; that harness error is separately retained and is NOT evidence of the product defect.

Minimal fix: validate Workspace state as strictly as before; for only corrupt view payloads return null view plus CORRUPT_VIEW diagnostics, without deleting or overwriting any persisted record. The editor discloses the condition. Ordinary state corruption, transaction errors, authority/revocation checks and view write CAS remain unchanged. This is failure isolation, not a claim to reconstruct damaged preferences or a new recovery UI.

The unchanged two Node assertions then passed. Complete regression after the fix: 118/118 Node (including all prior 116) and 49/49 real Chromium DOM cases (all original 48 plus P11). The new driver imports the original browser suite rather than rewriting it. Node IDB remains mock; Chromium uses explicit opaque/fake sender/mock IDB; native IDB/MV3 remain BLOCKED. Raw records are being archived with final delivery.

Only this PR branch is changed. No Mac, real account, other repository, paid service or GitHub Actions.
