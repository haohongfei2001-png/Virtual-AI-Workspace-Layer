# Round296 — Batch native root discovery without weakening handle validation

Base28cf0d6, confirmed pushed to existing DraftPR16 with original base. Previous turn completed actual historical Host schema migration evidence; this turn returns to production navigation work during incremental ingestion.

resolveLoadedTargets previously refreshed route/roots once, then called public getNode for every matching candidate, repeating the same root queries. A private checkedNode now retains the original per-handle live node/document/root/parent/fingerprint/epoch validation. The synchronous batch invokes it after one root refresh. Public getNode still refreshes roots on every call, including the real dispatch boundary. No await or page callback occurs inside this DOM-only batch; no cache grants authority. Duplicate matching and incomplete-registry rejection remain unchanged.

Independent16cases: original HEAD through a temporary mirror9PASS/7FAIL, candidate16/16PASS. At200unique targets, root queries804→4 while fingerprint reads remain200. Root replacement/ambiguity for all4regions, detach/rootdetach/reparent/wrongdocument/fingerprint, lookupCompletefalse, duplicate ambiguity, stale duplicate removal and public fresh lookup are covered. Independent review found no blocker.

Actual installed headless packaged MV3 resolved-navigation journey5/5PASS: chat andProject delegate original native anchor once, same-tab SPA retains original editor; old action replay after route rebind is blocked; modifier href opens another tab with no delegation. Source and script unchanged. Final completeNode5783/5783PASS, zero skip. Full original browser/log evidence retained compressed.

This proves reduced redundant root queries and navigation compatibility, not completed100k ingestion or a latency benchmark. Prior1k/100k cardinality failures remain. Continuing shared read/write publication coordination and other independentFree gates; full81/profile matrix, cold/reenable reliability, J4 and actualG/U remain open. Free NOT_RELEASE_READY.
