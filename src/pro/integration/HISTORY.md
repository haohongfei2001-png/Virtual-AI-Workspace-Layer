# R1 durable history and long-use maintenance

This is an implementation note for the existing VAIWL-PRO/1.0 integration. DB4, the six ports, overlay asset schema, same-transaction source/authority checks and data-only backup contract remain in place.

## Why this extension is necessary

The original root stored every lifetime operation ID in one array capped at 10,000, and every read loaded all associated journals. The next edit would therefore fail even when the actual user assets were small. Billing similarly retained every completed job in its 1,000-job active root. Neither limit represented simultaneous work or asset size.

The new implementation retains every original journal and inverse. It separates a bounded active index from immutable history segments, so lifetime operation count does not consume the active index indefinitely. It does not silently delete undo history, historical charges, hard exclusions or user assets.

## Overlay storage

`vaiwl-pro-root/1` is still readable. At the next commit after 512 indexed operations, the existing transaction writes an immutable history segment to `b23_checkpoints`, then writes `vaiwl-pro-root/2` with a bounded active index. A legacy root already containing up to 10,000 entries is converted in one atomic commit. There is no database upgrade and no separate database.

An un-repaired segmented root requires `minimumReader: vaiwl-pro-storage/2`. A root that has been recovered requires `vaiwl-pro-storage/3`, which additionally fences every future writer into maintaining its recovery high-water marker. The root's structural `/1` or `/2` codec remains explicit, and subsequent rollover preserves the stronger reader requirement. Each segment contains the complete checkpoint at its boundary, ordered operation IDs, original receipt digests, actor classifications, cumulative visible-operation count and a checksum-linked predecessor. Original journal rows remain at their existing keys. Later undo changes only the old receipt's status; its original patch, inverse, fingerprint and source versions remain sealed.

Normal reads validate the active root, the referenced history anchor and the bounded active journal. Historical pages and historical receipts are checked when accessed. An unavailable or corrupt archived receipt cannot be used for undo, compensation or idempotent replay. A missing root with any surviving checkpoint, journal, quarantine or history segment is never initialized as a new empty space.

### Store APIs

| API | Behavior |
|---|---|
| `read(grant, signal)` | Returns `{state, sequence, records}`; `records` is the active segment, in sequence order. It must not be treated as the entire lifetime history. |
| `readHistory(grant, {offset, limit, visibleOnly}, signal)` | Returns `{records, total, offset, hasMore}` in newest-first order. Limit is 1–200. `visibleOnly:true` counts and returns human/automation operations, excluding proposal registration. |
| `getOperation(grant, operationId, signal)` | Returns the verified active or archived journal, or `null` if absent. |
| `transact(..., {historyOperationIds, ...})` | Loads up to 100 explicitly requested historical receipts inside the same write transaction, for complete undo/compensation. |
| `transact(..., {verifyCurrent, ...})` | Optional trusted worker-local synchronous policy predicate. It must return `true` before connection, during every transaction callback and after completion. Expiry before commit aborts all queued writes; a post-commit expiry reports the committed-but-stale result. It is never an RPC capability. |

Every transaction checks its own operation ID directly against durable storage, including archived receipts. The same ID and fingerprint replay once; a changed payload or orphan receipt is refused. Archive creation, root/checkpoint writes, a new journal and any undo-status change commit or abort together.

## Recovery

Original `/1` roots keep the complete strict replay behavior. `/2` recovery starts from a positively witnessed immutable checkpoint, validates the active suffix and preserves the previous-root high-water requirement. A missing final journal cannot be mistaken for successful shorter recovery. A rollover segment can become the anchor only when its checkpoint and ordered IDs agree with a valid prior root; an arbitrary newer segment is not trusted.

The original root/checkpoint evidence is preserved in immutable recovery receipts. The first `/1` quarantine remains byte-for-byte at its existing key. Each later repair appends a `/2` receipt, including a checksum-linked predecessor, and atomically updates one bounded 8 KiB current-head record in `b23_states`. There is no one-repair lifetime limit and no database upgrade. Old repair operation IDs retain exact idempotency after later repairs; a changed fingerprint cannot reuse them. An old `/1` quarantine without a head remains readable, but cannot by itself prove that an earlier writer never made a now-missing later edit. Its next normal write upgrades the writer requirement and establishes the new marker; repair before that still requires the original root/checkpoint and journal high-water proof.

Recovery checks the complete receipt chain before appending. The head also carries the current overlay sequence, revision and root checksum. Every later normal edit, proposal registration, rollover, composite restore and legacy migration advances that marker in the same transaction as its root and journal. A missing or rolled-back head, absent receipt, fork or invalid checksum cannot be mistaken for a shorter successful history. If another corruption occurs immediately after repair, before any new edit, the validated previous repair receipt and still-matching current marker can prove that repaired checkpoint's high-water mark. If a later edit's root and final journal are both lost, the advanced marker forces refusal rather than silently restoring the older state. Earlier Pro binaries cannot edit these roots because they require reader `/3`.

The new plan includes the previous repair digest and current marker, so a previous review cannot authorize a different repair sequence. Quota failure rolls back the appended receipt, head, root and checkpoint together; a failed normal edit likewise cannot advance the head without its assets. Prior evidence remains intact.

Historical journals and segments are not overwritten. Repair does not restore processing permission, provider credentials, live grants or automatic dispatch. Historical operation-receipt integrity is checked separately when that history is used; recovery of the current asset root does not claim to revalidate every lifetime operation journal on every read.

## Billing storage

`vaiwl-pro-billing-root/1` remains readable. At 512 journal entries, a transaction creates a sealed billing history page and moves to `vaiwl-pro-billing-root/2` (`vaiwl-pro-billing-storage/2` minimum reader). All old receipts remain durable and are verified against their page when replayed.

An explicit user budget choice upgrades the existing installation root to `vaiwl-pro-billing-root/3`, with minimum reader `vaiwl-pro-billing-storage/3`. This codec preserves the `/2` history index, archived jobs, exact historical totals and creation-time fences, and adds `userBudgets` keyed by the stable payment profile. Each choice records its currency, provider profile, price-card version, revision and task/day/month limits in integer micro-units. It does not store credentials, source text or permission receipts. Journal rollover and final-job maintenance preserve this `/3` root and its choices; older `/1` and `/2` readers refuse to write it.

The production budget page starts at zero and accepts only the three reviewed monetary limits. The worker derives fixed UTC day/month installation policies; the frame cannot supply policy IDs, scope ownership, a provider, arbitrary windows or a different price card. Switching source accounts or spaces retains the same payer's limits and charges. Current queue availability accounts for the user's daily/monthly choices and every stricter applicable installation or current-scope policy. A new budget selection cancels unsent reserved work without releasing sent-uncertain or settled charges. Reservation also checks the saved user limits atomically, so a separately administered policy cannot silently increase the amount the user selected.

The current user choices, applicable policies, payment/model-price binding and UTC periods form a budget fence. Production dispatch, proposal registration and automatic asset application verify that fence in their own same-DB4 transaction. Ordinary accounting writes do not invalidate an otherwise valid fence; a changed limit, policy, price binding, period or blocked payer does. A budget read made before the transaction is not sufficient authorization for a later write.

Once the active job table has at least 512 entries, maintenance considers older final jobs while retaining the most recent 200 final jobs. It archives only:

- Final local jobs without a reservation.
- Final jobs whose reservations are settled or explicitly released, after every original policy window has ended.

Reserved, dispatched, outcome-unknown, pending-result/review jobs and current-window liabilities remain active. Unknown charges are never released by maintenance. Complete archived jobs and reservation records stay in `b23_states` under separate keys; retired job/reservation IDs cannot be reused. The same atomic write updates exact cumulative settled totals and their creation-time high-water fences.

`read()` includes `archivedJobCount` and `archivedSettledTotals`. Pass the latter to `budgetSummary(ledger, profile, {archivedSettledTotals})` so lifetime settled spending does not appear to reset. `readArchivedJob(authority, jobId, signal)` reads a verified archive only for the current authorized scope.

A newly configured policy cannot retrospectively cover archived charges that are no longer in the active ledger. Such a policy is refused with `billing-archived-window-requires-current-start`; a new window beginning after the archived high-water mark is permitted. Retained original policy identity/window remains immutable. Current active settled/reserved spending and all unknown liabilities continue to participate in applicable budget checks.

The optional trusted `verifyDispatchFence(tx, scope, checkpoint, check, ready, fail)` callback allows the production owner to recheck the Native/Evidence/Workspace/Pro source versions in the same DB4 transaction as the durable dispatch marker. It cannot return a Promise, invoke `ready` twice or authorize network work. Provider invocation remains a separate once-only authorized step after commit.

## Remaining meaningful capacity limits

The active overlay remains bounded at 16 MiB and 20,000 rows per asset table; a segment is at most 20 MiB, including its complete checkpoint. The active billing root remains 8 MiB, the ledger 4 MiB, and the active job table 1,000 entries. These are actual active asset/liability limits, not maximum lifetime edit counts. An installation with 1,000 unresolved or current-window paid jobs must resolve those liabilities or wait for their accounting windows before further admission. No cap is bypassed by discarding evidence or resetting accounting.

Storage consumption still grows with retained history and is subject to the browser's physical quota. Quota failure aborts the whole operation and preserves existing assets. Portable compound backups remain the existing data-only `/1` asset format and do not claim to export lifetime operation history or installation billing. The prior `/1` compound backups remain readable.

The 100 searchable historical names per topic/title have an explicit `REMOVE_ALIAS` operation. It removes only the selected searchable alias, preserves current names, human controls and the original operation history, and is itself undoable. No alias is silently discarded to make another rename fit.

## Proposal review retention

The live proposal table retains the latest 200 terminal records and up to 2,000 still-current pending reviews. Registration retires pending records only when their overlay revision is already obsolete, or when the owner supplies a full current source vector that proves they are stale. Still-current unapplied suggestions are never silently removed. Reaching the live review limit rejects further registration with `proposal-review-capacity`, so existing suggestions can first be reviewed or rejected.

Retirement is recorded in the same proposal-registration journal as the new suggestion. Complete original proposals, accepted operation patches and rejection constraints remain durable. Undo of an older accepted operation obtains its exact original proposal from that operation's sealed patch, even after its terminal row has left the live table, and writes the same rejection memory. Registration does not advance the asset revision or grant processing permission.

## Downgrade and verification boundaries

Existing Free readers continue to ignore and retain Pro namespaces. Pre-extension Pro readers refuse the newer storage root instead of misreading it. The on-disk minimum reader is separate from the unchanged portable asset reader. Do not claim that an older Pro build can edit a segmented root.

The similarly numbered reader contracts protect different invariants:

| Record | Codec / minimum reader | Invariant |
|---|---|---|
| Recovered overlay | Structural root `/1` or `/2`; `vaiwl-pro-storage/3` | Every subsequent asset writer atomically advances the durable recovery high-water marker. |
| Repeated recovery receipts | Recovery receipt `/2`; `vaiwl-pro-recovery/2` | Append-only repair evidence and a bounded, checksum-linked current head. |
| User installation budget | `vaiwl-pro-billing-root/3`; `vaiwl-pro-billing-storage/3` | Recurring user limits remain part of validated billing state through writes, history rollover and maintenance. |
| Portable compound assets | Existing `/1`; `vaiwl-unified-r1/1` | Asset-only import/export; no lifetime journals, recovery quarantine or installation billing reset. |

`storage-history.test.mjs` exercises the actual store at the old 10,000-entry boundary, oldest receipt replay, full archived undo, visible paging, concurrent CAS, quota rollback, archive corruption, missing-root detection and recovery suffix witnesses. `billing-store.test.mjs` exercises operation 10,001/job 1,001, exact archived charges, retained unknown liabilities, retired-ID guards, retrospective-policy refusal, atomic rollback and the dispatch source fence. These deterministic cases use registered synthetic records and MockIDB; they do not establish browser disk durability or real user account acceptance.

`closeout-ai-budget.test.mjs` additionally exercises default-zero user limits, cross-scope use, task-only tightening, unknown charges across UTC periods, policy-fence invalidation, currency identity, and 513 subsequent budget writes through real store transactions after the initial choice. That rollover preserves the `/3` user choices and the byte-exact original budget receipt. These are synthetic accounting tests, not provider charges or a real account budget acceptance.

`closeout-history-browser.mjs` separately exercises actual IndexedDB in a disposable Chromium profile. The recorded run used Chromium 143.0.7499.4 and made 515 sequential human-domain commits, without seeding journal rows. It verifies the first 512-operation rollover, a real IndexedDB transaction abort with no partial writes, complete original receipt/inverse retention, archived undo, durable old-operation replay and visible-history paging. It closes the complete browser process, reopens the same temporary profile with a fresh owner, and recovers a deliberately removed synthetic current root from its witnessed checkpoint and suffix. Processing remains off after recovery. The test blocks nonlocal requests and neither signs in to ChatGPT nor uses a personal browser profile.

The browser regression also repeats root corruption immediately after the first repair, appends a second immutable recovery receipt, then closes and restarts the entire browser again. It verifies the linked head, unchanged first quarantine, exact old repair replay and retained assets after that restart. Its 515th committed edit advances the recovery marker; deliberately removing that new root and final journal must then refuse an older restoration without writing anything. The test does not claim to recover bytes that it deliberately removed from both durable copies. The machine-readable run evidence is `artifacts/pro-closeout/history-browser/closeout-history-browser.json`. This establishes the tested isolated Chromium behavior; it does not establish live Free source integration, actual installed-extension service-worker behavior, provider quality, paid dispatch or physical-device acceptance.
