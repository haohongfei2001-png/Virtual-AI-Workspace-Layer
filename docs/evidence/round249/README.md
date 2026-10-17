# Round249 — checked format change, no measured 10k improvement

CI44: https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38775970646
Exact source:486693b17566f3f09c9f65bc3add4595fd065bb2.

Node passes4890/4892 with zero skip/cancellation. The two failures are older composition expectations that first Host admission leaves rootrevision1 and that the subsequent first header must perform native-index-build/native-index. The reviewed test-only correction instead requires VERSION_INDEX/revision2 before the broker read, keeps sourceRevision1, and verifies read/reopen/duplicate do not advance it. All original title, project count, membership, admission, scope-isolation and forged-authority assertions remain. The two files pass9/9; independent static review confirms exact, rather than widened, assertions. The downstream mutation step was skipped because Node failed.

All journey steps pass their scoped gates. Durability/compatibility passes all preceding slices; formal10k fails first-tab preparation at its original30s limit. All171 source/fixture hashes match the exact commit and no source/fixture/manifest changed during the run.

The real root is now VERSION_INDEX, revision187, inventory9427 refs/100 projects, one active source atsourceRevision186. This establishes that early storage migration ran, but does not establish improved ingestion throughput: the previous run observed9741 refs at its failure. Such single failure-time inventories are neither a controlled performance comparison nor complete admitted-index audits. The failure-time snapshot has386 RPCs; the final trace has387 successful RPCs (379 preparing VIEW,2 JOIN,2 RESUME,4 RENEW), without a ready projection; both frames remain attached. No complete admission audit or timing was obtained.

Further structural performance guesses are paused. Any next performance change requires bounded actual phase evidence with explicit distinctions between transaction work, shared-state work, DOM/packet production and worker/transport scheduling. FullFree/81/SYS04/SYS05,100k,p95 and release readiness remain incomplete.

## One bounded phase diagnostic candidate

The next single10k slot selects the existing explicitly instrumented package copy. Original package/source hashes and every changed copy byte are checked; default product execution remains unchanged. It retains the5-minute job fault limit, original30s preparation/6s RPC and the strict formal measurement gate, so diagnostic results cannot turn SYS04 green.

The reviewed two-file trace extension records monotonic phase offsets in existing native transaction terminal events: transaction creation, validated root, loaded partial, reducer return, shared registration call, publish callback and synchronous native-write queue return. Final transaction drain includes mixed native/shared/GC work; none of these intervals is labeled exclusive CPU or disk cost. The first structural migration has separate start/end observations. Surface-only scan, fingerprint/split and emit-await counters are tied to the actual pass, with at most8 intermediate summaries and the existing final boundary. Old callbacks cannot contribute to a newer pass. Missing phases are null and truncated trace history is explicit. Original1024-event/128KiB limits remain.

Independent18 tests pass, including actual source anchors/parse/build-copy hash verification, exception behavior, idle/body/new-pass separation and wall-clock jumps; integrated trace/workflow24 pass. Patch SHA256:63cc928c06a9c8a0e09e3d90da602fa9a95d561defb3c1479d51c10d553f1b3e. This is a measurement candidate, not a new product performance fix.

## Independent non-scale SYS05 candidate

A new test-only native assistant stream, real accepted user POST, authenticated ACK-only readback and simultaneous native title change exercise an existing Free acceptance gap independently of10k readiness. Only the default uninstrumented formal-package correctness mode runs in this CI. It checks actual old historical event evidence, its incomplete-coverage provisional older placement, the new immutable ACK's provisional recent placement, and the exact current reference moving into the normal visible recent UNKNOWN list. A pre-existing current-context row cannot satisfy the UI transition. Its original authenticated admission timestamp precedes durable commit, so admission-to-visible-UI below1s is a conservative single-sample upper bound, never precise commit latency or p95.

The explicitly modeled assistant row and lineage agree between the native DOM and metadata. No user acceptance ID, author, status or original-send timestamp is fabricated. Production decoder/readback/correlator and activity projector regressions close two independently found invalid fixture/oracle assumptions before browser execution. The modern package keeps exact loopback permissions/CSP and ordinary route interception; historical compatibility's special network proxy is not used.

Independent43 lightweight tests pass. The complete candidate SHA256 is d320a9ca525e22580f4574335ed24fd445268f82bf30ce3901f38e15f01ae781 (v4 differs from reviewed v3 only by precise documentation of fixture-owned assistant/lineage). Integrated77 tests pass. Browser S remains NOT_RUN until the actual CI; forced queue saturation/gap recovery, full internal work counts, large-scale/profile matrix and completeSYS05 remain unestablished. The separate runtime work-observer mode is retained as an explicitly instrumented diagnostic candidate and is not executed in this run.
