# Round240 — query-intent fencing and bounded 10k startup observation

CI35 at 201714feed68add751fdbbf29a915310f68bd365: https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38734277177

## Actual findings

- Node: 4689 PASS / 1 FAIL. The original resolved-native-frame new-view acknowledgement rejection assertion is valid: the prior scheduling candidate queued an explicit changed query without immediately invalidating the old dispatch acknowledgement.
- The browser J1 nine-step implemented slice passed; that does not supersede the independent Node safety failure. J2/J3/firstsend/rapid-retry/UI layout and existing durability slices passed their limited scopes. The instrumented cold copy still failed its original20s gate.
- The formal10k scenario again failed initial preparation within30s, with188 UI RPCs and terminal snapshot-revision-changed. Native geometry remained correct. All extension frames were already removed when failure-only root collection ran, so it correctly reported NO_UNIQUE_CURRENT_FRAME. No root inventory, complete admission audit or timing was established.
- All168 source/fixture hashes in the saved scale report match the exact official CI35 commit. Data is generated offline fixture data only.

## Candidate

The minimal client correction immediately invalidates an old acknowledgement when a genuinely different bounded query is queued, while keeping transport deferred until the existing dispatch terminates. Same-query publication still coalesces. Changed-then-back does not revive the old acknowledgement. The original failing assertion is unchanged; registry replacement, scope/document guards,6s limits and single native dispatch remain intact. Integrated218 targeted checks passed; independent35 original and4 role/query cases passed.

The scale candidate collects a maximum of three bounded readonly root/marker snapshots during the existing first-tab preparation wait, only under an explicit diagnostic switch. It never waits for a snapshot before continuing business work, retries a missed slot, creates a page/worker or changes the30s gate. The existing failure-only collection remains a separate maximum one additional read. Late startup-sample results are ignored after stop; an already-started readonly operation may finish within its own budget without extending the surface deadline. This diagnostic mode cannot produce an accepted timing sample; the original strict CI measurement gate is preserved. A later unobserved formal run is required for performance evidence.

Full Free/SYS04/SYS05/J4 and real ChatGPT acceptance remain incomplete. Prior1k all-UNKNOWN membership and single-sample limits remain unchanged. This candidate does not claim to fix10k ingestion/preparation.
