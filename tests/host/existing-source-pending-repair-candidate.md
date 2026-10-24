## Development probe feasibility hold (after CI54)

The automatic browser schedule is withdrawn, not accepted or skipped as PASS.
CI53 and CI54 failed before their second native send; both original reports are
retained. Real-owner L studies show a normal independent surface scan advances
the native source witness both after rebind and in the same worker. Subsequent
Evidence repair therefore safely retires the original operation as
`needs-revalidation/source-changed`, as permitted by FINAL §8.4.4. This does not
satisfy this probe’s stricter unchanged-native-witness/source-revoked branch.
That branch and full SYS02 remain NOT_ESTABLISHED; no product defect is inferred.

CI now invokes only the existing non-browser plan writer and checks explicit
NOT_RUN/NOT_ESTABLISHED/NOT_RELEASE_READY fields. The executable probe and all
strict assertions below remain available for future independently justified
development. A green metadata step is never S acceptance. No prior valid
Canonical gate was removed. See docs/evidence/round259.

# Existing-source pending repair S slice

Candidate only. Targeted L/oracle/callback checks are not S. No browser result is
provided by this change. Full SYS-02, J4, supported-profile matrices, G/U and
Free/release acceptance remain unestablished.

## Execution

The default command only writes a NOT_RUN plan. It imports neither Playwright nor
starts a fixture, network guard or Chrome process:

```
node --test tests/host/existing-source-pending-repair.test.mjs
node tests/host/existing-source-pending-repair-journey.mjs /tmp/pending-repair-plan.json
```

When scheduled separately in an already authorized isolated environment with its
existing locked Playwright/Chrome dependencies:

```
FREE_SOURCE_COMMIT=$(git rev-parse HEAD) node tests/host/existing-source-pending-repair-journey.mjs /tmp/pending-repair-S.json --execute-browser
```

Original J4 and other established browser slices are unchanged; automatic CI
records this unresolved development plan only.
FREE_SOURCE_COMMIT records the integrated source; FREE_DIRTY_PATCH_HASH may carry
an independently measured dirty diff hash. The runner does not infer repository
cleanliness. Its runner-content hash is separately labeled, not a dirty diff.

## Exact two-send input and fault

The unchanged MODERN/J4 native fixture and formal package use offlineContext,
offlineExistingSend and offlineHistory. Actual account-menu selection establishes
Personal while a peer retains Team. Existing human-asset backup bytes are imported
through the real preview/confirmation UI; inspection checks preview is read-only.

1. Send once without rename. Release the existing fixture response hold while the
   same worker and intent remain alive. Require one actual authenticated ACK and
   its persisted source. The title is still `Membership not loaded`.
2. Return to the real workspace and capture its current scope/ref/UI grant proof
   before yielding to native controls. Keep that proof only for later inequality
   comparisons, never as authority to replay a request. Send once with rename. The fixture's fixed title now represents its first real
   native delta. The unchanged production continuation call/entry breakpoint
   must fire before the Evidence writer opens its transaction. Require the
   atomic native delta and one genuine pending v2 continuation, whose ACK source
   already existed before this send. No second-message ACK is yet committed.
3. While paused, reuse the existing checksum-only fault against the existing
   valid Evidence root. No payload, shadow, source, receipt or grant is inserted.
   Then stop the actual worker and require a subsequent stopped lifecycle event.
4. Reload normally. A fresh actual UI/scope grant and production recovery-status
   response must exist; every Evidence root/piece/index/operation byte remains as
   after the fault, and the same pending payload survives. Click the real
   `修复活跃度记录` button. Preserve the same draft node/value and human-asset hash.
5. Repair only notifies views; a normal same-URL reload and new grant trigger the
   existing refresh drain. The exact operation becomes needs-revalidation with
   reason source-revoked. Its native source must still match the original live
   nativeWitness; source-changed is a failure, not an alternative success.
6. A second normal rebind preserves the summary and old witness bytes, adds no
   ACK for the interrupted message, keeps Team isolated and leaves exactly two
   real native sends. Fresh legitimate original-time history is allowed; it is
   not a replay of the retired pending ACK.

## Boundaries and falsifiability

- Reuses the existing same-package, real debugger, checksum-fault and UI repair
  paths. No product, fixture or original 23-step J4 source is edited.
- The independent oracle never imports a production reducer, admission or
  continuation transition to compute its expected answer. Mock callback tests
  verify mechanics only. They cannot certify real Chrome timing or durability.
- Actual UI replies are passively observed. Original arguments, receiver,
  Promise, errors and response are preserved, but wrapper identity/overhead
  change. Opaque grant IDs stay in frame RAM and are not reported. No business
  RPC, grant, owner callback, native fact or source is injected.
- Native-source profile/version, generation, sourceRevision and semantic
  fingerprint are checked while paused, while corrupt, after repair and after
  terminal recovery. If ordinary remounting changes them, this narrow case fails
  rather than manufacturing a stable witness or weakening its expected reason.
- Original 6-second RPC, 30-second/12-GET read window, three attempts and 20-second
  debugger lifetime remain. Waiting for the existing persisted window to expire
  does not clear or reset its budget. Startup is an explicit worker-ready
  functional precondition, not immediate-cold evidence.
- The existing disposable Chrome reject-proxy guard and exact-origin packaged
  CSP cover the test browser/worker URL-network policy. This is not a system or
  OS firewall and does not touch a user profile or computer configuration.
- Missing initial ACK source, Evidence-committed/completion-interrupted,
  quota/capacity/retention/GC stress, fresh successor sends, full J4/profile
  combinations, physical crashes/devices, live ChatGPT and PAIA are not covered.
- Cleanup phases, including network-guard snapshot and close, run independently
  with a six-second deadline each and retain the original failure. Setup failure
  also reaches report writing. Source, fixture and build hashes are checked after
  shutdown. A cleanup/integrity error prevents acceptance; report-write failure
  gives a nonzero CLI exit and bounded stderr. Neither retries browser work nor
  widens product budgets.
- On failure, an already-open inspector gets one read-only attempt with an
  independent one-second absolute deadline. It does not open/focus a page. The
  report keeps only bounded native-witness/source/continuation scalar summaries,
  including the original reason unchanged; no body, full payload or grant.
  Unavailable/late inspection cannot replace the original error or stop cleanup.
- Error collections cap at 16 entries, messages at 512 UTF-8 bytes and stacks at
  1024 bytes, with dropped/truncated markers and safe accessor reads. Assertion
  diffs are omitted so values such as grants or pending payloads cannot leak
  through failed comparisons. Only exact fixed assertion labels and phase enums
  may identify the failing runner checkpoint. Final
  authenticated-read and worker-lifecycle summaries cap at 64 entries with
  truncation markers. These diagnostics are not acceptance evidence.

## CI53 pre-second-send harness correction

CI53 remains a real S failure before its second send: only the first two steps
passed, native counters were model=2/send-intent=1 and no pending continuation
existed. The bounded report cannot distinguish the exact assertion site.
Native surface suspension hides popovers; it does not necessarily detach their
frames. A same-script L counterexample shows that losing the frame before the old
late grant read fails this runner precondition, not that CI53 actually detached.
The corrected runner reads current scope/ref/grants in the real workspace before
native surrender. It adds no native send or business RPC, preserves both fresh
grant comparisons, and records only fixed phase/assertion labels. Real S must be
rerun separately; the L result does not certify repair or worker durability.
